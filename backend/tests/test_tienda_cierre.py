# -*- coding: utf-8 -*-
"""El cierre de la tanda cae SIEMPRE en el dia que toca, y hoy cuenta.

La tienda funciona por tandas: se recogen pedidos hasta el viernes y el lunes
se encarga todo junto. La fecha de cierre es lo que agrupa los pedidos, asi
que un error de un dia parte una tanda en dos —y dos medias tandas no llegan
al minimo, o sea que no se lanza ninguna—.

LAS DOS TRAMPAS:

1. Si HOY es viernes, tiene que cerrar HOY, no el viernes que viene. Quien
   pide el viernes por la mañana espera entrar en esta tanda; con `+7` se
   quedaria fuera y no lo entenderia nadie.
2. La hora es 23:59, no 00:00: cerrar a medianoche del viernes es cerrar el
   jueves por la noche.

La funcion se saca de `server.py` con `ast` (gotcha 40).
"""
import ast
import io
from datetime import datetime, timedelta, timezone
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"


def _cargar(nombre, ambito=None):
    arbol = ast.parse(io.open(SERVER, encoding="utf-8-sig").read())
    amb = dict(ambito or {})
    for n in arbol.body:
        if isinstance(n, ast.FunctionDef) and n.name == nombre:
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), amb)  # noqa: S102
            return amb[nombre]
    raise AssertionError("no esta %s en server.py" % nombre)


class _Reloj:
    """Un `datetime` que dice la hora que le mandemos, para poder probar."""
    def __init__(self, cuando):
        self.cuando = cuando

    def now(self, tz=None):
        return self.cuando


def cierre_en(momento, dia_cierre):
    fn = _cargar("_tienda_cierre", {"datetime": _Reloj(momento), "timedelta": timedelta,
                                    "timezone": timezone})
    return datetime.fromisoformat(fn(dia_cierre))


VIERNES = 4
# Lunes 7 de septiembre de 2026 (weekday 0) para tener una semana entera fija.
LUNES = datetime(2026, 9, 7, 10, 0, tzinfo=timezone.utc)

CASOS = [
    (LUNES, VIERNES, "2026-09-11", "el lunes cierra el viernes de esa semana"),
    (LUNES + timedelta(days=3), VIERNES, "2026-09-11", "el jueves, el viernes de al lado"),
    (LUNES + timedelta(days=4, hours=1), VIERNES, "2026-09-11",
     "EL VIERNES POR LA MAÑANA CIERRA HOY, no dentro de siete dias"),
    (LUNES + timedelta(days=4, hours=13), VIERNES, "2026-09-11",
     "el viernes por la tarde, todavia hoy"),
    (LUNES + timedelta(days=5), VIERNES, "2026-09-18", "el sabado ya es la tanda siguiente"),
    (LUNES + timedelta(days=6), VIERNES, "2026-09-18", "el domingo tambien"),
    (LUNES, 0, "2026-09-07", "con cierre en lunes, un lunes cierra hoy"),
    (LUNES, 6, "2026-09-13", "con cierre en domingo"),
]


def probar():
    fallos = []
    for momento, dia, esperado, porque in CASOS:
        c = cierre_en(momento, dia)
        if c.date().isoformat() != esperado:
            fallos.append("el %s (%s) -> cierre %s, esperaba %s  (%s)"
                          % (momento.date(), momento.strftime("%a"), c.date(), esperado, porque))
        if (c.hour, c.minute) != (23, 59):
            fallos.append("el cierre del %s es a las %02d:%02d y tiene que ser 23:59  (%s)"
                          % (c.date(), c.hour, c.minute, porque))
        if c.weekday() != dia:
            fallos.append("el cierre cae en weekday %d y se pidio %d" % (c.weekday(), dia))

    # El cierre nunca puede quedar en el pasado: agruparia el pedido en una
    # tanda ya cerrada y no lo veria nadie.
    for momento, dia, _e, _p in CASOS:
        if cierre_en(momento, dia) < momento:
            fallos.append("el cierre queda ANTES de ahora con %s" % momento)

    # Y dos pedidos del mismo dia tienen que caer en la MISMA tanda: si no, se
    # parten y ninguna llega al minimo.
    a = cierre_en(LUNES, VIERNES)
    b = cierre_en(LUNES + timedelta(hours=8), VIERNES)
    if a != b:
        fallos.append("dos pedidos del mismo dia caen en tandas distintas: %s y %s" % (a, b))
    return fallos, len(CASOS) * 3 + 2


def test_tienda_cierre():
    fallos, _ = probar()
    assert not fallos, "\n".join(fallos)


if __name__ == "__main__":
    fallos, total = probar()
    for f in fallos:
        print("  " + f)
    print("%d/%d" % (total - len(fallos), total))
