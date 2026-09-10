"""Radar 'ahora mismo': recorre los mercados abiertos y saca solo lo que tiene
sentido mirar. Nada de rellenar con cuotas 1.01.

Por cada mercado (h2h) construye el consenso sharp, mira el mejor precio de cada
resultado y evalua esa apuesta con `evaluate_bet`. Devuelve las filas cuyo
veredicto es VALOR_SIN_VALIDAR o ARBITRAJE (y, si se pide, DUDOSO por chollo).
Ordenado por EV.
"""

from __future__ import annotations

from typing import Sequence

from .models import MarketBook
from .quant.betcheck import evaluate_bet, market_arbitrage

_SHOW = {"VALOR_SIN_VALIDAR", "ARBITRAJE"}


def _robust_arb(book_prices: dict, outcomes) -> dict | None:
    """Arbitraje que sobrevive quitando la MEJOR cuota de cada resultado.

    Un arb que solo existe con el precio top de una casa suele estar montado
    sobre una linea rancia o de otro partido. Si tambien sale con la 2ª mejor
    cuota, es mucho mas creible.
    """
    arb = market_arbitrage(book_prices, outcomes, commission=0.02)
    if not arb:
        return None
    second = {}
    for o in outcomes:
        od = sorted((pr[o] for pr in book_prices.values()
                     if pr.get(o) and pr[o] > 1.0), reverse=True)
        if len(od) < 2:
            return None
        second[o] = od[1]
    if sum(1.0 / second[o] for o in outcomes) >= 1.0:
        return None            # solo existe con el outlier: no me fio
    return arb


def radar_from_books(
    books: Sequence[MarketBook],
    *,
    sharp_books: Sequence[str],
    min_odds: float = 1.30,
    min_edge: float = 0.03,
    min_arb_roi: float = 0.01,     # arbitrajes por debajo de esto no se muestran
    min_books: int = 6,            # mercados con menos casas ni se miran
    include_dudoso: bool = False,
    model_probs_for=None,          # callable(book) -> dict|None  (opcional, futbol)
    model_trust: float = 0.0,
) -> list[dict]:
    out: list[dict] = []
    for mb in books:
        if mb.market != "h2h" or len(mb.outcomes) < 2:
            continue
        book_prices: dict[str, dict[str, float]] = {}
        for oc in mb.outcomes:
            for bk, price in oc.prices.items():
                book_prices.setdefault(bk, {})[oc.outcome] = price
        outcomes = [oc.outcome for oc in mb.outcomes]
        if len(book_prices) < min_books:
            continue

        mprobs = None
        if model_probs_for is not None:
            try:
                mprobs = model_probs_for(mb)
            except Exception:                       # noqa: BLE001
                mprobs = None

        arb = _robust_arb(book_prices, outcomes)
        best_row = None
        for oc in mb.outcomes:
            if not oc.prices:
                continue
            bk, best_odds = max(oc.prices.items(), key=lambda kv: kv[1])
            if best_odds < min_odds:
                continue
            res = evaluate_bet(
                book_prices=book_prices, outcomes=outcomes, target=oc.outcome,
                taken_odds=best_odds, stake=100.0, sharp_books=sharp_books,
                model_probs=mprobs, model_trust=model_trust if mprobs else 0.0,
                min_odds=min_odds, min_edge=min_edge,
            )
            keep = res["verdict"] in _SHOW or (include_dudoso and res["verdict"] == "DUDOSO")
            if not keep:
                continue
            row = {
                "match": mb.match, "sport": mb.sport, "market": "h2h",
                "outcome": oc.outcome, "book": bk, "odds": round(best_odds, 3),
                "ev": res["ev"], "p_used": res["p_used"],
                "fair_odds": res["fair_odds"], "verdict": res["verdict"],
                "title": res["title"], "n_books": res["n_books"],
                "commence": mb.commence_time.isoformat() if mb.commence_time else None,
                "hours_to_start": round(mb.hours_to_start(), 1),
                "arb": arb,
            }
            if best_row is None or row["ev"] > best_row["ev"]:
                best_row = row
        if best_row is not None:
            out.append(best_row)
        elif arb and arb["roi"] >= min_arb_roi:
            out.append({
                "match": mb.match, "sport": mb.sport, "market": "h2h",
                "outcome": "(arbitraje)", "book": "-", "odds": None,
                "ev": arb["roi"], "p_used": None, "fair_odds": None,
                "verdict": "ARBITRAJE",
                "title": f"Arbitraje {arb['roi'] * 100:+.2f}% repartiendo entre casas",
                "n_books": len(book_prices),
                "commence": mb.commence_time.isoformat() if mb.commence_time else None,
                "hours_to_start": round(mb.hours_to_start(), 1),
                "arb": arb,
            })
    out.sort(key=lambda r: r["ev"], reverse=True)
    return out
