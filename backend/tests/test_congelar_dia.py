# -*- coding: utf-8 -*-
"""La regla que decide si una foto del dia sustituye a la guardada.

Por que se prueba esto y no otra cosa del modulo: es el unico punto donde un
error se vuelve PERMANENTE. Si un dia se guarda con menos fallos de los que
tuvo, al dia siguiente los paquetes ya se han re-repartido y no hay forma de
recuperarlo. Todo lo demas del modulo se puede volver a calcular.

Contexto medido el 30-08-2026 contra cuatro capturas de Cortex (OGA5):
a los 3 dias se ha borrado el 97 % de las devoluciones del dia.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _cargar_regla():
    """Saca `_snap_mejora` de server.py sin importar el backend entero.

    server.py arranca conexiones al importarse, asi que se extrae solo esa
    funcion del arbol sintactico. Se lee del fichero de verdad —no una copia—
    porque una copia dejaria de probar el codigo que corre.
    """
    src = io.open(os.path.join(RAIZ, "server.py"), encoding="utf-8-sig").read()
    for n in ast.parse(src).body:
        if isinstance(n, ast.FunctionDef) and n.name == "_snap_mejora":
            mod = ast.Module(body=[n], type_ignores=[])
            ns = {"Optional": __import__("typing").Optional}
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), ns)
            return ns["_snap_mejora"]
    raise AssertionError("_snap_mejora no esta en server.py")


CASOS = [
    # (que pasa, prev, fallos, cerrado, antiguedad_d, esperado)
    ("sin foto previa, del dia de hoy: se guarda",
     None, 0, False, 0, True),
    ("sin foto previa, de ayer: se guarda (aun no erosionado)",
     None, 12, False, 1, True),

    # Lo que motiva la guarda: los dias anteriores al despliegue ya perdieron
    # sus devoluciones. Guardarlos ahora daria un numero que parece medido y no
    # lo es. Un hueco se ve; un dato falso no.
    ("sin foto previa, de hace 3 dias: NO se inventa",
     None, 4, True, 3, False),
    ("sin foto previa, de hace 10 dias: NO se inventa",
     None, 0, True, 10, False),

    ("mas fallos en un dia cerrado: gana la nueva",
     {"fallos": 40, "cerrado": True}, 95, True, 0, True),
    ("menos fallos en un dia cerrado: NO degrada",
     {"fallos": 95, "cerrado": True}, 4, True, 0, False),
    ("los mismos fallos: no se reescribe por reescribir",
     {"fallos": 95, "cerrado": True}, 95, True, 0, False),

    # El caso que motiva todo: el dia siguiente el re-reparto borra los fallos.
    # Si esta regla dejara pasar la foto erosionada, el dia quedaria falseado
    # para siempre y ademas PARECERIA medido.
    ("la erosion del dia siguiente no puede pisar la foto buena",
     {"fallos": 130, "cerrado": True}, 34, True, 1, False),

    # Y el contrario: a media tarde hay paquetes contados como fallo que aun se
    # van a entregar. Esa foto no puede pisar la de un dia cerrado aunque tenga
    # MAS fallos, que es justo lo que la haria colarse por el maximo.
    ("una foto de media tarde no pisa una de dia cerrado, ni con mas fallos",
     {"fallos": 90, "cerrado": True}, 400, False, 0, False),
    ("una foto de dia cerrado siempre gana a una de media tarde",
     {"fallos": 400, "cerrado": False}, 90, True, 0, True),
    ("entre dos fotos de media tarde manda el maximo",
     {"fallos": 50, "cerrado": False}, 80, False, 0, True),
    ("entre dos de media tarde, la menor no degrada",
     {"fallos": 80, "cerrado": False}, 50, False, 0, False),

    # Un `prev` sin el campo no puede reventar: los primeros documentos de una
    # coleccion nueva salen siempre incompletos de algun sitio.
    ("un prev sin 'fallos' se trata como cero",
     {"cerrado": True}, 1, True, 0, True),
    ("un prev sin 'cerrado' se trata como no cerrado",
     {"fallos": 10}, 20, True, 0, True),
]


def test_todos_los_casos():
    assert main() == 0


def main():
    mejora = _cargar_regla()
    fallos = 0
    for que, prev, n, cerrado, antig, esperado in CASOS:
        try:
            got = mejora(prev, n, cerrado, antig)
        except Exception as e:                                   # noqa: BLE001
            print("  REVIENTA  %s -> %s" % (que, e))
            fallos += 1
            continue
        if got != esperado:
            print("  MAL       %s\n            prev=%r fallos=%d cerrado=%s antig=%dd"
                  " -> %s (esperado %s)"
                  % (que, prev, n, cerrado, antig, got, esperado))
            fallos += 1
        else:
            print("  ok        %s" % que)
    print("\n%d casos, %d fallos" % (len(CASOS), fallos))
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
