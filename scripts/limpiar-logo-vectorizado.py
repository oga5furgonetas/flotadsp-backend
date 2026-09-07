# -*- coding: utf-8 -*-
"""Limpia el SVG vectorizado y saca las versiones finales del logo FDs.

DE DONDE SALE
=============
Dani genero el logo en Gemini y lo paso por un vectorizador automatico. Eso
devuelve el trazado FIEL a la imagen que le gusta —que es justo lo que no se
consigue redibujandolo a mano— pero con la basura de siempre:

  · 13 subcaminos, de los que SOLO DOS son el logo (la F y la "Ds");
  · nueve capas de fragmentos de uno y dos pixeles, que son el antialiasing
    de la imagen convertido en formas: `#055`, `#008055`, `teal`, `#00d4aa`...
    Diez colores distintos para un logo de UNA tinta;
  · el rectangulo del fondo negro, convertido en una forma mas;
  · la muestra pequeña de "2 cm" que venia en la esquina del boceto.

Todo eso se ve igual en pantalla y arruina la estampacion: el taller recibe
diez colores y cientos de nodos donde tiene que haber una silueta y un color.

QUE HACE ESTE SCRIPT
Se queda con los dos caminos buenos, recorta el lienzo a la forma real
(medida, no a ojo) y saca las cuatro versiones. Nada se redibuja: son los
mismos trazados que salieron del vectorizado.
"""
import io
import re

CIAN = "#14E7D8"
NEGRO = "#16191C"
BLANCO = "#F5F7F8"

ORIGEN = "original.svg"
MARGEN = 0.07          # del ancho del logo


def caminos_buenos():
    """La F y la Ds. Estan en el unico grupo con contenido real (`#0aa`)."""
    s = io.open(ORIGEN, encoding="utf-8").read()
    m = re.search(r'<g fill="#0aa"[^>]*>(.*?)</g>', s, re.S)
    if not m:
        raise SystemExit("el SVG no trae el grupo del logo: ¿otro vectorizador?")
    d = re.findall(r'd="([^"]+)"', m.group(1))
    if len(d) != 2:
        raise SystemExit("esperaba 2 caminos (F y Ds) y hay %d" % len(d))
    return d


def caja(caminos):
    """El rectangulo que ocupa el logo DE VERDAD, no el lienzo del fichero.

    Se mide, no se estima: el lienzo original es de 372x213 y el logo ocupa
    213x117 dentro. Sin recortar, cualquiera que lo coloque a 8 cm estaria
    poniendo 8 cm de lienzo con el logo pequeño dentro.
    """
    from svgpathtools import parse_path
    cajas = [parse_path(p).bbox() for p in caminos]
    x0 = min(c[0] for c in cajas)
    x1 = max(c[1] for c in cajas)
    y0 = min(c[2] for c in cajas)
    y1 = max(c[3] for c in cajas)
    return x0, y0, x1 - x0, y1 - y0


def svg(caminos, cja, color, engorde=0.0):
    """Una version. `engorde` suma grosor a la silueta para el bordado.

    Se hace con un `stroke` del MISMO color sobre el relleno: engorda la forma
    por igual en todo el contorno. Es un apaño de rotulacion de toda la vida y
    aqui es el correcto, porque el trazado ya es una silueta cerrada y no un
    esqueleto: no hay un "grosor de linea" que subir.
    """
    x, y, w, h = cja
    m = w * MARGEN + engorde
    W, H = w + m * 2, h + m * 2
    trazo = ('stroke="%s" stroke-width="%.2f" stroke-linejoin="round" '
             'stroke-linecap="round" ' % (color, engorde * 2)) if engorde else ""
    cuerpo = "".join('<path d="%s"/>' % d for d in caminos)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'viewBox="%.2f %.2f %.2f %.2f" width="%.0f" height="%.0f">'
        '<g fill="%s" %stransform="translate(0 0)">%s</g></svg>'
        % (x - m, y - m, W, H, W * 4, H * 4, color, trazo, cuerpo)
    )


VERSIONES = [
    ("FDs-cian.svg", CIAN, 0.0, "cian - prenda oscura. El principal"),
    ("FDs-blanco.svg", BLANCO, 0.0, "blanco - prenda oscura"),
    ("FDs-negro.svg", NEGRO, 0.0, "negro - prenda clara"),
    ("FDs-cian-bordado.svg", CIAN, 1.6, "cian engordado - bordado y tamaño pequeño"),
]

if __name__ == "__main__":
    c = caminos_buenos()
    cja = caja(c)
    print("el logo ocupa %.1f x %.1f dentro de un lienzo de 372 x 213" % (cja[2], cja[3]))
    for nombre, color, eng, que in VERSIONES:
        io.open(nombre, "w", encoding="utf-8").write(svg(c, cja, color, eng))
        print("  %-24s %s" % (nombre, que))
