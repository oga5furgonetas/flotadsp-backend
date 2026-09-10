"""Resolución de nombres de equipo entre fuentes.

The Odds API dice "Atletico Madrid" / "Real Betis"; football-data.co.uk dice
"Ath Madrid" / "Betis". Sin reconciliar, se comparan como equipos distintos
(hallazgo F5 de la auditoría). Estrategia:

1. exacto
2. alias conocido (tabla curada, canónico = forma de football-data.co.uk)
3. normalizado exacto (sin acentos, sin sufijos FC/CF, minúsculas)
4. coincidencia aproximada (difflib) con umbral alto

Devuelve `None` si no hay match fiable: es preferible NO comparar a comparar mal.
"""

from __future__ import annotations

import difflib
import re
import unicodedata

# canónico = clave de football-data.co.uk (donde viven las valoraciones)
_ALIASES: dict[str, str] = {
    # La Liga
    "atletico madrid": "Ath Madrid",
    "atletico de madrid": "Ath Madrid",
    "club atletico de madrid": "Ath Madrid",
    "athletic bilbao": "Ath Bilbao",
    "athletic club": "Ath Bilbao",
    "athletic club bilbao": "Ath Bilbao",
    "real betis": "Betis",
    "real betis balompie": "Betis",
    "real sociedad": "Sociedad",
    "rayo vallecano": "Vallecano",
    "celta vigo": "Celta",
    "celta de vigo": "Celta",
    "rc celta": "Celta",
    "espanyol": "Espanol",
    "rcd espanyol": "Espanol",
    "deportivo alaves": "Alaves",
    "cd leganes": "Leganes",
    "ud las palmas": "Las Palmas",
    "real valladolid": "Valladolid",
    "fc barcelona": "Barcelona",
    "barca": "Barcelona",
    "girona fc": "Girona",
    "valencia cf": "Valencia",
    "getafe cf": "Getafe",
    "villarreal cf": "Villarreal",
    "sevilla fc": "Sevilla",
    "ca osasuna": "Osasuna",
    "rcd mallorca": "Mallorca",
    "real madrid cf": "Real Madrid",
    "ud almeria": "Almeria",
    "granada cf": "Granada",
    "cadiz cf": "Cadiz",
    # Premier League (formas de The Odds API -> football-data.co.uk)
    "manchester united": "Man United",
    "manchester city": "Man City",
    "newcastle united": "Newcastle",
    "tottenham hotspur": "Tottenham",
    "wolverhampton wanderers": "Wolves",
    "brighton and hove albion": "Brighton",
    "nottingham forest": "Nott'm Forest",
    "sheffield united": "Sheffield United",
    "west ham united": "West Ham",
    "afc bournemouth": "Bournemouth",
    "luton town": "Luton",
    "leicester city": "Leicester",
    "ipswich town": "Ipswich",
}

_SUFFIXES = (" fc", " cf", " sc", " ac", " sad", " cp")
_PREFIXES = ("fc ", "cf ", "afc ", "ss ", "sd ")


def normalize(name: str) -> str:
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = re.sub(r"[.\-_/]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    for p in _PREFIXES:
        if s.startswith(p):
            s = s[len(p):]
    for suf in _SUFFIXES:
        if s.endswith(suf):
            s = s[: -len(suf)]
    return s.strip()


def resolve(name: str, known: set[str], *, cutoff: float = 0.86) -> str | None:
    if not name:
        return None
    if name in known:
        return name

    n = normalize(name)
    if n in _ALIASES and _ALIASES[n] in known:
        return _ALIASES[n]

    norm_known = {normalize(k): k for k in known}
    if n in norm_known:
        return norm_known[n]

    # alias apunta a un canónico cuyo normalizado está entre los conocidos
    if n in _ALIASES:
        cn = normalize(_ALIASES[n])
        if cn in norm_known:
            return norm_known[cn]

    match = difflib.get_close_matches(n, list(norm_known), n=1, cutoff=cutoff)
    if match:
        return norm_known[match[0]]
    return None


def resolve_pair(
    home: str, away: str, known: set[str], **kw
) -> tuple[str | None, str | None]:
    return resolve(home, known, **kw), resolve(away, known, **kw)
