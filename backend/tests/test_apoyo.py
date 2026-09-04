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

FUNCS = ("_cx_ruta_cajon", "_apoyo_textos", "_apoyo_url", "enlace_wa", "_apoyo_minutos_desde",
         "_apoyo_fundir_gente",
         "_apoyo_posicion_de", "_apoyo_estados_en_calle",
         "_apoyo_telefono", "_telefono_limpio", "_telefono_digitos", "_apoyo_todas_hechas")
CONSTS = ("_CX_OK", "_CX_EN_VUELO", "_CX_NO_DESPACHADO", "_CX_REINTENTABLE", "_APOYO_CAJONES_PENDIENTES",
          "_APOYO_POSICION_MAX_MIN")


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


def _hace(minutos):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutos)).isoformat()


def test_la_posicion_solo_sale_de_escaneos_en_la_calle():
    """Un escaneo de carga ocurre EN LA NAVE: si colara, mandaria a todo el
    mundo al almacen. Los estados salen de las listas canonicas."""
    calle = NS["_apoyo_estados_en_calle"]()
    for e in calle:
        assert NS["_cx_ruta_cajon"](e) in ("delivered", "attempted"), e
    for e in ("PICKED_UP", "PENDING_PICKUP", "YOU_ARE_NEXT", "LOADED", "UNCOLLECTED", "BACK_TO_ORIGIN"):
        assert e not in calle, e
    assert "DELIVERED" in calle and "ATTEMPTED" in calle


def test_posicion_reciente_y_vieja():
    f = NS["_apoyo_posicion_de"]
    p = f({"lat": 42.6, "lng": -8.9, "updated_at": _hace(7), "state": "DELIVERED", "stop_id": 16})
    assert p and 6 <= p["hace_min"] <= 8 and p["que"] == "entrega" and p["stop_id"] == "16"
    p = f({"lat": 42.6, "lng": -8.9, "updated_at": _hace(3), "state": "ATTEMPTED", "stop_id": 4})
    assert p["que"] == "intento"
    # Mas vieja que el tope: no se devuelve NADA, porque al lado hay un boton de ir.
    viejo = NS["_APOYO_POSICION_MAX_MIN"] + 5
    assert f({"lat": 42.6, "lng": -8.9, "updated_at": _hace(viejo), "state": "DELIVERED"}) is None
    # Sin coordenada, sin hora o sin paquete: nada.
    assert f(None) is None
    assert f({"lat": None, "lng": None, "updated_at": _hace(2), "state": "DELIVERED"}) is None
    assert f({"lat": 42.6, "lng": -8.9, "updated_at": None, "state": "DELIVERED"}) is None


def test_la_posicion_siempre_lleva_su_antiguedad():
    """Un punto sin `hace_min` parece que esta ahi AHORA."""
    p = NS["_apoyo_posicion_de"]({"lat": 1.0, "lng": 2.0, "updated_at": _hace(1), "state": "DELIVERED"})
    assert "hace_min" in p and isinstance(p["hace_min"], int) and "cuando" in p


def test_minutos_desde():
    f = NS["_apoyo_minutos_desde"]
    assert f(None) is None and f("no es fecha") is None
    hace5 = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    assert 4 <= f(hace5) <= 6
    assert 4 <= f(hace5.replace("+00:00", "Z")) <= 6


def test_telefono_cortex_manda_sobre_ficha():
    # El numero cambia de un dia a otro: manda el de Cortex de hoy, y como viene
    # de la fuente viva NO se marca sin_corroborar. Este es el caso del bug del
    # 03-09 (la ficha tenia el de Martin, Cortex el bueno de Yeimar hoy).
    r = NS["_apoyo_telefono"]("600111222", "600999888")
    assert r["telefono"] == "600999888", r
    assert r["telefono_fuente"] == "cortex"
    assert r["telefono_sin_corroborar"] is False
    assert r["telefono_discrepa"] is True   # la ficha tenia otro: se avisa para arreglarla


def test_telefono_de_cortex_de_OTRO_dia_no_es_corroborado():
    """Sin resumen de hoy se usa el del dia anterior, pero NO se vende como
    corroborado: quien conduce esa ruta cambia de un dia para otro, que es
    justo el bug que se venia a arreglar."""
    r = NS["_apoyo_telefono"]("600111222", "600999888", False)
    assert r["telefono"] == "600999888"
    assert r["telefono_fuente"] == "cortex_otro_dia"
    assert r["telefono_sin_corroborar"] is True
    # Y con el resumen del propio dia, sigue siendo corroborado.
    r2 = NS["_apoyo_telefono"]("600111222", "600999888", True)
    assert r2["telefono_fuente"] == "cortex" and r2["telefono_sin_corroborar"] is False


def test_telefono_ficha_sola_va_sin_corroborar():
    # Cortex no trae a esa persona hoy: se usa la ficha pero se marca para que
    # la oficina lo confirme (puede ser el de ayer).
    r = NS["_apoyo_telefono"]("600111222", None)
    assert r["telefono"] == "600111222"
    assert r["telefono_fuente"] == "ficha"
    assert r["telefono_sin_corroborar"] is True
    assert r["telefono_discrepa"] is False


def test_telefono_corroborado_no_avisa():
    # Ficha y Cortex coinciden (una con prefijo, otra sin): corroborado, sin avisos.
    r = NS["_apoyo_telefono"]("+34600111222", "600111222")
    assert r["telefono_fuente"] == "cortex"
    assert r["telefono_sin_corroborar"] is False
    assert r["telefono_discrepa"] is False


def test_telefono_sin_ninguno_vacio():
    r = NS["_apoyo_telefono"]("", "")
    assert r["telefono"] == "" and r["telefono_fuente"] is None
    assert r["telefono_sin_corroborar"] is False and r["telefono_discrepa"] is False


def test_todas_hechas_dispara_el_cierre_y_la_cola():
    # La señal fiable de «apoyo terminado» que engancha la cola: todas marcadas.
    assert NS["_apoyo_todas_hechas"]([{"stop_id": "1", "hecha": True}, {"stop_id": "2", "hecha": True}])
    # Si falta una, no esta hecho.
    assert not NS["_apoyo_todas_hechas"]([{"stop_id": "1", "hecha": True}, {"stop_id": "2"}])
    # Un apoyo sin paradas NO cuenta como hecho (si no, se cerraria en el aire).
    assert not NS["_apoyo_todas_hechas"]([])
    assert not NS["_apoyo_todas_hechas"](None)



# ── Completar la gente de Cortex cuando el resumen del dia viene a medias ──
# El 04-09-2026 el resumen de hoy traia 2 personas y en ruta habia 39. El
# respaldo del dia anterior solo entraba si NO habia NINGUN documento del dia,
# asi que 33 personas se quedaban con el telefono de la ficha y 16 de ellas lo
# tenian distinto al de Cortex: 16 llamadas a la persona equivocada.
# Probado reintroduciendo el fallo: si `_apoyo_fundir_gente` pisa lo que ya
# esta en el mapa, `test_lo_de_hoy_manda_sobre_lo_de_ayer` falla.

def _doc(*personas):
    return {"gente": [{"transporterId": t, "nombre": n, "telefono": tel}
                      for t, n, tel in personas]}


def test_resumen_a_medias_se_completa_con_el_dia_anterior():
    mapa = {}
    NS["_apoyo_fundir_gente"](mapa, [_doc(("A1", "ANA", "600111222"))], True)
    NS["_apoyo_fundir_gente"](mapa, [_doc(("A1", "ANA", "600111222"), ("A2", "BEA", "600333444"))], False)
    assert set(mapa) == {"A1", "A2"}
    assert mapa["A2"]["telefono"] == "600333444"
    assert mapa["A2"]["del_dia"] is False, "el de ayer tiene que ir marcado"


def test_lo_de_hoy_manda_sobre_lo_de_ayer():
    mapa = {}
    NS["_apoyo_fundir_gente"](mapa, [_doc(("A1", "ANA", "600111222"))], True)
    NS["_apoyo_fundir_gente"](mapa, [_doc(("A1", "ANA VIEJA", "600999999"))], False)
    assert mapa["A1"]["telefono"] == "600111222"
    assert mapa["A1"]["nombre"] == "ANA"
    assert mapa["A1"]["del_dia"] is True


def test_dos_centros_el_mismo_dia_gana_el_que_trae_telefono():
    mapa = {}
    NS["_apoyo_fundir_gente"](mapa, [_doc(("A1", "ANA", "")), _doc(("A1", "ANA", "600111222"))], True)
    assert mapa["A1"]["telefono"] == "600111222"


def test_un_telefono_de_ayer_no_pisa_a_uno_vacio_de_hoy():
    # Si hoy Cortex la trae SIN telefono, ese vacio es de hoy y manda: poner el
    # de ayer aqui lo venderia como del dia y es justo lo que no se quiere.
    mapa = {}
    NS["_apoyo_fundir_gente"](mapa, [_doc(("A1", "ANA", ""))], True)
    NS["_apoyo_fundir_gente"](mapa, [_doc(("A1", "ANA", "600999999"))], False)
    assert mapa["A1"]["telefono"] == ""
    assert mapa["A1"]["del_dia"] is True


def test_sin_transporter_id_se_ignora():
    mapa = {}
    NS["_apoyo_fundir_gente"](mapa, [{"gente": [{"nombre": "X", "telefono": "600111222"}]}], True)
    assert mapa == {}



# ── El reintento lo decide el cajon canonico, no una lista a mano ──────────
# La chincheta roja del mapa sale de `reintento`, que el backend calcula con
# `_cx_ruta_cajon`. Llegue a mirarlo desde el JS con el literal "ATTEMPTED":
# hoy acierta, pero el dia que entre otro estado reintentable el mapa dejaria
# de pintarlo y nadie se enteraria (gotcha 28/40).

def test_todo_estado_reintentable_cae_en_el_cajon_attempted():
    cajon = NS["_cx_ruta_cajon"]
    for s in NS["_CX_REINTENTABLE"]:
        assert cajon(s) == "attempted", "%s no cae en attempted" % s


def test_una_parada_reintentable_se_ofrece_como_pendiente():
    # Si "attempted" saliera de los cajones pendientes, la parada que MAS urge
    # —ya se intento y fallo— desapareceria de la pantalla de apoyo.
    assert "attempted" in NS["_APOYO_CAJONES_PENDIENTES"]


def test_el_backend_marca_el_reintento_con_el_cajon_no_con_el_literal():
    fuente = io.open(RUTA, encoding="utf-8-sig").read()
    i = fuente.index("async def _apoyo_paradas_pendientes")
    cuerpo = fuente[i:i + 4000]
    assert 'x["reintento"] = True' in cuerpo, "la parada ya no marca el reintento"
    assert '_cx_ruta_cajon(p.get("state")) == "attempted"' in cuerpo,         "el reintento se ha vuelto a decidir con un estado escrito a mano"


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
