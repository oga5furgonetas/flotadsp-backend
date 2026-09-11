"""Cliente de The Odds API v4  ·  https://the-odds-api.com/

Endpoints usados:
  GET /v4/sports                         -> lista de deportes
  GET /v4/sports/{sport}/odds            -> cuotas actuales

Las cabeceras x-requests-remaining / x-requests-used informan de la cuota.
"""

from __future__ import annotations

from datetime import datetime, timezone

import requests

from ..models import Quote
from .base import OddsProvider

_BASE = "https://api.the-odds-api.com/v4"


def _iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)


class TheOddsAPIProvider(OddsProvider):
    name = "the-odds-api"

    def __init__(self, api_key: str, *, timeout: float = 20.0):
        self._key = api_key
        self._timeout = timeout
        self._session = requests.Session()

    def _get(self, path: str, params: dict) -> requests.Response:
        params = {"apiKey": self._key, **params}
        r = self._session.get(f"{_BASE}{path}", params=params, timeout=self._timeout)
        self.last_remaining = r.headers.get("x-requests-remaining", self.last_remaining)
        self.last_used = r.headers.get("x-requests-used", self.last_used)
        if r.status_code == 401:
            raise RuntimeError("The Odds API: key inválida (401)")
        if r.status_code == 422:
            raise RuntimeError(f"The Odds API: parámetros inválidos (422): {r.text}")
        if r.status_code == 429:
            raise RuntimeError("The Odds API: cuota agotada (429)")
        r.raise_for_status()
        return r

    def list_sports(self) -> list[dict]:
        return self._get("/sports", {}).json()

    def list_events(self, sport: str) -> list[dict]:
        """Eventos sin cuotas. Comprobado contra la API: `x-requests-last: 0`,
        o sea GRATIS. Es lo que hace viable un radar en vivo con el plan
        gratuito: se barre todo y solo se pagan las cuotas de lo que esta
        jugandose."""
        try:
            return self._get(f"/sports/{sport}/events",
                             {"dateFormat": "iso"}).json()
        except Exception:                                    # noqa: BLE001
            return []

    def fetch(
        self, sport: str, markets: list[str], regions: list[str]
    ) -> list[Quote]:
        params = {
            "regions": ",".join(regions),
            "markets": ",".join(markets),
            "oddsFormat": "decimal",
            "dateFormat": "iso",
        }
        events = self._get(f"/sports/{sport}/odds", params).json()
        return list(self._parse(sport, events))

    @staticmethod
    def _parse(sport: str, events: list[dict]):
        for ev in events:
            ct = _iso(ev.get("commence_time"))
            home = ev.get("home_team", "")
            away = ev.get("away_team", "")
            for bk in ev.get("bookmakers", []):
                lu = _iso(bk.get("last_update"))
                for mk in bk.get("markets", []):
                    mkey = mk.get("key", "")
                    mlu = _iso(mk.get("last_update")) or lu
                    for oc in mk.get("outcomes", []):
                        try:
                            price = float(oc["price"])
                        except (KeyError, TypeError, ValueError):
                            continue
                        if price <= 1.0:
                            continue
                        yield Quote(
                            event_id=ev.get("id", ""),
                            sport=sport,
                            commence_time=ct,
                            home=home,
                            away=away,
                            market=mkey,
                            bookmaker=bk.get("key", "?"),
                            outcome=oc.get("name", "?"),
                            price=price,
                            point=oc.get("point"),
                            last_update=mlu,
                        )
