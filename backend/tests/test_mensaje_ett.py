# -*- coding: utf-8 -*-
"""El mensaje que se le manda a la ETT por WhatsApp.

Lo lee una persona de Adecco o de Gi Group y decide si mira al candidato o no,
asi que los fallos que importan aqui no revientan nada: se ven raros. Un
"Hola , te adjunto" porque esa ETT no tiene persona de contacto, o un
"Telefono:" con nada detras porque el candidato se apunto sin numero. Las dos
cosas cuentan peor que callarse, y las dos pasan solas en cuanto los datos
vienen a medias — que es lo normal.

La plantilla se puede cambiar por ETT desde el panel, asi que lo que se prueba
es la MAQUINA que la rellena, no el texto concreto. Se saca de `server.py`
(gotcha 40) para que no sea una copia que se queda vieja.
"""
import ast
import io
import re
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"
_ARBOL = ast.parse(io.open(SERVER, encoding="utf-8-sig").read())


def _cargar():
    amb = {"re": re}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_ETT_PLANTILLA":
            amb["_ETT_PLANTILLA"] = ast.literal_eval(n.value)
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name == "_ett_mensaje":
            exec(compile(ast.fix_missing_locations(ast.Module(body=[n], type_ignores=[])),  # noqa: S102
                         "<server>", "exec"), amb)
    assert "_ett_mensaje" in amb and "_ETT_PLANTILLA" in amb
    return amb["_ett_mensaje"], amb["_ETT_PLANTILLA"]


MENSAJE, PLANTILLA = _cargar()

CAND = {
    "nombre": "Bruno Filipe Loureiro Baltazar",
    "telefono": "613708882",
    "disponibilidad": "En 15 dias",
    "ciudad": "Santiago",
    "oferta_titulo": "Repartidor/a de Paqueteria",
}


def test_lleva_los_tres_datos_que_pidio_la_oficina():
    """Nombre, telefono y disponibilidad. Sin eso, la ETT tiene que preguntar."""
    t = MENSAJE({"nombre": "Adecco", "contacto": "Marta"}, CAND)
    assert "Bruno Filipe Loureiro Baltazar" in t
    assert "613708882" in t
    assert "En 15 dias" in t


def test_saluda_por_su_nombre_a_quien_lo_recibe():
    t = MENSAJE({"nombre": "Adecco", "contacto": "Marta"}, CAND)
    assert t.startswith("Hola Marta,")


def test_sin_persona_de_contacto_no_queda_una_coma_suelta():
    """«Hola , te adjunto» delata que el mensaje lo escribio una maquina."""
    t = MENSAJE({"nombre": "Gi Group"}, CAND)
    assert t.startswith("Hola, te adjunto"), t[:40]
    assert " ," not in t


def test_un_dato_que_falta_no_deja_la_etiqueta_sola():
    """El candidato sin telefono es el caso normal, no el raro."""
    c = dict(CAND, telefono="", disponibilidad="")
    t = MENSAJE({"nombre": "Adecco", "contacto": "Marta"}, c)
    assert "Telefono" not in t and "Teléfono" not in t
    assert "Disponibilidad" not in t
    assert "Bruno Filipe Loureiro Baltazar" in t, "lo que si hay se sigue mandando"


def test_los_datos_van_cada_uno_en_su_linea():
    """Al otro lado hay que copiar el nombre y el telefono a otro sistema.

    De una frase corrida se copia mal; de una linea se selecciona de un toque.
    """
    t = MENSAJE({"nombre": "Adecco", "contacto": "Marta"}, CAND)
    lineas = [x.strip() for x in t.split("\n")]
    assert "Nombre: Bruno Filipe Loureiro Baltazar" in lineas
    assert any(x.endswith("613708882") for x in lineas)


def test_una_plantilla_propia_manda_sobre_la_de_serie():
    t = MENSAJE({"nombre": "Randstad", "contacto": "Luis",
                 "plantilla": "Buenas {contacto}: {candidato} ({telefono})."}, CAND)
    assert t == "Buenas Luis: Bruno Filipe Loureiro Baltazar (613708882)."


def test_una_llave_mal_escrita_no_tumba_el_envio():
    """Alguien escribira {telefono_movil} alguna vez. Que salga tal cual es
    feo; que no se pueda enviar el candidato, peor."""
    t = MENSAJE({"nombre": "Adecco", "plantilla": "Hola {no_existe} y {candidato}"}, CAND)
    assert "Bruno" in t or "{no_existe}" in t


def test_la_plantilla_de_serie_pide_los_datos_por_su_nombre():
    for hueco in ("{candidato}", "{telefono}", "{disponibilidad}", "{contacto}"):
        assert hueco in PLANTILLA, "falta %s en la plantilla de serie" % hueco
