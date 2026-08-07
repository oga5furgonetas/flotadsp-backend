# -*- coding: utf-8 -*-
"""Base comun del ecosistema de scorecards: calendario de Amazon y rutas.

CALENDARIO. La semana de Amazon va de DOMINGO a SABADO. El ancla (que domingo
empieza la semana 1) NO se ajusta contra los datos: se lee del informe
'Inactive DA off-boarding' de la semana 30 de 2026, donde las 7 filas dan la
misma fecha de referencia al sumar 'Last Route Date' + 'Days Inactive':
2026-07-26, domingo. Luego la semana 30 acaba el sabado 2026-07-25, la 31 va
del 2026-07-26 al 2026-08-01 y la semana 1 empieza el 2025-12-28.

Para otro anio hay que volver a derivar el ancla; no se extrapola.
"""
import datetime as dt
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(RAIZ, "docs")
SCORECARDS = os.path.join(DOCS, "scorecards.json")
DIARIOS = os.path.join(DOCS, "diarios.json")

# Domingo en que empieza la semana 1 de cada anio. Derivado, no supuesto.
ANCLA = {2026: dt.date(2025, 12, 28)}


def rango_semana(anio, semana):
    """(domingo, sabado) de esa semana de Amazon."""
    if anio not in ANCLA:
        raise KeyError("no hay ancla derivada para %s; ver docstring" % anio)
    dom = ANCLA[anio] + dt.timedelta(days=7 * (semana - 1))
    return dom, dom + dt.timedelta(days=6)


def semana_de(fecha, anio=2026):
    """Numero de semana de Amazon al que pertenece una fecha."""
    dias = (fecha - ANCLA[anio]).days
    if dias < 0:
        return None
    return dias // 7 + 1


def fecha(s):
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except (TypeError, ValueError):
        return None
