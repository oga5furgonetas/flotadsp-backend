# -*- coding: utf-8 -*-
"""Mensajes privados entre la gente del panel, y quien esta conectado.

Lo que se prueba aqui es lo que, si se rompe, no falla: dos personas hablando
en conversaciones distintas sin saberlo, y una ruta que nunca llega a
ejecutarse porque otra se la come.

  · LA CLAVE DE LA CONVERSACION ES SIMETRICA. Se guarda el par de ids
    ORDENADO: si dependiera de quien escribe primero, Mery veria un hilo y
    Judit otro, las dos con la mitad de los mensajes y sin ningun error.
  · `GET /chat/{center}` ES UN COMODIN. Una ruta `/chat/loquesea` declarada
    DESPUES no se ejecuta jamas —FastAPI casa por orden— y devolveria el chat
    de un centro llamado "loquesea". Por eso los privados cuelgan de
    `/mensajes`, y este fichero lo vigila.
  · «HACE N MINUTOS» CON FECHAS SIN ZONA. Mongo devuelve las fechas sin
    tzinfo; restarlas contra una fecha con zona revienta, y una presencia que
    revienta se traga el chat entero.
"""
import ast
import io
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"
_TEXTO = io.open(SERVER, encoding="utf-8-sig").read()


def _cargar(*nombres):
    amb = {"datetime": datetime, "timezone": timezone, "Optional": Optional}
    for n in ast.parse(_TEXTO).body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in nombres:
            exec(ast.get_source_segment(_TEXTO, n), amb)                        # noqa: S102
    faltan = [x for x in nombres if x not in amb]
    assert not faltan, "no existen en server.py: %s" % faltan
    return amb


def test_la_conversacion_es_la_misma_escriba_quien_escriba():
    conv = _cargar("_conv_id")["_conv_id"]
    assert conv("ana", "berto") == conv("berto", "ana")
    assert conv("ana", "berto") != conv("ana", "cris")
    # Y no se cuelga con un id vacio: devuelve algo estable, no una excepcion.
    assert conv("ana", "") == conv("", "ana")


def test_una_fecha_sin_zona_no_revienta_la_presencia():
    hace = _cargar("_hace_min")["_hace_min"]
    ahora = datetime.now(timezone.utc)
    assert hace((ahora - timedelta(minutes=5)).replace(tzinfo=None).isoformat()) == 5
    assert hace((ahora - timedelta(minutes=5)).isoformat()) == 5
    assert hace("") is None
    assert hace("vete tu a saber") is None
    # Una fecha del futuro (relojes desajustados) es 0, nunca un negativo que
    # se leeria como «hace -3 min».
    assert hace((ahora + timedelta(minutes=3)).isoformat()) == 0


def test_los_privados_no_cuelgan_de_la_ruta_comodin_del_chat():
    """`GET /chat/{center}` casa con CUALQUIER /chat/x. Una ruta de privados
    declarada debajo no se ejecutaria nunca y nadie lo notaria leyendo el
    codigo: contestaria el chat de un centro que no existe."""
    comodin = _TEXTO.index('@api_router.get("/chat/{center}")')
    for ruta in ('@api_router.get("/mensajes/gente")',
                 '@api_router.get("/mensajes/con/{otro_id}")',
                 '@api_router.post("/mensajes/con/{otro_id}")'):
        assert ruta in _TEXTO, "falta la ruta %s" % ruta
    # Ninguna de las tres puede empezar por /chat/
    assert '@api_router.get("/chat/gente")' not in _TEXTO
    assert '@api_router.get("/chat/con/' not in _TEXTO
    # Y las de /mensajes van ANTES del comodin, por si algun dia se mueven ahi.
    for ruta in ('@api_router.get("/mensajes/gente")',
                 '@api_router.get("/mensajes/con/{otro_id}")'):
        assert _TEXTO.index(ruta) < comodin, "%s quedaria tapada por /chat/{center}" % ruta


def test_un_privado_avisa_a_una_persona_y_no_al_centro():
    """Un mensaje privado que disparara el push del centro entero seria
    exactamente lo contrario de lo que se pide: que solo lo vean los dos."""
    envio = _TEXTO.split('async def mensajes_enviar(')[1].split('@api_router')[0]
    assert "send_web_push_to_users(" in envio
    assert "push_center_event" not in envio, "un privado no puede avisar al centro"


def test_la_sala_manda_la_foto_de_quien_escribe():
    """La foto la resuelve el SERVIDOR por el id del autor: asi cambiarla se
    nota tambien en los mensajes viejos, y el cliente no tiene que saber de
    donde sale la foto de otra persona."""
    bloque = _TEXTO.split("async def chat_get(")[1].split("@api_router")[0]
    assert "author_photo" in bloque and "admin_users" in bloque


def test_sin_empresa_no_hay_chat_y_nunca_cae_a_todas():
    """El chat privado cruza a gente de `global_db.admin_users`, UNA coleccion
    para todas las empresas. La primera version, sin `org_id` en el token, caia
    en `{}` -todos los usuarios de todas las empresas- y dejaba listar y
    escribir a gente de otro cliente con HTTP 200 (gotcha 26)."""
    class HTTPException(Exception):
        def __init__(self, status_code, detail=""):
            self.status_code = status_code
    amb = _cargar_con({"HTTPException": HTTPException}, "_mensajes_org")
    org = amb["_mensajes_org"]
    assert org({"org_id": "owner"}) == "owner"
    for sin in ({}, {"org_id": ""}, {"org_id": None}):
        try:
            org(sin)
        except HTTPException as ex:
            assert ex.status_code == 403
        else:
            raise AssertionError("sin empresa tenia que dar 403, dio: %r" % (sin,))


def test_ninguna_ruta_de_mensajes_cae_a_todas_las_empresas():
    """El patron peligroso es escribir el filtro de empresa CONDICIONAL. Se
    busca en el texto de las tres rutas: el filtro va siempre por
    `_mensajes_org(user)`, que revienta si no hay empresa."""
    for nombre in ("async def mensajes_gente(", "async def mensajes_con(",
                   "async def mensajes_enviar("):
        cuerpo = _TEXTO.split(nombre)[1].split("@api_router")[0]
        assert "_mensajes_org(user)" in cuerpo, "%s no filtra por empresa" % nombre
        assert 'if user.get("org_id") else {}' not in cuerpo, (
            "%s vuelve a caer a TODAS las empresas sin org_id" % nombre)


def test_no_se_ofrecen_ni_se_escribe_a_cuentas_desactivadas():
    """Una cuenta desactivada no puede entrar: hablarle es escribir a nadie, y
    verla como «no conectada» invita a esperar una respuesta que no llegara."""
    assert '"disabled": {"$ne": True}' in _TEXTO.split("async def mensajes_gente(")[1].split("@api_router")[0]
    assert '"disabled": {"$ne": True}' in _TEXTO.split("async def mensajes_enviar(")[1].split("@api_router")[0]


def _cargar_con(extra, *nombres):
    amb = {"datetime": datetime, "timezone": timezone, "Optional": Optional}
    amb.update(extra)
    for n in ast.parse(_TEXTO).body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in nombres:
            exec(ast.get_source_segment(_TEXTO, n), amb)                        # noqa: S102
    faltan = [x for x in nombres if x not in amb]
    assert not faltan, "no existen en server.py: %s" % faltan
    return amb


def main():
    fallos = 0
    for nombre, f in sorted(globals().items()):
        if nombre.startswith("test_") and callable(f):
            try:
                f()
                print("ok  ", nombre)
            except Exception as ex:                              # noqa: BLE001
                fallos += 1
                print("FALLA", nombre, repr(ex))
    return fallos


if __name__ == "__main__":
    sys.exit(1 if main() else 0)


def test_los_documentos_del_chat_van_por_lista_blanca_y_a_alguien_de_la_empresa():
    """Un .html o un .svg servido desde el dominio del almacen ejecutaria codigo
    de quien lo sube: el tipo lo pone el servidor y solo de una lista blanca."""
    _ARBOL = ast.parse(_TEXTO)
    src = next(ast.get_source_segment(_TEXTO, n) for n in ast.walk(_ARBOL)
               if isinstance(n, ast.AsyncFunctionDef) and n.name == "mensajes_enviar_archivo")
    assert "_mensajes_org(user)" in src, "el destinatario tiene que ser de tu empresa"
    assert '"disabled": {"$ne": True}' in src
    assert "_CHAT_ADJUNTOS[ext]" in src and "if ext not in _CHAT_ADJUNTOS" in src
    assert "_CHAT_ADJUNTO_MAX" in src
    # El tipo NO se toma de lo que diga el navegador.
    assert "file.content_type" not in src
    tabla = [n for n in ast.walk(_ARBOL) if isinstance(n, ast.Assign)
             and getattr(n.targets[0], "id", "") == "_CHAT_ADJUNTOS"][0]
    permitidas = set(ast.literal_eval(tabla.value))
    assert not permitidas & {"html", "htm", "svg", "js", "exe", "php", "xml"}
    assert {"pdf", "xlsx", "docx", "png", "jpg"} <= permitidas
