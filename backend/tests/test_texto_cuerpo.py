# -*- coding: utf-8 -*-
"""`_texto_cuerpo`: lo mismo que antes, salvo donde antes habia un 500.

Un campo de texto del cuerpo se leia con `(data.get("x") or "").strip()`, que es
correcto mientras llegue texto y revienta en cuanto no lo es: una lista, un
objeto o un booleano no tienen `.strip()`. Medido contra staging el 05-09-2026
mandando a cada endpoint SUS PROPIOS campos con el tipo cambiado, **43 de las
216 mutaciones devolvian «Error interno del servidor»**, dos de ellas publicas.

Lo que hace segura la sustitucion —y es justo lo que se prueba aqui— es que
**donde la forma vieja no reventaba, la nueva da exactamente lo mismo**. Si eso
se cumple, ningun endpoint puede cambiar de comportamiento con datos buenos, que
es el unico riesgo de reescribir 37 sitios de golpe. Es el mismo argumento que
el gotcha 51 con las horas del cuadrante.

La funcion se saca de `server.py` con `ast` en vez de copiarla (gotcha 40): una
copia deja de probar el codigo que corre en cuanto alguien toca el original.
"""
import ast
import io
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"


def _sacar_funcion(nombre):
    fuente = io.open(SERVER, encoding="utf-8-sig").read()
    for n in ast.parse(fuente).body:
        if isinstance(n, ast.FunctionDef) and n.name == nombre:
            mod = ast.Module(body=[n], type_ignores=[])
            ambito = {}
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), ambito)  # noqa: S102
            return ambito[nombre]
    raise AssertionError("no esta %s en server.py" % nombre)


_texto_cuerpo = _sacar_funcion("_texto_cuerpo")


def _forma_vieja(v):
    """Lo que habia antes. Revienta con lo que no es texto: eso es el bug."""
    return (v or "").strip()


# Todo lo que la forma vieja aguantaba sin reventar.
BUENOS = [None, "", "  ", "hola", "  hola  ", "\n hola \t", 0, "0", False, [], {}]


def test_donde_no_reventaba_da_exactamente_lo_mismo():
    for v in BUENOS:
        assert _texto_cuerpo(v) == _forma_vieja(v), repr(v)


def test_lo_que_antes_reventaba_ahora_da_vacio():
    """Vacio a proposito: asi la validacion de despues contesta su 400 con su
    mensaje, en vez de un 500 sin ninguno."""
    for v in (["a", "b"], {"a": 1}, True, ("a",), {1, 2}):
        try:
            _forma_vieja(v)
            reventaba = False
        except AttributeError:
            reventaba = True
        assert reventaba, "este ya no reventaba: %r" % (v,)
        assert _texto_cuerpo(v) == "", repr(v)


def test_un_numero_pasa_a_su_texto():
    """12345 es lo que quiso escribir quien lo mando; antes era un 500."""
    assert _texto_cuerpo(12345) == "12345"
    assert _texto_cuerpo(3.5) == "3.5"


def test_true_no_es_texto_aunque_sea_int_en_python():
    """`isinstance(True, int)` es cierto: sin la guarda explicita, un booleano
    se colaria como el texto 'True' y se guardaria un centro llamado True."""
    assert _texto_cuerpo(True) == ""
    assert _texto_cuerpo(False) == ""


def test_el_maximo_recorta():
    assert _texto_cuerpo("x" * 500, 10) == "x" * 10
    assert _texto_cuerpo("  hola  ", 3) == "hol"


def test_sin_maximo_no_recorta():
    assert len(_texto_cuerpo("x" * 5000)) == 5000


def main():
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_") and callable(fn):
            try:
                fn()
                print("  ok        %s" % nombre)
            except AssertionError as e:
                fallos += 1
                print("  FALLA     %s: %s" % (nombre, e))
    print("\n%d fallos" % fallos)
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
