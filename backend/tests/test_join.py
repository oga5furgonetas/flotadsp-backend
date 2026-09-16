"""Importacion de candidatos de JOIN: el telefono sacado del CV y el CSV.

Las funciones se leen de server.py con `ast` (gotcha 40): una copia dejaria de
probar el codigo que corre.
"""
import ast
import csv
import io
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pytest

SRC = (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8-sig")
QUIERO = {"_telefono_limpio", "_telefono_digitos", "_join_tel_de_texto", "_join_fecha",
          "_join_csv_filas", "_JOIN_TEL_ETIQUETA", "_JOIN_TEL_PREFIJO", "_JOIN_TEL_MOVIL"}


class HTTPException(Exception):
    def __init__(self, status, detail=""):
        super().__init__(detail)
        self.status_code, self.detail = status, detail


ns = {"re": re, "csv": csv, "io": io, "datetime": datetime, "timezone": timezone,
      "Optional": Optional, "HTTPException": HTTPException}
for nodo in ast.parse(SRC).body:
    nombre = getattr(nodo, "name", None) or (
        getattr(nodo.targets[0], "id", None) if isinstance(nodo, ast.Assign) else None)
    if nombre in QUIERO:
        exec(compile(ast.Module([nodo], []), "server.py", "exec"), ns)

tel = ns["_join_tel_de_texto"]


@pytest.mark.parametrize("texto,esperado", [
    ("Teléfono: 645 12 64 03\nEmail x@y.com", "645126403"),
    ("Móvil 681-234-567", "681234567"),
    ("Contacto +34 622 022 148", "+34622022148"),
    ("WhatsApp: 0034 699 11 22 33", "+34699112233"),
    ("tlf. 981 57 41 78", "981574178"),                   # fijo CON etiqueta: vale
    ("Phone: +58 424 506 4615", "+584245064615"),
    ("Nacido en 1998. Vive en Rúa do Vilar 12, 15705", ""),
    ("Experiencia: 1998 2000 2003 2005", ""),            # años seguidos no son un numero
    ("DNI 12345678Z, CP 15701", ""),
    ("Llamar al 655443322 por las tardes", "655443322"),  # movil suelto
    ("Ref 981574178 del pedido", ""),                     # fijo suelto: no se adivina
])
def test_telefono_del_cv(texto, esperado):
    assert tel(texto) == esperado


def test_etiqueta_gana_a_movil_suelto():
    assert tel("Oferta 612345678\nTeléfono: 699887766") == "699887766"


def test_fechas_de_join():
    f = ns["_join_fecha"]
    assert f("2026-09-04 11:24:38").isoformat() == "2026-09-04T11:24:38+00:00"
    assert f("2026-09-04T11:24:38.000Z").tzinfo is not None
    assert f("04/09/2026 11:24").day == 4
    assert f("") is None and f("mañana") is None


CAB = ("Job ID,Job Title,Application ID,Application Date,E-Mail Address,First Name,"
       "Last Name,Telephone,URL to CV\n")


def test_csv_original_y_el_de_excel():
    filas = ns["_join_csv_filas"]
    orig = (CAB + "1,Repartidor/a de paquetería,52661299,2026-09-04 13:10:00,"
            "a@b.com,Rubén,López,+34645126403,https://join.com/x\n").encode("utf-8")
    r = filas(orig)
    assert r[0]["First Name"] == "Rubén" and r[0]["Telephone"] == "+34645126403"
    excel = (CAB.replace(",", ";") + "1;Repartidor;52662070;04/09/2026 13:35;e@f.com;"
             "Erick;Vilela;5,84245E+11;x\n").encode("cp1252")
    r = filas(excel)
    assert r[0]["Application ID"] == "52662070" and r[0]["Telephone"] == "5,84245E+11"


def test_csv_que_no_es_de_join():
    with pytest.raises(HTTPException):
        ns["_join_csv_filas"](b"Nombre,Telefono\nPepe,600000000\n")


def test_el_telefono_en_notacion_cientifica_se_descarta():
    # La regla vive en el endpoint: se comprueba que sigue ahi.
    assert r're.search(r"[eE][+-]?\d", tel_bruto)' in SRC
