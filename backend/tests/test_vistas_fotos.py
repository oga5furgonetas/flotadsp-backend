# -*- coding: utf-8 -*-
"""El «antes / después» compara cada foto con SU misma vista."""
import ast
import io
import re
from pathlib import Path
from typing import Optional

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)
_NS = {"re": re, "Optional": Optional}
for _n in _ARBOL.body:
    _nombre = getattr(_n, "name", None) or (
        getattr(_n.targets[0], "id", None) if isinstance(_n, ast.Assign) else None)
    if _nombre in {"_VISTAS_CARROCERIA", "_vista_de_fichero", "_vistas_inspeccion"}:
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102
vista = _NS["_vista_de_fichero"]
vistas = _NS["_vistas_inspeccion"]


def _fuente(nombre):
    for n in _ARBOL.body:
        if getattr(n, "name", None) == nombre:
            return ast.get_source_segment(_TEXTO, n)
    raise AssertionError(nombre)


def test_la_vista_sale_del_nombre_que_pone_el_portal():
    assert vista("angle_0_frontal.jpg") == "frontal"
    assert vista("ANGLE_3_LATERAL_DER.JPG") == "lateral_der"
    assert vista("odometro.jpg") == "odometro"
    assert vista("checklist_rueda_repuesto.jpg") == "checklist:rueda_repuesto"
    assert vista("angle_9_otra.jpg") is None
    assert vista("IMG_2024.jpg") is None and vista(None) is None


def test_las_antiguas_se_reconstruyen_por_el_orden():
    insp = {"photos": list("abcde"), "photo_roles": ["angle"] * 4 + ["odometer"]}
    assert vistas(insp) == ["frontal", "trasera", "lateral_izq", "lateral_der", "odometro"]
    # Las guardadas mandan.
    guardadas = ["trasera", "frontal", None]
    assert vistas({"photos": list("abc"), "photo_vistas": guardadas}) == guardadas


def test_sin_orden_fiable_no_se_adivina():
    assert vistas({"photos": list("abcd")}) == [None] * 4                         # sin roles
    assert vistas({"photos": list("abcdef"), "photo_roles": ["angle"] * 6}) == [None] * 6
    assert vistas({"photos": list("ab"), "photo_roles": ["angle"]}) == [None] * 2  # no cuadra


def test_nadie_empareja_ya_por_posicion():
    """Guardar «las dos primeras» hacia comparar el lateral con la frontal."""
    assert "ref_photo_urls[:2]" not in _TEXTO
    assert "_referencias_por_vista" in _fuente("reanalyze_inspection") \
        if "def reanalyze_inspection" in _TEXTO else True
    web = io.open(Path(__file__).resolve().parents[2] / "frontend-v2" / "src" / "panel" / "pages"
                  / "RevisionRapida.jsx", encoding="utf-8").read()
    assert "reference_photos?.[0]" not in web and "refs[0]" not in web
