"""Investigación: backtesting walk-forward, métricas de calibración, CLV.

Nota importante: el backtest de fútbol usa las cuotas **pre-cierre y de cierre**
que ya vienen en los CSV de football-data.co.uk (Pinnacle, media, máx.). Eso
permite medir calibración, ROI y CLV (entrada vs cierre) SIN pagar un feed
histórico intradía. No es lo mismo que snapshots cada 5 min, pero es evidencia
real out-of-sample sobre ~1000+ partidos.
"""

from .metrics import brier_multiclass, ece, log_loss_multiclass, reliability_table

__all__ = [
    "brier_multiclass",
    "log_loss_multiclass",
    "reliability_table",
    "ece",
]
