# -*- coding: utf-8 -*-
"""El logo para la ESPALDA: en blanco y con el nombre debajo.

La espalda no es el pecho a lo grande. Ahi el logo va a 25-30 cm y se lee a
diez metros, asi que aguanta -y pide- una linea de texto que en el pecho, a
8 cm, seria ilegible y solo ensuciaria.

DOS REGLAS QUE SE VEN CUANDO NO SE CUMPLEN:
  · el texto va MUCHO mas pequeño que el logo. Si compiten, no manda ninguno;
  · y muy espaciado. En mayusculas y pequeño, sin abrir las letras, se lee
    como una mancha.
"""
import io
from PIL import Image, ImageDraw, ImageFont

FUENTE = "ArchivoBlack-Regular.ttf"
BLANCO = (245, 247, 248)
CIAN = (20, 231, 216)


def logo(color, ancho):
    """El logo ya rasterizado, recoloreado y a la anchura que se pida."""
    im = Image.open("FDs-cian.png").convert("RGBA")
    alfa = im.split()[3]
    alto = int(ancho * im.size[1] / im.size[0])
    alfa = alfa.resize((ancho, alto), Image.LANCZOS)
    out = Image.new("RGBA", (ancho, alto), color + (0,))
    out.putalpha(alfa)
    return out


def texto(cadena, color, alto_px, espaciado=0.30):
    """Una linea en mayusculas, con el espaciado abierto a mano.

    Pillow no sabe de `letter-spacing`: hay que pegar letra a letra. Es lo que
    separa un texto que parece de marca de uno que parece de Word.
    """
    f = ImageFont.truetype(FUENTE, alto_px)
    sep = int(alto_px * espaciado)
    anchos = [f.getbbox(c)[2] - f.getbbox(c)[0] if c != " " else int(alto_px * 0.35)
              for c in cadena]
    W = sum(anchos) + sep * (len(cadena) - 1)
    H = int(alto_px * 1.6)
    im = Image.new("RGBA", (W, H), color + (0,))
    d = ImageDraw.Draw(im)
    x = 0
    for c, w in zip(cadena, anchos):
        if c != " ":
            b = f.getbbox(c)
            d.text((x - b[0], int(alto_px * 0.2)), c, font=f, fill=color + (255,))
        x += w + sep
    return im.crop(im.getbbox())


def componer(nombre, color, linea=None, ancho=3000):
    lg = logo(color, ancho)
    if not linea:
        lg.save(nombre)
        return lg.size
    # El texto, al 11% del alto del logo y centrado debajo.
    tx = texto(linea, color, max(20, int(lg.size[1] * 0.115)))
    # Que no se pase del ancho del logo: si la frase es larga, manda el ancho.
    if tx.size[0] > ancho:
        tx = tx.resize((ancho, int(tx.size[1] * ancho / tx.size[0])), Image.LANCZOS)
    hueco = int(lg.size[1] * 0.16)
    H = lg.size[1] + hueco + tx.size[1]
    im = Image.new("RGBA", (ancho, H), color + (0,))
    im.alpha_composite(lg, (0, 0))
    im.alpha_composite(tx, ((ancho - tx.size[0]) // 2, lg.size[1] + hueco))
    im.save(nombre)
    return im.size


for n, c, t in (
    ("FDs-espalda-blanco.png", BLANCO, None),
    ("FDs-espalda-blanco-nombre.png", BLANCO, "FLOTA DSP"),
    ("FDs-espalda-blanco-galicia.png", BLANCO, "GALICIA"),
    ("FDs-espalda-cian-nombre.png", CIAN, "FLOTA DSP"),
):
    print("%-34s %s" % (n, componer(n, c, t)))
