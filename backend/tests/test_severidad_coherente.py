# -*- coding: utf-8 -*-
"""Una inspeccion sin daños en la lista no puede tener severidad de daño.

La IA devuelve `severity` y `damages` por separado: 128 de 3.964 inspecciones
en produccion (02-09-2026) decian "leve", "moderado" o "grave" con la lista
vacia, y salian en Inspecciones como "Leve · 0 daños" y en el dashboard como
daño. El validador de `InspectionAnalysis` lo reconcilia. Se extraen las dos
clases del server.py real con `ast` (gotcha 40).

Probado reintroduciendo el fallo: sin el validador, `test_sin_danos_sin_severidad`
falla.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")


def _cargar():
    try:
        import pydantic  # noqa: F401
    except ModuleNotFoundError as e:
        raise ModuleNotFoundError("No module named 'pydantic'") from e
    arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
    cuerpo = [n for n in arbol.body
              if isinstance(n, ast.ClassDef) and n.name in ("Damage", "InspectionAnalysis")]
    assert len(cuerpo) == 2, "faltan Damage o InspectionAnalysis en server.py"
    ns = {}
    exec("from typing import List, Optional\nfrom pydantic import BaseModel, Field, ConfigDict, model_validator\nimport uuid", ns)
    exec(compile(ast.fix_missing_locations(ast.Module(body=cuerpo, type_ignores=[])), "<server>", "exec"), ns)
    return ns


NS = _cargar()
IA = NS["InspectionAnalysis"]


def test_sin_danos_sin_severidad():
    for sev in ("leve", "moderado", "grave", "critico"):
        assert IA(severity=sev, damages=[], new_damages=[]).severity == "sin_danos", sev


def test_con_danos_se_respeta():
    d = NS["Damage"](part="puerta", severity="grave", description="golpe")
    assert IA(severity="grave", damages=[d]).severity == "grave"


def test_sin_analisis_se_respeta():
    assert IA(severity="sin_analisis").severity == "sin_analisis"
    assert IA().severity == "sin_danos"


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
