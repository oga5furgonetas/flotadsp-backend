"""Almacén MongoDB (motor). Base propia: nunca comparte colecciones con FlotaDSP.

Reglas aprendidas en FlotaDSP que aquí se cumplen desde el principio:

* Todo lo que tiene que ser único lo dice un índice único; el código traduce el
  duplicado a «ya existía» (``DuplicateKeyError`` → False), no a un 500.
* ``insert_one`` MUTA el documento (le mete ``_id``): se inserta siempre una copia.
* Toda lectura proyecta fuera ``_id``.
* Fechas con zona horaria (``tz_aware=True``).
"""

from __future__ import annotations

import copy
from datetime import datetime, timedelta

from pymongo import ASCENDING, DESCENDING
from pymongo.errors import BulkWriteError, DuplicateKeyError

from .base import Store

NO_ID = {"_id": 0}


class MongoStore(Store):
    def __init__(self, url: str, database: str = "edge_os", *, client=None):
        if client is None:
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(url, tz_aware=True, serverSelectionTimeoutMS=8000, maxPoolSize=10)
        self._client = client
        self._edb = client[database]
        self._ready = False

    async def ensure_indexes(self) -> None:
        if self._ready:
            return
        e = self._edb
        await e.snapshots.create_index([("event_id", ASCENDING), ("market_key", ASCENDING),
                                        ("observed_at", ASCENDING), ("source", ASCENDING)],
                                       unique=True, name="snap_unico")
        await e.snapshots.create_index([("observed_at", ASCENDING)], expireAfterSeconds=400 * 86400,
                                       name="snap_ttl")
        await e.scores.create_index([("event_id", ASCENDING), ("observed_at", ASCENDING)], name="score_evento")
        await e.scores.create_index([("observed_at", ASCENDING)], expireAfterSeconds=400 * 86400, name="score_ttl")
        await e.signals.create_index([("id", ASCENDING), ("observed_at", ASCENDING)], unique=True,
                                     name="senal_unica")
        await e.signals.create_index([("observed_at", ASCENDING)], expireAfterSeconds=400 * 86400,
                                     name="senal_ttl")
        await e.signal_closings.create_index([("selection_id", ASCENDING)], unique=True, name="cierre_unico")
        await e.paper_bets.create_index([("bet_id", ASCENDING)], unique=True, name="apuesta_unica")
        await e.paper_bets.create_index([("selection_id", ASCENDING), ("source", ASCENDING)], unique=True,
                                        partialFilterExpression={"source": "auto"}, name="auto_una_por_seleccion")
        await e.paper_bets.create_index([("status", ASCENDING), ("created_at", ASCENDING)], name="apuesta_estado")
        await e.watchlist.create_index([("watch_id", ASCENDING)], unique=True, name="vigilancia_unica")
        await e.watchlist.create_index([("selection_id", ASCENDING)], unique=True,
                                       partialFilterExpression={"status": "active"}, name="una_activa_por_seleccion")
        await e.alerts.create_index([("alert_id", ASCENDING)], unique=True, name="alerta_unica")
        await e.alerts.create_index([("created_at", ASCENDING)], expireAfterSeconds=120 * 86400, name="alerta_ttl")
        await e.credit_log.create_index([("at", ASCENDING)], expireAfterSeconds=180 * 86400, name="credito_ttl")
        self._ready = True

    # snapshots
    async def put_snapshots(self, docs: list[dict]) -> int:
        if not docs:
            return 0
        await self.ensure_indexes()
        try:
            res = await self._edb.snapshots.insert_many([copy.deepcopy(d) for d in docs], ordered=False)
            return len(res.inserted_ids)
        except BulkWriteError as e:                 # repetidos: se ignoran a propósito
            return int(e.details.get("nInserted", 0))

    async def snapshots_asof(self, asof, *, lookback=timedelta(hours=48), event_ids=None):
        await self.ensure_indexes()
        match: dict = {"observed_at": {"$gte": asof - lookback, "$lte": asof}}
        if event_ids is not None:
            match["event_id"] = {"$in": list(event_ids)}
        pipe = [{"$match": match}, {"$sort": {"observed_at": DESCENDING}},
                {"$group": {"_id": {"e": "$event_id", "m": "$market_key"}, "doc": {"$first": "$$ROOT"}}},
                {"$replaceRoot": {"newRoot": "$doc"}}, {"$project": NO_ID}]
        return [d async for d in self._edb.snapshots.aggregate(pipe, allowDiskUse=True)]

    async def snapshot_history(self, event_id, *, until, market_key=None):
        await self.ensure_indexes()
        q: dict = {"event_id": event_id, "observed_at": {"$lte": until}}
        if market_key is not None:
            q["market_key"] = market_key
        cur = self._edb.snapshots.find(q, NO_ID).sort("observed_at", ASCENDING)
        return [d async for d in cur]

    # marcadores
    async def put_scores(self, docs):
        if not docs:
            return 0
        await self.ensure_indexes()
        res = await self._edb.scores.insert_many([copy.deepcopy(d) for d in docs], ordered=False)
        return len(res.inserted_ids)

    async def scores_asof(self, asof, event_ids=None):
        await self.ensure_indexes()
        match: dict = {"observed_at": {"$lte": asof}}
        if event_ids is not None:
            match["event_id"] = {"$in": list(event_ids)}
        pipe = [{"$match": match}, {"$sort": {"observed_at": DESCENDING}},
                {"$group": {"_id": "$event_id", "doc": {"$first": "$$ROOT"}}},
                {"$replaceRoot": {"newRoot": "$doc"}}, {"$project": NO_ID}]
        return {d["event_id"]: d async for d in self._edb.scores.aggregate(pipe)}

    async def score_history(self, event_id, until):
        cur = self._edb.scores.find({"event_id": event_id, "observed_at": {"$lte": until}}, NO_ID)
        return [d async for d in cur.sort("observed_at", ASCENDING)]

    # señales
    async def log_signals(self, docs):
        if not docs:
            return 0
        await self.ensure_indexes()
        try:
            res = await self._edb.signals.insert_many([copy.deepcopy(d) for d in docs], ordered=False)
            return len(res.inserted_ids)
        except BulkWriteError as e:
            return int(e.details.get("nInserted", 0))

    async def signals(self, *, since=None, until=None, selection_id=None, limit=5000):
        q: dict = {}
        if since is not None or until is not None:
            q["observed_at"] = {k: v for k, v in (("$gte", since), ("$lte", until)) if v is not None}
        if selection_id is not None:
            q["id"] = selection_id
        cur = self._edb.signals.find(q, NO_ID).sort([("observed_at", DESCENDING), ("id", ASCENDING)]).limit(limit)
        rows = [d async for d in cur]
        return list(reversed(rows))

    async def put_signal_closing(self, doc):
        await self.ensure_indexes()
        try:
            await self._edb.signal_closings.insert_one(copy.deepcopy(doc))
            return True
        except DuplicateKeyError:
            return False

    async def signal_closings(self, *, since=None):
        q = {} if since is None else {"closed_at": {"$gte": since}}
        cur = self._edb.signal_closings.find(q, NO_ID).sort([("closed_at", ASCENDING), ("selection_id", ASCENDING)])
        return [d async for d in cur]

    # paper
    async def add_paper_bet(self, doc):
        await self.ensure_indexes()
        try:
            await self._edb.paper_bets.insert_one(copy.deepcopy(doc))
            return True
        except DuplicateKeyError:
            return False

    async def paper_bets(self, *, status=None, limit=5000):
        q = {} if status is None else {"status": status}
        cur = self._edb.paper_bets.find(q, NO_ID).sort([("created_at", DESCENDING), ("bet_id", ASCENDING)]).limit(limit)
        return list(reversed([d async for d in cur]))

    async def update_paper_bet(self, bet_id, fields):
        res = await self._edb.paper_bets.update_one({"bet_id": bet_id}, {"$set": copy.deepcopy(fields)})
        return res.matched_count == 1

    # watchlist / alertas
    async def add_watch(self, doc):
        await self.ensure_indexes()
        try:
            await self._edb.watchlist.insert_one(copy.deepcopy(doc))
            return True
        except DuplicateKeyError:
            return False

    async def watches(self, *, status="active"):
        q = {} if status is None else {"status": status}
        cur = self._edb.watchlist.find(q, NO_ID).sort([("created_at", ASCENDING), ("watch_id", ASCENDING)])
        return [d async for d in cur]

    async def update_watch(self, watch_id, fields):
        try:
            res = await self._edb.watchlist.update_one({"watch_id": watch_id}, {"$set": copy.deepcopy(fields)})
        except DuplicateKeyError:
            return False
        return res.matched_count == 1

    async def add_alert(self, doc):
        await self.ensure_indexes()
        try:
            await self._edb.alerts.insert_one(copy.deepcopy(doc))
            return True
        except DuplicateKeyError:
            return False

    async def alerts(self, *, unread_only=False, limit=200):
        q = {"read": {"$ne": True}} if unread_only else {}
        cur = self._edb.alerts.find(q, NO_ID).sort([("created_at", DESCENDING), ("alert_id", ASCENDING)]).limit(limit)
        return [d async for d in cur]

    async def mark_alerts_read(self, alert_ids):
        res = await self._edb.alerts.update_many({"alert_id": {"$in": list(alert_ids)}, "read": {"$ne": True}},
                                                 {"$set": {"read": True}})
        return res.modified_count

    # ajustes / créditos
    async def get_settings(self):
        doc = await self._edb.settings.find_one({"_id": "settings"})
        if not doc:
            return {}
        doc.pop("_id", None)
        return doc

    async def put_settings(self, fields):
        await self._edb.settings.update_one({"_id": "settings"}, {"$set": copy.deepcopy(fields)}, upsert=True)
        return await self.get_settings()

    async def log_credit(self, doc):
        await self.ensure_indexes()
        await self._edb.credit_log.insert_one(copy.deepcopy(doc))

    async def credit_log(self, since: datetime):
        cur = self._edb.credit_log.find({"at": {"$gte": since}}, NO_ID).sort("at", ASCENDING)
        return [d async for d in cur]
