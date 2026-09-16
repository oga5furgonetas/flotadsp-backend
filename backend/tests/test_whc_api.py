# -*- coding: utf-8 -*-
"""El plan de horas leido de la API de Cortex, no de la pantalla.

DE DONDE SALE. La sonda del 15-09-2026 apunto lo que pide la pantalla de
Programacion, y ahi estaba:

    GET /scheduling/home/api/v2/rosters ?serviceAreaId,fromDate,toDate

Cada persona trae `reservationsMap`: un dia, una reserva, con
`durationInMinutes`, `startTimeInMinutes` (desde medianoche) y
`clockInEpoch`/`clockOutEpoch`. Y los dias FUTUROS tambien.

LO QUE ARREGLA, y son tres cosas que se arrastraban:

  · **nada estimado**. Leyendo la pantalla, los bloques sin hora de fin habia
    que estimarlos repartiendo el total de la semana, y eso produjo diez avisos
    falsos de jornadas de 17 y 18 horas;
  · **los umbrales los dice Amazon** (`leapConfig`: 3300 min semanales duros,
    780 de jornada dura, 660 blanda), no los suponemos;
  · **entra de las tres naves** sin que nadie abra ninguna pantalla.

Los datos de abajo son la forma REAL de dos conductores de DGA2.
"""
import ast
import io
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_TEXTO = io.open(RAIZ / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)


def _fuente(nombre):
    for n in ast.walk(_ARBOL):
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == nombre:
            return chr(10).join(_TEXTO.splitlines()[n.lineno - 1:n.end_lineno])
    raise AssertionError("no existe %s" % nombre)


def _cargar():
    amb = {"_texto_cuerpo": lambda v, n=None: ("" if v is None else str(v))[:n or 500]}
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name in ("_horarios_conductores",
                                                         "_hm_desde_medianoche"):
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
    assert "_horarios_conductores" in amb
    return amb["_horarios_conductores"], amb["_hm_desde_medianoche"]


LEER, HM = _cargar()

MS = 1000

# Gonzalo Rua Pena, tal cual: lunes fichado entero, martes fichado y en curso,
# miercoles puesto y sin empezar.
ROSTER = {"data": [{
    "driverName": "Gonzalo Rua Pena",
    "driverProviderId": "amzn1.flex.provider.v1.7c505a87",
    "driverOperationalStatus": "ACTIVE",
    "driverEmail": "no@deberia.estar",
    "workPhoneNumber": "600000000",
    "reservationsMap": {
        # 08:37 -> 16:39 = 8h02 fichadas (planificadas 9h)
        "2026-09-14": [{"durationInMinutes": 540, "startTimeInMinutes": 660,
                        "clockInEpoch": 1757838 * 1000 * 1000,
                        "clockOutEpoch": (1757838 * 1000 + 8 * 3600 + 2 * 60) * 1000,
                        "status": "ASSIGNED", "serviceTypeName": "Standard Parcel"}],
        # fichada la entrada y aun sin salir
        "2026-09-15": [{"durationInMinutes": 540, "startTimeInMinutes": 660,
                        "clockInEpoch": 1757924 * 1000 * 1000, "clockOutEpoch": None,
                        "status": "ASSIGNED", "serviceTypeName": "Standard Parcel"}],
        # manana: puesta, sin empezar
        "2026-09-16": [{"durationInMinutes": 540, "startTimeInMinutes": 660,
                        "clockInEpoch": None, "clockOutEpoch": None,
                        "status": "ASSIGNED", "serviceTypeName": "Standard Parcel"}],
        "2026-09-17": [], "2026-09-18": [], "2026-09-19": [], "2026-09-13": [],
    },
}]}

HOY = "2026-09-15"


def test_la_hora_se_lee_de_los_minutos_desde_medianoche():
    """660 es las once de la manana, no las 660."""
    assert HM(660) == "11:00am"
    assert HM(720) == "12:00pm"
    assert HM(0) == "12:00am"
    assert HM(1275) == "9:15pm"
    assert HM(None) == ""


def test_lo_fichado_manda_sobre_lo_planificado():
    """Si entro y salio, vale lo que duro de verdad: 8h02, no las 9h puestas."""
    c = LEER(ROSTER, HOY)[0]
    lunes = [b for b in c["bloques"] if b["dia"] == "2026-09-14"][0]
    assert lunes["minutos"] == 8 * 60 + 2, lunes
    assert lunes["en_curso"] is False


def test_el_que_esta_en_ruta_ahora_cuenta_lo_planificado_y_se_marca():
    """Ha fichado entrada y no salida: esta trabajando. No se le puede poner
    todavia lo que habra durado, pero hay que saber que sigue fuera."""
    c = LEER(ROSTER, HOY)[0]
    hoy = [b for b in c["bloques"] if b["dia"] == HOY][0]
    assert hoy["en_curso"] is True
    assert hoy["minutos"] == 540
    assert hoy["fin"] == "", "le pone hora de fin a alguien que sigue en ruta"


def test_lo_que_aun_no_ha_empezado_NO_cuenta_como_trabajado():
    """Meter los dias futuros en el total es lo que hace que alguien que no ha
    empezado la semana parezca que la lleva hecha."""
    c = LEER(ROSTER, HOY)[0]
    assert c["trabajado"] == (8 * 60 + 2) + 540
    assert not [b for b in c["bloques"] if b["dia"] > HOY]
    # Y se cuenta aparte, que es lo que hace exacta la proyeccion.
    assert c["planificado_restante"] == 540
    assert c["bloques_restantes"] == 1


def test_ningun_bloque_es_estimado():
    """Es lo que quita de golpe los avisos falsos de jornadas de 18 horas: el
    dato lo da Amazon, no lo repartimos nosotros."""
    for b in LEER(ROSTER, HOY)[0]["bloques"]:
        assert b["estimado"] is False


def test_no_se_copia_lo_que_amazon_marca_confidencial():
    """La respuesta trae `confidentialFields`: telefono, correo y nombre. El
    nombre se guarda —hace falta para hablar con esa persona y ya salia en la
    pantalla de antes—, pero el correo y el telefono no se copian: no hacen
    falta para contar horas, y el telefono bueno no es ese (gotcha 66)."""
    c = LEER(ROSTER, HOY)[0]
    crudo = str(c)
    assert "no@deberia.estar" not in crudo, "se ha copiado el correo"
    assert "600000000" not in crudo, "se ha copiado el telefono"
    assert c["nombre"] == "Gonzalo Rua Pena"


def test_los_umbrales_salen_de_amazon_y_no_de_una_constante_nuestra():
    """`leapConfig` los trae: 3300 min semanales duros, 780 de jornada dura.
    Llevabamos usando 55 h «propias» y resulta que son EXACTAMENTE las suyas."""
    src = _fuente("whc_semana")
    assert 'leap.get("weeklyHardThreshold")' in src
    assert 'leap.get("dailySoftThreshold")' in src
    assert 'leap.get("approachingWeeklyThreshold")' in src
    # Y si faltaran, se cae a las de siempre en vez de quedarse sin limite.
    assert "_WHC_LIMITE_PROPIO" in src and "_WHC_BLOQUE_LIMITE" in src


def test_sin_dato_de_la_api_se_dice_que_no_lo_hay():
    """Media verdad presentada como entera es peor que decir que aun no esta:
    la pantalla sigue con el plan pegado."""
    src = _fuente("whc_semana")
    assert '"hay": False' in src and '"porque"' in src


def test_la_proyeccion_es_lo_que_tiene_puesto_no_una_suposicion():
    """Antes se proyectaba «seis bloques de nueve horas». Ahora los dias que le
    quedan vienen en el mismo roster."""
    src = _fuente("whc_semana")
    assert 'c.get("planificado_restante")' in src
    assert '"proyeccion"' in src
