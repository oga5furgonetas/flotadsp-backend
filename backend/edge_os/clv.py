"""Closing Line Value: la prueba falsable de que el sistema tiene ventaja.

Para cada apuesta registrada se estima la probabilidad justa de cierre
(p_close) devigando el consenso del último snapshot disponible. Entonces:

    CLV  =  p_close · cuota_tomada  −  1

Es decir, el EV de tu apuesta valorado a precio de cierre. Si tras muchas
apuestas la media de CLV es > 0 con significación estadística, estás batiendo
al mercado de forma consistente (no por suerte). Si es <= 0, no.

`settle_open_bets` rellena closing_price / closing_true_prob / clv.
`clv_summary` devuelve media, desviación, t-stat, IC 95 % y % positivo.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from .quant.devig import devig
from .storage import Storage


def _close_prob(prices_by_outcome: dict[str, list[float]], outcome: str,
                method: str = "power") -> tuple[float | None, float | None]:
    """(p_close, cuota_justa_close) para `outcome` a partir del consenso."""
    if outcome not in prices_by_outcome or len(prices_by_outcome) < 2:
        return None, None
    outcomes = list(prices_by_outcome)
    pseudo_odds = []
    for oc in outcomes:
        implied = [1.0 / p for p in prices_by_outcome[oc]]
        pseudo_odds.append(1.0 / (sum(implied) / max(len(implied), 1)))
    try:
        probs = devig(pseudo_odds, method=method)
    except ValueError:
        return None, None
    p = float(probs[outcomes.index(outcome)])
    return p, (1.0 / p if p > 0 else None)


def settle_open_bets(storage: Storage, method: str = "power") -> int:
    """Calcula CLV para apuestas cuyo evento ya ha empezado. Devuelve nº actualizadas."""
    now = datetime.now(timezone.utc)
    n = 0
    for b in storage.open_bets():
        ct = b["commence_time"]
        if ct:
            try:
                started = datetime.fromisoformat(ct) <= now
            except ValueError:
                started = True
        else:
            started = True
        if not started:
            continue

        market_prices = storage.closing_market(b["event_id"], b["market"], b["point"])
        p_close, fair_close = _close_prob(market_prices, b["outcome"], method)
        if p_close is None:
            continue

        best_close = max(market_prices.get(b["outcome"], [b["price_taken"]]))
        clv = p_close * b["price_taken"] - 1.0

        storage.update_bet(
            b["id"],
            closing_price=round(best_close, 4),
            closing_true_prob=round(p_close, 5),
            clv=round(clv, 5),
            status="settled_clv",
        )
        n += 1
    return n


def clv_summary(storage: Storage) -> dict:
    vals = [b["clv"] for b in storage.all_bets() if b["clv"] is not None]
    n = len(vals)
    if n == 0:
        return {"n": 0, "message": "sin apuestas con CLV calculado todavía"}

    mean = sum(vals) / n
    if n > 1:
        var = sum((v - mean) ** 2 for v in vals) / (n - 1)
        sd = math.sqrt(var)
        se = sd / math.sqrt(n)
        t = mean / se if se > 0 else float("inf")
        ci = (mean - 1.96 * se, mean + 1.96 * se)
    else:
        sd = se = 0.0
        t = float("inf") if mean > 0 else 0.0
        ci = (mean, mean)

    pos = sum(1 for v in vals if v > 0)

    if n < 30:
        verdict = "muestra insuficiente (n<30): sin conclusión"
    elif t > 2 and mean > 0:
        verdict = "CLV positivo y significativo: indicio real de ventaja"
    elif mean > 0:
        verdict = "CLV positivo pero NO significativo: seguir midiendo"
    else:
        verdict = "CLV <= 0: no estás batiendo el cierre (sin ventaja demostrada)"

    return {
        "n": n,
        "mean_clv": round(mean, 5),
        "median_clv": round(sorted(vals)[n // 2], 5),
        "std": round(sd, 5),
        "std_error": round(se, 5),
        "t_stat": round(t, 3) if math.isfinite(t) else None,
        "ci95": [round(ci[0], 5), round(ci[1], 5)],
        "pct_positive": round(100.0 * pos / n, 1),
        "verdict": verdict,
    }
