"""Tablero tipo casa de apuestas: cada cuota con su veredicto.

La idea: ver los partidos como en una casa de apuestas (evento + sus cuotas)
pero con cada precio ETIQUETADO segun lo que dice la matematica:

    VALOR     el precio esta por encima de lo justo  -> aqui esta el dinero
    JUSTA     precio normal de mercado               -> ni fu ni fa
    FLOJA     por debajo de lo justo                 -> pierdes despacio
    NI_LOCOS  muy por debajo de lo justo             -> pierdes rapido
    DUDOSA    no me fio del dato (mercado fino, sin sharp, disperso, rancio,
              outlier de una sola casa, o un EV tan alto que huele a error)

COMO SE CALCULA LO "JUSTO" (esta es toda la logica):

  1. A cada casa se le quita SU margen por separado (metodo de Shin sobre sus
     propias cuotas). Una casa con 8 % de margen y otra con 2 % no se pueden
     promediar en crudo.
  2. Las probabilidades limpias se promedian en escala logit (log-odds), que es
     la forma correcta de agregar opiniones probabilisticas.
  3. Solo cuentan las casas de referencia (Pinnacle, Betfair exchange,
     Marathonbet...): son las que aceptan dinero profesional y mueven la linea.
     Su consenso sin margen es la mejor estimacion publica de la probabilidad
     real. Si no hay ninguna en el mercado, NO se emite veredicto de valor.
  4. EV de un precio = p_justa * cuota - 1.
  5. Al evaluar el precio de una casa que esta EN el consenso, esa casa se
     excluye del consenso (si no, se compara consigo misma).

Lo que esto SI es: detectar cuando una casa blanda se ha quedado por detras
del dinero listo. Es el unico mecanismo publico y repetible que existe, y se
mide con CLV (batir la linea de cierre).
Lo que esto NO es: una bola de cristal. El veredicto VALOR dice "este precio
esta por encima del consenso profesional", no "esto va a entrar".
"""

from __future__ import annotations

import math
import statistics as _stats
from datetime import datetime, timezone
from typing import Optional, Sequence

from .models import MarketBook
from .quant.devig import devig
from .quant.kelly import kelly_full

SHARP_DEFAULT = ("pinnacle", "betfair_ex_eu", "betfair_ex_uk", "marathonbet",
                 "matchbook", "smarkets", "betfair")

# ── umbrales de etiqueta (EV) ───────────────────────────────
TAG_VALOR = 0.03        # >= +3 %  -> VALOR
TAG_JUSTA = -0.02       # >= -2 %  -> JUSTA
TAG_FLOJA = -0.06       # >= -6 %  -> FLOJA ; por debajo -> NI_LOCOS

# ── puertas contra falsos positivos ─────────────────────────
MIN_BOOKS = 6           # menos casas: el consenso no es fiable
MIN_ODDS = 1.30         # por debajo no hay margen para nada
MAX_ODDS = 15.0         # por encima, la estimacion de probabilidad es ruido
MAX_DISPERSION = 0.055  # desv. tipica de la prob. implicita entre casas
MAX_EV_PLAUSIBLE = 0.20 # un +EV mayor casi siempre es un error de datos
LONE_OUTLIER = 1.35     # mejor cuota > 2a mejor * esto -> outlier solitario
STALE_LIVE_SEC = 180    # en vivo, un precio mas viejo que esto no vale
STALE_PRE_SEC = 3600    # pre-partido se puede ser mas laxo

# ── por que una cuota de 7 casi nunca puede ser "valor" ─────
#
#   EV = p * cuota - 1.  Si la probabilidad justa tiene un error tipico σ,
#   el error del EV es  cuota * σ.  O sea: EL RUIDO DEL EV CRECE CON LA CUOTA.
#
#   Con σ = 0.008 (lo que se afinan entre si las casas de referencia):
#     cuota 1.80  ->  ruido 1.4 %   un +4 % son casi 3 sigmas: señal
#     cuota 4.00  ->  ruido 3.2 %   un +4 % es 1.2 sigmas: ruido
#     cuota 7.50  ->  ruido 6.0 %   un +4 % no significa NADA
#
#   Por eso no basta con pedir "+3 % de EV": se pide ademas que el EV sea
#   varias veces su propio ruido. Esto tira solo los longshots y deja pasar
#   las cuotas de 1.5-2.5, que es donde el dinero es real.
SIGMA_FLOOR = 0.008     # error irreducible de la probabilidad justa
Z_MIN = 1.8             # cuantas veces su ruido tiene que valer el EV
BAND_LO, BAND_HI = 1.40, 3.20   # franja util: donde se apuesta de verdad

_TAG_ORDER = {"VALOR": 0, "DUDOSA": 1, "JUSTA": 2, "FLOJA": 3, "NI_LOCOS": 4}


def _logit(p: float) -> float:
    p = min(1 - 1e-9, max(1e-9, p))
    return math.log(p / (1 - p))


def _pool_logit(rows: list[tuple[float, list[float]]]) -> list[float]:
    w_total = sum(w for w, _ in rows) or 1.0
    n = len(rows[0][1])
    agg = [0.0] * n
    for w, p in rows:
        for i in range(n):
            agg[i] += w * _logit(p[i])
    raw = [1.0 / (1.0 + math.exp(-(a / w_total))) for a in agg]
    s = sum(raw) or 1.0
    return [x / s for x in raw]


def _devig_book(prices: dict, outcomes: Sequence[str]) -> Optional[list[float]]:
    vals = [prices.get(o) for o in outcomes]
    if any(v is None or v <= 1.0 for v in vals):
        return None
    try:
        return list(devig(vals, method="shin"))
    except ValueError:
        return None


def sharp_devigged(book_prices: dict, outcomes: Sequence[str],
                   sharp_books: Sequence[str]) -> dict[str, list[float]]:
    """{casa_sharp: probabilidades sin margen}. Se calcula UNA vez por mercado:
    el de-vig de Shin resuelve una ecuacion y repetirlo por cada precio del
    tablero multiplicaba el coste por 60."""
    sharp = set(sharp_books)
    out: dict[str, list[float]] = {}
    for bk, prices in book_prices.items():
        if bk not in sharp:
            continue
        p = _devig_book(prices, outcomes)
        if p is not None:
            out[bk] = p
    return out


def _pool_excluding(devigged: dict[str, list[float]],
                    exclude_book: Optional[str] = None) -> Optional[list[float]]:
    rows = [(1.0, p) for bk, p in devigged.items() if bk != exclude_book]
    return _pool_logit(rows) if rows else None


def fair_probabilities(
    book_prices: dict, outcomes: Sequence[str], sharp_books: Sequence[str],
    *, exclude_book: Optional[str] = None,
) -> Optional[dict]:
    """Consenso sin margen de las casas de referencia.

    Devuelve None si no hay ninguna casa de referencia utilizable: sin ellas
    NO se emite veredicto de valor (es la puerta que evita inventarse un
    precio justo a partir de casas blandas).
    """
    dev = sharp_devigged(book_prices, outcomes, sharp_books)
    probs = _pool_excluding(dev, exclude_book)
    if probs is None:
        return None
    return {"probs": probs,
            "n_sharp": len([b for b in dev if b != exclude_book])}


def sigma_of(devigged: dict[str, list[float]], idx: int) -> float:
    """Error tipico de la probabilidad justa de un resultado.

    Se mide por lo que se separan entre si las casas de referencia. Con pocas
    casas ese numero se queda corto, asi que hay un suelo: nunca se pretende
    saber la probabilidad mejor que +-0.8 puntos.
    """
    vals = [p[idx] for p in devigged.values()]
    if len(vals) < 2:
        return SIGMA_FLOOR
    return max(SIGMA_FLOOR, _stats.pstdev(vals) / math.sqrt(len(vals)))


def _tag(ev: float, *, trusted: bool, suspicious: bool,
         allow_valor: bool = True, ev_z: Optional[float] = None) -> str:
    """`allow_valor=False` para cuotas fuera de la franja util. `ev_z` es el EV
    medido en veces-su-propio-ruido: por debajo de Z_MIN no es valor, es ruido
    (y eso es justo lo que descarta los longshots de cuota 5-15)."""
    if suspicious or not trusted:
        return "DUDOSA"
    if (ev >= TAG_VALOR and allow_valor
            and (ev_z is None or ev_z >= Z_MIN)):
        return "VALOR"
    if ev >= TAG_JUSTA:
        return "JUSTA"
    if ev >= TAG_FLOJA:
        return "FLOJA"
    return "NI_LOCOS"


def _arbitrage(book_prices: dict, outcomes: Sequence[str],
               *, commission: float = 0.02, robust: bool = True
               ) -> Optional[dict]:
    """Arbitraje con la mejor cuota de cada resultado. Con `robust`, solo se
    admite si TAMBIEN sale usando la 2a mejor: un arb que vive de un unico
    precio suele estar montado sobre una linea rancia."""
    best, second = [], []
    for o in outcomes:
        cand = sorted(((bk, pr[o]) for bk, pr in book_prices.items()
                       if pr.get(o) and pr[o] > 1.0),
                      key=lambda kv: kv[1], reverse=True)
        if not cand:
            return None
        bk, od = cand[0]
        if commission and ("_ex_" in bk or bk.startswith("betfair_ex")):
            od = 1.0 + (od - 1.0) * (1.0 - commission)
        best.append((bk, od))
        second.append(cand[1][1] if len(cand) > 1 else None)
    s = sum(1.0 / od for _, od in best)
    if s >= 1.0:
        return None
    if robust:
        if any(x is None for x in second):
            return None
        if sum(1.0 / x for x in second) >= 1.0:
            return None
    return {
        "roi": round(1.0 / s - 1.0, 4), "sum_inverse": round(s, 4),
        "legs": [{"outcome": o, "book": bk, "odds": round(od, 3),
                  "stake_pct": round((1.0 / od) / s * 100, 1)}
                 for o, (bk, od) in zip(outcomes, best)],
    }


def compare_outcomes(rows: Sequence[dict], *, same_odds_pct: float = 0.08,
                     min_gap: float = 0.03) -> list[dict]:
    """«Estas dos estan a 1.80 las dos, pero a esta metele.»

    Busca parejas de resultados del MISMO partido cuyas cuotas son practicamente
    iguales (±8 %) y cuyo EV NO lo es. Es la comparacion que una casa de apuestas
    nunca te va a enseñar: mismo precio, mismo riesgo aparente, y uno de los dos
    esta bien pagado y el otro no.
    """
    out = []
    usable = [r for r in rows if r.get("ev") is not None and r.get("best_odds")]
    for i in range(len(usable)):
        for j in range(i + 1, len(usable)):
            a, b = usable[i], usable[j]
            lo = min(a["best_odds"], b["best_odds"])
            if lo <= 0 or abs(a["best_odds"] - b["best_odds"]) / lo > same_odds_pct:
                continue
            gap = a["ev"] - b["ev"]
            if abs(gap) < min_gap:
                continue
            mejor, peor = (a, b) if gap > 0 else (b, a)
            # «Metele a este» es una recomendacion: no puede recaer sobre un
            # precio del que el propio motor desconfia (viejo, fuera de banda o
            # una casa sola pagando de mas). Que el otro lado sea malo no basta
            # para que este sea bueno.
            if (mejor["tag"] in ("DUDOSA", "NI_LOCOS") or mejor.get("stale")
                    or mejor.get("lone_outlier") or not mejor.get("in_band")):
                continue
            out.append({
                "mejor": mejor["name"], "peor": peor["name"],
                "odds_mejor": mejor["best_odds"], "odds_peor": peor["best_odds"],
                "book_mejor": mejor["best_book"], "book_peor": peor["best_book"],
                "ev_mejor": mejor["ev"], "ev_peor": peor["ev"],
                "gap": round(abs(gap), 4),
                "texto": (f"{mejor['name']} y {peor['name']} estan casi a la misma "
                          f"cuota ({mejor['best_odds']} vs {peor['best_odds']}), pero "
                          f"lo justo seria {mejor['fair_odds']} y {peor['fair_odds']}: "
                          f"{mejor['name']} paga {abs(gap) * 100:.1f} puntos mejor. "
                          f"Metele a {mejor['name']}, no a {peor['name']}."),
            })
    out.sort(key=lambda c: c["gap"], reverse=True)
    return out


def build_event(
    mb: MarketBook,
    *,
    sharp_books: Sequence[str] = SHARP_DEFAULT,
    now: Optional[datetime] = None,
    min_books: int = MIN_BOOKS,
    sport_title: str = "",
) -> Optional[dict]:
    """Un evento del tablero: sus resultados, cada uno con su mejor precio,
    el precio justo, el EV y la etiqueta. Devuelve None si no es utilizable."""
    if mb.market != "h2h" or len(mb.outcomes) < 2:
        return None
    now = now or datetime.now(timezone.utc)

    book_prices: dict[str, dict[str, float]] = {}
    last_seen: dict[str, dict[str, Optional[datetime]]] = {}
    for oc in mb.outcomes:
        for bk, price in oc.prices.items():
            book_prices.setdefault(bk, {})[oc.outcome] = price
            last_seen.setdefault(bk, {})[oc.outcome] = oc.last_update.get(bk)
    outcomes = [oc.outcome for oc in mb.outcomes]
    n_books = len(book_prices)

    live = mb.commence_time is not None and mb.commence_time <= now
    starts_in = ((mb.commence_time - now).total_seconds() / 60.0
                 if mb.commence_time else None)

    devigged = sharp_devigged(book_prices, outcomes, sharp_books)
    has_sharp = bool(devigged)

    # dispersion media de la probabilidad implicita entre casas
    disps = []
    for oc in mb.outcomes:
        vals = [1.0 / v for v in oc.prices.values() if v > 1.0]
        if len(vals) > 1:
            disps.append(_stats.pstdev(vals))
    disp = max(disps) if disps else 0.0

    trust_reason = None
    if n_books < min_books:
        trust_reason = f"solo {n_books} casa(s): mercado demasiado fino"
    elif not has_sharp:
        trust_reason = "sin casa de referencia (Pinnacle / Betfair / Marathonbet)"
    elif disp > MAX_DISPERSION:
        trust_reason = f"las casas no se ponen de acuerdo (dispersion {disp:.3f})"
    trusted = trust_reason is None

    stale_limit = STALE_LIVE_SEC if live else STALE_PRE_SEC
    out_rows = []
    for idx, oc in enumerate(mb.outcomes):
        prices = {bk: p for bk, p in oc.prices.items() if p > 1.0}
        if not prices:
            return None
        ordered = sorted(prices.items(), key=lambda kv: kv[1], reverse=True)
        best_book, best_odds = ordered[0]
        second_odds = ordered[1][1] if len(ordered) > 1 else None
        lone = (len(ordered) >= 3 and second_odds
                and best_odds > second_odds * LONE_OUTLIER)

        sigma = sigma_of(devigged, idx) if devigged else SIGMA_FLOOR

        per_book = []
        p_fair = None
        if trusted:
            for bk, od in ordered:
                ref = _pool_excluding(devigged, exclude_book=bk)
                if ref is None:
                    continue
                pf = ref[idx]
                ev = pf * od - 1.0
                z = ev / (od * sigma) if od * sigma > 0 else 0.0
                age = last_seen.get(bk, {}).get(oc.outcome)
                stale = bool(age and (now - age).total_seconds() > stale_limit)
                susp = (stale or ev > MAX_EV_PLAUSIBLE
                        or (lone and od == best_odds))
                per_book.append({
                    "book": bk, "odds": round(od, 3), "ev": round(ev, 4),
                    "ev_z": round(z, 2),
                    "tag": _tag(ev, trusted=True, suspicious=susp, ev_z=z,
                                allow_valor=MIN_ODDS <= od <= MAX_ODDS),
                    "stale": stale,
                })
                if bk == best_book:
                    p_fair = pf
        if p_fair is None:
            ref = _pool_excluding(devigged, exclude_book=best_book)
            p_fair = ref[idx] if ref else None

        ev_best = (p_fair * best_odds - 1.0) if p_fair else None
        noise = best_odds * sigma
        ev_z_best = (ev_best / noise) if (ev_best is not None and noise > 0) else None
        age_best = last_seen.get(best_book, {}).get(oc.outcome)
        stale_best = bool(age_best and (now - age_best).total_seconds() > stale_limit)
        susp_best = (ev_best is None or stale_best
                     or ev_best > MAX_EV_PLAUSIBLE or bool(lone))
        tag = _tag(ev_best or 0.0, trusted=trusted, suspicious=susp_best,
                   ev_z=ev_z_best,
                   allow_valor=MIN_ODDS <= best_odds <= MAX_ODDS)

        kelly_pct = 0.0
        if tag == "VALOR" and p_fair:
            kelly_pct = round(min(0.03, 0.25 * kelly_full(p_fair, best_odds)) * 100, 2)

        out_rows.append({
            "name": oc.outcome,
            "best_odds": round(best_odds, 3), "best_book": best_book,
            "p_fair": round(p_fair, 4) if p_fair else None,
            "fair_odds": round(1.0 / p_fair, 2) if p_fair else None,
            "ev": round(ev_best, 4) if ev_best is not None else None,
            "ev_z": round(ev_z_best, 2) if ev_z_best is not None else None,
            "sigma": round(sigma, 4), "ev_noise": round(noise, 4),
            "in_band": BAND_LO <= best_odds <= BAND_HI,
            "tag": tag, "kelly_pct": kelly_pct,
            "stale": stale_best,
            "lone_outlier": bool(lone),
            "books": per_book,
        })

    return {
        "event_id": mb.event_id, "sport": mb.sport, "sport_title": sport_title,
        "match": mb.match, "home": mb.home, "away": mb.away,
        "commence": mb.commence_time.isoformat() if mb.commence_time else None,
        "live": live,
        "starts_in_min": round(starts_in, 1) if starts_in is not None else None,
        "n_books": n_books, "trusted": trusted, "trust_reason": trust_reason,
        "dispersion": round(disp, 4),
        "arb": _arbitrage(book_prices, outcomes) if trusted else None,
        "outcomes": out_rows,
        "compare": compare_outcomes(out_rows) if trusted else [],
        "best_tag": min((o["tag"] for o in out_rows),
                        key=lambda t: _TAG_ORDER.get(t, 9)),
        "best_ev": max((o["ev"] for o in out_rows if o["ev"] is not None),
                       default=None),
        "best_z": max((o["ev_z"] for o in out_rows if o["ev_z"] is not None),
                      default=None),
    }


def build_board(
    books: Sequence[MarketBook], *,
    sharp_books: Sequence[str] = SHARP_DEFAULT,
    sport_titles: Optional[dict] = None,
    now: Optional[datetime] = None,
) -> list[dict]:
    """Todos los eventos, ordenados: primero los que tienen valor."""
    titles = sport_titles or {}
    out = []
    for mb in books:
        ev = build_event(mb, sharp_books=sharp_books, now=now,
                         sport_title=titles.get(mb.sport, mb.sport))
        if ev:
            out.append(ev)
    out.sort(key=lambda e: (_TAG_ORDER.get(e["best_tag"], 9),
                            -(e["best_ev"] if e["best_ev"] is not None else -9)))
    return out


def top_opportunities(
    events: Sequence[dict], *,
    min_ev: float = TAG_VALOR,
    min_books: int = 8,
    max_items: int = 20,
    band: Optional[tuple[float, float]] = (BAND_LO, BAND_HI),
) -> list[dict]:
    """"No dejes escapar esto": solo lo que pasa TODAS las puertas.

    Mas estricto que el tablero: mas casas, nada dudoso, y SOLO cuotas dentro
    de la franja apostable (`band`). Se ordena por señal/ruido, no por EV: a
    cuota alta el EV es casi todo ruido. Los arbitrajes van primero porque son
    la unica ventaja que no depende de acertar ninguna probabilidad.
    """
    picks: list[dict] = []
    for e in events:
        if e["arb"] and e["n_books"] >= min_books:
            picks.append({
                "kind": "ARBITRAJE", "event_id": e["event_id"],
                "match": e["match"], "sport": e["sport"],
                "sport_title": e["sport_title"], "live": e["live"],
                "commence": e["commence"], "starts_in_min": e["starts_in_min"],
                "outcome": "(cubrir todo el mercado)", "book": "varias",
                "odds": None, "fair_odds": None,
                "ev": e["arb"]["roi"], "kelly_pct": None,
                "n_books": e["n_books"], "arb": e["arb"],
                "why": [f"Cubriendo los {len(e['arb']['legs'])} resultados en "
                        f"distintas casas el retorno es fijo: "
                        f"{e['arb']['roi'] * 100:+.2f}% pase lo que pase.",
                        "Sujeto a limites de cada casa y a que los precios "
                        "sigan ahi cuando vayas."],
            })
        if not e["trusted"] or e["n_books"] < min_books:
            continue
        for o in e["outcomes"]:
            if o["tag"] != "VALOR" or o["ev"] is None or o["ev"] < min_ev:
                continue
            if band and not (band[0] <= o["best_odds"] <= band[1]):
                continue            # fuera de la franja apostable
            comp = next((c for c in e.get("compare", [])
                         if c["mejor"] == o["name"]), None)
            why = [
                f"El consenso de las casas de referencia, quitado el margen, "
                f"da {o['p_fair'] * 100:.1f}% -> cuota justa {o['fair_odds']}.",
                f"{o['best_book']} paga {o['best_odds']}: EV {o['ev'] * 100:+.1f}%.",
                f"Ese EV es {o['ev_z']}x su propio margen de error "
                f"(±{o['ev_noise'] * 100:.1f}% a esta cuota), asi que no es ruido.",
                f"{e['n_books']} casas y coinciden (dispersion {e['dispersion']}).",
            ]
            if comp:
                why.append(comp["texto"])
            picks.append({
                "kind": "VALOR", "event_id": e["event_id"],
                "match": e["match"], "sport": e["sport"],
                "sport_title": e["sport_title"], "live": e["live"],
                "commence": e["commence"], "starts_in_min": e["starts_in_min"],
                "outcome": o["name"], "book": o["best_book"],
                "odds": o["best_odds"], "fair_odds": o["fair_odds"],
                "ev": o["ev"], "ev_z": o["ev_z"], "kelly_pct": o["kelly_pct"],
                "n_books": e["n_books"], "arb": None, "compare": comp,
                "why": why,
            })
    # se ordena por SEÑAL/RUIDO, no por EV pelado: un +5 % a cuota 1.8 vale
    # mucho mas que un +5 % a cuota 7, y ordenando por EV salia al reves.
    picks.sort(key=lambda p: (0 if p["kind"] == "ARBITRAJE" else 1,
                              -(p.get("ev_z") or 0.0), -p["ev"]))
    return picks[:max_items]
