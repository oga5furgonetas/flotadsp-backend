"""Cierres y resultados GRATIS de football-data.co.uk.

Por que existe. El plan del proveedor de cuotas son 500 creditos al mes, y capturar
cierres y liquidar se llevaba la mayor parte: un /odds por deporte y hora de inicio
mas un /scores por deporte y dia. Esta fuente publica, sin clave, trae las dos cosas
para las ligas validadas: el resultado y las cuotas de CIERRE del mercado.

Y no es un apano: la columna `AvgC` (media de cierre del mercado) es EXACTAMENTE la
medida contra la que se valido la ventaja en docs/VALIDATION.md. Medir con ella es
mas fiel que con una foto propia tomada doce minutos antes del inicio.

Lo que cuesta: llega con retraso (horas o un par de dias despues del partido). Para
medir CLV y liquidar en papel da igual; para decidir, no se usa.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

BASE = "https://www.football-data.co.uk/mmz4281"
UA = "Mozilla/5.0 (EDGE OS; datos publicos de football-data.co.uk)"
TTL_S = 6 * 3600


def season_code(d: date) -> str:
    """Temporada de football-data para una fecha: agosto-mayo -> '2627' para 2026/27."""
    y = d.year if d.month >= 7 else d.year - 1
    return f"{y % 100:02d}{(y + 1) % 100:02d}"


def normalize(name: str) -> str:
    """Nombre comparable: sin acentos, sin puntuacion y sin las coletillas de club."""
    s = (name or "").lower().strip()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ü", "u"), ("ñ", "n"),
                 ("ö", "o"), ("ä", "a"), ("å", "a"), ("ø", "o"), ("ç", "c"), ("â", "a"), ("ê", "e")):
        s = s.replace(a, b)
    for ch in ".'-/&":
        s = s.replace(ch, " ")
    fuera = {"fc", "cf", "afc", "sc", "sv", "ss", "as", "ac", "rc", "cd", "ud", "vfl", "vfb", "tsg",
             "fsv", "bsc", "1", "04", "05", "09", "1899", "de", "the"}
    return " ".join(w for w in s.split() if w not in fuera)


def _sim_palabra(a: str, b: str) -> float:
    from difflib import SequenceMatcher
    if a == b:
        return 1.0
    if min(len(a), len(b)) >= 3 and (a.startswith(b) or b.startswith(a)):
        return 0.92                      # «man» de «manchester», «weds» de «wednesday»
    return SequenceMatcher(None, a, b).ratio()


def similarity(a: str, b: str) -> float:
    """Parecido entre dos nombres de equipo de fuentes distintas."""
    from difflib import SequenceMatcher
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    ta, tb = na.split(), nb.split()
    corto, largo = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    usados: set[int] = set()
    puntos = 0.0
    for w in corto:
        mejor, idx = 0.0, None
        for i, x in enumerate(largo):
            if i in usados:
                continue
            s = _sim_palabra(w, x)
            if s > mejor:
                mejor, idx = s, i
        if idx is not None:
            usados.add(idx)
        puntos += mejor
    return 0.5 * (puntos / max(len(corto), 1)) + 0.5 * SequenceMatcher(None, na, nb).ratio()


@dataclass
class Emparejamiento:
    """Nombres de una liga traducidos entre el proveedor de cuotas y football-data."""
    alias: dict[str, str] = field(default_factory=dict)      # nombre del proveedor -> nombre del CSV
    sin_pareja: list[str] = field(default_factory=list)
    dudosos: list[tuple[str, str, str]] = field(default_factory=list)


MIN_SIM = 0.80          # por debajo, no se parecen lo suficiente
MIN_MARGEN = 0.06       # y tiene que sacarle esto a la segunda opcion, por los dos lados


def match_teams(api_names, csv_names) -> Emparejamiento:
    """Empareja solo cuando NO hay duda: mejor mutua, por encima del listón y con margen.

    Emparejar «Manchester City» con «Manchester United» liquidaría una apuesta con el
    resultado de otro partido. Ante la duda, se queda sin pareja y ese partido se
    resuelve pagando créditos, que es caro pero no es falso.
    """
    api_names, csv_names = sorted(set(api_names)), sorted(set(csv_names))
    puntos = {(a, c): similarity(a, c) for a in api_names for c in csv_names}
    out = Emparejamiento()
    for a in api_names:
        fila = sorted(((puntos[(a, c)], c) for c in csv_names), reverse=True)
        if not fila or fila[0][0] < MIN_SIM:
            out.sin_pareja.append(a)
            continue
        s1, c = fila[0]
        s2 = fila[1][0] if len(fila) > 1 else 0.0
        col = sorted(((puntos[(x, c)], x) for x in api_names), reverse=True)
        mutuo = col[0][1] == a
        margen_col = col[0][0] - (col[1][0] if len(col) > 1 else 0.0)
        if mutuo and s1 - s2 >= MIN_MARGEN and margen_col >= MIN_MARGEN:
            out.alias[a] = c
        else:
            out.sin_pareja.append(a)
            out.dudosos.append((a, c, f"parecido {s1:.2f} frente a {s2:.2f}"))
    return out


@dataclass(frozen=True)
class Cierre:
    """Un partido ya jugado, tal y como lo publica football-data."""
    div: str
    dia: date
    home: str
    away: str
    home_goals: int
    away_goals: int
    close: dict                     # 1X2 / OU25 / AH -> cuotas medias de cierre del mercado


def _f(row: dict, col: str) -> float | None:
    try:
        v = float(str(row.get(col, "")).strip())
    except (TypeError, ValueError):
        return None
    return v if v > 1.0 else None


def parse_rows(text: str, div: str) -> list[Cierre]:
    """CSV de una temporada -> partidos jugados con su cierre. Lo que falta, se deja fuera."""
    out: list[Cierre] = []
    for row in csv.DictReader(io.StringIO(text)):
        if not row.get("HomeTeam") or not row.get("AwayTeam") or not row.get("Date"):
            continue
        try:
            dia = datetime.strptime(row["Date"].strip(), "%d/%m/%Y").date()
            hg, ag = int(row["FTHG"]), int(row["FTAG"])
        except (ValueError, KeyError, TypeError):
            continue
        close: dict = {}
        h, d, a = _f(row, "AvgCH"), _f(row, "AvgCD"), _f(row, "AvgCA")
        if h and d and a:
            close["1X2"] = {"home": h, "draw": d, "away": a}
        o, u = _f(row, "AvgC>2.5"), _f(row, "AvgC<2.5")
        if o and u:
            close["OU25"] = {"over": o, "under": u}
        ah_h, ah_a = _f(row, "AvgCAHH"), _f(row, "AvgCAHA")
        try:
            linea = float(str(row.get("AHCh", "")).strip())
        except (TypeError, ValueError):
            linea = None
        if ah_h and ah_a and linea is not None:
            close["AH"] = {"line": linea, "home": ah_h, "away": ah_a}
        out.append(Cierre(div, dia, row["HomeTeam"].strip(), row["AwayTeam"].strip(), hg, ag, close))
    return out


class FreeCloses:
    """Descarga y cachea las temporadas en curso de football-data.

    Es una fuente publica y gratuita: no gasta creditos del proveedor de cuotas. Se
    cachea porque el fichero de una liga entera cambia unas pocas veces al dia.
    """

    def __init__(self, client=None, ttl_s: float = TTL_S, clock=None):
        self._client = client
        self._ttl = ttl_s
        self._clock = clock or (lambda: datetime.now(UTC))
        self._cache: dict[tuple[str, str], tuple[datetime, list[Cierre]]] = {}
        self._alias: dict[tuple[str, str], Emparejamiento] = {}

    def _get(self, url: str) -> str:
        if self._client is not None:
            return self._client.get(url)
        import httpx
        r = httpx.get(url, headers={"User-Agent": UA}, timeout=30.0, follow_redirects=True)
        r.raise_for_status()
        return r.text

    def rows(self, div: str, season: str) -> list[Cierre]:
        clave = (div, season)
        hit = self._cache.get(clave)
        if hit and (self._clock() - hit[0]).total_seconds() < self._ttl:
            return hit[1]
        try:
            filas = parse_rows(self._get(f"{BASE}/{season}/{div}.csv"), div)
        except Exception:              # si esta fuente falla, ese cierre se paga con creditos
            return hit[1] if hit else []
        self._cache[clave] = (self._clock(), filas)
        return filas

    def alias(self, div: str, season: str, api_names) -> Emparejamiento:
        """Traduccion de nombres de esa liga, calculada una vez y cacheada."""
        clave = (div, season)
        filas = self.rows(div, season)
        nombres = {r.home for r in filas} | {r.away for r in filas}
        emp = self._alias.get(clave)
        if emp is None or set(api_names) - set(emp.alias) - set(emp.sin_pareja):
            emp = match_teams(api_names, nombres)
            self._alias[clave] = emp
        return emp

    def find(self, div: str, cuando: date, home: str, away: str, api_names=None) -> Cierre | None:
        """El partido de football-data que corresponde a uno del proveedor de cuotas.

        Exige que los DOS equipos tengan traduccion sin dudas y que la fecha cuadre con
        un dia de margen (husos horarios). Si no, devuelve None y el partido se cierra
        pagando creditos: mejor caro que equivocado.
        """
        season = season_code(cuando)
        emp = self.alias(div, season, [*(api_names or []), home, away])
        h, a = emp.alias.get(home), emp.alias.get(away)
        cerca = [r for r in self.rows(div, season) if abs((r.dia - cuando).days) <= 1]
        if h and a:
            for r in cerca:
                if r.home == h and r.away == a:
                    return r
            return None
        if not h and not a:
            return None
        # Uno de los dos sin traducir (Wolves, M'gladbach, PSG...): se deduce POR EL PARTIDO,
        # y solo si en esa fecha hay UNA sola posibilidad y el nombre se parece algo. Deducir
        # con ambigüedad seria liquidar con el resultado de otro partido.
        posibles = [r for r in cerca if (r.home == h if h else r.away == a)]
        libres = [r for r in posibles if (r.away if h else r.home) not in set(emp.alias.values())]
        if len(libres) != 1:
            return None
        r = libres[0]
        falta, candidato = (away, r.away) if h else (home, r.home)
        if similarity(falta, candidato) < 0.45:
            return None
        emp.alias[falta] = candidato            # aprendido: la proxima vez ya no hace falta deducir
        return r
