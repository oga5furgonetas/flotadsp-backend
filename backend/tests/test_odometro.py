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
from datetime import datetime

ODO_SALTO_MAX_DIA = 900


def _odo_sospechosas(hist: list) -> list:
    """Indices del historico que no pueden ser ciertos.

    SE BUSCA LA CADENA VALIDA MAS LARGA, y lo que queda fuera es lo malo. Dos
    intentos anteriores fallaron por comparar de dos en dos:

      · Contra la lectura anterior a secas: un pico marca ADEMAS el dato bueno
        que viene detras, porque respecto al pico ha "bajado". Se limpiaba el
        error y se tiraba el dato correcto.
      · Contra el ultimo punto bueno, con los siguientes como confirmacion: en
        la 2851 NGX hay CUATRO lecturas malas seguidas (253030 y 271000 x3), y
        entre ellas se confirman. El algoritmo se dejaba convencer y marcaba
        como mala la serie buena entera.

    Con la cadena mas larga eso no pasa: 4 lecturas malas nunca ganan a 26
    buenas. Es la mayoria la que define que es normal, no el vecino.

    LOS DIAS SE CUENTAN DESDE LA PRIMERA VEZ QUE SE VIO ESE KILOMETRAJE. El
    cuentakilometros se queda pegado dias entre inspecciones: la 4523MZG
    marcaba 56518 del 9 al 17 de agosto y el 18 puso 57682. Contando de un dia
    para otro son 1.164 km/dia e imposible; contando desde que se vio por
    primera vez son nueve dias y 129 km/dia, que es su ritmo normal.
    """
    puntos = []
    for i, h in enumerate(hist or []):
        if h.get("descartada"):
            continue
        km = h.get("km")
        f = _fecha_suave(h.get("date"))
        if isinstance(km, (int, float)) and not isinstance(km, bool) and f:
            puntos.append((i, int(km), f))
    if len(puntos) < 3:
        # Con dos lecturas no hay mayoria que valga: cualquiera de las dos
        # podria ser la mala y marcar una al azar es peor que no marcar.
        return []
    puntos.sort(key=lambda x: (x[2], x[1]))
    n = len(puntos)

    # Primera vez que se vio cada kilometraje: es desde donde cuenta el salto.
    primera = {}
    for _, km, f in puntos:
        if km not in primera or f < primera[km]:
            primera[km] = f

    def _encaja(a, b):
        """b puede venir despues de a en una misma cadena real."""
        if b[1] < a[1]:
            return False                      # un cuentakilometros no baja
        dias = max(1, (b[2] - primera.get(a[1], a[2])).days)
        return (b[1] - a[1]) / dias <= ODO_SALTO_MAX_DIA

    # Cadena valida mas larga (n es de decenas: O(n^2) sobra).
    largo = [1] * n
    prev = [-1] * n
    for b in range(n):
        for a in range(b):
            if largo[a] + 1 > largo[b] and _encaja(puntos[a], puntos[b]):
                largo[b] = largo[a] + 1
                prev[b] = a
    fin = max(range(n), key=lambda k: (largo[k], puntos[k][2]))
    buena = set()
    k = fin
    while k != -1:
        buena.add(k)
        k = prev[k]

    # Si la cadena no llega ni a la mitad, esta serie es un caos y marcar la
    # mitad de las lecturas seria inventar: mejor no tocar nada y que lo mire
    # una persona.
    if len(buena) * 2 < n:
        return []

    malos = []
    for k in range(n):
        if k in buena:
            continue
        idx, km, f = puntos[k]
        malos.append((idx, "%d km no encaja con la serie de esta furgoneta" % km))
    return malos


def _fecha_suave(x):
    try:
        return datetime.fromisoformat(str(x).replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:                                        # noqa: BLE001
        try:
            return datetime.strptime(str(x)[:10], "%Y-%m-%d")
        except Exception:                                    # noqa: BLE001
            return None




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
