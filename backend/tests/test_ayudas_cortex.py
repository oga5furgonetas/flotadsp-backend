# -*- coding: utf-8 -*-
"""Quien ha ayudado de verdad: se cuenta en Cortex, no en lo que alguien apunte.

EL FALLO, 08-09-2026. El portal le decia a JOSE ARTURO BLANCO —de los que mas
ayudan— «todavia no has ido a echar una mano este mes». Y era cierto que en
`apoyos` no habia ni un registro suyo... porque `apoyos` es lo que la oficina
apunta a mano al pasar paradas por WhatsApp: 18 apuntes en TODA la empresa en
septiembre. Mientras tanto Cortex, solo el dia 7, tenia **30 de 48 rutas con
mas de un transportista**, y en la XA_C18 (de Jose Maria Vilanova) figuraban
28 paquetes entregados por Jose Arturo.

Yo di el numero por bueno y escribi que «la cuenta esta bien y lo que falta son
los apuntes». Lo primero era falso: el dato estaba, en un sitio donde no habia
mirado. Es el gotcha 65 otra vez —una prueba negativa solo vale dentro de lo que
ha mirado— y lo corrigio Dani con dos capturas de Cortex.

Lo que se prueba aqui es la regla de reparto, sacada de `server.py` (gotcha 40)
para que no sea una copia que se queda vieja.
"""
import ast
import io
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent / "server.py"
_ARBOL = ast.parse(io.open(SERVER, encoding="utf-8-sig").read())


def _cargar():
    amb = {}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_AYUDA_MIN_PAQUETES":
            amb["_AYUDA_MIN_PAQUETES"] = ast.literal_eval(n.value)
        if isinstance(n, ast.FunctionDef) and n.name == "_ayudas_reparte":
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), amb)  # noqa: S102
    assert "_ayudas_reparte" in amb and "_AYUDA_MIN_PAQUETES" in amb
    return amb["_ayudas_reparte"], amb["_AYUDA_MIN_PAQUETES"]


REPARTE, MINIMO = _cargar()

# El caso real del 07-09-2026, tal y como lo ensena Cortex.
YO = "A2NXWIGGNS1GB0"        # Jose Arturo
OTRO = "A69LZVYXJ1JCD"       # Jose Maria Vilanova, titular de la XA_C18
NAVE = "10ef2406"
OTRA_NAVE = "2bf00778"
TITULARES = {("2026-09-07", NAVE, "XA_C18"): OTRO,
             ("2026-09-07", NAVE, "XA_C24"): YO}


def test_entregar_en_la_ruta_de_otro_es_una_ayuda():
    r = REPARTE([("2026-09-07", NAVE, "XA_C18", YO, 28), ("2026-09-07", NAVE, "XA_C18", OTRO, 38)], TITULARES, {YO})
    assert len(r["hice"]) == 1
    assert r["hice"][0]["paquetes"] == 28
    assert r["hice"][0]["de"] == OTRO
    assert r["equipo"] == 28


def test_tu_propia_ruta_no_es_una_ayuda():
    """134 paquetes en tu ruta es tu trabajo, no ayudar a nadie."""
    r = REPARTE([("2026-09-07", NAVE, "XA_C24", YO, 134)], TITULARES, {YO})
    assert r["hice"] == [] and r["equipo"] == 0


def test_lo_que_te_hacen_a_ti_se_cuenta_aparte():
    r = REPARTE([("2026-09-07", NAVE, "XA_C24", OTRO, 12), ("2026-09-07", NAVE, "XA_C24", YO, 134)], TITULARES, {YO})
    assert r["hice"] == []
    assert len(r["recibi"]) == 1 and r["recibi"][0]["quien"] == OTRO


def test_un_paquete_suelto_no_cuenta():
    """De 156 casos de septiembre, 43 eran de UN paquete y 17 de dos: el 38 %.

    Eso no es ir a ayudar, es un paquete que cambio de furgoneta en la nave.
    Sin minimo, todo el mundo saldria ayudando todos los dias.
    """
    for n in range(1, MINIMO):
        r = REPARTE([("2026-09-07", NAVE, "XA_C18", YO, n), ("2026-09-07", NAVE, "XA_C18", OTRO, 38)], TITULARES, {YO})
        assert r["hice"] == [], "%d paquete(s) no deberia contar" % n
    r = REPARTE([("2026-09-07", NAVE, "XA_C18", YO, MINIMO), ("2026-09-07", NAVE, "XA_C18", OTRO, 38)], TITULARES, {YO})
    assert len(r["hice"]) == 1


def test_una_ruta_sin_titular_conocido_no_inventa_nada():
    """Sin saber de quien es la ruta no se puede decir que sea ayuda."""
    r = REPARTE([("2026-09-07", NAVE, "XA_C99", YO, 40)], TITULARES, {YO})
    assert r["hice"] == [] and r["recibi"] == [] and r["equipo"] == 0


def test_el_total_de_la_empresa_cuenta_a_todos():
    grupos = [("2026-09-07", NAVE, "XA_C18", YO, 28), ("2026-09-07", NAVE, "XA_C18", OTRO, 38),
              ("2026-09-07", NAVE, "XA_C24", OTRO, 12), ("2026-09-07", NAVE, "XA_C24", YO, 134),
              ("2026-09-07", NAVE, "XA_C24", YO, 134)]
    r = REPARTE(grupos, TITULARES, {YO})
    assert r["equipo"] == 40, "las dos ayudas, la mia y la que me hicieron"


def test_las_salidas_salen_de_la_mas_reciente_a_la_mas_vieja():
    tit = {("2026-09-0%d" % d, NAVE, "R"): OTRO for d in range(1, 6)}
    grupos = [g for d in (3, 1, 5, 2)
              for g in (("2026-09-0%d" % d, NAVE, "R", YO, 10),
                        ("2026-09-0%d" % d, NAVE, "R", OTRO, 40))]
    r = REPARTE(grupos, tit, {YO})
    assert [x["dia"] for x in r["hice"]] == ["2026-09-05", "2026-09-03",
                                            "2026-09-02", "2026-09-01"]


def test_varios_transporter_ids_de_la_misma_persona():
    """Una persona puede estar dada de alta dos veces (gotcha 15)."""
    r = REPARTE([("2026-09-07", NAVE, "XA_C18", "OTRO_ID_SUYO", 9), ("2026-09-07", NAVE, "XA_C18", OTRO, 38)], TITULARES,
                {YO, "OTRO_ID_SUYO"})
    assert len(r["hice"]) == 1


def test_una_ruta_de_rescate_no_cuenta_como_ayuda_a_nadie():
    """El titular con CERO entregas: los dos falsos positivos de septiembre.

    Cortex crea rutas `RDM_...` para recoger lo que otra ruta no pudo. En ellas
    el titular del resumen figura con cero paquetes, asi que el que reparte no
    esta ayudando a esa persona: esta haciendo una ruta entera. El 07-09 se le
    habrian apuntado a KEVIN FERNEY 111 paquetes ademas de los 166 de su ruta.
    """
    tit = {("2026-09-07", NAVE, "RDM__0gEhxOCPsPo="): "A1GX5OE0HZ9JR"}
    r = REPARTE([("2026-09-07", NAVE, "RDM__0gEhxOCPsPo=", YO, 111)], tit, {YO})
    assert r["hice"] == [] and r["equipo"] == 0


def test_el_mismo_codigo_de_ruta_en_dos_naves_no_se_mezcla():
    """Gotcha 49: los codigos se repiten entre naves.

    El 05-09-2026, CA_A42 existia en DOS areas con transportistas distintos.
    Con la nave fuera de la clave, quien reparte esa ruta en una nave sale
    ayudando al titular de la otra.
    """
    tit = {("2026-09-05", NAVE, "CA_A42"): OTRO,
           ("2026-09-05", OTRA_NAVE, "CA_A42"): "UN_TERCERO"}
    grupos = [("2026-09-05", OTRA_NAVE, "CA_A42", YO, 40),
              ("2026-09-05", OTRA_NAVE, "CA_A42", "UN_TERCERO", 60)]
    r = REPARTE(grupos, tit, {YO})
    assert len(r["hice"]) == 1
    assert r["hice"][0]["de"] == "UN_TERCERO", "el titular tiene que ser el de SU nave"
