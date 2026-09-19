# -*- coding: utf-8 -*-
"""El correo sale por DOS proveedores, y el segundo entra solo.

EL 19-09-2026 SE PERDIERON 127 CORREOS. Resend da 100 al dia en el plan
gratuito y la campana de candidatos son dos correos por persona: de 224
personas, 97 recibieron y 127 se quedaron sin nada, con la cuenta al 200 %.
Brevo da 300 al dia, asi que recoge lo que ya no cabe.

Lo que se prueba aqui es la DECISION -quien puede enviar ahora mismo-, que es
donde estan las dos formas de equivocarse: seguir pidiendole correos a uno que
ya dijo que no (y creer que se han enviado), o darlo por muerto manana, cuando
su contador ya se ha reiniciado. No se llama a ningun proveedor: eso serian
correos de verdad.

Las funciones se sacan de `server.py` con `ast` (gotcha 40): una copia deja de
probar lo que corre en cuanto alguien toca el original.
"""
import ast
import io
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"
_TEXTO = io.open(SERVER, encoding="utf-8-sig").read()


def _cargar(*nombres):
    amb = {"os": os, "re": re, "datetime": datetime, "timezone": timezone,
           "_EMAIL_CUOTA_DIA": {}}
    arbol = ast.parse(_TEXTO)
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_EMAIL_CUOTA_DIA":
            amb["_EMAIL_CUOTA_DIA"] = {}
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in nombres:
            exec(ast.get_source_segment(_TEXTO, n), amb)                        # noqa: S102
    faltan = [x for x in nombres if x not in amb]
    assert not faltan, "no existen en server.py: %s" % faltan
    return amb


HOY = datetime.now(timezone.utc).date().isoformat()
AYER = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()


def _amb(resend="k1", brevo="k2", cuota=None):
    amb = _cargar("_email_hoy", "_email_proveedores", "_email_sin_cuota_hoy", "_email_remitente")
    os.environ.pop("RESEND_API_KEY", None)
    os.environ.pop("BREVO_API_KEY", None)
    if resend:
        os.environ["RESEND_API_KEY"] = resend
    if brevo:
        os.environ["BREVO_API_KEY"] = brevo
    amb["_EMAIL_CUOTA_DIA"].clear()
    amb["_EMAIL_CUOTA_DIA"].update(cuota or {})
    return amb


def test_resend_primero_y_brevo_de_respaldo():
    """No se reparte el trafico a medias entre los dos: eso ensucia la
    reputacion de los dos dominios a la vez. Resend manda y Brevo espera."""
    amb = _amb()
    assert amb["_email_proveedores"]() == ["resend", "brevo"]
    assert amb["_email_sin_cuota_hoy"]() is False


def test_cuando_resend_se_queda_sin_cuota_el_correo_sale_por_brevo():
    """Es el caso del 19-09-2026: sin esto, 127 personas sin correo."""
    amb = _amb(cuota={"resend": HOY})
    assert amb["_email_proveedores"]() == ["brevo"]
    assert amb["_email_sin_cuota_hoy"]() is False


def test_con_los_dos_agotados_la_campana_tiene_que_parar():
    """`_email_sin_cuota_hoy` es lo que corta la campana en seco. Sin eso sigue
    creando un cupon de Stripe por cabeza que nadie va a recibir."""
    amb = _amb(cuota={"resend": HOY, "brevo": HOY})
    assert amb["_email_proveedores"]() == []
    assert amb["_email_sin_cuota_hoy"]() is True


def test_sin_la_clave_de_brevo_no_se_cuenta_con_el():
    """Mientras no este puesto el secreto, el respaldo no existe: darlo por
    disponible seria prometer envios que no salen."""
    amb = _amb(brevo=None, cuota={"resend": HOY})
    assert amb["_email_proveedores"]() == []
    assert amb["_email_sin_cuota_hoy"]() is True


def test_lo_de_ayer_no_cuenta_porque_el_contador_se_reinicia():
    """La cuota es DIARIA. Arrastrar el «no» de ayer deja la app sin correo
    hasta que alguien reinicie el proceso, y eso no se nota: los correos
    simplemente no salen."""
    amb = _amb(cuota={"resend": AYER, "brevo": AYER})
    assert amb["_email_proveedores"]() == ["resend", "brevo"]


def test_el_remitente_se_parte_en_nombre_y_direccion():
    """Resend quiere `Nombre <correo>` y Brevo los dos campos por separado. Con
    la cadena entera en el campo del correo, Brevo devuelve 400 y no sale
    nada."""
    amb = _amb()
    os.environ["EMAIL_FROM"] = "FlotaDSP <hola@flotadsp.com>"
    assert amb["_email_remitente"]() == ("FlotaDSP", "hola@flotadsp.com")
    os.environ["EMAIL_FROM"] = "contacto@flotadsp.com"
    assert amb["_email_remitente"]() == ("FlotaDSP", "contacto@flotadsp.com")


def main():
    fallos = 0
    for nombre, f in sorted(globals().items()):
        if nombre.startswith("test_") and callable(f):
            try:
                f()
                print("ok  ", nombre)
            except Exception as ex:                              # noqa: BLE001
                fallos += 1
                print("FALLA", nombre, repr(ex))
    return fallos


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
