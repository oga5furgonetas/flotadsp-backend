"""Lectura del fichero de calibración (lo único que el motor sabe del histórico)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

from .domain import H2H, SPREADS, TOTALS
from .pricing.edge_model import EdgeModel

DEFAULT_PATH = Path(__file__).resolve().parent / "assets" / "calibration.json"
PRICE_CLASS = "max"


@dataclass
class Strategy:
    key: str
    spec: dict

    @property
    def state(self) -> str:
        return self.spec["state"]

    @property
    def reasons(self) -> list[str]:
        return list(self.spec.get("reasons") or [])

    @property
    def method(self) -> str:
        return self.spec["method"]

    @property
    def reference(self) -> str:
        """``pin`` = comparada con Pinnacle · ``avg`` = comparada con el consenso del mercado."""
        return str(self.spec.get("reference", "pin"))

    @property
    def kelly_fraction(self) -> float:
        return float(self.spec.get("kelly_fraction") or 0.0)

    @property
    def implausible_ev(self) -> float:
        return float(self.spec.get("implausible_ev", 1.0))

    @property
    def exceptional(self) -> dict | None:
        return self.spec.get("exceptional")

    @property
    def oos(self) -> dict:
        return self.spec.get("oos") or {}

    @cached_property
    def model(self) -> EdgeModel | None:
        m = self.spec.get("model")
        return EdgeModel(m) if m else None


class Asset:
    def __init__(self, data: dict):
        if data.get("schema") != 1:
            raise ValueError("fichero de calibración con esquema desconocido")
        self.data = data
        self.version: str = data.get("version", "?")
        self._validated = set(data.get("runtime", {}).get("validated_sports", []))
        self._leagues = {v["odds_api"]: {"code": k, **v}
                         for k, v in data.get("data", {}).get("leagues", {}).items() if v.get("odds_api")}

    @classmethod
    def load(cls, path: Path | str | None = None) -> Asset:
        p = Path(path) if path else DEFAULT_PATH
        return cls(json.loads(p.read_text(encoding="utf-8")))

    @property
    def implausible_ev(self) -> float:
        return float(self.data.get("runtime", {}).get("implausible_ev", 1.0))

    @property
    def consensus_min_books(self) -> int:
        """Casas mínimas para fiarse del consenso como precio justo cuando Pinnacle no cotiza."""
        return int(self.data.get("runtime", {}).get("consensus_min_books", 6))

    def league(self, sport: str) -> dict | None:
        return self._leagues.get(sport)

    def is_validated_sport(self, sport: str) -> bool:
        return sport in self._validated

    def market_code(self, sport: str, market: str, line: float | None, n_outcomes: int) -> str | None:
        """Mercado de The Odds API → mercado validado del histórico, o None."""
        if not self.is_validated_sport(sport):
            return None
        if market == H2H and n_outcomes == 3:
            return "1X2"
        if market == TOTALS and line == 2.5:
            return "OU25"
        if market == SPREADS and line is not None:
            return "AH"
        return None

    def devig_method(self, market_code: str | None, n_outcomes: int) -> str:
        dv = self.data.get("devig", {})
        if market_code and market_code in dv:
            return dv[market_code]["method"]
        # mercado sin validar: el método del mercado validado con la misma forma
        return dv.get("1X2" if n_outcomes == 3 else "OU25", {}).get("method", "multiplicative")

    def strategy(self, market_code: str | None, reference: str = "pinnacle") -> Strategy | None:
        """La evidencia depende del mercado Y de contra qué se compara el precio: la ventaja
        frente a Pinnacle y la ventaja frente al consenso del mercado se validan por separado
        y pueden estar en estados distintos."""
        if not market_code:
            return None
        key = f"{market_code}|{PRICE_CLASS}" + ("" if reference == "pinnacle" else "|avg")
        spec = self.data.get("strategies", {}).get(key)
        return Strategy(key, spec) if spec else None

    def strategies(self) -> dict[str, Strategy]:
        return {k: Strategy(k, v) for k, v in self.data.get("strategies", {}).items()}
