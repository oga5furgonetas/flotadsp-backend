"""Elo para fútbol (1X2 + supremacía) con regresión a la media entre temporadas.

Elo es intrínsecamente *recency-weighted*: cada partido mueve la valoración, y
los partidos recientes pesan más de forma natural. Se añade una regresión a la
media cuando hay un parón largo (nueva temporada): parte de la ventaja/desventaja
acumulada se difumina, que es lo que pasa en la realidad (fichajes, cambios de
plantilla).

Salida:
* 1X2 a partir de la diferencia de valoración + un modelo de empate que decrece
  con |Δrating| (partidos más igualados → más empates).
* over/under y hándicap asiático mediante una matriz Poisson construida con la
  supremacía implícita (mapeo heurístico; para mercados secundarios Elo es una
  señal aproximada, no la referencia).

No sustituye a Dixon-Coles: es una **segunda señal independiente** para el
ensemble. Ver docs/AUDIT.md [R6] (combinar señales).
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional, Sequence

import numpy as np

from ..base import MatchForecast, PredictiveModel
from .data import MatchResult
from .markets import markets_from_matrix


class EloModel(PredictiveModel):
    name = "elo"

    def __init__(
        self,
        *,
        k: float = 20.0,
        home_adv: float = 60.0,
        goal_diff_scaling: bool = True,
        season_regression: float = 0.12,
        season_gap_days: int = 45,
        start_rating: float = 1500.0,
        draw_base: float = 0.28,
        draw_decay: float = 220.0,
        avg_total_goals: float = 2.65,
        supremacy_scale: float = 1.35,
        max_goals: int = 10,
    ):
        self.k = k
        self.home_adv = home_adv
        self.goal_diff_scaling = goal_diff_scaling
        self.season_regression = season_regression
        self.season_gap_days = season_gap_days
        self.start_rating = start_rating
        self.draw_base = draw_base
        self.draw_decay = draw_decay
        self.avg_total_goals = avg_total_goals
        self.supremacy_scale = supremacy_scale
        self.max_goals = max_goals

        self.ratings_: dict[str, float] = {}
        self.games_: dict[str, int] = {}
        self.fitted_asof_: Optional[datetime] = None
        self.n_matches_: int = 0

    # ── ajuste ───────────────────────────────────────────────
    def fit(self, matches: Sequence[MatchResult], *, asof: datetime) -> "EloModel":
        if asof.tzinfo is None:
            raise ValueError("'asof' debe ser timezone-aware (UTC)")
        asof = asof.astimezone(timezone.utc)

        ms = sorted(matches, key=lambda m: m.date)
        for m in ms:
            if m.date > asof:
                raise ValueError(
                    f"partido {m.home_team}-{m.away_team} posterior a asof "
                    "(look-ahead)"
                )
        if len(ms) < 20:
            raise ValueError("hacen falta al menos ~20 partidos para ajustar")

        R: dict[str, float] = {}
        G: dict[str, int] = {}
        mean0 = self.start_rating
        prev_date = None

        for m in ms:
            if prev_date is not None:
                gap = (m.date - prev_date).days
                if gap >= self.season_gap_days and self.season_regression > 0:
                    for t in R:
                        R[t] += (mean0 - R[t]) * self.season_regression
            prev_date = m.date

            rh = R.setdefault(m.home_team, mean0)
            ra = R.setdefault(m.away_team, mean0)
            G[m.home_team] = G.get(m.home_team, 0) + 1
            G[m.away_team] = G.get(m.away_team, 0) + 1

            exp_home = 1.0 / (1.0 + 10 ** (-(rh + self.home_adv - ra) / 400.0))
            if m.home_goals > m.away_goals:
                s = 1.0
            elif m.home_goals == m.away_goals:
                s = 0.5
            else:
                s = 0.0

            mult = 1.0
            if self.goal_diff_scaling:
                gd = abs(m.home_goals - m.away_goals)
                mult = math.log1p(gd) + 1.0 if gd > 1 else 1.0

            delta = self.k * mult * (s - exp_home)
            R[m.home_team] = rh + delta
            R[m.away_team] = ra - delta

        self.ratings_, self.games_ = R, G
        self.fitted_asof_, self.n_matches_ = asof, len(ms)
        return self

    # ── predicción ───────────────────────────────────────────
    def _p1x2(self, home: str, away: str) -> tuple[float, float, float]:
        for t in (home, away):
            if t not in self.ratings_:
                raise KeyError(f"equipo no visto en el ajuste: {t!r}")
        dr = self.ratings_[home] + self.home_adv - self.ratings_[away]
        exp_home = 1.0 / (1.0 + 10 ** (-dr / 400.0))       # win + 0.5·draw
        p_draw = self.draw_base * math.exp(-abs(dr) / self.draw_decay)
        p_draw = min(0.34, max(0.06, p_draw))
        p_home = exp_home - p_draw / 2.0
        p_away = 1.0 - p_home - p_draw
        p = np.clip(np.array([p_home, p_draw, p_away]), 1e-4, None)
        p = p / p.sum()
        return float(p[0]), float(p[1]), float(p[2])

    def _score_matrix(self, home: str, away: str,
                      p1x2: tuple[float, float, float]) -> np.ndarray:
        dr = self.ratings_[home] + self.home_adv - self.ratings_[away]
        supremacy = self.supremacy_scale * dr / 400.0        # goles
        total = self.avg_total_goals
        lam = max(0.12, (total + supremacy) / 2.0)
        mu = max(0.12, (total - supremacy) / 2.0)
        k = np.arange(self.max_goals + 1)
        from scipy.special import gammaln
        px = np.exp(k * math.log(lam) - lam - gammaln(k + 1.0))
        py = np.exp(k * math.log(mu) - mu - gammaln(k + 1.0))
        P = np.outer(px, py)
        return P / P.sum()

    def predict(self, home: str, away: str, *,
                asof: Optional[datetime] = None) -> MatchForecast:
        if not self.ratings_:
            raise RuntimeError("modelo sin ajustar: llama a fit() primero")
        p_h, p_d, p_a = self._p1x2(home, away)
        P = self._score_matrix(home, away, (p_h, p_d, p_a))
        mk = markets_from_matrix(P)
        # 1X2 lo manda Elo; over/under/AH vienen de la matriz heurística
        mk.home, mk.draw, mk.away = p_h, p_d, p_a
        lam_home = float((np.arange(P.shape[0])[:, None] * P).sum())
        lam_away = float((np.arange(P.shape[1])[None, :] * P).sum())
        return MatchForecast(
            home_team=home, away_team=away,
            lambda_home=lam_home, lambda_away=lam_away,
            score_matrix=P, markets=mk,
            eff_matches_home=float(self.games_.get(home, 0)),
            eff_matches_away=float(self.games_.get(away, 0)),
            model=self.name, fitted_asof=self.fitted_asof_,
        )
