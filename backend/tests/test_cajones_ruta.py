# -*- coding: utf-8 -*-
"""Los cajones de la tarjeta de ruta salen de las listas canonicas de estados.

El 02-09-2026 `loaded` (paquetes aun en la furgoneta) solo contaba LOADED y
ARRIVED, que dejaron de existir con el gotcha 28: con 1.209 PICKED_UP en la
calle, todas las rutas salian "terminadas", el dashboard decia "0 rutas en
curso" y la alarma de minutos sin entregar no se calculaba. Este test lee
`_cx_ruta_cajon` y las listas `_CX_*` del server.py real con `ast` (gotcha 40):
si alguien añade un estado en vuelo a `_CX_EN_VUELO` y el cajon no lo sigue,
aqui salta.

Probado reintroduciendo el fallo: con `loaded` solo para LOADED/ARRIVED,
`test_en_vuelo_cuenta_como_cargado` falla.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")


def _cargar():
    arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
    cuerpo = []
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in (
                "_CX_OK", "_CX_EN_VUELO", "_CX_NO_DESPACHADO", "_CX_REINTENTABLE"):
            cuerpo.append(n)
        if isinstance(n, ast.FunctionDef) and n.name == "_cx_ruta_cajon":
            cuerpo.append(n)
    assert len(cuerpo) == 5, "faltan constantes o la funcion en server.py"
    ns = {}
    exec(compile(ast.fix_missing_locations(ast.Module(body=cuerpo, type_ignores=[])), "<server>", "exec"), ns)
    return ns


NS = _cargar()
cajon = NS["_cx_ruta_cajon"]


def test_en_vuelo_cuenta_como_cargado():
    for st in NS["_CX_EN_VUELO"]:
        assert cajon(st) == "loaded", st


def test_entregado_y_fallos():
    for st in NS["_CX_OK"]:
        assert cajon(st) == "delivered", st
    for st in NS["_CX_REINTENTABLE"]:
        assert cajon(st) == "attempted", st
    assert cajon("MISSING") == "missing" and cajon("LOST") == "missing"
    assert cajon("BACK_TO_ORIGIN") == "returned"


def test_no_despachado_no_es_en_vuelo():
    for st in NS["_CX_NO_DESPACHADO"]:
        assert cajon(st) != "loaded", st


def test_estado_desconocido_va_a_otros():
    assert cajon("INVENTADO") == "other"
    assert cajon(None) == "other"


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
