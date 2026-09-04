# -*- coding: utf-8 -*-
"""Empleo: el cuestionario de la oferta y lo que se hace con las respuestas.

Lo que se prueba aqui es lo que no da error cuando esta mal:

  · una respuesta marcada como «descarta» que NO este entre las opciones no
    puede saltar nunca. Parece que filtras y no filtras: el candidato entra
    como bueno y nadie se entera;
  · la comparacion tiene que ser sin tildes ni mayusculas. En el panel se
    escribe «Sí» y el candidato pulsa «Si»: comparando en crudo, el filtro
    tampoco salta;
  · lo que responde el candidato NO se cree: solo se guarda si esta entre las
    opciones de la pregunta. Es un endpoint publico;
  · la oferta que ve el candidato NO puede llevar `descarta` dentro. Si sabe
    que respuesta le deja fuera, el cuestionario deja de medir nada.

Se leen las funciones reales de server.py con `ast`, sin ejecutarlo (gotcha 40:
una copia de la logica deja de probar el codigo que corre).

Probado reintroduciendo el fallo: quitando la comprobacion de que `descarta`
este entre las opciones falla `test_descarte_que_no_existe_se_rechaza`; y
comparando en crudo en `_empleo_clave` falla `test_descarta_sin_tildes`.
"""
import ast
import io
import os
import re
import sys
import unicodedata
import uuid
from typing import List, Optional

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, "server.py")

FUNCS = ("_empleo_texto", "_empleo_sin_tildes", "_empleo_clave", "_empleo_slugificar",
         "_empleo_normaliza_preguntas", "_empleo_publica_oferta", "_empleo_revisa_respuestas")
CLASES = ("PreguntaEmpleo",)
CONSTS = ("EMPLEO_FASES", "EMPLEO_TIPOS", "_EMPLEO_MAX_PREGUNTAS", "_EMPLEO_MAX_OPCIONES")


class HTTPException(Exception):
    def __init__(self, status_code, detail=""):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class _Campo:
    def __init__(self, default=None, default_factory=None):
        self.default = default
        self.default_factory = default_factory


def Field(default=None, default_factory=None):   # noqa: N802 (imita a pydantic)
    return _Campo(default, default_factory)


class ConfigDict(dict):
    pass


class BaseModel:
    """Lo justo de pydantic para poder construir `PreguntaEmpleo` sin instalarlo."""

    def __init__(self, **kw):
        for nombre, valor in type(self).__dict__.items():
            if nombre.startswith("_") or callable(valor) or nombre == "model_config":
                continue
            if isinstance(valor, _Campo):
                valor = valor.default_factory() if valor.default_factory else valor.default
            setattr(self, nombre, valor)
        for k, v in kw.items():
            setattr(self, k, v)

    def model_dump(self):
        return {k: v for k, v in vars(self).items() if not k.startswith("_")}


def _cargar():
    arbol = ast.parse(io.open(RUTA, encoding="utf-8-sig").read())
    cuerpo = []
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in CONSTS:
            cuerpo.append(n)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in FUNCS:
            cuerpo.append(n)
        elif isinstance(n, ast.ClassDef) and n.name in CLASES:
            cuerpo.append(n)
    ns = {"re": re, "unicodedata": unicodedata, "uuid": uuid, "HTTPException": HTTPException,
          "BaseModel": BaseModel, "ConfigDict": ConfigDict, "Field": Field,
          "List": List, "Optional": Optional}
    exec(compile(ast.Module(body=cuerpo, type_ignores=[]), RUTA, "exec"), ns)
    faltan = [f for f in FUNCS + CONSTS + CLASES if f not in ns]
    assert not faltan, "no encontrado en server.py: %s" % faltan
    return ns


NS = _cargar()


def _pregunta(**kw):
    base = {"texto": "Tienes carnet B?", "tipo": "si_no", "obligatoria": True}
    base.update(kw)
    return base


def _norm(preguntas):
    return NS["_empleo_normaliza_preguntas"](preguntas)


# ── El cuestionario que se guarda ─────────────────────────────────────────

def test_si_no_pone_sus_dos_opciones():
    p = _norm([_pregunta()])[0]
    assert p["opciones"] == ["Si", "No"]


def test_opcion_necesita_dos():
    try:
        _norm([_pregunta(tipo="opcion", opciones=["Solo una"])])
    except HTTPException as e:
        assert e.status_code == 400
    else:
        raise AssertionError("una sola opcion tendria que rechazarse")


def test_tipo_inventado_se_rechaza():
    try:
        _norm([_pregunta(tipo="desplegable")])
    except HTTPException as e:
        assert e.status_code == 400
    else:
        raise AssertionError("un tipo que no existe no se pintaria en la pagina")


def test_descarte_que_no_existe_se_rechaza():
    # EL CASO PELIGROSO: se guarda tan ricamente y no descarta a nadie nunca.
    try:
        _norm([_pregunta(tipo="opcion", opciones=["Manana", "Tarde"], descarta=["Noche"])])
    except HTTPException as e:
        assert e.status_code == 400
    else:
        raise AssertionError("un descarte fuera de las opciones no saltaria jamas")


def test_texto_libre_no_puede_descartar():
    try:
        _norm([_pregunta(tipo="texto", descarta=["no"])])
    except HTTPException as e:
        assert e.status_code == 400
    else:
        raise AssertionError("no hay opciones que comparar en un texto libre")


def test_dos_opciones_iguales_se_rechazan():
    try:
        _norm([_pregunta(tipo="opcion", opciones=["Manana", "manana"])])
    except HTTPException as e:
        assert e.status_code == 400
    else:
        raise AssertionError("dos opciones iguales dejan una inalcanzable")


def test_pregunta_sin_enunciado_se_rechaza():
    try:
        _norm([_pregunta(texto="   ")])
    except HTTPException as e:
        assert e.status_code == 400
    else:
        raise AssertionError("una pregunta en blanco no dice nada")


# ── Lo que ve el candidato ────────────────────────────────────────────────

def test_la_oferta_publica_no_lleva_los_descartes():
    preguntas = _norm([_pregunta(descarta=["No"])])
    pub = NS["_empleo_publica_oferta"]({"id": "1", "titulo": "Conductor", "preguntas": preguntas})
    entero = repr(pub)
    assert "descarta" not in entero, "el candidato no puede saber que respuesta le deja fuera"
    assert pub["preguntas"][0]["opciones"] == ["Si", "No"]


def test_la_oferta_publica_no_filtra_lo_que_hace_falta():
    pub = NS["_empleo_publica_oferta"]({"id": "1", "titulo": "Conductor", "ciudad": "Santiago",
                                        "preguntas": []})
    assert pub["titulo"] == "Conductor" and pub["ciudad"] == "Santiago"


# ── Las respuestas ────────────────────────────────────────────────────────

def test_descarta_sin_tildes():
    # En el panel se escribe «Sí» y el candidato pulsa «Si». Comparando en
    # crudo, el filtro no salta y el candidato entra como bueno.
    preguntas = _norm([_pregunta(tipo="opcion", opciones=["Sí", "No"], descarta=["Sí"])])
    _, motivo = NS["_empleo_revisa_respuestas"](preguntas, {preguntas[0]["id"]: "si"})
    assert motivo, "el descarte tiene que saltar aunque cambien tildes y mayusculas"


def test_respuesta_buena_no_descarta():
    preguntas = _norm([_pregunta(descarta=["No"])])
    limpias, motivo = NS["_empleo_revisa_respuestas"](preguntas, {preguntas[0]["id"]: "Si"})
    assert motivo is None
    assert limpias[preguntas[0]["id"]] == "Si"


def test_una_respuesta_inventada_no_se_guarda():
    # Es un endpoint publico: lo que llega en el cuerpo no se cree.
    preguntas = _norm([_pregunta(tipo="opcion", opciones=["Manana", "Tarde"], obligatoria=False)])
    limpias, _ = NS["_empleo_revisa_respuestas"](preguntas, {preguntas[0]["id"]: "<script>"})
    assert limpias[preguntas[0]["id"]] == ""


def test_falta_una_obligatoria():
    preguntas = _norm([_pregunta()])
    try:
        NS["_empleo_revisa_respuestas"](preguntas, {})
    except HTTPException as e:
        assert e.status_code == 400
    else:
        raise AssertionError("una obligatoria sin contestar tiene que parar el envio")


def test_varias_guarda_solo_las_validas_y_sin_repetir():
    preguntas = _norm([_pregunta(tipo="varias", opciones=["Furgoneta", "Moto", "Camion"],
                                 obligatoria=False)])
    pid = preguntas[0]["id"]
    limpias, _ = NS["_empleo_revisa_respuestas"](
        preguntas, {pid: ["Moto", "moto", "Helicoptero", "Camion"]})
    assert limpias[pid] == ["Moto", "Camion"]


def test_varias_descarta_si_marca_una_mala():
    preguntas = _norm([_pregunta(tipo="varias", opciones=["Manana", "Tarde", "Noche"],
                                 descarta=["Noche"], obligatoria=False)])
    pid = preguntas[0]["id"]
    _, motivo = NS["_empleo_revisa_respuestas"](preguntas, {pid: ["Manana", "Noche"]})
    assert motivo and "Noche" in motivo


def test_numero_solo_acepta_numeros():
    preguntas = _norm([_pregunta(tipo="numero", obligatoria=False)])
    pid = preguntas[0]["id"]
    assert NS["_empleo_revisa_respuestas"](preguntas, {pid: "12"})[0][pid] == "12"
    assert NS["_empleo_revisa_respuestas"](preguntas, {pid: "muchos"})[0][pid] == ""


# ── El slug de la URL publica ─────────────────────────────────────────────

def test_slug_limpio():
    f = NS["_empleo_slugificar"]
    assert f("Conductor de reparto — Santiago") == "conductor-de-reparto-santiago"
    assert f("A Coruña") == "a-coruna"
    assert f("   ") == "oferta"


def main() -> int:
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_") and callable(fn) and nombre != "test_todos_los_casos":
            try:
                fn()
                print("  ok  %s" % nombre)
            except Exception as e:
                fallos += 1
                print("  MAL %s: %s" % (nombre, e))
    print("\n%d fallos" % fallos)
    return 1 if fallos else 0


def test_todos_los_casos():
    assert main() == 0


if __name__ == "__main__":
    sys.exit(main())
