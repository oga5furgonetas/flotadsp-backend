"""Tests de API contra la app real + MongoDB real (service en CI).

Cubren los contratos que más han dolido históricamente:
- salud y auth básica
- PERSISTENCIA de campos (el bug de las whitelists silenciosas: guardo X → leo X)
- demo de solo lectura (candado de mutaciones)
- reset de contraseña sin enumeración de usuarios
"""
import uuid

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
