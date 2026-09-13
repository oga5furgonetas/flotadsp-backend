"""¿Está funcionando EDGE OS? Medido con las apuestas en papel, no con opiniones.

* CLV contra tres cierres: la media del mercado sin Pinnacle (la medida que
  manda, la misma que se validó), Pinnacle y Betfair exchange.
* Errores típicos robustos por partido: dos apuestas del mismo partido no son
  independientes.
* Estado EN VIVO de cada estrategia (kill switch): cuando hay suficientes
  apuestas cerradas —las que la potencia estadística exige, sacadas del
  histórico—, su evidencia manda sobre la del histórico.
"""

from __future__ import annotations

import math
from collections import defaultdict

from ..assets import Asset


def cluster_summary(values: list[float], clusters: list[str]) -> dict:
    pairs = [(v, c) for v, c in zip(values, clusters, strict=True) if v is not None and math.isfinite(v)]
    n = len(pairs)
    if n == 0:
        return {"n": 0}
    mean = sum(v for v, _ in pairs) / n
    if n < 2:
        return {"n": 1, "mean": mean, "se": None, "lo95": None, "hi95": None}
    sums: dict[str, float] = defaultdict(float)
    for v, c in pairs:
        sums[c] += v - mean
    g = len(sums)
    if g < 2:
        return {"n": n, "mean": mean, "se": None, "lo95": None, "hi95": None}
    var = sum(s * s for s in sums.values()) * g / (g - 1) / (n * n)
    se = math.sqrt(var)
    return {"n": n, "clusters": g, "mean": mean, "se": se, "lo95": mean - 1.96 * se, "hi95": mean + 1.96 * se,
            "pos": sum(1 for v, _ in pairs if v > 0) / n}


def _drawdown(returns: list[float]) -> float:
    peak = cum = worst = 0.0
    for r in returns:
        cum += r
        peak = max(peak, cum)
        worst = min(worst, cum - peak)
    return -worst


def summarize(bets: list[dict]) -> dict:
    closed = [b for b in bets if (b.get("closing") or {}).get("clv_avg") is not None]
    settled = [b for b in bets if b.get("status") == "settled" and b.get("result")]
    ev = [b["event_id"] for b in closed]
    out = {
        "n": len(bets), "open": sum(1 for b in bets if b.get("status") == "open"),
        "closed_with_clv": len(closed), "settled": len(settled),
        "clv_avg": cluster_summary([b["closing"]["clv_avg"] for b in closed], ev),
        "clv_pin": cluster_summary([b["closing"].get("clv_pin") for b in closed], ev),
        "clv_bfe": cluster_summary([b["closing"].get("clv_bfe") for b in closed], ev),
    }
    if settled:
        rets = [b["result"]["return_units"] / (b.get("stake_units") or 1.0) for b in settled]
        out["roi"] = cluster_summary(rets, [b["event_id"] for b in settled])
        order = sorted(settled, key=lambda b: b["result"]["settled_at"])
        out["profit_units"] = sum(b["result"]["return_units"] for b in settled)
        out["max_drawdown_units"] = _drawdown([b["result"]["return_units"] for b in order])
    return out


def by(bets: list[dict], key: str) -> dict[str, dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for b in bets:
        groups[str(b.get(key))].append(b)
    return {k: summarize(v) for k, v in sorted(groups.items())}


def live_states(bets: list[dict], asset: Asset) -> dict[str, tuple[str, list[str], dict]]:
    """Estado en vivo por estrategia, solo cuando la muestra lo permite."""
    out: dict[str, tuple[str, list[str], dict]] = {}
    groups: dict[str, list[dict]] = defaultdict(list)
    for b in bets:
        if b.get("source") == "auto" and b.get("strategy_key"):
            groups[b["strategy_key"]].append(b)
    for key, strat in asset.strategies().items():
        rows = groups.get(key, [])
        s = summarize(rows)["clv_avg"]
        need = int(strat.spec.get("n_required") or 0)
        if not need or s.get("n", 0) < need or s.get("se") is None:
            continue
        if s["hi95"] < 0:
            out[key] = ("DISABLED", [f"kill switch en vivo: {s['n']} apuestas en papel pierden frente al cierre "
                                     f"(CLV {s['mean']:+.2%}, IC 95 % hasta {s['hi95']:+.2%})"], s)
        elif s["lo95"] > 0:
            out[key] = ("ACTIVE", [f"evidencia en vivo: {s['n']} apuestas en papel baten al cierre "
                                   f"(CLV {s['mean']:+.2%}, IC 95 % desde {s['lo95']:+.2%})"], s)
        else:
            out[key] = ("WATCH", [f"en vivo: {s['n']} apuestas en papel sin diferencia significativa con el cierre "
                                  f"(CLV {s['mean']:+.2%})"], s)
    return out
