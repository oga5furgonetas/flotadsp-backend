"""Config de tests de API: entorno aislado ANTES de importar server.

Corre contra un MongoDB real (service container en CI). Bases con prefijo
test_ para no tocar datos reales jamás.
"""
import os
import sys
from pathlib import Path

# Entorno mínimo ANTES del import (server.py exige SECRET_KEY al importar)
os.environ.setdefault("SECRET_KEY", "test-secret-key-only-for-tests")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_flotadsp")
os.environ.setdefault("GLOBAL_DB_NAME", "test_flotadsp_global")
os.environ.setdefault("ADMIN_USERNAME", "")   # sin seed de admins del arranque
os.environ.setdefault("ADMIN_PASSWORD", "")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest_asyncio  # noqa: E402

import server  # noqa: E402


@pytest_asyncio.fixture(loop_scope="session", autouse=True)
async def _rebind_motor():
    """Motor captura el event loop al crear el cliente (en el import de server,
    sin loop corriendo). Lo recreamos DENTRO del loop de la sesión de tests para
    evitar el clásico 'attached to a different loop'."""
    from motor.motor_asyncio import AsyncIOMotorClient
    server.client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    server.global_db = server.client[os.environ["GLOBAL_DB_NAME"]]
    yield
    server.client.close()
