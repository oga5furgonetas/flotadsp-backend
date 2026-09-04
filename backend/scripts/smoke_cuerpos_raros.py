# -*- coding: utf-8 -*-
"""Manda a cada mutacion SUS PROPIOS campos con el tipo cambiado. Contra STAGING.

    set STAGING_TOKEN=<jwt de admin de staging>
    python backend/scripts/smoke_cuerpos_raros.py

POR QUE EXISTE. El barrido del 02-09-2026 mando el cuerpo VACIO a las 175
mutaciones y salio casi limpio, y eso dejo la impresion de que estaban
validadas. No lo estaban: lo que llega de un cliente viejo, de un formulario a
medio migrar o de alguien probando no es un cuerpo vacio, es un campo con el
TIPO cambiado — una lista donde se espera texto, un booleano donde se espera un
codigo. `(data.get("x") or "").strip()` es correcto con texto y **un 500 en
cuanto no lo es**, porque una lista no tiene `.strip()`.

La primera version de esto mandaba diez nombres de campo fijos («center»,
«email»...) y encontro 11 endpoints. Solo eran los que casualmente usan esos
nombres. Sacando los campos del CODIGO de cada endpoint —los `data.get("x")` de
su propio cuerpo— salieron **43 de 216**, dos de ellas publicas. Es la
diferencia entre medir una muestra y medir el alcance, y por eso el script lee
`server.py` en vez de llevar una lista dentro.

Estado a 05-09-2026: 43 -> 30 tras meter `_texto_cuerpo` y `_entero` donde se
leia el cuerpo a pelo. Las 30 que quedan piden mirarlas una a una: fallan
dentro de helpers (`_bloqueo_doc`), iterando algo que no es una lista o
llamando `.upper()` sobre un booleano. Ninguna es publica.

NUNCA CONTRA PRODUCCION, y nunca las rutas que borran: la lista `PROHIBIDAS`
las deja fuera, y los ids de la URL son inexistentes a proposito para que la
respuesta correcta sea 404 y no se pueda tocar nada.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("STAGING_API", "https://flotadsp-backend-staging.fly.dev/api")
TOK = os.environ.get("STAGING_TOKEN", "")
SERVER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server.py")

# Fuera: borran de verdad, avisan a personas o cuestan dinero.
PROHIBIDAS = re.compile(
    r"reset|/all\b|purge|restore|backup|/admin/org|wipe|limpiar|vaciar|"
    r"telegram|whatsapp|email|notify|enviar|send|webhook|lemonsqueezy|"
    r"generar-accesos|driver-accounts/generar|ingest", re.I)

NOEXISTE = "00000000-0000-4000-8000-000000000000"
RAROS = [("lista", ["x", "y"]), ("objeto", {"a": 1}), ("booleano", True),
         ("numero", 12345), ("texto_no_numero", "siete")]

LINEAS = open(SERVER, encoding="utf-8-sig").read().split("\n")


def _campos(i_dec):
    """Los nombres que ese endpoint lee del cuerpo, de su propio codigo."""
    j = i_dec
    while j < len(LINEAS) and not re.match(r"\s*(async\s+)?def\s", LINEAS[j]):
        j += 1
    k, cuerpo = j + 1, []
    while k < len(LINEAS):
        l = LINEAS[k]
        if l.strip() and not l.startswith((" ", "\t")):
            break
        cuerpo.append(l)
        k += 1
    txt = "\n".join(cuerpo)
    n = set(re.findall(r'(?:data|body|payload|cuerpo)\.get\(\s*["\']([\w.-]+)["\']', txt))
    n |= set(re.findall(r'(?:data|body|payload|cuerpo)\[\s*["\']([\w.-]+)["\']\s*\]', txt))
    return sorted(x for x in n if len(x) < 40)[:25]


def _rutas():
    fuera = []
    for i, l in enumerate(LINEAS):
        m = re.match(r'\s*@(app|api_router|auth_router)\.(post|put|patch|delete)\(\s*["\']([^"\']+)', l)
        if not m:
            continue
        pref = {"app": "", "api_router": "/api", "auth_router": "/api/auth"}[m.group(1)]
        ruta = pref + m.group(3)
        if PROHIBIDAS.search(ruta) or not ruta.startswith("/api"):
            continue
        fuera.append((m.group(2).upper(), ruta, i + 1, _campos(i)))
    return fuera


def _pide(metodo, ruta, cuerpo):
    req = urllib.request.Request(BASE + ruta, data=json.dumps(cuerpo).encode(), method=metodo,
                                 headers={"Authorization": "Bearer " + TOK,
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()[:150]
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:250]
    except Exception as e:                                   # noqa: BLE001
        return "EXC", str(e)[:150].encode()


def main():
    if not TOK:
        print("Falta STAGING_TOKEN (un JWT de admin de staging).")
        return 2
    if "staging" not in BASE:
        print("Este script SOLO va contra staging. BASE = %s" % BASE)
        return 2
    rutas = _rutas()
    print("mutaciones que se prueban: %d" % len(rutas))
    malos, n = [], 0
    for metodo, ruta, linea, campos in rutas:
        if not campos:
            continue
        p = re.sub(r"\{(\w+)\}", NOEXISTE, ruta)[4:]
        for nombre, valor in RAROS:
            st, body = _pide(metodo, p, {c: valor for c in campos})
            n += 1
            if st == "EXC" or (isinstance(st, int) and st >= 500):
                malos.append((metodo, ruta, linea, nombre))
                break
    print("\n%d llamadas, %d endpoints con 5xx" % (n, len(malos)))
    for metodo, ruta, linea, tipo in malos:
        print("  %-6s %-48s L%-6s con %s" % (metodo, ruta, linea, tipo))
    # Trinquete: hoy son 30 y ninguna publica. Si sube, es que se ha anadido un
    # endpoint que lee el cuerpo a pelo — y se nota el mismo dia, que es de lo
    # que se trata.
    TOPE = 30
    if len(malos) > TOPE:
        print("\nSUBE de %d: hay endpoints nuevos que leen el cuerpo sin validar." % TOPE)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
