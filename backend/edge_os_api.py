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
        "sport": sport, "markets": ["h2h"], "regions": ["eu", "uk"],
    }))


_odds_cache: dict[str, tuple] = {}        # sport -> (quotes, at, remaining)
_credits_used = {"n": 0}


def _fetch_sport(sport: str) -> tuple[list, Optional[str], bool]:
    """(quotes, peticiones_restantes, venia_de_cache). Cachea `_ODDS_TTL` s."""
    hit = _odds_cache.get(sport)
    now = time.time()
    if hit and now - hit[1] < _ODDS_TTL:
        return hit[0], hit[2], True
    prov = _provider(sport)
    quotes = prov.fetch(sport, ["h2h"], ["eu", "uk"])
    rem = getattr(prov, "last_remaining", None)
    _odds_cache[sport] = (quotes, now, rem)
    if _real_odds():
        _credits_used["n"] += 1
    return quotes, rem, False


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


@router.get(_P + "/api/top")
async def _edgeos_top(scope: str = Query("soon"),
                      sports: str = Query(""),
                      _=Depends(_require_token)) -> dict:
    if scope not in _SCOPES:
        raise HTTPException(status_code=400, detail="scope: live | soon | today")
    sp = await _sports()
    keys = [k.strip() for k in sports.split(",") if k.strip()]
    if not keys:
        keys = _DEFAULT_SPORTS or [s["key"] for s in sp[:5]]
    keys = keys[:10]                      # tope duro: cada uno gasta 1 consulta

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
                   if not e["live"] and e["starts_in_min"] is not None
                   and 0 <= e["starts_in_min"] <= limit]
        picks = top_opportunities(sel)
        return {"scope": scope, "sports": keys, "picks": picks,
                "n_scanned": n_raw, "n_in_scope": len(sel),
                "remaining": rem, "errors": errs, "mock": not _real_odds()}

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
:root{--bg:#0a0d12;--card:#121721;--card2:#0f141c;--line:#212a38;--fg:#e8ecf3;
 --dim:#7d8799;--accent:#4da3ff;--valor:#2ea043;--justa:#57657d;
 --floja:#c99026;--malo:#e5534b;--duda:#8b5cf6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
 font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:16px}
.top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px}
h1{font-size:17px;letter-spacing:1px;margin:0;font-weight:800}
.pill{font-size:11px;padding:3px 9px;border-radius:999px;background:#18202c;
 color:var(--dim);border:1px solid var(--line)}
.pill.ok{color:var(--valor);border-color:#1d3a26}
.pill.warn{color:var(--floja);border-color:#3a3018}
.sub{color:var(--dim);font-size:12px;margin:2px 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;
 padding:14px;margin-bottom:12px}
input,select,button{font:inherit;color:var(--fg);background:#0d1219;
 border:1px solid var(--line);border-radius:8px;padding:9px 11px}
button{background:var(--accent);color:#05121f;border:0;font-weight:700;cursor:pointer}
button.ghost{background:#0d1219;color:var(--fg);border:1px solid var(--line);font-weight:600}
button:disabled{opacity:.45;cursor:default}
label{display:block;color:var(--dim);font-size:11px;margin:0 0 4px;
 text-transform:uppercase;letter-spacing:.4px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.tabs{display:flex;gap:6px;margin:14px 0;flex-wrap:wrap}
.tabs button{background:#0d1219;color:var(--dim);border:1px solid var(--line);
 font-weight:600;padding:8px 14px}
.tabs button.on{background:var(--card);color:var(--fg);border-color:#31405a}
.muted{color:var(--dim)}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.chip{font-size:12px;padding:5px 10px;border-radius:999px;background:#0d1219;
 border:1px solid var(--line);color:var(--dim);cursor:pointer;user-select:none}
.chip.on{background:#16283d;border-color:#31507a;color:#cfe4ff}
/* tablero */
.ev{border:1px solid var(--line);border-radius:10px;margin-bottom:8px;
 background:var(--card2);overflow:hidden}
.ev-h{display:flex;justify-content:space-between;align-items:center;gap:10px;
 padding:10px 12px;cursor:pointer}
.ev-h:hover{background:#141b26}
.ev-t{font-weight:700}
.ev-s{font-size:11px;color:var(--dim)}
.tiles{display:grid;gap:8px;padding:0 12px 12px;
 grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.tile{border:1px solid var(--line);border-radius:9px;padding:9px 10px;
 background:#0d1219;display:flex;flex-direction:column;gap:2px}
.tile .n{font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;
 text-overflow:ellipsis}
.tile .o{font-size:20px;font-weight:800;letter-spacing:-.5px}
.tile .b{font-size:11px;color:var(--dim)}
.tile .lab{font-size:10px;font-weight:800;letter-spacing:.6px;margin-top:3px}
.t-VALOR{border-color:#1f5130;background:#0e1d14}.t-VALOR .lab{color:var(--valor)}
.t-JUSTA .lab{color:var(--justa)}
.t-FLOJA .lab{color:var(--floja)}
.t-NI_LOCOS{border-color:#4a2320}.t-NI_LOCOS .lab{color:var(--malo)}
.t-DUDOSA .lab{color:var(--duda)}
.duda{color:var(--duda)}
.det{padding:0 12px 12px;font-size:12px}
.det table{width:100%;border-collapse:collapse}
.det td,.det th{padding:4px 6px;border-bottom:1px solid var(--line);text-align:left}
.det th{color:var(--dim);font-weight:600}
/* picks */
.pick{border:1px solid #1f5130;background:linear-gradient(180deg,#0f1e16,#0d1219);
 border-radius:12px;padding:14px;margin-bottom:10px}
.pick.arb{border-color:#31507a;background:linear-gradient(180deg,#0e1825,#0d1219)}
.pick-h{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;
 align-items:baseline}
.pick .sel{font-size:19px;font-weight:800;margin:6px 0 2px}
.pick .nums{display:flex;gap:18px;flex-wrap:wrap;margin:8px 0}
.pick .nums div span{display:block;font-size:11px;color:var(--dim)}
.pick .nums div b{font-size:17px}
.why{margin:8px 0 0;padding-left:18px;color:#b9c3d3;font-size:12.5px}
.why li{margin:3px 0}
.badge{font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px}
.badge.v{background:#123420;color:#3fd166}
.badge.a{background:#132540;color:#6aa6ff}
.badge.live{background:#3a1417;color:#ff6b6b}
.empty{padding:26px;text-align:center;color:var(--dim)}
.note{border-left:3px solid #31405a;background:#0f1620;padding:9px 12px;
 border-radius:6px;font-size:12px;color:#9fb0c7;margin-bottom:12px}
</style></head><body><div class="wrap">
<div class="top"><h1>EDGE&nbsp;OS</h1>
  <span class="pill" id="p-odds">…</span>
  <span class="pill" id="p-cred"></span></div>
<div class="sub">Cuotas de todas las casas, cada una con su veredicto</div>

<div id="login" class="card" style="max-width:340px">
  <label>Clave</label>
  <div class="row"><input id="pw" type="password" style="flex:1">
  <button id="go">Entrar</button></div>
  <div id="lerr" style="margin-top:8px;color:var(--malo);font-size:12px"></div>
</div>

<div id="app" style="display:none">
<div class="tabs">
  <button data-tab="top" class="on">🔥 No dejes escapar</button>
  <button data-tab="board">📋 Tablero</button>
  <button data-tab="check">🧮 ¿Merece la pena?</button>
  <button data-tab="fut">⚽ Fútbol</button>
</div>

<!-- TOP -->
<div id="tab-top">
 <div class="card">
  <div class="row">
   <div><label>Cuándo</label><select id="t-scope">
     <option value="live">🔴 En vivo ahora</option>
     <option value="soon" selected>Próximas 3 h</option>
     <option value="today">Hoy (24 h)</option></select></div>
   <div style="flex:1"><label>Bankroll €</label><input id="t-bank" type="number" value="1000" style="width:120px"></div>
   <button id="t-go">Buscar</button>
  </div>
  <label style="margin-top:12px">Deportes a escanear (cada uno gasta 1 consulta)</label>
  <div class="chips" id="t-chips"></div>
  <div class="muted" id="t-meta" style="font-size:12px"></div>
 </div>
 <div id="t-out"></div>
</div>

<!-- TABLERO -->
<div id="tab-board" style="display:none">
 <div class="card"><div class="row">
   <div style="flex:1;min-width:220px"><label>Deporte</label><select id="b-sport"></select></div>
   <button id="b-go">Ver cuotas</button>
   <label style="display:flex;gap:6px;align-items:center;margin:0;text-transform:none">
     <input type="checkbox" id="b-only" style="width:auto"> solo con valor</label>
   <span class="muted" id="b-meta" style="font-size:12px"></span>
 </div></div>
 <div id="b-out"></div>
</div>

<!-- CHECK -->
<div id="tab-check" style="display:none">
 <div class="card">
  <div class="row">
   <div style="flex:1;min-width:170px"><label>Deporte</label><select id="c-sport"></select></div>
   <div style="flex:1;min-width:130px"><label>Local</label><input id="c-home"></div>
   <div style="flex:1;min-width:130px"><label>Visitante</label><input id="c-away"></div>
  </div>
  <div class="row" style="margin-top:8px">
   <div><label>A quién</label><select id="c-side">
     <option value="home">Gana local</option><option value="draw">Empate</option>
     <option value="away">Gana visitante</option></select></div>
   <div><label>Cuota</label><input id="c-odds" type="number" step="0.01" style="width:100px"></div>
   <div><label>Importe €</label><input id="c-stake" type="number" value="100" style="width:100px"></div>
   <button id="c-go">Comprobar</button>
  </div>
  <div id="c-out" style="margin-top:12px"></div>
 </div>
</div>

<!-- FUTBOL -->
<div id="tab-fut" style="display:none">
 <div class="card"><div class="row">
   <div><label>Liga</label><select id="f-liga"></select></div>
   <div><label>Local</label><input id="f-home"></div>
   <div><label>Visitante</label><input id="f-away"></div>
   <button id="f-go">Predecir</button>
   <button id="f-tab" class="ghost">Valoraciones</button>
 </div><div id="f-out" style="margin-top:12px"></div></div>
 <div id="f-tout"></div>
</div>
</div>

<script>
const BASE="__BASE__";
let TOKEN=sessionStorage.getItem("edgeos_tok")||"";
let SPORTS=[],PICKED=new Set();
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pc=x=>(x*100).toFixed(1)+"%";
const sgn=x=>(x>=0?"+":"")+(x*100).toFixed(1)+"%";

async function api(p,o){o=o||{};o.headers=Object.assign({"content-type":"application/json"},o.headers||{});
 if(TOKEN)o.headers.authorization="Bearer "+TOKEN;
 const r=await fetch(BASE+p,o);
 if(r.status===401){logout();throw new Error("sesión caducada, vuelve a entrar");}
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j.detail||("error "+r.status));return j;}
function logout(){TOKEN="";sessionStorage.removeItem("edgeos_tok");
 $("#app").style.display="none";$("#login").style.display="";}

$("#go").onclick=async()=>{$("#lerr").textContent="";
 try{const j=await api("/api/login",{method:"POST",body:JSON.stringify({password:$("#pw").value})});
  TOKEN=j.token;sessionStorage.setItem("edgeos_tok",TOKEN);boot();}
 catch(e){$("#lerr").textContent=e.message;}};
$("#pw").addEventListener("keydown",e=>{if(e.key==="Enter")$("#go").click();});
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{
 document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("on",x===b));
 ["top","board","check","fut"].forEach(t=>$("#tab-"+t).style.display=(b.dataset.tab===t)?"":"none");});

async function boot(){
 $("#login").style.display="none";$("#app").style.display="";
 try{const h=await fetch(BASE+"/health").then(r=>r.json());
  $("#p-odds").textContent=h.odds==="real"?"cuotas reales":"MOCK (cuotas falsas)";
  $("#p-odds").className="pill "+(h.odds==="real"?"ok":"warn");}catch(e){}
 try{const j=await api("/api/sports");SPORTS=j.sports;
  const opts=SPORTS.map(s=>`<option value="${esc(s.key)}">${esc(s.title)}</option>`).join("");
  $("#b-sport").innerHTML=opts;$("#c-sport").innerHTML=opts;
  PICKED=new Set(j.defaults);drawChips();}catch(e){}
 try{const j=await api("/api/football/leagues");
  $("#f-liga").innerHTML=j.leagues.map(l=>`<option value="${l.code}">${esc(l.name)}</option>`).join("");}catch(e){}
}
function drawChips(){
 $("#t-chips").innerHTML=SPORTS.map(s=>
  `<span class="chip${PICKED.has(s.key)?" on":""}" data-k="${esc(s.key)}">${esc(s.title)}</span>`).join("");
 $("#t-chips").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{
  const k=c.dataset.k;if(PICKED.has(k))PICKED.delete(k);else if(PICKED.size<10)PICKED.add(k);
  drawChips();});
 $("#t-meta").textContent=PICKED.size+" deporte(s) · gastará "+PICKED.size+" consulta(s) (se cachean 60 s)";
}
function cred(r){if(r!=null)$("#p-cred").textContent="quedan "+r+" consultas";}

/* ── NO DEJES ESCAPAR ── */
$("#t-go").onclick=async()=>{
 const out=$("#t-out");out.innerHTML='<div class="card empty">buscando…</div>';
 try{
  const j=await api("/api/top?scope="+$("#t-scope").value+"&sports="+encodeURIComponent([...PICKED].join(",")));
  cred(j.remaining);
  const bank=parseFloat($("#t-bank").value)||1000;
  let head=`<div class="note">Escaneados <b>${j.n_scanned}</b> partidos · <b>${j.n_in_scope}</b> en la ventana elegida · <b>${j.picks.length}</b> pasan todos los filtros.`+
   (j.mock?" · <b>MOCK: no vale</b>":"")+
   (j.errors&&j.errors.length?" · errores: "+esc(j.errors.join("; ")):"")+"</div>";
  if(!j.picks.length){out.innerHTML=head+
   '<div class="card empty">Nada que merezca la pena ahora mismo.<br><span style="font-size:12px">Es lo normal: la mayoría de precios son correctos. Prueba otra ventana o más deportes.</span></div>';return;}
  out.innerHTML=head+j.picks.map(p=>{
   const arb=p.kind==="ARBITRAJE";
   const stake=p.kelly_pct?(bank*p.kelly_pct/100):null;
   const legs=arb?`<table style="width:100%;margin-top:8px;font-size:12.5px">${
     p.arb.legs.map(l=>`<tr><td>${esc(l.outcome)}</td><td class="muted">${esc(l.book)}</td>
     <td><b>${l.odds}</b></td><td>${(bank*l.stake_pct/100).toFixed(0)} €</td></tr>`).join("")}</table>`:"";
   return `<div class="pick${arb?" arb":""}">
    <div class="pick-h">
      <div><span class="badge ${arb?"a":"v"}">${arb?"ARBITRAJE":"VALOR"}</span>
        ${p.live?'<span class="badge live">EN VIVO</span>':""}
        <span class="muted" style="font-size:12px">&nbsp;${esc(p.sport_title||p.sport)}</span></div>
      <div class="muted" style="font-size:12px">${p.live?"en juego":(p.starts_in_min!=null?"empieza en "+Math.round(p.starts_in_min)+" min":"")}</div>
    </div>
    <div class="muted" style="font-size:13px">${esc(p.match)}</div>
    <div class="sel">${esc(p.outcome)}${p.odds?` &nbsp;<span style="color:var(--valor)">@ ${p.odds}</span>`:""}
      ${p.book&&p.book!=="varias"?`<span class="muted" style="font-size:13px;font-weight:600"> en ${esc(p.book)}</span>`:""}</div>
    <div class="nums">
      ${p.fair_odds?`<div><span>Cuota justa</span><b>${p.fair_odds}</b></div>`:""}
      <div><span>Ventaja (EV)</span><b style="color:var(--valor)">${sgn(p.ev)}</b></div>
      ${stake?`<div><span>Meter (Kelly ¼)</span><b>${stake.toFixed(0)} €</b></div>`:""}
      <div><span>Casas</span><b>${p.n_books}</b></div>
    </div>
    <ul class="why">${p.why.map(w=>"<li>"+esc(w)+"</li>").join("")}</ul>${legs}</div>`;}).join("");
 }catch(e){out.innerHTML=`<div class="card" style="color:var(--malo)">${esc(e.message)}</div>`;}
};

/* ── TABLERO ── */
const LBL={VALOR:"VALOR",JUSTA:"PRECIO JUSTO",FLOJA:"FLOJA",NI_LOCOS:"NI LOCOS",DUDOSA:"NO ME FÍO"};
$("#b-go").onclick=async()=>{
 const out=$("#b-out");out.innerHTML='<div class="card empty">cargando cuotas…</div>';
 try{
  const j=await api("/api/board?sport="+encodeURIComponent($("#b-sport").value));
  if(j.error){out.innerHTML=`<div class="card" style="color:var(--malo)">${esc(j.error)}</div>`;return;}
  cred(j.remaining);
  const only=$("#b-only").checked;
  let evs=j.events.filter(e=>!only||e.best_tag==="VALOR");
  $("#b-meta").textContent=`${j.events.length} partidos${j.cached?" (caché)":""}${j.mock?" · MOCK":""}`;
  if(!evs.length){out.innerHTML='<div class="card empty">Sin partidos que mostrar.</div>';return;}
  out.innerHTML=evs.map((e,i)=>`<div class="ev">
    <div class="ev-h" onclick="tog(${i})">
      <div><div class="ev-t">${esc(e.match)}</div>
        <div class="ev-s">${e.live?'<span style="color:#ff6b6b">● EN VIVO</span>':
          (e.starts_in_min!=null?"empieza en "+Math.round(e.starts_in_min)+" min":"")}
          · ${e.n_books} casas${e.trusted?"":" · <span class='duda'>"+esc(e.trust_reason)+"</span>"}
          ${e.arb?' · <span style="color:#6aa6ff">ARBITRAJE '+sgn(e.arb.roi)+'</span>':""}</div></div>
      <div class="muted" style="font-size:11px">detalle ▾</div></div>
    <div class="tiles">${e.outcomes.map(o=>`<div class="tile t-${o.tag}">
       <div class="n">${esc(o.name)}</div><div class="o">${o.best_odds}</div>
       <div class="b">${esc(o.best_book)}${o.fair_odds?" · justa "+o.fair_odds:""}</div>
       <div class="lab">${LBL[o.tag]}${o.ev!=null&&o.tag!=="DUDOSA"?" "+sgn(o.ev):""}</div></div>`).join("")}</div>
    <div class="det" id="d${i}" style="display:none">${e.outcomes.map(o=>
      `<div style="margin-bottom:8px"><b>${esc(o.name)}</b>
       <table><tr><th>Casa</th><th>Cuota</th><th>EV</th><th>Veredicto</th></tr>
       ${(o.books||[]).map(b=>`<tr><td>${esc(b.book)}</td><td>${b.odds}</td>
         <td>${sgn(b.ev)}</td><td style="color:var(--${b.tag==="VALOR"?"valor":b.tag==="NI_LOCOS"?"malo":b.tag==="FLOJA"?"floja":b.tag==="DUDOSA"?"duda":"justa"})">${LBL[b.tag]}</td></tr>`).join("")}
       </table></div>`).join("")}</div></div>`).join("");
 }catch(e){out.innerHTML=`<div class="card" style="color:var(--malo)">${esc(e.message)}</div>`;}
};
function tog(i){const d=$("#d"+i);d.style.display=d.style.display==="none"?"":"none";}

/* ── CHECK ── */
$("#c-go").onclick=async()=>{
 const out=$("#c-out");out.innerHTML='<span class="muted">comprobando…</span>';
 try{
  const j=await api("/api/check",{method:"POST",body:JSON.stringify({
    sport:$("#c-sport").value,home:$("#c-home").value,away:$("#c-away").value,
    side:$("#c-side").value,odds:$("#c-odds").value,stake:$("#c-stake").value})});
  if(j.error){out.innerHTML=`<span style="color:var(--malo)">${esc(j.error)}</span>`+
    ((j.disponibles||[]).length?'<div class="muted" style="margin-top:6px">Hay ahora: '+
      j.disponibles.map(esc).join(" · ")+"</div>":"");return;}
  cred(j.remaining);
  const col=j.verdict==="VALOR_SIN_VALIDAR"?"var(--valor)":j.verdict==="DUDOSO"?"var(--duda)":"var(--malo)";
  out.innerHTML=`<div style="font-size:16px;font-weight:800;color:${col};margin-bottom:6px">${esc(j.title)}</div>
   <div class="muted">${esc(j.match)} — ${esc(j.target)}</div>
   <ul class="why">${j.reasons.map(r=>"<li>"+esc(r)+"</li>").join("")}</ul>
   <div class="muted" style="margin-top:8px">${esc(j.stake.msg)}</div>`;
 }catch(e){out.innerHTML=`<span style="color:var(--malo)">${esc(e.message)}</span>`;}
};

/* ── FUTBOL ── */
$("#f-go").onclick=async()=>{
 const out=$("#f-out");out.innerHTML='<span class="muted">calculando…</span>';
 try{const j=await api("/api/football/predict",{method:"POST",body:JSON.stringify({
   league:$("#f-liga").value,home:$("#f-home").value,away:$("#f-away").value})});
  out.innerHTML=`<div class="row" style="gap:26px">
    <div><div class="muted">${esc(j.home)}</div><div style="font-size:24px;font-weight:800">${pc(j.p_home)}</div></div>
    <div><div class="muted">Empate</div><div style="font-size:24px;font-weight:800">${pc(j.p_draw)}</div></div>
    <div><div class="muted">${esc(j.away)}</div><div style="font-size:24px;font-weight:800">${pc(j.p_away)}</div></div></div>
   <div class="muted" style="margin-top:6px">Justas ${j.fair_home} / ${j.fair_draw} / ${j.fair_away}
    · Over 2.5 ${j.over_2_5!=null?pc(j.over_2_5):"—"} · acuerdo modelos ${j.model_agreement}</div>
   <div class="note" style="margin-top:10px">Este modelo, en backtest sobre La Liga, <b>no bate al mercado</b>. Úsalo como segunda opinión, no como fuente.</div>`;
 }catch(e){out.innerHTML=`<span style="color:var(--malo)">${esc(e.message)}</span>`;}
};
$("#f-tab").onclick=async()=>{
 const out=$("#f-tout");out.innerHTML='<div class="card empty">cargando…</div>';
 try{const j=await api("/api/football/table?league="+encodeURIComponent($("#f-liga").value));
  out.innerHTML=`<div class="card"><div class="muted">${esc(j.league)} · ${j.n_matches} partidos · ${esc(j.source)}</div>
   <table style="width:100%;margin-top:8px;font-size:13px"><tr><th style="text-align:left;color:var(--dim)">Equipo</th>
   <th style="text-align:left;color:var(--dim)">Fuerza</th><th style="text-align:left;color:var(--dim)">Elo</th></tr>
   ${j.teams.map(t=>`<tr><td>${esc(t.team)}</td><td>${t.strength}</td><td>${t.elo}</td></tr>`).join("")}</table></div>`;
 }catch(e){out.innerHTML=`<div class="card" style="color:var(--malo)">${esc(e.message)}</div>`;}
};
if(TOKEN)boot();
</script></div></body></html>"""
