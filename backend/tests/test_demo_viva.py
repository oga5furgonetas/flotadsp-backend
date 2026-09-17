# -*- coding: utf-8 -*-
"""La demo tiene que parecer una empresa de hoy, no una de julio."""
import ast
import io
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_NS = {"datetime": datetime, "timedelta": timedelta}
for _n in ast.parse(_TEXTO).body:
    _nombre = getattr(_n, "name", None) or (
        getattr(_n.targets[0], "id", None) if isinstance(_n, ast.Assign) else None)
    if _nombre in {"_DEMO_RUTAS", "_DEMO_PAQ_RUTA", "_DEMO_DIAS", "_DEMO_FALLOS", "_DEMO_LUGARES", "_DEMO_MOTIVOS",
                   "_DEMO_CALLES", "_demo_paquetes"}:
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102
paquetes = _NS["_demo_paquetes"]


def test_los_dias_pasados_tienen_un_dcr_creible_y_foto():
    p, fotos = paquetes("2026-09-17", 13)
    ayer = Counter(x["state"] for x in p if x["service_day"] == "2026-09-16")
    fallos = sum(v for k, v in ayer.items() if k in _NS["_DEMO_FALLOS"])
    dcr = ayer["DELIVERED"] / (ayer["DELIVERED"] + fallos) * 100
    assert 97.5 < dcr < 99.8
    assert len(fotos) == _NS["_DEMO_DIAS"] - 1
    assert len({x["tba"] for x in p}) == len(p)          # sin TBA repetidos


def test_hoy_avanza_con_el_reloj():
    temprano, _ = paquetes("2026-09-17", 7)
    mediodia, _ = paquetes("2026-09-17", 13)
    noche, _ = paquetes("2026-09-17", 22)
    hoy = lambda ps: Counter(x["state"] for x in ps if x["service_day"] == "2026-09-17")
    assert not hoy(temprano)                              # aun no ha empezado
    assert hoy(mediodia)["LOADED"] > hoy(noche)["LOADED"]  # a mediodia va mas en la calle
    assert hoy(noche)["DELIVERED"] > hoy(mediodia)["DELIVERED"]


def test_es_determinista():
    assert paquetes("2026-09-17", 13) == paquetes("2026-09-17", 13)
