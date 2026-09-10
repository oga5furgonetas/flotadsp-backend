# -*- coding: utf-8 -*-
"""EDGE OS — panel privado montado dentro del backend de FlotaDSP.

AISLADO A PROPOSITO:
  * No importa nada de server.py ni toca `db` / `global_db` (gotcha 26).
  * Se activa solo si existe el secret EDGE_OS_PASSWORD. Sin el, `register()`
    no monta ninguna ruta: el path devuelve 404, no existe.
  * Vive bajo un path no adivinable (EDGE_OS_PATH). "Oculto" = path raro + clave.
  * Todo el computo (modelos de futbol, escaneo de cuotas) va en un threadpool
    y se cachea; nada pesado en el hilo del event loop.

Rutas (con P = EDGE_OS_PATH):
  GET  /{P}                      -> el panel (login + UI, HTML autocontenido)
  GET  /{P}/health               -> {"ok": true}  (sin auth, para comprobar que vive)
  POST /{P}/api/login            -> {password} -> {token, exp}
  GET  /{P}/api/football/leagues -> ligas con datos empaquetados
  GET  /{P}/api/football/table   -> ?league= : valoraciones de equipos (DC + Elo)
  POST /{P}/api/football/predict -> {league, home, away} -> 1X2 + mercados + veredicto
  GET  /{P}/api/football/backtest-> ?league= : veredicto walk-forward empaquetado
  GET  /{P}/api/odds/scan        -> arbitraje + value (mock salvo THE_ODDS_API_KEY)

Los edges NUNCA se presentan como apuesta recomendada: el modelo no esta
validado (sin odds historico intradia) y el backtest de La Liga dice que pierde
contra el mercado. El panel lo deja escrito.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import time
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
_TOKEN_TTL = int(os.environ.get("EDGE_OS_TOKEN_TTL", "43200"))  # 12 h

# ── token propio (HMAC sobre la caducidad, clave derivada de la password) ─────
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


# ── anti fuerza bruta (en memoria; el proceso es de larga vida) ──────────────
_fails: dict[str, list] = {}          # ip -> [n_fallos, bloqueado_hasta]
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


# ── cache del ensemble de futbol por liga (rebuild cada 6 h) ─────────────────
_ens_cache: dict[str, tuple] = {}
_ens_lock = None            # asyncio.Lock, se crea al vuelo (no en import)
_ENS_TTL = 6 * 3600


def _csv_paths(league: str) -> list[str]:
    return sorted(str(p) for p in _CSV_DIR.glob(f"{league}*.csv"))


def _leagues_available() -> list[str]:
    pref = sorted({p.name.split("_")[0] for p in _CSV_DIR.glob("*.csv")})
    return pref


def _build_ensemble(league: str):
    from edge_os.modeling.football import build_football_ensemble
    paths = _csv_paths(league)
    ens, meta = build_football_ensemble(
        csv_paths=paths or None, half_life_days=180.0, include_market=False,
        synthetic_if_empty=True,
    )
    return ens, meta


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


def _verdict(league: str) -> Optional[dict]:
    f = _ASSETS / f"backtest_verdict_{league}.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return None
    return None


# ── router ──────────────────────────────────────────────────────────────────
router = APIRouter(tags=["edge_os"])
_P = f"/{EDGE_OS_PATH}"


@router.get(_P, response_class=HTMLResponse)
async def _edgeos_index() -> HTMLResponse:
    return HTMLResponse(_PAGE.replace("__BASE__", _P))


@router.get(_P + "/health")
async def _edgeos_health() -> dict:
    return {"ok": True, "service": "edge_os"}


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


@router.get(_P + "/api/football/leagues")
async def _edgeos_leagues(_=Depends(_require_token)) -> dict:
    names = {"SP1": "La Liga", "E0": "Premier League", "SYNTH": "Liga sintetica"}
    out = [{"code": c, "name": names.get(c, c)} for c in _leagues_available()]
    return {"leagues": out}


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
        "league": league,
        "source": meta.get("source"),
        "simulated": bool(meta.get("simulated")),
        "n_matches": meta.get("n_matches"),
        "home_adv": round(getattr(dc, "home_adv_", 0.0), 3),
        "rho": round(getattr(dc, "rho_", 0.0), 3),
        "teams": rows,
        "verdict": _verdict(league),
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
    known = set(meta.get("teams", []))
    rh, ra = resolve_pair(home, away, known)
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
        "interval_home": [round(fc.p_home_interval[0], 3), round(fc.p_home_interval[1], 3)],
        "model_agreement": fc.model_agreement,
        "members": {k: [round(x, 3) for x in v] for k, v in fc.members.items()},
        "notes": fc.notes,
        "verdict": _verdict(league),
    }
    if mk is not None:
        out["over_2_5"] = round(mk.over.get(2.5, 0.0), 4)
        out["btts_yes"] = round(mk.btts_yes, 4)
        out["ah_home_-1"] = round(mk.ah_home.get(-1.0, 0.0), 4)
        out["fair_over_2_5"] = round(1 / mk.over[2.5], 2) if mk.over.get(2.5) else None
    return out


@router.get(_P + "/api/football/backtest")
async def _edgeos_backtest(league: str = Query("SP1"),
                           _=Depends(_require_token)) -> dict:
    v = _verdict(league)
    if not v:
        return {"league": league, "available": False,
                "message": "sin backtest empaquetado para esta liga"}
    return {"league": league, "available": True, **v}


@router.get(_P + "/api/odds/scan")
async def _edgeos_odds_scan(_=Depends(_require_token)) -> dict:
    def _run():
        from edge_os.config import Config
        from edge_os.engine import group_into_books
        from edge_os.providers import build_provider
        from edge_os.quant.arbitrage import detect_arbitrage
        from edge_os.quant.value import detect_value

        cfg = Config({
            "provider": "the-odds-api" if os.environ.get("THE_ODDS_API_KEY") else "mock",
            "sport": os.environ.get("EDGE_OS_SPORT", "soccer_spain_la_liga"),
            "markets": ["h2h"], "regions": ["eu", "uk"],
            "devig": {"method": "shin"},
            "fair_source": {"mode": "sharp",
                            "sharp_books": ["pinnacle", "betfair_ex_eu", "marathonbet"]},
            "value": {"min_edge": 0.02, "min_odds": 1.3, "max_odds": 10.0,
                      "max_hours_to_start": 96, "exclude_reference_books": True},
            "arbitrage": {"min_roi": 0.003, "exchange_commission": 0.02,
                          "max_hours_to_start": 96},
            "robust_ev": {}, "decision": {}, "kelly": {"fraction": 0.25, "cap": 0.03},
            "data_quality": {},
        })
        try:
            prov = build_provider(cfg)
        except RuntimeError as e:
            return {"error": str(e)}
        quotes = prov.fetch(cfg.get("sport"), ["h2h"], ["eu", "uk"])
        books = group_into_books(quotes)
        arbs, vals = [], []
        for b in books:
            a = detect_arbitrage(b, min_roi=0.003, exchange_commission=0.02,
                                 max_hours_to_start=96)
            if a:
                arbs.append({"match": a.match, "roi": round(a.roi, 4),
                             "sum_inverse": a.sum_inverse,
                             "legs": [{"outcome": l.outcome, "book": l.bookmaker,
                                       "price": l.price,
                                       "stake_pct": round(l.stake_fraction * 100, 1)}
                                      for l in a.legs]})
            for v in detect_value(b, vcfg=cfg.get("value"), devig_method="shin",
                                  fair_cfg=cfg.get("fair_source"),
                                  robust_cfg={}, decision_cfg={},
                                  kelly_cfg=cfg.get("kelly")):
                if v.decision == "NO BET":
                    continue
                vals.append({"match": v.match, "outcome": v.outcome,
                             "book": v.bookmaker, "price": v.price,
                             "edge": round(v.edge, 4),
                             "robust_ev": round(v.robust_ev, 4),
                             "decision": v.decision, "confidence": v.confidence})
        arbs.sort(key=lambda x: x["roi"], reverse=True)
        vals.sort(key=lambda x: x["robust_ev"], reverse=True)
        return {"provider": getattr(prov, "name", "?"),
                "remaining": getattr(prov, "last_remaining", None),
                "n_quotes": len(quotes), "arbs": arbs, "values": vals[:40]}

    return await asyncio.to_thread(_run)


# ── registro (lo llama server.py, protegido con try/except) ──────────────────
def register(app) -> None:
    if not EDGE_OS_PASSWORD:
        _log.info("edge_os desactivado (sin EDGE_OS_PASSWORD)")
        return
    app.include_router(router)
    _log.info("edge_os montado en /%s (oculto tras clave)", EDGE_OS_PATH)


# ── el panel (HTML autocontenido, sin dependencias externas) ────────────────
_PAGE = r"""<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>EDGE OS</title>
<style>
 :root{--bg:#0b0e13;--panel:#141922;--line:#232b38;--fg:#e6e9ef;--dim:#8a94a6;
       --accent:#4da3ff;--good:#3fb950;--warn:#d29922;--bad:#f85149}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,
      Segoe UI,Roboto,Helvetica,Arial,sans-serif}
 a{color:var(--accent)}
 .wrap{max-width:1080px;margin:0 auto;padding:20px}
 h1{font-size:18px;letter-spacing:.5px;margin:0 0 2px}
 .sub{color:var(--dim);font-size:12px;margin-bottom:18px}
 .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;
       padding:16px;margin-bottom:16px}
 input,select,button{font:inherit;color:var(--fg);background:#0e131b;
       border:1px solid var(--line);border-radius:7px;padding:8px 10px}
 button{background:var(--accent);color:#04121f;border:0;font-weight:600;cursor:pointer}
 button.ghost{background:#0e131b;color:var(--fg);border:1px solid var(--line);font-weight:500}
 button:disabled{opacity:.5;cursor:default}
 label{display:block;color:var(--dim);font-size:12px;margin:10px 0 4px}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
 th{color:var(--dim);font-weight:600}
 .tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}
 .t-bad{background:rgba(248,81,73,.14);color:var(--bad)}
 .t-warn{background:rgba(210,153,34,.16);color:var(--warn)}
 .t-good{background:rgba(63,185,80,.16);color:var(--good)}
 .row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
 .tabs{display:flex;gap:6px;margin-bottom:14px}
 .tabs button{background:#0e131b;color:var(--dim);border:1px solid var(--line)}
 .tabs button.on{background:var(--panel);color:var(--fg);border-bottom-color:var(--panel)}
 .kv{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:13px}
 .kv b{color:var(--dim);font-weight:600}
 .big{font-size:26px;font-weight:700}
 .muted{color:var(--dim)}
 pre{white-space:pre-wrap;font-size:12px;color:var(--dim);margin:0}
 .banner{border-left:3px solid var(--bad);background:rgba(248,81,73,.08);
         padding:10px 12px;border-radius:6px;font-size:12px;margin-bottom:12px}
</style></head><body><div class="wrap">
<h1>EDGE&nbsp;OS</h1>
<div class="sub">Inteligencia cuantitativa de mercados deportivos &mdash; panel privado</div>

<div id="login" class="card" style="max-width:340px">
  <label>Clave</label>
  <div class="row">
    <input id="pw" type="password" autocomplete="current-password" style="flex:1">
    <button id="go">Entrar</button>
  </div>
  <div id="lerr" class="muted" style="margin-top:8px;color:var(--bad)"></div>
</div>

<div id="app" style="display:none">
  <div class="banner">
    Los modelos <b>no estan validados</b> (sin odds historico intradia). El
    backtest de La Liga muestra que <b>pierden contra el mercado</b>
    (Brier 0.583 vs 0.563, ROI &minus;16%). Esto es analisis, no consejo de
    apuesta, y no coloca ninguna apuesta.
  </div>
  <div class="tabs">
    <button data-tab="futbol" class="on">Futbol</button>
    <button data-tab="cuotas">Cuotas</button>
  </div>

  <div id="tab-futbol">
    <div class="card">
      <div class="row">
        <div><label>Liga</label><select id="liga"></select></div>
        <div><label>Local</label><input id="home" placeholder="Real Madrid"></div>
        <div><label>Visitante</label><input id="away" placeholder="Barcelona"></div>
        <button id="pred">Predecir</button>
        <button id="tabla" class="ghost">Ver valoraciones</button>
      </div>
      <div id="pred-out" style="margin-top:14px"></div>
    </div>
    <div id="tabla-out"></div>
  </div>

  <div id="tab-cuotas" style="display:none">
    <div class="card">
      <div class="row">
        <button id="scan">Escanear cuotas</button>
        <span class="muted" id="scan-meta"></span>
      </div>
      <div id="scan-out" style="margin-top:14px"></div>
    </div>
  </div>
</div>

<script>
const BASE="__BASE__";
let TOKEN=sessionStorage.getItem("edgeos_tok")||"";
const $=s=>document.querySelector(s);
async function api(path,opts){
  opts=opts||{};opts.headers=Object.assign({"content-type":"application/json"},opts.headers||{});
  if(TOKEN)opts.headers.authorization="Bearer "+TOKEN;
  const r=await fetch(BASE+path,opts);
  if(r.status===401){logout();throw new Error("sesion caducada");}
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.detail||("error "+r.status));
  return j;
}
function logout(){TOKEN="";sessionStorage.removeItem("edgeos_tok");$("#app").style.display="none";$("#login").style.display="";}
function showApp(){$("#login").style.display="none";$("#app").style.display="";loadLeagues();}
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
  $("#tab-futbol").style.display=b.dataset.tab==="futbol"?"":"none";
  $("#tab-cuotas").style.display=b.dataset.tab==="cuotas"?"":"none";
});

async function loadLeagues(){
  try{
    const j=await api("/api/football/leagues");
    $("#liga").innerHTML=j.leagues.map(l=>`<option value="${l.code}">${l.name}</option>`).join("");
  }catch(e){}
}
function verdictBanner(v){
  if(!v)return "";
  const loses=v.beats_market===false||(v.roi!=null&&v.roi<0);
  const cls=loses?"t-bad":"t-good";
  const txt=loses
    ?`Backtest ${v.date}: este modelo PIERDE vs mercado (Brier ${v.brier_model} vs ${v.brier_market}`+
       (v.roi!=null?`, ROI ${(v.roi*100).toFixed(1)}% en ${v.n_bets} apuestas`:"")+")"
    :`Backtest ${v.date}: modelo >= mercado`;
  return `<div style="margin:8px 0"><span class="tag ${cls}">${txt}</span></div>`;
}
$("#pred").onclick=async()=>{
  const out=$("#pred-out");out.innerHTML="<span class=muted>calculando...</span>";
  try{
    const j=await api("/api/football/predict",{method:"POST",body:JSON.stringify({
      league:$("#liga").value,home:$("#home").value,away:$("#away").value})});
    const pct=x=>(x*100).toFixed(1)+"%";
    let mem="";for(const k in j.members)mem+=`<div><b>${k}</b> ${j.members[k].map(pct).join(" / ")}</div>`;
    out.innerHTML=verdictBanner(j.verdict)+`
      <div class="kv">
        <b>${j.home} (local)</b><span class="big">${pct(j.p_home)}</span>
        <b>Empate</b><span class="big">${pct(j.p_draw)}</span>
        <b>${j.away}</b><span class="big">${pct(j.p_away)}</span>
        <b>Cuotas justas</b><span>${j.fair_home} / ${j.fair_draw} / ${j.fair_away}</span>
        <b>Intervalo P(local)</b><span>${pct(j.interval_home[0])} &ndash; ${pct(j.interval_home[1])}</span>
        <b>Acuerdo modelos</b><span>${j.model_agreement}</span>
        <b>Over 2.5</b><span>${j.over_2_5!=null?pct(j.over_2_5)+" (justa "+j.fair_over_2_5+")":"&mdash;"}</span>
        <b>BTTS si</b><span>${j.btts_yes!=null?pct(j.btts_yes):"&mdash;"}</span>
      </div>
      <div class="muted" style="margin-top:8px">${mem}</div>
      <pre style="margin-top:8px">${(j.notes||[]).join(" · ")}</pre>`;
  }catch(e){out.innerHTML=`<span style="color:var(--bad)">${e.message}</span>`;}
};
$("#tabla").onclick=async()=>{
  const out=$("#tabla-out");out.innerHTML="<div class=card><span class=muted>cargando...</span></div>";
  try{
    const j=await api("/api/football/table?league="+encodeURIComponent($("#liga").value));
    const rows=j.teams.map(t=>`<tr><td>${t.team}</td><td>${t.strength}</td>
      <td>${t.atk}</td><td>${t.dfn}</td><td>${t.elo}</td><td>${t.eff_matches}</td></tr>`).join("");
    out.innerHTML=`<div class="card">
      <div class="muted">${j.league} · ${j.n_matches} partidos · fuente ${j.source}
        ${j.simulated?'<span class="tag t-warn">SIMULADO</span>':''}
        · ventaja local ${j.home_adv} · rho ${j.rho}</div>
      ${verdictBanner(j.verdict)}
      <table><thead><tr><th>Equipo</th><th>Fuerza</th><th>Ataque</th>
        <th>Defensa</th><th>Elo</th><th>Muestra ef.</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }catch(e){out.innerHTML=`<div class=card style="color:var(--bad)">${e.message}</div>`;}
};
$("#scan").onclick=async()=>{
  const out=$("#scan-out");out.innerHTML="<span class=muted>escaneando...</span>";
  try{
    const j=await api("/api/odds/scan");
    if(j.error){out.innerHTML=`<span class="muted">${j.error}</span>`;return;}
    $("#scan-meta").textContent=`proveedor ${j.provider} · ${j.n_quotes} cuotas`+
      (j.remaining!=null?` · quedan ${j.remaining}`:"")+
      (j.provider==="mock"?" · CUOTAS ALEATORIAS (sin THE_ODDS_API_KEY)":"");
    const arb=(j.arbs||[]).map(a=>`<tr><td>${a.match}</td><td>${(a.roi*100).toFixed(2)}%</td>
      <td class="muted">${a.legs.map(l=>l.outcome+" "+l.book+" @"+l.price+" ("+l.stake_pct+"%)").join(" · ")}</td></tr>`).join("");
    const val=(j.values||[]).map(v=>`<tr><td>${v.match}</td><td>${v.outcome}</td><td>${v.book}</td>
      <td>${v.price}</td><td>${(v.edge*100).toFixed(1)}%</td><td>${(v.robust_ev*100).toFixed(1)}%</td>
      <td><span class="tag t-warn">${v.decision}</span></td></tr>`).join("");
    out.innerHTML=`
      <h3 style="font-size:13px;color:var(--dim)">Arbitrajes (${j.arbs.length})</h3>
      <table><thead><tr><th>Partido</th><th>ROI</th><th>Patas</th></tr></thead><tbody>${arb||'<tr><td colspan=3 class=muted>ninguno</td></tr>'}</tbody></table>
      <h3 style="font-size:13px;color:var(--dim);margin-top:14px">Value +EV (${j.values.length})</h3>
      <table><thead><tr><th>Partido</th><th>Resultado</th><th>Casa</th><th>Cuota</th>
        <th>EV</th><th>EV robusto</th><th>Decision</th></tr></thead><tbody>${val||'<tr><td colspan=7 class=muted>nada accionable</td></tr>'}</tbody></table>`;
  }catch(e){out.innerHTML=`<span style="color:var(--bad)">${e.message}</span>`;}
};

if(TOKEN)showApp();
</script>
</div></body></html>"""
