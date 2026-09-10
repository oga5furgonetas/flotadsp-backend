"""Proveedores de cuotas intercambiables."""

from __future__ import annotations

from ..config import Config
from .base import OddsProvider
from .mock import MockProvider
from .the_odds_api import TheOddsAPIProvider


def build_provider(cfg: Config) -> OddsProvider:
    name = cfg.get("provider", "mock")
    if name == "mock":
        return MockProvider()
    if name in ("the-odds-api", "theoddsapi", "the_odds_api"):
        key = cfg.api_key
        if not key:
            raise RuntimeError(
                "provider=the-odds-api pero falta THE_ODDS_API_KEY en .env"
            )
        return TheOddsAPIProvider(key)
    raise ValueError(f"proveedor desconocido: {name!r}")
