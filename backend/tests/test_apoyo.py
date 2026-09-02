# -*- coding: utf-8 -*-
"""Apoyo en ruta: que parada cuenta como pendiente, y los WhatsApp que salen.

Un apoyo manda a una persona a la otra punta del pueblo: una parada que ya
estaba entregada, o que iba de vuelta a la nave, es un viaje en balde. Por eso
«pendiente» se decide con los cajones canonicos (`_cx_ruta_cajon`) y no con
listas escritas a mano (gotcha 28/40). Y el enlace `wa.me` tiene que llevar el
prefijo del pais y la URL del mapa, o abre un numero que no existe.

Se leen las funciones reales de server.py con `ast`, sin ejecutarlo.
Probado reintroduciendo el fallo: con `_APOYO_CAJONES_PENDIENTES` incluyendo
"returned", `test_vuelta_a_nave_no_es_pendiente` falla; sin el prefijo en
`enlace_wa`, `test_whatsapp_lleva_prefijo_y_mapa` falla.
"""
import ast
import io
import os
import re
import sys
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Optional

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")

FUNCS = ("_cx_ruta_cajon", "_apoyo_textos", "_apoyo_url", "enlace_wa", "_apoyo_minutos_desde")
CONSTS = ("_CX_OK", "_CX_EN_VUELO", "_CX_NO_DESPACHADO", "_CX_REINTENTABLE", "_APOYO_CAJONES_PENDIENTES")


def _cargar():
    arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
    cuerpo = []
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in CONSTS:
            cuerpo.append(n)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in FUNCS:
            cuerpo.append(n)
    ns = {"datetime": datetime, "timezone": timezone, "timedelta": timedelta, "re": re,
          "Optional": Optional, "_url_quote": urllib.parse.quote,
          "PREFIJO_WA_DEFECTO": "34", "_PORTAL_BASE_FRONT": "https://flotadsp.com"}
    exec(compile(ast.Module(body=cuerpo, type_ignores=[]), RUTA, "exec"), ns)
    faltan = [f for f in FUNCS + CONSTS if f not in ns]
    assert not faltan, "no encontrado en server.py: %s" % faltan
    return ns


NS = _cargar()


def _pendiente(estado):
    return NS["_cx_ruta_cajon"](estado) in NS["_APOYO_CAJONES_PENDIENTES"]


def test_en_furgoneta_es_pendiente():
    for e in ("PICKED_UP", "YOU_ARE_NEXT", "ATTEMPTED", "LOADED"):
        assert _pendiente(e), e


def test_vuelta_a_nave_no_es_pendiente():
    for e in ("BACK_TO_ORIGIN", "RETURNED", "DELIVERED", "UNCOLLECTED", "MISSING", None):
        assert not _pendiente(e), e


def test_whatsapp_lleva_prefijo_y_mapa():
    a = {"token": "abcdefghijklmnopqrstuvwxyz123456", "nota": "",
         "de": {"driver_id": "A1", "nombre": "PEPE", "telefono": "600111222", "ruta": "XA_C4"},
         "a": {"driver_id": "A2", "nombre": "ANA", "telefono": "+34600333444"},
         "paradas": [{"stop_id": "40", "n": 2}, {"stop_id": "41", "n": 1}]}
    t = NS["_apoyo_textos"](a)
    assert t["url"] == "https://flotadsp.com/apoyo/t/abcdefghijklmnopqrstuvwxyz123456"
    assert t["wa_ayudante"].startswith("https://wa.me/34600333444?text=")
    assert t["wa_conductor"].startswith("https://wa.me/34600111222?text=")
    assert "2 paradas, 3 paquetes" in t["texto_ayudante"]
    assert "XA_C4" in t["texto_ayudante"] and t["url"] in t["texto_ayudante"]
    assert "te quita 2 paradas (40, 41)" in t["texto_conductor"]
    assert urllib.parse.quote(t["url"], safe="") in t["wa_ayudante"] or t["url"] in urllib.parse.unquote(t["wa_ayudante"])


def test_aviso_de_paradas_sin_ubicacion():
    a = {"token": "x" * 32, "nota": "", "de": {"nombre": "PEPE", "telefono": "600111222"},
         "a": {"nombre": "ANA", "telefono": "600333444"},
         "paradas": [{"stop_id": "1", "n": 1, "ubicacion": "cortex"}, {"stop_id": "2", "n": 1, "ubicacion": None},
                     {"stop_id": "3", "n": 2}]}
    t = NS["_apoyo_textos"](a)
    assert "2 de esas paradas no tienen ubicación en Cortex: pregúntale a PEPE" in t["texto_ayudante"]
    a["paradas"] = [{"stop_id": "1", "n": 1, "ubicacion": "intento"}]
    assert "no tienen ubicación" not in NS["_apoyo_textos"](a)["texto_ayudante"]


def test_sin_telefono_no_hay_enlace():
    assert NS["enlace_wa"]("", "hola") == ""
    a = {"token": "x" * 32, "de": {"nombre": "P", "telefono": ""}, "a": {"nombre": "A", "telefono": "600000000"}, "paradas": []}
    t = NS["_apoyo_textos"](a)
    assert t["wa_conductor"] == "" and t["wa_ayudante"]


def test_minutos_desde():
    f = NS["_apoyo_minutos_desde"]
    assert f(None) is None and f("no es fecha") is None
    hace5 = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    assert 4 <= f(hace5) <= 6
    assert 4 <= f(hace5.replace("+00:00", "Z")) <= 6


def main() -> int:
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_") and callable(fn) and nombre != "test_todos_los_casos":
            try:
                fn()
                print("  ok  %s" % nombre)
            except AssertionError as e:
                fallos += 1
                print("  MAL %s: %s" % (nombre, e))
    print("%d fallos" % fallos)
    return 1 if fallos else 0


def test_todos_los_casos():
    assert main() == 0


if __name__ == "__main__":
    sys.exit(main())
