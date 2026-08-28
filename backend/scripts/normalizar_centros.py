"""Deja el centro de cada furgoneta en su codigo: 'AMZL OGA5 SANTIAGO XPT' -> 'OGA5'.

POR QUE. El mismo centro esta guardado de siete formas en `vehicles`:

    'OGA5' 76 · 'AMZL OGA5 SANTIAGO XPT' 37 · 'oga5' 5 · 'OGA5 ' 2
    'DGA1' 21 · 'AMZL DGA1 CORUNA' 20 · 'DGA2' 22

El gotcha 6 ya lo documenta y por eso los filtros van por `$regex`, pero eso
arregla la LECTURA, no el dato: cualquier recuento nuevo que agrupe por centro
parte OGA5 en dos mitades sin avisar y sin fallar. Paso el 28-08-2026 contando
la flota, que salia repartida entre 'AMZL O...' y 'OGA5' como si fueran dos
naves distintas.

`drivers`, `workshops`, `cortex_stations` y `daily_assignments` ya estan
limpias: solo hace falta tocar `vehicles`.

NO ADIVINA NADA. Solo reescribe cuando dentro del texto aparece exactamente UN
codigo que ya existe limpio en la base. Un centro que nadie haya escrito bien
todavia se queda como esta, y se lista al final para que se vea.

Uso:
    python normalizar_centros.py             # SOLO INFORMA
    python normalizar_centros.py --aplicar   # escribe
"""
import argparse
import asyncio
import os
import re
import sys
from collections import Counter

from motor.motor_asyncio import AsyncIOMotorClient

CODIGO = re.compile(r"\b([A-Z]{2,4}\d{1,2})\b")


def norm(valor, conocidos):
    t = str(valor or "").strip().upper()
    if not t or t in conocidos:
        return t
    hallados = {c for c in CODIGO.findall(t) if c in conocidos}
    return hallados.pop() if len(hallados) == 1 else t


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aplicar", action="store_true", help="escribe (sin esto solo informa)")
    args = ap.parse_args()

    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ.get("DB_NAME") or "flotadsp"]

    # Los codigos buenos salen de las colecciones que estan limpias, nunca de
    # `vehicles`, que es la que se va a arreglar.
    conocidos = set()
    for col in ("drivers", "cortex_stations", "workshops"):
        for v in await db[col].distinct("center"):
            t = str(v or "").strip().upper()
            if t and CODIGO.fullmatch(t):
                conocidos.add(t)
    print("Codigos de centro conocidos: %s" % sorted(conocidos))
    print("Modo: %s\n" % ("APLICAR — se escribe" if args.aplicar else "SOLO INFORMAR"))

    cambios = Counter()
    sin_tocar = Counter()
    lote = []
    from pymongo import UpdateOne

    async for v in db.vehicles.find({}, {"_id": 1, "center": 1, "license_plate": 1}):
        viejo = v.get("center")
        nuevo = norm(viejo, conocidos)
        if nuevo == (viejo or ""):
            continue
        if nuevo and CODIGO.fullmatch(nuevo):
            cambios[(str(viejo), nuevo)] += 1
            lote.append(UpdateOne({"_id": v["_id"]}, {"$set": {"center": nuevo}}))
        else:
            sin_tocar[str(viejo)] += 1

    print("=== cambios ===")
    if not cambios:
        print("   (ninguno: ya esta todo limpio)")
    for (a, b), n in cambios.most_common():
        print("   %-30r -> %-8r %4d" % (a, b, n))
    if sin_tocar:
        print("\n=== NO se tocan (no se sabe a que centro van) ===")
        for k, n in sin_tocar.most_common():
            print("   %-40r %4d" % (k, n))

    if args.aplicar and lote:
        await db.vehicles.bulk_write(lote, ordered=False)
        print("\nEscritos %d documentos." % len(lote))
    elif not args.aplicar:
        print("\nNo se ha escrito nada. Repite con --aplicar.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
