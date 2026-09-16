# -*- coding: utf-8 -*-
"""Una jornada de 18 horas no existe: es el resto de la semana mal repartido.

EL FALSO POSITIVO. El plan trae el total de la semana de cada conductor y sus
bloques, pero algunos bloques vienen sin hora de fin («en curso») y hay filas sin
horario ninguno. Para cuadrar, el codigo repartia la diferencia —total menos lo
medido— entre los bloques sin hora. Cuando faltan filas por leer, esa diferencia
es casi la semana entera y acababa dentro de UN bloque.

Medido el 15-09-2026 sobre el plan real de OGA5 de la semana 38:

  · la pantalla avisaba de **13 conductores** con un bloque de mas de 11 h;
  · **10 eran falsos**, con bloques de 17h00, 18h00, 18h14, 18h30…;
  · David Sierra Ferro: el portal da 28h48 en la semana, se le encuentra un
    bloque medido de 10h18 y otro «en curso» sin fin -> los 18h30 restantes se
    le metian a ese bloque y saltaba la alarma.

Y la comprobacion que deberia haberlo cazado —`cuadra`— salia **True**, porque
el reparto acababa de forzar que la suma cuadrara. El unico test que no falla
nunca es el que se anula a si mismo.

Despues del arreglo: 3 avisos, los tres con hora de inicio y de fin de verdad
(11h10, 11h03, 11h00).
"""
import ast
import io
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_TEXTO = io.open(RAIZ / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)


def _constante(nombre):
    """`literal_eval` no vale: estas constantes son cuentas («11 * 60»), no
    literales. Se compila la expresion tal cual esta en el fichero."""
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == nombre:
            return eval(compile(ast.Expression(body=n.value),  # noqa: S307
                                "<server>", "eval"), {})
    raise AssertionError("no existe %s" % nombre)


def _cargar():
    """`_whc_evaluar` sacada del fichero real (gotcha 40)."""
    amb = {}
    for nombre in ("_WHC_BLOQUE_LIMITE", "_WHC_BLOQUE_RIESGO", "_WHC_BLOQUE_IMPLICITO",
                   "_WHC_BLOQUE_MAX_CREIBLE", "_WHC_MARGEN_AVISO_PROPIO",
                   "_WHC_BLOQUES_SEMANA"):
        amb[nombre] = _constante(nombre)
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name in ("_whc_evaluar", "_whc_ritmo"):
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
    assert "_whc_evaluar" in amb
    return amb["_whc_evaluar"]


EVALUAR = _cargar()


def _bloque(ini, fin, minutos, estimado=False):
    return {"inicio": ini, "fin": fin, "minutos": minutos, "estimado": estimado,
            "en_curso": fin is None}


# David Sierra Ferro, tal cual: 28h48 de semana, un bloque medido de 10h18 y
# otro en curso sin hora de fin.
DAVID = {"nombre": "David Sierra Ferro", "trabajado": 28 * 60 + 48,
         "bloques": [_bloque("10:27am", "8:45pm", 10 * 60 + 18),
                     _bloque("10:59am", None, None)]}

# Denis Miguez Rios: sus tres bloques SI explican su semana (10h17 + 11h10 +
# 9h14 = 30h41). Su bloque de 11h10 es real y tiene que seguir avisando.
DENIS = {"nombre": "Denis Miguez Rios", "trabajado": 30 * 60 + 41,
         "bloques": [_bloque("10:19am", "8:36pm", 10 * 60 + 17),
                     _bloque("11:06am", "10:16pm", 11 * 60 + 10),
                     _bloque("11:35am", None, None)]}

LIM = 55 * 60


def test_no_se_inventa_una_jornada_de_dieciocho_horas():
    """Es el caso real de David. El resto de la semana NO es un bloque."""
    r = EVALUAR([dict(DAVID)], LIM)[0]
    largos = [b for b in r["bloques"] if (b["minutos"] or 0) > 14 * 60]
    assert not largos, "sigue metiendo la semana entera en un bloque: %s" % largos
    assert not r["bloques_pasados"], (
        "avisa de que se paso de jornada con un bloque que nos hemos inventado")


def test_lo_que_no_cuadra_se_DICE_en_vez_de_repartirse():
    """Callarse y repartir es lo que produjo los diez avisos falsos."""
    r = EVALUAR([dict(DAVID)], LIM)[0]
    assert r["cuadra"] is False, "dice que cuadra habiendo forzado los numeros"
    assert r["horas_sin_ubicar"] > 0, "no dice que hay horas sin ubicar"
    # Y son las que faltan de verdad: 28h48 - 10h18.
    assert r["horas_sin_ubicar"] == (28 * 60 + 48) - (10 * 60 + 18)


def test_la_comprobacion_de_cuadre_no_puede_anularse_a_si_misma():
    """`cuadra` salia True SIEMPRE que hubiera un bloque sin hora, porque el
    reparto acababa de hacer que la suma cuadrara. Un test que se cumple solo no
    prueba nada."""
    src = None
    for n in ast.walk(_ARBOL):
        if isinstance(n, ast.FunctionDef) and n.name == "_whc_evaluar":
            src = chr(10).join(_TEXTO.splitlines()[n.lineno - 1:n.end_lineno])
    assert "not reparto_imposible" in src
    i = src.index('"cuadra"')
    assert "not reparto_imposible" in src[i:i + 200]


def test_un_bloque_estimado_no_acusa_a_nadie():
    """Decir que alguien «se paso de las once horas» apoyandose en un numero que
    nos hemos deducido nosotros es acusar sin prueba. El total SEMANAL si vale:
    lo da el portal."""
    r = EVALUAR([dict(DENIS)], LIM)[0]
    for b in r["bloques_pasados"] + r["riesgo_diario"]:
        assert not b.get("estimado"), "avisa por un bloque estimado"


def test_el_bloque_medido_de_verdad_SIGUE_avisando():
    """El arreglo no puede llevarse por delante los avisos buenos: Denis tiene
    un bloque de 11h10 con hora de inicio y de fin, y ese hay que verlo."""
    r = EVALUAR([dict(DENIS)], LIM)[0]
    assert r["bloques_pasados"], "se ha cargado el aviso bueno"
    assert r["bloques_pasados"][0]["minutos"] == 11 * 60 + 10
    assert r["cuadra"] is True, "los suyos SI cuadran"


def test_el_total_semanal_sigue_saliendo_del_portal():
    """Lo unico que no se toca: el total de la semana lo da Amazon y es el que
    decide si alguien se pasa del limite semanal."""
    r = EVALUAR([dict(DAVID)], LIM)[0]
    assert r["trabajado"] == 28 * 60 + 48
    assert r["supera_semanal"] is False
    assert r["margen_semanal"] == LIM - (28 * 60 + 48)


def test_la_proyeccion_no_le_suma_jornadas_que_ya_ha_hecho():
    """El «acabaría en 64h48m» de la captura de Dani.

    `restantes` salia de `6 - len(bloques)`, y `len(bloques)` es lo que el lector
    ha sabido reconocer. El plan escribe filas que no parecen un horario —«11:30»,
    «11 AM»— y tambien son bloques. A David Sierra Ferro le leia 2 de los 4 que
    tiene, asi que le proyectaba CUATRO jornadas mas (36 h) sobre 28h48 -> 64h48,
    y salia en la lista de «en peligro».

    Las horas SI son del portal, asi que ponen un suelo al recuento: con 28h48
    lleva unas tres jornadas, le quedan tres, y el numero honesto es 55h48.
    """
    r = EVALUAR([dict(DAVID)], LIM, None, 3)[0]
    assert r["bloques_leidos"] == 2
    assert r["bloques_hechos"] == 3, "sigue contando solo los que supo leer"
    assert r["bloques_restantes"] == 3, "le suma una jornada que ya ha hecho"
    assert r["proyeccion"] == (28 * 60 + 48) + 3 * 9 * 60   # 55h48
    assert r["proyeccion"] < 60 * 60, "vuelve a proyectar mas de 60 horas"


def test_a_quien_se_le_leen_todos_los_bloques_no_le_cambia_nada():
    """El arreglo no puede mover los numeros de los que ya estaban bien."""
    r = EVALUAR([dict(DENIS)], LIM, None, 3)[0]
    assert r["bloques_leidos"] == r["bloques_hechos"] == 3
    assert r["proyeccion"] == (30 * 60 + 41) + 3 * 9 * 60   # 57h41, como antes
