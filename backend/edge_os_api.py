# -*- coding: utf-8 -*-
"""EDGE OS — panel privado montado dentro del backend de FlotaDSP.

AISLADO A PROPOSITO:
  * No importa nada de server.py ni toca `db` / `global_db` (gotcha 26).
  * Se activa solo si existe el secret EDGE_OS_PASSWORD. Sin el, `register()`
    no monta ninguna ruta: el path devuelve 404, no existe.
  * Vive bajo un path no adivinable (EDGE_OS_PATH).
  * Todo el computo va en threadpool; las cuotas se cachean para no quemar la
    cuota mensual del proveedor.

Rutas (P = EDGE_OS_PATH):
  GET  /{P}                       el panel (HTML autocontenido)
  GET  /{P}/health                {"ok": true, "odds": "real"|"mock"}
  POST /{P}/api/login             {password} -> {token, exp}
  GET  /{P}/api/sports            deportes activos del proveedor
  GET  /{P}/api/board             ?sport= : tablero tipo casa de apuestas
  GET  /{P}/api/top               ?scope=live|soon|today&sports=csv
  POST /{P}/api/check             {sport,home,away,side,odds,stake} -> veredicto
  GET  /{P}/api/football/*        modelo propio de futbol
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import time
import unicodedata
from datetime import datetime, timezone

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse

_log = logging.getLogger("edge_os")

_HERE = Path(__file__).resolve().parent
_PKG = _HERE / "edge_os"
_ASSETS = _PKG / "assets"
_CSV_DIR = _ASSETS / "football"

EDGE_OS_PASSWORD = os.environ.get("EDGE_OS_PASSWORD") or ""
EDGE_OS_PATH = (os.environ.get("EDGE_OS_PATH") or "panel-x7q2m9").strip("/")
_TOKEN_TTL = int(os.environ.get("EDGE_OS_TOKEN_TTL", "43200"))       # 12 h
_ODDS_TTL = int(os.environ.get("EDGE_OS_ODDS_TTL", "60"))            # cache cuotas
_SHARP = ["pinnacle", "betfair_ex_eu", "betfair_ex_uk", "marathonbet",
          "matchbook", "smarkets"]
_DEFAULT_SPORTS = [s for s in (os.environ.get("EDGE_OS_SPORTS") or "").split(",") if s]


# ── token propio (HMAC sobre la caducidad) ──────────────────────────────────
def _secret() -> bytes:
    return hashlib.sha256(b"edge_os|v1|" + EDGE_OS_PASSWORD.encode("utf-8")).digest()


def _edgeos_make_token() -> tuple[str, int]:
    exp = int(time.time()) + _TOKEN_TTL
    mac = hmac.new(_secret(), str(exp).encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{mac}", exp


def _edgeos_check_token(tok: str) -> bool:
    try:
        exp_s, mac = tok.split(".", 1)
        exp = int(exp_s)
    except (ValueError, AttributeError):
        return False
    if exp < time.time():
        return False
    good = hmac.new(_secret(), exp_s.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac, good)


_fails: dict[str, list] = {}
_LOCK_AFTER, _LOCK_SECS = 6, 300


def _edgeos_locked(ip: str) -> bool:
    rec = _fails.get(ip)
    return bool(rec and rec[0] >= _LOCK_AFTER and time.time() < rec[1])


def _edgeos_note_fail(ip: str) -> None:
    rec = _fails.setdefault(ip, [0, 0.0])
    rec[0] += 1
    if rec[0] >= _LOCK_AFTER:
        rec[1] = time.time() + _LOCK_SECS


async def _require_token(authorization: str = Header(default="")) -> bool:
    tok = authorization[7:] if authorization.lower().startswith("bearer ") else ""
    if not tok or not _edgeos_check_token(tok):
        raise HTTPException(status_code=401, detail="sesion no valida")
    return True


# ── proveedor de cuotas + cache (protege la cuota mensual) ──────────────────
def _real_odds() -> bool:
    return bool(os.environ.get("THE_ODDS_API_KEY"))


def _provider(sport: str):
    from edge_os.config import Config
    from edge_os.providers import build_provider
    return build_provider(Config({
        "provider": "the-odds-api" if _real_odds() else "mock",
        "sport": sport, "markets": ["h2h"], "regions": _REGIONS,
    }))


# UNA sola region = 1 credito por llamada. Con "eu,uk" eran 2 y la cuota
# mensual se iba al doble de rapido; en `eu` ya estan Pinnacle, Betfair
# exchange y Marathonbet, que son las que mandan en el consenso.
_REGIONS = [r for r in (os.environ.get("EDGE_OS_REGIONS") or "eu").split(",") if r]

_odds_cache: dict[str, tuple] = {}        # sport -> (quotes, at, remaining)
_events_cache: dict[str, tuple] = {}      # sport -> (events, at)
_EVENTS_TTL = 120


def _fetch_sport(sport: str) -> tuple[list, Optional[str], bool]:
    """(quotes, peticiones_restantes, venia_de_cache). Cachea `_ODDS_TTL` s.
    CUESTA CREDITOS: una por region."""
    hit = _odds_cache.get(sport)
    now = time.time()
    if hit and now - hit[1] < _ODDS_TTL:
        return hit[0], hit[2], True
    prov = _provider(sport)
    quotes = prov.fetch(sport, ["h2h"], _REGIONS)
    rem = getattr(prov, "last_remaining", None)
    _odds_cache[sport] = (quotes, now, rem)
    return quotes, rem, False


def _fetch_events(sport: str) -> list[dict]:
    """Eventos SIN cuotas. GRATIS (x-requests-last: 0). Es lo que permite
    barrer los 75 deportes y gastar credito solo donde hay algo jugandose."""
    hit = _events_cache.get(sport)
    now = time.time()
    if hit and now - hit[1] < _EVENTS_TTL:
        return hit[0]
    try:
        ev = _provider(sport).list_events(sport)
    except Exception:                                        # noqa: BLE001
        ev = []
    _events_cache[sport] = (ev, now)
    return ev


def _pulse(keys: list[str], soon_min: float = 180.0) -> dict:
    """Barrido gratuito: cuantos eventos hay en vivo / a punto, por deporte."""
    from concurrent.futures import ThreadPoolExecutor
    now = datetime.now(timezone.utc)

    def one(k):
        live = soon = 0
        evs = _fetch_events(k)
        for e in evs:
            ct = e.get("commence_time")
            if not ct:
                continue
            try:
                t = datetime.fromisoformat(ct.replace("Z", "+00:00"))
            except ValueError:
                continue
            mins = (t - now).total_seconds() / 60.0
            if mins <= 0:
                live += 1
            elif mins <= soon_min:
                soon += 1
        return {"sport": k, "live": live, "soon": soon, "n": len(evs)}

    with ThreadPoolExecutor(max_workers=12) as ex:
        rows = list(ex.map(one, keys))
    n_events = sum(r["n"] for r in rows)
    return {"sports": [r for r in rows if r["live"] or r["soon"]],
            "n_scanned": len(keys),
            "n_events": n_events,
            # "no hay nada" y "no veo nada" se parecen en pantalla y no son lo
            # mismo. Si el barrido no devuelve NI UN evento —ni siquiera los de
            # dentro de tres dias— es que esta ciego, no que el catalogo este
            # vacio: ningun proveedor tiene cero partidos proximos en todos sus
            # deportes a la vez.
            "blind": bool(keys) and n_events == 0,
            "total_live": sum(r["live"] for r in rows),
            "total_soon": sum(r["soon"] for r in rows)}


# ── ensemble de futbol (cache 6 h) ──────────────────────────────────────────
_ens_cache: dict[str, tuple] = {}
_ens_lock = None
_ENS_TTL = 6 * 3600


def _csv_paths(league: str) -> list[str]:
    return sorted(str(p) for p in _CSV_DIR.glob(f"{league}*.csv"))


def _leagues_available() -> list[str]:
    return sorted({p.name.split("_")[0] for p in _CSV_DIR.glob("*.csv")})


async def _get_ensemble(league: str):
    global _ens_lock
    if _ens_lock is None:
        _ens_lock = asyncio.Lock()
    now = time.time()
    hit = _ens_cache.get(league)
    if hit and now - hit[2] < _ENS_TTL:
        return hit[0], hit[1]
    async with _ens_lock:
        hit = _ens_cache.get(league)
        if hit and now - hit[2] < _ENS_TTL:
            return hit[0], hit[1]

        def _build():
            from edge_os.modeling.football import build_football_ensemble
            return build_football_ensemble(
                csv_paths=_csv_paths(league) or None, half_life_days=180.0,
                include_market=False, synthetic_if_empty=True)

        ens, meta = await asyncio.to_thread(_build)
        _ens_cache[league] = (ens, meta, now)
        return ens, meta


def _verdict_file(league: str) -> Optional[dict]:
    f = _ASSETS / f"backtest_verdict_{league}.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return None
    return None


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return " ".join(s.replace(".", " ").replace("-", " ").split())


# ── router ─────────────────────────────────────────────────────────────────
router = APIRouter(tags=["edge_os"])
_P = f"/{EDGE_OS_PATH}"


@router.get(_P, response_class=HTMLResponse)
async def _edgeos_index() -> HTMLResponse:
    return HTMLResponse(_PAGE.replace("__BASE__", _P))


@router.get(_P + "/health")
async def _edgeos_health() -> dict:
    return {"ok": True, "service": "edge_os",
            "odds": "real" if _real_odds() else "mock"}


@router.post(_P + "/api/login")
async def _edgeos_login(payload: dict = Body(...),
                        x_forwarded_for: str = Header(default="")) -> JSONResponse:
    ip = (x_forwarded_for.split(",")[0].strip() or "?")[:64]
    if _edgeos_locked(ip):
        raise HTTPException(status_code=429, detail="demasiados intentos, espera unos minutos")
    if not EDGE_OS_PASSWORD or not hmac.compare_digest(
            str(payload.get("password") or ""), EDGE_OS_PASSWORD):
        _edgeos_note_fail(ip)
        await asyncio.sleep(0.8)
        raise HTTPException(status_code=401, detail="clave incorrecta")
    _fails.pop(ip, None)
    tok, exp = _edgeos_make_token()
    return JSONResponse({"token": tok, "exp": exp})


# ── deportes ───────────────────────────────────────────────────────────────
_sports_cache: list = []
_sports_at = 0.0


async def _sports() -> list:
    global _sports_cache, _sports_at
    now = time.time()
    if not _sports_cache or now - _sports_at > 3600:
        def _run():
            return _provider("upcoming").list_sports()
        try:
            raw = await asyncio.to_thread(_run)
        except Exception as e:                                 # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"proveedor: {e}")
        sfx = "" if _real_odds() else " (MOCK)"
        _sports_cache = [{"key": s["key"], "title": s.get("title", s["key"]) + sfx,
                          "group": s.get("group", "")}
                         for s in raw if s.get("active")
                         and not s.get("has_outrights")]
        _sports_at = now
    return _sports_cache


@router.get(_P + "/api/sports")
async def _edgeos_sports(_=Depends(_require_token)) -> dict:
    sp = await _sports()
    defaults = _DEFAULT_SPORTS or [s["key"] for s in sp[:6]]
    return {"real": _real_odds(), "sports": sp, "defaults": defaults}


def _titles() -> dict:
    return {s["key"]: s["title"] for s in _sports_cache}


# ── tablero ────────────────────────────────────────────────────────────────
@router.get(_P + "/api/board")
async def _edgeos_board(sport: str = Query(...),
                        _=Depends(_require_token)) -> dict:
    await _sports()

    def _run():
        from edge_os.board import build_board
        from edge_os.engine import group_into_books
        try:
            quotes, rem, cached = _fetch_sport(sport)
        except Exception as e:                                 # noqa: BLE001
            return {"error": f"no pude bajar cuotas: {e}"}
        books = [b for b in group_into_books(quotes) if b.market == "h2h"]
        events = build_board(books, sharp_books=_SHARP, sport_titles=_titles())
        return {"sport": sport, "events": events, "n_events": len(books),
                "remaining": rem, "cached": cached, "mock": not _real_odds()}

    return await asyncio.to_thread(_run)


# ── "no dejes escapar esto" ────────────────────────────────────────────────
_SCOPES = {"live": None, "soon": 180.0, "today": 1440.0}


@router.get(_P + "/api/pulse")
async def _edgeos_pulse(_=Depends(_require_token)) -> dict:
    """Que hay vivo AHORA en todo el catalogo. Cuesta 0 creditos."""
    sp = await _sports()
    keys = [s["key"] for s in sp]
    out = await asyncio.to_thread(_pulse, keys)
    titles = _titles()
    for r in out["sports"]:
        r["title"] = titles.get(r["sport"], r["sport"])
    out["sports"].sort(key=lambda r: (-r["live"], -r["soon"]))
    out["mock"] = not _real_odds()
    out["free"] = True
    return out


@router.get(_P + "/api/top")
async def _edgeos_top(scope: str = Query("live"),
                      sports: str = Query(""),
                      max_fetch: int = Query(5),
                      _=Depends(_require_token)) -> dict:
    """Lo mejor que hay ahora mismo.

    Primero barre GRATIS que deportes tienen algo en la ventana pedida, y solo
    entonces paga las cuotas de esos (hasta `max_fetch`). Asi un escaneo de
    todo el catalogo cuesta 0-5 creditos en vez de 75.
    """
    if scope not in _SCOPES:
        raise HTTPException(status_code=400, detail="scope: live | soon | today")
    sp = await _sports()
    pedidos = [k.strip() for k in sports.split(",") if k.strip()]
    universo = pedidos or [s["key"] for s in sp]
    soon_min = _SCOPES[scope] or 180.0

    pulso = await asyncio.to_thread(_pulse, universo, soon_min)
    if scope == "live":
        con_algo = [r["sport"] for r in pulso["sports"] if r["live"]]
    else:
        con_algo = [r["sport"] for r in pulso["sports"] if r["live"] or r["soon"]]
    tope = max(1, min(max_fetch, 10))
    # Barrido ciego: se paga por los deportes de siempre en vez de contestar
    # "no hay nada", que seria dar por buena una respuesta que no se ha mirado.
    if pulso.get("blind"):
        keys = (pedidos or _DEFAULT_SPORTS or universo)[:tope]
    else:
        keys = con_algo[:tope]

    def _run():
        from edge_os.board import build_board, top_opportunities
        from edge_os.engine import group_into_books
        all_events, rem, errs, n_raw = [], None, [], 0
        for k in keys:
            try:
                quotes, r, _c = _fetch_sport(k)
            except Exception as e:                             # noqa: BLE001
                errs.append(f"{k}: {e}")
                continue
            rem = r if r is not None else rem
            books = [b for b in group_into_books(quotes) if b.market == "h2h"]
            n_raw += len(books)
            all_events += build_board(books, sharp_books=_SHARP,
                                      sport_titles=_titles())
        limit = _SCOPES[scope]
        if scope == "live":
            sel = [e for e in all_events if e["live"]]
        else:
            sel = [e for e in all_events
                   if e["live"] or (e["starts_in_min"] is not None
                                    and 0 <= e["starts_in_min"] <= limit)]
        return {
            "scope": scope, "sports": keys, "picks": top_opportunities(sel),
            "events": sorted(sel, key=lambda e: (not e["live"],
                                                 e["starts_in_min"] or 0)),
            "n_scanned": n_raw, "n_in_scope": len(sel),
            "pulse": {"scanned": pulso["n_scanned"], "live": pulso["total_live"],
                      "soon": pulso["total_soon"], "events": pulso["n_events"],
                      "blind": pulso.get("blind", False),
                      "with_action": len(con_algo)},
            "remaining": rem, "errors": errs, "mock": not _real_odds(),
        }

    return await asyncio.to_thread(_run)


# ── ¿merece la pena esta cuota? ────────────────────────────────────────────
@router.post(_P + "/api/check")
async def _edgeos_check(payload: dict = Body(...),
                        _=Depends(_require_token)) -> dict:
    sport = str(payload.get("sport") or "")
    home = str(payload.get("home") or "").strip()
    away = str(payload.get("away") or "").strip()
    side = str(payload.get("side") or "").strip().lower()
    try:
        odds = float(payload.get("odds"))
        stake = float(payload.get("stake") or 100)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="cuota o importe no validos")
    if odds <= 1.0:
        raise HTTPException(status_code=400, detail="la cuota debe ser > 1.0")
    side = {"local": "home", "empate": "draw", "visitante": "away"}.get(side, side)
    if side not in ("home", "draw", "away"):
        raise HTTPException(status_code=400, detail="elige local / empate / visitante")

    def _fetch():
        from edge_os.engine import group_into_books
        try:
            quotes, rem, _c = _fetch_sport(sport)
        except Exception as e:                                 # noqa: BLE001
            return {"error": f"no pude bajar cuotas: {e}"}
        books = [b for b in group_into_books(quotes) if b.market == "h2h"]
        nh, na = _norm(home), _norm(away)
        cand = [b for b in books
                if (not nh or nh in _norm(b.home) or _norm(b.home) in nh)
                and (not na or na in _norm(b.away) or _norm(b.away) in na)]
        if len(cand) != 1:
            return {"error": ("no encuentro ese partido" if not cand
                              else "varios encajan, se mas concreto"),
                    "disponibles": sorted(f"{b.home} vs {b.away}" for b in
                                          (cand or books))[:40]}
        mb = cand[0]
        bp: dict[str, dict[str, float]] = {}
        for oc in mb.outcomes:
            for bk, pr in oc.prices.items():
                bp.setdefault(bk, {})[oc.outcome] = pr
        return {"home": mb.home, "away": mb.away, "book_prices": bp,
                "outcomes": [oc.outcome for oc in mb.outcomes], "remaining": rem}

    got = await asyncio.to_thread(_fetch)
    if "error" in got:
        return got
    target = {"home": got["home"], "away": got["away"], "draw": "Draw"}[side]
    if target not in got["outcomes"]:
        return {"error": f"ese mercado no tiene '{side}'", "resultados": got["outcomes"]}

    model_probs, trust = None, 0.0
    if sport.startswith("soccer"):
        try:
            from edge_os.modeling.entities import resolve_pair
            for lg in _leagues_available():
                ens, meta = await _get_ensemble(lg)
                rh, ra = resolve_pair(got["home"], got["away"], set(meta.get("teams", [])))
                if rh and ra:
                    fc = await asyncio.to_thread(ens.predict, rh, ra)
                    if fc:
                        model_probs = {got["home"]: fc.p_home, "Draw": fc.p_draw,
                                       got["away"]: fc.p_away}
                        trust = 0.15
                    break
        except Exception:                                     # noqa: BLE001
            model_probs, trust = None, 0.0

    from edge_os.quant.betcheck import evaluate_bet
    res = evaluate_bet(book_prices=got["book_prices"], outcomes=got["outcomes"],
                       target=target, taken_odds=odds, stake=stake,
                       sharp_books=_SHARP, model_probs=model_probs,
                       model_trust=trust)
    res.update(match=f"{got['home']} vs {got['away']}", sport=sport, side=side,
               mock=not _real_odds(), remaining=got.get("remaining"))
    return res


# ── futbol (modelo propio) ─────────────────────────────────────────────────
@router.get(_P + "/api/football/leagues")
async def _edgeos_leagues(_=Depends(_require_token)) -> dict:
    names = {"SP1": "La Liga", "E0": "Premier League", "SYNTH": "Liga sintetica"}
    return {"leagues": [{"code": c, "name": names.get(c, c)}
                        for c in _leagues_available()]}


@router.get(_P + "/api/football/table")
async def _edgeos_table(league: str = Query("SP1"),
                        _=Depends(_require_token)) -> dict:
    ens, meta = await _get_ensemble(league)
    dc = ens._members.get("dixon_coles")
    elo = ens._members.get("elo")
    rows = [{
        "team": t,
        "strength": round(dc.attack_.get(t, 0.0) + dc.defense_.get(t, 0.0), 3),
        "atk": round(dc.attack_.get(t, 0.0), 3),
        "dfn": round(dc.defense_.get(t, 0.0), 3),
        "elo": round(getattr(elo, "ratings_", {}).get(t, 0.0), 1),
    } for t in sorted(getattr(dc, "teams_", []))]
    rows.sort(key=lambda r: r["strength"], reverse=True)
    return {"league": league, "source": meta.get("source"),
            "simulated": bool(meta.get("simulated")),
            "n_matches": meta.get("n_matches"),
            "home_adv": round(getattr(dc, "home_adv_", 0.0), 3),
            "teams": rows, "verdict": _verdict_file(league)}


@router.post(_P + "/api/football/predict")
async def _edgeos_predict(payload: dict = Body(...),
                          _=Depends(_require_token)) -> dict:
    league = str(payload.get("league") or "SP1")
    home = str(payload.get("home") or "").strip()
    away = str(payload.get("away") or "").strip()
    if not home or not away:
        raise HTTPException(status_code=400, detail="faltan equipos")
    ens, meta = await _get_ensemble(league)
    from edge_os.modeling.entities import resolve_pair
    rh, ra = resolve_pair(home, away, set(meta.get("teams", [])))
    if rh is None or ra is None:
        raise HTTPException(status_code=404, detail="equipo no reconocido: "
                            + (home if rh is None else away))
    fc = await asyncio.to_thread(ens.predict, rh, ra)
    if fc is None:
        raise HTTPException(status_code=500, detail="el ensemble no pudo predecir")
    dcm = ens._members.get("dixon_coles")
    mk = dcm.predict(rh, ra).markets if dcm else None
    out = {"league": league, "home": rh, "away": ra,
           "p_home": round(fc.p_home, 4), "p_draw": round(fc.p_draw, 4),
           "p_away": round(fc.p_away, 4),
           "fair_home": round(1 / fc.p_home, 2),
           "fair_draw": round(1 / fc.p_draw, 2),
           "fair_away": round(1 / fc.p_away, 2),
           "model_agreement": fc.model_agreement,
           "members": {k: [round(x, 3) for x in v] for k, v in fc.members.items()},
           "verdict": _verdict_file(league)}
    if mk is not None:
        out["over_2_5"] = round(mk.over.get(2.5, 0.0), 4)
        out["btts_yes"] = round(mk.btts_yes, 4)
    return out


# ── registro ───────────────────────────────────────────────────────────────
def register(app) -> None:
    if not EDGE_OS_PASSWORD:
        _log.info("edge_os desactivado (sin EDGE_OS_PASSWORD)")
        return
    app.include_router(router)
    _log.info("edge_os montado en /%s", EDGE_OS_PATH)


_PAGE = r"""<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>EDGE OS</title>
<style>
:root{--bg:#07090d;--card:#111620;--card2:#0c1017;--line:#1e2734;--fg:#eaeef5;
 --dim:#77839a;--accent:#4d9fff;--val:#31c25d;--just:#5b6a82;--flo:#d29a2b;
 --mal:#e8544b;--dud:#9b6cf0;--live:#ff4d4d}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
 font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1150px;margin:0 auto;padding:14px}
header{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
 padding-bottom:10px;border-bottom:1px solid var(--line);margin-bottom:14px}
h1{font-size:16px;letter-spacing:1.4px;margin:0;font-weight:800}
.pill{font-size:11px;padding:3px 9px;border-radius:999px;background:#131a26;
 color:var(--dim);border:1px solid var(--line);white-space:nowrap}
.pill.ok{color:var(--val);border-color:#17381f}
.pill.warn{color:var(--flo);border-color:#3b2f15}
.pill.bad{color:var(--mal);border-color:#40191c}
#aviso{background:#241a0c;border:1px solid #3b2f15;color:var(--flo);
 border-radius:10px;padding:10px 12px;font-size:12.5px;margin-bottom:10px}
.grow{flex:1}
button{font:inherit;color:#04121f;background:var(--accent);border:0;
 border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
button.g{background:#0e131c;color:var(--dim);border:1px solid var(--line);font-weight:600}
button.g.on{background:#16263a;color:#cfe6ff;border-color:#2f5a8c}
button:disabled{opacity:.45;cursor:default}
input,select{font:inherit;color:var(--fg);background:#0b0f16;
 border:1px solid var(--line);border-radius:8px;padding:8px 10px}
label{display:block;color:var(--dim);font-size:11px;margin:0 0 4px;
 letter-spacing:.4px;text-transform:uppercase}
.muted{color:var(--dim);font-size:12px}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;
 padding:14px;margin-bottom:12px}
.empty{padding:34px 16px;text-align:center;color:var(--dim)}
/* la mejor */
.hero{border:1px solid #1f5e35;border-radius:14px;padding:0;overflow:hidden;
 background:linear-gradient(180deg,#0d2318,#0b1018);margin-bottom:14px}
.hero.arb{border-color:#2f5a8c;background:linear-gradient(180deg,#0d1b2c,#0b1018)}
.hero-top{display:flex;justify-content:space-between;align-items:center;gap:8px;
 padding:10px 16px;background:rgba(255,255,255,.03);flex-wrap:wrap}
.hero-b{padding:16px}
.tagx{font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px;
 background:#123422;color:#3fd166;letter-spacing:.5px}
.tagx.a{background:#122a44;color:#79b4ff}
.tagx.live{background:#3a1113;color:#ff6b6b}
.pickline{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:6px 0 2px}
.pickname{font-size:24px;font-weight:800;letter-spacing:-.3px}
.pickodds{font-size:30px;font-weight:800;color:var(--val);letter-spacing:-1px}
.nums{display:flex;gap:22px;flex-wrap:wrap;margin:12px 0 6px}
.nums div span{display:block;font-size:10.5px;color:var(--dim);
 text-transform:uppercase;letter-spacing:.4px}
.nums div b{font-size:17px}
.why{margin:10px 0 0;padding-left:17px;color:#b7c3d6;font-size:12.5px}
.why li{margin:3px 0}
.vs{margin-top:12px;padding:10px 12px;border-radius:9px;background:#0b1220;
 border:1px solid #24405f;font-size:12.5px;color:#cfe0f5}
.vs b{color:#fff}
/* tablero */
.ev{border:1px solid var(--line);border-radius:11px;margin-bottom:8px;
 background:var(--card2);overflow:hidden}
.ev-h{display:flex;justify-content:space-between;align-items:center;gap:10px;
 padding:9px 12px;cursor:pointer}
.ev-h:hover{background:#121926}
.ev-t{font-weight:700;font-size:13.5px}
.tiles{display:grid;gap:7px;padding:0 12px 11px;
 grid-template-columns:repeat(auto-fit,minmax(142px,1fr))}
.tile{border:1px solid var(--line);border-radius:9px;padding:8px 10px;
 background:#0b0f16;display:flex;flex-direction:column;gap:1px}
.tile .n{font-size:11.5px;color:var(--dim);white-space:nowrap;overflow:hidden;
 text-overflow:ellipsis}
.tile .o{font-size:19px;font-weight:800;letter-spacing:-.4px}
.tile .b{font-size:10.5px;color:var(--dim)}
.tile .l{font-size:10px;font-weight:800;letter-spacing:.5px;margin-top:2px}
.t-VALOR{border-color:#1f5e35;background:#0c1c13}.t-VALOR .l{color:var(--val)}
.t-JUSTA .l{color:var(--just)}
.t-FLOJA .l{color:var(--flo)}
.t-NI_LOCOS{border-color:#4a221f}.t-NI_LOCOS .l{color:var(--mal)}
.t-DUDOSA .l{color:var(--dud)}
.det{padding:0 12px 12px;font-size:12px}
.det table{width:100%;border-collapse:collapse}
.det td,.det th{padding:3px 6px;border-bottom:1px solid var(--line);text-align:left}
.det th{color:var(--dim);font-weight:600}
.tabs{display:flex;gap:6px;margin:16px 0 10px;flex-wrap:wrap}
.sec{display:none}.sec.on{display:block}
</style></head><body><div class="wrap">

<header>
  <h1>EDGE&nbsp;OS</h1>
  <span class="pill" id="p-odds">…</span>
  <span class="pill" id="p-cred"></span>
  <span class="grow"></span>
  <button class="g" id="b-auto">⟳ auto</button>
</header>

<div id="login" class="card" style="max-width:330px">
  <label>Clave</label>
  <div class="bar"><input id="pw" type="password" style="flex:1">
  <button id="go">Entrar</button></div>
  <div id="lerr" style="color:var(--mal);font-size:12px"></div>
</div>

<div id="app" style="display:none">

<div class="tabs">
  <button class="g on" data-s="vivo">En directo</button>
  <button class="g" data-s="check">¿Merece la pena?</button>
  <button class="g" data-s="fut">Fútbol</button>
</div>

<!-- ═══ EN DIRECTO ═══ -->
<section id="s-vivo" class="sec on">
  <div class="bar">
    <button class="g on" data-sc="live">🔴 En vivo</button>
    <button class="g" data-sc="soon">Próximas 3 h</button>
    <button class="g" data-sc="today">Hoy</button>
    <span class="grow"></span>
    <label style="margin:0;text-transform:none">Bote €</label>
    <input id="bank" type="number" value="1000" style="width:96px">
    <button id="scan">Buscar</button>
  </div>
  <div class="muted" id="pulse" style="margin-bottom:10px"></div>
  <div id="aviso" style="display:none"></div>
  <div id="hero"></div>
  <div id="board"></div>
</section>

<!-- ═══ ¿MERECE LA PENA? ═══ -->
<section id="s-check" class="sec">
  <div class="card">
    <div class="bar">
      <div style="flex:1;min-width:170px"><label>Deporte</label><select id="c-sport"></select></div>
      <div style="flex:1;min-width:120px"><label>Local</label><input id="c-home" style="width:100%"></div>
      <div style="flex:1;min-width:120px"><label>Visitante</label><input id="c-away" style="width:100%"></div>
    </div>
    <div class="bar">
      <div><label>A quién</label><select id="c-side">
        <option value="home">Gana local</option><option value="draw">Empate</option>
        <option value="away">Gana visitante</option></select></div>
      <div><label>Cuota</label><input id="c-odds" type="number" step="0.01" style="width:92px"></div>
      <div><label>Importe €</label><input id="c-stake" type="number" value="100" style="width:92px"></div>
      <button id="c-go">Comprobar</button>
    </div>
    <div id="c-out" style="margin-top:10px"></div>
  </div>
</section>

<!-- ═══ FÚTBOL ═══ -->
<section id="s-fut" class="sec">
  <div class="card">
    <div class="bar">
      <div><label>Liga</label><select id="f-liga"></select></div>
      <div><label>Local</label><input id="f-home"></div>
      <div><label>Visitante</label><input id="f-away"></div>
      <button id="f-go">Predecir</button>
    </div>
    <div id="f-out" style="margin-top:10px"></div>
  </div>
</section>

</div>

<script>
const BASE="__BASE__";
let TOKEN=sessionStorage.getItem("edgeos_tok")||"";
let SCOPE="live", AUTO=null, LAST=null;
const CRED_AVISO=120, CRED_MIN=40;   // consultas del plan mensual que quedan
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pc=x=>(x*100).toFixed(1)+"%";
const sg=x=>(x>=0?"+":"")+(x*100).toFixed(1)+"%";
const LBL={VALOR:"VALOR",JUSTA:"PRECIO JUSTO",FLOJA:"FLOJA",NI_LOCOS:"NI LOCOS",DUDOSA:"NO ME FÍO"};

async function api(p,o){o=o||{};o.headers=Object.assign({"content-type":"application/json"},o.headers||{});
 if(TOKEN)o.headers.authorization="Bearer "+TOKEN;
 const r=await fetch(BASE+p,o);
 if(r.status===401){salir();throw new Error("sesión caducada, entra otra vez");}
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j.detail||("error "+r.status));return j;}
function salir(){TOKEN="";sessionStorage.removeItem("edgeos_tok");
 $("#app").style.display="none";$("#login").style.display="";}

$("#go").onclick=async()=>{$("#lerr").textContent="";
 try{const j=await api("/api/login",{method:"POST",body:JSON.stringify({password:$("#pw").value})});
  TOKEN=j.token;sessionStorage.setItem("edgeos_tok",TOKEN);arrancar();}
 catch(e){$("#lerr").textContent=e.message;}};
$("#pw").addEventListener("keydown",e=>{if(e.key==="Enter")$("#go").click();});

document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{
 document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("on",x===b));
 ["vivo","check","fut"].forEach(s=>$("#s-"+s).classList.toggle("on",b.dataset.s===s));});
document.querySelectorAll("[data-sc]").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("[data-sc]").forEach(x=>x.classList.toggle("on",x===b));
 SCOPE=b.dataset.sc;buscar();});
function autoOff(){if(AUTO)clearInterval(AUTO);AUTO=null;
 $("#b-auto").classList.remove("on");$("#b-auto").textContent="⟳ auto";}
$("#b-auto").onclick=()=>{
 if(AUTO){autoOff();}
 else{$("#aviso").style.display="none";
  AUTO=setInterval(buscar,60000);$("#b-auto").classList.add("on");$("#b-auto").textContent="⟳ auto 60s";buscar();}};
$("#scan").onclick=buscar;
$("#bank").onchange=()=>{if(LAST)pintar(LAST);};

async function arrancar(){
 $("#login").style.display="none";$("#app").style.display="";
 try{const h=await fetch(BASE+"/health").then(r=>r.json());
  $("#p-odds").textContent=h.odds==="real"?"cuotas reales":"MOCK";
  $("#p-odds").className="pill "+(h.odds==="real"?"ok":"warn");}catch(e){}
 try{const j=await api("/api/sports");
  $("#c-sport").innerHTML=j.sports.map(s=>`<option value="${esc(s.key)}">${esc(s.title)}</option>`).join("");}catch(e){}
 try{const j=await api("/api/football/leagues");
  $("#f-liga").innerHTML=j.leagues.map(l=>`<option value="${l.code}">${esc(l.name)}</option>`).join("");}catch(e){}
 buscar();
}

async function buscar(){
 const hero=$("#hero"),board=$("#board");
 if(!LAST){hero.innerHTML='<div class="card empty">buscando…</div>';board.innerHTML="";}
 try{
  const j=await api("/api/top?scope="+SCOPE+"&max_fetch=5");
  LAST=j;pintar(j);
 }catch(e){hero.innerHTML=`<div class="card" style="color:var(--mal)">${esc(e.message)}</div>`;}
}

function pintar(j){
 // El plan del proveedor es mensual y cada barrido con accion cuesta varios
 // creditos. Con el auto encendido se agota en un par de horas, y agotado el
 // panel se queda vacio: exactamente igual que si no hubiera nada. Se apaga
 // solo antes de llegar ahi y se dice por que.
 if(j.remaining!=null){
  const q=parseInt(j.remaining,10);
  $("#p-cred").textContent="quedan "+j.remaining;
  $("#p-cred").className="pill "+(isNaN(q)?"":q<=CRED_MIN?"bad":q<=CRED_AVISO?"warn":"ok");
  if(!isNaN(q)&&q<=CRED_MIN&&AUTO){autoOff();
   $("#aviso").innerHTML=`<b>He apagado la actualización automática</b>: quedan ${q} consultas `+
    `del plan mensual y cada barrido gasta varias. Dale a <b>Buscar</b> cuando quieras mirar.`;
   $("#aviso").style.display="";}
 }
 const pu=j.pulse||{};
 $("#pulse").innerHTML=(pu.blind
   ? `<b style="color:var(--flo)">El barrido no ve nada</b>: el proveedor no devolvió ni un partido `+
     `en ${pu.scanned||0} deportes, así que no me fío y pido cuotas directamente`
   : `Barrido <b>gratis</b> de ${pu.scanned||0} deportes: `+
     `<b style="color:var(--live)">${pu.live||0}</b> en vivo · ${pu.soon||0} en 3 h`)+
  ` · cuotas pedidas de ${(j.sports||[]).length} (${j.n_scanned||0} partidos)`+
  (j.mock?' · <b style="color:var(--flo)">MOCK: no vale</b>':"")+
  ((j.errors||[]).length?" · "+esc(j.errors.join("; ")):"");

 const bank=parseFloat($("#bank").value)||1000;
 const picks=j.picks||[];
 // "no hay nada" y "no he podido mirar" se leen igual, y solo uno es verdad.
 const ciego=(j.errors||[]).length>0 && !j.n_scanned;
 $("#hero").innerHTML = picks.length? picks.map((p,k)=>heroCard(p,bank,k===0)).join("")
  : ciego? `<div class="card" style="border-color:var(--mal)">
     <b style="color:var(--mal)">No he podido mirar el mercado.</b><br>
     <span style="font-size:12px">Esto <u>no</u> quiere decir que no haya nada: quiere decir que no lo sé.
     ${esc((j.errors||[]).join("; "))}</span></div>`
  : `<div class="card empty"><b>Nada que merezca la pena ahora mismo.</b><br>
     <span style="font-size:12px">Y eso es lo normal: casi todos los precios están bien puestos.
     Solo sale algo cuando una casa se queda por detrás del dinero listo
     <u>y</u> la cuota está en la franja donde el dato es fiable (1.40–3.20).</span></div>`;

 const evs=j.events||[];
 $("#board").innerHTML = evs.length? `<div class="muted" style="margin:14px 0 8px">
   TODOS LOS PARTIDOS (${evs.length}) — cada cuota con su veredicto</div>`+
   evs.map((e,i)=>evCard(e,i)).join("") : "";
}

function heroCard(p,bank,big){
 const arb=p.kind==="ARBITRAJE";
 const stake=p.kelly_pct?(bank*p.kelly_pct/100):null;
 const legs=arb&&p.arb?`<table style="width:100%;margin-top:10px;font-size:12.5px">${
   p.arb.legs.map(l=>`<tr><td>${esc(l.outcome)}</td><td class="muted">${esc(l.book)}</td>
   <td><b>${l.odds}</b></td><td>${(bank*l.stake_pct/100).toFixed(0)} €</td></tr>`).join("")}</table>`:"";
 const vs=p.compare?`<div class="vs">⚖ ${esc(p.compare.texto)}</div>`:"";
 return `<div class="hero${arb?" arb":""}">
  <div class="hero-top">
    <div><span class="tagx ${arb?"a":""}">${arb?"ARBITRAJE":(big?"LA MEJOR AHORA":"VALOR")}</span>
      ${p.live?'<span class="tagx live">EN VIVO</span>':""}
      <span class="muted">&nbsp;${esc(p.sport_title||p.sport)}</span></div>
    <span class="muted">${p.live?"jugándose":(p.starts_in_min!=null?"empieza en "+Math.round(p.starts_in_min)+" min":"")}</span>
  </div>
  <div class="hero-b">
    <div class="muted">${esc(p.match)}</div>
    <div class="pickline">
      <span class="pickname">${esc(p.outcome)}</span>
      ${p.odds?`<span class="pickodds">${p.odds}</span>
        <span class="muted">en <b style="color:var(--fg)">${esc(p.book)}</b></span>`:""}
    </div>
    <div class="nums">
      ${p.fair_odds?`<div><span>Cuota justa</span><b>${p.fair_odds}</b></div>`:""}
      <div><span>Ventaja</span><b style="color:var(--val)">${sg(p.ev)}</b></div>
      ${p.ev_z?`<div><span>Señal / ruido</span><b>${p.ev_z}×</b></div>`:""}
      ${stake?`<div><span>Meter</span><b>${stake.toFixed(0)} €</b></div>`:""}
      <div><span>Casas</span><b>${p.n_books}</b></div>
    </div>
    <ul class="why">${p.why.map(w=>"<li>"+esc(w)+"</li>").join("")}</ul>
    ${vs}${legs}
  </div></div>`;
}

function evCard(e,i){
 const cmp=(e.compare||[])[0];
 return `<div class="ev">
  <div class="ev-h" onclick="tog(${i})">
   <div><div class="ev-t">${esc(e.match)}</div>
    <div class="muted">${e.live?'<span style="color:var(--live)">● EN VIVO</span>':
      (e.starts_in_min!=null?"en "+Math.round(e.starts_in_min)+" min":"")}
      · ${esc(e.sport_title||e.sport)} · ${e.n_books} casas${
      e.trusted?"":' · <span style="color:var(--dud)">'+esc(e.trust_reason)+"</span>"}${
      e.arb?' · <span style="color:#79b4ff">ARB '+sg(e.arb.roi)+"</span>":""}</div></div>
   <span class="muted">detalle ▾</span></div>
  <div class="tiles">${e.outcomes.map(o=>`<div class="tile t-${o.tag}">
    <div class="n">${esc(o.name)}</div><div class="o">${o.best_odds}</div>
    <div class="b">${esc(o.best_book)}${o.fair_odds?" · justa "+o.fair_odds:""}</div>
    <div class="l">${LBL[o.tag]}${o.ev!=null&&o.tag!=="DUDOSA"?" "+sg(o.ev):""}</div></div>`).join("")}</div>
  ${cmp?`<div style="padding:0 12px 11px"><div class="vs">⚖ ${esc(cmp.texto)}</div></div>`:""}
  <div class="det" id="d${i}" style="display:none">${e.outcomes.map(o=>
    `<div style="margin-bottom:8px"><b>${esc(o.name)}</b>
     <span class="muted">— justa ${o.fair_odds} · error del EV ±${o.ev_noise!=null?(o.ev_noise*100).toFixed(1):"?"}%</span>
     <table><tr><th>Casa</th><th>Cuota</th><th>EV</th><th>Señal</th><th>Veredicto</th></tr>
     ${(o.books||[]).map(b=>`<tr><td>${esc(b.book)}</td><td>${b.odds}</td>
       <td>${sg(b.ev)}</td><td>${b.ev_z!=null?b.ev_z+"×":"—"}</td>
       <td style="color:var(--${b.tag==="VALOR"?"val":b.tag==="NI_LOCOS"?"mal":b.tag==="FLOJA"?"flo":b.tag==="DUDOSA"?"dud":"just"})">${LBL[b.tag]}</td></tr>`).join("")}
     </table></div>`).join("")}</div></div>`;
}
function tog(i){const d=$("#d"+i);d.style.display=d.style.display==="none"?"":"none";}

$("#c-go").onclick=async()=>{
 const out=$("#c-out");out.innerHTML='<span class="muted">comprobando…</span>';
 try{
  const j=await api("/api/check",{method:"POST",body:JSON.stringify({
    sport:$("#c-sport").value,home:$("#c-home").value,away:$("#c-away").value,
    side:$("#c-side").value,odds:$("#c-odds").value,stake:$("#c-stake").value})});
  if(j.error){out.innerHTML=`<span style="color:var(--mal)">${esc(j.error)}</span>`+
    ((j.disponibles||[]).length?'<div class="muted" style="margin-top:6px">Hay ahora: '+
      j.disponibles.map(esc).join(" · ")+"</div>":"");return;}
  const col=j.verdict==="VALOR_SIN_VALIDAR"?"var(--val)":j.verdict==="DUDOSO"?"var(--dud)":"var(--mal)";
  out.innerHTML=`<div style="font-size:15px;font-weight:800;color:${col}">${esc(j.title)}</div>
   <div class="muted">${esc(j.match)} — ${esc(j.target)}</div>
   <ul class="why">${j.reasons.map(r=>"<li>"+esc(r)+"</li>").join("")}</ul>
   <div class="muted" style="margin-top:8px">${esc(j.stake.msg)}</div>`;
 }catch(e){out.innerHTML=`<span style="color:var(--mal)">${esc(e.message)}</span>`;}
};

$("#f-go").onclick=async()=>{
 const out=$("#f-out");out.innerHTML='<span class="muted">calculando…</span>';
 try{const j=await api("/api/football/predict",{method:"POST",body:JSON.stringify({
   league:$("#f-liga").value,home:$("#f-home").value,away:$("#f-away").value})});
  out.innerHTML=`<div class="nums">
    <div><span>${esc(j.home)}</span><b>${pc(j.p_home)}</b></div>
    <div><span>Empate</span><b>${pc(j.p_draw)}</b></div>
    <div><span>${esc(j.away)}</span><b>${pc(j.p_away)}</b></div></div>
   <div class="muted">Justas ${j.fair_home} / ${j.fair_draw} / ${j.fair_away}
    · acuerdo modelos ${j.model_agreement}</div>
   <div class="vs" style="margin-top:10px">Este modelo, en backtest sobre La Liga,
    <b>no bate al mercado</b>. Segunda opinión, no fuente.</div>`;
 }catch(e){out.innerHTML=`<span style="color:var(--mal)">${esc(e.message)}</span>`;}
};

if(TOKEN)arrancar();
</script></div></body></html>"""
