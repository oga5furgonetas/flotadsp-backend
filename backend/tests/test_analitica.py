# -*- coding: utf-8 -*-
"""Analitica anonima: lo que puede dar una cifra falsa, probado con casos a mano.

`analitica.py` no toca la base de datos, asi que aqui se fabrican sesiones enteras
y se comprueba lo que un panel de estadisticas suele contar mal: una sesion que
sigue abierta como «se fue», recargar como pantalla nueva, el tiempo de la ultima
pantalla, tokens de enlaces publicos colandose en la ruta, o el equipo propio
inflando el trafico.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import analitica as an  # noqa: E402

AHORA = datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc)


def _ev(sid, minutos, ruta, tipo="vista", seg="visitante", **extra):
    e = {"sid": sid, "ts": AHORA - timedelta(minutes=minutos), "tipo": tipo,
         "ruta": ruta, "seg": seg}
    e.update(extra)
    return e


def _ordenar(evs):
    return sorted(evs, key=lambda e: e["ts"])


# ── entrada ────────────────────────────────────────────────────────────────
def test_la_ruta_nunca_lleva_un_token():
    assert an.limpiar_ruta("/taller/t/AbC123xyz987") == "/taller/t/:x"
    assert an.limpiar_ruta("/taller/t/:token") == "/taller/t/:token"
    assert an.limpiar_ruta("/verify/9f86d081884c7d659a2f?x=1#y") == "/verify/:x"
    assert an.limpiar_ruta("/empleo/oga5/oferta-3") == "/empleo/:x/:x"
    assert an.limpiar_ruta("/") == "/"
    assert an.limpiar_ruta("") == "/"


def test_lo_que_no_es_nuestro_se_guarda_como_otra():
    assert an.limpiar_ruta("/wp-admin/setup.php") == "/otra"
    assert an.limpiar_ruta("/.env") == "/otra"


def test_los_robots_y_lo_mal_formado_no_se_guardan():
    cuerpo = {"sid": "abcdef1234567890", "tipo": "vista", "ruta": "/"}
    assert an.evento_desde(cuerpo, "Mozilla/5.0 (compatible; Googlebot/2.1)", None, AHORA) is None
    assert an.evento_desde(cuerpo, "python-requests/2.31", None, AHORA) is None
    assert an.evento_desde(cuerpo, "Mozilla/5.0 Chrome/120", None, AHORA) is not None
    assert an.evento_desde({**cuerpo, "sid": "corto"}, "Chrome", None, AHORA) is None
    assert an.evento_desde({**cuerpo, "tipo": "otro"}, "Chrome", None, AHORA) is None
    assert an.evento_desde({**cuerpo, "tipo": "accion"}, "Chrome", None, AHORA) is None
    assert an.evento_desde([1, 2], "Chrome", None, AHORA) is None


def test_quien_es_lo_dice_el_token_no_el_cliente():
    assert an.segmento_de(None) == "visitante"
    assert an.segmento_de({"sa": True}) == "propio"
    assert an.segmento_de({"account_type": "owner"}) == "propio"
    assert an.segmento_de({"account_type": "dsp", "imp": True}) == "propio"
    assert an.segmento_de({"demo": True}) == "demo"
    assert an.segmento_de({"role": "driver", "account_type": "dsp"}) == "conductor"
    assert an.segmento_de({"role": "admin", "account_type": "dsp"}) == "cliente"
    # Aunque el cuerpo diga otra cosa, el segmento sale solo del token.
    e = an.evento_desde({"sid": "abcdef1234567890", "tipo": "vista", "ruta": "/panel",
                         "seg": "propio"}, "Chrome", None, AHORA)
    assert e["seg"] == "visitante"


def test_no_se_guarda_persona_ni_ip():
    e = an.evento_desde(
        {"sid": "abcdef1234567890", "tipo": "vista", "ruta": "/panel/vehiculos",
         "ip": "1.2.3.4", "sub": "dani", "name": "Dani"},
        "Chrome", {"sub": "u1", "name": "Ana", "org_id": "oga5", "role": "admin"}, AHORA)
    assert set(e) <= {"ts", "sid", "tipo", "seg", "ruta", "org", "disp", "ref", "utm", "nombre"}
    assert e["org"] == "oga5"
    # el visitante y el equipo propio no llevan empresa
    e2 = an.evento_desde({"sid": "abcdef1234567890", "tipo": "vista", "ruta": "/"},
                         "Chrome", {"sa": True, "org_id": "owner"}, AHORA)
    assert "org" not in e2


# ── informe ────────────────────────────────────────────────────────────────
def test_una_sesion_abierta_no_es_una_salida():
    # Ana esta mirando /planes hace 2 minutos: sigue ahi, no «se fue de planes».
    # Luis se fue de /planes hace dos horas.
    evs = _ordenar([
        _ev("ana00000001", 4, "/"), _ev("ana00000001", 2, "/planes"),
        _ev("luis0000001", 130, "/"), _ev("luis0000001", 125, "/planes"),
    ])
    r = an.informe(evs, AHORA)
    planes = next(p for p in r["pantallas"] if p["ruta"] == "/planes")
    assert planes["sesiones"] == 2
    assert planes["salidas"] == 1 and planes["cerradas"] == 1
    assert planes["pct_salida"] == 100.0
    assert r["resumen"]["activos_ahora"] == 1
    assert r["resumen"]["sesiones_cerradas"] == 1


def test_recargar_no_es_una_pantalla_nueva():
    evs = _ordenar([_ev("s0000000001", 100, "/planes"), _ev("s0000000001", 99, "/planes"),
                    _ev("s0000000001", 98, "/planes")])
    r = an.informe(evs, AHORA)
    assert r["resumen"]["vistas"] == 1
    assert r["pantallas"][0]["vistas"] == 1
    assert r["resumen"]["pct_una_pantalla"] == 100.0


def test_el_tiempo_solo_llega_hasta_la_siguiente_pantalla():
    evs = _ordenar([_ev("s0000000001", 100, "/"), _ev("s0000000001", 99, "/planes"),
                    _ev("s0000000001", 90, "/registro")])
    r = an.informe(evs, AHORA)
    por = {p["ruta"]: p for p in r["pantallas"]}
    assert por["/"]["segundos_mediana"] == 60
    assert por["/planes"]["segundos_mediana"] == 540
    assert por["/registro"]["segundos_mediana"] is None   # la ultima no se inventa


def test_un_hueco_de_horas_no_cuenta_como_tiempo_en_pantalla():
    evs = _ordenar([_ev("s0000000001", 300, "/"), _ev("s0000000001", 10, "/planes")])
    r = an.informe(evs, AHORA)
    assert next(p for p in r["pantallas"] if p["ruta"] == "/")["segundos_mediana"] is None


def test_el_equipo_propio_no_infla_lo_externo():
    evs = _ordenar([
        _ev("fuera0000001", 200, "/", seg="visitante"),
        _ev("dani0000001", 200, "/panel", seg="propio"),
        # entra sin identificar y acaba como equipo propio: la sesion es propia
        _ev("mixta000001", 200, "/panel/login", seg="visitante"),
        _ev("mixta000001", 199, "/panel", seg="propio"),
    ])
    assert an.informe(evs, AHORA)["resumen"]["sesiones"] == 1
    assert an.informe(evs, AHORA, seg="todos")["resumen"]["sesiones"] == 3
    assert an.informe(evs, AHORA, seg="propio")["resumen"]["sesiones"] == 2


def test_el_embudo_cuenta_quien_toco_el_paso_no_un_camino_forzado():
    evs = _ordenar([
        # entra directo al registro desde un anuncio, sin pasar por planes
        _ev("directo0001", 200, "/registro"),
        _ev("directo0001", 190, "/registro", tipo="accion", nombre="registro_ok"),
        # curiosea planes y se va
        _ev("curioso0001", 200, "/"), _ev("curioso0001", 199, "/planes"),
    ])
    f = next(e for e in an.informe(evs, AHORA)["embudos"] if e["clave"] == "alta")
    n = {p["etiqueta"]: p["n"] for p in f["pasos"]}
    assert f["sesiones"] == 2
    assert n["Entran a la web"] == 2
    assert n["Ven los planes"] == 1
    assert n["Abren el registro"] == 1
    assert n["Crean la cuenta"] == 1


def test_no_se_mezclan_las_tiendas_con_la_web():
    evs = _ordenar([_ev("t0000000001", 200, "/t/:token"),
                    _ev("t0000000001", 199, "/t/:token", tipo="accion", nombre="tienda_ficha")])
    r = an.informe(evs, AHORA)
    alta = next(e for e in r["embudos"] if e["clave"] == "alta")
    tienda = next(e for e in r["embudos"] if e["clave"] == "tienda")
    assert alta["sesiones"] == 0
    assert tienda["sesiones"] == 1 and tienda["pasos"][1]["n"] == 1
    assert r["areas"] == {"tienda": 1}


def test_flujos_y_siguiente_pantalla():
    evs = []
    for k in range(3):
        sid = "s%010d" % k
        evs += [_ev(sid, 300, "/panel/login"), _ev(sid, 299, "/panel")]
    evs += [_ev("s0000000009", 300, "/panel/login")]
    r = an.informe(_ordenar(evs), AHORA, seg="todos")
    assert r["flujos"][0] == {"de": "/panel/login", "a": "/panel", "n": 3}
    login = next(p for p in r["pantallas"] if p["ruta"] == "/panel/login")
    assert login["siguiente"][0] == {"ruta": "/panel", "n": 3}
    assert login["salidas"] == 1 and login["cerradas"] == 4
    assert login["pct_salida"] == 25.0


def test_los_dias_sin_visitas_salen_a_cero():
    evs = [_ev("s0000000001", 60, "/")]
    r = an.informe(evs, AHORA, dias=7)
    assert len(r["serie"]) == 7
    assert sum(d["sesiones"] for d in r["serie"]) == 1
    assert r["serie"][0]["sesiones"] == 0


def test_sin_datos_no_revienta_ni_inventa():
    r = an.informe([], AHORA)
    assert r["resumen"]["sesiones"] == 0
    assert r["resumen"]["pantallas_por_sesion"] is None
    assert r["resumen"]["pct_una_pantalla"] is None
    assert r["pantallas"] == [] and r["flujos"] == []


def test_las_empresas_se_cuentan_por_pantalla_sin_repetir():
    evs = _ordenar([
        _ev("a0000000001", 200, "/panel/vehiculos", seg="cliente", org="e1"),
        _ev("a0000000002", 190, "/panel/vehiculos", seg="cliente", org="e1"),
        _ev("a0000000003", 180, "/panel/vehiculos", seg="cliente", org="e2"),
    ])
    r = an.informe(evs, AHORA)
    assert r["pantallas"][0]["empresas"] == 2
    assert r["resumen"]["empresas_activas"] == 2


def test_las_fechas_de_mongo_sin_zona_se_entienden_como_utc():
    e = _ev("s0000000001", 60, "/")
    e["ts"] = e["ts"].replace(tzinfo=None)
    assert an.informe([e], AHORA.replace(tzinfo=None))["resumen"]["sesiones"] == 1


def test_el_origen_solo_cuenta_a_quien_llega_a_paginas_publicas():
    evs = _ordenar([
        _ev("g0000000001", 200, "/", ref="google.com"),
        _ev("d0000000001", 200, "/planes"),
        _ev("p0000000001", 200, "/panel", seg="cliente"),
    ])
    r = an.informe(evs, AHORA)
    assert {c["canal"]: c["sesiones"] for c in r["canales"]} == {"google.com": 1, "directo": 1}


def test_el_portal_del_conductor_mide_sus_pantallas_y_no_el_slug():
    """El portal es UNA url con ocho pantallas dentro. Midiendolo por cambio de
    ruta solo se veia `/conductor` —la pantalla de entrada, antes de que nadie
    entrara—: el 19-09-2026 eso dejaba 29 de 42 visitas como «sin cuenta» y «se
    van aqui, 100 %», sin forma de saber hasta donde llegaban. Ahora cada
    seccion viaja como `/conductor/p/<seccion>`; el slug de la empresa, no."""
    assert an.limpiar_ruta("/conductor/mi-empresa") == "/conductor/:slug"
    assert an.limpiar_ruta("/conductor/OGA5") == "/conductor/:slug"
    assert an.limpiar_ruta("/conductor/p/tienda") == "/conductor/p/tienda"
    assert an.limpiar_ruta("/conductor") == "/conductor"

    evs = _ordenar([
        _ev("portal0000000001", 20, "/conductor/p/entrada"),
        _ev("portal0000000001", 18, "/conductor/p/inicio", seg="conductor"),
        _ev("portal0000000001", 12, "/conductor/p/auditoria", seg="conductor"),
        _ev("portal0000000001", 5, "/conductor/p/hecho", seg="conductor"),
    ])
    d = an.informe(evs, AHORA, seg="todos")
    filas = {f["ruta"]: f for f in d["pantallas"]}
    assert len(filas) == 4, "cada seccion es una pantalla"
    # Quien entra lo hace por la de entrada, y de ahi NO se va nadie: sigue.
    assert filas["/conductor/p/entrada"]["entradas"] == 1
    assert filas["/conductor/p/entrada"]["salidas"] == 0
    # El tiempo de cada pantalla se mide hasta la siguiente; la ultima no se sabe.
    assert filas["/conductor/p/entrada"]["segundos_mediana"] == 120
    assert filas["/conductor/p/hecho"]["segundos_mediana"] is None
    # Y el token manda: entra sin cuenta y acaba contando como conductor.
    assert d["por_segmento"]["conductor"] == 1
    assert d["por_segmento"]["visitante"] == 0


def test_el_contador_de_cada_segmento_no_depende_del_filtro():
    """El selector enseña cuantas visitas hay de cada tipo, y eso se cuenta
    SIEMPRE sobre todas: contandolo sobre lo filtrado, estando en «de fuera»
    salia «propio: 0» y «clientes: 0», que es justo la cifra que se mira para
    decidir si cambiar de filtro. Se vio en produccion el 19-09-2026."""
    evs = _ordenar([
        _ev("visita0000000001", 20, "/"),
        _ev("visita0000000001", 19, "/planes"),
        _ev("propio0000000001", 10, "/panel", seg="propio"),
        _ev("client0000000001", 8, "/panel", seg="cliente"),
    ])
    fuera = an.informe(evs, AHORA, seg="externo")
    todos = an.informe(evs, AHORA, seg="todos")
    assert fuera["por_segmento"] == todos["por_segmento"]
    assert fuera["por_segmento"]["propio"] == 1
    assert fuera["por_segmento"]["cliente"] == 1
    # Y lo filtrado sigue siendo lo filtrado: el equipo propio no cuenta.
    assert fuera["resumen"]["sesiones"] == 2
    assert todos["resumen"]["sesiones"] == 3


if __name__ == "__main__":
    fallos = 0
    for nombre, f in sorted(globals().items()):
        if nombre.startswith("test_") and callable(f):
            try:
                f()
                print("ok  ", nombre)
            except Exception as ex:                              # noqa: BLE001
                fallos += 1
                print("FALLA", nombre, repr(ex))
    sys.exit(1 if fallos else 0)
