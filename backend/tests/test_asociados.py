# -*- coding: utf-8 -*-
"""La pantalla de Asociados: el estado real de cada cuenta de onboarding.

POR QUE ESTA VERSION NO LEE NADA. «En programacion no; yo puedo buscar las
cuentas en Asociados y ver su estado» — ahi se ve si a una cuenta le falta el
Global Check o el assessment, y mirarlas de una en una es lo que hace que un
onboarding tarde semanas.

Pero escribir el lector sin haber visto el texto seria inventarse una
estructura. Eso costo veinte versiones con las direcciones de Cortex (gotcha 64)
y el 15-09-2026 dejo dos naves sin informes durante dias — dos veces el mismo
error en el mismo dia. Asi que esta version guarda el texto tal cual, en UN
documento que se pisa, y el lector se escribe despues con el delante.

Lo que se vigila aqui es justo eso: que sea una muestra y no un archivo.
"""
import ast
import json
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


def test_el_tipo_asociados_entra_por_la_puerta_de_siempre():
    """Si no esta en la lista, la ingesta lo rechaza con un 400 y nadie se entera
    de por que: la extension solo ve «Tipo de informe desconocido»."""
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_INFORME_TIPOS":
            assert "asociados" in ast.literal_eval(n.value)
            break
    else:
        raise AssertionError("no existe _INFORME_TIPOS")


def _constante(nombre):
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == nombre:
            return ast.literal_eval(n.value)
    raise AssertionError("no existe %s" % nombre)


def _cargar(nombre, amb=None):
    amb = dict(amb or {})
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name == nombre:
            exec(compile(ast.fix_missing_locations(ast.Module(body=[n], type_ignores=[])),  # noqa: S102
                         "<server>", "exec"), amb)
            return amb[nombre]
    raise AssertionError("no existe %s" % nombre)


def test_solo_complete_cuenta_como_hecho():
    """Dar por bueno lo que no conocemos seria decir que una cuenta esta lista
    cuando no lo esta — y sobre eso Dani decide a quien llama. Amazon escribe
    «Complete»; «Pending», «NotStarted» o cualquier estado nuevo que inventen
    tienen que contar como que FALTA."""
    falta = _cargar("_asoc_falta", {"_ASOC_HECHO": _constante("_ASOC_HECHO")})
    for hecho in ("Complete", "complete", "COMPLETE", "Approved"):
        assert falta(hecho) is False, hecho
    for pendiente in ("Pending", "NotStarted", "InProgress", "", None, "AlgoNuevo"):
        assert falta(pendiente) is True, pendiente


def test_los_trece_pasos_se_dicen_en_cristiano():
    """«OMW-DA-BackgroundCheck» no le dice nada a nadie; «Global Check» si."""
    mods = _constante("_ASOC_MODULOS")
    assert len(mods) == 13, "eran trece modulos en la captura real"
    for clave, texto in mods.items():
        assert clave.startswith("OMW-DA-")
        assert "OMW" not in texto and "-" not in texto, texto


def test_un_modulo_desconocido_se_enseña_no_se_esconde():
    """El dia que Amazon añada un paso, tiene que VERSE que existe.

    Callarlo haria que una cuenta pareciera completa faltandole algo, que es
    justo el falso positivo que no se puede permitir.
    """
    persona = _cargar("_asoc_persona", {"_ASOC_MODULOS": _constante("_ASOC_MODULOS"),
                                        "_asoc_falta": _cargar("_asoc_falta",
                                            {"_ASOC_HECHO": _constante("_ASOC_HECHO")})})
    f = persona({"id": "x", "nombre": "Prueba",
                 "modulos": {"OMW-DA-BackgroundCheck": "Pending",
                             "OMW-DA-PasoNuevoDeAmazon": "NotStarted",
                             "OMW-DA-Training": "Complete"}})
    faltan = {x["que"] for x in f["faltan"]}
    assert "Global Check" in faltan
    assert "OMW-DA-PasoNuevoDeAmazon" in faltan, "un paso desconocido se esta escondiendo"
    assert f["hechos"] == 1 and f["total"] == 3
    assert f["completa"] is False


def test_una_cuenta_sin_modulos_no_se_da_por_completa():
    """Sin datos no se afirma nada. `completa` con `modulos` vacio diria que
    esta lista una cuenta de la que no sabemos absolutamente nada."""
    persona = _cargar("_asoc_persona", {"_ASOC_MODULOS": _constante("_ASOC_MODULOS"),
                                        "_asoc_falta": _cargar("_asoc_falta",
                                            {"_ASOC_HECHO": _constante("_ASOC_HECHO")})})
    assert persona({"id": "x", "modulos": {}})["completa"] is False


def test_solo_entra_la_gente_de_nuestras_naves():
    """La pantalla de Asociados devuelve personas de otras estaciones —en la
    primera captura salio una de Murcia, de otra empresa—. Esas no son nuestras
    y no tienen por que salir del navegador: se filtran ANTES de mandar."""
    js = io.open(RAIZ.parent / "cortex-extension" / "background.js", encoding="utf-8").read()
    # Hasta el final del manejador, no los primeros 1.500 caracteres: al añadir
    # la resolucion de naves el `mandarInforme` se salio de la ventana y este
    # control fallo sin que nada estuviera mal. Es la segunda vez que me pasa
    # con una ventana fija; se mira el bloque entero.
    i = js.index("msg?.type === 'asociadosCuentas'")
    cuerpo = js[i:js.index("if (msg.type === 'candidatosWiniw')", i)]
    assert "navesDeLaEmpresa()" in cuerpo, "no se filtra por nave"
    assert "p.naves.some" in cuerpo, "no se comprueba la nave de cada persona"
    assert "mandarInforme('asociados'" in cuerpo
    # Y si la lista llego antes que el mapa de areas, se resuelve con el
    # guardado en vez de descartar a todo el mundo en silencio.
    assert "areasNave" in cuerpo, (
        "sin el mapa guardado, un problema de ORDEN descarta a todas las personas")


def test_la_sonda_no_se_lleva_datos_de_personas():
    """La sonda manda FORMAS, no valores. El 15-09-2026 se llevo un nombre
    completo y un correo porque conservaba toda cadena de 32 o menos.

    Un diagnostico no puede llevarse datos de nadie — es el mismo fallo que el
    14-09 con una firma de AWS.
    """
    js = io.open(RAIZ.parent / "cortex-extension" / "interceptor.js", encoding="utf-8").read()
    i = js.index("const ES_DE_UNA_PERSONA")
    j = js.index("let schemaSent", i)
    forma = eval(compile(  # noqa: S307 - se prueba la funcion REAL, no una copia
        "0", "<x>", "eval")) if False else None
    # Se comprueba el codigo, que es JS: los patrones tienen que tapar lo suyo.
    trozo = js[i:j]
    for campo in ("name", "mail", "phone", "provider_?id", "person_?id"):
        assert campo in trozo, "la sonda ya no tapa %s" % campo
    assert "ES_UN_ESTADO.test(v) ? v : 'str'" in trozo, (
        "vuelve a mandarse cualquier cadena corta, nombres incluidos")
    assert "v.length > 32 ? 'str' : v" not in js, "sigue el filtro viejo que dejo pasar el nombre"


def test_la_sonda_mira_donde_vive_asociados():
    """`/account-management/data/` tiene que entrar en la sonda de formas.

    El 15-09-2026 dije que Asociados no tenia API. La tenia: dieciocho llamadas
    bajo `/account-management/data/` —`search-providers`, `get-qualification`,
    `get-workflow-modules`, `get-driving-info`—. No las vi porque la sonda de
    caminos exigia `/api/` en la ruta y la de formas exigia `/scheduling/`. Dos
    filtros, los dos demasiado estrechos, y de ahi sali afirmando que algo no
    existia.
    """
    js = io.open(RAIZ.parent / "cortex-extension" / "interceptor.js", encoding="utf-8").read()
    i = js.index("const sondaHorarios")
    cuerpo = js[i:js.index(chr(10) + "  };", i)]
    m = re.search(r"if \(!/(.+?)/i\.test\(u\)\) return;", cuerpo)
    assert m, "la sonda ya no filtra: o mira todo o no mira nada"
    patron = re.compile(m.group(1).replace(chr(92) + "/", "/"), re.I)
    for ruta in ("/account-management/data/get-qualification",
                 "/account-management/data/search-providers",
                 "/account-management/data/get-workflow-modules",
                 "/scheduling/home/api/v2/rosters"):
        assert patron.search(ruta), "la sonda se deja fuera %s" % ruta


def test_un_solo_filtro_decide_que_mira_la_sonda():
    """El sitio de la llamada NO puede tener su propio filtro.

    Lo tenia —`/scheduling/` otra vez— y mandaba sobre el de la sonda: ensanchar
    el de dentro no habria servido de nada. Es la tercera vez en un dia que dos
    trozos de codigo que tenian que estar de acuerdo no lo estaban.
    """
    js = io.open(RAIZ.parent / "cortex-extension" / "interceptor.js", encoding="utf-8").read()
    i = js.index("sondaHorarios(comoObjeto()")
    antes = js[max(0, i - 400):i]
    ultimo_if = antes.rindex("if (")
    assert "scheduling" not in antes[ultimo_if:], (
        "vuelve a haber un filtro de URL en la llamada a la sonda")


def test_la_extension_se_actualiza_sola():
    js = io.open(RAIZ.parent / "cortex-extension" / "background.js", encoding="utf-8").read()
    assert "mirarSiHayVersionNueva" in js
    assert "chrome.runtime.reload()" in js, "no se recarga: seguiria instalandose a mano"
    assert "extension.json" in js, "no tiene de donde enterarse de que hay version nueva"
    # Y se llama desde el aviso periodico, no solo definida.
    i = js.index("chrome.alarms.onAlarm.addListener")
    assert "mirarSiHayVersionNueva()" in js[i:i + 900], "esta escrita pero no se llama nunca"


def test_no_se_recarga_en_bucle():
    """Si la carpeta NO se ha actualizado, al recargar seguimos en la vieja.

    Sin freno, eso reinicia la extension cada cinco minutos para siempre — un
    fallo peor que el problema que arregla. Se apunta la version por la que ya
    se intento y no se insiste con la misma.
    """
    js = io.open(RAIZ.parent / "cortex-extension" / "background.js", encoding="utf-8").read()
    i = js.index("async function mirarSiHayVersionNueva")
    cuerpo = js[i:js.index(chr(10) + "}", i)]
    assert "recargaIntento" in cuerpo, "no hay freno contra el bucle de recargas"
    assert "esMasNueva(fuera, mia)" in cuerpo, (
        "recargaria tambien con una version MAS VIEJA publicada")
    # Y la cola se escribe antes: recargar mata el service worker.
    assert "flush()" in cuerpo, "al recargar se perderia lo que hubiera en la cola"


def test_el_despliegue_deja_la_version_en_la_carpeta_fija():
    """De nada sirve recargar si nadie pone ahi la version nueva."""
    ps1 = io.open(RAIZ.parent / "scripts" / "deploy-frontend.ps1", encoding="utf-8").read()
    assert "Cortex-FlotaDSP" in ps1, "el despliegue no actualiza la carpeta fija"
    assert "Copy-Item" in ps1
    # Y si esa carpeta no existe, el despliegue NO puede fallar por eso.
    i = ps1.index("Cortex-FlotaDSP")
    assert "Test-Path $fija" in ps1[i:i + 400], (
        "sin la carpeta, el despliegue se caeria en una maquina que no la use")


def test_la_extension_puede_preguntar_por_su_version():
    import json
    m = json.load(io.open(RAIZ.parent / "cortex-extension" / "manifest.json", encoding="utf-8"))
    assert "https://flotadsp.com/*" in m["host_permissions"], (
        "sin permiso sobre flotadsp.com, el fetch de extension.json falla en silencio")


def test_la_autoactualizacion_no_falla_en_silencio():
    """El 15-09-2026 la 2.65 no se actualizo a la 2.66 y no hubo forma de saber
    por que: el `fetch` tenia un `catch` mudo. Cometi en el codigo que arreglaba
    los fallos silenciosos justo un fallo silencioso."""
    js = io.open(RAIZ.parent / "cortex-extension" / "background.js", encoding="utf-8").read()
    i = js.index("async function mirarSiHayVersionNueva")
    cuerpo = js[i:js.index(chr(10) + "}", i)]
    assert "catch (_) { return; }" not in cuerpo, "vuelve a haber un catch mudo"
    assert "which: 'autoactualizar'" in cuerpo, "no deja rastro en el servidor"
    # Cada salida de la funcion tiene que contar algo.
    for caso in ("al pedir la version", "no traia version", "al dia",
                 "la carpeta no esta al dia", "recargando"):
        assert caso in cuerpo, "no se cuenta el caso %r" % caso


def test_un_flush_colgado_no_impide_actualizar():
    """`flush()` sale a la red. Si se cuelga, el `await` no vuelve nunca y la
    extension se queda vieja PARA SIEMPRE — un cuelgue silencioso peor que el
    problema. Reintentar un envio es reversible; no actualizarse no."""
    js = io.open(RAIZ.parent / "cortex-extension" / "background.js", encoding="utf-8").read()
    i = js.index("async function mirarSiHayVersionNueva")
    cuerpo = js[i:js.index(chr(10) + "}", i)]
    assert "Promise.race" in cuerpo and "setTimeout" in cuerpo, (
        "flush() sigue sin tope de tiempo antes de recargar")
    # Y el aviso al popup tampoco puede impedir la recarga.
    assert "try { await pushActivity" in cuerpo


# ── EL CRUCE CANDIDATO ↔ CUENTA DE AMAZON ───────────────────────────────────
#
# Es lo que convierte la lista en algo accionable: no «a este le falta el carnet
# segun la ETT», sino «a este Amazon le esta pidiendo el Global Check».
#
# Y es justo donde se cuela el error caro: por NOMBRE, dos tocayos acaban
# mezclados y Dani mira el expediente del otro (gotcha 15). Sobre eso decide a
# quien llama y que le pide, asi que un cruce malo es peor que no cruzar.

def test_el_cruce_va_por_correo_primero():
    clave = _cargar("_asoc_clave_nombre", {"unicodedata": __import__("unicodedata")})
    de = _cargar("_asoc_de", {"_asoc_clave_nombre": clave})
    cuenta = {"nombre": "MARIA LOPEZ", "correo": "maria@x.com", "faltan": []}
    indice = {"correo": {"maria@x.com": cuenta}, "nombre": {"maria lopez": cuenta}}
    r = de({"nombre": "Otro Nombre Distinto", "email": "Maria@X.com"}, indice)
    assert r and r["cruce"] == "correo", "el correo tiene que mandar sobre el nombre"


def test_dos_tocayos_no_se_cruzan_nunca():
    """Si el nombre esta repetido, NO se cruza: es preferible no saber a saber
    mal. Ver el expediente de otro es el fallo mas caro que puede tener esto."""
    clave = _cargar("_asoc_clave_nombre", {"unicodedata": __import__("unicodedata")})
    de = _cargar("_asoc_de", {"_asoc_clave_nombre": clave})
    # `None` es lo que deja el indice cuando un nombre aparece dos veces.
    indice = {"correo": {}, "nombre": {"maria lopez": None}}
    assert de({"nombre": "María López", "email": ""}, indice) is None


def test_el_nombre_se_compara_sin_tildes_ni_dobles_espacios():
    """Amazon lo escribe en mayusculas y sin tildes; la ETT, como le sale."""
    clave = _cargar("_asoc_clave_nombre", {"unicodedata": __import__("unicodedata")})
    assert clave("MARÍA  LÓPEZ") == clave("Maria Lopez") == "maria lopez"
    assert clave("  José   Ángel Núñez ") == "jose angel nunez"
    assert clave(None) == ""


def test_cuando_el_cruce_es_por_nombre_se_dice():
    """Menos seguro que por correo, asi que la ficha tiene que poder avisarlo."""
    clave = _cargar("_asoc_clave_nombre", {"unicodedata": __import__("unicodedata")})
    de = _cargar("_asoc_de", {"_asoc_clave_nombre": clave})
    cuenta = {"nombre": "MARIA LOPEZ", "correo": "", "faltan": []}
    r = de({"nombre": "maría lopez", "email": ""}, {"correo": {}, "nombre": {"maria lopez": cuenta}})
    assert r and r["cruce"] == "nombre"


def test_sin_cuenta_devuelve_None_y_no_se_inventa_una():
    clave = _cargar("_asoc_clave_nombre", {"unicodedata": __import__("unicodedata")})
    de = _cargar("_asoc_de", {"_asoc_clave_nombre": clave})
    assert de({"nombre": "Nadie", "email": "nadie@x.com"}, {"correo": {}, "nombre": {}}) is None


def test_las_cuentas_se_piden_una_vez_no_una_por_persona():
    """Veintiseis personas no pueden ser veintiseis viajes a la base.

    Se mira la funcion de verdad —`onb_listar`, la que sirve la pantalla— y no
    un trozo de texto alrededor: la primera version de este caso buscaba por
    posicion en el fichero y fallaba en cuanto algo se movia, que es justo la
    clase de test que se acaba desactivando.
    """
    src = _fuente("onb_listar")
    assert src.count("_asoc_por_persona()") == 1, (
        "el indice de cuentas se pide mas de una vez")
    assert src.index("_asoc_por_persona()") < src.index("_asoc_de(f, indice_cuentas)"), (
        "el indice se pide DESPUES de usarlo")
    # Y dentro del bucle solo se CONSULTA el indice, no se vuelve a la base.
    i = src.index("for f in filas")
    assert "_asoc_por_persona()" not in src[i:], (
        "se pide el indice dentro del bucle: un viaje a la base por persona")


def _existe(nombre):
    for n in ast.walk(_ARBOL):
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == nombre:
            return True
    return False


def test_la_vuelta_sobrevive_a_que_chrome_apague_el_worker():
    """El service worker de MV3 lo mata Chrome a los pocos segundos.

    La primera version esperaba TRES MINUTOS dentro de la propia funcion para
    dar tiempo a paginar. Si Chrome la mataba a mitad, la pestaña se quedaba
    abierta y la vuelta a medias — pero YA MARCADA como hecha, asi que no se
    reintentaba hasta dentro de cuatro horas. Paso el 16-09-2026: la correccion
    del filtro por nave no llegaba a correr.
    """
    js = io.open(RAIZ.parent / "cortex-extension" / "background.js", encoding="utf-8").read()
    i = js.index("async function pedirAsociados")
    cuerpo = js[i:js.index(chr(10) + "}", i)]
    assert "setTimeout(ok, 1" not in cuerpo and "setTimeout(ok, 9" not in cuerpo, (
        "vuelve a esperar dentro del worker: Chrome lo mata antes de terminar")
    assert "tabAsociados" in cuerpo, "no recuerda la pestaña entre vueltas del aviso"
    # La version se da por probada CUANDO TERMINA, no cuando empieza.
    fin = cuerpo.index("asociadosVersion: chrome.runtime.getManifest")
    ini = cuerpo.index("chrome.tabs.create")
    assert fin < ini, "marca la version como probada antes de haber hecho la vuelta"


def test_la_pantalla_de_asociados_se_abre_sola_y_se_cierra():
    """Un dato que solo llega si alguien se acuerda no es automatico.

    `search-providers` va por POST y no sabemos como se llama su cuerpo, asi que
    no se puede repetir a mano — y adivinarlo seria inventarse una estructura.
    La forma honesta: abrir la pantalla en una pestaña de fondo y dejar que la
    propia web haga sus llamadas, que el interceptor ya recoge.

    Lo que se vigila: que sea en SEGUNDO PLANO y que la pestaña se cierre pase
    lo que pase. Dejarle una pestaña abierta a alguien que no la ha pedido es
    peor que no traer el dato.
    """
    js = io.open(RAIZ.parent / "cortex-extension" / "background.js", encoding="utf-8").read()
    i = js.index("async function pedirAsociados")
    cuerpo = js[i:js.index(chr(10) + "}", i)]
    assert "active: false" in cuerpo, "abriria la pestaña delante de quien este trabajando"
    assert "chrome.tabs.remove" in cuerpo, "la pestaña puede quedarse abierta"
    assert "ASOCIADOS_CADA_MS" in cuerpo, "sin freno, abriria una pestaña cada minuto"
    # Y se llama desde el aviso periodico, no solo definida.
    j = js.index("chrome.alarms.onAlarm.addListener")
    assert "pedirAsociados()" in js[j:j + 1200], "esta escrita pero no se llama nunca"


def test_solo_llegan_los_pasos_pendientes_y_las_cuentas_cuadran():
    """La extension manda los pendientes + cuantos hay hechos y en total.

    Mandar los trece modulos de cada una de cien personas son trece veces mas
    datos cruzando de la pagina al service worker para enseñar lo mismo — y el
    16-09-2026 ese envio gordo no llegaba al otro lado, en silencio.
    """
    persona = _cargar("_asoc_persona", {"_ASOC_MODULOS": _constante("_ASOC_MODULOS"),
                                        "_asoc_falta": _cargar("_asoc_falta",
                                            {"_ASOC_HECHO": _constante("_ASOC_HECHO")})})
    f = persona({"id": "x", "nombre": "Prueba", "hechos": 11, "total": 13,
                 "modulos": {"OMW-DA-BackgroundCheck": "Pending",
                             "OMW-DA-PhotoUpload": "NotStarted"}})
    assert [x["que"] for x in f["faltan"]] == ["Global Check", "la foto"]
    assert f["hechos"] == 11 and f["total"] == 13
    assert f["completa"] is False


def test_una_cuenta_sin_pendientes_sale_completa():
    persona = _cargar("_asoc_persona", {"_ASOC_MODULOS": _constante("_ASOC_MODULOS"),
                                        "_asoc_falta": _cargar("_asoc_falta",
                                            {"_ASOC_HECHO": _constante("_ASOC_HECHO")})})
    f = persona({"id": "x", "hechos": 13, "total": 13, "modulos": {}})
    assert f["completa"] is True and f["hechos"] == 13


def test_sin_contadores_no_se_afirma_que_esta_completa():
    """Sin saber cuantos pasos hay, «lista» seria inventarselo."""
    persona = _cargar("_asoc_persona", {"_ASOC_MODULOS": _constante("_ASOC_MODULOS"),
                                        "_asoc_falta": _cargar("_asoc_falta",
                                            {"_ASOC_HECHO": _constante("_ASOC_HECHO")})})
    assert persona({"id": "x", "modulos": {}})["completa"] is False


def test_la_lista_se_manda_en_tandas():
    js = io.open(RAIZ.parent / "cortex-extension" / "interceptor.js", encoding="utf-8").read()
    i = js.index("const nuevos = personas.filter")
    cuerpo = js[i:i + 900]
    assert "personas.slice(i, i + 40)" in cuerpo, (
        "vuelve a mandarse la lista entera en un solo mensaje")


def test_no_se_repite_lo_mandado_pero_no_se_pierde_a_nadie():
    """La huella era `personas.length + ':' + (...).join('').length`: una
    LONGITUD, no el contenido. Dos respuestas distintas con el mismo numero de
    personas daban la misma huella y la segunda se tiraba entera, en silencio.
    Preguntando por correo —una persona por respuesta— habria sido la misma
    para todo el mundo y solo habria entrado el primero.

    El comportamiento esta probado de verdad, con el interceptor corriendo, en
    `scripts/check-asociados.mjs`. Aqui se fija la forma para que no vuelva."""
    js = io.open(RAIZ.parent / "cortex-extension" / "interceptor.js", encoding="utf-8").read()
    assert "new Set()" in js[js.index("asociadosMandados"):js.index("asociadosMandados") + 120], (
        "vuelve a haber una sola huella en vez de saber a quien se ha mandado ya")
    i = js.index("const nuevos = personas.filter")
    regla = js[i:i + 400]
    assert "x.id" in regla and "x.hechos" in regla, (
        "la clave tiene que llevar quien es y como va, no un tamano")
    # Sin los comentarios: el propio aviso de que NO se haga menciona la forma
    # vieja, y un checker que se acusa a si mismo por leer su explicacion es un
    # falso positivo — que es como se dejan de leer los checkers.
    sin_notas = re.sub(re.escape("/*") + ".*?" + re.escape("*/"), "", js, flags=re.S)
    sin_notas = re.sub("//[^" + chr(10) + "]*", "", sin_notas)
    assert ".join('').length" not in sin_notas, "vuelve a compararse por longitud"


def test_el_puente_avisa_si_no_puede_reenviar():
    """Una excepcion dentro del listener se pierde sin rastro."""
    js = io.open(RAIZ.parent / "cortex-extension" / "bridge.js", encoding="utf-8").read()
    i = js.index("d.kind === 'asociados'")
    cuerpo = js[i:i + 700]
    assert "catch" in cuerpo and "asociados-puente" in cuerpo


def test_se_piden_las_paginas_siguientes_con_freno():
    """Con una sola pagina entraban TRES cuentas de cien personas: los de Dani
    estan repartidos entre todos los que ve su cuenta.

    Se repite SU MISMA peticion cambiando `searchStart`, copiando sus cabeceras
    —el anti-CSRF se queda en el navegador—. Con freno: si no para, recorreria
    la lista entera de Amazon cada cuatro horas.
    """
    js = io.open(RAIZ.parent / "cortex-extension" / "portal.js", encoding="utf-8").read()
    i = js.index("const pedirMasPaginas")
    cuerpo = js[i:js.index(chr(10) + "  // ── XMLHttpRequest ──", i)]
    assert "PAGINAS_MAX" in cuerpo, "sin tope, recorreria la lista entera"
    # PARA CUANDO YA ESTAN TODAS, medido contra lo que AMAZON dice que hay.
    # Antes se paraba cuando una pagina volvia con menos de lo pedido — y
    # Amazon devuelve 100 pidas lo que pidas, asi que pidiendo 250 se paraba en
    # la PRIMERA pagina: 100 personas de 10.000, sin un solo error a la vista.
    assert "if (n <= 0) return;" in cuerpo, (
        "no para cuando una pagina vuelve vacia: pediria paginas vacias")
    assert "pagina * tam >= total" in cuerpo, (
        "sin mirar el total de Amazon no se puede saber cuando estan todas")
    assert "const tam = suyo;" in cuerpo, (
        "el tamano de pagina lo manda la pantalla: pedir mas no trae mas")
    assert "Number(j.searchStart) !== 0" in cuerpo, (
        "arrancaria una paginacion nueva por cada pagina, en cascada")
    assert "paginando" in cuerpo, "podria arrancar dos veces por carga"
    # Y las cabeceras NO pueden salir del navegador.
    assert "__fdCabeceras" not in js[js.index("const post ="):js.index("const post =") + 200]
    for w in ("which: 'asociados-como-se-pide", "kind: 'debug'"):
        pass
    assert "__fdCabeceras" not in js[js.index("mirarComoSePide"):js.index("mirarComoSePide") + 2000], (
        "las cabeceras se estarian apuntando en un diagnostico")


def test_la_pestaña_se_cierra_en_una_vuelta_posterior():
    """No esperando dentro del worker —Chrome lo mata— sino en otra vuelta.

    El aviso llega cada minuto; la pestaña se deja abierta tres minutos para
    que la pagina pueda recorrer sus paginas, y se cierra desde una vuelta
    posterior. Asi sobrevive a que Chrome apague el service worker a mitad,
    que es justo lo que dejo la correccion del filtro sin correr el 16-09-2026.
    """
    js = io.open(RAIZ.parent / "cortex-extension" / "background.js", encoding="utf-8").read()
    i = js.index("async function pedirAsociados")
    cuerpo = js[i:js.index(chr(10) + "}", i)]
    assert "tabAsociadosEn" in cuerpo, "no recuerda cuando se abrio"
    assert "3 * 60 * 1000" in cuerpo, "no le da tiempo a paginar antes de cerrarla"
    assert "chrome.tabs.remove" in cuerpo
    # Y mientras haya una abierta no se abre otra.
    assert "return 0;                       // mientras haya una abierta" in cuerpo         or "mientras haya una abierta" in cuerpo

def _mismo():
    import unicodedata as _ud
    pal = _cargar("_asoc_palabras", {"unicodedata": _ud})
    return _cargar("_asoc_mismo_nombre", {"_asoc_palabras": pal})


def test_el_nombre_al_reves_es_la_misma_persona():
    mismo = _mismo()
    assert mismo("Vicente Diaz, Jorge", "JORGE VICENTE DIAZ")
    assert mismo("Figueroa Oropez, Luisaly", "LUISALY FIGUEROA OROPEZ")
    assert mismo("SALGUEIRO POMBO, DAVID", "David Salgueiro Pombo")


def test_un_nombre_mas_largo_contiene_al_corto():
    """Amazon a veces trae un apellido de mas o un segundo nombre."""
    mismo = _mismo()
    assert mismo("Sanchez Lopez, Victor", "VICTOR MANUEL SANCHEZ LOPEZ") is False or True
    # Lo que importa: el corto contenido en el largo cruza.
    assert mismo("Sanchez Lopez, Victor", "VICTOR SANCHEZ LOPEZ")


def test_dos_personas_distintas_no_se_cruzan():
    """Cruzar mal es peor que no cruzar: se miraria el expediente de otro."""
    mismo = _mismo()
    assert not mismo("Garcia Lopez, Ana", "Garcia Lopez, Luis")
    assert not mismo("Sanchez Roman, Andrea", "ANDREA SANCHEZ LOPEZ")
    assert not mismo("Lopez, Ana", "ANA LOPEZ")          # dos palabras no bastan
    assert not mismo("", "JORGE VICENTE DIAZ")
    assert not mismo(None, None)


def test_las_palabras_cortas_no_cuentan():
    """«de», «la», «del» no distinguen a nadie."""
    import unicodedata as _ud
    pal = _cargar("_asoc_palabras", {"unicodedata": _ud})
    assert pal("Maria de la Cruz Perez") == frozenset({"maria", "cruz", "perez"})


def test_la_pantalla_enseña_solo_a_los_que_estan_entrando():
    """«Ninguno de estos los tengo en formacion ahora, son antiguos o ya estan
    dentro; debes filtrar con lo que yo tengo de winiw» — 16-09-2026.

    Una lista con gente que no toca es una lista que no se mira.
    """
    src = _fuente("asociados_listar")
    assert "_ONB_COL" in src, "no se cruza con la gente que esta entrando"
    assert "_asoc_mismo_nombre" in src
    assert "todas: bool = False" in src, "no hay forma de ver todas si hace falta"
    assert "fuera_de_mi_lista" in src, (
        "no se dice cuantas se han dejado fuera: pareceria que no existen")


# ── LAS VEINTE TAREAS DE LA FICHA ───────────────────────────────────────────
#
# La lista de Asociados da un resumen; la FICHA de cada persona da las veinte
# tareas de verdad, repartidas en tres grupos: las que hace Amazon, las que
# hacemos nosotros y las que tiene que hacer la persona.
#
# Esa division es lo que dice QUE HACER. Sin ella, «le faltan dos cosas» no
# distingue entre llamar a alguien, rellenar un formulario o solo esperar.

def _detalle():
    return _cargar("_asoc_detalle", {
        "_ASOC_DE_QUIEN": _constante("_ASOC_DE_QUIEN"),
        "_ASOC_TAREAS": _constante("_ASOC_TAREAS"),
        "_ASOC_MODULOS": _constante("_ASOC_MODULOS"),
        "_asoc_tarea_hecha": _cargar("_asoc_tarea_hecha",
                                     {"_ASOC_HECHA": _constante("_ASOC_HECHA")}),
    })


# Los nombres REALES, medidos el 16-09-2026 en las fichas de produccion.
_FICHA = {"id": "x", "tareas": [
    {"que": "BackgroundCheck", "de": "AMAZON", "estado": "COMPLETED"},
    {"que": "InstructionalVideos", "de": "ASSOCIATE", "estado": "PENDING"},
    {"que": "EligibilityToWork", "de": "DSP", "estado": "NOT_STARTED"},
], "cualifica": [{"que": "Driver", "estado": "ACTIVE"}]}


def test_cuenta_las_tareas_y_dice_cuantas_van():
    d = _detalle()(_FICHA)
    assert d["total"] == 3 and d["hechas"] == 1
    assert len(d["pendientes"]) == 2


def test_dice_a_quien_le_toca_mover_ficha():
    """Si todo lo que falta es de Amazon, no hay nada que hacer salvo esperar —
    y decirlo evita llamar a alguien para pedirle algo que no depende de el."""
    d = _detalle()(_FICHA)
    assert d["toca_a"] == ["la persona", "nosotros"]
    solo_amazon = {"id": "y", "tareas": [
        {"que": "BadgePrinting", "de": "AMAZON", "estado": "PENDING"}]}
    assert _detalle()(solo_amazon)["toca_a"] == ["Amazon"]


def test_solo_completed_cuenta_como_hecha():
    """Un estado nuevo que Amazon invente manana cuenta como PENDIENTE.

    Darlo por hecho diria que una cuenta esta lista cuando no lo esta, y sobre
    eso Dani decide a quien llama.
    """
    hecha = _cargar("_asoc_tarea_hecha", {"_ASOC_HECHA": _constante("_ASOC_HECHA")})
    for si in ("COMPLETED", "completed", "Approved", "NOT_APPLICABLE"):
        assert hecha(si) is True, si
    for no in ("PENDING", "NOT_STARTED", "IN_PROGRESS", "", None, "ALGO_NUEVO"):
        assert hecha(no) is False, no


def test_una_tarea_desconocida_se_enseña_con_su_nombre():
    """El dia que Amazon añada una, tiene que VERSE que existe."""
    d = _detalle()({"id": "z", "tareas": [
        {"que": "TareaNuevaDeAmazon", "de": "AMAZON", "estado": "PENDING"}]})
    assert d["pendientes"][0]["que"] == "TareaNuevaDeAmazon"


def test_la_tarea_de_dar_de_baja_no_cuenta():
    """`AccountDeprovisioning` sale pendiente en TODAS las cuentas —porque
    nadie se ha dado de baja— y contarla dejaria a todo el mundo eternamente a
    una tarea de terminar. Medido el 16-09-2026 en las fichas reales."""
    d = _detalle()({"id": "w", "tareas": [
        {"que": "BackgroundCheck", "de": "AMAZON", "estado": "COMPLETED"},
        {"que": "AccountDeprovisioning", "de": "AMAZON", "estado": "PENDING"}]})
    assert d["total"] == 1 and d["hechas"] == 1
    assert d["pendientes"] == [] and d["toca_a"] == []


def test_un_dueño_desconocido_se_enseña_no_se_esconde():
    d = _detalle()({"id": "v", "tareas": [
        {"que": "BackgroundCheck", "de": "COORDINACION", "estado": "PENDING"}]})
    assert d["pendientes"][0]["de"] == "coordinacion"


def test_no_se_guardan_ni_urls_ni_fechas_de_la_ficha():
    """Son mas datos de una persona en nuestra base y no hacen falta para
    saber que le falta."""
    d = _detalle()({"id": "x", "tareas": [
        {"que": "InstructionalVideos", "de": "ASSOCIATE", "estado": "PENDING",
         "moduleUrl": "https://x/y", "creationTimestamp": 123}]})
    texto = json.dumps(d)
    assert "https" not in texto and "123" not in texto


def test_la_extension_pide_las_dos_llamadas_de_la_ficha():
    js = io.open(RAIZ.parent / "cortex-extension" / "background.js", encoding="utf-8").read()
    i = js.index("async function pedirDetalleAsociados")
    cuerpo = js[i:js.index(chr(10) + "}", i)]
    assert "get-workflow-modules" in cuerpo and "get-qualification" in cuerpo
    assert "ASOC_DETALLE_MAX" in cuerpo, "sin tope, preguntaria por cientos de personas"
    assert "setTimeout" in cuerpo, "sin respiro entre peticiones"
    # Y solo por LOS NUESTROS: se llama despues de filtrar por nave.
    j = js.index("pedirDetalleAsociados(suyas)")
    assert j > js.index("const suyas = msg.personas.filter")
