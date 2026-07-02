"""
ai_learning.py
==============
Sistema de aprendizaje por correcciones humanas.
Recupera ejemplos relevantes de ai_feedback y los inyecta en los prompts de Gemini.
"""
import base64
import logging
import re
import time
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

    Mezcla dos tipos de ejemplo:
    · errores de detección (wrong/corrected) → enseñan a no inventar daños
    · daños no detectados (missed)          → enseñan lo que se le escapa
    """
    part_token = re.escape(part.split()[0]) if part.strip() else ""
    if general:
        err_query = {"verdict": {"$in": ["corrected", "wrong"]}}
        missed_query = {"verdict": "missed"}
    else:
        zone_or = [{"damage.location_hint": location_hint}]
        if part_token:
            zone_or.append({"damage.part": {"$regex": part_token, "$options": "i"}})
        err_query = {"$or": zone_or, "verdict": {"$in": ["corrected", "wrong"]}}
        missed_query = {"$or": zone_or, "verdict": "missed"}

    docs_err = await db.ai_feedback.find(err_query, sort=[("created_at", -1)], limit=limit * 3).to_list(length=limit * 3)
    docs_missed = await db.ai_feedback.find(missed_query, sort=[("created_at", -1)], limit=limit * 3).to_list(length=limit * 3)

    # Intercalar missed/errores para que ambos tipos entren dentro del límite
    docs = []
    i = 0
    while len(docs) < limit * 3 and (i < len(docs_missed) or i < len(docs_err)):
        if i < len(docs_missed):
            docs.append(docs_missed[i])
        if i < len(docs_err):
            docs.append(docs_err[i])
        i += 1

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
        elif ex["verdict"] == "missed":
            lesson = (
                f"CASO {i} — DAÑO NO DETECTADO (falso negativo):\n"
                f"La IA NO detectó '{ex['original_part']}' ({ex['original_severity']}) "
                f"en la zona bbox {ex.get('original_box') or '?'} de esta imagen, "
                f"pero el inspector confirmó que el daño SÍ existe. "
                f"Daños de este tipo se te escapan: búscalos activamente en las fotos actuales.\n"
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
        verdict_text = (
            "FALSO POSITIVO (daño no existía)" if ex["verdict"] == "wrong"
            else "DAÑO NO DETECTADO (falso negativo)" if ex["verdict"] == "missed"
            else "BBOX INCORRECTA"
        )
        lines.append(f"Caso {i} — {verdict_text}:")
        lines.append(f"  · Pieza: {ex['original_part']} ({ex['original_severity']})")
        if ex["verdict"] == "wrong":
            lines.append("  · El inspector confirmó que NO había daño real en esa zona.")
            lines.append("  · Lección: sé más conservador en esta zona, exige evidencia visual clara.")
        elif ex["verdict"] == "missed":
            lines.append("  · La IA no lo detectó; el inspector confirmó que el daño SÍ existía.")
            lines.append("  · Lección: examina esta pieza activamente, daños así se te escapan.")
        elif ex["corrected_box"]:
            lines.append(f"  · Bbox original (incorrecta): {ex['original_box']}")
            lines.append(f"  · Bbox corregida por inspector: {ex['corrected_box']}")
            lines.append("  · Lección: ajusta mejor el bbox al área dañada visible, no al contorno de la pieza.")
        lines.append("")

    lines.append("--- FIN DE CORRECCIONES ---")
    lines.append("Teniendo en cuenta estos errores pasados, sé más preciso en el análisis.\n")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# PATRONES AGREGADOS — resumen estadístico de TODO el dataset de feedback.
# Barato (una agregación, sin fotos) y mucho más potente que 2 ejemplos sueltos:
# le dice a Gemini en qué piezas suele inventar daños y cuáles se le escapan.
# ─────────────────────────────────────────────────────────────────────────────

# Cache POR BASE DE DATOS (multi-tenant: cada org tiene su BD y sus patrones;
# no se deben mezclar flotas distintas en el prompt).
_pattern_cache: dict = {}
_PATTERN_TTL_S = 600  # 10 min — el feedback nuevo entra en el siguiente ciclo


async def get_pattern_lessons(db) -> str:
    """Bloque de texto para el prompt del primer pase con los patrones de error
    aprendidos de las validaciones humanas (✓/✗/daños no detectados)."""
    now = time.monotonic()
    cache_key = getattr(db, "name", "default")
    cached = _pattern_cache.get(cache_key)
    if cached is not None and now - cached["at"] < _PATTERN_TTL_S:
        return cached["text"]

    pipeline = [
        {"$match": {"verdict": {"$in": ["wrong", "missed", "correct"]}}},
        {"$group": {
            "_id": {
                "part": {"$toLower": {"$trim": {"input": {"$ifNull": ["$damage.part", ""]}}}},
                "verdict": "$verdict",
            },
            "n": {"$sum": 1},
        }},
    ]
    rows = await db.ai_feedback.aggregate(pipeline).to_list(2000)

    per_part: dict = {}
    totals = {"wrong": 0, "missed": 0, "correct": 0}
    for r in rows:
        part = (r["_id"].get("part") or "").strip()
        verdict = r["_id"].get("verdict")
        n = r.get("n", 0)
        totals[verdict] = totals.get(verdict, 0) + n
        if part:
            per_part.setdefault(part, {})[verdict] = n

    total = sum(totals.values())
    # Umbrales mínimos para no aprender de ruido (1 solo caso no es un patrón)
    fp_parts = sorted(
        ((p, v.get("wrong", 0)) for p, v in per_part.items()
         if v.get("wrong", 0) >= 3 and v.get("wrong", 0) > v.get("correct", 0)),
        key=lambda x: -x[1],
    )[:6]
    fn_parts = sorted(
        ((p, v.get("missed", 0)) for p, v in per_part.items() if v.get("missed", 0) >= 2),
        key=lambda x: -x[1],
    )[:6]

    if not fp_parts and not fn_parts:
        _pattern_cache[cache_key] = {"at": now, "text": ""}
        return ""

    lines = [
        f"\n=== PATRONES DE ERROR APRENDIDOS DE ESTA FLOTA ({total} validaciones humanas) ===",
    ]
    if fp_parts:
        listado = ", ".join(f"{p} ({n} falsos positivos)" for p, n in fp_parts)
        lines.append(
            "FALSOS POSITIVOS RECURRENTES — en estas piezas la IA ha reportado daños "
            f"que NO existían: {listado}. En ellas exige evidencia visual inequívoca; "
            "NUNCA reportes daño por reflejos, sombras, gotas de agua o suciedad. "
            "Ante la duda en estas piezas, NO reportes el daño."
        )
    if fn_parts:
        listado = ", ".join(f"{p} ({n} no detectados)" for p, n in fn_parts)
        lines.append(
            "DAÑOS QUE SE TE ESCAPAN — daños reales que la IA no detectó: "
            f"{listado}. Examina estas piezas activamente y con detalle en cada foto."
        )
    lines.append("=== FIN DE PATRONES ===\n")
    text = "\n".join(lines)
    _pattern_cache[cache_key] = {"at": now, "text": text}
    return text


async def get_part_lesson(db, part: str) -> str:
    """Lección de 1 línea para el pase de refinado de un daño concreto:
    historial humano de esa pieza (falsos positivos vs aciertos vs escapados)."""
    if not (part or "").strip():
        return ""
    token = re.escape(part.split()[0])
    q = {"damage.part": {"$regex": token, "$options": "i"}}
    wrong = await db.ai_feedback.count_documents({**q, "verdict": "wrong"})
    correct = await db.ai_feedback.count_documents({**q, "verdict": "correct"})
    missed = await db.ai_feedback.count_documents({**q, "verdict": "missed"})
    if wrong >= 2 and wrong > correct:
        return (
            f"\nHISTORIAL DE ESTA PIEZA: en '{part}' los inspectores han registrado "
            f"{wrong} falsos positivos frente a {correct} aciertos de la IA. "
            "Sé MUY exigente: confirma el daño solo si la evidencia es clara e inequívoca; "
            "si puede ser reflejo, sombra o suciedad, descártalo.\n"
        )
    if missed >= 2:
        return (
            f"\nHISTORIAL DE ESTA PIEZA: en '{part}' se han registrado {missed} daños "
            "reales que la IA no detectó. Examina la zona con especial detalle antes de descartar.\n"
        )
    return ""


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
