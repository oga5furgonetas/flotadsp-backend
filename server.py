"""
FlotaDSP Pro — Backend de sincronización en la nube.
Persistencia central de toda la app (traspasos, incidencias, históricos, fotos, multas, docs…)
en una única colección Mongo (`state`) con versionado para sync en tiempo real entre navegadores.
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="FlotaDSP Sync API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("flotadsp")

# Singleton document id for the global app state
STATE_ID = "flotadsp_main"

# Arrays that should be merged (append + dedupe) instead of replaced.
# Value = the field on each item used as dedupe key (None = dedupe by full content).
MERGE_ARRAYS = {
    "tr": "ts",           # transfers
    "incs": "ts",         # incidents
    "hist": "ts",         # IA history
    "actLog": "ts",       # activity log
    "trash": "deletedAt",
    "drivers": "id",
    "MULTAS": "ref",      # by DGT reference
    "DOCS": None,         # by full content hash
    "views": "name",
    "notifs": "ts",
}

# Object maps merged key by key (later writer wins per key)
MERGE_OBJECTS = {"ov", "refs", "cks", "assign", "usage", "costs", "kmlog", "vehStatus"}

MAX_TR = 500       # max transfers kept
MAX_INC = 1000     # max incidences kept

_lock = asyncio.Lock()


class SyncPayload(BaseModel):
    state: Dict[str, Any]
    version: Optional[int] = None  # client's last known version


# ─── helpers ──────────────────────────────────────────────────────────────

def _ts_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _item_id(item: Any, key: Optional[str]) -> str:
    """Stable identity string for an item, used as dedupe key."""
    if isinstance(item, dict) and key and item.get(key) is not None:
        return f"k:{item[key]}"
    return f"j:{json.dumps(item, sort_keys=True, default=str)}"


def _ts_of(item: Any) -> int:
    """Best-effort timestamp extraction for sorting."""
    return item.get("ts", 0) if isinstance(item, dict) else 0


def _dedupe_array(existing: List[Any], incoming: List[Any], key: Optional[str]) -> List[Any]:
    """Merge two arrays. Incoming items take precedence (latest writer wins per dedupe key)."""
    merged: List[Any] = []
    seen: set = set()
    for source in ((incoming or []), (existing or [])):
        for item in source:
            ident = _item_id(item, key)
            if ident in seen:
                continue
            seen.add(ident)
            merged.append(item)
    if key == "ts":
        merged.sort(key=_ts_of, reverse=True)
    return merged


def _merge_state(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    """Smart merge: arrays merged with dedupe, objects key-merged, scalars overwritten."""
    if not existing:
        return dict(incoming)
    out = dict(existing)
    for k, v in (incoming or {}).items():
        if k in MERGE_ARRAYS and isinstance(v, list):
            out[k] = _dedupe_array(out.get(k, []), v, MERGE_ARRAYS[k])
        elif k in MERGE_OBJECTS and isinstance(v, dict):
            merged_obj = dict(out.get(k, {}) or {})
            merged_obj.update(v)
            out[k] = merged_obj
        else:
            out[k] = v
    return out


async def _get_doc() -> Dict[str, Any]:
    doc = await db.state.find_one({"_id": STATE_ID}, {"_id": 0})
    if doc:
        return doc
    seed = {"version": 0, "state": {}, "updatedAt": _ts_now()}
    await db.state.insert_one({**seed, "_id": STATE_ID})
    return seed


async def _save_doc(state: Dict[str, Any], prev_version: int) -> Dict[str, Any]:
    new_version = (prev_version or 0) + 1
    update = {"version": new_version, "state": state, "updatedAt": _ts_now()}
    await db.state.update_one({"_id": STATE_ID}, {"$set": update}, upsert=True)
    return update


def _append_entry(arr: List[Any], entry: Dict[str, Any], cap: int) -> List[Any]:
    """Prepend entry to arr if its ts is not already present, capped at `cap`."""
    entry_ts = entry.get("ts")
    already = any(isinstance(t, dict) and t.get("ts") == entry_ts for t in arr)
    if not already:
        arr.insert(0, entry)
    return arr[:cap]


def _apply_transfer_to_ov(state: Dict[str, Any], entry: Dict[str, Any]) -> None:
    """Propagate the new centre into the global override map (ov)."""
    plate, target = entry.get("plate"), entry.get("to")
    if not plate or not target:
        return
    ov = dict(state.get("ov", {}) or {})
    cur = dict(ov.get(plate, {}) or {})
    cur["centro"] = target
    ov[plate] = cur
    state["ov"] = ov


# ─── routes ───────────────────────────────────────────────────────────────

@api.get("/")
async def root() -> Dict[str, Any]:
    return {"app": "FlotaDSP", "ok": True}


@api.get("/sync")
async def get_sync() -> JSONResponse:
    doc = await _get_doc()
    return JSONResponse(content={
        "version": doc.get("version", 0),
        "state": doc.get("state", {}),
        "updatedAt": doc.get("updatedAt"),
    })


@api.get("/sync/version")
async def get_version() -> Dict[str, Any]:
    doc = await _get_doc()
    return {"version": doc.get("version", 0), "updatedAt": doc.get("updatedAt")}


@api.post("/sync")
async def post_sync(payload: SyncPayload) -> Dict[str, Any]:
    """Merge incoming state into the central doc and bump version."""
    async with _lock:
        doc = await _get_doc()
        merged = _merge_state(doc.get("state", {}) or {}, payload.state or {})
        update = await _save_doc(merged, doc.get("version", 0))
        return {"ok": True, "version": update["version"], "updatedAt": update["updatedAt"]}


@api.post("/sync/reset")
async def reset_sync() -> Dict[str, Any]:
    """Reset the entire state (admin only — be careful)."""
    await db.state.update_one(
        {"_id": STATE_ID},
        {"$set": {"version": 0, "state": {}, "updatedAt": _ts_now()}},
        upsert=True,
    )
    return {"ok": True}


@api.post("/transfer")
async def push_transfer(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Append a single transfer to the `tr` array (atomic)."""
    async with _lock:
        doc = await _get_doc()
        state = doc.get("state", {}) or {}
        state["tr"] = _append_entry(list(state.get("tr", []) or []), entry, MAX_TR)
        _apply_transfer_to_ov(state, entry)
        update = await _save_doc(state, doc.get("version", 0))
        return {"ok": True, "version": update["version"]}


@api.post("/incidence")
async def push_incidence(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Append a single incidence to the `incs` array (atomic)."""
    async with _lock:
        doc = await _get_doc()
        state = doc.get("state", {}) or {}
        state["incs"] = _append_entry(list(state.get("incs", []) or []), entry, MAX_INC)
        update = await _save_doc(state, doc.get("version", 0))
        return {"ok": True, "version": update["version"]}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()
