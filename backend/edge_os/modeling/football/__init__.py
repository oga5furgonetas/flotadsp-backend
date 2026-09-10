"""Fútbol: modelos (Dixon-Coles, Elo) + derivación de mercados + datos + ensemble."""

from .data import MatchResult, SyntheticLeague, load_football_data_csv
from .dixon_coles import DixonColesModel
from .elo import EloModel
from .markets import markets_from_matrix
from .ratings import build_football_ensemble, load_matches

__all__ = [
    "MatchResult",
    "SyntheticLeague",
    "load_football_data_csv",
    "DixonColesModel",
    "EloModel",
    "markets_from_matrix",
    "build_football_ensemble",
    "load_matches",
]
