"""Interfaces de proveedores. La aplicación no conoce a ningún proveedor concreto.

Cuotas, marcadores, alineaciones, lesiones, noticias y estadísticas en vivo son
fuentes distintas y se enchufan por separado. Para las que hoy no hay fuente
existe un proveedor nulo que responde ``UNKNOWN``: el motor lo trata como «no
se sabe», nunca como «no hay nada».
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime

from ..domain import Event, utcnow

UNKNOWN = "UNKNOWN"


class ProviderError(RuntimeError):
    """Fallo del proveedor. Nunca se convierte en «no hay datos» en silencio."""


@dataclass
class CallRecord:
    at: datetime
    endpoint: str
    cost: int | None
    remaining: int | None
    ok: bool
    detail: str = ""


@dataclass
class CreditState:
    remaining: int | None = None
    used: int | None = None
    last_cost: int | None = None
    updated_at: datetime | None = None
    calls: list[CallRecord] = field(default_factory=list)

    def record(self, rec: CallRecord) -> None:
        self.calls.append(rec)
        if len(self.calls) > 500:
            del self.calls[: len(self.calls) - 500]
        if rec.remaining is not None:
            self.remaining = rec.remaining
        if rec.cost is not None:
            self.last_cost = rec.cost
        self.updated_at = rec.at


class OddsFeed(ABC):
    name: str = "base"
    is_mock: bool = False

    def __init__(self) -> None:
        self.credits = CreditState()

    @abstractmethod
    def sports(self) -> list[dict]:
        """[{key, group, title, active}]."""

    @abstractmethod
    def events(self, sport: str) -> list[dict]:
        """Eventos sin cuotas: [{id, sport_key, commence_time, home_team, away_team}]."""

    @abstractmethod
    def odds(self, sport: str, markets: list[str], regions: list[str]) -> list[Event]:
        """Cuotas actuales de todos los eventos del deporte."""

    @abstractmethod
    def event_odds(self, sport: str, event_id: str, markets: list[str], regions: list[str]) -> Event | None:
        """Cuotas de UN evento (más mercados sin pagar el deporte entero)."""

    @abstractmethod
    def scores(self, sport: str, days_from: int | None = None) -> list[dict]:
        """[{id, completed, home_score, away_score, last_update}]; vacío si no hay."""

    def estimated_cost(self, endpoint: str, *, markets: int = 1, regions: int = 1) -> int:
        """Coste en créditos ANTES de llamar, para el presupuesto."""
        return 0


@dataclass(frozen=True)
class Unknown:
    what: str
    reason: str

    def __str__(self) -> str:
        return f"{self.what}: {UNKNOWN} ({self.reason})"


class LineupsFeed(ABC):
    @abstractmethod
    def lineups(self, event: Event) -> dict | Unknown: ...


class InjuriesFeed(ABC):
    @abstractmethod
    def injuries(self, event: Event) -> list[dict] | Unknown: ...


class NewsFeed(ABC):
    @abstractmethod
    def news(self, event: Event) -> list[dict] | Unknown: ...


class LiveStatsFeed(ABC):
    @abstractmethod
    def live_stats(self, event: Event) -> dict | Unknown: ...


class NullLineups(LineupsFeed):
    def lineups(self, event: Event) -> Unknown:
        return Unknown("alineaciones", "no hay proveedor de alineaciones configurado")


class NullInjuries(InjuriesFeed):
    def injuries(self, event: Event) -> Unknown:
        return Unknown("lesiones", "no hay proveedor de lesiones configurado")


class NullNews(NewsFeed):
    def news(self, event: Event) -> Unknown:
        return Unknown("noticias", "no hay proveedor de noticias configurado")


class NullLiveStats(LiveStatsFeed):
    def live_stats(self, event: Event) -> Unknown:
        return Unknown("estadísticas en vivo", "el feed de cuotas solo da marcador; minuto, tiros y tarjetas no")


def now() -> datetime:
    return utcnow()
