"""Filtros de calidad de datos: no generar señales sobre basura.

Descarta un mercado si:
  · alguna cuota está fuera de rango sano
  · la dispersión de la probabilidad implícita entre casas es excesiva
    (feed roto, mercados que no casan, líneas distintas mezcladas)
"""

from __future__ import annotations

import statistics as _stats
from datetime import datetime, timezone

from .models import MarketBook


def check_market(book: MarketBook, dq: dict) -> tuple[bool, str]:
    lo = float(dq.get("min_odds_sane", 1.01))
    hi = float(dq.get("max_odds_sane", 1000))
    max_disp = float(dq.get("max_book_dispersion", 0.25))

    if len(book.outcomes) < 2:
        return False, "menos de 2 resultados"

    for oc in book.outcomes:
        if not oc.prices:
            return False, f"sin precios en '{oc.outcome}'"
        for b, p in oc.prices.items():
            if not (lo <= p <= hi):
                return False, f"cuota fuera de rango: {b} {oc.outcome} @ {p}"
        implied = [1.0 / p for p in oc.prices.values()]
        if len(implied) > 1 and _stats.pstdev(implied) > max_disp:
            return False, f"dispersión excesiva en '{oc.outcome}'"

    return True, "ok"


def is_stale(last_update: datetime | None, dq: dict) -> bool:
    if last_update is None:
        return False
    mins = (datetime.now(timezone.utc) - last_update).total_seconds() / 60.0
    return mins > float(dq.get("stale_after_minutes", 30))
