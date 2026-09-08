# -*- coding: utf-8 -*-
"""Cuadra las ayudas contra Cortex. Se ejecuta cuando alguien dice "a mi no me sale".

POR QUE EXISTE. Este contador ha fallado cuatro veces en dos dias, y ninguna la
encontre leyendo el codigo: dos falsos positivos salieron buscandolos a
proposito y dos falsos NEGATIVOS los cantaron los conductores -Jose Arturo con
un cero teniendo 28 paquetes en la ruta de otro, y Christian Gallego con 65 que
no aparecian-. Lo que hace falta no es prometer que ya esta bien: es poder
comprobarlo en un minuto.

QUE COMPRUEBA, y son cuatro cosas distintas:
  1. que el reparto del resumen CUADRE con el total de cada ruta -es un
     emparejamiento por orden, y si no cuadra se descarta la ruta entera-;
  2. que nuestro numero por persona no se quede por debajo del que sale del
     resumen solo;
  3. que no haya fichas SIN `transporter_id` a las que Cortex si ve: sin ese
     campo la persona no existe para nada que venga de Cortex y le sale cero
     sin que falle nada;
  4. que el resumen de cada dia ya cerrado este COMPLETO (`REMAINING` a cero);
     si se capturo a media tarde, todo lo que salga de el se queda corto.

Uso:
    python backend/scripts/cuadrar_ayudas.py [YYYY-MM]

Necesita `MONGO_URL` en el entorno. Sale con codigo 1 si algo no cuadra.
"""
import ast
import collections
import io
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"


def _del_server(nombres_fn, nombres_const):
    """Las funciones REALES del backend, no una copia (gotcha 40).

    Una copia deja de probar el codigo que corre en cuanto alguien toca el
    original, y este script existe justo para no volver a fiarse de eso.
    """
    arbol = ast.parse(io.open(SERVER, encoding="utf-8-sig").read())
    amb = {}
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in nombres_const:
            amb[n.targets[0].id] = ast.literal_eval(n.value)
    for n in arbol.body:
        if isinstance(n, ast.FunctionDef) and n.name in nombres_fn:
            exec(compile(ast.fix_missing_locations(ast.Module(body=[n], type_ignores=[])),  # noqa: S102
                         "<server>", "exec"), amb)
    faltan = (set(nombres_fn) | set(nombres_const)) - set(amb)
    if faltan:
        raise SystemExit("no estan en server.py: %s" % sorted(faltan))
    return amb


def main():
    mes = sys.argv[1] if len(sys.argv) > 1 else datetime.now(timezone.utc).strftime("%Y-%m")
    url = os.environ.get("MONGO_URL")
    if not url:
        raise SystemExit("falta MONGO_URL")
    from pymongo import MongoClient
    db = MongoClient(url)[os.environ.get("DB_NAME", "flotadsp")]

    amb = _del_server(
        ("_cuenta_paquetes", "_ayudas_de_un_resumen", "_ayudas_juntar", "_ayudas_reparte"),
        ("_CX_NO_DESPACHADO", "_CX_OK", "_AYUDA_MIN_PAQUETES"))
    minimo = amb["_AYUDA_MIN_PAQUETES"]
    problemas = []

    # ---- 1. el resumen cuadra ruta a ruta --------------------------------
    naves_con_paquetes = set(db.cortex_packages.distinct(
        "service_area_id", {"service_day": {"$regex": "^" + mes}}))
    titulares, nombres, del_resumen = {}, {}, []
    rutas_tot = rutas_ok = 0
    dias_incompletos = []
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for d in db.cortex_resumen.find({"dia": {"$regex": "^" + mes}},
                                    {"_id": 0, "dia": 1, "rutas": 1, "cuentas": 1,
                                     "gente": 1, "service_area_id": 1}):
        for r in (d.get("rutas") or []):
            if r.get("routeCode") and r.get("transporterId"):
                titulares[(d["dia"], d.get("service_area_id"), r["routeCode"])] = r["transporterId"]
        for g in (d.get("gente") or []):
            if g.get("transporterId"):
                nombres.setdefault(g["transporterId"], g.get("nombre") or "?")
        rep = amb["_ayudas_de_un_resumen"](d.get("rutas") or [], d.get("cuentas") or [])
        con_entregas = [r for r in (d.get("rutas") or [])
                        if ((r.get("paquetes") or {}).get("DELIVERED") or 0) > 0]
        rutas_tot += len(con_entregas)
        rutas_ok += len(rep)
        quedan = sum((r.get("paquetes") or {}).get("REMAINING", 0) for r in (d.get("rutas") or []))
        # Solo cuenta la nave de la que ingerimos paquetes: las otras tienen su
        # resumen a medias y avisar de ellas seria gritar en falso, que es como
        # un checker deja de leerse.
        if quedan > 50 and d["dia"] < hoy and d.get("service_area_id") in naves_con_paquetes:
            dias_incompletos.append((d["dia"], quedan))
        for ruta, gente in rep.items():
            for tid, (a, e) in gente.items():
                del_resumen.append((d["dia"], d.get("service_area_id"), ruta, tid, a, e))

    print("1. RESUMEN DE CORTEX")
    print("   rutas con entregas: %d | reparto que cuadra: %d (%.1f %%)"
          % (rutas_tot, rutas_ok, 100.0 * rutas_ok / rutas_tot if rutas_tot else 0))
    if rutas_tot and rutas_ok < rutas_tot * 0.9:
        problemas.append("solo cuadra el %.0f %% de las rutas" % (100.0 * rutas_ok / rutas_tot))
    if dias_incompletos:
        print("   AVISO: dias cerrados con el resumen a medias: %s" % dias_incompletos)
        problemas.append("resumen incompleto en %d dia(s)" % len(dias_incompletos))

    # ---- 2. nuestro numero frente al del resumen -------------------------
    grupos = []
    for a in db.cortex_packages.aggregate([
            {"$match": {"service_day": {"$regex": "^" + mes},
                        "state": {"$nin": list(amb["_CX_NO_DESPACHADO"])}}},
            {"$group": {"_id": {"d": "$service_day", "a": "$service_area_id",
                                "r": "$route_code", "t": "$driver_id"},
                        "paq": {"$sum": 1},
                        "ent": {"$sum": {"$cond": [{"$in": ["$state", list(amb["_CX_OK"])]},
                                                   1, 0]}}}}]):
        k = a["_id"]
        if k.get("d") and k.get("r") and k.get("t"):
            grupos.append((k["d"], k.get("a"), k["r"], k["t"], a["paq"], a["ent"]))
    juntos = amb["_ayudas_juntar"](grupos, del_resumen)

    solo_resumen = collections.defaultdict(int)
    for dia, nave, ruta, tid, a, _e in del_resumen:
        if titulares.get((dia, nave, ruta)) not in (None, tid) and a >= minimo:
            solo_resumen[tid] += a

    print("")
    print("2. POR PERSONA (nuestro numero frente al del resumen solo)")
    menos = []
    for tid in sorted(solo_resumen, key=lambda x: -solo_resumen[x]):
        r = amb["_ayudas_reparte"](juntos, titulares, {tid})
        mio = sum(x["paquetes"] for x in r["hice"])
        if mio < solo_resumen[tid]:
            menos.append((nombres.get(tid, tid), mio, solo_resumen[tid]))
    if menos:
        for n, a, b in menos[:15]:
            print("   POR DEBAJO DEL RESUMEN: %-30s nuestro %4d < resumen %4d" % (n[:30], a, b))
        problemas.append("%d persona(s) por debajo del resumen" % len(menos))
    else:
        print("   ninguna persona sale por debajo del resumen (%d con ayudas)" % len(solo_resumen))

    # ---- 3. fichas sin emparejar -----------------------------------------
    desde = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    vistos = {}
    for d in db.cortex_resumen.find({"dia": {"$gte": desde}}, {"_id": 0, "gente": 1}):
        for g in (d.get("gente") or []):
            if g.get("nombre") and g.get("transporterId"):
                vistos[" ".join((g["nombre"] or "").upper().split())] = g["transporterId"]
    # UNA PERSONA, NO UNA FICHA. Hay gente dada de alta dos veces (gotcha 15) y
    # el portal junta sus fichas por correo: si UNA de ellas tiene el id, esa
    # persona ya ve sus datos. Contar fichas en vez de personas daba 11 avisos
    # de los que 10 no eran nada.
    fichas = list(db.drivers.find({"status": {"$nin": ["deleted", "baja"]}},
                                  {"_id": 0, "name": 1, "email": 1, "transporter_id": 1}))
    # Se agrupa por NOMBRE y se acepta como una sola persona si sus fichas no
    # tienen dos correos distintos: la mitad de los duplicados tiene una ficha
    # sin correo, y separandolas por correo esa ficha huerfana salia como una
    # persona invisible cuando su gemela ya tiene el id. Es la misma regla que
    # usa el endpoint para proponer.
    personas = collections.defaultdict(list)
    for f in fichas:
        personas[" ".join((f.get("name") or "").upper().split())].append(f)
    sin = []
    for nombre, grupo in personas.items():
        correos = {(x.get("email") or "").strip().lower() for x in grupo}
        correos.discard("")
        if len(correos) > 1:
            # Dos correos = dos personas distintas con el mismo nombre: cada
            # una necesita el suyo, asi que se mira ficha a ficha.
            trozos = [[x] for x in grupo]
        else:
            trozos = [grupo]
        for t in trozos:
            if not any(x.get("transporter_id") for x in t) and nombre in vistos:
                sin.append(t[0].get("name"))
    print("")
    print("3. PERSONAS SIN `transporter_id` A LAS QUE CORTEX SI VE: %d" % len(sin))
    for n in sin[:10]:
        print("    %s" % n)
    if sin:
        problemas.append("%d persona(s) sin emparejar con Cortex" % len(sin))
        print("   -> se arregla en el panel de Conductores, 'Sin emparejar con Cortex'")

    print("")
    if problemas:
        print("NO CUADRA: %s" % "; ".join(problemas))
        return 1
    print("CUADRA: nada que reportar en %s" % mes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
