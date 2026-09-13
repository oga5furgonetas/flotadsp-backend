"""El modelo de movimiento de línea en producción (Python puro).

Lee lo que ``edgeos.research.line_model`` aprendió y hace la MISMA cuenta que se
validó fuera de muestra (un test lo compara con la versión numpy):

* ``x̃ = (p − 1/o) / √(p(1−p))``            desvío normalizado del precio
* cubo = posición de ``x̃`` entre los cortes aprendidos
* ``P(ventaja real)`` = ``P(Δ̃ > −x̃ | cubo)`` con la tabla de 99 cuantiles, y
  después la recalibración de Platt aprendida en pliegues anteriores
* ``E[CLV] = p·o − 1 + o·s·media(Δ̃ | cubo)``, con su intervalo por tamaño de muestra

Sobre eso se definen los dos precios que ve el usuario:

* **cuota mínima aceptable**: la más baja a la que la decisión sigue siendo
  «apostar» (``P ≥ p*`` y límite inferior de ``E[CLV]`` > 0);
* **cuota de invalidación**: por debajo, la ventaja esperada es ≤ 0 y la señal
  se cancela.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass

QLEVELS = [i / 100.0 for i in range(1, 100)]
_LEFT = QLEVELS[0] / 2.0
_RIGHT = 1.0 - (1.0 - QLEVELS[-1]) / 2.0
TICK = 0.01
MAX_ODDS_SCAN = 1000.0


def interp(x: float, xp: list[float], fp: list[float], left: float, right: float) -> float:
    """Igual que ``numpy.interp`` (incluidos empates en ``xp``)."""
    if x < xp[0]:
        return left
    if x > xp[-1]:
        return right
    if x == xp[-1]:
        return fp[-1]
    j = bisect.bisect_right(xp, x) - 1
    x0, x1 = xp[j], xp[j + 1]
    return fp[j] + (x - x0) * (fp[j + 1] - fp[j]) / (x1 - x0)


def exceed_prob(q: list[float], t: float) -> float:
    return 1.0 - interp(t, q, QLEVELS, _LEFT, _RIGHT)


@dataclass(frozen=True)
class EdgeEstimate:
    p_fair: float
    odds: float
    ev_raw: float
    xt: float
    bucket: int
    bucket_n: int
    p_real_raw: float
    p_real: float
    e_clv: float
    e_clv_lo: float
    e_clv_hi: float


class EdgeModel:
    def __init__(self, spec: dict):
        mdl = spec["model"]
        self.edges: list[float] = [float(e) for e in mdl["edges"]]
        self.buckets = mdl["buckets"]
        if len(self.buckets) != len(self.edges) + 1:
            raise ValueError("modelo corrupto: cubos y cortes no cuadran")
        a, b = spec.get("platt") or (0.0, 1.0)
        self.platt_a, self.platt_b = float(a), float(b)
        self.pstar: float | None = spec.get("pstar")
        self.half_life_days = mdl.get("half_life_days")
        self.trained_until = mdl.get("trained_until")

    def _platt(self, p: float) -> float:
        p = min(1 - 1e-9, max(1e-9, p))
        z = self.platt_a + self.platt_b * math.log(p / (1 - p))
        return 1.0 / (1.0 + math.exp(-z))

    def estimate(self, p_fair: float, odds: float) -> EdgeEstimate:
        if not 0.0 < p_fair < 1.0 or not odds > 1.0:
            raise ValueError(f"entrada no válida p={p_fair!r} o={odds!r}")
        s = math.sqrt(max(p_fair * (1.0 - p_fair), 1e-12))
        xt = (p_fair - 1.0 / odds) / s
        b = bisect.bisect_left(self.edges, xt)
        bk = self.buckets[b]
        raw = exceed_prob(bk["q"], -xt)
        ev_raw = p_fair * odds - 1.0
        e_clv = ev_raw + odds * s * float(bk["mean"])
        half = 1.96 * odds * s * float(bk["se"])
        return EdgeEstimate(p_fair=p_fair, odds=odds, ev_raw=ev_raw, xt=xt, bucket=b, bucket_n=int(bk["n"]),
                            p_real_raw=raw, p_real=self._platt(raw),
                            e_clv=e_clv, e_clv_lo=e_clv - half, e_clv_hi=e_clv + half)

    def passes(self, est: EdgeEstimate) -> bool:
        return self.pstar is not None and est.p_real >= self.pstar and est.e_clv_lo > 0

    def _ticks(self, p_fair: float, upto: float) -> list[float]:
        start = math.floor((1.0 / p_fair) / TICK) * TICK + TICK
        n = round((min(upto, MAX_ODDS_SCAN) - start) / TICK) + 1
        return [round(start + i * TICK, 2) for i in range(max(0, n))]

    def min_acceptable_odds(self, p_fair: float, current_odds: float) -> float | None:
        """Cuota más baja a la que se seguiría apostando, recorriendo hacia abajo desde
        la actual. Se exige que TODAS las cuotas entre esa y la actual pasen: una
        mínima que dejara huecos sería mentira."""
        if self.pstar is None or not self.passes(self.estimate(p_fair, current_odds)):
            return None
        # La cuota que tienes delante cuenta: la escalera va de céntimo en céntimo y un precio
        # neto de comisión cae entre dos peldaños (2.1564). Sin esto, cuando el peldaño de abajo
        # no pasaba se devolvía «ninguna» y la tarjeta se quedaba sin «hasta qué cuota», que es
        # justo lo que hay que saber antes de apostar.
        best = round(float(current_odds), 4)
        for o in reversed(self._ticks(p_fair, current_odds)):
            if o > current_odds + 1e-9:
                continue
            if self.passes(self.estimate(p_fair, o)):
                best = o
            else:
                break
        return best

    def invalidation_odds(self, p_fair: float, upto: float) -> float | None:
        """Cuota más baja con ventaja esperada positiva (por debajo, la señal se cancela)."""
        for o in self._ticks(p_fair, upto):
            if self.estimate(p_fair, o).e_clv > 0:
                return o
        return None
