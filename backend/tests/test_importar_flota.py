# -*- coding: utf-8 -*-
"""Importar la flota: lo que trae el fichero, por centro, antes de importar.

Se ejecuta el codigo REAL de server.py sacado con `ast` (gotcha 40).
"""
import ast
import io
import re
from datetime import datetime
from pathlib import Path

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_NS = {"re": re, "datetime": datetime}
_QUIERO = {"_CENTRO_RE", "_VEH_COLUMNAS", "_centro_norm", "_grupos_por_centro", "_veh_sin_tildes", "_veh_clave",
           "_veh_fecha", "_veh_matricula", "_veh_columnas", "_veh_fila", "_veh_centro_de", "_veh_agrupar"}
for _n in ast.parse(_TEXTO).body:
    _nombre = getattr(_n, "name", None) or (
        getattr(_n.targets[0], "id", None) if isinstance(_n, ast.Assign) else None)
    if _nombre in _QUIERO:
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102
G = _NS


def test_la_matricula_se_compara_sin_espacios_ni_guiones():
    assert G["_veh_clave"]("1234-abc") == G["_veh_clave"]("1234 ABC") == "1234ABC"
    assert G["_veh_clave"](None) == ""


def test_fechas_de_excel_y_de_texto():
    f = G["_veh_fecha"]
    assert f("17/09/2026") == "2026-09-17"
    assert f("2026-09-17") == "2026-09-17"
    assert f("17-09-26") == "2026-09-17"
    assert f(datetime(2026, 9, 17, 10, 0)) == "2026-09-17"
    assert f("") is None and f("mañana") is None


def test_columnas_con_tildes_y_nombres_distintos():
    cols = G["_veh_columnas"](["Matrícula", "CENTRO", "Kilometraje", "Nº Bastidor", "Otra"])
    assert cols == {"license_plate": 0, "center": 1, "mileage": 2, "vin": 3}


def test_una_fila_se_limpia_y_no_inventa():
    cols = G["_veh_columnas"](["Matricula", "Centro", "Km", "VIN", "Año", "ITV"])
    f = G["_veh_fila"](cols, ("1234 abc", " AMZL OGA5 SANTIAGO XPT ", "25.300", "corto", "2023", "01/02/2027"))
    assert f["plate"] == "1234 ABC"
    assert f["centro_texto"] == "AMZL OGA5 SANTIAGO XPT"
    assert f["campos"] == {"mileage": 25300, "year": 2023, "itv_date": "2027-02-01"}
    # km imposible y fila corta no revientan
    f = G["_veh_fila"](cols, ("9999 ZZZ", "", "1880404"))
    assert "mileage" not in f["campos"] and f["centro_texto"] == ""


def test_el_centro_se_lee_como_codigo():
    c = G["_veh_centro_de"]
    # con la empresa ya dada de alta: solo codigos suyos
    assert c("AMZL OGA5 SANTIAGO XPT", {"OGA5", "DGA1"}) == "OGA5"
    assert c("oga5", {"OGA5"}) == "OGA5"
    assert c("AMZL DQA3 LUGO", {"OGA5"}) == "DQA3"      # sugerencia, sin ser suyo
    assert c("Santiago", {"OGA5"}) == ""                  # no se adivina
    assert c("OGA5 / DGA1", {"OGA5", "DGA1"}) == ""       # dos codigos: no se elige
    # empresa sin centros todavia
    assert c("AMZL XYZ1 CIUDAD", set()) == "XYZ1"
    assert c("", {"OGA5"}) == ""


def test_la_vista_previa_reparte_por_centro_y_cuenta_bien():
    filas = [
        {"plate": "1111 AAA", "centro_texto": "AMZL OGA5 SANTIAGO XPT", "campos": {}},
        {"plate": "1111-AAA", "centro_texto": "AMZL OGA5 SANTIAGO XPT", "campos": {}},  # repetida
        {"plate": "2222 BBB", "centro_texto": "AMZL OGA5 SANTIAGO XPT", "campos": {}},
        {"plate": "3333 CCC", "centro_texto": "AMZL DQA3 LUGO", "campos": {}},
        {"plate": "", "centro_texto": "AMZL OGA5", "campos": {}},
        {"plate": "4444 DDD", "centro_texto": "", "campos": {}},
    ]
    r = G["_veh_agrupar"](filas, {"1111AAA"}, {"OGA5"})
    assert r["sin_matricula"] == 1 and r["repetidas"] == 1 and r["matriculas"] == 4
    por = {g["clave"]: g for g in r["centros"]}
    oga = por["AMZL OGA5 SANTIAGO XPT"]
    assert (oga["sugerido"], oga["conocido"], oga["filas"], oga["nuevas"], oga["ya_estan"]) == \
        ("OGA5", True, 2, 1, 1)
    assert por["AMZL DQA3 LUGO"]["conocido"] is False and por["AMZL DQA3 LUGO"]["sugerido"] == "DQA3"
    # las filas sin centro van al final, nunca se pierden
    assert r["centros"][-1]["clave"] == "" and r["centros"][-1]["filas"] == 1
    # la suma cuadra con las matriculas (gotcha 30)
    assert sum(g["filas"] for g in r["centros"]) == r["matriculas"]


def test_la_matricula_nueva_se_guarda_de_una_sola_forma():
    m = G["_veh_matricula"]
    assert m("1111-xyz") == m("1111XYZ") == m(" 1111  xyz ") == "1111 XYZ"
    assert m("pt-12-ab") == "PT 12 AB"          # extranjera: sin inventar formato
