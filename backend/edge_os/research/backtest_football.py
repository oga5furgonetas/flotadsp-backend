"""Backtest walk-forward del modelo de fútbol 1X2 contra las cuotas de los CSV.

Metodología (anti look-ahead estricto):

1. Se recorren los partidos por fecha.
2. Tras un `warmup`, para cada partido se (re)ajusta el ensemble (Dixon-Coles +
   Elo) SOLO con partidos anteriores a la fecha del partido, y se predice el 1X2.
   El reajuste se hace cada `refit_days` (coste: el ajuste de DC).
3. Se compara la probabilidad del modelo con:
     - el resultado real  → calibración (Brier, log-loss, ECE, curva de fiabilidad)
     - las cuotas pre-cierre → detección de "value"
4. Apuesta simulada: stake plano cuando `p_modelo · cuota_precierre − 1 ≥ min_edge`.
   Liquidación por el resultado real. ROI, yield, hit-rate.
5. CLV: para cada apuesta, `cuota_tomada / cuota_cierre − 1` (Pinnacle closing) y
   la versión sin margen `p_cierre_sinvig · cuota_tomada − 1`.

Es UNA estrategia con UNOS hiperparámetros (sin búsqueda) → no hay inflación por
comparaciones múltiples. Si se tunea sobre estos datos, aplicar PBO/DSR.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Optional, Sequence

import numpy as np

from ..modeling.football import build_football_ensemble
from ..modeling.football.data import MatchResult
from ..quant.devig import devig
from .metrics import (
    brier_multiclass, ece, log_loss_multiclass, pairs_from_1x2, reliability_table,
)

_OC = ("H", "D", "A")


def _triple(odds: dict, prefix: str) -> Optional[tuple[float, float, float]]:
    try:
        t = (odds[f"{prefix}_h"], odds[f"{prefix}_d"], odds[f"{prefix}_a"])
    except KeyError:
        return None
    return t if all(v and v > 1.0 for v in t) else None


def _devig_triple(t: tuple[float, float, float]) -> Optional[tuple[float, float, float]]:
    try:
        p = devig(list(t), method="shin")
    except ValueError:
        return None
    return (float(p[0]), float(p[1]), float(p[2]))


@dataclass
class Bet:
    date: str
    match: str
    outcome: str
    price: float
    p_model: float
    edge: float
    won: bool
    pnl: float
    clv_odds: Optional[float]
    clv_novig: Optional[float]


@dataclass
class BacktestReport:
    league: str
    n_matches: int = 0
    n_scored: int = 0
    date_from: str = ""
    date_to: str = ""
    refits: int = 0
    params: dict = field(default_factory=dict)
    beats_market: bool = False

    # calibración
    brier_model: float = float("nan")
    brier_market: float = float("nan")
    logloss_model: float = float("nan")
    logloss_market: float = float("nan")
    ece_model: float = float("nan")
    ece_market: float = float("nan")
    reliability: list = field(default_factory=list)

    # apuestas
    bets: list = field(default_factory=list)
    n_bets: int = 0
    staked: float = 0.0
    returned: float = 0.0
    pnl: float = 0.0
    roi: float = float("nan")
    hit_rate: float = float("nan")
    by_outcome: dict = field(default_factory=dict)

    # CLV
    n_clv: int = 0
    clv_odds_mean: float = float("nan")
    clv_odds_pos_pct: float = float("nan")
    clv_novig_mean: float = float("nan")
    clv_novig_t: Optional[float] = None

    def summary_lines(self) -> list[str]:
        L = []
        L.append(f"Liga {self.league} · {self.n_scored}/{self.n_matches} partidos "
                 f"valorados · {self.date_from} → {self.date_to} · {self.refits} reajustes")
        L.append(f"params: {self.params}")
        L.append("")
        L.append("CALIBRACIÓN (menor = mejor; 'market' = cuotas pre-cierre devig)")
        L.append(f"  Brier    modelo {self.brier_model:.4f}   market {self.brier_market:.4f}")
        L.append(f"  LogLoss  modelo {self.logloss_model:.4f}   market {self.logloss_market:.4f}")
        L.append(f"  ECE      modelo {self.ece_model:.4f}   market {self.ece_market:.4f}")
        better = ("modelo ≥ mercado (bien)" if self.brier_model <= self.brier_market
                  else "modelo PEOR que el mercado")
        L.append(f"  → {better}")
        L.append("")
        L.append(f"APUESTAS (edge ≥ {self.params.get('min_edge')}, stake plano, "
                 f"cuota {self.params.get('price')})")
        if self.n_bets:
            L.append(f"  n={self.n_bets}  staked={self.staked:.0f}  pnl={self.pnl:+.1f}  "
                     f"ROI={self.roi:+.2%}  hit={self.hit_rate:.1%}")
            for o, d in self.by_outcome.items():
                L.append(f"    {o}: n={d['n']:<4} ROI={d['roi']:+.2%} hit={d['hit']:.1%}")
        else:
            L.append("  (ninguna apuesta cumplió el umbral)")
        L.append("")
        L.append("CLV (entrada vs cierre Pinnacle)")
        if self.n_clv:
            L.append(f"  n={self.n_clv}  CLV_cuota medio {self.clv_odds_mean:+.2%}  "
                     f"% con CLV+ {self.clv_odds_pos_pct:.0f}%")
            L.append(f"  CLV sin-vig medio {self.clv_novig_mean:+.2%}  "
                     f"t≈{self.clv_novig_t}")
        else:
            L.append("  (sin cuotas de cierre en los datos)")
        return L

    def to_markdown(self) -> str:
        lines = ["# Backtest fútbol 1X2 — resultados", "",
                 "> Generado por `py -m edge backtest-football`. Walk-forward "
                 "estricto (as-of), UNA estrategia sin búsqueda de hiperparámetros.",
                 "> **Advertencia:** cuotas pre-cierre/cierre de football-data.co.uk, "
                 "no snapshots intradía. Evidencia real pero limitada.", "", "```"]
        lines += self.summary_lines()
        lines += ["```", "", "## Curva de fiabilidad (modelo, 10 bins)", "",
                  "| bin | n | pred | obs |", "|---|---|---|---|"]
        for r in self.reliability:
            if r["n"]:
                lines.append(f"| {r['lo']:.1f}–{r['hi']:.1f} | {r['n']} | "
                             f"{r['pred']:.3f} | {r['obs']:.3f} |")
        return "\n".join(lines) + "\n"


def walk_forward_football(
    matches: Sequence[MatchResult],
    *,
    league: str = "?",
    warmup_days: int = 365,
    refit_days: int = 21,
    half_life_days: float = 180.0,
    min_edge: float = 0.05,
    price: str = "avg",          # avg | max | ps
    closing: str = "psc",        # psc | avgc
    stake: float = 1.0,
    progress: bool = False,
) -> BacktestReport:
    ms = sorted(matches, key=lambda m: m.date)
    if len(ms) < 200:
        raise ValueError("hacen falta bastantes partidos (>=200) para un backtest")

    rep = BacktestReport(league=league, n_matches=len(ms),
                         params={"warmup_days": warmup_days, "refit_days": refit_days,
                                 "half_life_days": half_life_days,
                                 "min_edge": min_edge, "price": price,
                                 "closing": closing})
    start = ms[0].date
    cutoff = start + timedelta(days=warmup_days)

    model = None
    last_fit = None
    teams: set[str] = set()

    m_probs: list[tuple[float, float, float]] = []
    mk_probs: list[tuple[float, float, float]] = []
    outcomes: list[str] = []
    bets: list[Bet] = []

    for i, m in enumerate(ms):
        if m.date < cutoff:
            continue
        need_refit = (model is None or last_fit is None
                      or (m.date - last_fit).days >= refit_days)
        if need_refit:
            train = [x for x in ms if x.date < m.date]
            try:
                ens, meta = build_football_ensemble(
                    matches=train, asof=m.date, half_life_days=half_life_days,
                    include_market=False, synthetic_if_empty=False,
                )
                model = ens
                teams = set(meta.get("teams", []))
                last_fit = m.date
                rep.refits += 1
                if progress:
                    print(f"  refit #{rep.refits} @ {m.date.date()} "
                          f"({len(train)} partidos)")
            except ValueError:
                continue
        if model is None or m.home_team not in teams or m.away_team not in teams:
            continue

        fc = model.predict(m.home_team, m.away_team)
        if fc is None:
            continue
        pm = (fc.p_home, fc.p_draw, fc.p_away)

        pre = _triple(m.odds, price) or _triple(m.odds, "avg") or _triple(m.odds, "ps")
        mk = _devig_triple(pre) if pre else None
        if mk is None:
            continue

        rep.n_scored += 1
        m_probs.append(pm)
        mk_probs.append(mk)
        outcomes.append(m.result)

        clos = _triple(m.odds, closing) or _triple(m.odds, "avgc")
        clos_novig = _devig_triple(clos) if clos else None

        for k, oc in enumerate(_OC):
            price_k = pre[k]
            edge = pm[k] * price_k - 1.0
            if edge < min_edge:
                continue
            won = (m.result == oc)
            pnl = stake * (price_k - 1.0) if won else -stake
            clv_odds = (price_k / clos[k] - 1.0) if clos else None
            clv_nv = (clos_novig[k] * price_k - 1.0) if clos_novig else None
            bets.append(Bet(
                date=m.date.date().isoformat(), match=f"{m.home_team}-{m.away_team}",
                outcome=oc, price=round(price_k, 3), p_model=round(pm[k], 4),
                edge=round(edge, 4), won=won, pnl=round(pnl, 3),
                clv_odds=None if clv_odds is None else round(clv_odds, 4),
                clv_novig=None if clv_nv is None else round(clv_nv, 4),
            ))

    # ── calibración ──────────────────────────────────────────
    if m_probs:
        rep.brier_model = brier_multiclass(m_probs, outcomes)
        rep.brier_market = brier_multiclass(mk_probs, outcomes)
        rep.logloss_model = log_loss_multiclass(m_probs, outcomes)
        rep.logloss_market = log_loss_multiclass(mk_probs, outcomes)
        rep.ece_model = ece(pairs_from_1x2(m_probs, outcomes))
        rep.ece_market = ece(pairs_from_1x2(mk_probs, outcomes))
        rep.reliability = reliability_table(pairs_from_1x2(m_probs, outcomes))
        rep.date_from = ms[0].date.date().isoformat()
        rep.date_to = ms[-1].date.date().isoformat()

    # ── apuestas ─────────────────────────────────────────────
    rep.bets = bets
    rep.n_bets = len(bets)
    rep.beats_market = (not np.isnan(rep.brier_model)
                        and rep.brier_model <= rep.brier_market)
    if bets:
        rep.staked = stake * len(bets)
        rep.pnl = sum(b.pnl for b in bets)
        rep.returned = rep.staked + rep.pnl
        rep.roi = rep.pnl / rep.staked
        rep.hit_rate = sum(b.won for b in bets) / max(len(bets), 1)
        for oc in _OC:
            sub = [b for b in bets if b.outcome == oc]
            if sub:
                s = stake * len(sub)
                rep.by_outcome[oc] = {
                    "n": len(sub), "roi": sum(b.pnl for b in sub) / s,
                    "hit": sum(b.won for b in sub) / max(len(sub), 1),
                }
        clvs = [b.clv_odds for b in bets if b.clv_odds is not None]
        nvs = [b.clv_novig for b in bets if b.clv_novig is not None]
        rep.n_clv = len(clvs)
        if clvs:
            rep.clv_odds_mean = float(np.mean(clvs))
            rep.clv_odds_pos_pct = 100.0 * float(np.mean([c > 0 for c in clvs]))
        if len(nvs) > 1:
            arr = np.array(nvs)
            rep.clv_novig_mean = float(arr.mean())
            se = arr.std(ddof=1) / np.sqrt(len(arr))
            rep.clv_novig_t = round(float(arr.mean() / se), 2) if se > 0 else None
    return rep
