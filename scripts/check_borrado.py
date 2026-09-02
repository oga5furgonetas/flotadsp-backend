# -*- coding: utf-8 -*-
"""Un borrado masivo en una ruta exige super-admin, confirmacion y rastro.

   ═══════════════════════════════════════════════════════════════════════
   Es el gotcha 45. El 01-09-2026 `POST /cortex/reset` hacia
   `delete_many({})` con solo `require_admin` y un `window.confirm`, colgado
   de un boton visible para los 14 usuarios del panel. Un clic borro
   265.986 paquetes y 555.730 eventos de Cortex —julio y agosto enteros— sin
   dejar rastro en ningun log. Se recuperaron de la copia de R2 de esa
   madrugada; con la rotacion de 14 dias, dos semanas mas tarde ya no.

   La regla, para toda funcion de ruta que vacie una coleccion entera
   (`delete_many({})`, `delete_many(dict())`, `drop()`, `drop_collection`):
     · depende de `require_superadmin` (no vale `require_admin`),
     · lee una confirmacion explicita: la cadena "confirmar" aparece en el
       cuerpo de la funcion (`data["confirmar"]`, `confirmar: str = ""`…),
     · y deja rastro: llama a `_audit(...)`.
   Cuatro de cinco no bastan (gotcha 38): las tres son obligatorias.

   Se prueba reintroduciendo el fallo: cambiar `require_superadmin` por
   `require_admin` en `cortex_reset` tiene que hacerlo saltar.

   Se ejecuta con: python scripts/check_borrado.py [ruta/a/server.py]
"""
import ast
import io
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "server.py")
if len(sys.argv) > 1:
    RUTA = sys.argv[1]


def es_endpoint(fn):
    for d in fn.decorator_list:
        f = d.func if isinstance(d, ast.Call) else d
        if isinstance(f, ast.Attribute) and f.attr in ("get", "post", "put", "patch", "delete"):
            return True
    return False


def dependencias(fn):
    """Nombres que llegan por Depends() en los argumentos de la ruta."""
    out = set()
    for d in (fn.args.defaults or []) + [x for x in (fn.args.kw_defaults or []) if x]:
        for n in ast.walk(d):
            if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "Depends" and n.args:
                out.add(getattr(n.args[0], "id", ast.unparse(n.args[0])))
    for d in fn.decorator_list:                       # dependencies=[Depends(...)]
        for n in ast.walk(d):
            if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "Depends" and n.args:
                out.add(getattr(n.args[0], "id", ast.unparse(n.args[0])))
    return out


def es_borrado_masivo(call):
    """`x.delete_many({})`, `x.delete_many(dict())`, `x.drop()`, `x.drop_collection(...)`."""
    if not isinstance(call.func, ast.Attribute):
        return False
    op = call.func.attr
    if op in ("drop", "drop_collection"):
        return True
    if op == "delete_many":
        if not call.args:
            return True
        a = call.args[0]
        if isinstance(a, ast.Dict) and not a.keys:
            return True
        if isinstance(a, ast.Call) and getattr(a.func, "id", "") == "dict" and not a.args and not a.keywords:
            return True
    return False


def main():
    src = io.open(RUTA, encoding="utf-8-sig").read()
    arbol = ast.parse(src)
    fallos = []
    rutas = 0
    for fn in arbol.body:
        if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)) or not es_endpoint(fn):
            continue
        masivos = [n for n in ast.walk(fn) if isinstance(n, ast.Call) and es_borrado_masivo(n)]
        if not masivos:
            continue
        rutas += 1
        deps = dependencias(fn)
        # Sin el docstring: la palabra `confirmar` en la explicacion de la ruta
        # no es una confirmacion. Al probar el checker quitando el `if` de
        # verdad, seguia en verde porque el docstring la mencionaba.
        cuerpo_sin_doc = [s for i, s in enumerate(fn.body)
                          if not (i == 0 and isinstance(s, ast.Expr)
                                  and isinstance(getattr(s, "value", None), ast.Constant)
                                  and isinstance(s.value.value, str))]
        cuerpo = "\n".join(ast.unparse(s) for s in cuerpo_sin_doc)
        cuerpo += "\n" + " ".join(a.arg for a in fn.args.args + fn.args.kwonlyargs)
        que = ", ".join(sorted(set(ast.unparse(m.func) for m in masivos)))
        faltan = []
        if "require_superadmin" not in deps:
            faltan.append("depende de %s, no de require_superadmin" % (", ".join(sorted(deps)) or "nada"))
        if "confirmar" not in cuerpo:
            faltan.append("no lee ninguna confirmacion explicita (`confirmar`)")
        if "_audit(" not in cuerpo:
            faltan.append("no deja rastro en audit_log (`_audit`)")
        if faltan:
            fallos.append((fn.lineno, fn.name, que, faltan))

    if fallos:
        print("borrado: %d ruta(s) vacian una coleccion sin las tres guardas del gotcha 45:" % len(fallos))
        for linea, nombre, que, faltan in fallos:
            print("  L%-6d %s  (%s)" % (linea, nombre, que))
            for f in faltan:
                print("           - %s" % f)
        print("Exige: require_superadmin + `confirmar` en la peticion + _audit(...).")
        return 1
    print("borrado OK: %d ruta(s) con borrado masivo, todas con super-admin, confirmacion y rastro" % rutas)
    return 0


if __name__ == "__main__":
    sys.exit(main())
