# -*- coding: utf-8 -*-
"""EDGE OS — panel privado montado dentro del backend de FlotaDSP.

AISLADO A PROPOSITO:
  * No importa nada de server.py ni toca `db` / `global_db` (gotcha 26).
  * Se activa solo si existe el secret EDGE_OS_PASSWORD. Sin el, `register()`
    no monta ninguna ruta: el path devuelve 404, no existe.
  * Vive bajo un path no adivinable (EDGE_OS_PATH). "Oculto" = path raro + clave.
  * Todo el computo va en threadpool y se cachea; nada pesado en el event loop.

Rutas (con P = EDGE_OS_PATH):
  GET  /{P}                       -> el panel (login + UI, HTML autocontenido)
  GET  /{P}/health                -> {"ok": true}   (sin auth)
  POST /{P}/api/login             -> {password} -> {token, exp}
  GET  /{P}/api/sports            -> deportes que ofrece el proveedor
  POST /{P}/api/check             -> {sport,home,away,side,odds,stake} -> veredicto
  GET  /{P}/api/live              -> ?sport= : radar de oportunidades ahora mismo
  GET  /{P}/api/football/leagues  -> ligas con datos empaquetados
  GET  /{P}/api/football/table    -> ?league= : valoraciones de equipos
  POST /{P}/api/football/predict  -> {league,home,away} -> 1X2 + mercados
  GET  /{P}/api/football/backtest -> ?league= : veredicto walk-forward

Sin THE_ODDS_API_KEY las cuotas son de MENTIRA (mock) y el panel lo grita.
El veredicto mas favorable es "VALOR (sin validar)": el sistema NO promete ganar
y NO coloca apuestas. Una cuota 1.01 sale como "NO METER".
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
EDGE_OS_SPORT = os.environ.get("EDGE_OS_SPORT") or "soccer_spain_la_liga"
_TOKEN_TTL = int(os.environ.get("EDGE_OS_TOKEN_TTL", "43200"))       # 12 h
_SHARP = ["pinnacle", "betfair_ex_eu", "betfair_ex_uk", "marathonbet", "matchbook"]


# ── token propio (HMAC sobre la caducidad, clave derivada de la password) ────
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


# ── anti fuerza bruta (en memoria; el proceso es de larga vida) ─────────────
_fails: dict[str, list] = {}
_LOCK_AFTER = 6
_LOCK_SECS = 300


def _edgeos_locked(ip: str) -> bool:
    rec = _fails.get(ip)
    return bool(rec and rec[0] >= _LOCK_AFTER and time.time() < rec[1])


def _edgeos_note_fail(ip: str) -> None:
    rec = _fails.setdefault(ip, [0, 0.0])
    rec[0] += 1
    if rec[0] >= _LOCK_AFTER:
        rec[1] = time.time() + _LOCK_SECS


def _edgeos_note_ok(ip: str) -> None:
    _fails.pop(ip, None)


async def _require_token(authorization: str = Header(default="")) -> bool:
    tok = authorization[7:] if authorization.lower().startswith("bearer ") else ""
    if not tok or not _edgeos_check_token(tok):
        raise HTTPException(status_code=401, detail="sesion no valida")
    return True


# ── proveedor de cuotas (mock salvo THE_ODDS_API_KEY) ───────────────────────
def _make_cfg(sport: str):
    from edge_os.config import Config
    return Config({
        "provider": "the-odds-api" if os.environ.get("THE_ODDS_API_KEY") else "mock",
        "sport": sport, "markets": ["h2h"], "regions": ["eu", "uk"],
    })


def _provider(sport: str):
    from edge_os.providers import build_provider
    return build_provider(_make_cfg(sport))


# ── cache del ensemble de futbol por liga (rebuild cada 6 h) ────────────────
_ens_cache: dict[str, tuple] = {}
_ens_lock = None
_ENS_TTL = 6 * 3600


def _csv_paths(league: str) -> list[str]:
    return sorted(str(p) for p in _CSV_DIR.glob(f"{league}*.csv"))


def _leagues_available() -> list[str]:
    return sorted({p.name.split("_")[0] for p in _CSV_DIR.glob("*.csv")})


def _build_ensemble(league: str):
    from edge_os.modeling.football import build_football_ensemble
    return build_football_ensemble(
        csv_paths=_csv_paths(league) or None, half_life_days=180.0,
        include_market=False, synthetic_if_empty=True,
    )


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
        ens, meta = await asyncio.to_thread(_build_ensemble, league)
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
            "odds": "real" if os.environ.get("THE_ODDS_API_KEY") else "mock"}


@router.post(_P + "/api/login")
async def _edgeos_login(payload: dict = Body(...),
                        x_forwarded_for: str = Header(default="")) -> JSONResponse:
    ip = (x_forwarded_for.split(",")[0].strip() or "?")[:64]
    if _edgeos_locked(ip):
        raise HTTPException(status_code=429, detail="demasiados intentos, espera unos minutos")
    given = str(payload.get("password") or "")
    if not EDGE_OS_PASSWORD or not hmac.compare_digest(given, EDGE_OS_PASSWORD):
        _edgeos_note_fail(ip)
        await asyncio.sleep(0.8)
        raise HTTPException(status_code=401, detail="clave incorrecta")
    _edgeos_note_ok(ip)
    tok, exp = _edgeos_make_token()
    return JSONResponse({"token": tok, "exp": exp})


# ── deportes ───────────────────────────────────────────────────────────────
_sports_cache: list = []
_sports_at = 0.0


@router.get(_P + "/api/sports")
async def _edgeos_sports(_=Depends(_require_token)) -> dict:
    global _sports_cache, _sports_at
    real = bool(os.environ.get("THE_ODDS_API_KEY"))
    now = time.time()
    if not _sports_cache or now - _sports_at > 1800:
        def _run():
            return _provider("upcoming").list_sports()
        try:
            raw = await asyncio.to_thread(_run)
        except Exception as e:                                 # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"proveedor: {e}")
        sfx = "" if real else " (MOCK)"
        _sports_cache = [{"key": s["key"],
                          "title": s.get("title", s["key"]) + sfx,
                          "group": s.get("group", "")}
                         for s in raw if s.get("active")]
        _sports_at = now
    return {"real": real, "sports": _sports_cache}


# ── ¿meto X? ───────────────────────────────────────────────────────────────
@router.post(_P + "/api/check")
async def _edgeos_check(payload: dict = Body(...),
                        _=Depends(_require_token)) -> dict:
    sport = str(payload.get("sport") or EDGE_OS_SPORT)
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
    if side not in ("home", "draw", "away", "local", "empate", "visitante"):
        raise HTTPException(status_code=400, detail="elige local / empate / visitante")
    side = {"local": "home", "empate": "draw", "visitante": "away"}.get(side, side)

    def _fetch():
        from edge_os.engine import group_into_books
        try:
            prov = _provider(sport)
            quotes = prov.fetch(sport, ["h2h"], ["eu", "uk"])
        except Exception as e:                                 # noqa: BLE001
            return {"error": f"no pude bajar cuotas: {e}"}
        books = [b for b in group_into_books(quotes) if b.market == "h2h"]
        nh, na = _norm(home), _norm(away)
        cand = [b for b in books
                if (not nh or nh in _norm(b.home) or _norm(b.home) in nh)
                and (not na or na in _norm(b.away) or _norm(b.away) in na)]
        if not cand:
            return {"error": "no encuentro ese partido",
                    "disponibles": sorted(f"{b.home} vs {b.away}" for b in books)[:40],
                    "mock": getattr(prov, "name", "") == "mock"}
        if len(cand) > 1:
            return {"error": "varios partidos encajan, se mas concreto",
                    "disponibles": sorted(f"{b.home} vs {b.away}" for b in cand)[:20]}
        mb = cand[0]
        bp: dict[str, dict[str, float]] = {}
        for oc in mb.outcomes:
            for bk, pr in oc.prices.items():
                bp.setdefault(bk, {})[oc.outcome] = pr
        return {"home": mb.home, "away": mb.away,
                "outcomes": [oc.outcome for oc in mb.outcomes], "book_prices": bp,
                "mock": getattr(prov, "name", "") == "mock",
                "remaining": getattr(prov, "last_remaining", None)}

    got = await asyncio.to_thread(_fetch)
    if "error" in got:
        return got

    labels = {"home": got["home"], "away": got["away"], "draw": "Draw"}
    target = labels[side]
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
    res = evaluate_bet(
        book_prices=got["book_prices"], outcomes=got["outcomes"], target=target,
        taken_odds=odds, stake=stake, sharp_books=_SHARP,
        model_probs=model_probs, model_trust=trust,
    )
    res["match"] = f"{got['home']} vs {got['away']}"
    res["sport"] = sport
    res["side"] = side
    res["mock"] = got["mock"]
    res["remaining"] = got["remaining"]
    return res


# ── ahora mismo ────────────────────────────────────────────────────────────
@router.get(_P + "/api/live")
async def _edgeos_live(sport: str = Query(default=""),
                       dudoso: int = Query(default=0),
                       _=Depends(_require_token)) -> dict:
    sport = sport or EDGE_OS_SPORT

    def _run():
        from edge_os.engine import group_into_books
        from edge_os.live_radar import radar_from_books
        try:
            prov = _provider(sport)
            quotes = prov.fetch(sport, ["h2h"], ["eu", "uk"])
        except Exception as e:                                 # noqa: BLE001
            return {"error": f"no pude bajar cuotas: {e}"}
        books = group_into_books(quotes)
        rows = radar_from_books(books, sharp_books=_SHARP, min_odds=1.30,
                                min_edge=0.03, include_dudoso=bool(dudoso))
        return {
            "sport": sport, "provider": getattr(prov, "name", "?"),
            "mock": getattr(prov, "name", "") == "mock",
            "remaining": getattr(prov, "last_remaining", None),
            "n_events": len([b for b in books if b.market == "h2h"]),
            "rows": rows,
        }

    return await asyncio.to_thread(_run)


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
    rows = []
    for t in sorted(getattr(dc, "teams_", [])):
        rows.append({
            "team": t,
            "atk": round(dc.attack_.get(t, 0.0), 3),
            "dfn": round(dc.defense_.get(t, 0.0), 3),
            "strength": round(dc.attack_.get(t, 0.0) + dc.defense_.get(t, 0.0), 3),
            "elo": round(getattr(elo, "ratings_", {}).get(t, 0.0), 1),
            "eff_matches": round(getattr(dc, "eff_matches_", {}).get(t, 0.0), 1),
        })
    rows.sort(key=lambda r: r["strength"], reverse=True)
    return {
        "league": league, "source": meta.get("source"),
        "simulated": bool(meta.get("simulated")), "n_matches": meta.get("n_matches"),
        "home_adv": round(getattr(dc, "home_adv_", 0.0), 3),
        "rho": round(getattr(dc, "rho_", 0.0), 3),
        "teams": rows, "verdict": _verdict_file(league),
    }


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
        falta = home if rh is None else away
        raise HTTPException(status_code=404,
                            detail=f"equipo no reconocido en {league}: {falta}")

    def _run():
        fc = ens.predict(rh, ra)
        dcm = ens._members.get("dixon_coles")
        mk = dcm.predict(rh, ra).markets if dcm else None
        return fc, mk

    fc, mk = await asyncio.to_thread(_run)
    if fc is None:
        raise HTTPException(status_code=500, detail="el ensemble no pudo predecir")
    out = {
        "league": league, "home": rh, "away": ra,
        "p_home": round(fc.p_home, 4), "p_draw": round(fc.p_draw, 4),
        "p_away": round(fc.p_away, 4),
        "fair_home": round(1 / fc.p_home, 2), "fair_draw": round(1 / fc.p_draw, 2),
        "fair_away": round(1 / fc.p_away, 2),
        "interval_home": [round(fc.p_home_interval[0], 3),
                          round(fc.p_home_interval[1], 3)],
        "model_agreement": fc.model_agreement,
        "members": {k: [round(x, 3) for x in v] for k, v in fc.members.items()},
        "notes": fc.notes, "verdict": _verdict_file(league),
    }
    if mk is not None:
        out["over_2_5"] = round(mk.over.get(2.5, 0.0), 4)
        out["btts_yes"] = round(mk.btts_yes, 4)
        out["fair_over_2_5"] = round(1 / mk.over[2.5], 2) if mk.over.get(2.5) else None
    return out


@router.get(_P + "/api/football/backtest")
async def _edgeos_backtest(league: str = Query("SP1"),
                           _=Depends(_require_token)) -> dict:
    v = _verdict_file(league)
    if not v:
        return {"league": league, "available": False}
    return {"league": league, "available": True, **v}


# ── registro (lo llama server.py, protegido con try/except) ─────────────────
def register(app) -> None:
    if not EDGE_OS_PASSWORD:
        _log.info("edge_os desactivado (sin EDGE_OS_PASSWORD)")
        return
    app.include_router(router)
    _log.info("edge_os montado en /%s (oculto tras clave)", EDGE_OS_PATH)


# ── el panel (HTML autocontenido, sin dependencias externas) ───────────────
_PAGE = r"""<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>EDGE OS</title>
<style>
 :root{--bg:#0b0e13;--panel:#141922;--line:#232b38;--fg:#e6e9ef;--dim:#8a94a6;
       --accent:#4da3ff;--good:#3fb950;--warn:#d29922;--bad:#f85149}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,
      Segoe UI,Roboto,Helvetica,Arial,sans-serif}
 .wrap{max-width:1080px;margin:0 auto;padding:20px}
 h1{font-size:18px;letter-spacing:.5px;margin:0 0 2px}
 .sub{color:var(--dim);font-size:12px;margin-bottom:16px}
 .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;
       padding:16px;margin-bottom:16px}
 input,select,button{font:inherit;color:var(--fg);background:#0e131b;
       border:1px solid var(--line);border-radius:7px;padding:9px 10px}
 button{background:var(--accent);color:#04121f;border:0;font-weight:600;cursor:pointer}
 button.ghost{background:#0e131b;color:var(--fg);border:1px solid var(--line);font-weight:500}
 button:disabled{opacity:.5;cursor:default}
 label{display:block;color:var(--dim);font-size:12px;margin:10px 0 4px}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
 th{color:var(--dim);font-weight:600}
 .tag{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:800}
 .t-bad{background:rgba(248,81,73,.16);color:var(--bad)}
 .t-warn{background:rgba(210,153,34,.18);color:var(--warn)}
 .t-good{background:rgba(63,185,80,.18);color:var(--good)}
 .row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
 .tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
 .tabs button{background:#0e131b;color:var(--dim);border:1px solid var(--line)}
 .tabs button.on{background:var(--panel);color:var(--fg)}
 .verdict{font-size:16px;font-weight:700;margin:4px 0 10px}
 .muted{color:var(--dim)}
 ul{margin:8px 0 0;padding-left:18px}li{margin:2px 0}
 pre{white-space:pre-wrap;font-size:12px;color:var(--dim);margin:6px 0 0}
 .banner{border-left:3px solid var(--bad);background:rgba(248,81,73,.08);
         padding:10px 12px;border-radius:6px;font-size:12px;margin-bottom:12px}
 .warnmock{border-left:3px solid var(--warn);background:rgba(210,153,34,.10);
           padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:12px}
</style></head><body><div class="wrap">
<h1>EDGE&nbsp;OS</h1>
<div class="sub">Inteligencia cuantitativa de mercados deportivos &mdash; panel privado</div>

<div id="login" class="card" style="max-width:340px">
  <label>Clave</label>
  <div class="row"><input id="pw" type="password" autocomplete="current-password" style="flex:1">
  <button id="go">Entrar</button></div>
  <div id="lerr" class="muted" style="margin-top:8px;color:var(--bad)"></div>
</div>

<div id="app" style="display:none">
  <div class="banner">Esto es <b>analisis, no consejo de apuesta</b>, y no coloca
    ninguna apuesta. El veredicto mas favorable es &laquo;VALOR (sin validar)&raquo;:
    el sistema <b>no demuestra ganar a largo plazo</b>.</div>
  <div id="mockw" class="warnmock" style="display:none"></div>
  <div class="tabs">
    <button data-tab="check" class="on">&iquest;Meto 100&euro;?</button>
    <button data-tab="live">Ahora mismo</button>
    <button data-tab="futbol">Futbol</button>
  </div>

  <div id="tab-check">
    <div class="card">
      <div class="row">
        <div style="flex:1;min-width:180px"><label>Deporte</label><select id="c-sport"></select></div>
        <div style="flex:1;min-width:130px"><label>Equipo local</label><input id="c-home" placeholder="Real Madrid"></div>
        <div style="flex:1;min-width:130px"><label>Equipo visitante</label><input id="c-away" placeholder="Sevilla"></div>
      </div>
      <div class="row" style="margin-top:8px">
        <div><label>A quien apuestas</label><select id="c-side">
          <option value="home">Gana el local</option>
          <option value="draw">Empate</option>
          <option value="away">Gana el visitante</option></select></div>
        <div><label>Cuota que ves</label><input id="c-odds" type="number" step="0.01" placeholder="2.10" style="width:110px"></div>
        <div><label>Importe (&euro;)</label><input id="c-stake" type="number" step="10" value="100" style="width:100px"></div>
        <button id="c-go">Comprobar</button>
      </div>
      <div id="c-out" style="margin-top:14px"></div>
    </div>
  </div>

  <div id="tab-live" style="display:none">
    <div class="card">
      <div class="row">
        <div style="flex:1;min-width:200px"><label>Deporte</label><select id="l-sport"></select></div>
        <button id="l-go">Escanear ahora</button>
        <label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="l-auto" style="width:auto"> auto (5 min)</label>
        <span class="muted" id="l-meta"></span>
      </div>
      <div id="l-out" style="margin-top:14px"><span class="muted">Pulsa &laquo;Escanear ahora&raquo;.</span></div>
    </div>
  </div>

  <div id="tab-futbol" style="display:none">
    <div class="card">
      <div class="row">
        <div><label>Liga</label><select id="f-liga"></select></div>
        <div><label>Local</label><input id="f-home" placeholder="Real Madrid"></div>
        <div><label>Visitante</label><input id="f-away" placeholder="Barcelona"></div>
        <button id="f-pred">Predecir</button>
        <button id="f-tabla" class="ghost">Ver valoraciones</button>
      </div>
      <div id="f-out" style="margin-top:14px"></div>
    </div>
    <div id="f-tabla-out"></div>
  </div>
</div>

<script>
const BASE="__BASE__";
let TOKEN=sessionStorage.getItem("edgeos_tok")||"";
let AUTO=null;
const $=s=>document.querySelector(s);
async function api(path,opts){
  opts=opts||{};opts.headers=Object.assign({"content-type":"application/json"},opts.headers||{});
  if(TOKEN)opts.headers.authorization="Bearer "+TOKEN;
  const r=await fetch(BASE+path,opts);
  if(r.status===401){logout();throw new Error("sesion caducada, entra otra vez");}
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.detail||("error "+r.status));
  return j;
}
function logout(){TOKEN="";sessionStorage.removeItem("edgeos_tok");$("#app").style.display="none";$("#login").style.display="";}
function pct(x){return (x*100).toFixed(1)+"%";}
function tagFor(v){
  if(v==="ARBITRAJE")return '<span class="tag t-good">ARBITRAJE</span>';
  if(v==="VALOR_SIN_VALIDAR")return '<span class="tag t-good">VALOR (sin validar)</span>';
  if(v==="DUDOSO")return '<span class="tag t-warn">DUDOSO</span>';
  if(v==="NO_METER")return '<span class="tag t-bad">NO METER</span>';
  return '<span class="tag t-warn">SIN DATOS</span>';
}
async function showApp(){
  $("#login").style.display="none";$("#app").style.display="";
  try{
    const h=await fetch(BASE+"/health").then(r=>r.json());
    if(h.odds==="mock"){
      $("#mockw").style.display="";
      $("#mockw").innerHTML="Sin <b>THE_ODDS_API_KEY</b>: las cuotas de abajo son "+
        "<b>ALEATORIAS</b>, no valen para nada. Ponla con <code>fly secrets set "+
        "THE_ODDS_API_KEY=...</code> y vuelve a entrar.";
    }
  }catch(e){}
  loadSports();loadLeagues();
}
$("#go").onclick=async()=>{
  $("#lerr").textContent="";
  try{
    const j=await api("/api/login",{method:"POST",body:JSON.stringify({password:$("#pw").value})});
    TOKEN=j.token;sessionStorage.setItem("edgeos_tok",TOKEN);showApp();
  }catch(e){$("#lerr").textContent=e.message;}
};
$("#pw").addEventListener("keydown",e=>{if(e.key==="Enter")$("#go").click();});
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("on",x===b));
  ["check","live","futbol"].forEach(t=>$("#tab-"+t).style.display=(b.dataset.tab===t)?"":"none");
});

async function loadSports(){
  try{
    const j=await api("/api/sports");
    const opts=j.sports.map(s=>`<option value="${s.key}">${s.title}</option>`).join("");
    $("#c-sport").innerHTML=opts;$("#l-sport").innerHTML=opts;
  }catch(e){}
}
async function loadLeagues(){
  try{
    const j=await api("/api/football/leagues");
    $("#f-liga").innerHTML=j.leagues.map(l=>`<option value="${l.code}">${l.name}</option>`).join("");
  }catch(e){}
}

$("#c-go").onclick=async()=>{
  const out=$("#c-out");out.innerHTML="<span class=muted>comprobando...</span>";
  try{
    const j=await api("/api/check",{method:"POST",body:JSON.stringify({
      sport:$("#c-sport").value,home:$("#c-home").value,away:$("#c-away").value,
      side:$("#c-side").value,odds:$("#c-odds").value,stake:$("#c-stake").value})});
    if(j.error){
      let d=(j.disponibles||[]).map(x=>"<li>"+x+"</li>").join("");
      out.innerHTML=`<span style="color:var(--bad)">${j.error}</span>`+
        (d?`<div class="muted" style="margin-top:6px">Partidos que hay ahora:</div><ul>${d}</ul>`:"");
      return;
    }
    const arb=j.arb?`<div style="margin-top:8px">${tagFor("ARBITRAJE")} `+
      `${(j.arb.roi*100).toFixed(2)}% cubriendo todo el mercado: `+
      j.arb.legs.map(l=>l.outcome+" "+l.book+" @"+l.odds+" ("+l.stake_pct+"%)").join(" · ")+`</div>`:"";
    out.innerHTML=`
      <div class="verdict">${tagFor(j.verdict)} &nbsp;${j.title}</div>
      <div class="muted">${j.match} — apuestas a: <b>${j.target}</b></div>
      <ul>${j.reasons.map(r=>"<li>"+r+"</li>").join("")}</ul>
      <div class="muted" style="margin-top:8px">${j.stake.msg}</div>
      ${arb}
      ${j.mock?'<pre>cuotas MOCK: este resultado no vale</pre>':''}`;
  }catch(e){out.innerHTML=`<span style="color:var(--bad)">${e.message}</span>`;}
};

async function scanLive(){
  const out=$("#l-out");out.innerHTML="<span class=muted>escaneando...</span>";
  try{
    const j=await api("/api/live?sport="+encodeURIComponent($("#l-sport").value)+"&dudoso=1");
    if(j.error){out.innerHTML=`<span style="color:var(--bad)">${j.error}</span>`;return;}
    $("#l-meta").textContent=`${j.n_events} eventos · ${j.rows.length} para mirar`+
      (j.remaining!=null?` · quedan ${j.remaining} consultas`:"")+
      (j.mock?" · MOCK (no vale)":"");
    if(!j.rows.length){out.innerHTML="<span class=muted>Nada con sentido ahora mismo. Eso es lo normal.</span>";return;}
    out.innerHTML=`<table><thead><tr><th>Partido</th><th>A quien</th><th>Casa</th>
      <th>Cuota</th><th>Justa</th><th>EV</th><th>Empieza</th><th></th></tr></thead><tbody>`+
      j.rows.map(r=>`<tr>
        <td>${r.match}<div class="muted" style="font-size:11px">${r.title}</div></td>
        <td>${r.outcome}</td><td>${r.book}</td>
        <td>${r.odds??"-"}</td><td>${r.fair_odds??"-"}</td>
        <td>${(r.ev*100).toFixed(1)}%</td>
        <td class="muted">${r.hours_to_start>0?("en "+r.hours_to_start+"h"):"en juego"}</td>
        <td>${tagFor(r.verdict)}</td></tr>`).join("")+`</tbody></table>`;
  }catch(e){out.innerHTML=`<span style="color:var(--bad)">${e.message}</span>`;}
}
$("#l-go").onclick=scanLive;
$("#l-auto").onchange=e=>{
  if(AUTO){clearInterval(AUTO);AUTO=null;}
  if(e.target.checked){scanLive();AUTO=setInterval(scanLive,300000);}
};

$("#f-pred").onclick=async()=>{
  const out=$("#f-out");out.innerHTML="<span class=muted>calculando...</span>";
  try{
    const j=await api("/api/football/predict",{method:"POST",body:JSON.stringify({
      league:$("#f-liga").value,home:$("#f-home").value,away:$("#f-away").value})});
    let mem="";for(const k in j.members)mem+=`<div><b>${k}</b> ${j.members[k].map(pct).join(" / ")}</div>`;
    const v=j.verdict;
    const vb=v?`<div style="margin:6px 0">${(v.beats_market===false||(v.roi!=null&&v.roi<0))?
      '<span class="tag t-bad">este modelo pierde vs mercado en backtest</span>':
      '<span class="tag t-good">modelo &ge; mercado</span>'}</div>`:"";
    out.innerHTML=vb+`
      <div class="row" style="gap:24px">
        <div><div class="muted">${j.home}</div><div class="verdict">${pct(j.p_home)}</div></div>
        <div><div class="muted">Empate</div><div class="verdict">${pct(j.p_draw)}</div></div>
        <div><div class="muted">${j.away}</div><div class="verdict">${pct(j.p_away)}</div></div>
      </div>
      <div class="muted">Cuotas justas ${j.fair_home} / ${j.fair_draw} / ${j.fair_away}
        · Over 2.5 ${j.over_2_5!=null?pct(j.over_2_5):"—"} · acuerdo ${j.model_agreement}</div>
      <div class="muted" style="margin-top:6px">${mem}</div>`;
  }catch(e){out.innerHTML=`<span style="color:var(--bad)">${e.message}</span>`;}
};
$("#f-tabla").onclick=async()=>{
  const out=$("#f-tabla-out");out.innerHTML="<div class=card><span class=muted>cargando...</span></div>";
  try{
    const j=await api("/api/football/table?league="+encodeURIComponent($("#f-liga").value));
    const rows=j.teams.map(t=>`<tr><td>${t.team}</td><td>${t.strength}</td>
      <td>${t.elo}</td><td>${t.eff_matches}</td></tr>`).join("");
    out.innerHTML=`<div class="card"><div class="muted">${j.league} · ${j.n_matches} partidos
      · fuente ${j.source} ${j.simulated?'<span class="tag t-warn">SIMULADO</span>':''}
      · ventaja local ${j.home_adv} · rho ${j.rho}</div>
      <table><thead><tr><th>Equipo</th><th>Fuerza</th><th>Elo</th><th>Muestra ef.</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }catch(e){out.innerHTML=`<div class=card style="color:var(--bad)">${e.message}</div>`;}
};

if(TOKEN)showApp();
</script>
</div></body></html>"""
