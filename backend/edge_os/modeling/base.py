"""Interfaz común de los modelos predictivos y contenedores de salida."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Sequence

import numpy as np


@dataclass
class MarketProbs:
    """Probabilidades derivadas de una matriz de marcadores.

    `over`/`under`/`ah_home` van indexadas por línea. Para hándicap asiático se
    guarda además `ah_push` (prob. de nulo) para poder calcular cuota justa con
    devolución de stake.
    """

    home: float
    draw: float
    away: float
    over: dict[float, float] = field(default_factory=dict)
    under: dict[float, float] = field(default_factory=dict)
    btts_yes: float = 0.0
    ah_home: dict[float, float] = field(default_factory=dict)      # P(home cubre)
    ah_push: dict[float, float] = field(default_factory=dict)      # P(nulo)

    def fair_1x2(self) -> dict[str, float]:
        return {"home": 1.0 / self.home, "draw": 1.0 / self.draw,
                "away": 1.0 / self.away}

    def fair_total(self, line: float) -> dict[str, float]:
        o = self.over[line]
        return {"over": 1.0 / o, "under": 1.0 / (1.0 - o)}

    def fair_ah_home(self, line: float) -> float:
        """Cuota justa AH lado local: gana→(o-1), nulo→0, pierde→-1  ⇒
        o = 1 + P(loss)/P(win), con P = probabilidades ajustadas por nulo."""
        p_win = self.ah_home[line]
        p_push = self.ah_push.get(line, 0.0)
        p_loss = max(1e-9, 1.0 - p_win - p_push)
        return 1.0 + p_loss / max(1e-9, p_win)


@dataclass
class MatchForecast:
    home_team: str
    away_team: str
    lambda_home: float                 # goles esperados local
    lambda_away: float                 # goles esperados visitante
    score_matrix: np.ndarray           # P[x, y] = P(local x, visitante y)
    markets: MarketProbs
    eff_matches_home: float            # Σ pesos time-decay de partidos del local
    eff_matches_away: float
    model: str = "dixon_coles"
    fitted_asof: Optional[datetime] = None

    def expected_goals(self) -> float:
        return self.lambda_home + self.lambda_away


class PredictiveModel(ABC):
    name: str = "base"

    @abstractmethod
    def fit(self, matches: Sequence, *, asof: datetime) -> "PredictiveModel":
        """Ajusta el modelo usando SOLO partidos con fecha <= asof."""

    @abstractmethod
    def predict(
        self, home: str, away: str, *, asof: Optional[datetime] = None
    ) -> MatchForecast:
        """Distribución de resultado para un enfrentamiento."""
