"""Almacén de snapshots de cuotas con lectura *as-of* obligatoria.

Dos tiempos por fila:

* ``valid_at``    — instante al que se refiere el dato (la casa dice que el
                    precio se actualizó entonces). Puede faltar.
* ``captured_at`` — instante en que EDGE OS obtuvo el dato. **Nunca falta.**

Invariante: toda lectura para decisión/backtest pasa por ``asof=T`` y sólo ve
filas con ``captured_at <= T``. Se filtra por ``captured_at`` y **no** por
``valid_at`` a propósito: un dato podía "existir" en el mundo antes de que el
sistema lo tuviera, y usarlo sería look-ahead.

Este módulo es nuevo y aislado: no toca ``edge/storage.py`` ni el pipeline V1.
Es el cimiento de las fases 3+ (histórico, backtester, replay).
"""

from __future__ import annotations

import sqlite3
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from ..models import Quote

_SCHEMA = """
CREATE TABLE IF NOT EXISTS odds_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at TEXT NOT NULL,          -- ISO8601 UTC · cuándo lo obtuvo EDGE OS
    valid_at    TEXT,                   -- ISO8601 UTC · a qué instante se refiere
    provider    TEXT NOT NULL,
    config_hash TEXT,
    event_id    TEXT NOT NULL,
    sport       TEXT,
    commence_time TEXT,
    home        TEXT,
    away        TEXT,
    market      TEXT NOT NULL,
    point       REAL,
    bookmaker   TEXT NOT NULL,
    outcome     TEXT NOT NULL,
    price       REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_snap_asof
    ON odds_snapshots (event_id, market, bookmaker, outcome, captured_at);
CREATE INDEX IF NOT EXISTS ix_snap_captured
    ON odds_snapshots (captured_at);
"""


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        raise ValueError("datetime sin tzinfo: EDGE OS trabaja siempre en UTC explícito")
    return dt.astimezone(timezone.utc).isoformat()


def _parse(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    return datetime.fromisoformat(ts).astimezone(timezone.utc)


def _require_asof(asof: Optional[datetime]) -> datetime:
    if asof is None:
        raise ValueError(
            "lectura sin 'asof': toda lectura para decisión/backtest debe "
            "indicar el instante de corte (evita look-ahead)"
        )
    if asof.tzinfo is None:
        raise ValueError("'asof' debe ser timezone-aware (UTC)")
    return asof.astimezone(timezone.utc)


@dataclass(frozen=True)
class Snapshot:
    """Un lote de cuotas capturado en un mismo instante."""

    captured_at: datetime
    provider: str
    quotes: list[Quote]
    config_hash: Optional[str] = None
    valid_at: Optional[datetime] = None
    meta: dict = field(default_factory=dict)


class AsOfStore:
    """SQLite. Insert-only. Lecturas *as-of* obligatorias."""

    def __init__(self, path: str | Path = "edge_asof.db"):
        self.path = str(path)
        self._lock = threading.Lock()
        self._cx = sqlite3.connect(self.path, check_same_thread=False)
        self._cx.row_factory = sqlite3.Row
        with self._lock:
            self._cx.executescript(_SCHEMA)
            self._cx.commit()

    def close(self) -> None:
        with self._lock:
            self._cx.close()

    # ── escritura ────────────────────────────────────────────
    def write_snapshot(
        self,
        quotes: Iterable[Quote],
        *,
        captured_at: Optional[datetime] = None,
        provider: str = "unknown",
        config_hash: Optional[str] = None,
    ) -> int:
        """Inserta un lote. Devuelve nº de filas escritas.

        ``captured_at`` por defecto = ahora (UTC). Cada Quote aporta su
        ``last_update`` como ``valid_at``.
        """
        cap = captured_at or datetime.now(timezone.utc)
        if cap.tzinfo is None:
            raise ValueError("'captured_at' debe ser timezone-aware (UTC)")
        cap_iso = _iso(cap)

        rows = []
        for q in quotes:
            if q.price is None or q.price <= 1.0:
                continue
            rows.append((
                cap_iso, _iso(q.last_update), provider, config_hash,
                q.event_id, q.sport, _iso(q.commence_time), q.home, q.away,
                q.market, q.point, q.bookmaker, q.outcome, float(q.price),
            ))
        if not rows:
            return 0
        with self._lock:
            self._cx.executemany(
                "INSERT INTO odds_snapshots (captured_at,valid_at,provider,"
                "config_hash,event_id,sport,commence_time,home,away,market,"
                "point,bookmaker,outcome,price) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                rows,
            )
            self._cx.commit()
        return len(rows)

    # ── lectura as-of ────────────────────────────────────────
    def read_quotes(
        self,
        *,
        asof: Optional[datetime],
        event_id: Optional[str] = None,
        sport: Optional[str] = None,
        market: Optional[str] = None,
    ) -> list[Quote]:
        """Última cuota conocida a fecha ``asof`` para cada
        (event_id, market, point, bookmaker, outcome).

        Sólo considera filas con ``captured_at <= asof``.
        """
        cut = _iso(_require_asof(asof))

        where = ["captured_at <= ?"]
        args: list = [cut]
        if event_id is not None:
            where.append("event_id = ?")
            args.append(event_id)
        if sport is not None:
            where.append("sport = ?")
            args.append(sport)
        if market is not None:
            where.append("market = ?")
            args.append(market)
        wsql = " AND ".join(where)

        # Fila con captured_at máximo (y, empate, id máximo) por clave.
        sql = f"""
            WITH filtered AS (
                SELECT * FROM odds_snapshots WHERE {wsql}
            ),
            ranked AS (
                SELECT f.*,
                       ROW_NUMBER() OVER (
                           PARTITION BY event_id, market, IFNULL(point,'∅'),
                                        bookmaker, outcome
                           ORDER BY captured_at DESC, id DESC
                       ) AS rn
                FROM filtered f
            )
            SELECT * FROM ranked WHERE rn = 1
        """
        with self._lock:
            cur = self._cx.execute(sql, args)
            rows = cur.fetchall()

        out: list[Quote] = []
        for r in rows:
            out.append(Quote(
                event_id=r["event_id"], sport=r["sport"],
                commence_time=_parse(r["commence_time"]),
                home=r["home"], away=r["away"], market=r["market"],
                bookmaker=r["bookmaker"], outcome=r["outcome"],
                price=float(r["price"]), point=r["point"],
                last_update=_parse(r["valid_at"]),
                fetched_at=_parse(r["captured_at"]),
            ))
        return out

    def closing_line(
        self,
        event_id: str,
        market: str,
        point: Optional[float],
        *,
        asof: Optional[datetime],
    ) -> dict[str, list[tuple[str, float]]]:
        """Mejor aproximación a la línea de cierre: última cuota por casa y
        resultado con ``captured_at <= asof`` (``asof`` = kickoff / cierre real).

        Devuelve ``{outcome: [(bookmaker, price), ...]}``.
        """
        cut = _iso(_require_asof(asof))
        sql = """
            WITH filtered AS (
                SELECT * FROM odds_snapshots
                WHERE event_id = ? AND market = ?
                  AND (point IS ? OR point = ?)
                  AND captured_at <= ?
            ),
            ranked AS (
                SELECT f.*,
                       ROW_NUMBER() OVER (
                           PARTITION BY bookmaker, outcome
                           ORDER BY captured_at DESC, id DESC
                       ) AS rn
                FROM filtered f
            )
            SELECT bookmaker, outcome, price FROM ranked WHERE rn = 1
        """
        with self._lock:
            rows = self._cx.execute(
                sql, (event_id, market, point, point, cut)
            ).fetchall()
        out: dict[str, list[tuple[str, float]]] = {}
        for r in rows:
            out.setdefault(r["outcome"], []).append(
                (r["bookmaker"], float(r["price"]))
            )
        return out

    # ── utilidades ───────────────────────────────────────────
    def snapshot_times(
        self, *, event_id: Optional[str] = None,
        asof: Optional[datetime] = None,
    ) -> list[datetime]:
        """Instantes ``captured_at`` distintos registrados (orden ascendente)."""
        where, args = [], []
        if event_id is not None:
            where.append("event_id = ?")
            args.append(event_id)
        if asof is not None:
            where.append("captured_at <= ?")
            args.append(_iso(_require_asof(asof)))
        wsql = (" WHERE " + " AND ".join(where)) if where else ""
        with self._lock:
            rows = self._cx.execute(
                f"SELECT DISTINCT captured_at FROM odds_snapshots{wsql} "
                "ORDER BY captured_at ASC", args,
            ).fetchall()
        return [_parse(r["captured_at"]) for r in rows]

    def latest_captured_at(self) -> Optional[datetime]:
        with self._lock:
            row = self._cx.execute(
                "SELECT MAX(captured_at) m FROM odds_snapshots"
            ).fetchone()
        return _parse(row["m"]) if row and row["m"] else None

    def count(self) -> int:
        with self._lock:
            return int(self._cx.execute(
                "SELECT COUNT(*) c FROM odds_snapshots"
            ).fetchone()["c"])
