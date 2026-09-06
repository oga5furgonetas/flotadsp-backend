# -*- coding: utf-8 -*-
"""La foto anotada no puede volver a preguntarle a Gemini si ya le pregunto.

QUE PASABA. `/inspections/{id}/annotated` le pedia a Gemini las cajas de daños
EN VIVO, en cada visita, y no apuntaba la respuesta en ninguna parte. Medido
contra produccion el 06-09-2026: **34,5 s** para una inspeccion de 4 fotos, y
esos son 4 tiros de una cuota gratuita de unas 20 al dia. Abrir cinco fichas
por la mañana dejaba sin IA al resto del dia — al analisis de verdad, no solo
a este dibujo. Le pasa al 3% de las inspecciones (121 de 4.196): las que no
tienen detecciones de YOLO guardadas NI daños en su analisis.

LAS DOS TRAMPAS, que son las que prueba esto:

1. Cuando la furgoneta esta bien, Gemini contesta una lista VACIA. Si se
   comprueba «¿hay cajas guardadas?» mirando la longitud, ese vacio parece
   «no hay nada guardado» y se vuelve a preguntar en cada visita — o sea, la
   cache no sirve justo en el caso mas frecuente. Por eso se mira la MARCA
   (`source == "gemini_anotada"`) y no la lista.

2. Un fallo de cuota tambien devuelve una lista vacia. Guardar ESE vacio
   dejaria la foto sin daños para siempre. Por eso `_detectar_cajas_danos`
   devuelve `(cajas, contesto)` y solo se guarda si contesto.

Y no puede tragarse los registros de YOLO: un registro de YOLO sin detecciones
tiene que seguir su camino de siempre (daños del analisis, y si tampoco hay,
Gemini), que es el comportamiento que ya habia.

La funcion se saca de `server.py` con `ast` (gotcha 40).
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


_cajas_de_cache = _sacar_funcion("_cajas_de_cache")

CAJA = {"label": "rayón", "severity": "leve", "box_2d": [10, 10, 90, 90]}

CASOS = [
    # (que hay guardado, que tiene que devolver, por que importa)
    (None, None, "no hay nada guardado: hay que preguntar"),
    ({}, None, "documento vacio: hay que preguntar"),
    ({"source": "yolo", "detections": [CAJA]},
     None, "lo de YOLO no es nuestra cache: sigue el camino de siempre"),
    ({"source": "yolo", "detections": []},
     None, "YOLO sin detecciones tampoco: comportamiento intacto"),
    ({"source": "yolo+gemini", "detections": [CAJA]},
     None, "el cruce YOLO+Gemini tampoco es nuestro"),
    ({"source": "gemini_anotada", "detections": []},
     [], "LA CLAVE: ya contesto «no hay daños» y NO se vuelve a preguntar"),
    ({"source": "gemini_anotada", "detections": [CAJA, CAJA]},
     [CAJA, CAJA], "ya contesto con daños: se usan los guardados"),
    ({"source": "gemini_anotada"},
     [], "guardado sin la clave detections: sigue contando como preguntado"),
    ({"source": "gemini_anotada", "detections": None},
     [], "detections a nulo: igual, no se vuelve a preguntar"),
]


def probar():
    fallos = []
    for guardado, esperado, porque in CASOS:
        obtenido = _cajas_de_cache(guardado)
        if obtenido != esperado:
            fallos.append("con %r esperaba %r y da %r  (%s)"
                          % (guardado, esperado, obtenido, porque))
    # Que NO devuelva el mismo objeto: si el que llama toca la lista, no puede
    # ensuciar el documento que vino de Mongo.
    doc = {"source": "gemini_anotada", "detections": [CAJA]}
    salida = _cajas_de_cache(doc)
    salida.append(CAJA)
    if len(doc["detections"]) != 1:
        fallos.append("devuelve la MISMA lista del documento: tocarla ensucia el original")
    return fallos, len(CASOS) + 1


def test_cache_cajas():
    fallos, _ = probar()
    assert not fallos, "\n".join(fallos)


if __name__ == "__main__":
    fallos, total = probar()
    for f in fallos:
        print("  " + f)
    print("%d/%d" % (total - len(fallos), total))
