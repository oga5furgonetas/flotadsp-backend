# -*- coding: utf-8 -*-
"""Dos personas a la vez en la plantilla diaria, sin que una borre a la otra.

EL FALLO, reproducido contra produccion el 04-09-2026 en este orden exacto:

  1. Mery escribe en la fila 0                 -> revision 2
  2. Judit escribe en la fila 1                -> revision 3 (Judit se la queda)
  3. Judit marca una ruta en rojo              -> PUT de la hoja entera, rev 3
  4. la fila 0 vuelve a estar VACIA, HTTP 200, sin un solo aviso

El control de version no salvaba nada por algo que no se ve leyendo el codigo:
guardar UNA celda devuelve la revision nueva y el cliente se la queda, pero no
recarga los datos. Con la revision al dia y los datos viejos, el siguiente
guardado completo pasa la comprobacion y pisa.

Estos casos no pueden montar Mongo, asi que vigilan lo que hace falta que siga
siendo verdad EN EL CODIGO: que el guardado completo ya no escriba, y que cada
cambio pequeno use una operacion que no pueda pisar a la otra persona
(`$addToSet` / `$pull` / `$push`). Es un trinquete: si alguien vuelve a meter un
`$set` de la hoja entera, esto se pone rojo.

Probado reintroduciendo el fallo: devolviendo el `update_one` de `state` a
`guardar_plantilla_compartida` falla `test_el_guardado_completo_ya_no_escribe`.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")
FUENTE = io.open(RUTA, encoding="utf-8-sig").read()
ARBOL = ast.parse(FUENTE)


def _cuerpo(nombre: str, con_docstring: bool = True) -> str:
    """El codigo fuente de una funcion, buscada por nombre.

    Con `con_docstring=False` se quita el texto explicativo: un comentario que
    NOMBRA un campo no es tocarlo, y sin esto el caso de las horas fallaba por
    su propia documentacion — un falso positivo de manual.
    """
    for n in ast.walk(ARBOL):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == nombre:
            if not con_docstring and ast.get_docstring(n):
                sin_doc = ast.AsyncFunctionDef if isinstance(n, ast.AsyncFunctionDef) else ast.FunctionDef
                copia = sin_doc(name=n.name, args=n.args, body=n.body[1:], decorator_list=[],
                                returns=None, type_comment=None, type_params=[])
                return ast.unparse(ast.fix_missing_locations(copia))
            return ast.get_source_segment(FUENTE, n) or ""
    raise AssertionError("no existe %s en server.py" % nombre)


def _constante(nombre: str):
    for n in ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == nombre:
            return ast.literal_eval(n.value)
    raise AssertionError("no existe la constante %s" % nombre)


def test_el_guardado_completo_ya_no_escribe():
    c = _cuerpo("guardar_plantilla_compartida", con_docstring=False)
    assert "update_one" not in c, "el guardado de la hoja entera ha vuelto a escribir"
    assert "$set" not in c, "sigue escribiendo la hoja"
    assert "409" in c, "tiene que contestar 409 para que la pestana vieja recargue"


def test_una_pestana_vieja_no_puede_borrar():
    # Un despliegue no cierra el navegador de nadie: la pantalla que alguien
    # tenga abierta desde por la manana sigue mandando el guardado completo.
    c = _cuerpo("guardar_plantilla_compartida")
    assert "raise HTTPException(409" in c
    # Y antes de rechazar comprueba el centro: un 409 no puede ser una forma de
    # averiguar si existe la plantilla de otra empresa.
    assert "allowed_centers" in c


def test_las_marcas_no_mandan_la_lista_entera():
    c = _cuerpo("plantilla_compartida_marca", con_docstring=False)
    assert "$addToSet" in c and "$pull" in c, "una marca tiene que ir sola, no la lista"
    assert "state.rows" not in c, "marcar un color no puede tocar las filas"


def test_anadir_fila_usa_push():
    c = _cuerpo("plantilla_compartida_anadir_fila")
    assert "$push" in c, "con $push, si las dos anaden una fila salen las dos"


def test_quitar_fila_comprueba_que_es_la_misma():
    # Sin `ruta_ref`, si la otra persona anadio o quito filas entre medias los
    # indices bailan y se borraria la fila equivocada: un dato falso.
    c = _cuerpo("plantilla_compartida_quitar_fila")
    assert "ruta_ref" in c and "409" in c


def test_la_celda_comprueba_la_ruta_de_su_fila():
    c = _cuerpo("plantilla_compartida_celda")
    assert "ruta_ref" in c and "409" in c


def test_pegar_horas_solo_toca_las_horas():
    c = _cuerpo("plantilla_compartida_horas", con_docstring=False)
    for campo in ("conductor", "movil", "furgo", "observaciones"):
        assert campo not in c, "pegar horas no puede tocar %s" % campo


def test_las_marcas_son_las_cuatro_de_la_pantalla():
    marcas = _constante("_PLANTILLA_MARCAS")
    assert set(marcas) == {"red_routes", "yellow_routes", "pink_furgos", "marked_conductors"}


def test_las_celdas_editables_no_incluyen_nada_raro():
    # La lista blanca es lo que impide que por `/celda` se escriba en cualquier
    # campo del documento.
    celdas = _constante("_PLANTILLA_CELDAS")
    assert set(celdas) == {"ruta", "conductor", "movil", "furgo",
                           "h_salida", "h_bajada", "h_llegada", "observaciones"}


def main() -> int:
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_") and callable(fn) and nombre != "test_todos_los_casos":
            try:
                fn()
                print("  ok  %s" % nombre)
            except AssertionError as e:
                fallos += 1
                print("  MAL %s: %s" % (nombre, e))
    print("\n%d fallos" % fallos)
    return 1 if fallos else 0


def test_todos_los_casos():
    assert main() == 0


if __name__ == "__main__":
    sys.exit(main())
