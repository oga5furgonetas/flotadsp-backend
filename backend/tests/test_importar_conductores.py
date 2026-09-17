# -*- coding: utf-8 -*-
"""Importar la plantilla: un Excel de varias naves se reparte por centro.

Codigo REAL de server.py sacado con `ast` (gotcha 40).
"""
import ast
import io
import re
import types
import unicodedata
from pathlib import Path

_TEXTO = io.open(Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
_whatsapp = types.SimpleNamespace(normaliza_telefono=lambda t: re.sub(r"\D", "", str(t or "")) or None)
_NS = {"re": re, "unicodedata": unicodedata, "whatsapp": _whatsapp}
_QUIERO = {"_EMAIL_RE", "_IMP_COLS", "_imp_norm", "_imp_mapea", "_imp_cabecera", "_IMP_RESUMEN",
           "_imp_es_resumen", "_imp_lee", "_CENTRO_RE", "_centro_norm", "_veh_centro_de",
           "_grupos_por_centro"}
for _n in ast.parse(_TEXTO).body:
    _nombre = getattr(_n, "name", None) or (
        getattr(_n.targets[0], "id", None) if isinstance(_n, ast.Assign) else None)
    if _nombre in _QUIERO:
        exec(compile(ast.Module([_n], []), "server.py", "exec"), _NS)  # noqa: S102

FILAS = [
    ["Plantilla septiembre"],
    ["Nombre", "Email", "Centro"],
    ["Ana Ruiz", "ana@x.es", "AMZL OGA5 SANTIAGO XPT"],
    ["Luis Pena", "luis@x.es", "AMZL OGA5 SANTIAGO XPT"],
    ["Marta Gil", "marta@x.es", "AMZL DGA1 CORUNA"],
    ["Pedro Sin", "pedro@x.es", ""],
    ["TOTAL: 4", "", ""],
]


def test_cada_persona_guarda_el_texto_de_su_centro():
    r = _NS["_imp_lee"](FILAS)
    assert [p["centro_texto"] for p in r["personas"]] == [
        "AMZL OGA5 SANTIAGO XPT", "AMZL OGA5 SANTIAGO XPT", "AMZL DGA1 CORUNA", ""]
    assert any("totales" in s["motivo"] for s in r["saltadas"])


def test_la_plantilla_se_reparte_por_nave():
    r = _NS["_imp_lee"](FILAS)
    items = [{"centro_texto": p["centro_texto"], "nueva": True, "ejemplo": p["name"]}
             for p in r["personas"]]
    g = _NS["_grupos_por_centro"](items, {"OGA5"})
    por = {x["clave"]: x for x in g}
    assert por["AMZL OGA5 SANTIAGO XPT"]["sugerido"] == "OGA5"
    assert por["AMZL OGA5 SANTIAGO XPT"]["conocido"] is True
    assert por["AMZL OGA5 SANTIAGO XPT"]["filas"] == 2
    # DGA1 no es de esta empresa: se sugiere, pero no se da por suyo
    assert por["AMZL DGA1 CORUNA"]["sugerido"] == "DGA1" and not por["AMZL DGA1 CORUNA"]["conocido"]
    # sin centro, al final y contado
    assert g[-1]["clave"] == "" and g[-1]["filas"] == 1
    assert sum(x["filas"] for x in g) == len(r["personas"])


def test_la_importacion_obedece_la_eleccion():
    """Lo marcado en la vista previa se respeta en la importacion."""
    src = _TEXTO[_TEXTO.index("async def drivers_importar("):]
    src = src[:src.index("\n@api_router")]
    assert "_eleccion_centros(centros, mapa, conocidos)" in src
    assert "clave not in elegidos" in src
    assert 'p["center"] = codigo' in src


def test_ningun_local_pisa_los_campos_del_formulario():
    """`centros` (lo elegido en la vista previa) lo pisaba una lista local con
    las naves de la empresa: importar conductores daba 400 SIEMPRE."""
    import ast as _ast
    import io as _io
    from pathlib import Path as _Path
    texto = _io.open(_Path(__file__).resolve().parents[1] / "server.py", encoding="utf-8-sig").read()
    for n in _ast.parse(texto).body:
        if isinstance(n, _ast.AsyncFunctionDef) and n.name in ("drivers_importar", "import_vehicles"):
            params = {a.arg for a in n.args.args}
            asignados = {t.id for nodo in _ast.walk(n) if isinstance(nodo, _ast.Assign)
                         for t in nodo.targets if isinstance(t, _ast.Name)}
            assert not (params & asignados & {"centros", "mapa", "columnas"}), n.name
