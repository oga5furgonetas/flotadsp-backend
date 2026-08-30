# -*- coding: utf-8 -*-
"""El motor que decide QUÉ se le pregunta a un taller, CUÁNDO y CÓMO.

Por qué existe como módulo aparte y sin tocar la base de datos:

  · Es la parte que se equivoca en silencio. Un fallo aquí no rompe nada — solo
    hace que a un taller se le escriba de más (y deje de leerlo) o de menos (y
    la furgoneta se quede semanas parada sin que nadie pregunte). Las dos cosas
    salen caras y ninguna da un error.
  · Sin base de datos delante se puede probar entero, incluidos los casos que
    en producción tardarían semanas en darse: el cuarto recordatorio, el cambio
    de hora, un domingo por la noche.

El canal (WhatsApp, correo, o el texto para reenviar a mano) NO se decide aquí.
Eso es a propósito: la cuenta de Meta está bloqueada, y si el seguimiento
dependiera de WhatsApp no funcionaría hoy. El motor dice qué hay que mandar y a
quién; quien pueda, lo lleva.
"""
import re
from datetime import datetime, timedelta

# ── QUÉ SE PREGUNTA ─────────────────────────────────────────────────────────
# Los textos de partida. Se copian a la base la primera vez y a partir de ahí
# se editan desde la app: aquí solo viven para que una instalación nueva
# arranque con algo que funcione, no como fuente de la verdad.
#
# El escalado no es repetir más fuerte. Cada toque pregunta algo DISTINTO y más
# concreto, porque un taller que no contestó al «¿cómo va?» tampoco va a
# contestar al segundo «¿cómo va?». Se baja de lo abierto a lo cerrado: primero
# el estado, luego una fecha, luego un sí o un no, y al final se avisa de que
# va a llamar una persona — que es lo único que de verdad mueve.
PLANTILLAS_BASE = [
    {
        "clave": "toque_1",
        "nombre": "Primer aviso · ¿cómo va?",
        "texto": ("Hola{saludo_taller}, ¿cómo va la {matricula}? Entró hace {dias} "
                  "días y no tenemos novedades.\n\n"
                  "Con un toque aquí nos decís el estado y así no os llamamos: {enlace}"),
        "orden": 1,
    },
    {
        "clave": "toque_2",
        "nombre": "Segundo aviso · pide fecha",
        "texto": ("Hola{saludo_taller}, seguimos sin noticias de la {matricula} "
                  "({dias} días).\n\n"
                  "¿Nos podéis decir una fecha aproximada de salida? Es para saber "
                  "si contamos con ella la semana que viene: {enlace}"),
        "orden": 2,
    },
    {
        "clave": "toque_3",
        "nombre": "Tercer aviso · sí o no",
        "texto": ("Hola{saludo_taller}, la {matricula} lleva {dias} días con "
                  "vosotros y no conseguimos saber cómo va.\n\n"
                  "¿Está esperando piezas? Con responder sí o no nos vale: {enlace}"),
        "orden": 3,
    },
    {
        "clave": "toque_final",
        "nombre": "Último aviso · va a llamar alguien",
        "texto": ("Hola{saludo_taller}, la {matricula} lleva {dias} días y es el "
                  "cuarto mensaje sin respuesta.\n\n"
                  "Os llamamos esta semana para cerrarlo. Si preferís contestar "
                  "aquí, mejor: {enlace}"),
        "orden": 4,
    },
    {
        "clave": "entrada",
        "nombre": "Al entrar en el taller",
        "texto": ("Hola{saludo_taller}, os dejamos la {matricula}. {problema}\n\n"
                  "Aquí tenéis el parte con las fotos de los golpes: {enlace}"),
        "orden": 0,
    },
    {
        "clave": "recordatorio_fecha",
        "nombre": "Se acerca la fecha prometida",
        "texto": ("Hola{saludo_taller}, la {matricula} tenía salida prevista para "
                  "{fecha_prevista}. ¿Sigue en pie?\n\n{enlace}"),
        "orden": 5,
    },
]

# ── CUÁNDO SE PREGUNTA ──────────────────────────────────────────────────────
# La pauta de partida. Todo esto se cambia desde la app.
PAUTA_POR_DEFECTO = {
    "activa": True,
    "cada_dias": 3,          # se pregunta si lleva tantos días sin decir nada
    "max_toques": 4,         # y como mucho tantas veces
    "dias_semana": [0, 1, 2, 3, 4],   # lunes a viernes (0 = lunes)
    "hora_desde": 9,
    "hora_hasta": 19,
    "escalado": ["toque_1", "toque_2", "toque_3", "toque_final"],
    "canales": ["whatsapp", "oficina"],
}

# Los estados de una orden en los que tiene sentido preguntar. Si ya está
# entregada no se pregunta, y si está "listo" tampoco: ahí lo que toca es ir a
# recogerla, y eso es cosa nuestra, no del taller.
ESTADOS_QUE_SE_SIGUEN = ("enviada", "vista", "presupuestada", "aprobada", "en_taller")


class Pauta(dict):
    """Una pauta con valores por defecto para lo que falte.

    Se envuelve en vez de leer el dict a pelo porque una pauta guardada hace
    meses no tiene los campos que se añadan después, y un `None` en `cada_dias`
    haría que se preguntara en bucle.
    """

    def __init__(self, datos=None):
        super().__init__(PAUTA_POR_DEFECTO)
        for k, v in (datos or {}).items():
            if v is not None:
                self[k] = v


def normaliza_pauta(datos) -> dict:
    """Deja una pauta usable, acotando lo que venga de fuera.

    Los límites no son decorativos: `cada_dias = 0` escribiría al taller en cada
    pasada del cron —cada media hora— y quemaría el canal en una tarde. Y una
    ventana horaria invertida (de las 19 a las 9) no dispararía nunca, que es el
    fallo contrario y aún más difícil de ver.
    """
    p = Pauta(datos)

    def _num(clave, defecto, minimo, maximo):
        """Acota un número, distinguiendo el CERO de la ausencia.

        `int(x or 3)` convierte un 0 en 3, porque el `or` trata el cero como si
        no hubiera valor. Quien escribe 0 en «cada cuántos días» quiere el
        mínimo, no el valor de fábrica — y de paso, ese mismo `or` haría que una
        hora de inicio de 0 (medianoche) se leyera como ausente.
        """
        v = p.get(clave)
        if v is None or v == "":
            v = defecto
        try:
            v = int(v)
        except (TypeError, ValueError):
            v = defecto
        return max(minimo, min(v, maximo))

    p["cada_dias"] = _num("cada_dias", 3, 1, 60)
    p["max_toques"] = _num("max_toques", 4, 1, 12)
    p["hora_desde"] = _num("hora_desde", 9, 0, 23)
    p["hora_hasta"] = _num("hora_hasta", 19, 0, 23)
    if p["hora_hasta"] < p["hora_desde"]:
        p["hora_desde"], p["hora_hasta"] = p["hora_hasta"], p["hora_desde"]
    dias = [int(d) for d in (p.get("dias_semana") or []) if str(d).lstrip("-").isdigit()]
    p["dias_semana"] = sorted({d for d in dias if 0 <= d <= 6}) or [0, 1, 2, 3, 4]
    esc = [str(c) for c in (p.get("escalado") or []) if str(c).strip()]
    p["escalado"] = esc or list(PAUTA_POR_DEFECTO["escalado"])
    can = [c for c in (p.get("canales") or []) if c in ("whatsapp", "email", "oficina")]
    # "oficina" nunca se quita: es el que garantiza que el aviso salga aunque
    # no haya ningún canal automático configurado.
    p["canales"] = list(dict.fromkeys(can + ["oficina"]))
    p["activa"] = bool(p.get("activa", True))
    return dict(p)


def es_hora(pauta: dict, ahora: datetime) -> bool:
    """¿Toca escribir ahora mismo, según el día y la hora de la pauta?"""
    p = normaliza_pauta(pauta)
    if not p["activa"]:
        return False
    if ahora.weekday() not in p["dias_semana"]:
        return False
    return p["hora_desde"] <= ahora.hour <= p["hora_hasta"]


def toca_preguntar(orden: dict, pauta: dict, ahora: datetime) -> tuple:
    """(sí/no, motivo). El motivo se guarda: un «no» sin explicación no se audita.

    El reloj cuenta desde lo ÚLTIMO que hizo el taller, no desde que se abrió la
    orden: si contestó ayer no se le vuelve a escribir mañana solo porque la
    furgoneta lleve dentro tres semanas.
    """
    p = normaliza_pauta(pauta)
    if orden.get("estado") not in ESTADOS_QUE_SE_SIGUEN:
        return False, "la orden está en '%s'" % (orden.get("estado") or "?")

    n = int(orden.get("toques") or 0)
    if n >= p["max_toques"]:
        # Tantos mensajes sin respuesta ya no son un despiste: es una
        # conversación que tiene que tener una persona, y seguir escribiendo
        # solo entrena al taller a ignorarnos.
        return False, "ya se le escribió %d veces sin respuesta" % n

    ref = _ultima_senal(orden)
    if ref is None:
        return False, "sin fecha de referencia"
    dias = (ahora - ref).days
    if dias < p["cada_dias"]:
        return False, "hace %d día(s) que se supo de ella (la pauta pide %d)" % (
            dias, p["cada_dias"])

    ult = _fecha(orden.get("ultimo_toque"))
    if ult is not None and (ahora - ult).days < p["cada_dias"]:
        return False, "ya se le escribió hace %d día(s)" % (ahora - ult).days
    return True, "%d días sin novedades" % dias


def plantilla_para(pauta: dict, n_toque: int) -> str:
    """Qué mensaje toca en el aviso número n (empezando en 0).

    Si hay más toques que plantillas se repite la ÚLTIMA, que es la que avisa de
    que va a llamar alguien. Repetir la primera sería volver a empezar de cero
    después de tres silencios.
    """
    esc = normaliza_pauta(pauta)["escalado"]
    return esc[min(max(int(n_toque or 0), 0), len(esc) - 1)]


_VAR = re.compile(r"\{([a-z_]+)\}")


def render(texto: str, datos: dict) -> str:
    """Sustituye {variables} por sus valores.

    Una variable que no exista se deja EN BLANCO en vez de reventar o de dejar
    el `{hueco}` a la vista: esto acaba en el teléfono de un taller, y un
    mensaje con `{matricula}` escrito literalmente hace quedar mal a quien lo
    manda. Que falte un dato no puede impedir que salga el aviso.
    """
    d = {k: ("" if v is None else str(v)) for k, v in (datos or {}).items()}
    return _VAR.sub(lambda m: d.get(m.group(1), ""), str(texto or "")).strip()


def variables_de(texto: str) -> list:
    """Las variables que usa un texto, para poder avisar en el editor."""
    return sorted(set(_VAR.findall(str(texto or ""))))


# Las que el motor sabe rellenar. Sirve para que el editor de la app avise de
# una variable inventada ANTES de que el mensaje salga con un hueco vacío.
VARIABLES = {
    "matricula": "La matrícula de la furgoneta",
    "dias": "Días que lleva sin novedades",
    "enlace": "El enlace al parte del taller",
    "taller": "Nombre del taller",
    "saludo_taller": "«, Talleres X» o vacío si no se sabe el nombre",
    "numero": "Número de la orden (OT-1001)",
    "problema": "Lo que hay que arreglar",
    "fecha_prevista": "Fecha de salida que dijo el taller",
    "dias_dentro": "Días desde que entró en el taller",
}


def contexto(orden: dict, enlace: str, dias: int) -> dict:
    """Los valores de las variables para una orden concreta."""
    taller = (orden.get("taller_nombre") or "").strip()
    return {
        "matricula": orden.get("matricula") or "",
        "dias": dias,
        "enlace": enlace or "",
        "taller": taller,
        # Con coma y todo: así el texto se escribe «Hola{saludo_taller},» y
        # queda bien tanto con nombre como sin él.
        "saludo_taller": (" " + taller) if taller else "",
        "numero": orden.get("numero") or "",
        "problema": (orden.get("problema") or "").strip(),
        "fecha_prevista": str(orden.get("fecha_entrega_estimada") or "")[:10],
        "dias_dentro": _dias_desde(orden.get("fecha_entrada") or orden.get("creada_en")),
    }


# ── auxiliares ──────────────────────────────────────────────────────────────

def _fecha(v):
    """Fecha en ISO -> datetime con zona. None si no se puede leer."""
    if not v:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=_UTC)
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=_UTC)
    except Exception:                                            # noqa: BLE001
        return None


from datetime import timezone as _tz                             # noqa: E402
_UTC = _tz.utc


def _ultima_senal(orden: dict):
    """Lo último que se supo del taller, o cuando se abrió la orden.

    Se coge la MÁS RECIENTE de las tres y no la primera que exista: si un taller
    contestó ayer pero la orden se creó hace un mes, la señal buena es la de
    ayer. Cogiendo la primera no nula se le escribiría igualmente.
    """
    ds = [_fecha(orden.get(k)) for k in
          ("ultima_novedad_taller", "ultima_visita", "creada_en", "fecha_entrada")]
    ds = [d for d in ds if d is not None]
    return max(ds) if ds else None


def _dias_desde(v) -> int:
    d = _fecha(v)
    if d is None:
        return 0
    return max(0, (datetime.now(_UTC) - d).days)


def proximo_aviso(orden: dict, pauta: dict, ahora: datetime):
    """Cuándo le tocaría el siguiente aviso, para poder ENSEÑARLO.

    Que la app diga «el próximo el jueves» en vez de solo «cada 3 días» es la
    diferencia entre una pauta que se entiende y una que se cambia a ciegas.
    Devuelve None si ya no le toca ninguno.
    """
    p = normaliza_pauta(pauta)
    if not p["activa"] or orden.get("estado") not in ESTADOS_QUE_SE_SIGUEN:
        return None
    if int(orden.get("toques") or 0) >= p["max_toques"]:
        return None
    base = _fecha(orden.get("ultimo_toque")) or _ultima_senal(orden)
    if base is None:
        return None
    cand = base + timedelta(days=p["cada_dias"])
    if cand < ahora:
        cand = ahora
    # Se adelanta hasta el primer día de la semana que la pauta permita. Con
    # 14 vueltas se cubre cualquier combinación, incluida una pauta de un solo
    # día a la semana.
    for _ in range(14):
        if cand.weekday() in p["dias_semana"]:
            return cand.replace(hour=p["hora_desde"], minute=0, second=0, microsecond=0)
        cand += timedelta(days=1)
    return None


# ── LO QUE LLEGA DEL TALLER ─────────────────────────────────────────────────
# El canal va en los dos sentidos. Si el taller termina la reparación el martes
# y a nosotros no nos tocaba preguntar hasta el jueves, tiene que poder decirlo
# y que nos salte — si no, la furgoneta se queda dos días parada en la puerta
# del taller estando lista, que es la peor de las esperas porque no la ve nadie.
#
# Un mensaje entrante trae un teléfono, no un número de orden. Hay que averiguar
# de qué furgoneta habla, y eso puede salir mal de dos maneras: no acertar
# (y perder el aviso) o acertar mal (y dar por lista una furgoneta que no lo
# está). Por eso esto devuelve SIEMPRE una certeza, y lo que no se sabe se dice.

_MATRICULA = re.compile(r"\b(\d{4})\s?-?\s?([A-Z]{3})\b", re.I)


def matriculas_en(texto: str) -> list:
    """Las matrículas que aparecen en un texto, normalizadas a '1234 ABC'.

    Se aceptan las tres formas que escribe la gente —'1234ABC', '1234 ABC',
    '1234-ABC'— porque un taller escribe deprisa y desde el móvil.
    """
    out = []
    for n, l in _MATRICULA.findall(str(texto or "")):
        m = "%s %s" % (n, l.upper())
        if m not in out:
            out.append(m)
    return out


def identifica_orden(texto: str, abiertas: list) -> dict:
    """De qué orden habla un mensaje del taller.

    `abiertas` son las órdenes vivas de ESE taller. Devuelve
    {orden, certeza, motivo}; `orden` puede ser None y eso no es un fallo: es la
    respuesta honesta cuando no se puede saber, y quien llame decide qué hacer.

    La regla de oro: un mensaje que no se sabe clasificar NO SE TIRA. Se guarda
    sin asignar y se avisa igual. Perder lo que dice un taller es exactamente el
    silencio que este canal viene a quitar.
    """
    abiertas = [o for o in (abiertas or []) if o]
    if not abiertas:
        return {"orden": None, "certeza": "ninguna",
                "motivo": "ese taller no tiene ninguna orden abierta"}

    # 1. Si el mensaje trae una matrícula y cuadra con una sola, es esa.
    ms = matriculas_en(texto)
    if ms:
        norm = {m.replace(" ", "").upper() for m in ms}
        casan = [o for o in abiertas
                 if str(o.get("matricula") or "").replace(" ", "").replace("-", "").upper() in norm]
        if len(casan) == 1:
            return {"orden": casan[0], "certeza": "alta",
                    "motivo": "el mensaje nombra la matrícula %s" % casan[0].get("matricula")}
        if len(casan) > 1:
            return {"orden": None, "certeza": "ninguna",
                    "motivo": "el mensaje nombra %d matrículas" % len(casan)}

    # 2. Sin matrícula: si el taller solo tiene una furgoneta nuestra, es esa.
    if len(abiertas) == 1:
        return {"orden": abiertas[0], "certeza": "alta",
                "motivo": "es la única furgoneta que tienen"}

    # 3. Varias y sin matrícula. NO se elige la más probable: dar por lista una
    #    furgoneta que no lo es manda a alguien a recoger algo que no está, y
    #    eso quema el canal más rápido que no contestar.
    return {"orden": None, "certeza": "ninguna",
            "motivo": "tienen %d furgonetas nuestras y el mensaje no dice cuál"
                      % len(abiertas)}


# Lo que el taller puede estar diciendo. Se detecta para poder ADELANTAR el
# trabajo —proponer el cambio de estado— pero nunca para aplicarlo solo: una
# palabra suelta no cambia el estado de una orden.
_PISTAS = (
    ("listo", ("ya esta", "está lista", "esta lista", "listo", "lista para recoger",
               "podeis pasar", "podéis pasar", "terminada", "terminado", "acabada",
               "acabado", "finalizado", "puede recoger", "recoger cuando")),
    ("esperando_piezas", ("esperando pieza", "esperando piezas", "falta la pieza",
                          "no ha llegado la pieza", "pendiente de pieza",
                          "en cuanto llegue", "sin stock", "pedido el recambio")),
    ("en_curso", ("estamos con ella", "en ello", "trabajando", "mañana la miramos",
                  "la semana que viene", "en proceso", "la tenemos dentro")),
    ("presupuesto", ("presupuesto", "precio", "coste", "euros", "iva", "€")),
)


def pista_de_estado(texto: str) -> str:
    """Qué parece decir el mensaje, o "" si no está claro.

    NO decide nada: solo propone, para que la persona confirme con un clic en
    vez de teclearlo. Adivinar el estado de una reparación por una frase suelta
    y aplicarlo sería inventarse el dato con cara de medido.
    """
    t = " %s " % str(texto or "").lower().strip()
    for clave, frases in _PISTAS:
        if any(f in t for f in frases):
            return clave
    return ""
