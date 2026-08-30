# -*- coding: utf-8 -*-
"""`_cx_reparte`: cómo se reparten los paquetes de un día en el DCR.

Esta función decide EL número principal del producto. Hasta el 30-08-2026 la
misma cuenta estaba copiada en cuatro sitios, que es el gotcha 20 esperando a
pasar: arreglarla en tres habría sido peor que no tocarla.

Lo que se defiende aquí es la regla de ATTEMPTED. Cortex lo llama «se puede
volver a intentar» y lo pone en su propia casilla; medido en OGA5, de los que
pasan por ahí acaban entregados el 90 %, el 95 % y el 80 % según el día. Pero al
CIERRE, un ATTEMPTED que sigue en pie sí es un fallo: nadie lo entregó.

O sea que no es ni fallo ni no-fallo — depende de si la jornada sigue viva. Es
la única regla del reparto que cambia con el tiempo, y por eso es la que se
puede romper sin que nadie lo note.
"""
import ast
import io
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _cargar():
    """Saca `_cx_reparte` y lo que necesita de server.py, sin importarlo.

    Del fichero de verdad, no una copia: una copia deja de probar el código que
    corre en cuanto alguien toca el original (gotcha 40).
    """
    src = io.open(os.path.join(RAIZ, "server.py"), encoding="utf-8-sig").read()
    tree = ast.parse(src)
    ns = {}
    quiero = {"_CX_OK", "_CX_EN_VUELO", "_CX_NO_DESPACHADO", "_CX_REINTENTABLE",
              "_CX_UMBRAL_EN_VUELO"}
    for n in tree.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in quiero:
            ns[n.targets[0].id] = ast.literal_eval(n.value)
        if isinstance(n, ast.FunctionDef) and n.name in ("_sc_dcr", "_cx_reparte"):
            mod = ast.Module(body=[n], type_ignores=[])
            ns["Optional"] = __import__("typing").Optional
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), ns)
    faltan = (quiero | {"_sc_dcr", "_cx_reparte"}) - set(ns)
    assert not faltan, "no están en server.py: %s" % sorted(faltan)
    return ns["_cx_reparte"]


# El día real del 30-08-2026 a las 18:33, contrastado contra la captura de
# Cortex de las 18:39 (36 rutas las dos, UNCOLLECTED 13 = «no se ha podido
# recoger» 13). Es el caso que destapó el fallo.
DIA_EN_CURSO = {"DELIVERED": 2788, "PICKED_UP": 320, "ATTEMPTED": 126,
                "YOU_ARE_NEXT": 48, "UNCOLLECTED": 13, "BACK_TO_ORIGIN": 8,
                "NOT_DELIVERED": 4, "NOT_READY": 1}

# Un día ya cerrado: apenas queda nadie en la calle.
DIA_CERRADO = {"DELIVERED": 5071, "BACK_TO_ORIGIN": 90, "ATTEMPTED": 24,
               "NOT_DELIVERED": 2, "PICKED_UP": 1, "UNCOLLECTED": 7}


def casos():
    return [
        # --- La jornada sigue viva: los reintentables están EN JUEGO ---
        ("día en curso: los 126 ATTEMPTED no son fallo todavía",
         DIA_EN_CURSO, {"cerrado": False, "fallos": 12, "reintentables": 126}),
        ("y por eso el DCR en vivo no se hunde",
         DIA_EN_CURSO, {"dcr": 99.57}),
        ("los reintentables cuentan como en vuelo mientras el día vive",
         DIA_EN_CURSO, {"en_vuelo": 320 + 48 + 126}),

        # --- Día cerrado: un intento fallido que nadie resolvió SÍ es fallo ---
        ("día cerrado: los 24 ATTEMPTED que quedaron sí son fallo",
         DIA_CERRADO, {"cerrado": True, "fallos": 90 + 24 + 2}),
        ("un día cerrado no infla el DCR perdonando lo que quedó sin entregar",
         DIA_CERRADO, {"dcr": 97.76}),

        # --- El caso patológico que obliga a mirar el vuelo SIN ellos ---
        # Si los reintentables contaran para decidir si el día está abierto, un
        # día con 300 intentos fallidos y ni una furgoneta en la calle se
        # declararía «abierto» para siempre y esos 300 no contarían nunca.
        ("300 reintentables y nadie en la calle: el día está CERRADO",
         {"DELIVERED": 1000, "ATTEMPTED": 300}, {"cerrado": True, "fallos": 300}),
        ("y con una furgoneta aún fuera, sigue abierto",
         {"DELIVERED": 1000, "ATTEMPTED": 300, "PICKED_UP": 400},
         {"cerrado": False, "fallos": 0}),

        # --- Los no despachados nunca entran en el DCR ---
        ("lo no despachado no puntúa ni a favor ni en contra",
         {"DELIVERED": 100, "UNCOLLECTED": 50}, {"dcr": 100.0, "fallos": 0}),

        # --- Un estado nuevo cae a fallo, que es el cajón por defecto ---
        # Deliberado: es preferible que un estado sin clasificar salte a la vista
        # como fallo a que desaparezca de la cuenta (gotcha 30).
        ("un estado desconocido cuenta como fallo y se nota",
         {"DELIVERED": 100, "ALGO_NUEVO": 10}, {"fallos": 10}),

        # --- Bordes: esto lo recorre un cron cada media hora ---
        ("un día vacío no revienta", {}, {"total": 0, "dcr": None, "cerrado": True}),
        ("solo entregados", {"DELIVERED": 10}, {"dcr": 100.0, "fallos": 0, "cerrado": True}),
        ("un estado a None no rompe la suma", {"NONE": 5, "DELIVERED": 5}, {"total": 10}),
    ]


def test_todos_los_casos():
    assert main() == 0


def main():
    reparte = _cargar()
    mal = 0
    for que, entrada, esperado in casos():
        try:
            got = reparte(dict(entrada))
        except Exception as e:                                   # noqa: BLE001
            print("  REVIENTA  %s -> %r" % (que, e))
            mal += 1
            continue
        fallo = {k: (got.get(k), v) for k, v in esperado.items() if got.get(k) != v}
        if fallo:
            print("  MAL       %s" % que)
            for k, (g, e) in fallo.items():
                print("            %-14s salió %r, esperado %r" % (k, g, e))
            print("            reparto entero: %r" % (got,))
            mal += 1
        else:
            print("  ok        %s" % que)

    # La suma tiene que cuadrar SIEMPRE: lo que no entra en ningún cajón
    # desaparece sin error (gotcha 30).
    for que, entrada, _ in casos():
        r = reparte(dict(entrada))
        suma = r["entregados"] + r["en_vuelo"] + r["no_despachados"] + r["fallos"]
        if suma != r["total"]:
            print("  MAL       la suma no cuadra en «%s»: %d cajones vs %d total"
                  % (que, suma, r["total"]))
            mal += 1
    print("\n%d casos, %d fallos" % (len(casos()), mal))
    return 1 if mal else 0


if __name__ == "__main__":
    sys.exit(main())
