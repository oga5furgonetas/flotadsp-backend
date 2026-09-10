"""Detección de arbitraje (surebets) y reparto de stake.

Con la mejor cuota disponible para cada resultado oᵢ*, si

        Σ 1/oᵢ*  <  1

existe arbitraje. Repartiendo el desembolso total B como

        stakeᵢ = B · (1/oᵢ*) / Σⱼ (1/oⱼ*)

el retorno es B / Σ(1/oⱼ*) pase lo que pase, con ROI = 1/Σ(1/oⱼ*) − 1.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

from ..models import ArbLeg, ArbOpportunity, MarketBook


def arb_stakes(best_odds, bankroll: float = 1.0) -> dict:
    o = np.asarray(best_odds, dtype=float)
    inv = 1.0 / o
    s = float(inv.sum())
    guaranteed = bankroll / s
    return {
        "sum_inverse": s,
        "is_arb": s < 1.0,
        "roi": guaranteed / bankroll - 1.0,
        "stakes": (bankroll * inv / s).tolist(),
        "stake_fractions": (inv / s).tolist(),
        "guaranteed_return": guaranteed,
        "profit": guaranteed - bankroll,
    }


def _adjust_commission(price: float, book: str, commission: float) -> float:
    """Cuota back efectiva tras comisión del exchange: 1 + (o−1)·(1−c)."""
    if commission and ("_ex_" in book or book.startswith("betfair")):
        return 1.0 + (price - 1.0) * (1.0 - commission)
    return price


def detect_arbitrage(
    book: MarketBook,
    *,
    min_roi: float = 0.0,
    exchange_commission: float = 0.0,
    max_hours_to_start: Optional[float] = None,
) -> Optional[ArbOpportunity]:
    if len(book.outcomes) < 2:
        return None
    if max_hours_to_start is not None:
        h = book.hours_to_start()
        if h < 0 or h > max_hours_to_start:
            return None

    best_books, best_prices = [], []
    for oc in book.outcomes:
        if not oc.prices:
            return None
        adj = {b: _adjust_commission(p, b, exchange_commission)
               for b, p in oc.prices.items()}
        b = max(adj, key=adj.__getitem__)
        best_books.append(b)
        best_prices.append(adj[b])

    res = arb_stakes(best_prices, bankroll=1.0)
    if not res["is_arb"] or res["roi"] < min_roi:
        return None

    legs = [
        ArbLeg(outcome=oc.outcome, bookmaker=bb, price=round(bp, 4),
               stake_fraction=round(sf, 4))
        for oc, bb, bp, sf in zip(book.outcomes, best_books, best_prices,
                                  res["stake_fractions"])
    ]
    return ArbOpportunity(
        event_id=book.event_id, match=book.match, sport=book.sport,
        market=book.market, point=book.point, commence_time=book.commence_time,
        legs=legs, sum_inverse=round(res["sum_inverse"], 6),
        roi=round(res["roi"], 6),
    )
