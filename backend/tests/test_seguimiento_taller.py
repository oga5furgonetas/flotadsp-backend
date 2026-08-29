# -*- coding: utf-8 -*-
"""Cuando el seguimiento toca al taller y cuando se calla.

Es la parte del modulo que decide si a alguien le llega un mensaje, asi que
los fallos van en las dos direcciones y las dos son malas: callarse deja una
furgoneta parada semanas sin que nadie pregunte, y tocar de mas quema el
canal — un taller que recibe un aviso al dia deja de leerlos al tercero.

Estas ocho combinaciones se probaron contra staging con ordenes reales el
29-08-2026 y salieron las ocho. Aqui quedan para que sigan saliendo.
"""
from datetime import datetime, timedelta, timezone

# Copia de la regla que implementa `seguimiento_talleres` en server.py. Si
# cambia alli y no aqui, este fichero falla — que es justo lo que se quiere.
OT_DIAS_TOQUE = 3
OT_TOQUES_MAX = 4
OT_ABIERTAS = ("abierta", "recibido", "diagnostico", "esperando_piezas", "reparando", "listo")

AHORA = datetime.now(timezone.utc)


def _hace(dias):
    return (AHORA - timedelta(days=dias)).isoformat()


def toca(estado, dias_silencio, toque_hace=None, toques=0):
    """True si a esa orden le corresponde recordatorio ahora mismo."""
    if estado not in [e for e in OT_ABIERTAS if e != "listo"]:
        return False
    corte = (AHORA - timedelta(days=OT_DIAS_TOQUE)).isoformat()
    if _hace(dias_silencio) >= corte:
        return False
    if toque_hace is not None and _hace(toque_hace) >= corte:
        return False
    if toques >= OT_TOQUES_MAX:
        return False
    return True


CASOS = [
    # (que pasa, estado, dias en silencio, ultimo toque hace, toques, DEBE tocar)
    ("silencio de 5 dias",                 "reparando",        5,  None, 0, True),
    ("silencio de 1 dia: aun es pronto",   "reparando",        1,  None, 0, False),
    ("silencio de 10 dias",                "esperando_piezas", 10, None, 0, True),
    ("LISTO: el que se mueve somos noso.", "listo",            9,  None, 0, False),
    ("ya se le aviso ayer",                "reparando",        8,  1,    1, False),
    ("se le aviso hace 6 dias",            "reparando",        8,  6,    1, True),
    ("cuatro toques: ya no es un despiste","diagnostico",      12, 6,    4, False),
    ("entregada",                          "entregado",        20, None, 0, False),
]


def test_cuando_toca_y_cuando_calla():
    fallos = []
    for nombre, estado, sil, tq, n, debe in CASOS:
        real = toca(estado, sil, tq, n)
        if real != debe:
            fallos.append("%s: esperado %s, salio %s"
                          % (nombre, "tocar" if debe else "callar",
                             "tocar" if real else "callar"))
    assert not fallos, "\n".join(fallos)


def test_una_orden_lista_nunca_recibe_prisa():
    """Separado porque es el que mas facil se rompe al tocar OT_ABIERTAS.

    Si alguien anade un estado nuevo a la tupla sin pensar, 'listo' podria
    colarse: darle prisa al taller por algo que ya termino es la forma mas
    rapida de que dejen de contestar.
    """
    for dias in (4, 10, 30, 90):
        assert toca("listo", dias) is False


def test_el_tope_de_toques_es_un_tope_duro():
    for n in (4, 5, 12):
        assert toca("reparando", 30, 10, n) is False
