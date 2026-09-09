# -*- coding: utf-8 -*-
"""BAJAR LOS PRECIOS DE LA ROPA. Con respaldo y comprobando lo que deja.

Dani, 09-09-2026: «no me compra nadie la ropa, baja los precios para que puedan
comprar y que no les sea cara, aunque gane 5 o 10 euros por prenda».

Lo que hace este script:
  · calcula lo que deja cada precio con `_prenda_con_cuentas` DEL PROPIO
    server.py (gotcha 40) — no con una copia de la formula, que es como se
    acaba prometiendo un margen que no existe;
  · se planta si alguna prenda cae por debajo de 5 EUR o por encima de 10:
    la banda la puso Dani y un script que la incumple en silencio no sirve;
  · guarda los precios de hoy en `app_meta.respaldo_precios_tienda` ANTES de
    tocar nada, con fecha. Deshacer es volver a escribir lo que hay ahi.

`--aplicar` para que escriba; sin eso solo enseña la tabla.
"""
import ast
import io
import os
import sys
from datetime import datetime, timezone

from pymongo import MongoClient

SUELO, TECHO = 5.0, 11.0
RESPALDO = "respaldo_precios_tienda"

# nombre exacto en la base -> precio nuevo
NUEVOS = {
    # Las tres que estan a la venta AHORA MISMO.
    "Gorra FDs": 37.90,
    "Cortavientos FDs": 42.90,
    "Hoodie FDs": 52.90,
    # Las que Dani aun no ha montado en Printful. Se dejan ya con el precio
    # bueno para que el dia que las publique no salgan con el de antes.
    "Camiseta FDs negra": 22.90,
    "Camiseta FDs entallada": 22.90,
    "Sudadera FDs": 37.90,
    "Gorro de invierno FDs": 32.90,
    "Pantalon de chandal FDs": 56.90,
}


def cuentas_del_servidor():
    """`_prenda_con_cuentas` sacada de server.py sin ejecutar el fichero."""
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server.py")
    arbol = ast.parse(io.open(ruta, encoding="utf-8-sig").read())
    amb = {}
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "").startswith(
                ("_TIENDA_", "_TALLAS_", "_RECARGO_")):
            try:
                amb[n.targets[0].id] = ast.literal_eval(n.value)
            except ValueError:
                pass
    for n in arbol.body:
        if isinstance(n, ast.FunctionDef) and n.name in (
                "_tienda_gastos", "_tienda_quedan", "_prenda_con_cuentas"):
            exec(compile(ast.fix_missing_locations(ast.Module(body=[n], type_ignores=[])),
                         "<server>", "exec"), amb)  # noqa: S102
    return amb["_prenda_con_cuentas"]


def main():
    aplicar = "--aplicar" in sys.argv
    cuentas = cuentas_del_servidor()
    db = MongoClient(os.environ["MONGO_URL"])["flotadsp"]

    filas, respaldo, mal = [], [], []
    for nombre, nuevo in NUEVOS.items():
        p = db.tienda_prendas.find_one({"nombre": nombre})
        if not p:
            mal.append("no existe la prenda %r" % nombre)
            continue
        antes = cuentas({"coste": p.get("coste"), "pvp": p.get("pvp")})
        ahora = cuentas({"coste": p.get("coste"), "pvp": nuevo})
        if not (SUELO <= ahora["queda"] <= TECHO):
            mal.append("%s dejaria %.2f EUR (fuera de %g-%g)"
                       % (nombre, ahora["queda"], SUELO, TECHO))
        filas.append((nombre, p.get("estado"), p.get("coste"), p.get("pvp"),
                      antes["queda"], nuevo, ahora["queda"]))
        respaldo.append({"id": p.get("id"), "nombre": nombre, "pvp": p.get("pvp")})

    print("%-26s %-10s %6s  %7s %7s -> %7s %7s"
          % ("prenda", "estado", "coste", "precio", "deja", "precio", "deja"))
    for f in filas:
        print("%-26s %-10s %6.2f  %7.2f %7.2f -> %7.2f %7.2f"
              % (f[0], f[1] or "", f[2], f[3], f[4], f[5], f[6]))

    if mal:
        print("\nNO SE TOCA NADA:")
        for m in mal:
            print(" -", m)
        raise SystemExit(1)

    if not aplicar:
        print("\n(simulacion: nada escrito. Con --aplicar se escribe)")
        return

    db.app_meta.update_one(
        {"_id": RESPALDO},
        {"$set": {"en": datetime.now(timezone.utc).isoformat(),
                  "motivo": "bajada de precios pedida por Dani el 09-09-2026",
                  "antes": respaldo}},
        upsert=True)
    tocadas = 0
    for nombre, nuevo in NUEVOS.items():
        r = db.tienda_prendas.update_one({"nombre": nombre}, {"$set": {"pvp": nuevo}})
        tocadas += r.modified_count
    print("\nrespaldo en app_meta.%s · %d prendas con precio nuevo" % (RESPALDO, tocadas))


main()
