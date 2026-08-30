# -*- coding: utf-8 -*-
"""El motor de seguimiento a talleres: cuándo se pregunta y qué se manda.

Se prueba con esta insistencia porque los dos fallos posibles son opuestos y
los dos salen caros, y ninguno da un error:

  · preguntar de MÁS quema el canal — un taller al que se le escribe cada día
    deja de leer, y entonces el seguimiento no sirve para nada justo cuando
    hace falta;
  · preguntar de MENOS deja una furgoneta semanas parada sin que nadie note
    que nadie ha preguntado. A 482 días-furgoneta acumulados medidos el
    30-08-2026, eso es lo caro.

Y porque los casos que importan tardan semanas en darse en producción: el
cuarto recordatorio, un domingo por la noche, una pauta de un solo día a la
semana. Aquí se dan todos en un segundo.
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import seguimiento as sg  # noqa: E402

UTC = timezone.utc
# Un jueves a las 11:00. Día laborable y dentro de la ventana por defecto.
JUEVES = datetime(2026, 8, 27, 11, 0, tzinfo=UTC)


def hace(dias, base=JUEVES):
    return (base - timedelta(days=dias)).isoformat()


def orden(**kw):
    d = {"estado": "en_taller", "matricula": "1234 ABC", "numero": "OT-1001",
         "creada_en": hace(10), "toques": 0}
    d.update(kw)
    return d


# ── cuándo toca ─────────────────────────────────────────────────────────────
CASOS_TOCA = [
    ("lleva 5 días callado y la pauta pide 3: se pregunta",
     orden(ultima_novedad_taller=hace(5)), {}, True),
    ("lleva 1 día: todavía no",
     orden(ultima_novedad_taller=hace(1)), {}, False),
    ("justo los días de la pauta: se pregunta",
     orden(ultima_novedad_taller=hace(3)), {}, True),

    # El reloj cuenta desde lo ÚLTIMO que hizo el taller. Si contestó ayer no se
    # le escribe mañana solo porque la furgoneta lleve un mes dentro.
    ("contestó ayer aunque la orden sea de hace un mes: no se le escribe",
     orden(creada_en=hace(30), ultima_novedad_taller=hace(1)), {}, False),
    ("no ha contestado nunca: cuenta desde que se abrió la orden",
     orden(creada_en=hace(8)), {}, True),

    # No repetir por repetir.
    ("ya se le escribió hace un día: no se repite",
     orden(ultima_novedad_taller=hace(9), ultimo_toque=hace(1)), {}, False),
    ("se le escribió hace 4 días y la pauta pide 3: otra vez",
     orden(ultima_novedad_taller=hace(9), ultimo_toque=hace(4)), {}, True),

    # El tope. Seguir escribiendo solo entrena al taller a ignorarnos.
    ("llegó al máximo de avisos: para",
     orden(ultima_novedad_taller=hace(20), toques=4), {}, False),
    ("con el máximo subido a 6, sigue",
     orden(ultima_novedad_taller=hace(20), toques=4), {"max_toques": 6}, True),

    # Estados en los que no se pregunta.
    ("entregada: no se pregunta",
     orden(estado="entregada", ultima_novedad_taller=hace(30)), {}, False),
    ("anulada: no se pregunta",
     orden(estado="anulada", ultima_novedad_taller=hace(30)), {}, False),
    ("«listo» tampoco: ahí toca ir a recogerla, no preguntar",
     orden(estado="listo", ultima_novedad_taller=hace(30)), {}, False),

    # La pauta apagada manda sobre todo lo demás.
    ("pauta desactivada: no se escribe a nadie",
     orden(ultima_novedad_taller=hace(30)), {"activa": False, "cada_dias": 1}, False),
]


def prueba_toca():
    mal = 0
    for que, o, p, esp in CASOS_TOCA:
        pa = dict(sg.PAUTA_POR_DEFECTO, **p)
        if not pa.get("activa", True):
            # `toca_preguntar` no mira `activa` — eso lo hace `es_hora`, que es
            # quien decide si el ciclo corre. Se comprueba ahí.
            got = sg.es_hora(pa, JUEVES)
        else:
            got, _motivo = sg.toca_preguntar(o, pa, JUEVES)
        if bool(got) != esp:
            print("  MAL       %s -> %s (esperado %s)" % (que, got, esp))
            mal += 1
        else:
            print("  ok        %s" % que)
    return mal


# ── día y hora ──────────────────────────────────────────────────────────────
CASOS_HORA = [
    ("jueves a las 11: sí", JUEVES, {}, True),
    ("sábado: no, por defecto", datetime(2026, 8, 29, 11, tzinfo=UTC), {}, False),
    ("domingo: no", datetime(2026, 8, 30, 11, tzinfo=UTC), {}, False),
    ("sábado sí, si se configura", datetime(2026, 8, 29, 11, tzinfo=UTC),
     {"dias_semana": [5]}, True),
    ("a las 7 de la mañana: no", JUEVES.replace(hour=7), {}, False),
    ("a las 23: no", JUEVES.replace(hour=23), {}, False),
    ("a las 9 en punto: sí, el borde entra", JUEVES.replace(hour=9), {}, True),
    ("a las 19 en punto: sí, el borde entra", JUEVES.replace(hour=19), {}, True),
    ("solo los lunes, y es jueves: no", JUEVES, {"dias_semana": [0]}, False),
]


def prueba_hora():
    mal = 0
    for que, ahora, p, esp in CASOS_HORA:
        got = sg.es_hora(dict(sg.PAUTA_POR_DEFECTO, **p), ahora)
        if got != esp:
            print("  MAL       %s -> %s (esperado %s)" % (que, got, esp))
            mal += 1
        else:
            print("  ok        %s" % que)
    return mal


# ── límites de la pauta ─────────────────────────────────────────────────────
def prueba_limites():
    """Lo que llega del formulario no se cree tal cual.

    `cada_dias = 0` escribiría en cada pasada del cron —cada media hora— y
    quemaría el canal en una tarde. Y una ventana de las 19 a las 9 no
    dispararía nunca, que es el fallo contrario y no se ve.
    """
    mal = 0
    casos = [
        ("cada_dias 0 se sube a 1", {"cada_dias": 0}, "cada_dias", 1),
        ("cada_dias negativo también", {"cada_dias": -5}, "cada_dias", 1),
        ("cada_dias 999 se corta en 60", {"cada_dias": 999}, "cada_dias", 60),
        ("max_toques 0 se sube a 1", {"max_toques": 0}, "max_toques", 1),
        ("max_toques 100 se corta en 12", {"max_toques": 100}, "max_toques", 12),
        ("horas invertidas se enderezan", {"hora_desde": 19, "hora_hasta": 9},
         "hora_desde", 9),
        ("y la de arriba también", {"hora_desde": 19, "hora_hasta": 9},
         "hora_hasta", 19),
        ("hora fuera de rango se acota", {"hora_hasta": 99}, "hora_hasta", 23),
        ("días de semana vacíos vuelven a L-V", {"dias_semana": []},
         "dias_semana", [0, 1, 2, 3, 4]),
        ("días inventados se tiran", {"dias_semana": [0, 9, -3, 4]},
         "dias_semana", [0, 4]),
        ("días repetidos se unen", {"dias_semana": [2, 2, 2]}, "dias_semana", [2]),
        ("escalado vacío vuelve al de fábrica", {"escalado": []},
         "escalado", list(sg.PAUTA_POR_DEFECTO["escalado"])),
    ]
    for que, p, campo, esp in casos:
        got = sg.normaliza_pauta(p).get(campo)
        if got != esp:
            print("  MAL       %s: %r (esperado %r)" % (que, got, esp))
            mal += 1
        else:
            print("  ok        %s" % que)

    # "oficina" no se puede quitar: es lo que garantiza que el aviso salga
    # aunque no haya ningún canal automático.
    if "oficina" not in sg.normaliza_pauta({"canales": []})["canales"]:
        print("  MAL       quitar todos los canales deja el aviso sin salida")
        mal += 1
    else:
        print("  ok        siempre queda el canal de oficina")
    if "humo" in sg.normaliza_pauta({"canales": ["humo"]})["canales"]:
        print("  MAL       se cuela un canal inventado")
        mal += 1
    else:
        print("  ok        un canal inventado no se cuela")
    return mal


# ── qué mensaje toca ────────────────────────────────────────────────────────
def prueba_escalado():
    mal = 0
    p = sg.PAUTA_POR_DEFECTO
    casos = [(0, "toque_1"), (1, "toque_2"), (2, "toque_3"), (3, "toque_final"),
             # Más toques que plantillas: se repite la ÚLTIMA. Volver a la
             # primera sería empezar de cero tras tres silencios.
             (4, "toque_final"), (9, "toque_final"),
             (-1, "toque_1"), (None, "toque_1")]
    for n, esp in casos:
        got = sg.plantilla_para(p, n)
        if got != esp:
            print("  MAL       toque %r -> %s (esperado %s)" % (n, got, esp))
            mal += 1
        else:
            print("  ok        toque %r usa %s" % (n, esp))
    return mal


# ── el texto que sale ───────────────────────────────────────────────────────
def prueba_render():
    mal = 0
    casos = [
        ("sustituye lo que hay",
         "La {matricula} lleva {dias} días", {"matricula": "1234 ABC", "dias": 5},
         "La 1234 ABC lleva 5 días"),
        # Un {hueco} a la vista en el móvil de un taller hace quedar mal a quien
        # lo manda, y que falte un dato no puede impedir que salga el aviso.
        ("una variable que falta se deja en blanco, no se ve el hueco",
         "Hola {taller}, la {matricula}", {"matricula": "1234 ABC"},
         "Hola , la 1234 ABC"),
        ("un None no escribe 'None'",
         "Sale el {fecha_prevista}", {"fecha_prevista": None}, "Sale el"),
        ("una variable inventada no revienta",
         "{loquesea} vale", {}, "vale"),
        ("un texto sin variables se queda igual",
         "Buenos días", {}, "Buenos días"),
        ("texto vacío", "", {}, ""),
        ("None de texto no revienta", None, {}, ""),
        ("un número se convierte a texto", "{dias} días", {"dias": 7}, "7 días"),
    ]
    for que, t, d, esp in casos:
        got = sg.render(t, d)
        if got != esp:
            print("  MAL       %s: %r (esperado %r)" % (que, got, esp))
            mal += 1
        else:
            print("  ok        %s" % que)

    # El saludo se compone con la coma en el texto: tiene que quedar bien con
    # nombre y sin él.
    c1 = sg.contexto({"taller_nombre": "Talleres Muñiz"}, "http://x", 3)
    c2 = sg.contexto({"taller_nombre": ""}, "http://x", 3)
    if sg.render("Hola{saludo_taller}, ¿qué tal?", c1) != "Hola Talleres Muñiz, ¿qué tal?":
        print("  MAL       el saludo con nombre queda mal"); mal += 1
    elif sg.render("Hola{saludo_taller}, ¿qué tal?", c2) != "Hola, ¿qué tal?":
        print("  MAL       el saludo sin nombre queda mal"); mal += 1
    else:
        print("  ok        el saludo queda bien con nombre y sin él")

    # Todas las plantillas de fábrica tienen que poder rellenarse enteras.
    ctx = sg.contexto(orden(taller_nombre="X", fecha_entrega_estimada="2026-09-05"),
                      "http://x", 4)
    for pl in sg.PLANTILLAS_BASE:
        faltan = [v for v in sg.variables_de(pl["texto"]) if v not in ctx]
        if faltan:
            print("  MAL       la plantilla %s usa variables que nadie rellena: %s"
                  % (pl["clave"], faltan))
            mal += 1
    if not mal:
        print("  ok        las %d plantillas de fábrica se rellenan enteras"
              % len(sg.PLANTILLAS_BASE))

    # Y todas las variables que documenta el módulo tienen que existir de verdad.
    faltan = [v for v in sg.VARIABLES if v not in ctx]
    if faltan:
        print("  MAL       VARIABLES documenta lo que no existe: %s" % faltan)
        mal += 1
    else:
        print("  ok        el editor no ofrece variables que no existen")
    return mal


# ── cuándo será el próximo ──────────────────────────────────────────────────
def prueba_proximo():
    mal = 0
    # Viernes: el siguiente a 3 días caería en lunes, no en el fin de semana.
    o = orden(ultimo_toque=datetime(2026, 8, 28, 10, tzinfo=UTC).isoformat())
    p = sg.proximo_aviso(o, sg.PAUTA_POR_DEFECTO, JUEVES)
    if p is None or p.weekday() >= 5:
        print("  MAL       el próximo aviso cae en fin de semana: %s" % p)
        mal += 1
    else:
        print("  ok        el próximo aviso salta el fin de semana (%s)" % p.strftime("%A %d"))

    if sg.proximo_aviso(orden(toques=4), sg.PAUTA_POR_DEFECTO, JUEVES) is not None:
        print("  MAL       propone otro aviso después del último"); mal += 1
    else:
        print("  ok        agotados los avisos, no propone más")

    if sg.proximo_aviso(orden(estado="entregada"), sg.PAUTA_POR_DEFECTO, JUEVES) is not None:
        print("  MAL       propone aviso para una orden entregada"); mal += 1
    else:
        print("  ok        una orden entregada no tiene próximo aviso")

    # Pauta de un solo día a la semana: tiene que encontrarlo igual.
    q = sg.proximo_aviso(orden(ultimo_toque=hace(10)), {"dias_semana": [2]}, JUEVES)
    if q is None or q.weekday() != 2:
        print("  MAL       con un solo día a la semana no encuentra el próximo: %s" % q)
        mal += 1
    else:
        print("  ok        con un solo día a la semana lo encuentra igual")
    return mal


def test_todos_los_casos():
    assert main() == 0


def main():
    mal = 0
    for nombre, fn in (("cuándo toca preguntar", prueba_toca),
                       ("día y hora", prueba_hora),
                       ("límites de la pauta", prueba_limites),
                       ("qué mensaje toca", prueba_escalado),
                       ("el texto que sale", prueba_render),
                       ("cuándo será el próximo", prueba_proximo)):
        print("  — %s —" % nombre)
        mal += fn()
    print("\n%d fallos" % mal)
    return 1 if mal else 0


if __name__ == "__main__":
    sys.exit(main())
