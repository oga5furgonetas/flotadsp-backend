# -*- coding: utf-8 -*-
"""Conductores sin centro: cuando SE PUEDE afirmar la nave y cuando no.

Una ficha activa con el centro en blanco cuenta en el total y no sale en
ningun centro. Como se trabaja siempre con un centro elegido, esa persona
desaparece de todas las pantallas sin que falle nada. Medido en produccion el
05-09-2026: `GET /drivers` daba 150 activos y la suma por centro
83+47+16 = 146; uno de los cuatro que faltaban llevaba 469 paquetes en OGA5.

Lo que se prueba aqui es la REGLA, que es lo unico que puede hacer dano: poner
a alguien en la nave equivocada no se nota —la ficha parece completa— y sale en
el cuadrante que no es. Por eso solo se afirma con UNA nave y evidencia
suficiente, igual que `_centro_norm`, que tampoco adivina.

Se prueba la funcion REAL sacada de `server.py` con `ast`, sin ejecutar el
modulo (gotcha 40): una copia de la regla deja de probar el codigo que corre en
cuanto alguien toca el original.
"""
import ast
import asyncio
import io
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"


# ── El trozo de `_drivers_sin_centro` que decide, extraido del fichero real ──
#
# La funcion entera habla con Mongo; lo que se quiere probar es la decision, y
# esa vive en un bloque `if/elif` que se puede leer del AST y ejecutar tal cual.
# Asi, si alguien cambia el umbral o la condicion en `server.py`, este test lo
# ve; con la regla copiada a mano, no.
def _regla_real():
    arbol = ast.parse(io.open(SERVER, encoding="utf-8-sig").read())
    fuente = io.open(SERVER, encoding="utf-8-sig").read().split("\n")
    umbral = None
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_SIN_CENTRO_MIN_PAQUETES":
            umbral = ast.literal_eval(n.value)
    assert umbral is not None, "no esta _SIN_CENTRO_MIN_PAQUETES en server.py"

    # El bloque de decision, localizado por su primera linea.
    marca = "        sugerencia = None"
    i = next(k for k, l in enumerate(fuente) if l == marca)
    j = i
    while not fuente[j].lstrip().startswith('salida.append('):
        j += 1
    cuerpo = "\n".join(l[8:] for l in fuente[i:j])

    def decide(centros, total, tids, dias=60):
        ambito = {"centros": dict(centros), "total": total, "tids": list(tids), "dias": dias,
                  "_SIN_CENTRO_MIN_PAQUETES": umbral, "next": next, "iter": iter,
                  "len": len, "sorted": sorted, "str": str}
        exec(compile(cuerpo, "<regla>", "exec"), ambito)          # noqa: S102
        return ambito["sugerencia"], ambito["motivo"]

    return decide, umbral


DECIDE, UMBRAL = _regla_real()


def test_una_sola_nave_con_paquetes_de_sobra_se_afirma():
    """El caso de MARCOS ESPANTOSO SANDE: 469 paquetes, todos en OGA5."""
    sug, motivo = DECIDE({"OGA5": 469}, 469, ["A2S4GFBXSL9PVT"])
    assert sug == "OGA5"
    assert "469" in motivo


def test_dos_naves_no_se_afirma_nunca():
    """Poner a alguien en la nave que no es no se nota y sale en el cuadrante
    equivocado: con dos, lo dice una persona."""
    sug, motivo = DECIDE({"OGA5": 300, "DGA1": 120}, 420, ["A1"])
    assert sug is None
    assert "OGA5" in motivo and "DGA1" in motivo


def test_dos_naves_aunque_una_sea_testimonial():
    """No hay regla de mayoria a proposito: un solo paquete en otra nave puede
    ser un traslado real, y afirmarlo seria adivinar."""
    sug, _ = DECIDE({"OGA5": 500, "DGA1": 1}, 501, ["A1"])
    assert sug is None


def test_pocos_paquetes_no_bastan():
    sug, motivo = DECIDE({"OGA5": UMBRAL - 1}, UMBRAL - 1, ["A1"])
    assert sug is None
    assert str(UMBRAL - 1) in motivo


def test_justo_en_el_umbral_si_basta():
    sug, _ = DECIDE({"OGA5": UMBRAL}, UMBRAL, ["A1"])
    assert sug == "OGA5"


def test_sin_transporter_id_no_hay_nada_que_mirar():
    sug, motivo = DECIDE({}, 0, [])
    assert sug is None
    assert "Transporter ID" in motivo


def test_con_id_pero_sin_repartos_lo_dice():
    sug, motivo = DECIDE({}, 0, ["A1"], dias=60)
    assert sug is None
    assert "60" in motivo


def test_paquetes_sin_centro_no_inventan_nave():
    """Hay 127 paquetes en produccion sin campo `center` (extension antigua).
    Suman en el total pero no votan: si votaran, un dia sin centro afirmaria."""
    sug, motivo = DECIDE({}, 300, ["A1"])
    assert sug is None
    assert "300" in motivo


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
