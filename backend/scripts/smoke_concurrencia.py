# -*- coding: utf-8 -*-
"""Lo que solo falla con CINCO peticiones a la vez, sobre los creadores.

POR QUE EXISTE
══════════════════════════════════════════════════════════════════════════════
El 02-09-2026, con una empresa de usar y tirar y cinco peticiones simultaneas:

  · 5 altas de la misma matricula  -> 3 furgonetas (la guarda era Python)
  · 5 altas del mismo correo       -> 5 conductores (no habia guarda ninguna)
  · 5 partes de la misma furgoneta -> 5 ordenes abiertas
  · 5 "generar accesos"            -> 21 cuentas para una misma persona, cada
                                      una con su contraseña

Todo respondia 200. En produccion la "primera vez" pasa una sola vez y nadie
la vuelve a ver, asi que si no se prueba aqui no se prueba nunca (gotcha 32).
La defensa son los indices unicos parciales de `_ensure_tenant_indexes` y la
idempotencia de dos minutos al abrir una orden. Este smoke los ejercita.

COMO SE USA
    python backend/scripts/smoke_concurrencia.py

Crea una empresa de usar y tirar (`auditDDHHMMSS`) y la deja: se quita desde
el panel de super-admin. No toca ningun dato de nadie.
"""
import os
import sys
import time
import urllib.error
import urllib.request
import json
from concurrent.futures import ThreadPoolExecutor

API = os.environ.get("FLOTA_API", "https://flotadsp-backend.fly.dev/api")
N = 5
_fallos = []


def pide(ruta, metodo="GET", cuerpo=None, token=None):
    cab = {"Authorization": "Bearer " + token} if token else {}
    datos = None
    if cuerpo is not None:
        datos = json.dumps(cuerpo).encode()
        cab["Content-Type"] = "application/json"
    req = urllib.request.Request(API + ruta, data=datos, method=metodo, headers=cab)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace") or "{}")
        except Exception:                                        # noqa: BLE001
            return e.code, {}
    except Exception as e:                                       # noqa: BLE001
        return 0, {"error": str(e)}


def paso(titulo, ok, detalle=""):
    print("  %-3s %-56s %s" % ("ok " if ok else "MAL", titulo, detalle))
    if not ok:
        _fallos.append(titulo)


def main() -> int:
    suf = time.strftime("%d%H%M%S")
    slug = "audit%s" % suf
    print("FlotaDSP · cinco a la vez sobre los creadores")
    print("API: %s\nempresa de usar y tirar: %s\n" % (API, slug))
    code, d = pide("/auth/register", "POST", {
        "username": slug, "password": "SmokeFlota2026!", "org_name": "Audit %s" % suf,
        "slug": slug, "center": "AUD1", "email": "%s@ejemplo.invalid" % slug})
    T = d.get("access_token", "")
    paso("darse de alta", bool(T), "HTTP %s" % code)
    if not T:
        return 1

    def a_la_vez(ruta, cuerpo, n=N):
        with ThreadPoolExecutor(max_workers=n) as ex:
            return list(ex.map(lambda _: pide(ruta, "POST", cuerpo, token=T)[0], range(n)))

    cs = a_la_vez("/vehicles", {"license_plate": "9999 AUD", "brand": "FORD", "model": "TRANSIT", "center": "AUD1"})
    _, veh = pide("/vehicles", token=T)
    n = sum(1 for v in (veh or []) if "9999" in (v.get("license_plate") or ""))
    paso("5 altas de la misma matricula -> UNA furgoneta", n == 1 and cs.count(200) == 1,
         "quedan %d · codigos %s" % (n, cs))

    correo = "pepe.%s@ejemplo.invalid" % suf
    cs = a_la_vez("/drivers", {"name": "PEPE AUDIT", "email": correo, "center": "AUD1"})
    _, con = pide("/drivers", token=T)
    n = sum(1 for c in (con or []) if (c.get("email") or "").lower() == correo)
    paso("5 altas del mismo correo -> UN conductor", n == 1 and cs.count(200) == 1,
         "quedan %d · codigos %s" % (n, cs))

    code2, _ = pide("/drivers", "POST", {"name": "PEPE AUDIT", "email": correo.upper(), "center": "AUD1"}, token=T)
    paso("y el mismo correo en MAYUSCULAS tampoco entra", code2 == 409, "HTTP %s" % code2)

    _, w = pide("/workshops", "POST", {"name": "Taller Audit", "phone": "600000001", "center": "AUD1"}, token=T)
    vid = next((v["id"] for v in (veh or []) if "9999" in (v.get("license_plate") or "")), "")
    cs = a_la_vez("/work-orders", {"vehicle_id": vid, "workshop_id": w.get("id"), "problema": "Ruido audit"}, n=2)
    _, ots = pide("/work-orders?abiertas=true", token=T)
    n = sum(1 for o in (ots.get("ordenes") or []) if o.get("vehicle_id") == vid)
    paso("dos clics en 'abrir parte' -> UNA orden", n == 1, "abiertas %d · codigos %s" % (n, cs))

    cs = a_la_vez("/auth/driver-accounts/generar", {})
    _, acc = pide("/auth/driver-accounts", token=T)
    lista = acc.get("cuentas") if isinstance(acc, dict) else acc
    por_persona = {}
    for a in (lista or []):
        por_persona[a.get("driver_id") or a.get("email")] = por_persona.get(a.get("driver_id") or a.get("email"), 0) + 1
    repes = {k: v for k, v in por_persona.items() if v > 1}
    paso("5 'generar accesos' a la vez -> UNA cuenta por persona", not repes and cs.count(200) == 5,
         ("repetidas: %s" % repes) if repes else "sin repetidas · codigos %s" % cs)

    print("\nEmpresa de prueba: %s — borrala desde el panel de super-admin" % slug)
    print("\n%d fallos" % len(_fallos))
    return 1 if _fallos else 0


if __name__ == "__main__":
    sys.exit(main())
