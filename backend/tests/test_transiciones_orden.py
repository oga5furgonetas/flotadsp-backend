# -*- coding: utf-8 -*-
"""Una orden de taller cerrada es terminal.

Forzado por API el 02-09-2026 en una empresa de prueba: una orden `entregado`
volvia a `reparando` con un 200 y la furgoneta se quedaba `active` en la flota
mientras la orden decia que estaba en el taller; y una `entregado` pasaba a
`anulada` sin deshacer nada. La regla vive en `_ot_transicion_invalida` y se
lee del server.py de verdad con `ast`, sin ejecutarlo (gotcha 40): una copia
dejaria de probar el codigo que corre.

Probado reintroduciendo el fallo: si la funcion devuelve None para
entregado -> reparando, `test_cerrada_es_terminal` falla.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")


def _cargar():
    src = io.open(RUTA, encoding="utf-8-sig").read()
    arbol = ast.parse(src)
    cuerpo = []
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in (
                "OT_ESTADOS", "OT_ESTADOS_CERRADOS", "OT_ABIERTAS"):
            cuerpo.append(n)
        if isinstance(n, ast.FunctionDef) and n.name == "_ot_transicion_invalida":
            cuerpo.append(n)
    assert len(cuerpo) == 4, "faltan constantes o la funcion en server.py"
    mod = ast.Module(body=cuerpo, type_ignores=[])
    from typing import Optional
    ns = {"Optional": Optional}
    exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), ns)
    return ns


NS = _cargar()
f = NS["_ot_transicion_invalida"]
CERRADOS = NS["OT_ESTADOS_CERRADOS"]
ABIERTAS = NS["OT_ABIERTAS"]


def test_camino_normal_pasa():
    for a, b in (("abierta", "recibido"), ("recibido", "reparando"), ("reparando", "listo"),
                 ("listo", "entregado"), ("abierta", "anulada"), ("abierta", "entregado")):
        assert f(a, b) is None, (a, b)


def test_cerrada_es_terminal():
    for cerrado in CERRADOS:
        for destino in ABIERTAS + tuple(x for x in CERRADOS if x != cerrado):
            assert f(cerrado, destino), "de %s a %s tendria que rechazarse" % (cerrado, destino)


def test_repetir_el_mismo_no_es_transicion():
    for e in ABIERTAS + CERRADOS:
        assert f(e, e) is None, e


def test_estado_inventado():
    assert f("abierta", "volando")
    assert f("entregado", "volando")


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
