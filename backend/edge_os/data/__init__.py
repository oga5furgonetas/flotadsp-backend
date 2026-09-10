"""Capa de datos de EDGE OS.

Objetivo de la Fase 2: **acceso a datos *as-of***. Cualquier lectura que
alimente una decisión o un backtest debe pedir explícitamente un instante
`asof` y no puede ver nada capturado después de ese instante. Esto elimina de
raíz el look-ahead / data leakage señalado en la auditoría (L1–L3).
"""

from .asof import AsOfStore, Snapshot

__all__ = ["AsOfStore", "Snapshot"]
