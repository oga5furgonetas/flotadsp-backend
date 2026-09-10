"""Estructuras de datos del dominio.

Quote          -> un precio, para un resultado, de una casa, en un instante.
MarketBook     -> todas las cuotas de un mercado agrupadas (resultado x casa).
ArbOpportunity -> surebet detectada + reparto de stake.
ValueOpportunity -> apuesta con EV positivo tras devigging + EV robusto + decisión.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class Quote:
    """Un precio decimal para un resultado concreto de una casa concreta."""

    event_id: str
    sport: str
    commence_time: datetime
    home: str
    away: str
    market: str                     # 'h2h' | 'spreads' | 'totals'
    bookmaker: str                  # clave de casa (p.ej. 'pinnacle')
    outcome: str                    # nombre del equipo / 'Draw' / 'Over' / 'Under'
    price: float                    # cuota decimal (> 1.0)
    point: Optional[float] = None   # línea de hándicap o total
    last_update: Optional[datetime] = None
    fetched_at: datetime = field(default_factory=_utcnow)

    @property
    def implied(self) -> float:
        return 1.0 / self.price

    @property
    def match(self) -> str:
        return f"{self.home} vs {self.away}"

    def staleness_minutes(self, ref: Optional[datetime] = None) -> float:
        """Minutos desde el último cambio de precio reportado por la casa."""
        if self.last_update is None:
            return 0.0
        ref = ref or _utcnow()
        return max(0.0, (ref - self.last_update).total_seconds() / 60.0)


@dataclass
class OutcomePrices:
    """Precios de un resultado a través de todas las casas: {casa: cuota}."""

    outcome: str
    point: Optional[float]
    prices: dict[str, float] = field(default_factory=dict)
    last_update: dict[str, Optional[datetime]] = field(default_factory=dict)

    def best(self) -> tuple[str, float]:
        book = max(self.prices, key=self.prices.__getitem__)
        return book, self.prices[book]

    def median_price(self, subset: Optional[set[str]] = None) -> Optional[float]:
        vals = [p for b, p in self.prices.items() if subset is None or b in subset]
        if not vals:
            return None
        vals.sort()
        n = len(vals)
        return vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2.0


@dataclass
class MarketBook:
    """Un mercado (event_id + market + point) con sus resultados y precios."""

    event_id: str
    sport: str
    commence_time: datetime
    home: str
    away: str
    market: str
    point: Optional[float]
    outcomes: list[OutcomePrices] = field(default_factory=list)

    @property
    def match(self) -> str:
        return f"{self.home} vs {self.away}"

    @property
    def key(self) -> tuple:
        return (self.event_id, self.market, self.point)

    @property
    def n_books(self) -> int:
        books: set[str] = set()
        for oc in self.outcomes:
            books.update(oc.prices)
        return len(books)

    def hours_to_start(self, ref: Optional[datetime] = None) -> float:
        ref = ref or _utcnow()
        return (self.commence_time - ref).total_seconds() / 3600.0


@dataclass
class ArbLeg:
    outcome: str
    bookmaker: str
    price: float
    stake_fraction: float           # fracción del desembolso total en esta pata


@dataclass
class ArbOpportunity:
    event_id: str
    match: str
    sport: str
    market: str
    point: Optional[float]
    commence_time: datetime
    legs: list[ArbLeg]
    sum_inverse: float              # Σ 1/mejor_cuota ; < 1 => arbitraje
    roi: float                      # retorno garantizado sobre el desembolso
    detected_at: datetime = field(default_factory=_utcnow)

    @property
    def kind(self) -> str:
        return "arbitrage"


@dataclass
class ValueOpportunity:
    event_id: str
    match: str
    sport: str
    market: str
    point: Optional[float]
    outcome: str
    bookmaker: str
    price: float                    # cuota disponible en esa casa
    fair_price: float               # 1 / probabilidad justa estimada
    true_prob: float                # probabilidad justa estimada
    edge: float                     # true_prob * price - 1   (EV bruto)
    robust_ev: float                # EV tras penalizaciones
    penalties: dict[str, float]     # desglose de las penalizaciones aplicadas
    kelly_fraction: float           # fracción de bankroll recomendada
    decision: str                   # STRONG BET | BET | SMALL BET | WATCH | NO BET
    confidence: float               # 0..100
    fair_source: str                # 'sharp' | 'consensus'
    n_books: int
    commence_time: datetime
    detected_at: datetime = field(default_factory=_utcnow)

    @property
    def kind(self) -> str:
        return "value"
