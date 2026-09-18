# -*- coding: utf-8 -*-
"""Pruebas de tareas_ia.py con una BD falsa en memoria. Ejecuta: python3 tests/test_tareas_ia.py"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "tests"))
import asyncio  # noqa: E402
from datetime import date  # noqa: E402


import tareas_ia as T  # noqa: E402
from fakedb import FakeDB  # noqa: E402

HOY = date(2026, 9, 18)          # viernes
MANANA = "2026-09-19"
fallos = []


def check(nombre, cond, extra=""):
    print(("  OK   " if cond else "  FALLA") + f"  {nombre}" + (f"  → {extra}" if extra and not cond else ""))
    if not cond:
        fallos.append(nombre)


# ---------------------------------------------------------------- fechas
print("\n== FECHAS ==")
check("hoy", T.parse_fecha_es("monta la plantilla de hoy", HOY) == "2026-09-18")
check("mañana", T.parse_fecha_es("la plantilla de mañana", HOY) == MANANA)
check("pasado mañana", T.parse_fecha_es("pasado mañana", HOY) == "2026-09-20")
check("'esta mañana' NO es el día siguiente",
      T.parse_fecha_es("esta mañana móntala", HOY) == "2026-09-18",
      T.parse_fecha_es("esta mañana móntala", HOY))
check("el sábado", T.parse_fecha_es("el sábado", HOY) == "2026-09-19")
check("el viernes (hoy es viernes) = el que viene",
      T.parse_fecha_es("el viernes", HOY) == "2026-09-25")
check("20/09", T.parse_fecha_es("para el 20/09", HOY) == "2026-09-20")
check("20 de septiembre", T.parse_fecha_es("el 20 de septiembre", HOY) == "2026-09-20")
check("fecha ISO", T.parse_fecha_es("2026-10-02", HOY) == "2026-10-02")
check("sin fecha", T.parse_fecha_es("monta la plantilla", HOY) is None)
check("día ya pasado sin año → año que viene", T.parse_fecha_es("el 3/01", HOY) == "2027-01-03")

# ---------------------------------------------------------------- matrículas y pares
print("\n== PARES CONDUCTOR → FURGONETA ==")
texto = """estas son las furgonetas asignadas para mañana:
JUAN PEREZ GARCIA - 1234ABC
1234 BCD: María López Ruiz
PEREZ GARCIA, ANTONIO\t5678 DEF
Luis Ramos furgoneta 9012 GHI
esta línea no lleva matrícula
"""
pares, avisos = T.parse_pares(texto)
por_nombre = {p["conductor"].upper(): p["matricula"] for p in pares}
check("4 pares leídos", len(pares) == 4, pares)
check("nombre - matrícula", por_nombre.get("JUAN PEREZ GARCIA") == "1234ABC", por_nombre)
check("matrícula: nombre", por_nombre.get("MARÍA LÓPEZ RUIZ") == "1234BCD", por_nombre)
check("apellidos con coma y tabulador", por_nombre.get("PEREZ GARCIA, ANTONIO") == "5678DEF", por_nombre)
check("'furgoneta' no se cuela en el nombre", por_nombre.get("LUIS RAMOS") == "9012GHI", por_nombre)

p2, av2 = T.parse_pares("Ana Gil 1111AAA; Beto Sanz 2222BBB")
check("dos pares en una línea", len(p2) == 2, p2)

p3, av3 = T.parse_pares("Ana Gil 1111AAA\nAna Gil 3333CCC")
check("mismo conductor dos veces → avisa y se queda la última",
      len(p3) == 1 and p3[0]["matricula"] == "3333CCC" and av3, (p3, av3))

p4, av4 = T.parse_pares("Ana Gil 1111AAA\nBeto Sanz 1111AAA")
check("misma furgoneta a dos conductores → avisa", any("1111 AAA" in a for a in av4), av4)

check("matrícula antigua (C-1234-BC)", T.buscar_matriculas("C-1234-BC")[0][0] == "C1234BC",
      T.buscar_matriculas("C-1234-BC"))
check("formato bonito", T.formato_matricula("1234ABC") == "1234 ABC")

# ---------------------------------------------------------------- nombres
print("\n== EMPAREJAR NOMBRES ==")
cands = [{"conductor": "JUAN PEREZ GARCIA"}, {"conductor": "MARIA LOPEZ"}]
check("nombre idéntico", T.emparejar_nombre("Juan Pérez García", cands)[0] == 0)
check("nombre parcial (2 palabras)", T.emparejar_nombre("PEREZ GARCIA, JUAN", cands)[0] == 0)
check("con tildes y orden distinto", T.emparejar_nombre("garcia juan perez", cands)[0] == 0)
check("desconocido → sin coincidencia", T.emparejar_nombre("Pedro Ruiz", cands) == (None, "sin_coincidencia"))
gemelos = [{"conductor": "JUAN PEREZ GARCIA"}, {"conductor": "JUAN PEREZ LOPEZ"}]
check("dos que encajan igual → ambiguo, no elige",
      T.emparejar_nombre("JUAN PEREZ", gemelos) == (None, "ambiguo"),
      T.emparejar_nombre("JUAN PEREZ", gemelos))


# ---------------------------------------------------------------- plantilla
def base_con_rutas(fecha=MANANA, centro="DGA1"):
    db = FakeDB()
    db.amazon_reports.docs.append({
        "id": "r1", "center": centro, "created_at": f"{fecha}T07:12:00+00:00",
        "analysis": {"is_routes": True, "routes": [
            {"code": "CX102", "transporter_id": "A1", "driver_name": "JUAN PEREZ GARCIA",
             "service": "Standard", "stops_total": 180},
            {"code": "CX101", "transporter_id": "A2", "driver_name": "MARIA LOPEZ RUIZ",
             "service": "Standard", "stops_total": 165},
            {"code": "CX103", "transporter_id": "A3", "driver_name": "PEDRO SANCHEZ",
             "service": "Nursery", "stops_total": 90},
        ]},
    })
    db.drivers.docs += [
        {"id": "d1", "name": "JUAN PEREZ GARCIA", "driver_id": "A1", "center": centro},
        {"id": "d2", "name": "MARIA LOPEZ RUIZ", "driver_id": "A2", "center": centro},
        {"id": "d3", "name": "PEDRO SANCHEZ", "driver_id": "A3", "center": centro},
    ]
    db.vehicles.docs += [
        {"id": "v1", "license_plate": "0001AAA", "current_driver_id": "d3", "center": centro},
    ]
    return db


async def pruebas_async():
    print("\n== PLANTILLA ==")
    db = base_con_rutas()
    await T.guardar_preasignacion(db, MANANA, "DGA1", [
        {"conductor": "JUAN PEREZ GARCIA", "matricula": "1234ABC"},
        {"conductor": "MARIA LOPEZ RUIZ", "matricula": "5678DEF"},
        {"conductor": "NO SALE HOY", "matricula": "9999ZZZ"},
    ], usuario={"name": "dani"})

    p = await T.construir_plantilla(db, MANANA, "DGA1")
    check("plantilla lista", p["listo"])
    filas = {f["conductor"]: f for f in p["filas"]}
    check("furgoneta de la preasignación",
          filas["JUAN PEREZ GARCIA"]["matricula"] == "1234ABC"
          and filas["JUAN PEREZ GARCIA"]["origen"] == "preasignacion", filas["JUAN PEREZ GARCIA"])
    check("furgoneta de la ficha cuando no está preasignado",
          filas["PEDRO SANCHEZ"]["matricula"] == "0001AAA"
          and filas["PEDRO SANCHEZ"]["origen"] == "ficha", filas["PEDRO SANCHEZ"])
    check("orden por código de ruta", [f["rutas"][0]["code"] for f in p["filas"]] == ["CX101", "CX102", "CX103"])
    check("preasignada que no sale en Cortex queda como sobrante",
          [s["conductor"] for s in p["sobrantes"]] == ["NO SALE HOY"], p["sobrantes"])
    check("resumen cuadra", p["resumen"]["con_furgoneta"] == 3 and p["resumen"]["sin_furgoneta"] == 0,
          p["resumen"])
    check("el texto pone primero la ruta y después la furgoneta",
          p["texto"].index("CX101") < p["texto"].index("5678 DEF"), p["texto"])

    # sin furgoneta de ningún sitio
    db2 = base_con_rutas()
    p2 = await T.construir_plantilla(db2, MANANA, "DGA1")
    sin = [f for f in p2["filas"] if not f["matricula"]]
    check("sin dato → 'SIN FURGONETA', no se inventa", len(sin) == 2 and "SIN FURGONETA" in p2["texto"], sin)

    # sin rutas todavía
    db3 = FakeDB()
    p3 = await T.construir_plantilla(db3, MANANA, "DGA1")
    check("sin rutas de Cortex → no está lista", p3["listo"] is False and p3["motivo"] == "sin_rutas")

    print("\n== MENSAJES DEL CHAT ==")
    db = FakeDB()
    centros = ["OGA5", "DGA1", "DGA2"]
    msg = ("genera la plantilla de dga1 mañana cuando salgan en cortex y ahora con la preasignacion "
           "coge las furgonetas que le tocaria a cada uno primero pon las rutas de cada uno y "
           "despues la furgoneta que le tocaria")
    r = await T.procesar_mensaje(db, msg, centros=centros, usuario={"name": "dani"}, hoy=HOY)
    check("el encargo de mañana queda programado", r["accion"] == "programar", r)
    tarea = r["datos"]["tarea"]
    check("tarea: centro y fecha correctos", tarea["centro"] == "DGA1" and tarea["fecha"] == MANANA, tarea)

    await T.procesar_mensaje(db, msg, centros=centros, usuario={"name": "dani"}, hoy=HOY)
    check("no duplica el mismo encargo", len(db["ia_tareas"].docs) == 1, db["ia_tareas"].docs)

    msg2 = ("estas son las furgonetas asignadas para mañana en DGA1, si alguno coincide cuando montes "
            "la plantilla segun los drivers de cortex asignale esta furgoneta:\n"
            "JUAN PEREZ GARCIA - 1234ABC\nMARIA LOPEZ RUIZ - 5678DEF")
    r3 = await T.procesar_mensaje(db, msg2, centros=centros, usuario={"name": "dani"}, hoy=HOY)
    check("guarda las furgonetas y mantiene el encargo", r3["accion"].startswith("preasignacion"), r3["accion"])
    pre = await T.obtener_preasignacion(db, MANANA, "DGA1")
    check("2 pares guardados para mañana", len(pre["pares"]) == 2, pre)

    r4 = await T.procesar_mensaje(db, "JUAN PEREZ 1111AAA", centros=centros, hoy=HOY)
    check("sin día → pregunta, no guarda a lo loco", r4["accion"] == "falta_fecha", r4["accion"])

    r5 = await T.procesar_mensaje(db, "monta la plantilla de mañana", centros=centros, hoy=HOY)
    check("sin centro → pregunta", r5["accion"] == "falta_centro", r5["accion"])

    r6 = await T.procesar_mensaje(db, "¿qué tareas tienes programadas?", centros=centros, hoy=HOY)
    check("consulta lo programado", r6["accion"] == "consultar" and "DGA1" in r6["respuesta"], r6["respuesta"])

    r7 = await T.procesar_mensaje(db, "pídeme una pizza para el almacén", centros=centros, hoy=HOY)
    check("lo que no sabe hacer: lo dice y lo registra",
          r7["accion"] is None and len(db["ia_peticiones"].docs) == 1, r7["accion"])

    r8 = await T.procesar_mensaje(db, "cancela la plantilla programada de DGA1 de mañana",
                                  centros=centros, hoy=HOY)
    check("cancela el encargo", r8["accion"] == "cancelar" and r8["datos"]["canceladas"] == 1, r8)
    check("la tarea queda cancelada en BD", db["ia_tareas"].docs[0]["estado"] == "cancelada")

    print("\n== BUCLE DE FONDO ==")
    db = base_con_rutas(fecha="2026-09-18")
    await T.crear_tarea(db, "plantilla", "2026-09-18", "DGA1", usuario={"name": "dani"})
    avisos_enviados = []

    async def notificar(titulo, mensaje):
        avisos_enviados.append((titulo, mensaje))

    res = await T.procesar_tareas(db, notificar=notificar, hoy=HOY)
    check("con las rutas ya subidas, la monta sola", res["hechas"] == 1, res)
    check("y avisa por Telegram", len(avisos_enviados) == 1 and "CX101" in avisos_enviados[0][1])
    check("queda guardada como hecha", db["ia_tareas"].docs[0]["estado"] == "hecha")
    check("y con la plantilla dentro", db["ia_tareas"].docs[0]["resultado"]["listo"] is True)

    res2 = await T.procesar_tareas(db, notificar=notificar, hoy=HOY)
    check("no la repite", res2["hechas"] == 0 and len(avisos_enviados) == 1)

    db = FakeDB()  # tarea de hoy pero Cortex aún no sacó nada
    await T.crear_tarea(db, "plantilla", "2026-09-18", "DGA1")
    res3 = await T.procesar_tareas(db, hoy=HOY)
    check("sin rutas todavía → sigue esperando", res3["esperando"] == 1
          and db["ia_tareas"].docs[0]["estado"] == "pendiente", res3)
    check("cuenta los intentos", db["ia_tareas"].docs[0]["intentos"] == 1)

    db = FakeDB()  # tarea de ayer que nunca pudo hacerse
    await T.crear_tarea(db, "plantilla", "2026-09-17", "DGA1")
    res4 = await T.procesar_tareas(db, notificar=notificar, hoy=HOY)
    check("la de ayer caduca y se avisa", res4["caducadas"] == 1
          and db["ia_tareas"].docs[0]["estado"] == "caducada", res4)

    db = FakeDB()  # tarea futura: no se toca
    await T.crear_tarea(db, "plantilla", "2026-09-25", "DGA1")
    res5 = await T.procesar_tareas(db, hoy=HOY)
    check("la de la semana que viene se queda esperando su día",
          res5 == {"hechas": 0, "esperando": 0, "caducadas": 0, "revisadas": 1}, res5)


asyncio.run(pruebas_async())
print("\n" + ("TODO OK" if not fallos else f"{len(fallos)} FALLOS: {fallos}"))
sys.exit(1 if fallos else 0)
