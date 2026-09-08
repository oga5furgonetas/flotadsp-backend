# -*- coding: utf-8 -*-
"""«Todos» no es un centro, y confundirlo vacia media pantalla sin fallar.

EL FALLO, medido el 08-09-2026 nada mas abrir la pantalla de Rendimiento. El
panel manda SIEMPRE el centro elegido, y cuando no hay ninguno manda `Todos`.
El endpoint hacia `_centro_norm(center)` y comparaba luego contra
`("Todos", "todos")` — pero `_centro_norm` devuelve el original EN MAYUSCULAS
cuando no reconoce el codigo, asi que «Todos» salia como «TODOS», dejaba de
coincidir con la excepcion y la consulta acababa filtrando por un centro
llamado TODOS.

Como se veia: la tabla salia con las 217 filas y la columna de ayudas llena
—las ayudas no filtran por centro—, y TODO lo demas en blanco. No es un error,
es una tabla a medias, que es justo lo que nadie reporta como bug.

Es el gotcha 12 con otra cara: alli el selector se quedaba con un solo boton
«Todos» y las pantallas pedian literalmente el centro llamado Todos.
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


def test_todos_se_mira_antes_de_normalizar():
    src = _fuente("conductores_rendimiento")
    assert 'crudo.lower() in ("", "todos")' in src, (
        "hay que mirar el centro CRUDO: `_centro_norm` lo devuelve en mayusculas "
        "y «Todos» deja de coincidir con la excepcion")


def test_no_se_compara_el_centro_ya_normalizado_contra_Todos():
    """La forma vieja, que es la que fallaba."""
    src = _fuente("conductores_rendimiento")
    assert 'centro not in ("Todos", "todos")' not in src


def test_las_dos_consultas_usan_el_mismo_centro():
    """Cortex y el reporte diario tienen que filtrar por lo mismo.

    Si una filtra y la otra no, la tabla mezcla naves en la mitad de las
    columnas y nadie lo nota: los numeros siguen saliendo.
    """
    src = _fuente("conductores_rendimiento")
    assert src.count('{"$regex": re.escape(centro), "$options": "i"}') == 2


def test_el_orden_es_deterministico():
    """Gotcha 62: sin desempate, dos peticiones seguidas devuelven la tabla en
    distinto orden y parece que el dato se ha movido."""
    src = _fuente("conductores_rendimiento")
    assert 'x["transporter"]' in src and "filas.sort" in src


def test_se_dice_hasta_donde_llega_cada_fuente():
    """Un cero en «fallos de contacto» puede ser que no haya fallado o que aun
    no haya reporte de ese dia. Sin decirlo, se lee como lo primero."""
    src = _fuente("conductores_rendimiento")
    assert '"cobertura"' in src
    assert "daily_reports" in src and "cortex_packages" in src
