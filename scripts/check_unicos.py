# -*- coding: utf-8 -*-
"""Un `except DuplicateKeyError` sin indice unico detras es papel mojado.

   ═══════════════════════════════════════════════════════════════════════
   Es el gotcha 46. `generar_accesos_conductores` capturaba DuplicateKeyError
   "por si dos pestañas a la vez" sobre `driver_accounts`... que no tenia
   ningun indice unico. El except no saltaba nunca y cinco pulsaciones a la
   vez dejaron 21 cuentas para una misma persona (02-09-2026). El codigo
   PARECIA protegido, que es peor que no tener nada.

   La regla: si un `try` que escribe en una coleccion captura
   `DuplicateKeyError` o `BulkWriteError`, esa coleccion tiene que tener un
   indice `unique=True` declarado en `_ensure_tenant_indexes` (o `_idx_unico`,
   o un `create_index(..., unique=True)` en cualquier sitio de server.py).

   Se prueba reintroduciendo el fallo: quitar la linea del indice unico de
   `driver_accounts` tiene que hacerlo saltar.

   Se ejecuta con: python scripts/check_unicos.py [ruta/a/server.py]
"""
import ast
import io
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "server.py")
if len(sys.argv) > 1:
    RUTA = sys.argv[1]

ESCRIBEN = {"insert_one", "insert_many", "update_one", "update_many", "replace_one",
            "find_one_and_update", "bulk_write"}


def nombre_coleccion(valor, constantes):
    """`db.vehicles` -> vehicles; `db[SEG_COL_X]` -> lo que valga la constante."""
    if isinstance(valor, ast.Attribute):
        return valor.attr
    if isinstance(valor, ast.Subscript):
        s = valor.slice
        if isinstance(s, ast.Constant) and isinstance(s.value, str):
            return s.value
        if isinstance(s, ast.Name):
            return constantes.get(s.id, "<%s>" % s.id)
    return None


def main():
    src = io.open(RUTA, encoding="utf-8-sig").read()
    arbol = ast.parse(src)
    constantes = {}
    for n in arbol.body:
        if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name) \
                and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str):
            constantes[n.targets[0].id] = n.value.value

    # Colecciones con indice unico declarado en cualquier sitio.
    con_unico = set()
    for n in ast.walk(arbol):
        if not isinstance(n, ast.Call):
            continue
        f = n.func
        es_idx = isinstance(f, ast.Name) and f.id in ("_idx", "_idx_unico")
        es_create = isinstance(f, ast.Attribute) and f.attr == "create_index"
        if not (es_idx or es_create):
            continue
        unico = (isinstance(f, ast.Name) and f.id == "_idx_unico") or any(
            k.arg == "unique" and isinstance(k.value, ast.Constant) and k.value.value is True
            for k in n.keywords)
        if not unico:
            continue
        objetivo = n.args[0] if es_idx and n.args else (f.value if es_create else None)
        col = nombre_coleccion(objetivo, constantes) if objetivo is not None else None
        if col:
            con_unico.add(col)

    fallos = []
    for n in ast.walk(arbol):
        if not isinstance(n, ast.Try):
            continue
        captura = False
        for h in n.handlers:
            t = h.type
            nombres = [t] if t is not None else []
            if isinstance(t, ast.Tuple):
                nombres = list(t.elts)
            if any(isinstance(x, ast.Name) and x.id in ("DuplicateKeyError", "BulkWriteError") for x in nombres):
                captura = True
        if not captura:
            continue
        escritas = set()
        for c in ast.walk(ast.Module(body=n.body, type_ignores=[])):
            if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute) and c.func.attr in ESCRIBEN:
                col = nombre_coleccion(c.func.value, constantes)
                if not col:
                    continue
                # Si lo que se escribe FIJA `_id` (las plantillas de taller van
                # con `_id = clave`) o el upsert filtra por `_id`, la unicidad
                # ya la da el propio `_id`: no hace falta otro indice. Sin esta
                # excepcion el checker gritaba en falso por `taller_plantillas`,
                # y un checker que grita en falso deja de leerse (gotcha 42).
                por_id = False
                for d in ast.walk(c):
                    if isinstance(d, ast.Dict) and any(
                            isinstance(k, ast.Constant) and k.value == "_id" for k in d.keys):
                        por_id = True
                        break
                if por_id:
                    continue
                escritas.add(col)
        for col in sorted(escritas):
            if col not in con_unico and col != "app_meta":
                # `app_meta` va por `_id`, que es unico siempre (cerrojos, gotcha 32).
                fallos.append((n.lineno, col))

    if fallos:
        print("unicos: %d sitio(s) capturan DuplicateKeyError sobre una coleccion SIN indice unico:" % len(fallos))
        for linea, col in fallos:
            print("  L%-6d %s" % (linea, col))
        print("Declara el unico en _ensure_tenant_indexes (unique=True, parcial si hace falta) o quita el except.")
        return 1
    print("unicos OK: todo except de duplicado tiene un indice unico detras (%d colecciones con unico)" % len(con_unico))
    return 0


if __name__ == "__main__":
    sys.exit(main())
