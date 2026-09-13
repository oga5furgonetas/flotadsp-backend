"""Interfaz de persistencia (asíncrona: la API es FastAPI)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timedelta


class Store(ABC):
    # snapshots de cuotas ─────────────────────────────────────────────────
    @abstractmethod
    async def put_snapshots(self, docs: list[dict]) -> int:
        """Inserta; los repetidos (evento, mercado, instante, fuente) no se duplican."""

    @abstractmethod
    async def snapshots_asof(self, asof: datetime, *, lookback: timedelta = timedelta(hours=48),
                             event_ids: list[str] | None = None) -> list[dict]:
        """Último documento por (evento, mercado) con ``observed_at <= asof``.

        Es la única lectura que alimenta decisiones y replay: por construcción no
        puede ver nada observado después de ``asof``."""

    @abstractmethod
    async def snapshot_history(self, event_id: str, *, until: datetime,
                               market_key: str | None = None) -> list[dict]:
        """Todos los documentos de un evento hasta ``until``, en orden temporal."""

    # marcadores ──────────────────────────────────────────────────────────
    @abstractmethod
    async def put_scores(self, docs: list[dict]) -> int: ...

    @abstractmethod
    async def scores_asof(self, asof: datetime, event_ids: list[str] | None = None) -> dict[str, dict]: ...

    @abstractmethod
    async def score_history(self, event_id: str, until: datetime) -> list[dict]: ...

    # señales (todas las decisiones con ventaja aparente) ─────────────────
    @abstractmethod
    async def log_signals(self, docs: list[dict]) -> int: ...

    @abstractmethod
    async def signals(self, *, since: datetime | None = None, until: datetime | None = None,
                      selection_id: str | None = None, limit: int = 5000) -> list[dict]: ...

    @abstractmethod
    async def put_signal_closing(self, doc: dict) -> bool:
        """Cierre de una selección señalada (apostada o no): una vez por selección."""

    @abstractmethod
    async def signal_closings(self, *, since: datetime | None = None) -> list[dict]: ...

    # paper trading ───────────────────────────────────────────────────────
    @abstractmethod
    async def add_paper_bet(self, doc: dict) -> bool:
        """False si ya existe (misma selección y origen): nunca se duplica."""

    @abstractmethod
    async def paper_bets(self, *, status: str | None = None, limit: int = 5000) -> list[dict]: ...

    @abstractmethod
    async def update_paper_bet(self, bet_id: str, fields: dict) -> bool: ...

    # watchlist y alertas ─────────────────────────────────────────────────
    @abstractmethod
    async def add_watch(self, doc: dict) -> bool: ...

    @abstractmethod
    async def watches(self, *, status: str | None = "active") -> list[dict]: ...

    @abstractmethod
    async def update_watch(self, watch_id: str, fields: dict) -> bool: ...

    @abstractmethod
    async def add_alert(self, doc: dict) -> bool: ...

    @abstractmethod
    async def alerts(self, *, unread_only: bool = False, limit: int = 200) -> list[dict]: ...

    @abstractmethod
    async def mark_alerts_read(self, alert_ids: list[str]) -> int: ...

    # ajustes y créditos ──────────────────────────────────────────────────
    @abstractmethod
    async def get_settings(self) -> dict: ...

    @abstractmethod
    async def put_settings(self, fields: dict) -> dict: ...

    @abstractmethod
    async def log_credit(self, doc: dict) -> None: ...

    @abstractmethod
    async def credit_log(self, since: datetime) -> list[dict]: ...
