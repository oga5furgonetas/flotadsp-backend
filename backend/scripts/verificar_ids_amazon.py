"""Contrasta la lista OFICIAL de Amazon (nombre -> Transporter ID) con las fichas.

Amazon da esta lista desde Cortex ("Nombre del agente de entrega / ID de agente
de entrega"). Es la unica fuente que empareja las dos cosas: Cortex NO manda
nombres en los paquetes (0 de 7.171 medidos), asi que sin esta lista el ID solo
se puede asignar a ojo.

QUE COMPRUEBA, una por una:

    OK            la ficha ya tiene ese ID
    RELLENAR      la ficha existe y no tiene ID -> se le pone
    CORREGIR      la ficha tiene OTRO ID -> se cambia y se dice cual habia
    CHOCA         ese ID lo tiene ya OTRA ficha -> NO se toca, se avisa
    SIN FICHA     no hay nadie con ese nombre -> NO se crea, se lista
    AMBIGUO       dos fichas con el mismo nombre -> NO se toca (gotcha 15)

No crea fichas ni fusiona nada: las dos cosas necesitan mas datos que un nombre
(centro, correo, contrato) y hacerlo a ciegas es como aparecieron los duplicados
que hubo que limpiar.

EL CENTRO NO SE TOCA. En la lista de una estacion aparecen conductores de otras
que vinieron a ayudar; ponerles el centro de la lista los movería de nave.

Los nombres se comparan sin tildes, sin dobles espacios y en mayusculas, porque
las fichas estan escritas de seis maneras. Se arregla ademas el mojibake tipico
de pegar desde Excel ('FANDIÃ‘O' -> 'FANDIÑO').

Uso:
    python verificar_ids_amazon.py lista.txt             # SOLO INFORMA
    python verificar_ids_amazon.py lista.txt --aplicar   # escribe
"""
import argparse
import asyncio
import os
import re
import sys
import unicodedata
from collections import defaultdict

from motor.motor_asyncio import AsyncIOMotorClient

TID = re.compile(r"^A[A-Z0-9]{9,17}$")


def arregla_mojibake(s):
    """'FANDIÃ‘O' -> 'FANDIÑO'. Pegar desde Excel trae UTF-8 leido como Latin-1."""
    if "Ã" not in s and "Â" not in s:
        return s
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def _lev(a, b):
    """Distancia de edicion. Hace falta porque los nombres llegan con una letra
    de diferencia: ESPINOSA/ESPINOZA, VILLANOVA/VILANOVA, ACEBEDO/ACEVEDO, y
    'FANDIAO' cuando la enye se rompe al pegar desde Excel. Comparando palabras
    exactas, esas personas salen como si no existieran teniendo su ficha."""
    if len(a) < len(b):
        a, b = b, a
    ant = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        act = [i + 1]
        for j, cb in enumerate(b):
            act.append(min(ant[j + 1] + 1, act[j] + 1, ant[j] + (ca != cb)))
        ant = act
    return ant[-1]


def norm(s):
    s = arregla_mojibake(str(s or ""))
    s = unicodedata.normalize("NFKD", s.upper()).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z ]", " ", s)).strip()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fichero", help="TSV: nombre <tab> transporter id")
    ap.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    pares = []
    with open(args.fichero, encoding="utf-8") as f:
        for linea in f:
            if "\t" not in linea:
                continue
            n, t = linea.split("\t", 1)
            n, t = n.strip(), t.strip().upper()
            if n and TID.match(t):
                pares.append((n, t))
    print("Lista de Amazon: %d pares\n" % len(pares))

    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ.get("DB_NAME") or "flotadsp"]

    por_nombre = defaultdict(list)
    por_id = {}
    async for d in db.drivers.find({"merged_into": {"$exists": False}},
                                   {"_id": 0, "id": 1, "name": 1, "center": 1,
                                    "driver_id": 1, "transporter_id": 1}):
        por_nombre[norm(d.get("name"))].append(d)
        for campo in ("transporter_id", "driver_id"):
            v = (d.get(campo) or "").strip().upper()
            if TID.match(v):
                por_id.setdefault(v, d)

    from pymongo import UpdateOne
    lote = []
    r = defaultdict(list)

    for nombre, tid in pares:
        fichas = por_nombre.get(norm(nombre)) or []
        if not fichas:
            r["sin_ficha"].append((nombre, tid))
            continue
        if len(fichas) > 1:
            r["ambiguo"].append((nombre, tid, len(fichas)))
            continue
        d = fichas[0]
        actual = {(d.get("transporter_id") or "").strip().upper(),
                  (d.get("driver_id") or "").strip().upper()} - {""}
        if actual == {tid}:
            r["ok"].append((nombre, tid))
            continue
        # ¿Ese id lo tiene ya otra persona? Entonces no se toca nada: uno de los
        # dos esta mal y no se puede saber cual desde aqui.
        duenno = por_id.get(tid)
        if duenno and duenno.get("id") != d.get("id"):
            r["choca"].append((nombre, tid, duenno.get("name")))
            continue
        if not actual:
            r["rellenar"].append((nombre, tid))
        else:
            r["corregir"].append((nombre, tid, " / ".join(sorted(actual))))
        # El CENTRO no se toca: en la lista de una estacion hay gente de otras
        # que vino a ayudar, y moverles la nave romperia sus filtros.
        lote.append(UpdateOne({"id": d["id"]},
                              {"$set": {"transporter_id": tid, "driver_id": tid}}))

    print("Modo: %s\n" % ("APLICAR — se escribe" if args.aplicar else "SOLO INFORMAR"))
    print("  ya correctos     %3d" % len(r["ok"]))
    print("  se rellenan      %3d" % len(r["rellenar"]))
    print("  se CORRIGEN      %3d" % len(r["corregir"]))
    print("  chocan           %3d  (no se tocan)" % len(r["choca"]))
    print("  sin ficha        %3d  (no se crean)" % len(r["sin_ficha"]))
    print("  nombre repetido  %3d  (no se tocan)" % len(r["ambiguo"]))

    if r["corregir"]:
        print("\n=== SE CORRIGEN: la ficha tenia otro ID ===")
        for n, t, antes in r["corregir"]:
            print("   %-38s %s   (tenia %s)" % (n[:38], t, antes))
    if r["choca"]:
        print("\n=== CHOCAN: ese ID ya lo tiene otra ficha. Mirar a mano ===")
        for n, t, otro in r["choca"]:
            print("   %-38s %s   lo tiene %s" % (n[:38], t, otro))
    if r["ambiguo"]:
        print("\n=== NOMBRE REPETIDO: hay dos fichas iguales, fusionar antes ===")
        for n, t, k in r["ambiguo"]:
            print("   %-38s %s   (%d fichas)" % (n[:38], t, k))
    if r["sin_ficha"]:

        print("\n=== SIN FICHA por el nombre exacto ===")
        print("    Se busca el mas parecido: casi siempre es la misma persona con")
        print("    una letra de mas ('CARVALHO' vs 'CARLVALHO'). NO se asigna solo:")
        print("    dos apellidos que se parecen son dos personas distintas, y")
        print("    equivocarse aqui le cuelga a alguien las entregas de otro.")
        todos = [(k, v) for k, v in por_nombre.items() if k]
        for n, t in r["sin_ficha"]:
            objetivo = norm(n).split()
            mejor, punt = None, 0.0
            for clave, fichas in todos:
                otros = clave.split()
                if not otros:
                    continue
                # PALABRA A PALABRA Y CON MARGEN DE DOS LETRAS, no comparando
                # palabras identicas. Comparando exacto se escapaba justo lo que
                # esta pantalla busca: 'FANDIAO' contra 'FANDINO' (una tilde que
                # se rompio al pegar) daba 0 coincidencias y la persona salia
                # como si no existiera, teniendo su ficha y su id puestos.
                # Tambien pilla ESPINOSA/ESPINOZA, VILLANOVA/VILANOVA y
                # ACEBEDO/ACEVEDO, que son los tres casos reales que habia.
                comunes = sum(1 for w in objetivo if any(_lev(w, x) <= 2 for x in otros))
                p = comunes / max(len(objetivo), 1)
                if p > punt:
                    mejor, punt = fichas[0], p
            pista = ""
            if mejor and punt >= 0.5:
                ids = {(mejor.get("transporter_id") or "").strip(),
                       (mejor.get("driver_id") or "").strip()} - {""}
                pista = "  ~ %s [%s]%s" % (
                    str(mejor.get("name"))[:32], mejor.get("center") or "?",
                    "  ya tiene " + " / ".join(ids) if ids else "  SIN ID")
            print("   %-38s %-16s%s" % (arregla_mojibake(n)[:38], t, pista))
    if r["rellenar"]:
        print("\n=== SE RELLENAN (no tenian ninguno) ===")
        for n, t in r["rellenar"]:
            print("   %-38s %s" % (n[:38], t))

    if args.aplicar and lote:
        await db.drivers.bulk_write(lote, ordered=False)
        print("\nEscritas %d fichas." % len(lote))
    elif not args.aplicar:
        print("\nNo se ha escrito nada. Repite con --aplicar.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
