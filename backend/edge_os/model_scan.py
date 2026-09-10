"""Puente modelo ↔ mercado: compara la probabilidad del ensemble contra las
cuotas reales de cada casa y saca un "edge" — **siempre marcado NOT VALIDATED**.

Sin odds histórico no se puede calibrar el modelo ni medir CLV, así que este
scan NUNCA emite BET/STRONG BET: como mucho `WATCH — NOT VALIDATED` (y
`SMALL BET — NOT VALIDATED` solo si el edge es grande, los modelos coinciden y
hay muestra suficiente). Su valor hoy es *ver dónde el modelo y el mercado
discrepan*, no decidir.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .config import Config
from .engine import group_into_books
from .modeling.ensemble import Ensemble
from .modeling.entities import resolve_pair
from .modeling.market_model import MarketModel
from .providers.base import OddsProvider


@dataclass
class ModelEdge:
    match: str
    market: str
    outcome: str
    bookmaker: str
    price: float
    p_model: float
    p_model_interval: tuple[float, float]
    p_market_devig: Optional[float]
    edge: float                       # p_model * price - 1   (NO validado)
    model_vs_market: Optional[float]  # p_model - p_market_devig
    model_agreement: float
    members: dict[str, float]         # modelo -> P(este outcome)
    eff_matches: float                # mín. muestra efectiva de los dos equipos
    decision: str
    notes: list[str] = field(default_factory=list)


@dataclass
class ModelScanResult:
    n_quotes: int = 0
    n_books: int = 0
    n_fixtures_modelled: int = 0
    n_fixtures_skipped: int = 0
    edges: list[ModelEdge] = field(default_factory=list)
    skipped: list[tuple[str, str]] = field(default_factory=list)
    meta: dict = field(default_factory=dict)
    remaining: object = None


def _outcome_prob(fc, outcome: str, home_lbl: str, away_lbl: str) -> Optional[float]:
    if outcome == home_lbl:
        return fc.p_home
    if outcome == away_lbl:
        return fc.p_away
    if outcome.lower() in ("draw", "empate", "x"):
        return fc.p_draw
    return None


def _interval_for(outcome, fc, home_lbl, away_lbl):
    if outcome == home_lbl:
        return fc.p_home_interval
    if outcome == away_lbl:
        return fc.p_away_interval
    return fc.p_draw_interval


def run_model_scan(
    cfg: Config,
    provider: OddsProvider,
    ensemble: Ensemble,
    meta: dict,
    *,
    min_edge: float = 0.03,
    market_context: bool = True,
    verdict: Optional[dict] = None,
) -> ModelScanResult:
    quotes = provider.fetch(
        cfg.get("sport", "upcoming"),
        ["h2h"],
        list(cfg.get("regions", ["eu", "uk"])),
    )
    res = ModelScanResult(n_quotes=len(quotes), meta=meta,
                          remaining=getattr(provider, "last_remaining", None))
    res.meta = {**meta, "provider": getattr(provider, "name", "?")}
    books = [b for b in group_into_books(quotes) if b.market == "h2h"]
    res.n_books = len(books)
    known = set(meta.get("teams", []))
    # El mercado es SOLO contexto: nunca entra en el ensemble que detecta el edge
    # (si no, comparas el mercado consigo mismo). MarketModel independiente:
    market_ctx = MarketModel()

    for mb in books:
        rh, ra = resolve_pair(mb.home, mb.away, known)
        if rh is None or ra is None:
            res.n_fixtures_skipped += 1
            miss = mb.home if rh is None else mb.away
            res.skipped.append((mb.match, f"sin modelo para «{miss}»"))
            continue

        market_odds = {
            bk: {oc.outcome: price for oc in mb.outcomes
                 for b2, price in oc.prices.items() if b2 == bk}
            for bk in {b for oc in mb.outcomes for b in oc.prices}
        }
        # ensemble PURO (sin señal de mercado) para el edge
        fc = ensemble.predict(rh, ra)
        if fc is None:
            res.n_fixtures_skipped += 1
            res.skipped.append((mb.match, "ensemble no pudo predecir"))
            continue
        res.n_fixtures_modelled += 1

        # consenso de mercado SOLO como contexto (de-vig por casa -> logit pool)
        mkt_probs = None
        if market_context:
            mp = market_ctx.predict_1x2(market_odds, home_label=mb.home,
                                        draw_label="Draw", away_label=mb.away)
            if mp is not None:
                mkt_probs = {mb.home: mp.home, "Draw": mp.draw, mb.away: mp.away}

        eff = min(
            getattr(ensemble._members["dixon_coles"], "eff_matches_", {}).get(rh, 0.0),
            getattr(ensemble._members["dixon_coles"], "eff_matches_", {}).get(ra, 0.0),
        )

        for oc in mb.outcomes:
            p_model = _outcome_prob(fc, oc.outcome, mb.home, mb.away)
            if p_model is None:
                continue
            for bk, price in oc.prices.items():
                edge = p_model * price - 1.0
                if edge < min_edge:
                    continue
                p_mkt = mkt_probs.get(oc.outcome) if mkt_probs else None
                decision = _decide(edge, fc.model_agreement, eff,
                                   ensemble.validated, verdict)
                res.edges.append(ModelEdge(
                    match=mb.match, market="h2h", outcome=oc.outcome,
                    bookmaker=bk, price=round(price, 3),
                    p_model=round(p_model, 4),
                    p_model_interval=(round(_interval_for(oc.outcome, fc, mb.home, mb.away)[0], 4),
                                      round(_interval_for(oc.outcome, fc, mb.home, mb.away)[1], 4)),
                    p_market_devig=None if p_mkt is None else round(p_mkt, 4),
                    edge=round(edge, 4),
                    model_vs_market=None if p_mkt is None else round(p_model - p_mkt, 4),
                    model_agreement=fc.model_agreement,
                    members={k: round(v[0 if oc.outcome == mb.home else 2 if oc.outcome == mb.away else 1], 4)
                             for k, v in fc.members.items()},
                    eff_matches=round(eff, 1),
                    decision=decision,
                    notes=list(fc.notes),
                ))

    res.edges.sort(key=lambda e: e.edge, reverse=True)
    return res


def _decide(edge: float, agreement: float, eff_matches: float,
            validated: bool, verdict: Optional[dict] = None) -> str:
    # Si un backtest walk-forward dice que ESTE modelo pierde vs el mercado,
    # no hay "SMALL BET" que valga: como mucho WATCH, y NO BET si discrepan.
    model_loses = verdict is not None and (
        verdict.get("beats_market") is False
        or (verdict.get("roi") is not None and verdict["roi"] < 0)
    )
    if not validated:
        if agreement < 0.60:
            return "NO BET · modelos discrepan"
        if model_loses:
            return "NO BET · backtest de este modelo pierde vs mercado"
        if edge >= 0.08 and agreement >= 0.85 and eff_matches >= 15:
            return "SMALL BET · NOT VALIDATED"
        return "WATCH · NOT VALIDATED"
    return "WATCH"
