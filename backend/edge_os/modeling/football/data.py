"""Fuentes de datos de resultados de fútbol.

* `MatchResult`        — un partido terminado (fecha UTC + goles).
* `SyntheticLeague`    — genera ligas con fuerzas latentes CONOCIDAS. Sirve para
                         tests (¿el modelo recupera lo que sabemos que hay?) y
                         para la demo sin datos externos.
* `load_football_data_csv` — carga CSV de football-data.co.uk (gratuito). Se usa
                         SOLO los resultados (FTHG/FTAG), no las cuotas.

Nota: `SyntheticLeague` NO es evidencia de que el modelo funcione en el mundo
real; solo de que la maquinaria de ajuste es correcta.
"""

from __future__ import annotations

import csv
import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, Optional


@dataclass(frozen=True)
class MatchResult:
    date: datetime          # tz-aware UTC
    league: str
    home_team: str
    away_team: str
    home_goals: int
    away_goals: int
    # cuotas 1X2 del CSV cuando están disponibles. Claves posibles:
    #   ps_{h,d,a}   Pinnacle pre-cierre        psc_{h,d,a}  Pinnacle CIERRE
    #   avg_{h,d,a}  media pre-cierre           avgc_{h,d,a} media CIERRE
    #   max_{h,d,a}  máx. pre-cierre            b365_{h,d,a} Bet365 pre-cierre
    odds: dict = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.date.tzinfo is None:
            raise ValueError("MatchResult.date debe ser timezone-aware (UTC)")
        if self.odds is None:
            object.__setattr__(self, "odds", {})

    @property
    def result(self) -> str:
        if self.home_goals > self.away_goals:
            return "H"
        if self.home_goals < self.away_goals:
            return "A"
        return "D"


# ───────────────────────── liga sintética ──────────────────────────────

class SyntheticLeague:
    """Genera resultados con ataque/defensa latentes por equipo.

    goles_local  ~ Poisson(exp(atk_local  - def_visit + home_adv))
    goles_visit  ~ Poisson(exp(atk_visit  - def_local))

    `drift` permite que un equipo cambie de fuerza a lo largo de las temporadas
    (para probar el time-decay): `drift={"T00": (+0.7, -0.7)}` hace que el
    ataque de T00 vaya linealmente de +0.7 (1ª temporada) a -0.7 (última).
    """

    def __init__(
        self,
        n_teams: int = 16,
        *,
        seed: int = 0,
        home_adv: float = 0.25,
        atk_sd: float = 0.35,
        def_sd: float = 0.30,
        base_rate: float = 0.2,          # desplazamiento común (nivel de goles)
        drift: Optional[dict[str, tuple[float, float]]] = None,
    ):
        self.n_teams = n_teams
        self.home_adv = home_adv
        self.base_rate = base_rate
        self.drift = drift or {}
        self._rng = random.Random(seed)
        self.teams = [f"T{i:02d}" for i in range(n_teams)]
        self.true_attack = {t: self._rng.gauss(0.0, atk_sd) for t in self.teams}
        self.true_defense = {t: self._rng.gauss(0.0, def_sd) for t in self.teams}
        # centrar (identificabilidad, igual que hará el modelo)
        ma = sum(self.true_attack.values()) / n_teams
        md = sum(self.true_defense.values()) / n_teams
        self.true_attack = {t: v - ma for t, v in self.true_attack.items()}
        self.true_defense = {t: v - md for t, v in self.true_defense.items()}

    def _attack_at(self, team: str, season_frac: float) -> float:
        base = self.true_attack[team]
        if team in self.drift:
            a0, a1 = self.drift[team]
            return a0 + (a1 - a0) * season_frac
        return base

    def generate(
        self,
        seasons: int = 3,
        *,
        start: Optional[datetime] = None,
        days_per_season: int = 270,
    ) -> list[MatchResult]:
        start = start or datetime(2023, 8, 1, tzinfo=timezone.utc)
        out: list[MatchResult] = []
        for s in range(seasons):
            season_frac = s / max(1, seasons - 1) if seasons > 1 else 0.0
            fixtures = [(h, a) for h in self.teams for a in self.teams if h != a]
            self._rng.shuffle(fixtures)
            season_start = start + timedelta(days=s * 365)
            n = len(fixtures)
            for k, (h, a) in enumerate(fixtures):
                day = int(days_per_season * k / n)
                date = season_start + timedelta(days=day,
                                                hours=self._rng.randint(12, 21))
                lam = math.exp(self.base_rate + self._attack_at(h, season_frac)
                               - self.true_defense[a] + self.home_adv)
                mu = math.exp(self.base_rate + self._attack_at(a, season_frac)
                              - self.true_defense[h])
                out.append(MatchResult(
                    date=date, league="SYNTH",
                    home_team=h, away_team=a,
                    home_goals=_poisson(self._rng, lam),
                    away_goals=_poisson(self._rng, mu),
                ))
        out.sort(key=lambda m: m.date)
        return out


def _poisson(rng: random.Random, lam: float) -> int:
    """Knuth. Suficiente para lam pequeños (goles de fútbol)."""
    L = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        k += 1
        p *= rng.random()
        if p <= L:
            return k - 1


# ─────────────────────── football-data.co.uk ───────────────────────────

_DATE_FORMATS = ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d")


def _parse_date(raw: str) -> Optional[datetime]:
    raw = (raw or "").strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


_ODDS_COLS = {
    "ps_h": "PSH", "ps_d": "PSD", "ps_a": "PSA",
    "psc_h": "PSCH", "psc_d": "PSCD", "psc_a": "PSCA",
    "avg_h": "AvgH", "avg_d": "AvgD", "avg_a": "AvgA",
    "avgc_h": "AvgCH", "avgc_d": "AvgCD", "avgc_a": "AvgCA",
    "max_h": "MaxH", "max_d": "MaxD", "max_a": "MaxA",
    "b365_h": "B365H", "b365_d": "B365D", "b365_a": "B365A",
}


def _num(v) -> Optional[float]:
    try:
        f = float(v)
        return f if f > 1.0 else None
    except (TypeError, ValueError):
        return None


def load_football_data_csv(
    path: str | Path, *, league: Optional[str] = None, with_odds: bool = True
) -> list[MatchResult]:
    """Carga un CSV de https://www.football-data.co.uk/ (Date, HomeTeam,
    AwayTeam, FTHG, FTAG, Div, y columnas de cuotas 1X2).

    Con `with_odds=True` se guardan las cuotas Pinnacle pre-cierre/cierre,
    media pre-cierre/cierre, máx. pre-cierre y Bet365 en `MatchResult.odds`.
    Esto permite backtest + CLV + calibración SIN pagar un feed histórico.

    El archivo lo aporta el usuario; esta función no descarga nada.
    """
    p = Path(path)
    rows: list[MatchResult] = []
    with p.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            date = _parse_date(r.get("Date", ""))
            home = (r.get("HomeTeam") or "").strip()
            away = (r.get("AwayTeam") or "").strip()
            hg, ag = r.get("FTHG", ""), r.get("FTAG", "")
            if not (date and home and away) or hg == "" or ag == "":
                continue
            odds: dict = {}
            if with_odds:
                for key, col in _ODDS_COLS.items():
                    v = _num(r.get(col))
                    if v is not None:
                        odds[key] = v
            try:
                rows.append(MatchResult(
                    date=date, league=(league or r.get("Div") or "?").strip(),
                    home_team=home, away_team=away,
                    home_goals=int(float(hg)), away_goals=int(float(ag)),
                    odds=odds,
                ))
            except (TypeError, ValueError):
                continue
    rows.sort(key=lambda m: m.date)
    return rows


def iter_team_matches(
    matches: list[MatchResult], team: str
) -> Iterator[MatchResult]:
    for m in matches:
        if m.home_team == team or m.away_team == team:
            yield m
