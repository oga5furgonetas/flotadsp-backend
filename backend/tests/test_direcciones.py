# -*- coding: utf-8 -*-
"""Que la misma direccion escrita de seis maneras caiga en UNA sola clave.

Es lo unico que hace funcionar la pantalla de direcciones problematicas. Las
direcciones vienen del sistema de Amazon sin normalizar, y si cada variante
cuenta por separado ninguna llega al minimo de fallos: el problema existe y no
lo ve nadie. Al reves tambien es malo — juntar dos portales distintos pondria
la nota de uno en la puerta del otro.
"""
import re
import unicodedata


def _dir_clave(direccion):
    """Copia de la funcion de server.py. Si cambia alli y no aqui, esto falla."""
    s = unicodedata.normalize("NFKD", str(direccion or "")).encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"\b(bajo|baixo|piso|puerta|pta|esc|escalera|izq|dcha|izquierda|derecha)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    # Letra pegada a numero = numero suelto. 'n°43' y 'n 43' son el mismo portal:
    # el simbolo de grado desaparece al quitar acentos y deja 'n43', que sin
    # esto cuenta como una direccion distinta. Salio en 'Calle Campanario
    # n°43', que esta en produccion.
    s = re.sub(r"(?<=[a-z])(?=\d)", " ", s)
    s = re.sub(r"(?<=\d)(?=[a-z])", " ", s)
    return re.sub(r"\s+", " ", s).strip()


MISMAS = [
    # Variantes reales de produccion que tienen que agruparse
    ["Rua Isaac Peral, 14, 15650 A Coruña",
     "RUA ISAAC PERAL 14 BAJO, 15650 A CORUÑA",
     "rua isaac peral 14, 15650 a coruna"],
    ["Avenida OZA (DE), 208, BAJO, 15006 CORUÑA, A",
     "Avenida OZA (DE), 208, 15006 CORUÑA, A"],
    ["Calle Campanario n°43, 36618 O Campanario",
     "calle campanario n 43, 36618 o campanario"],
    ["Derechos humanos 3 BAJO 8, 15930 Boiro",
     "Derechos humanos 3, 8, 15930 Boiro"],
]

DISTINTAS = [
    # Portales distintos que NO se pueden mezclar: la nota de uno acabaria en
    # la puerta del otro.
    ("Rua Isaac Peral, 14, 15650 A Coruña", "Rua Isaac Peral, 41, 15650 A Coruña"),
    ("Avenida Ferrol 40, 15706 Santiago", "Avenida Ferrol 4, 15706 Santiago"),
    ("Rua das Hortas, 56, 15705 Santiago", "Rua das Hortas, 56, 15706 Santiago"),
]


def test_las_variantes_de_una_direccion_dan_una_sola_clave():
    fallos = []
    for grupo in MISMAS:
        claves = {_dir_clave(x) for x in grupo}
        if len(claves) != 1:
            fallos.append("%r -> %d claves: %s" % (grupo[0][:40], len(claves), claves))
    assert not fallos, "\n".join(fallos)


def test_dos_portales_distintos_nunca_se_juntan():
    for a, b in DISTINTAS:
        assert _dir_clave(a) != _dir_clave(b), "%r y %r caen en la misma clave" % (a, b)


def test_una_direccion_vacia_no_da_clave():
    for x in (None, "", "   ", ",,,", "---"):
        assert _dir_clave(x) == "" or len(_dir_clave(x)) < 8


def test_los_acentos_no_parten_una_direccion_en_dos():
    assert _dir_clave("Rúa da Cidade") == _dir_clave("Rua da Cidade")
    assert _dir_clave("CORUÑA") == _dir_clave("CORUNA")
