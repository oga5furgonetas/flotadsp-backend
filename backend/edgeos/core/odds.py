"""Cuotas → probabilidades.

Dadas cuotas decimales de resultados excluyentes y exhaustivos, la suma de
probabilidades implícitas ``S = Σ 1/oᵢ`` es mayor que 1. El exceso es el margen
de la casa. *De-vig* = repartir ese exceso para recuperar probabilidades que
sumen 1. Cómo se reparte cambia el resultado, sobre todo en los extremos
(favoritos muy claros, longshots), y **cuál de los métodos acierta más no se
supone: se mide** (``edgeos.research.devig_eval``).

Métodos
-------
multiplicative  pᵢ = qᵢ / S
additive        pᵢ = qᵢ − (S − 1)/n                     (recortado a > 0)
power           pᵢ = qᵢᵏ,  k tal que Σ qᵢᵏ = 1
shin            modelo de Shin (1993), z = proporción de apostantes informados
odds_ratio      Cheung (2015): pᵢ = qᵢ / (c + qᵢ − c·qᵢ), c tal que Σ pᵢ = 1

Todo en Python puro: el motor en producción no depende de numpy ni scipy.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

_EPS = 1e-12
_TOL = 1e-13
_MAX_IT = 200


class OddsError(ValueError):
    """Cuotas que no forman un mercado válido."""


def validate(odds: Sequence[float]) -> list[float]:
    o = [float(x) for x in odds]
    if len(o) < 2:
        raise OddsError("hacen falta al menos 2 cuotas")
    for x in o:
        if not math.isfinite(x) or x <= 1.0:
            raise OddsError(f"cuota no válida: {x!r} (debe ser finita y > 1)")
    return o


def implied(odds: Sequence[float]) -> list[float]:
    return [1.0 / x for x in validate(odds)]


def overround(odds: Sequence[float]) -> float:
    """Margen de la casa: Σ 1/oᵢ − 1 (0.05 = 5 %)."""
    return sum(implied(odds)) - 1.0


def _bisect(f: Callable[[float], float], lo: float, hi: float) -> float:
    flo = f(lo)
    for _ in range(_MAX_IT):
        mid = 0.5 * (lo + hi)
        fm = f(mid)
        if abs(fm) < _TOL or (hi - lo) < _TOL:
            return mid
        if (fm > 0) == (flo > 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return 0.5 * (lo + hi)


def _normalize(p: list[float]) -> list[float]:
    s = sum(p)
    return [x / s for x in p]


def devig_multiplicative(odds: Sequence[float]) -> list[float]:
    return _normalize(implied(odds))


def devig_additive(odds: Sequence[float]) -> list[float]:
    q = implied(odds)
    d = (sum(q) - 1.0) / max(len(q), 1)
    return _normalize([max(_EPS, x - d) for x in q])


def devig_power(odds: Sequence[float]) -> list[float]:
    q = implied(odds)
    s = sum(q)
    if abs(s - 1.0) < 1e-12:
        return _normalize(q)

    def f(k: float) -> float:
        return sum(x ** k for x in q) - 1.0

    if s > 1.0:            # hace falta k > 1
        lo, hi = 1.0, 2.0
        while f(hi) > 0 and hi < 1e4:
            hi *= 2.0
    else:                   # margen negativo (p.ej. mejores cuotas de varias casas)
        lo, hi = 0.5, 1.0
        while f(lo) < 0 and lo > 1e-6:
            lo /= 2.0
    k = _bisect(f, lo, hi)
    return _normalize([x ** k for x in q])


def devig_shin(odds: Sequence[float]) -> list[float]:
    q = implied(odds)
    s = sum(q)
    if s <= 1.0:
        return _normalize(q)

    def p_of(z: float) -> list[float]:
        return [(math.sqrt(z * z + 4.0 * (1.0 - z) * x * x / s) - z) / (2.0 * (1.0 - z))
                for x in q]

    def f(z: float) -> float:
        return sum(p_of(z)) - 1.0

    # f(0) = sqrt(S) - 1 > 0 y f decrece con z
    z = _bisect(f, 0.0, 0.999999)
    return _normalize(p_of(z))


def devig_odds_ratio(odds: Sequence[float]) -> list[float]:
    q = implied(odds)
    s = sum(q)
    if abs(s - 1.0) < 1e-12:
        return _normalize(q)

    def p_of(c: float) -> list[float]:
        return [x / (c + x - c * x) for x in q]

    def f(c: float) -> float:
        return sum(p_of(c)) - 1.0

    # c = 1 devuelve q; c > 1 reduce las probabilidades
    if s > 1.0:
        lo, hi = 1.0, 2.0
        while f(hi) > 0 and hi < 1e6:
            hi *= 2.0
    else:
        lo, hi = 0.5, 1.0
        while f(lo) < 0 and lo > 1e-9:
            lo /= 2.0
    return _normalize(p_of(_bisect(f, lo, hi)))


METHODS: dict[str, Callable[[Sequence[float]], list[float]]] = {
    "multiplicative": devig_multiplicative,
    "additive": devig_additive,
    "power": devig_power,
    "shin": devig_shin,
    "odds_ratio": devig_odds_ratio,
}


def devig(odds: Sequence[float], method: str) -> list[float]:
    """Probabilidades sin margen (suman 1), en el orden de ``odds``."""
    try:
        fn = METHODS[method]
    except KeyError:
        raise OddsError(f"método desconocido {method!r}; opciones {sorted(METHODS)}") from None
    return fn(odds)


def net_odds(odds: float, commission: float) -> float:
    """Cuota efectiva de un exchange tras comisión sobre la ganancia neta."""
    if not 0.0 <= commission < 1.0:
        raise OddsError(f"comisión no válida: {commission!r}")
    return 1.0 + (odds - 1.0) * (1.0 - commission)


def ev(prob: float, odds: float) -> float:
    """Valor esperado por unidad apostada: p·o − 1."""
    return prob * odds - 1.0


def fair(prob: float) -> float:
    if not 0.0 < prob <= 1.0:
        raise OddsError(f"probabilidad fuera de (0, 1]: {prob!r}")
    return 1.0 / prob
