# -*- coding: utf-8 -*-
"""Insertar un dict en Mongo y devolver ESE MISMO dict responde 500.

   ═══════════════════════════════════════════════════════════════════════
   `insert_one(doc)` MUTA `doc`: pymongo le mete `_id` con un ObjectId, que
   FastAPI no sabe serializar. Si el endpoint devuelve el mismo dict, la
   respuesta revienta.

   Lo peor es COMO falla. Solo revienta la peticion que CREA el documento:
   las siguientes lo leen de la base con proyeccion `{"_id": 0}` y van bien.
   O sea que falla una vez, recargas, funciona — y no lo reporta nadie.

   Paso de verdad en `/checklist`, y llevaba ahi desde siempre: el PRIMERO
   que abria la lista de tareas cada dia, en cualquier centro y cualquier
   empresa, se llevaba un «Error interno del servidor». Se encontro el
   31-08-2026 barriendo las 155 pantallas del panel con una empresa recien
   creada, no leyendo el codigo.

   La cura es insertar una COPIA: `insert_one(dict(doc))`. Asi la mutacion
   cae en la copia y el original se queda limpio para devolverlo.

   Se ejecuta con: python scripts/check_objectid.py
"""
import ast
import io
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "server.py")


def nombre_insertado(nodo):
    """Si el nodo es `await X.insert_one(NOMBRE)`, devuelve NOMBRE."""
    v = nodo.value if isinstance(nodo, ast.Expr) else nodo
    if isinstance(v, ast.Await):
        v = v.value
    if not isinstance(v, ast.Call) or not isinstance(v.func, ast.Attribute):
        return None
    if v.func.attr != "insert_one" or not v.args:
        return None
    # `insert_one(dict(doc))` y `insert_one({...})` ya son seguros: lo que se
    # muta es la copia o el literal, no la variable que se devuelve.
    return v.args[0].id if isinstance(v.args[0], ast.Name) else None


def nombres_desnudos(nodo):
    """Los nombres que viajan ENTEROS, sin `doc["id"]` ni `doc.attr`.

    Devolver `doc["id"]` es seguro —es un string—; devolver `doc` no lo es.
    Sin esta distincion el checker marcaba cinco sitios correctos por cada
    uno malo, y un checker que grita en falso se acaba ignorando."""
    fuera = set()
    for x in ast.walk(nodo):
        if isinstance(x, (ast.Subscript, ast.Attribute)) and isinstance(x.value, ast.Name):
            fuera.add(id(x.value))
        # Pasarlo a una funcion no cuenta: el saneado habitual es
        # `return _payload(doc)`, que arma la respuesta por lista blanca.
        if isinstance(x, ast.Call):
            for a in x.args:
                if isinstance(a, ast.Name):
                    fuera.add(id(a))
    return {x.id for x in ast.walk(nodo) if isinstance(x, ast.Name) and id(x) not in fuera}


def limpia_el_id(fn, nombre):
    """`doc.pop("_id", None)` tras el insert deja el dict listo para devolver.

    Es la otra cura valida, y la que ya usaban tres endpoints —documentos, chat
    y contactos— desde antes de que existiera este checker. Sin reconocerla,
    aqui saldrian tres avisos en falso; y un checker que grita en falso deja de
    leerse, que es justo como se colo el de /checklist."""
    for c in ast.walk(fn):
        if (isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute)
                and c.func.attr == "pop" and isinstance(c.func.value, ast.Name)
                and c.func.value.id == nombre and c.args
                and getattr(c.args[0], "value", None) == "_id"):
            return True
    return False


arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
hallazgos, vistos = [], set()

for fn in ast.walk(arbol):
    if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
        continue
    insertados = {}
    for n in ast.walk(fn):
        nom = nombre_insertado(n)
        if nom:
            insertados.setdefault(nom, getattr(n, "lineno", 0))
    if not insertados:
        continue
    for n in ast.walk(fn):
        usados = set()
        if isinstance(n, ast.Return) and n.value is not None:
            usados = nombres_desnudos(n.value)
        elif isinstance(n, ast.Assign) and isinstance(n.value, ast.Name):
            # `result[turno] = new_doc` acaba en la respuesta igual que un return.
            if any(isinstance(t, ast.Subscript) for t in n.targets):
                usados = {n.value.id}
        for u in usados & set(insertados):
            if limpia_el_id(fn, u) or (fn.name, u) in vistos:
                continue
            vistos.add((fn.name, u))
            hallazgos.append((insertados[u], fn.name, u, getattr(n, "lineno", 0)))

if not hallazgos:
    print("objectid OK: ningun insert_one devuelve el dict que acaba de mutar")
    sys.exit(0)

for li, fn, var, lr in sorted(hallazgos):
    print("\n  backend/server.py:%d  %s()" % (li, fn))
    print("     inserta `%s` y lo devuelve sin copiar (linea %d)." % (var, lr))
    print("     -> la PRIMERA llamada dara 500; las siguientes, 200.")
print("\nFALLO: %d sitio(s). Cambia `insert_one(%s)` por `insert_one(dict(%s))`."
      % (len(hallazgos), hallazgos[0][2], hallazgos[0][2]))
sys.exit(1)
