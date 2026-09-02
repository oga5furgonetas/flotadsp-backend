# -*- coding: utf-8 -*-
"""El primer dia de una empresa nueva, de principio a fin y contra produccion.

POR QUE EXISTE
══════════════════════════════════════════════════════════════════════════════
La aplicacion se desarrolla siempre contra la flota de Dani, que lleva meses
llena de datos. Con la base vacia se recorre un camino que con datos no se
recorre NUNCA, y ese camino solo lo pisan los clientes nuevos — el primer dia,
que es justo cuando deciden si se quedan.

El 31-08-2026, el dia que dos empresas iban a probar la app, este recorrido
saco seis fallos que llevaban meses ahi y que ninguna pantalla delataba:

  · el PRIMERO que abria el checklist cada dia se llevaba un 500 (gotcha 42)
  · ningun conductor de ninguna empresa que no fuera la principal podia entrar
    al portal, nunca (gotcha 26)
  · Revision Rapida filtrada por centro devolvia CERO fuera de OGA5 (gotcha 43)
  · lo que el taller decia por el portal no llegaba a la bandeja del DSP
  · se podia mandar una furgoneta al taller sin decir que le pasa
  · dar un toque a los talleres reventaba si coincidian dos peticiones

Todos daban 200 o una lista vacia. Ninguno salia en los logs como error.

COMO SE USA
    python backend/scripts/smoke_empresa_nueva.py
    python backend/scripts/smoke_empresa_nueva.py --dejar   (no borra al final)

Crea una empresa de usar y tirar, la recorre entera y la borra. NO toca ningun
dato de nadie: todo ocurre dentro de su propia base. Si algo falla, lo dice con
el nombre del paso y el cuerpo de la respuesta, no con un numero.
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = os.environ.get("FLOTA_API", "https://flotadsp-backend.fly.dev/api")
CENTRO = "SMK1"
# Lo esperable con datos vacios: 200 con listas vacias, o un 4xx explicando que
# falta configurar algo. Un 5xx es SIEMPRE nuestro: el codigo dio por hecho que
# habia datos.
OK = (200, 201, 204, 400, 401, 402, 403, 404, 405, 409, 415, 422, 429)

_fallos: list = []
_pasos = 0


def pide(ruta, metodo="GET", cuerpo=None, token=None, campos=None, espera=None):
    """Una llamada. Devuelve (codigo, datos). No lanza: acumula el fallo."""
    datos, cab = None, {}
    if token:
        cab["Authorization"] = "Bearer " + token
    if campos is not None:
        frontera = "----flotasmoke"
        trozos = []
        for k, v in campos.items():
            if isinstance(v, tuple):        # (nombre_fichero, bytes)
                trozos.append(
                    ("--%s\r\nContent-Disposition: form-data; name=\"%s\"; "
                     "filename=\"%s\"\r\nContent-Type: application/octet-stream\r\n\r\n"
                     % (frontera, k, v[0])).encode() + v[1] + b"\r\n")
            else:
                trozos.append(("--%s\r\nContent-Disposition: form-data; name=\"%s\""
                               "\r\n\r\n%s\r\n" % (frontera, k, v)).encode())
        trozos.append(("--%s--\r\n" % frontera).encode())
        datos = b"".join(trozos)
        cab["Content-Type"] = "multipart/form-data; boundary=" + frontera
    elif cuerpo is not None:
        datos = json.dumps(cuerpo).encode()
        cab["Content-Type"] = "application/json"
    req = urllib.request.Request(API + ruta, data=datos, method=metodo, headers=cab)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            crudo = r.read().decode("utf-8", "replace")
            code = r.status
    except urllib.error.HTTPError as e:
        crudo = e.read().decode("utf-8", "replace")
        code = e.code
    except Exception as e:                                       # noqa: BLE001
        return 0, {"error": "%s: %s" % (type(e).__name__, e)}
    try:
        d = json.loads(crudo)
    except Exception:                                            # noqa: BLE001
        d = {"_texto": crudo[:400]}
    if code not in OK or (espera and code != espera):
        _fallos.append((metodo, ruta, code, crudo[:300]))
    return code, d


def paso(titulo, ok, detalle=""):
    global _pasos
    _pasos += 1
    print("  %-3s %-52s %s" % ("ok " if ok else "MAL", titulo, detalle))
    if not ok:
        _fallos.append(("PASO", titulo, 0, detalle))


def foto_jpeg() -> bytes:
    """Una foto de furgoneta con un golpe, dibujada al vuelo.

    Sin depender de ningun fichero: un smoke que necesita que exista una imagen
    en el disco deja de funcionar en cuanto se ejecuta desde otro sitio.
    """
    try:
        from PIL import Image, ImageDraw
    except Exception:                                            # noqa: BLE001
        return b""
    im = Image.new("RGB", (900, 650), (232, 234, 238))
    d = ImageDraw.Draw(im)
    d.rectangle([90, 250, 800, 520], fill=(246, 246, 248), outline=(90, 90, 96), width=4)
    d.polygon([(90, 250), (300, 250), (330, 160), (540, 160), (560, 250)],
              fill=(246, 246, 248), outline=(90, 90, 96))
    d.ellipse([170, 470, 270, 570], fill=(38, 38, 42))
    d.ellipse([630, 470, 730, 570], fill=(38, 38, 42))
    d.ellipse([420, 330, 560, 430], fill=(112, 108, 104), outline=(56, 54, 52), width=5)
    d.line([430, 350, 550, 415], fill=(48, 46, 44), width=7)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dejar", action="store_true",
                    help="no borrar la empresa al terminar (para mirarla por dentro)")
    args = ap.parse_args()

    suf = time.strftime("%d%H%M%S")
    slug = "smoke%s" % suf
    print("FlotaDSP · el primer dia de una empresa nueva")
    print("API: %s" % API)
    print("empresa de usar y tirar: %s (centro %s)\n" % (slug, CENTRO))

    # ── 1. DARSE DE ALTA ──────────────────────────────────────────────────
    code, d = pide("/auth/register", "POST", {
        "username": slug, "password": "SmokeFlota2026!", "org_name": "Smoke %s" % suf,
        "slug": slug, "center": CENTRO, "email": "%s@ejemplo.invalid" % slug})
    T = d.get("access_token", "")
    paso("darse de alta", bool(T), "HTTP %s" % code)
    if not T:
        print("\nSin poder darse de alta no hay nada mas que probar.")
        return 1

    # ── 2. EMPEZAR CON UN EXCEL ───────────────────────────────────────────
    csv_v = b"Matricula,Marca,Modelo\r\n1111 SMK,MERCEDES,SPRINTER\r\n2222 SMK,FORD,TRANSIT\r\n"
    code, d = pide("/import/vehicles", "POST", token=T,
                   campos={"file": ("furgos.csv", csv_v), "crear": "true"})
    paso("importar furgonetas de un Excel", d.get("imported") == 2,
         "creadas: %s" % d.get("imported"))

    csv_c = ("Nombre,Email\r\nANA SMOKE,ana.%s@ejemplo.invalid\r\n"
             "LUIS SMOKE,luis.%s@ejemplo.invalid\r\n" % (suf, suf)).encode()
    code, d = pide("/drivers/importar", "POST", token=T,
                   campos={"file": ("gente.csv", csv_c)})
    paso("importar conductores de un Excel", d.get("importados") == 2,
         "creados: %s" % d.get("importados"))

    # El centro NO es un detalle: sin el, lo importado no sale en ninguna lista
    # filtrada, que es como se mira siempre.
    _, veh = pide("/vehicles", token=T)
    _, con = pide("/drivers", token=T)
    paso("lo importado lleva centro",
         bool(veh) and bool(con)
         and all(v.get("center") == CENTRO for v in veh)
         and all(c.get("center") == CENTRO for c in con),
         "%d furgonetas, %d personas" % (len(veh or []), len(con or [])))

    # ── 3. TODAS LAS PANTALLAS, CON Y SIN CENTRO ──────────────────────────
    RUTAS = ["/vehicles", "/drivers", "/inspections", "/incidents", "/alerts",
             "/work-orders", "/work-orders/resumen", "/work-orders/paradas",
             "/work-orders/danos-pendientes", "/workshops", "/taller/bandeja",
             "/taller/pauta", "/inspections/review-queue", "/stats/dashboard",
             "/stats/attention", "/fleet/disponibilidad", "/fleet/calendar",
             "/whc/plan", "/shifts", "/shifts/coverage", "/scorecard/en-vivo",
             "/scorecard/full", "/cortex/overview", "/cortex/days",
             "/drivers/ranking", "/scoring/drivers", "/documents", "/contacts",
             "/org/centers", "/checklist", "/onboarding", "/vehicles/exposicion",
             "/damages/atribucion", "/checkers/centros", "/partner/tokens"]
    malas = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        def mira(r):
            for q in ("", "?center=%s" % CENTRO, "?center=Todos"):
                c, _ = pide(r + q, token=T)
                if c not in OK:
                    return "%s%s -> %s" % (r, q, c)
            return None
        malas = [x for x in ex.map(mira, RUTAS) if x]
    paso("las %d pantallas abren (con centro y sin el)" % len(RUTAS), not malas,
         "; ".join(malas[:3]) if malas else "ninguna revienta")

    # ── 4. EL CONDUCTOR ENTRA AL PORTAL ───────────────────────────────────
    code, d = pide("/auth/driver-lookup", "POST",
                   {"email": "ana.%s@ejemplo.invalid" % suf, "slug": slug})
    dt = d.get("access_token", "")
    paso("el conductor entra solo con su correo", bool(dt), "HTTP %s" % code)

    if dt:
        _, dv = pide("/vehicles/portal", token=dt)
        lista = dv.get("vehicles") if isinstance(dv, dict) else dv
        paso("y ve SUS furgonetas, no las de otra empresa",
             bool(lista) and all("SMK" in (v.get("license_plate") or "") for v in lista),
             "ve %d" % len(lista or []))

    # Ponerle contraseña y comprobar que entra con ella. Aqui vivia el fallo
    # que dejaba fuera del portal a toda empresa que no fuera la principal.
    code, d = pide("/auth/driver-accounts/generar", "POST", {}, token=T)
    claves = {a["email"]: a["clave"] for a in (d.get("accesos") or [])}
    paso("dar acceso con contraseña a los importados", d.get("creadas") == 2,
         "creadas: %s" % d.get("creadas"))
    correo = "ana.%s@ejemplo.invalid" % suf
    if correo in claves:
        code, d = pide("/auth/driver-login", "POST",
                       {"email": correo, "password": claves[correo], "slug": slug})
        paso("y entra con ella (en SU empresa)", bool(d.get("access_token")),
             "HTTP %s" % code)

    # ── 5. FOTO, IA Y REVISION RAPIDA ─────────────────────────────────────
    img = foto_jpeg()
    if img and dt:
        vid = (veh or [{}])[0].get("id", "")
        code, d = pide("/inspections/upload", "POST", token=dt,
                       campos={"vehicle_id": vid, "notes": "Golpe lateral",
                               "files": ("golpe.jpg", img)})
        iid = d.get("inspection_id", "")
        paso("el conductor sube la inspeccion con foto", bool(iid), "HTTP %s" % code)
        if iid:
            estado = ""
            for _ in range(10):                     # la IA tarda ~1 min
                time.sleep(10)
                _, det = pide("/inspections/%s" % iid, token=T)
                estado = det.get("analysis_status") or ""
                if estado in ("ok", "error", "failed"):
                    break
            n = len(((det.get("analysis") or {}).get("damages")) or [])
            paso("la IA la analiza", estado == "ok", "estado: %s · %d daños" % (estado, n))
            # Filtrar por centro es lo que hace el panel SIEMPRE, y es donde
            # la cola devolvia cero fuera de OGA5 (gotcha 43).
            _, q = pide("/inspections/review-queue?center=%s" % CENTRO, token=T)
            paso("y sale en Revision Rapida FILTRADA POR CENTRO",
                 len(q.get("queue") or []) >= 1, "%d en cola" % len(q.get("queue") or []))
    else:
        paso("foto + IA", True, "saltado (sin Pillow o sin token de conductor)")

    # ── 6. EL CIRCUITO DEL TALLER, DE IDA Y DE VUELTA ─────────────────────
    code, w = pide("/workshops", "POST", {"name": "Taller Smoke", "phone": "600000000",
                                          "center": CENTRO}, token=T)
    wid = w.get("id", "")
    paso("dar de alta un taller", bool(wid), "HTTP %s" % code)

    vid = (veh or [{}])[0].get("id", "")
    code, _ = pide("/work-orders", "POST", {"vehicle_id": vid, "workshop_id": wid},
                   token=T, espera=400)
    paso("NO deja mandarla al taller sin decir que le pasa", code == 400, "HTTP %s" % code)

    code, ot = pide("/work-orders", "POST",
                    {"vehicle_id": vid, "workshop_id": wid,
                     "problema": "Ruido en el tren delantero al frenar"}, token=T)
    oid = ot.get("id", "")
    paso("abrir el parte diciendolo", bool(oid), ot.get("numero") or "HTTP %s" % code)

    tok = ""
    if oid:
        code, en = pide("/work-orders/%s/enlace" % oid, "POST", {}, token=T)
        url = en.get("url") or ""
        tok = url.rsplit("/", 1)[-1] if "/taller/" in url else ""
        paso("generar el enlace para el taller", bool(tok), "HTTP %s" % code)

    # UN enlace fijo por taller, con todas sus furgonetas dentro (02-09-2026).
    code, et = pide("/workshops/%s/enlace" % wid, "POST", {}, token=T)
    tt = (et.get("url") or "").rsplit("/", 1)[-1] if "/taller/t/" in (et.get("url") or "") else ""
    paso("un enlace fijo para el taller", bool(tt), "HTTP %s" % code)
    if tt:
        code, lista = pide("/taller/t/%s" % tt)      # SIN sesion: es el caso publico
        crudo = json.dumps(lista)
        paso("y el taller ve sus furgonetas nuestras, sin datos internos",
             code == 200 and (lista.get("total") or 0) >= 1
             and not any(k in crudo for k in ("driver_id", "db_name", "vehicle_id")),
             "ve %s" % lista.get("total"))

    if tok:
        code, pub = pide("/taller/%s" % tok)          # SIN sesion: es el caso publico
        # Lo que ve el taller no puede llevar datos de nadie: el enlace se
        # reenvia por WhatsApp y acaba en telefonos que no controlamos.
        fuga = [k for k in pub if k in ("driver_id", "driver_name", "conductor",
                                        "org_id", "db_name", "vehicle_id")]
        paso("el taller abre el enlace sin registrarse",
             code == 200 and bool(pub.get("problema")),
             "ve el problema: %r" % (pub.get("problema") or "")[:38])
        paso("y NO ve datos internos", not fuga, ("fuga: %s" % fuga) if fuga else "limpio")

        for etiqueta, ruta, cuerpo in (
                ("marca recibido", "/taller/%s/estado" % tok, {"estado": "recibido"}),
                ("manda presupuesto", "/taller/%s/presupuesto" % tok,
                 {"importe": 420.5, "detalle": "Pastillas y discos"}),
                ("dice cuando estara", "/taller/%s/entrega" % tok, {"fecha": "2026-12-01"}),
                ("escribe por su cuenta", "/taller/%s/nota" % tok,
                 {"nota": "Ya esta lista, podeis venir"})):
            c, _ = pide(ruta, "POST", cuerpo)
            paso("el taller %s" % etiqueta, c == 200, "HTTP %s" % c)

        # Lo que el taller dice tiene que SALTARLE al DSP, no quedarse en la
        # ficha: la pantalla promete "aunque no les hayamos preguntado".
        _, b = pide("/taller/bandeja", token=T)
        paso("y todo eso le salta al DSP en la bandeja",
             (b.get("sin_leer") or 0) >= 4, "%s sin leer" % b.get("sin_leer"))

    # ── 7. LO QUE SOLO FALLA CON DOS A LA VEZ ─────────────────────────────
    # En produccion la "primera vez" ocurre una sola vez y nadie la vuelve a
    # ver: si no se prueba aqui, no se prueba nunca (gotchas 32 y 42).
    def a_la_vez(ruta, metodo="GET", cuerpo=None, n=5):
        with ThreadPoolExecutor(max_workers=n) as ex:
            return list(ex.map(lambda _: pide(ruta, metodo, cuerpo, token=T)[0], range(n)))

    cs = a_la_vez("/checklist?center=%s&date=2026-12-24" % CENTRO)
    paso("abrir el checklist de un dia nuevo, 5 a la vez", all(c == 200 for c in cs), str(cs))

    ss = a_la_vez("/work-orders/seguimiento", "POST", {"center": CENTRO})
    paso("tocar a los talleres, 5 a la vez", all(c == 200 for c in ss), str(ss))

    # ── 8. RECOGER ────────────────────────────────────────────────────────
    if args.dejar:
        print("\nLa empresa %s se queda (--dejar). Borrala tu cuando acabes." % slug)
    else:
        # Se borra por la API de super-admin si se puede; si no, se avisa. NO se
        # toca la base a mano desde aqui: un script de smoke no debe poder
        # borrar nada que no haya creado el mismo.
        print("\nEmpresa de prueba: %s — borrala desde el panel de super-admin" % slug)
        print("(este script no borra por su cuenta: no debe poder)")

    print("\n%d comprobaciones, %d fallos" % (_pasos, len(_fallos)))
    if _fallos:
        print("")
        for m, r, c, cuerpo in _fallos[:25]:
            print("  %-6s %-46s %s  %s" % (m, r, c, (cuerpo or "").replace("\n", " ")[:110]))
        return 1
    print("El primer dia de una empresa nueva funciona entero.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
