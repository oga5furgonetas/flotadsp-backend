"""Construcción del ensemble de fútbol a partir de datos reales o sintéticos.

`build_football_ensemble()` ajusta Dixon-Coles + Elo con los partidos anteriores
a `asof`, y (opcionalmente) añade `MarketModel` como tercera señal. Devuelve un
`Ensemble` listo para `predict(home, away, market_odds=...)`.

Los datos reales son CSV de football-data.co.uk que aporta el usuario (esta
función NO descarga). Sin CSV, cae a una liga sintética para que todo el
pipeline corra igualmente (marcado como simulado).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Sequence

from ..ensemble import Ensemble
from ..market_model import MarketModel
from .data import MatchResult, SyntheticLeague, load_football_data_csv
from .dixon_coles import DixonColesModel
from .elo import EloModel


def load_matches(csv_paths: Sequence[str | Path],
                 *, league: Optional[str] = None) -> list[MatchResult]:
    out: list[MatchResult] = []
    for p in csv_paths:
        out += load_football_data_csv(p, league=league)
    out.sort(key=lambda m: m.date)
    return out


def build_football_ensemble(
    *,
    matches: Optional[Sequence[MatchResult]] = None,
    csv_paths: Optional[Sequence[str | Path]] = None,
    asof: Optional[datetime] = None,
    half_life_days: float = 180.0,
    include_market: bool = True,
    weights: Optional[dict[str, float]] = None,
    synthetic_if_empty: bool = True,
) -> tuple[Ensemble, dict]:
    meta: dict = {"source": None, "n_matches": 0, "n_teams": 0, "simulated": False}

    if matches is None:
        if csv_paths:
            matches = load_matches(csv_paths)
            meta["source"] = "football-data.co.uk"
        else:
            matches = []

    if not matches and synthetic_if_empty:
        lg = SyntheticLeague(n_teams=20, seed=20260910)
        matches = lg.generate(seasons=3)
        meta["source"] = "SyntheticLeague (SIMULADO)"
        meta["simulated"] = True

    if not matches:
        raise ValueError("sin partidos y synthetic_if_empty=False")

    matches = sorted(matches, key=lambda m: m.date)
    if asof is None:
        asof = matches[-1].date + timedelta(days=1)
    asof = asof.astimezone(timezone.utc)
    train = [m for m in matches if m.date <= asof]

    dc = DixonColesModel(half_life_days=half_life_days).fit(train, asof=asof)
    elo = EloModel().fit(train, asof=asof)

    ens = Ensemble(weights=weights or {"dixon_coles": 1.0, "elo": 1.0, "market": 1.0},
                   validated=False)
    ens.add("dixon_coles", dc)
    ens.add("elo", elo)
    if include_market:
        ens.add("market", MarketModel())

    teams = sorted(set(dc.teams_))
    meta.update(n_matches=len(train), n_teams=len(teams), teams=teams,
                asof=asof.isoformat(), half_life_days=half_life_days,
                converged=dc._converged)
    return ens, meta
