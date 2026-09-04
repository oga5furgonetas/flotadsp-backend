# -*- coding: utf-8 -*-
"""El corte de la tabla DSC no puede depender del azar.

`/cortex/dsc` ordena a los conductores por `exceso` y se queda con los 40
primeros. Ordenando SOLO por ese numero, quien ocupa el puesto 40 lo decide el
orden en que Mongo devuelve un `$group` — que no esta definido y cambia.

Medido en produccion el 05-09-2026 con `dias=30`, dos peticiones seguidas con
los MISMOS datos (total identico, 174.150 paquetes, mismo reparto en los 17
contextos): MARCKSON FELIPE (10,5) salia en una y Borja Salvado (10,5) en la
otra. Y dos conductores empatados en 12,1 se intercambiaban de sitio.

Por pantalla no parece un fallo, parece que el dato se ha movido. En una tabla
que sirve para hablar con una persona, eso es peor que un error visible.

La regla se saca de `server.py` con `ast` en vez de copiarla (gotcha 40).
"""
import io
import re
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"


def _clave_real():
    """La `key=` con la que ordena el endpoint, sacada del fichero de verdad."""
    txt = io.open(SERVER, encoding="utf-8-sig").read()
    # Hay tres `conductores.sort(` en el fichero (pendientes, exceso y dcr):
    # el de DSC es el que ordena por `exceso`, y se busca por eso y no por
    # numero de linea, que se mueve con cada cambio.
    ms = [m for m in re.finditer(r"conductores\.sort\(key=(lambda c: [^\n]*?)\)\n", txt)
          if '"exceso"' in m.group(1)]
    assert len(ms) == 1, "esperaba UN sort por exceso, hay %d" % len(ms)
    return eval(ms[0].group(1))                                # noqa: S307


CLAVE = _clave_real()


def _ordena(filas):
    return [f["driver_id"] for f in sorted(filas, key=CLAVE)][:3]


# Tres conductores, dos de ellos EMPATADOS en exceso: el caso real.
BASE = [
    {"driver_id": "A", "exceso": 12.1, "entregas": 900},
    {"driver_id": "B", "exceso": 10.5, "entregas": 3362},
    {"driver_id": "C", "exceso": 10.5, "entregas": 431},
    {"driver_id": "D", "exceso": 9.0, "entregas": 5000},
]


def test_el_orden_no_depende_de_como_lleguen():
    """Es la prueba del fallo: las 24 permutaciones tienen que dar lo mismo."""
    import itertools
    esperados = {tuple(_ordena(list(p))) for p in itertools.permutations(BASE)}
    assert len(esperados) == 1, "el orden cambia segun llegan: %s" % esperados


def test_manda_el_exceso():
    assert _ordena(BASE)[0] == "A"


def test_con_el_mismo_exceso_manda_quien_mas_mueve():
    """B y C empatan en 10,5; B lleva 3.362 entregas y C 431."""
    orden = _ordena(BASE)
    assert orden.index("B") < orden.index("C")


def test_empate_total_lo_cierra_el_id():
    filas = [{"driver_id": "Z", "exceso": 5.0, "entregas": 100},
             {"driver_id": "A", "exceso": 5.0, "entregas": 100}]
    assert [f["driver_id"] for f in sorted(filas, key=CLAVE)] == ["A", "Z"]
    assert [f["driver_id"] for f in sorted(filas[::-1], key=CLAVE)] == ["A", "Z"]


def test_un_driver_id_nulo_no_revienta():
    """Hay 94 paquetes de Cortex sin `driver_id` (gotcha 14): el desempate no
    puede ser el sitio donde eso salga a la luz."""
    filas = [{"driver_id": None, "exceso": 5.0, "entregas": 10},
             {"driver_id": "A", "exceso": 5.0, "entregas": 10}]
    sorted(filas, key=CLAVE)
    sorted(filas[::-1], key=CLAVE)


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
