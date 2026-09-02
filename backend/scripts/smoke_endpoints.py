# -*- coding: utf-8 -*-
"""Smoke test de los endpoints que se han ido anadiendo. Se corre EN la maquina.

    fly ssh console -a flotadsp-backend -C "/bin/sh -c 'cd /app && python scripts/smoke_endpoints.py'"

No comprueba solo que respondan 200: comprueba que el DATO cuadra. Un endpoint
que devuelve una lista vacia responde 200 igual de bien que uno que funciona, y
eso es justo lo que no se quiere descubrir dos semanas despues.

Salio a cuenta a la primera: destapo un 500 en `/scorecard/revisar-dia` que se
habia colado hacia una hora, con un cerrojo de envio que reventaba al llamarlo
dos veces el mismo dia (ver `_ya_enviado_hoy`).
"""
import os, json, datetime, urllib.request
from jose import jwt
# org_id "owner" y account_type "owner": son los de la organizacion principal en
# `global_db.organizations`. Hasta el 02-09-2026 ponia "oga5", que no existe,
# asi que todo lo que resuelve la org (centros, plan, `_centro_por_defecto`)
# media contra una empresa vacia — misma trampa que el gotcha 40.
t = jwt.encode({"sub":"maintenance-claude","role":"admin","org_id":"owner","db_name":"flotadsp",
                "account_type":"owner",
                "exp": datetime.datetime.utcnow()+datetime.timedelta(minutes=15)},
               os.environ["SECRET_KEY"], algorithm="HS256")
H = {"Authorization": "Bearer " + t}
B = "http://localhost:8080/api"

PRUEBAS = [
    ("GET",  "/health", None, lambda d: d.get("status") == "ok"),
    ("GET",  "/damages/atribucion?dias=90", None, lambda d: "danos" in d),
    ("GET",  "/vehicles/exposicion", None, lambda d: d.get("total", 0) > 0),
    ("GET",  "/scorecard/en-vivo?center=OGA5", None, lambda d: len(d.get("semanas") or []) > 0),
    ("GET",  "/cortex/direcciones-problema?dias=90", None, lambda d: "direcciones" in d),
    ("GET",  "/scorecard/full?center=OGA5", None, lambda d: all(m.get("peso") is not None for m in d.get("metrics") or [])),
    ("GET",  "/work-orders/paradas", None, lambda d: True),
    ("GET",  "/work-orders/danos-pendientes", None, lambda d: "danos" in d),
    ("GET",  "/whatsapp/estado", None, lambda d: "configurado" in d),
    ("POST", "/work-orders/seguimiento", {}, lambda d: "recordatorios" in d),
    ("POST", "/scorecard/revisar-dia", {}, lambda d: "avisos" in d),
    ("GET",  "/vehicles/duplicados", None, lambda d: d.get("parten_historial") == 0),
    ("GET",  "/vehicles/itv/pendientes", None, lambda d: "sin_fecha" in d),
    ("GET",  "/drivers/duplicados", None, lambda d: d.get("total") == 0),
    ("GET",  "/vehicles/odometro/sospechosas", None, lambda d: d.get("sospechosas") == 0),
    ("GET",  "/cortex/direcciones-problema?dias=7", None, lambda d: d.get("total", 0) > 0),
    ("GET",  "/vehicles/faltan", None, lambda d: "resumen" in d and d.get("activas", 0) > 0),
    # INVARIANTE: ninguna furgoneta en taller sin fecha de entrada. Si vuelve a
    # aparecer una, es que hay un camino que se salta `_auto_incident_on_workshop`.
    ("GET",  "/checkers/estados-vehiculo", None,
     lambda d: d.get("por_clase", {}).get("SAFE_TO_AUTOCORRECT", 0) == 0),

]
ok = mal = 0
for metodo, ruta, body, comprueba in PRUEBAS:
    try:
        r = urllib.request.Request(B + ruta, method=metodo, headers=dict(H))
        if body is not None:
            r.add_header("Content-Type", "application/json")
            r.data = json.dumps(body).encode()
        d = json.loads(urllib.request.urlopen(r, timeout=90).read().decode())
        bien = comprueba(d)
        print("  %-4s %-46s %s" % (metodo, ruta[:46], "OK" if bien else "RESPONDE PERO EL DATO NO CUADRA"))
        ok += 1 if bien else 0
        mal += 0 if bien else 1
    except Exception as e:
        cuerpo = e.read().decode()[:120] if hasattr(e, "read") else str(e)[:120]
        print("  %-4s %-46s FALLA %s %s" % (metodo, ruta[:46], getattr(e, "code", ""), cuerpo))
        mal += 1
# INVARIANTE: los dias ya congelados siguen teniendo sus paquetes. Un paquete
# solo desaparece por el TTL de 90 dias, asi que un dia cerrado de hace dos o
# tres dias tiene que conservar (casi) todos los que conto la foto. El
# 01-09-2026 se borraron dos meses de Cortex de un clic y NADA lo detecto hasta
# que alguien miro la base al dia siguiente; la copia de R2 rota a los 14 dias,
# asi que esto tiene que gritar antes de que la ultima copia buena se vaya.
try:
    r = urllib.request.Request(B + "/cortex/dias-congelados?center=Todos&limite=10", headers=dict(H))
    fotos = json.loads(urllib.request.urlopen(r, timeout=90).read().decode()).get("dias") or []
    r = urllib.request.Request(B + "/cortex/days?days=30", headers=dict(H))
    dias = json.loads(urllib.request.urlopen(r, timeout=90).read().decode())
    dias = dias.get("days") if isinstance(dias, dict) else dias
    por_dia = {}
    for x in dias or []:
        por_dia[x.get("day") or x.get("service_day")] = por_dia.get(x.get("day") or x.get("service_day"), 0) + int(x.get("count") or x.get("n") or x.get("total") or 0)
    hoy = datetime.date.today()
    hundidos = []
    for f in fotos:
        d = f.get("service_day") or ""
        try:
            edad = (hoy - datetime.date.fromisoformat(d)).days
        except ValueError:
            continue
        total = int(f.get("total") or 0)
        if not f.get("cerrado") or edad < 2 or total < 100:
            continue
        # La foto cuenta un centro; /cortex/days cuenta todos. Con la mitad ya
        # vale: lo que se busca es un hundimiento, no una diferencia de cajones.
        if por_dia.get(d, 0) < total * 0.5:
            hundidos.append("%s: foto %d, quedan %d" % (d, total, por_dia.get(d, 0)))
    bien = not hundidos
    print("  %-4s %-46s %s" % ("INV", "dias congelados conservan sus paquetes",
                               "OK" if bien else "HUNDIDO: " + "; ".join(hundidos)))
    ok += 1 if bien else 0
    mal += 0 if bien else 1
except Exception as e:
    print("  %-4s %-46s FALLA %s" % ("INV", "dias congelados conservan sus paquetes", str(e)[:120]))
    mal += 1
# INVARIANTE: ninguna incidencia automatica "Vehiculo en taller" sigue abierta
# para una furgoneta que ya no esta en el taller. Habia 7 desde julio (02-09-2026):
# nadie las cerraba y contaban en las "incidencias abiertas" del dashboard.
try:
    from pymongo import MongoClient as _MC
    _dbi = _MC(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "flotadsp")]
    en_taller = {v["id"] for v in _dbi.vehicles.find({"status": "taller"}, {"id": 1})}
    huerfanas = [i["title"] for i in _dbi.incidents.find(
        {"status": "open", "auto_created": True}, {"title": 1, "vehicle_id": 1})
        if i.get("vehicle_id") not in en_taller]
    bien = not huerfanas
    print("  %-4s %-46s %s" % ("INV", "incidencias de taller cerradas al salir",
                               "OK" if bien else "ABIERTAS SIN TALLER: " + ", ".join(huerfanas[:5])))
    ok += 1 if bien else 0
    mal += 0 if bien else 1
except Exception as e:
    print("  %-4s %-46s FALLA %s" % ("INV", "incidencias de taller cerradas al salir", str(e)[:120]))
    mal += 1
# INVARIANTE: los indices unicos que el codigo da por hechos EXISTEN en la base
# principal. `_idx` no revienta si uno falla (gotcha 9: con duplicados dentro
# la creacion falla y se queda sin indice, en silencio): el except de
# duplicado que lo acompaña se vuelve papel mojado y nadie se entera. Se mira
# en Mongo directamente, que para eso este smoke corre en la maquina.
try:
    from pymongo import MongoClient
    _db = MongoClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "flotadsp")]
    faltan = [f"{col}.{nombre}" for col, nombre in (
        ("vehicles", "matricula_unica_viva"), ("drivers", "email_unico_activo"),
        ("driver_accounts", "driver_id_unico"), ("daily_checklists", "center_1_date_1_shift_1"),
        ("cortex_stations", "service_area_id_1"))
        if not _db[col].index_information().get(nombre, {}).get("unique")]
    bien = not faltan
    print("  %-4s %-46s %s" % ("INV", "los indices unicos declarados existen",
                               "OK" if bien else "FALTAN: " + ", ".join(faltan)))
    ok += 1 if bien else 0
    mal += 0 if bien else 1
except Exception as e:
    print("  %-4s %-46s FALLA %s" % ("INV", "los indices unicos declarados existen", str(e)[:120]))
    mal += 1
print("\n%d bien, %d mal" % (ok, mal))
