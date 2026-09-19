# -*- coding: utf-8 -*-
"""El cupon de la campana de candidatos vale para las TRES prendas.

EL FALLO, VISTO EL 19-09-2026 ANTES DE QUE LO SUFRIERA NADIE. El cupon se
creaba con `max_redemptions=1`: se gastaba entero en la primera compra. Pero la
tienda, al entrar con el cupon en la URL, ensena el precio tachado en las TRES
tarjetas a la vez -hoodie, cortavientos y gorra-. Quien comprara el hoodie con
sus 10 EUR de menos y volviera a por el cortavientos se lo encontraba a precio
entero en la pantalla de pago, despues de haberlo visto rebajado en el
escaparate. El descuento no "fallaba": es que ya no existia, y solo se
descubria pagando.

Las dos mitades tienen que decir lo mismo, y ninguna de las dos sabe de la
otra: el numero de usos vive en `server.py` y el escaparate en `app.js`. Por
eso este fichero los lee como TEXTO (gotcha 40: se lee el codigo real, no una
copia) y los compara entre si y contra el catalogo de la tienda.

No hace falta ni Mongo ni Stripe: aqui no se cobra nada, se comprueba que lo
que promete la tienda es lo que el backend le pide a Stripe.
"""
import glob
import io
import os
import re

AQUI = os.path.dirname(__file__)
SERVER = os.path.join(AQUI, "..", "server.py")
TIENDA = glob.glob(os.path.join(AQUI, "..", "..", "frontend-v2", "public", "t", "*"))


def _servidor() -> str:
    return io.open(SERVER, encoding="utf-8-sig").read()


def _tienda(fichero: str) -> str:
    """El escaparate publico. Es una carpeta por enlace de tienda; si algun dia
    hay dos, se comprueban las dos."""
    textos = []
    for carpeta in TIENDA:
        ruta = os.path.join(carpeta, fichero)
        if os.path.isfile(ruta):
            textos.append(io.open(ruta, encoding="utf-8").read())
    assert textos, "no encuentro %s de la tienda publica" % fichero
    return "\n".join(textos)


def _constante(nombre: str) -> str:
    m = re.search(r"^%s = (.+)$" % nombre, _servidor(), re.M)
    assert m, "ha desaparecido %s de server.py" % nombre
    return m.group(1).strip()


def test_un_uso_por_cada_prenda_a_la_venta():
    """El trinquete de verdad: tantos usos como prendas ensena la tienda.

    Si manana entra una cuarta prenda, este test se pone rojo. Es a proposito:
    cada uso son 10 EUR regalados a la MISMA persona y un cupon personal se
    puede reenviar, asi que el numero se sube a mano y mirandolo, nunca solo.
    """
    prendas = set(re.findall(r'data-prod="([a-z0-9_-]+)"', _tienda("index.html")))
    assert prendas, "la tienda no ensena ninguna prenda; algo mas se ha roto"
    usos = int(_constante("_CAMPANA_CUPON_USOS"))
    assert usos == len(prendas), (
        "la tienda ensena %d prendas (%s) con el precio tachado y el cupon solo "
        "admite %d compras: el escaparate promete un descuento que no existe"
        % (len(prendas), ", ".join(sorted(prendas)), usos))


def test_la_campana_no_vuelve_al_cupon_de_un_solo_uso():
    """La forma exacta que fallaba, por si vuelve con otro nombre."""
    s = _servidor()
    assert "un_solo_uso" not in s, (
        "ha vuelto el booleano de un solo uso; el cupon de la campana lleva "
        "`usos=_CAMPANA_CUPON_USOS`")
    assert re.search(
        r"_stripe_crear_cupon\(\s*\n?\s*_CAMPANA_CUPON_EUR, _CAMPANA_CUPON_HORAS,"
        r"\s*usos=_CAMPANA_CUPON_USOS\)", s), (
        "la campana ya no crea el cupon con las constantes; un 1 escrito a mano "
        "ahi dentro es justo el fallo que este fichero vigila")


def test_max_redemptions_solo_cuando_se_pide():
    """`usos=0` es un cupon SIN limite: no puede colarse un `max_redemptions=0`,
    que Stripe entenderia como un cupon inservible."""
    s = _servidor()
    assert 'if usos > 0:\n        datos.append(("max_redemptions", str(usos)))' in s, (
        "ha cambiado la guarda de max_redemptions en _stripe_crear_cupon")


def test_la_tienda_descuenta_el_mismo_importe_que_manda_el_correo():
    """Los 10 EUR estan escritos en dos sitios que no se hablan.

    En `app.js` porque la pagina pinta el precio rebajado sin preguntar, y en
    `server.py` porque es lo que se le pide a Stripe. Si se separan, el
    escaparate ensena un precio y la pasarela cobra otro.
    """
    del_backend = float(_constante("_CAMPANA_CUPON_EUR"))
    m = re.search(r"var CUPON_EUR = (\d+(?:\.\d+)?);", _tienda("app.js"))
    assert m, "ha desaparecido CUPON_EUR de la tienda"
    assert float(m.group(1)) == del_backend, (
        "la tienda descuenta %s EUR y la campana crea el cupon de %s EUR"
        % (m.group(1), del_backend))


def test_el_escaparate_y_el_correo_dicen_que_vale_para_cada_prenda():
    """Que el texto acompane al cambio: con tres usos y un texto de 'un cupon
    de 10 EUR' a secas, nadie se entera de que puede llevarse las tres."""
    assert "10 € en cada prenda" in _tienda("app.js"), (
        "el banner de la tienda ya no dice que el cupon vale en cada prenda")
    assert "de las tres prendas" in _servidor(), (
        "el correo de la campana ya no dice que el descuento va en cada prenda")


def test_un_cupon_mayor_que_el_pedido_no_marca_descuadre():
    """El webhook compara lo cobrado con lo esperado y, si no cuadra, deja el
    pedido SIN enviar. Con un cupon que descuente mas de lo que vale la prenda,
    Stripe cobra 0 y el esperado se iria a negativo: una venta legitima
    marcada de descuadre, en silencio. Es la trampa que espera al dia que se
    suba el importe del cupon, que es justo lo que se estuvo pensando hoy."""
    assert re.search(r"esperado = max\(0, int\(round\(", _servidor()), (
        "el importe esperado del webhook vuelve a poder ser negativo")


def test_la_campana_no_manda_dos_veces_al_mismo_correo():
    """La misma persona se postula a varias ofertas y deja varias fichas: el
    19-09-2026 habia 253 fichas con correo para 224 direcciones distintas. Una
    campana sobre las FICHAS le manda dos correos identicos y crea DOS cupones
    personales -60 EUR regalados a la misma persona en vez de 30- y encima
    parece spam justo a quien se esta intentando recuperar."""
    ent = {}
    exec(_fuente_de("_campana_destinatarios"), ent)
    salida = ent["_campana_destinatarios"]([
        {"email": "ana@correo.com", "nombre": ""},
        {"email": "  Ana@Correo.com ", "nombre": "Ana"},
        {"email": "berto@correo.com", "nombre": "Berto"},
        {"email": "", "nombre": "sin correo"},
        {"nombre": "ni campo"},
    ])
    assert [d["email"] for d in salida] == ["ana@correo.com", "berto@correo.com"]
    # Y el nombre se rescata de la otra ficha: la primera lo tenia vacio.
    assert salida[0]["nombre"] == "Ana"


def _fuente_de(nombre):
    """El codigo REAL de una funcion de server.py, sin importar el modulo (que
    arrancaria conexiones). Gotcha 40: una copia deja de probar lo que corre."""
    import ast
    fuente = _servidor()
    for n in ast.parse(fuente).body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == nombre:
            return ast.get_source_segment(fuente, n)
    raise AssertionError(nombre + " ya no existe en server.py")


def main():
    """Para el runner que ejecuta ficheros sueltos (run_all.py aguanta las dos
    formas)."""
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_") and callable(fn):
            fn()
    print("cupon de campana: todo en su sitio")


if __name__ == "__main__":
    main()
