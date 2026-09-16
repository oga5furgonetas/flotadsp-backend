# -*- coding: utf-8 -*-
"""Cuantos centros puede tener una empresa: lo decide su plan."""
import ast
import io
import re
from pathlib import Path

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_NS = {"re": re}
for _n in ast.parse(_TEXTO).body:
    _nombre = getattr(_n, "name", None) or (
        getattr(_n.targets[0], "id", None) if isinstance(_n, ast.Assign) else None)
    if _nombre in {"_LIM_OPERACION", "_LIM_COMPLETO", "PLAN_LIMITS", "PLAN_DEFAULT", "_SIN_TOPE",
                   "_tope_centros", "_centros_de_texto"}:
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102
tope, texto = _NS["_tope_centros"], _NS["_centros_de_texto"]


def test_el_plan_completo_no_tiene_tope_aunque_se_guardara_uno():
    """El registro guardaba max_centers=1 a todos: el plan Completo no podia
    dar de alta su segunda nave."""
    assert tope({"plan": "completo", "max_centers": 1}) >= 100
    assert tope({"plan": None, "max_centers": 1}) >= 100      # prueba sin plan elegido
    assert tope({"plan": "operacion", "max_centers": 1}) == 1


def test_el_super_admin_puede_ampliar_pero_nadie_recorta_el_plan():
    assert tope({"plan": "operacion", "max_centers": 3}) == 3
    assert tope({"plan": "operacion", "max_centers": "basura"}) == 1


def test_varios_centros_escritos_de_una_vez():
    assert texto("oga5, DGA1 ; dga2") == ["OGA5", "DGA1", "DGA2"]
    assert texto("OGA5,OGA5") == ["OGA5"]
    assert texto("") == [] and texto(None) == []
    assert texto("Nave  Sur") == ["NAVE SUR"]
