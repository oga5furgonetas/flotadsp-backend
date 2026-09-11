"""Calidad del precio: separar errores del feed de oportunidades de verdad.

Regla (la misma en el histórico y en producción, decidida SOLO con precios):
un precio que paga **más del doble** de lo que vale según la referencia
(ventaja aparente ≥ +100 %) es un error del feed, no una oportunidad.

Por qué esta y no otra, con lo que pasó:

* La primera versión descartaba todo precio cuyo desvío frente a la media del
  mercado superaba la valla lejana de Tukey (Q3 + 3·RIC). Parecía prudente y era
  un error: en 1X2 tiraba 614 precios que el cierre independiente CONFIRMABA
  (CLV +6.2 % ± 1.1 %) y en Más/Menos, 376 (CLV +4.8 %). La valla de Tukey mide lo
  raro, no lo imposible, y en este problema lo raro es justo lo que se busca.
* Los errores reales del histórico (hándicaps a 22.00 cuando la línea se paga a
  ~1.90) pagan diez veces lo que valen. No hay oportunidades legítimas entre
  +20 % y +100 %, así que el corte no decide ningún resultado: la sensibilidad a
  0.5×, 1× y 2× está en ``docs/VALIDATION.md``.
"""

from __future__ import annotations

IMPLAUSIBLE_EV_DEFAULT = 1.0


def implausible(ev_raw: float | None, threshold: float | None) -> bool:
    return threshold is not None and ev_raw is not None and ev_raw >= threshold


def max_plausible_odds(p_fair: float, threshold: float | None) -> float | None:
    """Cuota a partir de la cual el precio se consideraría un error del feed."""
    if threshold is None or not 0.0 < p_fair < 1.0:
        return None
    return (1.0 + threshold) / p_fair
