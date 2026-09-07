# -*- coding: utf-8 -*-
"""Logo FDs "linea continua" — el boceto elegido, redibujado limpio.

POR QUE ESTE NO SALE DE UNA TIPOGRAFIA
======================================
El otro (el italico con flecha) eran letras rellenas, y para eso lo correcto es
coger una tipografia de verdad y convertirla a trazados. Este NO: es un
monolineal —el esqueleto de cada letra trazado con un grosor constante y las
puntas redondas—. Ninguna tipografia da eso: aplicarle un `stroke` a una letra
rellena dibuja el CONTORNO de la letra, o sea una linea doble, que es
exactamente lo contrario de lo que se busca.

Asi que se construye con geometria: cada letra es un camino ABIERTO y el grosor
lo pone `stroke-width`. `stroke-linecap="round"` y `stroke-linejoin="round"`
son lo que da el aire de tubo de neon del boceto.

EL GROSOR NO ES DECORATIVO. Es lo que decide si esto se puede bordar:
  · a 8 cm de ancho, un trazo del 13% de la altura son ~6 mm de hilo, de sobra;
  · a 2 cm se queda en ~1,5 mm, que es el minimo de una maquina de bordar. Por
    debajo, el hilo se amontona y el hueco de dentro se cierra solo.
Por eso hay una version de trazo mas gordo para lo pequeño.

TODO SE MIDE EN FRACCIONES DE LA ALTURA DE MAYUSCULA, nunca en pixeles: asi el
logo se puede pedir a cualquier tamaño y las proporciones no se mueven.
"""
import io

CIAN = "#14E7D8"
NEGRO = "#16191C"
BLANCO = "#F5F7F8"

H = 620.0                 # altura de mayuscula, en unidades del lienzo
GROSOR = 0.108            # grosor del trazo, en fracciones de H
SEP = 0.095               # aire entre letras, en fracciones de H


def letras(h, g):
    """Los caminos de F, D y s ya colocados. Devuelve (caminos, ancho)."""
    c = []
    x = g / 2.0           # el trazo se pinta CENTRADO: la mitad sale del borde

    # ── F ───────────────────────────────────────────────────────────────
    # Un solo camino en "L invertida": entra por el brazo de arriba, gira y
    # baja hasta la base. Esa esquina redondeada es la firma del boceto.
    fw = h * 0.46
    c.append(f"M {x + fw:.1f} 0 H {x:.1f} V {h:.1f}")
    # El brazo del medio, camino aparte porque no se toca con el giro.
    c.append(f"M {x:.1f} {h * 0.45:.1f} H {x + fw * 0.80:.1f}")
    x += fw + h * SEP

    # ── D ───────────────────────────────────────────────────────────────
    # Asta y panza en UN camino: sube por el asta, describe el arco y vuelve.
    # ANCHA A PROPOSITO. Con la panza estrecha, el trazo de ida y el de vuelta
    # casi se tocan y la D se lee como una mancha: en un logo de linea, lo que
    # se ve es el HUECO tanto como el trazo.
    dw = h * 0.68
    ry = h / 2.0
    rx = dw * 0.74
    c.append(
        f"M {x:.1f} {h:.1f} V 0 H {x + dw - rx:.1f} "
        f"A {rx:.1f} {ry:.1f} 0 0 1 {x + dw - rx:.1f} {h:.1f} Z"
    )
    x += dw + h * SEP

    # ── s minuscula ─────────────────────────────────────────────────────
    # Dos arcos encadenados, apoyada en la linea de base. La altura de la x es
    # el 66% de la mayuscula, que es lo que tiene el boceto.
    hs = h * 0.70
    y0 = h - hs
    rs = hs / 4.0
    sw = rs * 2.0
    cx = x + rs
    # Los dos arcos se cortan ANTES de cerrarse (0.72 del radio, no el radio
    # entero): una s cerrada del todo parece un ocho, y las puntas abiertas son
    # lo que la hace legible de lejos.
    c.append(
        f"M {cx + rs * 0.72:.1f} {y0 + rs * 0.62:.1f} "
        f"A {rs:.1f} {rs:.1f} 0 1 0 {cx:.1f} {y0 + rs * 2:.1f} "
        f"A {rs:.1f} {rs:.1f} 0 1 1 {cx - rs * 0.72:.1f} {h - rs * 0.62:.1f}"
    )
    x += sw

    return c, x + g / 2.0


def svg(color, alto=H, grosor_rel=GROSOR, margen_rel=0.13):
    g = alto * grosor_rel
    caminos, ancho = letras(alto, g)
    m = alto * margen_rel
    ancho_total = ancho + m * 2
    alto_total = alto + g + m * 2
    d = " ".join(caminos)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {ancho_total:.0f} {alto_total:.0f}" '
        f'width="{ancho_total:.0f}" height="{alto_total:.0f}">'
        f'<g transform="translate({m:.1f} {m + g / 2:.1f})" fill="none" '
        f'stroke="{color}" stroke-width="{g:.1f}" stroke-linecap="round" '
        f'stroke-linejoin="round"><path d="{d}"/></g></svg>'
    )


VERSIONES = [
    ("path-cian.svg", CIAN, GROSOR, "cian - prenda oscura"),
    ("path-blanco.svg", BLANCO, GROSOR, "blanco - prenda oscura"),
    ("path-negro.svg", NEGRO, GROSOR, "negro - prenda clara"),
    ("path-cian-gordo.svg", CIAN, 0.175, "trazo grueso - bordado y tamaño pequeño"),
]

if __name__ == "__main__":
    for nombre, color, gr, que in VERSIONES:
        io.open(nombre, "w", encoding="utf-8").write(svg(color, grosor_rel=gr))
        print("%-22s %s" % (nombre, que))
