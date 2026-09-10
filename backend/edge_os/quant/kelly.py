"""Staking por criterio de Kelly (con red de seguridad).

Kelly pleno para una apuesta binaria a cuota decimal o con probabilidad p:

        f* = (p·o − 1) / (o − 1)

maximiza el crecimiento logarítmico del bankroll a largo plazo, pero es muy
agresivo y castiga cualquier error en p. En la práctica se usa Kelly
fraccional (p.ej. 0.25·f*) con un tope duro, y aquí además se aplica un
"haircut" por incertidumbre: si el EV robusto es bastante menor que el EV
bruto, se recorta el stake en esa proporción.
"""

from __future__ import annotations


def kelly_full(prob: float, odds: float) -> float:
    b = odds - 1.0
    if b <= 0:
        return 0.0
    return max(0.0, (prob * odds - 1.0) / b)


def kelly_stake(
    prob: float,
    odds: float,
    *,
    fraction: float = 0.25,
    cap: float = 0.03,
    raw_ev: float | None = None,
    robust_ev: float | None = None,
    uncertainty_haircut: bool = True,
) -> float:
    """Fracción de bankroll recomendada para una apuesta."""
    f = fraction * kelly_full(prob, odds)

    if uncertainty_haircut and raw_ev and raw_ev > 0 and robust_ev is not None:
        ratio = max(0.0, min(1.0, robust_ev / raw_ev))
        f *= ratio

    return round(max(0.0, min(cap, f)), 5)
