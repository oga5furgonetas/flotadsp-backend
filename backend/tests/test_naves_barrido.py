# -*- coding: utf-8 -*-
"""La extension barre TODAS las naves de la empresa, y el backend le dice cuales.

El 16-09-2026 solo entraban paquetes de la nave que alguien tuviera abierta en
Cortex: OGA5 con datos de hoy, DGA1 sin nada desde el 27-08 y DGA2 desde el
11-08. `/cortex/naves` devuelve ahora tambien el AREA de Amazon de cada nave,
sacada de `cortex_stations` —el mismo mapeo con el que ya se etiqueta cada
paquete—, para que una sola pestana pida todas.

El comportamiento de la extension lo prueban scripts/check-naves-barrido.mjs y
check-destinos.mjs ejecutando el interceptor real. Aqui se fija el contrato.
"""
import ast
import io
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / "server.py"


def _funcion(nombre):
    txt = io.open(SERVER, encoding="utf-8-sig").read()
    lineas = txt.split("\n")
    for n in ast.walk(ast.parse(txt)):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == nombre:
            return "\n".join(lineas[n.lineno - 1:n.end_lineno])
    raise AssertionError("no existe %s" % nombre)


def test_las_naves_llevan_su_area():
    c = _funcion("cortex_naves")
    assert '"areas": areas' in c, "la extension no sabria que area de Amazon es cada nave"
    assert "db.cortex_stations.find" in c, (
        "las areas tienen que salir del mapeo que ya etiqueta los paquetes, no inventarse")


def test_solo_las_areas_de_las_naves_de_la_empresa():
    """Un area mapeada a un centro que ya no es de la empresa no se barre: seria
    pedirle a Amazon rutas que no son nuestras con la sesion de la oficina."""
    c = _funcion("cortex_naves")
    assert '"center": {"$in": naves}' in c


def test_sigue_devolviendo_las_naves_como_antes():
    """Las extensiones viejas leen `naves`: cambiarle la forma las dejaria sin
    informes de DNR hasta que se actualicen."""
    c = _funcion("cortex_naves")
    assert '"naves": naves' in c
