# -*- coding: utf-8 -*-
"""Vocabulario cerrado de piezas de carroceria, y como llegar a el desde el
texto libre que escribe la IA.

POR QUE EXISTE ESTO. Gemini nombra la pieza en texto libre, y en 8.665 danos
reales escribio **504 nombres distintos**; 267 de ellos aparecen una sola vez.
Solo la palabra "puerta" sale en 193 formas: "puerta corredera derecha" (773),
"puerta corredera der" (57), "puerta corredera izq" (53), "puerta del
conductor" (51)... La misma chapa contada como piezas diferentes.

Con eso NADA se puede autovalidar. No se puede saber si un dano persiste en las
fotos del dia siguiente, ni medir la fiabilidad por pieza, ni cruzarlo con el
checklist del conductor, porque la clave no coincide nunca consigo misma. Un
test de persistencia hecho sobre el texto crudo sale plano por construccion, y
salio: 53 % de los pares (vehiculo, pieza) aparecian una sola vez en 25
inspecciones del mismo vehiculo.

DOS NIVELES, A PROPOSITO:

  · `pieza` — la pieza concreta ('puerta_corredera_der'). Es lo que se le ensena
    a una persona y lo que se agrega para medir fiabilidad.
  · `zona`  — el area gruesa ('lateral_der'). Es lo que se usa para comprobar si
    un dano se repite entre inspecciones.

La comprobacion va por ZONA y no por pieza porque el error tipico de la IA no es
inventarse el lado, es dudar entre dos paneles contiguos: una misma abolladura
sale hoy como "puerta corredera derecha" y manana como "panel lateral trasero
derecho". Exigiendo que coincida la pieza exacta, un dano REAL parece que no
persiste y se marcaria como inventado — un falso positivo, y de los caros.
Exigiendo solo la zona, dos conductores distintos fotografiando el mismo lado en
dias distintos confirman de verdad.

NO SE INVENTA NINGUNA PIEZA. La lista sale de contar los nombres que la IA ya ha
escrito sobre esta flota (furgonetas tipo Citroen Jumpy / Peugeot Expert), no de
un catalogo teorico.
"""
import re
import unicodedata

# ── Zonas ────────────────────────────────────────────────────────────────────
FRONTAL, TRASERA = "frontal", "trasera"
LAT_IZQ, LAT_DER = "lateral_izq", "lateral_der"
TECHO, NO_CARROCERIA, GENERAL = "techo", "no_carroceria", "general"

IZQ, DER = "izq", "der"

# ── Sinonimos de la BASE de la pieza ─────────────────────────────────────────
# Cada entrada: (palabras que la delatan, nombre base, zona fija si la tiene).
# El orden importa: se prueba de mas especifico a mas generico, porque
# "paragolpes delantero" tiene que ganar a "paragolpes" a secas.
_BASES = [
    # --- frontal ---
    (("parabrisas", "luna delantera"),                 "parabrisas",        FRONTAL),
    (("capo", "capot"),                                "capo",              FRONTAL),
    (("rejilla", "parrilla", "calandra"),              "rejilla",           FRONTAL),
    (("faro", "optica", "grupo optico"),               "faro",              None),
    (("paragolpes delantero", "parachoques delantero",
      "defensa delantera", "spoiler delantero"),       "paragolpes_del",    FRONTAL),
    # --- trasera ---
    (("paragolpes trasero", "parachoques trasero",
      "defensa trasera"),                              "paragolpes_tra",    TRASERA),
    (("luneta", "luna trasera"),                       "luneta",            TRASERA),
    (("porton", "puertas traseras", "puerta trasera",
      "puertas de carga", "puerta de carga trasera"),  "porton",            None),
    (("piloto", "luz trasera", "faro trasero", "tulipa",
      "grupo optico trasero", "intermitente trasero"), "piloto",            None),
    (("matricula", "placa de matricula"),              "matricula",         None),
    (("cerradura", "cierre", "bombin"),                "cerradura",         None),
    # 'panel trasero derecho' (72 danos) va a la zona TRASERA y no al lateral:
    # lo llama trasero quien lo escribio, y en la duda mandar el nombre literal
    # es lo unico que no inventa nada. Si se metiera en el lateral, dos danos
    # distintos —uno del costado y otro del porton— se confirmarian el uno al
    # otro y eso es justo el falso positivo que hay que evitar.
    (("panel trasero", "chapa trasera"),               "panel_trasero",     TRASERA),
    # --- lateral ---
    (("puerta corredera", "puerta lateral corredera",
      "puerta deslizante"),                            "puerta_corredera",  None),
    (("puerta delantera", "puerta del conductor",
      "puerta del copiloto", "puerta cabina",
      "puerta conductor", "puerta copiloto",
      "puerta del pasajero", "puerta pasajero"),       "puerta_delantera",  None),
    (("retrovisor", "espejo"),                         "retrovisor",        None),
    (("aleta", "guardabarros"),                        "aleta",             None),
    (("paso de rueda", "arco de rueda", "pasarruedas"), "paso_rueda",       None),
    (("llanta", "neumatico", "rueda", "tapacubos"),    "llanta",            None),
    (("faldon", "umbral", "estribo", "talonera",
      "bajo de puerta", "zocalo"),                     "faldon",            None),
    (("moldura", "embellecedor", "listel",
      "protector lateral"),                            "moldura",           None),
    (("panel lateral", "panel trasero lateral",
      "lateral de carga", "panel de carga",
      "chapa lateral", "costado"),                     "panel_lateral",     None),
    (("pilar",),                                       "pilar",             None),
    (("ventanilla", "ventana", "cristal lateral"),     "ventanilla",        None),
    (("techo", "baca", "portaequipajes"),              "techo",             TECHO),
    # --- generico: solo si no ha casado nada mejor ---
    (("puerta lateral",),                              "puerta_corredera",  None),
    (("lateral",),                                     "panel_lateral",     None),
    (("carroceria", "chapa general"),                  "carroceria",        GENERAL),
]

# Lo que NO es carroceria. Sale de la foto del salpicadero y de los avisos del
# cuadro, y meterlo en el vocabulario de chapa ensuciaria todas las cuentas.
_NO_CARROCERIA = ("freno", "motor", "tpms", "aceite", "testigo", "cuadro",
                  "salpicadero", "adblue", "bateria", "embrague", "direccion",
                  "climatizador", "airbag", "cinturon", "asiento", "volante",
                  "mantenimiento", "fluido", "refrigerante", "escape",
                  "suspension", "amortiguador", "kilometraje", "combustible")

_SEPARADORES = re.compile(r"\s+(?:y|e|con|mas|junto a)\s+")

# POR PALABRA ENTERA, NO POR SUBCADENA. "puerta del coPILOTO" contiene
# "piloto", y buscando subcadenas se convertia en el piloto trasero derecho: la
# puerta del copiloto clasificada como una luz. Es el mismo fallo que
# "delivered" dentro de "not_delivered", y lo caza el test de piezas.
# Se ancla solo por delante para que el plural siga entrando ("faro" -> "faros").
_RX = {}
for _claves, _nombre, _ in _BASES:
    _RX.setdefault(_nombre, []).extend(
        re.compile(r"\b" + re.escape(k)) for k in _claves)


def _limpia(t):
    s = unicodedata.normalize("NFKD", str(t or "").lower())
    s = s.encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _lado(t):
    """izq / der / None. 'conductor' es izquierda en Espana; 'copiloto', derecha."""
    if re.search(r"\b(izquierd\w*|izq|izdo|izqda|conductor)\b", t):
        return IZQ
    if re.search(r"\b(derech\w*|der|dcho|dcha|copiloto|acompanante|pasajero)\b", t):
        return DER
    return None


def _eje(t):
    """del / tra / None — delantero o trasero."""
    if re.search(r"\b(delanter\w*|frontal|front|morro|cabina)\b", t):
        return "del"
    if re.search(r"\b(traser\w*|posterior|atras|zaga|cola)\b", t):
        return "tra"
    return None


def _una(texto):
    """(pieza, zona, lado) de UN nombre suelto. (None, None, None) si no se sabe.

    Devolver None es una respuesta legitima y necesaria: forzar un nombre
    desconocido dentro del cajon mas parecido es exactamente como se fabrica un
    falso positivo. Lo que no se reconoce se queda fuera y se ve.
    """
    t = _limpia(texto)
    if not t:
        return None, None, None
    if any(k in t for k in _NO_CARROCERIA):
        return "no_carroceria", NO_CARROCERIA, None

    base = zona_fija = None
    for claves, nombre, zona in _BASES:
        if any(rx.search(t) for rx in _RX[nombre]):
            base, zona_fija = nombre, zona
            break
    if not base:
        return None, None, None

    lado, eje = _lado(t), _eje(t)

    # Piezas que existen en los dos ejes: el eje forma parte del nombre.
    if base == "aleta":
        base = "aleta_%s" % (eje or "del")
    elif base in ("paso_rueda", "llanta"):
        base = "%s_%s" % (base, eje or "tra")
    # 'puerta trasera derecha' es una hoja del porton, no una puerta lateral.
    if base == "porton" and lado:
        base = "porton_%s" % lado

    # Zona: fija si la pieza solo puede estar en un sitio; si no, por el lado.
    if zona_fija:
        zona = zona_fija
    elif base.startswith("porton") or base == "piloto":
        zona = TRASERA
    elif base == "faro":
        zona = FRONTAL
    elif lado == IZQ:
        zona = LAT_IZQ
    elif lado == DER:
        zona = LAT_DER
    else:
        zona = GENERAL

    pieza = base if (lado is None or base.endswith(("_izq", "_der"))) \
        else "%s_%s" % (base, lado)
    return pieza, zona, lado


def canon(texto):
    """Texto libre de la IA -> lista de (pieza, zona, lado).

    Devuelve una LISTA porque la IA junta dos piezas en un solo nombre 52 veces
    ('puerta corredera derecha y panel lateral trasero derecho'). Contarlo como
    una pieza rara perdia los dos danos; partirlo recupera los dos.
    """
    fuera, vistos = [], set()
    for trozo in _SEPARADORES.split(_limpia(texto)):
        p, z, l = _una(trozo)
        if p and p not in vistos:
            vistos.add(p)
            fuera.append((p, z, l))
    return fuera


def zonas(texto):
    """Solo las zonas. Es lo que se compara entre inspecciones."""
    return {z for _, z, _ in canon(texto) if z not in (None, NO_CARROCERIA)}
