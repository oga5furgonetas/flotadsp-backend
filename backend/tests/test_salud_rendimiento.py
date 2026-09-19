# -*- coding: utf-8 -*-
"""La pantalla de salud no puede pedir el desglose de TODAS las colecciones.

MEDIDO EL 19-09-2026 CONTRA PRODUCCION: `/admin/salud` tardaba entre 5 s y 43 s
segun como anduviera Atlas. No habia ninguna consulta lenta —es el gotcha 63
otra vez—: pedia un `collStats` por CADA coleccion de CADA base, y eso hoy son
**59 bases y 1.908 colecciones**, unas 2.026 idas y vueltas. Cada cliente nuevo
suma la suya, asi que el numero solo sube.

Ahora se piden las estadisticas BARATAS de cada base (una llamada) y el
desglose por coleccion solo de las mas gordas. Despues: **1,0 s** desde fuera y
0,9 s desde la propia maquina, con el mismo dato en pantalla (1.044,8 MB, 59
bases, las mismas colecciones en el desglose).

Este fichero es el trinquete: si alguien vuelve a pedir el desglose de todas,
la pantalla vuelve a tardar medio minuto y no falla nada — solo se hace lenta,
que es la forma de romperse que nadie reporta.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = io.open(os.path.join(RAIZ, "server.py"), encoding="utf-8-sig").read()


def _cuerpo(nombre):
    for n in ast.walk(ast.parse(FUENTE)):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == nombre:
            return ast.get_source_segment(FUENTE, n)
    raise AssertionError("no existe %s en server.py" % nombre)


def _salud():
    """El endpoint de salud, buscado por su decorador y no por su nombre."""
    arbol = ast.parse(FUENTE)
    for n in ast.walk(arbol):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for d in n.decorator_list:
                if "admin/salud" in (ast.get_source_segment(FUENTE, d) or ""):
                    return ast.get_source_segment(FUENTE, n)
    raise AssertionError("ya no existe el endpoint /admin/salud")


def test_el_desglose_solo_se_pide_de_las_bases_que_pesan():
    cuerpo = _salud()
    assert "_SALUD_DESGLOSE" in cuerpo, (
        "vuelve a pedirse el desglose de todas las bases: con 59 bases y 1.908 "
        "colecciones eso son ~2.026 consultas y la pantalla tarda medio minuto")
    assert "bases[:_SALUD_DESGLOSE]" in cuerpo, "el corte ya no se aplica"


def test_las_estadisticas_por_base_siguen_siendo_de_todas():
    """Acotar el DESGLOSE no puede acotar el TOTAL: si se dejaran de pesar
    bases, el porcentaje de ocupacion saldria mas bajo de lo que es, que es
    justo la clase de numero que no puede mentir (gotcha 41)."""
    cuerpo = _salud()
    assert "for n in nombres" in cuerpo, "las estadisticas por base ya no recorren todas"
    assert "for b in bases:" in cuerpo and "total_mb +=" in cuerpo, (
        "el total ya no suma todas las bases")


def test_el_semaforo_sigue_puesto():
    """Sin tope se le mandan todos los comandos de golpe al mismo pool y el
    resto del backend deja de responder mientras tanto (gotcha 63)."""
    assert "asyncio.Semaphore(24)" in _salud()


def test_todos_los_casos():
    fallos = 0
    for nombre, f in sorted(globals().items()):
        if nombre.startswith("test_") and callable(f) and nombre != "test_todos_los_casos":
            try:
                f()
                print("ok  ", nombre)
            except Exception as ex:                              # noqa: BLE001
                fallos += 1
                print("FALLA", nombre, repr(ex))
    assert fallos == 0, "%d fallos" % fallos


if __name__ == "__main__":
    try:
        test_todos_los_casos()
    except AssertionError as ex:
        print(ex)
        sys.exit(1)
    sys.exit(0)
