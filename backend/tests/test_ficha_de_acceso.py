# -*- coding: utf-8 -*-
"""Con varias fichas del mismo correo, el conductor entra en la ACTIVA."""
import ast
import io
from pathlib import Path
from typing import Optional

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)
_NS = {"Optional": Optional}
for _n in _ARBOL.body:
    if getattr(_n, "name", None) == "_elegir_ficha":
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102
elegir = _NS["_elegir_ficha"]


def _fuente(nombre):
    for n in _ARBOL.body:
        if getattr(n, "name", None) == nombre:
            return ast.get_source_segment(_TEXTO, n)
    raise AssertionError(nombre)


def test_el_caso_de_araceli():
    """Cuatro fichas, tres de baja: la de baja mas antigua salia la primera."""
    fichas = [
        {"id": "baja-ago04", "active": False, "created_at": "2026-08-04T06:59"},
        {"id": "baja-ago18a", "active": False, "created_at": "2026-08-18T11:16"},
        {"id": "baja-ago18b", "active": False, "created_at": "2026-08-18T11:17"},
        {"id": "activa", "active": True, "created_at": "2026-08-29T14:05"},
    ]
    assert elegir(fichas)["id"] == "activa"
    assert elegir(list(reversed(fichas)))["id"] == "activa"


def test_varias_activas_manda_la_mas_reciente_y_sin_activo_cuenta_como_activa():
    assert elegir([{"id": "a", "created_at": "2026-01"},
                   {"id": "b", "active": True, "created_at": "2026-05"}])["id"] == "b"
    assert elegir([{"id": "vieja", "active": False, "created_at": "2026-09"},
                   {"id": "sin_campo", "created_at": "2026-01"}])["id"] == "sin_campo"
    assert elegir([]) is None and elegir([{"active": True}]) is None


def test_el_login_y_la_subida_usan_la_regla():
    assert "_ficha_por_correo(email)" in _fuente("driver_lookup")
    assert "_ficha_activa_de(" in _fuente("get_current_user")
    assert '"$in": list(mis_ids)' in _fuente("upload_inspection_photos")
