"""Iguala los dos campos donde vive el mismo Transporter ID de un conductor.

LA FICHA TIENE DOS CASILLAS PARA LO MISMO: "ID Amazon" (`driver_id`) y
"Transporter ID (Cortex)" (`transporter_id`). Al dar de alta se rellenaba una u
otra segun el dia, y media app cruza por una y media por la otra:

    · el debrief resuelve el nombre por `driver_id`
    · las pantallas de IDs y el emparejador lo hacen por `transporter_id`

Resultado: el mismo conductor sale con su nombre en una pantalla y como
"SIN FICHA" en la de al lado, sin que nada falle.

Medido el 29-08-2026 sobre 213 fichas:

    92 con los dos y coincidiendo
    32 solo en `driver_id`          -> salian sin ficha en la pantalla de IDs
    19 solo en `transporter_id`     -> salian SIN FICHA en el debrief
     0 con los dos DISTINTOS

Ese CERO es lo que hace seguro igualarlos: los dos campos no se contradicen
nunca, asi que copiar de uno al otro no puede pisar un dato bueno. Si hubiera
alguno distinto, este script lo dice y NO lo toca — decidir cual gana no es cosa
de un script.

Solo se copia lo que tiene forma de Transporter ID de Amazon (empieza por A y
son mayusculas y numeros). Un DNI o un nombre escrito en la casilla equivocada
se queda donde esta y se lista.

Uso:
    python igualar_ids_conductor.py             # SOLO INFORMA
    python igualar_ids_conductor.py --aplicar   # escribe
"""
import argparse
import asyncio
import os
import re
import sys

from motor.motor_asyncio import AsyncIOMotorClient

# Los ids de Amazon vistos en produccion van de 13 a 14 caracteres, pero se
# acepta un rango mas ancho: el formato lo decide Amazon, no nosotros.
TID = re.compile(r"^A[A-Z0-9]{9,17}$")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aplicar", action="store_true", help="escribe (sin esto solo informa)")
    args = ap.parse_args()

    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ.get("DB_NAME") or "flotadsp"]

    from pymongo import UpdateOne
    lote, choques, raros = [], [], []
    a_transporter = a_driver = 0

    async for d in db.drivers.find({}, {"_id": 1, "name": 1,
                                        "driver_id": 1, "transporter_id": 1}):
        dv = (d.get("driver_id") or "").strip().upper()
        tv = (d.get("transporter_id") or "").strip().upper()
        dok, tok = bool(TID.match(dv)), bool(TID.match(tv))

        if dok and tok:
            if dv != tv:
                choques.append((d.get("name"), dv, tv))
            continue
        if dok and not tv:
            a_transporter += 1
            lote.append(UpdateOne({"_id": d["_id"]}, {"$set": {"transporter_id": dv}}))
        elif tok and not dv:
            a_driver += 1
            lote.append(UpdateOne({"_id": d["_id"]}, {"$set": {"driver_id": tv}}))
        elif (dv and not dok) or (tv and not tok):
            raros.append((d.get("name"), dv, tv))

    print("Modo: %s\n" % ("APLICAR — se escribe" if args.aplicar else "SOLO INFORMAR"))
    print("copiar 'ID Amazon' -> 'Transporter ID' : %d fichas" % a_transporter)
    print("copiar 'Transporter ID' -> 'ID Amazon' : %d fichas" % a_driver)
    print("total a tocar                          : %d" % len(lote))

    if choques:
        print("\n=== NO SE TOCAN: los dos campos con ids DISTINTOS ===")
        print("    (cual gana no lo decide un script)")
        for n, dv, tv in choques:
            print("   %-32s amazon=%-16s cortex=%s" % (str(n)[:32], dv, tv))
    if raros:
        print("\n=== NO SE TOCAN: algo escrito que no parece un Transporter ID ===")
        for n, dv, tv in raros[:15]:
            print("   %-32s amazon=%-16r cortex=%r" % (str(n)[:32], dv, tv))

    if args.aplicar and lote:
        await db.drivers.bulk_write(lote, ordered=False)
        print("\nEscritas %d fichas." % len(lote))
    elif not args.aplicar:
        print("\nNo se ha escrito nada. Repite con --aplicar.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
