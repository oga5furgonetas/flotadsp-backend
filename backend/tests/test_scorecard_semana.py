# -*- coding: utf-8 -*-
"""La semana en vivo de la scorecard: una sola nota, y numeros que se entienden."""
import ast
import io
import math
from pathlib import Path

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)
_NS = {"math": math}
for _n in _ARBOL.body:
    if getattr(_n, "name", None) == "_sc_fallos_de_mas":
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102
de_mas = _NS["_sc_fallos_de_mas"]


def _fuente(nombre):
    for n in _ARBOL.body:
        if getattr(n, "name", None) == nombre:
            return ast.get_source_segment(_TEXTO, n)
    raise AssertionError(nombre)


def test_fallos_de_mas_con_el_volumen_real():
    # 17-09-2026, OGA5: 18.074 entregados y 742 fallos contra Fantastic 98 %.
    assert de_mas(18074, 742, 98.0) == 366
    assert de_mas(18074, 300, 98.0) == 0          # dentro de lo permitido
    assert de_mas(0, 0, 98.0) == 0
    assert de_mas(100, 5, None) == 0 and de_mas(100, 5, "x") == 0


def test_la_semana_en_vivo_solo_suma_dias_cerrados():
    """Sumando el dia abierto, la misma semana salia con 96,68 % en un bloque y
    96,06 % en el otro de la misma pantalla."""
    src = _fuente("scorecard_en_vivo")
    assert 'if rep["cerrado"]:' in src
    bloque = src.split('if rep["cerrado"]:')[1].split("else:")[0]
    assert "entregados" in bloque and "fallos" in bloque


def test_la_referencia_de_calidad_es_la_de_la_nave():
    src = _fuente("cortex_calidad")
    assert "_sc_thresholds" in src
    assert 'float(obj["dcr"]) < referencia["dcr"]' in src
    assert "_dia_negocio()" in src


def test_emparejar_mira_los_dos_campos_del_id():
    """9 personas con el Transporter ID puesto salian «sin ficha» (9.091 paquetes)."""
    src = _fuente("cortex_emparejar")
    assert src.count('"transporter_id": {"$in": list(ids)}') == 1
    assert "_cx_nombres_resumen" in src
    assert "_cx_nombres_resumen" in _fuente("_cx_nombres")
