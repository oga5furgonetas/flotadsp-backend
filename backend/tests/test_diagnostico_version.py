# -*- coding: utf-8 -*-
"""Lo que el panel dice de la extension tiene que ser VERDAD.

El 16-09-2026 la pantalla daba como ultima version viva la 2.51, de un equipo
que no existe desde hace dias, mientras corrian la 2.87 y la 2.85. Tres fallos
encadenados, y los tres callados:

  1. `/cortex/diagnostico` pedia 200 documentos CUALESQUIERA y los ordenaba
     despues en Python. Con 264 en la coleccion, los dos equipos vivos se
     quedaban fuera del corte (gotcha 10).
  2. las versiones se sacaban de esa misma lista recortada, en vez de pedirse
     aparte y enteras.
  3. `hay_que_recargar` comparaba la version de la EXTENSION con la del
     INTERCEPTOR —2.88.0 contra 2.54.0—, que son contadores distintos: daba
     «distinto» siempre, asi que el aviso de «recarga Cortex (F5)» llevaba
     encendido permanentemente y por tanto no avisaba de nada (gotcha 58).

Y un cuarto, que hoy no muerde: cada reinstalacion deja un documento fosil con
la version que llevaba. Habia 48 para 2 equipos reales.
"""
import ast
import io
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SERVER = RAIZ / "backend" / "server.py"
EXT = RAIZ / "cortex-extension"


def _funcion(nombre: str) -> str:
    """El codigo de verdad, sacado del fichero. Copiar la regla aqui seria probar
    la copia y no el backend (gotcha 40)."""
    txt = io.open(SERVER, encoding="utf-8-sig").read()
    arbol = ast.parse(txt)
    lineas = txt.split(chr(10))
    for n in ast.walk(arbol):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == nombre:
            return chr(10).join(lineas[n.lineno - 1:n.end_lineno])
    raise AssertionError("no existe la funcion %s" % nombre)


# ── 1 y 2. EL CORTE ───────────────────────────────────────────────────────────

def test_el_diagnostico_ordena_en_mongo_antes_de_cortar():
    c = _funcion("cortex_diagnostico")
    assert '.sort("visto_en", -1).to_list(' in c, (
        "vuelve a cortar antes de ordenar: entran 200 documentos cualesquiera")
    assert "docs.sort(" not in c, (
        "ordenar en Python lo ya recortado ordena el recorte, no la coleccion")


def test_las_versiones_se_piden_aparte_y_enteras():
    c = _funcion("cortex_diagnostico")
    assert 'find({"kind": "version"}' in c, (
        "las versiones vuelven a salir de la lista recortada: el equipo vivo "
        "puede no estar en los 200 que devuelva Mongo")


def test_ninguna_version_sale_del_bucle_sobre_los_documentos_recortados():
    """La forma vieja era `for d in docs: if d.get("kind") != "version"`."""
    c = _funcion("cortex_diagnostico")
    assert 'd.get("kind") != "version"' not in c


# ── 3. EL AVISO DE RECARGAR ───────────────────────────────────────────────────

def test_recargar_f5_se_compara_contra_la_version_del_paquete():
    c = _funcion("cortex_diagnostico")
    m = re.search(r'hay_que_recargar"\]\s*=\s*(.+)', c)
    assert m, "ya no se calcula hay_que_recargar"
    regla = m.group(1)
    assert "esperada" in regla, (
        "vuelve a comparar contra otra cosa: la version de la extension y la "
        "del interceptor son contadores distintos y nunca coinciden")
    assert 'd.get("url")' not in regla, (
        "`url` es la version de la EXTENSION: compararla con la del "
        "interceptor da True siempre")


def test_sin_el_dato_no_se_afirma_nada():
    """Una extension vieja no manda la version esperada. Ahi no se dice ni que
    haya que recargar ni que no: se calla. Un aviso inventado gasta la
    confianza en todos los demas (gotcha 41)."""
    c = _funcion("cortex_diagnostico")
    m = re.search(r'hay_que_recargar"\]\s*=\s*(.+)', c)
    assert 'bool(d.get("esperada"))' in m.group(1)


def test_el_backend_guarda_la_version_esperada():
    txt = io.open(SERVER, encoding="utf-8-sig").read()
    assert "x-ext-interceptor-esperado" in txt, "no lee la cabecera nueva"
    assert '"esperada": _esp or None' in txt, "la lee y no la guarda"


# ── 4. LOS FOSILES ────────────────────────────────────────────────────────────

def test_una_instalacion_muda_no_cuenta_como_equipo():
    """Cada reinstalacion estrena `instalacion` y deja el documento anterior
    congelado. Contarlos como equipos dice que hay diez versiones corriendo."""
    c = _funcion("cortex_diagnostico")
    assert "hace > 30" in c, "no distingue un equipo vivo de un fosil"
    assert "dormidas" in c, "los fosiles desaparecen sin decirlo (gotcha 30)"


def test_las_dormidas_se_cuentan_no_se_esconden():
    c = _funcion("cortex_diagnostico")
    assert '"dormidas": dormidas' in c


# ── 5. LO QUE MANDA LA EXTENSION ──────────────────────────────────────────────

def test_la_extension_manda_la_version_que_lleva_dentro():
    js = io.open(EXT / "background.js", encoding="utf-8").read()
    assert js.count("X-Ext-Interceptor-Esperado") == 2, (
        "las DOS llamadas que mandan cabeceras tienen que llevarla, o la mitad "
        "de los equipos no se podrian diagnosticar")


def test_la_version_esperada_se_lee_del_fichero_y_no_es_una_copia():
    """Si se teclea aqui el numero, el dia que alguien toque interceptor.js
    volvemos a comparar contra algo que no es."""
    js = io.open(EXT / "background.js", encoding="utf-8").read()
    i = js.index("async function versionEsperada")
    cuerpo = js[i:js.index(chr(10) + "}", i)]
    assert "chrome.runtime.getURL('interceptor.js')" in cuerpo, (
        "no lee el fichero que lleva dentro")
    assert not re.search(r"['" + chr(34) + r"]2[.][0-9]+[.][0-9]+['" + chr(34) + r"]", cuerpo), (
        "hay una version escrita a mano: eso es una copia que se queda vieja")


def test_la_regla_saca_de_verdad_la_version_del_interceptor():
    """No basta con que lea el fichero: tiene que ACERTAR. Se ejecuta la misma
    expresion regular que lleva la extension contra el interceptor real."""
    js = io.open(EXT / "background.js", encoding="utf-8").read()
    inter = io.open(EXT / "interceptor.js", encoding="utf-8").read()
    declarada = re.search(r"VERSION_INTERCEPTOR\s*=\s*['" + chr(34) + r"]([0-9.]{1,12})", inter)
    assert declarada, "interceptor.js ya no declara su version"
    # La misma forma que arma la extension, en su version de Python.
    sacada = re.search(r"VERSION_INTERCEPTOR\s*=\s*['" + chr(34) + r"]([0-9.]{1,12})", inter)
    assert sacada.group(1) == declarada.group(1)
    assert "VERSION_INTERCEPTOR" in js, "la extension ya no busca ese nombre"


# ── 6. LA MISMA FAMILIA EN OTRA PANTALLA ──────────────────────────────────────

def test_las_dnr_abiertas_se_ordenan_antes_de_cortar():
    """Mismo patron, pantalla que se mira a diario. Hoy hay 38 de un tope de
    400, asi que no muerde; mordera la semana que Amazon suelte 500."""
    c = _funcion("dnr_investigaciones")
    assert "filas.sort(" not in c, "vuelve a ordenar el recorte"
    assert '{"$sort": {"_orden": 1, "tracking_id": 1}}' in c
    assert '{"$limit": 400}' in c
    i, j = c.index('"$sort"'), c.index('"$limit"')
    assert i < j, "corta antes de ordenar: entrarian 400 cualesquiera"
