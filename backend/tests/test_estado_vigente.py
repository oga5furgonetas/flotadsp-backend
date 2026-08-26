"""El estado de un paquete es el del evento MAS RECIENTE POR HORA.

Este test existe por una queja de la nave: "reintentos que se entregan, y
paquetes que estan entregados y salta como que tienen que volver a la
estacion".

La causa era que el estado se tomaba del ULTIMO EVENTO DEL ARRAY
(`timeline[-1]`), y el timeline se llena con `$push`. Cortex manda
`recentTaskEvents` con su propia hora, asi que una captura de las 15:00 puede
traer un evento de las 10:51 que queda el ultimo del array y pisa un
DELIVERED de las 11:36.

Medido en produccion cuando se arreglo: 24 paquetes entregados en tres dias
que el cuadre le reclamaba a un conductor.

No hace falta Mongo: `_cx_estado_vigente` es una funcion pura.
"""
import pytest

import server


def ev(at, state, context=None):
    return {"at": at, "state": state, "context": context}


def test_gana_el_mas_reciente_aunque_llegue_el_primero():
    """El caso exacto de produccion: DELIVERED a las 11:36 y un evento
    historico de las 10:51 que llega despues y queda el ultimo del array."""
    tl = [
        ev("2026-08-26T11:36:41", "DELIVERED", "DELIVERED_TO_STORE"),
        ev("2026-08-26T10:51:22", "UNCOLLECTED", "INACCESSIBLE_PICKUP_LOCATION"),
    ]
    assert server._cx_estado_vigente(tl)[0] == "DELIVERED"
    # Y al reves: el orden del array no debe cambiar nada.
    assert server._cx_estado_vigente(list(reversed(tl)))[0] == "DELIVERED"


def test_un_evento_posterior_si_manda():
    """Lo contrario tambien tiene que funcionar: si de verdad pasa algo
    despues de entregar, eso es lo que vale."""
    tl = [
        ev("2026-08-26T09:00:00", "DELIVERED", "DELIVERED_TO_DOORSTEP"),
        ev("2026-08-26T15:30:00", "MISSING", "OBJECT_MISSING"),
    ]
    assert server._cx_estado_vigente(tl)[0] == "MISSING"


@pytest.mark.parametrize("orden", [
    ["LOADED", "YOU_ARE_NEXT", "ATTEMPTED", "DELIVERED"],
    ["DELIVERED", "ATTEMPTED", "YOU_ARE_NEXT", "LOADED"],
    ["ATTEMPTED", "DELIVERED", "LOADED", "YOU_ARE_NEXT"],
])
def test_el_orden_del_array_es_irrelevante(orden):
    """La misma secuencia de hechos, barajada de tres formas, tiene que dar
    siempre el mismo estado. Es justo lo que fallaba."""
    horas = {"LOADED": "08:00", "YOU_ARE_NEXT": "12:00",
             "ATTEMPTED": "13:00", "DELIVERED": "17:00"}
    tl = [ev("2026-08-26T%s:00" % horas[s], s) for s in orden]
    assert server._cx_estado_vigente(tl)[0] == "DELIVERED"


def test_empate_al_segundo_gana_lo_mas_accionable():
    """Cuando dos eventos comparten el segundo exacto —una vez cada tres dias,
    medido— gana el que obliga a hacer algo: un paquete que no aparece hay que
    buscarlo, aunque llegue empatado con un 'se intento'."""
    tl = [
        ev("2026-08-26T10:00:00", "ATTEMPTED", "OBJECT_MISSING"),
        ev("2026-08-26T10:00:00", "MISSING", "OBJECT_MISSING"),
    ]
    assert server._cx_estado_vigente(tl)[0] == "MISSING"
    assert server._cx_estado_vigente(list(reversed(tl)))[0] == "MISSING"


def test_timeline_vacio_o_sin_horas_no_revienta():
    """Nunca puede lanzar: lo llama la pantalla que le reclama paquetes a una
    persona, y una excepcion ahi deja el cuadre en blanco."""
    assert server._cx_estado_vigente([]) == (None, None)
    assert server._cx_estado_vigente([{"state": "LOADED"}]) == (None, None)
    assert server._cx_estado_vigente([ev("no-es-fecha", "LOADED")]) == (None, None)


def test_ignora_los_eventos_sin_hora_pero_usa_los_demas():
    tl = [
        ev(None, "MISSING"),
        ev("2026-08-26T09:00:00", "DELIVERED", "DELIVERED_TO_NEIGHBOR"),
    ]
    assert server._cx_estado_vigente(tl)[0] == "DELIVERED"


def test_devuelve_tambien_la_hora():
    """El cuadre la usa para saber si el paquete arrastra de otro dia."""
    tl = [ev("2026-08-26T11:36:41", "DELIVERED"), ev("2026-08-05T10:51:22", "UNCOLLECTED")]
    estado, at = server._cx_estado_vigente(tl)
    assert estado == "DELIVERED"
    assert at.strftime("%Y-%m-%d") == "2026-08-26"
