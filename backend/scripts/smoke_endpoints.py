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
t = jwt.encode({"sub":"maintenance-claude","role":"admin","org_id":"oga5","db_name":"flotadsp",
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
print("\n%d bien, %d mal" % (ok, mal))
