# -*- coding: utf-8 -*-
"""
tareas_ia.py — FlotaDSP AI: encargos para más tarde y preasignación de furgonetas.

QUÉ RESUELVE
------------
Hasta ahora el chat no podía aceptar un encargo para MÁS TARDE ("monta la
plantilla de DGA1 mañana, cuando salgan las rutas en Cortex") ni recordar los
pares conductor→furgoneta que el dispatcher pega en el chat. Este módulo añade
las dos piezas, sin inventar nada:

  1. PREASIGNACIÓN — el dispatcher pega "estas son las furgonetas de mañana" y
     se guardan los pares CONDUCTOR → MATRÍCULA **para esa fecha concreta**.
     Cada día es independiente: nada se arrastra de un día para otro.
  2. TAREAS PROGRAMADAS — el encargo queda guardado y un bucle de fondo lo
     ejecuta solo cuando los datos existen (las rutas de Cortex de ese día ya
     subidas). Si al acabar el día no llegaron a salir, la tarea caduca y se
     avisa. Nunca se queda callada.

La plantilla lista, por cada conductor que sale en Cortex: primero su(s)
ruta(s) y después la furgoneta que le toca. La furgoneta sale SIEMPRE de un
dato real: primero la preasignación del día; si no la hay, la furgoneta fija
de su ficha. Si no hay ninguna de las dos, se dice "sin furgoneta" — nunca se
adivina.

LÍMITES (deliberados)
---------------------
  · Solo datos de la propia organización y de los centros del usuario.
  · Nunca inventa una matrícula ni un emparejamiento dudoso: lo deja marcado
    para que lo resuelva una persona.
  · Lo que no sabe hacer se registra en `ia_peticiones` y se dice claramente,
    en vez de fingir que lo hizo.

Este fichero es autónomo: no importa nada del server. El server le pasa `db`,
su dependencia de autenticación y (opcional) su función de aviso por Telegram.
"""

from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
import uuid
from datetime import date as _date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

TZ = ZoneInfo("Europe/Madrid")

COL_TAREAS = "ia_tareas"
COL_PREASIGNACION = "ia_preasignacion"
COL_PETICIONES = "ia_peticiones"

# Cada cuánto revisa el bucle de fondo si ya se puede ejecutar algo (segundos).
INTERVALO_BUCLE_S = 600

TIPOS_TAREA = ("plantilla",)
ESTADOS_TAREA = ("pendiente", "hecha", "cancelada", "caducada", "error")


# =============================================================================
# FECHAS EN CRISTIANO
# =============================================================================

_DIAS_SEMANA = {
    "lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3,
    "viernes": 4, "sabado": 5, "domingo": 6,
}
_NOMBRE_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
_MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}


def sin_acentos(s):
    """Quita tildes y diéresis. 'Pérez' → 'Perez'. La ñ se queda en n."""
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def hoy_madrid():
    """Fecha de HOY en hora española (no UTC: a las 23:30 aquí, en UTC ya es otro día)."""
    return datetime.now(TZ).date()


def ahora_iso():
    return datetime.now(timezone.utc).isoformat()


def fecha_iso(d):
    return d.strftime("%Y-%m-%d") if isinstance(d, (_date, datetime)) else str(d)


def etiqueta_fecha(iso):
    """'2026-09-19' → 'sábado 19/09/2026'."""
    try:
        d = datetime.strptime(str(iso)[:10], "%Y-%m-%d").date()
    except Exception:
        return str(iso)
    return f"{_NOMBRE_DIA[d.weekday()]} {d.strftime('%d/%m/%Y')}"


def parse_fecha_es(texto, hoy=None):
    """Saca la fecha de lo que escribe el dispatcher. Devuelve ISO o None.

    Entiende: hoy · mañana · pasado mañana · el sábado · el próximo lunes ·
    20/09 · 20-09-2026 · 20 de septiembre · 2026-09-20.
    Un día de la semana siempre significa el PRÓXIMO (si hoy es sábado y
    escribe "el sábado", es el de dentro de 7 días; para hoy diría "hoy").
    """
    hoy = hoy or hoy_madrid()
    t = sin_acentos((texto or "").lower())

    # ISO explícito
    m = re.search(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})\b", t)
    if m:
        try:
            return fecha_iso(_date(int(m.group(1)), int(m.group(2)), int(m.group(3))))
        except ValueError:
            pass

    # "esta mañana" / "por la mañana" = momento del día de HOY, no el día siguiente
    t_dia = re.sub(r"\b(esta|por la|de la|a la|en la)\s+manana\b", " ", t)
    manana_era_momento = bool(re.search(r"\bmanana\b", t)) and not re.search(r"\bmanana\b", t_dia)

    if "pasado manana" in t_dia:
        return fecha_iso(hoy + timedelta(days=2))
    if re.search(r"\bmanana\b", t_dia):
        return fecha_iso(hoy + timedelta(days=1))
    if re.search(r"\bhoy\b", t_dia) or manana_era_momento:
        return fecha_iso(hoy)

    # 20/09, 20-09-2026, 20/9/26
    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", t_dia)
    if m:
        dia, mes = int(m.group(1)), int(m.group(2))
        anio = int(m.group(3)) if m.group(3) else hoy.year
        if anio < 100:
            anio += 2000
        try:
            f = _date(anio, mes, dia)
            # Sin año escrito y ya pasó: se refiere al año que viene
            if not m.group(3) and f < hoy:
                f = _date(anio + 1, mes, dia)
            return fecha_iso(f)
        except ValueError:
            pass

    # "20 de septiembre"
    m = re.search(r"\b(\d{1,2})\s+de\s+([a-z]+)", t_dia)
    if m and m.group(2) in _MESES:
        try:
            f = _date(hoy.year, _MESES[m.group(2)], int(m.group(1)))
            if f < hoy:
                f = _date(hoy.year + 1, _MESES[m.group(2)], int(m.group(1)))
            return fecha_iso(f)
        except ValueError:
            pass

    # "el sábado", "el próximo lunes"
    for dia, idx in _DIAS_SEMANA.items():
        if re.search(rf"\b{dia}\b", t_dia):
            delta = (idx - hoy.weekday()) % 7
            if delta == 0:
                delta = 7
            return fecha_iso(hoy + timedelta(days=delta))

    return None


# =============================================================================
# MATRÍCULAS Y NOMBRES
# =============================================================================

# Formato actual (1234 ABC) y el antiguo (C-1234-BCD / PO-1234-AB).
_RE_MAT_VIEJA = re.compile(r"(?<![A-Z0-9])([A-Z]{1,2})\s?[-·.]?\s?(\d{4})\s?[-·.]?\s?([A-Z]{1,2})(?![A-Z0-9])")
_RE_MAT_NUEVA = re.compile(r"(?<![A-Z0-9])(\d{4})\s?[-·.]?\s?([A-Z]{3})(?![A-Z0-9])")


def normaliza_matricula(p):
    """'1234-ABC' → '1234ABC'."""
    return "".join(c for c in str(p or "").upper() if c.isalnum())


def formato_matricula(norm):
    """'1234ABC' → '1234 ABC' (como se lee en la calle)."""
    n = normaliza_matricula(norm)
    if re.fullmatch(r"\d{4}[A-Z]{3}", n):
        return f"{n[:4]} {n[4:]}"
    if re.fullmatch(r"[A-Z]{1,2}\d{4}[A-Z]{1,2}", n):
        m = re.fullmatch(r"([A-Z]{1,2})(\d{4})([A-Z]{1,2})", n)
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return n


def buscar_matriculas(texto):
    """Matrículas de una línea: [(normalizada, inicio, fin)], sin solaparse."""
    t = (texto or "").upper()
    encontradas = []
    ocupado = [False] * (len(t) + 1)

    def _añadir(m):
        if any(ocupado[i] for i in range(m.start(), m.end())):
            return
        for i in range(m.start(), m.end()):
            ocupado[i] = True
        encontradas.append((normaliza_matricula(m.group(0)), m.start(), m.end()))

    for m in _RE_MAT_VIEJA.finditer(t):   # la antigua primero: incluye letras delante
        _añadir(m)
    for m in _RE_MAT_NUEVA.finditer(t):
        _añadir(m)

    encontradas.sort(key=lambda x: x[1])
    return encontradas


# Partículas que no identifican a nadie (nombres gallegos: "DA SILVA", "DE LA IGLESIA")
_PARTICULAS = {"de", "del", "la", "las", "los", "el", "da", "do", "das", "dos",
               "van", "von", "di", "y", "e", "i"}

# Ruido que el dispatcher escribe alrededor del par, y que no es parte del nombre
_RUIDO_BORDE = re.compile(
    r"^(?:\W|\b(?:furgoneta|furgo|furgonetas|van|matricula|matriculas|coche|vehiculo|"
    r"conductor|conductora|conductores|driver|da|para|lleva|llevara|va|con|coge|cogera|"
    r"asignada|asignadas|asignado|asignados|toca|tocaria|sera|es|en|el|la|los|las)\b)+|"
    r"(?:\W|\b(?:furgoneta|furgo|van|matricula|conductor|driver|lleva|va|con|coge|"
    r"asignada|asignado|toca|tocaria|sera|es)\b)+$",
    re.IGNORECASE)


def limpia_nombre(s):
    """Deja solo el nombre: quita separadores y las palabras de relleno de los bordes."""
    s = re.sub(r"[\t|]+", " ", str(s or ""))
    s = re.sub(r"\s*(?:-+>|→|=>|=|:|·|–|—)\s*", " ", s)
    anterior = None
    while anterior != s:
        anterior = s
        s = _RUIDO_BORDE.sub(" ", s).strip(" -.,;·\t")
    return re.sub(r"\s{2,}", " ", s).strip(" -.,;·\t")


def palabras_nombre(nombre):
    """Palabras significativas del nombre, sin tildes ni partículas."""
    s = sin_acentos(str(nombre or "").lower()).replace(",", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return {w for w in s.split() if len(w) > 1 and w not in _PARTICULAS}


def puntuar_nombres(a, b):
    """Parecido entre dos nombres (0-100). Pensado para NO equivocarse:
    apellidos sueltos no bastan salvo que el nombre entero sea de una palabra."""
    pa, pb = palabras_nombre(a), palabras_nombre(b)
    if not pa or not pb:
        return 0
    comunes = pa & pb
    if not comunes:
        return 0
    if pa == pb:
        return 100
    if pa <= pb or pb <= pa:
        return 90
    if len(comunes) >= 2:
        return 80
    if len(pa) == 1 or len(pb) == 1:
        return 60
    return 40


def emparejar_nombre(nombre, candidatos, campo="conductor", minimo=80):
    """Busca a `nombre` entre `candidatos`. Devuelve (indice, motivo).

    motivo: 'ok' · 'sin_coincidencia' · 'ambiguo' (dos personas encajan igual de
    bien → no elige ninguna: lo resuelve una persona, no la máquina).
    """
    puntuaciones = [(i, puntuar_nombres(nombre, c.get(campo))) for i, c in enumerate(candidatos)]
    puntuaciones = [(i, p) for i, p in puntuaciones if p > 0]
    if not puntuaciones:
        return None, "sin_coincidencia"
    mejor = max(p for _, p in puntuaciones)
    empatados = [i for i, p in puntuaciones if p == mejor]
    if mejor < minimo:
        # Coincidencia floja (un solo apellido): solo vale si es la única que hay
        if mejor >= 60 and len(empatados) == 1 and len(puntuaciones) == 1:
            return empatados[0], "ok"
        return None, "sin_coincidencia"
    if len(empatados) > 1:
        return None, "ambiguo"
    return empatados[0], "ok"


def parse_pares(texto):
    """Lee los pares CONDUCTOR → MATRÍCULA que el dispatcher pega en el chat.

    Acepta prácticamente cualquier forma: "JUAN PEREZ - 1234ABC",
    "1234 ABC: Juan Pérez", "PEREZ GARCIA, JUAN\t1234ABC", varias por línea
    separadas por ; o ,.

    Devuelve (pares, avisos). Cada par: {conductor, matricula}.
    """
    pares, avisos = [], []
    por_conductor = {}

    for linea_cruda in str(texto or "").splitlines():
        linea = linea_cruda.strip()
        if not linea:
            continue
        mats = buscar_matriculas(linea)
        if not mats:
            continue
        trozos = [linea] if len(mats) == 1 else re.split(r"[;,]|\s+y\s+", linea)
        for trozo in trozos:
            tm = buscar_matriculas(trozo)
            if len(tm) != 1:
                if tm:
                    avisos.append(f"No entendí esta parte, ponla en una línea por furgoneta: «{trozo.strip()}»")
                continue
            matricula, ini, fin = tm[0]
            nombre = limpia_nombre(trozo[:ini] + " " + trozo[fin:])
            if len(nombre) < 3 or not re.search(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}", nombre):
                avisos.append(f"{formato_matricula(matricula)}: no vi a qué conductor la pones.")
                continue
            clave = " ".join(sorted(palabras_nombre(nombre)))
            if clave in por_conductor:
                anterior = por_conductor[clave]
                if anterior["matricula"] != matricula:
                    avisos.append(
                        f"{nombre}: lo pusiste con dos furgonetas "
                        f"({formato_matricula(anterior['matricula'])} y {formato_matricula(matricula)}). "
                        f"Me quedo con la última.")
                anterior["matricula"] = matricula
                anterior["conductor"] = nombre
            else:
                par = {"conductor": nombre, "matricula": matricula}
                por_conductor[clave] = par
                pares.append(par)

    # Una misma furgoneta para dos conductores: se avisa, no se decide
    por_matricula = {}
    for p in pares:
        por_matricula.setdefault(p["matricula"], []).append(p["conductor"])
    for mat, gente in por_matricula.items():
        if len(gente) > 1:
            avisos.append(f"{formato_matricula(mat)} está puesta a {len(gente)} conductores: {', '.join(gente)}.")

    return pares, avisos


def detectar_centro(texto, centros=None):
    """Busca el centro (OGA5, DGA1…) en el texto, SOLO entre los del usuario.

    No se adivina con un patrón genérico a propósito: un código de ruta (CX101)
    se parece demasiado al de un centro y acabaría montando la plantilla del
    sitio equivocado. Sin centro claro → None y se pregunta.
    """
    t = (texto or "").upper()
    for c in (centros or []):
        if c and re.search(rf"(?<![A-Z0-9]){re.escape(str(c).upper())}(?![A-Z0-9])", t):
            return c
    return None


async def centros_conocidos(db):
    """Centros que existen de verdad en los datos (por si el token no los trae)."""
    centros = set()
    for col in ("vehicles", "drivers"):
        try:
            for c in await db[col].distinct("center"):
                if c:
                    centros.add(str(c))
        except Exception:
            pass
    return sorted(centros)


# =============================================================================
# PREASIGNACIÓN (pares del día, guardados por fecha y centro)
# =============================================================================

async def obtener_preasignacion(db, fecha, centro):
    return await db[COL_PREASIGNACION].find_one({"fecha": fecha, "centro": centro}, {"_id": 0})


async def guardar_preasignacion(db, fecha, centro, pares, usuario=None, texto=None, modo="reemplazar"):
    """Guarda los pares de ESE día. modo='reemplazar' (por defecto) o 'añadir'."""
    existente = await obtener_preasignacion(db, fecha, centro)
    finales = list(pares)
    if modo == "añadir" and existente:
        vistos = {" ".join(sorted(palabras_nombre(p["conductor"]))) for p in pares}
        for viejo in (existente.get("pares") or []):
            if " ".join(sorted(palabras_nombre(viejo.get("conductor")))) not in vistos:
                finales.append(viejo)

    doc = {
        "fecha": fecha,
        "centro": centro,
        "pares": finales,
        "actualizada_at": ahora_iso(),
        "actualizada_por": (usuario or {}).get("name") if isinstance(usuario, dict) else usuario,
        "texto_original": (texto or "")[:4000],
    }
    if existente:
        await db[COL_PREASIGNACION].update_one({"fecha": fecha, "centro": centro}, {"$set": doc})
        doc["id"] = existente.get("id")
    else:
        doc["id"] = str(uuid.uuid4())
        doc["creada_at"] = ahora_iso()
        await db[COL_PREASIGNACION].insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def borrar_preasignacion(db, fecha, centro):
    r = await db[COL_PREASIGNACION].delete_many({"fecha": fecha, "centro": centro})
    return getattr(r, "deleted_count", 0)


# =============================================================================
# PLANTILLA: rutas de Cortex + furgoneta de cada uno
# =============================================================================

async def _rutas_del_dia(db, fecha, centro):
    """Rutas que Cortex ya sacó ese día en ese centro. (rutas, origen)."""
    docs = await db.amazon_reports.find(
        {"center": centro, "created_at": {"$regex": f"^{fecha}"}},
        {"_id": 0, "analysis": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(20)
    for d in docs:
        an = d.get("analysis") or {}
        if an.get("is_routes") and an.get("routes"):
            return list(an["routes"]), "informe"

    # Plan B: el histórico que se va acumulando en cada subida
    hist = await db.route_history.find(
        {"date": fecha, "center": centro}, {"_id": 0}
    ).sort("snapshot_at", -1).to_list(500)
    if hist:
        vistos = {}
        for h in hist:
            clave = (h.get("transporter_id") or "") + "|" + (h.get("code") or "")
            if clave not in vistos:
                vistos[clave] = {
                    "code": h.get("code") or "",
                    "transporter_id": h.get("transporter_id") or "",
                    "driver_name": h.get("driver_name") or "",
                    "service": h.get("service") or "",
                    "stops_total": h.get("stops_total") or 0,
                }
        return list(vistos.values()), "historico"

    return [], None


async def construir_plantilla(db, fecha, centro):
    """Monta la plantilla del día: cada conductor con su ruta y su furgoneta.

    Nunca adivina una matrícula: preasignación del día → furgoneta fija de la
    ficha → "sin furgoneta". Si Cortex todavía no sacó las rutas, devuelve
    listo=False con motivo='sin_rutas' (y la tarea se queda esperando).
    """
    rutas, origen_rutas = await _rutas_del_dia(db, fecha, centro)
    if not rutas:
        return {"listo": False, "motivo": "sin_rutas", "fecha": fecha, "centro": centro}

    pre = await obtener_preasignacion(db, fecha, centro)
    pares = list((pre or {}).get("pares") or [])
    usados = [False] * len(pares)

    conductores = await db.drivers.find(
        {}, {"_id": 0, "id": 1, "name": 1, "driver_id": 1, "center": 1}
    ).to_list(3000)
    vehiculos = await db.vehicles.find(
        {}, {"_id": 0, "id": 1, "license_plate": 1, "current_driver_id": 1, "center": 1}
    ).to_list(3000)
    veh_por_conductor = {}
    for v in vehiculos:
        if v.get("current_driver_id"):
            veh_por_conductor.setdefault(v["current_driver_id"], v)
    conductor_por_tid = {}
    for c in conductores:
        tid = (c.get("driver_id") or "").strip().upper()
        if tid:
            conductor_por_tid.setdefault(tid, c)

    # Un conductor puede llevar más de una ruta: se agrupan
    grupos = {}
    for r in rutas:
        nombre = (r.get("driver_name") or "").strip()
        tid = (r.get("transporter_id") or "").strip().upper()
        clave = tid or " ".join(sorted(palabras_nombre(nombre))) or (r.get("code") or "")
        g = grupos.setdefault(clave, {"conductor": nombre, "transporter_id": tid, "rutas": []})
        if nombre and not g["conductor"]:
            g["conductor"] = nombre
        g["rutas"].append({
            "code": (r.get("code") or "").strip(),
            "service": (r.get("service") or "").strip(),
            "stops_total": r.get("stops_total") or 0,
        })

    filas = []
    for g in grupos.values():
        fila = {
            "conductor": g["conductor"] or "(sin nombre en Cortex)",
            "transporter_id": g["transporter_id"],
            "rutas": sorted(g["rutas"], key=lambda x: x["code"]),
            "matricula": None,
            "matricula_texto": "",
            "origen": None,
            "aviso": None,
        }

        # 1) Lo que dijo el dispatcher para HOY
        idx, motivo = emparejar_nombre(fila["conductor"], pares)
        if idx is not None:
            fila["matricula"] = pares[idx]["matricula"]
            fila["origen"] = "preasignacion"
            usados[idx] = True
        elif motivo == "ambiguo":
            fila["aviso"] = "Hay dos preasignaciones que encajan con este nombre: dímelo tú."

        # 2) Si no, la furgoneta fija de su ficha
        if not fila["matricula"]:
            ficha = conductor_por_tid.get(fila["transporter_id"])
            if not ficha:
                candidatos = [c for c in conductores
                              if not c.get("center") or c.get("center") == centro]
                i2, m2 = emparejar_nombre(fila["conductor"], candidatos, campo="name")
                ficha = candidatos[i2] if i2 is not None else None
                if m2 == "ambiguo" and not fila["aviso"]:
                    fila["aviso"] = "Hay dos conductores con ese nombre en la base: dímelo tú."
            veh = veh_por_conductor.get((ficha or {}).get("id")) if ficha else None
            if veh and veh.get("license_plate"):
                fila["matricula"] = normaliza_matricula(veh["license_plate"])
                fila["origen"] = "ficha"

        fila["matricula_texto"] = formato_matricula(fila["matricula"]) if fila["matricula"] else ""
        filas.append(fila)

    filas.sort(key=lambda f: ((f["rutas"][0]["code"] if f["rutas"] else "zzz"), f["conductor"]))

    sobrantes = [
        {"conductor": p["conductor"], "matricula": p["matricula"],
         "matricula_texto": formato_matricula(p["matricula"])}
        for i, p in enumerate(pares) if not usados[i]
    ]

    resultado = {
        "listo": True,
        "fecha": fecha,
        "centro": centro,
        "origen_rutas": origen_rutas,
        "generada_at": ahora_iso(),
        "filas": filas,
        "sobrantes": sobrantes,
        "resumen": {
            "conductores": len(filas),
            "rutas": sum(len(f["rutas"]) for f in filas),
            "con_furgoneta": sum(1 for f in filas if f["matricula"]),
            "sin_furgoneta": sum(1 for f in filas if not f["matricula"]),
            "de_preasignacion": sum(1 for f in filas if f["origen"] == "preasignacion"),
            "de_ficha": sum(1 for f in filas if f["origen"] == "ficha"),
            "preasignadas_sin_usar": len(sobrantes),
            "pares_preasignados": len(pares),
        },
    }
    resultado["texto"] = formatear_plantilla(resultado)
    return resultado


def formatear_plantilla(p):
    """La plantilla en texto plano, lista para pegar en el chat o en Telegram."""
    if not p.get("listo"):
        return "Todavía no hay rutas de Cortex para ese día."

    r = p["resumen"]
    lineas = [
        f"PLANTILLA {p['centro']} — {etiqueta_fecha(p['fecha'])}",
        f"{r['conductores']} conductores · {r['rutas']} rutas · "
        f"{r['con_furgoneta']} con furgoneta · {r['sin_furgoneta']} sin furgoneta",
        "",
    ]

    def _rutas_texto(f):
        return ", ".join(
            x["code"] + (f" ({x['stops_total']} par.)" if x["stops_total"] else "")
            for x in f["rutas"] if x["code"]
        ) or "sin código de ruta"

    ancho = min(max([len(f["conductor"]) for f in p["filas"]] + [10]), 32)
    ancho_rutas = min(max([len(_rutas_texto(f)) for f in p["filas"]] + [8]), 40)
    for f in p["filas"]:
        nombre = f["conductor"][:ancho].ljust(ancho)
        rutas = _rutas_texto(f)[:ancho_rutas].ljust(ancho_rutas)
        if f["matricula"]:
            etiqueta = {"preasignacion": "preasignada", "ficha": "de su ficha"}.get(f["origen"], "")
            furgo = f"{f['matricula_texto']}  ({etiqueta})"
        else:
            furgo = "SIN FURGONETA — dime cuál le pones"
        lineas.append(f"{nombre}  {rutas}  →  {furgo}")
        if f.get("aviso"):
            lineas.append(f"{' ' * (ancho + 2)}⚠ {f['aviso']}")

    if p["sobrantes"]:
        lineas.append("")
        lineas.append("Preasignadas que hoy no salen en Cortex:")
        for s in p["sobrantes"]:
            lineas.append(f"  · {s['conductor']} → {s['matricula_texto']}")

    return "\n".join(lineas)


# =============================================================================
# TAREAS PROGRAMADAS
# =============================================================================

async def crear_tarea(db, tipo, fecha, centro, texto="", usuario=None):
    """Guarda el encargo. Si ya hay uno igual pendiente, devuelve ese (no duplica)."""
    existente = await db[COL_TAREAS].find_one(
        {"tipo": tipo, "fecha": fecha, "centro": centro, "estado": "pendiente"}, {"_id": 0})
    if existente:
        return existente, False

    doc = {
        "id": str(uuid.uuid4()),
        "tipo": tipo,
        "fecha": fecha,
        "centro": centro,
        "estado": "pendiente",
        "texto_original": (texto or "")[:2000],
        "creada_por": (usuario or {}).get("name") if isinstance(usuario, dict) else usuario,
        "creada_at": ahora_iso(),
        "intentos": 0,
        "ultimo_intento": None,
        "ejecutada_at": None,
        "resultado": None,
    }
    await db[COL_TAREAS].insert_one(dict(doc))
    doc.pop("_id", None)
    return doc, True


async def listar_tareas(db, estado=None, centro=None, limite=100):
    q = {}
    if estado:
        q["estado"] = estado
    if centro:
        q["centro"] = centro
    return await db[COL_TAREAS].find(q, {"_id": 0}).sort("creada_at", -1).to_list(limite)


async def cancelar_tarea(db, tarea_id):
    r = await db[COL_TAREAS].update_one(
        {"id": tarea_id, "estado": "pendiente"},
        {"$set": {"estado": "cancelada", "cancelada_at": ahora_iso()}})
    return getattr(r, "modified_count", 0) > 0


async def ejecutar_tarea(db, tarea, notificar=None):
    """Intenta ejecutar una tarea. Si los datos aún no están, la deja pendiente."""
    if tarea.get("tipo") != "plantilla":
        await db[COL_TAREAS].update_one(
            {"id": tarea["id"]},
            {"$set": {"estado": "error", "error": f"Tipo de tarea desconocido: {tarea.get('tipo')}"}})
        return {"estado": "error", "motivo": "tipo_desconocido"}

    try:
        p = await construir_plantilla(db, tarea["fecha"], tarea["centro"])
    except Exception as e:
        logger.error("tareas_ia: error montando la plantilla %s/%s: %s",
                     tarea.get("centro"), tarea.get("fecha"), e)
        await db[COL_TAREAS].update_one(
            {"id": tarea["id"]},
            {"$set": {"error": str(e)[:500], "ultimo_intento": ahora_iso()},
             "$inc": {"intentos": 1}})
        return {"estado": "pendiente", "motivo": "error", "error": str(e)}

    if not p.get("listo"):
        await db[COL_TAREAS].update_one(
            {"id": tarea["id"]},
            {"$set": {"ultimo_intento": ahora_iso()}, "$inc": {"intentos": 1}})
        return {"estado": "pendiente", "motivo": p.get("motivo")}

    await db[COL_TAREAS].update_one(
        {"id": tarea["id"]},
        {"$set": {"estado": "hecha", "ejecutada_at": ahora_iso(),
                  "resultado": p, "ultimo_intento": ahora_iso()},
         "$inc": {"intentos": 1}})

    if notificar:
        try:
            await notificar(
                f"Plantilla {p['centro']} — {etiqueta_fecha(p['fecha'])}",
                p["texto"])
        except Exception as e:
            logger.warning("tareas_ia: no se pudo avisar: %s", e)

    return {"estado": "hecha", "plantilla": p}


async def procesar_tareas(db, notificar=None, hoy=None):
    """Una pasada del bucle: ejecuta lo que ya se puede y caduca lo que se pasó."""
    hoy_str = fecha_iso(hoy or hoy_madrid())
    pendientes = await db[COL_TAREAS].find({"estado": "pendiente"}, {"_id": 0}).to_list(200)

    hechas, esperando, caducadas = 0, 0, 0
    for t in pendientes:
        fecha = str(t.get("fecha") or "")
        if fecha > hoy_str:
            continue                      # aún no le toca
        if fecha < hoy_str:
            await db[COL_TAREAS].update_one(
                {"id": t["id"]},
                {"$set": {"estado": "caducada", "caducada_at": ahora_iso()}})
            caducadas += 1
            if notificar:
                try:
                    await notificar(
                        f"Plantilla {t.get('centro')} — {etiqueta_fecha(fecha)}",
                        "No llegué a montarla: Cortex no sacó las rutas de ese día "
                        "(o no se subió el archivo). La tarea queda cerrada.")
                except Exception:
                    pass
            continue
        r = await ejecutar_tarea(db, t, notificar=notificar)
        if r.get("estado") == "hecha":
            hechas += 1
        else:
            esperando += 1

    return {"hechas": hechas, "esperando": esperando, "caducadas": caducadas,
            "revisadas": len(pendientes)}


def iniciar_bucle(db, obtener_bases=None, fijar_base=None, notificar=None,
                  intervalo=INTERVALO_BUCLE_S, espera_inicial=45):
    """Arranca el bucle de fondo. Devuelve la task de asyncio.

    obtener_bases/fijar_base: solo en multi-tenant (una BD por organización).
    """
    async def _bucle():
        await asyncio.sleep(espera_inicial)
        while True:
            try:
                bases = await obtener_bases() if obtener_bases else [None]
                for base in bases:
                    if base and fijar_base:
                        fijar_base(base)
                    try:
                        r = await procesar_tareas(db, notificar=notificar)
                        if r["hechas"] or r["caducadas"]:
                            logger.info("tareas_ia (%s): %s", base or "principal", r)
                    except Exception as e:
                        logger.warning("tareas_ia: fallo en %s: %s", base or "principal", e)
                if fijar_base:
                    fijar_base(None)
            except Exception as e:
                logger.error("tareas_ia bucle: %s", e)
            await asyncio.sleep(intervalo)

    return asyncio.create_task(_bucle())


# =============================================================================
# PETICIONES QUE AÚN NO SÉ HACER
# =============================================================================

async def registrar_peticion(db, texto, centro=None, usuario=None, motivo="no_entendida"):
    """Lo que el dispatcher pide y todavía no se sabe hacer queda registrado.
    Así se ve qué falta de verdad, en vez de perderse en un chat."""
    doc = {
        "id": str(uuid.uuid4()),
        "texto": (texto or "")[:2000],
        "centro": centro,
        "motivo": motivo,
        "usuario": (usuario or {}).get("name") if isinstance(usuario, dict) else usuario,
        "created_at": ahora_iso(),
        "atendida": False,
    }
    try:
        await db[COL_PETICIONES].insert_one(dict(doc))
    except Exception as e:
        logger.warning("tareas_ia: no se pudo registrar la petición: %s", e)
    doc.pop("_id", None)
    return doc


# =============================================================================
# EL CEREBRO: entender lo que el dispatcher escribe en el chat
# =============================================================================

_RE_CANCELAR = re.compile(r"\b(cancela|cancelar|anula|anular|olvida|olvidate|quita|borra|elimina)\b")
_RE_OBJETO_TAREA = re.compile(r"\b(tarea|tareas|encargo|encargos|programad\w*|plantilla|cuadrante)\b")
_RE_CONSULTAR = re.compile(r"\b(que|cual|cuales|cuanta\w*|cuanto\w*|tienes|teneis|hay|queda\w*|"
                           r"lista|listame|listar|muestra|muestrame|dime|ensename|pendiente\w*|"
                           r"programad\w*)\b")
_RE_PLANTILLA = re.compile(r"\b(plantilla|cuadrante|reparto|asignacion|asignaciones|preasignacion)\b")
_RE_MONTAR = re.compile(r"\b(monta|montar|montes|genera|generar|generes|prepara|preparar|prepares|"
                        r"haz|hacer|hagas|arma|armar|saca|sacar|saques|pon|poner|pongas)\b")
_RE_RUTAS = re.compile(r"\b(rutas?|cortex|drivers?|conductores)\b")
_RE_AÑADIR = re.compile(r"\b(ademas|anade|anades|anadir|suma|sumale|agrega|agregar|tambien)\b")


async def procesar_mensaje(db, texto, centro=None, centros=None, usuario=None,
                           notificar=None, fecha=None, hoy=None, registrar=True):
    """Convierte el mensaje del dispatcher en acciones reales.

    Devuelve {accion, respuesta, datos}. `respuesta` está escrita para soltarla
    tal cual en el chat. Si algo no se sabe hacer, se dice y se registra — no
    se finge.
    """
    hoy_d = hoy or hoy_madrid()
    hoy_str = fecha_iso(hoy_d)
    t = sin_acentos((texto or "").lower())

    centros = list(centros or [])
    centro = detectar_centro(texto, centros) or centro
    if not centro and len(centros) == 1:
        centro = centros[0]

    fecha_texto = parse_fecha_es(texto, hoy_d)
    fecha_final = fecha_texto or fecha
    pares, avisos = parse_pares(texto)

    pide_plantilla = bool(_RE_PLANTILLA.search(t) or (_RE_MONTAR.search(t) and _RE_RUTAS.search(t)))

    # ---- 1. Cancelar un encargo ----------------------------------------------
    if _RE_CANCELAR.search(t) and _RE_OBJETO_TAREA.search(t) and not pares:
        q = {"estado": "pendiente"}
        if fecha_final:
            q["fecha"] = fecha_final
        if centro:
            q["centro"] = centro
        pendientes = await db[COL_TAREAS].find(q, {"_id": 0}).to_list(50)
        for p in pendientes:
            await cancelar_tarea(db, p["id"])
        if not pendientes:
            return {"accion": "cancelar", "datos": {"canceladas": 0},
                    "respuesta": "No tenía nada programado con esos datos, así que no he cancelado nada."}
        detalle = ", ".join(f"{p['centro']} {etiqueta_fecha(p['fecha'])}" for p in pendientes)
        return {"accion": "cancelar", "datos": {"canceladas": len(pendientes), "tareas": pendientes},
                "respuesta": f"Cancelado: {detalle}."}

    # ---- 2. ¿Qué tienes programado? ------------------------------------------
    if _RE_CONSULTAR.search(t) and _RE_OBJETO_TAREA.search(t) and not pares and not _RE_MONTAR.search(t):
        pendientes = await listar_tareas(db, estado="pendiente", centro=centro)
        if not pendientes:
            return {"accion": "consultar", "datos": {"tareas": []},
                    "respuesta": "Ahora mismo no tengo nada programado."}
        lineas = []
        for p in pendientes:
            pre = await obtener_preasignacion(db, p["fecha"], p["centro"])
            n = len((pre or {}).get("pares") or [])
            lineas.append(
                f"· Plantilla de {p['centro']} para {etiqueta_fecha(p['fecha'])} — "
                + (f"{n} furgonetas ya preasignadas" if n else "sin furgonetas preasignadas todavía"))
        return {"accion": "consultar", "datos": {"tareas": pendientes},
                "respuesta": "Esto es lo que tengo pendiente:\n" + "\n".join(lineas)}

    # ---- 3. Furgonetas preasignadas (pares conductor → matrícula) -------------
    if pares:
        if not fecha_final:
            listado = "\n".join(f"· {p['conductor']} → {formato_matricula(p['matricula'])}" for p in pares[:40])
            return {"accion": "falta_fecha", "datos": {"pares": pares, "avisos": avisos},
                    "respuesta": ("He leído " + str(len(pares)) + " furgonetas, pero no me digas para qué día:\n"
                                  + listado + "\n\n¿Son para mañana, para hoy o para otro día? "
                                  "Cada día va por separado, no arrastro nada de un día a otro.")}
        if not centro:
            return {"accion": "falta_centro", "datos": {"pares": pares, "centros": centros},
                    "respuesta": ("¿De qué centro son esas furgonetas? "
                                  + ("Tienes " + ", ".join(centros) + "." if centros else ""))}

        modo = "añadir" if _RE_AÑADIR.search(t) else "reemplazar"
        pre = await guardar_preasignacion(db, fecha_final, centro, pares,
                                          usuario=usuario, texto=texto, modo=modo)
        total = len(pre.get("pares") or [])

        partes = [f"Apuntadas {len(pares)} furgonetas para {centro} el {etiqueta_fecha(fecha_final)}"
                  + (f" (en total ya tengo {total} ese día)." if total != len(pares) else ".")]
        if avisos:
            partes.append("Ojo con esto:\n" + "\n".join("· " + a for a in avisos))

        datos = {"preasignacion": pre, "avisos": avisos}
        accion = "preasignacion"

        # Si en el mismo mensaje pide la plantilla, se resuelve también
        if pide_plantilla or _RE_MONTAR.search(t) or "cortex" in t:
            res = await _resolver_plantilla(db, fecha_final, centro, texto, usuario, hoy_str, notificar)
            datos.update(res["datos"])
            accion = "preasignacion+" + res["accion"]
            partes.append(res["respuesta"])
        else:
            partes.append("Cuando quieras la plantilla de ese día, dímelo y la monto con estas furgonetas.")

        return {"accion": accion, "datos": datos, "respuesta": "\n\n".join(partes)}

    # ---- 4. Montar / programar la plantilla -----------------------------------
    if pide_plantilla:
        if not centro:
            return {"accion": "falta_centro", "datos": {"centros": centros},
                    "respuesta": ("¿De qué centro? " + ("Tienes " + ", ".join(centros) + "." if centros
                                                        else "Dime el centro y la monto."))}
        res = await _resolver_plantilla(db, fecha_final or hoy_str, centro, texto, usuario, hoy_str, notificar)
        return {"accion": res["accion"], "datos": res["datos"], "respuesta": res["respuesta"]}

    # ---- 5. No es una orden conocida ------------------------------------------
    # (el chat lo intentará luego como conversación; por eso se puede no registrar)
    pet = None
    if registrar:
        pet = await registrar_peticion(db, texto, centro=centro, usuario=usuario, motivo="no_entendida")
    return {
        "accion": None,
        "datos": {"peticion": pet},
        "respuesta": ("Eso todavía no lo sé hacer. Lo he apuntado tal cual para que se añada.\n\n"
                      "Lo que sí puedo ahora mismo:\n"
                      "· Montar la plantilla de un centro (rutas de Cortex + la furgoneta de cada uno).\n"
                      "· Dejarla programada para otro día: la monto sola en cuanto Cortex saque las rutas.\n"
                      "· Guardar las furgonetas de un día concreto si me pegas «conductor → matrícula».\n"
                      "· Decirte qué tengo programado y cancelarlo."),
    }


async def _resolver_plantilla(db, fecha, centro, texto, usuario, hoy_str, notificar=None):
    """Monta la plantilla si ya hay rutas; si no, la deja programada."""
    pre = await obtener_preasignacion(db, fecha, centro)
    n_pre = len((pre or {}).get("pares") or [])

    if fecha <= hoy_str:
        p = await construir_plantilla(db, fecha, centro)
        if p.get("listo"):
            r = p["resumen"]
            cola = ""
            if r["sin_furgoneta"]:
                cola = (f"\n\n{r['sin_furgoneta']} conductores se quedan sin furgoneta: "
                        "pégame sus pares y la actualizo.")
            return {"accion": "plantilla", "datos": {"plantilla": p},
                    "respuesta": p["texto"] + cola}

    tarea, nueva = await crear_tarea(db, "plantilla", fecha, centro, texto=texto, usuario=usuario)
    cuando = etiqueta_fecha(fecha)
    if fecha <= hoy_str:
        cabecera = (f"Cortex todavía no ha sacado las rutas de {centro} del {cuando}. "
                    "Queda programada: la monto sola en cuanto aparezcan (miro cada 10 minutos).")
    else:
        cabecera = (f"Programado: la plantilla de {centro} del {cuando} se monta sola "
                    "en cuanto Cortex saque las rutas de ese día.")
    if not nueva:
        cabecera = f"Ya la tenía programada: {centro}, {cuando}. Sigue en pie."

    if n_pre:
        cabecera += f" Ya tengo {n_pre} furgonetas apuntadas para ese día y las usaré."
    else:
        cabecera += (" No tengo furgonetas apuntadas para ese día: si me las pegas "
                     "(conductor → matrícula), las cruzo con los conductores que saque Cortex; "
                     "a quien no esté en tu lista le pongo la furgoneta fija de su ficha.")

    return {"accion": "programar", "datos": {"tarea": tarea}, "respuesta": cabecera}


def texto_capacidades(centros=None):
    """Bloque para el prompt del chat: lo que SÍ puede hacer y lo que no.

    El asistente dejaba de servir justo aquí ("no tengo memoria ni procesos de
    fondo"). Con este módulo eso ya no es verdad: hay tareas guardadas en la BD
    y un bucle que las ejecuta. Este texto es para que el chat lo sepa.
    """
    lista = ", ".join(centros) if centros else "los centros de la cuenta"
    return f"""CAPACIDADES REALES (no digas que no puedes: llama a la API)

Puedes dejar trabajo hecho para más tarde. Endpoints (el usuario ya va autenticado):

  POST /api/ia/comando   {{"texto": "<lo que escribió el dispatcher>", "centro": "<opcional>"}}
      Resuelve él solo: guardar furgonetas del día, programar la plantilla,
      montarla, consultar lo programado o cancelarlo. Devuelve 'respuesta'
      ya redactada: puedes soltarla tal cual.
  GET  /api/ia/plantilla?fecha=YYYY-MM-DD&centro=XXX
  GET  /api/ia/tareas?estado=pendiente
  GET/POST/DELETE /api/ia/preasignacion

QUÉ SIGNIFICA ESO EN CRISTIANO
  · "Monta la plantilla de DGA1 mañana cuando salgan las rutas en Cortex" →
    SÍ se puede: queda programado y un proceso de fondo la monta solo en
    cuanto las rutas de ese día están subidas. Confírmalo, no lo rechaces.
  · "Estas son las furgonetas de mañana: <lista>" → SÍ se puede: se guardan
    los pares conductor→matrícula PARA ESA FECHA. Cada día va por separado.
  · La plantilla sale con las rutas de cada conductor y después la furgoneta
    que le toca: primero la que dijo el dispatcher para ese día, si no la
    furgoneta fija de su ficha, y si no hay ninguna se dice "sin furgoneta".

REGLAS
  · Nunca inventes una matrícula, un conductor ni una ruta. Si falta el dato,
    pídelo o di que falta.
  · Si no está claro el día o el centro ({lista}), pregunta antes de guardar.
  · Solo datos de esta organización y de los centros del usuario. Nada de
    otras empresas, otros usuarios ni cosas que no le correspondan.
  · Lo que no puedas hacer, dilo claro: queda registrado en /api/ia/peticiones
    para añadirlo más adelante."""


# =============================================================================
# EL CHAT DE LA APP
# =============================================================================

COL_CONVERSACIONES = "ia_conversaciones"
MAX_MEMORIA = 40          # turnos que se recuerdan por conversación


def id_conversacion(usuario):
    """Cada dispatcher tiene su propia conversación."""
    if isinstance(usuario, dict):
        return str(usuario.get("sub") or usuario.get("name") or "chat")
    return str(usuario or "chat")


async def historial_chat(db, conv_id, limite=MAX_MEMORIA):
    doc = await db[COL_CONVERSACIONES].find_one({"id": conv_id}, {"_id": 0})
    return ((doc or {}).get("mensajes") or [])[-limite:]


async def guardar_turno(db, conv_id, pregunta, respuesta, usuario=None):
    """Guarda la pregunta y la respuesta. Esto es la memoria del chat."""
    historial = await historial_chat(db, conv_id, limite=MAX_MEMORIA * 2)
    historial += [
        {"rol": "dispatcher", "texto": (pregunta or "")[:4000], "at": ahora_iso()},
        {"rol": "flotadsp", "texto": (respuesta or "")[:8000], "at": ahora_iso()},
    ]
    historial = historial[-MAX_MEMORIA:]
    await db[COL_CONVERSACIONES].update_one(
        {"id": conv_id},
        {"$set": {"id": conv_id, "mensajes": historial, "actualizada_at": ahora_iso(),
                  "usuario": (usuario or {}).get("name") if isinstance(usuario, dict) else usuario}},
        upsert=True)
    return historial


async def borrar_historial(db, conv_id):
    r = await db[COL_CONVERSACIONES].delete_many({"id": conv_id})
    return getattr(r, "deleted_count", 0)


async def contexto_del_dia(db, centros=None, hoy=None):
    """Lo que está pasando ahora mismo, para que el chat conteste con datos reales."""
    hoy_d = hoy or hoy_madrid()
    hoy_str = fecha_iso(hoy_d)
    manana_str = fecha_iso(hoy_d + timedelta(days=1))

    pendientes = await listar_tareas(db, estado="pendiente", limite=30)
    ctx = {
        "hoy": hoy_str,
        "manana": manana_str,
        "centros": list(centros or []),
        "tareas_pendientes": [
            {"centro": t.get("centro"), "fecha": t.get("fecha"), "tipo": t.get("tipo")}
            for t in pendientes],
        "preasignaciones": [],
        "plantillas": [],
    }
    for centro in (centros or [])[:6]:
        for fecha in (hoy_str, manana_str):
            pre = await obtener_preasignacion(db, fecha, centro)
            if pre and pre.get("pares"):
                ctx["preasignaciones"].append(
                    {"centro": centro, "fecha": fecha, "pares": pre["pares"]})
        try:
            p = await construir_plantilla(db, hoy_str, centro)
        except Exception as e:
            logger.warning("tareas_ia: no pude montar la plantilla de %s: %s", centro, e)
            continue
        if p.get("listo"):
            ctx["plantillas"].append({"centro": centro, "fecha": hoy_str,
                                      "texto": p["texto"][:4000]})
    return ctx


def _contexto_texto(ctx):
    """El contexto en texto, para meterlo en el prompt."""
    partes = [f"HOY es {etiqueta_fecha(ctx['hoy'])}. Mañana es {etiqueta_fecha(ctx['manana'])}.",
              "Centros del usuario: " + (", ".join(ctx["centros"]) or "(sin centros)")]

    if ctx["tareas_pendientes"]:
        partes.append("ENCARGOS PROGRAMADOS (se ejecutan solos):\n" + "\n".join(
            f"  · {t['tipo']} de {t['centro']} para {etiqueta_fecha(t['fecha'])}"
            for t in ctx["tareas_pendientes"]))
    else:
        partes.append("ENCARGOS PROGRAMADOS: ninguno.")

    for pre in ctx["preasignaciones"]:
        partes.append(
            f"FURGONETAS APUNTADAS para {pre['centro']} el {etiqueta_fecha(pre['fecha'])} "
            f"({len(pre['pares'])}):\n" + "\n".join(
                f"  · {p['conductor']} → {formato_matricula(p['matricula'])}"
                for p in pre["pares"][:60]))

    for pl in ctx["plantillas"]:
        partes.append(f"PLANTILLA DE HOY ({pl['centro']}), datos reales de Cortex:\n" + pl["texto"])

    return "\n\n".join(partes)


def prompt_chat(ctx, historial, texto):
    """El prompt del chat de la app. Aquí es donde antes decía 'no puedo'."""
    conversacion = ""
    for m in (historial or [])[-12:]:
        quien = "Dispatcher" if m.get("rol") == "dispatcher" else "Tú"
        conversacion += f"{quien}: {m.get('texto', '')}\n"

    return f"""Eres FlotaDSP AI, el asistente de una empresa de reparto (DSP de Amazon).
Hablas con un dispatcher de la empresa, en castellano, al grano y sin rodeos.
Tono de compañero de trabajo: frases cortas, nada de relleno ni de disculpas largas.

LO QUE SÍ PUEDES HACER (no lo niegues nunca, ya está montado y funcionando):
  · Aceptar encargos para más tarde. "Monta la plantilla de DGA1 mañana cuando
    salgan las rutas en Cortex" queda programado y se ejecuta SOLO en cuanto las
    rutas de ese día están subidas. Hay un proceso de fondo que lo revisa cada
    10 minutos, aunque nadie esté escribiendo en el chat.
  · Recordar. Esta conversación se guarda: lo de antes no se pierde.
  · Guardar las furgonetas de un día concreto (pares conductor → matrícula) y
    cruzarlas con los conductores que saque Cortex al montar la plantilla.
  · Decir qué hay programado y cancelarlo.
Si el dispatcher te pide una de esas cosas, NO expliques cómo funciona: ya se ha
hecho antes de llegar a ti. Aquí solo estás conversando o respondiendo dudas.

REGLAS (importantes):
  · No inventes NUNCA una matrícula, un conductor, una ruta ni un dato. Si no
    está en el CONTEXTO de abajo, di que no lo tienes y pide el dato.
  · Nada de datos de otras empresas, de otros usuarios ni de fuera de los
    centros de este usuario. Nada que le meta en un lío legal o laboral.
  · Si falta el día o el centro para hacer algo, pregúntalo.
  · Si algo no se puede hacer todavía, dilo claro en una frase. Sin inventar.

=== CONTEXTO REAL AHORA MISMO ===
{_contexto_texto(ctx)}

=== CONVERSACIÓN ===
{conversacion}Dispatcher: {texto}

Responde solo como FlotaDSP AI, sin prefijos ni comillas."""


async def responder_chat(db, texto, historial=None, centro=None, centros=None, usuario=None,
                         notificar=None, gemini=None, hoy=None):
    """Una vuelta del chat de la app.

    Primero intenta hacer algo de verdad (programar, guardar furgonetas, montar
    la plantilla, consultar, cancelar). Si el mensaje no era una orden de esas,
    contesta con Gemini, pero con los datos reales del día delante.
    """
    r = await procesar_mensaje(db, texto, centro=centro, centros=centros, usuario=usuario,
                               notificar=notificar, hoy=hoy, registrar=False)
    if r.get("accion") is not None:
        return r                      # se ha hecho algo real: esa es la respuesta

    if gemini:
        try:
            # Con un centro claro se mira solo ese: montar la plantilla de todos
            # en cada mensaje sería mucho trabajo para nada.
            ctx = await contexto_del_dia(db, centros=([centro] if centro else centros), hoy=hoy)
            respuesta = (await gemini(prompt_chat(ctx, historial, texto)) or "").strip()
            if respuesta:
                return {"accion": "conversacion", "datos": {}, "respuesta": respuesta}
            logger.warning("tareas_ia: la IA devolvió una respuesta vacía")
        except Exception as e:
            logger.warning("tareas_ia: la IA no contestó: %s", e)

    # Sin IA disponible: se responde con la verdad y queda registrado
    pet = await registrar_peticion(db, texto, centro=centro, usuario=usuario, motivo="sin_ia")
    r["datos"] = {"peticion": pet}
    return r



# =============================================================================
# API — se engancha al server con construir_router(...)
# =============================================================================

def construir_router(db, dependencia_admin, notificar=None, gemini=None):
    """Devuelve el APIRouter de /api/ia listo para incluir en la app.

    db: la base (o el proxy multi-tenant) del server.
    dependencia_admin: la dependencia de autenticación del server (require_admin).
    notificar: async (titulo, mensaje) → aviso por Telegram. Opcional.
    gemini: async (prompt) → texto. Lo pone el server; sin él, el chat solo
            responde a las órdenes que sabe ejecutar (no conversa).
    """
    from fastapi import APIRouter, Body, Depends, HTTPException, Query

    router = APIRouter(prefix="/api/ia", tags=["ia"])

    def _centros_usuario(usuario):
        return [str(c) for c in ((usuario or {}).get("centers") or []) if c]

    def _exigir_acceso(usuario, centro):
        propios = _centros_usuario(usuario)
        if centro and propios and centro not in propios:
            raise HTTPException(status_code=403, detail=f"No tienes acceso al centro {centro}")

    async def _centros(usuario):
        return _centros_usuario(usuario) or await centros_conocidos(db)

    def _fecha_valida(fecha):
        if not fecha:
            return None
        try:
            datetime.strptime(str(fecha)[:10], "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Fecha inválida. Usa YYYY-MM-DD.")
        return str(fecha)[:10]

    @router.post("/comando")
    async def comando(payload: dict = Body(...), usuario=Depends(dependencia_admin)):
        """Entrada única del chat: se le pasa lo que escribió el dispatcher."""
        texto = (payload.get("texto") or payload.get("mensaje") or "").strip()
        if not texto:
            raise HTTPException(status_code=400, detail="Falta el texto del mensaje")
        centro = payload.get("centro") or None
        _exigir_acceso(usuario, centro)
        res = await procesar_mensaje(
            db, texto,
            centro=centro,
            centros=await _centros(usuario),
            usuario=usuario,
            notificar=notificar,
            fecha=_fecha_valida(payload.get("fecha")),
        )
        centro_res = ((res.get("datos") or {}).get("tarea") or {}).get("centro")
        _exigir_acceso(usuario, centro_res)
        return {"success": True, **res}

    @router.get("/plantilla")
    async def plantilla(centro: str = Query(...), fecha: str = Query(None),
                        usuario=Depends(dependencia_admin)):
        """La plantilla de ese día: cada conductor, su ruta y su furgoneta."""
        _exigir_acceso(usuario, centro)
        f = _fecha_valida(fecha) or fecha_iso(hoy_madrid())
        p = await construir_plantilla(db, f, centro)
        if not p.get("listo"):
            return {"success": True, "listo": False, "fecha": f, "centro": centro,
                    "motivo": p.get("motivo"),
                    "mensaje": f"Cortex todavía no ha sacado las rutas de {centro} "
                               f"del {etiqueta_fecha(f)}."}
        return {"success": True, **p}

    @router.get("/tareas")
    async def tareas(estado: str = Query(None), centro: str = Query(None),
                     usuario=Depends(dependencia_admin)):
        _exigir_acceso(usuario, centro)
        propios = _centros_usuario(usuario)
        lista = await listar_tareas(db, estado=estado, centro=centro)
        if propios:
            lista = [t for t in lista if not t.get("centro") or t["centro"] in propios]
        return {"success": True, "tareas": lista}

    @router.post("/tareas")
    async def nueva_tarea(payload: dict = Body(...), usuario=Depends(dependencia_admin)):
        centro = payload.get("centro")
        if not centro:
            raise HTTPException(status_code=400, detail="Falta el centro")
        _exigir_acceso(usuario, centro)
        fecha = _fecha_valida(payload.get("fecha")) or fecha_iso(hoy_madrid() + timedelta(days=1))
        tipo = payload.get("tipo") or "plantilla"
        if tipo not in TIPOS_TAREA:
            raise HTTPException(status_code=400, detail=f"Tipo de tarea no soportado: {tipo}")
        tarea, nueva = await crear_tarea(db, tipo, fecha, centro,
                                         texto=payload.get("texto") or "", usuario=usuario)
        return {"success": True, "creada": nueva, "tarea": tarea}

    @router.post("/tareas/{tarea_id}/ejecutar")
    async def ejecutar(tarea_id: str, usuario=Depends(dependencia_admin)):
        """Fuerza el intento ahora, sin esperar al bucle."""
        tarea = await db[COL_TAREAS].find_one({"id": tarea_id}, {"_id": 0})
        if not tarea:
            raise HTTPException(status_code=404, detail="Esa tarea no existe")
        _exigir_acceso(usuario, tarea.get("centro"))
        r = await ejecutar_tarea(db, tarea, notificar=notificar)
        return {"success": True, **r}

    @router.delete("/tareas/{tarea_id}")
    async def cancelar(tarea_id: str, usuario=Depends(dependencia_admin)):
        tarea = await db[COL_TAREAS].find_one({"id": tarea_id}, {"_id": 0})
        if not tarea:
            raise HTTPException(status_code=404, detail="Esa tarea no existe")
        _exigir_acceso(usuario, tarea.get("centro"))
        ok = await cancelar_tarea(db, tarea_id)
        return {"success": ok, "mensaje": "Cancelada." if ok else "Ya no estaba pendiente."}

    @router.get("/preasignacion")
    async def ver_preasignacion(centro: str = Query(...), fecha: str = Query(None),
                                usuario=Depends(dependencia_admin)):
        _exigir_acceso(usuario, centro)
        f = _fecha_valida(fecha) or fecha_iso(hoy_madrid())
        pre = await obtener_preasignacion(db, f, centro)
        return {"success": True, "fecha": f, "centro": centro,
                "pares": (pre or {}).get("pares") or [],
                "actualizada_at": (pre or {}).get("actualizada_at")}

    @router.post("/preasignacion")
    async def poner_preasignacion(payload: dict = Body(...), usuario=Depends(dependencia_admin)):
        """Guarda los pares del día. Admite texto pegado o lista ya estructurada."""
        centro = payload.get("centro")
        if not centro:
            raise HTTPException(status_code=400, detail="Falta el centro")
        _exigir_acceso(usuario, centro)
        fecha = _fecha_valida(payload.get("fecha"))
        texto = payload.get("texto") or ""
        if not fecha:
            fecha = parse_fecha_es(texto)
        if not fecha:
            raise HTTPException(status_code=400,
                                detail="Falta la fecha: cada día va por separado.")
        avisos = []
        if payload.get("pares"):
            pares = []
            for p in payload["pares"]:
                nombre = (p.get("conductor") or p.get("driver_name") or "").strip()
                mat = normaliza_matricula(p.get("matricula") or p.get("plate") or "")
                if nombre and mat:
                    pares.append({"conductor": nombre, "matricula": mat})
        else:
            pares, avisos = parse_pares(texto)
        if not pares:
            raise HTTPException(status_code=400,
                                detail="No he encontrado ningún par conductor → matrícula.")
        modo = payload.get("modo") or "reemplazar"
        pre = await guardar_preasignacion(db, fecha, centro, pares,
                                          usuario=usuario, texto=texto, modo=modo)
        return {"success": True, "preasignacion": pre, "avisos": avisos}

    @router.delete("/preasignacion")
    async def quitar_preasignacion(centro: str = Query(...), fecha: str = Query(...),
                                   usuario=Depends(dependencia_admin)):
        _exigir_acceso(usuario, centro)
        f = _fecha_valida(fecha)
        n = await borrar_preasignacion(db, f, centro)
        return {"success": True, "borradas": n}

    @router.get("/peticiones")
    async def peticiones(limite: int = Query(50), usuario=Depends(dependencia_admin)):
        """Lo que se ha pedido al chat y todavía no sabe hacer."""
        lista = await db[COL_PETICIONES].find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limite, 200))
        return {"success": True, "peticiones": lista}

    @router.get("/capacidades")
    async def capacidades(usuario=Depends(dependencia_admin)):
        return {"success": True, "centros": await _centros(usuario),
                "texto": texto_capacidades(await _centros(usuario))}

    @router.post("/chat")
    async def chat(payload: dict = Body(...), usuario=Depends(dependencia_admin)):
        """El chat de la app. Hace lo que le piden y, si no, conversa con datos reales.

        Body: {"texto": "...", "centro": "opcional", "conversacion": "opcional"}
        Devuelve {"respuesta": "...", "accion": "...", "conversacion": "..."}.
        """
        texto = (payload.get("texto") or payload.get("mensaje") or "").strip()
        if not texto:
            raise HTTPException(status_code=400, detail="Falta el texto del mensaje")
        centro = payload.get("centro") or None
        _exigir_acceso(usuario, centro)

        conv_id = str(payload.get("conversacion") or id_conversacion(usuario))[:120]
        historial = payload.get("historial")
        if historial is None:
            historial = await historial_chat(db, conv_id)

        r = await responder_chat(db, texto, historial=historial, centro=centro,
                                 centros=await _centros(usuario), usuario=usuario,
                                 notificar=notificar, gemini=gemini)
        await guardar_turno(db, conv_id, texto, r.get("respuesta"), usuario=usuario)
        return {"success": True, "conversacion": conv_id, **r}

    @router.get("/chat/historial")
    async def ver_historial(conversacion: str = Query(None), usuario=Depends(dependencia_admin)):
        conv_id = str(conversacion or id_conversacion(usuario))[:120]
        return {"success": True, "conversacion": conv_id,
                "mensajes": await historial_chat(db, conv_id)}

    @router.delete("/chat/historial")
    async def limpiar_historial(conversacion: str = Query(None), usuario=Depends(dependencia_admin)):
        conv_id = str(conversacion or id_conversacion(usuario))[:120]
        n = await borrar_historial(db, conv_id)
        return {"success": True, "borradas": n}

    return router
