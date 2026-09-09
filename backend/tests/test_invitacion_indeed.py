# -*- coding: utf-8 -*-
"""El WhatsApp que se le manda a alguien visto en Indeed para que se apunte.

Lo lee una persona en el movil y decide si entra en la web o no, asi que los
fallos que importan aqui no revientan nada: se ven mal.

  · «Hola Bruno Filipe Loureiro Baltazar,» no lo escribe nadie. Va el nombre de
    pila, que es como se saluda;
  · el enlace tiene que estar SI O SI. Un mensaje que dice «apuntate en la web»
    sin decir cual es un mensaje inutil que ademas parece que funciona;
  · la plantilla se puede cambiar desde el panel, asi que alguien escribira
    {Nombre} o {telefono} alguna vez. Que salga tal cual es feo; que el boton
    de WhatsApp deje de funcionar y no se pueda escribir a nadie, peor.

Se saca de `server.py` con `ast` (gotcha 40): una copia del texto deja de
probar el que se manda de verdad en cuanto alguien lo toca.
"""
import ast
import io
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"
_TEXTO = io.open(SERVER, encoding="utf-8-sig").read()
_ARBOL = ast.parse(_TEXTO)


def _cargar():
    amb = {}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in (
                "_INVITA_PLANTILLA", "_INVITA_ENLACE"):
            amb[n.targets[0].id] = ast.literal_eval(n.value)
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name == "_invita_mensaje":
            exec(compile(ast.fix_missing_locations(ast.Module(body=[n], type_ignores=[])),  # noqa: S102
                         "<server>", "exec"), amb)
    assert "_invita_mensaje" in amb and "_INVITA_PLANTILLA" in amb
    return amb["_invita_mensaje"], amb["_INVITA_PLANTILLA"], amb["_INVITA_ENLACE"]


MENSAJE, PLANTILLA, ENLACE = _cargar()


def test_saluda_por_el_nombre_de_pila():
    t = MENSAJE(PLANTILLA, "Bruno Filipe Loureiro Baltazar")
    assert t.startswith("Hola Bruno,"), t[:40]
    assert "Loureiro" not in t


def test_lleva_el_enlace_de_las_ofertas():
    """Sin enlace, el mensaje pide algo y no dice donde. Es el unico dato que
    de verdad tiene que llegar."""
    t = MENSAJE(PLANTILLA, "Ana")
    assert ENLACE in t
    assert ENLACE.startswith("https://")


def test_el_enlace_va_en_su_propia_linea():
    """En el movil, un enlace dentro de un parrafo se toca peor. Y se lee peor:
    la gente busca la linea azul."""
    lineas = [x.strip() for x in MENSAJE(PLANTILLA, "Ana").split("\n")]
    assert ENLACE in lineas, lineas


def test_un_nombre_vacio_no_deja_una_coma_suelta_ni_revienta():
    """Se puede guardar a alguien con el nombre a medias; no es raro."""
    t = MENSAJE(PLANTILLA, "")
    assert t.startswith("Hola")
    assert ENLACE in t


def test_una_llave_mal_escrita_no_tumba_el_envio():
    """Alguien pondra {Nombre} en mayuscula desde el panel. El mensaje sale."""
    t = MENSAJE("Hola {Nombre}, apuntate en {enlace}", "Ana")
    assert ENLACE in t, "el enlace tiene que llegar aunque la otra llave falle"


def test_una_plantilla_propia_manda_sobre_la_de_serie():
    t = MENSAJE("Buenas {nombre}: entra en {enlace}.", "Carlos Vidal")
    assert t == "Buenas Carlos: entra en %s." % ENLACE


def test_la_plantilla_de_serie_tiene_los_dos_huecos():
    for hueco in ("{nombre}", "{enlace}"):
        assert hueco in PLANTILLA, "falta %s en la plantilla de serie" % hueco


def test_el_endpoint_exige_los_dos_huecos_al_guardar():
    """Guardar un texto sin `{enlace}` deja un mensaje que no lleva a ningun
    sitio, y eso no se ve hasta que alguien no se apunta."""
    i = _TEXTO.index("async def empleo_invitados_plantilla")
    src = _TEXTO[i:i + 2000]
    assert '"{nombre}" not in texto' in src
    assert '"{enlace}" not in texto' in src


def test_abrir_whatsapp_no_es_haber_escrito():
    """Se marca en OTRA llamada, y a mano. Apuntar envios que no ocurrieron
    hace que se deje de escribir a alguien creyendo que ya esta hecho.
    """
    i = _TEXTO.index("async def empleo_invitado_crear")
    src = _TEXTO[i:i + 2500]
    assert '"escrito_en": ""' in src, "nace sin escribir, pase lo que pase"
    assert "async def empleo_invitado_escrito" in _TEXTO


def test_no_se_puede_guardar_dos_veces_el_mismo_telefono():
    """Se copia de Indeed a mano: repetir un numero es lo normal, no lo raro.
    Y quien lo para es la base, no un `if` (gotcha 46).
    """
    assert 'name="invitado_unico"' in _TEXTO
    i = _TEXTO.index("async def empleo_invitado_crear")
    assert "except DuplicateKeyError" in _TEXTO[i:i + 2500]
