"""
ai_learning.py
==============
Sistema de aprendizaje por correcciones humanas.
Recupera ejemplos relevantes de ai_feedback y los inyecta en los prompts de Gemini.
"""
import base64
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


async def get_few_shot_examples(
    db,
    location_hint: str,
    part: str,
    limit: int = 3,
    general: bool = False,
) -> list[dict]:
    """
    Recupera correcciones humanas de ai_feedback.
    general=True → cualquier zona (para el primer pase donde aún no sabemos qué daños hay)
    general=False → filtra por zona/pieza (para el segundo pase de refinado)
    """
    if general:
        query = {"verdict": {"$in": ["corrected", "wrong"]}}
    else:
        query = {
            "$or": [
                {"damage.location_hint": location_hint},
                {"damage.part": {"$regex": part.split()[0], "$options": "i"}},
            ],
            "verdict": {"$in": ["corrected", "wrong"]},
        }

    cursor = db.ai_feedback.find(query, sort=[("created_at", -1)], limit=limit * 3)
    docs = await cursor.to_list(length=limit * 3)

    examples = []
    async with httpx.AsyncClient(timeout=10) as client:
        for doc in docs:
            if len(examples) >= limit:
                break
            try:
                photo_url = doc.get("photo_url", "")
                if not photo_url:
                    continue
                resp = await client.get(photo_url)
                if resp.status_code != 200:
                    continue
                img_b64 = base64.b64encode(resp.content).decode("utf-8")
                mime = "image/jpeg" if photo_url.lower().endswith((".jpg", ".jpeg")) else "image/png"
                examples.append({
                    "img_b64": img_b64,
                    "mime": mime,
                    "original_part": doc.get("damage", {}).get("part", ""),
                    "original_severity": doc.get("damage", {}).get("severity", ""),
                    "original_box": doc.get("damage", {}).get("box_2d"),
                    "corrected_box": doc.get("corrected_box"),
                    "verdict": doc.get("verdict"),
                    "location_hint": doc.get("damage", {}).get("location_hint", ""),
                    "reviewed_by": doc.get("reviewed_by", "admin"),
                })
            except Exception as e:
                logger.debug(f"[Learning] Error descargando foto de ejemplo: {e}")
                continue

    logger.info(f"[Learning] {len(examples)} ejemplos cargados (general={general}, part='{part}')")
    return examples


def build_few_shot_prompt_parts_multimodal(examples: list[dict]) -> list:
    """
    Construye partes multimodal para Gemini (texto + imágenes base64).
    Las imágenes permiten a Gemini VER el error y la corrección, no solo leerlo.
    Retorna una lista de dicts compatibles con google-genai SDK (text / inline_data).
    """
    if not examples:
        return []

    parts = []
    parts.append({
        "text": (
            "APRENDIZAJE DE ERRORES ANTERIORES:\n"
            "Antes de analizar la imagen, revisa estos casos donde la IA "
            "se equivocó y un inspector humano corrigió el resultado. "
            "Aprende de estos errores para no repetirlos:\n\n"
        )
    })

    for i, ex in enumerate(examples, 1):
        if ex["verdict"] == "wrong":
            lesson = (
                f"CASO {i} — FALSO POSITIVO (el daño NO existía):\n"
                f"La IA detectó '{ex['original_part']}' con severidad '{ex['original_severity']}' "
                f"en la zona {ex.get('location_hint', 'desconocida')} — "
                f"pero el inspector confirmó que NO había daño real. "
                f"Esta imagen NO tiene ese daño. No lo detectes de nuevo.\n"
            )
        else:
            original_box = ex.get("original_box", [])
            corrected_box = ex.get("corrected_box", [])
            lesson = (
                f"CASO {i} — BBOX INCORRECTA (zona equivocada):\n"
                f"La IA marcó '{ex['original_part']}' en bbox {original_box} "
                f"pero el inspector corrigió la bbox real a {corrected_box}. "
                f"La zona correcta del daño es significativamente diferente a la detectada.\n"
            )
        parts.append({"text": f"\n--- {lesson}"})

        if ex.get("img_b64"):
            parts.append({
                "inline_data": {
                    "mime_type": ex.get("mime", "image/jpeg"),
                    "data": ex["img_b64"],
                }
            })

    parts.append({
        "text": (
            "\n--- FIN DE CASOS ANTERIORES ---\n"
            "Ahora analiza la siguiente imagen con especial atención "
            "a no repetir los errores anteriores:\n\n"
        )
    })
    return parts


def build_few_shot_prompt_text(examples: list) -> str:
    """Versión texto-only para el segundo pase (refinado). Mantiene compatibilidad."""
    if not examples:
        return ""

    lines = [
        "\n\n--- CORRECCIONES HUMANAS DE CASOS SIMILARES ---",
        "Los siguientes son errores reales de la IA corregidos por un inspector humano. "
        "Aplica estas lecciones al analizar la imagen actual:\n",
    ]

    for i, ex in enumerate(examples, 1):
        verdict_text = "FALSO POSITIVO (daño no existía)" if ex["verdict"] == "wrong" else "BBOX INCORRECTA"
        lines.append(f"Caso {i} — {verdict_text}:")
        lines.append(f"  · Pieza: {ex['original_part']} ({ex['original_severity']})")
        if ex["verdict"] == "wrong":
            lines.append("  · El inspector confirmó que NO había daño real en esa zona.")
            lines.append("  · Lección: sé más conservador en esta zona, exige evidencia visual clara.")
        elif ex["corrected_box"]:
            lines.append(f"  · Bbox original (incorrecta): {ex['original_box']}")
            lines.append(f"  · Bbox corregida por inspector: {ex['corrected_box']}")
            lines.append("  · Lección: ajusta mejor el bbox al área dañada visible, no al contorno de la pieza.")
        lines.append("")

    lines.append("--- FIN DE CORRECCIONES ---")
    lines.append("Teniendo en cuenta estos errores pasados, sé más preciso en el análisis.\n")
    return "\n".join(lines)


async def save_feedback(
    db,
    inspection_id: str,
    damage_index: int,
    damage: dict,
    photo_url: str,
    verdict: str,
    corrected_box: Optional[list],
    corrected_polygon: Optional[list],
    reviewed_by: str,
    model_version: str = "gemini-2.5-flash",
):
    """Guarda feedback humano en ai_feedback con soporte para polígono corregido."""
    doc = {
        "inspection_id": inspection_id,
        "damage_index": damage_index,
        "damage": damage,
        "photo_url": photo_url,
        "verdict": verdict,
        "corrected_box": corrected_box,
        "corrected_polygon_points": corrected_polygon,
        "reviewed_by": reviewed_by,
        "model_version": model_version,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ai_feedback.update_one(
        {"inspection_id": inspection_id, "damage_index": damage_index},
        {"$set": doc},
        upsert=True,
    )
    logger.info(f"[Learning] Feedback guardado: {inspection_id} / daño {damage_index} → {verdict}")
