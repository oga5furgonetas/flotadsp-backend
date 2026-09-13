"""Tipos del dominio en tiempo real.

Dos relojes en todo lo que se guarda:

* ``observed_at`` — cuándo lo vio EDGE OS. Es el que manda para el replay y para
  cualquier cálculo «as-of»: el sistema no puede haber usado algo antes de verlo.
* ``last_update`` — cuándo dice el proveedor que cambió ese precio. Sirve para
  saber si un precio está rancio, nunca para ordenar lo que el sistema sabía.
"""

from __future__ import annotations

import statistics
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, UTC

UTC = UTC

H2H = "h2h"
TOTALS = "totals"
SPREADS = "spreads"
MARKETS = (H2H, TOTALS, SPREADS)

OUTCOMES_3WAY = ("home", "draw", "away")
OUTCOMES_2WAY = ("home", "away")
OUTCOMES_TOTALS = ("over", "under")


def utcnow() -> datetime:
    return datetime.now(UTC)


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        raise ValueError("datetime sin zona horaria: EDGE OS trabaja siempre en UTC explícito")
    return dt.astimezone(UTC)


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def market_key(market: str, line: float | None) -> str:
    # `+ 0.0` convierte -0.0 en 0.0: sin esto el hándicap 0 del visitante caía en otra clave
    return f"{market}|{'' if line is None else f'{line + 0.0:g}'}"


@dataclass(frozen=True)
class Quote:
    book: str
    price: float
    last_update: datetime | None = None


@dataclass
class MarketSnapshot:
    """Un mercado de un evento en un instante: resultado → casa → cuota."""

    event_id: str
    sport: str
    market: str
    line: float | None
    outcomes: tuple[str, ...]
    quotes: dict[str, dict[str, Quote]]
    observed_at: datetime

    @property
    def key(self) -> str:
        return market_key(self.market, self.line)

    def books(self) -> set[str]:
        out: set[str] = set()
        for per_book in self.quotes.values():
            out.update(per_book)
        return out

    def complete_books(self) -> list[str]:
        """Casas con precio para TODOS los resultados (las únicas que se pueden de-vigar)."""
        return sorted(b for b in self.books()
                      if all(b in self.quotes.get(o, {}) for o in self.outcomes))

    def book_prices(self, book: str) -> list[float] | None:
        try:
            return [self.quotes[o][book].price for o in self.outcomes]
        except KeyError:
            return None

    def book_updated(self, book: str) -> datetime | None:
        """Última actualización de la casa en este mercado (la más reciente de sus precios)."""
        ts = [q.last_update for o in self.outcomes
              if (q := self.quotes.get(o, {}).get(book)) is not None and q.last_update is not None]
        return max(ts) if ts else None

    def best(self, outcome: str, allowed: Iterable[str] | None = None,
             exclude: Iterable[str] = ()) -> Quote | None:
        allow = None if allowed is None else set(allowed)
        excl = set(exclude)
        cands = [q for b, q in self.quotes.get(outcome, {}).items()
                 if b not in excl and (allow is None or b in allow)]
        if not cands:
            return None
        # desempate determinista: mejor precio, luego el más reciente, luego el nombre
        return max(cands, key=lambda q: (q.price, q.last_update or datetime.min.replace(tzinfo=UTC),
                                         [-ord(c) for c in q.book]))

    def second_best_price(self, outcome: str, exclude: Iterable[str] = ()) -> float | None:
        excl = set(exclude)
        prices = sorted((q.price for b, q in self.quotes.get(outcome, {}).items() if b not in excl),
                        reverse=True)
        return prices[1] if len(prices) > 1 else None

    def median_price(self, outcome: str, exclude: Iterable[str] = ()) -> float | None:
        excl = set(exclude)
        prices = [q.price for b, q in self.quotes.get(outcome, {}).items() if b not in excl]
        return statistics.median(prices) if prices else None


@dataclass
class Score:
    home: int | None
    away: int | None
    completed: bool
    observed_at: datetime
    last_update: datetime | None = None


@dataclass
class Event:
    id: str
    sport: str
    sport_title: str
    home: str
    away: str
    commence_time: datetime
    markets: dict[str, MarketSnapshot] = field(default_factory=dict)
    score: Score | None = None                     # None = marcador UNKNOWN

    @property
    def name(self) -> str:
        return f"{self.home} vs {self.away}"

    def minutes_to_start(self, now: datetime) -> float:
        return (self.commence_time - now).total_seconds() / 60.0

    def is_live(self, now: datetime) -> bool:
        if self.score is not None and self.score.completed:
            return False
        return self.commence_time <= now

    def outcome_label(self, market: str, outcome: str, line: float | None) -> str:
        if market == TOTALS:
            return f"{'Más' if outcome == 'over' else 'Menos'} de {line:g} goles"
        if market == SPREADS:
            team = self.home if outcome == "home" else self.away
            h = None if line is None else (line + 0.0 if outcome == "home" else 0.0 - line)
            return f"{team} {'' if h is None else f'{h:+g}'}".strip()
        return {"home": self.home, "away": self.away, "draw": "Empate"}.get(outcome, outcome)
