"""Devigging: convertir cuotas (con margen) en probabilidades justas.

Dadas cuotas decimales de resultados mutuamente excluyentes y exhaustivos,
la suma de probabilidades implícitas S = Σ 1/oᵢ es > 1. El exceso (S − 1)
es el margen de la casa (overround / vig). Devigging = repartir ese exceso
para recuperar probabilidades que sumen 1.

Métodos:
  multiplicative  pᵢ = qᵢ / S                     (proporcional; el estándar)
  additive        pᵢ = qᵢ − (S − 1)/n             (resta lo mismo a cada uno)
  power           pᵢ = qᵢ**k con Σ qᵢ**k = 1      (comprime longshots)
  shin            modelo de Shin (insider trading); resuelve z en [0,1)

Referencias: Shin (1993); Štrumbelj (2014) "On determining probability
forecasts from betting odds"; Clarke et al. (2017).
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import brentq

_EPS = 1e-12


def _validate(odds) -> np.ndarray:
    o = np.asarray(odds, dtype=float)
    if o.ndim != 1 or o.size < 2:
        raise ValueError("se necesitan >= 2 cuotas en un vector 1-D")
    if np.any(o <= 1.0) or not np.all(np.isfinite(o)):
        raise ValueError("las cuotas decimales deben ser finitas y > 1.0")
    return o


def implied(odds) -> np.ndarray:
    return 1.0 / _validate(odds)


def overround(odds) -> float:
    """Margen de la casa: Σ 1/oᵢ − 1  (p.ej. 0.05 = 5 %)."""
    return float(implied(odds).sum() - 1.0)


def devig_multiplicative(odds) -> np.ndarray:
    q = implied(odds)
    return q / q.sum()


def devig_additive(odds) -> np.ndarray:
    q = implied(odds)
    p = q - (q.sum() - 1.0) / q.size
    p = np.clip(p, _EPS, None)      # longshots pueden salir negativos
    return p / p.sum()


def devig_power(odds) -> np.ndarray:
    q = implied(odds)               # todas < 1  =>  qᵢ**k decrece en k
    f = lambda k: float(np.sum(q ** k) - 1.0)   # noqa: E731
    lo, hi = 1.0, 1.0
    while f(hi) > 0 and hi < 64:
        hi *= 2.0
    if f(lo) <= 0 or f(hi) > 0:
        return devig_multiplicative(odds)
    k = brentq(f, lo, hi, xtol=1e-10)
    p = q ** k
    return p / p.sum()


def devig_shin(odds) -> np.ndarray:
    q = implied(odds)
    S = q.sum()

    def p_of_z(z: float) -> np.ndarray:
        disc = z * z + 4.0 * (1.0 - z) * (q * q) / S
        return (np.sqrt(disc) - z) / (2.0 * (1.0 - z))

    f = lambda z: float(p_of_z(z).sum() - 1.0)   # noqa: E731
    try:
        # f(0) = sqrt(S) - 1 > 0 ; buscamos cruce por cero antes de z=1
        z = brentq(f, _EPS, 1.0 - 1e-9, xtol=1e-10)
    except ValueError:
        return devig_multiplicative(odds)
    p = p_of_z(z)
    return p / p.sum()


METHODS = {
    "multiplicative": devig_multiplicative,
    "additive": devig_additive,
    "power": devig_power,
    "shin": devig_shin,
}


def devig(odds, method: str = "power") -> np.ndarray:
    """Devuelve el vector de probabilidades justas (suma 1)."""
    try:
        fn = METHODS[method]
    except KeyError:
        raise ValueError(f"método de devig desconocido: {method!r}; "
                         f"opciones: {sorted(METHODS)}") from None
    return fn(odds)


def fair_odds(odds, method: str = "power") -> np.ndarray:
    """Cuotas justas (sin margen) = 1 / probabilidad justa."""
    return 1.0 / devig(odds, method)
