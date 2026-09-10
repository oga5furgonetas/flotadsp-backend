"""Modelos de probabilidad propios (Fase 6).

El mercado deja de ser "la verdad" y pasa a ser **una señal más**. Cada modelo
estima una distribución de resultado a partir de datos deportivos (de momento:
resultados de partidos), con:

* ponderación temporal (time-decay) — la información envejece;
* disciplina *as-of* — un modelo solo puede ajustarse con partidos anteriores
  al instante de referencia (anti look-ahead);
* medida de "muestra efectiva" por equipo — Σ pesos y su tamaño efectivo.

ESTADO: construido, **no validado**. Sin odds histórico no se puede medir
calibración/CLV/walk-forward. Los tests comprueban que el modelo recupera
fuerzas conocidas en una liga sintética y que la aritmética de mercados es
consistente — no que gane dinero.
"""

from .base import MarketProbs, MatchForecast, PredictiveModel

__all__ = ["PredictiveModel", "MatchForecast", "MarketProbs"]
