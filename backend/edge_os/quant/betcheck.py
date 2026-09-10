"""Evaluador de una apuesta concreta: "veo esta cuota, ¿le meto X? ".

Sport-agnostico. Trabaja sobre el libro de un mercado
(`book_prices = {casa: {resultado: cuota}}`) y responde con un veredicto claro
mas el porque, construido SOLO con numeros reales:

  * probabilidad justa = consenso de casas sharp, de-vig por casa + pooling logit
  * EV de TU cuota frente a esa probabilidad justa
  * si hay mejor precio al mismo resultado en otra casa
  * si tu cuota esta tan separada del mercado que huele a error / va a moverse
  * si el mercado entero permite arbitraje
  * tamano de apuesta con sentido (Kelly fraccional con tope)

NUNCA promete ganar: el veredicto mas favorable es "VALOR (sin validar)".
Una cuota tipo 1.01 cae en "NO METER: cuota demasiado baja".
"""

from __future__ import annotations

import math
import statistics as _stats
from typing import Optional, Sequence

from .devig import devig
from .kelly import kelly_full

VERDICTS = ("VALOR_SIN_VALIDAR", "ARBITRAJE", "DUDOSO", "NO_METER", "SIN_DATOS")


def _logit(p: float) -> float:
    p = min(1 - 1e-9, max(1e-9, p))
    return math.log(p / (1 - p))


def _pool_logit(rows: list[tuple[float, list[float]]]) -> list[float]:
    """Media ponderada en escala logit de varias distribuciones, renormalizada."""
    w_total = sum(w for w, _ in rows) or 1.0
    n = len(rows[0][1])
    agg = [0.0] * n
    for w, p in rows:
        for i in range(n):
            agg[i] += w * _logit(p[i])
    raw = [1.0 / (1.0 + math.exp(-(a / w_total))) for a in agg]
    s = sum(raw) or 1.0
    return [x / s for x in raw]


def market_arbitrage(book_prices: dict, outcomes: Sequence[str],
                     *, commission: float = 0.0) -> Optional[dict]:
    """Mejor cuota por resultado; si Sum(1/o) < 1 hay arbitraje."""
    best: list[tuple[str, float]] = []
    for o in outcomes:
        cand = [(bk, pr[o]) for bk, pr in book_prices.items()
                if pr.get(o) and pr[o] > 1.0]
        if not cand:
            return None
        bk, od = max(cand, key=lambda kv: kv[1])
        if commission and ("_ex_" in bk or bk.startswith("betfair_ex")):
            od = 1.0 + (od - 1.0) * (1.0 - commission)
        best.append((bk, od))
    s = sum(1.0 / od for _, od in best)
    if s >= 1.0:
        return None
    return {
        "roi": round(1.0 / s - 1.0, 4),
        "sum_inverse": round(s, 4),
        "legs": [{"outcome": o, "book": bk, "odds": round(od, 3),
                  "stake_pct": round((1.0 / od) / s * 100, 1)}
                 for o, (bk, od) in zip(outcomes, best)],
    }


def evaluate_bet(
    *,
    book_prices: dict,
    outcomes: Sequence[str],
    target: str,
    taken_odds: float,
    stake: float,
    sharp_books: Sequence[str] = (),
    model_probs: Optional[dict] = None,
    model_trust: float = 0.0,
    min_odds: float = 1.30,
    min_edge: float = 0.03,
    above_market_gap: float = 0.05,      # tu cuota > mejor del mercado*(1+esto) => sospechosa
    better_price_gap: float = 0.025,     # >esto de mejora en otra casa => coge esa
    min_books_value: int = 6,            # menos casas que esto => no me fio del precio justo
    require_sharp: bool = True,          # sin Pinnacle/Betfair => consenso poco fiable
    max_edge_plausible: float = 0.20,    # +EV mayor que esto casi siempre es error de datos
    max_dispersion: float = 0.055,       # desv. de la prob. implicita entre casas
    kelly_fraction: float = 0.25,
    kelly_cap: float = 0.03,
    exchange_commission: float = 0.02,
) -> dict:
    outcomes = list(outcomes)
    sharp = set(sharp_books)
    if target not in outcomes:
        return {"verdict": "SIN_DATOS",
                "title": "Ese resultado no esta en el mercado",
                "reasons": [], "outcomes": outcomes}

    ti = outcomes.index(target)
    all_rows: list[tuple[float, list[float]]] = []
    sharp_rows: list[tuple[float, list[float]]] = []
    per_book_target: dict[str, float] = {}
    for bk, pr in book_prices.items():
        vals = [pr.get(o) for o in outcomes]
        if any(v is None or v <= 1.0 for v in vals):
            continue
        try:
            p = list(devig(vals, method="shin"))
        except ValueError:
            continue
        all_rows.append((3.0 if bk in sharp else 1.0, p))
        if bk in sharp:
            sharp_rows.append((1.0, p))
        if pr.get(target) and pr[target] > 1.0:
            per_book_target[bk] = pr[target]

    if not all_rows or not per_book_target:
        return {"verdict": "SIN_DATOS",
                "title": "El mercado no trae precios usables ahora mismo",
                "reasons": [], "outcomes": outcomes}

    src = "casas sharp" if sharp_rows else "consenso de todas las casas"
    pooled = _pool_logit(sharp_rows or all_rows)
    p_market = pooled[ti]

    p_used = p_market
    reasons: list[str] = []
    if model_probs and target in model_probs and 0.0 < model_trust <= 1.0:
        pm = float(model_probs[target])
        p_used = (1.0 - model_trust) * p_market + model_trust * pm
        reasons.append(
            f"Modelo propio de futbol: {pm * 100:.1f}% (peso {int(model_trust * 100)}%, "
            f"bajo a proposito: en backtest pierde contra el mercado)")

    fair_odds = 1.0 / p_used if p_used > 0 else float("inf")
    ev = p_used * taken_odds - 1.0

    best_book, best_odds = max(per_book_target.items(), key=lambda kv: kv[1])
    n_books = len(per_book_target)
    implied = [1.0 / v for v in per_book_target.values()]
    disp = _stats.pstdev(implied) if len(implied) > 1 else 0.0

    # ¿la mejor cuota la da UNA sola casa, muy por encima del resto?
    sorted_od = sorted(per_book_target.values(), reverse=True)
    second_od = sorted_od[1] if len(sorted_od) > 1 else sorted_od[0]
    lone_outlier = len(sorted_od) >= 3 and best_odds > second_od * 1.35

    # para el calculo de valor se IGNORA una mejor cuota que sea outlier solitario
    eff_best_odds, eff_best_book = best_odds, best_book
    if lone_outlier:
        eff_best_odds = second_od
        eff_best_book = next(b for b, o in per_book_target.items() if o == second_od)
    ev_best = p_used * eff_best_odds - 1.0

    reasons += [
        f"Probabilidad justa ({src}): {p_used * 100:.1f}%  ->  cuota justa {fair_odds:.2f}",
        f"Tu cuota {taken_odds:.2f}  ->  EV = {ev * 100:+.1f}%",
        f"Mejor precio fiable: {eff_best_odds:.2f} en {eff_best_book}  "
        f"({n_books} casas, dispersion {disp:.3f})"
        + (f"  ·  ojo: {best_book} da {best_odds:.2f} pero esta solo"
           if lone_outlier else ""),
    ]

    arb = market_arbitrage(book_prices, outcomes, commission=exchange_commission)

    # ¿podemos fiarnos del precio justo de este mercado?
    has_sharp = bool(sharp_rows)
    trust_reason = ""
    if n_books < min_books_value:
        trust_reason = (f"mercado demasiado fino: solo {n_books} casa(s). Con tan "
                        f"pocas, el 'precio justo' no es fiable.")
    elif require_sharp and not has_sharp:
        trust_reason = ("sin casa de referencia (Pinnacle / Betfair) en este "
                        "mercado. El consenso de casas blandas no es fiable.")
    elif disp > max_dispersion:
        trust_reason = (f"las casas no se ponen de acuerdo (dispersion "
                        f"{disp:.3f}): el precio justo es poco fiable.")

    # ── cascada de veredicto ────────────────────────────────
    #  Se mira PRIMERO el MEJOR precio del mercado. Si ni con ese hay valor, el
    #  resultado esta caro en todas partes -> NO METER. Si tu cuota esta por
    #  ENCIMA de todo el mercado -> sospechosa. Si el mejor precio SI vale pero
    #  tu no lo tienes -> coge esa. Si tu precio ya es (casi) el mejor -> VALOR.
    if taken_odds < min_odds:
        verdict = "NO_METER"
        title = (f"NO. Cuota {taken_odds:.2f}: demasiado baja, no hay margen para "
                 f"ninguna ventaja real.")
    elif lone_outlier and taken_odds >= best_odds * 0.98:
        verdict = "DUDOSO"
        title = (f"Sospechosa. Esa cuota ({best_odds:.2f}) la da SOLO {best_book}; "
                 f"el resto del mercado esta en {second_od:.2f} o menos. O es un "
                 f"error / va a caer, o esa casa sabe algo. Comprueba limites y "
                 f"reglas antes de tocarla.")
    elif trust_reason:
        verdict = "DUDOSO"
        title = f"No me fio de este mercado: {trust_reason}"
    elif taken_odds > eff_best_odds * (1.0 + above_market_gap):
        verdict = "DUDOSO"
        title = (f"Sospechosa. Tu cuota ({taken_odds:.2f}) esta por encima de todo "
                 f"el mercado fiable (maximo {eff_best_odds:.2f}). O va a bajar / "
                 f"es un error, o esa casa sabe algo. No me fio.")
    elif ev_best <= 0:
        verdict = "NO_METER"
        title = (f"NO. Por debajo de lo justo: el mercado da {fair_odds:.2f} y ni "
                 f"la mejor cuota que hay ({best_odds:.2f}) llega. A la larga "
                 f"pierdes.")
    elif ev_best < min_edge:
        verdict = "NO_METER"
        title = (f"NO. Ni cogiendo la mejor cuota ({best_odds:.2f}, "
                 f"+{ev_best * 100:.1f}%) hay valor suficiente: dentro del ruido.")
    elif eff_best_odds > taken_odds * (1.0 + better_price_gap):
        verdict = "DUDOSO"
        title = (f"No cojas esta ({taken_odds:.2f}). Al mismo resultado hay "
                 f"{eff_best_odds:.2f} en {eff_best_book} (+{ev_best * 100:.1f}%), "
                 f"mismo riesgo y mejor precio.")
    elif ev >= max_edge_plausible:
        verdict = "DUDOSO"
        title = (f"Demasiado bueno: +{ev * 100:.0f}% de EV. Un mercado con casas "
                 f"sharp casi nunca se equivoca tanto. Lo normal es que sea una "
                 f"linea vieja, un partido cruzado o un error del dato. No me fio.")
    elif ev < min_edge:
        verdict = "NO_METER"
        title = (f"NO. Tu cuota concreta ({taken_odds:.2f}) solo da +{ev * 100:.1f}%, "
                 f"dentro del ruido.")
    else:
        verdict = "VALOR_SIN_VALIDAR"
        title = (f"Tiene valor: +{ev * 100:.1f}% a tu cuota. Pero OJO: el sistema "
                 f"NO esta validado, no demuestra ganar a largo plazo. Apuesta "
                 f"poco si acaso.")

    # tamano de apuesta con sentido
    f_full = kelly_full(p_used, taken_odds)
    f_frac = round(min(kelly_cap, kelly_fraction * f_full), 4)
    if f_frac > 0:
        need_bankroll = stake / f_frac
        stake_info = {
            "kelly_pct": f_frac * 100,
            "bankroll_min": round(need_bankroll, -1),
            "msg": (f"Para meter {stake:.0f} EUR con este edge, tu bote deberia "
                    f"ser >= {need_bankroll:,.0f} EUR. Con menos, sobreapuestas."),
        }
    else:
        stake_info = {"kelly_pct": 0.0, "bankroll_min": None,
                      "msg": "Con este edge el tamano optimo de apuesta es 0 EUR."}

    return {
        "verdict": verdict, "title": title, "reasons": reasons,
        "target": target, "taken_odds": round(taken_odds, 3),
        "p_market": round(p_market, 4), "p_used": round(p_used, 4),
        "fair_odds": round(fair_odds, 2), "ev": round(ev, 4),
        "ev_best": round(ev_best, 4),
        "best_book": eff_best_book, "best_odds": round(eff_best_odds, 2),
        "lone_outlier": {"book": best_book, "odds": round(best_odds, 2)} if lone_outlier else None,
        "n_books": n_books, "dispersion": round(disp, 4), "has_sharp": has_sharp,
        "trusted": not trust_reason, "trust_reason": trust_reason or None,
        "consensus_src": src, "arb": arb, "stake": stake_info,
        "outcomes": outcomes,
    }
