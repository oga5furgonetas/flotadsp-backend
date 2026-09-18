# -*- coding: utf-8 -*-
"""Pruebas de los endpoints /api/ia con FastAPI real y BD falsa. Ejecuta: python3 tests/test_api_ia.py"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "tests"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import tareas_ia as T  # noqa: E402
from fakedb import FakeDB  # noqa: E402

fallos = []


def check(nombre, cond, extra=""):
    print(("  OK   " if cond else "  FALLA") + f"  {nombre}" + (f"  → {extra}" if not cond else ""))
    if not cond:
        fallos.append(nombre)


db = FakeDB()
USUARIO = {"name": "dani", "role": "admin", "centers": ["OGA5", "DGA1", "DGA2"]}
avisos = []


async def fake_admin():
    return USUARIO


async def notificar(titulo, mensaje):
    avisos.append((titulo, mensaje))


app = FastAPI()
app.include_router(T.construir_router(db, fake_admin, notificar=notificar))
c = TestClient(app)

hoy = T.hoy_madrid()
manana = T.fecha_iso(hoy.replace()) if False else T.parse_fecha_es("mañana", hoy)

print("\n== ENDPOINTS ==")
r = c.post("/api/ia/comando", json={"texto": "monta la plantilla de DGA1 mañana cuando salgan las rutas en cortex"})
check("POST /comando programa la tarea", r.status_code == 200 and r.json()["accion"] == "programar", r.text[:300])
tarea_id = r.json()["datos"]["tarea"]["id"]

r = c.post("/api/ia/comando", json={"texto": "para mañana en DGA1: JUAN PEREZ - 1234ABC, MARIA LOPEZ - 5678DEF"})
check("POST /comando guarda las furgonetas", r.status_code == 200 and "preasignacion" in r.json()["accion"], r.text[:300])

r = c.get("/api/ia/preasignacion", params={"centro": "DGA1", "fecha": manana})
check("GET /preasignacion devuelve los pares", r.status_code == 200 and len(r.json()["pares"]) == 2, r.text[:300])

r = c.post("/api/ia/preasignacion", json={"centro": "DGA1", "fecha": manana,
                                          "texto": "ANA GIL 9012GHI", "modo": "añadir"})
check("POST /preasignacion añade sin borrar", r.status_code == 200 and len(r.json()["preasignacion"]["pares"]) == 3,
      r.text[:300])

r = c.post("/api/ia/preasignacion", json={"centro": "DGA1", "fecha": manana, "texto": "no hay matriculas aqui"})
check("POST /preasignacion sin pares → 400", r.status_code == 400, r.text[:200])

r = c.get("/api/ia/plantilla", params={"centro": "DGA1", "fecha": manana})
check("GET /plantilla sin rutas → listo=false y lo explica",
      r.status_code == 200 and r.json()["listo"] is False and "Cortex" in r.json()["mensaje"], r.text[:300])

# Ahora llegan las rutas de Cortex
db.amazon_reports.docs.append({
    "id": "r1", "center": "DGA1", "created_at": f"{manana}T07:10:00+00:00",
    "analysis": {"is_routes": True, "routes": [
        {"code": "CX101", "transporter_id": "A1", "driver_name": "JUAN PEREZ", "stops_total": 170},
        {"code": "CX102", "transporter_id": "A2", "driver_name": "MARIA LOPEZ", "stops_total": 160}]}})

r = c.get("/api/ia/plantilla", params={"centro": "DGA1", "fecha": manana})
j = r.json()
check("GET /plantilla monta la plantilla", r.status_code == 200 and j["listo"] and j["resumen"]["con_furgoneta"] == 2,
      r.text[:300])

r = c.post(f"/api/ia/tareas/{tarea_id}/ejecutar")
check("POST /tareas/{id}/ejecutar la ejecuta ya", r.status_code == 200 and r.json()["estado"] == "hecha", r.text[:300])
check("y avisa por Telegram", len(avisos) == 1, avisos)

r = c.get("/api/ia/tareas")
check("GET /tareas lista", r.status_code == 200 and len(r.json()["tareas"]) == 1, r.text[:200])

r = c.post("/api/ia/tareas", json={"centro": "DGA1", "fecha": "2026-12-01"})
nueva_id = r.json()["tarea"]["id"]
check("POST /tareas crea a mano", r.status_code == 200 and r.json()["creada"], r.text[:200])

r = c.delete(f"/api/ia/tareas/{nueva_id}")
check("DELETE /tareas la cancela", r.status_code == 200 and r.json()["success"], r.text[:200])

r = c.get("/api/ia/plantilla", params={"centro": "OTRO9", "fecha": manana})
check("centro ajeno → 403", r.status_code == 403, r.text[:200])

r = c.get("/api/ia/plantilla", params={"centro": "DGA1", "fecha": "mañana"})
check("fecha mal escrita → 400", r.status_code == 400, r.text[:200])

r = c.post("/api/ia/comando", json={"texto": ""})
check("comando vacío → 400", r.status_code == 400, r.text[:200])

r = c.post("/api/ia/comando", json={"texto": "reserva mesa para 4 en el restaurante"})
check("lo que no sabe hacer → lo dice", r.status_code == 200 and r.json()["accion"] is None, r.text[:200])

r = c.get("/api/ia/peticiones")
check("GET /peticiones lo tiene registrado", r.status_code == 200 and len(r.json()["peticiones"]) == 1, r.text[:200])

r = c.get("/api/ia/capacidades")
check("GET /capacidades da el texto para el prompt",
      r.status_code == 200 and "/api/ia/comando" in r.json()["texto"], r.text[:200])

print("\n" + ("TODO OK" if not fallos else f"{len(fallos)} FALLOS: {fallos}"))
sys.exit(1 if fallos else 0)
