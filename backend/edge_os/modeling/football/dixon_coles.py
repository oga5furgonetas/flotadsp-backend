"""Modelo Dixon-Coles (1997) con ponderación temporal.

Para un partido con marcador (x, y):

    λ = exp(base + atk_local  - def_visit + home_adv)      goles esperados local
    μ = exp(base + atk_visit  - def_local)                 goles esperados visitante

    P(x, y) = τ(x, y; λ, μ, ρ) · Poisson(x; λ) · Poisson(y; μ)

τ es la corrección de Dixon-Coles para marcadores bajos (0-0, 1-0, 0-1, 1-1),
que rompe la independencia del doble Poisson en los resultados donde más falla.

Ajuste: máxima verosimilitud **ponderada por tiempo**. Cada partido pesa
w = exp(-ξ · Δdías), con ξ = ln 2 / half_life_days. Esto implementa, para este
modelo, el principio de "la información envejece": partidos viejos cuentan menos.
El half-life óptimo por liga/mercado se aprendería con walk-forward (Fase 5);
aquí es un parámetro con un valor por defecto razonable (~medio año).

Identificabilidad: Σ atk = 0 y Σ def = 0 (se reparametriza fijando el último
equipo como −Σ del resto).

Referencias: Dixon & Coles (1997); dashee87.github.io (time-weighting, ξ≈0.0065
por media semana ≈ 0.0018/día). Ver docs/AUDIT.md [R5].
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional, Sequence

import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln

from ..base import MatchForecast, PredictiveModel
from .data import MatchResult
from .markets import markets_from_matrix

_MIN_TAU = 1e-10


def _tau_vec(x, y, lam, mu, rho):
    """Corrección DC vectorizada para los marcadores observados."""
    t = np.ones_like(lam, dtype=float)
    m00 = (x == 0) & (y == 0)
    m01 = (x == 0) & (y == 1)
    m10 = (x == 1) & (y == 0)
    m11 = (x == 1) & (y == 1)
    t = np.where(m00, 1.0 - lam * mu * rho, t)
    t = np.where(m01, 1.0 + lam * rho, t)
    t = np.where(m10, 1.0 + mu * rho, t)
    t = np.where(m11, 1.0 - rho, t)
    return np.clip(t, _MIN_TAU, None)


class DixonColesModel(PredictiveModel):
    name = "dixon_coles"

    def __init__(
        self,
        *,
        half_life_days: float = 180.0,
        max_goals: int = 10,
        rho_bounds: tuple[float, float] = (-0.15, 0.15),
    ):
        self.half_life_days = float(half_life_days)
        self.xi = math.log(2.0) / self.half_life_days if half_life_days else 0.0
        self.max_goals = int(max_goals)
        self.rho_bounds = rho_bounds

        self.teams_: list[str] = []
        self._idx: dict[str, int] = {}
        self.attack_: dict[str, float] = {}
        self.defense_: dict[str, float] = {}
        self.base_: float = 0.0
        self.home_adv_: float = 0.0
        self.rho_: float = 0.0
        self.eff_matches_: dict[str, float] = {}
        self.fitted_asof_: Optional[datetime] = None
        self.n_matches_: int = 0
        self._converged = False

    # ── ajuste ───────────────────────────────────────────────
    def fit(self, matches: Sequence[MatchResult], *, asof: datetime
            ) -> "DixonColesModel":
        if asof.tzinfo is None:
            raise ValueError("'asof' debe ser timezone-aware (UTC)")
        asof = asof.astimezone(timezone.utc)

        used = []
        for m in matches:
            if m.date > asof:
                raise ValueError(
                    f"partido {m.home_team}-{m.away_team} del {m.date.isoformat()} "
                    f"es posterior a asof {asof.isoformat()} (look-ahead)"
                )
            used.append(m)
        if len(used) < 20:
            raise ValueError("hacen falta al menos ~20 partidos para ajustar")

        teams = sorted({t for m in used for t in (m.home_team, m.away_team)})
        idx = {t: i for i, t in enumerate(teams)}
        n = len(teams)

        hi = np.array([idx[m.home_team] for m in used])
        ai = np.array([idx[m.away_team] for m in used])
        hg = np.array([m.home_goals for m in used], dtype=float)
        ag = np.array([m.away_goals for m in used], dtype=float)
        age = np.array([(asof - m.date).total_seconds() / 86400.0 for m in used])
        w = np.exp(-self.xi * age)
        lg_hg = gammaln(hg + 1.0)
        lg_ag = gammaln(ag + 1.0)

        # params: atk[0..n-2], def[0..n-2], base, home_adv, rho
        def unpack(theta):
            atk_free = theta[: n - 1]
            def_free = theta[n - 1: 2 * (n - 1)]
            base, hadv, rho = theta[-3], theta[-2], theta[-1]
            atk = np.concatenate([atk_free, [-atk_free.sum()]])
            dfn = np.concatenate([def_free, [-def_free.sum()]])
            return atk, dfn, base, hadv, rho

        def neg_ll(theta):
            atk, dfn, base, hadv, rho = unpack(theta)
            lam = np.exp(base + atk[hi] - dfn[ai] + hadv)
            mu = np.exp(base + atk[ai] - dfn[hi])
            tau = _tau_vec(hg, ag, lam, mu, rho)
            ll = (np.log(tau)
                  + hg * np.log(lam) - lam - lg_hg
                  + ag * np.log(mu) - mu - lg_ag)
            return -float(np.sum(w * ll))

        x0 = np.concatenate([
            np.zeros(n - 1), np.zeros(n - 1),
            [math.log(max(hg.mean() + ag.mean(), 0.5) / 2.0), 0.25, -0.05],
        ])
        bounds = ([(-3.0, 3.0)] * (2 * (n - 1))
                  + [(-1.5, 1.5), (-1.0, 1.0), self.rho_bounds])
        res = minimize(neg_ll, x0, method="L-BFGS-B", bounds=bounds,
                       options={"maxiter": 500, "ftol": 1e-10})

        atk, dfn, base, hadv, rho = unpack(res.x)
        self.teams_, self._idx = teams, idx
        self.attack_ = {t: float(atk[i]) for t, i in idx.items()}
        self.defense_ = {t: float(dfn[i]) for t, i in idx.items()}
        self.base_, self.home_adv_, self.rho_ = float(base), float(hadv), float(rho)
        self._converged = bool(res.success)
        self.n_matches_ = len(used)
        self.fitted_asof_ = asof

        eff = {t: 0.0 for t in teams}
        for j, m in enumerate(used):
            eff[m.home_team] += w[j]
            eff[m.away_team] += w[j]
        self.eff_matches_ = eff
        return self

    # ── predicción ───────────────────────────────────────────
    def _rates(self, home: str, away: str) -> tuple[float, float]:
        for t in (home, away):
            if t not in self._idx:
                raise KeyError(f"equipo no visto en el ajuste: {t!r}")
        lam = math.exp(self.base_ + self.attack_[home]
                       - self.defense_[away] + self.home_adv_)
        mu = math.exp(self.base_ + self.attack_[away] - self.defense_[home])
        return lam, mu

    def score_matrix(self, home: str, away: str) -> np.ndarray:
        lam, mu = self._rates(home, away)
        k = np.arange(self.max_goals + 1)
        px = np.exp(k * math.log(lam) - lam - gammaln(k + 1.0))
        py = np.exp(k * math.log(mu) - mu - gammaln(k + 1.0))
        P = np.outer(px, py)
        # corrección DC en las 4 celdas bajas
        rho = self.rho_
        P[0, 0] *= 1.0 - lam * mu * rho
        P[0, 1] *= 1.0 + lam * rho
        P[1, 0] *= 1.0 + mu * rho
        P[1, 1] *= 1.0 - rho
        P = np.clip(P, 0.0, None)
        return P / P.sum()

    def predict(self, home: str, away: str, *,
                asof: Optional[datetime] = None) -> MatchForecast:
        if not self.teams_:
            raise RuntimeError("modelo sin ajustar: llama a fit() primero")
        P = self.score_matrix(home, away)
        lam, mu = self._rates(home, away)
        return MatchForecast(
            home_team=home, away_team=away,
            lambda_home=lam, lambda_away=mu,
            score_matrix=P, markets=markets_from_matrix(P),
            eff_matches_home=self.eff_matches_.get(home, 0.0),
            eff_matches_away=self.eff_matches_.get(away, 0.0),
            model=self.name, fitted_asof=self.fitted_asof_,
        )

    # ── incertidumbre (bootstrap por partidos) ───────────────
    def predict_interval(
        self, home: str, away: str, *, matches: Sequence[MatchResult],
        asof: datetime, n_boot: int = 40, seed: int = 0, ci: float = 0.9,
    ) -> dict:
        """Intervalo de las probabilidades 1X2 por bootstrap (resampleo de
        partidos con reemplazo y reajuste). Es CARO y aproximado; la
        cuantificación de incertidumbre "de primera clase" es la Fase 7.
        """
        rng = np.random.default_rng(seed)
        base = self.predict(home, away, asof=asof).markets
        pool = list(matches)
        samples = {"home": [], "draw": [], "away": []}
        for _ in range(n_boot):
            boot = [pool[i] for i in rng.integers(0, len(pool), len(pool))]
            try:
                m = DixonColesModel(
                    half_life_days=self.half_life_days,
                    max_goals=self.max_goals, rho_bounds=self.rho_bounds,
                ).fit(boot, asof=asof)
                mk = m.predict(home, away, asof=asof).markets
            except (ValueError, KeyError, RuntimeError):
                continue
            samples["home"].append(mk.home)
            samples["draw"].append(mk.draw)
            samples["away"].append(mk.away)
        lo_q, hi_q = (1 - ci) / 2, 1 - (1 - ci) / 2
        out = {"point": {"home": base.home, "draw": base.draw, "away": base.away},
               "n_ok": len(samples["home"])}
        for k, vals in samples.items():
            if vals:
                out[k] = (float(np.quantile(vals, lo_q)),
                          float(np.quantile(vals, hi_q)))
        return out
