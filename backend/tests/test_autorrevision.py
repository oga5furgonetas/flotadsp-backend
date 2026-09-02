# -*- coding: utf-8 -*-
"""La IA solo cierra sola lo que puede decidir.

`_autorrevision_decision` es la regla que separa "la IA lo cierra" de "esto lo
mira una persona". Se lee del server.py real con `ast` (gotcha 40).

  · sin daños nuevos que decidir -> auto (no hay pregunta)
  · todos confirmado/descartado -> auto
  · alguno dudoso -> humano
  · alguno None (sin modelo todavia) -> humano: sin opinion no se decide

Probado reintroduciendo el fallo: si un None pasara como 'auto', la IA
cerraria inspecciones sin haber mirado nada; `test_sin_modelo_no_decide` falla.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")


def _cargar():
    arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
    cuerpo = [n for n in arbol.body if isinstance(n, ast.FunctionDef)
              and n.name in ("_autorrevision_decision", "_dano_pendiente_de_decidir")]
    assert len(cuerpo) == 2, "faltan funciones en server.py"
    ns = {}
    exec(compile(ast.fix_missing_locations(ast.Module(body=cuerpo, type_ignores=[])), "<server>", "exec"), ns)
    return ns


NS = _cargar()
decide = NS["_autorrevision_decision"]
pendiente = NS["_dano_pendiente_de_decidir"]


def test_sin_danos_es_auto():
    assert decide([]) == "auto"


def test_extremos_es_auto():
    assert decide(["confirmado"]) == "auto"
    assert decide(["descartado", "confirmado", "descartado"]) == "auto"


def test_una_duda_es_humano():
    assert decide(["confirmado", "dudoso"]) == "humano"
    assert decide(["dudoso"]) == "humano"


def test_sin_modelo_no_decide():
    assert decide([None]) == "humano"
    assert decide(["confirmado", None]) == "humano"


def test_ya_registrado_no_se_pregunta():
    assert pendiente({"part": "puerta", "is_new": True}) is True
    assert pendiente({"part": "puerta", "is_new": False}) is False
    assert pendiente({"part": "puerta", "description": "roce · [ya registrado desde 2026-08-01]"}) is False
    assert pendiente("basura") is False


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
