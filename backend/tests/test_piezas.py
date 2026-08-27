"""El vocabulario de piezas. Cada caso sale de un nombre que la IA escribio de verdad.

Gemini nombra la pieza en texto libre: 504 nombres distintos para 8.665 danos,
267 de ellos una sola vez, y 193 formas distintas de decir "puerta". Sin cerrar
ese vocabulario NADA se puede autovalidar, porque la clave no coincide nunca
consigo misma. Este fichero fija las equivalencias que importan para que nadie
las rompa sin enterarse.

Los dos errores que hay que vigilar son opuestos y los dos caros:
  · unir de menos -> un dano real parece que no se repite y se marca inventado;
  · unir de mas   -> dos danos distintos se confirman el uno al otro.
Por eso hay casos de las dos clases: los que TIENEN que unirse y los que
TIENEN que quedar separados.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import piezas  # noqa: E402

# (texto que escribio la IA, pieza canonica esperada)
MISMA_PIEZA = [
    # abreviaturas
    ("puerta corredera derecha", "puerta_corredera_der"),
    ("puerta corredera der", "puerta_corredera_der"),
    ("Puerta Corredera Lateral Derecha", "puerta_corredera_der"),
    ("puerta corredera izq", "puerta_corredera_izq"),
    # el conductor va a la izquierda en Espana; el copiloto, a la derecha
    ("puerta del conductor", "puerta_delantera_izq"),
    ("puerta delantera izquierda", "puerta_delantera_izq"),
    ("puerta del copiloto", "puerta_delantera_der"),
    ("puerta del pasajero", "puerta_delantera_der"),
    # sinonimos de taller
    ("paragolpes delantero", "paragolpes_del"),
    ("parachoques delantero", "paragolpes_del"),
    ("aleta delantera izquierda", "aleta_del_izq"),
    ("guardabarros delantero izquierdo", "aleta_del_izq"),
    ("espejo retrovisor derecho", "retrovisor_der"),
    ("retrovisor derecho", "retrovisor_der"),
    ("umbral lateral izquierdo", "faldon_izq"),
    ("faldon lateral izquierdo", "faldon_izq"),
    ("talonera izquierda", "faldon_izq"),
    ("estribo lateral izquierdo", "faldon_izq"),
    ("piloto trasero derecho", "piloto_der"),
    ("luz trasera derecha", "piloto_der"),
    ("tulipa trasera derecha", "piloto_der"),
]

# Lo que NO puede acabar en el mismo cajon.
DISTINTAS = [
    ("puerta corredera derecha", "puerta corredera izquierda"),
    ("puerta delantera izquierda", "puerta corredera izquierda"),
    ("paragolpes delantero", "paragolpes trasero"),
    ("aleta delantera derecha", "aleta trasera derecha"),
    ("panel lateral trasero derecho", "panel trasero derecho"),
]

# Un solo texto que lleva dos piezas dentro: tiene que dar las dos.
COMPUESTAS = [
    ("puerta corredera derecha y panel lateral trasero derecho",
     {"puerta_corredera_der", "panel_lateral_der"}),
    ("puerta delantera derecha y puerta corredera derecha",
     {"puerta_delantera_der", "puerta_corredera_der"}),
]

# Nada de esto es carroceria: sale de la foto del salpicadero.
NO_CARROCERIA = ["sistema de frenos", "sistema tpms",
                 "motor sistema de fluidos", "testigo de aceite"]

ZONAS = [
    ("puerta corredera derecha", "lateral_der"),
    ("panel lateral trasero izquierdo", "lateral_izq"),
    ("paragolpes delantero", "frontal"),
    ("porton trasero", "trasera"),
    ("piloto trasero izquierdo", "trasera"),
]


def main():
    fallos = []

    for texto, esperado in MISMA_PIEZA:
        got = [p for p, _, _ in piezas.canon(texto)]
        if esperado not in got:
            fallos.append("%-46r -> %s (esperaba %s)" % (texto, got, esperado))

    for a, b in DISTINTAS:
        pa = {p for p, _, _ in piezas.canon(a)}
        pb = {p for p, _, _ in piezas.canon(b)}
        if pa & pb:
            fallos.append("SE UNEN Y NO DEBEN: %r y %r comparten %s" % (a, b, pa & pb))

    for texto, esperado in COMPUESTAS:
        got = {p for p, _, _ in piezas.canon(texto)}
        if not esperado <= got:
            fallos.append("compuesta %-56r -> %s (esperaba %s)" % (texto, got, esperado))

    for texto in NO_CARROCERIA:
        got = [p for p, _, _ in piezas.canon(texto)]
        if got != ["no_carroceria"]:
            fallos.append("%-46r deberia ser no_carroceria, dio %s" % (texto, got))

    for texto, zona in ZONAS:
        got = piezas.zonas(texto)
        if zona not in got:
            fallos.append("zona de %-40r -> %s (esperaba %s)" % (texto, got, zona))

    for linea in fallos:
        print("FALLA  " + linea)
    n = len(MISMA_PIEZA) + len(DISTINTAS) + len(COMPUESTAS) + len(NO_CARROCERIA) + len(ZONAS)
    if fallos:
        print("\n%d fallos de %d casos." % (len(fallos), n))
        return 1
    print("piezas OK: %d casos" % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
