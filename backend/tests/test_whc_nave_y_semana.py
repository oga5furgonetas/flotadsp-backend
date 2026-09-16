# -*- coding: utf-8 -*-
"""De que NAVE y de que SEMANA es un plan de horas.

LAS DOS COSAS SE HICIERON MAL PRIMERO, y los dos fallos son de los que no dan
error: archivan el plan en el sitio equivocado y ahi se queda, con pinta de
correcto, hasta que alguien se pasa de horas y nadie le avisa.

  · LA NAVE. La primera version buscaba el codigo en TODO el texto. Probado con
    el plan real de DGA1 (9.838 caracteres) dedujo **OGA5**: ese codigo sale
    nueve veces dentro de la tabla porque es la nave DE CADA BLOQUE, no la del
    plan — gente de DGA1 haciendo bloques en OGA5. Solo vale la CABECERA, lo que
    va antes del primer dia.

  · LA SEMANA. Se guardaba con la semana de HOY. Asi que pegar el plan de la
    semana pasada lo archivaba como el de esta y pisaba el bueno: el documento
    «DGA1 semana 2026-09-13» es en realidad el del 06, segun su propia cabecera,
    pegado el dia 14.

Los dos casos de abajo son texto REAL de produccion, recortado.
"""
import ast
import io
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_TEXTO = io.open(RAIZ / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)


def _cargar(*nombres):
    import datetime as _dt
    amb = {"re": re, "datetime": _dt.datetime, "timezone": _dt.timezone}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_WHC_DIAS":
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
        if isinstance(n, ast.FunctionDef) and n.name in nombres:
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
    faltan = [x for x in nombres if x not in amb]
    assert not faltan, "no se han cargado: %s" % faltan
    return [amb[x] for x in nombres]


SEMANA, ES_DIA = _cargar("_whc_semana_del_plan", "_whc_linea_de_dia")

# El plan tal y como llega de Cortex CON cabecera (el que entra solo).
CON_CABECERA = """2
Programación
Opciones
Editar asignación de ruta
OGA5
Ir a esta semana

Semana 38:

sep. 13 - sep. 19, 2026

dom., sep. 13

lun., sep. 14

Alvaro Fontenla Macarrilla

OGA5

14h 30m / 25h
"""

# El plan de DGA1 tal y como esta guardado: empieza mas abajo, SIN cabecera, y
# con «OGA5» dentro de la tabla nueve veces.
SIN_CABECERA = """
Buscar asociados
dom., sep. 06


lun., sep. 07


ALVARO FONTENLA MACARRILLA

OGA5

ESTÁNDAR

14H 30M / 25H

STANDARD PARCEL

OGA5
"""


def test_la_nave_sale_de_la_cabecera_y_no_de_la_tabla():
    """El codigo que hay DENTRO de la tabla es la nave de cada bloque, no la del
    plan. Confundirlos archiva el plan de una nave en la otra."""
    lineas = CON_CABECERA.split(chr(10))
    corte = next((k for k, l in enumerate(lineas) if ES_DIA(l)), 0)
    assert corte > 0, "no encuentra donde empieza la tabla"
    cabecera = chr(10).join(lineas[:corte]).upper()
    assert "OGA5" in cabecera, "la nave esta en la cabecera y no se ve"
    # Y en el pegado SIN cabecera no hay nada antes del primer dia que valga.
    lineas2 = SIN_CABECERA.split(chr(10))
    corte2 = next((k for k, l in enumerate(lineas2) if ES_DIA(l)), 0)
    cab2 = chr(10).join(lineas2[:corte2]).upper()
    assert "OGA5" not in cab2, (
        "el OGA5 de la TABLA se estaria colando como si fuera la nave del plan")


def test_sin_cabecera_no_se_adivina_la_nave():
    """Es el caso real del plan de DGA1: empieza en «Buscar asociados». Mejor no
    guardarlo que guardarlo en la nave que no es."""
    src = None
    for n in ast.walk(_ARBOL):
        if isinstance(n, ast.AsyncFunctionDef) and n.name == "_whc_centro_del_texto":
            src = chr(10).join(_TEXTO.splitlines()[n.lineno - 1:n.end_lineno])
    assert src, "no existe _whc_centro_del_texto"
    assert "if not corte:" in src and 'return ""' in src
    assert "cabecera" in src and "len(vistos) == 1" in src


def test_la_semana_sale_del_plan_y_no_del_reloj():
    """Pegar el plan de la semana pasada NO puede pisar el de esta."""
    assert SEMANA(CON_CABECERA) == "2026-09-13"
    assert SEMANA(SIN_CABECERA) == "2026-09-06", (
        "el plan del dia 6 se archivaria como el de la semana en curso")


def test_el_primer_dia_del_plan_es_su_domingo():
    """La semana de Amazon va de domingo a sabado."""
    from datetime import date
    for txt, esperado in ((CON_CABECERA, "2026-09-13"), (SIN_CABECERA, "2026-09-06")):
        d = date.fromisoformat(SEMANA(txt))
        assert d.weekday() == 6, "%s no es domingo" % d


def test_un_texto_sin_dias_no_inventa_semana():
    assert SEMANA("Programación\\nOpciones\\nOGA5") == ""
    assert SEMANA("") == ""
