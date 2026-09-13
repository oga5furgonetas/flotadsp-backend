"""Presupuesto de créditos del proveedor de cuotas.

El plan gratuito de The Odds API trae 500 créditos al mes. Sin control, el
refresco automático se los come en un par de horas y el panel se queda vacío a
mitad de mes, que se lee igual que «no hay nada».

Reglas:

* **Reserva** para cerrar el trabajo empezado: cada grupo (deporte, día) con
  apuestas en papel abiertas necesita capturar el cierre (1 crédito por mercado
  y región) y liquidar con marcadores (2 créditos con ``daysFrom``). Esos
  créditos no se tocan para escanear.
* **Asignación diaria** = (restantes − reserva) / días hasta el reinicio.
* Lo que pide el usuario puede pasarse de la asignación del día (con aviso),
  pero nunca comerse la reserva. Las tareas automáticas no se pasan nunca.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import datetime, timedelta

CLOSING_COST = 1        # /odds de un deporte, h2h, una región
SETTLE_COST = 2         # /scores con daysFrom


@dataclass(frozen=True)
class BudgetDecision:
    ok: bool
    reason: str
    allowance_today: float
    reserve: int


def next_reset(now: datetime, reset_day: int) -> datetime:
    day = min(reset_day, calendar.monthrange(now.year, now.month)[1])
    candidate = now.replace(day=day, hour=0, minute=0, second=0, microsecond=0)
    if candidate > now:
        return candidate
    y, m = (now.year + 1, 1) if now.month == 12 else (now.year, now.month + 1)
    day = min(reset_day, calendar.monthrange(y, m)[1])
    return candidate.replace(year=y, month=m, day=day)


def reserve_for(open_groups: int, markets_per_close: int = 1) -> int:
    return open_groups * (CLOSING_COST * markets_per_close + SETTLE_COST)


def reserve_needed(markets_per_close: list[int], settle_groups: int, regions: int = 1) -> int:
    """Reserva real para acabar lo empezado.

    * Cierre: un ``/odds`` por (deporte, hora de inicio) con apuestas aún sin cierre, y
      esa llamada cuesta tantos créditos como mercados distintos × regiones. Agrupar por
      DÍA contaba una sola llamada para partidos a las 13:00 y a las 21:00, que son dos.
    * Liquidación: un ``/scores`` por (deporte, día) con apuestas sin liquidar, también
      las que ya tienen el cierre (antes solo se contaban las abiertas).
    """
    close = sum(CLOSING_COST * max(m, 1) * max(regions, 1) for m in markets_per_close)
    return close + SETTLE_COST * max(settle_groups, 0)


def daily_allowance(remaining: int, now: datetime, reset_day: int, reserve: int) -> float:
    days = max((next_reset(now, reset_day) - now) / timedelta(days=1), 1.0 / 24)
    return max(0.0, (remaining - reserve) / days)


def decide(*, cost: int, remaining: int | None, spent_today: int, now: datetime, reset_day: int,
           reserve: int, purpose: str, forced: bool = False) -> BudgetDecision:
    """``purpose``: user | auto | closing | settle."""
    if cost <= 0:
        return BudgetDecision(True, "gratis", 0.0, reserve)
    if remaining is None:
        return BudgetDecision(True, "créditos restantes desconocidos hasta la primera llamada", 0.0, reserve)
    allowance = daily_allowance(remaining, now, reset_day, reserve)
    if remaining < cost:
        return BudgetDecision(False, f"quedan {remaining} créditos y hacen falta {cost}", allowance, reserve)
    if purpose in ("closing", "settle"):
        return BudgetDecision(True, "trabajo empezado: usa la reserva", allowance, reserve)
    if remaining - reserve < cost:
        return BudgetDecision(False, f"los {remaining} créditos que quedan están reservados para cerrar y liquidar "
                                     f"apuestas en papel abiertas ({reserve})", allowance, reserve)
    if spent_today + cost <= allowance:
        return BudgetDecision(True, "dentro del presupuesto del día", allowance, reserve)
    if purpose == "user" and forced:
        return BudgetDecision(True, f"por encima del presupuesto del día ({allowance:.0f}) porque lo has pedido",
                              allowance, reserve)
    return BudgetDecision(False, f"presupuesto del día gastado ({spent_today} de {allowance:.0f}); "
                                 "vuelve a haber mañana", allowance, reserve)
