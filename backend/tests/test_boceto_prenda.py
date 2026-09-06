# -*- coding: utf-8 -*-
"""Pedir una prenda con palabras tiene que dar SIEMPRE la misma prenda.

POR QUE NO LO HACE UNA IA, que es la pregunta obvia: la clave de Gemini va en
plan gratuito con **20 peticiones al dia para todo el backend** (comprobado en
los logs de produccion el 06-09-2026: `RESOURCE_EXHAUSTED`, `limit: 20`). Un
generador de bocetos ahi funcionaria un rato por la mañana, y ademas le robaria
cuota al analisis de daños, que es lo que de verdad vale.

El vocabulario aqui es CERRADO y nuestro —seis prendas, cinco colores, cuatro
tintas, tres posiciones—, asi que no hace falta un modelo: hace falta un
diccionario. Y da lo mismo con la misma frase, que en algo que acaba en un
pedido de 40 unidades importa mas que ser listo.

LAS TRAMPAS QUE PRUEBA ESTO, todas reales:

1. «sudadera NEGRA con el logo CIAN» tiene dos colores. El de la prenda y el
   de la tinta se distinguen por CERCANIA a la posicion, no por orden.
2. «azul marino» contiene «azul», que tambien es una tinta. Gana la palabra
   mas larga, o saldria una prenda del color equivocado.
3. Un numero de centimetros escrito manda sobre la palabra de tamaño.
4. Lo que no se entiende se DICE. Un interprete que rellena huecos en silencio
   te deja encargar 40 unidades de algo que no pediste.

Las funciones se sacan de `server.py` con `ast` (gotcha 40).
"""
import ast
import io
import re
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"

# Lo que necesitan las funciones del modulo (constantes y ayudas), sacado tambien
# del fichero real para que no haya copias que se queden viejas.
_NOMBRES_CONST = ("_PRENDA_TIPOS", "_PRENDA_COLORES", "_PRENDA_TINTAS",
                  "_PRENDA_POSICIONES", "_PRENDA_TALLAS", "_PRENDA_MAX_TINTAS",
                  "_BOC_TIPOS", "_BOC_COLORES", "_BOC_TINTAS", "_BOC_POSICIONES",
                  "_BOC_TAMANOS", "_BOC_PALABRAS_TAMANO")
_NOMBRES_FUNC = ("_boc_normaliza", "_boc_busca", "_boc_todas", "_boc_ultimo_en", "_prenda_interpreta")


def _cargar():
    arbol = ast.parse(io.open(SERVER, encoding="utf-8-sig").read())
    ambito = {"re": re, "_texto_cuerpo": lambda v, n=None: str(v or "").strip()[:n or 300]}
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in _NOMBRES_CONST:
            ambito[n.targets[0].id] = ast.literal_eval(n.value)
        elif isinstance(n, ast.FunctionDef) and n.name in _NOMBRES_FUNC:
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), ambito)  # noqa: S102
    faltan = [x for x in _NOMBRES_CONST + _NOMBRES_FUNC if x not in ambito]
    assert not faltan, "no se han encontrado en server.py: %s" % faltan
    return ambito["_prenda_interpreta"]


interpreta = _cargar()


def _est(r, pos):
    return next((e for e in r["receta"]["estampaciones"] if e["posicion"] == pos), None)


CASOS = [
    # (frase, comprobacion, por que importa)
    ("sudadera negra con el logo en cian en el pecho",
     lambda r: r["receta"]["tipo"] == "sudadera" and r["receta"]["color"] == "negro"
     and _est(r, "pecho")["tinta"] == "cian",
     "dos colores en la frase: negro es la prenda y cian la tinta"),

    ("camiseta azul marino con el logo blanco",
     lambda r: r["receta"]["color"] == "marino",
     "'azul marino' contiene 'azul': gana la palabra mas larga"),

    ("camiseta negra con flotadsp grande en la espalda y el nombre",
     lambda r: _est(r, "espalda")["cm"] == 28 and _est(r, "espalda")["con_nombre"],
     "'grande' en la espalda son 28 cm, y pide el nombre"),

    ("sudadera con el logo pequeno en el pecho",
     lambda r: _est(r, "pecho")["cm"] == 6,
     "'pequeno' en el pecho son 6 cm"),

    ("camiseta negra con el logo de 5 cm en el pecho",
     lambda r: _est(r, "pecho")["cm"] == 5,
     "un numero escrito manda sobre la palabra de tamaño"),

    ("camiseta con el logo de 40 cm en el pecho",
     lambda r: _est(r, "pecho")["cm"] == 8 and any("no cabe" in d for d in r["dudas"]),
     "40 cm no caben en un pecho: se recorta al maximo Y SE DICE"),

    ("polo blanco con el logo bordado en el pecho",
     lambda r: r["receta"]["tipo"] == "polo" and r["receta"]["color"] == "blanco"
     and _est(r, "pecho")["tinta"] == "negro",
     "sobre prenda clara la tinta por defecto es negra, que es la que se lee"),

    ("chubasquero con franja en la manga",
     lambda r: r["receta"]["tipo"] == "chubasquero" and r["receta"]["franja_manga"],
     "reconoce la franja de contraste"),

    ("gorra negra",
     lambda r: r["receta"]["tipo"] == "gorra" and any("dónde va" in d for d in r["dudas"]),
     "sin posicion: la pone en el pecho y AVISA de que lo ha decidido el"),

    ("algo bonito",
     lambda r: r["receta"]["tipo"] == "camiseta" and len(r["dudas"]) >= 2,
     "sin nada reconocible: no inventa en silencio, dice lo que ha supuesto"),

    ("sudadera negra tallas S M L XL XXL",
     lambda r: r["receta"]["tallas"] == ["S", "M", "L", "XL", "XXL"],
     "las tallas escritas se respetan y en su orden"),

    # Frase REAL de Dani, 06-09-2026. Describe la tipografia del logo y sale
    # una talla de la nada: el pedido habria ido con una sola talla.
    ("Sudadera Negra con logo FDs bordado con la MISMA TIPOGRAFIA que nuestro "
     "logo real pero la parte final de la S hasta el principio de la F",
     lambda r: r["receta"]["tallas"] == ["S", "M", "L", "XL"],
     "una letra suelta NO es una talla: hace falta la palabra 'talla'"),

    ("camiseta negra logo cian en el pecho, flotadsp blanco en la espalda y azul en la manga",
     lambda r: len({e["tinta"] for e in r["receta"]["estampaciones"]}) <= 2
     and any("tintas" in d for d in r["dudas"]),
     "mas de dos tintas se junta Y SE DICE: cada tinta de mas se come el margen"),

    ("SUDADERA NEGRA CON EL LOGO EN EL PECHO",
     lambda r: r["receta"]["tipo"] == "sudadera",
     "en mayusculas tiene que dar lo mismo"),

    ("sudadera negra con el logo pequeno en el pecho y flotadsp grande detras",
     lambda r: _est(r, "pecho")["cm"] == 6 and _est(r, "espalda")["cm"] == 28,
     "DOS tamaños en la misma frase: cada uno manda en su trozo"),

    ("camiseta negra con el logo en el pecho y franja en la manga",
     lambda r: r["receta"]["franja_manga"] and _est(r, "manga") is None,
     "la franja NO es una estampacion: nombrar la manga ahi no crea un logo en el brazo"),

    ("camiseta negra con el logo en la manga y franja tambien",
     lambda r: _est(r, "manga") is not None,
     "si la manga se nombra aparte de la franja, esa estampacion SI se respeta"),

    ("camisetá negrá con logo pequeñó",
     lambda r: r["receta"]["tipo"] == "camiseta" and r["receta"]["color"] == "negro",
     "con tildes de mas tiene que dar lo mismo"),
]


def probar():
    fallos = []
    for frase, comprueba, porque in CASOS:
        try:
            r = interpreta(frase)
        except Exception as e:                                  # noqa: BLE001
            fallos.append("revienta con %r: %s (%s)" % (frase, e, porque))
            continue
        if not comprueba(r):
            fallos.append("con %r sale %r  (%s)" % (frase, r["receta"], porque))

    # DETERMINISTA: la misma frase, tres veces, la misma prenda. Es la razon
    # de ser de esto frente a un modelo.
    frase = "sudadera negra con el logo cian en el pecho y franja en la manga"
    salidas = [interpreta(frase)["receta"] for _ in range(3)]
    if any(s != salidas[0] for s in salidas[1:]):
        fallos.append("la misma frase da prendas distintas: no es determinista")

    # Y nunca puede devolver algo que el guardado vaya a rechazar.
    for frase, _c, _p in CASOS:
        r = interpreta(frase)["receta"]
        if r["tipo"] not in {"camiseta", "sudadera", "polo", "chubasquero", "pantalon", "gorra"}:
            fallos.append("tipo fuera de la lista con %r: %s" % (frase, r["tipo"]))
        if len({e["tinta"] for e in r["estampaciones"]}) > 2:
            fallos.append("mas de 2 tintas con %r" % frase)
    return fallos, len(CASOS) + 2


def test_boceto_prenda():
    fallos, _ = probar()
    assert not fallos, "\n".join(fallos)


if __name__ == "__main__":
    fallos, total = probar()
    for f in fallos:
        print("  " + f)
    print("%d/%d" % (total - len(fallos), total))
