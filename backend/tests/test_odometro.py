# -*- coding: utf-8 -*-
"""Que lectura del cuentakilometros sobra y cual se queda.

En `mileage_history` habia 27 lecturas imposibles de 2.517, siempre un digito
de mas o de menos: 611105 por 61110, 253030 por 25303, 1600 por 34597. Con esos
picos dentro el ritmo salia entre -6.350 y +7.616 km/dia y no se podia predecir
nada.

DOS INTENTOS ANTERIORES FALLARON, y por eso estan aqui como casos:
 · Comparando con la lectura anterior, un pico marca tambien el dato BUENO de
   detras, porque respecto al pico ha bajado.
 · Comparando con el ultimo bueno y usando los siguientes como confirmacion, la
   2851 NGX tiene CUATRO lecturas malas seguidas que se confirman entre ellas y
   tumban la serie buena entera.
El que funciona busca la cadena valida mas larga: cuatro lecturas malas no
ganan a veintiseis buenas.
"""
import ast
from datetime import datetime, timezone
from pathlib import Path

# Las funciones se leen de server.py (gotcha 40): este fichero tenia una COPIA
# y, al corregir el backend el 16-09-2026, la copia seguia pasando en verde.
_SRC = (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8-sig")
_NS = {"datetime": datetime, "timezone": timezone}
for _n in ast.parse(_SRC).body:
    _nombre = getattr(_n, "name", None) or (
        getattr(_n.targets[0], "id", None) if isinstance(_n, ast.Assign) else None)
    if _nombre in {"ODO_SALTO_MAX_DIA", "ODO_KM_IMPOSIBLE", "ODO_MAX_KM_DIA", "ODO_MAX_ABSOLUTO",
                   "_odo_sospechosas", "_fecha_suave", "_odo_margen", "_odo_ultima_fecha",
                   "_odo_lecturas"}:
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)
_odo_sospechosas = _NS["_odo_sospechosas"]


def _h(*pares):
    return [{"date": "2026-%02d-%02d" % (m, d), "km": k} for m, d, k in pares]


def test_serie_limpia_no_se_toca():
    hist = _h(*[(6, d, 10000 + d * 150) for d in range(1, 25)])
    assert _odo_sospechosas(hist) == []


def test_pico_de_un_digito():
    hist = _h((6, 1, 25167), (6, 2, 253030), (6, 3, 25400), (6, 4, 25600),
              (6, 5, 25800), (6, 6, 26000))
    assert [i for i, _ in _odo_sospechosas(hist)] == [1]


def test_cuatro_lecturas_malas_seguidas_no_ganan(  # la 2851 NGX real
):
    """El caso que tumbo la version anterior."""
    hist = _h((6, 13, 24892), (6, 15, 25167), (6, 16, 253030),
              (7, 22, 271000), (7, 23, 271000), (7, 24, 271000),
              (7, 26, 30492), (7, 28, 30992), (7, 30, 31340), (7, 31, 31635),
              (8, 1, 31805), (8, 2, 32024), (8, 3, 32195), (8, 4, 32422),
              (8, 5, 32608), (8, 6, 32795), (8, 7, 32998), (8, 8, 33178))
    malos = [i for i, _ in _odo_sospechosas(hist)]
    assert malos == [2, 3, 4, 5], malos


def test_el_km_estancado_no_es_un_salto(  # la 4523MZG real
):
    """Se queda pegado nueve dias y luego sube 1.164 km: son 129 km/dia."""
    hist = _h((8, 9, 56518), (8, 12, 56518), (8, 17, 56518), (8, 18, 57682),
              (8, 19, 57834), (8, 20, 57943), (8, 24, 58162), (8, 25, 58192))
    assert _odo_sospechosas(hist) == []


def test_el_primero_puede_ser_el_malo():
    hist = _h((7, 24, 500), (7, 26, 55655), (7, 27, 55685), (7, 28, 55700),
              (7, 30, 56000), (8, 4, 56100), (8, 7, 56298))
    assert [i for i, _ in _odo_sospechosas(hist)] == [0]


def test_con_menos_de_tres_lecturas_no_se_juzga():
    """Con dos, cualquiera podria ser la mala: marcar una al azar es peor."""
    assert _odo_sospechosas(_h((6, 1, 10000), (6, 2, 99999))) == []
    assert _odo_sospechosas(_h((6, 1, 10000))) == []


def test_una_serie_caotica_no_se_toca():
    """Si mas de la mitad no encaja, esto lo mira una persona."""
    hist = _h((6, 1, 10000), (6, 2, 90000), (6, 3, 20000), (6, 4, 80000),
              (6, 5, 30000), (6, 6, 70000))
    assert _odo_sospechosas(hist) == []


def test_las_ya_descartadas_no_se_vuelven_a_mirar():
    hist = _h((6, 1, 10000), (6, 2, 99999), (6, 3, 10400), (6, 4, 10800))
    hist[1]["descartada"] = True
    assert _odo_sospechosas(hist) == []


def test_lo_imposible_no_vota(  # la 3328 NFY real, 16-09-2026
):
    """17 lecturas copiadas de 1.880.xxx km no pueden ganar a 7 reales."""
    falsas = [(8, d, 1880404 + d) for d in range(10, 27)]
    reales = [(9, 8, 25282), (9, 9, 25485), (9, 10, 25747), (9, 11, 26052),
              (9, 12, 26257), (9, 13, 26501), (9, 14, 26773)]
    hist = _h(*falsas, *reales)
    malos = sorted(i for i, _ in _odo_sospechosas(hist))
    assert malos == list(range(17)), malos


def test_imposibles_se_marcan_aunque_queden_pocas():
    hist = _h((6, 1, 1880404), (6, 2, 25000), (6, 3, 25200))
    assert [i for i, _ in _odo_sospechosas(hist)] == [0]


def test_el_minimo_a_mano_no_es_un_dato_falso():
    """El portal no puede obligar a escribir mas que un km que sabemos falso."""
    margen = _NS["_odo_margen"]
    falsas = [(8, d, 1880404 + d) for d in range(10, 27)]
    reales = [(9, 8, 25282), (9, 9, 25485), (9, 10, 25747)]
    # km actual imposible: sin minimo
    assert margen({"mileage": 1880930, "mileage_history": _h(*falsas)})[0] == 0
    # km actual entre los malos de la serie: el minimo es el ultimo bueno
    hist = _h((6, 1, 25167), (6, 2, 25300), (6, 3, 25400), (6, 4, 253030))
    assert margen({"mileage": 253030, "mileage_history": hist})[0] == 25400
    # serie sana: el minimo es el actual, como siempre
    assert margen({"mileage": 25747, "mileage_history": _h(*reales)})[0] == 25747
