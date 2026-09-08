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
    r = REPARTE([("2026-09-07", NAVE, "XA_C18", YO, 28, 28), ("2026-09-07", NAVE, "XA_C18", OTRO, 38, 38)], TITULARES, {YO})
    assert len(r["hice"]) == 1
    assert r["hice"][0]["paquetes"] == 28
    assert r["hice"][0]["de"] == OTRO
    assert r["equipo"] == 28


def test_tu_propia_ruta_no_es_una_ayuda():
    """134 paquetes en tu ruta es tu trabajo, no ayudar a nadie."""
    r = REPARTE([("2026-09-07", NAVE, "XA_C24", YO, 134, 134)], TITULARES, {YO})
    assert r["hice"] == [] and r["equipo"] == 0


def test_lo_que_te_hacen_a_ti_se_cuenta_aparte():
    r = REPARTE([("2026-09-07", NAVE, "XA_C24", OTRO, 12, 12), ("2026-09-07", NAVE, "XA_C24", YO, 134, 134)], TITULARES, {YO})
    assert r["hice"] == []
    assert len(r["recibi"]) == 1 and r["recibi"][0]["quien"] == OTRO


def test_un_paquete_suelto_no_cuenta():
    """De 156 casos de septiembre, 43 eran de UN paquete y 17 de dos: el 38 %.

    Eso no es ir a ayudar, es un paquete que cambio de furgoneta en la nave.
    Sin minimo, todo el mundo saldria ayudando todos los dias.
    """
    for n in range(1, MINIMO):
        r = REPARTE([("2026-09-07", NAVE, "XA_C18", YO, n, n), ("2026-09-07", NAVE, "XA_C18", OTRO, 38, 38)], TITULARES, {YO})
        assert r["hice"] == [], "%d paquete(s) no deberia contar" % n
    r = REPARTE([("2026-09-07", NAVE, "XA_C18", YO, MINIMO, MINIMO), ("2026-09-07", NAVE, "XA_C18", OTRO, 38, 38)], TITULARES, {YO})
    assert len(r["hice"]) == 1


def test_una_ruta_sin_titular_conocido_no_inventa_nada():
    """Sin saber de quien es la ruta no se puede decir que sea ayuda."""
    r = REPARTE([("2026-09-07", NAVE, "XA_C99", YO, 40, 40)], TITULARES, {YO})
    assert r["hice"] == [] and r["recibi"] == [] and r["equipo"] == 0


def test_el_total_de_la_empresa_cuenta_a_todos():
    grupos = [("2026-09-07", NAVE, "XA_C18", YO, 28, 28), ("2026-09-07", NAVE, "XA_C18", OTRO, 38, 38),
              ("2026-09-07", NAVE, "XA_C24", OTRO, 12, 12),
              ("2026-09-07", NAVE, "XA_C24", YO, 134, 134)]
    r = REPARTE(grupos, TITULARES, {YO})
    assert r["equipo"] == 40, "las dos ayudas, la mia y la que me hicieron"


def test_las_salidas_salen_de_la_mas_reciente_a_la_mas_vieja():
    tit = {("2026-09-0%d" % d, NAVE, "R"): OTRO for d in range(1, 6)}
    grupos = [g for d in (3, 1, 5, 2)
              for g in (("2026-09-0%d" % d, NAVE, "R", YO, 10, 10),
                        ("2026-09-0%d" % d, NAVE, "R", OTRO, 40, 40))]
    r = REPARTE(grupos, tit, {YO})
    assert [x["dia"] for x in r["hice"]] == ["2026-09-05", "2026-09-03",
                                            "2026-09-02", "2026-09-01"]


def test_varios_transporter_ids_de_la_misma_persona():
    """Una persona puede estar dada de alta dos veces (gotcha 15)."""
    r = REPARTE([("2026-09-07", NAVE, "XA_C18", "OTRO_ID_SUYO", 9, 9), ("2026-09-07", NAVE, "XA_C18", OTRO, 38, 38)], TITULARES,
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
    r = REPARTE([("2026-09-07", NAVE, "RDM__0gEhxOCPsPo=", YO, 111, 111)], tit, {YO})
    assert r["hice"] == [] and r["equipo"] == 0


def test_el_mismo_codigo_de_ruta_en_dos_naves_no_se_mezcla():
    """Gotcha 49: los codigos se repiten entre naves.

    El 05-09-2026, CA_A42 existia en DOS areas con transportistas distintos.
    Con la nave fuera de la clave, quien reparte esa ruta en una nave sale
    ayudando al titular de la otra.
    """
    tit = {("2026-09-05", NAVE, "CA_A42"): OTRO,
           ("2026-09-05", OTRA_NAVE, "CA_A42"): "UN_TERCERO"}
    grupos = [("2026-09-05", OTRA_NAVE, "CA_A42", YO, 40, 40),
              ("2026-09-05", OTRA_NAVE, "CA_A42", "UN_TERCERO", 60, 60)]
    r = REPARTE(grupos, tit, {YO})
    assert len(r["hice"]) == 1
    assert r["hice"][0]["de"] == "UN_TERCERO", "el titular tiene que ser el de SU nave"


def test_lo_que_llevas_cuenta_aunque_no_lo_hayas_entregado_todavia():
    """El caso de CHRISTIAN GALLEGO, 08-09-2026, y por que no se filtra por
    DELIVERED.

    Llevaba 51 paquetes de la ruta de Miguel Oscar Rojas —48 recogidos, 2
    entregados y 1 en camino— y la pantalla le decia CERO, porque solo se
    contaban entregas y las otras 49 aun no lo eran. Quien mira esto lo mira a
    media ruta, no al terminar el dia: la ayuda es lo que te echas a la
    furgoneta, no lo que ya ha llegado. Los entregados se siguen dando aparte.
    """
    r = REPARTE([("2026-09-08", NAVE, "XA_C9", YO, 51, 2),
                 ("2026-09-08", NAVE, "XA_C9", OTRO, 82, 82)],
                {("2026-09-08", NAVE, "XA_C9"): OTRO}, {YO})
    assert len(r["hice"]) == 1
    assert r["hice"][0]["paquetes"] == 51, "cuenta lo que lleva"
    assert r["hice"][0]["entregados"] == 2, "y dice cuanto ha entregado ya"


def test_un_paquete_que_nunca_llego_a_sus_manos_no_cuenta():
    """La agregacion deja fuera `_CX_NO_DESPACHADO` antes de llegar aqui.

    Se comprueba que el reparto no inventa: con cero asumidos no hay salida.
    """
    r = REPARTE([("2026-09-08", NAVE, "XA_C9", YO, 0, 0),
                 ("2026-09-08", NAVE, "XA_C9", OTRO, 82, 82)],
                {("2026-09-08", NAVE, "XA_C9"): OTRO}, {YO})
    assert r["hice"] == []


def _fuente(nombre):
    """El codigo tal y como esta escrito, no reimprimido por `ast.unparse`."""
    texto = io.open(SERVER, encoding="utf-8-sig").read()
    for n in ast.walk(_ARBOL):
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == nombre:
            return chr(10).join(texto.splitlines()[n.lineno - 1:n.end_lineno])
    raise AssertionError("no existe %s en server.py" % nombre)


def test_la_consulta_no_filtra_por_entregados():
    """El trinquete que faltaba.

    Los casos de arriba prueban el REPARTO, que recibe los grupos ya hechos;
    volver a poner `state: DELIVERED` en la consulta dejaba a Christian en cero
    otra vez y los diez pasaban en verde. Un trinquete que no cubre la puerta
    por la que entro el fallo no es un trinquete.
    """
    src = _fuente("_ayudas_del_mes")
    assert '"state": "DELIVERED"' not in src, (
        "filtrar por entregados esconde lo que el conductor lleva encima ahora")
    assert "_CX_NO_DESPACHADO" in src, (
        "hay que dejar fuera lo que nunca llego a sus manos, con la lista canonica")
    assert "_CX_OK" in src, "y contar aparte cuantos van entregados"


# ---------------------------------------------------------------------------
# EL RESUMEN COMO FUENTE: lo que destapo Christian Gallego el 08-09-2026
# ---------------------------------------------------------------------------
# «Los numeros me cuadran, pero el primer dia quite 60 paquetes y no aparecen.»
# Eran 65, en la ruta XA_C9 de Sergio Luis Rojas, y no aparecian porque el
# reparto por persona solo llega a `cortex_packages` cuando ALGUIEN ABRE esa
# ruta en Cortex: el paquete guarda un unico transportista, el de la ultima
# captura. Se vio en el propio dato — los paquetes del 01-09 se volvieron a
# capturar a las 11:22 del dia 8, justo cuando Dani abrio la ruta para hacer la
# captura de pantalla, y ahi aparecieron los 65.
# O sea que el contador estaba midiendo QUE RUTAS SE HABIAN MIRADO.
# El resumen del dia si trae el reparto entero y se captura solo: `cuentas`
# tiene una entrada por ruta y transportista. El 01-09, 44 rutas y 70 cuentas.

def _resumen():
    amb = {}
    for n in _ARBOL.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_CX_NO_DESPACHADO":
            amb["_CX_NO_DESPACHADO"] = ast.literal_eval(n.value)
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name in ("_cuenta_paquetes", "_ayudas_de_un_resumen"):
            exec(compile(ast.fix_missing_locations(ast.Module(body=[n], type_ignores=[])),  # noqa: S102
                         "<server>", "exec"), amb)
    return amb["_ayudas_de_un_resumen"], amb["_cuenta_paquetes"]


DEL_RESUMEN, CUENTA = _resumen()

# El dia 1 de verdad, recortado a las dos rutas que importan.
RUTAS_1 = [{"routeCode": "XA_C8", "transporterId": YO, "paquetes": {"DELIVERED": 90, "REMAINING": 0}},
           {"routeCode": "XA_C9", "transporterId": "SERGIO", "paquetes": {"DELIVERED": 214, "REMAINING": 0}}]
CUENTAS_1 = [{"transporterId": YO, "paquetes": {"DELIVERED": 90, "REMAINING": 0}},
             {"transporterId": "SERGIO", "paquetes": {"DELIVERED": 138, "REMAINING": 0}},
             {"transporterId": "IAGO", "paquetes": {"DELIVERED": 11, "REMAINING": 0}},
             {"transporterId": "CHRISTIAN", "paquetes": {"DELIVERED": 65, "REMAINING": 0}}]


def test_el_resumen_reparte_la_ruta_entre_los_tres():
    r = DEL_RESUMEN(RUTAS_1, CUENTAS_1)
    assert r["XA_C8"] == {YO: (90, 90)}
    assert r["XA_C9"] == {"SERGIO": (138, 138), "IAGO": (11, 11), "CHRISTIAN": (65, 65)}


def test_remaining_no_es_un_estado_y_no_se_suma():
    """`REMAINING` es lo que le queda por repartir; sumarlo lo contaria dos veces."""
    assert CUENTA({"DELIVERED": 10, "REMAINING": 40}) == (10, 10)
    assert CUENTA({"DELIVERED": 2, "PICKED_UP": 48, "REMAINING": 48}) == (50, 2)


def test_lo_que_nunca_llego_a_sus_manos_no_cuenta():
    assert CUENTA({"DELIVERED": 5, "NOT_READY": 3, "UNCOLLECTED": 2}) == (5, 5)


def test_una_ruta_que_no_cuadra_se_descarta_entera():
    """Si la suma no da, se prefiere no decir nada a repartir mal.

    El emparejamiento es por ORDEN —`cuentas` no trae el codigo de ruta—, asi
    que la unica defensa es exigir que cuadre al paquete. Medido sobre los 8
    dias de septiembre: cuadran 386 de 400, y las 14 que no son de la otra nave.
    """
    rutas = [{"routeCode": "R1", "transporterId": "A", "paquetes": {"DELIVERED": 100}}]
    cuentas = [{"transporterId": "A", "paquetes": {"DELIVERED": 40}}]
    assert DEL_RESUMEN(rutas, cuentas) == {}


def test_unassigned_no_es_una_persona():
    rutas = [{"routeCode": "R1", "transporterId": "A", "paquetes": {"DELIVERED": 30}}]
    cuentas = [{"transporterId": "unassigned", "paquetes": {"DELIVERED": 10}},
               {"transporterId": "A", "paquetes": {"DELIVERED": 20}}]
    r = DEL_RESUMEN(rutas, cuentas)
    assert r["R1"] == {"A": (20, 20)}, "los sueltos sin dueno no se le cuelgan a nadie"


def _juntar():
    amb = {}
    for n in _ARBOL.body:
        if isinstance(n, ast.FunctionDef) and n.name == "_ayudas_juntar":
            exec(compile(ast.fix_missing_locations(ast.Module(body=[n], type_ignores=[])),  # noqa: S102
                         "<server>", "exec"), amb)
    return amb["_ayudas_juntar"]


JUNTAR = _juntar()


def test_juntar_se_queda_con_la_cifra_mayor_y_no_suma():
    """Son dos miradas al MISMO hecho: sumarlas lo contaria dos veces."""
    a = [("2026-09-01", "N", "XA_C9", "CHRISTIAN", 65, 65)]
    b = [("2026-09-01", "N", "XA_C9", "CHRISTIAN", 65, 65)]
    assert JUNTAR(a, b) == [("2026-09-01", "N", "XA_C9", "CHRISTIAN", 65, 65)]


def test_juntar_toma_de_cada_fuente_lo_que_la_otra_no_ve():
    """El resumen no ve lo que aun va en la furgoneta; los paquetes si.

    Y al reves: los paquetes solo tienen el reparto de las rutas que alguien
    abrio en Cortex.
    """
    resumen = [("2026-09-08", "N", "XA_C9", "CHRISTIAN", 2, 2)]
    paquetes = [("2026-09-08", "N", "XA_C9", "CHRISTIAN", 51, 2)]
    assert JUNTAR(resumen, paquetes) == [("2026-09-08", "N", "XA_C9", "CHRISTIAN", 51, 2)]
    solo_resumen = [("2026-09-01", "N", "XA_C9", "CHRISTIAN", 65, 65)]
    assert JUNTAR(solo_resumen, []) == [("2026-09-01", "N", "XA_C9", "CHRISTIAN", 65, 65)]
