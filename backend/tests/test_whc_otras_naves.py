# -*- coding: utf-8 -*-
"""El plan de horas de una nave que no se llama OGA5, DGA1 ni DGA2.

El pegado del plan pone, debajo de cada nombre, el codigo de la nave donde se
trabajo el bloque (en un plan de DGA1 aparece OGA5). El filtro de ruido solo
conocia esas tres, asi que con cualquier otra —DIC1, una nave nueva, otra
empresa— esa linea se leia como una PERSONA. Medido el 16-09-2026 sobre los 15
planes guardados: en 13 salia un conductor fantasma con el nombre de la nave.
El arreglo se comprobo contra esos 15: para las naves de Dani la salida es
identica campo a campo.
"""
import ast
import io
import re
from pathlib import Path

TXT = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()


def _parsear():
    """`_whc_parsear` y lo que usa, sacados del fichero real (gotcha 40)."""
    arbol = ast.parse(TXT)
    amb = {"re": re}
    for n in arbol.body:
        nombre = getattr(n, "name", None) or (
            n.targets[0].id if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) else None)
        if nombre in ("_WHC_TIPOS", "_whc_minutos", "_whc_dur", "_whc_parsear"):
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<server>", "exec"), amb)  # noqa: S102
    return amb["_whc_parsear"]


# Con la forma del pegado real, nombres inventados.
_PLAN = """Ana Prueba Uno
{nave}
Estándar
35h 44m / 36h 30m

11:16am - 8:16pm
Standard Parcel

Luis Prueba Dos
{nave}
Estándar
20h 10m / 36h 30m

9:00am - 7:10pm
Standard Parcel
"""


def test_la_nave_de_dani_no_cambia():
    gente = {p["nombre"] for p in _parsear()(_PLAN.format(nave="OGA5"))}
    assert gente == {"Ana Prueba Uno", "Luis Prueba Dos"}


def test_otra_nave_no_crea_un_conductor_fantasma():
    for nave in ("DIC1", "MAD4", "SMK1", "BCN12"):
        gente = {p["nombre"] for p in _parsear()(_PLAN.format(nave=nave))}
        assert gente == {"Ana Prueba Uno", "Luis Prueba Dos"}, (
            "con la nave %s sale un conductor que no existe: %s" % (nave, sorted(gente)))


def test_un_nombre_de_verdad_sigue_siendo_una_persona():
    """La forma que se descarta es letras pegadas a un numero: un nombre con
    espacios, o sin numeros, tiene que seguir entrando."""
    texto = _PLAN.format(nave="OGA5").replace("Luis Prueba Dos", "EVA")
    gente = {p["nombre"] for p in _parsear()(texto)}
    assert "EVA" in gente
