"use strict";
/* EDGE OS — interfaz. Decide primero; explica después; nunca precisión falsa. */

const BASE = document.documentElement.dataset.base || "";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const S = {
  token: sessionStorage.getItem("edgeos_token") || "",
  board: null, research: null, settings: null, alerts: [], budget: null,
  scope: localStorage.getItem("edgeos_scope") || "soon",
  compare: new Set(), timers: [], busy: false,
};

const STATE = {
  EXCEPCIONAL: { cls: "fire", emoji: "🔥", label: "EXCEPCIONAL" },
  APOSTAR: { cls: "go", emoji: "🟢", label: "APOSTAR" },
  INTERESANTE: { cls: "int", emoji: "🟡", label: "INTERESANTE" },
  ESPERAR: { cls: "wait", emoji: "🟠", label: "ESPERAR" },
  WATCH: { cls: "watch", emoji: "👀", label: "VIGILAR" },
  NO_BET: { cls: "no", emoji: "❌", label: "NO APOSTAR" },
  DATOS_NO_FIABLES: { cls: "warn", emoji: "⚠️", label: "DATOS NO FIABLES" },
  MODELO_DESACTIVADO: { cls: "off", emoji: "⛔", label: "MODELO DESACTIVADO" },
};
const STATE_ORDER = Object.keys(STATE);
const STRAT = {
  ACTIVE: ["go", "ACTIVA"], WATCH: ["watch", "EN OBSERVACIÓN"], DEGRADED: ["int", "DEGRADADA"],
  DISABLED: ["off", "DESACTIVADA"], REJECTED: ["off", "RECHAZADA"],
};
const MCODE = { "1X2": "Resultado (1X2)", OU25: "Más/Menos 2.5", AH: "Hándicap asiático" };
const MARKET = { h2h: "Resultado", totals: "Goles", spreads: "Hándicap" };
const ACTIONABLE = ["EXCEPCIONAL", "APOSTAR", "INTERESANTE"];

/* ── formato ─────────────────────────────────────────────────────────── */
const isNum = (x) => typeof x === "number" && isFinite(x);
const pct = (x, d = 0) => (isNum(x) ? (x * 100).toFixed(d) + " %" : "—");
const spct = (x, d = 1) => (isNum(x) ? (x > 0 ? "+" : "") + (x * 100).toFixed(d) + " %" : "—");
const odds = (x) => (isNum(x) ? x.toFixed(2) : "—");
const round5 = (p) => (isNum(p) ? Math.round(p * 20) * 5 + " %" : "—");
function ago(sec) {
  if (!isNum(sec)) return "—";
  const s = Math.max(0, sec);
  if (s < 90) return Math.round(s) + " s";
  if (s < 5400) return Math.round(s / 60) + " min";
  return (s / 3600).toFixed(1) + " h";
}
function when(d) {
  if (d.live) return d.score ? "EN JUEGO · " + esc(d.score) : "EN JUEGO · marcador desconocido";
  const m = d.minutes_to_start;
  if (!isNum(m)) return "";
  if (m < 90) return "empieza en " + Math.round(m) + " min";
  if (m < 48 * 60) return "empieza en " + (m / 60).toFixed(1) + " h";
  return dt(d.commence_time);
}
function dt(iso) {
  if (!iso) return "—";
  const t = new Date(iso);
  return t.toLocaleString("es-ES", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
const stateOf = (d) => STATE[d.state] || STATE.NO_BET;
const badge = (d, big) => { const s = stateOf(d); return `<span class="badge s-${s.cls}${big ? " big" : ""}">${s.emoji} ${s.label}</span>`; };
const marketName = (d) => MCODE[d.market_code] || MARKET[d.market] || d.market;
const oppLink = (d) => "#/oportunidad/" + encodeURIComponent(d.id);
const evLink = (d) => "#/evento/" + encodeURIComponent(d.event_id);

function edgeLabel(d) {
  if (!isNum(d.e_clv)) return { t: "—", i: "" };
  const strat = S.research && S.research.strategies ? S.research.strategies[d.strategy_key] : null;
  const exc = strat && strat.exceptional ? strat.exceptional.e_clv_lo_p90 : null;
  let t = "No demostrada";
  if (isNum(d.e_clv_lo) && d.e_clv_lo > 0) t = isNum(exc) && d.e_clv_lo >= exc ? "Grande" : "Positiva";
  else if (d.e_clv > 0) t = "Incierta";
  return { t, i: spct(d.e_clv) + (isNum(d.e_clv_lo) ? " (mín. " + spct(d.e_clv_lo) + ")" : "") };
}

/* ── red ─────────────────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  const o = Object.assign({}, opts, { headers: Object.assign({ "content-type": "application/json" }, opts.headers || {}) });
  if (S.token) o.headers.authorization = "Bearer " + S.token;
  const r = await fetch(BASE + path, o);
  if (r.status === 401 && path !== "/api/login") { logout("La sesión ha caducado: vuelve a entrar."); throw new Error("sesión caducada"); }
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) throw new Error((j && j.detail) || "HTTP " + r.status);
  return j;
}
function toast(msg, ms = 6000) {
  const t = $("#toast");
  t.innerHTML = msg;
  t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { t.hidden = true; }, ms);
}

/* ── sesión ──────────────────────────────────────────────────────────── */
function logout(msg) {
  S.token = "";
  sessionStorage.removeItem("edgeos_token");
  S.timers.forEach(clearInterval);
  S.timers = [];
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#login-err").textContent = msg || "";
}
$("#login-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("#login-err").textContent = "";
  try {
    const j = await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#pw").value }) });
    S.token = j.token;
    sessionStorage.setItem("edgeos_token", S.token);
    $("#pw").value = "";
    start();
  } catch (e) { $("#login-err").textContent = e.message; }
});

async function start() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  try {
    const [settings, research] = await Promise.all([api("/api/settings"), api("/api/research")]);
    S.settings = settings;
    S.research = research;
  } catch (e) { toast("No pude cargar la configuración: " + esc(e.message)); }
  $("#side-foot").innerHTML = S.research ? "Calibración " + esc(S.research.version) : "";
  paintScope();
  await refreshBoard();
  await refreshAlerts();
  S.timers.push(setInterval(refreshBoard, 60000));
  S.timers.push(setInterval(refreshAlerts, 60000));
  route();
}

/* ── datos compartidos ───────────────────────────────────────────────── */
async function refreshBoard() {
  try {
    S.board = await api("/api/board");
    paintCredits(S.board.budget);
    const r = currentRoute();
    if (["ahora", "directo", "mejores", "comparar", ""].includes(r.name)) route();
  } catch (e) { if (e.message !== "sesión caducada") toast("No pude leer el tablero: " + esc(e.message)); }
}
async function refreshAlerts() {
  try {
    S.alerts = await api("/api/alerts");
    const unread = S.alerts.filter((a) => !a.read).length;
    $("#bell-n").hidden = unread === 0;
    $("#bell-n").textContent = unread;
  } catch (e) { /* silencioso: la campana no es crítica */ }
}
function paintCredits(b) {
  const el = $("#credits");
  if (!b) { el.textContent = ""; return; }
  if (b.mock) { el.className = "pill warn"; el.textContent = "SINTÉTICO"; return; }
  if (b.remaining == null) { el.className = "pill"; el.textContent = "créditos: aún sin consultar"; return; }
  const low = isNum(b.allowance_today) && b.spent_today >= b.allowance_today;
  el.className = "pill " + (b.remaining <= b.reserve + 5 ? "bad" : low ? "warn" : "ok");
  el.textContent = "quedan " + b.remaining + " · hoy " + b.spent_today + "/" + (isNum(b.allowance_today) ? Math.floor(b.allowance_today) : "—");
}
function paintScope() {
  $$(".scope .chip").forEach((c) => c.classList.toggle("on", c.dataset.scope === S.scope));
}
$$(".scope .chip").forEach((c) => c.addEventListener("click", () => {
  S.scope = c.dataset.scope;
  localStorage.setItem("edgeos_scope", S.scope);
  paintScope();
}));
$("#scan").addEventListener("click", () => scan(false));

async function scan(forced) {
  if (S.busy) return;
  S.busy = true;
  const btn = $("#scan");
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Buscando…';
  try {
    const r = await api("/api/scan", { method: "POST", body: JSON.stringify({ scope: S.scope, forced }) });
    paintCredits(r.budget);
    await refreshBoard();                 // el tablero completo, no solo lo que trajo este escaneo
    const parts = [];
    parts.push(r.sports_fetched.length ? "Precios nuevos de " + r.sports_fetched.length + " competición(es)" : "No se ha pedido ningún precio");
    if (r.pulse && r.pulse.blind) parts.push("⚠️ el barrido gratuito no vio ningún partido: se pidieron precios igualmente");
    if (r.sports_skipped.length) parts.push("sin pedir: " + esc(r.sports_skipped[0].reason));
    if (r.errors.length) parts.push("errores: " + esc(r.errors.join("; ")));
    if (r.side_effects && r.side_effects.paper_bets_opened) parts.push(r.side_effects.paper_bets_opened + " apuesta(s) en papel registradas");
    toast(parts.join(" · "), 9000);
    if (r.sports_skipped.length && !forced && r.sports_skipped[0].reason.includes("presupuesto del día")) {
      if (confirm("Has gastado el presupuesto de créditos de hoy. ¿Pedir precios igualmente?")) { S.busy = false; btn.disabled = false; return scan(true); }
    }
    await refreshAlerts();
    route();
  } catch (e) {
    toast("No pude actualizar: " + esc(e.message));
  } finally {
    S.busy = false;
    btn.disabled = false;
    btn.textContent = "Actualizar precios";
  }
}

/* ── alertas ─────────────────────────────────────────────────────────── */
$("#bell").addEventListener("click", async () => {
  const pop = $("#alerts-pop");
  if (!pop.hidden) { pop.hidden = true; return; }
  await refreshAlerts();
  pop.innerHTML = S.alerts.length
    ? S.alerts.map((a) => `<div class="al ${a.read ? "" : "unread"}"><div>${esc(a.text)}</div><div class="dim" style="font-size:12px">${dt(a.created_at)}${a.selection_id ? ` · <a href="#/oportunidad/${encodeURIComponent(a.selection_id)}">ver</a>` : ""}</div></div>`).join("")
    : '<div class="empty">Sin alertas.</div>';
  pop.hidden = false;
  const unread = S.alerts.filter((a) => !a.read).map((a) => a.alert_id);
  if (unread.length) {
    try { await api("/api/alerts/read", { method: "POST", body: JSON.stringify({ ids: unread }) }); } catch (e) { /* no crítico */ }
    $("#bell-n").hidden = true;
  }
});
document.addEventListener("pointerdown", (e) => {
  const pop = $("#alerts-pop");
  if (!pop.hidden && !pop.contains(e.target) && e.target !== $("#bell")) pop.hidden = true;
});

/* ── router ──────────────────────────────────────────────────────────── */
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  const i = h.indexOf("/");
  return i < 0 ? { name: h, arg: "" } : { name: h.slice(0, i), arg: decodeURIComponent(h.slice(i + 1)) };
}
const VIEWS = {
  ahora: viewNow, directo: viewLive, mejores: viewBest, evento: viewEvent, oportunidad: viewOpp,
  comparar: viewCompare, vigilar: viewWatch, historial: viewHistory, rendimiento: viewPerformance,
  investigacion: viewResearch, replay: viewReplay, ajustes: viewSettings, mas: viewMore,
};
function route() {
  if (!S.token) return;
  const r = currentRoute();
  const fn = VIEWS[r.name] || viewNow;
  $$("#nav a, #tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.r === (VIEWS[r.name] ? r.name : "ahora")));
  Promise.resolve(fn(r.arg)).catch((e) => { $("#main").innerHTML = `<div class="card err">Error: ${esc(e.message)}</div>`; });
}
window.addEventListener("hashchange", route);

/* ── piezas ──────────────────────────────────────────────────────────── */
function statusBar(b, extra = "") {
  if (!b) return "";
  const seen = b.data_observed_at || (b.decisions || []).reduce((m, d) => (d.observed_at > (m || "") ? d.observed_at : m), null);
  const age = seen ? (Date.now() - new Date(seen).getTime()) / 1000 : null;
  const mock = b.mock ? '<div class="mock">DATOS SINTÉTICOS · estos precios no existen: son para ver la interfaz. Configura THE_ODDS_API_KEY para cuotas reales.</div>' : "";
  const ageTxt = age == null ? '<span class="pill warn">todavía no hay precios guardados: pulsa «Actualizar precios»</span>'
    : `<span class="pill ${age > 900 ? "warn" : "ok"}">precios de hace ${ago(age)}</span>`;
  return `${mock}<div class="status">${ageTxt}<span class="pill">${b.events || 0} partidos</span>${extra}</div>`;
}
function kv(label, value, sub, hl) {
  return `<div class="kv${hl ? " hl" : ""}"><span>${esc(label)}</span><b>${value}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
}
function list(items) {
  return items && items.length ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : '<p class="dim">—</p>';
}
function decisionCard(d) {
  const s = stateOf(d);
  const main = (d.why_not && d.why_not[0]) || (d.why && d.why[0]) || "";
  return `<article class="dcard s-${s.cls}" data-href="${oppLink(d)}">
    <header>${badge(d)}<span class="meta">${esc(d.sport_title)} · ${when(d)}</span></header>
    <div class="ev">${esc(d.event_name)}</div>
    <div class="small">${esc(marketName(d))} · <b>${esc(d.selection)}</b></div>
    <div class="row"><span class="odds">${odds(d.best_odds)}</span>
      <span class="small">${d.best_book ? "en " + esc(d.best_book) : ""}</span>
      <span class="small">justa ${odds(d.fair_odds)}</span>
      ${isNum(d.min_odds) ? `<span class="small">mín. ${odds(d.min_odds)}</span>` : ""}
      ${isNum(d.target_odds) ? `<span class="small">objetivo ${odds(d.target_odds)}</span>` : ""}</div>
    <div class="reason">${esc(main)}</div>
  </article>`;
}
function bindCards(root) {
  $$("[data-href]", root).forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest("button, a, input")) return;
    location.hash = el.dataset.href;
  }));
}
function stratWhy(st) {
  const r = st.reasons || [];
  const pick = st.state === "ACTIVE" ? r.slice(0, 2) : (r.slice(1, 3).length ? r.slice(1, 3) : r.slice(0, 1));
  return pick.join(" · ");
}
function strategyStrip() {
  if (!S.research) return "";
  const keys = ["1X2|max", "OU25|max", "AH|max"];
  const live = (S.board && S.board.live_states) || {};
  const rows = keys.filter((k) => S.research.strategies[k]).map((k) => {
    const st = S.research.strategies[k];
    const [cls, lab] = STRAT[st.state] || ["no", st.state];
    const o = (st.oos && st.oos.strategy) || {};
    return `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
      <b>${esc(MCODE[st.market] || st.market)}</b><span class="badge s-${cls}">${lab}</span></div>
      <p class="dim" style="font-size:13px;margin:8px 0 0">${esc(stratWhy(st))}</p>
      ${o.n ? `<p class="mute" style="font-size:12px;margin:6px 0 0">Histórico fuera de muestra: CLV ${spct(o.clv_mean, 2)} en ${o.n} apuestas.</p>` : ""}
      ${live[k] ? `<p style="font-size:12px;margin:6px 0 0">En vivo: <b>${esc(live[k].state)}</b></p>` : ""}</div>`;
  });
  return `<h2>Estado de las estrategias</h2><div class="strats">${rows.join("")}</div>`;
}

/* ── AHORA ───────────────────────────────────────────────────────────── */
function heroBet(d) {
  const s = stateOf(d);
  const e = edgeLabel(d);
  return `<div class="hero s-${s.cls}">
    <div class="hero-title">${esc(S.board.headline.title)}</div>
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">${badge(d, true)}<span class="dim">${esc(d.sport_title)} · ${when(d)}</span></div>
    <div class="ev-name" style="margin-top:12px">${esc(d.event_name)}</div>
    <div class="sel-line">${esc(marketName(d))} · <b>${esc(d.selection)}</b></div>
    <div class="bigrow">
      <div class="big-odds">${odds(d.best_odds)}<small>en ${esc(d.best_book)}</small></div>
      <div class="kvs">
        ${kv("Nuestra probabilidad", pct(d.p_fair), isNum(d.p_close_lo) ? "cierre probable " + pct(d.p_close_lo) + "–" + pct(d.p_close_hi) : "")}
        ${kv("Cuota justa", odds(d.fair_odds))}
        ${kv("Ventaja estimada", esc(e.t), e.i, true)}
        ${kv("Hasta qué cuota", odds(d.min_odds), "por debajo, no", true)}
      </div>
    </div>
    <div class="blocks">
      <div class="block"><h3>¿Por qué?</h3>${list(d.why)}</div>
      <div class="block"><h3>Principal riesgo</h3>${list(d.risks)}</div>
      <div class="block"><h3>¿Por qué ahora?</h3>${list(d.why_now)}</div>
      <div class="block"><h3>Qué cambiaría la decisión</h3>${list(d.would_change)}</div>
    </div>
    ${d.state !== "EXCEPCIONAL" && d.not_exceptional && d.not_exceptional.length ? `<details style="margin-top:12px"><summary>Por qué no es 🔥</summary>${list(d.not_exceptional)}</details>` : ""}
    <div class="actions">
      <a class="btn primary" href="${oppLink(d)}">Ver detalle</a>
      <button class="btn" data-bet="${esc(d.id)}">Registrar apuesta</button>
      <button class="btn" data-watch="${esc(d.id)}">Vigilar</button>
      <a class="btn ghost" href="${evLink(d)}">Ver partido</a>
    </div>
  </div>`;
}
function heroNothing(b) {
  const h = b.headline;
  const counts = STATE_ORDER.filter((k) => h.counts[k]).map((k) => `<span class="badge s-${STATE[k].cls}">${STATE[k].emoji} ${STATE[k].label} · ${h.counts[k]}</span>`).join("");
  const strat = S.research ? Object.values(S.research.strategies).filter((s) => s.price_class === "max") : [];
  const active = strat.filter((s) => s.state === "ACTIVE").length;
  const why = !b.events
    ? "Todavía no hay precios guardados. Pulsa «Actualizar precios»: el barrido de partidos es gratis y solo se gastan créditos donde hay algo que mirar."
    : active === 0
      ? "Ninguna estrategia tiene ahora mismo una ventaja demostrada fuera de muestra (mira Investigación). EDGE OS no dirá «apostar» hasta que la evidencia —la del histórico o la que se va acumulando en papel— lo justifique."
      : "Casi todos los precios están bien puestos. Solo aparece algo cuando una casa se queda por detrás del mercado y el histórico dice que esa diferencia suele ser real.";
  const c = h.closest;
  return `<div class="hero nothing">
    <div class="hero-title">Ahora mismo</div>
    <h1>No hay nada que merezca la pena ahora mismo.</h1>
    <p class="dim">${esc(why)}</p>
    <div class="counts">${counts}</div>
    ${c ? `<h2 style="margin-top:18px">Lo más cercano · no es una recomendación</h2><div class="cards">${decisionCard(c)}</div>` : ""}
  </div>`;
}
function viewTile(title, sub, d) {
  if (!d) return `<div class="vtile"><h3>${esc(title)}</h3><p>${esc(sub)}</p><div class="dim">Nada ahora.</div></div>`;
  return `<div class="vtile" data-href="${oppLink(d)}" style="cursor:pointer"><h3>${esc(title)}</h3><p>${esc(sub)}</p>
    <div>${badge(d)}</div><div style="margin-top:8px;font-weight:700">${esc(d.event_name)}</div>
    <div class="dim" style="font-size:13px">${esc(marketName(d))} · ${esc(d.selection)}</div>
    <div class="odds">${odds(d.best_odds)} <span class="dim" style="font-size:13px;font-weight:500">prob. ${pct(d.p_fair)}</span></div></div>`;
}
function viewNow() {
  const b = S.board;
  if (!b) { $("#main").innerHTML = '<div class="empty"><span class="spin"></span> Cargando…</div>'; return; }
  const others = b.decisions.filter((d) => ["INTERESANTE", "ESPERAR", "APOSTAR", "EXCEPCIONAL"].includes(d.state)
    && !(b.headline.top && d.id === b.headline.top.id) && !(b.headline.closest && d.id === b.headline.closest.id)).slice(0, 5);
  $("#main").innerHTML = `${statusBar(b)}
    ${b.headline.has_bet ? heroBet(b.headline.top) : heroNothing(b)}
    <h2>Tres preguntas distintas</h2>
    <div class="grid3">${viewTile("Lo más probable", "Qué es más probable que pase, pague lo que pague", b.views.most_likely)}
      ${viewTile("Mejor apuesta", "Dónde el precio parece peor puesto", b.views.best_bet)}
      ${viewTile("Mejor calidad/precio", "Más ventaja por cada unidad de riesgo", b.views.best_quality_price)}</div>
    <h2>Otras oportunidades</h2>
    ${others.length ? `<div class="cards">${others.map(decisionCard).join("")}</div>` : '<div class="note">Ninguna más que valga la pena enseñar.</div>'}
    ${strategyStrip()}`;
  bindCards($("#main"));
  bindActions($("#main"));
}

/* ── DIRECTO ─────────────────────────────────────────────────────────── */
function groupByEvent(decs) {
  const m = new Map();
  decs.forEach((d) => { if (!m.has(d.event_id)) m.set(d.event_id, []); m.get(d.event_id).push(d); });
  return Array.from(m.values());
}
function viewLive() {
  const b = S.board;
  if (!b) return viewNow();
  const live = b.decisions.filter((d) => d.live);
  const groups = groupByEvent(live);
  $("#main").innerHTML = `${statusBar(b)}
    <div class="warnbox"><b>⚠️ En directo nada está validado.</b> El proveedor da el marcador (a veces) pero no el minuto, los tiros ni las tarjetas, y los precios cambian antes de que podamos confirmarlos. Se enseñan los números; EDGE OS no recomienda apuestas en directo.</div>
    <h2>Partidos en juego (${groups.length})</h2>
    ${groups.length ? groups.map(eventBlock).join("") : '<div class="note">No hay partidos en juego en los precios guardados. Elige «En directo» arriba y pulsa «Actualizar precios».</div>'}`;
  bindCards($("#main"));
}
function eventBlock(decs) {
  const d0 = decs[0];
  const byMarket = new Map();
  decs.forEach((d) => { const k = d.market + "|" + (d.line == null ? "" : d.line); if (!byMarket.has(k)) byMarket.set(k, []); byMarket.get(k).push(d); });
  return `<div class="card market"><div class="ev-head"><div><div style="font-weight:800;font-size:18px">${esc(d0.event_name)}</div>
    <div class="dim">${esc(d0.sport_title)} · ${when(d0)}</div></div><a class="btn" href="${evLink(d0)}">Abrir partido</a></div>
    ${Array.from(byMarket.values()).map((ms) => `<div style="margin:10px 0 4px" class="dim">${esc(marketName(ms[0]))}${ms[0].line != null ? " " + esc(ms[0].line) : ""}</div>
      <div class="tiles">${ms.map(tile).join("")}</div>`).join("")}</div>`;
}
function tile(d) {
  const s = stateOf(d);
  return `<div class="tile s-${s.cls}" data-href="${oppLink(d)}"><div class="n">${esc(d.selection)}</div>
    <div class="o">${odds(d.best_odds)}</div><div class="b">${d.best_book ? esc(d.best_book) : "sin precio"} · justa ${odds(d.fair_odds)}</div>
    <div>${badge(d)}</div></div>`;
}

/* ── MEJORES ─────────────────────────────────────────────────────────── */
function viewBest() {
  const b = S.board;
  if (!b) return viewNow();
  const f = S.bestFilter || "util";
  const pre = b.decisions.filter((d) => !d.live);
  const rows = pre.filter((d) => f === "util" ? ["EXCEPCIONAL", "APOSTAR", "INTERESANTE", "ESPERAR", "WATCH"].includes(d.state)
    : f === "todo" ? !d.no_reference : d.state === f);
  const chips = [["util", "Con algo"], ["APOSTAR", "Apostar"], ["INTERESANTE", "Interesantes"], ["ESPERAR", "Esperar"], ["WATCH", "Vigilar"], ["todo", "Todo"]]
    .map(([k, l]) => `<button class="chip ${f === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("");
  const noref = pre.filter((d) => d.no_reference).length;
  $("#main").innerHTML = `${statusBar(b)}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${chips}</div>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Decisión</th><th>Evento</th><th>Mercado</th><th class="n">Cuota</th><th class="n">Prob.</th><th class="n">Cuota justa</th><th class="n">Ventaja</th><th class="n">Hasta</th></tr></thead><tbody>
      ${rows.slice(0, 200).map((d) => `<tr class="click" data-href="${oppLink(d)}"><td>${badge(d)}</td>
        <td><b>${esc(d.event_name)}</b><div class="dim" style="font-size:12px">${esc(d.sport_title)} · ${when(d)}</div></td>
        <td>${esc(marketName(d))}<div class="dim" style="font-size:12px">${esc(d.selection)}</div></td>
        <td class="n"><b>${odds(d.best_odds)}</b><div class="dim" style="font-size:12px">${esc(d.best_book || "")}</div></td>
        <td class="n">${pct(d.p_fair)}</td><td class="n">${odds(d.fair_odds)}</td>
        <td class="n">${esc(edgeLabel(d).t)}<div class="dim" style="font-size:12px">${spct(d.e_clv)}</div></td>
        <td class="n">${odds(d.min_odds || d.target_odds)}</td></tr>`).join("")}</tbody></table></div>`
    : '<div class="note">Nada con este filtro. Es lo normal: la mayoría de los precios están bien puestos.</div>'}
    ${noref ? `<p class="mute" style="font-size:13px">${noref} selecciones no se enseñan porque Pinnacle no cotiza esa línea: sin referencia no hay precio justo.</p>` : ""}`;
  $$("[data-f]").forEach((c) => c.addEventListener("click", () => { S.bestFilter = c.dataset.f; viewBest(); }));
  bindCards($("#main"));
}

/* ── OPORTUNIDAD ─────────────────────────────────────────────────────── */
function findDecision(id) {
  return S.board ? S.board.decisions.find((d) => d.id === id) : null;
}
function viewOpp(id) {
  const d = findDecision(id);
  if (!d) {
    $("#main").innerHTML = '<div class="note">Esta selección ya no está en los precios guardados (puede que el partido haya empezado o que haga falta actualizar).</div>';
    return;
  }
  const s = stateOf(d);
  const e = edgeLabel(d);
  const st = S.research && S.research.strategies[d.strategy_key];
  const o = st && st.oos ? st.oos.strategy || {} : {};
  $("#main").innerHTML = `<a href="#/ahora" class="dim">← Ahora</a>
    <div class="hero s-${s.cls}" style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">${badge(d, true)}<span class="dim">${esc(d.sport_title)} · ${when(d)}</span></div>
      <h2 style="margin-top:16px">Apuesta</h2><div class="ev-name">${esc(d.selection)}</div>
      <div class="sel-line">${esc(d.event_name)} · ${esc(marketName(d))}</div>
      <div class="bigrow"><div class="big-odds">${odds(d.best_odds)}<small>${d.best_book ? "en " + esc(d.best_book) : ""}${isNum(d.best_odds_net) && d.best_odds_net !== d.best_odds ? " · " + odds(d.best_odds_net) + " tras comisión" : ""}</small></div>
        <div class="kvs">
          ${kv("Nuestra probabilidad", pct(d.p_fair), isNum(d.p_close_lo) ? "al cierre, 90 % entre " + pct(d.p_close_lo) + " y " + pct(d.p_close_hi) : "")}
          ${kv("Cuota justa", odds(d.fair_odds))}
          ${kv("Ventaja estimada", esc(e.t), e.i, true)}
          ${kv("Hasta qué cuota", odds(d.min_odds), "cuota mínima aceptable", true)}
          ${kv("Se cancela por debajo de", odds(d.invalidation_odds))}
          ${isNum(d.target_odds) ? kv("Apostar a partir de", odds(d.target_odds), "si sube hasta aquí", true) : ""}
          ${kv("¿Ventaja real?", isNum(d.p_real) ? "~" + round5(d.p_real) : "—", isNum(d.p_real_n) ? "en " + d.p_real_n + " casos parecidos" : "")}
          ${isNum(d.stake_amount) ? kv("Tamaño prudente", d.stake_amount.toFixed(0) + " €", pct(d.stake_fraction, 2) + " del bote") : ""}
        </div></div>
      <div class="blocks">
        <div class="block"><h3>Por qué</h3>${list(d.why)}</div>
        <div class="block"><h3>Por qué no / qué falta</h3>${list(d.why_not)}</div>
        <div class="block"><h3>Riesgo</h3>${list(d.risks)}</div>
        <div class="block"><h3>¿Por qué ahora?</h3>${list(d.why_now)}</div>
        <div class="block"><h3>Qué cambiaría la decisión</h3>${list(d.would_change)}</div>
        ${d.not_exceptional && d.not_exceptional.length ? `<div class="block"><h3>Por qué no es 🔥</h3>${list(d.not_exceptional)}</div>` : ""}
      </div>
      <div class="actions">
        <button class="btn primary" data-bet="${esc(d.id)}">Registrar apuesta</button>
        <button class="btn" data-watch="${esc(d.id)}">Vigilar</button>
        <button class="btn" data-cmp="${esc(d.id)}">${S.compare.has(d.id) ? "Quitar de comparar" : "Añadir a comparar"}</button>
        <a class="btn ghost" href="${evLink(d)}">Ver partido</a>
      </div>
    </div>
    ${st ? `<h2>La evidencia detrás</h2><div class="card">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(MCODE[st.market] || st.market)}</b><span class="badge s-${(STRAT[d.strategy_state] || ["no"])[0]}">${esc((STRAT[d.strategy_state] || ["", d.strategy_state || ""])[1])}</span></div>
      ${list(st.reasons)}
      ${o.n ? `<p class="dim">Fuera de muestra: ${o.n} apuestas, CLV ${spct(o.clv_mean, 2)} (IC 95 % ${spct(o.clv_lo95, 2)} a ${spct(o.clv_hi95, 2)}), ROI ${spct(o.roi, 1)}.</p>` : ""}
      <a href="#/investigacion">Ver la validación completa</a></div>` : ""}
    <p class="mute" style="font-size:12px">Datos observados ${dt(d.observed_at)} (hace ${ago(d.data_age_s)}).</p>`;
  bindActions($("#main"));
}

/* ── acciones comunes ────────────────────────────────────────────────── */
function bindActions(root) {
  $$("[data-bet]", root).forEach((b) => b.addEventListener("click", () => registerBet(b.dataset.bet)));
  $$("[data-watch]", root).forEach((b) => b.addEventListener("click", () => addWatch(b.dataset.watch)));
  $$("[data-cmp]", root).forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.cmp;
    if (S.compare.has(id)) S.compare.delete(id); else S.compare.add(id);
    b.textContent = S.compare.has(id) ? "Quitar de comparar" : "Añadir a comparar";
    toast(S.compare.size + " en comparación · <a href='#/comparar'>comparar</a>");
  }));
}
async function registerBet(id) {
  const d = findDecision(id);
  if (!d) return toast("Esa selección ya no está en el tablero.");
  const o = prompt(`¿A qué cuota la has cogido? (EDGE OS la vio a ${odds(d.best_odds)}; mínimo aceptable ${odds(d.min_odds)})`, d.best_odds ? d.best_odds.toFixed(2) : "");
  if (!o) return;
  const book = prompt("¿En qué casa?", d.best_book || "");
  if (book == null) return;
  const stake = prompt("¿Cuánto (en unidades o euros)?", "1");
  if (!stake) return;
  try {
    await api("/api/bets", { method: "POST", body: JSON.stringify({ id, odds: parseFloat(o.replace(",", ".")), book, stake: parseFloat(stake.replace(",", ".")) }) });
    toast("Apuesta registrada. Se medirá contra el cierre y se liquidará sola.");
  } catch (e) { toast("No se pudo registrar: " + esc(e.message)); }
}
async function addWatch(id) {
  const d = findDecision(id);
  if (!d) return toast("Esa selección ya no está en el tablero.");
  const def = d.target_odds || d.min_odds || d.best_odds;
  const t = prompt("¿Avisar cuando la mejor cuota llegue a…?", def ? def.toFixed(2) : "");
  if (!t) return;
  try {
    const r = await api("/api/watch", { method: "POST", body: JSON.stringify({ id, target_odds: parseFloat(t.replace(",", ".")) }) });
    toast(r.created ? "Vigilando. Cuando aparezca ese precio se recalcula y te avisa." : "Ya estabas vigilando esta selección.");
  } catch (e) { toast("No se pudo vigilar: " + esc(e.message)); }
}

/* ── EVENTO ──────────────────────────────────────────────────────────── */
async function viewEvent(id, fetch) {
  $("#main").innerHTML = '<div class="empty"><span class="spin"></span> Cargando partido…</div>';
  const r = await api("/api/event/" + encodeURIComponent(id) + (fetch ? "?fetch=1" : ""));
  if (!r.found) { $("#main").innerHTML = `<div class="note">No hay precios guardados de este partido.${r.note ? " " + esc(r.note) : ""}</div>`; return; }
  const decs = r.decisions;
  const d0 = decs[0];
  const byMarket = new Map();
  decs.forEach((d) => { const k = d.market + "|" + (d.line == null ? "" : +d.line); if (!byMarket.has(k)) byMarket.set(k, []); byMarket.get(k).push(d); });
  const seriesKey = (d) => d.market + "|" + (d.line == null ? "" : String(+d.line));
  $("#main").innerHTML = `<a href="#/ahora" class="dim">← Ahora</a>
    <div class="ev-head" style="margin-top:10px"><div><div class="ev-name">${esc(d0.event_name)}</div><div class="dim">${esc(d0.sport_title)} · ${when(d0)}</div></div>
      <button class="btn" id="more-markets">Traer más mercados (≈3 créditos)</button></div>
    ${r.note ? `<div class="warnbox">${esc(r.note)}</div>` : ""}
    <div class="note" style="margin-bottom:14px">Alineaciones, lesiones y noticias: <b>sin fuente conectada (UNKNOWN)</b>. Nada de eso se tiene en cuenta ni se inventa.</div>
    ${Array.from(byMarket.values()).filter((ms) => !ms.every((x) => x.no_reference)).map((ms) => `<div class="card market">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${esc(marketName(ms[0]))}${ms[0].line != null ? " · línea " + esc(ms[0].line) : ""}</b><span class="dim">${ms[0].n_books} casas</span></div>
      <div class="tiles" style="margin-top:10px">${ms.map(tile).join("")}</div>
      ${chart(r.series[seriesKey(ms[0])], ms)}</div>`).join("")}
    ${Array.from(byMarket.values()).filter((ms) => ms.every((x) => x.no_reference)).length ? `<p class="mute" style="font-size:13px">Hay ${Array.from(byMarket.values()).filter((ms) => ms.every((x) => x.no_reference)).length} líneas más sin Pinnacle (sin precio justo): no se evalúan.</p>` : ""}`;
  $("#more-markets").addEventListener("click", () => viewEvent(id, true));
  bindCards($("#main"));
}
function chart(series, ms) {
  if (!series) return "";
  const outcomes = Object.keys(series);
  const pts = outcomes.flatMap((o) => series[o]);
  if (pts.length < 2 * outcomes.length) return '<p class="mute" style="font-size:12px;margin-top:8px">Evolución: hace falta más de una foto de precios para dibujarla.</p>';
  const W = 640, H = 180, P = 28;
  const ts = pts.map((p) => new Date(p.t).getTime());
  const vals = pts.flatMap((p) => [p.fair, p.best]).filter(isNum);
  const t0 = Math.min(...ts), t1 = Math.max(...ts), v0 = Math.min(...vals), v1 = Math.max(...vals);
  const x = (t) => P + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (W - 2 * P);
  const y = (v) => H - P - (v1 === v0 ? 0.5 : (v - v0) / (v1 - v0)) * (H - 2 * P);
  const colors = ["#38bdf8", "#f472b6", "#a3e635"];
  const lines = outcomes.map((o, i) => {
    const s = series[o];
    const path = (k) => s.filter((p) => isNum(p[k])).map((p, j) => (j ? "L" : "M") + x(new Date(p.t).getTime()).toFixed(1) + " " + y(p[k]).toFixed(1)).join(" ");
    return `<path d="${path("best")}" fill="none" stroke="${colors[i % 3]}" stroke-width="2"/><path d="${path("fair")}" fill="none" stroke="${colors[i % 3]}" stroke-width="1.5" stroke-dasharray="4 4" opacity=".75"/>`;
  }).join("");
  const label = (o) => { const d = ms.find((m) => m.outcome === o); return d ? d.selection : o; };
  return `<div class="legend">${outcomes.map((o, i) => `<span><i style="background:${colors[i % 3]}"></i>${esc(label(o))}</span>`).join("")}<span>— mejor cuota · - - cuota justa</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de cuotas">
      <text x="${P}" y="14" fill="#95a1b5" font-size="11">${v1.toFixed(2)}</text><text x="${P}" y="${H - 8}" fill="#95a1b5" font-size="11">${v0.toFixed(2)}</text>
      <text x="${W - P}" y="${H - 8}" fill="#95a1b5" font-size="11" text-anchor="end">${esc(dt(new Date(t1).toISOString()))}</text>${lines}</svg>`;
}

/* ── COMPARAR ────────────────────────────────────────────────────────── */
function viewCompare() {
  const b = S.board;
  if (!b) return viewNow();
  const q = (S.cmpQuery || "").toLowerCase();
  const pool = b.decisions.filter((d) => d.best_odds && !d.no_reference && (!q || (d.event_name + " " + d.selection).toLowerCase().includes(q))).slice(0, 80);
  $("#main").innerHTML = `<h2>Comparar apuestas</h2>
    <p class="dim">Elige de 2 a 5. EDGE OS dice cuál tiene más sentido y por qué, con la misma regla que usa para todo.</p>
    <div class="row2"><input id="cmp-q" placeholder="Buscar partido o selección" value="${esc(S.cmpQuery || "")}"><button class="btn primary" id="cmp-go" ${S.compare.size < 2 ? "disabled" : ""}>Comparar (${S.compare.size})</button></div>
    <div id="cmp-res" style="margin:14px 0"></div>
    <div class="table-wrap"><table><thead><tr><th></th><th>Selección</th><th class="n">Cuota</th><th>Estado</th></tr></thead><tbody>
      ${pool.map((d) => `<tr><td><input type="checkbox" data-pick="${esc(d.id)}" ${S.compare.has(d.id) ? "checked" : ""}></td>
        <td><b>${esc(d.selection)}</b><div class="dim" style="font-size:12px">${esc(d.event_name)} · ${esc(marketName(d))}</div></td>
        <td class="n">${odds(d.best_odds)}</td><td>${badge(d)}</td></tr>`).join("")}</tbody></table></div>`;
  $("#cmp-q").addEventListener("input", (e) => { S.cmpQuery = e.target.value; clearTimeout(viewCompare.h); viewCompare.h = setTimeout(() => { viewCompare(); const i = $("#cmp-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
  $$("[data-pick]").forEach((c) => c.addEventListener("change", () => {
    if (c.checked) { if (S.compare.size >= 5) { c.checked = false; return toast("Máximo 5."); } S.compare.add(c.dataset.pick); } else S.compare.delete(c.dataset.pick);
    $("#cmp-go").disabled = S.compare.size < 2;
    $("#cmp-go").textContent = "Comparar (" + S.compare.size + ")";
  }));
  $("#cmp-go").addEventListener("click", async () => {
    try {
      const r = await api("/api/compare", { method: "POST", body: JSON.stringify({ ids: Array.from(S.compare) }) });
      $("#cmp-res").innerHTML = `<div class="hero ${r.winner ? "s-" + stateOf(r.winner).cls : ""}"><div class="hero-title">Veredicto</div><p style="font-size:17px">${esc(r.text)}</p>
        <div class="cards">${r.ranking.map(decisionCard).join("")}</div></div>`;
      bindCards($("#cmp-res"));
    } catch (e) { toast("No se pudo comparar: " + esc(e.message)); }
  });
}

/* ── VIGILANDO ───────────────────────────────────────────────────────── */
async function viewWatch() {
  const rows = await api("/api/watch");
  const cur = (id) => findDecision(id);
  const label = { active: "vigilando", triggered: "saltó", expired: "caducada" };
  $("#main").innerHTML = `<h2>Vigilando</h2>
    <p class="dim">Selecciones que todavía no están maduras. Cuando la mejor cuota llega al objetivo, EDGE OS recalcula y avisa (campana).</p>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Selección</th><th class="n">Objetivo</th><th class="n">Ahora</th><th>Estado ahora</th><th>Vigilancia</th></tr></thead><tbody>
      ${rows.map((w) => { const d = cur(w.selection_id); return `<tr class="${d ? "click" : ""}" ${d ? `data-href="${oppLink(d)}"` : ""}>
        <td><b>${esc(w.selection)}</b><div class="dim" style="font-size:12px">${esc(w.event_name)} · ${dt(w.commence_time)}</div></td>
        <td class="n">${odds(w.target_odds)}</td><td class="n">${odds(d ? d.best_odds : w.last_seen_odds)}</td>
        <td>${d ? badge(d) : '<span class="dim">sin precio</span>'}</td><td>${esc(label[w.status] || w.status)}</td></tr>`; }).join("")}</tbody></table></div>`
    : '<div class="note">No estás vigilando nada. Desde cualquier oportunidad, «Vigilar».</div>'}`;
  bindCards($("#main"));
}

/* ── HISTORIAL ───────────────────────────────────────────────────────── */
async function viewHistory() {
  const rows = (await api("/api/bets")).slice().reverse();
  const src = S.histSrc || "all";
  const show = rows.filter((b) => src === "all" || b.source === src);
  $("#main").innerHTML = `<h2>Historial</h2>
    <p class="dim">Las apuestas «en papel» las registra EDGE OS solo cuando una decisión pasa la regla: así se mide, con precios de 2026, si la ventaja existe. Las «mías» son las que registras tú.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      ${[["all", "Todas"], ["auto", "En papel"], ["manual", "Mías"]].map(([k, l]) => `<button class="chip ${src === k ? "on" : ""}" data-src="${k}">${l}</button>`).join("")}
      <span style="flex:1"></span><button class="btn" id="close-now">Capturar cierres ahora</button><button class="btn" id="settle-now">Liquidar ahora</button></div>
    ${show.length ? `<div class="table-wrap"><table><thead><tr><th>Cuándo</th><th>Selección</th><th class="n">Cuota</th><th>Al entrar</th><th class="n">CLV (media)</th><th class="n">CLV Pinnacle</th><th>Resultado</th><th class="n">Unidades</th></tr></thead><tbody>
      ${show.map((b) => { const c = b.closing || {}; const r = b.result || {};
        return `<tr><td>${dt(b.created_at)}<div class="dim" style="font-size:12px">${b.source === "auto" ? "en papel" : "mía"}</div></td>
        <td><b>${esc(b.selection)}</b><div class="dim" style="font-size:12px">${esc(b.event_name)} · ${esc(MCODE[b.market_code] || b.market)}</div></td>
        <td class="n">${odds(b.odds)}<div class="dim" style="font-size:12px">${esc(b.book)}</div></td>
        <td>${badge({ state: b.state })}</td>
        <td class="n">${c.missing ? '<span class="dim">no capturado</span>' : spct(c.clv_avg, 2)}</td><td class="n">${spct(c.clv_pin, 2)}</td>
        <td>${b.status === "settled" ? esc(r.home_score + "-" + r.away_score) : esc({ open: "pendiente", closed: "cerrada, sin resultado", unsettled: "sin resultado" }[b.status] || b.status)}</td>
        <td class="n">${isNum(r.return_units) ? (r.return_units >= 0 ? "+" : "") + r.return_units.toFixed(2) : "—"}</td></tr>`; }).join("")}</tbody></table></div>`
    : '<div class="note">Todavía no hay apuestas registradas.</div>'}`;
  $$("[data-src]").forEach((c) => c.addEventListener("click", () => { S.histSrc = c.dataset.src; viewHistory(); }));
  $("#close-now").addEventListener("click", async () => { try { const r = await api("/api/bets/close", { method: "POST" }); toast(`Cierres: ${r.closed} capturados de ${r.due} pendientes.` + (r.skipped.length ? " " + esc(r.skipped[0].reason) : "")); viewHistory(); } catch (e) { toast(esc(e.message)); } });
  $("#settle-now").addEventListener("click", async () => { try { const r = await api("/api/bets/settle", { method: "POST" }); toast(`Liquidadas: ${r.settled} · pendientes de resultado: ${r.pending}.` + (r.skipped.length ? " " + esc(r.skipped[0].reason) : "")); viewHistory(); } catch (e) { toast(esc(e.message)); } });
}

/* ── RENDIMIENTO ─────────────────────────────────────────────────────── */
function ciTxt(s, d = 2) {
  if (!s || !s.n) return "—";
  return spct(s.mean, d) + (isNum(s.lo95) ? ` <span class="dim">(${spct(s.lo95, d)} a ${spct(s.hi95, d)})</span>` : "");
}
async function viewPerformance() {
  const [p, bud] = await Promise.all([api("/api/performance"), api("/api/budget")]);
  const a = p.auto;
  const hist = p.historical_states;
  const stratRows = Object.keys(hist).filter((k) => k.endsWith("|max")).map((k) => {
    const h = hist[k];
    const live = p.live_states[k];
    const bs = p.by_strategy[k] || { clv_avg: { n: 0 } };
    const n = bs.clv_avg.n || 0;
    const need = h.n_required || 0;
    const [cls, lab] = STRAT[h.state] || ["no", h.state];
    return `<tr><td><b>${esc(MCODE[k.split("|")[0]])}</b></td><td><span class="badge s-${cls}">${lab}</span></td>
      <td>${live ? `<span class="badge s-${(STRAT[live.state] || ["no"])[0]}">${esc((STRAT[live.state] || ["", live.state])[1])}</span>` : '<span class="dim">aún sin muestra</span>'}</td>
      <td style="min-width:160px"><div class="progress"><i style="width:${need ? Math.min(100, (100 * n) / need) : 0}%"></i></div><div class="dim" style="font-size:12px">${n} de ${need || "—"} apuestas cerradas</div></td>
      <td class="n">${ciTxt(bs.clv_avg)}</td></tr>`;
  }).join("");
  const days = Object.keys(bud.per_day || {}).sort().reverse().slice(0, 10);
  $("#main").innerHTML = `<h2>¿Está funcionando EDGE OS?</h2>
    <p class="dim">La medida que manda es el CLV contra el cierre de la media del mercado (sin Pinnacle): si las apuestas se cogen a mejor precio del que acaba teniendo el mercado, el proceso es bueno aunque una racha salga mal.</p>
    <div class="kvs" style="margin:12px 0">
      ${kv("Apuestas en papel", a.n, a.open + " abiertas · " + a.closed_with_clv + " con cierre · " + a.settled + " liquidadas")}
      ${kv("CLV medio (media mercado)", a.clv_avg.n ? spct(a.clv_avg.mean, 2) : "—", a.clv_avg.n ? "IC 95 %: " + spct(a.clv_avg.lo95, 2) + " a " + spct(a.clv_avg.hi95, 2) : "sin cierres todavía", true)}
      ${kv("% con CLV positivo", a.clv_avg.n ? pct(a.clv_avg.pos) : "—")}
      ${kv("CLV contra Pinnacle", a.clv_pin.n ? spct(a.clv_pin.mean, 2) : "—", "referencia secundaria")}
      ${kv("ROI", a.roi && a.roi.n ? spct(a.roi.mean, 1) : "—", a.roi && a.roi.n ? "IC 95 %: " + spct(a.roi.lo95, 1) + " a " + spct(a.roi.hi95, 1) : "sin liquidar")}
      ${kv("Caída máxima", isNum(a.max_drawdown_units) ? a.max_drawdown_units.toFixed(1) + " u" : "—")}
    </div>
    <h2>Estrategias: histórico frente a vivo (kill switch)</h2>
    <div class="table-wrap"><table><thead><tr><th>Mercado</th><th>Histórico</th><th>En vivo</th><th>Muestra</th><th class="n">CLV en vivo</th></tr></thead><tbody>${stratRows}</tbody></table></div>
    <p class="mute" style="font-size:12px">Cuando las apuestas cerradas llegan a la muestra necesaria (potencia 80 % para distinguir +1 % de CLV de 0), la evidencia en vivo manda sobre la del histórico: si pierden de forma significativa, la estrategia se desactiva sola.</p>
    <h2>Oportunidades descartadas (laboratorio en vivo)</h2>
    <div class="table-wrap"><table><thead><tr><th>Estado al verla</th><th class="n">Casos con cierre</th><th class="n">CLV medio</th></tr></thead><tbody>
      ${Object.keys(p.missed_lab).length ? Object.entries(p.missed_lab).map(([k, v]) => `<tr><td>${badge({ state: k })}</td><td class="n">${v.n}</td><td class="n">${spct(v.mean, 2)}</td></tr>`).join("") : '<tr><td colspan="3" class="dim">Aún no hay cierres de señales.</td></tr>'}</tbody></table></div>
    <h2>Créditos del proveedor</h2>
    <div class="kvs">${kv("Quedan", bud.remaining == null ? "—" : bud.remaining)}${kv("Reservados", bud.reserve, "para cierres y liquidaciones")}${kv("Hoy", bud.spent_today + " / " + (isNum(bud.allowance_today) ? Math.floor(bud.allowance_today) : "—"))}${kv("Se reinicia", dt(bud.next_reset))}</div>
    ${days.length ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Día</th><th class="n">Escanear</th><th class="n">Cierres</th><th class="n">Liquidar</th></tr></thead><tbody>${days.map((d) => { const r = bud.per_day[d]; return `<tr><td>${esc(d)}</td><td class="n">${r.user || 0}</td><td class="n">${r.closing || 0}</td><td class="n">${r.settle || 0}</td></tr>`; }).join("")}</tbody></table></div>` : ""}`;
}

/* ── INVESTIGACIÓN ───────────────────────────────────────────────────── */
function viewResearch() {
  const R = S.research;
  if (!R) { $("#main").innerHTML = '<div class="note">Sin fichero de calibración.</div>'; return; }
  const data = R.data || {};
  const se = (R.findings || {}).shared_error || {};
  const strat = Object.entries(R.strategies || {});
  const f = R.findings || {};
  const seTable = (mk) => (se[mk] || []).map((r) => `<tr><td>${esc(r.season)}</td><td class="n">${r.n}</td><td class="n">${spct(r.clv_pin.mean, 2)}</td><td class="n">${spct(r.clv_avg.mean, 2)}</td><td class="n">${spct(r.clv_b365.mean, 2)}</td><td class="n">${spct(r.roi.mean, 1)}</td></tr>`).join("");
  $("#main").innerHTML = `<h2>Investigación</h2>
    <div class="note">Todo lo de esta página sale de <b>${esc(data.matches)}</b> partidos de ${Object.keys(data.leagues || {}).length} ligas (${esc((data.seasons || []).join(", "))}), con cuotas previas y de cierre de football-data.co.uk. Versión <b>${esc(R.version)}</b>. Pinnacle desaparece del histórico tras el ${esc(data.pinnacle_last_close)}.</div>
    <div class="actions"><a class="btn" href="#/replay">Replay: ¿qué habría visto EDGE OS en un momento dado?</a></div>
    <h2>Estrategias (fuera de muestra, contra el cierre independiente)</h2>
    <div class="table-wrap"><table><thead><tr><th>Estrategia</th><th>Estado</th><th class="n">Apuestas</th><th class="n">CLV</th><th class="n">Con 1 % peor precio</th><th class="n">ROI</th><th>Por qué</th></tr></thead><tbody>
      ${strat.map(([k, s]) => { const o = s.oos || {}; const st = o.strategy || {}; const sl = o.slip1 || {}; const [cls, lab] = STRAT[s.state] || ["no", s.state];
        return `<tr><td><b>${esc(MCODE[s.market] || s.market)}</b><div class="dim" style="font-size:12px">${s.price_class === "max" ? "mejor cuota del mercado" : "solo Bet365"}</div></td><td><span class="badge s-${cls}">${lab}</span></td>
        <td class="n">${st.n || 0}</td><td class="n">${st.n ? spct(st.clv_mean, 2) : "—"}</td><td class="n">${sl.n ? spct(sl.clv_mean, 2) : "—"}</td><td class="n">${st.n ? spct(st.roi, 1) : "—"}</td>
        <td style="font-size:13px">${esc((s.reasons || []).join(" · "))}</td></tr>`; }).join("")}</tbody></table></div>
    <h2>¿Ventaja real o error compartido?</h2>
    <p class="dim">Precios con ventaja aparente frente a Pinnacle, medidos contra tres cierres. Contra el de Pinnacle la ventaja se infla, porque comparte los errores de la casa que la eligió; contra la media del mercado se ve la de verdad, y cómo se ha ido cerrando.</p>
    ${["1X2", "OU25", "AH"].map((mk) => `<h3 style="margin:14px 0 8px">${esc(MCODE[mk])}</h3><div class="table-wrap"><table><thead><tr><th>Temporada</th><th class="n">n</th><th class="n">vs Pinnacle</th><th class="n">vs media</th><th class="n">vs Bet365</th><th class="n">ROI</th></tr></thead><tbody>${seTable(mk)}</tbody></table></div>`).join("")}
    <h2>Precios imposibles</h2>
    <p class="dim">Un precio que paga más del doble de lo que vale es un error del feed. La primera versión usaba una valla estadística que tiraba oportunidades reales; está corregido y medido:</p>
    <div class="table-wrap"><table><thead><tr><th>Mercado</th><th class="n">Precios que se tiraban</th><th class="n">Su CLV</th><th class="n">Errores groseros</th></tr></thead><tbody>
      ${Object.entries(f.tukey_fence_lab || {}).map(([mk, lab]) => `<tr><td>${esc(MCODE[mk])}</td><td class="n">${lab.discarded_before_kept_now.n}</td><td class="n">${lab.discarded_before_kept_now.clv ? spct(lab.discarded_before_kept_now.clv.mean, 1) : "—"}</td><td class="n">${lab.gross_errors.n}</td></tr>`).join("")}</tbody></table></div>
    <h2>Método para quitar el margen</h2>
    <div class="table-wrap"><table><thead><tr><th>Mercado</th><th>Elegido</th><th>Por qué</th></tr></thead><tbody>
      ${Object.entries(R.devig || {}).map(([mk, v]) => `<tr><td>${esc(MCODE[mk])}</td><td><b>${esc(v.method)}</b></td><td style="font-size:13px">${esc(v.why)}</td></tr>`).join("")}</tbody></table></div>
    <h2>Modelo propio de fútbol</h2>
    <div class="card"><span class="badge s-off">RECHAZADO</span><p>Dixon-Coles + Elo acierta peor que el mercado (Brier ${esc(R.model_football.evidence.brier_model)} frente a ${esc(R.model_football.evidence.brier_market)}) y pierde dinero (ROI ${spct(R.model_football.evidence.roi, 1)}). No se usa para decidir.</p></div>
    <h2>Lo que esta validación no cubre</h2>
    <div class="card"><ul><li>Solo fútbol (22 ligas) y tres mercados. El resto de deportes no está validado: como mucho «vigilar».</li>
      <li>La foto previa del histórico es de 1–3 días antes: una señal a minutos del inicio no está validada con estos datos.</li>
      <li>Directo: sin estadísticas del partido, nada validado.</li><li>Alineaciones, lesiones, noticias: sin fuente.</li></ul></div>`;
}

/* ── REPLAY ──────────────────────────────────────────────────────────── */
function viewReplay() {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  $("#main").innerHTML = `<a href="#/investigacion" class="dim">← Investigación</a><h2>Replay</h2>
    <p class="dim">Reconstruye lo que EDGE OS sabía en un instante: solo precios observados hasta entonces. Al lado, las señales que de verdad registró.</p>
    <div class="row2"><input type="datetime-local" id="rp-at" value="${S.replayAt || now}"><button class="btn primary" id="rp-go">Reconstruir</button></div>
    <div id="rp-out" style="margin-top:14px"></div>`;
  $("#rp-go").addEventListener("click", async () => {
    const v = $("#rp-at").value;
    if (!v) return;
    S.replayAt = v;
    const iso = new Date(v).toISOString();
    $("#rp-out").innerHTML = '<div class="empty"><span class="spin"></span></div>';
    try {
      const r = await api("/api/replay?at=" + encodeURIComponent(iso));
      const acts = r.decisions.filter((d) => ["EXCEPCIONAL", "APOSTAR", "INTERESANTE", "ESPERAR", "WATCH"].includes(d.state));
      const sigs = r.logged_signals.filter((s) => ["EXCEPCIONAL", "APOSTAR", "INTERESANTE", "ESPERAR", "WATCH"].includes(s.state));
      $("#rp-out").innerHTML = `<div class="hero"><div class="hero-title">${esc(dt(r.asof))}</div><h1 style="font-size:24px">${esc(r.headline.title)}</h1>
        <p class="dim">${r.events} partidos con precios · datos observados por última vez ${dt(r.data_observed_at)}</p></div>
        <h2>Lo que habría enseñado</h2>${acts.length ? `<div class="cards">${acts.slice(0, 20).map(decisionCard).join("")}</div>` : '<div class="note">Nada con ventaja.</div>'}
        <h2>Señales registradas en su momento (30 min antes)</h2>
        ${sigs.length ? `<div class="table-wrap"><table><thead><tr><th>Observado</th><th>Selección</th><th class="n">Cuota</th><th>Estado</th></tr></thead><tbody>${sigs.map((s) => `<tr><td>${dt(s.observed_at)}</td><td>${esc(s.selection)}<div class="dim" style="font-size:12px">${esc(s.event_name)}</div></td><td class="n">${odds(s.best_odds)}</td><td>${badge(s)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="note">No se registraron señales en esa ventana.</div>'}`;
    } catch (e) { $("#rp-out").innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; }
  });
}

/* ── AJUSTES ─────────────────────────────────────────────────────────── */
async function viewSettings() {
  const [st, bk] = await Promise.all([api("/api/settings"), api("/api/books")]);
  const mine = new Set(st.my_books || []);
  const books = Array.from(new Set([...(bk.books || []), ...mine])).sort();
  $("#main").innerHTML = `<h2>Ajustes</h2><form class="form" id="st-form">
    <div><label>Mis casas</label><p class="dim" style="margin:4px 0 8px">Solo se te recomendarán precios de estas casas. Si no marcas ninguna, se usan todas (y cada recomendación te recuerda comprobar tu casa).</p>
      <div class="books">${books.length ? books.map((b) => `<label class="check"><input type="checkbox" name="book" value="${esc(b)}" ${mine.has(b) ? "checked" : ""}>${esc(b)}</label>`).join("") : '<span class="dim">Actualiza precios primero para ver casas.</span>'}</div></div>
    <div class="row2"><div><label>Bote (€)</label><input name="bankroll" type="number" min="1" step="1" value="${esc(st.bankroll)}"></div>
      <div><label>Mercados a pedir</label><div class="books">${[["h2h", "Resultado (1 crédito)"], ["totals", "Goles (+1)"], ["spreads", "Hándicap (+1)"]].map(([k, l]) => `<label class="check"><input type="checkbox" name="market" value="${k}" ${(st.markets || []).includes(k) ? "checked" : ""}>${l}</label>`).join("")}</div>
      <p class="dim" style="margin:6px 0 0;font-size:13px">${st.markets_from_evidence ? "Ahora mismo, los de las estrategias activas del histórico: los demás no pueden llegar a «apostar»." : "Elegidos a mano. Desmárcalos todos para volver a los de las estrategias activas."}</p></div></div>
    <div class="row2"><div><label>Cuota mínima que prefiero</label><input name="lo" type="number" step="0.01" min="1.01" value="${st.odds_range ? esc(st.odds_range[0]) : ""}" placeholder="sin límite"></div>
      <div><label>Cuota máxima que prefiero</label><input name="hi" type="number" step="0.01" min="1.02" value="${st.odds_range ? esc(st.odds_range[1]) : ""}" placeholder="sin límite"></div></div>
    <p class="mute" style="font-size:13px;margin:-6px 0 0">Es tu preferencia de riesgo: no cambia ninguna decisión, solo marca lo que queda fuera. En el histórico la ventaja media no depende de la cuota; el ruido sí.</p>
    <div class="row2"><div><label>Créditos al mes</label><input name="monthly" type="number" min="1" value="${esc(st.monthly_credits)}"></div>
      <div><label>Día de reinicio</label><input name="reset" type="number" min="1" max="28" value="${esc(st.reset_day)}"></div></div>
    <button class="btn primary" type="submit">Guardar</button></form>`;
  $("#st-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const lo = parseFloat(fd.get("lo")), hi = parseFloat(fd.get("hi"));
    const body = {
      my_books: fd.getAll("book"), bankroll: parseFloat(fd.get("bankroll")), markets: fd.getAll("market"),
      odds_range: isNum(lo) && isNum(hi) ? [lo, hi] : null, monthly_credits: parseInt(fd.get("monthly"), 10), reset_day: parseInt(fd.get("reset"), 10),
    };
    try { S.settings = await api("/api/settings", { method: "PUT", body: JSON.stringify(body) }); toast("Guardado."); await refreshBoard(); } catch (err) { toast("No se pudo guardar: " + esc(err.message)); }
  });
}

function viewMore() {
  $("#main").innerHTML = `<div class="cards">${[["comparar", "⇄ Comparar"], ["vigilar", "◔ Vigilando"], ["rendimiento", "↗ Rendimiento"], ["investigacion", "⌘ Investigación"], ["replay", "⟲ Replay"], ["ajustes", "⚙ Ajustes"]]
    .map(([r, l]) => `<a class="card" href="#/${r}" style="font-size:18px;font-weight:700;color:var(--fg)">${l}</a>`).join("")}</div>`;
}

/* ── arranque ────────────────────────────────────────────────────────── */
if (S.token) start(); else logout("");
