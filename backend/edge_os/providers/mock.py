"""Proveedor sintético: permite probar todo el pipeline sin API key.

Genera un conjunto fijo de partidos con varias casas. Los precios derivan de
una probabilidad "verdadera" por partido + sesgo/ruido por casa + margen
(overround). Cada ~5 min cambia la semilla, así el bucle `poll` muestra
movimiento de líneas. Inyecta a propósito 1 arbitraje y 1 value claros.
"""

from __future__ import annotations

import hashlib
import random
from datetime import datetime, timedelta, timezone

from ..models import Quote
from .base import OddsProvider

_FIXTURES = [
    ("Real Madrid", "Sevilla"),
    ("FC Barcelona", "Real Betis"),
    ("Atletico Madrid", "Valencia"),
    ("Athletic Bilbao", "Villarreal"),
    ("Real Sociedad", "Getafe"),
    ("Girona", "Osasuna"),
]

_BOOKS_SOFT = ["bet365", "williamhill", "unibet", "betway", "888sport", "betfair_sb"]
_BOOKS_SHARP = ["pinnacle", "betfair_ex_eu", "marathonbet"]

_SPORTS = [
    {"key": "soccer_spain_la_liga", "group": "Soccer", "title": "La Liga - Spain",
     "active": True, "has_outrights": False},
    {"key": "soccer_epl", "group": "Soccer", "title": "EPL", "active": True,
     "has_outrights": False},
    {"key": "basketball_nba", "group": "Basketball", "title": "NBA", "active": True,
     "has_outrights": False},
]


#: minutos hasta el saque de cada fixture. Negativo = ya empezado (en vivo).
#: Los dos primeros estan EN VIVO y los dos siguientes dentro de la ventana de
#: 3 h a proposito: sin esto el barrido gratuito no encuentra nada en modo mock
#: y el panel sale vacio, que es indistinguible de una averia.
_KICKOFF_MIN = [-37.0, -12.0, -4.0, 140.0, 400.0, 1500.0]


def _seed(sport: str) -> int:
    bucket = int(datetime.now(timezone.utc).timestamp() // 300)  # 5-min bucket
    h = hashlib.sha256(f"{sport}:{bucket}".encode()).hexdigest()
    return int(h[:12], 16)


def _commence(i: int) -> datetime:
    mins = _KICKOFF_MIN[i % len(_KICKOFF_MIN)]
    return datetime.now(timezone.utc) + timedelta(minutes=mins)


def _overround(rng: random.Random, book: str) -> float:
    if book in _BOOKS_SHARP:
        return rng.uniform(1.020, 1.030)
    return rng.uniform(1.062, 1.090)


class MockProvider(OddsProvider):
    name = "mock"

    def list_sports(self) -> list[dict]:
        return list(_SPORTS)

    def list_events(self, sport: str) -> list[dict]:
        """Mismo catalogo que `fetch`, sin cuotas. Tiene que existir: el radar
        decide DONDE gastar credito con esta llamada, asi que un proveedor sin
        ella deja el panel en blanco sin que falle nada."""
        return [{
            "id": f"mock-{sport}-{i}",
            "sport_key": sport,
            "commence_time": _commence(i).isoformat().replace("+00:00", "Z"),
            "home_team": home,
            "away_team": away,
        } for i, (home, away) in enumerate(_FIXTURES)]

    def fetch(
        self, sport: str, markets: list[str], regions: list[str]
    ) -> list[Quote]:
        rng = random.Random(_seed(sport))
        now = datetime.now(timezone.utc)
        books = _BOOKS_SHARP + _BOOKS_SOFT
        quotes: list[Quote] = []

        for i, (home, away) in enumerate(_FIXTURES):
            commence = _commence(i)
            # probabilidad "verdadera" del partido
            ph = rng.uniform(0.30, 0.60)
            pa = rng.uniform(0.15, min(0.55, 0.95 - ph))
            pd = max(0.05, 1.0 - ph - pa)
            if i == 2:
                # partido 2: local y visitante acaban casi a la MISMA cuota
                # teniendo probabilidades distintas. Es el caso que el
                # comparador existe para enseñar («las dos a 1.80, pero metele
                # a esta»); sin un partido asi no se puede ver funcionando.
                ph, pd, pa = 0.470, 0.110, 0.420
            true = {"home": ph, "draw": pd, "away": pa}
            names = {"home": home, "draw": "Draw", "away": away}
            # deriva de mercado compartida: las casas se mueven juntas
            drift = {k: rng.uniform(-0.010, 0.010) for k in true}

            for book in books:
                # sesgo por casa: pequeño y en torno a la deriva común
                bias = {k: drift[k] + rng.uniform(-0.0025, 0.0025) for k in true}
                probs = {k: max(0.02, true[k] + bias[k]) for k in true}
                s = sum(probs.values())
                probs = {k: v / s for k, v in probs.items()}
                margin = _overround(rng, book)

                # --- inyección de anomalías -------------------------------
                # partido 0: 'bet365' paga de más la 'away' -> aparece arbitraje
                if i == 0 and book == "bet365":
                    probs["away"] *= 0.86
                # partido 1: 'unibet' infravalora la 'home' -> value claro
                if i == 1 and book == "unibet":
                    probs["home"] *= 0.85
                # partido 2: 'betway' sube la 'home' justo hasta la cuota de la
                # 'away'. Mismo precio en pantalla, valor muy distinto.
                if i == 2 and book == "betway":
                    probs["home"] *= 0.86
                # ---------------------------------------------------------

                # un mercado en vivo se repinta cada pocos segundos; uno
                # prepartido, no. `888sport` va siempre rezagado: asi el panel
                # enseña tambien el caso «precio viejo, no me fio de el».
                if book == "888sport":
                    lu = now - timedelta(minutes=9.0)
                elif _KICKOFF_MIN[i % len(_KICKOFF_MIN)] <= 0:
                    lu = now - timedelta(minutes=rng.uniform(0.1, 2.4))
                else:
                    lu = now - timedelta(minutes=rng.uniform(0.2, 6.0))
                if "h2h" in markets:
                    for k in ("home", "draw", "away"):
                        # overround: Σ (prob·margin) = margin > 1
                        price = round(1.0 / (probs[k] * margin), 3)
                        quotes.append(Quote(
                            event_id=f"mock-{sport}-{i}", sport=sport,
                            commence_time=commence, home=home, away=away,
                            market="h2h", bookmaker=book, outcome=names[k],
                            price=max(1.02, price), last_update=lu,
                        ))
                if "totals" in markets:
                    p_over = rng.uniform(0.42, 0.62)
                    for name, p in (("Over", p_over), ("Under", 1 - p_over)):
                        price = round(1.0 / (p * margin), 3)
                        quotes.append(Quote(
                            event_id=f"mock-{sport}-{i}", sport=sport,
                            commence_time=commence, home=home, away=away,
                            market="totals", bookmaker=book, outcome=name,
                            price=max(1.02, price), point=2.5, last_update=lu,
                        ))
        return quotes
