# -*- coding: utf-8 -*-
"""La regla que decide a quién se nombra por un golpe.

Es la función más delicada del producto: su salida es el nombre de una persona
real junto a un desperfecto. Un falso positivo aquí no es una cifra mal contada,
es una conversación injusta con un conductor.

Revisado a fondo el 30-08-2026 después de que Dani dijera que la pantalla tenía
muchos errores. Lo que estaba mal, todo medido en producción:

  · 466 de 681 daños (68 %) eran `archived` —restos de una reconstrucción de
    flota— y salían mezclados con los golpes de verdad;
  · 154 daños tenían `first_seen` con la fecha del día en que se PROCESARON, no
    la de la inspección que los vio: hasta 2,5 meses de desfase. La ventana se
    calculaba sobre esa fecha, así que podía señalar a quien condujo en agosto
    por un golpe visto en junio;
  · salían daños de furgonetas de baja y borradas (gotcha 13);
  · la lista cortaba en 600 teniendo 681 (gotcha 10);
  · la regla estaba copiada en dos endpoints y solo uno se habría arreglado
    (gotcha 20).

Aquí se fija lo que NUNCA debe volver a pasar.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _cargar(nombre):
    src = io.open(os.path.join(RAIZ, "server.py"), encoding="utf-8-sig").read()
    tree = ast.parse(src)
    ns = {"Optional": __import__("typing").Optional}
    for n in tree.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_ATR_LEVES":
            ns["_ATR_LEVES"] = ast.literal_eval(n.value)
        if isinstance(n, ast.FunctionDef) and n.name == nombre:
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), ns)
    assert nombre in ns, "%s no está en server.py" % nombre
    return ns[nombre]


A, B, C = "id-ana", "id-bruno", "id-ana-2"   # C es la SEGUNDA ficha de Ana


def casos_certeza():
    return [
        # Lo único que señala a una persona: un día, una persona, y no leve.
        ("un día y una sola persona: se nombra", 1, [A], "moderado", "alta"),
        ("mismo día (ventana 0) también", 0, [A], "grave", "alta"),
        ("y con daño crítico", 1, [A], "critico", "alta"),

        # Regla 4: los leves no se le cuelgan a nadie, pase lo que pase.
        ("un daño leve NUNCA señala, aunque sea de un día y una persona",
         1, [A], "leve", "baja"),
        ("ni con ventana 0", 0, [A], "leve", "baja"),

        # Regla 1: dos días son dos turnos y dos personas.
        ("dos días ya no señala", 2, [A], "moderado", "media"),
        ("tres días tampoco", 3, [A], "grave", "media"),
        ("más de tres días no dice nada", 4, [A], "grave", "baja"),

        # Varias personas: no se puede saber cuál.
        ("dos personas en la ventana: no se nombra", 1, [A, B], "grave", "media"),
        ("tres tampoco", 1, [A, B, "id-c"], "grave", "media"),
        ("sin conductor no hay nada que decir", 1, [], "grave", "baja"),

        # Sin foto previa no hay ventana que valga (regla 3).
        ("sin ventana no se atribuye", None, [A], "grave", "baja"),
    ]


def casos_persona():
    """`_atr_una_persona`: dos fichas de la misma persona son UNA persona."""
    # {ficha: correo}. Ana tiene dos fichas (gotcha 15).
    p = {A: "ana@x.es", C: "ana@x.es", B: "bruno@x.es"}
    return [
        ("las dos fichas de Ana cuentan como una", [A, C], p, 1),
        ("Ana y Bruno siguen siendo dos", [A, B], p, 2),
        ("Ana dos veces y Bruno: dos personas", [A, C, B], p, 2),
        ("una sola ficha se queda igual", [A], p, 1),
        ("una ficha sin correo no se funde con nadie", [A, "sin-correo"], p, 2),
        ("dos fichas sin correo son dos: no se adivina",
         ["x1", "x2"], {}, 2),
        ("lista vacía", [], p, 0),
    ]


def test_todos_los_casos():
    assert main() == 0


def main():
    certeza = _cargar("_atr_certeza")
    una = _cargar("_atr_una_persona")
    mal = 0

    print("  — a quién se nombra —")
    for que, dias, cond, sev, esp in casos_certeza():
        try:
            got = certeza(dias, cond, sev)[0]
        except Exception as e:                                   # noqa: BLE001
            print("  REVIENTA  %s -> %r" % (que, e)); mal += 1; continue
        if got != esp:
            print("  MAL       %s\n            dias=%r cond=%r sev=%r -> %r (esperado %r)"
                  % (que, dias, cond, sev, got, esp))
            mal += 1
        else:
            print("  ok        %s" % que)

    print("  — una persona es una persona —")
    for que, ids, p, esp in casos_persona():
        try:
            got = len(una(ids, p))
        except Exception as e:                                   # noqa: BLE001
            print("  REVIENTA  %s -> %r" % (que, e)); mal += 1; continue
        if got != esp:
            print("  MAL       %s: salieron %d, esperado %d" % (que, got, esp))
            mal += 1
        else:
            print("  ok        %s" % que)

    # Una persona con dos fichas NO puede tumbar una atribución buena.
    p = {A: "ana@x.es", C: "ana@x.es"}
    if certeza(1, una([A, C], p), "grave")[0] != "alta":
        print("  MAL       dos fichas de la misma persona tumban la atribución")
        mal += 1
    else:
        print("  ok        dos fichas de la misma persona no tumban la atribución")

    total = len(casos_certeza()) + len(casos_persona()) + 1
    print("\n%d casos, %d fallos" % (total, mal))
    return 1 if mal else 0


if __name__ == "__main__":
    sys.exit(main())
