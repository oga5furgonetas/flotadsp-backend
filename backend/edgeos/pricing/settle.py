"""Liquidación de una apuesta por el marcador final (Python puro).

Devuelve ``(fracción ganada, fracción perdida)`` por unidad; el resto es push.
Las líneas de cuarto (−0.25, 2.75…) se reparten en dos medias apuestas, como
hacen las casas. Un test lo compara con la versión vectorizada del histórico.
"""

from __future__ import annotations

from collections.abc import Callable

_EPS = 1e-9


def _split(adj: Callable[[float], float], line: float) -> tuple[float, float]:
    quarter = round(line * 4) % 2 != 0
    subs = [(line - 0.25, 0.5), (line + 0.25, 0.5)] if quarter else [(line, 1.0)]
    win = sum(w for ln, w in subs if adj(ln) > _EPS)
    lose = sum(w for ln, w in subs if adj(ln) < -_EPS)
    return win, lose


def settle_fraction(market: str, outcome: str, line: float | None, home: int, away: int) -> tuple[float, float]:
    if market == "h2h":
        won = {"home": home > away, "draw": home == away, "away": home < away}[outcome]
        return (1.0, 0.0) if won else (0.0, 1.0)
    if line is None:
        raise ValueError(f"mercado {market} sin línea")
    if market == "totals":
        total = home + away
        sign = 1.0 if outcome == "over" else -1.0
        return _split(lambda ln: sign * (total - ln), line)
    if market == "spreads":
        diff = (home - away) if outcome == "home" else (away - home)
        own = line if outcome == "home" else -line
        return _split(lambda ln: diff + ln, own)
    raise ValueError(f"mercado desconocido: {market}")


def unit_return(win: float, lose: float, odds: float) -> float:
    return win * (odds - 1.0) - lose
