# -*- coding: utf-8 -*-
"""El plan de horas se analizaba PERFECTO y no se guardaba.

Dani lo dijo asi: «los whc no se esta actualizando solo dia a dia para saber
como vamos». Y era cierto. Medido el 15-09-2026 contra produccion:

  · el plan entro SOLO desde la extension a las 11:04, 2.381 bytes, `ok: true`;
  · su cabecera decia «OGA5» y «Semana 38: sep. 13 - sep. 19, 2026»;
  · y el ultimo documento de `whc_planes` era del **14 de agosto**. Un mes.

La causa, una linea: `if center and ...`. Sin nave no se guarda — y la extension
no puede darla, porque esa pantalla de Cortex no lleva la nave en la URL (al
contrario que el informe diario, que si). Asi que llegaba con `center: None`, se
analizaba bien, se devolvia bien y se perdia. Desde fuera: «el WHC no se
actualiza», sin un solo error en ninguna parte.

Es la misma familia que el gotcha 33: lo que falla no da error, da silencio.
"""
import ast
import io
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_TEXTO = io.open(RAIZ / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)


def _fuente(nombre):
    for n in ast.walk(_ARBOL):
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == nombre:
            return chr(10).join(_TEXTO.splitlines()[n.lineno - 1:n.end_lineno])
    raise AssertionError("no existe %s en server.py" % nombre)


# La cabecera REAL del plan que entro solo el 15-09-2026, copiada del registro.
PLAN = """2
Programacion
Opciones
OGA5
Ir a esta semana

Semana 38:

sep. 13 - sep. 19, 2026

Filtros
Semana

dom., sep. 13

lun., sep. 14

mar., sep. 15
"""


def test_el_centro_se_saca_del_propio_plan_cuando_no_viene():
    """Es lo que hace que el plan que entra solo SE GUARDE."""
    src = _fuente("whc_analizar")
    assert "_whc_centro_del_texto(texto)" in src, (
        "sin esto el plan que manda la extension se sigue tirando")
    # Y tiene que ir ANTES de la condicion que decide guardar.
    i = src.index("_whc_centro_del_texto")
    j = src.index("if center and data.get(\"guardar\") is not False")
    assert i < j, "se deduce la nave despues de decidir si se guarda: no sirve"


def test_no_adivina_la_nave():
    """Con dos naves nombradas no se elige una: guardar el plan de una bajo la
    otra pone las horas de unas personas en el cuadro de otras, y eso no se nota
    (gotcha 6)."""
    src = _fuente("_whc_centro_del_texto")
    assert "len(vistos) == 1" in src, "con dos codigos estaria eligiendo uno"
    assert 'r"\\b%s\\b"' in src or "\\\\b%s\\\\b" in src, (
        "sin buscar la palabra entera, 'DIC1' casaria dentro de otro codigo")
    # Y los candidatos salen de los centros que la empresa tiene DE VERDAD, no
    # de una lista escrita aqui (gotcha 43).
    assert "organizations" in src and "_centros_conocidos" in src


def test_la_cabecera_real_del_plan_trae_la_nave():
    """Si esta comprobacion falla es que Cortex ha cambiado la pantalla."""
    assert re.search(r"\bOGA5\b", PLAN.upper())


def test_se_dice_si_el_plan_se_ha_guardado():
    """Un plan que se analiza, se enseña bien y no se guarda parece que ha ido
    perfecto. Asi se quedo un mes sin actualizarse sin que nadie lo notara."""
    src = _fuente("whc_analizar")
    assert '"guardado": bool(center' in src
    assert '"centro": center or None' in src


def test_todos_no_es_una_nave():
    """El selector del panel manda la palabra «Todos» cuando no hay nave
    elegida, y el 13-09-2026 quedo un plan archivado bajo un centro llamado
    TODOS: invisible para todas las pantallas, que filtran por una nave de
    verdad. Es el gotcha 12 al reves —escribiendo en vez de leyendo— y no da
    ningun error."""
    src = _fuente("whc_analizar")
    assert '"TODOS", "TODAS", "ALL"' in src, (
        "se volveria a guardar un plan en una nave que no existe")
    i = src.index('"TODOS", "TODAS", "ALL"')
    j = src.index('if center and data.get("guardar") is not False')
    assert i < j, "la guarda va despues de decidir guardar: no serviria"


def test_cero_excepciones_no_es_lo_mismo_que_no_saberlas():
    """El falso positivo mas tranquilizador que tenia la aplicacion.

    `excepciones` viene de una hoja aparte del portal («Drivers With Working
    Hour Exceptions»); el plan NO las trae —comprobado sobre el de OGA5 de la
    semana 38, 13.660 caracteres, ni una mencion—. Antes, si no venian, se
    asumia 0 y el WHC salia al **100 %, Fantastic**. Con el plan pegado a mano
    pasaba desapercibido; desde que entra SOLO desde la extension, que nunca las
    manda, la pantalla decia «100 % Fantastic» TODAS las semanas pasara lo que
    pasara.

    Y en esta metrica una sola excepcion te quita el Fantastic, asi que el
    numero inventado apuntaba justo al lado tranquilizador.
    """
    src = _fuente("whc_analizar")
    assert "excepciones_conocidas" in src, "vuelve a inventarse el 100 %"
    assert 'if con_actividad and not excepciones_conocidas:' in src
    # Sin saberlas: ni porcentaje ni tier. El denominador SI se sabe y se da.
    i = src.index("if con_actividad and not excepciones_conocidas:")
    j = src.index("elif con_actividad:")
    sin = src[i:j]
    assert '"porcentaje": None' in sin and '"tier": None' in sin
    assert '"conductores_con_actividad": con_actividad' in sin
    assert "porque" in sin, "hay que DECIR por que no se sabe"
