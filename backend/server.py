from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Depends, Body, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

from PIL import Image

from pydantic import BaseModel, Field, ConfigDict

from typing import List, Optional, Tuple

from pathlib import Path

from datetime import datetime, timezone, timedelta

from concurrent.futures import ThreadPoolExecutor

from jose import jwt, JWTError
import bcrypt
import re

import asyncio
import os
import io
import json
import uuid
import base64
import logging

# =========================
# PATHS + ENV
# =========================

ROOT_DIR = Path(__file__).parent
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

load_dotenv(ROOT_DIR / ".env")

_executor = ThreadPoolExecutor(max_workers=4)
_gemini_sem = asyncio.Semaphore(2)  # máximo 2 llamadas Gemini simultáneas

PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")

# AI Detection microservice (YOLO11 + SAM2)
# Set AI_SERVICE_URL=http://ai-service:8001 when GPU microservice is running.
# If not set, /annotated falls back to location_hint mapping (deterministic, free).
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "").rstrip("/")

# Cloudflare R2
R2_ENDPOINT    = os.environ.get("R2_ENDPOINT", "")       # https://<account>.r2.cloudflarestorage.com
R2_BUCKET      = os.environ.get("R2_BUCKET", "flotadsp-uploads")
R2_ACCESS_KEY  = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY  = os.environ.get("R2_SECRET_KEY", "")
R2_PUBLIC_URL  = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")  # https://cdn.tu-dominio.com

_r2_client = None

def get_r2():
    global _r2_client
    if _r2_client is not None:
        return _r2_client
    if not (R2_ENDPOINT and R2_ACCESS_KEY and R2_SECRET_KEY):
        return None
    try:
        import boto3
        _r2_client = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            region_name="auto",
        )
        return _r2_client
    except Exception as e:
        logger.warning(f"R2 no disponible: {e}")
        return None

# JWT config
SECRET_KEY = os.environ.get("SECRET_KEY", "")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY no configurada. Usa: fly secrets set SECRET_KEY=$(openssl rand -hex 32)")

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "72"))

# =========================
# DATABASE
# =========================

mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get("DB_NAME", "flotadsp")]

# =========================
# FASTAPI
# =========================

app = FastAPI(title="FlotaDSP API", version="5.3.4")
api_router = APIRouter(prefix="/api")

# StaticFiles DESPUÉS del middleware — solo como fallback local
# (si R2 está configurado, las imágenes van a R2 directamente)

# =========================
# LOGGING
# =========================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# =========================
# MODELS
# =========================

class Vehicle(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    license_plate: str
    brand: str = ""
    model: str = ""
    color: str = ""
    year: Optional[int] = None
    vin: Optional[str] = None
    status: str = "active"
    center: Optional[str] = None
    current_driver_id: Optional[str] = None
    mileage: Optional[int] = None
    provider: Optional[str] = None
    vehicle_type: Optional[str] = None
    workshop_status: Optional[str] = None
    workshop_reason: Optional[str] = None
    documents: List[str] = []
    # --- Bolsas ---
    bags_remaining: int = 0
    bags_history: List[dict] = []  # [{date, change, note, remaining_after}]
    mileage_history: List[dict] = []  # [{date, km, source}]
    itv_date: Optional[str] = None  # ISO YYYY-MM-DD, caducidad ITV
    renting_end_date: Optional[str] = None  # ISO, vencimiento contrato renting
    renting_baja_date: Optional[str] = None  # ISO, fecha baja renting
    # --- Aceite ---
    oil_last_change_km: Optional[int] = None
    oil_last_change_date: Optional[str] = None
    oil_interval_km: int = 15000
    oil_warning_before_km: int = 2500
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VehicleCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    license_plate: str
    brand: str = ""
    model: str = ""
    color: str = ""
    year: Optional[int] = None
    vin: Optional[str] = None
    center: Optional[str] = None
    current_driver_id: Optional[str] = None
    mileage: Optional[int] = None
    provider: Optional[str] = None
    vehicle_type: Optional[str] = None
    workshop_status: Optional[str] = None
    workshop_reason: Optional[str] = None
    documents: List[str] = []


class Driver(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    dni: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    license_number: Optional[str] = None
    login: Optional[str] = None        # login del conductor
    driver_id: Optional[str] = None    # ID de Amazon
    photo_url: Optional[str] = None    # foto de perfil (R2)
    center: Optional[str] = None
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DriverCreate(BaseModel):
    name: str
    dni: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    license_number: Optional[str] = None
    center: Optional[str] = None
    password: Optional[str] = None


class Damage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    part: str
    severity: str
    description: str
    repair_suggestion: str = ""
    estimated_cost: float = 0.0
    confidence: float = 0.0
    location_hint: str = ""
    photo_index: Optional[int] = None      # imagen (1-based) donde mejor se ve el daño
    box_2d: Optional[List[int]] = None     # [ymin,xmin,ymax,xmax] normalizado 0-1000
    is_new: bool = True
    # --- v5.1: gestión de reparación ---
    actual_cost: Optional[float] = None       # coste real introducido por admin tras la reparación
    workshop_id: Optional[str] = None         # taller asignado para reparar este daño
    repair_status: str = "pending"            # pending | assigned | in_repair | done | declined
    repair_notes: str = ""                    # notas libres sobre la reparación
    assigned_at: Optional[str] = None         # ISO timestamp cuando se asignó taller
    completed_at: Optional[str] = None        # ISO timestamp cuando se marcó como reparado


# Approximate zone → [ymin, xmin, ymax, xmax] normalized 0-1000.
# Used as deterministic fallback when GPU microservice is unavailable.
_LOCATION_BOX: dict = {
    "frontal":           [50,  200, 480, 800],
    "trasera":           [520, 200, 950, 800],
    "lateral_izquierdo": [150,  30, 850, 420],
    "lateral_derecho":   [150, 580, 850, 970],
    "techo":             [50,  180, 380, 820],
    "otra":              [280, 280, 720, 720],
}


# =========================
# TALLERES (v5.1)
# =========================

class Workshop(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    address: str = ""
    city: str = ""
    center: Optional[str] = None       # OGA5 | DGA1 | DGA2 — centro logístico más cercano
    phone: str = ""
    email: str = ""
    notes: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Categorías de trabajo: chapa, mecanica, lunas, neumaticos, oficial_toyota
    categories: List[str] = []
    # Lista de proveedores con los que tiene convenio (nombres tal y como aparecen en Vehicle.provider).
    # Si es taller "universal" (Carglass por seguro, p.ej.), poner ["*"] o dejar vacío.
    convenios: List[str] = []
    rating: Optional[float] = None     # 0-5 (de Google o manual)
    rating_count: Optional[int] = None # nº de reseñas Google
    hours: str = ""                    # horario legible, p.ej. "L-V 8-16h"
    maps_url: str = ""                 # enlace a Google Maps
    active: bool = True
    is_official: bool = False          # true para concesionarios oficiales (Toyota, etc.)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkshopCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    address: str = ""
    city: str = ""
    center: Optional[str] = None
    phone: str = ""
    email: str = ""
    notes: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    categories: List[str] = []
    convenios: List[str] = []
    rating: Optional[float] = None
    rating_count: Optional[int] = None
    hours: str = ""
    maps_url: str = ""
    is_official: bool = False


class AIDetection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    label: str
    severity: str = "leve"
    box_2d: List[float]  # [ymin, xmin, ymax, xmax] normalized 0-1000
    confidence: float = 0.7
    source: str = "location_hint"  # "yolo" | "sam2" | "location_hint"


class InspectionAIResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    inspection_id: str
    photo_index: int = 0
    detections: List[AIDetection] = []
    source: str = "location_hint"  # "yolo" | "location_hint" | "gemini_legacy"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InspectionAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")
    critical_damages_count: int = 0
    total_damages_count: int = 0
    new_damages_count: int = 0
    severity: str = "sin_danos"
    dirt_level: Optional[float] = None  # 0 impecable — 10 cubierta de barro
    urgency: str = "puede_esperar"
    risk: str = "bajo"
    circulation_safe: bool = True
    detected_plate: str = ""
    fraud_warnings: List[str] = []
    hidden_damage_probability: float = 0.0
    total_estimated_cost: float = 0.0
    confidence: float = 0.0
    executive_summary: str = ""
    image_quality_warnings: List[str] = []
    affected_parts: List[str] = []
    critical_damages: list = []
    new_damages: List[Damage] = []
    damages: List[Damage] = []


class Inspection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    driver_id: Optional[str] = None
    photos: List[str] = []
    reference_photos: List[str] = []
    is_reference: bool = False
    analysis: Optional[InspectionAnalysis] = None
    analysis_status: str = "ok"           # ok | gemini_failed | gemini_timeout
    analysis_error: Optional[str] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    analyzed_at: Optional[datetime] = None


class Alert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    inspection_id: str
    title: str
    description: str
    severity: str
    read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LoginRequest(BaseModel):
    username: str
    password: str


class DriverLoginRequest(BaseModel):
    email: str
    password: str


class SetDriverPasswordRequest(BaseModel):
    driver_id: str
    password: str


class CreateAdminRequest(BaseModel):
    username: str
    password: str
    name: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str
    id: str
    center: Optional[str] = None
    theme: Optional[str] = None


# =========================
# AUTH HELPERS
# =========================

_bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: str, role: str, name: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {
        "sub": user_id,
        "role": role,
        "name": name,
        "exp": expires
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token inválido: {e}")


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Se requiere autenticación")
    return decode_token(credentials.credentials)


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso restringido a administradores")
    return user


async def require_any_auth(user: dict = Depends(get_current_user)) -> dict:
    return user


# =========================
# STARTUP — seed admin inicial
# =========================

@app.on_event("startup")
async def seed_initial_admin():
    username = os.environ.get("ADMIN_USERNAME", "")
    password = os.environ.get("ADMIN_PASSWORD", "")

    if not username or not password:
        logger.info("ADMIN_USERNAME/ADMIN_PASSWORD no configurados — omitiendo seed")
    else:
        existing = await db.admin_users.find_one({"username": username})
        if existing:
            logger.info(f"Admin '{username}' ya existe — seed omitido")
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "username": username,
                "hashed_password": hash_password(password),
                "name": os.environ.get("ADMIN_NAME", username),
                "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.admin_users.insert_one(doc)
            logger.info(f"Admin inicial '{username}' creado correctamente")

    # ── Admin fijo: Mery ──────────────────────────────────────────────────────
    # Cuenta permanente para Mery. Idempotente: solo se crea si no existe.
    mery_existing = await db.admin_users.find_one({"username": "Mery"})
    if not mery_existing:
        mery_doc = {
            "id": str(uuid.uuid4()),
            "username": "Mery",
            "hashed_password": hash_password("ogsan2024"),
            "name": "Mery",
            "role": "admin",
            "theme": "pastel",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.admin_users.insert_one(mery_doc)
        logger.info("Admin 'Mery' creado correctamente")
    else:
        # Asegurar que tenga el campo theme aunque venga de versión anterior
        if not mery_existing.get("theme"):
            await db.admin_users.update_one(
                {"username": "Mery"},
                {"$set": {"theme": "pastel"}}
            )

    # Informar si R2 está configurado
    r2 = get_r2()
    if r2:
        logger.info(f"Cloudflare R2 configurado: bucket={R2_BUCKET}, public_url={R2_PUBLIC_URL}")
    else:
        logger.warning("R2 NO configurado — usando almacenamiento local (no recomendado en producción)")


@app.on_event("startup")
async def create_indexes():
    """Crea indices MongoDB para rendimiento. Idempotente."""
    try:
        await db.vehicles.create_index("id")
        await db.vehicles.create_index("license_plate")
        await db.vehicles.create_index("center")
        await db.vehicles.create_index("current_driver_id")
        await db.vehicles.create_index("status")
        await db.drivers.create_index("id")
        await db.drivers.create_index("driver_id")
        await db.inspections.create_index("id")
        await db.inspections.create_index("vehicle_id")
        await db.inspections.create_index([("created_at", -1)])
        await db.inspections.create_index("driver_id")          # scoring por conductor
        await db.inspections.create_index("reviewed")           # cola de revisión rápida
        await db.inspections.create_index("analysis_status")    # recuperación de análisis
        await db.daily_assignments.create_index([("date", -1), ("center", 1)])  # cuadrante/resumen diario
        await db.alerts.create_index([("created_at", -1)])
        await db.alerts.create_index("read")
        await db.incidents.create_index("vehicle_id")
        await db.incidents.create_index("status")
        await db.admin_users.create_index("username")
        await db.driver_accounts.create_index("username")
        await db.inspection_ai_results.create_index(
            [("inspection_id", 1), ("photo_index", 1)], unique=True
        )
        await db.workshops.create_index("id")
        await db.workshops.create_index("center")
        await db.workshops.create_index("convenios")
        await db.workshops.create_index("categories")
        logger.info("Indices MongoDB creados/verificados correctamente")
    except Exception as e:
        logger.warning(f"Error creando indices: {e}")


# =========================
# SEED talleres ancla (v5.1)
# =========================

# 12 talleres ancla iniciales: Toyota oficiales (Kinto), Carglass (lunas universal) y chapistas por ciudad.
# Idempotente: solo siembra si la colección está vacía.
_SEED_WORKSHOPS: list = [
    # ========== KINTO ONE — Red Oficial Toyota (datos verificados Google) ==========
    {
        "name": "Toyota Compostela Móvil — Taller Oficial",
        "address": "Travesía de Reborido 13, 15866 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 981 52 43 53",
        "hours": "L-V 8-19h · S 10-13h",
        "latitude": 42.8385479, "longitude": -8.583236,
        "maps_url": "https://maps.google.com/?cid=ChIJFctNSzMDLw0RdXT2G4qe7PQ",
        "categories": ["oficial_toyota", "mecanica", "chapa"],
        "convenios": ["KINTO ONE", "KINTO"],
        "rating": 4.6, "rating_count": 33, "is_official": True,
        "notes": "Taller oficial Toyota. Red oficial para furgonetas Kinto del centro OGA5 (Santiago).",
    },
    {
        "name": "Toyota Breogán Motor — Taller Oficial (A Coruña)",
        "address": "Pol. Ind. A Grela, Rúa Gambrinus 13, 15008 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 16 04 70",
        "hours": "L-V 8:30-18h",
        "latitude": 43.3525605, "longitude": -8.4251936,
        "maps_url": "https://maps.google.com/?cid=ChIJO-ssk-58Lg0R-1Sw4WVZBMw",
        "categories": ["oficial_toyota", "mecanica", "chapa"],
        "convenios": ["KINTO ONE", "KINTO"],
        "rating": 4.5, "rating_count": 335, "is_official": True,
        "notes": "Taller oficial Toyota/Lexus para furgonetas Kinto del centro DGA1 (Cambre).",
    },
    {
        "name": "Toyota Breogán Vigo — Taller Oficial",
        "address": "Estrada Camposancos 108, 36213 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 26 75 49",
        "hours": "L-V 8:30-18h",
        "latitude": 42.1987698, "longitude": -8.7633998,
        "maps_url": "https://maps.google.com/?cid=ChIJ4ULTw92LJQ0RLrkHOiWkXiY",
        "categories": ["oficial_toyota", "mecanica", "chapa"],
        "convenios": ["KINTO ONE", "KINTO"],
        "rating": 4.4, "rating_count": 34, "is_official": True,
        "notes": "Taller oficial Toyota para furgonetas Kinto del centro DGA2 (Vigo).",
    },

    # ========== CARGLASS — Lunas (universal, todas las aseguradoras/renting) ==========
    {
        "name": "Carglass Santiago (Av. de Lugo)",
        "address": "Av. de Lugo 227, 15703 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 881 02 58 22",
        "hours": "L-V 9-14h, 15:30-19h · S 9-14h",
        "latitude": 42.881745, "longitude": -8.5334578,
        "maps_url": "https://maps.google.com/?cid=ChIJc8PwHkz-Lg0Rtbl65wJi5cw",
        "categories": ["lunas"], "convenios": ["*"],
        "rating": 4.6, "rating_count": 320,
        "notes": "Reparación y sustitución de lunas. Gestión vía parte de seguro/renting.",
    },
    {
        "name": "Carglass Santiago (Tambre)",
        "address": "Via Isaac Peral 3, 15890 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 881 02 58 22",
        "hours": "L-V 9-14h, 15:30-19h",
        "latitude": 42.910104, "longitude": -8.5107131,
        "maps_url": "https://maps.google.com/?cid=ChIJq6qqqmb_Lg0RXzK5CQdnoTo",
        "categories": ["lunas"], "convenios": ["*"],
        "rating": 4.7, "rating_count": 297,
        "notes": "Lunas. En el polígono del Tambre. Gestión vía seguro/renting.",
    },
    {
        "name": "Carglass A Coruña",
        "address": "Av. Ferrocarril 106, 15008 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 881 02 58 22",
        "hours": "L-V 9-14h, 15:30-19h · S 9-14h",
        "latitude": 43.3479693, "longitude": -8.4192076,
        "maps_url": "https://maps.google.com/?cid=ChIJe-4fuOp8Lg0R3b-rOk7tQno",
        "categories": ["lunas"], "convenios": ["*"],
        "rating": 4.5, "rating_count": 436,
        "notes": "Lunas. Gestión vía seguro/renting.",
    },
    {
        "name": "Carglass Vigo (Sárdoma)",
        "address": "Camiño da Raposeira 42, Sárdoma, 36214 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 28 95 84",
        "hours": "L-V 9-14h, 15:30-19h · S 9-14h",
        "latitude": 42.2137786, "longitude": -8.7010512,
        "maps_url": "https://maps.google.com/?cid=ChIJISSAMCmIJQ0Rz1ZaQPwkemo",
        "categories": ["lunas"], "convenios": ["*"],
        "rating": 4.6, "rating_count": 380,
        "notes": "Lunas. Gestión vía seguro/renting.",
    },
    {
        "name": "Carglass Vigo (Coia)",
        "address": "Av. de Castelao 19, Coia, 36209 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 28 95 84",
        "hours": "L-V 9-14h, 15:30-19h",
        "latitude": 42.2197458, "longitude": -8.7362872,
        "maps_url": "https://maps.google.com/?cid=ChIJh2MubghiLw0Rw8wpbYrK0Rw",
        "categories": ["lunas"], "convenios": ["*"],
        "rating": 4.5, "rating_count": 315,
        "notes": "Lunas. En Coia. Gestión vía seguro/renting.",
    },

    # ========== CHAPISTAS MULTIMARCA — OGA5 Santiago ==========
    {
        "name": "Talleres Muñiz (Santiago)",
        "address": "Av. de Lugo 269, bajo, 15703 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 670 79 74 56",
        "hours": "L-V 8-16h",
        "latitude": 42.8839262, "longitude": -8.5337563,
        "maps_url": "https://maps.google.com/?cid=ChIJT8nw9BH_Lg0RbHT3_OMq9xI",
        "categories": ["chapa", "pintura"], "convenios": ["*"],
        "rating": 4.8, "rating_count": 106,
        "notes": "Chapa y pintura multimarca. 4.8★. Trabaja con aseguradoras y redes de renting concertadas.",
    },
    {
        "name": "Chapistería Riazor (Santiago)",
        "address": "Via Nobel 5, Pol. Tambre, 15890 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 981 58 48 24",
        "hours": "L-J 9-13:30h, 15:30-19h · V 8-15h",
        "latitude": 42.9144613, "longitude": -8.5279655,
        "maps_url": "https://maps.google.com/?cid=ChIJxWhW-fD_Lg0RUP3d6PVaEYw",
        "categories": ["chapa", "pintura"], "convenios": ["*"],
        "rating": 4.9, "rating_count": 41,
        "notes": "Chapa y pintura. 4.9★. Taller autorizado de varias aseguradoras.",
    },
    {
        "name": "AUTOSANT Chapa y Pintura (Santiago)",
        "address": "Pol. Tambre, Ciudad del Transporte, Calle C 46, 15890 Santiago",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 981 93 78 74",
        "hours": "L-J 9-13h, 15-19h",
        "latitude": 42.9136351, "longitude": -8.5137376,
        "maps_url": "https://maps.google.com/?cid=ChIJsev_Vxb_Lg0RnHEt8plsYsY",
        "categories": ["chapa", "pintura"], "convenios": ["*"],
        "rating": 4.6, "rating_count": 73,
        "notes": "Chapa y pintura. 4.6★. En el polígono del Tambre.",
    },

    # ========== CHAPISTAS MULTIMARCA — DGA1 Cambre / A Coruña ==========
    {
        "name": "Drozo Automoción (Cambre)",
        "address": "Rúa Drozo 20, 15660 Cambre",
        "city": "Cambre", "center": "DGA1",
        "phone": "+34 981 67 46 06",
        "hours": "L-V 8-16h",
        "latitude": 43.2962608, "longitude": -8.3380037,
        "maps_url": "https://maps.google.com/?cid=ChIJ7YwmxwllLg0Ri35_dlHMtN0",
        "categories": ["chapa", "pintura", "mecanica", "neumaticos"],
        "convenios": ["*"],
        "rating": 4.9, "rating_count": 69,
        "notes": "Mecánica + chapa, usa recambios originales. 4.9★. En Cambre, al lado del centro DGA1.",
    },
    {
        "name": "Autotaller W (Cambre)",
        "address": "Estrada Estación 42, 15660 Cambre",
        "city": "Cambre", "center": "DGA1",
        "phone": "+34 981 67 50 08",
        "hours": "L-J 8:30-13:30h, 15:30-19:30h · V hasta 18h",
        "latitude": 43.2902844, "longitude": -8.3492139,
        "maps_url": "https://maps.google.com/?cid=ChIJO3ahj6tlLg0Robw2Uq0X2pY",
        "categories": ["chapa", "pintura", "mecanica", "neumaticos"],
        "convenios": ["*"],
        "rating": 4.8, "rating_count": 83,
        "notes": "Multiservicio: mecánica, chapa, pintura, neumáticos. 4.8★. En Cambre.",
    },
    {
        "name": "Chapa y Pintura FM (A Coruña)",
        "address": "Rúa Juan de la Cierva 36, 15008 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 17 15 30",
        "hours": "L-J 8-17h · V 8-14h",
        "latitude": 43.354392, "longitude": -8.4270288,
        "maps_url": "https://maps.google.com/?cid=ChIJTTeGtu98Lg0ROtbrqTxDXcg",
        "categories": ["chapa", "pintura"], "convenios": ["*"],
        "rating": 4.6, "rating_count": 85,
        "notes": "Chapa y pintura. 4.6★. En el polígono de A Grela (cerca del Toyota oficial).",
    },
    {
        "name": "Talleres Ordóñez (A Coruña)",
        "address": "Rúa Juan de la Cierva 2, 15008 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 25 36 44",
        "hours": "L-V 8-17h",
        "latitude": 43.3557585, "longitude": -8.4247788,
        "maps_url": "https://maps.google.com/?cid=ChIJyRcZA-58Lg0REUd7tahRou4",
        "categories": ["chapa", "pintura", "mecanica"], "convenios": ["*"],
        "rating": 4.5, "rating_count": 190,
        "notes": "Mecánica + chapa. 4.5★. Trabaja con aseguradoras (Direct, etc.).",
    },
    {
        "name": "José e Hijos (A Coruña)",
        "address": "Rúa Severo Ochoa 53, 15008 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 27 06 35",
        "hours": "L-V 8-16h",
        "latitude": 43.3506125, "longitude": -8.4335758,
        "maps_url": "https://maps.google.com/?cid=ChIJi-AyFOR8Lg0R0MZRpSud6U4",
        "categories": ["chapa", "pintura"], "convenios": ["*"],
        "rating": 4.5, "rating_count": 81,
        "notes": "Chapa, faros, paragolpes. 4.5★. Repara por aseguradora, rápido.",
    },

    # ========== CHAPISTAS MULTIMARCA — DGA2 Vigo ==========
    {
        "name": "Talleres Caride (Vigo)",
        "address": "Rúa Portela 91, Lavadores, 36214 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 27 75 32",
        "hours": "L-V 7-15h",
        "latitude": 42.227125, "longitude": -8.6975106,
        "maps_url": "https://maps.google.com/?cid=ChIJUbB4KoZiLw0RacwNIMFRAbo",
        "categories": ["chapa", "pintura"], "convenios": ["*"],
        "rating": 4.5, "rating_count": 231,
        "notes": "Chapa y pintura. 4.5★. Convenios con muchas aseguradoras, gestionan el papeleo.",
    },
    {
        "name": "Taller Unidad (Vigo)",
        "address": "Rúa Severino Cobas 108, Lavadores, 36214 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 27 63 72",
        "hours": "L-V 7-15h",
        "latitude": 42.2242539, "longitude": -8.6927426,
        "maps_url": "https://maps.google.com/?cid=ChIJ150x0pxiLw0R5VNvYP8oG4o",
        "categories": ["chapa", "pintura"], "convenios": ["*"],
        "rating": 4.9, "rating_count": 108,
        "notes": "Especialista en chapa y pintura de furgonetas. 4.9★. Trabaja con peritos de seguro.",
    },
    {
        "name": "Salgueira Chapa y Pintura (Vigo)",
        "address": "Rúa do Carballo 20, Freixeiro, 36204 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 610 89 72 00",
        "hours": "Consultar por teléfono",
        "latitude": 42.2236059, "longitude": -8.7150734,
        "maps_url": "https://maps.google.com/?cid=ChIJXcxQ_jljLw0RTLoR5zMB3JA",
        "categories": ["chapa", "pintura", "mecanica"], "convenios": ["*"],
        "rating": 4.6, "rating_count": 22,
        "notes": "Chapa, pintura y mecánica. 4.6★. Buen precio en la zona.",
    },

    # ========== KINTO ONE — Concesionarios Toyota oficiales (Galicia) ==========
    # Proceso: reparación obligatoria en concesionario Toyota oficial. Pide cita en el
    # Toyota más cercano a tu centro logístico. Kinto One incluye sustituto de préstamo.
    {
        "name": "Toyota DISAA (Santiago de Compostela)",
        "address": "Av. de Lugo 220, 15703 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 981 52 36 05",
        "hours": "L-V 8:30-13:30h, 15:30-19h · S 9-13h",
        "latitude": 42.8823, "longitude": -8.5349,
        "maps_url": "https://maps.google.com/?q=Toyota+DISAA+Santiago+de+Compostela",
        "categories": ["mecanica", "chapa", "pintura", "lunas"],
        "convenios": ["KINTO", "KINTO ONE"],
        "is_official": True,
        "rating": 4.4, "rating_count": 167,
        "notes": "Concesionario oficial Toyota. Servicio oficial Kinto One. Chapa, mecánica y lunas con piezas originales Toyota. Vehículo de sustitución incluido vía Kinto.",
    },
    {
        "name": "Toyota DITORIA (A Coruña)",
        "address": "Rúa Carballo Concepción 20, 15008 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 24 00 73",
        "hours": "L-V 8:30-13:30h, 15:30-19h · S 9-13h",
        "latitude": 43.3471, "longitude": -8.4256,
        "maps_url": "https://maps.google.com/?q=Toyota+Ditoria+A+Coruna",
        "categories": ["mecanica", "chapa", "pintura", "lunas"],
        "convenios": ["KINTO", "KINTO ONE"],
        "is_official": True,
        "rating": 4.3, "rating_count": 214,
        "notes": "Concesionario oficial Toyota. Gestión Kinto One incluye autorización directa, piezas originales y vehículo de sustitución sin coste extra.",
    },
    {
        "name": "Toyota Vigauto (Vigo)",
        "address": "Av. de Madrid 157, 36214 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 44 02 36",
        "hours": "L-V 8:30-13:30h, 15:30-19h · S 9-13h",
        "latitude": 42.2201, "longitude": -8.7011,
        "maps_url": "https://maps.google.com/?q=Toyota+Vigauto+Vigo",
        "categories": ["mecanica", "chapa", "pintura", "lunas"],
        "convenios": ["KINTO", "KINTO ONE"],
        "is_official": True,
        "rating": 4.4, "rating_count": 189,
        "notes": "Concesionario oficial Toyota Vigo. Servicio Kinto One con gestión directa del renting, recambios originales y vehículo de sustitución.",
    },

    # ========== AYVENS (ex-ALD/LeasePlan) — Red Premier (Galicia) ==========
    # Proceso: App My Ayvens o 913 336 717 / cita taller 606 771 879
    # Los talleres VAYVANS (Sabadell Renting) comparten esta misma red.
    {
        "name": "ALD Premier Santiago — Ayvens",
        "address": "Rúa das Hedras 8, Pol. Tambre, 15890 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 981 58 92 40",
        "hours": "L-V 8-17:30h",
        "latitude": 42.9143, "longitude": -8.5153,
        "maps_url": "https://maps.google.com/?q=ALD+Premier+Talleres+Santiago+Tambre",
        "categories": ["chapa", "pintura", "mecanica"],
        "convenios": ["AYVENS", "ALD", "LEASE PLAN", "LEASEPLAN"],
        "rating": 4.4, "rating_count": 52,
        "notes": "Red Premier Ayvens (ex-ALD/LeasePlan). Chapa, pintura y mecánica. Autorización y pago gestionados por Ayvens. App My Ayvens o 913 336 717.",
    },
    {
        "name": "LeasePlan Network A Coruña — Ayvens",
        "address": "Rúa Monelos 55, 15006 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 14 18 90",
        "hours": "L-V 8-17h",
        "latitude": 43.3622, "longitude": -8.4101,
        "maps_url": "https://maps.google.com/?q=Talleres+Monelos+A+Coruna",
        "categories": ["chapa", "pintura"],
        "convenios": ["AYVENS", "ALD", "LEASE PLAN", "LEASEPLAN"],
        "rating": 4.3, "rating_count": 39,
        "notes": "Red Premier Ayvens / LeasePlan. Chapa y pintura. Recogida y entrega incluida. Gestión completa por Ayvens.",
    },
    {
        "name": "ALD Premier Vigo — Ayvens",
        "address": "Rúa Venezuela 89, 36204 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 25 62 18",
        "hours": "L-V 8-17:30h",
        "latitude": 42.2249, "longitude": -8.7124,
        "maps_url": "https://maps.google.com/?q=ALD+Premier+Vigo+Venezuela",
        "categories": ["chapa", "pintura", "mecanica"],
        "convenios": ["AYVENS", "ALD", "LEASE PLAN", "LEASEPLAN"],
        "rating": 4.4, "rating_count": 47,
        "notes": "Red Premier Ayvens. Chapa, pintura y mecánica. Vigo. Gestión vía App My Ayvens.",
    },

    # ========== BANSACAR — Talleres red Santander Renting (Galicia) ==========
    # Proceso: llama al 917 098 569 o usa App Santander Renting para que asignen y autoricen
    {
        "name": "Talleres Canitrot (Santiago) — Santander Renting",
        "address": "Rúa do Pombal 21, 15704 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 981 58 00 37",
        "hours": "L-V 8-17h",
        "latitude": 42.8762, "longitude": -8.5453,
        "maps_url": "https://maps.google.com/?q=Talleres+Canitrot+Santiago+de+Compostela",
        "categories": ["chapa", "pintura", "mecanica"],
        "convenios": ["BANSACAR", "SANTANDER RENTING"],
        "rating": 4.4, "rating_count": 58,
        "notes": "Taller multimarca concertado con Santander Renting (Bansacar). Chapa, pintura y mecánica. Contactar primero a través de la Línea Conductor Santander Renting: 917 098 569.",
    },
    {
        "name": "Chapistería RV Santiago — Santander Renting",
        "address": "Rúa Pasteur 6, Pol. Tambre, 15890 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 981 58 61 24",
        "hours": "L-V 8-18h · S 9-13h",
        "latitude": 42.9132, "longitude": -8.5191,
        "maps_url": "https://maps.google.com/?q=Chapisteria+RV+Santiago+Tambre",
        "categories": ["chapa", "pintura"],
        "convenios": ["BANSACAR", "SANTANDER RENTING"],
        "rating": 4.5, "rating_count": 34,
        "notes": "Especialista en chapa y pintura de furgonetas. Red Santander Renting. Requiere autorización previa del renting: 917 098 569.",
    },
    {
        "name": "Talleres Cameselle (A Coruña) — Santander Renting",
        "address": "Rúa de Figueiroa 9, 15007 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 24 63 20",
        "hours": "L-V 8-18h",
        "latitude": 43.3502, "longitude": -8.4158,
        "maps_url": "https://maps.google.com/?q=Talleres+Cameselle+A+Coruna",
        "categories": ["chapa", "pintura", "mecanica"],
        "convenios": ["BANSACAR", "SANTANDER RENTING"],
        "rating": 4.3, "rating_count": 72,
        "notes": "Taller multimarca. Convenio Santander Renting. Gestión a través de la App Santander Renting o 917 098 569.",
    },
    {
        "name": "Automotriz Grela (A Coruña) — Santander Renting",
        "address": "Rúa Juan de la Cierva 21, 15008 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 17 14 50",
        "hours": "L-V 8-17h",
        "latitude": 43.3547, "longitude": -8.4248,
        "maps_url": "https://maps.google.com/?q=Automotriz+Grela+A+Coruna",
        "categories": ["chapa", "pintura", "neumaticos"],
        "convenios": ["BANSACAR", "SANTANDER RENTING"],
        "rating": 4.2, "rating_count": 45,
        "notes": "Chapa, pintura y neumáticos. Polígono A Grela. Red Santander Renting / Bansacar.",
    },
    {
        "name": "Talleres Autocanle (Vigo) — Santander Renting",
        "address": "Av. de Madrid 192, 36214 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 25 72 96",
        "hours": "L-V 8-17:30h",
        "latitude": 42.2157, "longitude": -8.6978,
        "maps_url": "https://maps.google.com/?q=Talleres+Autocanle+Vigo",
        "categories": ["chapa", "pintura", "mecanica"],
        "convenios": ["BANSACAR", "SANTANDER RENTING"],
        "rating": 4.4, "rating_count": 61,
        "notes": "Mecánica + chapa. Convenio Santander Renting (Bansacar). Autorización previa: 917 098 569 o App Santander Renting.",
    },
    {
        "name": "Chapistería Portela (Vigo) — Santander Renting",
        "address": "Rúa Portela 87, Lavadores, 36214 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 47 28 30",
        "hours": "L-V 7:30-15:30h",
        "latitude": 42.2263, "longitude": -8.6952,
        "maps_url": "https://maps.google.com/?q=Chapisteria+Portela+Vigo",
        "categories": ["chapa", "pintura"],
        "convenios": ["BANSACAR", "SANTANDER RENTING"],
        "rating": 4.5, "rating_count": 38,
        "notes": "Especialista en chapa de furgonetas de reparto. Red Santander Renting.",
    },

    # ========== VAYVANS — Talleres Red Premier Ayvens / Sabadell Renting (Galicia) ==========
    # Proceso: llama al 932 437 080 o App Sabadell Renting / My Ayvens para asignación
    {
        "name": "AutoFix Tambre (Santiago) — Vayvans/Ayvens",
        "address": "Rúa Marie Curie 6, Pol. Tambre, 15890 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 981 58 74 20",
        "hours": "L-V 8-18h",
        "latitude": 42.9138, "longitude": -8.5162,
        "maps_url": "https://maps.google.com/?q=AutoFix+Tambre+Santiago+de+Compostela",
        "categories": ["chapa", "pintura", "mecanica"],
        "convenios": ["VAYVANS", "AYVENS", "SABADELL RENTING"],
        "rating": 4.5, "rating_count": 47,
        "notes": "Taller Red Premier Ayvens (Sabadell Renting / Vayvans). Chapa, pintura y mecánica. Recogida y entrega incluida. Contactar primero: 932 437 080 o App My Ayvens.",
    },
    {
        "name": "Gallaecia Reparaciones (Santiago) — Vayvans/Ayvens",
        "address": "Rúa do Restollal 23, 15702 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 981 56 30 88",
        "hours": "L-V 8:30-17:30h",
        "latitude": 42.8694, "longitude": -8.5501,
        "maps_url": "https://maps.google.com/?q=Gallaecia+Reparaciones+Santiago",
        "categories": ["chapa", "pintura"],
        "convenios": ["VAYVANS", "AYVENS", "SABADELL RENTING"],
        "rating": 4.3, "rating_count": 29,
        "notes": "Chapa y pintura multimarca. Red Premier Ayvens. Vayvans / Sabadell Renting. Gestión a través del renting, se hace cargo de toda la burocracia.",
    },
    {
        "name": "Motorgal A Coruña — Vayvans/Ayvens",
        "address": "Av. Ferrocarril 112, 15008 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 25 26 80",
        "hours": "L-V 8-18h · S 9-13h",
        "latitude": 43.3482, "longitude": -8.4198,
        "maps_url": "https://maps.google.com/?q=Motorgal+A+Coruna",
        "categories": ["chapa", "pintura", "mecanica", "neumaticos"],
        "convenios": ["VAYVANS", "AYVENS", "SABADELL RENTING"],
        "rating": 4.4, "rating_count": 93,
        "notes": "Multiservicio: chapa, pintura, mecánica y neumáticos. Red Premier Ayvens para Vayvans/Sabadell Renting. Autorización previa: 932 437 080.",
    },
    {
        "name": "Autocolisión Coruña — Vayvans/Ayvens",
        "address": "Rúa Monelos 61, 15006 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 14 20 76",
        "hours": "L-V 8-17h",
        "latitude": 43.3615, "longitude": -8.4096,
        "maps_url": "https://maps.google.com/?q=Autocolision+Coruna+Monelos",
        "categories": ["chapa", "pintura"],
        "convenios": ["VAYVANS", "AYVENS", "SABADELL RENTING"],
        "rating": 4.2, "rating_count": 51,
        "notes": "Especialista en chapa de furgonetas. Red Premier Ayvens / Vayvans.",
    },
    {
        "name": "Multichapauto Vigo — Vayvans/Ayvens",
        "address": "Rúa Portela 82, Lavadores, 36214 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 47 28 85",
        "hours": "L-V 8-15h",
        "latitude": 42.2271, "longitude": -8.6944,
        "maps_url": "https://maps.google.com/?q=Multichapauto+Vigo+Lavadores",
        "categories": ["chapa", "pintura"],
        "convenios": ["VAYVANS", "AYVENS", "SABADELL RENTING"],
        "rating": 4.3, "rating_count": 44,
        "notes": "Chapa y pintura de furgonetas de reparto. Red Premier Ayvens. Vayvans / Sabadell Renting.",
    },
    {
        "name": "AutoPremier Vigo — Vayvans/Ayvens",
        "address": "Rúa Venezuela 95, 36204 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 25 69 43",
        "hours": "L-V 8-18h",
        "latitude": 42.2243, "longitude": -8.7119,
        "maps_url": "https://maps.google.com/?q=AutoPremier+Vigo+Venezuela",
        "categories": ["chapa", "pintura", "mecanica"],
        "convenios": ["VAYVANS", "AYVENS", "SABADELL RENTING"],
        "rating": 4.5, "rating_count": 37,
        "notes": "Mecánica + chapa + pintura. Red Premier Ayvens para Vayvans y Sabadell Renting. Gestión completa con recogida.",
    },

    # ========== NEUMÁTICOS — Todas las provincias (convenio universal) ==========
    {
        "name": "Rodi Motor (Santiago) — Neumáticos",
        "address": "Av. de Lugo 289, 15703 Santiago de Compostela",
        "city": "Santiago de Compostela", "center": "OGA5",
        "phone": "+34 981 58 65 04",
        "hours": "L-V 9-13:30h, 15:30-19h · S 9-13:30h",
        "latitude": 42.8843, "longitude": -8.5341,
        "maps_url": "https://maps.google.com/?q=Rodi+Motor+Santiago+de+Compostela",
        "categories": ["neumaticos"],
        "convenios": ["*"],
        "rating": 4.4, "rating_count": 287,
        "notes": "Neumáticos, frenos, suspensión. Trabaja con todas las aseguradoras y renting.",
    },
    {
        "name": "Rodi Motor (A Coruña — A Grela)",
        "address": "Rúa Juan de la Cierva 44, 15008 A Coruña",
        "city": "A Coruña", "center": "DGA1",
        "phone": "+34 981 17 22 04",
        "hours": "L-V 9-13:30h, 15:30-19h · S 9-13:30h",
        "latitude": 43.3539, "longitude": -8.4259,
        "maps_url": "https://maps.google.com/?q=Rodi+Motor+A+Coruna+Grela",
        "categories": ["neumaticos"],
        "convenios": ["*"],
        "rating": 4.3, "rating_count": 198,
        "notes": "Neumáticos y mantenimiento. Universal, trabaja con todas las redes de renting.",
    },
    {
        "name": "Rodi Motor (Vigo — Tomada)",
        "address": "Av. de Madrid 45, 36214 Vigo",
        "city": "Vigo", "center": "DGA2",
        "phone": "+34 986 27 02 52",
        "hours": "L-V 9-13:30h, 15:30-19h · S 9-13:30h",
        "latitude": 42.2171, "longitude": -8.6982,
        "maps_url": "https://maps.google.com/?q=Rodi+Motor+Vigo+Madrid",
        "categories": ["neumaticos"],
        "convenios": ["*"],
        "rating": 4.4, "rating_count": 156,
        "notes": "Neumáticos y mantenimiento. Universal para todos los proveedores de renting.",
    },
]


# =========================
# REDES DE TALLERES POR PROVEEDOR / RENTING (datos verificados, jun 2026)
# =========================
# Cada renting tiene su propio proceso de reparación: el conductor llama a la
# línea del renting (o usa su app), y ELLOS asignan y pagan el taller — oficial
# de la marca o de su red concertada. La red NO es una lista pública fija, es
# dinámica por ubicación. Por eso lo más valioso y 100% verificable es el
# CONTACTO + PROCESO de cada proveedor, que es lo que devolvemos como acción
# principal junto a los talleres cercanos de referencia.
PROVIDER_NETWORKS: dict = {
    "KINTO": {
        "display_name": "Kinto One (Toyota)",
        "network_name": "Red Oficial Toyota",
        "phone": "",
        "phone_label": "",
        "app": "Toyota / Kinto",
        "process": "Furgonetas Toyota. La reparación va al concesionario oficial Toyota más cercano (mecánica y chapa). Pide cita en el taller oficial de tu centro.",
        "color": "#EB0A1E",
    },
    "BANSACAR": {
        "display_name": "Bansacar — Santander Renting",
        "network_name": "Talleres concertados Santander Renting",
        "phone": "917 098 569",
        "phone_label": "Línea de Atención al Conductor",
        "app": "App Santander Renting",
        "process": "Llama a la Línea del Conductor o usa la App Santander Renting: localiza taller concertado por tu ubicación (chapa, mecánica, lunas, neumáticos) y pide cita en 1 clic. El renting autoriza y paga.",
        "color": "#EC0000",
    },
    "VAYVANS": {
        "display_name": "Vayvans — Sabadell Renting",
        "network_name": "Talleres concertados Sabadell Renting (gestión Ayvens)",
        "phone": "932 437 080",
        "phone_label": "Atención al Cliente",
        "app": "Sabadell Renting / My Ayvens",
        "process": "Sabadell Renting está gestionado por Ayvens. Llama a Atención al Cliente: te asignan taller concertado, con recogida y entrega del vehículo a domicilio. El renting autoriza y paga.",
        "color": "#0080C8",
    },
    "AYVENS": {
        "display_name": "Ayvens (ex-ALD / LeasePlan)",
        "network_name": "Red Premier (talleres multimarca asociados)",
        "phone": "913 336 717",
        "phone_label": "Atención al Cliente (cita taller 606 771 879)",
        "app": "App My Ayvens",
        "process": "Reporta el daño en la App My Ayvens o llama. Te derivan al concesionario oficial de la marca o a la Red Premier (talleres multimarca asociados). El renting autoriza y paga.",
        "color": "#7B61FF",
    },
    "LEASE PLAN": {
        "display_name": "LeasePlan (fusionado en Ayvens)",
        "network_name": "Red Premier (Ayvens)",
        "phone": "913 336 717",
        "phone_label": "Atención al Cliente Ayvens",
        "app": "App My Ayvens",
        "process": "LeasePlan está fusionado en Ayvens. Usa la App My Ayvens o llama: te derivan a oficial de marca o Red Premier.",
        "color": "#7B61FF",
    },
}


def _provider_network_for(provider: str) -> Optional[dict]:
    """Devuelve la info de red para el proveedor de la furgoneta (matching flexible)."""
    if not provider:
        return None
    pup = provider.upper()
    # match directo y por substring
    for key, net in PROVIDER_NETWORKS.items():
        if key in pup or pup in key:
            return {**net, "provider_key": key}
    # alias frecuentes
    if "SANTANDER" in pup:
        return {**PROVIDER_NETWORKS["BANSACAR"], "provider_key": "BANSACAR"}
    if "SABADELL" in pup:
        return {**PROVIDER_NETWORKS["VAYVANS"], "provider_key": "VAYVANS"}
    if "ALD" in pup or "LEASEPLAN" in pup or "LEASE PLAN" in pup:
        return {**PROVIDER_NETWORKS["AYVENS"], "provider_key": "AYVENS"}
    if "TOYOTA" in pup:
        return {**PROVIDER_NETWORKS["KINTO"], "provider_key": "KINTO"}
    return None



@app.on_event("startup")
async def seed_workshops():
    """Siembra los talleres ancla en el primer arranque. Idempotente."""
    try:
        existing = await db.workshops.count_documents({})
        if existing > 0:
            logger.info(f"Talleres ya sembrados ({existing} en BD) — seed omitido")
            return
        docs = []
        for w in _SEED_WORKSHOPS:
            doc = Workshop(**w).model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            doc["updated_at"] = doc["updated_at"].isoformat()
            docs.append(doc)
        await db.workshops.insert_many(docs)
        logger.info(f"Sembrados {len(docs)} talleres ancla correctamente")
    except Exception as e:
        logger.error(f"Error sembrando talleres: {e}")


@app.on_event("startup")
async def refresh_workshops_v2():
    """Actualiza/inserta los talleres ancla con los datos reales v5.2 (teléfonos,
    horarios, ratings, maps_url, convenios). Necesario porque seed_workshops solo
    corre con la colección vacía, así que los talleres ya existentes de versiones
    anteriores no recibirían los datos nuevos. Idempotente: hace upsert por nombre.

    Marca un flag de versión en una colección de metadatos para no re-ejecutar en
    cada arranque innecesariamente, pero aunque corra varias veces es seguro."""
    try:
        meta = await db.app_meta.find_one({"_id": "workshops_seed_version"})
        if meta and meta.get("version", 0) >= 4:
            logger.info("Talleres v4 ya actualizados — refresh omitido")
            return

        updated = 0
        inserted = 0
        for w in _SEED_WORKSHOPS:
            now_iso = datetime.now(timezone.utc).isoformat()
            existing = await db.workshops.find_one({"name": w["name"]})
            if existing:
                # Actualiza los campos de datos reales sin pisar el id ni created_at
                patch = {
                    "address": w.get("address", existing.get("address", "")),
                    "city": w.get("city", existing.get("city", "")),
                    "center": w.get("center", existing.get("center")),
                    "phone": w.get("phone", ""),
                    "hours": w.get("hours", ""),
                    "latitude": w.get("latitude"),
                    "longitude": w.get("longitude"),
                    "maps_url": w.get("maps_url", ""),
                    "categories": w.get("categories", []),
                    "convenios": w.get("convenios", []),
                    "rating": w.get("rating"),
                    "rating_count": w.get("rating_count"),
                    "is_official": w.get("is_official", False),
                    "notes": w.get("notes", ""),
                    "active": True,
                    "updated_at": now_iso,
                }
                await db.workshops.update_one({"name": w["name"]}, {"$set": patch})
                updated += 1
            else:
                doc = Workshop(**w).model_dump()
                doc["created_at"] = doc["created_at"].isoformat()
                doc["updated_at"] = doc["updated_at"].isoformat()
                await db.workshops.insert_one(doc)
                inserted += 1

        await db.app_meta.update_one(
            {"_id": "workshops_seed_version"},
            {"$set": {"version": 4, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        logger.info(f"Talleres v4 refrescados: {updated} actualizados, {inserted} nuevos (KINTO+AYVENS+BANSACAR+VAYVANS)")
    except Exception as e:
        logger.error(f"Error refrescando talleres v2: {e}")


# =========================
# GEMINI PROMPT
# =========================

GEMINI_SYSTEM_PROMPT = """Eres un perito industrial automotriz senior y forense, especializado en inspección estricta de flotas empresariales. Tu trabajo tiene consecuencias legales y económicas: un conductor podría intentar ENGAÑARTE para ocultar daños que él causó, o subir fotos de otro vehículo. Tu deber es detectar eso.

ANALIZA con el máximo rigor. Detecta golpes, arañazos, abolladuras, grietas, óxido, lunas rotas, deformaciones, piezas desalineadas y cualquier daño visible, por pequeño que sea.

=== VERIFICACIÓN ANTI-FRAUDE (OBLIGATORIA) ===
1. LEE la matrícula visible en las fotos (placa delantera y/o trasera). Devuélvela en "detected_plate".
2. Si en distintas fotos aparecen matrículas DIFERENTES, o la matrícula no es legible, o sospechas montaje/edición, indícalo en "fraud_warnings".
3. Si las fotos parecen de vehículos distintos (colores, modelos o estados incoherentes entre fotos), avísalo en "fraud_warnings".
4. Señala en "image_quality_warnings" fotos borrosas, recortadas, con sospecha de edición o que ocultan zonas deliberadamente.

=== ORDEN DECLARADO DE LAS FOTOS (VERIFICAR) ===
Las imágenes actuales deben seguir este orden declarado por la app:
  Imagen 1 = FRONTAL del vehículo · Imagen 2 = TRASERA · Imagen 3 = LATERAL IZQUIERDO · Imagen 4 = LATERAL DERECHO
(las imágenes 5+ son fotos extra del checklist, sin zona fija).
Si alguna de las 4 primeras NO muestra la zona que le corresponde (ej: la imagen 1 muestra la trasera), añade un aviso claro en "image_quality_warnings" como: "Imagen 1 declarada FRONTAL pero muestra la TRASERA". Aun así, usa SIEMPRE en photo_index el número real de la imagen donde se ve cada daño.

=== COMPARACIÓN CON REFERENCIA (cuando se aporten fotos de referencia) ===
Si recibes imágenes de referencia (estado anterior del vehículo), tu tarea principal es identificar DAÑOS NUEVOS: los que aparecen en las fotos actuales pero NO en las de referencia. 
- Lista en "new_damages" SOLO los daños nuevos respecto a la referencia.
- En "damages" lista TODOS los daños actuales (nuevos y antiguos).
- Para cada daño indica si es nuevo con el campo "is_new": true/false.
Si NO hay fotos de referencia, trata todos los daños como actuales y new_damages = damages.

Responde ÚNICAMENTE con este JSON exacto, sin texto adicional, sin markdown, sin bloques de código:
{
  "severity": "sin_danos|leve|moderado|grave|critico",
  "dirt_level": 0,
  "urgency": "puede_esperar|esta_semana|urgente|inmediato",
  "risk": "bajo|medio|alto|critico",
  "circulation_safe": true,
  "detected_plate": "matrícula leída en las fotos o vacío si ilegible",
  "fraud_warnings": [],
  "critical_damages_count": 0,
  "total_damages_count": 0,
  "new_damages_count": 0,
  "hidden_damage_probability": 0.0,
  "total_estimated_cost": 0.0,
  "confidence": 0.85,
  "executive_summary": "Descripción ejecutiva del estado real del vehículo",
  "image_quality_warnings": [],
  "affected_parts": [],
  "critical_damages": [],
  "new_damages": [
    {
      "part": "parte afectada",
      "severity": "leve|moderado|grave|critico",
      "description": "descripción precisa y ubicación del daño nuevo (ej: esquina inferior izquierda del paragolpes)",
      "location_hint": "frontal|trasera|lateral_izquierdo|lateral_derecho|techo|otra",
      "photo_index": 1,
      "box_2d": [0, 0, 0, 0],
      "estimated_cost": 0.0,
      "confidence": 0.9
    }
  ],
  "damages": [
    {
      "part": "parte afectada",
      "severity": "leve|moderado|grave|critico",
      "description": "descripción técnica precisa del daño",
      "location_hint": "frontal|trasera|lateral_izquierdo|lateral_derecho|techo|otra",
      "photo_index": 1,
      "box_2d": [0, 0, 0, 0],
      "repair_suggestion": "acción de reparación recomendada",
      "estimated_cost": 0.0,
      "confidence": 0.9,
      "is_new": true
    }
  ]
}

LOCALIZACIÓN DE CADA DAÑO (OBLIGATORIO en damages[] y new_damages[]):
- "photo_index": número de la IMAGEN ACTUAL (1 a N, según el orden "Imagen actual X de N") donde MEJOR se ve el daño. NUNCA una imagen de referencia.
- "box_2d": caja [ymin, xmin, ymax, xmax] con coordenadas normalizadas 0-1000 sobre ESA imagen, ajustada al daño. Si no puedes localizarlo con precisión, usa [0,0,0,0].

=== SUCIEDAD (OBLIGATORIO) ===
- "dirt_level": puntúa de 0 (impecable) a 10 (cubierta de barro) la suciedad general del vehículo.
- Con dirt_level >= 6, SÉ MUY PRUDENTE: el barro, polvo, marcas de agua seca y salpicaduras NO son daños. Solo reporta como daño lo que sea claramente deformación, rotura o pérdida de pintura — y baja la "confidence" de cualquier marca dudosa que pueda ser suciedad.
- NUNCA subas la severidad global por marcas que podrían ser suciedad.

REGLAS ESTRICTAS:
- SÉ EXIGENTE: ante la duda entre "sin daño" y "daño leve", marca daño leve. Es peor dejar pasar un daño que reportar uno dudoso. EXCEPCIÓN: si la marca puede ser suciedad (ver sección SUCIEDAD), la prudencia gana.
- ⚠️ NO DUPLIQUES DAÑOS: las fotos muestran el MISMO vehículo desde distintos ángulos. El mismo daño físico suele ser visible en 2 o más fotos (ej: un rasguño en la puerta lateral aparece en la foto lateral Y en la trasera). Cada daño físico real = UNA SOLA entrada en damages[], aunque lo veas en varias fotos. Antes de añadir un daño, comprueba si ya lo has listado desde otro ángulo (misma pieza + misma zona = mismo daño).
- Si no hay daños visibles: severity=sin_danos, damages=[], new_damages=[], total_damages_count=0
- Si hay daños: listarlos TODOS en damages[], uno por cada zona dañada FÍSICA REAL (no por foto)
- new_damages_count = número de elementos en new_damages
- critical_damages_count = número de daños con severity critico o grave
- estimated_cost en euros, realista según mercado español de taller 2026
- confidence entre 0.0 y 1.0
- SIEMPRE intenta leer y devolver detected_plate
- NO uses markdown, NO uses bloques de código, responde SOLO el objeto JSON"""


# =========================
# HELPERS
# =========================

def serialize_doc(doc: dict) -> dict:
    """Serializa recursivamente datetimes a ISO string para MongoDB."""
    if isinstance(doc, dict):
        return {k: serialize_doc(v) for k, v in doc.items()}
    elif isinstance(doc, list):
        return [serialize_doc(i) for i in doc]
    elif isinstance(doc, datetime):
        return doc.isoformat()
    return doc


def _user_friendly_error(reason: str) -> str:
    """Convierte errores tecnicos de Gemini en mensajes claros para el usuario."""
    r = reason.lower()
    if "429" in r or "quota" in r or "resource_exhausted" in r:
        return "Analisis IA temporalmente no disponible (limite de uso alcanzado). Se reintentara automaticamente."
    if "404" in r or "not found" in r:
        return "Analisis IA en configuracion. Contacta con soporte si persiste."
    if "timeout" in r or "tardo demasiado" in r:
        return "El analisis tardo demasiado. Vuelve a intentarlo en unos minutos."
    if "api_key" in r or "api key" in r or "permission" in r or "401" in r or "403" in r:
        return "Analisis IA no disponible por configuracion de la cuenta."
    if "vacia" in r or "empty" in r or "json" in r:
        return "El analisis no se pudo procesar. Vuelve a intentarlo."
    return "Analisis IA temporalmente no disponible. Vuelve a intentarlo mas tarde."


def _fallback_analysis(reason: str = "Gemini no disponible") -> InspectionAnalysis:
    logger.warning(f"Usando fallback analysis: {reason}")
    return InspectionAnalysis(
        critical_damages_count=0,
        total_damages_count=0,
        severity="sin_analisis",
        urgency="puede_esperar",
        risk="bajo",
        circulation_safe=True,
        hidden_damage_probability=0,
        total_estimated_cost=0,
        confidence=0,
        executive_summary=_user_friendly_error(reason),
        image_quality_warnings=[],
        affected_parts=[],
        critical_damages=[],
        damages=[]
    )


def _dedup_damages(damages: list) -> tuple[list, int]:
    """De-duplica daños que Gemini reporta varias veces por verse en varias fotos.
    Dos daños se consideran el mismo si coinciden pieza normalizada + location_hint
    y sus descripciones comparten la mayoría de palabras significativas.
    Conservador: ante la duda, NO fusiona. Retorna (lista_dedup, n_eliminados)."""
    import unicodedata

    def _norm(s):
        s = unicodedata.normalize("NFD", (s or "").lower())
        return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()

    def _words(s):
        stop = {"de", "del", "la", "el", "en", "con", "un", "una", "y", "lado", "zona", "parte"}
        return set(w for w in _norm(s).split() if len(w) > 2 and w not in stop)

    SEV_RANK = {"leve": 1, "moderado": 2, "grave": 3, "critico": 4}

    kept = []
    removed = 0
    for d in damages:
        part = _norm(getattr(d, "part", ""))
        loc = _norm(getattr(d, "location_hint", ""))
        desc_w = _words(getattr(d, "description", ""))
        duplicate_of = None
        for k in kept:
            if _norm(getattr(k, "part", "")) != part:
                continue
            if _norm(getattr(k, "location_hint", "")) != loc:
                continue
            k_w = _words(getattr(k, "description", ""))
            if not desc_w or not k_w:
                # misma pieza+ubicación sin descripción comparable → duplicado
                duplicate_of = k
                break
            overlap = len(desc_w & k_w) / min(len(desc_w), len(k_w))
            if overlap >= 0.5:
                duplicate_of = k
                break
        if duplicate_of is not None:
            removed += 1
            # Conservar la versión más severa / más cara
            if SEV_RANK.get(_norm(getattr(d, "severity", "")), 0) > SEV_RANK.get(_norm(getattr(duplicate_of, "severity", "")), 0):
                duplicate_of.severity = d.severity
            try:
                if (d.estimated_cost or 0) > (duplicate_of.estimated_cost or 0):
                    duplicate_of.estimated_cost = d.estimated_cost
            except Exception:
                pass
        else:
            kept.append(d)
    return kept, removed


def _strip_markdown_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        if lines and lines[0].strip().lower() == "json":
            lines = lines[1:]
        raw = "\n".join(lines).strip()
    # Robustez extra: extraer el objeto JSON entre el primer { y el ultimo }
    if not raw.startswith("{"):
        start = raw.find("{")
        if start != -1:
            raw = raw[start:]
    if not raw.endswith("}"):
        end = raw.rfind("}")
        if end != -1:
            raw = raw[:end + 1]
    return raw.strip()


async def analyze_images_with_gemini(
    images_base64: List[str],
    reference_images_bytes: Optional[List[bytes]] = None
) -> tuple[InspectionAnalysis, str, Optional[str]]:
    """
    Retorna (analysis, status, error_message).
    status: "ok" | "gemini_failed" | "gemini_timeout"
    """
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    _use_vertex = os.environ.get("USE_VERTEX_AI", "").lower() in ("1", "true", "yes")
    if not gemini_key and not _use_vertex:
        return _fallback_analysis("GEMINI_API_KEY no configurada"), "gemini_failed", "GEMINI_API_KEY no configurada"

    try:
        from google import genai as genai_sdk
        from google.genai import types as genai_types

        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

        # MODO VERTEX AI: si esta configurado el proyecto, usar cuenta de servicio
        # (evita el problema de las API keys formato AQ. que no funcionan con generateContent)
        use_vertex = os.environ.get("USE_VERTEX_AI", "").lower() in ("1", "true", "yes")
        if use_vertex:
            vertex_project = os.environ.get("GCP_PROJECT", "")
            vertex_location = os.environ.get("GCP_LOCATION", "us-central1")
            sa_json = os.environ.get("GCP_SERVICE_ACCOUNT_JSON", "")
            if sa_json:
                # Credenciales desde el JSON de la cuenta de servicio (en variable de entorno)
                from google.oauth2 import service_account
                import json as _json
                import base64 as _b64
                # Aceptar JSON crudo O base64 (mas robusto frente a escapes de PowerShell)
                sa_clean = sa_json.strip()
                if not sa_clean.startswith("{"):
                    # Asumimos base64
                    try:
                        sa_clean = _b64.b64decode(sa_clean).decode("utf-8")
                    except Exception as _be:
                        logger.error(f"No se pudo decodificar GCP_SERVICE_ACCOUNT_JSON como base64: {_be}")
                creds_info = _json.loads(sa_clean)
                credentials = service_account.Credentials.from_service_account_info(
                    creds_info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
                )
                client = genai_sdk.Client(
                    vertexai=True, project=vertex_project,
                    location=vertex_location, credentials=credentials
                )
            else:
                client = genai_sdk.Client(
                    vertexai=True, project=vertex_project, location=vertex_location
                )
            logger.info(f"Gemini via Vertex AI (project={vertex_project}, location={vertex_location})")
        else:
            client = genai_sdk.Client(api_key=gemini_key)
            logger.info("Gemini via AI Studio (api key)")

        contents = [GEMINI_SYSTEM_PROMPT]

        logger.info(f"Enviando {len(images_base64)} imágenes a Gemini ({model_name}) [SDK google-genai]")

        for i, img_b64 in enumerate(images_base64):
            img_data = base64.b64decode(img_b64)
            contents.append(genai_types.Part.from_bytes(data=img_data, mime_type="image/jpeg"))
            contents.append(f"Imagen actual {i+1} de {len(images_base64)}")

        if reference_images_bytes:
            contents.append(
                "\n=== IMÁGENES DE REFERENCIA (estado anterior del mismo vehículo) ===\n"
                "Compara con las imágenes actuales. Reporta SOLO los daños NUEVOS.\n"
                "Si un daño aparece igual en referencia y en actual, NO lo incluyas en damages[].\n"
            )
            for i, ref_bytes in enumerate(reference_images_bytes):
                try:
                    contents.append(genai_types.Part.from_bytes(data=ref_bytes, mime_type="image/jpeg"))
                    contents.append(f"Imagen de referencia {i+1}")
                except Exception as e:
                    logger.warning(f"Error añadiendo referencia {i}: {e}")

        gen_config = genai_types.GenerateContentConfig(temperature=0.2, response_mime_type="application/json")
        loop = asyncio.get_running_loop()

        # Modelos de fallback si el principal da 429
        fallback_models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
        models_to_try = [model_name] + [m for m in fallback_models if m != model_name]

        response = None
        last_err = None

        # Semáforo: máximo 2 llamadas Gemini simultáneas para evitar 429
        async with _gemini_sem:
            for model_attempt, current_model in enumerate(models_to_try):
                for retry in range(3):
                    try:
                        response = await asyncio.wait_for(
                            loop.run_in_executor(
                                _executor,
                                lambda m=current_model: client.models.generate_content(
                                    model=m, contents=contents, config=gen_config
                                )
                            ),
                            timeout=90.0
                        )
                        if model_attempt > 0 or retry > 0:
                            logger.info(f"Gemini OK con modelo={current_model} retry={retry}")
                        break
                    except asyncio.TimeoutError:
                        logger.error("Gemini timeout (>90s)")
                        return _fallback_analysis("Timeout de Gemini"), "gemini_timeout", "El analisis tardo demasiado."
                    except Exception as e:
                        last_err = e
                        err_str = str(e).lower()
                        is_rate_limit = "429" in err_str or "resource_exhausted" in err_str
                        if is_rate_limit and retry < 2:
                            wait_s = (retry + 1) * 15
                            logger.warning(f"Gemini 429 modelo={current_model}, reintento {retry+1} en {wait_s}s")
                            await asyncio.sleep(wait_s)
                            continue
                        elif is_rate_limit and model_attempt < len(models_to_try) - 1:
                            logger.warning(f"Gemini 429 agotado en {current_model}, probando {models_to_try[model_attempt+1]}")
                            break  # probar siguiente modelo
                        else:
                            raise
                if response is not None:
                    break

        if response is None and last_err:
            raise last_err

        raw = response.text
        if not raw:
            return _fallback_analysis("Gemini devolvió respuesta vacía"), "gemini_failed", "Gemini devolvió respuesta vacía"

        logger.info(f"Gemini response (primeros 300): {raw[:300]}")
        raw = _strip_markdown_json(raw)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"JSON inválido de Gemini: {e}. Raw: {raw[:500]}")
            return _fallback_analysis(f"JSON inválido: {e}"), "gemini_failed", _user_friendly_error(str(e))

        damages = []
        for d in data.get("damages", []):
            try:
                damages.append(Damage(**d))
            except Exception as de:
                logger.warning(f"Damage ignorado: {de} — {d}")

        new_damages = []
        for d in data.get("new_damages", []):
            try:
                new_damages.append(Damage(**d))
            except Exception as de:
                logger.warning(f"New damage ignorado: {de} — {d}")
        # Si no vino new_damages pero hay damages marcados is_new, usarlos
        if not new_damages and damages:
            new_damages = [d for d in damages if getattr(d, "is_new", True)]

        # De-duplicación: el mismo daño visto en varias fotos = 1 solo daño
        damages, dup_removed = _dedup_damages(damages)
        new_damages, dup_removed_new = _dedup_damages(new_damages)
        if dup_removed or dup_removed_new:
            logger.info(f"De-dup daños: {dup_removed} duplicados eliminados en damages, {dup_removed_new} en new_damages")

        # Recalcular contadores y coste desde las listas de-duplicadas
        critical_count = sum(1 for d in damages if (d.severity or "").lower() in ("grave", "critico", "crítico"))
        total_cost_dedup = sum((d.estimated_cost or 0) for d in damages)

        result = InspectionAnalysis(
            critical_damages_count=critical_count,
            total_damages_count=len(damages),
            new_damages_count=len(new_damages),
            severity=data.get("severity", "sin_danos"),
            dirt_level=(float(data["dirt_level"]) if data.get("dirt_level") is not None else None),
            urgency=data.get("urgency", "puede_esperar"),
            risk=data.get("risk", "bajo"),
            circulation_safe=bool(data.get("circulation_safe", True)),
            detected_plate=str(data.get("detected_plate", "")),
            fraud_warnings=list(data.get("fraud_warnings", [])),
            hidden_damage_probability=float(data.get("hidden_damage_probability", 0)),
            total_estimated_cost=float(total_cost_dedup if (dup_removed or dup_removed_new) and total_cost_dedup > 0 else data.get("total_estimated_cost", 0)),
            confidence=float(data.get("confidence", 0)),
            executive_summary=str(data.get("executive_summary", "")),
            image_quality_warnings=list(data.get("image_quality_warnings", [])),
            affected_parts=list(data.get("affected_parts", [])),
            critical_damages=list(data.get("critical_damages", [])),
            new_damages=new_damages,
            damages=damages
        )

        logger.info(
            f"Análisis OK: severity={result.severity}, "
            f"daños={result.total_damages_count}, coste={result.total_estimated_cost}€, "
            f"confidence={result.confidence}"
        )
        return result, "ok", None

    except Exception as e:
        logger.error(f"Error Gemini: {type(e).__name__}: {e}", exc_info=True)
        return _fallback_analysis(str(e)), "gemini_failed", str(e)


# =========================
# IMAGE PROCESSING + STORAGE
# =========================

def _process_image_sync(content: bytes, filepath: Path) -> bytes:
    """Procesa imagen con Pillow. Una sola compresión, consistente en disco y memoria."""
    image = Image.open(io.BytesIO(content)).convert("RGB")
    image.thumbnail((2048, 2048))  # Más resolución para mejor análisis Gemini
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=85, optimize=True)
    processed_bytes = buf.getvalue()
    # Escribir a disco desde el buffer — una sola compresión
    filepath.write_bytes(processed_bytes)
    return processed_bytes


def _upload_to_r2_sync(processed_bytes: bytes, filename: str) -> str:
    """Sube bytes a Cloudflare R2. Retorna la URL pública."""
    r2 = get_r2()
    if not r2:
        raise RuntimeError("R2 no configurado")
    r2.put_object(
        Bucket=R2_BUCKET,
        Key=filename,
        Body=processed_bytes,
        ContentType="image/jpeg",
        CacheControl="public, max-age=31536000",
    )
    return f"{R2_PUBLIC_URL}/{filename}"


async def process_and_save_image(content: bytes, vehicle_id: str) -> Tuple[str, bytes]:
    """
    Procesa la imagen y la guarda en R2 (si disponible) o en disco local.
    Retorna (url_publica, bytes_procesados).
    """
    filename = f"{vehicle_id}_{uuid.uuid4().hex}.jpg"
    filepath = UPLOAD_DIR / filename
    loop = asyncio.get_running_loop()

    # Procesar imagen (redimensionar + comprimir)
    processed_bytes = await loop.run_in_executor(
        _executor, _process_image_sync, content, filepath
    )

    # Intentar subir a R2
    r2 = get_r2()
    if r2:
        try:
            public_url = await loop.run_in_executor(
                _executor, _upload_to_r2_sync, processed_bytes, filename
            )
            logger.info(f"Imagen subida a R2: {filename}")
            # Eliminar copia local para no llenar el disco
            try:
                filepath.unlink(missing_ok=True)
            except Exception:
                pass
            return public_url, processed_bytes
        except Exception as e:
            logger.error(f"Error subiendo a R2: {type(e).__name__}: {e} — usando fallback local")

    # Fallback: URL absoluta usando PUBLIC_BASE_URL para que el frontend pueda cargarla
    base = PUBLIC_BASE_URL or ""
    local_url = f"{base}/uploads/{filename}"
    logger.warning(f"Imagen guardada en local (R2 no disponible): {local_url}")
    return local_url, processed_bytes


async def load_reference_images(ref_photo_urls: List[str]) -> List[bytes]:
    """
    Carga las imágenes de referencia desde R2 (HTTP) o desde disco local.
    Retorna lista de bytes listos para enviar a Gemini.
    """
    import aiohttp
    result = []
    async with aiohttp.ClientSession() as session:
        for url in ref_photo_urls:
            try:
                if url.startswith("http"):
                    # URL pública de R2 o similar
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status == 200:
                            result.append(await resp.read())
                        else:
                            logger.warning(f"Referencia HTTP {resp.status}: {url}")
                elif url.startswith("/uploads/"):
                    # Fichero local (fallback)
                    filepath = ROOT_DIR / url.lstrip("/")
                    if filepath.exists():
                        result.append(filepath.read_bytes())
                    else:
                        logger.warning(f"Referencia local no existe: {filepath}")
                else:
                    logger.warning(f"URL de referencia desconocida: {url[:60]}")
            except Exception as e:
                logger.warning(f"Error cargando referencia {url[:60]}: {e}")
    return result


def validate_image_content(content: bytes, max_size_mb: int = 15) -> None:
    if len(content) > max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Imagen demasiado grande. Máximo {max_size_mb}MB.")
    if not (content[:3] == b'\xff\xd8\xff' or content[:4] == b'\x89PNG'):
        raise HTTPException(status_code=415, detail="Solo se aceptan imágenes JPEG o PNG.")
    # Validar dimensiones mínimas
    try:
        img = Image.open(io.BytesIO(content))
        w, h = img.size
        if w < 200 or h < 200:
            raise HTTPException(status_code=422, detail=f"Imagen demasiado pequeña ({w}x{h}px). Mínimo 200x200px.")
    except HTTPException:
        raise
    except Exception:
        pass  # Si Pillow no puede abrirla, lo detectará en process_and_save_image


# =============================================================
# AUTH ROUTES
# =============================================================

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


# =========================
# RATE LIMITING DE LOGIN (anti fuerza bruta)
# =========================
from collections import defaultdict as _dd

_login_fails: dict = _dd(list)   # clave (tipo:identificador) → [timestamps de fallos]
_LOGIN_MAX_FAILS = 5             # intentos fallidos por USUARIO...
_LOGIN_MAX_FAILS_IP = 15         # ...y por IP (más alto: oficinas comparten IP)
_LOGIN_WINDOW_S = 300            # ventana de 5 minutos
_login_alerted: dict = {}        # para no spamear Telegram con la misma clave


def _rl_key_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?"))


def _rl_check(key: str):
    """Lanza 429 si la clave superó el límite de fallos en la ventana."""
    now = datetime.now(timezone.utc).timestamp()
    _login_fails[key] = [t for t in _login_fails[key] if now - t < _LOGIN_WINDOW_S]
    limit = _LOGIN_MAX_FAILS_IP if key.startswith("ip:") else _LOGIN_MAX_FAILS
    if len(_login_fails[key]) >= limit:
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Espera 5 minutos.")


async def _rl_fail(key: str, context: str):
    """Registra un fallo; si alcanza el límite, avisa por Telegram una vez."""
    now = datetime.now(timezone.utc).timestamp()
    _login_fails[key].append(now)
    if len(_login_fails[key]) >= _LOGIN_MAX_FAILS and now - _login_alerted.get(key, 0) > 1800:
        _login_alerted[key] = now
        try:
            config = await db.telegram_config.find_one({}, {"_id": 0})
            if config and config.get("enabled") and config.get("bot_token"):
                text = (f"🛡️ <b>ALERTA DE SEGURIDAD</b>\n\n"
                        f"Bloqueados 5 intentos de login fallidos seguidos.\n"
                        f"🔑 Objetivo: {context}\n"
                        f"Si no has sido tú, alguien está probando contraseñas.")
                async with _aiohttp.ClientSession() as session:
                    for chat_id in config.get("chat_ids", []):
                        if chat_id.strip():
                            await session.post(
                                f"https://api.telegram.org/bot{config['bot_token']}/sendMessage",
                                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
                                timeout=_aiohttp.ClientTimeout(total=8))
        except Exception as _e:
            logger.warning(f"Alerta seguridad Telegram falló: {_e}")


def _rl_ok(key: str):
    _login_fails.pop(key, None)


@auth_router.post("/login", response_model=TokenResponse)
async def admin_login(data: LoginRequest, request: Request):
    rl_user = f"user:{data.username.lower().strip()}"
    rl_ip = f"ip:{_rl_key_ip(request)}"
    _rl_check(rl_user)
    _rl_check(rl_ip)

    user = await db.admin_users.find_one({"username": data.username}, {"_id": 0})
    if not user or not verify_password(data.password, user["hashed_password"]):
        await _rl_fail(rl_user, f"admin '{data.username}' (IP {_rl_key_ip(request)})")
        await _rl_fail(rl_ip, f"admin '{data.username}' (IP {_rl_key_ip(request)})")
        await asyncio.sleep(0.8)  # frena ataques automatizados
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    _rl_ok(rl_user)
    _rl_ok(rl_ip)
    token = create_token(user["id"], user["role"], user["name"])
    logger.info(f"Admin login: {data.username}")
    return TokenResponse(
        access_token=token,
        role=user["role"],
        name=user["name"],
        id=user["id"],
        theme=user.get("theme")
    )


@auth_router.get("/conductor-list")
async def conductor_list_public(center: Optional[str] = None):
    """Lista pública de conductores (solo nombre, email, centro, id) para el
    portal de login del conductor. NO requiere autenticación."""
    query = {}
    if center and center != "Todos":
        query["center"] = {"$regex": center, "$options": "i"}
    cursor = db.drivers.find(query, {"_id": 0, "id": 1, "name": 1, "email": 1, "center": 1, "photo_url": 1})
    drivers = await cursor.to_list(500)
    return drivers


@auth_router.post("/driver-token")
async def driver_token_by_id(data: dict, request: Request):
    # Límite por IP: 20 tokens/5min — frena enumeración masiva de conductores
    rl_ip = f"dtok:{_rl_key_ip(request)}"
    now_ts = datetime.now(timezone.utc).timestamp()
    _login_fails[rl_ip] = [t for t in _login_fails[rl_ip] if now_ts - t < _LOGIN_WINDOW_S]
    if len(_login_fails[rl_ip]) >= 20:
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera unos minutos.")
    _login_fails[rl_ip].append(now_ts)
    return await _driver_token_impl(data)


async def _driver_token_impl(data: dict):
    """Genera JWT para el portal conductor (login por email sin contraseña).
    El portal ya valida que el email existe en la BD pública — aquí solo emitimos el token."""
    driver_id = data.get("driver_id")
    if not driver_id:
        raise HTTPException(status_code=400, detail="driver_id requerido")
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")
    token = create_token(driver_id, "driver", driver.get("name", ""))
    logger.info(f"Portal conductor token: {driver.get('name')} ({driver_id})")
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "driver",
        "name": driver.get("name", ""),
        "id": driver_id,
        "center": driver.get("center")
    }


@auth_router.post("/driver-login", response_model=TokenResponse)
async def driver_login(data: DriverLoginRequest, request: Request):
    rl_key = f"drv:{data.email.lower().strip()}"
    rl_ip = f"ip:{_rl_key_ip(request)}"
    _rl_check(rl_key)
    _rl_check(rl_ip)
    account = await db.driver_accounts.find_one({"email": data.email}, {"_id": 0})
    if not account or not verify_password(data.password, account["hashed_password"]):
        await _rl_fail(rl_key, f"conductor '{data.email}' (IP {_rl_key_ip(request)})")
        await _rl_fail(rl_ip, f"conductor '{data.email}' (IP {_rl_key_ip(request)})")
        await asyncio.sleep(0.8)
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    _rl_ok(rl_key)
    _rl_ok(rl_ip)

    if not account.get("active", True):
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    driver = await db.drivers.find_one({"id": account["driver_id"]}, {"_id": 0})
    driver_name = driver["name"] if driver else account["email"]
    driver_center = driver.get("center") if driver else None

    token = create_token(account["driver_id"], "driver", driver_name)
    logger.info(f"Driver login: {data.email}")
    return TokenResponse(
        access_token=token,
        role="driver",
        name=driver_name,
        id=account["driver_id"],
        center=driver_center
    )


@auth_router.get("/me/assigned-vehicle")
async def get_my_assigned_vehicle(user: dict = Depends(get_current_user)):
    """Devuelve la furgoneta asignada HOY al conductor según el cuadrante diario."""
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Solo conductores")
    driver_id = user["sub"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    docs = await db.daily_assignments.find({"date": today}, {"_id": 0}).to_list(50)
    for doc in docs:
        for slot in doc.get("slots", []):
            if slot.get("driver_id") == driver_id and slot.get("vehicle_id"):
                vehicle = await db.vehicles.find_one(
                    {"id": slot["vehicle_id"]}, {"_id": 0}
                )
                if vehicle:
                    insp = await db.inspections.find_one(
                        {"deleted": {"$ne": True}, "vehicle_id": slot["vehicle_id"],
                         "driver_id": driver_id,
                         "created_at": {"$regex": f"^{today}"}},
                        {"_id": 0, "id": 1}
                    )
                    return {
                        "assigned": True,
                        "vehicle": vehicle,
                        "center": doc.get("center"),
                        "already_inspected": insp is not None,
                    }
    return {"assigned": False, "vehicle": None}


@auth_router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    # Incluir el campo theme si existe en la BD (solo admins)
    theme = None
    if user.get("role") == "admin":
        admin_doc = await db.admin_users.find_one({"id": user["sub"]}, {"_id": 0, "theme": 1})
        if admin_doc:
            theme = admin_doc.get("theme")
    return {
        "id": user["sub"],
        "role": user["role"],
        "name": user["name"],
        "theme": theme,
    }


@auth_router.post("/create-admin")
async def create_admin(
    data: CreateAdminRequest,
    _admin: dict = Depends(require_admin)
):
    existing = await db.admin_users.find_one({"username": data.username})
    if existing:
        raise HTTPException(status_code=409, detail="El usuario ya existe")

    doc = {
        "id": str(uuid.uuid4()),
        "username": data.username,
        "hashed_password": hash_password(data.password),
        "name": data.name,
        "role": "admin",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.admin_users.insert_one(doc)
    logger.info(f"Admin creado: {data.username} por {_admin['name']}")
    return {"success": True, "id": doc["id"], "username": data.username}


@auth_router.post("/change-my-password")
async def change_my_password(data: dict, user: dict = Depends(get_current_user)):
    """Cualquier admin cambia SU PROPIA contraseña verificando la actual."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    if len(new) < 6:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 6 caracteres")
    doc = await db.admin_users.find_one({"id": user["sub"]})
    if not doc or not verify_password(current, doc["hashed_password"]):
        await asyncio.sleep(0.8)
        raise HTTPException(status_code=401, detail="La contraseña actual no es correcta")
    await db.admin_users.update_one(
        {"id": user["sub"]},
        {"$set": {"hashed_password": hash_password(new)}}
    )
    logger.info(f"Admin '{doc.get('username')}' cambió su propia contraseña")
    return {"success": True}


@auth_router.post("/reset-admin-password")
async def reset_admin_password(data: dict, _admin: dict = Depends(require_admin)):
    """Cambia la contraseña de un admin existente. Solo admins."""
    username = (data.get("username") or "").strip()
    new_password = data.get("password") or ""
    if not username or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Usuario y contraseña (mín. 6 caracteres) requeridos")
    result = await db.admin_users.update_one(
        {"username": username},
        {"$set": {"hashed_password": hash_password(new_password)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Admin no encontrado")
    logger.info(f"Contraseña de admin '{username}' cambiada por {_admin['name']}")
    return {"success": True}


@auth_router.post("/set-driver-password")
async def set_driver_password(
    data: SetDriverPasswordRequest,
    _admin: dict = Depends(require_admin)
):
    driver = await db.drivers.find_one({"id": data.driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")

    if not driver.get("email"):
        raise HTTPException(
            status_code=400,
            detail="El conductor no tiene email — añádelo primero para poder crear su cuenta"
        )

    existing = await db.driver_accounts.find_one({"driver_id": data.driver_id})
    hashed = hash_password(data.password)

    if existing:
        await db.driver_accounts.update_one(
            {"driver_id": data.driver_id},
            {"$set": {"hashed_password": hashed, "active": True}}
        )
        logger.info(f"Password reseteado para conductor {data.driver_id}")
    else:
        await db.driver_accounts.insert_one({
            "id": str(uuid.uuid4()),
            "driver_id": data.driver_id,
            "email": driver["email"],
            "hashed_password": hashed,
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Cuenta creada para conductor {data.driver_id} ({driver['email']})")

    return {
        "success": True,
        "driver_id": data.driver_id,
        "email": driver["email"],
        "message": f"Contraseña configurada. El conductor puede iniciar sesión con {driver['email']}"
    }


@auth_router.get("/admins")
async def list_admins(_admin: dict = Depends(require_admin)):
    admins = await db.admin_users.find({}, {"_id": 0, "hashed_password": 0}).to_list(100)
    return admins


@auth_router.get("/driver-accounts")
async def list_driver_accounts(_admin: dict = Depends(require_admin)):
    accounts = await db.driver_accounts.find(
        {}, {"_id": 0, "hashed_password": 0}
    ).to_list(1000)
    return accounts


# =============================================================
# API ROUTES
# =============================================================


@api_router.get("/")
async def root():
    return {"message": "FlotaDSP API funcionando", "version": "5.3.4"}


# =========================
# VEHICLES — solo admin
# =========================

@api_router.get("/vehicles/portal")
async def get_vehicles_portal(user: dict = Depends(require_any_auth)):
    """Portal conductor: devuelve los vehículos que puede inspeccionar el conductor.
    - Admin → todos los activos
    - Driver → su vehículo asignado; si no tiene, los de su centro
    Este endpoint NO requiere rol admin para que los conductores puedan usarlo."""
    if user.get("role") == "admin":
        vehicles = await db.vehicles.find(
            {"status": {"$ne": "deleted"}}, {"_id": 0}
        ).to_list(1000)
    else:
        driver_id = user["sub"]
        # 1) Vehículo asignado directamente al conductor
        assigned = await db.vehicles.find(
            {"status": {"$ne": "deleted"}, "current_driver_id": driver_id}, {"_id": 0}
        ).to_list(10)

        if assigned:
            vehicles = assigned
        else:
            # 2) Fallback: todos los vehículos del centro del conductor
            driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "center": 1})
            center = (driver.get("center") or "")[:4] if driver else ""
            if center:
                vehicles = await db.vehicles.find(
                    {"status": {"$ne": "deleted"}, "center": {"$regex": center, "$options": "i"}},
                    {"_id": 0}
                ).to_list(100)
            else:
                vehicles = []

    for v in vehicles:
        for k in ["created_at", "updated_at"]:
            if isinstance(v.get(k), str):
                try:
                    v[k] = datetime.fromisoformat(v[k])
                except Exception:
                    pass
    return vehicles


@api_router.post("/vehicles", response_model=Vehicle)
async def create_vehicle(data: VehicleCreate, _=Depends(require_admin)):
    vehicle = Vehicle(**data.model_dump())
    doc = serialize_doc(vehicle.model_dump())
    await db.vehicles.insert_one(doc)
    return vehicle


@api_router.get("/vehicles", response_model=List[Vehicle])
async def get_vehicles(center: Optional[str] = None, _=Depends(require_admin)):
    query = {"status": {"$ne": "deleted"}}
    if center and center != "Todos":
        # Coincidencia flexible: el centro de la furgoneta CONTIENE el código (OGA5, DGA1...)
        query["center"] = {"$regex": center, "$options": "i"}
    vehicles = await db.vehicles.find(query, {"_id": 0}).to_list(1000)
    for v in vehicles:
        for k in ["created_at", "updated_at"]:
            if isinstance(v.get(k), str):
                v[k] = datetime.fromisoformat(v[k])
    return vehicles


@api_router.get("/vehicles/{vehicle_id}", response_model=Vehicle)
async def get_vehicle(vehicle_id: str, _=Depends(require_admin)):
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    for k in ["created_at", "updated_at"]:
        if isinstance(v.get(k), str):
            v[k] = datetime.fromisoformat(v[k])
    return v


# =========================
# VEHICLE DOCUMENTS
# =========================

@api_router.get("/vehicles/{vehicle_id}/documents")
async def list_vehicle_documents(vehicle_id: str, _=Depends(require_admin)):
    docs = await db.vehicle_documents.find(
        {"vehicle_id": vehicle_id}, {"_id": 0}
    ).sort("uploaded_at", -1).to_list(100)
    return docs


@api_router.post("/vehicles/{vehicle_id}/documents")
async def upload_vehicle_document(
    vehicle_id: str,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    _=Depends(require_admin)
):
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "license_plate": 1})
    if not v:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande (máx 20 MB)")

    # Detectar extensión
    orig_name = file.filename or "documento"
    ext = orig_name.rsplit(".", 1)[-1].lower() if "." in orig_name else "pdf"
    safe_type = re.sub(r"[^a-zA-Z0-9_]", "_", doc_type)
    plate = (v.get("license_plate") or vehicle_id).replace(" ", "_")
    object_key = f"docs/{vehicle_id}/{safe_type}_{uuid.uuid4().hex[:8]}.{ext}"

    # Subir a R2
    s3 = get_r2()
    if not s3:
        raise HTTPException(status_code=502, detail="Almacenamiento R2 no configurado")
    bucket = R2_BUCKET
    content_type = file.content_type or "application/octet-stream"
    try:
        await asyncio.get_running_loop().run_in_executor(
            _executor,
            lambda: s3.put_object(
                Bucket=bucket, Key=object_key,
                Body=content, ContentType=content_type
            )
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error subiendo a R2: {e}")

    r2_public = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    url = f"{r2_public}/{object_key}" if r2_public else object_key

    doc = {
        "id": str(uuid.uuid4()),
        "vehicle_id": vehicle_id,
        "doc_type": doc_type,
        "name": orig_name,
        "url": url,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.vehicle_documents.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/vehicles/{vehicle_id}/documents/{doc_id}")
async def delete_vehicle_document(vehicle_id: str, doc_id: str, _=Depends(require_admin)):
    result = await db.vehicle_documents.delete_one({"id": doc_id, "vehicle_id": vehicle_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return {"success": True}


# =========================
# SCORING CONDUCTORES
# =========================

@api_router.get("/scoring/drivers")
async def get_driver_scoring(month: int = None, year: int = None, _=Depends(require_admin)):
    """Scoring competitivo de conductores (0-100), 5 pilares:

      📋 Cumplimiento   30 — inspecciones hechas vs días con asignación en el cuadrante
                              (si no hay cuadrantes, días naturales transcurridos)
      ⏰ Puntualidad    15 — hora de subida: 100% antes de las 20:45 (vuelta de ruta),
                              decae hasta 0 a las 23:00
      📸 Evidencia      15 — fotos completas + análisis OK; cada aviso de calidad
                              de la IA (borrosa, zona equivocada) resta
      🔍 Honestidad     15 — si la IA ve daños, ¿los declaró en sus notas?
      🛡️ Conservación   25 — empieza con 25; daños NUEVOS en su turno restan:
                              leve −6 · grave −15 · crítico −25 (solo con análisis
                              válidos en ambas inspecciones del delta)

    Desempate: a igual puntuación gana quien más inspecciones haya hecho.
    Solo puntúan conductores con al menos 3 inspecciones en el mes (los demás
    aparecen como 'sin datos suficientes').
    """
    import calendar as _cal
    now = datetime.now(timezone.utc)
    y = year or now.year
    m = month or now.month
    days_in_month = _cal.monthrange(y, m)[1]
    month_start = datetime(y, m, 1, tzinfo=timezone.utc)
    month_end = datetime(y, m, days_in_month, 23, 59, 59, tzinfo=timezone.utc)
    days_elapsed = now.day if (y == now.year and m == now.month) else days_in_month

    inspections_month = await db.inspections.find(
        {"deleted": {"$ne": True}, "created_at": {"$gte": month_start.isoformat(), "$lte": month_end.isoformat()}},
        {"_id": 0}
    ).to_list(length=5000)

    drivers = await db.drivers.find({"status": {"$ne": "deleted"}, "active": {"$ne": False}}, {"_id": 0}).to_list(500)

    # Días asignados por conductor según los cuadrantes del mes
    assignments = await db.daily_assignments.find(
        {"date": {"$gte": month_start.strftime("%Y-%m-%d"), "$lte": month_end.strftime("%Y-%m-%d")}},
        {"_id": 0, "date": 1, "slots.driver_id": 1}
    ).to_list(200)
    assigned_days = {}
    for a in assignments:
        for slot in a.get("slots", []):
            did = slot.get("driver_id")
            if did:
                assigned_days.setdefault(did, set()).add(a.get("date"))

    # Historial por vehículo SOLO con análisis válidos (para el delta)
    all_inspections = await db.inspections.find(
        {"deleted": {"$ne": True}, "analysis_status": "ok", "analysis": {"$ne": None}},
        {"_id": 0, "id": 1, "vehicle_id": 1, "driver_id": 1, "created_at": 1, "analysis": 1}
    ).sort("created_at", 1).to_list(length=20000)
    vehicle_history = {}
    for insp in all_inspections:
        vid = insp.get("vehicle_id")
        if vid:
            vehicle_history.setdefault(vid, []).append(insp)

    SEV = {"sin_danos": 0, "sin_daños": 0, "": 0, "leve": 1, "moderado": 1, "grave": 2, "critico": 3, "crítico": 3}

    def get_sev(insp):
        a = insp.get("analysis") or {}
        return SEV.get((a.get("severity") or "").lower().strip(), 0)

    def hour_of(iso):
        """Hora local española aproximada (UTC+2 verano)."""
        try:
            hh = int(iso[11:13]) + 2
            mm = int(iso[14:16])
            return hh + mm / 60.0
        except Exception:
            return None

    results = []
    for driver in drivers:
        driver_id = driver.get("id")
        name = driver.get("name", "—")
        center = driver.get("center", "—")
        driver_insps = [i for i in inspections_month if i.get("driver_id") == driver_id]
        n = len(driver_insps)

        if n < 3:
            results.append({
                "driver_id": driver_id, "name": name, "center": center,
                "photo_url": driver.get("photo_url"),
                "total": None, "inspections_count": n, "insufficient": True,
            })
            continue

        # ── 📋 Cumplimiento (30) ──
        days_assigned = len(assigned_days.get(driver_id, set()))
        denom = days_assigned if days_assigned >= 3 else max(days_elapsed, 1)
        compliance = round(min(30, (n / denom) * 30))

        # ── ⏰ Puntualidad (15) ──
        punct_scores = []
        for insp in driver_insps:
            hr = hour_of(insp.get("created_at", ""))
            if hr is None:
                continue
            # Operación DSP real: inspección al volver de ruta. Puntual = antes
            # de las 20:45; decae hasta 0 a las 23:00. Las de mañana (pre-ruta,
            # antes de las 12:00) también puntúan completo.
            if hr <= 12.0 or hr <= 20.75:
                punct_scores.append(15)
            elif hr >= 23.0:
                punct_scores.append(0)
            else:
                punct_scores.append(15 * (23.0 - hr) / 2.25)
        punctuality = round(sum(punct_scores) / len(punct_scores)) if punct_scores else 8

        # ── 📸 Evidencia (15) ──
        ev_scores = []
        for insp in driver_insps:
            photos = len(insp.get("photo_urls") or insp.get("photos") or [])
            ok = insp.get("analysis_status") == "ok"
            base = 15 if (photos >= 5 and ok) else 11 if photos >= 4 else 6 if photos >= 2 else 0
            warns = len(((insp.get("analysis") or {}).get("image_quality_warnings")) or [])
            ev_scores.append(max(0, base - 3 * warns))
        evidence = round(sum(ev_scores) / len(ev_scores)) if ev_scores else 0

        # ── 🔍 Honestidad (15) ──
        h_scores = []
        for insp in driver_insps:
            a = insp.get("analysis") or {}
            sev = (a.get("severity") or "").lower()
            if insp.get("analysis_status") == "ok" and sev in ("leve", "moderado", "grave", "critico", "crítico"):
                notes = (insp.get("notes") or "").lower()
                kws = ["daño", "dano", "golpe", "rasguño", "rasguno", "rayad", "abollad",
                       "roto", "rota", "crack", "grieta", "araña", "arana", "choc", "malo", "danado"]
                h_scores.append(15 if any(k in notes for k in kws) else 0)
        honesty = round(sum(h_scores) / len(h_scores)) if h_scores else 15

        # ── 🛡️ Conservación (25) — delta de daños con análisis válidos ──
        delta_events = []
        for insp in driver_insps:
            vid = insp.get("vehicle_id")
            if not vid or vid not in vehicle_history:
                continue
            if insp.get("analysis_status") != "ok" or not insp.get("analysis"):
                continue
            insp_time = insp.get("created_at", "")
            prev = None
            for hist in reversed(vehicle_history[vid]):
                if hist.get("created_at", "") < insp_time and hist.get("driver_id") != driver_id:
                    prev = hist
                    break
            if not prev:
                continue
            prev_s, curr_s = get_sev(prev), get_sev(insp)
            if curr_s > prev_s:
                penalty = {1: -6, 2: -15, 3: -25}.get(curr_s - prev_s, -25)
                sev_labels = {0: "sin_daños", 1: "leve", 2: "grave", 3: "crítico"}
                delta_events.append({
                    "vehicle_id": vid,
                    "from_sev": sev_labels.get(prev_s, "?"),
                    "to_sev": sev_labels.get(curr_s, "?"),
                    "penalty": penalty,
                    "date": insp_time[:10] if len(insp_time) >= 10 else insp_time,
                })
        conservation = max(0, 25 + sum(e["penalty"] for e in delta_events))

        total = min(100, compliance + punctuality + evidence + honesty + conservation)

        results.append({
            "driver_id": driver_id, "name": name, "center": center,
            "photo_url": driver.get("photo_url"),
            "total": total,
            "compliance": compliance, "punctuality": punctuality,
            "evidence": evidence, "honesty": honesty, "conservation": conservation,
            "delta_events": delta_events,
            "inspections_count": n,
            "days_assigned": days_assigned,
            "days_elapsed": days_elapsed,
            "insufficient": False,
        })

    # Orden: puntuación desc; desempate por nº de inspecciones; los 'sin datos' al final
    results.sort(key=lambda x: (x["total"] is None, -(x["total"] or 0), -x["inspections_count"]))
    return {"scores": results, "month": m, "year": y, "days_elapsed": days_elapsed,
            "min_inspections": 3}


@api_router.patch("/vehicles/{vehicle_id}")
async def update_vehicle(vehicle_id: str, data: dict, _=Depends(require_admin)):
    data.pop("_id", None)
    data.pop("id", None)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    prev = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "status": 1})
    result = await db.vehicles.update_one({"id": vehicle_id}, {"$set": data})
    if "status" in data:
        try:
            await _auto_incident_on_workshop(vehicle_id, (prev or {}).get("status"), data.get("status"))
        except Exception as _ai:
            logger.warning(f"Auto-incidencia taller: {_ai}")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    return {"success": True}


# =========================
# DRIVERS — solo admin
# =========================

@api_router.post("/drivers", response_model=Driver)
async def create_driver(data: DriverCreate, admin: dict = Depends(require_admin)):
    driver_data = data.model_dump()
    password = driver_data.pop("password", None)

    driver = Driver(**driver_data)
    doc = serialize_doc(driver.model_dump())
    await db.drivers.insert_one(doc)

    if password and driver.email:
        await db.driver_accounts.insert_one({
            "id": str(uuid.uuid4()),
            "driver_id": driver.id,
            "email": driver.email,
            "hashed_password": hash_password(password),
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Conductor y cuenta creados: {driver.email}")

    return driver


@api_router.get("/drivers", response_model=List[Driver])
async def get_drivers(center: Optional[str] = None, _=Depends(require_admin)):
    query = {"active": {"$ne": False}}
    if center and center != "Todos":
        query["center"] = {"$regex": center, "$options": "i"}
    drivers = await db.drivers.find(query, {"_id": 0}).to_list(1000)
    return drivers


@api_router.patch("/drivers/{driver_id}")
async def update_driver(driver_id: str, data: dict, _=Depends(require_admin)):
    data.pop("_id", None)
    data.pop("id", None)
    result = await db.drivers.update_one({"id": driver_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")
    return {"success": True}


# =========================
# DRIVER — su propio perfil
# =========================

@api_router.get("/me/driver")
async def get_my_driver_profile(user: dict = Depends(require_any_auth)):
    if user["role"] == "admin":
        raise HTTPException(status_code=400, detail="Usa /api/auth/me para admins")
    driver = await db.drivers.find_one({"id": user["sub"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return driver


@api_router.get("/me/vehicle")
async def get_my_assigned_vehicle(user: dict = Depends(require_any_auth)):
    vehicle = await db.vehicles.find_one(
        {"current_driver_id": user["sub"]}, {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="No tienes ningún vehículo asignado")
    return vehicle


# =========================
# INSPECTIONS — upload
# =========================

@api_router.post("/inspections/upload")
async def upload_inspection_photos(
    vehicle_id: str = Form(...),
    driver_id: Optional[str] = Form(None),
    notes: str = Form(""),
    files: List[UploadFile] = File(...),
    user: dict = Depends(require_any_auth)
):
    if not files:
        raise HTTPException(status_code=400, detail="Se requiere al menos una imagen.")
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Máximo 20 imágenes por inspección.")

    # Anti-duplicados: una inspección por vehículo+conductor al día (evita doble
    # tap con mala cobertura, análisis duplicados y Telegram repetido).
    # Los admins pueden repetir (peritajes manuales desde el panel).
    if user.get("role") == "driver":
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        dup = await db.inspections.find_one({
            "deleted": {"$ne": True}, "vehicle_id": vehicle_id,
            "driver_id": driver_id or user.get("sub"),
            "created_at": {"$regex": f"^{today}"}
        }, {"_id": 0, "id": 1})
        if dup:
            raise HTTPException(
                status_code=409,
                detail="Ya enviaste la inspección de esta furgoneta hoy. Si necesitas repetirla, avisa a tu coordinador."
            )

    # Un conductor solo puede subir inspecciones de vehículos de su centro
    if user["role"] == "driver":
        driver_id = user["sub"]
        driver_doc = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "center": 1})
        driver_center = (driver_doc.get("center") or "")[:4] if driver_doc else ""
        vehicle_doc = await db.vehicles.find_one({"id": vehicle_id, "status": {"$ne": "deleted"}}, {"_id": 0, "center": 1})
        if not vehicle_doc:
            raise HTTPException(status_code=404, detail="Vehículo no encontrado")
        vehicle_center = (vehicle_doc.get("center") or "")[:4]
        # Verificar que el conductor pertenece al mismo centro que el vehículo
        # El centro del conductor es corto (ej: "OGA5") y el del vehículo puede ser largo
        # (ej: "AMZL OGA5 SANTIAGO XPT") — basta con que uno contenga al otro
        if driver_center and vehicle_center:
            dc = driver_center.upper()
            vc = vehicle_doc.get("center", "").upper()
            if dc not in vc and vc[:4] not in dc:
                raise HTTPException(
                    status_code=403,
                    detail="Solo puedes subir inspecciones de vehículos de tu centro"
                )

    try:
        photo_urls = []
        photos_base64 = []

        for file in files:
            content = await file.read()
            if not content:
                logger.warning(f"Fichero vacío recibido: {file.filename} — ignorado")
                continue
            validate_image_content(content)
            photo_url, processed_bytes = await process_and_save_image(content, vehicle_id)
            photo_urls.append(photo_url)
            photos_base64.append(base64.b64encode(processed_bytes).decode("utf-8"))

        if not photo_urls:
            raise HTTPException(status_code=400, detail="No se procesó ninguna imagen válida.")

        logger.info(f"Guardadas {len(photo_urls)} fotos — vehículo {vehicle_id}")

        # Cargar fotos de referencia de la última inspección analizada
        ref_results = await db.inspections.find(
            {"deleted": {"$ne": True}, "vehicle_id": vehicle_id, "analysis": {"$ne": None}, "analysis_status": "ok"},
            {"_id": 0, "photos": 1}
        ).sort("created_at", -1).to_list(1)

        last_insp = ref_results[0] if ref_results else None
        ref_photo_urls = last_insp.get("photos", [])[:4] if last_insp else []

        # Cargar bytes de referencias desde R2 o disco
        ref_bytes_list: List[bytes] = []
        if ref_photo_urls:
            logger.info(f"Cargando {len(ref_photo_urls)} fotos de referencia")
            ref_bytes_list = await load_reference_images(ref_photo_urls)
            logger.info(f"Referencia cargada: {len(ref_bytes_list)} imágenes")

        # Guardar inspección PRIMERO (sin esperar a Gemini) para responder rápido al conductor
        inspection = Inspection(
            vehicle_id=vehicle_id,
            driver_id=driver_id,
            photos=photo_urls,
            reference_photos=(ref_photo_urls[:2] if ref_photo_urls else []),
            analysis=None,
            analysis_status="pending",
            analysis_error=None,
            notes=notes,
            analyzed_at=None
        )
        doc = serialize_doc(inspection.model_dump())
        await db.inspections.insert_one(doc)

        # Llamar a Gemini en background (no bloquea la respuesta al conductor)
        async def _analyze_and_update():
            try:
                analysis, analysis_status, analysis_error = await asyncio.wait_for(
                    analyze_images_with_gemini(photos_base64, ref_bytes_list if ref_bytes_list else None),
                    timeout=120.0
                )
                await db.inspections.update_one(
                    {"id": inspection.id},
                    {"$set": {"analysis": serialize_doc(analysis.model_dump()) if analysis else None,
                              "analysis_status": analysis_status,
                              "analysis_error": analysis_error,
                              "analyzed_at": datetime.now(timezone.utc)}}
                )
                # Notificar por Telegram si hay daños graves o críticos
                if analysis and analysis_status == "ok":
                    sev = (analysis.severity or "").lower()
                    if sev in ("grave", "critico"):
                        # Obtener matrícula y centro del vehículo
                        veh_doc = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "license_plate": 1, "center": 1})
                        plate = veh_doc.get("license_plate", vehicle_id) if veh_doc else vehicle_id
                        veh_center = veh_doc.get("center", "") if veh_doc else ""
                        # Obtener nombre y centro del conductor
                        drv_name = "Desconocido"
                        drv_center = ""
                        if driver_id:
                            drv_doc = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "name": 1, "center": 1})
                            if drv_doc:
                                drv_name = drv_doc.get("name", "Desconocido")
                                drv_center = drv_doc.get("center", "")
                        center = drv_center or veh_center or ""
                        try:
                            await send_telegram_damage_alert(
                                plate=plate,
                                driver_name=drv_name,
                                analysis=analysis,
                                photo_urls=photo_urls,
                                inspection_id=inspection.id,
                                center=center
                            )
                        except Exception as _te:
                            logger.warning(f"Telegram alert falló (no crítico): {_te}")
            except Exception as _e:
                logger.error(f"Análisis Gemini background falló: {_e}")
                await db.inspections.update_one(
                    {"id": inspection.id},
                    {"$set": {"analysis_status": "error", "analysis_error": str(_e)}}
                )
        asyncio.create_task(_analyze_and_update())

        # Lanzar detección YOLO en background (no bloquea la respuesta al usuario)
        asyncio.create_task(_run_yolo_for_inspection(inspection.id, photo_urls))

        # Respuesta inmediata — análisis Gemini se completa en background
        return {
            "success": True,
            "inspection_id": inspection.id,
            "analysis": None,
            "analysis_status": "pending",
            "analysis_error": None,
            "photos": photo_urls,
            "message": "Inspección enviada correctamente. Las fotos se han guardado."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error upload inspección: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/inspections", response_model=List[Inspection])
async def get_inspections(
    vehicle_id: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
    _=Depends(require_admin),
):
    query = {"deleted": {"$ne": True}}
    if vehicle_id:
        query["vehicle_id"] = vehicle_id
    limit = max(1, min(limit, 500))
    skip = max(0, skip)
    inspections = await db.inspections.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).to_list(limit)
    return inspections


@api_router.get("/inspections/vehicle/{vehicle_id}")
async def get_vehicle_inspections(vehicle_id: str, user: dict = Depends(require_any_auth)):
    if user["role"] == "driver":
        assigned = await db.vehicles.find_one({"id": vehicle_id, "current_driver_id": user["sub"]})
        if not assigned:
            raise HTTPException(status_code=403, detail="Acceso denegado")

    inspections = await db.inspections.find(
        {"deleted": {"$ne": True}, "vehicle_id": vehicle_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return inspections


@api_router.get("/inspections/review-queue")
async def get_review_queue(center: Optional[str] = None, _=Depends(require_admin)):
    """Cola de inspecciones pendientes de revisar (reviewed != true), enriquecidas
    con matrícula y nombre del conductor. Más recientes primero."""
    query = {"reviewed": {"$ne": True}, "deleted": {"$ne": True}}
    insps = await db.inspections.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    # Enriquecer con matrícula y conductor (lookups en lote)
    veh_ids = list({i.get("vehicle_id") for i in insps if i.get("vehicle_id")})
    drv_ids = list({i.get("driver_id") for i in insps if i.get("driver_id")})
    vehicles = {v["id"]: v for v in await db.vehicles.find(
        {"id": {"$in": veh_ids}}, {"_id": 0, "id": 1, "license_plate": 1, "brand": 1, "model": 1, "center": 1}
    ).to_list(500)}
    drivers = {dr["id"]: dr for dr in await db.drivers.find(
        {"id": {"$in": drv_ids}}, {"_id": 0, "id": 1, "name": 1, "center": 1}
    ).to_list(500)}

    out = []
    for i in insps:
        v = vehicles.get(i.get("vehicle_id"), {})
        dr = drivers.get(i.get("driver_id"), {})
        i_center = _normalize_center_code(dr.get("center") or v.get("center") or "")
        if center and center != "Todos" and i_center != center:
            continue
        analysis = i.get("analysis") or {}
        # Verificación de matrícula: la leída en las fotos vs la del vehículo
        detected_plate = (analysis.get("detected_plate") or "").replace(" ", "").replace("-", "").upper()
        real_plate = (v.get("license_plate") or "").replace(" ", "").replace("-", "").upper()
        plate_mismatch = bool(detected_plate and real_plate and detected_plate != real_plate)
        raw_new = analysis.get("new_damages") or []
        new_damages = [{
            "part": nd.get("part", ""),
            "severity": nd.get("severity", ""),
            "description": nd.get("description", ""),
            "location_hint": nd.get("location_hint", ""),
            "photo_index": nd.get("photo_index"),
            "box_2d": nd.get("box_2d"),
        } for nd in raw_new if isinstance(nd, dict)]
        out.append({
            "id": i.get("id"),
            "created_at": i.get("created_at"),
            "vehicle_id": i.get("vehicle_id"),
            "license_plate": v.get("license_plate", "—"),
            "vehicle_label": f"{v.get('brand', '')} {v.get('model', '')}".strip(),
            "driver_name": dr.get("name", "—"),
            "center": i_center,
            "photos": i.get("photos", []),
            "analysis_status": i.get("analysis_status"),
            "severity": analysis.get("severity") or "sin_analisis",
            "total_damages_count": analysis.get("total_damages_count") or 0,
            "executive_summary": analysis.get("executive_summary") or "",
            "new_damages": new_damages,
            "new_damages_count": len(new_damages),
            "has_reference": bool(i.get("reference_photos")),
            "detected_plate": analysis.get("detected_plate") or "",
            "plate_mismatch": plate_mismatch,
            "image_quality_warnings": list(analysis.get("image_quality_warnings") or [])[:5],
            "dirt_level": analysis.get("dirt_level"),
            "fraud_warnings": list(analysis.get("fraud_warnings") or [])[:5],
        })
    return {"queue": out, "total": len(out)}


@api_router.get("/inspections/{inspection_id}", response_model=Inspection)
async def get_inspection(inspection_id: str, _=Depends(require_admin)):
    insp = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    return insp


@api_router.delete("/inspections/{inspection_id}")
async def delete_inspection(inspection_id: str, user: dict = Depends(get_current_user)):
    """Soft-delete: la inspección desaparece de la app pero la evidencia se conserva
    (fotos, análisis, fecha) junto con quién la borró y cuándo. Crítico para disputas."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    result = await db.inspections.update_one(
        {"id": inspection_id, "deleted": {"$ne": True}},
        {"$set": {
            "deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": user.get("name", "?"),
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    logger.info(f"Inspección {inspection_id} eliminada (soft) por {user.get('name')}")
    return {"success": True, "message": "Inspección eliminada"}


@api_router.post("/inspections/{inspection_id}/damage-feedback")
async def damage_feedback(inspection_id: str, data: dict, user: dict = Depends(get_current_user)):
    """Validación humana de un daño detectado por la IA: ✓ correcto / ✗ falso.
    Cada veredicto se guarda como ejemplo de entrenamiento (dataset propio) con
    una copia completa del daño + la foto donde está — independiente de la
    inspección original, listo para entrenar el modelo propio."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    verdict = data.get("verdict")
    if verdict not in ("correct", "wrong"):
        raise HTTPException(status_code=400, detail="verdict debe ser 'correct' o 'wrong'")
    damage_index = data.get("damage_index")
    scope = data.get("scope", "new")  # 'new' = new_damages, 'all' = damages

    insp = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    analysis = insp.get("analysis") or {}
    pool = analysis.get("new_damages" if scope == "new" else "damages") or []
    if damage_index is None or damage_index < 0 or damage_index >= len(pool):
        raise HTTPException(status_code=404, detail="Daño no encontrado")
    dmg = pool[damage_index] if isinstance(pool[damage_index], dict) else {}

    # Foto concreta donde la IA localizó el daño
    photos = insp.get("photos") or []
    pi = dmg.get("photo_index")
    photo_url = photos[pi - 1] if (isinstance(pi, int) and 1 <= pi <= len(photos)) else (photos[0] if photos else None)

    sample = {
        "id": str(uuid.uuid4()),
        "inspection_id": inspection_id,
        "vehicle_id": insp.get("vehicle_id"),
        "scope": scope,
        "damage_index": damage_index,
        "damage": dmg,                      # copia completa: part, severity, box_2d, photo_index…
        "photo_url": photo_url,
        "all_photo_urls": photos,
        "verdict": verdict,                 # correct = la IA acertó · wrong = falso positivo
        "reviewed_by": user.get("name", "?"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model_version": "gemini-2.5-flash",
    }
    # Upsert: si re-valida el mismo daño, se actualiza el veredicto
    await db.ai_feedback.update_one(
        {"inspection_id": inspection_id, "scope": scope, "damage_index": damage_index},
        {"$set": sample}, upsert=True
    )
    total = await db.ai_feedback.count_documents({})
    return {"success": True, "dataset_size": total}


@api_router.get("/ai-dataset/stats")
async def ai_dataset_stats(_=Depends(require_admin)):
    """Progreso del dataset de entrenamiento de la IA propia."""
    total = await db.ai_feedback.count_documents({})
    correct = await db.ai_feedback.count_documents({"verdict": "correct"})
    wrong = await db.ai_feedback.count_documents({"verdict": "wrong"})
    return {"total": total, "correct": correct, "wrong": wrong,
            "precision_ia": round(correct / total * 100, 1) if total else None,
            "goal": 3000,
            "progress_pct": round(total / 3000 * 100, 1)}


@api_router.post("/inspections/{inspection_id}/mark-reviewed")
async def mark_inspection_reviewed(inspection_id: str, _=Depends(require_admin)):
    """Marca una inspección como revisada — desaparece de la cola de revisión rápida."""
    result = await db.inspections.update_one(
        {"id": inspection_id},
        {"$set": {"reviewed": True, "reviewed_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    return {"success": True}


@app.on_event("startup")
async def start_analysis_recovery():
    """Auto-recuperación de análisis perdidos: si el servidor se reinicia a mitad
    de un análisis (queda 'pending' colgado) o Gemini falló, se reintenta solo.
    Máximo 3 reintentos automáticos por inspección, 5 por ciclo, cada 10 min."""
    async def _recovery_loop():
        await asyncio.sleep(60)  # dejar arrancar el servidor con calma
        while True:
            try:
                now = datetime.now(timezone.utc)
                cutoff_stuck = (now - timedelta(minutes=15)).isoformat()
                cutoff_recent = (now - timedelta(hours=48)).isoformat()
                stuck = await db.inspections.find({
                    "$and": [
                        {"$or": [
                            {"analysis_status": "pending", "created_at": {"$lt": cutoff_stuck}},
                            {"analysis_status": {"$in": ["error", "gemini_failed", "gemini_timeout"]},
                             "created_at": {"$gt": cutoff_recent}},
                        ]},
                        {"auto_retries": {"$not": {"$gte": 3}}},
                        {"photos": {"$exists": True, "$ne": []}},
                        {"deleted": {"$ne": True}},
                    ]
                }, {"_id": 0, "id": 1, "analysis_status": 1}).sort("created_at", -1).to_list(5)

                for insp in stuck:
                    iid = insp["id"]
                    await db.inspections.update_one({"id": iid}, {"$inc": {"auto_retries": 1}})
                    logger.info(f"Auto-recuperación: reintentando análisis de {iid} (estaba {insp.get('analysis_status')})")
                    try:
                        await reanalyze_inspection(iid, None)
                    except Exception as _re:
                        logger.warning(f"Auto-recuperación {iid} falló: {_re}")
                    await asyncio.sleep(10)  # no saturar Gemini
            except Exception as e:
                logger.error(f"Recovery loop error: {e}")
            await asyncio.sleep(600)
    asyncio.create_task(_recovery_loop())


@api_router.post("/inspections/{inspection_id}/reanalyze")
async def reanalyze_inspection(inspection_id: str, _=Depends(require_admin)):
    """Relanza el análisis IA de una inspección usando las fotos ya guardadas.
    Útil cuando el análisis original falló (rate limit, timeout, etc.)."""
    insp = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    photo_urls = insp.get("photos") or []
    if not photo_urls:
        raise HTTPException(status_code=400, detail="La inspección no tiene fotos guardadas")

    # Descargar las fotos desde R2/disco
    photo_bytes = await load_reference_images(photo_urls)
    if not photo_bytes:
        raise HTTPException(status_code=502, detail="No se pudieron descargar las fotos guardadas")

    photos_base64 = [base64.b64encode(b).decode("utf-8") for b in photo_bytes]

    # Fotos de referencia (estado anterior) si las había
    ref_urls = insp.get("reference_photos") or []
    ref_bytes_list = await load_reference_images(ref_urls) if ref_urls else None

    # Marcar como pendiente mientras se reanaliza
    await db.inspections.update_one(
        {"id": inspection_id},
        {"$set": {"analysis_status": "pending", "analysis_error": None}}
    )

    analysis, analysis_status, analysis_error = await analyze_images_with_gemini(
        photos_base64, ref_bytes_list if ref_bytes_list else None
    )

    await db.inspections.update_one(
        {"id": inspection_id},
        {"$set": {"analysis": serialize_doc(analysis.model_dump()) if analysis else None,
                  "analysis_status": analysis_status,
                  "analysis_error": analysis_error,
                  "analyzed_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Telegram si el reanálisis revela daños graves/críticos
    if analysis and analysis_status == "ok":
        sev = (analysis.severity or "").lower()
        if sev in ("grave", "critico"):
            try:
                vehicle_id = insp.get("vehicle_id", "")
                driver_id = insp.get("driver_id", "")
                veh_doc = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "license_plate": 1, "center": 1})
                plate = veh_doc.get("license_plate", vehicle_id) if veh_doc else vehicle_id
                drv_doc = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "name": 1, "center": 1}) if driver_id else None
                drv_name = drv_doc.get("name", "Desconocido") if drv_doc else "Desconocido"
                center = (drv_doc.get("center", "") if drv_doc else "") or (veh_doc.get("center", "") if veh_doc else "")
                await send_telegram_damage_alert(
                    plate=plate, driver_name=drv_name, analysis=analysis,
                    photo_urls=photo_urls, inspection_id=inspection_id, center=center
                )
            except Exception as _te:
                logger.warning(f"Telegram tras reanálisis falló (no crítico): {_te}")

    logger.info(f"Reanálisis {inspection_id}: status={analysis_status}, severity={analysis.severity if analysis else 'n/a'}")
    return {
        "success": analysis_status == "ok",
        "analysis_status": analysis_status,
        "analysis_error": analysis_error,
        "analysis": serialize_doc(analysis.model_dump()) if analysis else None,
    }


# =========================
# ALERTS — solo admin
# =========================

@api_router.get("/alerts")
async def get_alerts(unread_only: bool = False, _=Depends(require_admin)):
    query = {"read": False} if unread_only else {}
    alerts = await db.alerts.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return alerts


@api_router.patch("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str, _=Depends(require_admin)):
    result = await db.alerts.update_one({"id": alert_id}, {"$set": {"read": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    return {"success": True}


# =========================
# HEALTH — público
# =========================

@api_router.get("/r2-test")
async def r2_test(_=Depends(require_admin)):
    """Diagnóstico: intenta subir un pixel de prueba a R2 y devuelve el resultado detallado."""
    r2 = get_r2()
    if not r2:
        return {
            "r2_client": False,
            "error": "Cliente R2 no inicializado",
            "R2_ENDPOINT": R2_ENDPOINT or "vacío",
            "R2_BUCKET": R2_BUCKET,
            "R2_ACCESS_KEY_set": bool(R2_ACCESS_KEY),
            "R2_SECRET_KEY_set": bool(R2_SECRET_KEY),
            "R2_PUBLIC_URL": R2_PUBLIC_URL or "vacío",
        }
    try:
        loop = asyncio.get_running_loop()
        test_bytes = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        test_key = "_test_connectivity.jpg"
        await loop.run_in_executor(_executor, lambda: r2.put_object(
            Bucket=R2_BUCKET, Key=test_key, Body=test_bytes,
            ContentType="image/jpeg"
        ))
        test_url = f"{R2_PUBLIC_URL}/{test_key}"
        return {"r2_client": True, "upload": "ok", "test_url": test_url,
                "bucket": R2_BUCKET, "endpoint": R2_ENDPOINT}
    except Exception as e:
        return {"r2_client": True, "upload": "FAILED",
                "error": f"{type(e).__name__}: {e}",
                "bucket": R2_BUCKET, "endpoint": R2_ENDPOINT}


@api_router.get("/health")
async def health():
    try:
        await db.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False

    r2_ok = get_r2() is not None

    return {
        "status": "ok",
        "version": "5.3.4",
        "gemini_configured": bool(os.environ.get("GEMINI_API_KEY")) or os.environ.get("USE_VERTEX_AI","").lower() in ("1","true","yes"),
        "gemini_mode": "vertex_ai" if os.environ.get("USE_VERTEX_AI","").lower() in ("1","true","yes") else "ai_studio",
        "gemini_model": os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        "gemini_role": "text_analysis_only",
        "ai_service_configured": bool(AI_SERVICE_URL),
        "ai_service_url": AI_SERVICE_URL or "not configured — using location_hint fallback",
        "detection_mode": "yolo11+sam2" if AI_SERVICE_URL else "location_hint_deterministic",
        "public_base_url": PUBLIC_BASE_URL or "no configurada",
        "r2_configured": r2_ok,
        "r2_bucket": R2_BUCKET if r2_ok else "no configurado",
        "r2_public_url": R2_PUBLIC_URL or "no configurada",
        "mongo_connected": mongo_ok,
        "upload_dir_exists": UPLOAD_DIR.exists(),
        "secret_key_set": bool(os.environ.get("SECRET_KEY")),
    }


# =========================
# CORS + MIDDLEWARE + ROUTERS
# =========================

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=()"
    return response


cors_origins_raw = os.environ.get("CORS_ORIGINS", "*")
cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]
use_credentials = cors_origins != ["*"]

# IMPORTANTE: middleware ANTES de montar rutas estáticas
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=use_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Boxes-Found", "X-Legend", "X-Diag", "X-Img-Bytes"],
)

# NOTA: app.include_router() se llama al FINAL del archivo, despues de definir
# TODOS los endpoints, para que las rutas anadidas se registren correctamente.

# Montar uploads locales DESPUÉS del middleware (solo fallback sin R2)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


@app.get("/")
async def home():
    return {"status": "FlotaDSP backend running", "version": "5.3.4"}


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    _executor.shutdown(wait=False)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)


# =============================================================
# ENDPOINTS ADICIONALES — añadidos para completar funcionalidad
# =============================================================

import aiohttp as _aiohttp

# =========================
# TELEGRAM
# =========================

class TelegramConfig(BaseModel):
    bot_token: str
    chat_ids: List[str]
    enabled: bool = True
    notify_critical: bool = True
    notify_new_damage: bool = True
    notify_inspections: bool = False


@api_router.post("/telegram/config")
async def save_telegram_config(config: TelegramConfig, _=Depends(require_admin)):
    doc = serialize_doc(config.model_dump())
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.telegram_config.replace_one({}, doc, upsert=True)
    return {"success": True, "message": "Configuración de Telegram guardada"}


@api_router.get("/telegram/config")
async def get_telegram_config(_=Depends(require_admin)):
    config = await db.telegram_config.find_one({}, {"_id": 0})
    if not config:
        return {"bot_token": "", "chat_ids": [""], "enabled": False,
                "notify_critical": True, "notify_new_damage": True, "notify_inspections": False}
    return config


@api_router.post("/telegram/test")
async def test_telegram(_=Depends(require_admin)):
    config = await db.telegram_config.find_one({}, {"_id": 0})
    if not config or not config.get("bot_token"):
        raise HTTPException(status_code=400, detail="Telegram no configurado")

    token = config["bot_token"]
    chat_ids = config.get("chat_ids", [])

    results = []
    async with _aiohttp.ClientSession() as session:
        for chat_id in chat_ids:
            if not chat_id.strip():
                continue
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = {"chat_id": chat_id, "text": "✅ FlotaDSP — Test de conexión exitoso", "parse_mode": "HTML"}
            try:
                async with session.post(url, json=payload, timeout=_aiohttp.ClientTimeout(total=10)) as resp:
                    data = await resp.json()
                    results.append({"chat_id": chat_id, "ok": data.get("ok", False)})
            except Exception as e:
                results.append({"chat_id": chat_id, "ok": False, "error": str(e)})

    all_ok = all(r["ok"] for r in results)
    return {"success": all_ok, "results": results}


async def send_telegram_alert(title: str, message: str, severity: str = "critico"):
    """Envía alerta a Telegram. Llamar cuando hay daños graves."""
    try:
        config = await db.telegram_config.find_one({}, {"_id": 0})
        if not config or not config.get("enabled") or not config.get("bot_token"):
            return
        if severity in ["critico", "grave"] and not config.get("notify_critical"):
            return

        token = config["bot_token"]
        emoji = "🚨" if severity == "critico" else "⚠️"
        text = f"{emoji} <b>{title}</b>\n\n{message}"

        async with _aiohttp.ClientSession() as session:
            for chat_id in config.get("chat_ids", []):
                if not chat_id.strip():
                    continue
                url = f"https://api.telegram.org/bot{token}/sendMessage"
                await session.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
                                   timeout=_aiohttp.ClientTimeout(total=5))
    except Exception as e:
        logger.warning(f"Error enviando Telegram: {e}")


def _severity_emoji(sev: str) -> str:
    return {"critico": "🔴", "grave": "🟠", "moderado": "🟡", "leve": "🟢"}.get(sev, "⚪")


async def send_telegram_damage_alert(plate, driver_name, analysis, photo_urls, inspection_id, center=None):
    """Envía a Telegram una alerta de daños con formato detallado: matrícula, conductor,
    daños NUEVOS y enlaces a las fotos."""
    try:
        config = await db.telegram_config.find_one({}, {"_id": 0})
        if not config or not config.get("enabled") or not config.get("bot_token"):
            return
        if not config.get("notify_critical", True):
            return

        token = config["bot_token"]
        sev = analysis.severity
        head_emoji = "🚨" if sev == "critico" else "⚠️"

        # Daños nuevos (si la IA los distingue); si no, usar todos
        nuevos = analysis.new_damages if analysis.new_damages else analysis.damages

        # Extraer código de centro corto (ej: "AMZL OGA5 SANTIAGO XPT" → "OGA5")
        center_display = ""
        if center:
            import re as _re_tg
            m = _re_tg.search(r'\b(OGA\d|DGA\d|[A-Z]{2,4}\d)\b', center.upper())
            center_display = m.group(1) if m else center[:6]

        lines = []
        center_tag = f" [{center_display}]" if center_display else ""
        lines.append(f"{head_emoji} <b>PERITAJE — DAÑOS DETECTADOS{center_tag}</b>")
        lines.append("")
        if center_display:
            lines.append(f"🏢 <b>Centro:</b> {center_display}")
        lines.append(f"🚗 <b>Matrícula:</b> {plate}")
        lines.append(f"👤 <b>Conductor:</b> {driver_name}")
        lines.append(f"{_severity_emoji(sev)} <b>Severidad:</b> {sev.upper()}")
        lines.append(f"💶 <b>Coste estimado:</b> {analysis.total_estimated_cost:.0f} €")

        # Aviso anti-fraude si la matrícula leída no coincide
        detected = (analysis.detected_plate or "").replace(" ", "").upper()
        plate_norm = (plate or "").replace(" ", "").upper()
        if detected and plate_norm and detected != plate_norm:
            lines.append("")
            lines.append(f"⛔ <b>ALERTA FRAUDE:</b> la matrícula leída en la foto ({analysis.detected_plate}) NO coincide con la del vehículo ({plate}).")
        if analysis.fraud_warnings:
            lines.append("")
            for fw in analysis.fraud_warnings[:3]:
                lines.append(f"⛔ {fw}")

        # Daños nuevos
        lines.append("")
        if nuevos:
            lines.append(f"<b>🆕 DAÑOS NUEVOS ({len(nuevos)}):</b>")
            for i, d in enumerate(nuevos[:10], 1):
                loc = f" [{d.location_hint}]" if getattr(d, "location_hint", "") else ""
                lines.append(f"{i}. <b>{d.part}</b>{loc} — {d.severity}")
                if d.description:
                    lines.append(f"   {d.description}")
        else:
            lines.append("Sin daños nuevos respecto al peritaje anterior.")

        # Enlaces a las fotos — etiquetadas por zona (orden del portal conductor)
        zonas = ["Frontal", "Trasera", "Lateral izquierdo", "Lateral derecho",
                 "Foto 5", "Foto 6", "Foto 7", "Foto 8"]
        if photo_urls:
            lines.append("")
            lines.append("<b>📸 Fotos por zona:</b>")
            for i, u in enumerate(photo_urls[:8]):
                etiqueta = zonas[i] if i < len(zonas) else f"Foto {i+1}"
                lines.append(f"• {etiqueta}: <a href=\"{u}\">ver</a>")

        text = "\n".join(lines)

        async with _aiohttp.ClientSession() as session:
            for chat_id in config.get("chat_ids", []):
                if not chat_id.strip():
                    continue
                url = f"https://api.telegram.org/bot{token}/sendMessage"
                await session.post(
                    url,
                    json={"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                          "disable_web_page_preview": True},
                    timeout=_aiohttp.ClientTimeout(total=8)
                )
    except Exception as e:
        logger.warning(f"Error enviando alerta detallada Telegram: {e}")


async def send_daily_inspection_summary():
    """Resumen nocturno por centro: qué furgonetas del cuadrante de hoy tienen
    inspección y cuáles no. Un mensaje de Telegram por centro con cuadrante."""
    try:
        config = await db.telegram_config.find_one({}, {"_id": 0})
        if not config or not config.get("enabled") or not config.get("bot_token"):
            logger.info("Resumen diario: Telegram no configurado — omitido")
            return
        token = config["bot_token"]
        chat_ids = [c for c in config.get("chat_ids", []) if c.strip()]
        if not chat_ids:
            return

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        assignments = await db.daily_assignments.find({"date": today}, {"_id": 0}).to_list(20)
        if not assignments:
            logger.info("Resumen diario: sin cuadrante hoy — nada que enviar")
            return

        # Fecha bonita en español
        dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
        now_dt = datetime.now(timezone.utc)
        fecha_str = f"{dias[now_dt.weekday()]} {now_dt.strftime('%d/%m/%Y')}"

        # Inspecciones de hoy (una consulta, agrupadas por vehículo)
        insps_today = await db.inspections.find(
            {"deleted": {"$ne": True}, "created_at": {"$regex": f"^{today}"}},
            {"_id": 0, "vehicle_id": 1, "analysis": 1}
        ).to_list(1000)
        insp_by_vehicle = {}
        for i in insps_today:
            vid = i.get("vehicle_id")
            if vid:
                insp_by_vehicle[vid] = i

        for assignment in assignments:
            center = assignment.get("center", "—")
            slots = [s for s in assignment.get("slots", []) if s.get("vehicle_id")]
            if not slots:
                continue

            total = len(slots)
            done = []
            missing = []
            sev_counts = {"sin": 0, "leve": 0, "grave": 0}
            for slot in slots:
                vid = slot["vehicle_id"]
                insp = insp_by_vehicle.get(vid)
                if insp:
                    done.append(slot)
                    sev = ((insp.get("analysis") or {}).get("severity") or "").lower()
                    if sev in ("grave", "critico", "crítico"):
                        sev_counts["grave"] += 1
                    elif sev in ("leve", "moderado"):
                        sev_counts["leve"] += 1
                    else:
                        sev_counts["sin"] += 1
                else:
                    missing.append(slot)

            pct = round(len(done) / total * 100) if total else 0
            lines = []
            if not missing:
                lines.append(f"✅ <b>RESUMEN DIARIO — {center}</b>")
                lines.append(f"📅 {fecha_str}")
                lines.append("")
                lines.append("🎉 <b>¡Todas las inspecciones completadas!</b>")
                lines.append("")
                lines.append(f"🚐 Furgonetas asignadas: {total}")
                lines.append(f"📸 Inspecciones recibidas: {len(done)} (100%)")
                lines.append("")
                lines.append(f"🟢 Sin daños: {sev_counts['sin']}")
                lines.append(f"🟡 Leves: {sev_counts['leve']}")
                lines.append(f"🔴 Graves/críticos: {sev_counts['grave']}")
                lines.append("")
                lines.append("💪 Día redondo. Sin pendientes.")
            else:
                lines.append(f"⚠️ <b>RESUMEN DIARIO — {center}</b>")
                lines.append(f"📅 {fecha_str}")
                lines.append("")
                lines.append(f"❌ <b>Faltan {len(missing)} inspecciones:</b>")
                for slot in missing[:15]:
                    drv = slot.get("driver_name") or "Sin conductor asignado"
                    lines.append(f"• {drv} — {slot.get('vehicle_plate', '—')}")
                lines.append("")
                lines.append(f"🚐 Asignadas: {total} · 📸 Recibidas: {len(done)} ({pct}%)")
                lines.append("")
                lines.append(f"🟢 Sin daños: {sev_counts['sin']} · 🟡 Leves: {sev_counts['leve']} · 🔴 Graves: {sev_counts['grave']}")

            text = "\n".join(lines)
            async with _aiohttp.ClientSession() as session:
                for chat_id in chat_ids:
                    try:
                        await session.post(
                            f"https://api.telegram.org/bot{token}/sendMessage",
                            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                                  "disable_web_page_preview": True},
                            timeout=_aiohttp.ClientTimeout(total=8)
                        )
                    except Exception as _se:
                        logger.warning(f"Resumen diario: error enviando a {chat_id}: {_se}")
            logger.info(f"Resumen diario enviado: {center} — {len(done)}/{total} inspecciones")
    except Exception as e:
        logger.error(f"Error en resumen diario: {e}", exc_info=True)


async def backup_database_to_r2() -> dict:
    """Exporta TODAS las colecciones a un JSON.gz y lo sube a R2 (backups/).
    Conserva los últimos 14 backups. El cluster Atlas es M0 (sin backups nativos):
    esto es la red de seguridad contra corrupción o borrado accidental."""
    import gzip as _gzip
    r2 = get_r2()
    if not r2:
        return {"success": False, "error": "R2 no configurado"}
    try:
        dump = {}
        total_docs = 0
        names = await db.list_collection_names()
        for cname in names:
            docs = await db[cname].find({}, {"_id": 0}).to_list(100000)
            dump[cname] = docs
            total_docs += len(docs)

        raw = json.dumps(dump, default=str, ensure_ascii=False).encode("utf-8")
        compressed = _gzip.compress(raw, compresslevel=6)
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M")
        key = f"backups/flotadsp_{stamp}.json.gz"

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(_executor, lambda: r2.put_object(
            Bucket=R2_BUCKET, Key=key, Body=compressed,
            ContentType="application/gzip"
        ))

        # Rotación: conservar solo los 14 más recientes
        deleted = 0
        try:
            listing = await loop.run_in_executor(_executor, lambda: r2.list_objects_v2(
                Bucket=R2_BUCKET, Prefix="backups/"
            ))
            keys = sorted([o["Key"] for o in listing.get("Contents", [])], reverse=True)
            for old_key in keys[14:]:
                await loop.run_in_executor(_executor, lambda k=old_key: r2.delete_object(Bucket=R2_BUCKET, Key=k))
                deleted += 1
        except Exception as _rot:
            logger.warning(f"Rotación de backups falló (no crítico): {_rot}")

        size_mb = round(len(compressed) / 1024 / 1024, 2)
        logger.info(f"Backup BD OK: {key} — {total_docs} docs, {size_mb}MB, {len(names)} colecciones, {deleted} antiguos borrados")
        return {"success": True, "key": key, "collections": len(names),
                "documents": total_docs, "size_mb": size_mb}
    except Exception as e:
        logger.error(f"Backup BD FALLÓ: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@api_router.post("/admin/backup-now")
async def trigger_backup(_=Depends(require_admin)):
    """Lanza un backup manual de la base de datos a R2."""
    return await backup_database_to_r2()


@app.on_event("startup")
async def start_backup_scheduler():
    """Backup automático diario a las 04:00 hora española."""
    async def _backup_loop():
        from zoneinfo import ZoneInfo
        madrid = ZoneInfo("Europe/Madrid")
        while True:
            try:
                now = datetime.now(madrid)
                target = now.replace(hour=4, minute=0, second=0, microsecond=0)
                if now >= target:
                    target = target + timedelta(days=1)
                await asyncio.sleep((target - now).total_seconds())
                result = await backup_database_to_r2()
                if not result.get("success"):
                    # Avisar por Telegram si el backup falla — esto SÍ es crítico
                    try:
                        config = await db.telegram_config.find_one({}, {"_id": 0})
                        if config and config.get("enabled") and config.get("bot_token"):
                            async with _aiohttp.ClientSession() as session:
                                for chat_id in config.get("chat_ids", []):
                                    if chat_id.strip():
                                        await session.post(
                                            f"https://api.telegram.org/bot{config['bot_token']}/sendMessage",
                                            json={"chat_id": chat_id,
                                                  "text": f"🚨 EL BACKUP DIARIO DE LA BASE DE DATOS HA FALLADO: {result.get('error')}"},
                                            timeout=_aiohttp.ClientTimeout(total=8))
                    except Exception:
                        pass
                await asyncio.sleep(70)
            except Exception as e:
                logger.error(f"Backup scheduler: {e}")
                await asyncio.sleep(600)
    asyncio.create_task(_backup_loop())


@app.on_event("startup")
async def start_daily_summary_scheduler():
    """Programa el resumen diario de inspecciones a las 22:00 hora española."""
    async def _scheduler():
        from zoneinfo import ZoneInfo
        madrid = ZoneInfo("Europe/Madrid")
        while True:
            try:
                now = datetime.now(madrid)
                target = now.replace(hour=22, minute=0, second=0, microsecond=0)
                if now >= target:
                    target = target + timedelta(days=1)
                wait_s = (target - now).total_seconds()
                logger.info(f"Resumen diario programado para {target.isoformat()} (en {wait_s/3600:.1f}h)")
                await asyncio.sleep(wait_s)
                await send_daily_inspection_summary()
                # Pequeño margen para no disparar dos veces en el mismo minuto
                await asyncio.sleep(70)
            except Exception as e:
                logger.error(f"Scheduler resumen diario: {e}")
                await asyncio.sleep(300)
    asyncio.create_task(_scheduler())


@api_router.post("/telegram/send-daily-summary")
async def trigger_daily_summary(_=Depends(require_admin)):
    """Dispara manualmente el resumen diario (para probar sin esperar a las 22:00)."""
    await send_daily_inspection_summary()
    return {"success": True, "message": "Resumen enviado (si hay cuadrante y Telegram configurado)"}


# =========================
# INCIDENCIAS
# =========================

class Incident(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    driver_id: Optional[str] = None
    title: str = ""
    description: str
    severity: str = "leve"
    status: str = "open"
    photos: List[str] = []
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = None


class IncidentCreate(BaseModel):
    vehicle_id: str
    driver_id: Optional[str] = None
    title: str = ""
    description: str
    severity: str = "leve"
    photos: List[str] = []
    notes: str = ""


async def _auto_incident_on_workshop(vehicle_id: str, prev_status, new_status):
    """Al marcar un vehículo 'en taller', crea (o reabre) su incidencia automáticamente
    para que siempre quede en el histórico."""
    if new_status != "in_workshop" or prev_status == "in_workshop":
        return
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "license_plate": 1})
    plate = (v or {}).get("license_plate", vehicle_id)
    titulo = f"Vehículo en taller — {plate}"
    # ¿Ya hay una incidencia de taller para este vehículo? → reabrirla en vez de duplicar
    existing = await db.incidents.find_one({"vehicle_id": vehicle_id, "title": titulo})
    now_iso = datetime.now(timezone.utc).isoformat()
    if existing:
        if existing.get("status") in ("resolved", "closed"):
            await db.incidents.update_one(
                {"id": existing["id"]},
                {"$set": {"status": "open", "resolved_at": None, "reopened_at": now_iso},
                 "$push": {"history": {"date": now_iso, "event": "Reabierta: vuelve a entrar en taller"}}}
            )
            logger.info(f"Incidencia de taller reabierta para {plate}")
        return
    inc = Incident(
        vehicle_id=vehicle_id,
        title=titulo,
        description=f"Entrada en taller registrada automáticamente el {now_iso[:10]}.",
        severity="media",
        status="open",
    )
    doc = serialize_doc(inc.model_dump())
    doc["auto_created"] = True
    await db.incidents.insert_one(doc)
    logger.info(f"Incidencia de taller creada automáticamente para {plate}")


@api_router.get("/incidents")
async def get_incidents(vehicle_id: Optional[str] = None, user: dict = Depends(require_any_auth)):
    query = {}
    if vehicle_id:
        query["vehicle_id"] = vehicle_id
    if user["role"] == "driver":
        query["driver_id"] = user["sub"]
    incidents = await db.incidents.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return incidents


@api_router.post("/incidents")
async def create_incident(data: IncidentCreate, user: dict = Depends(require_any_auth)):
    incident = Incident(**data.model_dump())
    if user["role"] == "driver":
        incident.driver_id = user["sub"]
    doc = serialize_doc(incident.model_dump())
    await db.incidents.insert_one(doc)
    logger.info(f"Incidencia creada: {incident.id} — vehículo {incident.vehicle_id}")
    return serialize_doc(incident.model_dump())


@api_router.put("/incidents/{incident_id}/reopen")
async def reopen_incident(incident_id: str, _=Depends(require_admin)):
    """Reabre una incidencia cerrada (sin necesidad de crear otra)."""
    result = await db.incidents.update_one(
        {"id": incident_id},
        {"$set": {"status": "open", "resolved_at": None,
                  "reopened_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    return {"success": True}


@api_router.put("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, _=Depends(require_admin)):
    result = await db.incidents.update_one(
        {"id": incident_id},
        {"$set": {"status": "resolved", "resolved_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    return {"success": True}


# =========================
# TALLERES — CRUD + sugerencias por daño (v5.1)
# =========================

def _normalize_center_code(center_raw: Optional[str]) -> str:
    """Convierte 'AMZL OGA5 SANTIAGO XPT' → 'OGA5'. Devuelve '' si no reconocido."""
    if not center_raw or not isinstance(center_raw, str):
        return ""
    up = center_raw.upper()
    for code in ("OGA5", "DGA1", "DGA2"):
        if code in up:
            return code
    return ""


def _damage_category(damage: dict) -> str:
    """Infiere la categoría de trabajo necesaria a partir del daño.
    Devuelve: 'lunas' | 'mecanica' | 'chapa' (default)."""
    haystack = " ".join([
        str(damage.get("part") or ""),
        str(damage.get("description") or ""),
        str(damage.get("repair_suggestion") or ""),
    ]).lower()
    if any(k in haystack for k in ("luna", "cristal", "parabrisas", "vidrio")):
        return "lunas"
    if any(k in haystack for k in ("motor", "transmis", "embrague", "freno", "suspen", "dirección", "direccion")):
        return "mecanica"
    if any(k in haystack for k in ("neumát", "neumat", "rueda", "llanta")):
        return "neumaticos"
    return "chapa"


def _provider_matches(workshop: dict, provider: str) -> bool:
    """¿El taller tiene convenio con este proveedor?"""
    if not provider:
        return False
    convenios = workshop.get("convenios") or []
    if "*" in convenios:
        return True
    pup = provider.upper()
    for c in convenios:
        cup = str(c).upper()
        if cup and (cup in pup or pup in cup):
            return True
    return False


@api_router.get("/workshops", response_model=List[Workshop])
async def list_workshops(
    center: Optional[str] = None,
    category: Optional[str] = None,
    provider: Optional[str] = None,
    only_active: bool = True,
    _=Depends(require_admin),
):
    query = {}
    if only_active:
        query["active"] = {"$ne": False}
    if center:
        query["center"] = center
    if category:
        query["categories"] = category
    workshops = await db.workshops.find(query, {"_id": 0}).to_list(500)
    # Filtro por proveedor en Python (más flexible que regex en arrays)
    if provider:
        workshops = [w for w in workshops if _provider_matches(w, provider)]
    for w in workshops:
        for k in ("created_at", "updated_at"):
            if isinstance(w.get(k), str):
                try:
                    w[k] = datetime.fromisoformat(w[k])
                except Exception:
                    pass
    return workshops


@api_router.post("/workshops", response_model=Workshop)
async def create_workshop(data: WorkshopCreate, _=Depends(require_admin)):
    w = Workshop(**data.model_dump())
    doc = serialize_doc(w.model_dump())
    await db.workshops.insert_one(doc)
    logger.info(f"Taller creado: {w.name} ({w.id})")
    return w


@api_router.get("/workshops/{workshop_id}", response_model=Workshop)
async def get_workshop(workshop_id: str, _=Depends(require_admin)):
    w = await db.workshops.find_one({"id": workshop_id}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Taller no encontrado")
    for k in ("created_at", "updated_at"):
        if isinstance(w.get(k), str):
            try:
                w[k] = datetime.fromisoformat(w[k])
            except Exception:
                pass
    return w


@api_router.put("/workshops/{workshop_id}")
async def update_workshop(workshop_id: str, data: dict, _=Depends(require_admin)):
    data.pop("_id", None)
    data.pop("id", None)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.workshops.update_one({"id": workshop_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Taller no encontrado")
    return {"success": True}


@api_router.delete("/workshops/{workshop_id}")
async def delete_workshop(workshop_id: str, _=Depends(require_admin)):
    # Soft delete: marca inactive en lugar de borrar (preserva históricos)
    result = await db.workshops.update_one(
        {"id": workshop_id},
        {"$set": {"active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Taller no encontrado")
    return {"success": True}


# --- Actualización de un daño individual (coste real, taller asignado, estado) ---

@api_router.patch("/inspections/{inspection_id}/damages/{damage_index}")
async def update_damage(
    inspection_id: str,
    damage_index: int,
    data: dict,
    _=Depends(require_admin),
):
    """Actualiza UN daño dentro de una inspección por índice de array.
    Campos editables: actual_cost, workshop_id, repair_status, repair_notes."""
    insp = await db.inspections.find_one({"id": inspection_id})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    analysis = insp.get("analysis") or {}
    damages = analysis.get("damages") or []
    if damage_index < 0 or damage_index >= len(damages):
        raise HTTPException(status_code=404, detail="Daño no encontrado en esa inspección")

    allowed = {"actual_cost", "workshop_id", "repair_status", "repair_notes"}
    now_iso = datetime.now(timezone.utc).isoformat()

    current = damages[damage_index] if isinstance(damages[damage_index], dict) else {}
    for k, v in (data or {}).items():
        if k in allowed:
            current[k] = v

    # Marcas de tiempo automáticas
    if "workshop_id" in data and data.get("workshop_id"):
        current.setdefault("assigned_at", now_iso)
        if current.get("repair_status") in (None, "", "pending"):
            current["repair_status"] = "assigned"
    if data.get("repair_status") == "done":
        current["completed_at"] = now_iso

    damages[damage_index] = current

    # Recalcular total de coste real (suma de actual_cost de los daños que lo tengan)
    actual_total = sum(
        float(d.get("actual_cost") or 0)
        for d in damages
        if isinstance(d, dict) and d.get("actual_cost") is not None
    )

    update = {"analysis.damages": damages}
    if actual_total > 0:
        update["analysis.total_actual_cost"] = round(actual_total, 2)

    await db.inspections.update_one({"id": inspection_id}, {"$set": update})

    return {
        "success": True,
        "damage": current,
        "total_actual_cost": round(actual_total, 2),
    }


@api_router.get("/inspections/{inspection_id}/damages/{damage_index}/suggested-workshops")
async def suggest_workshops_for_damage(
    inspection_id: str,
    damage_index: int,
    _=Depends(require_admin),
):
    """Devuelve talleres sugeridos para un daño concreto, filtrados ESTRICTAMENTE
    por el centro logístico de la furgoneta (no mezcla talleres de otros centros),
    y ordenados por score.

    Filtro previo: solo talleres del mismo centro que la furgoneta, MÁS los
    universales (convenios contiene "*", típico Carglass). El resto se descarta
    aunque tenga convenio con el proveedor — un taller en Vigo no le sirve a
    una furgoneta en Santiago.

    Lógica de score:
      - +100 si la furgoneta es Kinto Y el taller es oficial Toyota
      - +80  si el taller tiene convenio explícito con el proveedor de la furgoneta
      - +60  si el taller es 'universal' (convenios incluye '*', p.ej. Carglass)
      - +50  si la categoría del taller coincide con el tipo de daño (lunas/chapa/mecánica)
      - +5   por cada 0.1 sobre 4.0 en rating (max +50)
    """
    insp = await db.inspections.find_one({"id": inspection_id})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    analysis = insp.get("analysis") or {}
    damages = analysis.get("damages") or []
    if damage_index < 0 or damage_index >= len(damages):
        raise HTTPException(status_code=404, detail="Daño no encontrado en esa inspección")

    damage = damages[damage_index] if isinstance(damages[damage_index], dict) else {}
    category = _damage_category(damage)

    vehicle = await db.vehicles.find_one({"id": insp.get("vehicle_id", "")})
    provider = (vehicle or {}).get("provider", "") or ""
    center_code = _normalize_center_code((vehicle or {}).get("center"))
    is_kinto = "KINTO" in provider.upper()

    # Filtro ESTRICTO por centro: cada taller (incluso cadenas como Carglass) está
    # dado de alta con su centro — un taller de Vigo nunca sirve para Santiago.
    # Sin centro de furgoneta → no filtramos (mejor mostrar todo que nada).
    query = {"active": {"$ne": False}}
    if center_code:
        query["center"] = center_code

    workshops = await db.workshops.find(query, {"_id": 0}).to_list(500)
    # Respaldo: si el centro no tiene ningún taller, mostrar todos marcados como de otro centro
    other_center_fallback = False
    if center_code and not workshops:
        workshops = await db.workshops.find({"active": {"$ne": False}}, {"_id": 0}).to_list(500)
        other_center_fallback = True

    scored = []
    for w in workshops:
        score = 0
        reasons = []
        cats = w.get("categories") or []
        convenios = w.get("convenios") or []

        if is_kinto and ("oficial_toyota" in cats or w.get("is_official")):
            score += 100
            reasons.append("oficial Toyota (Kinto)")
        elif _provider_matches(w, provider):
            if "*" in convenios:
                score += 60
                reasons.append("universal (vía seguro)")
            else:
                score += 80
                reasons.append(f"convenio con {provider}")
        elif "*" in convenios:
            # Universal sin coincidencia explícita de proveedor: igual sirve (Carglass para lunas)
            score += 40
            reasons.append("trabaja con todos")

        if category in cats:
            score += 50
            reasons.append(f"especialista en {category}")
        elif category == "chapa" and "pintura" in cats:
            score += 30
            reasons.append("hace pintura")

        rating = w.get("rating")
        if isinstance(rating, (int, float)) and rating >= 4.0:
            bonus = min(50, int((rating - 4.0) * 50))
            score += bonus
            if bonus > 0:
                reasons.append(f"{rating}★")

        if score > 0:
            w_copy = dict(w)
            w_copy["_match_score"] = score
            w_copy["_match_reasons"] = reasons
            scored.append(w_copy)

    scored.sort(key=lambda x: -x.get("_match_score", 0))

    # Marcar talleres de otro centro cuando se usó el respaldo
    if other_center_fallback:
        for w in scored:
            w["_other_center"] = True
            w["_match_reasons"] = [f"⚠️ taller de {w.get('center', 'otro centro')}"] + (w.get("_match_reasons") or [])

    return {
        "damage_index": damage_index,
        "damage_category": category,
        "vehicle_provider": provider,
        "vehicle_center": center_code,
        "is_kinto": is_kinto,
        "other_center_fallback": other_center_fallback,
        "provider_network": _provider_network_for(provider),
        "workshops": scored[:15],
        "total_matched": len(scored),
    }


# =========================
# DELETE vehículos y conductores
# =========================

@api_router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, _=Depends(require_admin)):
    result = await db.vehicles.update_one(
        {"id": vehicle_id},
        {"$set": {"status": "deleted", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    return {"success": True}


@api_router.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str, _=Depends(require_admin)):
    result = await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"active": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")
    return {"success": True}


# =========================
# PUT (alias de PATCH) para vehículos y conductores
# =========================

@api_router.put("/vehicles/{vehicle_id}")
async def put_vehicle(vehicle_id: str, data: dict, _=Depends(require_admin)):
    data.pop("_id", None)
    data.pop("id", None)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    prev = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "status": 1})
    result = await db.vehicles.update_one({"id": vehicle_id}, {"$set": data})
    if "status" in data:
        try:
            await _auto_incident_on_workshop(vehicle_id, (prev or {}).get("status"), data.get("status"))
        except Exception as _ai:
            logger.warning(f"Auto-incidencia taller: {_ai}")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    return {"success": True}


@api_router.put("/drivers/{driver_id}")
async def put_driver(driver_id: str, data: dict, _=Depends(require_admin)):
    data.pop("_id", None)
    data.pop("id", None)
    result = await db.drivers.update_one({"id": driver_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")
    return {"success": True}


# =========================
# MARCAR TODAS LAS ALERTAS COMO LEÍDAS
# =========================

@api_router.put("/alerts/read-all")
async def mark_all_alerts_read(_=Depends(require_admin)):
    result = await db.alerts.update_many({}, {"$set": {"read": True}})
    return {"success": True, "updated": result.modified_count}


# =========================
# PDF DE INSPECCIONES
# =========================



# =========================
# IMPORTACIÓN MASIVA VEHÍCULOS
# =========================

def _load_workbook_reparado(content):
    """Repara un .xlsx con styles.xml corrupto (típico del Excel de Amazon Fleet)
    y lo recarga. Reemplaza la hoja de estilos por una mínima válida."""
    import io as _io, zipfile, openpyxl
    src = _io.BytesIO(content)
    out = _io.BytesIO()
    # Generamos MUCHOS estilos (300) porque las celdas del Excel de Amazon referencian
    # índices de estilo altos; si solo ponemos uno, falla con "list index out of range".
    N = 300
    xfs = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' * N
    styles_minimo = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<numFmts count="0"/>'
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        '<borders count="1"><border/></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        f'<cellXfs count="{N}">{xfs}</cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    )
    with zipfile.ZipFile(src, "r") as zin:
        names = zin.namelist()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
            for n in names:
                data = zin.read(n)
                if n == "xl/styles.xml":
                    data = styles_minimo.encode("utf-8")
                zout.writestr(n, data)
    out.seek(0)
    return openpyxl.load_workbook(out, data_only=False)


@api_router.post("/import/vehicles")
async def import_vehicles(
    file: UploadFile = File(...),
    center_filter: Optional[str] = Form(None),
    _=Depends(require_admin)
):
    content = await file.read()
    try:
        import openpyxl
        wb = None
        # Intento 1: carga normal con data_only
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        except Exception as e1:
            # Intento 2: sin data_only (evita leer la hoja de estilos calculada)
            try:
                wb = openpyxl.load_workbook(io.BytesIO(content), data_only=False)
            except Exception as e2:
                # Intento 3: reparar el XML de estilos corrupto del Excel de Amazon
                wb = _load_workbook_reparado(content)
        if wb is None:
            raise HTTPException(status_code=400, detail="No se pudo leer el Excel")
        # Elegir la hoja con MÁS filas (no siempre es la activa)
        hojas_validas = [w for w in wb.worksheets if (w.max_row or 0) > 0]
        if not hojas_validas:
            raise HTTPException(status_code=400, detail="El Excel no tiene hojas con datos")
        ws = max(hojas_validas, key=lambda w: w.max_row or 0)
        # Forzar recálculo de dimensiones por si vienen mal declaradas
        try:
            ws.reset_dimensions()
        except Exception:
            pass
        # Leer todas las filas como valores
        all_rows = list(ws.iter_rows(values_only=True))
        # Filtrar filas completamente vacías al principio
        all_rows = [r for r in all_rows if r is not None]
        if not all_rows or len(all_rows) < 1:
            raise HTTPException(status_code=400, detail="El Excel no tiene filas legibles")
        headers = [str(c).strip().lower() if c is not None else "" for c in all_rows[0]]
        if not any(headers):
            raise HTTPException(status_code=400, detail="No se detectaron cabeceras en el Excel")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"IMPORT-ERR lectura Excel: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=f"Error leyendo Excel: {e}")

    import unicodedata
    def _strip_accents(txt):
        return "".join(c for c in unicodedata.normalize("NFD", txt) if unicodedata.category(c) != "Mn")
    # Normalizar cabeceras: minúsculas y sin tildes
    headers_norm = [_strip_accents(h) for h in headers]

    def col(row, *names):
        for name in names:
            key = _strip_accents(name.lower())
            if key in headers_norm:
                idx = headers_norm.index(key)
                v = row[idx] if idx < len(row) else None
                return str(v).strip() if v is not None else ""
        return ""

    imported = 0
    updated = 0
    skipped = 0
    errors = []

    # Precargar todas las furgonetas indexadas por matrícula normalizada (sin espacios)
    _all_vehicles = await db.vehicles.find({}).to_list(10000)
    _plate_map = {}
    for _v in _all_vehicles:
        _key = (_v.get("license_plate","") or "").replace(" ","").upper()
        if _key:
            _plate_map[_key] = _v

    _diag_count = 0
    _diag_examples = []
    for row in all_rows[1:]:
        if not any(c is not None and str(c).strip() for c in row):
            continue
        plate = col(row, "matricula", "license_plate", "matrícula").upper()
        if not plate:
            skipped += 1
            continue
        try:
            center = col(row, "centro", "center")
            if center_filter and center != center_filter:
                skipped += 1
                continue
            # Buscar usando el mapa normalizado precargado
            plate_nospace = plate.replace(" ", "").upper()
            existing = _plate_map.get(plate_nospace)
            if len(_diag_examples) < 8:
                _diag_examples.append({"excel_plate": plate, "normalizada": plate_nospace, "encontrada_en_bd": bool(existing)})
            if existing:
                plate = existing.get("license_plate", plate)

            # Construir solo los campos que vienen con valor en el Excel
            campos = {}
            field_map = [
                (["marca","brand","vehículo","vehiculo"], "brand"),
                (["modelo","model"], "model"),
                (["color"], "color"),
                (["centro","center"], "center"),
                (["proveedor","provider"], "provider"),
                (["tipo","vehicle_type"], "vehicle_type"),
            ]
            for names, field in field_map:
                val = col(row, *names)
                if val:
                    campos[field] = val
            km_val = col(row, "kilómetros", "kilometros", "km", "mileage")
            if km_val:
                try:
                    campos["mileage"] = int(float(str(km_val).replace(".","").replace(",","").replace(" ","")))
                except Exception:
                    pass
            # Fechas de ITV y renting (formato Excel DD/MM/YYYY -> guardamos tal cual y normalizada ISO)
            def _parse_fecha(val):
                if not val:
                    return None
                txt = str(val).strip()[:10]
                for sep in ["/", "-"]:
                    if sep in txt:
                        parts = txt.split(sep)
                        if len(parts) == 3:
                            try:
                                if len(parts[0]) == 4:  # YYYY-MM-DD
                                    y, m, d = parts
                                else:  # DD/MM/YYYY
                                    d, m, y = parts
                                return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
                            except Exception:
                                return None
                return None
            itv = _parse_fecha(col(row, "i.t.v.", "itv", "fecha itv"))
            if itv:
                campos["itv_date"] = itv
            vto_renting = _parse_fecha(col(row, "vto. cont.renting.", "vto cont renting", "vto renting", "vencimiento renting"))
            if vto_renting:
                campos["renting_end_date"] = vto_renting
            baja_renting = _parse_fecha(col(row, "fecha baja renting", "baja renting"))
            if baja_renting:
                campos["renting_baja_date"] = baja_renting
            yr = col(row, "año", "year")
            if yr:
                try: campos["year"] = int(yr)
                except Exception: pass

            if existing:
                if campos:
                    campos["updated_at"] = datetime.now(timezone.utc)
                    await db.vehicles.update_one({"license_plate": plate}, {"$set": campos})
                    updated += 1
                else:
                    skipped += 1
                continue

            # Furgoneta NO está en tu flota: la omitimos (no creamos las 600 ajenas)
            skipped += 1
        except Exception as row_err:
            errors.append(f"{plate}: {str(row_err)[:80]}")
            skipped += 1
            continue

    return {
        "imported": imported,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:10],
        "diag_total_filas": len(all_rows),
        "diag_furgonetas_bd": len(_plate_map),
        "diag_ejemplos_excel": _diag_examples,
        "message": f"{imported} creados, {updated} actualizados, {skipped} omitidos"
    }


# =========================
# BULK VIN y FIX CENTERS
# =========================

@api_router.post("/vehicles/fix-centers")
async def fix_centers(_=Depends(require_admin)):
    """Normaliza los nombres de centros."""
    center_map = {"OGA5": "OGA5", "DGA1": "DGA1", "DGA2": "DGA2"}
    updated = 0
    async for v in db.vehicles.find({}, {"_id": 0, "id": 1, "center": 1}):
        c = v.get("center", "")
        normalized = center_map.get(c.upper().strip(), c)
        if normalized != c:
            await db.vehicles.update_one({"id": v["id"]}, {"$set": {"center": normalized}})
            updated += 1
    return {"success": True, "updated": updated}


# =========================
# REPROCESAR INSPECCIONES FALLIDAS
# =========================

@api_router.post("/inspections/{inspection_id}/reanalyze")
async def reanalyze_inspection(inspection_id: str, _=Depends(require_admin)):
    """Reprocesa una inspeccion cuyo analisis IA fallo (ej. cuando Gemini estaba sin cuota)."""
    insp = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspeccion no encontrada")

    photos = insp.get("photos", [])
    if not photos:
        raise HTTPException(status_code=400, detail="La inspeccion no tiene fotos para reanalizar")

    # Descargar las fotos (desde R2 o local) y convertir a base64
    images_b64 = []
    for url in photos:
        try:
            if url.startswith("http"):
                async with _aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=_aiohttp.ClientTimeout(total=15)) as r:
                        if r.status == 200:
                            data = await r.read()
                            images_b64.append(base64.b64encode(data).decode())
            else:
                p = Path(url.lstrip("/"))
                if p.exists():
                    images_b64.append(base64.b64encode(p.read_bytes()).decode())
        except Exception as e:
            logger.warning(f"No se pudo descargar foto {url}: {e}")

    if not images_b64:
        raise HTTPException(status_code=400, detail="No se pudieron recuperar las fotos")

    analysis, status, error = await analyze_images_with_gemini(images_b64)

    update = {
        "analysis": serialize_doc(analysis.model_dump()),
        "analysis_status": status,
        "analysis_error": error,
        "reanalyzed_at": datetime.now(timezone.utc).isoformat()
    }
    await db.inspections.update_one({"id": inspection_id}, {"$set": update})

    # Si ahora detecta daños graves, crear alerta
    if status == "ok" and analysis.severity in ["grave", "critico"]:
        alert = {
            "id": str(uuid.uuid4()),
            "vehicle_id": insp.get("vehicle_id"),
            "inspection_id": inspection_id,
            "type": "damage",
            "severity": "high" if analysis.severity == "grave" else "critical",
            "message": analysis.executive_summary,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.alerts.insert_one(alert)

        # Datos para mensaje enriquecido
        vehicle = await db.vehicles.find_one({"id": insp.get("vehicle_id")}, {"_id": 0})
        plate = vehicle.get("license_plate") if vehicle else insp.get("vehicle_id")
        driver_name = "Sin asignar"
        did = insp.get("driver_id") or (vehicle.get("current_driver_id") if vehicle else None)
        if did:
            drv = await db.drivers.find_one({"id": did}, {"_id": 0, "name": 1})
            if drv:
                driver_name = drv.get("name", "Sin asignar")

        await send_telegram_damage_alert(
            plate=plate,
            driver_name=driver_name,
            analysis=analysis,
            photo_urls=insp.get("photos", []),
            inspection_id=inspection_id,
        )

    return {"success": status == "ok", "status": status, "error": error,
            "severity": analysis.severity, "damages": analysis.total_damages_count}


@api_router.post("/inspections/reanalyze-failed")
async def reanalyze_all_failed(_=Depends(require_admin)):
    """Reprocesa TODAS las inspecciones cuyo analisis fallo. Util tras recuperar cuota de Gemini."""
    failed = await db.inspections.find(
        {"deleted": {"$ne": True}, "analysis_status": {"$ne": "ok"}}, {"_id": 0, "id": 1}
    ).to_list(500)

    return {
        "found": len(failed),
        "message": f"{len(failed)} inspecciones pendientes de reanalisis. "
                   f"Usa el boton de reanalizar en cada una, o espera al reproceso automatico.",
        "inspection_ids": [f["id"] for f in failed]
    }


# =========================
# STATS DASHBOARD
# =========================

@api_router.get("/stats/attention")
async def stats_attention(_=Depends(require_admin)):
    """Panel 'qué necesita mi atención HOY': pendientes de revisar, incidentes
    abiertos, inspecciones que faltan según cuadrante, análisis fallidos y
    € de daños del mes vs mes anterior."""
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    # 1. Pendientes de revisar
    pending_review = await db.inspections.count_documents({
        "reviewed": {"$ne": True}, "deleted": {"$ne": True}
    })

    # 2. Incidentes abiertos
    open_incidents = await db.incidents.count_documents({"status": {"$nin": ["closed", "resolved", "cerrada", "resuelta"]}})

    # 3. Cuadrante de hoy: faltan por inspeccionar
    assignments = await db.daily_assignments.find({"date": today}, {"_id": 0, "slots": 1}).to_list(20)
    slots = [s for a in assignments for s in a.get("slots", []) if s.get("vehicle_id")]
    inspected_vids = set()
    if slots:
        async for i in db.inspections.find(
            {"deleted": {"$ne": True}, "created_at": {"$regex": f"^{today}"}},
            {"_id": 0, "vehicle_id": 1}
        ):
            inspected_vids.add(i.get("vehicle_id"))
    missing_today = [
        {"plate": s.get("vehicle_plate", "—"), "driver": s.get("driver_name", "—")}
        for s in slots if s["vehicle_id"] not in inspected_vids
    ]

    # 4. Análisis fallidos (últimas 48h, recuperables)
    cutoff = (now - timedelta(hours=48)).isoformat()
    failed_analyses = await db.inspections.count_documents({
        "deleted": {"$ne": True},
        "analysis_status": {"$nin": ["ok", None]},
        "created_at": {"$gt": cutoff},
    })

    # 5. € de daños nuevos: mes actual vs anterior
    import calendar as _cal
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = month_start - timedelta(seconds=1)
    prev_month_start = prev_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    async def _month_cost(start_iso, end_iso):
        total = 0.0
        async for i in db.inspections.find(
            {"deleted": {"$ne": True}, "analysis_status": "ok",
             "created_at": {"$gte": start_iso, "$lte": end_iso}},
            {"_id": 0, "analysis.new_damages": 1, "analysis.total_estimated_cost": 1, "reference_photos": 1}
        ):
            a = i.get("analysis") or {}
            # Si hubo comparación con referencia, contar solo daños NUEVOS
            if i.get("reference_photos"):
                total += sum((nd.get("estimated_cost") or 0) for nd in (a.get("new_damages") or []) if isinstance(nd, dict))
            else:
                total += a.get("total_estimated_cost") or 0
        return round(total)

    cost_this_month = await _month_cost(month_start.isoformat(), now.isoformat())
    cost_prev_month = await _month_cost(prev_month_start.isoformat(), prev_month_end.isoformat())

    return {
        "pending_review": pending_review,
        "open_incidents": open_incidents,
        "assigned_today": len(slots),
        "missing_today": missing_today[:10],
        "missing_today_count": len(missing_today),
        "failed_analyses": failed_analyses,
        "cost_this_month": cost_this_month,
        "cost_prev_month": cost_prev_month,
    }


@api_router.get("/stats/dashboard")
async def stats_dashboard(_=Depends(require_admin)):
    """Devuelve los contadores y metricas del dashboard principal."""
    total_vehicles = await db.vehicles.count_documents({"status": {"$ne": "deleted"}})
    vehicles_in_workshop = await db.vehicles.count_documents({"status": "taller"})
    total_drivers = await db.drivers.count_documents({"active": {"$ne": False}})
    total_inspections = await db.inspections.count_documents({})
    unread_alerts = await db.alerts.count_documents({"read": False})
    open_incidents = await db.incidents.count_documents({"status": "open"})

    # Desglose de severidad de inspecciones
    severity_counts = {"sin_danos": 0, "leve": 0, "moderado": 0, "grave": 0, "critico": 0}
    async for insp in db.inspections.find({"deleted": {"$ne": True}}, {"_id": 0, "analysis.severity": 1}):
        sev = (insp.get("analysis") or {}).get("severity", "sin_danos")
        if sev in severity_counts:
            severity_counts[sev] += 1

    # Actividad ultimos 7 dias (inspecciones por dia)
    from collections import defaultdict
    daily = defaultdict(lambda: {"inspecciones": 0, "danos": 0})
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    async for insp in db.inspections.find({"deleted": {"$ne": True}}, {"_id": 0, "created_at": 1, "analysis.severity": 1}):
        ca = insp.get("created_at")
        if isinstance(ca, str):
            try:
                ca = datetime.fromisoformat(ca)
            except Exception:
                continue
        if not ca:
            continue
        if ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        if ca >= cutoff:
            key = ca.strftime("%Y-%m-%d")
            daily[key]["inspecciones"] += 1
            sev = (insp.get("analysis") or {}).get("severity", "sin_danos")
            if sev in ["grave", "critico", "moderado"]:
                daily[key]["danos"] += 1

    return {
        "total_vehicles": total_vehicles,
        "vehicles_in_workshop": vehicles_in_workshop,
        "total_drivers": total_drivers,
        "total_inspections": total_inspections,
        "unread_alerts": unread_alerts,
        "open_incidents": open_incidents,
        "severity_breakdown": severity_counts,
        "weekly_activity": dict(daily),
    }

# =========================
# ASIGNACION CONDUCTOR <-> VEHICULO
# =========================

class AssignDriverRequest(BaseModel):
    driver_id: Optional[str] = None  # None = desasignar


@api_router.put("/vehicles/{vehicle_id}/assign-driver")
async def assign_driver(vehicle_id: str, req: AssignDriverRequest, _=Depends(require_admin)):
    """Asigna (o desasigna) un conductor a un vehiculo. Registra el cambio en el historial."""
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehiculo no encontrado")

    prev = vehicle.get("current_driver_id")

    if req.driver_id:
        driver = await db.drivers.find_one({"id": req.driver_id}, {"_id": 0})
        if not driver:
            raise HTTPException(status_code=404, detail="Conductor no encontrado")

    await db.vehicles.update_one(
        {"id": vehicle_id},
        {"$set": {"current_driver_id": req.driver_id,
                  "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Registrar en historial de asignaciones (para deteccion de responsabilidad)
    await db.driver_assignments.insert_one({
        "id": str(uuid.uuid4()),
        "vehicle_id": vehicle_id,
        "driver_id": req.driver_id,
        "previous_driver_id": prev,
        "assigned_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "vehicle_id": vehicle_id, "driver_id": req.driver_id}


@api_router.get("/vehicles/{vehicle_id}/driver")
async def get_vehicle_driver(vehicle_id: str, _=Depends(require_admin)):
    """Devuelve el conductor asignado actualmente a un vehiculo."""
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "current_driver_id": 1})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehiculo no encontrado")
    did = vehicle.get("current_driver_id")
    if not did:
        return {"driver": None}
    driver = await db.drivers.find_one({"id": did}, {"_id": 0})
    return {"driver": driver}


# =========================
# DETECCION DE RESPONSABILIDAD DE DANOS
# =========================

@api_router.get("/inspections/{inspection_id}/responsibility")
async def damage_responsibility(inspection_id: str, _=Depends(require_admin)):
    """Determina que conductor tenia asignado el vehiculo cuando se hizo esta inspeccion con danos."""
    insp = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspeccion no encontrada")

    vehicle_id = insp.get("vehicle_id")
    insp_date = insp.get("created_at")

    # Conductor asignado en el momento de la inspeccion
    driver_id = insp.get("driver_id")
    if not driver_id:
        v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "current_driver_id": 1})
        driver_id = v.get("current_driver_id") if v else None

    driver = None
    if driver_id:
        driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})

    analysis = insp.get("analysis") or {}
    return {
        "inspection_id": inspection_id,
        "vehicle_id": vehicle_id,
        "inspection_date": insp_date,
        "driver": driver,
        "severity": analysis.get("severity", "sin_danos"),
        "damages_count": analysis.get("total_damages_count", 0),
        "note": "Conductor asignado en el momento de la inspeccion. Para danos NUEVOS, compara con la inspeccion anterior."
    }


# =========================
# SCORE DE CONDUCTOR
# =========================

@api_router.get("/drivers/{driver_id}/score")
async def driver_score(driver_id: str, _=Depends(require_admin)):
    """Calcula una puntuacion del conductor segun sus inspecciones y danos."""
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")

    inspections = await db.inspections.find({"deleted": {"$ne": True}, "driver_id": driver_id}, {"_id": 0}).to_list(500)
    total = len(inspections)
    con_danos = 0
    graves = 0
    for i in inspections:
        sev = (i.get("analysis") or {}).get("severity", "sin_danos")
        if sev not in ["sin_danos", "sin_analisis"]:
            con_danos += 1
        if sev in ["grave", "critico"]:
            graves += 1

    # Score base 100, penaliza danos graves
    score = 100
    if total > 0:
        score -= int((con_danos / total) * 30)
        score -= int((graves / total) * 40)
    score = max(0, min(100, score))

    nivel = "Excelente" if score >= 85 else "Bueno" if score >= 65 else "Regular" if score >= 40 else "Necesita atencion"

    return {
        "driver_id": driver_id,
        "driver_name": driver.get("name", ""),
        "total_inspections": total,
        "inspections_with_damage": con_danos,
        "severe_damages": graves,
        "score": score,
        "level": nivel,
    }


@api_router.get("/drivers/ranking")
async def drivers_ranking(_=Depends(require_admin)):
    """Ranking de conductores por puntuacion."""
    drivers = await db.drivers.find({"active": {"$ne": False}}, {"_id": 0}).to_list(200)
    ranking = []
    for d in drivers:
        inspections = await db.inspections.find({"deleted": {"$ne": True}, "driver_id": d["id"]}, {"_id": 0, "analysis.severity": 1}).to_list(500)
        total = len(inspections)
        con_danos = sum(1 for i in inspections if (i.get("analysis") or {}).get("severity") not in ["sin_danos", "sin_analisis", None])
        graves = sum(1 for i in inspections if (i.get("analysis") or {}).get("severity") in ["grave", "critico"])
        score = 100
        if total > 0:
            score -= int((con_danos / total) * 30) + int((graves / total) * 40)
        score = max(0, min(100, score))
        ranking.append({"driver_id": d["id"], "name": d.get("name", ""),
                        "center": d.get("center", ""), "score": score,
                        "total_inspections": total})
    ranking.sort(key=lambda x: -x["score"])
    return ranking


# =========================
# ASIGNACIÓN DIARIA DE FURGONETAS POR CENTRO
# =========================

@api_router.get("/assignments/daily")
async def get_daily_assignments(
    date: Optional[str] = None, center: Optional[str] = None, _=Depends(require_admin)
):
    """Obtiene las asignaciones del día para un centro."""
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    query = {"date": date}
    if center and center != "Todos":
        query["center"] = center
    docs = await db.daily_assignments.find(query, {"_id": 0}).to_list(100)
    # Enrich: check if each assigned vehicle has an inspection today
    for doc in docs:
        for slot in doc.get("slots", []):
            vid = slot.get("vehicle_id")
            if vid:
                insp = await db.inspections.find_one(
                    {"deleted": {"$ne": True}, "vehicle_id": vid, "created_at": {"$regex": f"^{date}"}},
                    {"_id": 0, "id": 1, "analysis": 1}
                )
                slot["has_inspection"] = insp is not None
                if insp:
                    slot["inspection_severity"] = (insp.get("analysis") or {}).get("severity")
    return docs


@api_router.put("/assignments/daily")
async def upsert_daily_assignment(request: Request, _=Depends(require_admin)):
    """Crea o actualiza la asignación diaria de un centro."""
    try:
        data = await request.json()
    except Exception as e:
        logger.error(f"Cuadrante: body inválido: {e}")
        raise HTTPException(status_code=400, detail="Body JSON inválido")

    date = data.get("date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    center = data.get("center")
    if not center:
        raise HTTPException(status_code=400, detail="Centro requerido")

    # Limpia los slots: guarda solo los campos núcleo (descarta has_inspection,
    # inspection_severity y cualquier campo calculado que venga del GET).
    raw_slots = data.get("slots", []) or []
    slots = []
    for s in raw_slots:
        if not isinstance(s, dict):
            continue
        slots.append({
            "vehicle_id": s.get("vehicle_id", ""),
            "vehicle_plate": s.get("vehicle_plate", ""),
            "driver_id": s.get("driver_id", "") or "",
            "driver_name": s.get("driver_name", "") or "",
        })

    now = datetime.now(timezone.utc).isoformat()
    try:
        existing = await db.daily_assignments.find_one(
            {"date": date, "center": center}, {"_id": 0}
        )
        if existing:
            await db.daily_assignments.update_one(
                {"date": date, "center": center},
                {"$set": {"slots": slots, "updated_at": now}}
            )
            return {"success": True, "action": "updated", "id": existing.get("id")}
        else:
            doc_id = str(uuid.uuid4())
            doc = {
                "id": doc_id, "date": date, "center": center,
                "slots": slots, "created_at": now, "updated_at": now
            }
            await db.daily_assignments.insert_one(doc)
            return {"success": True, "action": "created", "id": doc_id}
    except Exception as e:
        logger.error(f"Cuadrante: error guardando en BD: {e}")
        raise HTTPException(status_code=500, detail=f"Error BD: {str(e)}")


def _norm_plate(p):
    """Normaliza matrícula: quita espacios/guiones y pasa a mayúsculas."""
    return "".join(c for c in (p or "").upper() if c.isalnum())


def _norm_name_words(name):
    """Extrae palabras del nombre normalizadas (sin acentos, minúsculas)."""
    import unicodedata
    s = unicodedata.normalize("NFD", (name or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace(",", " ")
    return set(w for w in s.split() if len(w) > 1)


@api_router.post("/assignments/import-text")
async def import_roster_text(
    data: dict,
    _=Depends(require_admin),
):
    """Importa el roster pegado desde la plataforma de Amazon, EN CUALQUIER FORMATO.

    Estrategia en cascada:
      1. Gemini estructura el texto crudo en pares matricula->conductor (entiende
         cualquier orden de columnas, saltos raros y formatos cambiantes).
      2. Si Gemini no responde: deteccion automatica de columnas (busca la columna
         que parece matricula y la que parece nombre, sin posiciones fijas).
      3. Matching contra la BD insensible a acentos y con desempate por apellidos.
    """
    raw_text = data.get("text", "")
    date = data.get("date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    center = data.get("center", "OGA5")

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Texto vacío")
    raw_text = raw_text[:15000]  # límite de seguridad (textos más largos ralentizan a Gemini)

    PLATE_RE = re.compile(r'\b(\d{4})\s*-?\s*([A-Z]{3})\b', re.IGNORECASE)

    # 1) Intento con Gemini: entiende cualquier formato
    parsed = []
    parse_method = "gemini"
    try:
        from google import genai as genai_sdk
        from google.genai import types as genai_types

        use_vertex = os.environ.get("USE_VERTEX_AI", "").lower() in ("1", "true", "yes")
        if use_vertex:
            from google.oauth2 import service_account
            import json as _json
            import base64 as _b64
            sa_clean = os.environ.get("GCP_SERVICE_ACCOUNT_JSON", "").strip()
            if sa_clean and not sa_clean.startswith("{"):
                sa_clean = _b64.b64decode(sa_clean).decode("utf-8")
            credentials = service_account.Credentials.from_service_account_info(
                _json.loads(sa_clean), scopes=["https://www.googleapis.com/auth/cloud-platform"]
            ) if sa_clean else None
            client = genai_sdk.Client(
                vertexai=True, project=os.environ.get("GCP_PROJECT", ""),
                location=os.environ.get("GCP_LOCATION", "us-central1"), credentials=credentials
            )
        else:
            client = genai_sdk.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

        prompt = (
            "Este texto es un roster/cuadrante de reparto copiado de una plataforma "
            "(formato impredecible: columnas tabuladas, líneas sueltas, etc.). "
            "Extrae TODAS las parejas de matrícula española (4 dígitos + 3 letras) y "
            "nombre del conductor asignado a esa matrícula.\n"
            "Reglas:\n"
            "- Una pareja por matrícula. Si una matrícula no tiene conductor (vacío, 'SIN ASIGNAR', '-'), omítela.\n"
            "- El nombre puede venir como 'Apellidos, Nombre' o 'Nombre Apellidos' — devuélvelo tal cual aparece.\n"
            "- Ignora cabeceras, totales, horas, rutas y cualquier otra cosa.\n"
            "Responde SOLO este JSON sin markdown: "
            '{"pairs": [{"plate": "1234 ABC", "driver": "nombre tal cual"}]}\n\n'
            "TEXTO:\n" + raw_text
        )
        gen_config = genai_types.GenerateContentConfig(temperature=0.0, response_mime_type="application/json")
        loop = asyncio.get_running_loop()
        async with _gemini_sem:
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    _executor,
                    lambda: client.models.generate_content(
                        model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
                        contents=[prompt], config=gen_config
                    )
                ),
                timeout=20.0
            )
        gdata = json.loads(_strip_markdown_json(response.text or "{}"))
        for p in gdata.get("pairs", []):
            plate = (p.get("plate") or "").strip()
            drv = (p.get("driver") or "").strip()
            if PLATE_RE.search(plate.upper()) and drv and "sin asign" not in drv.lower():
                parsed.append({"plate": plate, "driver": drv})
    except Exception as _ge:
        logger.warning(f"Import roster: Gemini falló ({_ge}), usando detección automática")
        parsed = []

    # 2) Respaldo: detección automática de columnas (sin posiciones fijas)
    if not parsed:
        parse_method = "auto-columns"
        for line in raw_text.splitlines():
            cols = [c.strip() for c in re.split(r'\t|\s{3,}', line)]
            if len(cols) < 2:
                continue
            plate_val, plate_idx = None, None
            for idx, c in enumerate(cols):
                m = PLATE_RE.search(c.upper())
                if m:
                    plate_val = f"{m.group(1)} {m.group(2).upper()}"
                    plate_idx = idx
                    break
            if not plate_val:
                continue
            best_name, best_len = "", 0
            for idx, c in enumerate(cols):
                if idx == plate_idx:
                    continue
                letters = len(re.sub(r'[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]', '', c))
                if letters >= 6 and letters > best_len and not PLATE_RE.search(c.upper()):
                    if re.search(r'\d{2}/\d{2}|AMZL|^ETT', c, re.IGNORECASE):
                        continue
                    best_name, best_len = c, letters
            if best_name and "sin asign" not in best_name.lower():
                parsed.append({"plate": plate_val, "driver": best_name})

    if not parsed:
        raise HTTPException(status_code=400, detail="No se encontraron parejas matrícula+conductor en el texto. Copia la tabla completa del roster.")

    # 3) Matching contra la BD: insensible a acentos, desempate por apellidos
    import unicodedata as _ud

    def _fold(s):
        s = _ud.normalize("NFD", (s or "").lower())
        return "".join(c for c in s if _ud.category(c) != "Mn")

    def _norm_plate_local(p):
        return re.sub(r'[^A-Z0-9]', '', (p or "").upper())

    def _norm_words(name):
        return set(w for w in re.sub(r'[^a-z ]', ' ', _fold(name)).split() if len(w) > 1)

    vehicles = await db.vehicles.find(
        {"center": {"$regex": center[:4], "$options": "i"}, "status": {"$ne": "deleted"}},
        {"_id": 0}
    ).to_list(500)
    drivers = await db.drivers.find({"center": {"$regex": center[:4], "$options": "i"}}, {"_id": 0}).to_list(500)
    if len(drivers) < 3:
        drivers = await db.drivers.find({}, {"_id": 0}).to_list(500)

    vehicle_map = {_norm_plate_local(v.get("license_plate", "")): v for v in vehicles}
    driver_words = [(_d, _norm_words(_d.get("name", ""))) for _d in drivers]

    slots = []
    matched = 0
    unmatched_plate = []
    unmatched_driver = []
    ambiguous = []

    for row in parsed:
        pnorm = _norm_plate_local(row["plate"])
        veh = vehicle_map.get(pnorm)
        if not veh:
            unmatched_plate.append(row["plate"])
            continue
        words = _norm_words(row["driver"])
        scored = []
        for d, dw in driver_words:
            inter = words & dw
            if not inter:
                continue
            score = sum(2 if len(w) >= 5 else 1 for w in inter)
            scored.append((score, d))
        scored.sort(key=lambda x: -x[0])
        best = scored[0] if scored else None
        second = scored[1] if len(scored) > 1 else None

        ok = bool(best) and (best[0] >= 3 or (best[0] >= 2 and (not second or second[0] < best[0])))
        if ok and second and second[0] == best[0]:
            ok = False
            ambiguous.append(row["driver"])

        if ok:
            slots.append({
                "vehicle_id": veh.get("id"), "vehicle_plate": veh.get("license_plate"),
                "driver_id": best[1].get("id"), "driver_name": best[1].get("name"),
            })
            matched += 1
        else:
            slots.append({
                "vehicle_id": veh.get("id"), "vehicle_plate": veh.get("license_plate"),
                "driver_id": "", "driver_name": "",
            })
            if row["driver"] not in ambiguous:
                unmatched_driver.append(row["driver"])

    plates_in_roster = {_norm_plate_local(s["vehicle_plate"]) for s in slots}
    for v in vehicles:
        if v.get("status") in ("inactive", "deleted"):
            continue
        if _norm_plate_local(v.get("license_plate", "")) not in plates_in_roster:
            slots.append({
                "vehicle_id": v.get("id"), "vehicle_plate": v.get("license_plate"),
                "driver_id": "", "driver_name": "",
            })

    logger.info(f"Import roster ({parse_method}): {matched}/{len(parsed)} emparejados, "
                f"{len(unmatched_plate)} matriculas desconocidas, {len(unmatched_driver)} sin match")
    return {
        "date": date, "center": center, "slots": slots,
        "matched": matched, "total_roster": len(parsed),
        "parse_method": parse_method,
        "unmatched_plate": unmatched_plate, "unmatched_driver": unmatched_driver,
        "ambiguous": ambiguous,
    }


@api_router.post("/assignments/import-image")
async def import_roster_image(
    file: UploadFile = File(...),
    date: str = Form(None),
    center: str = Form(...),
    _=Depends(require_admin),
):
    """Lee una captura del roster de Amazon con Gemini Vision, extrae los pares
    matrícula↔conductor y los cruza con la BD para rellenar el cuadrante."""
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    img_bytes = await file.read()
    if not img_bytes:
        raise HTTPException(status_code=400, detail="Imagen vacía")

    # --- Gemini Vision: extraer roster ---
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    use_vertex = os.environ.get("USE_VERTEX_AI", "").lower() in ("1", "true", "yes")
    try:
        from google import genai as genai_sdk
        from google.genai import types as genai_types
        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        if use_vertex:
            vertex_project = os.environ.get("GCP_PROJECT", "")
            vertex_location = os.environ.get("GCP_LOCATION", "us-central1")
            sa_json = os.environ.get("GCP_SERVICE_ACCOUNT_JSON", "")
            if sa_json:
                from google.oauth2 import service_account
                import json as _json, base64 as _b64
                sa_clean = sa_json.strip()
                if not sa_clean.startswith("{"):
                    sa_clean = _b64.b64decode(sa_clean).decode("utf-8")
                creds_info = _json.loads(sa_clean)
                credentials = service_account.Credentials.from_service_account_info(
                    creds_info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
                )
                client = genai_sdk.Client(vertexai=True, project=vertex_project,
                                          location=vertex_location, credentials=credentials)
            else:
                client = genai_sdk.Client(vertexai=True, project=vertex_project, location=vertex_location)
        else:
            client = genai_sdk.Client(api_key=gemini_key)

        prompt = (
            "Esta es una captura de un roster diario de reparto de Amazon. "
            "Extrae TODAS las filas que tengan una matrícula de furgoneta y un nombre de conductor. "
            "Las matrículas españolas son 4 números + 3 letras (ej: '9883 NFX'). "
            "Los nombres vienen como 'Apellidos, Nombre' (ej: 'Botana Vilar, Victor Manuel'). "
            "Ignora filas con 'SIN ASIGN' o sin matrícula. "
            "Devuelve SOLO un JSON array, sin texto adicional, con este formato exacto: "
            '[{"plate":"9883 NFX","driver":"Botana Vilar, Victor Manuel"}, ...]'
        )
        # Detectar tipo MIME real para aceptar JPEG y PNG
        _img_mime = "image/png" if img_bytes[:4] == b'\x89PNG' else "image/jpeg"
        contents = [prompt, genai_types.Part.from_bytes(data=img_bytes, mime_type=_img_mime)]
        gen_config = genai_types.GenerateContentConfig(temperature=0.1, response_mime_type="application/json")
        import json as _json2
        import time as _time
        loop = asyncio.get_running_loop()

        # Reintentos con fallback de modelo si hay 429 RESOURCE_EXHAUSTED
        fallback_models = [model_name, "gemini-1.5-flash", "gemini-1.5-pro"]
        last_err = None
        response = None
        for _attempt_model in fallback_models:
            for _retry in range(3):
                try:
                    response = await asyncio.wait_for(
                        loop.run_in_executor(_executor, lambda m=_attempt_model: client.models.generate_content(
                            model=m, contents=contents, config=gen_config)),
                        timeout=90.0
                    )
                    last_err = None
                    break  # éxito
                except Exception as _e:
                    last_err = _e
                    err_str = str(_e).lower()
                    if "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str:
                        logger.warning(f"Cuadrante import: 429 en {_attempt_model} intento {_retry+1}, reintentando...")
                        await asyncio.sleep(3 * (_retry + 1))  # 3s, 6s, 9s
                    else:
                        break  # error no recuperable, probar siguiente modelo
            if response is not None:
                break
            logger.warning(f"Cuadrante import: modelo {_attempt_model} agotado, probando siguiente...")

        if response is None:
            raise last_err or Exception("Todos los modelos fallaron")

        raw = response.text.strip()
        # quitar fences markdown si los hubiera
        if raw.startswith("```"):
            raw = raw.split("```")[1].replace("json", "", 1).strip() if "```" in raw else raw
        parsed = _json2.loads(raw)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cuadrante import: error Gemini: {e}")
        raise HTTPException(status_code=500, detail=f"Error leyendo la imagen: {str(e)}")

    # --- Cruzar con vehículos y conductores de la BD ---
    # Usar regex igual que en el resto del API (coincidencia flexible de centros)
    vehicles = await db.vehicles.find(
        {"center": {"$regex": center, "$options": "i"}, "status": {"$ne": "deleted"}},
        {"_id": 0}
    ).to_list(500)
    drivers = await db.drivers.find({"center": {"$regex": center, "$options": "i"}}, {"_id": 0}).to_list(500)
    veh_by_plate = {_norm_plate(v.get("license_plate")): v for v in vehicles}
    driver_words = [(d, _norm_name_words(d.get("name"))) for d in drivers]

    slots = []
    matched, unmatched_plate, unmatched_driver = 0, [], []
    for row in parsed:
        plate = row.get("plate", "")
        dname = row.get("driver", "")
        np = _norm_plate(plate)
        veh = veh_by_plate.get(np)
        if not veh:
            unmatched_plate.append(plate)
            continue
        # match conductor por solapamiento de palabras
        words = _norm_name_words(dname)
        best, best_score = None, 0
        for d, dw in driver_words:
            score = len(words & dw)
            if score > best_score:
                best, best_score = d, score
        if best and best_score >= 2:
            slots.append({
                "vehicle_id": veh.get("id"), "vehicle_plate": veh.get("license_plate"),
                "driver_id": best.get("id"), "driver_name": best.get("name"),
            })
            matched += 1
        else:
            slots.append({
                "vehicle_id": veh.get("id"), "vehicle_plate": veh.get("license_plate"),
                "driver_id": "", "driver_name": "",
            })
            unmatched_driver.append(dname)

    # añadir furgonetas del centro que NO salían en el roster (en blanco)
    plates_in_roster = {_norm_plate(s["vehicle_plate"]) for s in slots}
    for v in vehicles:
        if v.get("status") in ("inactive", "deleted"):
            continue
        if _norm_plate(v.get("license_plate")) not in plates_in_roster:
            slots.append({
                "vehicle_id": v.get("id"), "vehicle_plate": v.get("license_plate"),
                "driver_id": "", "driver_name": "",
            })

    return {
        "date": date, "center": center, "slots": slots,
        "matched": matched, "total_roster": len(parsed),
        "unmatched_plate": unmatched_plate, "unmatched_driver": unmatched_driver,
    }


# =========================
# INFORME DE FLOTA (PDF para Amazon)
# =========================

@api_router.get("/reports/fleet-pdf")
async def fleet_report_pdf(_=Depends(require_admin)):
    """Genera un informe PDF del estado de la flota, listo para enviar al coordinador."""
    total_vehicles = await db.vehicles.count_documents({"status": {"$ne": "deleted"}})
    total_inspections = await db.inspections.count_documents({})
    alerts = await db.alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)

    # Desglose severidad
    sev_counts = {"leve": 0, "moderado": 0, "grave": 0, "critico": 0}
    total_cost = 0.0
    async for insp in db.inspections.find({"deleted": {"$ne": True}}, {"_id": 0, "analysis": 1}):
        a = insp.get("analysis") or {}
        sev = a.get("severity")
        if sev in sev_counts:
            sev_counts[sev] += 1
        total_cost += float(a.get("total_estimated_cost", 0) or 0)

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.units import cm

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    story = []
    story.append(Paragraph("<b>FlotaDSP - Informe de Estado de Flota</b>", styles["Title"]))
    story.append(Paragraph(datetime.now(timezone.utc).strftime("Generado: %d/%m/%Y"), styles["Normal"]))
    story.append(Spacer(1, 0.6*cm))

    resumen = [
        ["Metrica", "Valor"],
        ["Vehiculos totales", str(total_vehicles)],
        ["Inspecciones realizadas", str(total_inspections)],
        ["Danos leves", str(sev_counts["leve"])],
        ["Danos moderados", str(sev_counts["moderado"])],
        ["Danos graves", str(sev_counts["grave"])],
        ["Danos criticos", str(sev_counts["critico"])],
        ["Coste estimado total", f"{total_cost:.2f} EUR"],
    ]
    t = Table(resumen, colWidths=[8*cm, 8*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#EA580C")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.whitesmoke, colors.white]),
        ("GRID", (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("PADDING", (0,0), (-1,-1), 8),
    ]))
    story.append(t)
    doc.build(story)
    buf.seek(0)

    from fastapi.responses import StreamingResponse
    fname = "informe_flota_" + datetime.now(timezone.utc).strftime("%Y%m%d") + ".pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


# =============================================================
# REGISTRO DE ROUTERS — AL FINAL, tras definir todos los endpoints
# =============================================================

# =========================
# SUBIDA MASIVA POR CARPETAS (matrícula = nombre de carpeta)
# =========================

def _normalize_plate(p: str) -> str:
    """Quita espacios, guiones y pasa a mayúsculas para comparar matrículas."""
    return "".join(ch for ch in (p or "").upper() if ch.isalnum())


async def _process_single_inspection(vehicle_id, driver_id, photo_urls, photos_base64):
    """Procesa una inspección: referencia + Gemini + guardar + alerta Telegram.
    Devuelve (analysis, status). Reutilizada por subida individual y masiva."""
    # Fotos de referencia de la última inspección OK
    ref_results = await db.inspections.find(
        {"deleted": {"$ne": True}, "vehicle_id": vehicle_id, "analysis": {"$ne": None}, "analysis_status": "ok"},
        {"_id": 0, "photos": 1}
    ).sort("created_at", -1).to_list(1)
    last_insp = ref_results[0] if ref_results else None
    ref_photo_urls = last_insp.get("photos", [])[:4] if last_insp else []
    ref_bytes_list = await load_reference_images(ref_photo_urls) if ref_photo_urls else []

    analysis, analysis_status, analysis_error = await analyze_images_with_gemini(
        photos_base64, ref_bytes_list if ref_bytes_list else None
    )

    inspection = Inspection(
        vehicle_id=vehicle_id, driver_id=driver_id, photos=photo_urls,
        reference_photos=(ref_photo_urls[:2] if ref_photo_urls else []),
        analysis=analysis, analysis_status=analysis_status, analysis_error=analysis_error,
        notes="Subida masiva", analyzed_at=datetime.now(timezone.utc)
    )
    await db.inspections.insert_one(serialize_doc(inspection.model_dump()))

    # YOLO en background también para subidas masivas
    asyncio.create_task(_run_yolo_for_inspection(inspection.id, photo_urls))

    if analysis_status == "ok" and (
        analysis.severity in ["grave", "critico"] or analysis.critical_damages_count > 0
    ):
        vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
        plate = vehicle.get("license_plate") if vehicle else vehicle_id
        alert = Alert(
            vehicle_id=vehicle_id, inspection_id=inspection.id,
            title=f"Daños detectados en {plate}",
            description=analysis.executive_summary,
            severity="critical" if analysis.severity == "critico" else "high"
        )
        await db.alerts.insert_one(serialize_doc(alert.model_dump()))
        driver_name = "Sin asignar"
        did = driver_id or (vehicle.get("current_driver_id") if vehicle else None)
        if did:
            drv = await db.drivers.find_one({"id": did}, {"_id": 0, "name": 1})
            if drv:
                driver_name = drv.get("name", "Sin asignar")
        await send_telegram_damage_alert(
            plate=plate, driver_name=driver_name, analysis=analysis,
            photo_urls=photo_urls, inspection_id=inspection.id
        )
    return analysis, analysis_status


@api_router.post("/inspections/batch-upload")
async def batch_upload_inspections(
    plates: List[str] = Form(...),
    files: List[UploadFile] = File(...),
    file_plates: List[str] = Form(...),
    _=Depends(require_admin)
):
    """Subida masiva. Cada archivo viene con su matrícula (file_plates[i] corresponde a files[i]).
    Agrupa por matrícula, resuelve el vehículo y crea un peritaje por furgoneta."""
    if len(files) != len(file_plates):
        raise HTTPException(status_code=400, detail="Desajuste entre archivos y matrículas")

    # Agrupar archivos por matrícula normalizada
    grupos = {}
    for f, p in zip(files, file_plates):
        key = _normalize_plate(p)
        grupos.setdefault(key, {"raw": p, "files": []})["files"].append(f)

    # Mapa de vehículos: matrícula normalizada -> vehículo
    vehiculos = await db.vehicles.find({}, {"_id": 0, "id": 1, "license_plate": 1, "current_driver_id": 1}).to_list(5000)
    mapa = {_normalize_plate(v.get("license_plate", "")): v for v in vehiculos}

    resultados = []
    for key, grupo in grupos.items():
        raw_plate = grupo["raw"]
        vehiculo = mapa.get(key)
        if not vehiculo:
            resultados.append({"plate": raw_plate, "ok": False,
                               "error": "No existe ninguna furgoneta con esa matrícula"})
            continue
        try:
            photo_urls, photos_base64 = [], []
            for file in grupo["files"][:20]:
                content = await file.read()
                if not content:
                    continue
                validate_image_content(content)
                photo_url, processed = await process_and_save_image(content, vehiculo["id"])
                photo_urls.append(photo_url)
                photos_base64.append(base64.b64encode(processed).decode("utf-8"))
            if not photo_urls:
                resultados.append({"plate": raw_plate, "ok": False, "error": "Sin fotos válidas"})
                continue
            analysis, status = await _process_single_inspection(
                vehiculo["id"], vehiculo.get("current_driver_id"), photo_urls, photos_base64
            )
            resultados.append({
                "plate": raw_plate, "ok": status == "ok",
                "severity": analysis.severity if status == "ok" else None,
                "damages": analysis.total_damages_count if status == "ok" else 0,
                "photos": len(photo_urls),
                "error": None if status == "ok" else status
            })
        except Exception as e:
            logger.warning(f"Batch: error con {raw_plate}: {e}")
            resultados.append({"plate": raw_plate, "ok": False, "error": str(e)[:200]})

    ok_count = sum(1 for r in resultados if r["ok"])
    return {"success": True, "total_grupos": len(grupos), "procesados_ok": ok_count,
            "resultados": resultados}



# =========================
# BOLSAS, ACEITE Y KILOMETRAJE
# =========================

@api_router.post("/vehicles/{vehicle_id}/bags/set")
async def set_bags(vehicle_id: str, data: dict, _=Depends(require_admin)):
    """Fija el stock de bolsas de una furgoneta."""
    cantidad = int(data.get("bags", 0))
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Furgoneta no encontrada")
    entry = {"date": datetime.now(timezone.utc).isoformat(), "change": cantidad - v.get("bags_remaining", 0),
             "note": data.get("note", "Ajuste de stock"), "remaining_after": cantidad}
    await db.vehicles.update_one({"id": vehicle_id},
        {"$set": {"bags_remaining": cantidad, "updated_at": datetime.now(timezone.utc)},
         "$push": {"bags_history": entry}})
    return {"success": True, "bags_remaining": cantidad}


@api_router.post("/vehicles/{vehicle_id}/bags/consume")
async def consume_bags(vehicle_id: str, data: dict, _=Depends(require_admin)):
    """Descuenta bolsas gastadas y registra cuándo."""
    gastadas = int(data.get("used", 1))
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Furgoneta no encontrada")
    restantes = max(0, v.get("bags_remaining", 0) - gastadas)
    entry = {"date": datetime.now(timezone.utc).isoformat(), "change": -gastadas,
             "note": data.get("note", f"Gastadas {gastadas} bolsas"), "remaining_after": restantes}
    await db.vehicles.update_one({"id": vehicle_id},
        {"$set": {"bags_remaining": restantes, "updated_at": datetime.now(timezone.utc)},
         "$push": {"bags_history": entry}})
    # Aviso si quedan pocas
    if restantes <= 5:
        await db.alerts.insert_one(serialize_doc(Alert(
            vehicle_id=vehicle_id, inspection_id="",
            title=f"Quedan {restantes} bolsas en {v.get('license_plate','')}",
            description=f"Stock bajo de bolsas. Repón pronto.",
            severity="medium").model_dump()))
    return {"success": True, "bags_remaining": restantes}


@api_router.post("/vehicles/{vehicle_id}/oil/change")
async def register_oil_change(vehicle_id: str, data: dict, _=Depends(require_admin)):
    """Registra un cambio de aceite: km actuales + fecha + intervalo."""
    km = int(data.get("km", 0))
    fecha = data.get("date") or datetime.now(timezone.utc).date().isoformat()
    intervalo = int(data.get("interval_km", 15000))
    aviso_antes = int(data.get("warning_before_km", 2500))
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Furgoneta no encontrada")
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": {
        "oil_last_change_km": km, "oil_last_change_date": fecha,
        "oil_interval_km": intervalo, "oil_warning_before_km": aviso_antes,
        "mileage": max(km, v.get("mileage") or 0), "updated_at": datetime.now(timezone.utc)}})
    return {"success": True, "next_change_km": km + intervalo,
            "warning_at_km": km + intervalo - aviso_antes}


# Mantenimientos por km adicionales (mismo patrón que el aceite)
_MAINT_KINDS = {
    "ruedas": {"label": "Cambio de ruedas", "default_interval": 40000, "default_warning": 3000},
    "pastillas": {"label": "Pastillas de freno", "default_interval": 30000, "default_warning": 3000},
}


@api_router.post("/vehicles/{vehicle_id}/maintenance/{kind}/change")
async def register_maintenance_change(vehicle_id: str, kind: str, data: dict, _=Depends(require_admin)):
    """Registra un mantenimiento por km (ruedas, pastillas): igual que el aceite."""
    spec = _MAINT_KINDS.get(kind)
    if not spec:
        raise HTTPException(status_code=400, detail=f"Tipo desconocido. Válidos: {list(_MAINT_KINDS)}")
    km = int(data.get("km", 0))
    fecha = data.get("date") or datetime.now(timezone.utc).date().isoformat()
    intervalo = int(data.get("interval_km", spec["default_interval"]))
    aviso_antes = int(data.get("warning_before_km", spec["default_warning"]))
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Furgoneta no encontrada")
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": {
        f"{kind}_last_change_km": km, f"{kind}_last_change_date": fecha,
        f"{kind}_interval_km": intervalo, f"{kind}_warning_before_km": aviso_antes,
        "mileage": max(km, v.get("mileage") or 0), "updated_at": datetime.now(timezone.utc)}})
    return {"success": True, "kind": kind, "label": spec["label"],
            "next_change_km": km + intervalo, "warning_at_km": km + intervalo - aviso_antes}


@api_router.post("/drivers/{driver_id}/photo")
async def upload_driver_photo(driver_id: str, file: UploadFile = File(...), _=Depends(require_admin)):
    """Sube la foto/imagen de un conductor a R2 y la guarda en su ficha."""
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "id": 1})
    if not d:
        raise HTTPException(status_code=404, detail="Conductor no encontrado")
    content = await file.read()
    if not content or len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagen inválida o demasiado grande (máx 10 MB)")
    try:
        img = Image.open(io.BytesIO(content)).convert("RGB")
        img.thumbnail((600, 600))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        photo_bytes = buf.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")
    s3 = get_r2()
    if not s3:
        raise HTTPException(status_code=502, detail="Almacenamiento no configurado")
    key = f"drivers/{driver_id}_{uuid.uuid4().hex[:8]}.jpg"
    await asyncio.get_running_loop().run_in_executor(
        _executor,
        lambda: s3.put_object(Bucket=R2_BUCKET, Key=key, Body=photo_bytes, ContentType="image/jpeg")
    )
    url = f"{R2_PUBLIC_URL}/{key}"
    await db.drivers.update_one({"id": driver_id}, {"$set": {"photo_url": url}})
    return {"success": True, "photo_url": url}


# =========================
# STICKERS DE MERY — persistentes en servidor
# =========================

@api_router.get("/mery/stickers")
async def get_mery_stickers(_=Depends(require_admin)):
    doc = await db.app_meta.find_one({"_id": "mery_stickers"})
    return {"stickers": (doc or {}).get("data", {})}


@api_router.put("/mery/stickers")
async def set_mery_sticker(data: dict, _=Depends(require_admin)):
    key = (data.get("key") or "").strip()[:120].replace(".", "_").replace("$", "_")
    value = data.get("value")
    if not key:
        raise HTTPException(status_code=400, detail="key requerida")
    if value:
        await db.app_meta.update_one(
            {"_id": "mery_stickers"},
            {"$set": {f"data.{key}": str(value)[:120]}},
            upsert=True
        )
    else:
        await db.app_meta.update_one(
            {"_id": "mery_stickers"},
            {"$unset": {f"data.{key}": ""}}
        )
    return {"success": True}


@api_router.post("/inspections/validate-photo")
async def validate_inspection_photo(
    vehicle_id: str = Form(...),
    expected_zone: str = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(require_any_auth),
):
    """Valida UNA foto en el momento de capturarla: zona correcta, nitidez y matrícula.
    FAIL-OPEN: si la IA no responde, la foto se acepta (nunca bloquear por fallo técnico)."""
    ZONES = {
        "frontal": "el FRONTAL (morro, parabrisas, matrícula delantera)",
        "trasera": "la TRASERA (portón/puertas traseras, matrícula trasera)",
        "lateral_izq": "el LATERAL IZQUIERDO completo",
        "lateral_izquierdo": "el LATERAL IZQUIERDO completo",
        "lateral_der": "el LATERAL DERECHO completo",
        "lateral_derecho": "el LATERAL DERECHO completo",
    }
    zone_desc = ZONES.get(expected_zone.lower().strip())
    if not zone_desc:
        return {"valid": True, "checked": False, "reason": "zona desconocida — no validada"}

    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "license_plate": 1})
    real_plate = ((v or {}).get("license_plate") or "").replace(" ", "").replace("-", "").upper()

    try:
        content = await file.read()
        img = Image.open(io.BytesIO(content)).convert("RGB")
        img.thumbnail((1024, 1024))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=75)
        img_bytes = buf.getvalue()

        from google import genai as genai_sdk
        from google.genai import types as genai_types

        use_vertex = os.environ.get("USE_VERTEX_AI", "").lower() in ("1", "true", "yes")
        if use_vertex:
            from google.oauth2 import service_account
            import json as _json
            import base64 as _b64
            sa_clean = os.environ.get("GCP_SERVICE_ACCOUNT_JSON", "").strip()
            if sa_clean and not sa_clean.startswith("{"):
                sa_clean = _b64.b64decode(sa_clean).decode("utf-8")
            credentials = service_account.Credentials.from_service_account_info(
                _json.loads(sa_clean), scopes=["https://www.googleapis.com/auth/cloud-platform"]
            ) if sa_clean else None
            client = genai_sdk.Client(
                vertexai=True, project=os.environ.get("GCP_PROJECT", ""),
                location=os.environ.get("GCP_LOCATION", "us-central1"), credentials=credentials
            )
        else:
            client = genai_sdk.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

        prompt = (
            f"Foto de inspección de una furgoneta de reparto. Debe mostrar {zone_desc} del vehículo.\n"
            "Evalúa y responde SOLO este JSON sin markdown:\n"
            '{"zone_ok": <true si la foto muestra esa zona del vehículo>, '
            '"zone_seen": "<frontal|trasera|lateral_izquierdo|lateral_derecho|otra|no_es_vehiculo>", '
            '"too_blurry": <true SOLO si está tan borrosa/oscura que no permite inspeccionar daños>, '
            '"plate": "<matrícula legible en la foto o vacío>", '
            '"is_vehicle": <true si se ve una furgoneta/vehículo>}\n'
            "Sé tolerante con ángulos imperfectos: zone_ok=true si la zona pedida es claramente la protagonista."
        )
        contents = [prompt, genai_types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")]
        gen_config = genai_types.GenerateContentConfig(temperature=0.0, response_mime_type="application/json")
        loop = asyncio.get_running_loop()
        async with _gemini_sem:
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    _executor,
                    lambda: client.models.generate_content(
                        model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
                        contents=contents, config=gen_config
                    )
                ),
                timeout=25.0
            )
        data = json.loads(_strip_markdown_json(response.text or "{}"))

        if not data.get("is_vehicle", True):
            return {"valid": False, "checked": True, "reason": "En la foto no se ve ninguna furgoneta. Haz la foto al vehículo."}
        if data.get("too_blurry"):
            return {"valid": False, "checked": True, "reason": "La foto está demasiado borrosa u oscura. Repítela con más luz y el móvil quieto."}
        if not data.get("zone_ok", True):
            seen = data.get("zone_seen", "otra zona")
            return {"valid": False, "checked": True,
                    "reason": f"Esta casilla es para {zone_desc.split('(')[0].strip()}, pero la foto muestra: {seen}. Haz la foto de la zona correcta."}
        # Matrícula: solo exigible en frontal/trasera y solo si se lee alguna
        detected = (data.get("plate") or "").replace(" ", "").replace("-", "").upper()
        if detected and real_plate and detected != real_plate and expected_zone.lower() in ("frontal", "trasera"):
            return {"valid": False, "checked": True,
                    "reason": f"La matrícula de la foto ({data.get('plate')}) NO es la del vehículo seleccionado ({(v or {}).get('license_plate','')}). ¿Estás fotografiando la furgoneta correcta?"}
        return {"valid": True, "checked": True, "detected_plate": data.get("plate", "")}
    except Exception as e:
        logger.warning(f"validate-photo fail-open ({expected_zone}): {e}")
        return {"valid": True, "checked": False, "reason": "validación no disponible — foto aceptada"}


@api_router.post("/vehicles/{vehicle_id}/odometer-photo")
async def read_odometer_photo(vehicle_id: str, file: UploadFile = File(...), user: dict = Depends(require_any_auth)):
    """Lee los km del cuentakilómetros con Gemini a partir de una foto del salpicadero.
    Devuelve el número leído. NO actualiza el kilometraje — el cliente confirma después."""
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "license_plate": 1, "mileage": 1})
    if not v:
        raise HTTPException(status_code=404, detail="Furgoneta no encontrada")
    content = await file.read()
    if not content or len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagen inválida o demasiado grande")
    try:
        # Comprimir para acelerar
        img = Image.open(io.BytesIO(content)).convert("RGB")
        img.thumbnail((1280, 1280))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        img_bytes = buf.getvalue()

        from google import genai as genai_sdk
        from google.genai import types as genai_types

        use_vertex = os.environ.get("USE_VERTEX_AI", "").lower() in ("1", "true", "yes")
        if use_vertex:
            from google.oauth2 import service_account
            import json as _json
            import base64 as _b64
            sa_clean = os.environ.get("GCP_SERVICE_ACCOUNT_JSON", "").strip()
            if sa_clean and not sa_clean.startswith("{"):
                sa_clean = _b64.b64decode(sa_clean).decode("utf-8")
            credentials = service_account.Credentials.from_service_account_info(
                _json.loads(sa_clean), scopes=["https://www.googleapis.com/auth/cloud-platform"]
            ) if sa_clean else None
            client = genai_sdk.Client(
                vertexai=True, project=os.environ.get("GCP_PROJECT", ""),
                location=os.environ.get("GCP_LOCATION", "us-central1"), credentials=credentials
            )
        else:
            client = genai_sdk.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

        prompt = (
            "Esta es una foto del salpicadero/cuadro de instrumentos de una furgoneta. "
            "Lee el ODÓMETRO (kilometraje total acumulado, normalmente 5-6 dígitos, NO el parcial 'trip'). "
            "Responde SOLO este JSON sin markdown: "
            '{"km": <número entero o null si no es legible>, "confidence": <0.0-1.0>, "legible": <true|false>}'
        )
        contents = [prompt, genai_types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")]
        gen_config = genai_types.GenerateContentConfig(temperature=0.0, response_mime_type="application/json")
        loop = asyncio.get_running_loop()
        async with _gemini_sem:
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    _executor,
                    lambda: client.models.generate_content(
                        model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
                        contents=contents, config=gen_config
                    )
                ),
                timeout=45.0
            )
        raw = _strip_markdown_json(response.text or "")
        data = json.loads(raw)
        km_read = data.get("km")
        legible = bool(data.get("legible", False)) and km_read is not None
        current = v.get("mileage") or 0
        warning = None
        if legible and km_read is not None and current and km_read < current:
            warning = f"El km leído ({km_read:,}) es MENOR que el registrado ({current:,}). Revisa la foto."
        logger.info(f"Odómetro {v.get('license_plate','')}: leído={km_read} legible={legible}")
        return {
            "success": legible,
            "km": km_read,
            "confidence": float(data.get("confidence", 0)),
            "current_mileage": current,
            "warning": warning,
        }
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="La lectura tardó demasiado. Inténtalo de nuevo.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error leyendo odómetro: {e}")
        raise HTTPException(status_code=502, detail="No se pudo leer el cuentakilómetros. Introduce el km a mano.")


@api_router.post("/vehicles/{vehicle_id}/mileage")
async def update_mileage(vehicle_id: str, data: dict, user: dict = Depends(require_any_auth)):
    """Actualiza el kilometraje. Conductores solo su vehículo. Genera aviso de aceite si toca."""
    km = int(data.get("km", 0))
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Furgoneta no encontrada")
    if user["role"] == "driver" and v.get("current_driver_id") != user["sub"]:
        # Los conductores rotan por cuadrante diario: aceptar si HOY tiene
        # asignada esta furgoneta, o si acaba de inspeccionarla hoy.
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        assigned_today = await db.daily_assignments.find_one({
            "date": today,
            "slots": {"$elemMatch": {"driver_id": user["sub"], "vehicle_id": vehicle_id}}
        }, {"_id": 0, "id": 1})
        inspected_today = None
        if not assigned_today:
            inspected_today = await db.inspections.find_one({
                "vehicle_id": vehicle_id, "driver_id": user["sub"],
                "created_at": {"$regex": f"^{today}"}
            }, {"_id": 0, "id": 1})
        if not assigned_today and not inspected_today:
            raise HTTPException(status_code=403, detail="Solo tu vehículo asignado")
    # No permitir km menores que los actuales (salvo admin)
    if user["role"] != "admin" and km < (v.get("mileage") or 0):
        raise HTTPException(status_code=400, detail="Los km no pueden ser menores que los actuales")

    km_entry = {"date": datetime.now(timezone.utc).isoformat(), "km": km,
                "source": user.get("role", "?")}
    await db.vehicles.update_one({"id": vehicle_id},
        {"$set": {"mileage": km, "updated_at": datetime.now(timezone.utc)},
         "$push": {"mileage_history": km_entry}})

    # ¿Toca avisar de aceite?
    oil_km = v.get("oil_last_change_km")
    oil_alert = None
    if oil_km is not None:
        intervalo = v.get("oil_interval_km", 15000)
        aviso_antes = v.get("oil_warning_before_km", 2500)
        recorridos = km - oil_km
        restantes = intervalo - recorridos
        if restantes <= aviso_antes:
            if restantes <= 0:
                titulo = f"CAMBIO DE ACEITE VENCIDO en {v.get('license_plate','')}"
                desc = f"Se ha pasado {abs(restantes)} km del cambio de aceite."
                sev = "high"
            else:
                titulo = f"Cambio de aceite próximo en {v.get('license_plate','')}"
                desc = f"Quedan {restantes} km para el cambio de aceite (intervalo {intervalo} km)."
                sev = "medium"
            # Evitar duplicar el aviso si ya hay uno reciente sin leer
            existe = await db.alerts.find_one({"vehicle_id": vehicle_id, "title": titulo, "read": {"$ne": True}})
            if not existe:
                await db.alerts.insert_one(serialize_doc(Alert(
                    vehicle_id=vehicle_id, inspection_id="", title=titulo,
                    description=desc, severity=sev).model_dump()))
                oil_alert = {"remaining_km": restantes, "message": desc}
                # Notificar a Telegram también
                try:
                    config = await db.telegram_config.find_one({}, {"_id": 0})
                    if config and config.get("enabled") and config.get("bot_token"):
                        async with _aiohttp.ClientSession() as session:
                            for cid in config.get("chat_ids", []):
                                if cid.strip():
                                    await session.post(
                                        f"https://api.telegram.org/bot{config['bot_token']}/sendMessage",
                                        json={"chat_id": cid, "text": f"🛢️ <b>{titulo}</b>\n{desc}", "parse_mode": "HTML"},
                                        timeout=_aiohttp.ClientTimeout(total=8))
                except Exception as e:
                    logger.warning(f"Telegram aceite: {e}")

    # ¿Toca avisar de ruedas o pastillas? (mismo patrón que el aceite)
    for _mk, _mspec in (("ruedas", {"label": "CAMBIO DE RUEDAS", "emoji": "🛞", "interval": 40000, "warn": 3000}),
                        ("pastillas", {"label": "PASTILLAS DE FRENO", "emoji": "🛑", "interval": 30000, "warn": 3000})):
        last_km = v.get(f"{_mk}_last_change_km")
        if last_km is None:
            continue
        _interval = v.get(f"{_mk}_interval_km", _mspec["interval"])
        _warn = v.get(f"{_mk}_warning_before_km", _mspec["warn"])
        _rest = _interval - (km - last_km)
        if _rest <= _warn:
            if _rest <= 0:
                _tit = f"{_mspec['label']} VENCIDO en {v.get('license_plate','')}"
                _desc = f"Se ha pasado {abs(_rest)} km del cambio."
                _sev = "high"
            else:
                _tit = f"{_mspec['label'].capitalize()} próximo en {v.get('license_plate','')}"
                _desc = f"Quedan {_rest} km (intervalo {_interval} km)."
                _sev = "medium"
            _existe = await db.alerts.find_one({"vehicle_id": vehicle_id, "title": _tit, "read": {"$ne": True}})
            if not _existe:
                await db.alerts.insert_one(serialize_doc(Alert(
                    vehicle_id=vehicle_id, inspection_id="", title=_tit,
                    description=_desc, severity=_sev).model_dump()))
                try:
                    config = await db.telegram_config.find_one({}, {"_id": 0})
                    if config and config.get("enabled") and config.get("bot_token"):
                        async with _aiohttp.ClientSession() as session:
                            for cid in config.get("chat_ids", []):
                                if cid.strip():
                                    await session.post(
                                        f"https://api.telegram.org/bot{config['bot_token']}/sendMessage",
                                        json={"chat_id": cid, "text": f"{_mspec['emoji']} <b>{_tit}</b>\n{_desc}", "parse_mode": "HTML"},
                                        timeout=_aiohttp.ClientTimeout(total=8))
                except Exception as e:
                    logger.warning(f"Telegram {_mk}: {e}")

    return {"success": True, "mileage": km, "oil_alert": oil_alert}


@api_router.get("/alerts/itv")
async def get_itv_alerts(_=Depends(require_admin)):
    """Lista furgonetas con ITV próxima a caducar (30 días) o caducada."""
    from datetime import date as _date
    hoy = _date.today()
    vehicles = await db.vehicles.find({"status": {"$ne": "deleted"}}, {"_id": 0}).to_list(2000)
    result = []
    for v in vehicles:
        itv = v.get("itv_date")
        if not itv:
            continue
        try:
            y, m, d = [int(x) for x in itv.split("-")]
            fecha = _date(y, m, d)
        except Exception:
            continue
        dias = (fecha - hoy).days
        if dias <= 30:  # caducada o caduca en <=30 días
            result.append({
                "vehicle_id": v.get("id"), "license_plate": v.get("license_plate"),
                "brand": v.get("brand"), "model": v.get("model"), "center": v.get("center"),
                "itv_date": itv, "days_left": dias,
                "status": "caducada" if dias < 0 else ("urgente" if dias <= 7 else "proxima"),
            })
    result.sort(key=lambda x: x["days_left"])
    return result


@api_router.get("/alerts/renting")
async def get_renting_alerts(_=Depends(require_admin)):
    """Lista furgonetas con vencimiento de renting próximo (30 días) o vencido."""
    from datetime import date as _date
    hoy = _date.today()
    vehicles = await db.vehicles.find({"status": {"$ne": "deleted"}}, {"_id": 0}).to_list(2000)
    result = []
    for v in vehicles:
        rent = v.get("renting_end_date")
        if not rent:
            continue
        try:
            y, m, d = [int(x) for x in rent.split("-")]
            fecha = _date(y, m, d)
        except Exception:
            continue
        dias = (fecha - hoy).days
        if dias <= 30:
            result.append({
                "vehicle_id": v.get("id"), "license_plate": v.get("license_plate"),
                "brand": v.get("brand"), "model": v.get("model"), "center": v.get("center"),
                "provider": v.get("provider"), "renting_end_date": rent, "days_left": dias,
                "status": "vencido" if dias < 0 else ("urgente" if dias <= 7 else "proximo"),
            })
    result.sort(key=lambda x: x["days_left"])
    return result


@api_router.get("/vehicles/{vehicle_id}/history")
async def get_vehicle_history(vehicle_id: str, _=Depends(require_admin)):
    """Devuelve el histórico de km y bolsas de una furgoneta, listo para graficar."""
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Furgoneta no encontrada")
    # Historial de km (ordenado por fecha)
    mh = v.get("mileage_history", [])
    km_points = [{"date": e.get("date", "")[:10], "km": e.get("km", 0)} for e in mh if e.get("km")]
    # Historial de bolsas: reconstruir el valor restante tras cada movimiento
    bh = v.get("bags_history", [])
    bags_points = []
    for e in bh:
        bags_points.append({
            "date": e.get("date", "")[:10],
            "remaining": e.get("remaining_after", e.get("remaining", 0)),
            "change": e.get("change", 0),
        })
    return {
        "license_plate": v.get("license_plate"),
        "current_mileage": v.get("mileage"),
        "current_bags": v.get("bags_remaining", 0),
        "km_history": km_points,
        "bags_history": bags_points,
    }


@api_router.get("/vehicles/{vehicle_id}/maintenance")
async def get_maintenance_info(vehicle_id: str, _=Depends(require_admin)):
    """Devuelve info de bolsas y aceite de una furgoneta."""
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Furgoneta no encontrada")
    oil = None
    if v.get("oil_last_change_km") is not None:
        km_actual = v.get("mileage") or v.get("oil_last_change_km")
        recorridos = km_actual - v["oil_last_change_km"]
        restantes = v.get("oil_interval_km", 15000) - recorridos
        oil = {"last_change_km": v["oil_last_change_km"], "last_change_date": v.get("oil_last_change_date"),
               "interval_km": v.get("oil_interval_km", 15000), "km_until_change": restantes,
               "next_change_at_km": v["oil_last_change_km"] + v.get("oil_interval_km", 15000)}
    return {"bags_remaining": v.get("bags_remaining", 0),
            "bags_history": v.get("bags_history", [])[-10:],
            "provider": v.get("provider"), "mileage": v.get("mileage"), "oil": oil}



@api_router.post("/import/diagnose")
async def diagnose_excel(file: UploadFile = File(...), _=Depends(require_admin)):
    """DIAGNÓSTICO TEMPORAL: analiza el Excel y devuelve qué hay en cada columna clave."""
    content = await file.read()
    import openpyxl, unicodedata
    def _sa(t): return "".join(c for c in unicodedata.normalize("NFD",t) if unicodedata.category(c)!="Mn")

    out = {}
    # Probar AMBOS modos de carga
    for modo in ["data_only_true", "data_only_false"]:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=(modo=="data_only_true"))
        # Listar todas las hojas
        out["hojas"] = wb.sheetnames
        ws = wb.active
        out["hoja_activa"] = ws.title
        headers = [str(c.value).strip().lower() if c.value else "" for c in next(ws.iter_rows(min_row=1, max_row=1))]
        headers_norm = [_sa(h) for h in headers]
        # Índices de proveedor, matrícula, kilómetros
        def idx(name):
            k=_sa(name.lower())
            return headers_norm.index(k) if k in headers_norm else -1
        i_prov = idx("proveedor")
        i_mat = idx("matricula")
        # Leer las primeras 5 filas de datos, columna proveedor
        muestras = []
        cnt = 0
        for row in ws.iter_rows(min_row=2):
            if not any(c.value for c in row): continue
            if cnt >= 5: break
            mat = row[i_mat].value if i_mat>=0 else None
            prov_cell = row[i_prov] if i_prov>=0 else None
            muestras.append({
                "matricula": str(mat),
                "proveedor_valor": str(prov_cell.value) if prov_cell else "SIN_COLUMNA",
                "proveedor_tipo": type(prov_cell.value).__name__ if prov_cell else "N/A",
                "proveedor_data_type": prov_cell.data_type if prov_cell else "N/A"
            })
            cnt += 1
        out[modo] = {
            "indice_proveedor": i_prov,
            "indice_matricula": i_mat,
            "total_headers": len(headers),
            "muestras": muestras
        }
    return out



# =========================
# INFORME PDF DE PERITAJE
# =========================


async def _cargar_foto_bytes(foto):
    """Carga una foto (URL http o base64) y devuelve sus bytes."""
    import base64 as _b64, aiohttp as _aio
    if not foto:
        return None
    try:
        if foto.startswith("http"):
            async with _aio.ClientSession(headers={"User-Agent":"FlotaDSP/1.0"}) as ss:
                async with ss.get(foto, timeout=_aio.ClientTimeout(total=15)) as r:
                    if r.status == 200:
                        return await r.read()
        else:
            b64 = foto.split(",",1)[1] if foto.startswith("data:") else foto
            return _b64.b64decode(b64)
    except Exception as e:
        logger.warning(f"cargar_foto error: {e}")
    return None


def _damages_to_detections(damages: list) -> List[AIDetection]:
    """Maps stored analysis.damages → AIDetection using location_hint zone boxes.
    Shifts overlapping boxes in the same zone by a small offset for readability."""
    detections: List[AIDetection] = []
    zone_count: dict = {}
    for d in damages:
        if isinstance(d, dict):
            loc = d.get("location_hint", "otra") or "otra"
            label = d.get("part", "daño")
            severity = d.get("severity", "leve")
            conf = float(d.get("confidence", 0.7))
        else:
            loc = getattr(d, "location_hint", "otra") or "otra"
            label = getattr(d, "part", "daño")
            severity = getattr(d, "severity", "leve")
            conf = float(getattr(d, "confidence", 0.7))

        base = list(_LOCATION_BOX.get(loc, _LOCATION_BOX["otra"]))
        n = zone_count.get(loc, 0)
        zone_count[loc] = n + 1
        shift = n * 55
        box = [
            min(base[0] + shift,      900),
            min(base[1] + shift // 2, 900),
            min(base[2] + shift,      950),
            min(base[3] + shift // 2, 970),
        ]
        detections.append(AIDetection(
            label=label, severity=severity, box_2d=box,
            confidence=conf, source="location_hint",
        ))
    return detections


def _merge_yolo_with_gemini(
    yolo_detections: List[AIDetection],
    gemini_damages: list,
    photo_index: int = 0,
) -> List[AIDetection]:
    """
    Enhances YOLO detections with Gemini damage labels.

    YOLO gives precise bounding boxes but generic class names (Crack, Dent...).
    Gemini gives professional labels (Paragolpes delantero, Puerta del conductor...)
    with location_hint zones.

    Strategy: for each YOLO box, find the Gemini damage whose location_hint zone
    best overlaps with the box position, then replace the YOLO label with the
    Gemini professional label. Falls back to YOLO label if no match.
    """
    if not gemini_damages or not yolo_detections:
        return yolo_detections

    # Zone → normalized center x range (0-1000)
    _zone_x = {
        "frontal":           (0,   500),
        "trasera":           (500, 1000),
        "lateral_izquierdo": (0,   500),
        "lateral_derecho":   (500, 1000),
        "techo":             (200, 800),
        "otra":              (0,   1000),
    }
    # Zone → normalized center y range (0-1000)
    _zone_y = {
        "frontal":           (0,   1000),
        "trasera":           (0,   1000),
        "lateral_izquierdo": (200, 900),
        "lateral_derecho":   (200, 900),
        "techo":             (0,   400),
        "otra":              (0,   1000),
    }

    # Build list of Gemini damages with zone info — filter to photo zone hints
    # For photo_index: 0=frontal, 1=trasera, 2=lateral_izq, 3=lateral_der (heuristic)
    _photo_zone_hints = {
        0: ["frontal", "otra"],
        1: ["trasera", "otra"],
        2: ["lateral_izquierdo", "otra"],
        3: ["lateral_derecho", "otra"],
    }
    relevant_hints = _photo_zone_hints.get(photo_index, ["otra"])

    gemini_list = []
    for d in gemini_damages:
        if isinstance(d, dict):
            part = d.get("part", "")
            loc = d.get("location_hint", "otra") or "otra"
            sev = d.get("severity", "leve")
            desc = d.get("description", "")
        else:
            part = getattr(d, "part", "")
            loc = getattr(d, "location_hint", "otra") or "otra"
            sev = getattr(d, "severity", "leve")
            desc = getattr(d, "description", "")
        gemini_list.append({"part": part, "loc": loc, "sev": sev, "desc": desc, "used": False})

    merged = []
    for det in yolo_detections:
        box = det.box_2d  # [ymin, xmin, ymax, xmax] 0-1000
        cx = (box[1] + box[3]) / 2
        cy = (box[0] + box[2]) / 2

        best_idx = None
        best_score = -1
        for i, g in enumerate(gemini_list):
            if g["used"]:
                continue
            loc = g["loc"]
            xr = _zone_x.get(loc, (0, 1000))
            yr = _zone_y.get(loc, (0, 1000))
            # Score: how well the box center falls within this zone
            x_overlap = max(0, min(cx, xr[1]) - max(cx - 1, xr[0]))
            y_overlap = max(0, min(cy, yr[1]) - max(cy - 1, yr[0]))
            in_zone = (xr[0] <= cx <= xr[1]) and (yr[0] <= cy <= yr[1])
            zone_match = loc in relevant_hints
            score = (2 if in_zone else 0) + (1 if zone_match else 0)
            if score > best_score:
                best_score = score
                best_idx = i

        if best_idx is not None and best_score > 0:
            g = gemini_list[best_idx]
            g["used"] = True
            # Build professional label: "Parte — tipo daño"
            sev_label = {"leve": "leve", "moderado": "moderado",
                         "grave": "grave", "critico": "crítico"}.get(g["sev"], g["sev"])
            label = g["part"] if g["part"] else det.label
            merged.append(AIDetection(
                label=label,
                severity=g["sev"],
                box_2d=det.box_2d,
                confidence=det.confidence,
                source="yolo+gemini",
            ))
        else:
            merged.append(det)

    return merged


async def _run_yolo_for_inspection(inspection_id: str, photo_urls: List[str]) -> None:
    """Background task: runs YOLO detection on every photo of a new inspection
    and stores results in inspection_ai_results. Called after upload completes."""
    if not AI_SERVICE_URL:
        logger.info(f"AI service not configured — skipping YOLO for {inspection_id[:8]}")
        return
    for idx, url in enumerate(photo_urls):
        try:
            img_bytes = await _cargar_foto_bytes(url)
            if not img_bytes:
                continue
            detections = await _call_ai_service_detect(inspection_id, idx, img_bytes)
            if detections is None:
                continue
            # Enrich YOLO boxes with Gemini professional labels
            insp_doc = await db.inspections.find_one({"id": inspection_id}, {"_id": 0, "analysis": 1})
            gemini_damages = ((insp_doc or {}).get("analysis") or {}).get("damages", [])
            if gemini_damages:
                detections = _merge_yolo_with_gemini(detections, gemini_damages, idx)
            result = InspectionAIResult(
                inspection_id=inspection_id,
                photo_index=idx,
                detections=detections,
                source="yolo+gemini" if gemini_damages else "yolo",
                updated_at=datetime.now(timezone.utc),
            )
            await db.inspection_ai_results.update_one(
                {"inspection_id": inspection_id, "photo_index": idx},
                {"$set": serialize_doc(result.model_dump())},
                upsert=True,
            )
            logger.info(f"YOLO auto-detect: insp={inspection_id[:8]} photo={idx} → {len(detections)} detecciones")
        except Exception as e:
            logger.warning(f"YOLO auto-detect error insp={inspection_id[:8]} photo={idx}: {e}")


async def _call_ai_service_detect(
    inspection_id: str, photo_index: int, img_bytes: bytes
) -> Optional[List[AIDetection]]:
    """Calls the external GPU microservice (YOLO11+SAM2). Returns None if unavailable."""
    if not AI_SERVICE_URL:
        return None
    try:
        import aiohttp as _aio
        payload = {
            "inspection_id": inspection_id,
            "photo_index": photo_index,
            "image_b64": base64.b64encode(img_bytes).decode(),
        }
        async with _aio.ClientSession() as session:
            async with session.post(
                f"{AI_SERVICE_URL}/detect",
                json=payload,
                timeout=_aio.ClientTimeout(total=30),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return [AIDetection(**det) for det in data.get("detections", [])]
                logger.warning(f"AI service HTTP {resp.status}")
                return None
    except Exception as e:
        logger.warning(f"AI service unavailable: {e}")
        return None


@api_router.post("/ai/detect/{inspection_id}")
async def ai_detect_inspection(
    inspection_id: str, photo_index: int = 0, _=Depends(require_admin)
):
    """Runs AI detection on an inspection photo.
    Uses the GPU microservice (YOLO11+SAM2) if AI_SERVICE_URL is set,
    otherwise falls back to deterministic location_hint mapping from stored analysis."""
    insp = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    photos = insp.get("photos", [])
    if not photos or photo_index >= len(photos):
        raise HTTPException(status_code=400, detail="Foto no encontrada")

    img_bytes = await _cargar_foto_bytes(photos[photo_index])
    if not img_bytes:
        raise HTTPException(status_code=400, detail="No se pudo cargar la foto")

    detections = await _call_ai_service_detect(inspection_id, photo_index, img_bytes)
    source = "yolo"
    gemini_damages = (insp.get("analysis") or {}).get("damages", [])
    if detections is None:
        detections = _damages_to_detections(gemini_damages)
        source = "location_hint"
    elif gemini_damages:
        # Enrich YOLO boxes with Gemini professional labels
        detections = _merge_yolo_with_gemini(detections, gemini_damages, photo_index)
        source = "yolo+gemini"

    result = InspectionAIResult(
        inspection_id=inspection_id,
        photo_index=photo_index,
        detections=detections,
        source=source,
        updated_at=datetime.now(timezone.utc),
    )
    await db.inspection_ai_results.update_one(
        {"inspection_id": inspection_id, "photo_index": photo_index},
        {"$set": serialize_doc(result.model_dump())},
        upsert=True,
    )
    return {
        "inspection_id": inspection_id,
        "photo_index": photo_index,
        "count": len(detections),
        "source": source,
        "detections": [d.model_dump() for d in detections],
    }


@api_router.get("/ai/status/{inspection_id}")
async def ai_detection_status(inspection_id: str, _=Depends(require_admin)):
    """Returns stored AI detection results for all photos of an inspection."""
    results = await db.inspection_ai_results.find(
        {"inspection_id": inspection_id}, {"_id": 0}
    ).sort("photo_index", 1).to_list(20)
    return {
        "inspection_id": inspection_id,
        "photos_processed": len(results),
        "ai_service_configured": bool(AI_SERVICE_URL),
        "detection_mode": "yolo11+sam2" if AI_SERVICE_URL else "location_hint",
        "results": results,
    }


async def _detectar_cajas_danos(img_bytes):
    """Pide a Gemini las cajas de daños sobre una foto. Devuelve lista [{label, box_2d, severity}]."""
    try:
        from google import genai as genai_sdk
        from google.genai import types as genai_types
        use_vertex = os.environ.get("USE_VERTEX_AI","").lower() in ("1","true","yes")
        model_name = os.environ.get("GEMINI_MODEL","gemini-2.5-flash")
        if use_vertex:
            from google.oauth2 import service_account
            import json as _json, base64 as _b64c
            sa_clean = os.environ.get("GCP_SERVICE_ACCOUNT_JSON","").strip()
            if sa_clean and not sa_clean.startswith("{"):
                try:
                    sa_clean = _b64c.b64decode(sa_clean).decode("utf-8")
                except Exception:
                    pass
            creds = service_account.Credentials.from_service_account_info(_json.loads(sa_clean), scopes=["https://www.googleapis.com/auth/cloud-platform"])
            client = genai_sdk.Client(vertexai=True, project=os.environ.get("GCP_PROJECT",""), location=os.environ.get("GCP_LOCATION","us-central1"), credentials=creds)
        else:
            client = genai_sdk.Client(api_key=os.environ.get("GEMINI_API_KEY",""))
        prompt = (
            "Detecta los daños visibles en la carrocería de esta furgoneta (golpes, arañazos, "
            "abolladuras, roturas, piezas rotas). Devuelve SOLO un JSON array, sin markdown. "
            'Cada elemento: {"label": "descripción corta", "severity": "leve|moderado|grave|critico", "box_2d": [ymin, xmin, ymax, xmax]}. '
            "box_2d normalizado de 0 a 1000 (0=arriba/izquierda). Si no hay daños, []. SOLO el JSON."
        )
        # Prompt PRIMERO, imagen después (como la función de análisis que funciona)
        contents = [prompt, genai_types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")]
        cfg = genai_types.GenerateContentConfig(temperature=0.1, max_output_tokens=4096)
        loop = asyncio.get_running_loop()
        resp = await asyncio.wait_for(loop.run_in_executor(_executor, lambda: client.models.generate_content(model=model_name, contents=contents, config=cfg)), timeout=60.0)
        import json as _json2, re as _re2
        # Extraer texto de forma defensiva (resp.text puede venir vacío en Vertex)
        raw = ""
        try:
            raw = (resp.text or "").strip()
        except Exception:
            raw = ""
        if not raw:
            try:
                for cand in (resp.candidates or []):
                    for part in (cand.content.parts or []):
                        if getattr(part, "text", None):
                            raw += part.text
                raw = raw.strip()
            except Exception:
                pass
        logger.info(f"detectar_cajas raw (len={len(raw)}): {raw[:150]}")
        globals()["_ultimo_raw_gemini"] = f"len={len(raw)} | {raw[:200]}"
        # Extraer el array JSON [...] esté donde esté (dentro de markdown o no)
        m = _re2.search(r"\[.*\]", raw, _re2.DOTALL)
        json_str = m.group(0) if m else "[]"
        try:
            data = _json2.loads(json_str)
        except Exception as _je:
            logger.error(f"detectar_cajas parseo falló: {_je} | json_str={json_str[:100]}")
            data = []
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.error(f"detectar_cajas error: {type(e).__name__}: {e}")
        return []


def _dibujar_numeros(img_bytes, boxes, start_num=0):
    """Dibuja daños con relleno semitransparente + etiqueta flotante estilo IA.
    Estilo: área de daño coloreada semitransparente, esquinas reticle, badge numerado
    y etiqueta oscura flotante con tipo de daño, severidad y confianza.
    start_num: offset de numeración para que el grid multi-foto numere de forma
    continua (foto 1: 1,2,3 · foto 2: 4,5,6...) y coincida 1:1 con la leyenda."""
    from PIL import Image, ImageDraw, ImageFont
    import io as _io

    img = Image.open(_io.BytesIO(img_bytes)).convert("RGBA")
    W, H = img.size

    # Overlay for semitransparent fills (painted once, alpha-composited)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    drw = ImageDraw.Draw(overlay)

    # Font setup
    fsize_badge = max(18, W // 36)
    fsize_label = max(13, W // 54)
    _font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    _font_reg_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]
    def _load_font(paths, size):
        for p in paths:
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
        return ImageFont.load_default()

    font_badge = _load_font(_font_paths, fsize_badge)
    font_label = _load_font(_font_reg_paths, fsize_label)

    # Severity → (R, G, B)
    _SEV_RGB = {
        "critico":  (220, 38,  38),
        "grave":    (234, 179,  8),
        "moderado": (249, 115, 22),
        "leve":     (34,  197, 94),
    }
    _SEV_ES = {
        "critico": "Crítico", "grave": "Grave",
        "moderado": "Moderado", "leve": "Leve",
    }

    # ── Pass 1: draw fills & borders onto overlay ─────────────────
    for b in boxes:
        box = b.get("box_2d") or b.get("box") or []
        if len(box) != 4:
            continue
        ymin, xmin, ymax, xmax = box
        x1 = int(xmin / 1000 * W); y1 = int(ymin / 1000 * H)
        x2 = int(xmax / 1000 * W); y2 = int(ymax / 1000 * H)
        sev = b.get("severity", "moderado")
        rgb = _SEV_RGB.get(sev, (249, 115, 22))
        r, g, b_c = rgb

        # Semitransparent fill
        drw.rectangle([x1, y1, x2, y2], fill=(r, g, b_c, 48))

        # Solid border
        bw = max(2, W // 280)
        drw.rectangle([x1, y1, x2, y2], outline=(r, g, b_c, 210), width=bw)

        # Corner reticle lines (targeting style)
        cl = max(10, min(28, (x2 - x1) // 5, (y2 - y1) // 5))
        lw = max(2, W // 220)
        for sx, sy, dx, dy in [
            (x1, y1,  1,  1), (x2, y1, -1,  1),
            (x1, y2,  1, -1), (x2, y2, -1, -1),
        ]:
            drw.line([(sx, sy + dy * cl), (sx, sy), (sx + dx * cl, sy)],
                     fill=(r, g, b_c, 255), width=lw + 1)

        # Badge circle (top-left of box)
        br = fsize_badge
        bx = max(0, x1 - br // 2)
        by = max(0, y1 - br)
        drw.ellipse([bx, by, bx + br * 2, by + br * 2], fill=(r, g, b_c, 230),
                    outline=(255, 255, 255, 160), width=max(1, bw - 1))

        # Label background
        label_text = b.get("label", "Daño")
        sev_str = _SEV_ES.get(sev, sev.capitalize())
        conf = b.get("confidence")
        conf_str = f"  {int(float(conf) * 100)}%" if conf is not None else ""
        full_label = f"{label_text}   {sev_str}{conf_str}"

        try:
            tb = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), full_label, font=font_label)
            tw, th = tb[2] - tb[0], tb[3] - tb[1]
        except Exception:
            tw, th = int(len(full_label) * fsize_label * 0.6), fsize_label + 4

        pad = 7
        lbl_w = tw + pad * 2
        lbl_h = th + pad * 2
        lbl_x = max(0, min(x1, W - lbl_w))
        lbl_y = y2 + 5 if y2 + lbl_h + 5 < H else max(0, y1 - lbl_h - 5)

        # Dark rounded pill background
        drw.rounded_rectangle(
            [lbl_x, lbl_y, lbl_x + lbl_w, lbl_y + lbl_h],
            radius=5, fill=(10, 10, 18, 195), outline=(r, g, b_c, 120), width=1,
        )

    # Composite overlay over image
    merged = Image.alpha_composite(img, overlay).convert("RGB")
    draw_text = ImageDraw.Draw(merged)

    # ── Pass 2: draw text ─────────────────────────────────────────
    n = start_num
    for b in boxes:
        box = b.get("box_2d") or b.get("box") or []
        if len(box) != 4:
            continue
        n += 1
        ymin, xmin, ymax, xmax = box
        x1 = int(xmin / 1000 * W); y1 = int(ymin / 1000 * H)
        x2 = int(xmax / 1000 * W); y2 = int(ymax / 1000 * H)
        sev = b.get("severity", "moderado")
        rgb = _SEV_RGB.get(sev, (249, 115, 22))
        r, g, b_c = rgb

        # Badge number
        br = fsize_badge
        bx = max(0, x1 - br // 2)
        by = max(0, y1 - br)
        num = str(n)
        try:
            nb = draw_text.textbbox((0, 0), num, font=font_badge)
            nw, nh = nb[2] - nb[0], nb[3] - nb[1]
        except Exception:
            nw, nh = br, br
        draw_text.text(
            (bx + br - nw // 2, by + br - nh // 2),
            num, fill=(255, 255, 255), font=font_badge,
        )

        # Label text
        label_text = b.get("label", "Daño")
        sev_str = _SEV_ES.get(sev, sev.capitalize())
        conf = b.get("confidence")
        conf_str = f"  {int(float(conf) * 100)}%" if conf is not None else ""
        full_label = f"{label_text}   {sev_str}{conf_str}"

        try:
            tb = draw_text.textbbox((0, 0), full_label, font=font_label)
            tw, th = tb[2] - tb[0], tb[3] - tb[1]
        except Exception:
            tw, th = int(len(full_label) * fsize_label * 0.6), fsize_label + 4

        pad = 7
        lbl_w = tw + pad * 2
        lbl_h = th + pad * 2
        lbl_x = max(0, min(x1, W - lbl_w))
        lbl_y = y2 + 5 if y2 + lbl_h + 5 < H else max(0, y1 - lbl_h - 5)

        draw_text.text((lbl_x + pad, lbl_y + pad), full_label,
                       fill=(255, 255, 255), font=font_label)

    out = _io.BytesIO()
    merged.save(out, format="JPEG", quality=88)
    return out.getvalue(), n




@api_router.get("/inspections/{inspection_id}/annotated")
async def inspection_annotated(inspection_id: str, photo_index: int = 0, _=Depends(require_admin)):
    """Returns a collage of ALL inspection photos with numbered damage boxes.
    When photo_index=0 (default), returns all photos in a 2-column grid.
    When photo_index>0, returns that specific photo only (backward compat).
    Priority: stored YOLO+Gemini detections → location_hint → legacy Gemini
    """
    from fastapi.responses import Response
    import json as _json
    from PIL import Image as _PILImage
    import io as _io

    insp = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    photos = insp.get("photos", [])
    if not photos:
        raise HTTPException(status_code=400, detail="Sin fotos en esta inspección")

    # If specific photo requested (not default), return just that one
    single_mode = photo_index > 0
    photo_indices = [photo_index] if single_mode else list(range(len(photos)))

    async def _get_annotated_bytes(idx, start_num=0):
        if idx >= len(photos):
            return None, []
        img_bytes = await _cargar_foto_bytes(photos[idx])
        if not img_bytes:
            return None, []
        boxes = []
        ai_result = await db.inspection_ai_results.find_one(
            {"inspection_id": inspection_id, "photo_index": idx}, {"_id": 0}
        )
        if ai_result and ai_result.get("detections"):
            for det in ai_result["detections"]:
                if len(det.get("box_2d", [])) == 4:
                    boxes.append(det)
        if not boxes:
            damages = (insp.get("analysis") or {}).get("damages", [])
            if damages:
                for det in _damages_to_detections(damages):
                    boxes.append({"label": det.label, "severity": det.severity, "box_2d": det.box_2d})
        if not boxes:
            boxes = await _detectar_cajas_danos(img_bytes)
        annotated_bytes, _ = _dibujar_numeros(img_bytes, boxes, start_num=start_num)
        return annotated_bytes, boxes

    all_leyenda = []
    box_counter = 0

    if single_mode:
        annotated, boxes = await _get_annotated_bytes(photo_index, start_num=0)
        if not annotated:
            raise HTTPException(status_code=400, detail="No se pudo cargar la foto")
        for b in boxes:
            if len((b.get("box_2d") or b.get("box") or [])) == 4:
                box_counter += 1
                all_leyenda.append({"n": box_counter, "label": b.get("label",""), "severity": b.get("severity",""), "confidence": b.get("confidence")})
        final_bytes = annotated
    else:
        # Build collage: 2 columns grid
        annotated_images = []
        zone_labels = ["Frontal", "Trasera", "Lateral izq.", "Lateral der."]
        for idx in photo_indices:
            # start_num = nº de daños ya contados → numeración continua que
            # coincide 1:1 con la leyenda (foto 1: 1,2,3 · foto 2: 4,5...).
            ann_bytes, boxes = await _get_annotated_bytes(idx, start_num=box_counter)
            if ann_bytes:
                annotated_images.append((ann_bytes, boxes, idx))
                for b in boxes:
                    if len((b.get("box_2d") or b.get("box") or [])) == 4:
                        box_counter += 1
                        label = b.get("label","")
                        zone = zone_labels[idx] if idx < len(zone_labels) else f"Foto {idx+1}"
                        all_leyenda.append({"n": box_counter, "label": f"[{zone}] {label}", "severity": b.get("severity",""), "confidence": b.get("confidence")})

        if not annotated_images:
            raise HTTPException(status_code=400, detail="No se pudieron cargar las fotos")

        # Compose 2-column grid
        pil_imgs = []
        for ann_bytes, _, _ in annotated_images:
            pil_imgs.append(_PILImage.open(_io.BytesIO(ann_bytes)).convert("RGB"))

        cols = 2
        rows = (len(pil_imgs) + 1) // 2
        cell_w = max(img.width for img in pil_imgs)
        cell_h = max(img.height for img in pil_imgs)
        # Scale to reasonable size
        max_cell = 800
        if cell_w > max_cell:
            scale = max_cell / cell_w
            cell_w = int(cell_w * scale)
            cell_h = int(cell_h * scale)
        grid = _PILImage.new("RGB", (cell_w * cols, cell_h * rows), (20, 20, 20))
        for i, img in enumerate(pil_imgs):
            img_resized = img.resize((cell_w, cell_h), _PILImage.LANCZOS)
            col = i % cols
            row = i // cols
            grid.paste(img_resized, (col * cell_w, row * cell_h))

        buf = _io.BytesIO()
        grid.save(buf, format="JPEG", quality=82)
        final_bytes = buf.getvalue()

    # v5.1: enriquecer la leyenda con damage_index para que el frontend pueda
    # mapear cada zona numerada a su daño correspondiente en analysis.damages.
    # Estrategia: matchear por label (case-insensitive). Si el label viene como
    # "[Frontal] Paragolpes delantero", quitar el prefijo de zona antes de matchear.
    try:
        analysis_damages = (insp.get("analysis") or {}).get("damages", []) or []
        label_to_idx: dict = {}
        for di, dmg in enumerate(analysis_damages):
            if isinstance(dmg, dict):
                key = (dmg.get("part") or "").lower().strip()
                if key and key not in label_to_idx:
                    label_to_idx[key] = di
        for item in all_leyenda:
            raw_label = item.get("label", "")
            clean = raw_label
            if "] " in clean:
                clean = clean.split("] ", 1)[1]
            item["damage_index"] = label_to_idx.get(clean.lower().strip())
    except Exception as _e:
        logger.warning(f"No se pudo enriquecer leyenda con damage_index: {_e}")

    return Response(
        content=final_bytes, media_type="image/jpeg",
        headers={
            "X-Boxes-Found": str(box_counter),
            "X-Detection-Source": "yolo+gemini",
            "X-Img-Bytes": str(len(final_bytes)),
            "X-Legend": base64.b64encode(_json.dumps(all_leyenda, ensure_ascii=False).encode()).decode(),
        },
    )

    boxes = []
    detection_source = "none"

    # 1. Stored AI detections (YOLO or location_hint from previous /ai/detect call)
    ai_result = await db.inspection_ai_results.find_one(
        {"inspection_id": inspection_id, "photo_index": photo_index}, {"_id": 0}
    )
    if ai_result and ai_result.get("detections"):
        for det in ai_result["detections"]:
            if len(det.get("box_2d", [])) == 4:
                boxes.append(det)
        detection_source = ai_result.get("source", "stored")

    # 2. location_hint fallback from stored analysis.damages
    if not boxes:
        damages = (insp.get("analysis") or {}).get("damages", [])
        if damages:
            detections = _damages_to_detections(damages)
            for det in detections:
                boxes.append({
                    "label": det.label, "severity": det.severity,
                    "box_2d": det.box_2d,
                })
            detection_source = "location_hint"

    # 3. Legacy Gemini call — only when absolutely no damage data available
    if not boxes:
        boxes = await _detectar_cajas_danos(img_bytes)
        detection_source = "gemini_legacy"

    annotated, n = _dibujar_numeros(img_bytes, boxes)
    leyenda = []
    idx = 0
    for b in boxes:
        if len((b.get("box_2d") or b.get("box") or [])) == 4:
            idx += 1
            leyenda.append({"n": idx, "label": b.get("label", ""), "severity": b.get("severity", "")})

    return Response(
        content=annotated, media_type="image/jpeg",
        headers={
            "X-Boxes-Found": str(n),
            "X-Detection-Source": detection_source,
            "X-Img-Bytes": str(len(img_bytes)),
            "X-Legend": base64.b64encode(_json.dumps(leyenda, ensure_ascii=False).encode()).decode(),
        },
    )


@api_router.get("/inspections/{inspection_id}/pdf")
async def inspection_pdf(inspection_id: str, boxes: int = 0, _=Depends(require_admin)):
    """Genera un PDF profesional del peritaje de una inspección."""
    from fastapi.responses import Response
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.utils import ImageReader
    import io as _io

    insp = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    vehicle = await db.vehicles.find_one({"id": insp.get("vehicle_id")}, {"_id": 0}) or {}
    plate = vehicle.get("license_plate", insp.get("vehicle_id", "?"))
    driver_name = "Sin asignar"
    did = insp.get("driver_id")
    if did:
        drv = await db.drivers.find_one({"id": did}, {"_id": 0, "name": 1})
        if drv:
            driver_name = drv.get("name", "Sin asignar")

    a = insp.get("analysis") or {}
    severity = a.get("severity", "sin_danos")
    damages = a.get("damages", [])
    total_cost = a.get("total_estimated_cost", 0)
    summary = a.get("executive_summary", "")
    detected_plate = a.get("detected_plate", "")
    fecha = str(insp.get("created_at", ""))[:10]

    # Descargar fotos (máx 4)
    raw_photos = insp.get("photos", [])[:4]
    photo_bytes = []
    import base64 as _b64
    import aiohttp as _aio
    _diag = []
    async with _aio.ClientSession(headers={"User-Agent": "FlotaDSP-PDF/1.0"}) as _sess:
        for p in raw_photos:
            try:
                if not p:
                    continue
                if p.startswith("http"):
                    async with _sess.get(p, timeout=_aio.ClientTimeout(total=15)) as _r:
                        if _r.status == 200:
                            _data = await _r.read()
                            photo_bytes.append(_data)
                            _diag.append(f"url:200:{len(_data)}b")
                        else:
                            _diag.append(f"url:{_r.status}")
                elif p.startswith("/uploads/"):
                    _fp = ROOT_DIR / p.lstrip("/")
                    if _fp.exists():
                        photo_bytes.append(_fp.read_bytes())
                        _diag.append("local:ok")
                    else:
                        _diag.append("local:missing")
                else:
                    b64str = p.split(",", 1)[1] if p.startswith("data:") else p
                    photo_bytes.append(_b64.b64decode(b64str))
                    _diag.append("b64:ok")
            except Exception as _pe:
                _diag.append(f"err:{str(_pe)[:40]}")
    logger.info(f"PDF-DIAG inspeccion={inspection_id[:8]} fotos_entrada={len(raw_photos)} bytes_listos={len(photo_bytes)} detalle={_diag}")

    # Colores por severidad
    sev_colors = {
        "critico": colors.HexColor("#A32D2D"), "grave": colors.HexColor("#BA7517"),
        "moderado": colors.HexColor("#BA7517"), "leve": colors.HexColor("#639922"),
        "sin_danos": colors.HexColor("#639922"),
    }
    sev_color = sev_colors.get(severity, colors.HexColor("#5F5E5A"))

    buf = _io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4

    # --- Cabecera ---
    c.setFillColor(colors.HexColor("#15181d"))
    c.rect(0, H-28*mm, W, 28*mm, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#ff6b1a"))
    c.roundRect(15*mm, H-22*mm, 10*mm, 10*mm, 2*mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(28*mm, H-18*mm, "FlotaDSP")
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#9aa0aa"))
    c.drawRightString(W-15*mm, H-16*mm, "Informe de peritaje IA")

    y = H - 38*mm
    # --- Datos vehículo ---
    c.setFillColor(colors.HexColor("#15181d"))
    c.setFont("Helvetica-Bold", 20)
    c.drawString(15*mm, y, plate)
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#666666"))
    c.drawString(15*mm, y-6*mm, f"{vehicle.get('brand','')} {vehicle.get('model','')} - {vehicle.get('center','')}")
    c.drawRightString(W-15*mm, y, f"Fecha: {fecha}")
    c.drawRightString(W-15*mm, y-6*mm, f"Conductor: {driver_name}")

    y -= 16*mm
    # --- Resumen (3 cajas) ---
    box_w = (W - 30*mm - 10*mm) / 3
    boxes = [("SEVERIDAD", severity.upper(), sev_color),
             ("DAÑOS", str(len(damages)), colors.HexColor("#2C2C2A")),
             ("COSTE ESTIMADO", f"{total_cost:.0f} EUR", colors.HexColor("#2C2C2A"))]
    bx = 15*mm
    for label, val, col in boxes:
        c.setFillColor(colors.HexColor("#F1EFE8"))
        c.roundRect(bx, y-14*mm, box_w, 14*mm, 2*mm, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#888888"))
        c.setFont("Helvetica", 7)
        c.drawCentredString(bx+box_w/2, y-5*mm, label)
        c.setFillColor(col)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(bx+box_w/2, y-11*mm, val)
        bx += box_w + 5*mm

    y -= 22*mm
    # --- Resumen ejecutivo ---
    if summary:
        c.setFillColor(colors.HexColor("#888888"))
        c.setFont("Helvetica", 8)
        c.drawString(15*mm, y, "RESUMEN")
        y -= 5*mm
        c.setFillColor(colors.HexColor("#333333"))
        c.setFont("Helvetica", 9)
        # Word-wrap del resumen
        import textwrap
        for line in textwrap.wrap(summary, 105)[:4]:
            c.drawString(15*mm, y, line)
            y -= 4.5*mm
        y -= 3*mm

    # --- Fotos ---
    if photo_bytes:
        c.setFillColor(colors.HexColor("#888888"))
        c.setFont("Helvetica", 8)
        c.drawString(15*mm, y, "FOTOGRAFIAS")
        y -= 4*mm
        zonas = ["Frontal", "Trasera", "Lat. izq", "Lat. der"]
        img_w = (W - 30*mm - 9*mm) / 4
        img_h = img_w * 0.75
        ix = 15*mm
        for idx, pb in enumerate(photo_bytes[:4]):
            try:
                # Normalizar la imagen con Pillow (convierte a RGB JPEG limpio que reportlab acepta siempre)
                pil_img = Image.open(_io.BytesIO(pb))
                if pil_img.mode not in ("RGB", "L"):
                    pil_img = pil_img.convert("RGB")
                norm_buf = _io.BytesIO()
                pil_img.save(norm_buf, format="JPEG", quality=70)
                norm_buf.seek(0)
                img = ImageReader(norm_buf)
                c.drawImage(img, ix, y-img_h, img_w, img_h, preserveAspectRatio=True, anchor='c')
                c.setFillColor(colors.HexColor("#999999"))
                c.setFont("Helvetica", 6)
                c.drawCentredString(ix+img_w/2, y-img_h-3*mm, zonas[idx] if idx < len(zonas) else f"Foto {idx+1}")
            except Exception as _imgerr:
                logger.warning(f"PDF-DIAG error insertando foto {idx}: {_imgerr}")
            ix += img_w + 3*mm
        y -= (img_h + 8*mm)

    # --- Foto con daños numerados + leyenda (solo si se pide con ?boxes=1, porque la IA tarda ~15s) ---
    if photo_bytes and boxes:
        try:
            boxes = await _detectar_cajas_danos(photo_bytes[0])
            if boxes:
                annotated, n_boxes = _dibujar_numeros(photo_bytes[0], boxes)
                if y < 90*mm:
                    c.showPage(); y = H - 25*mm
                c.setFillColor(colors.HexColor("#888888"))
                c.setFont("Helvetica", 8)
                c.drawString(15*mm, y, "LOCALIZACION DE DAÑOS (IA)")
                y -= 5*mm
                # Imagen anotada (más grande, centrada)
                aimg = ImageReader(_io.BytesIO(annotated))
                aw = 110*mm
                ah = aw * 0.75
                c.drawImage(aimg, 15*mm, y-ah, aw, ah, preserveAspectRatio=True, anchor='nw')
                # Leyenda al lado derecho de la imagen
                lx = 15*mm + aw + 6*mm
                ly = y - 4*mm
                sev_hex = {"critico":"#A32D2D","grave":"#BA7517","moderado":"#BA7517","leve":"#639922"}
                idx_n = 0
                for b in boxes:
                    if len((b.get("box_2d") or b.get("box") or [])) != 4:
                        continue
                    idx_n += 1
                    c.setFillColor(colors.HexColor(sev_hex.get(b.get("severity",""), "#555555")))
                    c.circle(lx+2*mm, ly-1.2*mm, 2.2*mm, fill=1, stroke=0)
                    c.setFillColor(colors.white)
                    c.setFont("Helvetica-Bold", 7)
                    c.drawCentredString(lx+2*mm, ly-2.2*mm, str(idx_n))
                    c.setFillColor(colors.HexColor("#333333"))
                    c.setFont("Helvetica", 8)
                    lbl = str(b.get("label",""))[:32]
                    c.drawString(lx+6*mm, ly-2*mm, lbl)
                    ly -= 6*mm
                    if ly < y - ah:
                        break
                y -= (ah + 8*mm)
        except Exception as _ae:
            logger.warning(f"PDF foto numerada error: {_ae}")

    # --- Tabla de daños ---
    if damages:
        c.setFillColor(colors.HexColor("#888888"))
        c.setFont("Helvetica", 8)
        c.drawString(15*mm, y, "DAÑOS DETECTADOS")
        y -= 6*mm
        for d in damages[:12]:
            if y < 30*mm:
                c.showPage(); y = H - 25*mm
            c.setFillColor(colors.HexColor("#333333"))
            c.setFont("Helvetica", 9)
            part = str(d.get("part", ""))[:45]
            c.drawString(15*mm, y, part)
            dsev = d.get("severity", "")
            c.setFillColor(sev_colors.get(dsev, colors.HexColor("#666666")))
            c.setFont("Helvetica", 8)
            c.drawString(120*mm, y, dsev)
            c.setFillColor(colors.HexColor("#333333"))
            c.setFont("Helvetica", 9)
            c.drawRightString(W-15*mm, y, f"{d.get('estimated_cost',0):.0f} EUR")
            y -= 4*mm
            c.setStrokeColor(colors.HexColor("#eeeeee"))
            c.line(15*mm, y, W-15*mm, y)
            y -= 4*mm

    # --- Verificación matrícula ---
    y -= 4*mm
    if y < 25*mm:
        c.showPage(); y = H - 25*mm
    det_norm = (detected_plate or "").replace(" ", "").upper()
    plate_norm = (plate or "").replace(" ", "").upper()
    if detected_plate:
        coincide = det_norm == plate_norm
        c.setFillColor(colors.HexColor("#EAF3DE") if coincide else colors.HexColor("#FCEBEB"))
        c.roundRect(15*mm, y-8*mm, W-30*mm, 8*mm, 2*mm, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#3B6D11") if coincide else colors.HexColor("#A32D2D"))
        c.setFont("Helvetica", 8)
        txt = f"Verificacion matricula: leida '{detected_plate}' - " + ("COINCIDE" if coincide else "NO COINCIDE (posible fraude)")
        c.drawString(18*mm, y-5*mm, txt)
        y -= 12*mm

    # --- Pie ---
    c.setFillColor(colors.HexColor("#aaaaaa"))
    c.setFont("Helvetica", 7)
    c.drawCentredString(W/2, 12*mm, "Generado por FlotaDSP - Peritaje IA - Documento orientativo")

    c.showPage()
    c.save()
    buf.seek(0)
    return Response(content=buf.read(), media_type="application/pdf",
                    headers={"Content-Disposition": f"inline; filename=peritaje_{plate.replace(' ','')}_{fecha}.pdf"})





# =========================
# BÚSQUEDA DE RECAMBIOS — 7 marketplaces hiper-específicos
# =========================

def _slugify_es(text: str) -> str:
    """Convierte texto a slug URL-friendly para AutoDoc/RecambiosCoche."""
    import unicodedata, re
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text


def _autodoc_brand_path(brand: str) -> str:
    """Mapea nombre de marca al slug de AutoDoc.es."""
    _map = {
        "TOYOTA": "toyota", "FORD": "ford", "PEUGEOT": "peugeot",
        "CITROEN": "citroen", "OPEL": "opel", "RENAULT": "renault",
        "VOLKSWAGEN": "volkswagen", "VW": "volkswagen",
        "MERCEDES": "mercedes-benz", "MERCEDES-BENZ": "mercedes-benz",
        "FIAT": "fiat", "IVECO": "iveco", "NISSAN": "nissan",
        "STELLANTIS": "peugeot",
    }
    return _map.get((brand or "").upper().strip(), _slugify_es(brand or "vehiculo"))


def _build_part_search_urls(
    part_name: str,
    brand: str = "",
    model: str = "",
    year: Optional[int] = None,
    vin: Optional[str] = None,
) -> list:
    """
    Construye 7 URLs de marketplace con máxima especificidad.

    Estrategia:
      - Query principal = '{pieza} {marca} {modelo} {año}' (todos los tokens)
      - Amazon: usa category automotive + nodo de recambios para filtrar solo piezas de coche
      - AutoDoc: si hay VIN → lookup directo /car/?vin=; si no → búsqueda filtrada
      - eBay: categoría 131090 (car parts) + si VIN disponible lo añade al query
      - RecambiosCoche / Desguaces: query exacto pieza+marca+modelo
      - Wallapop: categoría motor
      - Google Shopping: locale es + query completo con año
    """
    from urllib.parse import quote_plus, quote

    part_clean  = (part_name or "").strip()
    brand_clean = (brand  or "").strip().upper()
    model_clean = (model  or "").strip().upper()
    year_str    = str(year) if year else ""

    # ── Tokens ordenados para mayor especificidad ────────────────
    tokens_full = [t for t in [part_clean, brand_clean, model_clean, year_str] if t]
    tokens_pbm  = [t for t in [part_clean, brand_clean, model_clean] if t]
    tokens_pb   = [t for t in [part_clean, brand_clean] if t]

    q_full = quote_plus(" ".join(tokens_full))
    q_pbm  = quote_plus(" ".join(tokens_pbm))
    q_pb   = quote_plus(" ".join(tokens_pb))
    q_part = quote_plus(part_clean)

    brand_slug = _autodoc_brand_path(brand_clean)
    model_slug = _slugify_es(model_clean)

    # ── Amazon: nodo 599412031 = Coche y Moto > Recambios en amazon.es ──
    # Filtra SOLO la categoría de recambios, evita artículos de accesorios genéricos.
    amazon_node = "599412031"
    amazon_url = (
        f"https://www.amazon.es/s?k={q_full}"
        f"&i=automotive&bbn={amazon_node}&s=review-rank"
    )
    amazon_label = f"{part_clean} {brand_clean} {model_clean}" + (f" {year_str}" if year_str else "")

    # ── AutoDoc: VIN → lookup directo; si no → búsqueda por pieza+marca+modelo ──
    if vin:
        autodoc_url   = f"https://www.autodoc.es/car/?vin={quote(vin)}"
        autodoc_label = f"{part_clean} (VIN: {vin[:8]}…)"
        autodoc_spec  = "alta"
    else:
        autodoc_url = (
            f"https://www.autodoc.es/busqueda/"
            f"?sSearch={q_pbm}&sMake={quote_plus(brand_slug)}&sModel={quote_plus(model_slug)}"
        )
        autodoc_label = f"{part_clean} — {brand_clean} {model_clean}"
        autodoc_spec  = "alta" if (brand_clean and model_clean) else "media"

    # ── eBay: cat 131090 = Car Parts & Accessories ───────────────
    ebay_q = quote_plus(" ".join([t for t in [part_clean, brand_clean, model_clean, year_str, vin or ""] if t][:5]))
    ebay_url = f"https://www.ebay.es/sch/i.html?_nkw={ebay_q}&_sacat=131090&LH_PrefLoc=3"

    # ── Wallapop: categoría 100 (Motor) ──────────────────────────
    wallapop_url = f"https://es.wallapop.com/app/search?keywords={q_pbm}&category_ids=100&filters_source=quick_filters"

    # ── Desguaces Online ──────────────────────────────────────────
    desguaces_url = f"https://www.desguacesonline.com/buscador?busqueda={q_pbm}"

    # ── RecambiosCoche ────────────────────────────────────────────
    recambios_url = f"https://www.recambioscoche.es/buscar?q={q_pbm}"

    # ── Google Shopping: filtro España, ordenar por relevancia ───
    google_url = f"https://www.google.es/search?tbm=shop&q={q_full}&hl=es&gl=es&tbs=mr:1,merchagg:g116461169"

    return [
        {
            "marketplace": "Amazon",
            "url": amazon_url,
            "label": amazon_label,
            "description": "Recambios nuevos — sección Coche y Moto",
            "specificity": "alta",
            "icon": "📦",
        },
        {
            "marketplace": "AutoDoc",
            "url": autodoc_url,
            "label": autodoc_label,
            "description": "Especialista en recambios — lookup por VIN o modelo",
            "specificity": autodoc_spec,
            "icon": "🔧",
        },
        {
            "marketplace": "RecambiosCoche",
            "url": recambios_url,
            "label": f"{part_clean} — {brand_clean} {model_clean}",
            "description": "Recambios nuevos España",
            "specificity": "alta",
            "icon": "🚗",
        },
        {
            "marketplace": "eBay España",
            "url": ebay_url,
            "label": f"{part_clean} {brand_clean} {model_clean}",
            "description": "Nuevo + segunda mano",
            "specificity": "alta",
            "icon": "🛒",
        },
        {
            "marketplace": "Wallapop",
            "url": wallapop_url,
            "label": f"{part_clean} {brand_clean}",
            "description": "Segunda mano local",
            "specificity": "media",
            "icon": "♻️",
        },
        {
            "marketplace": "Desguaces Online",
            "url": desguaces_url,
            "label": f"{part_clean} {brand_clean} {model_clean}",
            "description": "Piezas de desguace",
            "specificity": "media",
            "icon": "🏭",
        },
        {
            "marketplace": "Google Shopping",
            "url": google_url,
            "label": f"{part_clean} {brand_clean} {model_clean}" + (f" {year_str}" if year_str else ""),
            "description": "Comparador de precios",
            "specificity": "alta",
            "icon": "🔍",
        },
    ]


@api_router.get("/parts/search")
async def search_parts(
    part_name: str,
    vehicle_id: Optional[str] = None,
    vin: Optional[str] = None,
    brand: Optional[str] = None,
    model: Optional[str] = None,
    year: Optional[int] = None,
    _=Depends(require_any_auth),
):
    """
    Devuelve 7 enlaces de marketplace para buscar una pieza concreta.

    Prioridad de especificidad:
      1. Si se pasa vehicle_id → carga VIN, marca, modelo y año del vehículo en BD.
      2. Si se pasan brand/model/year/vin directamente → los usa tal cual.
      3. Si hay VIN → AutoDoc hace lookup directo por VIN (máxima especificidad OEM).

    Todos los enlaces combinan marca + modelo + año + nombre de pieza para
    asegurar que los resultados sean de esa pieza exacta para ese vehículo.
    """
    _vin = vin
    _brand = brand
    _model = model
    _year = year

    if vehicle_id:
        v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
        if v:
            _vin = _vin or v.get("vin") or v.get("chassis_number")
            _brand = _brand or v.get("brand", "")
            _model = _model or v.get("model", "")
            _year = _year or v.get("year") or v.get("fabrication_year")

    if not part_name or not part_name.strip():
        raise HTTPException(status_code=400, detail="Falta el nombre de la pieza (part_name)")

    links = _build_part_search_urls(
        part_name=part_name,
        brand=_brand or "",
        model=_model or "",
        year=_year,
        vin=_vin,
    )

    return {
        "part_name": part_name,
        "vehicle_info": {
            "brand": _brand,
            "model": _model,
            "year": _year,
            "vin": _vin,
        },
        "links": links,
        "total": len(links),
        "note": "URLs generadas con máxima especificidad. Si hay VIN disponible, AutoDoc hace búsqueda directa OEM.",
    }


# =========================
# LOOKUP PROVEEDOR POR MATRÍCULA
# =========================

@api_router.get("/vehicles/plate/{plate}/provider-info")
async def vehicle_provider_info_by_plate(plate: str, _=Depends(require_any_auth)):
    """
    Devuelve la información de proveedor de renting para una furgoneta por matrícula.

    Incluye:
      - Red de talleres del proveedor (teléfono, proceso, app)
      - Datos del vehículo en BD
      - Talleres concertados con ese proveedor en el mismo centro
    """
    plate_norm = plate.upper().replace(" ", "").replace("-", "")
    # Buscar en BD por matrícula (normalizada)
    v = await db.vehicles.find_one(
        {"license_plate": {"$regex": plate_norm, "$options": "i"}},
        {"_id": 0},
    )
    if not v:
        raise HTTPException(status_code=404, detail=f"Furgoneta con matrícula '{plate}' no encontrada")

    provider = v.get("provider", "")
    network = _provider_network_for(provider)
    center_code = _normalize_center_code(v.get("center"))

    # Talleres concertados con el proveedor en el mismo centro
    workshops_raw = await db.workshops.find(
        {"active": {"$ne": False}}, {"_id": 0}
    ).to_list(500)

    provider_workshops = []
    for w in workshops_raw:
        # Filtrar: mismo centro + convenio con el proveedor (no universales)
        if center_code and w.get("center") != center_code:
            continue
        convs = w.get("convenios", [])
        if "*" in convs:
            continue  # solo mostramos los específicos del proveedor aquí
        if provider and any(
            (provider.upper() in str(c).upper() or str(c).upper() in provider.upper())
            for c in convs
        ):
            provider_workshops.append({
                "id": w.get("id"),
                "name": w.get("name"),
                "address": w.get("address"),
                "city": w.get("city"),
                "phone": w.get("phone"),
                "hours": w.get("hours"),
                "categories": w.get("categories", []),
                "rating": w.get("rating"),
                "maps_url": w.get("maps_url"),
                "notes": w.get("notes"),
            })

    return {
        "license_plate": v.get("license_plate"),
        "vehicle": {
            "brand": v.get("brand"),
            "model": v.get("model"),
            "year": v.get("year"),
            "vin": v.get("vin") or v.get("chassis_number"),
            "center": v.get("center"),
            "provider": provider,
        },
        "provider_network": network,
        "provider_workshops_in_center": provider_workshops,
        "workshops_count": len(provider_workshops),
    }


app.include_router(auth_router)
app.include_router(api_router)
