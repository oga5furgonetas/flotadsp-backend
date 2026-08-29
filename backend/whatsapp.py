# -*- coding: utf-8 -*-
"""Envio de WhatsApp por la Cloud API de Meta, sin intermediarios.

POR QUE DIRECTO Y NO POR UN PROVEEDOR. Meta cobra por PLANTILLA enviada fuera de
una conversacion abierta; las de tipo "utility" —que es todo lo nuestro: ITV
vencida, incidencia grave, resumen del dia— salen a 0,015-0,02 EUR en Espana y
son gratis si la persona ha escrito en las ultimas 24 h. No hay cuota fija. Un
proveedor de bandeja anadiria su mensualidad ENCIMA de eso y un intermediario
mas que depurar, y solo compensaria si hiciera falta una bandeja compartida para
contestar a mano. No es el caso.

LAS CREDENCIALES VIVEN EN EL ENTORNO, NUNCA EN LA BASE NI EN EL CODIGO. Se
ponen con `fly secrets set` sobre `flotadsp-backend`:

    WHATSAPP_ACCESS_TOKEN        token permanente de system user
    WHATSAPP_PHONE_NUMBER_ID     id del numero emisor
    WHATSAPP_BUSINESS_ACCOUNT_ID cuenta de WhatsApp Business (para las plantillas)
    WHATSAPP_VERIFY_TOKEN        cadena que elegimos nosotros, para el webhook

Lo que SI vive en la base es el interruptor de cada aviso (`whatsapp_config`),
igual que con Telegram: eso lo cambia la oficina desde el panel y no es secreto.

TODO ENVIO SE APUNTA en `whatsapp_envios`, salga bien o mal. Un canal de avisos
que falla en silencio es peor que no tenerlo: se da por hecho que la gente esta
avisada cuando no lo esta. Hoy mismo se perdio un dia entero de datos de Cortex
por un fallo silencioso, y no se repite aqui.
"""
import logging
import os
import re
from datetime import datetime, timedelta, timezone

import aiohttp

logger = logging.getLogger(__name__)

API = "https://graph.facebook.com/v21.0"
COLECCION_ENVIOS = "whatsapp_envios"
COLECCION_CONFIG = "whatsapp_config"

# Prefijo por defecto para los numeros que se guardaron sin el. Toda la
# plantilla esta en Espana; si algun dia hay otro pais, el numero tendra que
# venir ya con su prefijo y este valor no lo tocara.
PREFIJO_POR_DEFECTO = os.environ.get("WHATSAPP_PREFIJO_PAIS", "34")


def configurado() -> bool:
    """Si estan las tres credenciales que hacen falta para enviar."""
    return bool(os.environ.get("WHATSAPP_ACCESS_TOKEN")
                and os.environ.get("WHATSAPP_PHONE_NUMBER_ID"))


def estado() -> dict:
    """Que hay puesto y que falta. Sin devolver NUNCA el token."""
    faltan = [k for k in ("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID",
                          "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_VERIFY_TOKEN")
              if not os.environ.get(k)]
    return {
        "configurado": configurado(),
        "faltan": faltan,
        "phone_number_id": os.environ.get("WHATSAPP_PHONE_NUMBER_ID") or None,
        "business_account_id": os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID") or None,
    }


def normaliza_telefono(tel) -> str:
    """A E.164 sin el '+', que es como lo quiere la Cloud API.

    Los telefonos estan escritos a mano y llegan de seis maneras: '639448263',
    '+34 639 44 82 63', '0034639448263'. Un numero mal montado no da error al
    enviar: Meta responde 200 y el mensaje no llega a nadie, que es el peor de
    los dos fallos posibles. Devuelve '' si no se puede montar, y entonces no
    se envia.
    """
    s = re.sub(r"[^0-9+]", "", str(tel or ""))
    if not s:
        return ""
    if s.startswith("00"):
        s = "+" + s[2:]
    if s.startswith("+"):
        s = s[1:]
    elif len(s) == 9:
        # Nueve digitos y sin prefijo: es un movil espanol.
        s = PREFIJO_POR_DEFECTO + s
    return s if 9 <= len(s) <= 15 and s.isdigit() else ""


async def _apunta(db, doc: dict):
    try:
        ahora = datetime.now(timezone.utc)
        doc["at"] = ahora.isoformat()
        # 90 dias y caduca solo: es un registro de operacion, no un historico, y
        # una coleccion de avisos sin techo crece hasta que alguien la descubre.
        # Va como datetime y no como texto: el indice TTL de Mongo solo entiende
        # fechas (el mismo detalle que ya mordio en `cortex_packages`).
        doc["expira_en"] = ahora + timedelta(days=90)
        # UNA COPIA, no el propio dict. `insert_one` le mete dentro el `_id` que
        # acaba de generar, y este mismo dict es el que se devuelve al que llamó
        # — FastAPI no sabe serializar un ObjectId y la respuesta entera se
        # convierte en un 500. La prueba desde el panel fallaba exactamente asi:
        # el mensaje se apuntaba bien y el error llegaba al final, donde parece
        # que lo roto es el envio.
        await db[COLECCION_ENVIOS].insert_one(dict(doc))
    except Exception as e:                                   # noqa: BLE001
        logger.debug("whatsapp: no se pudo apuntar el envio: %s", e)


async def enviar_plantilla(db, telefono: str, plantilla: str,
                           parametros: list = None, motivo: str = "",
                           idioma: str = "es") -> dict:
    """Manda una plantilla aprobada. NUNCA lanza: devuelve el resultado.

    No lanza a proposito. Esto se llama desde dentro de flujos que ya estaban
    funcionando —guardar una incidencia, cerrar el dia— y un WhatsApp que no
    sale no puede tumbar la operacion que lo dispara.
    """
    destino = normaliza_telefono(telefono)
    base = {"plantilla": plantilla, "motivo": motivo,
            "telefono": destino or str(telefono or "")[:24]}

    if not destino:
        r = {**base, "ok": False, "error": "telefono_invalido"}
        await _apunta(db, r)
        return r
    if not configurado():
        r = {**base, "ok": False, "error": "sin_credenciales"}
        await _apunta(db, r)
        return r

    cuerpo = {
        "messaging_product": "whatsapp",
        "to": destino,
        "type": "template",
        "template": {
            "name": plantilla,
            "language": {"code": idioma},
        },
    }
    if parametros:
        cuerpo["template"]["components"] = [{
            "type": "body",
            "parameters": [{"type": "text", "text": str(p)[:900]} for p in parametros],
        }]

    url = f"{API}/{os.environ['WHATSAPP_PHONE_NUMBER_ID']}/messages"
    cab = {"Authorization": f"Bearer {os.environ['WHATSAPP_ACCESS_TOKEN']}",
           "Content-Type": "application/json"}
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(url, json=cuerpo, headers=cab,
                              timeout=aiohttp.ClientTimeout(total=15)) as resp:
                datos = await resp.json(content_type=None)
                if resp.status >= 400:
                    # El error de Meta se guarda TAL CUAL. "plantilla no
                    # aprobada" y "numero no valido" se arreglan de formas
                    # distintas, y un "fallo al enviar" generico no dice cual es.
                    err = (datos or {}).get("error") or {}
                    r = {**base, "ok": False, "http": resp.status,
                         "error": str(err.get("message") or datos)[:300],
                         "codigo": err.get("code")}
                    logger.warning("WhatsApp %s -> %s: %s", plantilla, resp.status, r["error"])
                    await _apunta(db, r)
                    return r
                mid = ((datos.get("messages") or [{}])[0]).get("id")
                r = {**base, "ok": True, "message_id": mid}
                await _apunta(db, r)
                return r
    except Exception as e:                                   # noqa: BLE001
        r = {**base, "ok": False, "error": f"{type(e).__name__}: {e}"[:300]}
        logger.warning("WhatsApp %s: %s", plantilla, r["error"])
        await _apunta(db, r)
        return r


async def plantillas(db=None) -> dict:
    """Las plantillas de la cuenta y en que estado las tiene Meta.

    Se pregunta a Meta en vez de mantener la lista a mano: una plantilla
    rechazada sigue existiendo en nuestro codigo y el unico sitio donde consta
    que no se puede usar es la respuesta de Meta. Si no hay credenciales, se
    dice, en vez de devolver una lista vacia que parece "no hay ninguna".
    """
    cuenta = os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID")
    if not (cuenta and os.environ.get("WHATSAPP_ACCESS_TOKEN")):
        return {"ok": False, "error": "sin_credenciales", "plantillas": []}
    url = f"{API}/{cuenta}/message_templates?limit=50"
    cab = {"Authorization": f"Bearer {os.environ['WHATSAPP_ACCESS_TOKEN']}"}
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(url, headers=cab,
                             timeout=aiohttp.ClientTimeout(total=15)) as resp:
                datos = await resp.json(content_type=None)
                if resp.status >= 400:
                    err = (datos or {}).get("error") or {}
                    return {"ok": False, "error": str(err.get("message") or datos)[:300],
                            "plantillas": []}
                return {"ok": True, "plantillas": [
                    {"nombre": t.get("name"), "estado": t.get("status"),
                     "idioma": t.get("language"), "categoria": t.get("category")}
                    for t in (datos.get("data") or [])]}
    except Exception as e:                                   # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}: {e}"[:200], "plantillas": []}


# ---------------------------------------------------------------------------
# ALTA DE LAS PLANTILLAS POR API
# ---------------------------------------------------------------------------
# Se pueden crear a mano en el WhatsApp Manager, pero hay tres formas de que
# salga mal y ninguna avisa a tiempo: el nombre tiene que coincidir LETRA POR
# LETRA con el que manda el codigo (si no, "template not found" el dia que se
# active), la categoria tiene que ser "utility" (como "marketing" cuesta mas
# por mensaje y ademas Meta las rechaza, porque no venden nada) y cada variable
# necesita un ejemplo concreto o la revision la tumba por "ejemplos poco
# claros". Escritas aqui una vez, se suben de un boton y las tres cosas salen
# bien por construccion.
#
# El texto va con {{1}}, {{2}}... y el ORDEN es el mismo con el que llaman los
# disparadores en server.py. Cambiar el orden aqui sin cambiarlo alli manda la
# matricula donde va la fecha, y Meta lo acepta: son dos textos cualesquiera.
PLANTILLAS_BASE = [
    {
        "name": "itv_vencida",
        "language": "es",
        "category": "UTILITY",
        "components": [{
            "type": "BODY",
            "text": ("La furgoneta {{1}} tiene la ITV vencida desde hace {{2}} "
                     "días. No puede salir a ruta hasta pasarla."),
            "example": {"body_text": [["1234 ABC", "12"]]},
        }],
    },
    {
        "name": "incidencia_critica",
        "language": "es",
        "category": "UTILITY",
        "components": [{
            "type": "BODY",
            "text": ("Nueva incidencia grave en {{1}}: {{2}}. Revisar antes de "
                     "la próxima ruta."),
            "example": {"body_text": [["1234 ABC", "frenos con ruido al pisar"]]},
        }],
    },
    {
        "name": "resumen_diario",
        "language": "es",
        "category": "UTILITY",
        "components": [{
            "type": "BODY",
            "text": ("Resumen {{1}}: {{2}} entregados, {{3}} golpes nuevos, "
                     "checklist {{4}}."),
            "example": {"body_text": [["OGA5 28/08", "3.412", "2", "38 de 41"]]},
        }],
    },
]


async def crear_plantillas(db=None) -> dict:
    """Da de alta en Meta las tres plantillas. Se puede llamar mil veces.

    Idempotente a proposito: si una ya existe no se reenvia, porque Meta
    responde con un error ("template name already exists") que en el panel se
    leeria como que algo fallo cuando lo que pasa es que ya estaba hecho.
    """
    cuenta = os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID")
    if not (cuenta and os.environ.get("WHATSAPP_ACCESS_TOKEN")):
        return {"ok": False, "error": "sin_credenciales", "resultados": []}

    ya = await plantillas()
    if not ya.get("ok"):
        # Sin poder leer lo que hay no se sube nada: a ciegas se duplicarian
        # las que existan y el resultado seria una lista de errores.
        return {"ok": False, "error": ya.get("error") or "no_se_pudo_leer",
                "resultados": []}
    existentes = {p.get("nombre") for p in (ya.get("plantillas") or [])}

    url = f"{API}/{cuenta}/message_templates"
    cab = {"Authorization": f"Bearer {os.environ['WHATSAPP_ACCESS_TOKEN']}",
           "Content-Type": "application/json"}
    salida = []
    async with aiohttp.ClientSession() as s:
        for pl in PLANTILLAS_BASE:
            if pl["name"] in existentes:
                salida.append({"plantilla": pl["name"], "ok": True,
                               "estado": "ya_existia"})
                continue
            try:
                async with s.post(url, json=pl, headers=cab,
                                  timeout=aiohttp.ClientTimeout(total=20)) as resp:
                    datos = await resp.json(content_type=None)
                    if resp.status >= 400:
                        err = (datos or {}).get("error") or {}
                        # `error_user_msg` es el mensaje en cristiano que Meta
                        # escribe para la persona; `message` es el tecnico.
                        salida.append({
                            "plantilla": pl["name"], "ok": False,
                            "error": str(err.get("error_user_msg")
                                         or err.get("message") or datos)[:300]})
                    else:
                        salida.append({"plantilla": pl["name"], "ok": True,
                                       "estado": datos.get("status") or "PENDING"})
            except Exception as e:                           # noqa: BLE001
                salida.append({"plantilla": pl["name"], "ok": False,
                               "error": f"{type(e).__name__}: {e}"[:200]})
    logger.info("WhatsApp alta de plantillas: %s", salida)
    return {"ok": all(r["ok"] for r in salida), "resultados": salida}


async def config(db) -> dict:
    """Que avisos estan encendidos. Por defecto TODO APAGADO.

    Apagado de entrada a proposito: en cuanto se pongan las credenciales, esto
    empieza a escribir a numeros de personas reales. Que se encienda a mano y
    cuando alguien lo decida, no por el hecho de haber pegado un token.
    """
    doc = await db[COLECCION_CONFIG].find_one({}, {"_id": 0}) or {}
    return {
        "activo": bool(doc.get("activo", False)),
        "avisar_itv": bool(doc.get("avisar_itv", False)),
        "avisar_incidencia": bool(doc.get("avisar_incidencia", False)),
        "avisar_resumen": bool(doc.get("avisar_resumen", False)),
        "plantilla_itv": doc.get("plantilla_itv") or "itv_vencida",
        "plantilla_incidencia": doc.get("plantilla_incidencia") or "incidencia_critica",
        "plantilla_resumen": doc.get("plantilla_resumen") or "resumen_diario",
    }


async def puede_avisar(db, clave: str) -> bool:
    """Si ese aviso concreto puede salir ahora mismo. Tres condiciones."""
    if not configurado():
        return False
    c = await config(db)
    return bool(c.get("activo") and c.get(clave))
