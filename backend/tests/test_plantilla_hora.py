# -*- coding: utf-8 -*-
"""La hora de ola de la plantilla cae SIEMPRE en la rejilla de 20 minutos.

Las olas salen a xx:00, xx:20 y xx:40 (Mery, 03-09-2026). Cortex enseña la hora
unos minutos DESPUES de la ola, y el codigo restaba 12 minutos fijos: eso solo
acierta si el desfase es exactamente 12. En una plantilla real de DGA1 del
01-09-2026, 8 de 18 filas tenian horas como 11:50 —que no existe como ola— y
habia que corregirlas a mano.

Lo que se prueba, y es lo que hace segura la regla nueva:
  1. la hora resultante SIEMPRE cae en la rejilla;
  2. donde la regla vieja ya acertaba, la nueva da EXACTAMENTE lo mismo.

Se lee la funcion real de server.py con `ast` (gotcha 40).
Probado reintroduciendo el fallo: con la resta de 12 minutos, el caso 12:02
devuelve 11:50 y el primer test falla.
"""
import ast
import io
import os
import sys
from datetime import datetime, timedelta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")


def _cargar():
    arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
    cuerpo = []
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_OLA_MINUTOS":
            cuerpo.append(n)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in ("_normalizar_hora_cortex", "_calc_horas"):
            cuerpo.append(n)
    ns = {"datetime": datetime, "timedelta": timedelta}
    exec(compile(ast.Module(body=cuerpo, type_ignores=[]), RUTA, "exec"), ns)
    for f in ("_normalizar_hora_cortex", "_calc_horas", "_OLA_MINUTOS"):
        assert f in ns, "no encontrado en server.py: %s" % f
    return ns


NS = _cargar()
OLA = NS["_OLA_MINUTOS"]


def _mins(h):
    a, b = h.split(":")
    return int(a) * 60 + int(b)


def test_la_hora_siempre_cae_en_la_rejilla():
    """Cualquier hora que enseñe Cortex acaba en xx:00, xx:20 o xx:40."""
    for hh in range(0, 24):
        for mm in range(0, 60):
            r = NS["_normalizar_hora_cortex"]("%02d:%02d" % (hh, mm))
            assert r, "no deberia quedarse vacia con %02d:%02d" % (hh, mm)
            assert _mins(r) % OLA == 0, "%02d:%02d -> %s, fuera de la rejilla" % (hh, mm, r)


def test_no_cambia_lo_que_ya_salia_bien():
    """Donde la regla vieja (restar 12) acertaba, la nueva da lo mismo.

    Es la garantia de que esto no rompe ninguna plantilla que hoy sale bien.
    """
    for hh in range(0, 24):
        for mm in range(0, 60):
            crudo = "%02d:%02d" % (hh, mm)
            t = datetime.strptime(crudo, "%H:%M")
            viejo = (t - timedelta(minutes=12)).strftime("%H:%M")
            if _mins(viejo) % OLA == 0:                 # la vieja acertaba
                assert NS["_normalizar_hora_cortex"](crudo) == viejo, crudo


def test_el_caso_que_reporto_mery():
    """12:02 en Cortex es la ola de las 12:00, no las 11:50."""
    assert NS["_normalizar_hora_cortex"]("12:02") == "12:00"
    assert NS["_normalizar_hora_cortex"]("11:32") == "11:20"     # el caso de siempre
    assert NS["_normalizar_hora_cortex"]("11:59") == "11:40"
    assert NS["_normalizar_hora_cortex"]("12:00") == "12:00"


def test_las_otras_dos_horas_cuelgan_de_la_ola():
    """Bajada 10 min antes y llegada 30 antes, que es como las escribe la nave."""
    llegada, bajada = NS["_calc_horas"]("12:00")
    assert bajada == "11:50" and llegada == "11:30"
    assert NS["_calc_horas"]("") == ("", "")
    assert NS["_calc_horas"]("no es una hora") == ("", "")


def test_lo_que_no_es_hora_no_se_inventa():
    for malo in ("", None, "abc", "25:99"):
        assert NS["_normalizar_hora_cortex"](malo) == ""


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
    print("%d fallos" % fallos)
    return 1 if fallos else 0


def test_todos_los_casos():
    assert main() == 0


if __name__ == "__main__":
    sys.exit(main())
