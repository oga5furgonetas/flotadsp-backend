"""Snapshot ↔ documento. El replay depende de que la ida y la vuelta sean exactas."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from ..domain import Event, MarketSnapshot, Quote, Score, ensure_utc, market_key


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:                     # Mongo sin tz_aware devuelve UTC naive
        from ..domain import UTC
        return dt.replace(tzinfo=UTC)
    return ensure_utc(dt)


def _req(dt: datetime | None) -> datetime:
    out = _utc(dt)
    if out is None:
        raise ValueError("fecha obligatoria ausente en el documento")
    return out


def snapshot_doc(ev: Event, snap: MarketSnapshot, *, source: str, scan_id: str) -> dict:
    return {
        "event_id": ev.id, "sport": ev.sport, "sport_title": ev.sport_title, "home": ev.home, "away": ev.away,
        "commence_time": ev.commence_time, "market": snap.market, "line": snap.line,
        "market_key": market_key(snap.market, snap.line), "outcomes": list(snap.outcomes),
        "observed_at": snap.observed_at, "source": source, "scan_id": scan_id,
        "quotes": {o: {b: {"p": q.price, "u": q.last_update} for b, q in per.items()}
                   for o, per in snap.quotes.items()},
    }


def snapshot_from_doc(doc: dict) -> MarketSnapshot:
    quotes = {o: {b: Quote(b, float(v["p"]), _utc(v.get("u"))) for b, v in per.items()}
              for o, per in doc["quotes"].items()}
    return MarketSnapshot(event_id=doc["event_id"], sport=doc["sport"], market=doc["market"],
                          line=doc.get("line"), outcomes=tuple(doc["outcomes"]), quotes=quotes,
                          observed_at=_req(doc["observed_at"]))


def events_from_docs(docs: Iterable[dict], scores: dict[str, dict] | None = None) -> list[Event]:
    """Agrupa documentos (uno por mercado) en eventos. Si llegan varios del mismo
    mercado, se queda el más reciente observado."""
    by_event: dict[str, Event] = {}
    best: dict[tuple[str, str], datetime] = {}
    for doc in docs:
        eid = doc["event_id"]
        ev = by_event.get(eid)
        if ev is None:
            ev = Event(id=eid, sport=doc["sport"], sport_title=doc.get("sport_title") or doc["sport"],
                       home=doc["home"], away=doc["away"], commence_time=_req(doc["commence_time"]))
            by_event[eid] = ev
        snap = snapshot_from_doc(doc)
        k = (eid, snap.key)
        if k not in best or snap.observed_at > best[k]:
            best[k] = snap.observed_at
            ev.markets[snap.key] = snap
    for eid, ev in by_event.items():
        sd = (scores or {}).get(eid)
        if sd:
            ev.score = score_from_doc(sd)
    return sorted(by_event.values(), key=lambda e: (e.commence_time, e.id))


def score_doc(row: dict, sport: str, observed_at: datetime) -> dict:
    return {"event_id": row["id"], "sport": sport, "home_score": row.get("home_score"),
            "away_score": row.get("away_score"), "completed": bool(row.get("completed")),
            "last_update": row.get("last_update"), "observed_at": observed_at}


def score_from_doc(doc: dict) -> Score:
    lu = doc.get("last_update")
    if isinstance(lu, str):
        from ..domain import parse_ts
        lu = parse_ts(lu)
    return Score(home=doc.get("home_score"), away=doc.get("away_score"), completed=bool(doc.get("completed")),
                 observed_at=_req(doc["observed_at"]), last_update=_utc(lu) if isinstance(lu, datetime) else None)
