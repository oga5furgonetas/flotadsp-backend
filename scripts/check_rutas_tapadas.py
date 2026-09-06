# -*- coding: utf-8 -*-
"""¿Hay alguna ruta que NUNCA se llegue a ejecutar porque otra la tapa?

POR QUE EXISTE
--------------
FastAPI prueba las rutas EN EL ORDEN EN QUE SE DECLARAN. Si
`/inspections/{inspection_id}` esta declarada antes que
`/inspections/rebuild-status`, la palabra `rebuild-status` entra como si fuera
un id: la segunda ruta no se ejecuta jamas y el servidor contesta
«Inspección no encontrada» con un 404 perfectamente correcto.

No hay error, no hay traza, no hay aviso. El frontend hace `.catch(() => {})`
y la funcion simplemente NO ESTA, en silencio, para siempre.

Ya ha pasado tres veces en este proyecto (es el gotcha 2), y las dos primeras
se arreglaron a mano acordandose. La tercera —`/inspections/rebuild-status`,
la barra de progreso de IA y Peritaje— llevaba meses muerta y no lo sabia
nadie. Acordarse no escala; esto si.

COMO LO MIRA
------------
Como lo mira FastAPI: por cada ruta, se fabrica una peticion suya de ejemplo
(sus `{parametros}` sustituidos por un valor que no puede coincidir con
ninguna palabra real) y se comprueba si alguna ruta DECLARADA ANTES, con el
MISMO metodo, ya se la habria quedado. Si es asi, esa ruta esta muerta.

Solo el mismo metodo: Starlette, si el camino encaja pero el verbo no, sigue
buscando. Un GET no tapa a un POST.
"""
import io
import re
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "backend" / "server.py"
RUTA = re.compile(r'^@api_router\.(get|post|put|patch|delete)\(\s*"([^"]+)"')
# Un valor que jamas sera un segmento literal de verdad.
RELLENO = "__param__"


def rutas():
    fuente = io.open(SERVER, encoding="utf-8-sig").read().split("\n")
    for i, linea in enumerate(fuente, 1):
        m = RUTA.match(linea)
        if m:
            yield i, m.group(1).upper(), m.group(2)


def patron(camino):
    """El camino, como expresion regular, igual que lo compila Starlette."""
    trozos = []
    for seg in camino.split("/"):
        if seg.startswith("{") and seg.endswith("}"):
            trozos.append("[^/]+" if ":path" not in seg else ".+")
        else:
            trozos.append(re.escape(seg))
    return re.compile("^" + "/".join(trozos) + "$")


def ejemplo(camino):
    """Una peticion concreta que solo esta ruta deberia atender."""
    return "/".join(RELLENO if s.startswith("{") else s for s in camino.split("/"))


def main():
    todas = list(rutas())
    vistas = []          # (metodo, patron, camino, linea) en orden de declaracion
    tapadas = []
    for linea, metodo, camino in todas:
        mio = ejemplo(camino)
        for m2, pat, c2, l2 in vistas:
            if m2 != metodo:
                continue
            if pat.match(mio):
                tapadas.append((linea, metodo, camino, l2, c2))
                break
        vistas.append((metodo, patron(camino), camino, linea))

    if tapadas:
        for linea, metodo, camino, l2, c2 in tapadas:
            print("  L%-6d %-6s %s" % (linea, metodo, camino))
            print("           la tapa %s (linea %d): nunca se ejecuta" % (c2, l2))
            print("           se arregla declarandola ANTES de esa.")
        print("\nrutas tapadas: %d muerta(s)." % len(tapadas))
        return 1
    print("rutas tapadas OK: %d rutas, ninguna la tapa otra declarada antes" % len(todas))
    return 0


if __name__ == "__main__":
    sys.exit(main())
