"""Persistencia en SQLite: snapshots de cuotas, oportunidades y apuestas.

Nunca se sobreescriben cuotas: cada `save_quotes` inserta filas nuevas con su
timestamp, para poder reconstruir qué sabía el sistema en cada instante
(base para backtesting y para el cálculo de CLV con la línea de cierre).

La conexión usa check_same_thread=False y un Lock: Streamlit reejecuta el
script en hilos distintos, pero nuestras operaciones son cortas y quedan
serializadas por el lock.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from .models import ArbOpportunity, Quote, ValueOpportunity

_SCHEMA = """
CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fetched_at TEXT NOT NULL,
    event_id TEXT NOT NULL,
    sport TEXT, commence_time TEXT,
    home TEXT, away TEXT,
    market TEXT NOT NULL, point REAL,
    bookmaker TEXT NOT NULL, outcome TEXT NOT NULL,
    price REAL NOT NULL, last_update TEXT
);
CREATE INDEX IF NOT EXISTS ix_quotes_ev ON quotes(event_id, market, outcome, fetched_at);

CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    detected_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    event_id TEXT, match TEXT, sport TEXT,
    market TEXT, point REAL, outcome TEXT, bookmaker TEXT,
    price REAL, fair_price REAL, true_prob REAL,
    edge REAL, robust_ev REAL, roi REAL,
    decision TEXT, confidence REAL, kelly_fraction REAL,
    commence_time TEXT, details TEXT
);
CREATE INDEX IF NOT EXISTS ix_opp_kind ON opportunities(kind, detected_at);

CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    placed_at TEXT NOT NULL,
    event_id TEXT, match TEXT, sport TEXT,
    market TEXT, point REAL, outcome TEXT, bookmaker TEXT,
    price_taken REAL NOT NULL, stake REAL NOT NULL,
    true_prob_at_bet REAL, commence_time TEXT,
    closing_price REAL, closing_true_prob REAL, clv REAL,
    result TEXT, pnl REAL, status TEXT NOT NULL DEFAULT 'open',
    note TEXT
);
"""


def _iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).isoformat() if dt else None


class Storage:
    def __init__(self, path: str | Path = "edge.db"):
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

    # ── cuotas ───────────────────────────────────────────────
    def save_quotes(self, quotes: Iterable[Quote]) -> int:
        rows = [
            (_iso(q.fetched_at), q.event_id, q.sport, _iso(q.commence_time),
             q.home, q.away, q.market, q.point, q.bookmaker, q.outcome,
             q.price, _iso(q.last_update))
            for q in quotes
        ]
        with self._lock:
            self._cx.executemany(
                "INSERT INTO quotes (fetched_at,event_id,sport,commence_time,"
                "home,away,market,point,bookmaker,outcome,price,last_update) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows,
            )
            self._cx.commit()
        return len(rows)

    def latest_quote(
        self, event_id: str, market: str, outcome: str,
        point: Optional[float], bookmaker: Optional[str] = None,
    ) -> Optional[sqlite3.Row]:
        q = ("SELECT * FROM quotes WHERE event_id=? AND market=? AND outcome=? "
             "AND (point IS ? OR point=?)")
        args: list = [event_id, market, outcome, point, point]
        if bookmaker:
            q += " AND bookmaker=?"
            args.append(bookmaker)
        q += " ORDER BY fetched_at DESC LIMIT 1"
        with self._lock:
            return self._cx.execute(q, args).fetchone()

    def closing_market(
        self, event_id: str, market: str, point: Optional[float],
    ) -> dict[str, list[float]]:
        """Precios del último snapshot registrado: {resultado: [cuotas...]}.

        Aproxima la 'línea de cierre': el snapshot más reciente que tenemos
        antes de que el evento empiece / el mercado se cierre.
        """
        with self._lock:
            row = self._cx.execute(
                "SELECT MAX(fetched_at) m FROM quotes WHERE event_id=? AND "
                "market=? AND (point IS ? OR point=?)",
                (event_id, market, point, point),
            ).fetchone()
            if not row or not row["m"]:
                return {}
            rows = self._cx.execute(
                "SELECT outcome, price FROM quotes WHERE event_id=? AND market=? "
                "AND (point IS ? OR point=?) AND fetched_at=?",
                (event_id, market, point, point, row["m"]),
            ).fetchall()
        out: dict[str, list[float]] = {}
        for r in rows:
            out.setdefault(r["outcome"], []).append(float(r["price"]))
        return out

    # ── oportunidades ────────────────────────────────────────
    def save_opportunity(self, opp) -> None:
        with self._lock:
            if isinstance(opp, ValueOpportunity):
                self._cx.execute(
                    "INSERT INTO opportunities (detected_at,kind,event_id,match,"
                    "sport,market,point,outcome,bookmaker,price,fair_price,"
                    "true_prob,edge,robust_ev,roi,decision,confidence,"
                    "kelly_fraction,commence_time,details) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (_iso(opp.detected_at), "value", opp.event_id, opp.match,
                     opp.sport, opp.market, opp.point, opp.outcome, opp.bookmaker,
                     opp.price, opp.fair_price, opp.true_prob, opp.edge,
                     opp.robust_ev, None, opp.decision, opp.confidence,
                     opp.kelly_fraction, _iso(opp.commence_time),
                     json.dumps({"penalties": opp.penalties,
                                 "fair_source": opp.fair_source,
                                 "n_books": opp.n_books})),
                )
            elif isinstance(opp, ArbOpportunity):
                self._cx.execute(
                    "INSERT INTO opportunities (detected_at,kind,event_id,match,"
                    "sport,market,point,roi,commence_time,details) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (_iso(opp.detected_at), "arbitrage", opp.event_id, opp.match,
                     opp.sport, opp.market, opp.point, opp.roi,
                     _iso(opp.commence_time),
                     json.dumps({"sum_inverse": opp.sum_inverse,
                                 "legs": [leg.__dict__ for leg in opp.legs]})),
                )
            self._cx.commit()

    def recent_opportunities(self, kind: str, limit: int = 200) -> list[sqlite3.Row]:
        with self._lock:
            return self._cx.execute(
                "SELECT * FROM opportunities WHERE kind=? ORDER BY detected_at "
                "DESC LIMIT ?", (kind, limit),
            ).fetchall()

    # ── apuestas / CLV ───────────────────────────────────────
    def add_bet(self, **kw) -> int:
        kw.setdefault("placed_at", datetime.now(timezone.utc).isoformat())
        kw.setdefault("status", "open")
        cols = ", ".join(kw)
        ph = ", ".join("?" for _ in kw)
        with self._lock:
            cur = self._cx.execute(
                f"INSERT INTO bets ({cols}) VALUES ({ph})", list(kw.values())
            )
            self._cx.commit()
            return int(cur.lastrowid)

    def open_bets(self) -> list[sqlite3.Row]:
        with self._lock:
            return self._cx.execute(
                "SELECT * FROM bets WHERE status='open' ORDER BY placed_at"
            ).fetchall()

    def all_bets(self) -> list[sqlite3.Row]:
        with self._lock:
            return self._cx.execute(
                "SELECT * FROM bets ORDER BY placed_at"
            ).fetchall()

    def update_bet(self, bet_id: int, **kw) -> None:
        sets = ", ".join(f"{k}=?" for k in kw)
        with self._lock:
            self._cx.execute(
                f"UPDATE bets SET {sets} WHERE id=?", [*kw.values(), bet_id]
            )
            self._cx.commit()
