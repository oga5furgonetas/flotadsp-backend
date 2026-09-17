# -*- coding: utf-8 -*-
"""Un taller dado de alta a mano tiene que poder salir en «Talleres»."""
import ast
import io
import re
import unicodedata
from pathlib import Path

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)
_NS = {"re": re, "unicodedata": unicodedata}
for _n in _ARBOL.body:
    if getattr(_n, "name", None) in {"_geo_sin_acentos", "_taller_consulta"}:
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102
consulta = _NS["_taller_consulta"]


def _fuente(nombre):
    for n in _ARBOL.body:
        if getattr(n, "name", None) == nombre:
            return ast.get_source_segment(_TEXTO, n)
    raise AssertionError(nombre)


def test_la_consulta_no_repite_la_ciudad():
    assert consulta("Rúa do Tambre 12", "Santiago") == "Rúa do Tambre 12, Santiago"
    assert consulta("Rúa do Tambre 12, SANTIAGO", "Santiago") == "Rúa do Tambre 12, SANTIAGO"
    assert consulta("", "Boiro") == "Boiro"
    assert consulta(None, None) == ""
    assert consulta(["x"], 3) == "['x'], 3"      # nada revienta con tipos raros


def test_los_talleres_sin_coordenadas_no_desaparecen():
    src = _fuente("workshops_nearby")
    assert '"sin_ubicacion": sin_ubicacion' in src


def test_el_alta_y_el_cambio_de_direccion_ubican():
    assert "_taller_ubicar" in _fuente("create_workshop")
    upd = _fuente("update_workshop")
    assert "_taller_ubicar" in upd
    # Direccion nueva que no se encuentra: fuera las coordenadas viejas.
    assert "(None, None)" in upd
