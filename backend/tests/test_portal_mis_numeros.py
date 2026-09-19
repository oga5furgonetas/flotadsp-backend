# -*- coding: utf-8 -*-
"""«Mis numeros» del portal: un campo, UNA forma.

EL FALLO, visto en los errores que la propia app se reporta (19-09-2026, seis
veces el dia 18): `undefined is not an object (evaluating
'a.centro.entregados.toLocaleString')`. Pantalla en blanco para el conductor.

La causa no estaba en el portal, sino en el endpoint: `centro` salia como
OBJETO `{codigo, dcr, entregados}` en el camino normal y como el CODIGO DEL
CENTRO (un texto) cuando la ficha aun no tiene emparejado su id de Cortex. El
portal pinta ese bloque con `datos?.centro &&`, y un texto no vacio pasa ese
guard perfectamente: reventaba en `.entregados`.

Es la misma familia que el gotcha 59 —una clave que significa dos cosas— y
tiene la misma cura: **el mismo nombre no puede devolver dos formas**. Y el
guard del cliente mira el DATO que va a usar, no el bloque que lo contiene.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = io.open(os.path.join(RAIZ, "server.py"), encoding="utf-8-sig").read()
PORTAL = io.open(os.path.join(RAIZ, "..", "frontend-v2", "src", "pages", "driver",
                              "MisNumeros.jsx"), encoding="utf-8").read()


def _cuerpo(nombre):
    for n in ast.walk(ast.parse(SERVER)):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == nombre:
            return ast.get_source_segment(SERVER, n)
    raise AssertionError("no existe %s en server.py" % nombre)


def _nombre_del_endpoint():
    """El endpoint de `/portal/mis-numeros`, buscado por su decorador."""
    arbol = ast.parse(SERVER)
    for n in ast.walk(arbol):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for d in n.decorator_list:
                txt = ast.get_source_segment(SERVER, d) or ""
                if "portal/mis-numeros" in txt:
                    return n.name
    raise AssertionError("ya no existe el endpoint /portal/mis-numeros")


def test_centro_es_siempre_un_objeto_o_nada_nunca_un_texto():
    cuerpo = _cuerpo(_nombre_del_endpoint())
    assert '"centro": center' not in cuerpo, (
        "`centro` vuelve a salir como el codigo del centro en texto: el portal "
        "pasa su guard con un texto y revienta al leer `centro.entregados`")
    assert '"sin_transporter": True' in cuerpo, "falta la rama de la ficha sin emparejar"
    # Y la rama sin transporter tiene que decir `None`, que es lo unico que el
    # cliente sabe interpretar como «no hay bloque».
    rama = cuerpo.split('"sin_transporter": True')[1][:220]
    assert '"centro": None' in rama, "la rama sin transporter no devuelve `centro: None`"


def test_el_portal_mira_el_dato_que_va_a_usar():
    """Un guard sobre el bloque no protege del campo que falta dentro."""
    assert "datos?.centro?.entregados != null" in PORTAL, (
        "el portal vuelve a comprobar solo `datos?.centro`")
    assert "{datos?.centro && (" not in PORTAL


def test_todos_los_casos():
    fallos = 0
    for nombre, f in sorted(globals().items()):
        if nombre.startswith("test_") and callable(f) and nombre != "test_todos_los_casos":
            try:
                f()
                print("ok  ", nombre)
            except Exception as ex:                              # noqa: BLE001
                fallos += 1
                print("FALLA", nombre, repr(ex))
    assert fallos == 0, "%d fallos" % fallos


if __name__ == "__main__":
    try:
        test_todos_los_casos()
    except AssertionError as ex:
        print(ex)
        sys.exit(1)
    sys.exit(0)
