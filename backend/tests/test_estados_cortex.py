"""Traduccion de los estados de Cortex. Cada caso salio de un fallo real.

27-08-2026. Cortex decia 104 paquetes pendientes y la app 320. La diferencia
eran dos traducciones mal hechas, las dos medidas sobre el dia completo de OGA5:

  · `PICKED_UP` se guardaba como `LOADED`. Pero PICKED_UP es una RECOGIDA que el
    conductor ya subio a la furgoneta, no un paquete que le falte por repartir.
    De los 281 paquetes que figuraban LOADED, los 281 tenian PICKED_UP como
    evento vigente y los 281 venian de un PENDING_PICKUP previo. Ninguno era
    reparto.

  · `NOT_DELIVERED` se guardaba como `DELIVERED`, porque el emparejador por
    texto busca subcadenas y "delivered" esta dentro de "not_delivered". Siete
    paquetes de ese dia figuraban entregados diciendo Cortex lo contrario: el
    conductor se los lleva a casa y nadie se los reclama. Ademas inflaba el DCR.

El emparejador por texto sigue haciendo falta para el espanol libre
("no se ha podido entregar"), asi que la guarda de negacion solo mira CODIGOS,
los que no llevan espacios. Los dos casos estan abajo.
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1] / "server.py"


def _canon():
    """Extrae el traductor de server.py sin importar el monolito entero."""
    src = RAIZ.read_text(encoding="utf-8-sig")
    ns = {"re": re}
    for nombre in ("_CORTEX_ORDER", "_CORTEX_STATES", "_CORTEX_STATE_TEXT"):
        m = re.search(r"^%s = (\[.*?\]|\{.*?\})\n(?=\S|\n)" % nombre, src, re.S | re.M)
        assert m, "no se encontro %s" % nombre
        exec(m.group(0), ns)
    m = re.search(r"^def _cortex_canon_state.*?\n(?=\n\ndef )", src, re.S | re.M)
    assert m, "no se encontro _cortex_canon_state"
    exec(m.group(0), ns)
    return ns["_cortex_canon_state"]


CASOS = [
    # (lo que manda Cortex, lo que debe quedar guardado)
    ("PICKED_UP", "PICKED_UP"),            # recogida subida: NO es reparto
    ("NOT_DELIVERED", "NOT_DELIVERED"),    # no entregado: NO es entregado
    ("UNDELIVERED", "NOT_DELIVERED"),
    ("DELIVERED", "DELIVERED"),
    ("LOADED", "LOADED"),
    ("NOT_READY", "NOT_READY"),
    ("NOT_ATTEMPTED", "LOADED"),           # aun por hacer: sigue en la furgoneta
    ("DELIVERY_ATTEMPTED", "ATTEMPTED"),
    ("PICKUP_FAILED", "UNCOLLECTED"),
    ("YOU_ARE_NEXT", "YOU_ARE_NEXT"),
    ("PENDING_PICKUP", "PENDING_PICKUP"),
    ("BACK_TO_ORIGIN", "BACK_TO_ORIGIN"),
    ("REJECTED", "ATTEMPTED"),
    # Texto libre en espanol: la guarda de negacion NO puede comerse esto.
    ("entregado en el buzon", "DELIVERED"),
    ("no se ha podido entregar", "ATTEMPTED"),
    ("devuelto a la estacion", "RETURNED"),
    ("falta el paquete", "MISSING"),
    ("", "OBSERVED"),
]


def main():
    canon = _canon()
    fallos = []
    for crudo, esperado in CASOS:
        obtenido = canon(crudo)
        if obtenido != esperado:
            fallos.append((crudo, obtenido, esperado))
    for crudo, obtenido, esperado in fallos:
        print("FALLA  %-26r -> %-18s esperaba %s" % (crudo, obtenido, esperado))
    if fallos:
        print("\n%d de %d casos mal." % (len(fallos), len(CASOS)))
        return 1
    print("estados de Cortex OK: %d casos" % len(CASOS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
