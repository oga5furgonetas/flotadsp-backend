# -*- coding: utf-8 -*-
"""El vigilante de la captura de Cortex.

POR QUE EXISTE. Cortex no tiene API: el dato solo sale de un navegador con la
sesion abierta y la extension puesta. Eso funciona, pero tiene un fallo que no
da error en ninguna parte — **el dia que ese ordenador se apaga o alguien
cierra la pestaña, deja de entrar todo y la aplicacion sigue enseñando lo de
ayer con la misma seguridad**. Paso el 12 y el 13-09-2026: cero paquetes los
dos dias, y no se supo hasta que alguien fue a mirar la base de datos.

Y no es un dato que se pueda recuperar despues: `cortex_packages.state` es el
estado de AHORA, y a los tres dias se ha borrado el 97 % de las devoluciones de
ese dia (gotcha 39). Un dia sin capturar es un dia perdido.

Lo que se prueba aqui son las cuatro decisiones que, si se rompen, dejan el
aviso inutil sin que nada falle:
  · que mire la INGESTA y no los paquetes —un dia tranquilo puede no traer
    paquetes nuevos un rato y eso no es una averia (gotcha 33)—;
  · que se calle de madrugada, cuando la extension duerme a proposito: un aviso
    que se equivoca cada noche deja de leerse;
  · que NO avise de quien no ha capturado nunca, que es quien todavia no ha
    puesto la extension;
  · que fije la empresa a mano en cada vuelta: es un cron sin sesion y sin eso
    miraria siempre la principal (gotcha 26).

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


def _constante(nombre):
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == nombre:
            return ast.literal_eval(n.value)
    raise AssertionError("no existe %s en server.py" % nombre)


def test_el_pulso_sale_de_la_ingesta_y_no_de_los_paquetes():
    """Un dia flojo puede pasar un rato sin paquetes nuevos y eso NO es que la
    captura este muerta. La ingesta, en cambio, habla en cada barrido."""
    src = _fuente("_captura_ultimo_pulso")
    assert "cortex_diagnostico" in src and "visto_en" in src
    assert "cortex_packages" not in src, (
        "medir por paquetes convierte un dia tranquilo en una falsa averia")


def test_de_madrugada_se_calla():
    """La extension se duerme a proposito cuando no hay nada que capturar."""
    src = _fuente("revisar_captura_viva")
    assert "CAPTURA_DESDE_H" in src and "CAPTURA_HASTA_H" in src
    assert "fuera_de_horario" in src
    desde, hasta = _constante("CAPTURA_DESDE_H"), _constante("CAPTURA_HASTA_H")
    assert 5 <= desde < hasta <= 23, (desde, hasta)


def test_quien_no_ha_capturado_nunca_no_esta_averiado():
    """Es una empresa que todavia no ha puesto la extension. Avisar de eso es
    dar la lata a quien no usa el modulo — y un aviso que molesta se silencia."""
    src = _fuente("revisar_captura_viva")
    assert "if ultimo is None:" in src and "continue" in src


def test_el_cron_fija_la_empresa_a_mano():
    """Gotcha 26: sin sesion, `db` cae siempre en la principal y las demas se
    quedarian sin vigilancia, en silencio."""
    src = _fuente("revisar_captura_viva")
    assert "set_current_org_db(o[\"db_name\"])" in src
    assert "global_db.organizations" in src


def test_un_aviso_al_dia_por_empresa():
    """Con el ordenador apagado un fin de semana, sin cerrojo salen veintiocho
    mensajes y se dejan de leer todos."""
    src = _fuente("revisar_captura_viva")
    assert "_ya_enviado_hoy" in src
    # La clave lleva la empresa dentro: si no, la primera que avise deja
    # calladas a las demas ese dia.
    assert "captura_parada_%s" in src
    # Y NO lleva la fecha dentro de la clave: eso revienta el cerrojo (gotcha 32).
    assert 'clave = "captura_parada_%s" % re.sub' in src


def test_el_silencio_admitido_es_mayor_que_el_barrido_mas_lento():
    """La extension baja a una vuelta cada 5 min cuando no se mueve nada; el
    umbral tiene que dejar sitio de sobra o avisaria de noches tranquilas."""
    assert _constante("CAPTURA_SILENCIO_MIN") >= 60
    assert _constante("CAPTURA_CADA_MIN") <= 60, "revisarlo una vez al dia llega tarde"


def test_se_puede_mirar_sin_esperar_al_aviso():
    assert "/cortex/captura-viva" in _TEXTO
    src = _fuente("cortex_captura_viva")
    assert "hace_min" in src and "parada" in src


def test_el_bucle_esta_arrancado():
    """Una funcion que nadie llama es lo mismo que no tenerla."""
    assert "asyncio.create_task(_bucle_captura_viva())" in _TEXTO
