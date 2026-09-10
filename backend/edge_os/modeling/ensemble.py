"""Ensemble de modelos: combina varias señales 1X2 en una sola distribución.

Combinación = **pooling logarítmico** (media geométrica ponderada de las
probabilidades, renormalizada): p ∝ Π pᵢ^wᵢ. Es la forma estándar de agregar
opiniones probabilísticas (docs/AUDIT.md [R6]).

Además calcula señales de **desacuerdo entre modelos**, que son incertidumbre
real aunque todavía no haya histórico:

* `model_agreement` ∈ [0,1]  — 1 = todos los modelos dicen lo mismo.
* intervalo de P(local) = (mín, máx) entre modelos.

Los pesos hoy son de configuración (por defecto iguales). Aprender los pesos por
calibración/CLV/OOS es la Fase 7-8 y necesita histórico: hasta entonces el
ensemble se marca NOT VALIDATED.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np

from .base import MarketProbs


@dataclass
class EnsembleForecast:
    home_team: str
    away_team: str
    p_home: float
    p_draw: float
    p_away: float
    members: dict[str, tuple[float, float, float]]   # modelo -> (h, d, a)
    weights: dict[str, float]
    model_agreement: float                            # 0..1
    p_home_interval: tuple[float, float]
    p_draw_interval: tuple[float, float]
    p_away_interval: tuple[float, float]
    validated: bool = False
    fitted_asof: Optional[datetime] = None
    markets: Optional[MarketProbs] = None             # 1X2 (+ over si hay consenso)
    notes: list[str] = field(default_factory=list)

    def fair_1x2(self) -> dict[str, float]:
        return {"home": 1.0 / self.p_home, "draw": 1.0 / self.p_draw,
                "away": 1.0 / self.p_away}


def _tv(p: np.ndarray, q: np.ndarray) -> float:
    """Distancia de variación total entre dos distribuciones (0..1)."""
    return 0.5 * float(np.abs(p - q).sum())


class Ensemble:
    def __init__(self, weights: Optional[dict[str, float]] = None,
                 *, validated: bool = False):
        self._members: dict[str, object] = {}
        self._weights: dict[str, float] = dict(weights or {})
        self.validated = validated
        self.fitted_asof_: Optional[datetime] = None

    def add(self, name: str, model, *, weight: float = 1.0) -> "Ensemble":
        self._members[name] = model
        self._weights.setdefault(name, weight)
        if getattr(model, "fitted_asof_", None):
            self.fitted_asof_ = model.fitted_asof_
        return self

    @property
    def member_names(self) -> list[str]:
        return list(self._members)

    def _member_1x2(
        self, name: str, home: str, away: str,
        market_odds: Optional[dict[str, dict[str, float]]],
        market_labels: Optional[tuple[str, str, str]],
    ) -> Optional[tuple[float, float, float]]:
        model = self._members[name]
        try:
            if name == "market" or model.__class__.__name__ == "MarketModel":
                if not market_odds:
                    return None
                hl, dl, al = market_labels or (home, "Draw", away)
                mp = model.predict_1x2(
                    market_odds, home_label=hl, draw_label=dl, away_label=al,
                )
                return None if mp is None else (mp.home, mp.draw, mp.away)
            fc = model.predict(home, away)
            return (fc.markets.home, fc.markets.draw, fc.markets.away)
        except (KeyError, RuntimeError, ValueError):
            return None

    def predict(
        self, home: str, away: str, *,
        market_odds: Optional[dict[str, dict[str, float]]] = None,
        market_labels: Optional[tuple[str, str, str]] = None,
    ) -> Optional[EnsembleForecast]:
        got: dict[str, tuple[float, float, float]] = {}
        for name in self._members:
            r = self._member_1x2(name, home, away, market_odds, market_labels)
            if r is not None:
                got[name] = r
        if not got:
            return None

        w = {k: max(0.0, float(self._weights.get(k, 1.0))) for k in got}
        wsum = sum(w.values()) or 1.0

        # pooling logarítmico
        logp = np.zeros(3)
        for k, (h, d, a) in got.items():
            v = np.clip(np.array([h, d, a]), 1e-9, None)
            logp += (w[k] / wsum) * np.log(v)
        p = np.exp(logp)
        p = p / p.sum()

        # desacuerdo
        mats = [np.array(v) for v in got.values()]
        if len(mats) > 1:
            pairs = [(_tv(mats[i], mats[j]))
                     for i in range(len(mats)) for j in range(i + 1, len(mats))]
            agreement = 1.0 - float(np.mean(pairs))
        else:
            agreement = 1.0
        stack = np.vstack(mats)
        iv = [(float(stack[:, i].min()), float(stack[:, i].max())) for i in range(3)]

        notes = []
        if len(got) < len(self._members):
            missing = set(self._members) - set(got)
            notes.append(f"señales ausentes: {', '.join(sorted(missing))}")
        if not self.validated:
            notes.append("NOT VALIDATED: pesos sin calibrar, sin histórico OOS")

        return EnsembleForecast(
            home_team=home, away_team=away,
            p_home=float(p[0]), p_draw=float(p[1]), p_away=float(p[2]),
            members=got, weights={k: w[k] / wsum for k in got},
            model_agreement=round(agreement, 4),
            p_home_interval=iv[0], p_draw_interval=iv[1], p_away_interval=iv[2],
            validated=self.validated, fitted_asof=self.fitted_asof_,
            markets=MarketProbs(home=float(p[0]), draw=float(p[1]), away=float(p[2])),
            notes=notes,
        )
