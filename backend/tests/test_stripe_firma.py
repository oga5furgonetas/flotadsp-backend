# -*- coding: utf-8 -*-
"""La firma del webhook de Stripe. Es lo unico que separa un cobro de un `curl`.

El webhook de la tienda es PUBLICO y decide QUIEN HA PAGADO. Si la firma no se
comprueba bien, cualquiera puede marcar sus pedidos como pagados mandando un
JSON. No hay pantalla donde se note: el pedido sale «pagado» y la oficina lo
encarga.

Se verifica a mano (HMAC-SHA256 sobre `<timestamp>.<cuerpo>`) en vez de traer
la libreria de Stripe, asi que estos casos son la unica red que hay.
Los cuatro que importan:

  · una firma buena pasa;
  · una firma de otro secreto NO pasa —es el ataque obvio—;
  · una firma buena pero VIEJA no pasa: sin comprobar el timestamp, un aviso
    legitimo capturado hace meses se podria reenviar tal cual y volveria a
    marcar el pedido como pagado (replay);
  · sin secreto configurado no pasa nada, ni siquiera una firma correcta.

La funcion se saca de `server.py` con `ast` (gotcha 40): una copia dejaria de
probar el codigo que corre en cuanto alguien tocara el original.
"""
import ast
import hashlib
import hmac
import io
import time
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"
_ARBOL = ast.parse(io.open(SERVER, encoding="utf-8-sig").read())


def _cargar():
    amb = {"time": time}
    # La tolerancia sale del propio server.py, no copiada: si alguien la
    # subiera a un dia, la ventana de replay se abriria y este test seguiria
    # en verde con una constante nuestra.
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_STRIPE_TOL_SEG":
            amb["_STRIPE_TOL_SEG"] = ast.literal_eval(n.value)
    assert amb.get("_STRIPE_TOL_SEG"), "no esta _STRIPE_TOL_SEG"
    assert amb["_STRIPE_TOL_SEG"] <= 600, (
        "la ventana de la firma es de %ss: demasiado para un replay"
        % amb["_STRIPE_TOL_SEG"])
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name == "_stripe_firma_ok":
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), amb)  # noqa: S102
    assert "_stripe_firma_ok" in amb, "no esta _stripe_firma_ok en server.py"
    return amb["_stripe_firma_ok"]


FIRMA_OK = _cargar()
SECRETO = "whsec_de_prueba_no_es_real"
CUERPO = b'{"id":"evt_1","type":"checkout.session.completed"}'


def cabecera(secreto=SECRETO, cuerpo=CUERPO, ts=None, extra=""):
    ts = ts if ts is not None else int(time.time())
    v1 = hmac.new(secreto.encode(), str(ts).encode() + b"." + cuerpo,
                  hashlib.sha256).hexdigest()
    return "t=%d,v1=%s%s" % (ts, v1, extra)


def test_una_firma_buena_pasa():
    assert FIRMA_OK(CUERPO, cabecera(), SECRETO) is True


def test_otro_secreto_no_pasa():
    assert FIRMA_OK(CUERPO, cabecera(secreto="whsec_del_atacante"), SECRETO) is False


def test_el_cuerpo_cambiado_no_pasa():
    """Firmar un cuerpo y mandar otro es justo lo que la firma viene a impedir."""
    otro = b'{"id":"evt_1","type":"checkout.session.completed","amount_total":1}'
    assert FIRMA_OK(otro, cabecera(cuerpo=CUERPO), SECRETO) is False


def test_una_firma_vieja_no_pasa():
    """Replay. Sin la ventana de tiempo esto pasaria, y con firma valida."""
    viejo = int(time.time()) - 3600
    assert FIRMA_OK(CUERPO, cabecera(ts=viejo), SECRETO) is False


def test_una_firma_del_futuro_tampoco():
    futuro = int(time.time()) + 3600
    assert FIRMA_OK(CUERPO, cabecera(ts=futuro), SECRETO) is False


def test_dentro_de_la_ventana_si():
    """Los relojes no van sincronizados al segundo: hay margen, y es de 5 min."""
    assert FIRMA_OK(CUERPO, cabecera(ts=int(time.time()) - 120), SECRETO) is True


def test_sin_secreto_no_pasa_nada():
    """Fail-closed. Sin secreto, ni una firma correcta vale."""
    assert FIRMA_OK(CUERPO, cabecera(), "") is False
    assert FIRMA_OK(CUERPO, "", SECRETO) is False
    assert FIRMA_OK(b"", cabecera(), SECRETO) is False


def test_varias_v1_durante_una_rotacion():
    """Al rotar el secreto, Stripe manda las dos firmas. Basta con que una valga."""
    mala = "0" * 64
    cab = cabecera() + ",v1=" + mala
    assert FIRMA_OK(CUERPO, cab, SECRETO) is True


def test_cabeceras_deformes_no_revientan():
    for cab in ("", "t=", "v1=abc", "t=hola,v1=abc", "basura", "t=1,v1=", ",,,"):
        assert FIRMA_OK(CUERPO, cab, SECRETO) is False, cab


def test_el_webhook_es_fail_closed_y_fija_la_empresa():
    """Las dos guardas del endpoint, que no se ven probando la firma sola.

    Sin secreto configurado tiene que responder 503 y no seguir; y como es un
    endpoint PUBLICO, tiene que fijar la empresa a mano antes de tocar `db`
    (gotcha 26) — si no, un pago de otro cliente escribiria en la base
    principal, en silencio y con HTTP 200.
    """
    fuente = io.open(SERVER, encoding="utf-8-sig").read()
    i = fuente.find("async def tienda_stripe_webhook")
    assert i > 0, "no esta el webhook"
    trozo = fuente[i:i + 4000]
    assert "STRIPE_WEBHOOK_SECRET" in trozo and "503" in trozo, "ya no es fail-closed"
    assert "_stripe_firma_ok" in trozo, "ya no comprueba la firma"
    assert "set_current_org_db" in trozo, "no fija la empresa (gotcha 26)"
    assert "DuplicateKeyError" in trozo, "sin idempotencia: Stripe reintenta"


def test_el_importe_se_comprueba_contra_el_pedido():
    """Que Stripe diga que ha cobrado no basta: tiene que cuadrar con el pedido."""
    fuente = io.open(SERVER, encoding="utf-8-sig").read()
    i = fuente.find("async def tienda_stripe_webhook")
    trozo = fuente[i:i + 4000]
    assert "amount_total" in trozo and "descuadre" in trozo, (
        "el webhook marca pagado sin comprobar el importe")


def test_el_precio_del_pago_sale_del_pedido_guardado():
    """Nunca del cuerpo de la peticion: si no, se paga 1 centimo por una sudadera."""
    for n in ast.walk(_ARBOL):
        if isinstance(n, ast.AsyncFunctionDef) and n.name == "tienda_pagar":
            fuente = ast.unparse(n)
            assert "Body(" not in fuente, "el endpoint de pago acepta un cuerpo"
            assert "unit_amount" in fuente and "linea.get('precio')" in fuente
            return
    raise AssertionError("no esta tienda_pagar en server.py")
