# -*- coding: utf-8 -*-
"""Un endpoint sin sesion que toca `db` escribe en la empresa que no es.

   ═══════════════════════════════════════════════════════════════════════
   Es el gotcha 26. `_current_db_name` es un contextvar CON valor por
   defecto, asi que `db` resuelve sin quejarse: un endpoint que no fija el
   tenant lee y escribe en la base principal pase lo que pase. No falla, no
   avisa, responde 200.

   Hoy acierta por casualidad porque la base principal es la de Dani. Con
   dos empresas mas, el enlace de un taller ajeno leeria datos que no son
   suyos, en silencio.

   Paso de verdad el 31-08-2026 con `driver_login`: sus dos hermanos
   —`driver_lookup` y `_driver_token_impl`— si fijaban el tenant y el se
   quedo atras. El sintoma era cruel: el paso del email reconocia al
   conductor y el de la contraseña le decia que era incorrecta, con la suya
   buena, para siempre. Ningun conductor de ninguna empresa nueva podia
   entrar al portal.

   La regla: si el endpoint no depende de una sesion (`get_current_user`,
   `require_admin`, `require_any_auth`…), tiene que llamar A MANO a
   `_set_tenant_by_slug(...)` o `set_current_org_db(...)` antes de tocar
   `db`. `global_db` no cuenta: esa es unica a proposito.

   Se ejecuta con: python scripts/check_tenant.py
"""
import ast
import io
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "server.py")

# Depends() que ya traen la empresa dentro del JWT y fijan el contextvar.
CON_SESION = {"get_current_user", "require_admin", "require_superadmin",
              "require_any_auth", "require_driver", "get_current_admin"}
# Llamadas que fijan la empresa a mano.
FIJAN = {"_set_tenant_by_slug", "set_current_org_db", "_ot_por_token", "_partner_auth",
         # Autentica la extension por su token de ingesta y fija la BD dentro.
         "_cortex_ingest_org"}


def es_endpoint(fn):
    for d in fn.decorator_list:
        f = d.func if isinstance(d, ast.Call) else d
        if isinstance(f, ast.Attribute) and f.attr in (
                "get", "post", "put", "patch", "delete"):
            return True
    return False


def tiene_sesion(fn):
    """¿Algun argumento viene de un Depends con sesion?"""
    args = list(fn.args.args) + list(fn.args.kwonlyargs)
    for a in args:
        pass
    for d in (fn.args.defaults or []) + [x for x in (fn.args.kw_defaults or []) if x]:
        for n in ast.walk(d):
            if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "Depends":
                for x in ast.walk(n):
                    if isinstance(x, ast.Name) and x.id in CON_SESION:
                        return True
    # dependencies=[Depends(require_admin)] en el propio decorador
    for dec in fn.decorator_list:
        for x in ast.walk(dec):
            if isinstance(x, ast.Name) and x.id in CON_SESION:
                return True
    return False


def usa_db_de_empresa(fn):
    """`db.algo` si; `global_db.algo` no —esa es unica a proposito—.

    `db.command("ping")` tampoco: eso pregunta por la CONEXION, no por los
    datos de nadie, y es lo que hace /health."""
    for n in ast.walk(fn):
        if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == "db":
            if n.attr == "command":
                continue
            return True
        # db["coleccion"]
        if isinstance(n, ast.Subscript) and isinstance(n.value, ast.Name) and n.value.id == "db":
            return True
    return False


def fija_la_empresa(fn):
    for n in ast.walk(fn):
        if isinstance(n, ast.Call):
            nom = getattr(n.func, "id", "") or getattr(n.func, "attr", "")
            if nom in FIJAN:
                return True
    return False


arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
malos = []
for fn in ast.walk(arbol):
    if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
        continue
    if not es_endpoint(fn) or tiene_sesion(fn):
        continue
    if usa_db_de_empresa(fn) and not fija_la_empresa(fn):
        malos.append((fn.lineno, fn.name))

if not malos:
    print("tenant OK: todo endpoint sin sesion fija su empresa antes de tocar `db`")
    sys.exit(0)
for li, nom in sorted(malos):
    print("\n  backend/server.py:%d  %s()" % (li, nom))
    print("     no tiene sesion y toca `db` sin fijar la empresa.")
    print("     -> leera y escribira en la base principal, sea de quien sea.")
print("\nFALLO: %d endpoint(s). Llama a `_set_tenant_by_slug(slug)` o a" % len(malos))
print("`set_current_org_db(nombre)` antes del primer uso de `db`, o usa `global_db`.")
sys.exit(1)
