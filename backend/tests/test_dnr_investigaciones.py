# -*- coding: utf-8 -*-
"""Contestar una investigacion de DNR: el codigo tiene que salir EXACTO.

QUE ES. Cuando un cliente dice que no recibio su paquete, Amazon abre una
investigacion y el DSP tiene que contestar donde se entrego. La respuesta viaja
como un bloque de texto que genera el JavaScript de la propia pagina:

    `---###START###---${btoa(String.fromCharCode(...new TextEncoder()
       .encode(JSON.stringify({version:1, data}))))}---###END###---`

O sea base64 del JSON en UTF-8. Reproducirlo tiene tres trampas, y las tres
hacen que Amazon rechace el bloque ENTERO **sin decir por que**:

  · los separadores. `json.dumps` de Python mete espacios (`", "`, `": "`) y
    `JSON.stringify` no. Un espacio de mas y el base64 es otro;
  · los acentos. `ensure_ascii=True` los escapa (`\\u00f3`) y JavaScript no;
  · el ORDEN de las claves. Van como las recorre el script de Amazon, que es el
    orden del DOM: tracking, order, marketplace, case_datetime y luego los
    cuatro desplegables y los dos textos.

Verificado el 14-09-2026 contra la misma expresion ejecutada en Node con las 27
filas del fichero real de OGA5: byte a byte identico. Aqui se congela ese
resultado para que siga siendolo.

Y una cuarta: **una opcion que no este en el catalogo de Amazon** tumba la
respuesta igual. El catalogo se saca de las constantes de la propia pagina, no
se teclea.
"""
import ast
import base64
import io
import json
import re
from pathlib import Path
from urllib.parse import quote as _url_quote, unquote_plus

RAIZ = Path(__file__).resolve().parent.parent
SERVER = RAIZ / "server.py"
_TEXTO = io.open(SERVER, encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)


def _fuente(nombre):
    for n in ast.walk(_ARBOL):
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == nombre:
            return chr(10).join(_TEXTO.splitlines()[n.lineno - 1:n.end_lineno])
    raise AssertionError("no existe %s en server.py" % nombre)


def _constante(nombre):
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == nombre:
            return ast.literal_eval(n.value)
    raise AssertionError("no existe %s en server.py" % nombre)


def _cargar(*nombres):
    """Las funciones REALES sacadas del fichero (gotcha 40).

    Una copia deja de probar el codigo que corre en cuanto alguien toca el
    original, que es justo lo que este modulo no se puede permitir: el bloque
    lo rechaza Amazon entero y sin decir por que.
    """
    amb = {"json": json, "base64": base64, "quote": _url_quote,
           "_url_quote": _url_quote, "_centro_norm": lambda c: (c or "").strip().upper(),
           "_DNR_CAMPOS": _constante("_DNR_CAMPOS"),
           "_DNR_CORREO": _constante("_DNR_CORREO")}
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name in nombres:
            exec(compile(ast.fix_missing_locations(ast.Module(body=[n], type_ignores=[])),  # noqa: S102
                         "<server>", "exec"), amb)
    faltan = [x for x in nombres if x not in amb]
    assert not faltan, "no se han cargado: %s" % faltan
    return [amb[x] for x in nombres]


CODIGO, CORREO = _cargar("_dnr_codigo", "_dnr_correo")


def _cargar_sugerencia():
    """`_dnr_sugerencia` con el catalogo REAL detras (gotcha 40).

    Se le da el `_dnr_opciones` de verdad —el JSON que se saco ejecutando las
    constantes de la pagina de Amazon—, no una copia: la gracia de la funcion es
    que se niega a proponer algo que ya no este ahi.
    """
    amb = {"_DNR_DEL_ESCANEO": _constante("_DNR_DEL_ESCANEO"),
           "_DNR_ESCANEO_EN_CRISTIANO": _constante("_DNR_ESCANEO_EN_CRISTIANO"),
           "_dnr_opciones": lambda: json.load(
               io.open(RAIZ / "datos" / "dnr_opciones.json", encoding="utf-8"))}
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name in ("_dnr_sugerencia", "_dnr_marcaste"):
            exec(compile(ast.fix_missing_locations(  # noqa: S102
                ast.Module(body=[n], type_ignores=[])), "<server>", "exec"), amb)
    assert "_dnr_sugerencia" in amb
    return amb["_dnr_sugerencia"]


SUG = _cargar_sugerencia()

# Una fila con acentos a proposito: es donde se rompe `ensure_ascii`.
FILA = {
    "tracking_id": "ES2614977975", "order_id": "407-7233454-9709118",
    "marketplace_id": "A1RKKUPIHCS9HS", "case_datetime": "2026-09-14 15:58:38.392692",
    "completion": "SAFE_PLACE", "location": "GARDEN", "additional": "DOORMAT",
    "property": "HOUSE", "building_number": "14", "building_floor": "",
}


def _decodificar(bloque):
    b64 = bloque.split("---###START###---")[1].split("---###END###---")[0]
    return json.loads(base64.b64decode(b64).decode("utf-8"))


def test_el_bloque_lleva_las_marcas_que_espera_amazon():
    """Sin los delimitadores exactos, el correo entra y no lo lee nadie."""
    b = CODIGO([FILA])
    assert "---###START###---" in b and "---###END###---" in b


def test_el_json_va_sin_espacios_y_con_los_acentos_tal_cual():
    """Las dos diferencias entre `json.dumps` y `JSON.stringify`.

    Se comprueba sobre el base64 DECODIFICADO, que es lo que de verdad viaja.
    """
    b64 = CODIGO([FILA]).split("---###START###---")[1].split("---###END###---")[0]
    crudo = base64.b64decode(b64).decode("utf-8")
    assert '", "' not in crudo and '": "' not in crudo, "sobran espacios: el base64 sale distinto"
    # Con un valor acentuado, tiene que ir el caracter, no su escape.
    con_tilde = dict(FILA, building_number="Portal 3º")
    crudo2 = base64.b64decode(
        CODIGO([con_tilde]).split("---###START###---")[1].split("---###END###---")[0]).decode("utf-8")
    assert "3º" in crudo2 and "\\u00ba" not in crudo2, "los acentos van escapados"


def test_las_claves_van_en_el_orden_del_dom():
    """Es el orden en que las recorre el script de Amazon. No es cosmetico."""
    d = _decodificar(CODIGO([FILA]))
    assert list(d["data"][0].keys()) == _constante("_DNR_CAMPOS")


def test_la_version_es_1():
    assert _decodificar(CODIGO([FILA]))["version"] == 1


def test_varias_investigaciones_en_un_solo_correo():
    """Se contestan en tanda: un correo por paquete serian decenas al dia."""
    d = _decodificar(CODIGO([FILA, dict(FILA, tracking_id="ES2612519512")]))
    assert len(d["data"]) == 2
    assert d["data"][1]["tracking_id"] == "ES2612519512"


def test_un_hueco_sin_contestar_viaja_como_cadena_vacia():
    """La pagina manda `''` cuando no se elige nada, no `null` ni se salta la
    clave. Un `null` ahi cambia el JSON y con el, el base64."""
    d = _decodificar(CODIGO([dict(FILA, property="", building_floor="")]))
    assert d["data"][0]["property"] == "" and d["data"][0]["building_floor"] == ""


def test_el_catalogo_sale_de_la_pagina_y_no_de_la_cabeza_de_nadie():
    """Una opcion inventada la rechaza Amazon sin decir cual."""
    p = RAIZ / "datos" / "dnr_opciones.json"
    assert p.exists(), "falta backend/datos/dnr_opciones.json"
    o = json.load(io.open(p, encoding="utf-8"))
    assert set(o["completion"]) == {"CUSTOMER_HHM", "ALTERNATIVE", "SAFE_PLACE",
                                    "COMMERCIAL", "LOCKER", "PICKUP_POINT"}
    # Las que de verdad se usan aqui: dejarlo en un sitio seguro.
    assert "GARDEN" in o["location"]["SAFE_PLACE"]
    assert o["additional"]["SAFE_PLACE"]["DOORMAT"].lower().startswith("bajo el felpudo")
    assert "HOUSE" in o["property"]


def test_no_se_manda_una_opcion_que_no_este_en_el_catalogo():
    """Y se comprueba que la de segundo nivel CORRESPONDA a la primera: las de
    `SAFE_PLACE` no valen para `LOCKER`."""
    src = _fuente("dnr_responder")
    assert 'opciones.get("completion")' in src
    assert '(opciones.get("location") or {}).get(comp)' in src
    assert '(opciones.get("additional") or {}).get(comp)' in src


def test_la_app_prepara_el_correo_pero_no_lo_envia():
    """Declarar ante Amazon donde se dejo un paquete es una afirmacion sobre un
    hecho: la revisa y la manda una persona. Y abrir el correo no es haberlo
    enviado — se marca aparte, igual que con las ETT."""
    src = _fuente("dnr_responder")
    assert "_enviar_email" not in src and "smtp" not in src.lower()
    assert "mailto" in src or "_dnr_correo" in src
    marcar = _fuente("dnr_marcar_enviada")
    assert "contestada" in marcar


def test_el_contexto_dice_lo_que_no_sabe():
    """Un paquete de hace mas de dos semanas ya no esta en Cortex. Fingir que
    si lo esta es peor que decir que no se sabe (gotcha 33)."""
    src = _fuente("dnr_investigaciones")
    assert '"en_cortex": False' in src
    ctx = _fuente("_dnr_contexto")
    assert '"metros"' in ctx and "_dnr_metros" in ctx, (
        "sin la distancia entre el destino y el escaneo, la pantalla no dice nada util")


def test_el_enlace_del_correo_no_parte_el_bloque_por_la_almohadilla():
    """La trampa que costo un rato en produccion el 14-09-2026.

    El bloque lleva `---###START###---` dentro, y una `#` CRUDA en una URL es el
    separador de fragmento: el navegador corta ahi y el correo se abre con medio
    codigo. `quote` la escapa a `%23`, y entonces lo que se abre es el cuerpo
    entero. Se comprueba deshaciendo la codificacion, que es lo unico que
    demuestra que no se ha deformado nada por el camino.
    """
    c = CORREO("OGA5", [FILA])
    assert "%23%23%23START%23%23%23" in c["mailto"], "la # va cruda: cortaria el cuerpo"
    assert "---###START###---" not in c["mailto"]
    vuelta = unquote_plus(c["mailto"].split("&body=", 1)[1])
    assert vuelta == c["cuerpo"], "el cuerpo se deforma al meterlo en el enlace"


def test_el_correo_va_al_buzon_de_amazon_y_con_el_asunto_de_la_nave():
    """Un asunto distinto y la investigacion no se asocia a la nave."""
    c = CORREO("OGA5", [FILA])
    assert c["para"] == _constante("_DNR_CORREO")
    assert c["asunto"] == "TDSL-OGA5"
    # Y el texto de cabecera es el que pone la propia pagina, palabra por
    # palabra: cambiarlo seria mandarle a Amazon algo que no espera leer.
    assert c["cuerpo"].startswith("PLEASE DO NOT MODIFY OR ADD ANY DETAILS")


def test_la_que_ya_no_viene_en_el_informe_deja_de_salir_como_pendiente():
    """El fichero trae TODAS las abiertas: la que desaparece, Amazon la cerro.

    El 15-09-2026 Dani dijo «no se me contestaron las pre-dnrs» y al momento
    «nada, si que se contestaron». Justo eso: las contesta en el portal de
    Amazon, dejan de venir en el fichero, y aqui seguian saliendo como
    pendientes. El comentario del codigo YA decia que dejaban de salir; la
    lista `vistas` se llenaba y no se usaba en ninguna parte. Un comentario que
    afirma lo que el codigo no hace cierra la investigacion para el siguiente
    que mire (gotcha 64).
    """
    src = _fuente("cortex_ingest_informe")
    assert '"$nin": vistas' in src, (
        "las que ya no vienen en el informe no se cierran: la lista crece para "
        "siempre y se contestan casos que Amazon cerro hace semanas")
    # Y se cierra SOLO lo de esa nave: el fichero de OGA5 no dice nada de DGA1.
    i = src.index('"$nin": vistas')
    trozo = src[i - 400:i + 400]
    assert '"centro": centro' in trozo, "se cerrarian tambien las de las otras naves"


def test_cerrada_por_amazon_no_es_lo_mismo_que_contestada_por_nosotros():
    """Son dos hechos distintos y apuntarlos juntos falsea el historial.

    `contestada` significa que alguien de la oficina preparo la respuesta y le
    dio a enviar. Que Amazon la cierre por su cuenta no es eso: marcarlo como
    contestada seria apuntarnos un trabajo que no hicimos, y el dia que se
    revise por que bajo la scorecard ese apunte mentiria.
    """
    src = _fuente("cortex_ingest_informe")
    i = src.index('"$nin": vistas')
    cierre = src[i:i + 500]
    assert '"cerrada_en"' in cierre
    assert '"contestada": True' not in cierre, (
        "se estaria apuntando como contestada por nosotros algo que solo ha "
        "dejado de aparecer")
    # Y la lista de pendientes tiene que respetar ese cierre, o no sirve de nada.
    lista = _fuente("dnr_investigaciones")
    assert '"cerrada_en": {"$exists": False}' in lista, (
        "se cierran pero se siguen enseñando: el cierre no llega a la pantalla")


# ── LO QUE YA CONTESTA EL ESCANEO ───────────────────────────────

def test_el_escaneo_del_conductor_contesta_la_pregunta():
    """No es una suposicion: es lo que esa persona declaro al entregar, en el
    sistema de Amazon, en ese momento. Mejor prueba que preguntarle dos semanas
    despues si se acuerda."""
    casos = {
        "DELIVERED_TO_DOORSTEP": ("SAFE_PLACE", "FRONT_DOOR"),
        "DELIVERED_TO_GARDEN": ("SAFE_PLACE", "GARDEN"),
        "DELIVERED_TO_REAR_DOOR": ("SAFE_PLACE", "BACK_DOOR"),
        "DELIVERED_TO_MAIL_SLOT": ("SAFE_PLACE", "MAILBOX"),
        "DELIVERED_TO_HOUSEHOLD_MEMBER": ("CUSTOMER_HHM", "HHM"),
        "DELIVERED_TO_RECEPTIONIST": ("ALTERNATIVE", "RECEPTIONIST"),
    }
    for scan, (comp, loc) in casos.items():
        r = SUG({"scan": scan})
        assert r["completion"] == comp, scan
        assert r["location"] == loc, scan
        assert r["completa"] is True, scan


def test_los_dos_que_NO_dicen_el_sitio_no_se_dan_por_contestados():
    """«Un lugar seguro» y «un comercio» dicen el TIPO de entrega y no el sitio,
    que es exactamente lo que Amazon esta preguntando. Rellenarlos a ojo seria
    declarar un sitio que nadie ha dicho, y eso no se deshace."""
    for scan, comp in (("DELIVERED_TO_SAFE_LOCATION", "SAFE_PLACE"),
                       ("DELIVERED_TO_STORE", "COMMERCIAL")):
        r = SUG({"scan": scan})
        assert r["completion"] == comp
        assert r["location"] == ""
        assert r["completa"] is False, scan
        assert "conductor" in r["porque"]


def test_un_escaneo_que_no_conocemos_no_propone_nada():
    """Callarse es la respuesta correcta. Proponer algo para un escaneo que no
    sabemos leer es justo el falso positivo que tumba el bloque entero."""
    for scan in ("", "DELIVERED_TO_LO_QUE_SEA", "PICKED_UP", None):
        r = SUG({"scan": scan})
        assert r["completa"] is False
        assert "completion" not in r


def test_no_propone_nada_que_no_este_en_el_catalogo_de_amazon():
    """La tabla del escaneo se comprueba SIEMPRE contra el catalogo real. Si
    Amazon quita una opcion, esto tiene que dejar de proponerla: mandarla
    rechaza la tanda ENTERA y sin decir cual ha sido."""
    op = json.load(io.open(RAIZ / "datos" / "dnr_opciones.json", encoding="utf-8"))
    for scan in _constante("_DNR_DEL_ESCANEO"):
        r = SUG({"scan": scan})
        assert r["completion"] in op["completion"], scan
        if r.get("location"):
            assert r["location"] in op["location"][r["completion"]], scan


def test_el_tipo_de_edificio_se_deja_vacio_a_proposito():
    """El escaneo no lo dice en ningun caso. La pagina admite vacio, y un dato
    inventado ahi vale menos que nada: es una declaracion a Amazon."""
    r = SUG({"scan": "DELIVERED_TO_DOORSTEP"})
    assert r["property"] == "" and r["additional"] == ""


# ── LA COLUMNA «TIME LEFT» ────────────────────────────────────

def _parsear():
    """El parser REAL de server.py (gotcha 40)."""
    import datetime as _dt
    amb = {"re": re, "datetime": _dt.datetime, "timezone": _dt.timezone}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "").startswith("_DNR_"):
            try:
                exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
            except Exception:                                    # noqa: BLE001
                pass
        if isinstance(n, ast.FunctionDef) and n.name == "_dnr_inv_parsear":
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
    assert "_dnr_inv_parsear" in amb
    return amb["_dnr_inv_parsear"]


PARSEAR = _parsear()

# Las dos formas REALES que tiene la primera columna, copiadas del fichero del
# 15-09-2026. La viva lleva `data-epoch` y el texto VACIO: lo escribe un
# setInterval cada segundo, asi que en el HTML guardado no hay nada.
_VIVA = ('<tr data-dsp-action><td data-epoch="1757960000000"></td>'
         '<td>ES2614584379<input type="hidden" name="tracking_id" value="ES2614584379" />'
         '<input type="hidden" name="order_id" value="1-1" />'
         '<input type="hidden" name="marketplace_id" value="A1RKKUPIHCS9HS" />'
         '<input type="hidden" name="case_datetime" value="2026-09-15 10:23:00.000000" /></td>'
         '<td>2026-09-14 12:00:00</td><td>DELIVERED_TO_STORE</td></tr>')
_HECHA = ('<tr data-dsp-action><td>Response Received</td>'
          '<td>ES2613021732<input type="hidden" name="tracking_id" value="ES2613021732" />'
          '<input type="hidden" name="order_id" value="1-2" />'
          '<input type="hidden" name="marketplace_id" value="A1RKKUPIHCS9HS" />'
          '<input type="hidden" name="case_datetime" value="2026-09-13 10:00:00.000000" /></td>'
          '<td>2026-09-12 12:00:00</td><td>DELIVERED_TO_GARDEN</td></tr>')


def test_response_received_significa_que_amazon_YA_tiene_la_respuesta():
    """El informe trae TODAS, contestadas incluidas. El 15-09-2026 eran 27 de
    31 y la pantalla las daba por pendientes: veintitres horas de trabajo que no
    existia, y el riesgo de contestar dos veces la misma. Lo vio Dani, no yo.
    """
    a, b = PARSEAR(_HECHA + _VIVA), None
    hecha = [x for x in a if x["tracking_id"] == "ES2613021732"][0]
    viva = [x for x in a if x["tracking_id"] == "ES2614584379"][0]
    assert hecha["contestada_amazon"] is True
    assert viva["contestada_amazon"] is False
    assert b is None


def test_el_plazo_son_24_horas_desde_el_epoch():
    """No es un numero nuestro: lo dice el contador de la propia pagina.

        const endTime = new Date(Number(cell.dataset.epoch) + (1000*24*60*60))

    Equivocarse aqui mueve el vencimiento un dia entero, y la pantalla existe
    justo para decir cuanto queda.
    """
    viva = PARSEAR(_VIVA)[0]
    assert viva["vence"], "una fila viva tiene que traer vencimiento"
    from datetime import datetime as dt, timezone as tz
    esperado = dt.fromtimestamp((1757960000000 + 24 * 3600 * 1000) / 1000.0, tz.utc)
    assert viva["vence"][:19] == esperado.isoformat()[:19]


def test_una_contestada_no_trae_vencimiento():
    """No tiene contador: ya no corre el tiempo. Inventarle uno la colaria entre
    las urgentes."""
    assert PARSEAR(_HECHA)[0]["vence"] is None


def test_el_texto_vacio_de_una_viva_no_se_lee_como_sin_plazo():
    """La trampa: en el HTML guardado esa celda esta VACIA porque la rellena el
    JavaScript. Leerla como «no tiene plazo» es la conclusion de mas del gotcha
    64. El dato esta en el atributo, no en el texto."""
    viva = PARSEAR(_VIVA)[0]
    assert viva["plazo"] == "" and viva["vence"] is not None


def test_lo_que_dice_amazon_manda_sobre_lo_que_creamos_nosotros():
    """Al entrar el informe, una fila con «Response Received» se marca
    contestada aunque nadie la haya marcado aqui: puede haberla contestado otra
    persona o el propio portal."""
    src = _fuente("cortex_ingest_informe")
    assert 'f.get("contestada_amazon")' in src, (
        "se seguirian enseñando como pendientes las que Amazon ya tiene")


def test_las_caducadas_se_separan_de_las_que_aun_se_pueden_contestar():
    """El plazo son 24 h y despues la pagina de Amazon pone una X. Mezclarlas
    con las vivas hace que lo que todavia se puede salvar quede escondido."""
    src = _fuente("dnr_investigaciones")
    assert '"caducada"' in src and 'f["vence"] < ahora' in src
    # POR VENCIMIENTO, Y ORDENANDO ANTES DE CORTAR. La regla es la misma que
    # habia (`f.get("vence") or "9999"`), escrita para Mongo: las que no traen
    # plazo van al final en vez de colarse arriba como si urgieran. Se movio
    # alli porque ordenar DESPUES del `to_list(400)` ordena el recorte, no la
    # coleccion: con mas de 400 abiertas entrarian 400 cualesquiera y las mas
    # urgentes podrian no estar (gotcha 10).
    assert '"9999"' in src, (
        "sin ordenar por vencimiento, la primera de la lista no es la que urge")
    assert '{"$sort": {"_orden": 1, "tracking_id": 1}}' in src
    assert src.index('"$sort"') < src.index('"$limit"'), (
        "corta antes de ordenar: entrarian 400 cualesquiera")


# ── LO QUE SE LE PREGUNTA AL CONDUCTOR ───────────────────────────

_CAT = json.load(io.open(RAIZ / "datos" / "dnr_opciones.json", encoding="utf-8"))
_DIJO = _constante("_DNR_LO_QUE_DIJO")


def test_cada_boton_del_conductor_existe_en_el_catalogo_de_amazon():
    """Es lo unico que hace segura la traduccion automatica. Una opcion que
    Amazon no reconozca tumba el bloque ENTERO —las demas respuestas de esa
    tanda tambien— y sin decir cual ha sido."""
    for clave, texto, comp, loc, adic in _DIJO:
        if not comp:
            continue                    # «no me acuerdo» no manda nada
        assert comp in _CAT["completion"], "%s -> %s" % (clave, comp)
        if loc:
            assert loc in _CAT["location"][comp], "%s -> %s/%s" % (clave, comp, loc)
        if adic:
            assert adic in _CAT["additional"][comp], "%s -> %s/%s" % (clave, comp, adic)


def test_los_botones_estan_en_cristiano_y_no_en_codigo_de_amazon():
    """Los lee un conductor en el movil, no un programador. «SAFE_PLACE /
    FRONT_DOOR» no significa nada para quien acaba de repartir 170 paquetes."""
    for clave, texto, *_ in _DIJO:
        assert texto == texto.strip() and len(texto) > 8, clave
        assert not re.search(r"[A-Z]{4,}_", texto), "%s tiene codigo dentro: %s" % (clave, texto)


def test_existe_no_me_acuerdo_y_no_manda_nada():
    """Sin esa opcion, quien no se acuerde tocara la que mas se le parezca. Eso
    no es un hueco: es una declaracion falsa a Amazon con su nombre detras."""
    nose = [x for x in _DIJO if x[0] == "nose"]
    assert nose, "falta «no me acuerdo»"
    assert nose[0][2] == "" and nose[0][3] == ""


def test_traduce_el_servidor_y_no_la_pagina():
    """Si la pagina publica mandara las casillas ya puestas, bastaria con
    cambiarlas en el navegador para declararle a Amazon cualquier cosa en nombre
    de esa persona (gotcha 54)."""
    src = _fuente("dnr_publico_responder")
    assert "_dnr_traducir(clave)" in src
    assert 'body.get("completion")' not in src and 'body.get("location")' not in src
    # Y lo que llega se comprueba contra las opciones que existen HOY.
    assert "_dnr_opciones_conductor()" in src and "no existe" in src


def test_el_enlace_publico_fija_la_empresa_y_exige_su_clase():
    """Las dos cosas que ya han fallado antes: sin `set_current_org_db` el
    enlace lee la base que no es (gotcha 26), y sin filtrar por `tipo` acepta
    tokens de talleres y de apoyos y revienta con un 500 (gotcha 59)."""
    src = _fuente("_dnr_por_token")
    assert "set_current_org_db(enlace.get(\"db_name\"))" in src
    assert '"tipo": "dnr"' in src
    assert 'enlace.get("dnr_id")' in src
    assert "_ot_freno" in src, "un endpoint publico sin freno es una puerta abierta"


def test_al_conductor_solo_se_le_ensena_lo_de_su_paquete():
    """El enlace acaba en un WhatsApp y de ahi puede acabar en cualquier sitio.
    Lista blanca, nunca lista negra (gotcha 26)."""
    src = _fuente("dnr_publico")
    for prohibido in ("conductor", "telefono", "order_id", "marketplace_id",
                      "case_datetime", "_DNR_CORREO", "centro"):
        assert '"%s"' % prohibido not in src, "se le esta enseñando %s" % prohibido


def test_un_solo_enlace_vivo_por_investigacion():
    """Dos enlaces para el mismo paquete son dos respuestas posibles y ninguna
    forma de saber cual vale."""
    src = _fuente("dnr_preguntar")
    assert '"tipo": "dnr", "dnr_id": tid, "revocado": {"$ne": True}' in src


def test_el_whatsapp_lo_arma_el_backend():
    """61 de 114 telefonos estan guardados sin prefijo: `wa.me/6xx…` abre un
    numero que no existe (gotcha 47)."""
    src = _fuente("dnr_preguntar")
    assert "enlace_wa(" in src
    assert '"sin_telefono"' in src, "si no hay telefono hay que DECIRLO"


# ── LA DIRECCION SE LLAMA `stop_address` ──────────────────────────

def test_la_direccion_se_lee_del_campo_que_existe():
    """El 15-09-2026 di por bueno que Cortex no traia la direccion de estas
    investigaciones —«0 de 27»— y monte la pantalla solo con el mapa. Era falso:
    la consulta pedia `address` y `city`, que NO existen en `cortex_packages`.
    El campo es `stop_address`, y las tres investigaciones abiertas lo tenian
    relleno («R\u00faa do Agrelo n\u00fam 1, 3A, Bertamirans»).

    Es el gotcha 73: mirar el campo que no es da «no existe» con el dato
    delante. Un campo mal escrito no falla — devuelve vacio, y vacio parece un
    hallazgo (gotcha 33).
    """
    src = _fuente("_dnr_contexto")
    assert '"stop_address": 1' in src, "vuelve a pedir un campo que no existe"
    assert '"address": 1' not in src, "`address` no existe en cortex_packages"
    assert 'd.get("stop_address")' in src


def test_el_whatsapp_al_conductor_lleva_la_calle():
    """«Un paquete del martes» no lo situa nadie. Con la calle delante se
    acuerda antes incluso de abrir el enlace."""
    src = _fuente("_dnr_pregunta")
    assert 'd.get("stop_address")' in src
    assert 'd.get("address")' not in src
    preg = _fuente("dnr_preguntar")
    assert 'ctx.get("direccion")' in preg, "el mensaje del enlace no dice de que paquete es"


def test_la_pagina_del_conductor_recibe_la_direccion():
    """Es lo primero que mira: si le suena la calle, ya se esta acordando."""
    src = _fuente("dnr_publico")
    assert '"direccion": ctx.get("direccion")' in src


def test_el_escaneo_se_le_ensena_al_conductor_en_cristiano():
    """«Tú lo marcaste como X» es lo que mas le hace acordarse: es SU propio
    escaneo, el que hizo ese dia. Pero mal traducido seria peor que callado —le
    diriamos que marco algo que no marco, y sobre eso contestaria—, asi que un
    escaneo que no conocemos no dice nada."""
    amb_marcaste = _cargar_sugerencia  # el mismo cargador trae las dos
    assert callable(amb_marcaste)
    from_cat = _constante("_DNR_ESCANEO_EN_CRISTIANO")
    # Todos los escaneos que sabemos contestar tienen su frase: si no, el
    # conductor veria el codigo de Amazon en pantalla.
    for scan in _constante("_DNR_DEL_ESCANEO"):
        assert scan in from_cat, "%s no tiene frase para el conductor" % scan
        assert not re.search(r"[A-Z]{4,}_", from_cat[scan]), from_cat[scan]
    src = _fuente("_dnr_marcaste")
    assert '.get((scan or "").strip().upper(), "")' in src, (
        "un escaneo desconocido tiene que devolver vacio, no inventarse una frase")


# ── QUE LA PANTALLA NO CONFUNDA «NINGUNA» CON «NO HA LLEGADO» ────────────────
#
# El 15-09-2026 Dani pregunto por que no aparecian las pre-DNR de DGA1. La
# pantalla le enseñaba una lista vacia, exactamente igual que si esa nave no
# tuviera ninguna abierta. La realidad era otra: el informe de DGA1 no se habia
# bajado NUNCA —cero intentos en el historial del backend, mientras los horarios
# de las tres naves entraban sin problema— porque la peticion que firma los
# enlaces se guardaba con una URL relativa y desde el service worker no se podia
# ni pedir ni cambiarle la nave.
#
# El fallo de la extension ya tiene su pestillo en `check-informes-portal`. Este
# es el otro lado, y es el que le importa a quien mira la pantalla: una nave de
# la que no ha llegado nada TIENE que salir dicha, no callada. Vacio se lee como
# «no hay trabajo», y eso seria mentirle mientras se le escapa el plazo de 24 h.

def test_las_naves_sin_informe_se_dicen_no_se_callan():
    src = _fuente("_dnr_naves")
    # Sale la lista de la empresa, no solo de lo que hay guardado: si solo se
    # mirase la coleccion, una nave sin un solo informe no existiria.
    assert "_centros_de_la_empresa()" in src
    assert "tiene_informe" in src, "la pantalla no puede distinguir los dos casos"
    # Y se distingue «no tiene abiertas» de «no ha llegado su informe».
    assert "abiertas" in src and "ultimo" in src


def test_la_lista_de_naves_es_una_sola_en_todo_el_backend():
    """Estaba escrita dentro de `/cortex/naves` y ahora la usan dos sitios.

    Copiada, el dia que se añada una nave se actualizaria una y la otra no —y
    la que se quedase vieja fallaria en silencio, que es la forma de fallo que
    ya costo tres rondas con DGA1.
    """
    assert "_centros_de_la_empresa" in _fuente("cortex_naves")
    assert "_centros_de_la_empresa" in _fuente("_dnr_naves")
    # Ninguno de los dos la lee por su cuenta: la piden al ayudante.
    for f in ("cortex_naves", "_dnr_naves"):
        assert '"centers": 1' not in _fuente(f), (
            "%s vuelve a leer la ficha de la organizacion por su cuenta" % f)
    # NOTA HONESTA: esta misma consulta sigue repetida en otros cuatro sitios
    # del backend, de antes de esto. No se tocan aqui —no es lo que se estaba
    # arreglando— pero queda apuntado: son cuatro sitios que el dia que cambie
    # una nave hay que acordarse de mirar.


def test_el_endpoint_devuelve_las_naves():
    assert '"naves": await _dnr_naves()' in _fuente("dnr_investigaciones")


def test_cada_ruta_de_dnr_apunta_a_su_funcion():
    """Un ayudante colado entre el decorador y la funcion se lleva la ruta.

    Paso el 15-09-2026 al añadir `_dnr_naves`: quedo justo debajo de
    `@api_router.get("/dnr/investigaciones")` y la ruta paso a apuntar al
    ayudante, con lo que la pantalla entera se habria quedado sin datos. Los
    tests de contenido no lo ven —la funcion de verdad sigue existiendo y
    diciendo lo que debe— y desde fuera solo se nota abriendo la pantalla.

    Aqui se mira lo unico que importa: a QUE funcion queda pegado cada
    decorador de DNR.
    """
    esperado = {
        "/dnr/investigaciones": "dnr_investigaciones",
        "/dnr/investigaciones/responder": "dnr_responder",
    }
    visto = {}
    for n in _ARBOL.body:
        if not isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in n.decorator_list:
            if not isinstance(dec, ast.Call):
                continue
            f = dec.func
            if not (isinstance(f, ast.Attribute) and f.attr in ("get", "post")):
                continue
            ruta = dec.args[0].value if dec.args and isinstance(dec.args[0], ast.Constant) else None
            if ruta in esperado:
                visto[ruta] = n.name
    for ruta, fn in esperado.items():
        assert visto.get(ruta) == fn, (
            "%s apunta a %r y deberia apuntar a %r: se ha colado algo entre el "
            "decorador y la funcion" % (ruta, visto.get(ruta), fn))


def test_cada_escaneo_apunta_a_una_opcion_QUE_EXISTE():
    """Una opcion inventada tumba el bloque entero y Amazon no dice por que.

    El caso que lo hace real: su escaneo se llama `DELIVERED_TO_NEIGHBOR` (a la
    americana) y su propia opcion se llama `NEIGHBOUR`. Escribirla «como suena»
    da algo que parece bien, pasa todas las revisiones de vista y es rechazado
    en silencio al enviarlo — con el plazo de 24 h corriendo.

    Asi que la tabla se compara entera contra el catalogo REAL de la pagina.
    """
    catalogo = json.loads(io.open(
        RAIZ / "datos" / "dnr_opciones.json", encoding="utf-8").read())
    tabla = _constante("_DNR_DEL_ESCANEO")
    assert tabla, "la tabla del escaneo esta vacia"
    for scan, (comp, loc) in tabla.items():
        assert comp in catalogo["completion"], (
            "%s propone completion %r y Amazon no la tiene" % (scan, comp))
        if loc:
            assert loc in catalogo["location"].get(comp, {}), (
                "%s propone location %r dentro de %s y Amazon no la tiene"
                % (scan, loc, comp))
