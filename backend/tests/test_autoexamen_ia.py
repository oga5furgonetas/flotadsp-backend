"""Autoexamen de la IA: cada porcentaje sobre SU denominador.

No hace falta Mongo: se llama al endpoint real con `ai_feedback` en memoria.
Lo que se protege aqui es la aritmetica, que es donde estaba el fallo.

"Acierta" y "se inventa" se miden sobre lo que la IA REPORTO; "se le escapan",
sobre los daños que EXISTEN. Antes las tres se dividian entre el total de
veredictos, asi que un `missed` —un daño que la IA nunca reporto— hundia su
porcentaje de acierto: una pieza con 3 aciertos, 0 inventados y 7 escapados
salia como "30 % ok" cuando de lo que dijo acerto el 100 %. Y la tarjeta donde
sale ese numero se titula "Donde mas se equivoca".
"""
import pytest

import server

pytestmark = pytest.mark.asyncio


# 3 aciertos, 0 inventados, 7 escapados: el caso que salia como "30 % ok".
FEEDBACK = (
    [{"verdict": "correct", "damage": {"part": "Paragolpes trasero"},
      "created_at": "2026-08-24T10:00:00+00:00"}] * 3
    + [{"verdict": "missed", "damage": {"part": "paragolpes trasero "},
        "created_at": "2026-08-24T10:00:00+00:00"}] * 7
)


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, *a, **k):
        return list(self.docs)


class _Feedback:
    """Lo justo de una coleccion de Mongo para este endpoint."""

    def __init__(self, docs):
        self.docs = docs

    @staticmethod
    def _pieza(d):
        return ((d.get("damage") or {}).get("part") or "").strip().lower()

    async def aggregate(self, pipeline):
        clave = pipeline[0]["$group"]["_id"]
        agrupado = {}
        for d in self.docs:
            k = (d["verdict"] if clave == "$verdict"
                 else (self._pieza(d), d["verdict"]))
            agrupado[k] = agrupado.get(k, 0) + 1
        for k, n in agrupado.items():
            _id = k if clave == "$verdict" else {"p": k[0], "v": k[1]}
            yield {"_id": _id, "n": n}

    def find(self, *a, **k):
        return _Cursor(self.docs)

    async def count_documents(self, *a, **k):
        return len(self.docs)


class _Inspecciones:
    async def aggregate(self, pipeline):
        return
        yield  # pragma: no cover — generador vacio

    async def count_documents(self, *a, **k):
        return 100


class _DB:
    def __init__(self, docs):
        self.ai_feedback = _Feedback(docs)
        self.inspections = _Inspecciones()


@pytest.fixture
def autoexamen(monkeypatch):
    async def correr(docs=FEEDBACK):
        monkeypatch.setattr(server, "db", _DB(list(docs)))
        return await server.ia_autoexamen(semanas=12, _={"role": "admin"})
    return correr


async def test_lo_que_no_reporto_no_baja_su_acierto(autoexamen):
    r = await autoexamen()
    # 3 correct / (3 correct + 0 wrong + 0 corrected) = 100 %, no 30 %.
    assert r["reportados"] == 3
    assert r["acierto"] == 100.0


async def test_los_escapados_se_miden_sobre_los_daños_reales(autoexamen):
    r = await autoexamen()
    # Los daños que existen: 3 vistos + 7 escapados = 10.
    assert r["reales"] == 10
    assert r["global"]["missed"] == 7


async def test_la_pieza_lleva_su_propio_denominador(autoexamen):
    r = await autoexamen()
    pieza = next(p for p in r["piezas"] if p["pieza"] == "paragolpes trasero")
    assert pieza["reportados"] == 3
    assert pieza["reales"] == 10
    assert pieza["acierto"] == 100.0


async def test_una_pieza_que_solo_se_escapa_no_finge_un_porcentaje(autoexamen):
    """Sin nada reportado no hay acierto que enseñar: None, y la pantalla
    pinta un guion. Antes salia 0 %, que se lee como 'lo hace fatal'."""
    solo_missed = [{"verdict": "missed", "damage": {"part": "techo"},
                    "created_at": "2026-08-24T10:00:00+00:00"}] * 4
    r = await autoexamen(solo_missed)
    assert r["acierto"] is None
    pieza = next(p for p in r["piezas"] if p["pieza"] == "techo")
    assert pieza["reportados"] == 0 and pieza["acierto"] is None


async def test_no_evaluable_no_cuenta_ni_a_favor_ni_en_contra(autoexamen):
    """La foto que no deja juzgar no es culpa de la IA: fuera de los dos
    denominadores."""
    docs = list(FEEDBACK) + [{"verdict": "no_evaluable", "damage": {"part": "Paragolpes trasero"},
                              "created_at": "2026-08-24T10:00:00+00:00"}] * 5
    r = await autoexamen(docs)
    assert r["reportados"] == 3 and r["reales"] == 10
    assert r["acierto"] == 100.0
    assert r["global"]["no_evaluable"] == 5


async def test_un_falso_positivo_si_baja_el_acierto(autoexamen):
    """Comprobacion en el otro sentido: lo que SI es culpa suya cuenta."""
    docs = list(FEEDBACK) + [{"verdict": "wrong", "damage": {"part": "Paragolpes trasero"},
                              "created_at": "2026-08-24T10:00:00+00:00"}]
    r = await autoexamen(docs)
    assert r["reportados"] == 4
    assert r["acierto"] == 75.0
