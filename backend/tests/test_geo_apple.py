# -*- coding: utf-8 -*-
"""Apple Maps como quinta fuente de direcciones.

Lo pidio Dani el 03-09-2026: «el de Apple las encuentra casi todas». Aqui se
prueba lo unico que se puede probar sin la clave: que la respuesta de Apple se
traduce bien al formato de las demas fuentes, que la precision NO se infla y
que sin las variables de entorno el bloque es INERTE (devuelve None y el
rescate se comporta igual que antes).

Ojo: `maps.apple.com/frame?center=...` NO geocodifica, solo pinta un mapa en
unas coordenadas que ya tienes. La busqueda de verdad va por la API con clave
de Apple Developer, y es lo que envuelve `_geo_apple`.

Se leen las funciones reales de server.py con `ast`, sin ejecutarlo: una copia
deja de probar el codigo que corre en cuanto alguien toca el original.
"""
import ast
import io
import os
import sys
from typing import Optional

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")

FUNCS = ("_apple_geo_parse", "_apple_maps_configurado")


def _cargar():
    arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
    cuerpo = [n for n in arbol.body
              if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in FUNCS]
    ns = {"os": os, "Optional": Optional}
    exec(compile(ast.Module(body=cuerpo, type_ignores=[]), RUTA, "exec"), ns)
    faltan = [f for f in FUNCS if f not in ns]
    assert not faltan, "no encontrado en server.py: %s" % faltan
    return ns


NS = _cargar()

# Respuesta real de Apple (v1/geocode) recortada a lo que se usa.
APPLE_PORTAL = {"results": [{
    "coordinate": {"latitude": 42.530468, "longitude": -9.014328},
    "name": "Rua Isaac Peral, 14",
    "formattedAddressLines": ["Rua Isaac Peral, 14", "15960 Ribeira", "España"],
    "structuredAddress": {"thoroughfare": "Rua Isaac Peral", "subThoroughfare": "14",
                          "locality": "Ribeira", "postCode": "15960",
                          "administrativeArea": "A Coruña"},
    "countryCode": "ES"}]}


def test_traduce_al_formato_de_las_demas_fuentes():
    r = NS["_apple_geo_parse"](APPLE_PORTAL)
    assert r["fuente"] == "apple"
    # Sin `familia` el acuerdo por familias se rompe: las demas fuentes del
    # backend la llevan ('ign', 'osm') y esta tiene que llevarla tambien.
    assert r["familia"] == "apple"
    assert abs(r["lat"] - 42.530468) < 1e-9 and abs(r["lng"] - (-9.014328)) < 1e-9
    assert r["calle"] == "Rua Isaac Peral" and r["numero"] == "14"
    assert r["cp"] == "15960" and r["municipio"] == "Ribeira"
    assert "Rua Isaac Peral, 14" in r["display"]


def test_la_precision_no_se_infla():
    # Con numero de portal -> portal.
    assert NS["_apple_geo_parse"](APPLE_PORTAL)["precision"] == "portal"
    # Con via pero SIN numero no se puede decir portal: es la calle.
    sin_num = {"results": [{"coordinate": {"latitude": 42.5, "longitude": -9.0},
                            "structuredAddress": {"thoroughfare": "Rua Isaac Peral",
                                                  "locality": "Ribeira"}}]}
    assert NS["_apple_geo_parse"](sin_num)["precision"] == "calle"
    # Sin via es una zona, no una direccion.
    solo_pueblo = {"results": [{"coordinate": {"latitude": 42.5, "longitude": -9.0},
                                "structuredAddress": {"locality": "Ribeira"}}]}
    assert NS["_apple_geo_parse"](solo_pueblo)["precision"] == "zona"


def test_sin_coordenada_no_hay_resultado():
    # Apple puede contestar algo sin punto: eso no es un resultado, es un vacio.
    assert NS["_apple_geo_parse"]({"results": [{"name": "Ribeira"}]}) is None
    assert NS["_apple_geo_parse"]({"results": []}) is None
    assert NS["_apple_geo_parse"]({}) is None
    assert NS["_apple_geo_parse"](None) is None


def test_sin_clave_el_bloque_es_inerte():
    # Es la garantia de que mientras no se configure Apple no puede cambiar
    # NINGUNA coordenada en produccion.
    guardadas = {k: os.environ.pop(k, None) for k in
                 ("APPLE_MAPS_KEY_ID", "APPLE_MAPS_TEAM_ID", "APPLE_MAPS_PRIVATE_KEY")}
    try:
        assert NS["_apple_maps_configurado"]() is False
        os.environ["APPLE_MAPS_KEY_ID"] = "K"
        os.environ["APPLE_MAPS_TEAM_ID"] = "T"
        assert NS["_apple_maps_configurado"]() is False   # falta la .p8
        os.environ["APPLE_MAPS_PRIVATE_KEY"] = "-----BEGIN PRIVATE KEY-----"
        assert NS["_apple_maps_configurado"]() is True
    finally:
        for k, v in guardadas.items():
            os.environ.pop(k, None)
            if v is not None:
                os.environ[k] = v


def main() -> int:
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_") and callable(fn) and nombre != "test_todos_los_casos":
            try:
                fn()
                print("  ok  %s" % nombre)
            except AssertionError as e:
                fallos += 1
                print("  MAL %s: %s" % (nombre, e))
    print("%d fallos" % fallos)
    return 1 if fallos else 0


def test_todos_los_casos():
    assert main() == 0


if __name__ == "__main__":
    sys.exit(main())
