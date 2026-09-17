# -*- coding: utf-8 -*-
"""Que pantallas ve cada empresa (Negocio -> Clientes -> Modulos)."""
import ast
import io
from pathlib import Path
from typing import Optional

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_NS = {"Optional": Optional}
_QUIERO = {"MODULOS_PANEL", "_MODULOS_CLAVES", "MODULOS_ESTANDAR", "_MODULOS_FIJOS",
           "org_modulos", "_modulos_modo"}
for _n in ast.parse(_TEXTO).body:
    _nombre = getattr(_n, "name", None) or (
        getattr(_n.targets[0], "id", None) if isinstance(_n, ast.Assign) else None)
    if _nombre in _QUIERO:
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102
mods = _NS["org_modulos"]
TODAS = _NS["_MODULOS_CLAVES"]


def test_la_de_dani_y_la_demo_lo_ven_todo():
    assert mods({"account_type": "owner"}) is None
    assert mods({"id": "demo", "account_type": "dsp"}) is None
    assert mods({"account_type": "dsp", "modulos": "todos"}) is None
    # Y en Negocio salen como «Todo», no como «Estandar · 0».
    assert _NS["_modulos_modo"]({"id": "demo", "account_type": "dsp"}) == "todos"


def test_una_empresa_nueva_ve_el_estandar():
    vistos = mods({"account_type": "dsp"})
    assert set(vistos) == set(_NS["MODULOS_ESTANDAR"]) | set(_NS["_MODULOS_FIJOS"])
    assert "ia-peritaje" not in vistos and "paquetes" not in vistos
    assert mods({"account_type": "dsp", "modulos": "estandar"}) == vistos


def test_a_medida_no_quita_lo_fijo_ni_deja_colar_claves_raras():
    vistos = mods({"account_type": "dsp", "modulos": ["empleo", "no-existe"]})
    assert vistos == [k for k in TODAS if k in {"empleo", "dashboard", "configuracion"}]
    # Una lista vacia es «nada mas que lo fijo», no «todo».
    assert mods({"account_type": "dsp", "modulos": []}) == ["dashboard", "configuracion"]
