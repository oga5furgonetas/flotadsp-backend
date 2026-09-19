# -*- coding: utf-8 -*-
"""Un Transporter ID puesto en una ficha se CONTRASTA con lo que dice Amazon.

EL CASO (19-09-2026). En Diarios, el ID `A2S2HK9FC8JOUX` estaba colgado de
ALBERTO VAZQUEZ ARIAS. La pagina de Amazon dice que es Alberto Brion Pineiro —
que ni siquiera tiene ficha—. Se habia elegido en un desplegable, la pantalla
enseñaba el nombre con la misma seguridad que uno bueno, y «quitarlo» solo
vaciaba `transporter_id`: como la ficha tenia OTRO ID en `driver_id`, quedaba
con dos IDs de Amazon distintos y no habia forma de deshacerlo desde la pantalla.

Los tests leen las funciones REALES de `server.py` (gotcha 40).
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
    raise AssertionError("no existe %s" % nombre)


def _cargar():
    amb = {"re": re}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in (
                "_RELLENO_NOMBRE", "_DIA_TID"):
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
        if isinstance(n, ast.FunctionDef) and n.name in (
                "_sin_tildes", "_palabras_nombre", "_nombres_veredicto", "_ids_veredictos"):
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<s>", "exec"), amb)  # noqa: S102
    for k in ("_nombres_veredicto", "_ids_veredictos"):
        assert k in amb, k
    return amb


AMB = _cargar()
VER, VEREDICTOS = AMB["_nombres_veredicto"], AMB["_ids_veredictos"]


def test_alberto_vazquez_no_es_alberto_brion():
    """Compartir el nombre de pila no hace a dos personas la misma."""
    assert VER("ALBERTO VAZQUEZ ARIAS", "Alberto Brion Pineiro") == "no"


def test_el_mismo_nombre_escrito_de_otra_manera_si_coincide():
    # tildes, orden de apellidos, mayusculas, y un segundo apellido de mas o de menos
    assert VER("belen fernandez lariño", "Belen Fernandez Larino") == "si"
    assert VER("ALVARO MACARRILLA FONTENLA", "Alvaro Fontenla Macarrilla") == "si"
    assert VER("ALEX FANDIÑO", "Alex Fandino Otero") == "si"
    assert VER("Marcio Luis De Souza Laino", "MARCIO LUIS DE SOUZA LAINO") == "si"


def test_una_errata_no_convierte_a_nadie_en_otra_persona():
    """'Birichinag' y 'Birichinaga': en produccion hay 'ALINNE SOARES CARLVALHO'
    y otras. Una errata no puede salir como «no coincide»."""
    assert VER("PABLO FRANCISCO BIRICHINAG", "Pablo Francisco Birichinaga") == "si"
    assert VER("ALINNE SOARES CARLVALHO", "Alinne Soares Carvalho") == "si"


def test_dos_nombres_compuestos_comunes_no_son_la_misma_persona():
    """JOSE MANUEL y JUAN CARLOS son de media plantilla: compartir dos palabras
    no basta si el resto es distinto."""
    assert VER("JOSE MANUEL ARES VILAS", "Jose Manuel Martinez Mosquera") == "no"
    assert VER("JUAN CARLOS LOPEZ GARCIA", "Juan Carlos Lamadrid Perez") == "no"


def test_un_apellido_distinto_es_parcial_y_no_alarma():
    assert VER("JOSE LUIS AGRELO", "Jose Luis Paz") == "parcial"


def test_con_una_sola_palabra_no_se_afirma_nada():
    assert VER("Manuel", "Manuel Zamorano") is None
    assert VER("", "Manuel Zamorano") is None


def _ficha(fid, nombre, tid=None, did=None):
    return {"id": fid, "name": nombre, "center": "DGA1", "transporter_id": tid, "driver_id": did}


def _am(nombre, votos=3, roster=True, discrepan=False):
    return {"nombre": nombre, "votos": votos, "roster": roster, "discrepan": discrepan}


TID = "A2S2HK9FC8JOUX"


def test_la_ficha_con_el_id_de_otro_sale_como_no_coincide():
    r = VEREDICTOS([_ficha("f1", "ALBERTO VAZQUEZ ARIAS", TID, "AHZX4BL1DZOL2")],
                   {TID: _am("Alberto Brion Pineiro", 2, roster=False)}, {})
    d = {x["transporter_id"]: x for x in r}
    assert d[TID]["estado"] == "no_coincide"
    assert d[TID]["amazon_nombre"] == "Alberto Brion Pineiro"
    # Y se ve que la ficha tiene dos IDs de Amazon distintos.
    assert d[TID]["ids_distintos"] and d[TID]["otro_id"] == "AHZX4BL1DZOL2"


def test_un_solo_voto_suelto_no_acusa_a_nadie():
    """Sin el roster y con un solo dia visto no hay evidencia firme: no es un
    «no coincide», es «sin dato». Acusar con un dato flojo es el falso positivo."""
    r = VEREDICTOS([_ficha("f1", "ALBERTO VAZQUEZ ARIAS", TID)],
                   {TID: _am("Alberto Brion Pineiro", 1, roster=False)}, {})
    assert r[0]["estado"] == "sin_dato"


def test_si_las_fuentes_de_amazon_se_contradicen_no_se_acusa():
    r = VEREDICTOS([_ficha("f1", "ALBERTO VAZQUEZ ARIAS", TID)],
                   {TID: _am("Alberto Brion Pineiro", 5, discrepan=True)}, {})
    assert r[0]["estado"] == "discrepan"


def test_lo_confirmado_por_una_persona_no_vuelve_a_salir():
    """«Es el mismo, usa el apellido de casada»: se confirma la PAREJA."""
    a = {TID: _am("Alberto Brion Pineiro")}
    f = [_ficha("f1", "ALBERTO VAZQUEZ ARIAS", TID)]
    assert VEREDICTOS(f, a, {TID: "f1"})[0]["estado"] == "confirmado"
    # Confirmado para OTRA ficha no vale para esta.
    assert VEREDICTOS(f, a, {TID: "otra"})[0]["estado"] == "no_coincide"


def test_sin_nombre_de_amazon_no_es_un_esta_bien():
    r = VEREDICTOS([_ficha("f1", "ALBERTO VAZQUEZ ARIAS", TID)], {}, {})
    assert r[0]["estado"] == "sin_dato"


def test_los_dos_campos_de_la_ficha_se_comprueban():
    """El ID solo en `driver_id` tambien cuenta (gotcha 79)."""
    r = VEREDICTOS([_ficha("f1", "ALBERTO VAZQUEZ ARIAS", None, TID)],
                   {TID: _am("Alberto Brion Pineiro")}, {})
    assert r[0]["estado"] == "no_coincide" and r[0]["campo"] == "driver_id"


def test_un_id_que_no_parece_de_amazon_se_ignora():
    r = VEREDICTOS([_ficha("f1", "ALBERTO VAZQUEZ ARIAS", "pendiente")], {}, {})
    assert r == []


def test_quitar_un_id_lo_quita_de_los_dos_campos():
    """«Quitar» dijo «ok, quitado de 0» cuando el ID estaba solo en `driver_id`:
    el arreglo no arreglaba nada y no avisaba."""
    src = _fuente("asignar_id_conductor")
    assert 'for c in ("transporter_id", "driver_id")' in src
    assert '$unset' in src and "x[\"campos\"]" in src


def test_asignar_frena_si_amazon_dice_que_es_otra_persona():
    src = _fuente("asignar_id_conductor")
    assert "_amazon_nombres" in src and "_nombres_veredicto" in src
    assert "Amazon dice que %s es" in src, "no dice lo que dice Amazon"
    assert 'data.get("forzar") is True' in src, "sin un forzar consciente se salta la comprobacion"


def test_cada_cambio_de_id_queda_apuntado():
    src = _fuente("asignar_id_conductor")
    assert "transporter_id_cambios" in src and '"antes"' in src


def test_el_relleno_automatico_no_da_dos_ids_a_una_ficha():
    """`sin-transporter` miraba solo `transporter_id`: a una ficha con el ID en
    `driver_id` le proponia otro y quedaba con dos."""
    src = _fuente("_drivers_sin_transporter")
    assert 'f.get("driver_id")' in src
