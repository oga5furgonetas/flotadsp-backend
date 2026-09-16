# -*- coding: utf-8 -*-
"""Importar candidatos desde una tabla cualquiera, no solo desde la ETT de Dani.

El importador entendia UN formato: el listado de la web de la ETT. Otra empresa
—otra ETT, su propio Excel, un CSV— pegaba su lista y recibia «No he reconocido
ninguna ficha» (medido el 16-09-2026 con una empresa recien creada).
"""
import ast
import io
import re
from pathlib import Path

TXT = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()


def _tabla():
    """Las funciones reales, sacadas del fichero (gotcha 40)."""
    amb = {"re": re, "_centro_norm": lambda c: str(c or "").strip().upper()}
    for n in ast.parse(TXT).body:
        nombre = getattr(n, "name", None) or (
            n.targets[0].id if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) else None)
        if nombre in ("_ONB_COLUMNAS", "_onb_sin_tildes", "_onb_tel_limpio", "_onb_parsear_tabla"):
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<server>", "exec"), amb)  # noqa: S102
    return amb["_onb_parsear_tabla"]


EXCEL = ("Nombre completo\tTeléfono\tEmail\tNave\tCódigo Test Formación\tFecha formación\tCódigo postal\tContraseña\n"
         "Ana Prueba Uno\t+34 600 111 222\tAna@Ejemplo.es\tSMK1\tAX7PRUEBA1\t10/09/2026\t15701\tsecreta1\n"
         "Luis Prueba Dos\t611222333\tluis@ejemplo.es\tSMK1\t\t\t15702\tsecreta2\n"
         "Sin Contacto\t\tnadie@ejemplo.es\tSMK1\t\t\t15703\t\n")


def test_una_tabla_pegada_de_excel_entra():
    r = _tabla()(EXCEL)
    assert [p["nombre"] for p in r["filas"]] == ["Ana Prueba Uno", "Luis Prueba Dos"]
    ana = r["filas"][0]
    assert ana["telefono"] == "600111222"
    assert ana["email"] == "ana@ejemplo.es"
    assert ana["centro"] == "SMK1"
    assert ana["codigo_formacion"] == "AX7PRUEBA1"
    assert ana["fecha_formacion"] == "2026-09-10"


def test_sin_telefono_ni_dni_no_se_guarda_y_se_cuenta():
    """`_onb_clave` usa DNI o telefono: sin ninguno, todas esas filas acabarian
    siendo la MISMA persona."""
    r = _tabla()(EXCEL)
    assert r["sin_clave"] == 1
    assert all(p.get("telefono") or p.get("dni") for p in r["filas"])


def test_la_fila_solo_lleva_las_columnas_que_trae():
    """El guardado pisa con lo que llega: un `falta_texto` o un `ett` vacios
    borrarian lo que ya sabia el listado de la ETT."""
    r = _tabla()(EXCEL)
    for p in r["filas"]:
        assert "falta_texto" not in p and "estado" not in p and "ett" not in p and "registrado" not in p


def test_las_contrasenas_no_se_leen_de_una_tabla():
    r = _tabla()(EXCEL)
    for p in r["filas"]:
        assert "clave_email" not in p and "clave_rabbit" not in p
        assert "secreta" not in repr(p)


def test_el_codigo_postal_no_es_el_codigo_de_formacion():
    r = _tabla()(EXCEL)
    assert r["filas"][1].get("codigo_formacion", "") == ""
    assert "15701" not in repr(r["filas"][0].get("codigo_formacion"))


def test_csv_con_punto_y_coma_y_comillas():
    csv = 'Nombre;DNI;Movil\n"Prueba, Ana";12345678Z;600 111 222\n'
    r = _tabla()(csv)
    assert r["filas"] == [{"nombre": "Prueba, Ana", "dni": "12345678Z", "telefono": "600111222"}]


def test_sin_columna_de_nombre_no_es_una_lista_de_candidatos():
    r = _tabla()("Matricula\tMarca\n1234ABC\tFord\n")
    assert r["filas"] == []


def test_el_endpoint_prueba_la_tabla_cuando_no_es_el_listado_de_la_ett():
    i = TXT.index("async def onb_importar")
    cuerpo = TXT[i:TXT.index("\n@api_router", i)]
    assert "_onb_parsear_tabla(texto)" in cuerpo
    assert cuerpo.index("_onb_parsear(texto)") < cuerpo.index("_onb_parsear_tabla(texto)"), (
        "el listado de la ETT tiene que seguir mandando: trae contraseñas y estados que una tabla no")
