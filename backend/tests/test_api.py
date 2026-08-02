"""Tests de API contra la app real + MongoDB real (service en CI).

Cubren los contratos que más han dolido históricamente:
- salud y auth básica
- PERSISTENCIA de campos (el bug de las whitelists silenciosas: guardo X → leo X)
- demo de solo lectura (candado de mutaciones)
- reset de contraseña sin enumeración de usuarios
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import server  # importa la app con el entorno de test (ver conftest)

pytestmark = pytest.mark.asyncio(loop_scope="session")

BASE = "http://testserver"


@pytest_asyncio.fixture(loop_scope="session")
async def client():
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url=BASE) as c:
        yield c


@pytest_asyncio.fixture(loop_scope="session")
async def admin_token():
    """Crea un admin de test directamente en la BD global y devuelve su JWT."""
    username = f"test_admin_{uuid.uuid4().hex[:8]}"
    user_id = str(uuid.uuid4())
    await server.global_db.admin_users.insert_one({
        "id": user_id, "username": username,
        "hashed_password": server.hash_password("test-password-123"),
        "name": "Admin Test", "role": "admin", "org_id": None,
    })
    return server.create_token(user_id, "admin", "Admin Test")


async def test_health_ok(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_login_wrong_credentials_is_401(client):
    r = await client.post("/api/auth/login",
                          json={"username": "no-existe", "password": "mala"})
    assert r.status_code == 401


async def test_forgot_password_never_reveals_users(client):
    r = await client.post("/api/auth/forgot-password",
                          json={"email": "noexiste@example.com"})
    assert r.status_code == 200
    assert r.json().get("success") is True


async def test_vehicle_field_persistence_roundtrip(client, admin_token):
    """EL test anti-whitelist-silenciosa: creo un vehículo con todos los campos
    del modal, lo edito por PATCH (itv_date, fuel_type…) y compruebo que TODO
    lo que guardé se lee de vuelta. Si alguien quita un campo de la whitelist
    o del modelo, esto revienta en CI en vez de fallar en silencio en prod."""
    h = {"Authorization": f"Bearer {admin_token}"}
    plate = f"TST {uuid.uuid4().hex[:4].upper()}"

    r = await client.post("/api/vehicles", headers=h, json={
        "license_plate": plate, "brand": "Toyota", "model": "Proace",
        "center": "TEST1", "fuel_type": "Diésel", "vehicle_type": "Furgoneta",
        "itv_date": "2027-03-15", "renting_end_date": "2027-12-01", "mileage": 12345,
    })
    assert r.status_code == 200, r.text
    vid = r.json()["id"]

    r = await client.patch(f"/api/vehicles/{vid}", headers=h, json={
        "itv_date": "2027-06-30", "fuel_type": "Eléctrico",
        "vehicle_type": "Camión", "renting_end_date": "2028-01-15",
    })
    assert r.status_code == 200, r.text

    r = await client.get("/api/vehicles", headers=h, params={"center": "TEST1"})
    assert r.status_code == 200
    v = next((x for x in r.json() if x["id"] == vid), None)
    assert v is not None, "el vehículo creado no aparece en el listado"
    assert v["itv_date"] == "2027-06-30"
    assert v["fuel_type"] == "Eléctrico"
    assert v["vehicle_type"] == "Camión"
    assert v["renting_end_date"] == "2028-01-15"
    assert v["mileage"] == 12345


async def test_driver_field_persistence_roundtrip(client, admin_token):
    """Igual para conductores: contrato/nivel/alojamiento sobreviven al viaje."""
    h = {"Authorization": f"Bearer {admin_token}"}
    r = await client.post("/api/drivers", headers=h, json={
        "name": f"Test Driver {uuid.uuid4().hex[:6]}", "center": "TEST1",
        "contrato": "empresa", "nivel": "L1", "alojamiento": "Piso Getafe",
    })
    assert r.status_code == 200, r.text
    did = r.json()["id"]

    r = await client.patch(f"/api/drivers/{did}", headers=h,
                           json={"nivel": "pleno", "contrato": "ett", "notas": "nota de test"})
    assert r.status_code == 200, r.text

    r = await client.get("/api/drivers", headers=h, params={"center": "TEST1"})
    d = next((x for x in r.json() if x["id"] == did), None)
    assert d is not None
    assert d["nivel"] == "pleno"
    assert d["contrato"] == "ett"
    assert d["notas"] == "nota de test"
    assert d["alojamiento"] == "Piso Getafe"


async def test_demo_is_strictly_read_only(client):
    r = await client.post("/api/auth/demo-login")
    assert r.status_code == 200
    tok = r.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}

    r = await client.get("/api/vehicles", headers=h)
    assert r.status_code == 200 and len(r.json()) > 0  # lee datos sintéticos

    r = await client.post("/api/vehicles", headers=h, json={"license_plate": "HACK 999"})
    assert r.status_code == 403  # candado de solo lectura


async def _admin_de_org(sufijo):
    """Admin de test con su propia organización (BD aislada test_dsp_iso_*)."""
    user_id = str(uuid.uuid4())
    await server.global_db.admin_users.insert_one({
        "id": user_id, "username": f"iso_{sufijo}_{uuid.uuid4().hex[:6]}",
        "hashed_password": server.hash_password("test-password-123"),
        "name": f"Admin {sufijo}", "role": "admin", "org_id": f"org_iso_{sufijo}",
    })
    return server.create_token(user_id, "admin", f"Admin {sufijo}",
                               org_id=f"org_iso_{sufijo}",
                               db_name=f"test_dsp_iso_{sufijo}")


async def test_aislamiento_entre_organizaciones(client):
    """EL test multi-tenant: lo que crea la org A no existe para la org B.

    Si alguien rompe el _TenantDBProxy o el set_current_org_db del token,
    esto revienta en CI antes de que un DSP vea la flota de otro."""
    ha = {"Authorization": f"Bearer {await _admin_de_org('a')}"}
    hb = {"Authorization": f"Bearer {await _admin_de_org('b')}"}
    plate = f"ISO {uuid.uuid4().hex[:4].upper()}"

    r = await client.post("/api/vehicles", headers=ha, json={
        "license_plate": plate, "brand": "Toyota", "model": "Proace",
        "center": "ISO1", "fuel_type": "Diésel", "vehicle_type": "Furgoneta",
    })
    assert r.status_code == 200, r.text
    vid = r.json()["id"]

    r = await client.get("/api/vehicles", headers=ha)
    assert any(v["id"] == vid for v in r.json()), "la org A no ve su propio vehículo"

    r = await client.get("/api/vehicles", headers=hb)
    assert r.status_code == 200
    assert all(v["id"] != vid for v in r.json()), "FUGA: la org B ve un vehículo de la org A"

    r = await client.patch(f"/api/vehicles/{vid}", headers=hb, json={"mileage": 999999})
    assert r.status_code in (403, 404), "FUGA: la org B pudo editar un vehículo de la org A"

    r = await client.get("/api/vehicles", headers=ha)
    v = next((x for x in r.json() if x["id"] == vid), None)
    assert v is not None and v.get("mileage") != 999999


async def test_webhook_ls_sin_secreto_se_rechaza(client, monkeypatch):
    """FAIL-CLOSED: sin LS_WEBHOOK_SECRET configurada no se acepta NADA.
    Es el endpoint que activa/suspende organizaciones (dinero)."""
    monkeypatch.delenv("LS_WEBHOOK_SECRET", raising=False)
    r = await client.post("/api/billing/lemonsqueezy/webhook", content=b"{}")
    assert r.status_code == 503


async def test_webhook_ls_firma_invalida_es_401(client, monkeypatch):
    monkeypatch.setenv("LS_WEBHOOK_SECRET", "secreto-de-test")
    r = await client.post("/api/billing/lemonsqueezy/webhook", content=b"{}",
                          headers={"X-Signature": "firma-falsa"})
    assert r.status_code == 401


async def test_webhook_ls_firma_valida_entra(client, monkeypatch):
    import hashlib
    import hmac as _hmac
    import json as _json
    monkeypatch.setenv("LS_WEBHOOK_SECRET", "secreto-de-test")
    body = _json.dumps({"meta": {"event_name": "ping_test"}}).encode()
    firma = _hmac.new(b"secreto-de-test", body, hashlib.sha256).hexdigest()
    r = await client.post("/api/billing/lemonsqueezy/webhook", content=body,
                          headers={"X-Signature": firma})
    assert r.status_code not in (401, 503), r.text


async def test_audit_log_registra_borrados(client):
    """M21: borrar un vehículo deja rastro global que el super-admin puede leer."""
    tok = await _admin_de_org("aud")
    h = {"Authorization": f"Bearer {tok}"}
    r = await client.post("/api/vehicles", headers=h, json={
        "license_plate": f"AUD {uuid.uuid4().hex[:4].upper()}", "brand": "Toyota",
        "model": "Proace", "center": "AUD1",
    })
    assert r.status_code == 200, r.text
    vid = r.json()["id"]
    r = await client.delete(f"/api/vehicles/{vid}", headers=h)
    assert r.status_code == 200, r.text

    # Super-admin (sa) lee el registro global
    sa_id = str(uuid.uuid4())
    await server.global_db.admin_users.insert_one({
        "id": sa_id, "username": f"sa_{uuid.uuid4().hex[:6]}",
        "hashed_password": server.hash_password("test-password-123"),
        "name": "SA Test", "role": "admin", "org_id": None,
    })
    sa_tok = server.create_token(sa_id, "admin", "SA Test", super_admin=True)
    r = await client.get("/api/admin/audit-log", headers={"Authorization": f"Bearer {sa_tok}"},
                         params={"action": "vehicle_delete"})
    assert r.status_code == 200, r.text
    rows = r.json()["rows"]
    assert any(x.get("detail", {}).get("vehicle_id") == vid for x in rows), \
        "el borrado del vehículo no quedó en el audit log"

    # Un admin NORMAL no puede leer el registro
    r = await client.get("/api/admin/audit-log", headers=h)
    assert r.status_code in (401, 403)


async def test_no_se_expone_la_plantilla_de_conductores(client):
    """SEGURIDAD: el portal ya no puede bajarse la lista de conductores.

    Antes, GET /auth/conductor-list devolvía id+nombre+email+centro de TODA la
    plantilla sin token, y con ese id se pedía un JWT del conductor. Este test
    fija que el nuevo camino solo responde por el email preguntado.
    """
    r = await client.post("/api/auth/driver-lookup", json={"email": "no.existe@x.com"})
    assert r.status_code == 404
    cuerpo = r.text.lower()
    # El error no puede filtrar datos de otros conductores
    assert "@" not in r.json().get("detail", "").replace("no.existe@x.com", "")


async def test_driver_token_exige_email_correcto(client, admin_token):
    """Un id de conductor suelto ya NO basta para conseguir un token."""
    h = {"Authorization": f"Bearer {admin_token}"}
    r = await client.post("/api/drivers", headers=h, json={
        "name": "Conductor Seguridad", "center": "SEC1",
        "email": f"sec_{uuid.uuid4().hex[:6]}@test.com",
    })
    assert r.status_code == 200, r.text
    did = r.json()["id"]

    # Sin email -> rechazado
    r = await client.post("/api/auth/driver-token", json={"driver_id": did})
    assert r.status_code == 403, r.text
    # Con email equivocado -> rechazado
    r = await client.post("/api/auth/driver-token",
                          json={"driver_id": did, "email": "otro@test.com"})
    assert r.status_code == 403, r.text


async def test_flujo_completo_de_turnos(client, admin_token):
    """El módulo de turnos entero: demanda → cuadrante → solicitud → aprobación.

    Estuvo construido en el backend y sin ninguna pantalla que lo llamara, así
    que nadie se habría enterado si se rompía. Esta prueba recorre la cadena
    igual que la usa el panel: si algún eslabón cae, CI lo canta.
    """
    h = {"Authorization": f"Bearer {admin_token}"}
    centro = f"TEST{uuid.uuid4().hex[:4].upper()}"
    hoy = datetime.now(timezone.utc)
    dias = [(hoy + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]

    # un conductor del centro (el generador necesita gente a la que asignar)
    did = str(uuid.uuid4())
    await server.db.drivers.insert_one(
        {"id": did, "name": "Conductor Turnos", "center": centro, "active": True})

    # 1. demanda de Amazon y mínimo de cobertura
    r = await client.post("/api/route-demand", headers=h,
                          json={"center": centro,
                                "items": [{"date": d, "objetivo": 1} for d in dias]})
    assert r.status_code == 200, r.text
    assert (await client.post("/api/shifts/settings", headers=h,
                              json={"center": centro, "min_cobertura": 1})).status_code == 200

    # 2. el generador automático propone (no guarda)
    r = await client.post("/api/shifts/generate-auto", headers=h,
                          json={"center": centro, "desde": dias[0], "hasta": dias[-1]})
    assert r.status_code == 200, r.text
    asignaciones = r.json()["assignments"]
    assert asignaciones, "el generador no propuso ni un turno"

    # 3. el panel guarda la propuesta
    r = await client.post("/api/shifts/bulk", headers=h, json={"items": asignaciones})
    assert r.status_code == 200 and r.json()["saved"] == len(asignaciones)

    # 4. la cobertura refleja lo guardado
    r = await client.get(f"/api/shifts/coverage?center={centro}"
                         f"&desde={dias[0]}&hasta={dias[-1]}", headers=h)
    assert r.status_code == 200
    assert sum(r.json()["coverage"].values()) == len(asignaciones)

    # 5. el conductor ve sus turnos y pide un día libre
    dtok = server.create_token(did, "driver", "Conductor Turnos")
    dh = {"Authorization": f"Bearer {dtok}"}
    r = await client.get(f"/api/shifts/mine?desde={dias[0]}&hasta={dias[-1]}", headers=dh)
    assert r.status_code == 200 and r.json()["shifts"]

    r = await client.post("/api/shift-requests", headers=dh,
                          json={"date": dias[2], "type": "libre"})
    assert r.status_code == 200, r.text
    req_id = r.json()["request"]["id"]

    # 6. el admin la aprueba y el turno queda en 'libre'
    r = await client.post(f"/api/shift-requests/{req_id}/resolve", headers=h,
                          json={"action": "aprobar"})
    assert r.status_code == 200 and r.json()["status"] == "aprobado"
    turno = await server.db.shifts.find_one({"driver_id": did, "date": dias[2]})
    assert turno and turno["type"] == "libre"
