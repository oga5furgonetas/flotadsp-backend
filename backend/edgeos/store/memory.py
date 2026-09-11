"""Almacén en memoria con la MISMA semántica que el de Mongo (tests y uso local)."""

from __future__ import annotations

import copy
from datetime import datetime, timedelta

from .base import Store


def _c(doc: dict) -> dict:
    return copy.deepcopy(doc)


class MemoryStore(Store):
    def __init__(self) -> None:
        self._snaps: list[dict] = []
        self._snap_keys: set[tuple] = set()
        self._scores: list[dict] = []
        self._signals: list[dict] = []
        self._signal_keys: set[tuple] = set()
        self._closings: dict[str, dict] = {}
        self._bets: dict[str, dict] = {}
        self._bet_keys: set[tuple] = set()
        self._watch: dict[str, dict] = {}
        self._alerts: dict[str, dict] = {}
        self._settings: dict = {}
        self._credits: list[dict] = []

    # snapshots
    async def put_snapshots(self, docs: list[dict]) -> int:
        n = 0
        for d in docs:
            k = (d["event_id"], d["market_key"], d["observed_at"], d["source"])
            if k in self._snap_keys:
                continue
            self._snap_keys.add(k)
            self._snaps.append(_c(d))
            n += 1
        return n

    async def snapshots_asof(self, asof, *, lookback=timedelta(hours=48), event_ids=None):
        ids = None if event_ids is None else set(event_ids)
        latest: dict[tuple, dict] = {}
        lo = asof - lookback
        for d in self._snaps:
            if not (lo <= d["observed_at"] <= asof):
                continue
            if ids is not None and d["event_id"] not in ids:
                continue
            k = (d["event_id"], d["market_key"])
            if k not in latest or d["observed_at"] > latest[k]["observed_at"]:
                latest[k] = d
        return [_c(v) for v in latest.values()]

    async def snapshot_history(self, event_id, *, until, market_key=None):
        rows = [d for d in self._snaps if d["event_id"] == event_id and d["observed_at"] <= until
                and (market_key is None or d["market_key"] == market_key)]
        return [_c(d) for d in sorted(rows, key=lambda x: x["observed_at"])]

    # marcadores
    async def put_scores(self, docs):
        self._scores.extend(_c(d) for d in docs)
        return len(docs)

    async def scores_asof(self, asof, event_ids=None):
        ids = None if event_ids is None else set(event_ids)
        out: dict[str, dict] = {}
        for d in self._scores:
            if d["observed_at"] > asof or (ids is not None and d["event_id"] not in ids):
                continue
            if d["event_id"] not in out or d["observed_at"] > out[d["event_id"]]["observed_at"]:
                out[d["event_id"]] = d
        return {k: _c(v) for k, v in out.items()}

    async def score_history(self, event_id, until):
        rows = [d for d in self._scores if d["event_id"] == event_id and d["observed_at"] <= until]
        return [_c(d) for d in sorted(rows, key=lambda x: x["observed_at"])]

    # señales
    async def log_signals(self, docs):
        n = 0
        for d in docs:
            k = (d["id"], d["observed_at"])
            if k in self._signal_keys:
                continue
            self._signal_keys.add(k)
            self._signals.append(_c(d))
            n += 1
        return n

    async def signals(self, *, since=None, until=None, selection_id=None, limit=5000):
        rows = [d for d in self._signals
                if (since is None or d["observed_at"] >= since) and (until is None or d["observed_at"] <= until)
                and (selection_id is None or d["id"] == selection_id)]
        rows.sort(key=lambda x: (x["observed_at"], x["id"]))
        return [_c(d) for d in rows[-limit:]]

    async def put_signal_closing(self, doc):
        if doc["selection_id"] in self._closings:
            return False
        self._closings[doc["selection_id"]] = _c(doc)
        return True

    async def signal_closings(self, *, since=None):
        rows = [d for d in self._closings.values() if since is None or d["closed_at"] >= since]
        return [_c(d) for d in sorted(rows, key=lambda x: (x["closed_at"], x["selection_id"]))]

    # paper
    async def add_paper_bet(self, doc):
        k = (doc["selection_id"], doc["source"])
        if doc["bet_id"] in self._bets or (doc["source"] == "auto" and k in self._bet_keys):
            return False
        self._bet_keys.add(k)
        self._bets[doc["bet_id"]] = _c(doc)
        return True

    async def paper_bets(self, *, status=None, limit=5000):
        rows = [d for d in self._bets.values() if status is None or d["status"] == status]
        rows.sort(key=lambda x: (x["created_at"], x["bet_id"]))
        return [_c(d) for d in rows[-limit:]]

    async def update_paper_bet(self, bet_id, fields):
        if bet_id not in self._bets:
            return False
        self._bets[bet_id].update(_c(fields))
        return True

    # watchlist / alertas
    async def add_watch(self, doc):
        if any(w["selection_id"] == doc["selection_id"] and w["status"] == "active" for w in self._watch.values()):
            return False
        self._watch[doc["watch_id"]] = _c(doc)
        return True

    async def watches(self, *, status="active"):
        rows = [w for w in self._watch.values() if status is None or w["status"] == status]
        return [_c(w) for w in sorted(rows, key=lambda x: (x["created_at"], x["watch_id"]))]

    async def update_watch(self, watch_id, fields):
        if watch_id not in self._watch:
            return False
        self._watch[watch_id].update(_c(fields))
        return True

    async def add_alert(self, doc):
        if doc["alert_id"] in self._alerts:
            return False
        self._alerts[doc["alert_id"]] = _c(doc)
        return True

    async def alerts(self, *, unread_only=False, limit=200):
        rows = [a for a in self._alerts.values() if not unread_only or not a.get("read")]
        rows.sort(key=lambda x: (x["created_at"], x["alert_id"]), reverse=True)
        return [_c(a) for a in rows[:limit]]

    async def mark_alerts_read(self, alert_ids):
        n = 0
        for i in alert_ids:
            if i in self._alerts and not self._alerts[i].get("read"):
                self._alerts[i]["read"] = True
                n += 1
        return n

    # ajustes / créditos
    async def get_settings(self):
        return _c(self._settings)

    async def put_settings(self, fields):
        self._settings.update(_c(fields))
        return _c(self._settings)

    async def log_credit(self, doc):
        self._credits.append(_c(doc))

    async def credit_log(self, since: datetime):
        return [_c(d) for d in self._credits if d["at"] >= since]
