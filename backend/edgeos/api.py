"""API HTTP de EDGE OS. Se monta dentro de FlotaDSP o se sirve sola (``py -m edgeos serve``).

Seguridad (heredada del panel anterior, que ya estaba probada):

* Sin contraseña configurada no se monta NINGUNA ruta: el path devuelve 404.
* Token propio HMAC sobre la caducidad (12 h). Bloqueo temporal tras varios fallos
  de contraseña desde la misma IP.
* Ficheros estáticos por lista blanca: nada de rutas arbitrarias.

Operaciones que gastan créditos (escanear, abrir un evento, capturar cierres,
liquidar) van en serie con un cerrojo: dos pestañas no pueden gastar dos veces.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Body, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, Response

from . import __version__
from .assets import Asset
from .decision import engine as E
from .services.service import EdgeService
from .store.base import Store

log = logging.getLogger("edgeos")
WEB = Path(__file__).resolve().parent / "web"
STATIC = {"app.js": "application/javascript; charset=utf-8", "app.css": "text/css; charset=utf-8"}
TOKEN_TTL_S = 12 * 3600
LOCK_AFTER, LOCK_S = 6, 300
CLOSING_EVERY_S = 300
SETTLE_EVERY_S = 3600


class Auth:
    def __init__(self, password: str):
        self._secret = hashlib.sha256(b"edgeos|v2|" + password.encode("utf-8")).digest()
        self._password = password
        self._fails: dict[str, list[float]] = {}

    def make(self) -> tuple[str, int]:
        exp = int(time.time()) + TOKEN_TTL_S
        mac = hmac.new(self._secret, str(exp).encode(), hashlib.sha256).hexdigest()
        return f"{exp}.{mac}", exp

    def check(self, token: str) -> bool:
        try:
            exp_s, mac = token.split(".", 1)
            exp = int(exp_s)
        except (ValueError, AttributeError):
            return False
        if exp < time.time():
            return False
        good = hmac.new(self._secret, exp_s.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(mac, good)

    def locked(self, ip: str) -> bool:
        rec = self._fails.get(ip)
        return bool(rec and rec[0] >= LOCK_AFTER and time.time() < rec[1])

    def fail(self, ip: str) -> None:
        rec = self._fails.setdefault(ip, [0, 0.0])
        rec[0] += 1
        if rec[0] >= LOCK_AFTER:
            rec[1] = time.time() + LOCK_S

    def ok_password(self, given: str) -> bool:
        return hmac.compare_digest(given.encode("utf-8"), self._password.encode("utf-8"))


def _iso(v):
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _iso(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_iso(x) for x in v]
    return v


def decision_from_dict(d: dict) -> E.Decision:
    dec = E.Decision(**{k: v for k, v in d.items() if k not in ("emoji", "label")})
    dec.set_state(d["state"])
    return dec


def research_view(asset: Asset) -> dict:
    """El fichero de calibración sin las tablas de cuantiles (pesan y no se leen)."""
    data = asset.data
    strategies = {}
    for key, s in data.get("strategies", {}).items():
        m = s.get("model") or {}
        mm = m.get("model") or {}
        strategies[key] = {**{k: v for k, v in s.items() if k != "model"},
                           "model": {k: v for k, v in m.items() if k != "model"} | {
                               "edges": mm.get("edges"), "trained_until": mm.get("trained_until"),
                               "buckets": [{k: b[k] for k in ("n", "n_eff", "mean", "se")} for b in mm.get("buckets", [])]}}
    return {"version": asset.version, "generated_at": data.get("generated_at"), "data": data.get("data"),
            "protocol": data.get("protocol"), "devig": data.get("devig"), "devig_experiment": data.get("devig_experiment"),
            "strategies": strategies, "findings": data.get("findings"), "model_football": data.get("model_football"),
            "runtime": data.get("runtime")}


def build_router(*, prefix: str, password: str, service: EdgeService,
                 on_request: Callable[[], None] | None = None,
                 spend_lock: asyncio.Lock | None = None) -> APIRouter:
    router = APIRouter()
    auth = Auth(password)
    base = "/" + prefix.strip("/")
    # el mismo cerrojo que usa el bucle de fondo: dos cosas no pueden gastar a la vez
    spend_lock = spend_lock or asyncio.Lock()

    async def require(authorization: str = Header(default="")) -> bool:
        if on_request:
            on_request()
        tok = authorization[7:] if authorization.lower().startswith("bearer ") else ""
        if not tok or not auth.check(tok):
            raise HTTPException(status_code=401, detail="sesión no válida")
        return True

    @router.get(base, response_class=HTMLResponse)
    async def index() -> HTMLResponse:
        if on_request:
            on_request()
        html = (WEB / "index.html").read_text(encoding="utf-8")
        html = html.replace("__BASE__", base).replace("__VERSION__", f"{__version__}-{service.asset.version}")
        return HTMLResponse(html, headers={"Cache-Control": "no-cache", "X-Robots-Tag": "noindex, nofollow"})

    @router.get(base + "/static/{name}")
    async def static(name: str) -> Response:
        if name not in STATIC:
            raise HTTPException(status_code=404)
        return Response((WEB / name).read_bytes(), media_type=STATIC[name],
                        headers={"Cache-Control": "public, max-age=300"})

    @router.get(base + "/health")
    async def health() -> dict:
        return {"ok": True, "service": "edge_os", "version": __version__, "asset": service.asset.version,
                "mock": service.feed.is_mock, "store": type(service.store).__name__}

    @router.post(base + "/api/login")
    async def login(request: Request, payload: dict = Body(...)) -> dict:
        ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0]
        if auth.locked(ip):
            raise HTTPException(status_code=429, detail="demasiados intentos; espera unos minutos")
        if not auth.ok_password(str(payload.get("password") or "")):
            auth.fail(ip)
            raise HTTPException(status_code=401, detail="contraseña incorrecta")
        tok, exp = auth.make()
        return {"token": tok, "exp": exp}

    @router.get(base + "/api/board", dependencies=[Depends(require)])
    async def board() -> dict:
        return _iso(await service.board())

    @router.post(base + "/api/scan", dependencies=[Depends(require)])
    async def scan(payload: dict = Body(default={})) -> dict:
        scope = str(payload.get("scope") or "soon")
        if scope not in ("live", "soon", "today"):
            raise HTTPException(status_code=400, detail="alcance: live | soon | today")
        sports = payload.get("sports") or None
        async with spend_lock:
            return _iso(await service.scan(scope=scope, sports=sports, forced=bool(payload.get("forced"))))

    @router.get(base + "/api/pulse", dependencies=[Depends(require)])
    async def pulse() -> dict:
        return await service.pulse(await service.default_sports())

    @router.get(base + "/api/event/{event_id}", dependencies=[Depends(require)])
    async def event(event_id: str, fetch: int = Query(0), forced: int = Query(0)) -> dict:
        if fetch:
            async with spend_lock:
                return _iso(await service.event_detail(event_id, fetch_markets=True, forced=bool(forced)))
        return _iso(await service.event_detail(event_id))

    @router.get(base + "/api/replay", dependencies=[Depends(require)])
    async def replay(at: str = Query(...)) -> dict:
        try:
            t = datetime.fromisoformat(at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="fecha no válida (ISO 8601)") from None
        if t.tzinfo is None:
            t = t.replace(tzinfo=UTC)
        return _iso(await service.replay(t))

    @router.post(base + "/api/compare", dependencies=[Depends(require)])
    async def compare(payload: dict = Body(...)) -> dict:
        ids = [str(x) for x in (payload.get("ids") or [])][:10]
        if len(ids) < 2:
            raise HTTPException(status_code=400, detail="elige al menos dos apuestas")
        b = await service.board()
        found = [decision_from_dict(d) for d in b["decisions"] if d["id"] in ids]
        res = E.compare(found)
        return {"winner": res["winner"].to_dict() if res["winner"] else None,
                "ranking": [d.to_dict() for d in res["ranking"]], "text": res["text"],
                "missing": [i for i in ids if i not in {d.id for d in found}]}

    @router.get(base + "/api/watch", dependencies=[Depends(require)])
    async def watches() -> list:
        return await service.watches()

    @router.post(base + "/api/watch", dependencies=[Depends(require)])
    async def add_watch(payload: dict = Body(...)) -> dict:
        b = await service.board()
        d = next((x for x in b["decisions"] if x["id"] == payload.get("id")), None)
        if d is None:
            raise HTTPException(status_code=404, detail="esa selección no está en el tablero actual")
        try:
            return await service.add_watch(d, target_odds=payload.get("target_odds"))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from None

    @router.get(base + "/api/alerts", dependencies=[Depends(require)])
    async def alerts(unread: int = Query(0)) -> list:
        return await service.alerts(unread_only=bool(unread))

    @router.post(base + "/api/alerts/read", dependencies=[Depends(require)])
    async def alerts_read(payload: dict = Body(...)) -> dict:
        return {"marked": await service.store.mark_alerts_read([str(x) for x in payload.get("ids") or []])}

    @router.get(base + "/api/bets", dependencies=[Depends(require)])
    async def bets() -> list:
        return await service.paper_bets()

    @router.post(base + "/api/bets", dependencies=[Depends(require)])
    async def add_bet(payload: dict = Body(...)) -> dict:
        try:
            return await service.add_manual_bet(str(payload.get("id")), odds=float(str(payload.get("odds"))),
                                                 book=str(payload.get("book") or "mi casa"),
                                                 stake=float(payload.get("stake") or 1))
        except (TypeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=str(e)) from None
        except LookupError as e:
            raise HTTPException(status_code=404, detail=str(e)) from None

    @router.post(base + "/api/bets/close", dependencies=[Depends(require)])
    async def close_now() -> dict:
        async with spend_lock:
            return _iso(await service.capture_closings())

    @router.post(base + "/api/bets/settle", dependencies=[Depends(require)])
    async def settle_now() -> dict:
        async with spend_lock:
            return _iso(await service.settle())

    @router.get(base + "/api/performance", dependencies=[Depends(require)])
    async def performance() -> dict:
        return _iso(await service.performance())

    @router.get(base + "/api/research", dependencies=[Depends(require)])
    async def research() -> dict:
        return research_view(service.asset)

    @router.get(base + "/api/settings", dependencies=[Depends(require)])
    async def get_settings() -> dict:
        return await service.settings()

    @router.put(base + "/api/settings", dependencies=[Depends(require)])
    async def put_settings(payload: dict = Body(...)) -> dict:
        try:
            return await service.update_settings(payload)
        except (TypeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=str(e)) from None

    @router.get(base + "/api/budget", dependencies=[Depends(require)])
    async def budget() -> dict:
        now = service.clock()
        rows = await service.store.credit_log(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0))
        per_day: dict[str, dict[str, int]] = {}
        for r in rows:
            day = r["at"].date().isoformat()
            per_day.setdefault(day, {})
            per_day[day][r["purpose"]] = per_day[day].get(r["purpose"], 0) + int(r.get("cost") or 0)
        return {**(await service.budget_status()), "per_day": per_day}

    @router.get(base + "/api/books", dependencies=[Depends(require)])
    async def books() -> dict:
        """Todas las casas vistas en los últimos precios guardados (menos la referencia, que
        nunca se recomienda: no puede tener ventaja contra sí misma)."""
        docs = await service.store.snapshots_asof(service.clock(), lookback=timedelta(hours=72))
        seen = sorted({bk for d in docs for per in d.get("quotes", {}).values() for bk in per})
        return {"books": [b for b in seen if b != "pinnacle"], "settings": (await service.settings()).get("my_books")}

    @router.get(base + "/api/sports", dependencies=[Depends(require)])
    async def sports() -> dict:
        rows = await service.sports()
        validated = set(service.asset.data.get("runtime", {}).get("validated_sports", []))
        return {"sports": [{**s, "validated": s["key"] in validated} for s in rows]}

    return router


class _LoopStarter:
    """Arranca el bucle de fondo una sola vez, con el arranque de la app o con la primera
    petición (las versiones nuevas de FastAPI quitan los eventos de arranque)."""

    def __init__(self, service: EdgeService, lock: asyncio.Lock | None = None):
        self.service = service
        self.lock = lock
        self.task: asyncio.Task | None = None

    def __call__(self) -> None:
        if self.task is not None and not self.task.done():
            return
        try:
            self.task = asyncio.get_running_loop().create_task(_loop(self.service, self.lock))
        except RuntimeError:
            self.task = None

    def cancel(self) -> None:
        if self.task is not None:
            self.task.cancel()


async def _loop(service: EdgeService, lock: asyncio.Lock | None = None) -> None:
    """Captura cierres, liquida y BUSCA SOLA en segundo plano.

    La búsqueda automática es lo que hace que el panel tenga algo cuando entras: un precio
    mal puesto dura minutos. Gasta solo su parte del presupuesto (ver `auto_scan`) y usa el
    mismo cerrojo que el panel, así que nunca se gasta dos veces a la vez. Un fallo aquí se
    registra y se sigue: nunca debe tumbar la aplicación que lo aloja.
    """
    lock = lock or asyncio.Lock()
    last_settle = 0.0
    last_auto: float | None = None
    while True:
        try:
            async with lock:
                await service.capture_closings()
                if time.time() - last_settle >= SETTLE_EVERY_S:
                    await service.settle()
                    last_settle = time.time()
            st = await service.settings()
            every = float(st.get("auto_scan_every_min") or 60) * 60.0
            if last_auto is None:                       # tras arrancar, la primera a los 5 min
                last_auto = time.time() - max(every - 300.0, 0.0)
            if st.get("auto_scan", True) and time.time() - last_auto >= every:
                async with lock:
                    out = await service.auto_scan()
                last_auto = time.time()
                if out.get("ran"):
                    log.info("edgeos: búsqueda automática %s en %s → %s (%s avisos)", out.get("scan_id"),
                             ", ".join(out.get("sports") or []) or "ninguna liga", out.get("headline"),
                             out.get("alerts"))
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning("edgeos: bucle de fondo: %s", e)
        await asyncio.sleep(CLOSING_EVERY_S)


def attach(app: FastAPI, *, prefix: str, password: str, service_factory: Callable[[], EdgeService],
           background: bool = True) -> bool:
    """Monta EDGE OS en ``app``. Sin contraseña no monta nada (404)."""
    if not password:
        log.info("edgeos: sin contraseña, no se monta")
        return False
    service = service_factory()
    spend_lock = asyncio.Lock()
    starter = _LoopStarter(service, spend_lock) if background else None
    app.include_router(build_router(prefix=prefix, password=password, service=service, on_request=starter,
                                    spend_lock=spend_lock))
    if starter is not None:
        # arranque normal si la versión de FastAPI lo admite; si no, con la primera petición
        add = getattr(app, "add_event_handler", None)
        if callable(add):
            async def _start() -> None:
                starter()

            async def _stop() -> None:
                starter.cancel()

            add("startup", _start)
            add("shutdown", _stop)
    log.info("edgeos montado en /%s (%s, %s)", prefix.strip("/"), type(service.feed).__name__,
             type(service.store).__name__)
    return True


def service_from_env() -> EdgeService:
    """Proveedor real si hay clave; almacén Mongo si hay URL. Si no, sintético y en memoria."""
    from .providers.mock import MockFeed
    from .providers.theoddsapi import TheOddsAPI
    from .store.memory import MemoryStore

    key = os.environ.get("THE_ODDS_API_KEY", "")
    feed = TheOddsAPI(key) if key else MockFeed()
    url = os.environ.get("MONGO_URL", "")
    store: Store
    if url and os.environ.get("EDGE_OS_STORE", "mongo") == "mongo":
        from .store.mongo import MongoStore
        store = MongoStore(url, os.environ.get("EDGE_OS_DB", "edge_os"))
    else:
        store = MemoryStore()
    return EdgeService(feed, store, Asset.load())
