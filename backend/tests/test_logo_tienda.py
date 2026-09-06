# -*- coding: utf-8 -*-
"""El logo que se sube tiene que ser un logo, y no puede traer codigo dentro.

POR QUE IMPORTA. Un SVG no es una imagen: es un documento, y puede llevar
`<script>` dentro. Si se incrustara en la pagina correria con NUESTRO origen y
con la sesion del super-admin abierta, o sea que subir un fichero seria
ejecutar codigo en el panel.

La defensa principal es de forma, no de filtro: el lienzo lo dibuja con
`<image>`, y ahi el navegador pinta el SVG en modo estatico seguro —sin
scripts y sin cargas externas—. Esta comprobacion es la SEGUNDA capa, y existe
por una razon concreta: si algun dia alguien decide incrustarlo para poder
recolorearlo, el fichero peligroso ya no estara guardado. Un filtro que solo
sirve mientras nadie toque el codigo de al lado no sirve.

La funcion se saca de `server.py` con `ast` (gotcha 40).
"""
import ast
import io
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"


class _HTTPException(Exception):
    def __init__(self, status_code, detail=""):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _cargar():
    arbol = ast.parse(io.open(SERVER, encoding="utf-8-sig").read())
    ambito = {"HTTPException": _HTTPException}
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in (
                "_LOGO_MAX_BYTES", "_LOGO_TIPOS", "_LOGO_PROHIBIDO"):
            # Con `exec` y no con `literal_eval`: el tope esta escrito como
            # `200 * 1024`, que se lee de un vistazo pero no es un literal.
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), ambito)  # noqa: S102
        elif isinstance(n, ast.FunctionDef) and n.name == "_logo_valida":
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), ambito)  # noqa: S102
    assert "_logo_valida" in ambito, "no esta _logo_valida en server.py"
    assert ambito.get("_LOGO_MAX_BYTES"), "no esta _LOGO_MAX_BYTES"
    return ambito["_logo_valida"], ambito["_LOGO_MAX_BYTES"]


valida, MAX = _cargar()

SVG_BUENO = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">' \
            b'<path d="M10 10 L90 10 L90 30 Z" fill="#14E7D8"/></svg>'
PNG_BUENO = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200

# (nombre, datos, tiene que pasar, por que importa)
CASOS = [
    ("logo.svg", SVG_BUENO, True, "un SVG normal entra"),
    ("LOGO.SVG", SVG_BUENO, True, "la extension en mayusculas tambien"),
    ("logo.png", PNG_BUENO, True, "un PNG de verdad entra"),

    ("logo.svg", b'<svg onload="fetch(\'/api/x\')"><path/></svg>', False,
     "un manejador onload es codigo: fuera"),
    ("logo.svg", b'<svg><script>alert(1)</script></svg>', False,
     "un <script> dentro del SVG es lo que roba la sesion"),
    ("logo.svg", b'<svg><a href="javascript:alert(1)">x</a></svg>', False,
     "javascript: en un enlace tambien ejecuta"),
    ("logo.svg", b'<svg><foreignObject><body onload="x()"/></foreignObject></svg>', False,
     "foreignObject mete HTML entero dentro del SVG"),
    ("logo.svg", b'<svg><image onerror="x()" href="nada"/></svg>', False,
     "onerror salta aunque la carga falle"),

    ("logo.svg", b"esto no es un svg", False, "sin la etiqueta <svg no vale"),
    ("logo.png", b"GIF89a" + b"\x00" * 50, False, "un GIF renombrado a .png no cuela"),
    ("logo.jpg", PNG_BUENO, False, "una extension que no admitimos"),
    ("logo", SVG_BUENO, False, "sin extension"),
    ("logo.svg", b"", False, "fichero vacio"),
    ("logo.svg", b"<svg/>" + b"x" * (MAX + 10), False, "por encima del tope de tamaño"),
]


def probar():
    fallos = []
    for nombre, datos, debe_pasar, porque in CASOS:
        try:
            mime = valida(nombre, datos)
            paso, motivo = True, mime
        except _HTTPException as e:
            paso, motivo = False, e.detail
        except Exception as e:                                   # noqa: BLE001
            fallos.append("revienta raro con %s: %r (%s)" % (nombre, e, porque))
            continue
        if paso != debe_pasar:
            fallos.append("%s con %r: esperaba %s y ha salido %s -> %s  (%s)"
                          % (nombre, datos[:40], "pasar" if debe_pasar else "fallar",
                             "pasa" if paso else "falla", motivo, porque))

    # El mime que devuelve es el que se guarda y con el que se pinta: si se
    # equivoca, el navegador no dibuja nada.
    if valida("logo.svg", SVG_BUENO) != "image/svg+xml":
        fallos.append("el mime de un SVG no es image/svg+xml")
    if valida("logo.png", PNG_BUENO) != "image/png":
        fallos.append("el mime de un PNG no es image/png")
    return fallos, len(CASOS) + 2


def test_logo_tienda():
    fallos, _ = probar()
    assert not fallos, "\n".join(fallos)


if __name__ == "__main__":
    fallos, total = probar()
    for f in fallos:
        print("  " + f)
    print("%d/%d" % (total - len(fallos), total))
