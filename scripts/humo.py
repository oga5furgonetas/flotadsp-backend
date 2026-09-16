# -*- coding: utf-8 -*-
"""PRUEBA DE HUMO: ¿responden de verdad las pantallas después de desplegar?

Por qué existe
──────────────
El 15-09-2026 desplegué un 500 en `/incorporaciones/personas` —la pantalla que
Dani estaba usando— y no me enteré hasta que la probé a mano un rato después.
Una variable local pisó a otra del mismo bucle y, con una persona sin cuenta de
Amazon, reventaba.

Los 24 checkers no lo vieron porque LEEN el código, y los tests tampoco porque
son de AST: ninguno EJECUTA el endpoint. `fly deploy` tampoco comprueba nada
después de subir, así que un 500 puede quedarse horas en producción sin que
nadie lo sepa.

Esto llama de verdad a las pantallas principales con un token de mantenimiento y
falla si alguna no contesta 200. Tarda segundos y es lo único que distingue
«desplegado» de «funcionando».

Uso:  python scripts/humo.py            (contra produccion)
      python scripts/humo.py http://localhost:8000
"""
import base64
import datetime
import hashlib
import hmac
import json
import os
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://flotadsp-backend.fly.dev").rstrip("/")
SECRETO = os.environ.get("SECRET_KEY") or "iwa2852bawaa922n1o19snmashsad82b2a82a242"

# Las pantallas que Dani abre todos los dias. Si una de estas se cae, se nota en
# el trabajo de alguien esa misma manana.
PANTALLAS = [
    "/health",
    "/incorporaciones/personas",
    "/dnr/investigaciones",
    "/asociados",
    "/whc/estado",
    "/stats/dashboard",
    "/drivers",
    "/vehicles",
    "/cortex/overview?day=%s" % datetime.date.today().isoformat(),
    "/cortex/informes-auto",
]


def _token() -> str:
    """El mismo token de mantenimiento que ya se usa para auditar.

    `role: admin` y `sub: maintenance-claude` —las dos cosas las exige
    `get_current_user`— y SIN `permissions`: el panel hace
    `perms.includes(key)` y un `['*']` no pasa (gotcha 61).
    """
    b = lambda x: base64.urlsafe_b64encode(x).decode().rstrip("=")   # noqa: E731
    cab = b(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    ahora = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    cue = b(json.dumps({"sub": "maintenance-claude", "username": "humo",
                        "role": "admin", "account_type": "owner",
                        "exp": ahora + 300}, separators=(",", ":")).encode())
    firma = b(hmac.new(SECRETO.encode(), ("%s.%s" % (cab, cue)).encode(), hashlib.sha256).digest())
    return "%s.%s.%s" % (cab, cue, firma)


def main() -> int:
    tok = _token()
    malas = []
    for ruta in PANTALLAS:
        url = "%s/api%s" % (BASE, ruta)
        pet = urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})
        try:
            with urllib.request.urlopen(pet, timeout=60) as r:
                cuerpo = r.read(400_000)
                # 200 no basta: un JSON roto tambien es una pantalla en blanco.
                json.loads(cuerpo)
                print("  ok   %s" % ruta)
        except urllib.error.HTTPError as e:
            detalle = ""
            try:
                detalle = json.loads(e.read(2000)).get("detail", "")
            except Exception:                                    # noqa: BLE001
                pass
            print("  FALLA %s -> HTTP %s %s" % (ruta, e.code, str(detalle)[:90]))
            malas.append(ruta)
        except Exception as e:                                   # noqa: BLE001
            print("  FALLA %s -> %s" % (ruta, str(e)[:90]))
            malas.append(ruta)
    print()
    if malas:
        print("HUMO: %d pantalla(s) rotas: %s" % (len(malas), ", ".join(malas)))
        return 1
    print("humo OK: las %d pantallas contestan y devuelven JSON válido" % len(PANTALLAS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
