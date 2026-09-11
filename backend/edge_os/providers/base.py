"""Interfaz común de proveedores de cuotas."""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..models import Quote


class OddsProvider(ABC):
    name: str = "base"

    #: peticiones restantes reportadas por el proveedor (si aplica)
    last_remaining: str | int | None = None
    last_used: str | int | None = None

    @abstractmethod
    def list_sports(self) -> list[dict]:
        """Deportes disponibles: [{key, group, title, active, ...}, ...]."""

    @abstractmethod
    def fetch(
        self,
        sport: str,
        markets: list[str],
        regions: list[str],
    ) -> list[Quote]:
        """Cuotas actuales (una Quote por casa x resultado)."""

    def list_events(self, sport: str) -> list[dict]:
        """Eventos SIN cuotas: [{id, commence_time, home_team, away_team}, ...].

        Existe aparte de `fetch` porque en The Odds API esta llamada **cuesta 0
        creditos**: permite barrer los 75 deportes para saber que hay en vivo y
        gastar cuota solo donde de verdad hay algo. Por defecto, sin soporte.
        """
        return []
