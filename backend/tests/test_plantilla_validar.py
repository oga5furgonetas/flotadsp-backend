# -*- coding: utf-8 -*-
"""La plantilla diaria se comprueba contra lo que la empresa ya sabe.

Sale de leer capturas con la IA y de vez en cuando se cuela una hora
imposible, un nombre mal leido o una matricula que no existe (Dani,
02-09-2026: "que no tenga errores de hora, nombres o furgonetas").
`_plantilla_validar_filas` caza esos casos ANTES de generar el Excel y
propone la correccion. Se lee del server.py real con `ast` (gotcha 40).

Probado reintroduciendo el fallo: sin la comparacion contra Cortex,
`test_cortex_manda_sobre_el_nombre` falla.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")


def _cargar():
    arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
    quiero = {"_plantilla_validar_filas", "_normalize_name", "_name_tokens", "_match_score",
              "_matricula_norm", "_calc_horas"}
    cuerpo = [n for n in arbol.body if isinstance(n, ast.FunctionDef) and n.name in quiero]
    cuerpo += [n for n in arbol.body if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_HORA_RE"]
    assert len(cuerpo) == 7, "faltan funciones en server.py: %s" % (quiero - {c.name for c in cuerpo if hasattr(c, "name")})
    ns = {}
    exec("import re", ns)
    exec(compile(ast.fix_missing_locations(ast.Module(body=cuerpo, type_ignores=[])), "<server>", "exec"), ns)
    return ns


NS = _cargar()
validar = NS["_plantilla_validar_filas"]
CONDUCTORES = [{"name": "JUAN FRANCISCO VIÑALS PRIMO"}, {"name": "VICTOR ANTELO NIETO"}]
MATRICULAS = {"2832NGX": "2832 NGX", "4455NKC": "4455 NKC"}
CORTEX = {"CA_A30": "JUAN FRANCISCO VINALS PRIMO", "CA_A31": "VICTOR ANTELO NIETO"}


def _tipos(avisos):
    return sorted(a["tipo"] for a in avisos)


def test_fila_perfecta_sin_avisos():
    fila = {"ruta": "CA_A30", "conductor": "Juan Francisco Viñals Primo", "furgo": "2832 NGX",
            "h_salida": "11:50", "h_llegada": "11:20", "h_bajada": "11:40"}
    assert validar([fila], CONDUCTORES, MATRICULAS, CORTEX) == []


def test_cortex_manda_sobre_el_nombre():
    fila = {"ruta": "CA_A30", "conductor": "VICTOR ANTELO NIETO", "furgo": "2832 NGX", "h_salida": "11:50"}
    avisos = validar([fila], CONDUCTORES, MATRICULAS, CORTEX)
    assert "ruta_cortex" in _tipos(avisos)
    assert any(a["sugerencia"] == "JUAN FRANCISCO VINALS PRIMO" for a in avisos)


def test_nombre_mal_leido_se_sugiere():
    fila = {"ruta": "", "conductor": "JUAN FRANCISC VINALS", "furgo": "", "h_salida": ""}
    avisos = validar([fila], CONDUCTORES, MATRICULAS, {})
    assert _tipos(avisos) == ["nombre_parecido"]
    assert avisos[0]["sugerencia"] == "JUAN FRANCISCO VIÑALS PRIMO"


def test_matricula_desconocida_con_sugerencia():
    fila = {"ruta": "", "conductor": "", "furgo": "2832 NGK", "h_salida": ""}
    avisos = validar([fila], CONDUCTORES, MATRICULAS, {})
    assert _tipos(avisos) == ["matricula_desconocida"]
    assert avisos[0]["sugerencia"] == "2832 NGX"


def test_horas():
    filas = [{"ruta": "X1", "conductor": "", "furgo": "", "h_salida": "25:99"},
             {"ruta": "X2", "conductor": "", "furgo": "", "h_salida": "02:00"},
             {"ruta": "X3", "conductor": "", "furgo": "", "h_salida": "11:50", "h_llegada": "10:00"},
             {"ruta": "X4", "conductor": "", "furgo": "", "h_salida": ""}]
    tipos = _tipos(validar(filas, CONDUCTORES, MATRICULAS, {}))
    assert tipos == ["hora_falta", "hora_incoherente", "hora_invalida", "hora_rara"], tipos


def test_repetidos():
    filas = [{"ruta": "A", "conductor": "VICTOR ANTELO NIETO", "furgo": "4455NKC", "h_salida": "10:00"},
             {"ruta": "B", "conductor": "Victor Antelo Nieto", "furgo": "4455 NKC", "h_salida": "10:10"}]
    tipos = _tipos(validar(filas, CONDUCTORES, MATRICULAS, {}))
    assert tipos.count("repetido") == 2, tipos


def main():
    fallos = 0
    for k, v in list(globals().items()):
        if k.startswith("test_") and callable(v):
            try:
                v()
                print("  ok  %s" % k)
            except AssertionError as e:
                fallos += 1
                print("  MAL %s: %s" % (k, e))
    print("%d fallos" % fallos)
    return fallos


if __name__ == "__main__":
    sys.exit(main())
