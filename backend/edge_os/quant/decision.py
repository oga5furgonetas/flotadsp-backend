"""EV robusto + motor de decisión.

Idea central de EDGE//OS: **el edge bruto no es el edge real**. Al EV bruto
(p_justa · cuota − 1) se le restan penalizaciones por las cosas que se comen
la ventaja en la vida real:

  · incertidumbre del "fair price"        (castigo fijo configurable)
  · precio rancio (stale)                 (crece con los minutos sin actualizar)
  · dispersión entre casas                (mercado poco de acuerdo => menos fiable)

El resultado (robust_ev) es lo que alimenta la decisión y el sizing. Con pocas
casas la señal se degrada a WATCH por poca evidencia.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RobustResult:
    raw_ev: float
    robust_ev: float
    penalties: dict[str, float]
    decision: str
    confidence: float          # 0..100


STATES = ("STRONG BET", "BET", "SMALL BET", "WATCH", "NO BET")


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def robust_ev(
    *,
    raw_ev: float,
    staleness_minutes: float,
    dispersion: float,          # desv. típica de la prob. implícita entre casas
    n_books: int,
    rcfg: dict,
    dcfg: dict,
) -> RobustResult:
    p_model = float(rcfg.get("model_uncertainty", 0.02))
    grace = float(rcfg.get("stale_grace_minutes", 3.0))
    stale_over = max(0.0, staleness_minutes - grace)
    p_stale = min(
        float(rcfg.get("stale_max_penalty", 0.03)),
        float(rcfg.get("stale_penalty_per_min", 0.0015)) * stale_over,
    )
    p_disp = float(rcfg.get("dispersion_factor", 0.5)) * max(0.0, dispersion)

    penalties = {
        "model_uncertainty": round(p_model, 5),
        "stale": round(p_stale, 5),
        "dispersion": round(p_disp, 5),
    }
    rev = raw_ev - p_model - p_stale - p_disp

    min_books = int(rcfg.get("min_books_for_signal", 3))
    thin = n_books < min_books

    if rev <= 0:
        decision = "NO BET"
    elif thin:
        decision = "WATCH"
    elif rev >= float(dcfg.get("strong_bet_ev", 0.05)):
        decision = "STRONG BET"
    elif rev >= float(dcfg.get("bet_ev", 0.02)):
        decision = "BET"
    elif rev >= float(dcfg.get("small_bet_ev", 0.01)):
        decision = "SMALL BET"
    else:
        decision = "WATCH"

    # Confianza: mezcla de magnitud del edge robusto, nº de casas,
    # acuerdo del mercado (poca dispersión) y frescura del precio.
    ev_score = _clamp(rev / 0.06)
    books_score = _clamp((n_books - 1) / 8.0)
    disp_score = 1.0 - _clamp(dispersion / 0.05)
    fresh_score = 1.0 - _clamp(staleness_minutes / 30.0)
    confidence = 100.0 * _clamp(
        0.40 * ev_score + 0.25 * books_score
        + 0.20 * disp_score + 0.15 * fresh_score
    )

    return RobustResult(
        raw_ev=round(raw_ev, 5),
        robust_ev=round(rev, 5),
        penalties=penalties,
        decision=decision,
        confidence=round(confidence, 1),
    )
