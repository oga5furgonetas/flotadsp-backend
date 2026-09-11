"""Motor de decisión: de un precio observado a una decisión que se entiende en segundos.

Secuencia (la del prompt, en este orden y sin saltarse ninguna):

1. ¿Los datos son buenos?        → frescura, Pinnacle presente, precio no imposible
2. ¿El mercado es válido?          → mercado y deporte con estrategia validada
3. ¿Qué probabilidad tiene?        → Pinnacle sin margen (método validado)
4. ¿Qué precio ofrece el mercado?  → mejor cuota de las casas permitidas (neta de comisión)
5. ¿Hay diferencia?                → ventaja aparente p·o − 1
6. ¿Es real o ruido?               → P(ventaja real) y E[CLV] del modelo aprendido
7. ¿Está validada fuera de muestra? → estado de la estrategia
8. ¿Sigue siendo válida ahora?     → directo, marcador reciente, precio sin confirmar
9. ¿Se puede ejecutar?             → casas del usuario, cuota mínima aceptable
10. ¿Merece la pena?               → estado final + explicación

Estados: 🔥 EXCEPCIONAL · 🟢 APOSTAR · 🟡 INTERESANTE · 🟠 ESPERAR · 👀 VIGILAR ·
❌ NO APOSTAR · ⚠️ DATOS NO FIABLES · ⛔ MODELO DESACTIVADO.

Nada de lo que decide un estado es un número escrito a mano: umbrales, vallas y
calibración vienen del fichero de calibración. Los dos únicos ajustes que no son
estadísticos están nombrados como tales: la antigüedad máxima de los datos que se
enseñan como decisión (``max_snapshot_age_s``) y el rango de cuotas preferido del
usuario, que nunca cambia un estado, solo lo marca.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import datetime

from ..assets import Asset, Strategy
from ..domain import Event, MarketSnapshot
from ..market.quality import implausible, max_plausible_odds
from ..market.reference import EXCHANGES, REFERENCE_BOOK, executable_price, reference
from ..providers.base import LineupsFeed, NullLineups, Unknown

EXCEPCIONAL = "EXCEPCIONAL"
APOSTAR = "APOSTAR"
INTERESANTE = "INTERESANTE"
ESPERAR = "ESPERAR"
WATCH = "WATCH"
NO_BET = "NO_BET"
NO_FIABLE = "DATOS_NO_FIABLES"
DESACTIVADO = "MODELO_DESACTIVADO"

STATE_META: dict[str, tuple[str, str, int]] = {
    EXCEPCIONAL: ("🔥", "EXCEPCIONAL", 0),
    APOSTAR: ("🟢", "APOSTAR", 1),
    INTERESANTE: ("🟡", "INTERESANTE", 2),
    ESPERAR: ("🟠", "ESPERAR", 3),
    WATCH: ("👀", "VIGILAR", 4),
    NO_BET: ("❌", "NO APOSTAR", 5),
    NO_FIABLE: ("⚠️", "DATOS NO FIABLES", 6),
    DESACTIVADO: ("⛔", "MODELO DESACTIVADO", 7),
}
ACTIONABLE = (EXCEPCIONAL, APOSTAR, INTERESANTE)
MARKET_ES = {"1X2": "resultado final (1X2)", "OU25": "más/menos 2.5 goles", "AH": "hándicap asiático"}


@dataclass(frozen=True)
class HistoryPoint:
    observed_at: datetime
    best_odds: float | None
    best_book: str | None
    p_fair: float | None


@dataclass
class Context:
    now: datetime
    asset: Asset
    my_books: frozenset[str] | None = None
    bankroll: float = 1000.0
    lineups: LineupsFeed = field(default_factory=NullLineups)
    max_snapshot_age_s: float = 600.0
    frozen: dict[str, str] = field(default_factory=dict)
    history: Callable[[str], list[HistoryPoint]] | None = None
    odds_range: tuple[float, float] | None = None
    # estado por estrategia medido EN VIVO (paper trading) que manda sobre el histórico
    state_overrides: dict[str, tuple[str, list[str]]] = field(default_factory=dict)


@dataclass
class Decision:
    id: str
    event_id: str
    sport: str
    sport_title: str
    event_name: str
    home: str
    away: str
    commence_time: str
    minutes_to_start: float
    live: bool
    score: str | None
    market: str
    market_code: str | None
    line: float | None
    outcome: str
    selection: str
    observed_at: str
    data_age_s: float
    state: str = NO_BET
    emoji: str = ""
    label: str = ""
    best_book: str | None = None
    best_odds: float | None = None
    best_odds_net: float | None = None
    best_age_s: float | None = None
    reference_age_s: float | None = None
    n_books: int = 0
    p_fair: float | None = None
    fair_odds: float | None = None
    p_close_lo: float | None = None
    p_close_hi: float | None = None
    ev_raw: float | None = None
    p_real: float | None = None
    p_real_n: int | None = None
    e_clv: float | None = None
    e_clv_lo: float | None = None
    e_clv_hi: float | None = None
    min_odds: float | None = None
    invalidation_odds: float | None = None
    target_odds: float | None = None
    priority: float | None = None
    quality_price: float | None = None
    stake_fraction: float | None = None
    stake_amount: float | None = None
    strategy_key: str | None = None
    strategy_state: str | None = None
    outside_user_range: bool = False
    no_reference: bool = False
    why: list[str] = field(default_factory=list)
    why_not: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    why_now: list[str] = field(default_factory=list)
    would_change: list[str] = field(default_factory=list)
    not_exceptional: list[str] = field(default_factory=list)

    def set_state(self, state: str) -> None:
        self.state = state
        self.emoji, self.label, _ = STATE_META[state]

    @property
    def rank(self) -> int:
        return STATE_META[self.state][2]

    def to_dict(self) -> dict:
        return asdict(self)


# ── formato «en cristiano» ──────────────────────────────────────────────────
def pct(x: float | None, signed: bool = False, digits: int = 1) -> str:
    if x is None:
        return "—"
    return f"{x * 100:+.{digits}f} %" if signed else f"{x * 100:.{digits}f} %"


def pct_round5(x: float) -> str:
    """Frecuencias al 5 % más cercano: más precisión sería falsa."""
    return f"{round(x * 20) * 5:.0f} %"


def ago(seconds: float) -> str:
    s = max(0.0, seconds)
    if s < 90:
        return f"{s:.0f} s"
    if s < 5400:
        return f"{s / 60:.0f} min"
    return f"{s / 3600:.1f} h"


def when(minutes: float) -> str:
    if minutes <= 0:
        return "en juego"
    if minutes < 90:
        return f"empieza en {minutes:.0f} min"
    if minutes < 48 * 60:
        return f"empieza en {minutes / 60:.1f} h"
    return f"empieza en {minutes / 1440:.0f} días"


def price_txt(book: str, price: float, net: float) -> str:
    return f"{price:.2f} en {book}" + (f", {net:.2f} tras comisión" if abs(net - price) > 1e-9 else "")


def below_fair_txt(book: str, price: float, net: float, fair: float) -> str:
    """Si al redondear salen iguales, «no supera»: decir que 4.48 está por debajo de 4.48 no se entiende."""
    verb = "no supera" if f"{net:.2f}" == f"{fair:.2f}" else "está por debajo de"
    return f"La mejor cuota ({price_txt(book, price, net)}) {verb} lo que vale ({fair:.2f})."


# ── motor ───────────────────────────────────────────────────────────────────
def evaluate(events: list[Event], ctx: Context) -> list[Decision]:
    out: list[Decision] = []
    for ev in events:
        if ev.score is not None and ev.score.completed:
            continue
        for snap in ev.markets.values():
            for outcome in snap.outcomes:
                out.append(evaluate_selection(ev, snap, outcome, ctx))
    apply_portfolio(out)
    return rank(out)


def _base(ev: Event, snap: MarketSnapshot, outcome: str, ctx: Context, mcode: str | None) -> Decision:
    score = None
    if ev.score is not None and ev.score.home is not None and ev.score.away is not None:
        score = f"{ev.score.home}-{ev.score.away}"
    d = Decision(
        id=f"{ev.id}|{snap.key}|{outcome}", event_id=ev.id, sport=ev.sport, sport_title=ev.sport_title,
        event_name=ev.name, home=ev.home, away=ev.away, commence_time=ev.commence_time.isoformat(),
        minutes_to_start=round(ev.minutes_to_start(ctx.now), 1), live=ev.is_live(ctx.now), score=score,
        market=snap.market, market_code=mcode, line=snap.line, outcome=outcome,
        selection=ev.outcome_label(snap.market, outcome, snap.line),
        observed_at=snap.observed_at.isoformat(),
        data_age_s=round((ctx.now - snap.observed_at).total_seconds(), 1),
        n_books=len(snap.complete_books()))
    d.set_state(NO_BET)
    return d


def evaluate_selection(ev: Event, snap: MarketSnapshot, outcome: str, ctx: Context) -> Decision:
    asset = ctx.asset
    mcode = asset.market_code(ev.sport, snap.market, snap.line, len(snap.outcomes))
    d = _base(ev, snap, outcome, ctx, mcode)
    strat = asset.strategy(mcode)
    override = ctx.state_overrides.get(strat.key) if strat else None
    s_state = override[0] if override else (strat.state if strat else None)
    s_reasons = list(override[1]) if override else (strat.reasons if strat else [])
    d.strategy_key = strat.key if strat else None
    d.strategy_state = s_state

    # 1. datos
    if d.data_age_s > ctx.max_snapshot_age_s:
        d.set_state(NO_FIABLE)
        d.why_not.append(f"Los precios son de hace {ago(d.data_age_s)}: actualiza antes de decidir nada.")
        return d
    if ev.id in ctx.frozen:
        d.set_state(NO_FIABLE)
        d.why_not.append(ctx.frozen[ev.id])
        d.would_change.append("En cuanto llegue un precio posterior al cambio, se recalcula.")
        return d

    # 3. probabilidad
    method = asset.devig_method(mcode, len(snap.outcomes))
    ref = reference(snap, method)
    if not ref.ok or ref.probs is None:
        d.set_state(NO_FIABLE)
        d.no_reference = True
        d.why_not.append("Pinnacle no cotiza este mercado completo: no hay precio justo en el que confiar." if
                         ref.status in ("missing", "incomplete") else f"Precio de referencia no válido ({ref.note}).")
        d.would_change.append("Si Pinnacle abre este mercado, se evalúa.")
        return d
    p = ref.probs[outcome]
    d.p_fair = p
    d.fair_odds = 1.0 / p
    if ref.updated is not None:
        d.reference_age_s = round((ctx.now - ref.updated).total_seconds(), 1)

    # 4. precio
    best = snap.best(outcome, allowed=ctx.my_books, exclude={REFERENCE_BOOK})
    if best is None:
        d.set_state(NO_BET)
        d.why_not.append("Ninguna de tus casas cotiza este resultado." if ctx.my_books is not None
                         else "Ninguna casa, aparte de la referencia, cotiza este resultado.")
        return d
    o_net = executable_price(best.book, best.price)
    d.best_book, d.best_odds, d.best_odds_net = best.book, best.price, round(o_net, 4)
    if best.last_update is not None:
        d.best_age_s = round((ctx.now - best.last_update).total_seconds(), 1)
    if ctx.odds_range and not (ctx.odds_range[0] <= best.price <= ctx.odds_range[1]):
        d.outside_user_range = True

    # 5. diferencia
    d.ev_raw = p * o_net - 1.0

    # precio imposible: paga más del doble de lo que vale (error del feed, no oportunidad)
    thr = strat.implausible_ev if strat else asset.implausible_ev
    if implausible(d.ev_raw, thr):
        d.set_state(NO_FIABLE)
        d.why_not.append(f"{best.book} paga {best.price:.2f} por algo que vale {d.fair_odds:.2f}: más del doble. "
                         "En el histórico, precios así eran errores del feed, y las casas anulan esas apuestas "
                         "por «error palpable».")
        return d

    # 2 y 7. mercado validado y estrategia
    if strat is None or strat.model is None:
        if d.live:
            d.set_state(NO_FIABLE)
            d.why_not.append("Partido en directo en un mercado sin validar.")
            return d
        if d.ev_raw > 0:
            d.set_state(WATCH)
            d.why.append(f"{best.book} paga {best.price:.2f}; según Pinnacle sin margen vale {d.fair_odds:.2f} "
                         f"(ventaja aparente {pct(d.ev_raw, True)}).")
            d.why_not.append("Este deporte o mercado no está validado con datos: no se sabe si ventajas así "
                             "sobreviven al cierre. Se sigue en papel, no se recomienda.")
        else:
            d.why_not.append(below_fair_txt(best.book, best.price, o_net, d.fair_odds))
        return d

    em = strat.model
    est = em.estimate(p, o_net)
    bucket = em.buckets[est.bucket]
    s = math.sqrt(p * (1 - p))
    d.p_close_lo = max(0.0, p + s * float(bucket["q"][4]))
    d.p_close_hi = min(1.0, p + s * float(bucket["q"][94]))
    d.p_real, d.p_real_n = est.p_real, int(bucket["n"])
    d.e_clv, d.e_clv_lo, d.e_clv_hi = est.e_clv, est.e_clv_lo, est.e_clv_hi
    d.invalidation_odds = em.invalidation_odds(p, max(o_net, 1.0 / p) * 1.5)
    d.min_odds = em.min_acceptable_odds(p, o_net)
    cap_price = max_plausible_odds(p, thr)

    if s_state in ("DISABLED", "REJECTED"):
        d.set_state(DESACTIVADO)
        d.why_not.append(f"La estrategia de {MARKET_ES.get(mcode or '', mcode)} está "
                         f"{'desactivada' if s_state == 'DISABLED' else 'rechazada'}: " +
                         (s_reasons[0] if s_reasons else "sin evidencia."))
        d.would_change.append("Se reactiva sola si el seguimiento en papel demuestra ventaja con suficientes casos.")
        return d

    if d.ev_raw <= 0:
        d.set_state(NO_BET)
        d.why_not.append(below_fair_txt(best.book, best.price, o_net, d.fair_odds))
        return d
    if est.e_clv <= 0:
        d.set_state(NO_BET)
        d.why_not.append(f"Parece barata ({pct(d.ev_raw, True)}), pero en casos parecidos el mercado corrige esa "
                         f"diferencia antes del cierre: ventaja esperada {pct(est.e_clv, True)}.")
        return d

    passes = em.passes(est)
    common_why = [
        f"{best.book} paga {best.price:.2f} por «{d.selection}». Sin margen, Pinnacle le da un "
        f"{pct(p, digits=0)}: vale {d.fair_odds:.2f}.",
        f"De {d.p_real_n} precios parecidos del histórico, el cierre confirmó la ventaja en "
        f"~{pct_round5(est.p_real)} de los casos.",
        f"Ventaja esperada frente al cierre: {pct(est.e_clv, True)} (entre {pct(est.e_clv_lo, True)} y "
        f"{pct(est.e_clv_hi, True)}).",
    ]

    if not passes:
        target = _target_odds(em, p, o_net, cap_price)
        if target is not None:
            d.set_state(ESPERAR)
            d.target_odds = target
            d.why.extend(common_why)
            net = f" ({o_net:.2f} tras comisión)" if best.book in EXCHANGES else ""
            d.why_not.append(f"Con {best.price:.2f}{net} todavía no compensa el riesgo de que sea ruido.")
            d.would_change.append(f"Si la cuota llega a {target:.2f} o más → apostar.")
            if d.invalidation_odds:
                d.would_change.append(f"Si baja de {d.invalidation_odds:.2f} → descartar.")
        else:
            d.set_state(WATCH)
            d.why.extend(common_why)
            d.why_not.append("Ventaja pequeña y demasiado incierta; ninguna cuota razonable la haría apostable.")
        return d

    # pasa la regla de ventaja
    d.priority = est.e_clv_lo
    d.quality_price = est.e_clv / (o_net * s) if o_net * s > 0 else None
    d.why.extend(common_why)
    if d.min_odds:
        d.why.append(f"Tiene sentido mientras te paguen al menos {d.min_odds:.2f}.")
        d.would_change.append(f"Si la cuota baja de {d.min_odds:.2f} → deja de ser apuesta.")
    if d.invalidation_odds:
        d.would_change.append(f"Por debajo de {d.invalidation_odds:.2f} → se cancela (sin ventaja esperada).")
    d.risks.append(f"Precio visto en {best.book}; en tu casa puede ser otro. Si te dan menos de "
                   f"{(d.min_odds or o_net):.2f}, no.")
    if best.book in EXCHANGES:
        d.risks.append(f"Es un exchange: la cuota ya descuenta un {EXCHANGES[best.book]:.0%} de comisión "
                       "(compruébalo en tu cuenta).")
    lu = ctx.lineups.lineups(ev)
    if isinstance(lu, Unknown):
        d.risks.append("Alineaciones: no hay fuente conectada; no se sabe si falta alguien importante.")
    slip1 = strat.oos.get("slip1") or {}
    if slip1.get("n") and (slip1.get("clv_lo95") is None or slip1["clv_lo95"] <= 0):
        d.risks.append("En el histórico, con un 1 % peor de precio esta estrategia dejaba de batir al cierre.")
        if est.e_clv < 0.01:
            d.risks.append(f"La ventaja esperada ({pct(est.e_clv, True)}) es menor que un 1 % de diferencia de "
                           "precio: si tu casa paga un poco menos, desaparece.")
    if em.trained_until:
        d.risks.append(f"La evidencia histórica llega hasta {em.trained_until}: el mercado puede haber cambiado "
                       "desde entonces (el seguimiento en papel lo va comprobando).")
    stale_vs_ref = (best.last_update is not None and ref.updated is not None and best.last_update < ref.updated)
    if stale_vs_ref:
        d.risks.append(f"{best.book} no ha movido su precio desde que Pinnacle actualizó el suyo: puede estar "
                       "a punto de cambiar.")

    d.set_state(APOSTAR)
    if d.live:
        d.set_state(NO_FIABLE)
        d.why_not.insert(0, "Partido en directo: el feed no da minuto, tiros ni tarjetas y los precios cambian "
                            "antes de poder confirmarlos. Nada en directo está validado.")
        return d
    if s_state != "ACTIVE":
        d.set_state(INTERESANTE)
        label = {"DEGRADED": "degradada", "WATCH": "sin evidencia suficiente"}.get(s_state or "", s_state)
        d.why_not.append(f"No llega a «apostar» porque la estrategia está {label}: " +
                         "; ".join(s_reasons[1:3] or s_reasons[:1]))

    # 🔥: todas las condiciones o nada
    exc = strat.exceptional or {}
    checks = [
        (d.state == APOSTAR, "la estrategia no está activa"),
        (bool(exc), "no hay umbral de excepcional aprendido"),
        (bool(exc) and est.p_real >= exc.get("p_real_p90", math.inf),
         "la probabilidad de que la ventaja sea real no está entre el 10 % más alto"),
        (bool(exc) and est.e_clv_lo >= exc.get("e_clv_lo_p90", math.inf),
         "la ventaja mínima esperada no está entre el 10 % más alto"),
        (not stale_vs_ref, "precio sin confirmar después del último movimiento de Pinnacle"),
        (not isinstance(lu, Unknown), "alineaciones desconocidas"),
        (d.data_age_s <= ctx.max_snapshot_age_s / 2, "datos no lo bastante recientes"),
    ]
    d.not_exceptional = [msg for ok, msg in checks if not ok]
    if not d.not_exceptional:
        d.set_state(EXCEPCIONAL)

    if d.state in (APOSTAR, EXCEPCIONAL) and strat.kelly_fraction > 0:
        f = strat.kelly_fraction * max(est.e_clv, 0.0) / (o_net - 1.0)
        d.stake_fraction = round(f, 5)
        d.stake_amount = round(f * ctx.bankroll, 2)
    elif d.state in (APOSTAR, EXCEPCIONAL):
        d.risks.append("Tamaño: en el histórico ninguna fracción del bote crecía en su peor 5 % de casos, así "
                       "que no se recomienda un porcentaje. Si apuestas, una cantidad pequeña y fija; EDGE OS "
                       "la sigue en papel igualmente.")

    d.why_now.extend(_why_now(d, ctx))
    return d


def _target_odds(em, p: float, current: float, cap: float | None) -> float | None:
    """Primera cuota por encima de la actual a partir de la cual se apostaría (sin huecos
    hasta el tope de precio plausible)."""
    if em.pstar is None:
        return None
    upto = cap if cap is not None else current * 1.25
    ticks: list[float] = []
    o = round(math.floor(current * 100) / 100 + 0.01, 2)
    while o <= upto + 1e-9 and len(ticks) < 2000:
        ticks.append(o)
        o = round(o + 0.01, 2)
    if not ticks:
        return None
    flags = [em.passes(em.estimate(p, t)) for t in ticks]
    if not flags[-1]:
        return None
    i = len(flags) - 1
    while i > 0 and flags[i - 1]:
        i -= 1
    return ticks[i]


def _why_now(d: Decision, ctx: Context) -> list[str]:
    out = [f"Precio observado hace {ago(d.data_age_s)}; {when(d.minutes_to_start)}."]
    if ctx.history is None:
        return out
    pts = [h for h in ctx.history(d.id) if h.observed_at < ctx.now and h.best_odds]
    if not pts:
        out.append("Es la primera vez que EDGE OS ve este precio.")
        return out
    prev = pts[-1]
    mins = (ctx.now - prev.observed_at).total_seconds() / 60
    if prev.best_odds and d.best_odds:
        verb = "ha subido" if d.best_odds > prev.best_odds else "ha bajado" if d.best_odds < prev.best_odds else "sigue"
        out.append(f"Hace {mins:.0f} min la mejor cuota era {prev.best_odds:.2f} ({prev.best_book}); {verb} a "
                   f"{d.best_odds:.2f}.")
    if prev.p_fair and d.p_fair and abs(prev.p_fair - d.p_fair) >= 0.005:
        out.append(f"Pinnacle ha pasado de {pct(prev.p_fair, digits=0)} a {pct(d.p_fair, digits=0)}.")
    return out


# ── después de evaluar ──────────────────────────────────────────────────────
def rank(decisions: list[Decision]) -> list[Decision]:
    return sorted(decisions, key=lambda d: (d.rank, -(d.priority if d.priority is not None else -1e9),
                                            -(d.p_real or 0.0), d.minutes_to_start, d.id))


def apply_portfolio(decisions: list[Decision]) -> None:
    """Varias apuestas del mismo partido NO son independientes: sin datos para medir la
    correlación, el tamaño conjunto se limita al de la mayor de ellas."""
    by_event: dict[str, list[Decision]] = {}
    for d in decisions:
        if d.stake_fraction:
            by_event.setdefault(d.event_id, []).append(d)
    for group in by_event.values():
        if len(group) < 2:
            continue
        total = sum(x.stake_fraction or 0.0 for x in group)
        cap = max(x.stake_fraction or 0.0 for x in group)
        scale = cap / total if total > 0 else 1.0
        for x in group:
            x.stake_fraction = round((x.stake_fraction or 0.0) * scale, 5)
            if x.stake_amount is not None:
                x.stake_amount = round(x.stake_amount * scale, 2)
            others = ", ".join(o.selection for o in group if o is not x)
            x.risks.append(f"Misma exposición que {others}: el tamaño conjunto se limita al de una sola apuesta.")


def views(decisions: list[Decision]) -> dict:
    upcoming = [d for d in decisions if not d.live and d.p_fair is not None and d.state != NO_FIABLE]
    actionable = [d for d in decisions if d.state in ACTIONABLE]
    most_likely = max(upcoming, key=lambda d: (d.p_fair or 0, -d.minutes_to_start, d.id), default=None)
    best_bet = max(actionable, key=lambda d: (d.priority or -1, d.p_real or 0, d.id), default=None)
    quality = [d for d in actionable if d.quality_price is not None and (d.e_clv_lo or 0) > 0]
    best_quality = max(quality, key=lambda d: (d.quality_price or 0, d.id), default=None)
    return {"most_likely": most_likely, "best_bet": best_bet, "best_quality_price": best_quality}


def headline(decisions: list[Decision]) -> dict:
    ranked = rank(decisions)
    top = next((d for d in ranked if d.state in (EXCEPCIONAL, APOSTAR)), None)
    counts: dict[str, int] = {}
    for d in decisions:
        counts[d.state] = counts.get(d.state, 0) + 1
    if top is not None:
        return {"has_bet": True, "top": top, "counts": counts,
                "title": "🔥 ESTA ES LA QUE MÁS SENTIDO TIENE AHORA" if top.state == EXCEPCIONAL
                else "🟢 MEJOR OPORTUNIDAD AHORA"}
    closest = next((d for d in ranked if d.state in (INTERESANTE, ESPERAR)), None)
    return {"has_bet": False, "top": None, "closest": closest, "counts": counts,
            "title": "NO HAY NADA QUE MEREZCA LA PENA AHORA MISMO"}


def compare(decisions: list[Decision]) -> dict:
    if not decisions:
        return {"winner": None, "ranking": [], "text": "Nada que comparar."}
    ranked = rank(decisions)
    w = ranked[0]
    if w.state not in ACTIONABLE:
        return {"winner": None, "ranking": ranked,
                "text": "Ninguna de las opciones tiene una ventaja que merezca la pena."}
    lines = [f"La más interesante es «{w.selection}» @ {w.best_odds:.2f}: ventaja esperada "
             f"{pct(w.e_clv, True)} con un mínimo razonable de {pct(w.e_clv_lo, True)}."]
    for other in ranked[1:3]:
        if other.state in ACTIONABLE and other.e_clv is not None:
            lines.append(f"«{other.selection}» @ {other.best_odds:.2f} tiene {pct(other.e_clv, True)} "
                         f"(mínimo {pct(other.e_clv_lo, True)}).")
        else:
            lines.append(f"«{other.selection}»: {other.emoji} {other.label} — "
                         f"{(other.why_not or ['sin ventaja'])[0]}")
    return {"winner": w, "ranking": ranked, "text": " ".join(lines)}


def strategy_summary(strat: Strategy) -> dict:
    return {"key": strat.key, "state": strat.state, "reasons": strat.reasons,
            "kelly_fraction": strat.kelly_fraction, "oos": strat.oos.get("strategy")}
