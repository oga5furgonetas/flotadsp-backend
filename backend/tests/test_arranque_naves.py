# -*- coding: utf-8 -*-
"""Una nave nueva —o una empresa nueva— tiene que poder arrancar sin que nada
este escrito para las naves de Dani.

Medido el 16-09-2026 entrando como una empresa recien creada:
  · la guia daba la empresa por «completa» con 1 furgoneta, 1 conductor y 1
    inspeccion, sin mirar Cortex; y en la empresa de Dani, con la guia completa,
    DGA1 llevaba 20 dias sin paquetes y DGA2 36;
  · dar de alta una alquiladora exigia «OGA5/DGA1/DGA2»;
  · la ubicacion de las naves le devolvia OGA5, DGA1 y DGA2 como si fueran suyas.
"""
import ast
import io
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / "server.py"
TXT = io.open(SERVER, encoding="utf-8-sig").read()


def _funcion(nombre):
    lineas = TXT.split("\n")
    for n in ast.walk(ast.parse(TXT)):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == nombre:
            return "\n".join(lineas[n.lineno - 1:n.end_lineno])
    raise AssertionError("no existe %s" % nombre)


def test_la_guia_mira_cada_nave():
    c = _funcion("onboarding_status")
    assert "_arranque_naves(await _centros_de_la_empresa())" in c
    assert '"naves": naves' in c


def test_la_guia_no_se_da_por_completa_con_una_nave_sin_cortex():
    c = _funcion("onboarding_status")
    assert '"completo": hechos == len(obligatorios) and naves_ok' in c


def test_cortex_es_obligatorio_por_nave_y_lo_recomendado_no_bloquea():
    c = _funcion("_arranque_naves")
    assert 'cortex = {"id": "cortex"' in c, "sin Cortex la mitad de la app esta vacia"
    for opcional in ("objetivos", "talleres", "turnos"):
        assert '{"id": "%s"' % opcional in c
        linea = [l for l in c.split("\n") if '{"id": "%s"' % opcional in l][0]
        assert '"opcional": True' in linea, "%s no puede dejar la guia abierta" % opcional
    assert 'if not x.get("opcional")' in c


def test_los_objetivos_son_los_de_su_propia_scorecard():
    """La misma regla que `_sc_thresholds`: solo es fiable lo que sale de la
    scorecard de ESA nave (tipo sls). Otra regla diria «listo» donde la pantalla
    de scorecard dice «estos umbrales no son de tu nave»."""
    c = _funcion("_arranque_naves")
    assert '{"center": c, "tipo": "sls"}' in c


def test_el_centro_sucio_no_deja_a_una_nave_sin_datos():
    c = _funcion("_arranque_naves")
    assert 're.escape(c)' in c, "centro por igualdad: 'OGA5 ' contaria cero (gotcha 6)"


def test_alquiladora_en_cualquier_nave_de_la_empresa():
    c = _funcion("create_rental")
    assert '("OGA5", "DGA1", "DGA2")' not in c
    assert "_centros_de_la_empresa()" in c


def test_la_ubicacion_solo_de_las_naves_de_la_empresa():
    c = _funcion("org_centros_geo")
    assert "_centros_de_la_empresa()" in c
    assert "if c in naves" in c
