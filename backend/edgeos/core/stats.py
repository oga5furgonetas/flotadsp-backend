"""Estadística pequeña y verificable (stdlib).

Todo lo que el sistema afirma («intervalo 53–61 %», «esta ventaja se confirmó
en 7 de cada 10 casos parecidos») sale de aquí, así que cada función tiene su
test con valores conocidos.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import NormalDist
from collections.abc import Iterable, Sequence

_N = NormalDist()


def norm_cdf(x: float) -> float:
    return _N.cdf(x)


def norm_ppf(p: float) -> float:
    if not 0.0 < p < 1.0:
        raise ValueError(f"p fuera de (0, 1): {p!r}")
    return _N.inv_cdf(p)


@dataclass(frozen=True)
class Summary:
    n: int
    n_eff: float
    mean: float
    sd: float
    se: float
    lo95: float
    hi95: float

    @property
    def t(self) -> float | None:
        return self.mean / self.se if self.se and math.isfinite(self.se) and self.se > 0 else None

    @property
    def significant_positive(self) -> bool:
        return self.n >= 2 and self.lo95 > 0.0

    @property
    def significant_negative(self) -> bool:
        return self.n >= 2 and self.hi95 < 0.0


_NAN = float("nan")


def summarize(values: Iterable[float], weights: Iterable[float] | None = None) -> Summary:
    """Media, desviación, error típico e IC 95 %.

    Con pesos se usa el tamaño efectivo de Kish, ``n_eff = (Σw)² / Σw²``, para
    que dar menos peso a lo antiguo no se convierta en falsa precisión.
    """
    xs = list(values)
    ws = [1.0] * len(xs) if weights is None else list(weights)
    if len(ws) != len(xs):
        raise ValueError("values y weights con distinta longitud")
    pairs = [(x, w) for x, w in zip(xs, ws, strict=True) if w > 0 and math.isfinite(x)]
    n = len(pairs)
    if n == 0:
        return Summary(0, 0.0, _NAN, _NAN, _NAN, _NAN, _NAN)
    sw = sum(w for _, w in pairs)
    mean = sum(x * w for x, w in pairs) / sw
    if n == 1:
        return Summary(1, 1.0, mean, 0.0, math.inf, -math.inf, math.inf)
    sw2 = sum(w * w for _, w in pairs)
    n_eff = sw * sw / sw2
    if n_eff <= 1.0:
        return Summary(n, n_eff, mean, 0.0, math.inf, -math.inf, math.inf)
    var = sum(w * (x - mean) ** 2 for x, w in pairs) / sw * n_eff / (n_eff - 1.0)
    sd = math.sqrt(max(var, 0.0))
    se = sd / math.sqrt(n_eff)
    return Summary(n, n_eff, mean, sd, se, mean - 1.96 * se, mean + 1.96 * se)


def wilson(successes: float, n: float, z: float = 1.96) -> tuple[float, float]:
    """Intervalo de Wilson para una proporción (no se sale de [0, 1])."""
    if n <= 0:
        return (0.0, 1.0)
    p = min(1.0, max(0.0, successes / n))
    den = 1.0 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, centre - half), min(1.0, centre + half))


# ── calibración ──────────────────────────────────────────────────────────────
def _clip(p: float) -> float:
    return min(1.0 - 1e-12, max(1e-12, p))


def brier(probs: Sequence[float], outcomes: Sequence[int]) -> float:
    if not probs:
        return _NAN
    return sum((p - y) ** 2 for p, y in zip(probs, outcomes, strict=True)) / max(len(probs), 1)


def log_loss(probs: Sequence[float], outcomes: Sequence[int]) -> float:
    if not probs:
        return _NAN
    return -sum(y * math.log(_clip(p)) + (1 - y) * math.log(_clip(1 - p))
                for p, y in zip(probs, outcomes, strict=True)) / max(len(probs), 1)


def _bins(probs: Sequence[float], outcomes: Sequence[int], bins: int) -> list[list[float]]:
    acc = [[0.0, 0.0, 0.0] for _ in range(bins)]
    for p, y in zip(probs, outcomes, strict=True):
        b = min(bins - 1, max(0, int(p * bins)))
        acc[b][0] += p
        acc[b][1] += y
        acc[b][2] += 1
    return acc


def ece(probs: Sequence[float], outcomes: Sequence[int], bins: int = 10) -> float:
    """Expected calibration error con bins de igual anchura."""
    if not probs:
        return _NAN
    n = len(probs)
    return sum(abs(sp / c - sy / c) * c / n for sp, sy, c in _bins(probs, outcomes, bins) if c)


def reliability(probs: Sequence[float], outcomes: Sequence[int], bins: int = 10) -> list[dict]:
    out = []
    for i, (sp, sy, c) in enumerate(_bins(probs, outcomes, bins)):
        if c:
            lo, hi = wilson(sy, c)
            out.append({"bin": i, "lo": i / bins, "hi": (i + 1) / bins, "n": int(c),
                        "pred": sp / c, "obs": sy / c, "obs_lo": lo, "obs_hi": hi})
    return out


def calibration_slope_intercept(probs: Sequence[float], outcomes: Sequence[int],
                                max_iter: int = 60) -> tuple[float, float]:
    """Regresión logística ``y ~ a + b·logit(p)`` por Newton-Raphson.

    Calibración perfecta: pendiente 1 e intercepto 0. Pendiente < 1 = el
    pronóstico es demasiado extremo (sobreconfianza). Devuelve (pendiente, intercepto).
    """
    xs = [math.log(_clip(p) / (1 - _clip(p))) for p in probs]
    ys = list(outcomes)
    a, b = 0.0, 1.0
    for _ in range(max_iter):
        g0 = g1 = h00 = h01 = h11 = 0.0
        for x, y in zip(xs, ys, strict=True):
            z = a + b * x
            m = 1.0 / (1.0 + math.exp(-z)) if z > -700 else 0.0
            r = y - m
            w = m * (1 - m)
            g0 += r
            g1 += r * x
            h00 += w
            h01 += w * x
            h11 += w * x * x
        det = h00 * h11 - h01 * h01
        if abs(det) < 1e-18:
            break
        step_a = (h11 * g0 - h01 * g1) / det
        step_b = (-h01 * g0 + h00 * g1) / det
        a += step_a
        b += step_b
        if abs(step_a) < 1e-10 and abs(step_b) < 1e-10:
            break
    return b, a


def max_drawdown(pnl: Sequence[float]) -> float:
    """Mayor caída desde un máximo de la curva acumulada (en unidades, ≥ 0)."""
    peak = cum = 0.0
    worst = 0.0
    for x in pnl:
        cum += x
        peak = max(peak, cum)
        worst = min(worst, cum - peak)
    return -worst


def exp_weight(age_days: float, half_life_days: float | None) -> float:
    """Peso por antigüedad: 1 hoy, 0.5 a una vida media. ``None`` = sin decaimiento."""
    if half_life_days is None:
        return 1.0
    if half_life_days <= 0:
        raise ValueError("half_life_days debe ser > 0")
    return 0.5 ** (max(0.0, age_days) / half_life_days)


def quantile_edges(values: Sequence[float], k: int) -> list[float]:
    """Cortes interiores que parten ``values`` en ``k`` grupos de igual tamaño.

    Se usan para definir cubos por cuantiles del ENTRENAMIENTO: los cortes salen
    de los datos, no de números redondos elegidos a ojo.
    """
    xs = sorted(v for v in values if math.isfinite(v))
    if k < 2 or not xs:
        return []
    edges = []
    for i in range(1, k):
        pos = i * (len(xs) - 1) / k
        lo = math.floor(pos)
        hi = min(len(xs) - 1, lo + 1)
        edges.append(xs[lo] + (xs[hi] - xs[lo]) * (pos - lo))
    out: list[float] = []
    for e in edges:                      # sin cortes repetidos
        if not out or e > out[-1]:
            out.append(e)
    return out


def bucket_of(x: float, edges: Sequence[float]) -> int:
    """Índice de cubo para ``x`` dados cortes crecientes (0 … len(edges))."""
    lo, hi = 0, len(edges)
    while lo < hi:
        mid = (lo + hi) // 2
        if x <= edges[mid]:
            hi = mid
        else:
            lo = mid + 1
    return lo
