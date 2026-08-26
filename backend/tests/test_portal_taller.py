"""Portal del taller: la fecha de entrega y su motivo.

No hace falta Mongo. Se llama al endpoint REAL con la base de datos y los
avisos falseados, porque lo que se comprueba aqui es el ORDEN en que el
endpoint normaliza y decide, que es justo donde estaba el fallo:

  · "Otro motivo" sin explicar se anula (bien: un motivo que no dice nada
    ocupa sitio y encima parece que te han contado algo), pero esa anulacion
    ocurria DESPUES del guard antiduplicados. Con la fecha sin cambiar, el
    motivo todavia era truthy cuando el guard miraba, se colaba por el, y se
    apuntaba en el historial una linea identica a la anterior y ademas vacia.
    En produccion salieron dos "Fecha de entrega: 0002-02-02" seguidas.
  · Y `motivo_retraso` guardaba solo la etiqueta, asi que con "Otro motivo"
    la pantalla del taller ensenaba literalmente "Otro motivo" y la
    explicacion se perdia por el camino.
"""
import pytest

import server

pytestmark = pytest.mark.asyncio


ORDEN = {
    "id": "ot-test", "numero": "OT-1002", "matricula": "1234ABC",
    "taller_nombre": "Taller Pepe", "estado": "reparando",
    "fecha_entrega_estimada": "2026-09-02", "historial": [],
}


class _CursorVacio:
    def sort(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    async def to_list(self, *a, **k):
        return []


class _Coleccion:
    def __init__(self, estado):
        self.estado = estado

    async def update_one(self, filtro, cambios):
        self.estado["orden"].update(cambios.get("$set", {}))
        for campo, valor in (cambios.get("$push") or {}).items():
            self.estado["orden"].setdefault(campo, []).append(valor)

    async def find_one(self, filtro, proyeccion=None):
        return dict(self.estado["orden"])

    def find(self, *a, **k):
        # `_ot_publica` mira el historial de la furgoneta; aqui no importa.
        return _CursorVacio()


class _DB:
    def __init__(self, estado):
        self.ordenes_trabajo = _Coleccion(estado)


@pytest.fixture
def taller(monkeypatch):
    """Devuelve una funcion `llamar(data, orden=None)` -> estado resultante."""
    async def llamar(data, orden=None):
        estado = {"orden": dict(orden or ORDEN), "avisos": []}
        estado["orden"]["historial"] = list(estado["orden"].get("historial") or [])

        async def _por_token(token):
            return dict(estado["orden"])

        async def _avisa(orden_, texto):
            estado["avisos"].append(texto)

        monkeypatch.setattr(server, "_ot_por_token", _por_token)
        monkeypatch.setattr(server, "_ot_avisa", _avisa)
        monkeypatch.setattr(server, "_ot_freno", lambda token, limite=40: None)
        monkeypatch.setattr(server, "_ot_puede_escribir", lambda orden_: None)
        monkeypatch.setattr(server, "db", _DB(estado))

        await server.portal_taller_entrega("tok", data)
        estado["historial"] = estado["orden"].get("historial") or []
        return estado
    return llamar


async def test_otro_motivo_sin_explicar_no_apunta_nada(taller):
    """El bug: se colaba por el guard y dejaba una linea vacia y repetida."""
    e = await taller({"fecha": "2026-09-02", "motivo": "otro"})
    assert e["historial"] == []


async def test_otro_motivo_con_explicacion_si_apunta(taller):
    e = await taller({"fecha": "2026-09-02", "motivo": "otro",
                      "detalle": "se rompio el elevador"})
    assert len(e["historial"]) == 1
    assert "se rompio el elevador" in e["historial"][0]["detalle"]
    # Y la explicacion tiene que sobrevivir hasta lo que se ensena en pantalla.
    assert "se rompio el elevador" in e["orden"]["motivo_retraso"]


async def test_confirmar_la_misma_fecha_a_secas_sigue_sin_apuntar(taller):
    e = await taller({"fecha": "2026-09-02"})
    assert e["historial"] == []


async def test_fecha_nueva_con_motivo_normal_no_cambia(taller):
    """Regresion: lo que ya funcionaba tiene que seguir igual."""
    e = await taller({"fecha": "2026-09-05", "motivo": "pieza"})
    assert len(e["historial"]) == 1
    assert e["orden"]["motivo_retraso"] == "Falta una pieza"
    assert len(e["avisos"]) == 1 and "se retrasa 3 dias" in e["avisos"][0]


async def test_motivo_y_detalle_viajan_los_dos(taller):
    e = await taller({"fecha": "2026-09-05", "motivo": "pieza",
                      "detalle": "el retrovisor viene de Alemania"})
    assert "Falta una pieza" in e["avisos"][0]
    assert "Alemania" in e["avisos"][0]
    assert e["orden"]["motivo_retraso"] == "Falta una pieza · el retrovisor viene de Alemania"


async def test_primera_fecha_se_apunta_pero_no_avisa(taller):
    """Poner la fecha por primera vez no es un retraso: no se avisa."""
    e = await taller({"fecha": "2026-09-10"}, orden=dict(ORDEN, fecha_entrega_estimada=None))
    assert len(e["historial"]) == 1
    assert e["avisos"] == []


@pytest.mark.parametrize("fecha", ["0002-02-02", "1999-01-01", "no-es-fecha", "", "2026-13-01"])
async def test_fechas_imposibles_se_rechazan(taller, fecha):
    """`<input type=date>` emite el valor a medio escribir: '0002-02-02' es
    una fecha valida para strptime y entraba tal cual."""
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await taller({"fecha": fecha})
    assert exc.value.status_code == 400
