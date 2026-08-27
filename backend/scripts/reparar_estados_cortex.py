"""Recanoniza los estados ya guardados de Cortex y limpia el timeline.

POR QUE HACE FALTA. El panel del debrief NO lee el campo `state`: recalcula el
estado a partir del timeline. Asi que arreglar la tabla de traduccion no arregla
lo que ya esta en la base — los eventos guardados siguen diciendo `LOADED` donde
Cortex dijo `PICKED_UP`. Hay que reescribir el estado de cada evento a partir de
su `raw`, que es el dato crudo de Cortex y no se ha tocado nunca.

QUE HACE, y nada mas que esto:
  1. Por cada evento del timeline, recalcula `state` desde `raw` con la tabla
     corregida. Si el evento no tiene `raw`, se deja como esta: sin dato crudo
     no hay nada que recalcular y adivinar seria peor.
  2. Borra los eventos repetidos — misma (estado, hora, crudo, contexto).
  3. Recalcula el campo `state` del paquete como el evento vigente (el mas
     reciente por hora), que es la misma regla que usa el panel.

NO borra paquetes, NO borra timelines, NO toca `first_seen`, `service_day` ni
las horas de ningun evento. Solo reescribe campos derivados a partir de la
evidencia que ya estaba guardada.

Uso:
    python reparar_estados_cortex.py                 # SOLO INFORMA, no escribe
    python reparar_estados_cortex.py --aplicar       # escribe
    python reparar_estados_cortex.py --dia 2026-08-27 [--aplicar]
"""
import argparse
import asyncio
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

SERVER = Path(__file__).resolve().parents[1] / "server.py"


def cargar_traductor():
    """Coge la tabla de estados del propio server.py: una sola fuente."""
    src = SERVER.read_text(encoding="utf-8-sig")
    ns = {"re": re}
    for nombre in ("_CORTEX_ORDER", "_CORTEX_STATES", "_CORTEX_STATE_TEXT"):
        m = re.search(r"^%s = (\[.*?\]|\{.*?\})\n(?=\S|\n)" % nombre, src, re.S | re.M)
        exec(m.group(0), ns)
    exec(re.search(r"^def _cortex_canon_state.*?\n(?=\n\ndef )", src, re.S | re.M).group(0), ns)
    return ns["_cortex_canon_state"]


def hora(v):
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def vigente(tl):
    """El evento mas reciente por hora. Misma regla y mismos desempates que el panel."""
    mejor = mejor_at = None
    for e in tl:
        at = hora(e.get("at"))
        if at is None:
            continue
        if mejor_at is None or at > mejor_at:
            mejor, mejor_at = e, at
        elif at == mejor_at and mejor is not None:
            orden = {"MISSING": 3, "DELIVERED": 2, "BACK_TO_ORIGIN": 1}
            if orden.get(e.get("state"), 0) > orden.get(mejor.get("state"), 0):
                mejor = e
    return (mejor or {}).get("state")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aplicar", action="store_true", help="escribe (sin esto solo informa)")
    ap.add_argument("--dia", default="", help="un solo dia de servicio (YYYY-MM-DD)")
    args = ap.parse_args()

    canon = cargar_traductor()
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ.get("DB_NAME") or "flotadsp"]

    filtro = {"service_day": args.dia} if args.dia else {}
    total = await db.cortex_packages.count_documents(filtro)
    print("Paquetes en el alcance: %d%s" % (total, (" (dia %s)" % args.dia) if args.dia else " (todos)"))
    print("Modo: %s\n" % ("APLICAR — se escribe" if args.aplicar else "SOLO INFORMAR — no se escribe nada"))

    tocados = dups = ev_recanon = 0
    cambios = Counter()
    lote = []
    from pymongo import UpdateOne

    cur = db.cortex_packages.find(filtro, {"tba": 1, "state": 1, "timeline": 1})
    async for d in cur:
        tl = d.get("timeline") or []
        if not tl:
            continue
        limpio, vistos, cambio_ev = [], set(), False
        for e in tl:
            crudo = str(e.get("raw") or "").strip()
            nuevo = e
            if crudo:
                st = canon(crudo)
                if st != e.get("state"):
                    nuevo = {**e, "state": st}
                    cambio_ev = True
                    ev_recanon += 1
            clave = (nuevo.get("state"), str(nuevo.get("at")),
                     str(nuevo.get("raw") or ""), str(nuevo.get("context") or ""))
            if clave in vistos:
                dups += 1
                continue
            vistos.add(clave)
            limpio.append(nuevo)

        st_viejo = d.get("state")
        st_nuevo = vigente(limpio) or st_viejo
        if not cambio_ev and len(limpio) == len(tl) and st_nuevo == st_viejo:
            continue
        tocados += 1
        if st_nuevo != st_viejo:
            cambios[(st_viejo, st_nuevo)] += 1
        if args.aplicar:
            lote.append(UpdateOne({"_id": d["_id"]},
                                  {"$set": {"timeline": limpio, "state": st_nuevo}}))
            if len(lote) >= 500:
                await db.cortex_packages.bulk_write(lote, ordered=False)
                lote = []
    if args.aplicar and lote:
        await db.cortex_packages.bulk_write(lote, ordered=False)

    print("paquetes que cambian:        %d" % tocados)
    print("eventos recanonizados:       %d" % ev_recanon)
    print("eventos duplicados quitados: %d" % dups)
    print("\ncambios de estado del paquete:")
    if not cambios:
        print("   (ninguno)")
    for (a, b), n in cambios.most_common(20):
        print("   %-18s -> %-18s %6d" % (a, b, n))
    if not args.aplicar:
        print("\nNo se ha escrito nada. Repite con --aplicar para que surta efecto.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
