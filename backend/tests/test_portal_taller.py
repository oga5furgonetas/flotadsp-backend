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


# ── El enlace de OTRA cosa no puede entrar por la puerta de las ordenes ──────
#
# `taller_enlaces` guarda TRES clases de enlace en la misma coleccion: el de una
# orden (lleva `orden_id`), el fijo de un taller (`tipo: taller`, lleva
# `workshop_id`) y el de un apoyo en ruta (`tipo: apoyo`, lleva `apoyo_id`).
# `_ot_por_token` buscaba solo por token, sin mirar de cual se trata, y despues
# hacia `enlace["orden_id"]`: con cualquiera de los otros dos reventaba con
# KeyError y salia un 500 en un endpoint PUBLICO. Medido en produccion el
# 04-09-2026: el enlace fijo de Talleres Muñiz y el de un apoyo real daban
# "Error interno del servidor" en `/api/taller/<token>`, mientras que sus
# hermanos (`/taller/t/<token>` y `/apoyo/t/<token>`) contestaban 404 bien.
#
# Lo que cuenta no es el codigo de estado en si: es que un taller que guarde el
# enlace sin el `/t/` ve una pagina rota en vez de "este enlace no es valido", y
# que un resolutor que acepta tokens de otra clase es la clase de puerta que un
# dia deja pasar lo que no debe.

ENLACES = {
    "tok-de-orden-1234567890": {"token": "tok-de-orden-1234567890",
                                "orden_id": "ot-test", "db_name": "flotadsp"},
    "tok-de-taller-1234567890": {"token": "tok-de-taller-1234567890", "tipo": "taller",
                                 "workshop_id": "w-1", "db_name": "flotadsp"},
    "tok-de-apoyo-1234567890": {"token": "tok-de-apoyo-1234567890", "tipo": "apoyo",
                                "apoyo_id": "ap-1", "db_name": "flotadsp"},
}


@pytest.fixture
def enlaces(monkeypatch):
    """`global_db` y `db` falseados: aqui no hace falta Mongo para nada."""
    class _Enlaces:
        async def find_one(self, filtro, proyeccion=None):
            e = ENLACES.get(filtro.get("token"))
            if not e:
                return None
            for k, v in filtro.items():
                if k == "token":
                    continue
                if e.get(k) != v:
                    return None
            return dict(e)

    class _GlobalDB:
        taller_enlaces = _Enlaces()

    class _Ordenes:
        async def find_one(self, filtro, proyeccion=None):
            return dict(ORDEN) if filtro.get("id") == "ot-test" else None

    class _DBOrdenes:
        ordenes_trabajo = _Ordenes()

    monkeypatch.setattr(server, "global_db", _GlobalDB())
    monkeypatch.setattr(server, "db", _DBOrdenes())
    monkeypatch.setattr(server, "set_current_org_db", lambda *a, **k: None)
    monkeypatch.setattr(server, "_ot_freno", lambda token, limite=40: None)


async def test_el_enlace_de_una_orden_sigue_abriendo(enlaces):
    """Lo que ya funcionaba tiene que seguir igual."""
    orden = await server._ot_por_token("tok-de-orden-1234567890")
    assert orden["id"] == "ot-test"


@pytest.mark.parametrize("token", ["tok-de-taller-1234567890", "tok-de-apoyo-1234567890"])
async def test_un_enlace_de_otra_clase_da_404_y_no_revienta(enlaces, token):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await server._ot_por_token(token)
    assert exc.value.status_code == 404


async def test_un_token_que_no_existe_da_404(enlaces):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await server._ot_por_token("tok-inventado-1234567890")
    assert exc.value.status_code == 404
