# -*- coding: utf-8 -*-
"""Una entrada en taller deja UNA incidencia, no dos."""
import ast
import io
import re
from pathlib import Path

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)
_NS = {"re": re}
for _n in _ARBOL.body:
    if getattr(_n, "name", None) == "_es_incidencia_de_taller":
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102
es_taller = _NS["_es_incidencia_de_taller"]


def _fuente(nombre):
    for n in _ARBOL.body:
        if getattr(n, "name", None) == nombre:
            return ast.get_source_segment(_TEXTO, n)
    raise AssertionError(nombre)


def test_reconoce_el_titulo_que_pone_el_panel():
    assert es_taller("Vehículo en taller — 0068 MYS")
    assert es_taller("vehiculo en taller - 9886NFX")
    assert es_taller("  Vehículo en taller")
    assert not es_taller("Carter roto")
    assert not es_taller(None) and not es_taller("")


def test_la_del_motivo_se_funde_con_la_automatica():
    """El panel cambia el estado (sale la automatica) y un segundo despues
    manda la del motivo: eran dos abiertas por entrada (9 parejas)."""
    src = _fuente("create_incident")
    i_funde = src.index("_es_incidencia_de_taller(incident.title)")
    i_inserta = src.index("insert_one(")
    assert i_funde < i_inserta, "la fusion tiene que ir ANTES de insertar"
    assert '"auto_created": False' in src     # con motivo ya no se cierra sola
    assert '"reopened_at"' in src             # tambien si se acaba de reabrir
    assert 'user["role"] != "driver"' in src  # un conductor no toca la de la oficina
