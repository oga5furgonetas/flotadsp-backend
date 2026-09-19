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

LO QUE SE ARREGLO EL 19-09-2026, medido en produccion:

  · «18 ya pasados» en OGA5 eran **2**. El bloque EN CURSO se sumaba por lo
    PLANIFICADO (9 h) como si ya estuviera hecho: 24 de 160 personas salian con
    la semana pasada sin haberla pasado (Gabriel Miragaya: 59h57 en pantalla,
    50h57 cerradas);
  · un dia PASADO sin entrada fichada se contaba como «pendiente» y hinchaba la
    proyeccion de quien falto o libraba (6 personas con mas de un dia pendiente
    en el ultimo dia de la semana);
  · el «hoy» se fijaba al RECIBIR el dato y el dato tenia tres horas.

Los tests leen las funciones REALES de `server.py` (gotcha 40).
"""
import ast
import io
import time
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_TEXTO = io.open(RAIZ / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)

_FUNCIONES = ("_whc_num", "_whc_reservas", "_whc_clasificar", "_whc_reservas_de_bloques",
              "_horarios_conductores", "_hm_desde_medianoche")


def _fuente(nombre):
    for n in ast.walk(_ARBOL):
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == nombre:
            return chr(10).join(_TEXTO.splitlines()[n.lineno - 1:n.end_lineno])
    raise AssertionError("no existe %s" % nombre)


def _cargar():
    amb = {"_texto_cuerpo": lambda v, n=None: ("" if v is None else str(v))[:n or 500],
           "time": time}
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name in _FUNCIONES:
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
    faltan = [f for f in _FUNCIONES if f not in amb]
    assert not faltan, "no se han cargado: %s" % faltan
    return amb


AMB = _cargar()
LEER, HM = AMB["_horarios_conductores"], AMB["_hm_desde_medianoche"]
CLASIFICAR, DE_BLOQUES = AMB["_whc_clasificar"], AMB["_whc_reservas_de_bloques"]
RESERVAS = AMB["_whc_reservas"]

MIN = 60 * 1000


def _ms(dia, hh, mm=0):
    """Epoch en ms de un dia a una hora (UTC: el test no depende de la zona)."""
    y, m, d = (int(x) for x in dia.split("-"))
    return int(datetime(y, m, d, hh, mm, tzinfo=timezone.utc).timestamp() * 1000)


def _res(dia, hh=9, dur=540, ci=None, co=None, st="ASSIGNED"):
    """Una reserva con la forma REAL de Amazon (sacada del esquema capturado)."""
    return {"status": st, "durationInMinutes": dur, "startTimeInMinutes": hh * 60,
            "startTimeInEpoch": _ms(dia, hh), "clockInEpoch": ci, "clockOutEpoch": co,
            "serviceTypeName": "Standard Parcel"}


def _persona(mapa, nombre="Gonzalo Rua Pena"):
    return {"data": [{
        "driverName": nombre,
        "driverProviderId": "amzn1.flex.provider.v1.7c505a87",
        "driverPersonId": "A2GH1OM90XUWP1",
        "driverOperationalStatus": "ACTIVE",
        "driverEmail": "no@deberia.estar",
        "workPhoneNumber": "600000000",
        "reservationsMap": mapa}]}


HOY = "2026-09-15"
AHORA = _ms(HOY, 12, 0)   # las 12:00 del martes

# Lunes fichado entero (8h02), martes en curso (entro a las 09:00, ahora las 12:00),
# miercoles puesto y sin empezar.
ROSTER = _persona({
    "2026-09-14": [_res("2026-09-14", 9, 540, _ms("2026-09-14", 9), _ms("2026-09-14", 17, 2))],
    HOY: [_res(HOY, 9, 540, _ms(HOY, 9), None)],
    "2026-09-16": [_res("2026-09-16", 9, 540)],
    "2026-09-17": [], "2026-09-18": [], "2026-09-19": [], "2026-09-13": [],
})


def _leer(roster=ROSTER, hoy=HOY, ahora=AHORA):
    return LEER(roster, hoy, ahora)[0]


def test_la_hora_se_lee_de_los_minutos_desde_medianoche():
    """660 es las once de la manana, no las 660."""
    assert HM(660) == "11:00am"
    assert HM(720) == "12:00pm"
    assert HM(0) == "12:00am"
    assert HM(1275) == "9:15pm"
    assert HM(None) == ""


def test_lo_fichado_manda_sobre_lo_planificado():
    """Si entro y salio, vale lo que duro de verdad: 8h02, no las 9h puestas."""
    c = _leer()
    lunes = [b for b in c["bloques"] if b["dia"] == "2026-09-14"][0]
    assert lunes["minutos"] == 8 * 60 + 2, lunes
    assert lunes["en_curso"] is False


def test_el_que_esta_en_ruta_ahora_cuenta_lo_que_lleva_NO_lo_planificado():
    """Es el fallo del 19-09: el bloque en curso se sumaba por sus 9 h
    planificadas y salian «ya pasados» quienes no lo estaban. Solo se afirma lo
    que lleva desde que entro (3 h), y el resto es proyeccion."""
    c = _leer()
    hoy = [b for b in c["bloques"] if b["dia"] == HOY][0]
    assert hoy["en_curso"] is True
    assert hoy["minutos"] == 180, hoy
    assert hoy["fin"] == "", "le pone hora de fin a alguien que sigue en ruta"
    assert c["trabajado"] == 8 * 60 + 2 + 180
    assert c["en_curso_min"] == 180
    # Y lo que le falta hasta lo planificado (6 h) va a lo pendiente, no a lo hecho.
    assert c["planificado_restante"] == 360 + 540


def test_lo_que_aun_no_ha_empezado_NO_cuenta_como_trabajado():
    """Meter los dias futuros en el total es lo que hace que alguien que no ha
    empezado la semana parezca que la lleva hecha."""
    c = _leer()
    assert not [b for b in c["bloques"] if b["dia"] > HOY]
    assert c["bloques_restantes"] == 1
    assert c["proyeccion"] == (8 * 60 + 2) + 540 + 540


def test_ningun_bloque_es_estimado_salvo_los_sin_salida():
    """Es lo que quita de golpe los avisos falsos de jornadas de 18 horas: el
    dato lo da Amazon, no lo repartimos nosotros."""
    for b in _leer()["bloques"]:
        assert b["estimado"] is False


def test_el_bloque_en_curso_de_9_horas_no_hace_pasar_a_nadie_de_55():
    """El caso de Gabriel Miragaya (OGA5/DGA1, 19-09): cinco bloques cerrados
    que suman 50h57 y uno en curso planificado a 9 h. Antes: 59h57 y «ya
    pasado». Ahora: 50h57 + lo que lleva."""
    cerrados = [663, 642, 719, 494, 539]
    mapa = {}
    for i, m in enumerate(cerrados):
        dia = "2026-09-%02d" % (13 + i)
        mapa[dia] = [_res(dia, 9, 540, _ms(dia, 9), _ms(dia, 9) + m * MIN)]
    hoy = "2026-09-18"
    mapa[hoy] = [_res(hoy, 9, 540, _ms(hoy, 9), None)]
    c = LEER(_persona(mapa), hoy, _ms(hoy, 10, 0))[0]
    assert sum(cerrados) == 3057
    assert c["trabajado_cerrado"] == 3057
    assert c["trabajado"] == 3057 + 60
    assert c["trabajado"] <= 3300, "es un falso positivo: aun no se ha pasado"
    # Lo que SI puede pasar es una proyeccion, y se dice como tal.
    assert c["proyeccion"] == 3057 + 540


def test_un_dia_pasado_sin_entrada_no_es_pendiente():
    """6 personas de OGA5 tenian mas de un dia «pendiente» el ultimo dia de la
    semana. Un dia que ya paso sin fichar no va a venir: no es trabajo por
    hacer, y contarlo hinchaba la proyeccion."""
    mapa = {
        "2026-09-13": [_res("2026-09-13")],      # paso y no ficho
        "2026-09-14": [_res("2026-09-14")],      # paso y no ficho
        "2026-09-16": [_res("2026-09-16")],      # este si esta por venir
    }
    c = _leer(_persona(mapa))
    assert c["bloques_restantes"] == 1
    assert c["planificado_restante"] == 540
    assert c["sin_fichar_n"] == 2
    assert c["proyeccion"] == 540


def test_entrada_sin_salida_en_un_dia_pasado_no_se_afirma():
    """Trabajo hubo, pero no sabemos cuanto duro. No entra en lo hecho ni puede
    acusar de una jornada larga: se cuenta aparte y se dice."""
    mapa = {"2026-09-14": [_res("2026-09-14", 9, 540, _ms("2026-09-14", 9), None)]}
    c = _leer(_persona(mapa))
    assert c["trabajado"] == 0
    assert c["sin_salida_min"] == 540 and c["sin_salida_n"] == 1
    b = c["bloques"][0]
    assert b["sin_salida"] is True and b["estimado"] is True and b["en_curso"] is False
    # Cuenta en la proyeccion (por lo planificado), no en lo hecho.
    assert c["proyeccion"] == 540


def test_lo_pendiente_de_hoy_solo_hasta_que_pase_su_hora():
    """Un bloque de hoy sin fichar cuya ventana ya termino no se va a hacer."""
    mapa = {HOY: [_res(HOY, 5, 300)]}          # 05:00-10:00, ahora son las 12:00
    c = _leer(_persona(mapa))
    assert c["planificado_restante"] == 0 and c["sin_fichar_n"] == 1
    mapa = {HOY: [_res(HOY, 13, 300)]}         # 13:00-18:00, aun por venir
    c = _leer(_persona(mapa))
    assert c["planificado_restante"] == 300 and c["bloques_restantes"] == 1


def test_una_reserva_cancelada_no_se_va_a_trabajar():
    mapa = {"2026-09-16": [_res("2026-09-16", st="CANCELLED")]}
    c = _leer(_persona(mapa))
    assert c["planificado_restante"] == 0 and c["bloques_restantes"] == 0


def test_se_clasifica_con_el_hoy_de_AHORA_no_con_el_de_la_captura():
    """Las reservas se guardan crudas y se interpretan al leer: el miercoles
    puesto y sin empezar de hace tres dias ya no esta por venir."""
    c = _leer()
    reservas = c["reservas"]
    con_captura = CLASIFICAR(reservas, HOY, AHORA, AHORA)
    tres_dias_despues = CLASIFICAR(reservas, "2026-09-18", AHORA, _ms("2026-09-18", 12))
    assert con_captura["planificado_restante"] > 0
    assert tres_dias_despues["planificado_restante"] == 0, (
        "un dia pasado sin fichar se sigue contando como pendiente")
    # Lo fichado no cambia: son hechos.
    assert tres_dias_despues["trabajado_cerrado"] == con_captura["trabajado_cerrado"]


def test_documento_de_antes_solo_recupera_lo_fichado():
    """Los guardados con el formato anterior no traen las reservas. Se recupera
    lo que ya estaba fichado y NADA se inventa de lo que faltaba."""
    viejos = [{"dia": "2026-09-14", "minutos": 482, "en_curso": False},
              {"dia": HOY, "minutos": 540, "en_curso": True}]
    cl = CLASIFICAR(DE_BLOQUES(viejos, AHORA), HOY, AHORA, AHORA)
    assert cl["trabajado_cerrado"] == 482
    assert cl["trabajado"] == 482, "el bloque en curso viejo no dice cuanto lleva"
    assert cl["planificado_restante"] == 540


def test_no_se_copia_lo_que_amazon_marca_confidencial():
    """La respuesta trae `confidentialFields`: telefono, correo y nombre. El
    nombre se guarda —hace falta para hablar con esa persona y ya salia en la
    pantalla de antes—, pero el correo y el telefono no se copian: no hacen
    falta para contar horas, y el telefono bueno no es ese (gotcha 66)."""
    c = _leer()
    crudo = str(c)
    assert "no@deberia.estar" not in crudo, "se ha copiado el correo"
    assert "600000000" not in crudo, "se ha copiado el telefono"
    assert c["nombre"] == "Gonzalo Rua Pena"


def test_se_guarda_el_id_de_amazon_de_la_persona():
    """`driverPersonId` (A2...) es el Transporter ID con el nombre que Amazon le
    da: la fuente contra la que se comprueban las fichas. `driverProviderId` es
    otra cosa y NO es el que se pega en Cortex."""
    c = _leer()
    assert c["transporter_id"] == "A2GH1OM90XUWP1"
    assert c["driver_id"].startswith("amzn1.flex.provider")


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


def test_la_pantalla_clasifica_al_leer_y_dice_cuanto_hace_del_dato():
    """Sin la edad del dato, uno de hace medio dia se lee como el de ahora."""
    src = _fuente("whc_semana")
    assert "_whc_clasificar(" in src, "no se vuelve a clasificar con el hoy de ahora"
    assert '"antiguedad_min"' in src and '"de_otro_dia"' in src
    assert '"posible_pasado"' in src
    # Las proyecciones no se dan sobre un documento al que le falta lo pendiente.
    assert "formato_antiguo" in src


def test_el_estado_de_las_naves_mira_lo_que_entra_de_cortex():
    """OGA5 salia «sin plan nunca» teniendo 96 conductores de Cortex, porque solo
    se miraba el plan PEGADO a mano."""
    src = _fuente("whc_estado")
    assert "_WHC_API_COL" in src and "whc_planes" in src
