# -*- coding: utf-8 -*-
"""El Daily Report que entra solo: que se GUARDE, y solo si cuadra.

POR QUE EXISTE ESTE FICHERO, con el caso real delante:

El 14-09-2026 la extension consiguio por fin bajarse tres Daily Reports y
mandarlos. El backend contesto `ok: true` con un resumen impecable —18
conductores, 6 DNR, 27 filas de RTS, y el cruce del resumen con el detalle
cuadrando al dedillo— y **no guardo ni una sola fila**.

`pegar_diario` sin `confirmar` SOLO LEE: es el paso de revision que hace una
persona antes de importar. La version automatica se quedaba ahi. Desde fuera se
veia igual que un exito: el unico modo de notarlo era ir a contar filas en la
base de datos.

Un exito de mentira es peor que un error, porque nadie va a buscarlo.

Lo que se prueba aqui:
  · que la entrada automatica CONFIRME (o no guarda nada);
  · que NO confirme cuando el informe no cuadra —el lector cruza la columna DNR
    del resumen con las filas del detalle, conductor a conductor—, porque media
    tabla importada en silencio es el dato falso que parece bueno;
  · que un informe sin filas tampoco se guarde;
  · y que todo intento quede apuntado, salga bien o mal: sin rastro se acaba
    adivinando, que es lo que costo cuatro rondas (gotcha 65).

Se lee de `server.py` con `ast` (gotcha 40).
"""
import ast
import io
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"
_TEXTO = io.open(SERVER, encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)


def _fuente(nombre):
    for n in ast.walk(_ARBOL):
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == nombre:
            return chr(10).join(_TEXTO.splitlines()[n.lineno - 1:n.end_lineno])
    raise AssertionError("no existe %s en server.py" % nombre)


SRC = _fuente("cortex_ingest_informe")


def test_la_entrada_automatica_confirma_o_no_guarda_nada():
    """Sin `confirmar`, `pegar_diario` solo lee y devuelve el resumen.

    Es exactamente lo que paso: resumen perfecto, cero filas guardadas.
    """
    assert '"confirmar": True' in SRC, (
        "sin confirmar, el informe se lee y NO se guarda: un exito de mentira")


def test_no_se_guarda_un_informe_que_no_cuadra():
    """El lector cruza la columna DNR del resumen con las filas del detalle.

    Si no cuadra, el informe llego a medias. Media tabla importada en silencio
    es peor que no importar nada: los numeros salen y estan mal.
    """
    assert "descuadres" in SRC
    # Y el orden importa: primero se lee, se mira si cuadra, y SOLO despues se
    # confirma. Al reves, se guardaria y luego se comprobaria.
    assert SRC.index("descuadres") < SRC.index('"confirmar": True')


def test_un_informe_vacio_tampoco_se_guarda():
    """Una pagina que no es el informe puede parsear a cero sin dar error."""
    assert "vacio" in SRC and "sin filas" in SRC


def test_se_apunta_todo_intento_salga_bien_o_mal():
    """Sin rastro de los fallos se acaba mirando el sitio equivocado.

    Paso: cuatro rondas buscando el fallo en el descubrimiento de enlaces, que
    funcionaba, porque los intentos rechazados no dejaban nada (gotcha 65).
    """
    assert SRC.count("_anotar(") >= 4, "hay caminos de salida que no dejan rastro"
    anotar = _fuente("_anotar")
    for campo in ('"ok"', '"motivo"', '"bytes"', '"cabeza"'):
        assert campo in anotar, "falta %s en el apunte" % campo


def test_el_centro_lo_dice_el_documento():
    """El titulo pone «ES TDSL OGA5 Daily Report ...» y eso manda sobre lo que
    mande la extension: puede estar mirando una nave y el informe ser de otra,
    y eso colgaria los DNR a la gente equivocada."""
    pegar = _fuente("pegar_diario")
    assert 'p.get("centro") or data.get("center")' in pegar, (
        "si manda el centro de la peticion, un informe de DGA1 entraria como OGA5")


def test_el_lector_es_el_de_siempre():
    """No hay un segundo lector para la entrada automatica: se llama al mismo
    `pegar_diario` que usa el pegado a mano. Dos lectores del mismo documento
    acaban con uno viejo (gotcha 40)."""
    assert "await pegar_diario(" in SRC
    assert "_parsea_diario_html" not in SRC, "esto no debe parsear por su cuenta"
