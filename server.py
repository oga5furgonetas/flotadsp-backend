```python
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection (safe mode)
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'flotadsp')

client = AsyncIOMotorClient(mongo_url) if mongo_url else None
db = client[db_name] if client else None

# Create app
app = FastAPI()

# API router
api_router = APIRouter(prefix="/api")


# ─────────────────────────────────────────────
# BASIC ROUTES
# ─────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "FlotaDSP Pro API + Perito IA Pro"}


@api_router.get("/health")
async def health():
    return {"status": "ok"}


@api_router.get("/sync")
async def sync_data():
    return {"ok": True}


# ─────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class StatusCheckCreate(BaseModel):
    client_name: str


# ─────────────────────────────────────────────
# STATUS ROUTES
# ─────────────────────────────────────────────

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):

    if not db:
        return {"error": "Database not configured"}

    status_dict = input.model_dump()

    status_obj = StatusCheck(**status_dict)

    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()

    await db.status_checks.insert_one(doc)

    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():

    if not db:
        return []

    status_checks = await db.status_checks.find(
        {},
        {"_id": 0}
    ).to_list(1000)

    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(
                check['timestamp']
            )

    return status_checks


# ─────────────────────────────────────────────
# PERITO MODULE
# ─────────────────────────────────────────────

from perito import build_router as build_perito_router

if db:
    api_router.include_router(build_perito_router(db))


# ─────────────────────────────────────────────
# REGISTER ROUTER
# ─────────────────────────────────────────────

app.include_router(api_router)


# ─────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get(
        'CORS_ORIGINS',
        '*'
    ).split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# SHUTDOWN
# ─────────────────────────────────────────────

@app.on_event("shutdown")
async def shutdown_db_client():

    if client:
        client.close()
```
