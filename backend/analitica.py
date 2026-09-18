# -*- coding: utf-8 -*-
"""Analitica propia de FlotaDSP: por que pantallas pasa la gente y donde se va.

ANONIMA A PROPOSITO. Lo que se guarda por cada pantalla vista es: una clave de
sesion que el navegador se inventa y que MUERE al cerrar la pestana, la
pantalla, la hora y el tipo de visitante (sin sesion / demo / cliente /
conductor / equipo propio). No hay IP, ni cookies, ni identificador que
sobreviva al dia siguiente, ni id de usuario. Por eso lo que se mide son
VISITAS (sesiones), no personas: la misma persona volviendo manana cuenta dos
veces, y aqui no se puede saber. Es mas pobre que Google Analytics y es a
proposito: no hace falta banner de consentimiento porque no se sigue a nadie.

El modulo no toca la base de datos. Recibe eventos ya leidos y devuelve el
informe, para poder probarlo entero con casos inventados —una sesion que sigue
abierta, un salto de hora, un embudo a medias— sin esperar semanas de trafico.

Reglas que mantiene, porque son las que dan cifras falsas si se descuidan:
  · Una sesion que sigue abierta NO cuenta como «se fue de esta pantalla».
  · Recargar la misma pantalla no es una pantalla nueva.
  · El tiempo en pantalla solo se mide hasta la SIGUIENTE pantalla; la ultima
    no se sabe cuanto duro y no se inventa.
  · Los pasos de un embudo cuentan sesiones que TOCARON ese paso, no un camino
    forzado: quien entra directo al registro desde un anuncio no pasa por la
    portada y no por eso deja de registrarse.
"""
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    MADRID = ZoneInfo("Europe/Madrid")
except Exception:                                                # noqa: BLE001
    MADRID = timezone.utc          # sin base de zonas horarias: dias en UTC

# Primer tramo de ruta que existe en la app. Cualquier otra cosa —un robot
# probando /wp-admin— se guarda como «/otra», nunca tal cual.
PRIMEROS = {
    "login", "registro", "planes", "panel", "conductor", "empleo", "taller",
    "apoyo", "dnr", "verify", "privacidad", "terminos", "cookies",
    "aviso-legal", "contacto", "security", "seguridad", "peritaje-tecnico",
    "reset-password", "app", "lab", "t",
}
SEGMENTOS = ("visitante", "demo", "conductor", "cliente", "propio")
_RANGO = {s: i for i, s in enumerate(SEGMENTOS)}
DISPOSITIVOS = ("movil", "tablet", "escritorio")

_BOTS = re.compile(
    r"bot\b|bot/|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|"
    r"curl/|wget|python-requests|httpx|aiohttp|go-http", re.I)

SESION_CERRADA_MIN = 30      # sin actividad tanto rato = la sesion ya termino
AHORA_MIN = 5                # «activos ahora»
MAX_GAP_S = 30 * 60          # mas de esto entre dos pantallas no es «tiempo en pantalla»


def _utc(dt):
    """Mongo devuelve fechas sin zona (UTC); se normaliza para poder restar."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ── ENTRADA: lo que llega del navegador se limpia aqui ──────────────────────
def limpiar_ruta(r):
    """La ruta como PATRON: `/taller/t/:token`, nunca con el token dentro.

    El cliente ya manda el patron; esto es la segunda barrera por si llega una
    ruta real (un cliente viejo, alguien probando a mano). Sin query, sin hash,
    y todo tramo que no parezca un nombre de pantalla se convierte en `:x`.
    """
    r = str(r or "").split("?")[0].split("#")[0].strip()[:120]
    segs = [s for s in r.split("/") if s]
    if not segs:
        return "/"
    if segs[0] not in PRIMEROS:
        return "/otra"
    out = []
    for s in segs[:4]:
        if re.fullmatch(r":[a-z]{1,15}", s) or re.fullmatch(r"[a-z][a-z-]{0,29}", s):
            out.append(s)
        else:
            out.append(":x")
    return "/" + "/".join(out)


def limpiar_sid(v):
    v = str(v or "")
    return v if re.fullmatch(r"[A-Za-z0-9]{8,32}", v) else None


def limpiar_nombre(v):
    v = str(v or "")
    return v if re.fullmatch(r"[a-z][a-z0-9_]{1,39}", v) else None


def limpiar_origen(v):
    """Host de donde viene (sin `www.`) o la fuente de campana. Solo minusculas."""
    v = str(v or "").lower().strip()
    if v.startswith("www."):
        v = v[4:]
    return v if re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,59}", v) else None


def segmento_de(claims):
    """Quien es, mirando el TOKEN que firma el servidor y no lo que diga el cliente."""
    if not claims:
        return "visitante"
    if claims.get("sa") or claims.get("imp") or claims.get("account_type") == "owner":
        return "propio"
    if claims.get("demo"):
        return "demo"
    if claims.get("role") == "driver":
        return "conductor"
    return "cliente"


def evento_desde(cuerpo, user_agent, claims, ahora):
    """El documento a guardar, o None si no hay que guardar nada."""
    if not isinstance(cuerpo, dict) or _BOTS.search(user_agent or ""):
        return None
    sid = limpiar_sid(cuerpo.get("sid"))
    tipo = cuerpo.get("tipo")
    if not sid or tipo not in ("vista", "accion"):
        return None
    seg = segmento_de(claims)
    doc = {"ts": ahora, "sid": sid, "tipo": tipo, "seg": seg,
           "ruta": limpiar_ruta(cuerpo.get("ruta"))}
    if tipo == "accion":
        nombre = limpiar_nombre(cuerpo.get("nombre"))
        if not nombre:
            return None
        doc["nombre"] = nombre
    if cuerpo.get("disp") in DISPOSITIVOS:
        doc["disp"] = cuerpo["disp"]
    for campo in ("ref", "utm"):
        v = limpiar_origen(cuerpo.get(campo))
        if v:
            doc[campo] = v
    # La empresa, no la persona: sirve para contar cuantas empresas usan cada
    # pantalla. Un visitante o el equipo propio no la llevan.
    if seg in ("cliente", "conductor") and claims and claims.get("org_id"):
        doc["org"] = str(claims["org_id"])[:40]
    return doc


# ── SALIDA: el informe ──────────────────────────────────────────────────────
_WEB = {"planes", "registro", "contacto", "privacidad", "terminos", "cookies",
        "aviso-legal", "security", "seguridad", "peritaje-tecnico", "verify", "app"}


def area_de(ruta):
    p = ruta.strip("/").split("/")[0] if ruta != "/" else ""
    if p == "":
        return "web"
    if p in _WEB:
        return "web"
    if p in ("login", "reset-password") or ruta == "/panel/login":
        return "acceso"
    if p == "panel":
        return "panel"
    if p == "conductor":
        return "conductor"
    if p == "empleo":
        return "empleo"
    if p == "t":
        return "tienda"
    if p in ("taller", "apoyo", "dnr"):
        return "enlaces"
    return "otra"


# Cada paso: (etiqueta, "v"/"a", valor). En vista, `*web` = cualquier pantalla
# de la web publica. Los pasos NO son un camino obligado (ver cabecera).
EMBUDOS = [
    {"clave": "alta", "titulo": "De la web a una cuenta", "pasos": [
        ("Entran a la web", "v", "*web"),
        ("Ven los planes", "v", "/planes"),
        ("Abren el registro", "v", "/registro"),
        ("Crean la cuenta", "a", "registro_ok")]},
    {"clave": "planes", "titulo": "Planes y oferta fundador", "pasos": [
        ("Ven los planes", "v", "/planes"),
        ("Eligen un plan", "a", "plan_elegir"),
        ("Abren la oferta fundador", "a", "fundador_abrir"),
        ("Reservan plaza", "a", "fundador_reservado")]},
    {"clave": "tienda", "titulo": "Tienda de ropa", "pasos": [
        ("Ven la tienda", "v", "/t/:token"),
        ("Abren una prenda", "a", "tienda_ficha"),
        ("Pulsan comprar", "a", "tienda_comprar"),
        ("Llegan al pago", "a", "tienda_pago")]},
    {"clave": "empleo", "titulo": "Empleo (candidatos)", "pasos": [
        ("Ven las ofertas", "v", "/empleo"),
        ("Abren una oferta", "v", "/empleo/:slug/:oferta"),
        ("Envian la candidatura", "a", "candidatura_enviada")]},
    {"clave": "cartel", "titulo": "Anuncio de la tienda en Empleo", "pasos": [
        ("Ven una oferta", "v", "/empleo/:slug/:oferta"),
        ("Pulsan el cartel de la ropa", "a", "tienda_cartel_clic")]},
]


def _toca(e, paso):
    _, kind, valor = paso
    if kind == "a":
        return e["tipo"] == "accion" and e.get("nombre") == valor
    if e["tipo"] != "vista":
        return False
    if valor == "*web":
        return area_de(e["ruta"]) == "web"
    return e["ruta"] == valor


def _mediana(xs):
    """Entera: son segundos en pantalla, y «4 min 32,163999 s» no lo lee nadie."""
    if not xs:
        return None
    xs = sorted(xs)
    n = len(xs)
    return round(xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2)


def _pct(a, b):
    return round(100 * a / b, 1) if b else None


def informe(eventos, ahora, seg="externo", dias=30):
    """El informe completo. `eventos` viene ordenado por `ts` ascendente.

    `seg`: `externo` (todo menos el equipo propio; es lo que interesa para
    saber que hace la gente de fuera), `todos`, o un segmento concreto. Se
    filtra por SESION, no por evento: una sesion que empieza sin identificar y
    acaba entrando como cliente es de cliente entera.
    """
    ahora = _utc(ahora)
    sesiones = {}
    for e in eventos:
        sesiones.setdefault(e["sid"], []).append(e)

    elegidas = {}
    # Cuantas visitas hay de CADA tipo, siempre sobre todas: si se contaran
    # sobre el filtro puesto, el selector diria «clientes: 0» estando en «de
    # fuera», que es justo la cifra que se mira para decidir si cambiar de
    # filtro.
    por_seg = Counter()
    for sid, evs in sesiones.items():
        sg = max((e["seg"] for e in evs), key=lambda s: _RANGO.get(s, 0))
        por_seg[sg] += 1
        if seg == "todos" or seg == sg or (seg == "externo" and sg != "propio"):
            elegidas[sid] = (sg, evs)

    corte_cerrada = ahora - timedelta(minutes=SESION_CERRADA_MIN)
    corte_ahora = ahora - timedelta(minutes=AHORA_MIN)

    vistas_total = acciones_total = 0
    cerradas = una_pantalla = activos = 0
    n_pantallas, duraciones = [], []
    por_dia = defaultdict(lambda: [0, 0])          # dia -> [sesiones, vistas]
    por_hora = Counter()
    orgs_total = set()
    disp = Counter()
    canales = Counter()
    areas = Counter()
    acciones_ses = defaultdict(set)
    acciones_n = Counter()
    trans = Counter()
    pantallas = defaultdict(lambda: {
        "vistas": 0, "ses": set(), "entradas": 0, "salidas": 0, "term": 0,
        "gaps": [], "sig": Counter(), "orgs": set()})
    pasos_alcanzados = {f["clave"]: [0] * len(f["pasos"]) for f in EMBUDOS}
    en_embudo = {f["clave"]: 0 for f in EMBUDOS}

    for sid, (sg, evs) in elegidas.items():
        t0, t1 = _utc(evs[0]["ts"]), _utc(evs[-1]["ts"])
        cerrada = t1 < corte_cerrada
        if t1 >= corte_ahora:
            activos += 1
        dia = t0.astimezone(MADRID).date().isoformat()

        # Las vistas de la sesion, sin repetir la misma pantalla seguida.
        vs = []
        for e in evs:
            if e["tipo"] == "vista" and (not vs or vs[-1]["ruta"] != e["ruta"]):
                vs.append(e)
            if e["tipo"] == "accion":
                acciones_total += 1
                acciones_n[e["nombre"]] += 1
                acciones_ses[e["nombre"]].add(sid)
        vistas_total += len(vs)
        por_dia[dia][0] += 1
        por_dia[dia][1] += len(vs)
        por_hora[t0.astimezone(MADRID).hour] += 1
        if evs[0].get("disp"):
            disp[evs[0]["disp"]] += 1
        for e in evs:
            if e.get("org"):
                orgs_total.add(e["org"])

        for a in {area_de(v["ruta"]) for v in vs}:
            areas[a] += 1
        # De donde llegan: solo cuenta a quien aterriza en paginas publicas.
        if vs and any(area_de(v["ruta"]) in ("web", "empleo", "tienda", "enlaces") for v in vs):
            primero = next((e for e in evs if e.get("utm") or e.get("ref")), None)
            canales[(primero.get("utm") or primero.get("ref")) if primero else "directo"] += 1

        n_pantallas.append(len(vs))
        if len(evs) > 1:
            duraciones.append((t1 - t0).total_seconds())
        if cerrada:
            cerradas += 1
            if len(vs) <= 1:
                una_pantalla += 1

        vistos = set()
        for i, v in enumerate(vs):
            p = pantallas[v["ruta"]]
            p["vistas"] += 1
            p["ses"].add(sid)
            if v.get("org"):
                p["orgs"].add(v["org"])
            if i == 0:
                p["entradas"] += 1
            if v["ruta"] not in vistos:
                vistos.add(v["ruta"])
                if cerrada:
                    p["term"] += 1
            if i + 1 < len(vs):
                sig = vs[i + 1]
                gap = (_utc(sig["ts"]) - _utc(v["ts"])).total_seconds()
                if gap <= MAX_GAP_S:
                    p["gaps"].append(gap)
                p["sig"][sig["ruta"]] += 1
                trans[(v["ruta"], sig["ruta"])] += 1
            elif cerrada:
                p["salidas"] += 1

        for f in EMBUDOS:
            toco = [any(_toca(e, paso) for e in evs) for paso in f["pasos"]]
            if any(toco):
                en_embudo[f["clave"]] += 1
            for k, ok in enumerate(toco):
                if ok:
                    pasos_alcanzados[f["clave"]][k] += 1

    n = len(elegidas)

    # Dias sin visitas tambien salen (a cero): una racha muerta se tiene que ver.
    serie = []
    hoy = ahora.astimezone(MADRID).date()
    for k in range(max(1, min(int(dias), 180)) - 1, -1, -1):
        d = (hoy - timedelta(days=k)).isoformat()
        s, v = por_dia.get(d, [0, 0])
        serie.append({"dia": d, "sesiones": s, "vistas": v})

    tabla = []
    for ruta, p in pantallas.items():
        tabla.append({
            "ruta": ruta, "area": area_de(ruta), "vistas": p["vistas"],
            "sesiones": len(p["ses"]), "entradas": p["entradas"],
            "salidas": p["salidas"], "cerradas": p["term"],
            "pct_salida": _pct(p["salidas"], p["term"]),
            "segundos_mediana": _mediana(p["gaps"]),
            "siguiente": [{"ruta": r, "n": c} for r, c in p["sig"].most_common(3)],
            "empresas": len(p["orgs"]),
        })
    tabla.sort(key=lambda r: (-r["sesiones"], r["ruta"]))

    flujos = [{"de": a, "a": b, "n": c} for (a, b), c in trans.most_common(20)]

    embudos = []
    for f in EMBUDOS:
        base = en_embudo[f["clave"]]
        embudos.append({
            "clave": f["clave"], "titulo": f["titulo"], "sesiones": base,
            "pasos": [{"etiqueta": paso[0], "n": pasos_alcanzados[f["clave"]][k],
                       "pct": _pct(pasos_alcanzados[f["clave"]][k], base)}
                      for k, paso in enumerate(f["pasos"])],
        })

    return {
        "segmento": seg,
        "resumen": {
            "sesiones": n, "vistas": vistas_total, "acciones": acciones_total,
            "activos_ahora": activos,
            "empresas_activas": len(orgs_total),
            "pantallas_por_sesion": round(sum(n_pantallas) / n, 1) if n else None,
            "duracion_mediana_s": _mediana([round(x) for x in duraciones]),
            "sesiones_cerradas": cerradas,
            "pct_una_pantalla": _pct(una_pantalla, cerradas),
        },
        "por_segmento": {s: por_seg.get(s, 0) for s in SEGMENTOS},
        "serie": serie,
        "por_hora": [por_hora.get(h, 0) for h in range(24)],
        "areas": dict(areas),
        "pantallas": tabla[:80],
        "flujos": flujos,
        "embudos": embudos,
        "acciones": [{"nombre": k, "veces": acciones_n[k], "sesiones": len(acciones_ses[k])}
                     for k, _ in acciones_n.most_common(30)],
        "canales": [{"canal": k, "sesiones": v} for k, v in canales.most_common(12)],
        "dispositivos": {d: disp.get(d, 0) for d in DISPOSITIVOS},
    }
