"""Orquestación: proveedor, presupuesto, almacén, motor, paper trading y vigilancia.

Todo lo que gasta créditos pasa por el presupuesto y queda anotado. Lo que no
gasta (tablero, replay, rendimiento) sale del almacén.
"""

from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from collections.abc import Callable
from datetime import datetime, timedelta

from ..assets import Asset
from ..core import odds as O
from ..decision import engine as E
from ..domain import Event, market_key, parse_ts, utcnow
from ..market.reference import REFERENCE_BOOK, average_close, executable_price, reference
from ..pricing.settle import settle_fraction, unit_return
from ..providers.base import LineupsFeed, NullLineups, OddsFeed, ProviderError
from ..store import codec
from ..store.base import Store
from . import budget as B
from . import performance as P

DEFAULTS: dict = {
    "my_books": None, "bankroll": 1000.0, "odds_range": None, "monthly_credits": 500, "reset_day": 1,
    "regions": ["eu"], "markets": None, "max_snapshot_age_s": 600, "board_lookback_h": 8,
    "extra_sports": [],
}
MARKET_OF_CODE = {"1X2": "h2h", "OU25": "totals", "AH": "spreads"}
SCOPES = {"live", "soon", "today"}
SOON_MIN = 180.0
TODAY_MIN = 24 * 60.0
FINISHED_AFTER_MIN = 150.0      # un partido de fútbol dura ~115 min; sin marcador, a los 150 se da por acabado
CLOSING_WINDOW_MIN = 12.0       # se captura el cierre en los últimos minutos antes del inicio
SETTLE_AFTER_MIN = 150.0
SETTLE_RETRY_MIN = 60.0
ACTIONABLE = set(E.ACTIONABLE)
LOGGED = ACTIONABLE | {E.ESPERAR, E.WATCH}


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _latest_observed(events: list[Event]) -> str | None:
    ts = [s.observed_at for e in events for s in e.markets.values()]
    return max(ts).isoformat() if ts else None


def evidence_markets(asset: Asset) -> list[str]:
    """Mercados que se piden si el usuario no ha elegido: los de las estrategias ACTIVAS.

    Por qué no una constante: pedir solo 1X2 (lo más barato) cuando lo validado es
    goles y hándicap era mirar justo donde no puede salir nada y luego decir «no hay
    nada». Si el pipeline cambia los estados, esto cambia con ellos. Sin ninguna
    activa, 1X2: es lo más barato y lo que más casas cotizan."""
    codes = {key.split("|", 1)[0] for key, s in asset.strategies().items() if s.state == "ACTIVE"}
    return sorted({MARKET_OF_CODE[c] for c in codes if c in MARKET_OF_CODE}) or ["h2h"]


class EdgeService:
    def __init__(self, feed: OddsFeed, store: Store, asset: Asset, *, clock: Callable[[], datetime] = utcnow,
                 lineups: LineupsFeed | None = None):
        self.feed = feed
        self.store = store
        self.asset = asset
        self.clock = clock
        self.lineups = lineups or NullLineups()
        self._sports_cache: tuple[datetime, list[dict]] | None = None

    # ── ajustes ──────────────────────────────────────────────────────────
    async def settings(self) -> dict:
        st = {**DEFAULTS, **(await self.store.get_settings())}
        st["markets_from_evidence"] = not st.get("markets")
        if not st.get("markets"):
            st["markets"] = evidence_markets(self.asset)
        return st

    async def update_settings(self, fields: dict) -> dict:
        clean: dict = {}
        if "my_books" in fields:
            v = fields["my_books"]
            clean["my_books"] = None if v in (None, []) else sorted({str(x) for x in v})
        if "bankroll" in fields:
            b = float(fields["bankroll"])
            if not b > 0:
                raise ValueError("el bote tiene que ser mayor que 0")
            clean["bankroll"] = b
        if "odds_range" in fields:
            r = fields["odds_range"]
            if r is None:
                clean["odds_range"] = None
            else:
                lo, hi = float(r[0]), float(r[1])
                if not 1.0 < lo < hi:
                    raise ValueError("rango de cuotas no válido")
                clean["odds_range"] = [lo, hi]
        if "monthly_credits" in fields:
            clean["monthly_credits"] = max(1, int(fields["monthly_credits"]))
        if "reset_day" in fields:
            clean["reset_day"] = min(28, max(1, int(fields["reset_day"])))
        if "markets" in fields:
            ms = sorted({str(m) for m in (fields["markets"] or []) if m in MARKET_OF_CODE.values()})
            # vacío, o justo lo que dice la evidencia = seguir a la evidencia (guardar el formulario
            # sin tocar los mercados no debe congelarlos si mañana cambian los estados)
            clean["markets"] = None if not ms or ms == evidence_markets(self.asset) else ms
        if "extra_sports" in fields:
            clean["extra_sports"] = sorted({str(s) for s in fields["extra_sports"]})
        await self.store.put_settings(clean)
        return await self.settings()

    # ── catálogo y barrido gratuito ──────────────────────────────────────
    async def sports(self) -> list[dict]:
        now = self.clock()
        if self._sports_cache and now - self._sports_cache[0] < timedelta(hours=6):
            return self._sports_cache[1]
        rows = await asyncio.to_thread(self.feed.sports)
        self._sports_cache = (now, rows)
        return rows

    async def default_sports(self) -> list[str]:
        st = await self.settings()
        active = {s["key"] for s in await self.sports() if s.get("active", True)}
        validated = [k for k in sorted(self.asset._validated) if k in active]
        extra = [k for k in st.get("extra_sports", []) if k in active and k not in validated]
        if self.feed.is_mock:
            return sorted(active)
        return validated + extra

    async def pulse(self, sports: list[str]) -> dict:
        now = self.clock()
        sem = asyncio.Semaphore(8)

        async def one(sport: str) -> tuple[str, dict]:
            async with sem:
                try:
                    evs = await asyncio.to_thread(self.feed.events, sport)
                except ProviderError as e:
                    return sport, {"events": 0, "live": 0, "soon": 0, "today": 0, "error": str(e)}
            live = soon = today = 0
            for row in evs:
                ct = parse_ts(row.get("commence_time"))
                if ct is None:
                    continue
                mins = (ct - now).total_seconds() / 60
                if -FINISHED_AFTER_MIN <= mins <= 0:
                    live += 1
                elif 0 < mins <= SOON_MIN:
                    soon += 1
                if 0 < mins <= TODAY_MIN:
                    today += 1
            return sport, {"events": len(evs), "live": live, "soon": soon, "today": today}

        rows = dict(await asyncio.gather(*(one(s) for s in sports)))
        blind = bool(sports) and all(r["events"] == 0 for r in rows.values())
        return {"sports": rows, "blind": blind, "at": now.isoformat(),
                "totals": {k: sum(r[k] for r in rows.values()) for k in ("events", "live", "soon", "today")}}

    # ── presupuesto ──────────────────────────────────────────────────────
    async def _spent_today(self, now: datetime) -> int:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return sum(int(r.get("cost") or 0) for r in await self.store.credit_log(start))

    async def _reserve(self) -> int:
        st = await self.settings()
        to_close: dict[tuple[str, str], set[str]] = defaultdict(set)
        to_settle: set[tuple[str, str]] = set()
        for b in await self.store.paper_bets():
            if b["status"] == "open" and not b.get("closing"):
                to_close[(b["sport"], str(b["commence_time"]))].add(b["market"])
            if b["status"] in ("open", "closed"):
                to_settle.add((b["sport"], str(b["commence_time"])[:10]))
        return B.reserve_needed([len(ms) for ms in to_close.values()], len(to_settle), len(st["regions"]))

    async def budget_status(self) -> dict:
        st = await self.settings()
        now = self.clock()
        remaining = self.feed.credits.remaining
        reserve = await self._reserve()
        spent = await self._spent_today(now)
        allowance = B.daily_allowance(remaining, now, st["reset_day"], reserve) if remaining is not None else None
        return {"remaining": remaining, "reserve": reserve, "spent_today": spent, "allowance_today": allowance,
                "next_reset": B.next_reset(now, st["reset_day"]).isoformat(), "mock": self.feed.is_mock}

    async def _spend(self, *, cost: int, purpose: str, forced: bool = False) -> B.BudgetDecision:
        st = await self.settings()
        now = self.clock()
        return B.decide(cost=cost, remaining=self.feed.credits.remaining, spent_today=await self._spent_today(now),
                        now=now, reset_day=st["reset_day"], reserve=await self._reserve(), purpose=purpose,
                        forced=forced)

    async def _log_last_call(self, purpose: str, sport: str, scan_id: str | None) -> None:
        if not self.feed.credits.calls:
            return
        rec = self.feed.credits.calls[-1]
        await self.store.log_credit({"at": rec.at, "endpoint": rec.endpoint, "cost": rec.cost or 0,
                                     "remaining": rec.remaining, "ok": rec.ok, "purpose": purpose, "sport": sport,
                                     "scan_id": scan_id})

    # ── escaneo (gasta) ──────────────────────────────────────────────────
    async def scan(self, *, scope: str = "soon", sports: list[str] | None = None, forced: bool = False,
                   max_sports: int = 6) -> dict:
        if scope not in SCOPES:
            raise ValueError(f"alcance no válido: {scope}")
        st = await self.settings()
        started = self.clock()
        scan_id = started.strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:6]
        cands = sports or await self.default_sports()
        pulse = await self.pulse(cands)
        if pulse["blind"]:
            chosen = cands[:max_sports]
        else:
            chosen = sorted((s for s in cands if pulse["sports"][s][scope] > 0),
                            key=lambda s: (-pulse["sports"][s][scope], s))[:max_sports]
        markets, regions = list(st["markets"]), list(st["regions"])
        cost = self.feed.estimated_cost("odds", markets=len(markets), regions=len(regions))
        events: list[Event] = []
        fetched, skipped, errors = [], [], []
        for sport in chosen:
            dec = await self._spend(cost=cost, purpose="user", forced=forced)
            if not dec.ok:
                skipped.append({"sport": sport, "reason": dec.reason})
                continue
            try:
                got = await asyncio.to_thread(self.feed.odds, sport, markets, regions)
            except ProviderError as e:
                errors.append(f"{sport}: {e}")
                await self._log_last_call("user", sport, scan_id)
                continue
            await self._log_last_call("user", sport, scan_id)
            fetched.append(sport)
            events.extend(got)

        frozen: dict[str, str] = {}
        if scope == "live" and fetched:
            frozen = await self._live_scores(events, fetched, scan_id, forced)

        prev_docs = await self.store.snapshots_asof(started - timedelta(microseconds=1),
                                                    lookback=timedelta(hours=st["board_lookback_h"]),
                                                    event_ids=[e.id for e in events])
        docs = [codec.snapshot_doc(ev, snap, source=self.feed.name, scan_id=scan_id)
                for ev in events for snap in ev.markets.values()]
        saved = await self.store.put_snapshots(docs)
        decisions = await self._evaluate(events, now=self.clock(), frozen=frozen, prev_docs=prev_docs, st=st)
        side = await self._after_decisions(decisions, scan_id)
        return {"scan_id": scan_id, "scope": scope, "pulse": pulse, "sports_fetched": fetched,
                "sports_skipped": skipped, "errors": errors, "snapshots_saved": saved, "events": len(events),
                "data_observed_at": _latest_observed(events),
                "budget": await self.budget_status(), "side_effects": side, **self._pack(decisions)}

    async def _live_scores(self, events: list[Event], sports: list[str], scan_id: str, forced: bool) -> dict:
        frozen: dict[str, str] = {}
        now = self.clock()
        by_id = {e.id: e for e in events}
        for sport in sports:
            dec = await self._spend(cost=self.feed.estimated_cost("scores") // 2 or 1, purpose="user", forced=forced)
            if not dec.ok:
                continue
            try:
                rows = await asyncio.to_thread(self.feed.scores, sport, None)
            except ProviderError:
                continue
            await self._log_last_call("user", sport, scan_id)
            ids = [r["id"] for r in rows if r.get("id") in by_id]
            before = await self.store.scores_asof(now - timedelta(microseconds=1), ids)
            docs = []
            for r in rows:
                if r.get("id") not in by_id:
                    continue
                doc = codec.score_doc(r, sport, now)
                docs.append(doc)
                by_id[r["id"]].score = codec.score_from_doc(doc)
                old = before.get(r["id"])
                if old and (old.get("home_score"), old.get("away_score")) != (r.get("home_score"), r.get("away_score")):
                    frozen[r["id"]] = (f"Cambio de marcador ({old.get('home_score')}-{old.get('away_score')} → "
                                       f"{r.get('home_score')}-{r.get('away_score')}): se congela hasta ver precios "
                                       "posteriores al cambio.")
            await self.store.put_scores(docs)
        return frozen

    # ── evaluación ───────────────────────────────────────────────────────
    async def live_states(self) -> dict[str, tuple[str, list[str], dict]]:
        return P.live_states(await self.store.paper_bets(), self.asset)

    async def _evaluate(self, events: list[Event], *, now: datetime, frozen: dict[str, str],
                        prev_docs: list[dict], st: dict) -> list[E.Decision]:
        overrides = {k: (v[0], v[1]) for k, v in (await self.live_states()).items()}
        my_books = frozenset(st["my_books"]) if st.get("my_books") else None
        prev = codec.events_from_docs(prev_docs)
        prev_by_market = {(e.id, key): snap for e in prev for key, snap in e.markets.items()}

        def history(selection_id: str) -> list[E.HistoryPoint]:
            eid, mkey, outcome = selection_id.split("|", 1)[0], *selection_id.split("|", 1)[1].rsplit("|", 1)
            snap = prev_by_market.get((eid, mkey))
            if snap is None:
                return []
            ev = next((e for e in prev if e.id == eid), None)
            code = self.asset.market_code(snap.sport, snap.market, snap.line, len(snap.outcomes))
            ref = reference(snap, self.asset.devig_method(code, len(snap.outcomes)))
            best = snap.best(outcome, allowed=my_books, exclude={REFERENCE_BOOK})
            return [E.HistoryPoint(observed_at=snap.observed_at, best_odds=best.price if best else None,
                                   best_book=best.book if best else None,
                                   p_fair=ref.probs.get(outcome) if ref.ok and ref.probs and ev else None)]

        ctx = E.Context(now=now, asset=self.asset, my_books=my_books, bankroll=float(st["bankroll"]),
                        lineups=self.lineups, max_snapshot_age_s=float(st["max_snapshot_age_s"]), frozen=frozen,
                        history=history, odds_range=tuple(st["odds_range"]) if st.get("odds_range") else None,
                        state_overrides=overrides)
        return E.evaluate(events, ctx)

    def _pack(self, decisions: list[E.Decision]) -> dict:
        h = E.headline(decisions)
        v = E.views(decisions)

        def dd(x: E.Decision | None) -> dict | None:
            return None if x is None else x.to_dict()

        return {"headline": {"title": h["title"], "has_bet": h["has_bet"], "counts": h["counts"],
                             "top": dd(h.get("top")), "closest": dd(h.get("closest"))},
                "views": {k: dd(x) for k, x in v.items()},
                "decisions": [d.to_dict() for d in decisions],
                "asset_version": self.asset.version, "mock": self.feed.is_mock}

    async def _after_decisions(self, decisions: list[E.Decision], scan_id: str) -> dict:
        now = self.clock()
        signals, bets, alerts = [], 0, 0
        for d in decisions:
            if d.state in LOGGED or (d.ev_raw is not None and d.ev_raw > 0):
                signals.append({**{k: getattr(d, k) for k in (
                    "id", "event_id", "sport", "event_name", "market", "market_code", "line", "outcome", "selection",
                    "state", "best_book", "best_odds", "best_odds_net", "p_fair", "ev_raw", "p_real", "e_clv",
                    "e_clv_lo", "min_odds", "target_odds", "strategy_key", "strategy_state", "live")},
                    "commence_time": d.commence_time, "observed_at": datetime.fromisoformat(d.observed_at),
                    "scan_id": scan_id, "asset_version": self.asset.version})
            if d.state in ACTIONABLE and not d.live and d.best_odds and d.market_code:
                ok = await self.store.add_paper_bet(self._bet_doc(d, source="auto", odds=d.best_odds,
                                                                  book=d.best_book or "", stake=1.0))
                bets += int(ok)
                if ok and d.state in (E.EXCEPCIONAL, E.APOSTAR):
                    alerts += int(await self.store.add_alert({
                        "alert_id": f"bet|{d.id}", "created_at": now, "kind": "new_bet", "read": False,
                        "selection_id": d.id, "text": f"{d.emoji} {d.label}: {d.event_name} · {d.selection} @ "
                                                      f"{d.best_odds:.2f} ({d.best_book})"}))
        logged = await self.store.log_signals(signals)
        alerts += await self._check_watches(decisions)
        return {"signals_logged": logged, "paper_bets_opened": bets, "alerts": alerts}

    def _bet_doc(self, d: E.Decision, *, source: str, odds: float, book: str, stake: float) -> dict:
        now = self.clock()
        return {"bet_id": _new_id("bet"), "source": source, "selection_id": d.id, "created_at": now,
                "event_id": d.event_id, "sport": d.sport, "event_name": d.event_name, "home": d.home, "away": d.away,
                "commence_time": datetime.fromisoformat(d.commence_time), "market": d.market,
                "market_code": d.market_code, "line": d.line, "outcome": d.outcome, "selection": d.selection,
                "book": book, "odds": float(odds), "odds_net": executable_price(book, float(odds)),
                "stake_units": float(stake), "p_fair": d.p_fair, "p_real": d.p_real, "e_clv": d.e_clv,
                "e_clv_lo": d.e_clv_lo, "state": d.state, "strategy_key": d.strategy_key,
                "strategy_state": d.strategy_state, "asset_version": self.asset.version,
                "observed_at": datetime.fromisoformat(d.observed_at), "status": "open", "closing": None,
                "result": None}

    # ── tablero y replay (no gastan) ─────────────────────────────────────
    async def board(self, *, asof: datetime | None = None) -> dict:
        st = await self.settings()
        now = self.clock()
        t = asof or now
        docs = await self.store.snapshots_asof(t, lookback=timedelta(hours=st["board_lookback_h"]))
        ids = sorted({d["event_id"] for d in docs})
        scores = await self.store.scores_asof(t, ids) if ids else {}
        events = [e for e in codec.events_from_docs(docs, scores)
                  if not (e.score and e.score.completed) and e.minutes_to_start(t) > -FINISHED_AFTER_MIN]
        prev_docs: list[dict] = []
        if docs:
            first = min(d["observed_at"] for d in docs)
            prev_docs = await self.store.snapshots_asof(first - timedelta(microseconds=1),
                                                        lookback=timedelta(hours=st["board_lookback_h"]),
                                                        event_ids=ids)
        decisions = await self._evaluate(events, now=t, frozen={}, prev_docs=prev_docs, st=st)
        latest = max((d["observed_at"] for d in docs), default=None)
        return {"asof": t.isoformat(), "replay": asof is not None, "events": len(events),
                "data_observed_at": latest.isoformat() if latest else None,
                "budget": await self.budget_status(), **self._pack(decisions)}

    async def replay(self, asof: datetime) -> dict:
        """Lo que EDGE OS habría visto en ``asof``: solo datos observados hasta ese instante,
        y al lado lo que de verdad se registró entonces."""
        out = await self.board(asof=asof)
        logged = await self.store.signals(since=asof - timedelta(minutes=30), until=asof)
        out["logged_signals"] = [{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in s.items()}
                                 for s in logged]
        return out

    async def event_detail(self, event_id: str, *, fetch_markets: bool = False, forced: bool = False) -> dict:
        st = await self.settings()
        now = self.clock()
        hist = await self.store.snapshot_history(event_id, until=now)
        extra = None
        if fetch_markets and hist:
            sport = hist[-1]["sport"]
            markets = ["h2h", "totals", "spreads"]
            cost = self.feed.estimated_cost("event_odds", markets=len(markets), regions=len(st["regions"]))
            dec = await self._spend(cost=cost, purpose="user", forced=forced)
            if dec.ok:
                try:
                    ev = await asyncio.to_thread(self.feed.event_odds, sport, event_id, markets, list(st["regions"]))
                    await self._log_last_call("user", sport, None)
                    if ev:
                        await self.store.put_snapshots([codec.snapshot_doc(ev, s, source=self.feed.name,
                                                                           scan_id="evento")
                                                        for s in ev.markets.values()])
                        hist = await self.store.snapshot_history(event_id, until=self.clock())
                except ProviderError as e:
                    extra = str(e)
            else:
                extra = dec.reason
        if not hist:
            return {"event_id": event_id, "found": False, "note": extra}
        events = codec.events_from_docs(hist)
        scores = await self.store.scores_asof(now, [event_id])
        if event_id in scores and events:
            events[0].score = codec.score_from_doc(scores[event_id])
        decisions = await self._evaluate(events, now=now, frozen={}, prev_docs=[], st=st)
        series = self._series(hist)
        return {"event_id": event_id, "found": True, "note": extra, "series": series, **self._pack(decisions)}

    def _series(self, hist: list[dict]) -> dict:
        """Evolución por mercado y resultado: precio justo de Pinnacle y mejor cuota en cada foto."""
        out: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
        for doc in hist:
            snap = codec.snapshot_from_doc(doc)
            code = self.asset.market_code(snap.sport, snap.market, snap.line, len(snap.outcomes))
            ref = reference(snap, self.asset.devig_method(code, len(snap.outcomes)))
            for o in snap.outcomes:
                best = snap.best(o, exclude={REFERENCE_BOOK})
                out[snap.key][o].append({"t": snap.observed_at.isoformat(),
                                         "fair": (1 / ref.probs[o]) if ref.ok and ref.probs else None,
                                         "best": best.price if best else None, "book": best.book if best else None})
        return {k: dict(v) for k, v in out.items()}

    # ── paper trading ────────────────────────────────────────────────────
    async def add_manual_bet(self, selection_id: str, *, odds: float, book: str, stake: float) -> dict:
        if not odds > 1.0 or not stake > 0:
            raise ValueError("cuota > 1 e importe > 0")
        board = await self.board()
        d = next((x for x in board["decisions"] if x["id"] == selection_id), None)
        if d is None:
            raise LookupError("esa selección no está en el tablero actual")
        dec = E.Decision(**{k: v for k, v in d.items() if k not in ("emoji", "label")})
        dec.set_state(d["state"])
        doc = self._bet_doc(dec, source="manual", odds=odds, book=book, stake=stake)
        await self.store.add_paper_bet(doc)
        return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in doc.items()}

    async def capture_closings(self, *, force_window_min: float = CLOSING_WINDOW_MIN) -> dict:
        now = self.clock()
        bets = [b for b in await self.store.paper_bets(status="open") if not b.get("closing")]
        due = [b for b in bets if 0 < (b["commence_time"] - now).total_seconds() / 60 <= force_window_min]
        done, skipped = 0, []
        st = await self.settings()
        by_sport: dict[str, list[dict]] = defaultdict(list)
        for b in due:
            by_sport[b["sport"]].append(b)
        for sport, group in sorted(by_sport.items()):
            markets = sorted({b["market"] for b in group})
            cost = self.feed.estimated_cost("odds", markets=len(markets), regions=len(st["regions"]))
            dec = await self._spend(cost=cost, purpose="closing")
            if not dec.ok:
                skipped.append({"sport": sport, "reason": dec.reason})
                continue
            try:
                events = await asyncio.to_thread(self.feed.odds, sport, markets, list(st["regions"]))
            except ProviderError as e:
                skipped.append({"sport": sport, "reason": str(e)})
                continue
            await self._log_last_call("closing", sport, None)
            await self.store.put_snapshots([codec.snapshot_doc(ev, s, source=self.feed.name, scan_id="cierre")
                                            for ev in events for s in ev.markets.values()])
            by_id = {e.id: e for e in events}
            for b in group:
                closing = self._closing_for(b, by_id.get(b["event_id"]), now)
                await self.store.update_paper_bet(b["bet_id"], {"closing": closing, "status": "closed"})
                done += 1
            await self._close_signals(by_id, now)
        return {"due": len(due), "closed": done, "skipped": skipped}

    def _closing_for(self, b: dict, ev: Event | None, now: datetime) -> dict:
        minutes_before = (b["commence_time"] - now).total_seconds() / 60
        if ev is None:
            return {"missing": "el evento ya no aparece en el feed", "observed_at": now,
                    "minutes_before": minutes_before}
        snap = ev.markets.get(market_key(b["market"], b["line"]))
        if snap is None:
            return {"missing": "ese mercado/línea ya no se cotiza al cierre", "observed_at": now,
                    "minutes_before": minutes_before}
        method = self.asset.devig_method(b.get("market_code"), len(snap.outcomes))
        odds = float(b["odds_net"])
        out: dict = {"observed_at": snap.observed_at, "minutes_before": minutes_before,
                     "n_books": len(snap.complete_books())}
        avg = average_close(snap, method)
        out["p_avg"] = avg.get(b["outcome"]) if avg else None
        out["clv_avg"] = (out["p_avg"] * odds - 1.0) if out["p_avg"] else None
        ref = reference(snap, method)
        out["p_pin"] = ref.probs.get(b["outcome"]) if ref.ok and ref.probs else None
        out["clv_pin"] = (out["p_pin"] * odds - 1.0) if out["p_pin"] else None
        bfe = snap.book_prices("betfair_ex_eu")
        out["p_bfe"] = None
        if bfe:
            try:
                out["p_bfe"] = dict(zip(snap.outcomes, O.devig(bfe, method), strict=True)).get(b["outcome"])
            except O.OddsError:
                out["p_bfe"] = None
        out["clv_bfe"] = (out["p_bfe"] * odds - 1.0) if out["p_bfe"] else None
        return out

    async def _close_signals(self, by_id: dict[str, Event], now: datetime) -> None:
        """Cierre de TODAS las selecciones señaladas de esos eventos (apostadas o no): es el
        laboratorio de oportunidades perdidas en vivo, sin gastar un crédito más."""
        sigs = await self.store.signals(since=now - timedelta(days=3), until=now)
        first: dict[str, dict] = {}
        for s in sigs:
            if s["event_id"] in by_id and s["id"] not in first:
                first[s["id"]] = s
        for sid, s in first.items():
            if not s.get("best_odds_net"):
                continue
            fake = {"market": s["market"], "line": s["line"], "outcome": s["outcome"],
                    "market_code": s.get("market_code"), "odds_net": s["best_odds_net"],
                    "commence_time": datetime.fromisoformat(s["commence_time"]) if isinstance(s["commence_time"], str)
                    else s["commence_time"], "event_id": s["event_id"]}
            closing = self._closing_for(fake, by_id.get(s["event_id"]), now)
            await self.store.put_signal_closing({"selection_id": sid, "closed_at": now, "first_state": s["state"],
                                                 "first_seen": s["observed_at"], "entry_odds": s["best_odds"],
                                                 "strategy_key": s.get("strategy_key"), **closing})

    async def settle(self) -> dict:
        now = self.clock()
        bets = [b for b in await self.store.paper_bets() if b["status"] in ("open", "closed")]
        due = [b for b in bets if (now - b["commence_time"]).total_seconds() / 60 >= SETTLE_AFTER_MIN
               and (b.get("settle_attempt_at") is None
                    or (now - b["settle_attempt_at"]).total_seconds() / 60 >= SETTLE_RETRY_MIN)]
        by_sport: dict[str, list[dict]] = defaultdict(list)
        for b in due:
            by_sport[b["sport"]].append(b)
        settled, pending, skipped = 0, 0, []
        for sport, group in sorted(by_sport.items()):
            dec = await self._spend(cost=self.feed.estimated_cost("scores"), purpose="settle")
            if not dec.ok:
                skipped.append({"sport": sport, "reason": dec.reason})
                continue
            try:
                rows = {r["id"]: r for r in await asyncio.to_thread(self.feed.scores, sport, 3)}
            except ProviderError as e:
                skipped.append({"sport": sport, "reason": str(e)})
                continue
            await self._log_last_call("settle", sport, None)
            for b in group:
                r = rows.get(b["event_id"])
                if not r or not r.get("completed") or r.get("home_score") is None or r.get("away_score") is None:
                    too_old = (now - b["commence_time"]) > timedelta(days=3)
                    await self.store.update_paper_bet(b["bet_id"], {"settle_attempt_at": now,
                                                                    **({"status": "unsettled"} if too_old else {})})
                    pending += 1
                    continue
                win, lose = settle_fraction(b["market"], b["outcome"], b["line"], int(r["home_score"]),
                                            int(r["away_score"]))
                ret = unit_return(win, lose, float(b["odds_net"])) * float(b["stake_units"])
                await self.store.update_paper_bet(b["bet_id"], {"status": "settled", "result": {
                    "home_score": int(r["home_score"]), "away_score": int(r["away_score"]), "win": win, "lose": lose,
                    "return_units": ret, "settled_at": now}})
                settled += 1
        return {"due": len(due), "settled": settled, "pending": pending, "skipped": skipped}

    async def performance(self) -> dict:
        bets = await self.store.paper_bets()
        auto = [b for b in bets if b["source"] == "auto"]
        closings = await self.store.signal_closings()
        by_state: dict[str, list[float]] = defaultdict(list)
        for c in closings:
            if c.get("clv_avg") is not None:
                by_state[c["first_state"]].append(c["clv_avg"])
        live = await self.live_states()
        return {
            "all": P.summarize(bets), "auto": P.summarize(auto), "manual": P.summarize([b for b in bets if b["source"] == "manual"]),
            "by_strategy": P.by(auto, "strategy_key"), "by_state": P.by(auto, "state"), "by_sport": P.by(auto, "sport"),
            "missed_lab": {s: P.cluster_summary(v, [str(i) for i in range(len(v))]) for s, v in sorted(by_state.items())},
            "live_states": {k: {"state": v[0], "reasons": v[1], "stats": v[2]} for k, v in live.items()},
            "historical_states": {k: {"state": s.state, "reasons": s.reasons, "n_required": s.spec.get("n_required")}
                                  for k, s in self.asset.strategies().items()},
        }

    async def paper_bets(self) -> list[dict]:
        rows = await self.store.paper_bets()
        return [{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in b.items()} for b in rows]

    # ── vigilancia ───────────────────────────────────────────────────────
    async def add_watch(self, decision: dict, *, target_odds: float | None = None) -> dict:
        target = target_odds or decision.get("target_odds") or decision.get("min_odds")
        if not target:
            raise ValueError("hace falta una cuota objetivo")
        doc = {"watch_id": _new_id("watch"), "selection_id": decision["id"], "event_id": decision["event_id"],
               "sport": decision["sport"], "event_name": decision["event_name"], "selection": decision["selection"],
               "market": decision["market"], "line": decision["line"], "outcome": decision["outcome"],
               "commence_time": decision["commence_time"], "target_odds": float(target),
               "invalidation_odds": decision.get("invalidation_odds"), "created_at": self.clock(),
               "status": "active"}
        ok = await self.store.add_watch(doc)
        return {"created": ok, "watch": {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in doc.items()}}

    async def _check_watches(self, decisions: list[E.Decision]) -> int:
        now = self.clock()
        by_id = {d.id: d for d in decisions}
        alerts = 0
        for w in await self.store.watches(status="active"):
            ct = datetime.fromisoformat(w["commence_time"]) if isinstance(w["commence_time"], str) else w["commence_time"]
            if ct <= now:
                await self.store.update_watch(w["watch_id"], {"status": "expired", "closed_at": now})
                continue
            d = by_id.get(w["selection_id"])
            if d is None:
                continue
            await self.store.update_watch(w["watch_id"], {"last_seen_odds": d.best_odds, "last_check": now,
                                                         "last_state": d.state})
            if d.best_odds and d.best_odds >= w["target_odds"]:
                ok_state = d.state in ACTIONABLE
                text = (f"👀 {d.event_name} · {d.selection}: {d.best_odds:.2f} en {d.best_book} (objetivo "
                        f"{w['target_odds']:.2f}). Recalculado: {d.emoji} {d.label}.")
                if await self.store.add_alert({"alert_id": f"watch|{w['watch_id']}", "created_at": now,
                                               "kind": "watch_trigger", "read": False, "selection_id": d.id,
                                               "text": text, "actionable": ok_state}):
                    alerts += 1
                await self.store.update_watch(w["watch_id"], {"status": "triggered", "triggered_at": now})
        return alerts

    async def alerts(self, unread_only: bool = False) -> list[dict]:
        rows = await self.store.alerts(unread_only=unread_only)
        return [{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in a.items()} for a in rows]

    async def watches(self) -> list[dict]:
        rows = await self.store.watches(status=None)
        return [{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in w.items()} for w in rows]
