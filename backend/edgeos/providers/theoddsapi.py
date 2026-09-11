"""The Odds API v4 — https://the-odds-api.com

Costes (documentación del proveedor, comprobado con las cabeceras):

* ``/sports`` y ``/sports/{k}/events``: 0 créditos.
* ``/sports/{k}/odds``: mercados × regiones.
* ``/sports/{k}/events/{id}/odds``: mercados devueltos × regiones.
* ``/sports/{k}/scores``: 1 crédito; 2 con ``daysFrom``.

Cada llamada deja constancia (endpoint, coste real de ``x-requests-last``,
créditos restantes) para que el presupuesto se pueda auditar.
"""

from __future__ import annotations

from typing import Any

import httpx

from ..domain import (
    H2H,
    OUTCOMES_2WAY,
    OUTCOMES_3WAY,
    OUTCOMES_TOTALS,
    SPREADS,
    TOTALS,
    Event,
    MarketSnapshot,
    Quote,
    market_key,
    parse_ts,
    utcnow,
)
from .base import CallRecord, OddsFeed, ProviderError

BASE_URL = "https://api.the-odds-api.com/v4"


def _int(v: Any) -> int | None:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


class TheOddsAPI(OddsFeed):
    name = "the-odds-api"

    def __init__(self, api_key: str, *, timeout: float = 20.0, transport: httpx.BaseTransport | None = None):
        super().__init__()
        if not api_key:
            raise ProviderError("falta la clave de The Odds API")
        self._key = api_key
        self._client = httpx.Client(base_url=BASE_URL, timeout=timeout, transport=transport)

    # ── transporte ───────────────────────────────────────────────────────
    def _get(self, path: str, params: dict[str, Any]) -> Any:
        at = utcnow()
        try:
            r = self._client.get(path, params={"apiKey": self._key, **params})
        except httpx.HTTPError as e:
            self.credits.record(CallRecord(at, path, None, self.credits.remaining, False, str(e)))
            raise ProviderError(f"The Odds API no responde: {e}") from e
        cost = _int(r.headers.get("x-requests-last"))
        remaining = _int(r.headers.get("x-requests-remaining"))
        used = _int(r.headers.get("x-requests-used"))
        if used is not None:
            self.credits.used = used
        ok = r.status_code == 200
        self.credits.record(CallRecord(at, path, cost, remaining, ok, "" if ok else r.text[:200]))
        if r.status_code == 401:
            raise ProviderError("The Odds API: clave no válida (401)")
        if r.status_code == 429:
            raise ProviderError("The Odds API: créditos agotados o demasiadas peticiones (429)")
        if r.status_code == 422:
            raise ProviderError(f"The Odds API: parámetros no válidos (422): {r.text[:200]}")
        if not ok:
            raise ProviderError(f"The Odds API: HTTP {r.status_code}: {r.text[:200]}")
        return r.json()

    def estimated_cost(self, endpoint: str, *, markets: int = 1, regions: int = 1) -> int:
        if endpoint in ("sports", "events"):
            return 0
        if endpoint == "scores":
            return 2
        return markets * regions

    # ── endpoints ────────────────────────────────────────────────────────
    def sports(self) -> list[dict]:
        return list(self._get("/sports", {"all": "false"}))

    def events(self, sport: str) -> list[dict]:
        return list(self._get(f"/sports/{sport}/events", {"dateFormat": "iso"}))

    def odds(self, sport: str, markets: list[str], regions: list[str]) -> list[Event]:
        payload = self._get(f"/sports/{sport}/odds", {
            "regions": ",".join(regions), "markets": ",".join(markets),
            "oddsFormat": "decimal", "dateFormat": "iso"})
        observed = utcnow()
        return [e for raw in payload if (e := parse_event(raw, sport, observed)) is not None]

    def event_odds(self, sport: str, event_id: str, markets: list[str], regions: list[str]) -> Event | None:
        payload = self._get(f"/sports/{sport}/events/{event_id}/odds", {
            "regions": ",".join(regions), "markets": ",".join(markets),
            "oddsFormat": "decimal", "dateFormat": "iso"})
        return parse_event(payload, sport, utcnow())

    def scores(self, sport: str, days_from: int | None = None) -> list[dict]:
        params: dict[str, Any] = {"dateFormat": "iso"}
        if days_from:
            params["daysFrom"] = int(days_from)
        out = []
        for raw in self._get(f"/sports/{sport}/scores", params):
            home, away = raw.get("home_team"), raw.get("away_team")
            sc = {s.get("name"): s.get("score") for s in (raw.get("scores") or [])}
            out.append({"id": raw.get("id"), "completed": bool(raw.get("completed")),
                        "home_score": _int(sc.get(home)), "away_score": _int(sc.get(away)),
                        "last_update": raw.get("last_update"),
                        "commence_time": raw.get("commence_time")})
        return out


def parse_event(raw: dict, sport: str, observed_at) -> Event | None:
    """JSON de The Odds API → Event con mercados normalizados.

    * h2h: nombres de equipo + «Draw» → home/draw/away (3 vías si hay empate).
    * totals: Over/Under con ``point`` → línea = total.
    * spreads: cada equipo con su ``point`` → línea = hándicap del LOCAL; el
      precio del visitante se guarda bajo la línea del local cambiada de signo.
    * Una casa que aparezca dos veces en el mismo mercado: se queda la más reciente.
    * Cuotas ≤ 1 o no numéricas: fuera (nunca se corrigen).
    """
    try:
        eid = str(raw["id"])
        home, away = str(raw["home_team"]), str(raw["away_team"])
        ct = parse_ts(raw["commence_time"])
    except (KeyError, TypeError, ValueError):
        return None
    if ct is None:
        return None
    ev = Event(id=eid, sport=sport, sport_title=str(raw.get("sport_title") or sport),
               home=home, away=away, commence_time=ct)
    acc: dict[str, dict[str, dict[str, Quote]]] = {}
    shape: dict[str, tuple[str, float | None]] = {}
    has_draw: dict[str, bool] = {}
    for bk in raw.get("bookmakers") or []:
        book = str(bk.get("key") or "?")
        bk_lu = parse_ts(bk.get("last_update"))
        for mk in bk.get("markets") or []:
            mkey = mk.get("key")
            lu = parse_ts(mk.get("last_update")) or bk_lu
            for oc in mk.get("outcomes") or []:
                try:
                    price = float(oc["price"])
                except (KeyError, TypeError, ValueError):
                    continue
                if not price > 1.0:
                    continue
                name = str(oc.get("name"))
                point = oc.get("point")
                if mkey == H2H:
                    outcome = "home" if name == home else "away" if name == away else "draw" if name == "Draw" else None
                    line = None
                elif mkey == TOTALS:
                    outcome = {"Over": "over", "Under": "under"}.get(name)
                    line = None if point is None else float(point)
                elif mkey == SPREADS:
                    if point is None:
                        continue
                    if name == home:
                        outcome, line = "home", float(point) + 0.0   # -0.0 -> 0.0
                    elif name == away:
                        outcome, line = "away", 0.0 - float(point)   # nunca -0.0
                    else:
                        outcome = None
                        line = None
                else:
                    continue
                if outcome is None or (mkey != H2H and line is None):
                    continue
                key = market_key(mkey, line)
                shape[key] = (mkey, line)
                slot = acc.setdefault(key, {}).setdefault(outcome, {})
                prev = slot.get(book)
                if prev is None or (lu and (prev.last_update is None or lu >= prev.last_update)):
                    slot[book] = Quote(book=book, price=price, last_update=lu)
                if mkey == H2H and outcome == "draw":
                    has_draw[key] = True
    for key, per_outcome in acc.items():
        mkey, line = shape[key]
        if mkey == H2H:
            outcomes = OUTCOMES_3WAY if has_draw.get(key) else OUTCOMES_2WAY
        elif mkey == TOTALS:
            outcomes = OUTCOMES_TOTALS
        else:
            outcomes = OUTCOMES_2WAY
        ev.markets[key] = MarketSnapshot(event_id=eid, sport=sport, market=mkey, line=line,
                                         outcomes=outcomes, quotes=per_outcome, observed_at=observed_at)
    return ev
