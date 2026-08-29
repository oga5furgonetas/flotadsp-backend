"""Fusiona las fichas VACIAS que duplican a una persona que ya existe.

QUE SON. Fichas con el mismo nombre que otra, pero sin correo, sin Transporter
ID, inactivas y creadas todas el mismo dia. Son el residuo de una importacion
que se fue a medias: cuatro DANIEL SUAREZ RICO dados de alta el 04-08, tres de
ellos huecos.

POR QUE NO BASTA CON DEJARLAS AHI. Porque no estan del todo vacias: cinco de las
ocho encontradas el 29-08-2026 aparecen en los SLOTS DEL CUADRANTE. Y ese es
exactamente el fallo del gotcha 15 — el cuadrante apunta a una ficha y el login
del portal resuelve por correo y cae en la otra, asi que la persona entra y ve
"no tienes furgoneta asignada". Ya paso el 19-08 con cinco conductores en ruta.

POR QUE SE PUEDE HACER SIN MIEDO. La regla es estrecha a proposito y las cuatro
condiciones tienen que darse a la vez:

    · mismo nombre normalizado (sin tildes, sin dobles espacios, mayusculas)
    · EXACTAMENTE UNA de las fichas tiene correo — esa es la buena
    · la vacia no tiene correo NI Transporter ID
    · la vacia esta inactiva

Sin correo no hay login posible, y sin id no cruza con Cortex: la ficha vacia no
puede ser la "de verdad" de nadie. Si hubiera dos con correo, o la vacia tuviera
id, el grupo se salta y se avisa — dos personas con el mismo nombre existen, y
mezclarlas seria poner a una a auditar la furgoneta de la otra.

QUE HACE. Repunta los CUATRO sitios que apuntan a un conductor —contados sobre
la base, no de memoria— y marca la vacia `merged_into`. NO BORRA: si el
emparejamiento estuviera mal se deshace mirando ese campo, y borrarla dejaria
huerfano cualquier documento que se nos hubiera escapado.

Uso:
    python fusionar_fichas_vacias.py             # SOLO INFORMA
    python fusionar_fichas_vacias.py --aplicar   # escribe
"""
import argparse
import asyncio
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "").upper()).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z ]", " ", s)).strip()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ.get("DB_NAME") or "flotadsp"]

    todos = [d async for d in db.drivers.find(
        {"merged_into": {"$exists": False}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "active": 1,
         "transporter_id": 1, "driver_id": 1})]

    grupos = {}
    for d in todos:
        grupos.setdefault(norm(d.get("name")), []).append(d)

    def tiene_id(d):
        return bool((d.get("transporter_id") or "").strip()
                    or (d.get("driver_id") or "").strip())

    print("Modo: %s\n" % ("APLICAR — se escribe" if args.aplicar else "SOLO INFORMAR"))
    tocadas = 0
    saltados = []

    for nombre, fichas in sorted(grupos.items()):
        if not nombre or len(fichas) < 2:
            continue
        con_correo = [d for d in fichas if (d.get("email") or "").strip()]
        vacias = [d for d in fichas
                  if not (d.get("email") or "").strip()
                  and not tiene_id(d)
                  and d.get("active") is False]
        if len(con_correo) != 1 or not vacias:
            # Dos con correo, o una "vacia" que en realidad tiene id o esta
            # activa: eso puede ser otra persona. No se toca.
            if len(fichas) > 1:
                saltados.append((nombre, len(fichas), len(con_correo)))
            continue

        buena = con_correo[0]
        print("%s  -> se conserva %s" % (nombre, buena.get("email")))
        for v in vacias:
            movidos = {}
            for col, campo in (("inspections", "driver_id"), ("shifts", "driver_id"),
                               ("shift_requests", "driver_id")):
                n = await db[col].count_documents({campo: v["id"]})
                if n:
                    movidos[col] = n
                    if args.aplicar:
                        await db[col].update_many({campo: v["id"]},
                                                  {"$set": {campo: buena["id"]}})
            n = await db.daily_assignments.count_documents({"slots.driver_id": v["id"]})
            if n:
                movidos["cuadrante"] = n
                if args.aplicar:
                    await db.daily_assignments.update_many(
                        {"slots.driver_id": v["id"]},
                        {"$set": {"slots.$[s].driver_id": buena["id"],
                                  "slots.$[s].driver_name": buena.get("name")}},
                        array_filters=[{"s.driver_id": v["id"]}])
            if args.aplicar:
                await db.drivers.update_one({"id": v["id"]}, {"$set": {
                    "merged_into": buena["id"], "active": False,
                    "status": "fusionada",
                    "merged_at": datetime.now(timezone.utc).isoformat(),
                    "merged_by": "script fusionar_fichas_vacias"}})
            tocadas += 1
            print("     vacia %s  ->  %s" % (
                v["id"][:8], ", ".join("%s %d" % kv for kv in movidos.items()) or "no tenia nada"))

    print("\nfichas vacias fusionadas: %d" % tocadas)
    if saltados:
        print("\n=== NO SE TOCAN: hay que mirarlos a mano ===")
        for n, k, c in saltados:
            print("   %-36s %d fichas, %d con correo" % (n[:36], k, c))
    if not args.aplicar:
        print("\nNo se ha escrito nada. Repite con --aplicar.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
