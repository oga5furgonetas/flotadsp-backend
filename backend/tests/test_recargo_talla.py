# -*- coding: utf-8 -*-
"""La talla grande cuesta mas, y hay que cobrarla — en el pedido, no solo en el
escaparate.

Printful cobra +1,57 EUR de la 2XL en adelante (medido el 07-09-2026 en la
camiseta Gildan 5000, 7,72 -> 9,29, y en la sudadera 18500, 23,39 -> 24,96;
plano hasta la 5XL). Si el precio no mira la talla, la tienda pierde justo en
las tallas que MAS se piden en reparto, y no lo nota nadie: el pedido sale
bien, el cobro sale bien, y el margen se va en silencio.

Lo que se vigila aqui:

  · con talla grande el precio SUBE, y sube lo que dice la prenda;
  · con talla normal el precio es EXACTAMENTE el de antes de este cambio —
    esa es la garantia de que anadir el recargo no toca ningun precio que hoy
    este bien;
  · sin talla devuelve el "desde", que es lo que ve el escaparate;
  · una prenda sin `recargo_talla` (las que ya existian) usa el valor por
    defecto en vez de reventar;
  · basura en el campo no tumba el pedido: cae al defecto.

`_tienda_precio` y las dos constantes se sacan de `server.py` (gotcha 40): una
copia dejaria de probar el codigo que corre en cuanto alguien tocara el
original.
"""
import ast
import io
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"
_ARBOL = ast.parse(io.open(SERVER, encoding="utf-8-sig").read())


def _cargar():
    amb = {}
    quiero = {"_TALLAS_GRANDES", "_RECARGO_TALLA_DEF"}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in quiero:
            amb[n.targets[0].id] = ast.literal_eval(n.value)
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name == "_tienda_precio":
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), amb)  # noqa: S102
    faltan = quiero - set(amb)
    assert not faltan and "_tienda_precio" in amb, "no esta en server.py: %s" % faltan
    return amb["_tienda_precio"], amb["_TALLAS_GRANDES"], amb["_RECARGO_TALLA_DEF"]


PRECIO, GRANDES, DEF = _cargar()


def test_las_grandes_son_las_que_cobra_el_proveedor():
    # Si esto cambia, es que alguien ha tocado el tramo: que sea a proposito.
    assert set(GRANDES) == {"XXL", "3XL"}
    assert DEF == 3.00


def test_talla_grande_sube_lo_que_dice_la_prenda():
    p = {"pvp": 24.90, "recargo_talla": 3.00}
    for t in GRANDES:
        assert PRECIO(p, t) == 27.90, t


def test_talla_normal_vale_lo_de_siempre():
    """La red de seguridad: anadir el recargo NO puede mover ningun precio bueno."""
    p = {"pvp": 24.90, "recargo_talla": 3.00}
    for t in ("U", "XS", "S", "M", "L", "XL"):
        assert PRECIO(p, t) == 24.90, t
    assert PRECIO(p) == 24.90          # sin talla: el "desde" del escaparate


def test_minusculas_tambien():
    """El pedido normaliza a mayusculas, pero el escaparate no tiene por que."""
    assert PRECIO({"pvp": 24.90, "recargo_talla": 3.00}, "xxl") == 27.90


def test_prenda_vieja_sin_el_campo_usa_el_defecto():
    """Las prendas creadas antes de este cambio no tienen `recargo_talla`."""
    assert PRECIO({"pvp": 20.00}, "XXL") == 20.00 + DEF
    assert PRECIO({"pvp": 20.00}, "M") == 20.00


def test_recargo_cero_es_cero_y_no_el_defecto():
    """La gorra es talla unica: un recargo de 0 tiene que respetarse.

    Es la trampa clasica del `or`: `0 or DEFECTO` da el defecto, y la gorra
    acabaria con tres euros de mas por una talla que ni siquiera existe.
    """
    assert PRECIO({"pvp": 39.90, "recargo_talla": 0.0}, "XXL") == 39.90


def test_basura_en_el_campo_no_tumba_el_pedido():
    for malo in ("", "tres", None, [], {}):
        v = PRECIO({"pvp": 20.00, "recargo_talla": malo}, "XXL")
        assert v in (20.00, 20.00 + DEF), (malo, v)


def test_sin_precio_no_hay_prenda():
    for p in ({"pvp": 0}, {"pvp": None}, {}, {"pvp": "hola"}, {"pvp": -5}):
        assert PRECIO(p, "XXL") is None, p


def test_el_recargo_cubre_lo_que_cobra_printful():
    """+1,57 de coste, +3,00 de precio: el margen NO baja en la talla grande.

    Es el numero que justifica el recargo, y si alguien lo bajara a 1,50 este
    test lo diria: por debajo del sobrecoste mas su IVA, la talla grande
    empieza a dar menos que la normal.
    """
    IVA, SOBRECOSTE = 0.21, 1.57
    base_neto = 24.90 / (1 + IVA)
    gran_neto = PRECIO({"pvp": 24.90, "recargo_talla": DEF}, "XXL") / (1 + IVA)
    assert gran_neto - (7.72 + SOBRECOSTE) >= base_neto - 7.72


def test_el_pedido_cobra_la_talla_que_es():
    """El fallo que de verdad cuesta dinero no esta en la funcion: esta en QUIEN
    LA LLAMA.

    `_tienda_precio` puede estar perfecta y el endpoint del pedido llamarla sin
    talla — y entonces el escaparate ensena 27,90 y se cobran 24,90, en
    silencio y con HTTP 200. No hay forma de verlo probando la funcion sola,
    asi que se mira la llamada en el codigo del endpoint.
    """
    for n in ast.walk(_ARBOL):
        if isinstance(n, ast.AsyncFunctionDef) and n.name == "tienda_crear_pedido":
            llamadas = [c for c in ast.walk(n)
                        if isinstance(c, ast.Call)
                        and getattr(c.func, "id", "") == "_tienda_precio"]
            assert llamadas, "el pedido ya no calcula el precio con _tienda_precio"
            for c in llamadas:
                assert len(c.args) == 2, (
                    "el pedido llama a _tienda_precio SIN talla: cobraria el "
                    "precio base tambien en XXL y 3XL")
            return
    raise AssertionError("no esta tienda_crear_pedido en server.py")


def test_el_escaparate_dice_el_recargo():
    """Sin este campo el conductor no puede saber lo que va a pagar hasta el
    final, y el cliente tendria que llevar su propia lista de tallas grandes —
    que es la copia que el gotcha 54 prohibe."""
    fuente = io.open(SERVER, encoding="utf-8-sig").read()
    i = fuente.find("async def tienda_escaparate")
    assert i > 0
    trozo = fuente[i:i + 3000]
    assert '"recargo_talla"' in trozo, "el escaparate no manda el recargo"
    assert '"tallas_grandes"' in trozo, "el escaparate no dice cuales son grandes"


# ---------------------------------------------------------------------------
# Lo que QUEDA de verdad
# ---------------------------------------------------------------------------
"""El margen que enseña el panel tiene que ser el que llega a la cuenta.

`neto - coste` da 62% en la camiseta; con envio, pasarela y colchon dentro
quedan 43%. Cuatro euros por prenda que no existen — en una tanda de cuarenta,
160 euros. Un numero optimista en la pantalla donde se deciden los precios es
peor que no tener numero.
"""


def _cargar_cuentas():
    amb = {"_TIENDA_IVA": 0.21}
    quiero = {"_TIENDA_ENVIO_UD", "_TIENDA_PASARELA_PCT",
              "_TIENDA_PASARELA_FIJO", "_TIENDA_COLCHON_PCT"}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in quiero:
            amb[n.targets[0].id] = ast.literal_eval(n.value)
    for n in _ARBOL.body:
        # `_tienda_quedan` va tambien: `_prenda_con_cuentas` la llama, y sin
        # ella el test da NameError — que no es un fallo del codigo sino del
        # ambito que monta el test.
        if isinstance(n, ast.FunctionDef) and n.name in ("_tienda_gastos",
                                                         "_tienda_quedan",
                                                         "_prenda_con_cuentas"):
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), amb)  # noqa: S102
    assert "_prenda_con_cuentas" in amb and "_tienda_gastos" in amb
    return amb["_prenda_con_cuentas"]


CUENTAS = _cargar_cuentas()


def test_lo_que_queda_es_menos_que_el_bruto():
    c = CUENTAS({"coste": 7.72, "pvp": 24.90})
    assert c["margen_pct"] == 62          # el bruto de siempre, que se sigue dando
    assert c["queda_pct"] == 43           # el que llega a la cuenta
    assert c["queda"] < c["margen"]
    assert round(c["margen"] - c["gastos"], 2) == c["queda"]


def test_los_ocho_productos_de_printful_dan_lo_que_dicen():
    """Los costes son los MEDIDOS en el catalogo el 07-09-2026. Si alguien
    cambia un precio de venta a la baja sin mirar, esto lo dice."""
    catalogo = [
        ("camiseta", 7.72, 24.90, 43), ("camiseta mujer", 7.72, 24.90, 43),
        ("sudadera", 17.90, 49.90, 44), ("hoodie", 23.39, 59.90, 41),
        ("cortavientos", 22.16, 59.90, 44), ("chandal", 32.06, 79.90, 41),
        ("gorra", 16.65, 39.90, 35), ("gorro", 14.18, 34.90, 35),
    ]
    for nombre, coste, pvp, pct in catalogo:
        c = CUENTAS({"coste": coste, "pvp": pvp})
        assert c["queda_pct"] == pct, (nombre, c["queda_pct"], pct)
        # Y ninguno por debajo de un tercio: ahi deja de compensar el lio.
        assert c["queda_pct"] >= 33, nombre


def test_el_precio_que_no_da_margen_se_ve():
    """La trampa que casi cuela: la Next Level 3600 a 15,04 vendida a 19,90.

    Con el margen bruto parecia un 9% flojito; con los gastos dentro se PIERDE
    dinero en cada camiseta. Ese es el numero que tenia que salir en pantalla.
    """
    c = CUENTAS({"coste": 15.04, "pvp": 19.90})
    assert c["margen"] > 0            # el bruto aun parece positivo
    assert c["queda"] < 0             # y de verdad se pierde


def test_sin_precio_no_hay_cuentas():
    c = CUENTAS({"coste": 7.72, "pvp": None})
    for k in ("neto", "margen", "queda", "gastos"):
        assert k not in c


# ---------------------------------------------------------------------------
# Drops: unidades limitadas
# ---------------------------------------------------------------------------
"""Lo que queda de un drop. El numero que hace que alguien compre hoy.

Si dice de mas, se vende algo que no hay y hay que devolver el dinero; si dice
de menos, se deja de vender. Las dos cosas se notan tarde.
"""


def _cargar_quedan():
    amb = {}
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name == "_tienda_quedan":
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), amb)  # noqa: S102
    assert "_tienda_quedan" in amb, "no esta _tienda_quedan en server.py"
    return amb["_tienda_quedan"]


QUEDAN = _cargar_quedan()


def test_sin_limite_no_es_cero():
    """None significa «sin drop», y hay que distinguirlo de «agotado».

    Es la trampa del `or`: con `lim or 0` una prenda sin limite saldria
    agotada y no la podria comprar nadie.
    """
    for p in ({}, {"unidades": None}, {"unidades": ""}, {"unidades": 0}):
        assert QUEDAN(p) is None, p


def test_lo_que_queda_es_lo_puesto_menos_lo_vendido():
    assert QUEDAN({"unidades": 12, "vendidas": 0}) == 12
    assert QUEDAN({"unidades": 12, "vendidas": 5}) == 7
    assert QUEDAN({"unidades": 12}) == 12          # sin vender aun


def test_agotado_es_cero_y_nunca_negativo():
    assert QUEDAN({"unidades": 12, "vendidas": 12}) == 0
    # Si por lo que sea se hubiera pasado, se dice 0, no -3: un numero
    # negativo en pantalla es peor que la propia incidencia.
    assert QUEDAN({"unidades": 12, "vendidas": 15}) == 0


def test_basura_no_tumba_el_escaparate():
    for p in ({"unidades": "doce"}, {"unidades": 12, "vendidas": "tres"},
              {"unidades": [1]}, {"unidades": 12, "vendidas": None}):
        v = QUEDAN(p)
        assert v is None or isinstance(v, int), p


def test_la_reserva_es_atomica():
    """La comprobacion y el descuento van en la MISMA operacion de Mongo.

    Si se leyera el stock y luego se restara, dos conductores comprando la
    ultima unidad a la vez leerian 1 los dos y se venderian dos (gotcha 46).
    No se puede probar sin base de datos, asi que se comprueba la FORMA: que
    el filtro del update lleve la condicion dentro.
    """
    for n in _ARBOL.body:
        if isinstance(n, ast.AsyncFunctionDef) and n.name == "_tienda_reservar":
            fuente = ast.unparse(n)
            assert "$expr" in fuente and "$lte" in fuente, (
                "la reserva ya no comprueba el stock DENTRO del update: "
                "leer y luego restar vende dos veces la ultima unidad")
            assert "update_one" in fuente
            return
    raise AssertionError("no esta _tienda_reservar en server.py")


def test_el_escaparate_ya_no_cuenta_la_logistica():
    """Fuera el cierre y el minimo: eran del pedido agrupado.

    Con el proveedor de ahora no hay minimo ni espera, asi que enseñarlos era
    pedirle al conductor que entendiera nuestro almacen para comprar una
    camiseta — y prometerle una devolucion que ya no tiene por que existir.
    """
    fuente = io.open(SERVER, encoding="utf-8-sig").read()
    i = fuente.find("async def tienda_escaparate")
    assert i > 0
    trozo = fuente[i:i + 2500]
    assert '"cierre"' not in trozo, "el escaparate sigue mandando la cuenta atras"
    assert '"minimo"' not in trozo, "el escaparate sigue mandando el minimo"
    assert '"quedan"' in trozo, "el escaparate no dice cuantas quedan"
