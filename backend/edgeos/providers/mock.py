"""Proveedor SINTÉTICO. Solo para tests y para ver la interfaz sin gastar créditos.

Todo lo que sale de aquí va marcado ``is_mock = True`` y la interfaz lo dice en
grande: estos precios no existen. Está hecho para ejercitar cada estado del
motor de forma determinista:

* un partido con una casa blanda pagando por encima del precio justo de Pinnacle;
* un precio imposible (22.00) para que salte «datos no fiables»;
* un mercado sin Pinnacle (sin referencia);
* un partido en directo con marcador;
* partidos normales, sin nada.
"""

from __future__ import annotations

import hashlib
import random
from datetime import datetime, timedelta

from ..domain import Event, MarketSnapshot, Quote, market_key, utcnow
from .base import OddsFeed

SOFT = ("williamhill", "sport888", "unibet_se", "betsson", "nordicbet", "leovegas_se", "tipico_de", "marathonbet")
SHARP = ("pinnacle", "betfair_ex_eu")

SPORTS = [
    {"key": "soccer_epl", "group": "Soccer", "title": "EPL", "active": True},
    {"key": "soccer_spain_la_liga", "group": "Soccer", "title": "La Liga - Spain", "active": True},
    {"key": "basketball_nba", "group": "Basketball", "title": "NBA", "active": True},
]

FIXTURES = {
    "soccer_epl": [("Arsenal", "Chelsea", 300), ("Liverpool", "Everton", -35), ("Brighton", "Fulham", 1440),
                   ("Newcastle", "Wolves", 90)],
    "soccer_spain_la_liga": [("Real Madrid", "Sevilla", 600), ("Girona", "Osasuna", 2000),
                             ("Betis", "Villarreal", 150)],
    "basketball_nba": [("Lakers", "Celtics", 400)],
}


def _rng(*parts: object) -> random.Random:
    bucket = int(utcnow().timestamp() // 600)
    h = hashlib.sha256("|".join(map(str, (*parts, bucket))).encode()).hexdigest()
    return random.Random(int(h[:12], 16))


class MockFeed(OddsFeed):
    name = "mock"
    is_mock = True

    def __init__(self, now: datetime | None = None):
        super().__init__()
        self._now = now

    def _t(self) -> datetime:
        return self._now or utcnow()

    def sports(self) -> list[dict]:
        return list(SPORTS)

    def events(self, sport: str) -> list[dict]:
        now = self._t()
        return [{"id": f"mock-{sport}-{i}", "sport_key": sport, "home_team": h, "away_team": a,
                 "commence_time": (now + timedelta(minutes=m)).isoformat()}
                for i, (h, a, m) in enumerate(FIXTURES.get(sport, []))]

    def scores(self, sport: str, days_from: int | None = None) -> list[dict]:
        now = self._t()
        out = []
        for i, (_h, _a, m) in enumerate(FIXTURES.get(sport, [])):
            live = m <= 0
            out.append({"id": f"mock-{sport}-{i}", "completed": False,
                        "home_score": 1 if live else None, "away_score": 0 if live else None,
                        "last_update": now.isoformat() if live else None,
                        "commence_time": (now + timedelta(minutes=m)).isoformat()})
        return out

    def odds(self, sport: str, markets: list[str], regions: list[str]) -> list[Event]:
        return [e for i in range(len(FIXTURES.get(sport, []))) if (e := self._event(sport, i, markets))]

    def event_odds(self, sport: str, event_id: str, markets: list[str], regions: list[str]) -> Event | None:
        try:
            i = int(event_id.rsplit("-", 1)[1])
        except (IndexError, ValueError):
            return None
        return self._event(sport, i, markets)

    def _event(self, sport: str, i: int, markets: list[str]) -> Event | None:
        fx = FIXTURES.get(sport, [])
        if i >= len(fx):
            return None
        home, away, mins = fx[i]
        now = self._t()
        eid = f"mock-{sport}-{i}"
        ev = Event(id=eid, sport=sport, sport_title=str(next(s["title"] for s in SPORTS if s["key"] == sport)) + " (MOCK)",
                   home=home, away=away, commence_time=now + timedelta(minutes=mins))
        rng = _rng(sport, i)
        soccer = sport.startswith("soccer")
        if "h2h" in markets:
            if soccer:
                ph = rng.uniform(0.30, 0.55)
                pd_ = rng.uniform(0.22, 0.30)
                probs = {"home": ph, "draw": pd_, "away": max(0.08, 1 - ph - pd_)}
            else:
                ph = rng.uniform(0.35, 0.65)
                probs = {"home": ph, "away": 1 - ph}
            ev.markets[market_key("h2h", None)] = self._snap(eid, sport, "h2h", None, probs, rng, now, i)
        if soccer and "totals" in markets:
            po = rng.uniform(0.45, 0.58)
            ev.markets[market_key("totals", 2.5)] = self._snap(eid, sport, "totals", 2.5,
                                                               {"over": po, "under": 1 - po}, rng, now, i)
        if soccer and "spreads" in markets:
            ph = rng.uniform(0.46, 0.54)
            ev.markets[market_key("spreads", -0.5)] = self._snap(eid, sport, "spreads", -0.5,
                                                                 {"home": ph, "away": 1 - ph}, rng, now, i)
        return ev

    def _snap(self, eid: str, sport: str, market: str, line: float | None, probs: dict[str, float],
              rng: random.Random, now: datetime, i: int) -> MarketSnapshot:
        total = sum(probs.values())
        probs = {k: v / total for k, v in probs.items()}
        books = list(SHARP) + list(SOFT)
        if sport == "soccer_spain_la_liga" and i == 1:
            books = list(SOFT)                                   # sin Pinnacle: sin referencia
        quotes: dict[str, dict[str, Quote]] = {o: {} for o in probs}
        for bk in books:
            margin = rng.uniform(1.020, 1.030) if bk in SHARP else rng.uniform(1.055, 1.085)
            noise = {o: rng.uniform(-0.006, 0.006) for o in probs}
            p = {o: max(0.02, v + noise[o]) for o, v in probs.items()}
            s = sum(p.values())
            lu = now - timedelta(seconds=rng.uniform(20, 240))
            for o in probs:
                price = round(1.0 / (p[o] / s * margin), 2)
                if sport == "soccer_epl" and i == 0 and market == "h2h" and bk == "williamhill" and o == "home":
                    price = round(1.0 / (probs[o] * 0.94), 2)        # casa blanda regalando precio
                if sport == "soccer_epl" and i == 3 and market == "h2h" and bk == "tipico_de" and o == "away":
                    price = 22.0                                     # error de precio
                quotes[o][bk] = Quote(bk, max(1.01, price), lu)
        return MarketSnapshot(eid, sport, market, line, tuple(probs), quotes, now)
