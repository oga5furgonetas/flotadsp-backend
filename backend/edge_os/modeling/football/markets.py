"""De la matriz de marcadores a probabilidades de mercado.

Entrada: P[x, y] = P(local marca x, visitante marca y), x,y = 0..N.
Salida: `MarketProbs` con 1X2, totals (líneas .5, sin nulo), BTTS y hándicap
asiático (incluye líneas de cuarto y probabilidad de nulo para cuota justa).
"""

from __future__ import annotations

import numpy as np

from ..base import MarketProbs

_DEFAULT_TOTALS = (0.5, 1.5, 2.5, 3.5, 4.5, 5.5)
_DEFAULT_AH = (
    -2.0, -1.75, -1.5, -1.25, -1.0, -0.75, -0.5, -0.25,
    0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0,
)


def _ah_triple(P: np.ndarray, diff: np.ndarray, line: float
               ) -> tuple[float, float, float]:
    """(P(gana local), P(nulo), P(pierde local)) para el hándicap `line` en el
    lado local. Línea de cuarto = media de las dos medias/enteras adyacentes."""
    q = round(line * 4)
    if q % 2 != 0:                      # .25 o .75  → split
        lo = _ah_triple(P, diff, line - 0.25)
        hi = _ah_triple(P, diff, line + 0.25)
        return tuple((a + b) / 2.0 for a, b in zip(lo, hi))  # type: ignore
    adj = diff + line
    p_win = float(P[adj > 0].sum())
    p_push = float(P[adj == 0].sum())
    p_loss = float(P[adj < 0].sum())
    return p_win, p_push, p_loss


def markets_from_matrix(
    P: np.ndarray,
    *,
    totals: tuple[float, ...] = _DEFAULT_TOTALS,
    ah_lines: tuple[float, ...] = _DEFAULT_AH,
) -> MarketProbs:
    P = np.asarray(P, dtype=float)
    P = P / P.sum()
    n = P.shape[0]
    x = np.arange(n)[:, None]
    y = np.arange(n)[None, :]
    total = x + y
    diff = x - y                        # margen del local

    home = float(P[x > y].sum())
    draw = float(P[x == y].sum())
    away = float(P[x < y].sum())

    over = {L: float(P[total > L].sum()) for L in totals}
    under = {L: float(P[total < L].sum()) for L in totals}   # L es .5 ⇒ sin nulo
    btts = float(P[(x >= 1) & (y >= 1)].sum())

    ah_home: dict[float, float] = {}
    ah_push: dict[float, float] = {}
    for h in ah_lines:
        p_win, p_push, _ = _ah_triple(P, diff, h)
        ah_home[h] = p_win
        ah_push[h] = p_push

    return MarketProbs(
        home=home, draw=draw, away=away,
        over=over, under=under, btts_yes=btts,
        ah_home=ah_home, ah_push=ah_push,
    )
