# -*- coding: utf-8 -*-
"""Como sale el formulario hacia Stripe, y por que no puede ir en `data=`.

EL FALLO, MEDIDO EN PRODUCCION EL 08-09-2026. La primera compra de verdad
desde el enlace publico devolvio "No se ha podido abrir el pago. Intentalo en
un minuto." Ni la clave ni Stripe tenian nada que ver: la peticion no llegaba
a salir. En los logs del backend estaba entero:

    Stripe checkout publico: Attempted to send an sync request with an
    AsyncClient instance.

Stripe quiere sus arrays como `line_items[0][price_data][currency]`, asi que
los pares se arman en una LISTA -claves anidadas, en orden-. Pero httpx solo
trata `data=` como formulario cuando es un DICCIONARIO; con cualquier otra
cosa se va por la rama antigua de "contenido en crudo", fabrica un flujo
sincrono, y el AsyncClient lo rechaza al enviarlo.

Y lo que lo hacia dificil de ver: la llamada vive dentro de un `except
Exception` ancho, que convierte un error de programacion en un aviso de
problema pasajero -"intentalo en un minuto"- para algo que no iba a funcionar
nunca. Es el gotcha 19 con otra cara.

Afectaba a los DOS botones de pagar: el del conductor y el del enlace publico.
Este fichero no habla con Stripe: comprueba la FORMA de la peticion contra el
httpx instalado, que es donde estaba el fallo.
"""
import io
import os
import re
from urllib.parse import urlencode

import httpx
import pytest

SERVER = os.path.join(os.path.dirname(__file__), "..", "server.py")

DATOS = [
    ("mode", "payment"),
    ("shipping_address_collection[allowed_countries][0]", "ES"),
    ("line_items[0][quantity]", "1"),
    ("line_items[0][price_data][currency]", "eur"),
    ("line_items[0][price_data][unit_amount]", "4990"),
    ("line_items[0][price_data][product_data][name]", "Gorra FDs - talla U"),
]


def _flujo_asincrono(peticion) -> bool:
    """?Puede un AsyncClient enviar esta peticion? Es lo que mira httpx."""
    return hasattr(peticion.stream, "__aiter__")


def test_una_lista_en_data_no_puede_enviarse():
    """La forma que fallaba. Si esto deja de ser cierto, httpx ha cambiado."""
    cli = httpx.AsyncClient()
    p = cli.build_request("POST", "https://api.stripe.com/v1/checkout/sessions",
                          data=DATOS)
    assert not _flujo_asincrono(p), (
        "httpx ya acepta listas en data=; revisa si el arreglo sigue haciendo falta")


def test_un_diccionario_en_data_si_puede():
    """Para que quede escrito por que NO se arreglo asi.

    Funciona, pero exige que las claves sean unicas: el dia que Stripe pida
    dos `line_items`, un diccionario se come uno de los dos en silencio.
    """
    cli = httpx.AsyncClient()
    p = cli.build_request("POST", "https://api.stripe.com/v1/checkout/sessions",
                          data=dict(DATOS))
    assert _flujo_asincrono(p)


def test_la_forma_que_usamos_si_puede_enviarse():
    """Codificado a mano y como contenido: conserva orden y claves repetidas."""
    cli = httpx.AsyncClient()
    p = cli.build_request(
        "POST", "https://api.stripe.com/v1/checkout/sessions",
        content=urlencode(DATOS).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert _flujo_asincrono(p)
    assert p.headers["content-type"] == "application/x-www-form-urlencoded"


def test_dos_line_items_sobreviven_a_la_codificacion():
    """Lo que un diccionario perderia: los pares repetidos siguen ahi."""
    pares = DATOS + [("line_items[1][quantity]", "2")]
    cuerpo = urlencode(pares)
    assert "line_items%5B0%5D%5Bquantity%5D=1" in cuerpo
    assert "line_items%5B1%5D%5Bquantity%5D=2" in cuerpo


def test_el_codigo_real_no_manda_el_formulario_en_data():
    """El trinquete: se lee `server.py`, no una copia (gotcha 40).

    Las dos llamadas a Stripe -la del conductor y la del enlace publico- tienen
    que ir por `content=`. Volver a `data=datos` las rompe otra vez.
    """
    s = io.open(SERVER, encoding="utf-8-sig").read()
    llamadas = re.findall(
        r"cli\.post\(\s*\n?\s*_STRIPE_API \+ \"/checkout/sessions\",(.{0,260})", s, re.S)
    assert len(llamadas) == 2, "esperaba las dos llamadas a Stripe, hay %d" % len(llamadas)
    for cuerpo in llamadas:
        assert "content=_url_encode(" in cuerpo, "esta llamada volvio a data=: %r" % cuerpo[:90]
        assert re.search(r"\bdata=", cuerpo) is None, "hay un data= en la llamada a Stripe"
