"""Detección de value (+EV): comparar cada cuota contra el precio justo.

1. Se estima la probabilidad justa de cada resultado a partir de una
   referencia de mercado (casas *sharp*, o consenso de todas) y devigging.
2. Para cada (casa, resultado) se calcula el EV bruto  p_justa · cuota − 1.
3. Se aplica EV robusto (penalizaciones) y el motor de decisión.
4. Se calcula el stake por Kelly fraccional con haircut por incertidumbre.
"""

from __future__ import annotations

import statistics as _stats
from datetime import datetime, timezone
from typing import Optional

from ..models import MarketBook, ValueOpportunity
from . import decision as _dec
from .devig import devig
from .kelly import kelly_stake


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _reference_probs(
    book: MarketBook, *, method: str, mode: str,
    sharp_books: set[str], sharp_weight: float, min_reference_books: int,
) -> tuple[Optional[list[float]], str]:
    """Vector de probabilidades justas alineado con book.outcomes."""
    present_sharp = {
        b for oc in book.outcomes for b in oc.prices if b in sharp_books
    }

    use_sharp = mode == "sharp" and len(present_sharp) >= min_reference_books
    source = "sharp" if use_sharp else "consensus"

    pseudo_odds: list[float] = []
    for oc in book.outcomes:
        if use_sharp:
            vals = [p for b, p in oc.prices.items() if b in present_sharp]
        else:
            vals = []
            for b, p in oc.prices.items():
                w = sharp_weight if b in sharp_books else 1.0
                vals.extend([p] * int(round(w)))
        if not vals:
            return None, source
        # mediana de cuotas -> pseudo-cuota de referencia
        implied = [1.0 / v for v in vals]
        mean_implied = sum(implied) / max(len(implied), 1)
        pseudo_odds.append(1.0 / mean_implied)

    if len(pseudo_odds) < 2:
        return None, source
    try:
        probs = devig(pseudo_odds, method=method).tolist()
    except ValueError:
        return None, source
    return probs, source


def detect_value(
    book: MarketBook,
    *,
    vcfg: dict,
    devig_method: str,
    fair_cfg: dict,
    robust_cfg: dict,
    decision_cfg: dict,
    kelly_cfg: dict,
) -> list[ValueOpportunity]:
    if len(book.outcomes) < 2:
        return []

    h = book.hours_to_start()
    if h < 0 or h > float(vcfg.get("max_hours_to_start", 96)):
        return []

    sharp_books = set(fair_cfg.get("sharp_books", []))
    probs, source = _reference_probs(
        book,
        method=devig_method,
        mode=fair_cfg.get("mode", "sharp"),
        sharp_books=sharp_books,
        sharp_weight=float(fair_cfg.get("sharp_weight", 1.0)),
        min_reference_books=int(fair_cfg.get("min_reference_books", 1)),
    )
    if probs is None:
        return []

    min_edge = float(vcfg.get("min_edge", 0.02))
    min_odds = float(vcfg.get("min_odds", 1.3))
    max_odds = float(vcfg.get("max_odds", 10.0))
    exclude_ref = bool(vcfg.get("exclude_reference_books", True))
    n_books = book.n_books
    now = _now()

    out: list[ValueOpportunity] = []
    for oc, p_true in zip(book.outcomes, probs):
        if p_true <= 0 or p_true >= 1:
            continue
        implied_all = [1.0 / v for v in oc.prices.values()]
        dispersion = _stats.pstdev(implied_all) if len(implied_all) > 1 else 0.0

        for bk, price in oc.prices.items():
            if price < min_odds or price > max_odds:
                continue
            if exclude_ref and bk in sharp_books:
                continue
            raw_ev = p_true * price - 1.0
            if raw_ev < min_edge:
                continue

            lu = oc.last_update.get(bk)
            stale_min = 0.0
            if lu is not None:
                stale_min = max(0.0, (now - lu).total_seconds() / 60.0)

            rr = _dec.robust_ev(
                raw_ev=raw_ev, staleness_minutes=stale_min,
                dispersion=dispersion, n_books=n_books,
                rcfg=robust_cfg, dcfg=decision_cfg,
            )
            kf = kelly_stake(
                p_true, price,
                fraction=float(kelly_cfg.get("fraction", 0.25)),
                cap=float(kelly_cfg.get("cap", 0.03)),
                raw_ev=raw_ev, robust_ev=rr.robust_ev,
                uncertainty_haircut=bool(kelly_cfg.get("uncertainty_haircut", True)),
            )
            if rr.decision == "NO BET":
                kf = 0.0

            out.append(ValueOpportunity(
                event_id=book.event_id, match=book.match, sport=book.sport,
                market=book.market, point=book.point, outcome=oc.outcome,
                bookmaker=bk, price=round(price, 4),
                fair_price=round(1.0 / p_true, 4), true_prob=round(p_true, 5),
                edge=round(raw_ev, 5), robust_ev=rr.robust_ev,
                penalties=rr.penalties, kelly_fraction=kf,
                decision=rr.decision, confidence=rr.confidence,
                fair_source=source, n_books=n_books,
                commence_time=book.commence_time,
            ))

    out.sort(key=lambda v: v.robust_ev, reverse=True)
    return out
