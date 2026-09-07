# -*- coding: utf-8 -*-
"""Los datos que se le dan a Google tienen que ser ciertos o no darse.

Esto alimenta el bloque `JobPosting` de Google for Jobs, y ahi un dato
inventado no es un adorno: es motivo de que Google deje de fiarse de todas tus
ofertas. Asi que las dos funciones que MAS pueden mentir —el salario y la
jornada— tienen que devolver `None` cuando no lo saben, en vez de un valor
plausible.

EL SALARIO viene escrito a mano por quien crea la oferta: «1500/2500»,
«1.500 - 2.500 €», «1800», «segun convenio». Hay que sacar el rango cuando lo
hay y NO sacar nada cuando no lo hay, sin confundirse con los otros numeros
que caben en esa casilla (un año, un codigo postal, un telefono).

Las funciones se sacan de `server.py` con `ast` (gotcha 40).
"""
import ast
import io
import re
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"


def _cargar():
    arbol = ast.parse(io.open(SERVER, encoding="utf-8-sig").read())
    ambito = {"re": re}
    for n in arbol.body:
        if isinstance(n, ast.FunctionDef) and n.name in ("_empleo_salario_rango",
                                                         "_empleo_tipo_jornada"):
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), ambito)  # noqa: S102
    faltan = [x for x in ("_empleo_salario_rango", "_empleo_tipo_jornada") if x not in ambito]
    assert not faltan, "no estan en server.py: %s" % faltan
    return ambito["_empleo_salario_rango"], ambito["_empleo_tipo_jornada"]


salario, jornada = _cargar()

SALARIOS = [
    # (lo escrito, lo esperado, por que importa)
    ("1500/2500", {"min": 1500, "max": 2500}, "la forma real de las ofertas de Dani"),
    ("1600/2500", {"min": 1600, "max": 2500}, "la otra oferta real"),
    ("1.500 - 2.500 €", {"min": 1500, "max": 2500}, "con punto de millar y simbolo"),
    ("1800", {"min": 1800, "max": 1800}, "una sola cifra: minimo y maximo iguales"),
    ("de 1400 a 2000 euros", {"min": 1400, "max": 2000}, "escrito en palabras"),
    ("1.200€-1.900€", {"min": 1200, "max": 1900}, "pegado y con simbolos"),

    ("", None, "vacio"),
    (None, None, "sin campo"),
    ("segun convenio", None, "sin cifras no se inventa un salario"),
    ("a convenir", None, "tampoco"),
    ("12", None, "12 no es un sueldo: por debajo del suelo"),
    # Este caso lo escribi al reves y lo corrigio la prueba: pensaba rechazar
    # los años, pero 2026 € es un sueldo perfectamente normal y no hay forma de
    # distinguirlo de un año. Rechazarlo tiraria sueldos buenos, que es peor.
    ("2026", {"min": 2026, "max": 2026}, "2026 € es un sueldo plausible, no se adivina que sea un año"),
    ("15700", None, "por encima del techo: no es un sueldo mensual de reparto"),
    ("15008", None, "un codigo postal tampoco"),
]

JORNADAS = [
    ("Jornada Completa", "FULL_TIME", "la de las ofertas reales"),
    ("jornada completa 40h", "FULL_TIME", "en minusculas y con horas"),
    ("Media jornada", "PART_TIME", "media jornada"),
    ("Parcial de tarde", "PART_TIME", "parcial"),
    ("", None, "vacio: no se manda employmentType"),
    ("Turnos rotativos", None, "no dice la jornada: NO se adivina"),
    ("Fines de semana", None, "tampoco"),
]


def probar():
    fallos = []
    for texto, esperado, porque in SALARIOS:
        obtenido = salario(texto)
        if obtenido != esperado:
            fallos.append("salario %r -> %r, esperaba %r  (%s)" % (texto, obtenido, esperado, porque))
    for texto, esperado, porque in JORNADAS:
        obtenido = jornada(texto)
        if obtenido != esperado:
            fallos.append("jornada %r -> %r, esperaba %r  (%s)" % (texto, obtenido, esperado, porque))

    # El rango nunca puede salir del reves: Google lo rechaza y ademas es falso.
    for texto, esperado, _p in SALARIOS:
        r = salario(texto)
        if r and r["min"] > r["max"]:
            fallos.append("el rango de %r sale invertido: %r" % (texto, r))
    return fallos, len(SALARIOS) + len(JORNADAS) + 1


def test_empleo_seo():
    fallos, _ = probar()
    assert not fallos, "\n".join(fallos)


if __name__ == "__main__":
    fallos, total = probar()
    for f in fallos:
        print("  " + f)
    print("%d/%d" % (total - len(fallos), total))
