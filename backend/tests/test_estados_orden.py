# -*- coding: utf-8 -*-
"""Ningun filtro puede buscar un estado de orden que no existe.

Un `$nin: ["entregada", "anulada"]` no da error: no excluye nada, porque el
estado real es "entregado" (masculino). El filtro parece que funciona, la
consulta devuelve documentos, y lo que sale por pantalla es un numero mas alto
de lo que toca sin que nada avise. Es el gotcha 33.

Habia DOS en produccion, y los dos alimentaban la portada de Ordenes de taller:
`$nin ["entregada","anulada"]` en «estan en el taller y no consta cuando
vuelven» y `$nin ["cerrada","anulada"]` en «furgonetas paradas» — ni "entregada"
ni "cerrada" existen. Con dos ordenes en la base no se notaba; con cincuenta,
una furgoneta ya devuelta habria seguido contando como parada.

Se lee del server.py de verdad con `ast`, sin ejecutarlo: una copia de las
constantes deja de probar el codigo que corre (gotcha 40).
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")


def _constantes():
    """`OT_ESTADOS` y `OT_ESTADOS_CERRADOS` sacadas del fichero real."""
    arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
    out = {}
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in (
                "OT_ESTADOS", "OT_ESTADOS_CERRADOS", "OT_ESTADOS_TALLER"):
            out[n.targets[0].id] = ast.literal_eval(n.value)
    return out


def _estados_en_filtros():
    """Los literales que aparecen en un filtro sobre el campo `estado`.

    Busca `{"estado": {"$nin": [...]}}` y `{"$in": [...]}` en cualquier parte
    del fichero, que es como se escriben las consultas a Mongo aqui.
    """
    arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
    encontrados = []
    for n in ast.walk(arbol):
        if not isinstance(n, ast.Dict):
            continue
        for clave, valor in zip(n.keys, n.values):
            if getattr(clave, "value", None) != "estado":
                continue
            if not isinstance(valor, ast.Dict):
                continue
            for k2, v2 in zip(valor.keys, valor.values):
                if getattr(k2, "value", None) not in ("$nin", "$in"):
                    continue
                try:
                    lista = ast.literal_eval(v2)
                except Exception:                                # noqa: BLE001
                    continue                # `list(OT_ESTADOS_CERRADOS)`: ya es la constante
                for e in (lista or []):
                    if isinstance(e, str):
                        encontrados.append((e, getattr(n, "lineno", 0)))
    return encontrados


def test_todos_los_casos():
    assert main() == 0


def main():
    c = _constantes()
    validos = set(c.get("OT_ESTADOS") or {})
    mal = 0

    if not validos:
        print("  MAL  no encuentro OT_ESTADOS en server.py")
        return 1
    print("  ok   OT_ESTADOS tiene %d estados: %s" % (len(validos), ", ".join(sorted(validos))))

    cerrados = set(c.get("OT_ESTADOS_CERRADOS") or ())
    if not cerrados:
        print("  MAL  falta OT_ESTADOS_CERRADOS")
        mal += 1
    elif cerrados - validos:
        print("  MAL  OT_ESTADOS_CERRADOS tiene estados que no existen: %s" % (cerrados - validos))
        mal += 1
    else:
        print("  ok   OT_ESTADOS_CERRADOS = %s, y los dos existen" % sorted(cerrados))

    taller = set(c.get("OT_ESTADOS_TALLER") or ())
    if taller - validos:
        print("  MAL  OT_ESTADOS_TALLER tiene estados que no existen: %s" % (taller - validos))
        mal += 1
    else:
        print("  ok   OT_ESTADOS_TALLER: los %d que puede poner el taller existen" % len(taller))

    inventados = [(e, li) for e, li in _estados_en_filtros() if e not in validos]
    if inventados:
        for e, li in inventados:
            print("  MAL  server.py:%d filtra por el estado %r, que NO existe" % (li, e))
            print("       no da error: simplemente no filtra nada (gotcha 33)")
        mal += len(inventados)
    else:
        print("  ok   ningun filtro busca un estado inventado")

    print("\n%d fallos" % mal)
    return 1 if mal else 0


if __name__ == "__main__":
    sys.exit(main())
