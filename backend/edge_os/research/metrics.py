"""Métricas de calibración y acierto probabilístico.

Todo multiclase (1X2). Convención de outcomes: 'H' / 'D' / 'A'.
`probs` = lista de (p_home, p_draw, p_away) que suman ~1.
"""

from __future__ import annotations

import math
from typing import Sequence

_IDX = {"H": 0, "D": 1, "A": 2}


def _onehot(o: str) -> tuple[int, int, int]:
    v = [0, 0, 0]
    v[_IDX[o]] = 1
    return tuple(v)  # type: ignore[return-value]


def brier_multiclass(probs: Sequence[tuple[float, float, float]],
                     outcomes: Sequence[str]) -> float:
    """Brier score multiclase: media de Σ_k (p_k − y_k)². 0 = perfecto.
    Referencia mala: predecir el ratio base ~ 0.6; el mercado ~ 0.55."""
    if not probs:
        return float("nan")
    tot = 0.0
    for p, o in zip(probs, outcomes):
        y = _onehot(o)
        tot += sum((pk - yk) ** 2 for pk, yk in zip(p, y))
    return tot / max(len(probs), 1)


def log_loss_multiclass(probs: Sequence[tuple[float, float, float]],
                        outcomes: Sequence[str], eps: float = 1e-12) -> float:
    if not probs:
        return float("nan")
    tot = 0.0
    for p, o in zip(probs, outcomes):
        pk = min(1.0, max(eps, p[_IDX[o]]))
        tot += -math.log(pk)
    return tot / max(len(probs), 1)


def reliability_table(pairs: Sequence[tuple[float, int]], n_bins: int = 10
                      ) -> list[dict]:
    """`pairs` = (probabilidad predicha para un evento binario, ocurrió 0/1).
    Devuelve, por bin de probabilidad, n, confianza media y frecuencia observada.
    """
    bins: list[list[tuple[float, int]]] = [[] for _ in range(n_bins)]
    for p, y in pairs:
        b = min(n_bins - 1, max(0, int(p * n_bins)))
        bins[b].append((p, y))
    out = []
    for i, b in enumerate(bins):
        if not b:
            out.append({"bin": i, "lo": i / n_bins, "hi": (i + 1) / n_bins,
                        "n": 0, "pred": None, "obs": None})
            continue
        n = len(b)
        out.append({
            "bin": i, "lo": i / n_bins, "hi": (i + 1) / n_bins, "n": n,
            "pred": sum(p for p, _ in b) / n,
            "obs": sum(y for _, y in b) / n,
        })
    return out


def ece(pairs: Sequence[tuple[float, int]], n_bins: int = 10) -> float:
    """Expected Calibration Error: Σ (n_bin/N) · |conf_bin − acc_bin|."""
    table = reliability_table(pairs, n_bins)
    n_total = sum(row["n"] for row in table) or 1
    return sum(
        (row["n"] / n_total) * abs(row["pred"] - row["obs"])
        for row in table if row["n"] > 0
    )


def pairs_from_1x2(probs: Sequence[tuple[float, float, float]],
                   outcomes: Sequence[str]) -> list[tuple[float, int]]:
    """Aplana las 3 probabilidades de cada partido en pares (p, ocurrió) para
    curvas de fiabilidad."""
    out: list[tuple[float, int]] = []
    for p, o in zip(probs, outcomes):
        y = _onehot(o)
        for k in range(3):
            out.append((p[k], y[k]))
    return out
