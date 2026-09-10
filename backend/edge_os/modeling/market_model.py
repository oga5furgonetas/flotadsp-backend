"""El mercado como UNA señal (no como la verdad).

Corrige los hallazgos M1/M3 de la auditoría:

* **de-vig por casa primero** (cada casa tiene su propio margen), y
* **agregación en escala logit** (log-odds), no en escala lineal — pooling
  logarítmico, ver docs/AUDIT.md [R6].

Pesos por casa configurables (las *sharp* pesan más). El resultado es una
probabilidad de consenso sin margen que el ensemble combina con los modelos
estadísticos igual que a cualquier otra señal.
"""

from __future__ import annotations

import math
from typing import Optional

import numpy as np

from .base import MarketProbs
from ..quant.devig import devig as _devig

DEFAULT_SHARP = {
    "pinnacle", "betfair_ex_eu", "betfair_ex_uk", "marathonbet", "matchbook",
    "smarkets",
}


def _logit(p: float) -> float:
    p = min(1 - 1e-9, max(1e-9, p))
    return math.log(p / (1 - p))


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


class MarketModel:
    """No se "ajusta": transforma cuotas en probabilidad de consenso."""

    name = "market"

    def __init__(
        self,
        *,
        devig_method: str = "shin",
        sharp_books: Optional[set[str]] = None,
        sharp_weight: float = 3.0,
    ):
        self.devig_method = devig_method
        self.sharp_books = set(sharp_books) if sharp_books else set(DEFAULT_SHARP)
        self.sharp_weight = float(sharp_weight)

    # odds_by_book: {casa: {outcome: cuota_decimal}}  con outcomes alineados
    def consensus_probs(
        self, odds_by_book: dict[str, dict[str, float]], outcomes: list[str]
    ) -> Optional[np.ndarray]:
        clean: list[tuple[float, list[float]]] = []
        for book, prices in odds_by_book.items():
            row = [prices.get(o) for o in outcomes]
            if any(v is None or v <= 1.0 for v in row):
                continue
            try:
                p = _devig(row, method=self.devig_method)   # de-vig POR CASA
            except ValueError:
                continue
            w = self.sharp_weight if book in self.sharp_books else 1.0
            clean.append((w, list(p)))
        if not clean:
            return None

        # media ponderada en escala logit, por outcome, y renormalizar
        W = sum(w for w, _ in clean)
        agg = np.zeros(len(outcomes))
        for w, p in clean:
            agg += w * np.array([_logit(v) for v in p])
        agg /= W
        probs = np.array([_sigmoid(v) for v in agg])
        return probs / probs.sum()

    def predict_1x2(
        self, odds_by_book: dict[str, dict[str, float]],
        *, home_label: str, draw_label: str, away_label: str,
    ) -> Optional[MarketProbs]:
        p = self.consensus_probs(odds_by_book, [home_label, draw_label, away_label])
        if p is None:
            return None
        return MarketProbs(home=float(p[0]), draw=float(p[1]), away=float(p[2]))

    def predict_total(
        self, odds_by_book: dict[str, dict[str, float]], line: float,
        *, over_label: str = "Over", under_label: str = "Under",
    ) -> Optional[dict[str, float]]:
        p = self.consensus_probs(odds_by_book, [over_label, under_label])
        if p is None:
            return None
        return {line: float(p[0])}
