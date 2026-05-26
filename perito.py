"""
PERITO IA PRO - Forensic Vehicle Damage Inspection Module
=========================================================
Uses Gemini 3 Flash via emergentintegrations for ultra-strict
visual damage analysis of fleet vehicles.
"""

import asyncio
import base64
import binascii
import io
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, ConfigDict

# emergentintegrations (Gemini multimodal)
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

# Pillow for proper thumbnail generation
try:
    from PIL import Image  # type: ignore
    _HAS_PIL = True
except Exception:  # pragma: no cover
    _HAS_PIL = False

logger = logging.getLogger("perito")

# ────────────────────────────────────────────────────────────
# Pydantic models
# ────────────────────────────────────────────────────────────

class InspectionImage(BaseModel):
    """One image plus optional label (e.g. 'Frontal', 'Lateral Izq')."""
    data: str                       # base64 (with or without data URL prefix)
    label: Optional[str] = None
    mime: Optional[str] = "image/jpeg"


class AnalyzeRequest(BaseModel):
    images: List[InspectionImage] = Field(..., min_length=1, max_length=12)
    plate: Optional[str] = None
    driver: Optional[str] = None
    vehicle: Optional[str] = None
    notes: Optional[str] = None
    save: bool = True


class Damage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    zone: str
    type: str
    description: str
    severity: str            # LEVE | MODERADO | GRAVE | CRITICO
    confidence: int          # 0-100
    estimated_cost_eur: Optional[int] = 0
    repair_recommendation: Optional[str] = ""
    image_index: Optional[int] = 0
    bbox: Optional[List[float]] = None   # [x, y, w, h] normalized 0-1


class AnalysisReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    overall_status: str       # OK | ATENCION | DANOS | CRITICO
    overall_severity: str     # NINGUNO | LEVE | MODERADO | GRAVE | CRITICO
    confidence: int           # global 0-100
    risk_level: str           # BAJO | MEDIO | ALTO | EXTREMO
    circulation_safe: bool
    hidden_damage_probability: int   # 0-100
    image_quality_warnings: List[str] = []
    affected_parts: List[str] = []
    critical_damages: List[str] = []
    recommendations: List[str] = []
    executive_summary: str = ""
    professional_conclusion: str = ""
    estimated_total_cost_eur: int = 0
    urgency: str = "NORMAL"           # NORMAL | PRONTO | URGENTE | INMEDIATO
    damages: List[Damage] = []


class Inspection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    plate: Optional[str] = None
    driver: Optional[str] = None
    vehicle: Optional[str] = None
    notes: Optional[str] = None
    report: AnalysisReport
    thumbnails: List[str] = []   # tiny base64 previews for history (compressed)


# ────────────────────────────────────────────────────────────
# Strict forensic prompt
# ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Eres un PERITO INDUSTRIAL AUTOMOTRIZ SENIOR especializado en inspección forense de flotas empresariales.

Tu trabajo es analizar imágenes de vehículos con MÁXIMA SEVERIDAD y precisión técnica.

REGLAS ABSOLUTAS:
- Debes detectar cualquier desperfecto visible aunque sea mínimo.
- NO ignores: micro-rayones, deformaciones leves, diferencias de pintura, piezas mal alineadas, grietas pequeñas, señales de impacto, desgaste irregular, deterioro visual, daños cosméticos, defectos estructurales, óxido, suciedad excesiva, holguras, matrículas dobladas, neumáticos gastados, retrovisores dañados, paragolpes rotos, tulipas rotas, faros dañados, pintura saltada, fugas visibles, cristales dañados, señales de reparación previa.
- Actúa como si el vehículo fuese a pasar una auditoría industrial extremadamente estricta.
- Si dudas entre daño o no daño: SIEMPRE marca como posible anomalía.
- Sé extremadamente riguroso. NUNCA minimices daños.
- Genera ubicaciones EXACTAS (frontal-izquierdo, paragolpes trasero, puerta corredera derecha, etc.)
- Estima costes orientativos realistas en euros para taller de chapa/pintura en España.

DEVUELVE ÚNICAMENTE JSON VÁLIDO con esta estructura EXACTA (sin texto extra, sin markdown, sin ```):
{
  "overall_status": "OK|ATENCION|DANOS|CRITICO",
  "overall_severity": "NINGUNO|LEVE|MODERADO|GRAVE|CRITICO",
  "confidence": 0-100,
  "risk_level": "BAJO|MEDIO|ALTO|EXTREMO",
  "circulation_safe": true|false,
  "hidden_damage_probability": 0-100,
  "image_quality_warnings": ["..."],
  "affected_parts": ["paragolpes delantero", "..."],
  "critical_damages": ["descripción breve del daño crítico", "..."],
  "recommendations": ["recomendación 1", "..."],
  "executive_summary": "resumen ejecutivo de 2-3 frases",
  "professional_conclusion": "conclusión profesional final del perito",
  "estimated_total_cost_eur": 0,
  "urgency": "NORMAL|PRONTO|URGENTE|INMEDIATO",
  "damages": [
    {
      "zone": "ubicación exacta",
      "type": "tipo (rayón, abolladura, grieta, oxido, etc)",
      "description": "descripción técnica detallada",
      "severity": "LEVE|MODERADO|GRAVE|CRITICO",
      "confidence": 0-100,
      "estimated_cost_eur": 150,
      "repair_recommendation": "qué hay que hacer",
      "image_index": 0,
      "bbox": [0.10, 0.20, 0.30, 0.25]
    }
  ]
}

REGLAS DE STATUS:
- OK: cero defectos, ni cosméticos. (Muy raro, sé escéptico.)
- ATENCION: solo cosas dudosas / micro-anomalías.
- DANOS: uno o más daños claros (LEVE/MODERADO).
- CRITICO: daño GRAVE o estructural o que afecta a la circulación.

bbox: coordenadas normalizadas 0-1 [x, y, ancho, alto] respecto a la imagen donde se ve mejor el daño. Si no puedes ubicarlo con precisión, devuelve null.

ESTRICTO: devuelve SOLO el JSON, nada más."""


USER_INSTRUCTION = """Analiza estas imágenes del vehículo {plate_info}{driver_info}{notes_info}.

Cantidad de imágenes recibidas: {n}.
Las imágenes vienen etiquetadas como: {labels}.

Realiza una inspección forense ULTRA ESTRICTA y devuelve el JSON solicitado.
NO RESPONDAS NADA QUE NO SEA JSON VÁLIDO."""


# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────

def _clean_b64(raw: str) -> tuple[str, str]:
    """Strip data URL prefix and return (mime, pure_b64)."""
    mime = "image/jpeg"
    s = (raw or "").strip()
    if s.startswith("data:"):
        head, _, body = s.partition(",")
        m = re.match(r"data:([^;]+);base64", head)
        if m:
            mime = m.group(1)
        s = body
    # remove whitespace/newlines
    s = re.sub(r"\s+", "", s)
    return mime, s


def _make_thumbnail(pure_b64: str, max_dim: int = 320, quality: int = 60) -> str:
    """Return a small valid JPEG base64 thumbnail. Falls back to original on any error."""
    if not _HAS_PIL:
        return pure_b64 if len(pure_b64) < 120_000 else pure_b64[:120_000]
    try:
        raw = base64.b64decode(pure_b64, validate=False)
        im = Image.open(io.BytesIO(raw))
        im = im.convert("RGB")
        im.thumbnail((max_dim, max_dim), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=quality, optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as e:  # noqa: BLE001
        logger.warning("thumbnail failed: %s", e)
        return pure_b64 if len(pure_b64) < 120_000 else pure_b64[:120_000]


def _validate_image(b64: str) -> Optional[str]:
    """Basic validation. Returns warning string or None."""
    try:
        raw = base64.b64decode(b64, validate=False)
    except (binascii.Error, ValueError):
        return "imagen base64 inválida"
    if len(raw) < 2_000:
        return "imagen demasiado pequeña o vacía"
    if len(raw) > 14_000_000:
        return "imagen demasiado grande (>14MB)"
    return None


def _extract_json(text: str) -> Dict[str, Any]:
    """Robust JSON extraction from model output."""
    if not text:
        raise ValueError("empty model response")
    t = text.strip()
    # strip markdown fences
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```\s*$", "", t)
    # try direct parse
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    # find first { and last }
    start = t.find("{")
    end = t.rfind("}")
    if start >= 0 and end > start:
        chunk = t[start:end + 1]
        try:
            return json.loads(chunk)
        except json.JSONDecodeError:
            # last attempt: remove trailing commas
            chunk2 = re.sub(r",(\s*[}\]])", r"\1", chunk)
            return json.loads(chunk2)
    raise ValueError("no JSON object found in model response")


def _coerce_report(data: Dict[str, Any]) -> AnalysisReport:
    """Defensive coercion of model output → AnalysisReport."""

    def _i(v, default=0, lo=0, hi=100):
        try:
            n = int(float(v))
        except (TypeError, ValueError):
            return default
        return max(lo, min(hi, n))

    def _str(v, default=""):
        if v is None:
            return default
        return str(v)

    def _list_str(v):
        if not isinstance(v, list):
            return []
        return [str(x) for x in v if x is not None]

    damages_raw = data.get("damages") or []
    damages: List[Damage] = []
    for d in damages_raw:
        if not isinstance(d, dict):
            continue
        bbox = d.get("bbox")
        if isinstance(bbox, list) and len(bbox) == 4:
            try:
                bbox = [max(0.0, min(1.0, float(x))) for x in bbox]
            except (TypeError, ValueError):
                bbox = None
        else:
            bbox = None
        damages.append(Damage(
            zone=_str(d.get("zone"), "Indeterminada"),
            type=_str(d.get("type"), "Desperfecto"),
            description=_str(d.get("description"), ""),
            severity=_str(d.get("severity"), "LEVE").upper(),
            confidence=_i(d.get("confidence"), 70),
            estimated_cost_eur=_i(d.get("estimated_cost_eur"), 0, 0, 100000),
            repair_recommendation=_str(d.get("repair_recommendation"), ""),
            image_index=_i(d.get("image_index"), 0, 0, 50),
            bbox=bbox,
        ))

    overall_status = _str(data.get("overall_status"), "ATENCION").upper()
    if overall_status not in {"OK", "ATENCION", "DANOS", "CRITICO"}:
        overall_status = "ATENCION"

    overall_severity = _str(data.get("overall_severity"), "NINGUNO").upper()

    urgency = _str(data.get("urgency"), "NORMAL").upper()
    if urgency not in {"NORMAL", "PRONTO", "URGENTE", "INMEDIATO"}:
        urgency = "NORMAL"

    return AnalysisReport(
        overall_status=overall_status,
        overall_severity=overall_severity,
        confidence=_i(data.get("confidence"), 80),
        risk_level=_str(data.get("risk_level"), "BAJO").upper(),
        circulation_safe=bool(data.get("circulation_safe", True)),
        hidden_damage_probability=_i(data.get("hidden_damage_probability"), 0),
        image_quality_warnings=_list_str(data.get("image_quality_warnings")),
        affected_parts=_list_str(data.get("affected_parts")),
        critical_damages=_list_str(data.get("critical_damages")),
        recommendations=_list_str(data.get("recommendations")),
        executive_summary=_str(data.get("executive_summary"), ""),
        professional_conclusion=_str(data.get("professional_conclusion"), ""),
        estimated_total_cost_eur=_i(data.get("estimated_total_cost_eur"), 0, 0, 1000000),
        urgency=urgency,
        damages=damages,
    )


# ────────────────────────────────────────────────────────────
# Core Gemini call
# ────────────────────────────────────────────────────────────

async def run_analysis(req: AnalyzeRequest) -> AnalysisReport:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(500, "EMERGENT_LLM_KEY no configurada en backend/.env")

    # Validate / normalise images
    image_contents: List[ImageContent] = []
    quality_warnings: List[str] = []
    labels: List[str] = []
    for i, img in enumerate(req.images):
        _mime, pure = _clean_b64(img.data)
        warn = _validate_image(pure)
        if warn:
            quality_warnings.append(f"Imagen {i+1}: {warn}")
            continue
        image_contents.append(ImageContent(image_base64=pure))
        labels.append(img.label or f"Imagen {i+1}")

    if not image_contents:
        raise HTTPException(400, "No hay imágenes válidas para analizar")

    plate_info = f" (matrícula {req.plate})" if req.plate else ""
    driver_info = f" conducido por {req.driver}" if req.driver else ""
    notes_info = f". Notas del conductor: {req.notes}" if req.notes else ""

    user_text = USER_INSTRUCTION.format(
        plate_info=plate_info,
        driver_info=driver_info,
        notes_info=notes_info,
        n=len(image_contents),
        labels=", ".join(labels),
    )

    chat = LlmChat(
        api_key=api_key,
        session_id=f"perito-{uuid.uuid4()}",
        system_message=SYSTEM_PROMPT,
    ).with_model("gemini", "gemini-3-flash-preview")

    # Resilient call: 1 retry with short backoff for transient budget / rate hiccups
    response_text = None
    last_err: Optional[Exception] = None
    for attempt in range(2):
        try:
            response_text = await chat.send_message(
                UserMessage(text=user_text, file_contents=image_contents)
            )
            break
        except Exception as e:  # noqa: BLE001
            last_err = e
            msg = str(e).lower()
            transient = (
                "budget" in msg
                or "rate" in msg
                or "timeout" in msg
                or "temporarily" in msg
                or "overloaded" in msg
            )
            logger.warning("Gemini attempt %d failed (transient=%s): %s", attempt + 1, transient, e)
            if attempt == 0 and transient:
                await asyncio.sleep(1.2)
                continue
            break
    if response_text is None:
        raise HTTPException(502, f"Error del modelo IA: {last_err}")

    try:
        data = _extract_json(response_text)
    except Exception as e:
        logger.error("Could not parse JSON. Raw: %s", response_text[:500])
        raise HTTPException(502, f"Respuesta IA no parseable: {e}")

    report = _coerce_report(data)
    # Merge any quality warnings detected before the model call
    if quality_warnings:
        report.image_quality_warnings = quality_warnings + report.image_quality_warnings
    return report


# ────────────────────────────────────────────────────────────
# Router factory
# ────────────────────────────────────────────────────────────

def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/perito", tags=["perito"])
    col = db["perito_inspections"]

    @router.post("/analyze", response_model=Inspection)
    async def analyze(req: AnalyzeRequest):
        report = await run_analysis(req)

        thumbs: List[str] = []
        for img in req.images[:4]:
            _m, pure = _clean_b64(img.data)
            thumbs.append(_make_thumbnail(pure))

        insp = Inspection(
            plate=req.plate,
            driver=req.driver,
            vehicle=req.vehicle,
            notes=req.notes,
            report=report,
            thumbnails=thumbs if req.save else [],
        )

        if req.save:
            try:
                doc = insp.model_dump()
                await col.insert_one(doc)
            except Exception:
                logger.exception("Mongo insert failed")
        return insp

    @router.get("/inspections")
    async def list_inspections(limit: int = 50, include_thumbs: bool = False):
        projection = {"_id": 0}
        if not include_thumbs:
            projection["thumbnails"] = 0
        items = await col.find({}, projection).sort("created_at", -1).to_list(limit)
        return {"items": items, "count": len(items)}

    @router.get("/inspections/{inspection_id}")
    async def get_inspection(inspection_id: str):
        item = await col.find_one({"id": inspection_id}, {"_id": 0})
        if not item:
            raise HTTPException(404, "Inspección no encontrada")
        return item

    @router.delete("/inspections/{inspection_id}")
    async def delete_inspection(inspection_id: str):
        r = await col.delete_one({"id": inspection_id})
        if r.deleted_count == 0:
            raise HTTPException(404, "Inspección no encontrada")
        return {"ok": True, "deleted": inspection_id}

    @router.delete("/inspections")
    async def clear_inspections():
        r = await col.delete_many({})
        return {"ok": True, "deleted": r.deleted_count}

    @router.get("/health")
    async def health():
        return {
            "ok": True,
            "model": "gemini-3-flash-preview",
            "has_key": bool(os.environ.get("EMERGENT_LLM_KEY")),
        }

    return router
