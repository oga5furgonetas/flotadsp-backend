# -*- coding: utf-8 -*-
"""Deposito declarado y km iguales a los de otro dia."""
import ast
import io
from pathlib import Path
from typing import Optional

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_NS = {"Optional": Optional}
for _n in ast.parse(_TEXTO).body:
    _nombre = getattr(_n, "name", None) or (
        getattr(_n.targets[0], "id", None) if isinstance(_n, ast.Assign) else None)
    if _nombre in {"_COMBUSTIBLE_NIVELES", "_COMBUSTIBLE_AVISO_BAJO", "_combustible_nivel",
                   "_combustible_texto", "_km_repetido", "_VISTAS_CARROCERIA",
                   "_vista_de_fichero", "_vistas_inspeccion"}:
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102
import re  # noqa: E402
_NS["re"] = re
nivel, repetido = _NS["_combustible_nivel"], _NS["_km_repetido"]


def test_solo_niveles_del_portal():
    assert [nivel(x) for x in (10, "25", 50, 75, "100")] == [10, 25, 50, 75, 100]
    for malo in (None, "", "medio", 30, 0, 101, True, [], {}):
        assert nivel(malo) is None
    # Por debajo de la mitad avisa; la mitad justa no.
    assert _NS["_COMBUSTIBLE_AVISO_BAJO"] == 50 and 25 < 50 and not (50 < 50)


def test_km_iguales_a_otro_dia():
    hist = [{"date": "2026-09-15T18:00:00+00:00", "km": 37000},
            {"date": "2026-09-16T19:40:00+00:00", "km": 37143}]
    assert repetido(hist, 37143, "2026-09-17") == "2026-09-16"
    assert repetido(hist, 37200, "2026-09-17") is None        # se ha movido
    assert repetido(hist, 37143, "2026-09-16") is None        # mismo dia: no es sospechoso
    assert repetido([], 100, "2026-09-17") is None
    assert repetido(hist, "basura", "2026-09-17") is None
    assert repetido([{"date": "2026-09-16", "km": None}], 5, "2026-09-17") is None


def test_la_foto_del_deposito_no_entra_en_el_analisis_de_danos():
    assert _NS["_vista_de_fichero"]("combustible.jpg") == "combustible"
    vis = _NS["_vistas_inspeccion"]({"photos": list("abcdef"),
                                     "photo_roles": ["angle"] * 4 + ["odometer", "fuel"]})
    assert vis[-2:] == ["odometro", "combustible"] and vis[:4] == list(_NS["_VISTAS_CARROCERIA"])
    assert 'else "fuel" if _fn.startswith("combustible")' in _TEXTO
