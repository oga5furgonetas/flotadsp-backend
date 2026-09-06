# -*- coding: utf-8 -*-
"""El filtro de ruido del traductor tiene que valer para los DOS motores.

Cuando el traductor del navegador reescribe el DOM, React intenta insertar un
nodo donde ya no esta y revienta. No falla nada nuestro, asi que ese error se
descarta antes de guardarlo y antes de avisar por Telegram.

EL FALLO QUE PRUEBA ESTO: el filtro miraba solo la frase de Chrome («not a
child of this node»). WebKit lo dice de otra forma —«The object can not be
found here.»— y por eso el 06-09-2026 un iPhone metio el mismo error del
traductor en `client_errors` y desperto un aviso. Es exactamente la misma
equivocacion que ya se cometio en `lib/chunkError.js`, donde los iPhone no se
curaban solos porque Safari nombra distinto un chunk roto: un mensaje de
navegador NO es una constante, cambia con el motor.

Los dos mensajes de aqui son literales, copiados de `client_errors` de
produccion, y los que NO deben filtrarse tambien: asi esta prueba falla tanto
si el filtro se queda corto como si se pasa y esconde un bug de verdad.

La condicion se saca de `server.py`, no se copia (gotcha 40): una copia deja de
probar el codigo que corre en cuanto alguien toca el original.
"""
import io
import re
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"


def _sacar_condicion():
    """Envuelve el bloque REAL del filtro en una funcion que devuelve bool."""
    fuente = io.open(SERVER, encoding="utf-8-sig").read().split("\n")
    ini = next(i for i, l in enumerate(fuente) if l.strip().startswith("_FRASES_DOM = ("))
    fin = next(i for i in range(ini, len(fuente))
               if "ignorado" in fuente[i] and "traductor" in fuente[i])
    cuerpo = fuente[ini:fin + 1]
    cuerpo[-1] = re.sub(r"return .*", "return True", cuerpo[-1])
    src = "def _es_traductor(message, stack):\n" + "\n".join(cuerpo) + "\n    return False\n"

    class _Log:
        def info(self, *a, **k):
            pass

    ambito = {"logger": _Log()}
    exec(compile(src, "<server:filtro>", "exec"), ambito)  # noqa: S102
    return ambito["_es_traductor"]


es_traductor = _sacar_condicion()


# Los dos, literales de produccion. Mismo fallo, distinto motor.
RUIDO = [
    ("Chrome/Blink, 24-08-2026",
     "Failed to execute 'insertBefore' on 'Node': The node before which the new "
     "node is to be inserted is not a child of this node.",
     "NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before "
     "which the new node is to be inserted is not a child of this node.\n"
     "    at To (https://flotadsp.com/assets/v2/index-BYP0rfvP.js"),
    ("WebKit (Chrome en iPhone), 06-09-2026",
     "The object can not be found here.",
     "insertBefore@[native code]\n"
     "Ro@https://flotadsp.com/assets/v2/index-BtiUxFN1.js:41:25731\n"
     "At@https://flotadsp.com/assets/v2/index-BtiUxFN1.js:41:30959"),
]

# Fallos NUESTROS de verdad, tambien literales de `client_errors`. Ninguno puede
# colarse por este filtro: esconder uno cuesta horas de pantalla en negro.
NUESTROS = [
    ("import olvidado", "ThOrden is not defined", "ReferenceError: ThOrden is not defined\n    at Vehiculos"),
    ("import olvidado (WebKit)", "Can't find variable: useOrden", "useOrden@https://flotadsp.com/assets/v2/Vehiculos.js"),
    ("chunk envenenado", "undefined is not an object (evaluating 'y._result.default')", "at Ie"),
    ("chunk envenenado", "Cannot read properties of undefined (reading 'default')", "at lazy"),
    ("bundle viejo", "s is not a function", "TypeError: s is not a function\n    at ApoyoRuta"),
    ("sin WebGL", "Error creating WebGL context.", "at Object.createContext"),
    ("chunk sin curar", "chunk sin curar tras tres intentos: 'text/html' is not a valid JavaScript MIME type", ""),
    # La frase de WebKit SIN la señal dura: cualquier otro fallo de DOM nuestro
    # diria lo mismo y hay que verlo.
    ("frase de WebKit sin insertBefore", "The object can not be found here.",
     "removeChild@[native code]\n    at nuestroCodigo"),
    # Y al reves: insertBefore en la pila pero un fallo nuestro de verdad.
    ("insertBefore con fallo nuestro", "Cannot read properties of null (reading 'nombre')",
     "at insertBefore\n    at Conductores"),
]


def probar():
    fallos = []
    for etiqueta, msg, stack in RUIDO:
        if not es_traductor(msg, stack):
            fallos.append("NO se filtra el ruido del traductor [%s]: %r" % (etiqueta, msg[:60]))
    for etiqueta, msg, stack in NUESTROS:
        if es_traductor(msg, stack):
            fallos.append("SE FILTRA un fallo nuestro [%s]: %r" % (etiqueta, msg[:60]))
    return fallos, len(RUIDO) + len(NUESTROS)


def test_ruido_traductor():
    fallos, _ = probar()
    assert not fallos, "\n".join(fallos)


if __name__ == "__main__":
    fallos, total = probar()
    for f in fallos:
        print("  " + f)
    print("%d/%d" % (total - len(fallos), total))
