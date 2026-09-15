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
from datetime import datetime, timedelta, timezone

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

    @staticmethod
    def _etapa(pipeline, nombre):
        """La etapa pedida, este en la posicion que este.

        El endpoint lanza tres agregaciones sobre esta coleccion y una de
        ellas empieza por `$match`, asi que dar por hecho que el `$group` es
        `pipeline[0]` reventaba con KeyError en esa.
        """
        return next((e[nombre] for e in pipeline if nombre in e), None)

    @classmethod
    def _filtrar(cls, docs, filtro):
        """Aplica el filtro por fecha de verdad, en vez de mirar para otro lado.

        Si el doble se saltara el corte de "los ultimos 30 dias", esos numeros
        saldrian identicos al acumulado y el test pasaria afirmando algo que el
        endpoint no hace: un verde mentiroso es peor que el rojo de antes. Por
        eso mismo, lo que el doble no sepa filtrar lo canta en vez de ignorarlo.
        """
        filtro = dict(filtro or {})
        cond = filtro.pop("created_at", None) or {}
        assert not filtro, f"el doble no sabe filtrar por {sorted(filtro)}"
        assert set(cond) <= {"$gte"}, f"el doble no sabe {sorted(cond)} sobre created_at"
        desde = cond.get("$gte")
        if desde is None:
            return list(docs)
        # Todas las fechas son ISO-8601 en UTC, asi que comparar el texto ordena
        # igual que comparar la fecha: exactamente lo que hace Mongo con este campo.
        return [d for d in docs if str(d.get("created_at") or "") >= str(desde)]

    async def aggregate(self, pipeline):
        clave = self._etapa(pipeline, "$group")["_id"]
        agrupado = {}
        for d in self._filtrar(self.docs, self._etapa(pipeline, "$match")):
            k = (d["verdict"] if clave == "$verdict"
                 else (self._pieza(d), d["verdict"]))
            agrupado[k] = agrupado.get(k, 0) + 1
        for k, n in agrupado.items():
            _id = k if clave == "$verdict" else {"p": k[0], "v": k[1]}
            yield {"_id": _id, "n": n}

    def find(self, filtro=None, *a, **k):
        return _Cursor(self._filtrar(self.docs, filtro))

    async def count_documents(self, filtro=None, *a, **k):
        return len(self._filtrar(self.docs, filtro))


class _Inspecciones:
    async def aggregate(self, pipeline):
        return
        yield  # pragma: no cover — generador vacio

    async def count_documents(self, *a, **k):
        return 100


class _SinModelo:
    """Una coleccion que existe y esta vacia."""

    async def find_one(self, *a, **k):
        return None


class _DB:
    def __init__(self, docs):
        self.ai_feedback = _Feedback(docs)
        self.inspections = _Inspecciones()

    def __getitem__(self, nombre):
        """Motor deja pedir una coleccion por nombre, y `fiabilidad.cargar`
        lo hace asi: `db[COLECCION]`. Cualquier otra sale vacia a proposito —
        en este escenario todavia no hay modelo de fiabilidad entrenado, y el
        endpoint tiene que saber devolver `modelo: None` sin romperse."""
        return getattr(self, nombre, _SinModelo())


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


async def test_la_ventana_de_30_dias_deja_fuera_lo_viejo(autoexamen):
    """El acumulado y "los ultimos 30 dias" no pueden salir siempre iguales.

    Esto vigila al doble, no al endpoint: mientras `aggregate` ignoro el
    `$match` por fecha, "reciente" era una copia del acumulado y cualquier
    test sobre esos numeros habria pasado diciendo una mentira.
    """
    viejo = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    r = await autoexamen([dict(d, created_at=viejo) for d in FEEDBACK])
    assert r["cuentas"]["reportados"] == 3        # el acumulado los sigue viendo
    assert r["cuentas_30d"]["reportados"] == 0    # la ventana de 30 dias, no
    assert r["cobertura"]["revisadas_30d"] == 0
