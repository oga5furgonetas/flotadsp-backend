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
