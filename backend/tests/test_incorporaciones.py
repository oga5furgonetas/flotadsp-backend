# -*- coding: utf-8 -*-
"""Incorporaciones: leer el listado de la ETT y escribirle a quien le falta algo.

Se ejecuta el codigo REAL de `server.py` sacado con `ast` (gotcha 40): una copia
deja de probar lo que corre en cuanto alguien toca el original.
"""
import ast
import io
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
_TEXTO = io.open(RAIZ / "server.py", encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)


def _fuente(nombre):
    """El codigo REAL de una funcion, para comprobar COMO esta escrita cuando lo
    que importa no es lo que devuelve sino por donde pasa (gotcha 40)."""
    for n in ast.walk(_ARBOL):
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == nombre:
            return chr(10).join(_TEXTO.splitlines()[n.lineno - 1:n.end_lineno])
    raise AssertionError("no existe %s en server.py" % nombre)


def _cargar(*nombres):
    amb = {"re": re}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in (
                "_ONB_TEL", "_ONB_CAB", "_ONB_PISTAS", "_ONB_FASES", "_ONB_ESTADOS"):
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
        if isinstance(n, ast.FunctionDef) and n.name in nombres:
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
    faltan = [x for x in nombres if x not in amb]
    assert not faltan, "no se han cargado: %s" % faltan
    return [amb[x] for x in nombres]


PARSEAR, CLAVE, NOMBRE, FASE, MOTIVO, TEL, COL, ESTADOS, PEND = _cargar(
    "_onb_parsear", "_onb_clave", "_onb_nombre_corto", "_onb_fase",
    "_onb_motivo_de_falta", "_onb_tel_limpio", "_onb_columna",
    "_onb_estados", "_onb_pendientes")

FICHA = """Anestiadi Goncear, Daniel N
GI GROUP  AMZL OGA5 SANTIAGO XPT DNI 55349655V  \u00b7  IDPER 25287  \u00b7   Registrado 04/09/2026 18:28 W36
 698 13 05 59
Contactado \u00b7 Interesado
Email winiw
dananegon@winiw.es
Contrase\u00f1a Email
QN@5P8baLWe@
Contrase\u00f1a Rabbit
WINIW1234
Doc. faltante
SEGURIDAD SOCIAL ALTA
"""


def test_lee_la_ficha_entera():
    f = PARSEAR(FICHA)[0]
    assert f["nombre"] == "Anestiadi Goncear, Daniel"
    assert f["telefono"] == "698130559"
    assert f["dni"] == "55349655V"
    assert f["idper"] == "25287"
    assert f["ett"] == "GI GROUP"
    assert f["centro"] == "OGA5"
    assert f["falta_texto"] == "SEGURIDAD SOCIAL ALTA"


def test_el_saludo_usa_el_nombre_de_pila_no_el_apellido():
    """El listado viene «Apellidos, Nombre». Sin esto el mensaje empieza por
    «Hola Anestiadi», que se lee como un correo automatico."""
    assert NOMBRE("Anestiadi Goncear, Daniel") == "Daniel"
    assert NOMBRE("Castillo Ortiz, Duvan Esteban") == "Duvan"


def test_completo_y_la_raya_significan_que_no_falta_nada():
    """Una raya tomada por un documento pendiente hace que se le escriba a
    alguien para pedirle un papel que no debe (gotcha 33)."""
    for v in ("Completo", "\u2014", "-", " "):
        f = PARSEAR(FICHA.replace("SEGURIDAD SOCIAL ALTA", v))[0]
        assert f["falta_texto"] == "", v


def test_la_misma_persona_dos_veces_es_la_misma_clave():
    """El listado se pega entero cada dia: sin una clave estable saldrian dos
    fichas de la misma persona y el trabajo se partiria en dos (gotcha 15)."""
    a = PARSEAR(FICHA)[0]
    b = PARSEAR(FICHA.replace("698 13 05 59", "600 00 00 00"))[0]
    assert CLAVE(a) == CLAVE(b), "cambiar el telefono crea una persona nueva"


def test_sin_dni_la_clave_cae_en_el_telefono():
    f = dict(PARSEAR(FICHA)[0], dni="")
    assert CLAVE(f) == "tel:698130559"


def test_el_telefono_se_guarda_sin_prefijo_y_sin_espacios():
    """`enlace_wa` es quien pone el +34 (gotcha 47)."""
    assert TEL("+34 698 13 05 59") == "698130559"
    assert TEL("698-13-05-59") == "698130559"


def test_lo_que_dice_la_ett_se_traduce_a_un_motivo_nuestro():
    assert MOTIVO("SEGURIDAD SOCIAL ALTA") == "ss"
    assert MOTIVO("Falta carnet de conducir") == "carnet"
    # Y lo que no se reconoce NO se adivina: colgarle un motivo que no es haria
    # que se le mandara el mensaje equivocado.
    assert MOTIVO("PENDIENTE DE REVISION INTERNA") == ""
    assert MOTIVO("") == ""


def test_la_fase_la_marca_el_papel_mas_atrasado():
    """Con tres papeles a la vez, el que manda es el que peor esta.

    Alguien con el carnet en revision y la Seguridad Social sin pedir TIENE
    trabajo pendiente: ponerle en «en revision» lo sacaria de la lista de lo que
    hay que hacer hoy, y ese es justo el que se queda sin llamar.
    """
    assert FASE({"triaje": "completo"}) == "listo"
    assert FASE({"estados": {"carnet": "falta"}}) == "por_pedir"
    assert FASE({"estados": {"carnet": "pedido"}}) == "esperando"
    assert FASE({"estados": {"carnet": "revision"}}) == "revision"
    assert FASE({"estados": {"carnet": "ok", "ss": "ok"}}) == "listo"
    # El mas atrasado manda, venga en el orden que venga.
    assert FASE({"estados": {"carnet": "revision", "ss": "falta"}}) == "por_pedir"
    assert FASE({"estados": {"carnet": "ok", "ss": "pedido"}}) == "esperando"
    # Y sin nada marcado NO esta listo: esta sin revisar, que es trabajo por
    # hacer. Darlo por bueno lo sacaria de la pantalla en silencio.
    assert FASE({}) == "por_pedir"


def test_lo_que_esta_en_revision_no_se_le_vuelve_a_pedir():
    """Ya lo mando. Repetirle el mensaje es lo que hace que deje de contestar."""
    p = {"estados": {"carnet": "revision", "ss": "falta", "banco": "pedido", "dni": "ok"}}
    assert sorted(PEND(p)) == ["banco", "ss"]


def test_lo_marcado_antes_no_se_pierde_al_cambiar_a_estados_por_papel():
    """Sin esta traduccion, el dia del cambio los 26 volverian al monton de
    entrada y habria que revisarlos otra vez uno a uno."""
    assert ESTADOS({"motivos": ["carnet", "ss"]}) == {"carnet": "falta", "ss": "falta"}
    # Y lo que dice la ETT coloca sola a la persona, sin tocar nada.
    assert ESTADOS({"falta_texto": "SEGURIDAD SOCIAL ALTA"}) == {"ss": "falta"}
    # Lo guardado a mano manda sobre lo deducido.
    assert ESTADOS({"estados": {"carnet": "ok"}, "motivos": ["ss"]}) == {"carnet": "ok"}
    # Un estado que no es de los nuestros se cae: guardarlo dejaria a esa
    # persona en un punto que ninguna pantalla sabe pintar.
    assert ESTADOS({"estados": {"carnet": "inventado"}}) == {}


def test_la_cuenta_de_onboarding_se_lee_para_poder_revisarla():
    f = PARSEAR(FICHA)[0]
    assert f["email"] == "dananegon@winiw.es"
    assert f["clave_email"] == "QN@5P8baLWe@"


def test_la_cuenta_NUNCA_viaja_en_el_mensaje_que_se_le_manda():
    """La contrasena se guarda para que la oficina entre a revisar el
    expediente, y para nada mas. El WhatsApp sale del PC de la oficina y acaba
    en un telefono: una credencial ahi ya no se puede recoger.

    Se lee el codigo de `_onb_mensaje`, que es quien arma el texto.
    """
    src = None
    for n in _ARBOL.body:
        if isinstance(n, ast.AsyncFunctionDef) and n.name == "_onb_mensaje":
            src = chr(10).join(_TEXTO.splitlines()[n.lineno - 1:n.end_lineno])
    assert src, "no existe _onb_mensaje"
    for prohibido in ("clave_email", "clave_rabbit", '"email"', "codigo_formacion"):
        assert prohibido not in src, (
            "la cuenta de onboarding se estaria mandando por WhatsApp: %s" % prohibido)


def test_al_marcar_que_le_falta_sale_de_pendiente_y_va_a_su_columna():
    """Es lo que da el orden: el monton de entrada se vacia segun se revisa."""
    assert COL({}) == "pendiente"
    assert COL({"estados": {"carnet": "falta"}}) == "carnet"
    assert COL({"triaje": "completo", "estados": {"carnet": "falta"}}) == "completo"
    # Lo que ya mando va a su propia columna, no a la de «te falta»: es otra
    # cosa que hacer —mirarlo— y confundirlas es volver a pedir lo que ya esta.
    assert COL({"estados": {"carnet": "revision"}}) == "revision"
    # Con varios manda el mas atrasado.
    assert COL({"estados": {"carnet": "revision", "ss": "falta"}}) == "ss"


def test_lo_que_ya_dice_la_ett_coloca_a_la_persona_sin_tocar_nada():
    """Los cinco de «SEGURIDAD SOCIAL ALTA» no tienen que pasar por pendiente:
    el listado ya lo ha dicho, y hacerlos revisar de nuevo es trabajo repetido."""
    assert COL({"falta_texto": "SEGURIDAD SOCIAL ALTA"}) == "ss"
    # Pero un texto que no reconocemos NO se adivina: se queda en pendiente,
    # que es donde alguien lo va a mirar.
    assert COL({"falta_texto": "PENDIENTE REVISION INTERNA"}) == "pendiente"


def test_sin_nada_marcado_no_es_lo_mismo_que_completo():
    """La distincion entera del monton de entrada. Si «vacio» valiera como
    «completo», los que nadie ha mirado desapareceria de la pantalla."""
    assert COL({"estados": {}, "falta_texto": ""}) == "pendiente"
    assert COL({"estados": {}, "falta_texto": "", "triaje": "completo"}) == "completo"


# ── LOS CANDIDATOS QUE ENTRAN SOLOS ─────────────────────────────────────────

def test_lo_que_entra_solo_lo_lee_EL_MISMO_lector_probado():
    """La extension manda el MISMO texto que se pegaba a mano.

    Es lo que hace segura esta puerta: no hay un lector nuevo del DOM que pueda
    equivocarse: entra por `_onb_parsear`, que esta escrito contra el listado
    real y probado con las 26 fichas de verdad. Escribir un lector del HTML
    seria inventarse una estructura no vista, que es el fallo que costo veinte
    versiones con las direcciones de Cortex (gotcha 64).
    """
    src = _fuente("cortex_ingest_informe")
    assert 'elif tipo == "candidatos":' in src
    i = src.index('elif tipo == "candidatos":')
    trozo = src[i:i + 1800]
    assert "_onb_parsear(texto)" in trozo, "se ha escrito otro lector"
    # Se guarda por la funcion comun, que es la que usa la clave estable.
    assert "_onb_guardar_listado(filas" in trozo, "la extension guarda por su cuenta"
    assert "_onb_clave(p)" in _fuente("_onb_guardar_listado"), (
        "sin clave estable se duplican las fichas")


def test_lo_que_entra_solo_no_pisa_lo_que_marca_la_oficina():
    """El listado no sabe nada de los estados que se marcan a mano. Si los
    pisara, cada vez que entrara el listado se borraria el trabajo del dia."""
    # Las dos puertas guardan por `_onb_guardar_listado`: se mira ahi.
    trozo = _fuente("_onb_guardar_listado")
    j = trozo.index("$setOnInsert")
    assert '"motivos": []' in trozo[j:j + 260] and '"nota": ""' in trozo[j:j + 260], (
        "motivos y nota tienen que ir en $setOnInsert, no en $set")
    k = trozo.index("$set")
    assert '"motivos"' not in trozo[k:j], "el listado estaria pisando lo marcado a mano"


def test_las_contrasenas_siguen_sin_guardarse_aunque_entre_solo():
    """Que el texto llegue sin que nadie lo pegue no cambia quien decide que se
    queda: el filtro esta en el lector, y el lector no las toca."""
    r = PARSEAR(FICHA)[0]
    assert "clave_email" in r and r["clave_email"] == "QN@5P8baLWe@"
    # OJO: la cuenta SI se guarda a proposito (Dani entra a revisarla). Lo que
    # no puede pasar es que salga de ahi: eso lo vigila el caso del CSV y el
    # del WhatsApp.


# ── LA NOTA INTERNA NO PUEDE REPETIR LO QUE YA DICE EL MENSAJE ──────────────
#
# Visto el 15-09-2026 en produccion, en el mensaje real que iba a salir para
# Luisaly (22 dias esperando):
#
#   «Para poder seguir nos falta: 1) te falta terminar la formacion online;
#    2) falta formacion.»
#
# Lo mismo dos veces, y la segunda con la palabra tal cual la apunto quien
# rellenó la ficha. Eso se le manda a una persona, y encima multiplicado por los
# 17 de la tanda.
#
# Pero la nota TAMBIEN puede aportar de verdad, asi que no se tira a ciegas.

def _cargar_nota():
    import ast as _ast
    import io as _io
    import re as _re
    import unicodedata as _ud
    from pathlib import Path as _P
    raiz = _P(__file__).resolve().parent.parent
    txt = _io.open(raiz / "server.py", encoding="utf-8-sig").read()
    arb = _ast.parse(txt)
    amb = {"re": _re, "unicodedata": _ud}
    for n in arb.body:
        if isinstance(n, _ast.Assign) and getattr(n.targets[0], "id", "") == "_ONB_RELLENO":
            amb["_ONB_RELLENO"] = _ast.literal_eval(n.value)
        if isinstance(n, _ast.FunctionDef) and n.name in ("_onb_palabras", "_onb_nota_util"):
            exec(compile(_ast.fix_missing_locations(_ast.Module(body=[n], type_ignores=[])),  # noqa: S102
                         "<server>", "exec"), amb)
    return amb["_onb_nota_util"]


_PLANTILLA = {"motivos": {
    "formacion": {"texto": "te falta terminar la formación online"},
    "carnet": {"texto": "la foto de tu CARNET DE CONDUCIR está mal"},
}}


def test_la_nota_que_repite_el_motivo_no_se_manda():
    util = _cargar_nota()
    assert util("falta formacion", ["formacion"], _PLANTILLA) == ""
    assert util("FALTA FORMACIÓN", ["formacion"], _PLANTILLA) == ""
    assert util("le falta el carnet", ["carnet"], _PLANTILLA) == ""


def test_la_nota_que_aporta_algo_si_se_manda():
    """Tirarla siempre seria perder informacion de verdad."""
    util = _cargar_nota()
    for nota in ("vive en Vigo, llamar por la tarde",
                 "no contesta al telefono, probar por la manana",
                 "empieza el lunes"):
        assert util(nota, ["formacion"], _PLANTILLA) == nota, nota


def test_sin_nota_no_se_inventa_nada():
    util = _cargar_nota()
    assert util("", ["formacion"], _PLANTILLA) == ""
    assert util(None, ["formacion"], _PLANTILLA) == ""


def test_una_nota_mixta_se_manda_entera():
    """Si parte repite y parte aporta, se manda: recortarla a medias diria algo
    distinto de lo que alguien escribio, y eso es peor que repetir."""
    util = _cargar_nota()
    nota = "falta formacion y ademas vive en Vigo"
    assert util(nota, ["formacion"], _PLANTILLA) == nota


def test_quien_no_esta_en_el_ultimo_listado_no_entra_en_las_tandas():
    """El listado que se pega es la verdad de AHORA.

    El 16-09-2026 Victor salia como «en incorporacion» porque su ficha era de
    dias antes: ya habia terminado la formacion y estaba trabajando. Mandarle
    «empieza la formacion» habria sido hablarle de un estado que ya no tiene, y
    delante de una persona eso resta credibilidad a todo lo demas.
    """
    import ast as _ast
    import io as _io
    from pathlib import Path as _P
    txt = _io.open(_P(__file__).resolve().parent.parent / "server.py", encoding="utf-8-sig").read()
    arb = _ast.parse(txt)
    def fuente(nombre):
        for n in _ast.walk(arb):
            if isinstance(n, (_ast.AsyncFunctionDef, _ast.FunctionDef)) and n.name == nombre:
                return chr(10).join(txt.splitlines()[n.lineno - 1:n.end_lineno])
        raise AssertionError(nombre)
    assert "incorporaciones_ultimo_listado" in fuente("onb_importar"), (
        "el listado no deja constancia de cuando se pego")
    src = fuente("onb_listar")
    assert "en_el_listado" in src, "la pantalla no puede saber quien sigue en el listado"
    assert "incorporaciones_ultimo_listado" in src
    # Y no se borra a nadie: el historial dice a quien se aviso y cuando.
    assert "delete_many" not in src and "delete_one" not in src


# ── LOS DOS CARRILES ────────────────────────────────────────────────────────
#
# El proceso NO es una fila. El 16-09-2026 la pantalla decia de Lois Barreiro
# «Coordinacion aun no ha dado sus papeles por completos» —cierto— mientras su
# cuenta de Amazon ya estaba al 11/14. Las dos cosas a la vez. En fila, la
# segunda no se veia.
#
# Y peor: de otros decia «Amazon aun no le ha creado la cuenta», que es una
# afirmacion que no podemos hacer. Lo unico cierto es que no la hemos visto —
# y con Lois era literalmente falsa, porque la tenia.

def _camino():
    import ast as _ast
    import io as _io
    from pathlib import Path as _P
    txt = _io.open(_P(__file__).resolve().parent.parent / "server.py", encoding="utf-8-sig").read()
    arb = _ast.parse(txt)
    amb = {}
    for n in arb.body:
        if isinstance(n, _ast.FunctionDef) and n.name == "_onb_camino":
            exec(compile(_ast.fix_missing_locations(_ast.Module(body=[n], type_ignores=[])),  # noqa: S102
                         "<server>", "exec"), amb)
    return amb["_onb_camino"]


def test_sin_cuenta_vista_no_se_dice_que_no_la_tiene():
    """Lo unico cierto es que no la hemos visto. Con Lois, decir que no la
    tenia era FALSO: la tenia al 11/14, en otra Service Area."""
    r = _camino()({"registrado": "2026-09-15"}, None)
    assert "no la hemos visto" in r["que_toca"]
    assert r["amazon"]["vista"] is False


def test_los_dos_carriles_se_cuentan_a_la_vez():
    """El caso de Lois: papeles sin cerrar Y cuenta al 11/14."""
    r = _camino()({"registrado": "2026-09-15"},
                  {"hechas": 11, "total": 14, "completa": False,
                   "toca_a": ["la persona"], "pendientes": [{"que": "La sesión de formación"}]})
    assert "papeles" in r["que_toca"], r["que_toca"]
    assert "la persona" in r["que_toca"], "no dice que en Amazon le toca a el"
    assert r["amazon"]["vista"] is True and r["amazon"]["hechas"] == 11


def test_cuando_todo_lo_de_amazon_es_de_amazon_lo_dice():
    """Si lo que falta no depende de nadie nuestro, no hay a quien llamar."""
    r = _camino()({"registrado": "2026-09-15", "codigo_formacion": "A",
                   "visto_en": "2026-09-16T10:00:00", "ultimo_aviso": "2026-09-16T11:00:00"},
                  {"hechas": 13, "total": 14, "completa": False, "toca_a": ["Amazon"],
                   "pendientes": [{"que": "Global Check"}]})
    assert r["que_toca"] == "En Amazon le toca a Amazon"


def test_listo_solo_cuando_no_falta_nada_de_nada():
    r = _camino()({"registrado": "2026-09-15", "codigo_formacion": "A",
                   "visto_en": "2026-09-16T10:00:00", "ultimo_aviso": "2026-09-16T11:00:00"},
                  {"hechas": 14, "total": 14, "completa": True, "toca_a": []})
    assert r["que_toca"] == "Listo para empezar" and r["siguiente"] is None


def test_quien_ya_no_esta_en_formacion_no_tiene_siguiente_paso():
    """«Mandale el acceso» de alguien que ya termino y esta en ruta es mandar a
    Dani a hacer algo que no toca. Paso el 16-09-2026 con Victor."""
    r = _camino()({"registrado": "2026-09-04", "codigo_formacion": "ABC",
                   "visto_en": "2026-09-10T10:00:00"}, None, False)
    assert r["siguiente"] is None and r["fuera"] is True
    assert "formaci" in r["que_toca"]


def test_no_estar_en_el_listado_sin_codigo_no_significa_nada():
    """El listado que se pega es el de «En incorporacion», no el de todos.
    Tratar toda ausencia como «ya no esta» dio por idas a DIECISEIS personas."""
    r = _camino()({"registrado": "2026-09-04"}, None, False)
    assert not r.get("fuera")


FICHA_FORMACION = """Rodriguez Gonzalez, Jonatan N
ATELODIS  AMZL OGA5 SANTIAGO XPT DNI 44092698L  \u00b7  IDPER 25345  \u00b7   Registrado 14/09/2026 15:34 W38
 613 14 19 66
Pulsa para llamar
 En incorporaci\u00f3n
Email winiw
jonrodgon@winiw.es
Fecha formaci\u00f3n
10/09/2026
Link formaci\u00f3n
\u2014
C\u00f3digo Test Formaci\u00f3n
FV2TMB43LD5AD0ZA
Fecha incorporaci\u00f3n
\u2014
Doc. faltantes
 Completo
Completado por
PROME \u00b7 10/09/2026
"""


def test_lee_el_dia_de_formacion_y_quien_dio_los_papeles():
    """Sin el dia, la pantalla no podia decir que a Jonatan se le paso el 10/09
    sin mandarle el acceso (16-09-2026)."""
    f = PARSEAR(FICHA_FORMACION)[0]
    assert f["fecha_formacion"] == "2026-09-10"
    assert f["papeles_por"] == "PROME"
    assert f["papeles_en"] == "2026-09-10"
    assert f["codigo_formacion"] == "FV2TMB43LD5AD0ZA"
    assert f["falta_texto"] == ""
    # Sin esos bloques no se inventa nada.
    g = PARSEAR(FICHA)[0]
    assert g["fecha_formacion"] == "" and g["papeles_por"] == ""


def test_un_hueco_del_listado_no_borra_un_dato_bueno():
    """Una ficha plegada no trae «Datos de incorporacion»: guardar esos vacios
    borraria el codigo de formacion y el correo."""
    amb = {}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_ONB_NO_PISAR_CON_VACIO":
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
    campos = amb["_ONB_NO_PISAR_CON_VACIO"]
    for k in ("codigo_formacion", "email", "clave_email", "fecha_formacion", "telefono"):
        assert k in campos, k
    # «Completo» deja falta_texto vacio y ESO si hay que guardarlo.
    assert "falta_texto" not in campos
    # Y las dos puertas (pegar a mano y la extension) pasan por el mismo sitio.
    assert "_onb_guardar_listado" in _fuente("onb_importar")
    assert "_onb_guardar_listado(filas" in _TEXTO.split("elif tipo == \"candidatos\":")[1][:1500]


def test_dice_cuanto_hace_que_tocaba_la_formacion():
    from datetime import date, datetime, timedelta, timezone
    amb = {"datetime": datetime, "timezone": timezone, "date_cls": date}
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name == "_onb_cuando_formacion":
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
    f = amb["_onb_cuando_formacion"]
    hoy = datetime.now(timezone.utc).date()
    assert f({"fecha_formacion": (hoy - timedelta(days=6)).isoformat()}).endswith("hace 6 d\u00edas")
    assert "ayer" in f({"fecha_formacion": (hoy - timedelta(days=1)).isoformat()})
    assert f({"fecha_formacion": hoy.isoformat()}) == ": la tiene hoy"
    assert f({}) == "" and f({"fecha_formacion": "basura"}) == ""
