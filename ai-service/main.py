"""FlotaDSP — Microservicio de detección de daños.
Contrato compatible con el backend: POST /detect {inspection_id, photo_index, image_b64}
→ {"detections":[{label, severity, box_2d:[ymin,xmin,ymax,xmax] 0-1000, confidence, source}]}
El backend lo fusiona con Gemini (no lo sustituye).

Modelos, por prioridad:
1. model_v2.pt   — YOLO11s-seg propio (CarDD + DrBimmer, 10 clases, 832px).
                   Entrenado 2026-07-12; val mAP50 0.48 global, arañazos 0.32
                   (el modelo comunitario anterior no veía arañazos).
2. model_finetuned.pt (USE_FINETUNED=1) — afinado con furgonetas propias (legado).
3. MODEL_URL / repo comunitario de HF — respaldo.
"""
import base64
import io
import os
import logging

from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ai-detect")

app = FastAPI(title="FlotaDSP AI Detect")

REPO = os.environ.get("MODEL_REPO", "vineetsarpal/yolov11n-car-damage")
WEIGHTS = os.environ.get("MODEL_FILE", "best.pt")
CONF = float(os.environ.get("CONF", "0.35"))
IMGSZ = int(os.environ.get("IMGSZ", "832"))  # el v2 se entrenó a 832px

# ── Modelo v2 propio (10 clases) ──
LABEL_V2 = {
    "scratch": "Arañazo",
    "dent": "Abolladura",
    "crack": "Grieta",
    "glass_shatter": "Cristal roto",
    "lamp_broken": "Óptica rota",
    "tire_flat": "Rueda pinchada",
    "broken_part": "Pieza rota",
    "missing_part": "Pieza faltante",
    "paint_chip": "Desconchón de pintura",
    "corrosion": "Corrosión",
}
# Severidad orientativa por clase (el perito final sigue siendo Gemini+revisión)
SEV_V2 = {
    "scratch": "leve",
    "dent": "moderado",
    "crack": "moderado",
    "glass_shatter": "grave",
    "lamp_broken": "grave",
    "tire_flat": "critico",
    "broken_part": "grave",
    "missing_part": "grave",
    "paint_chip": "leve",
    "corrosion": "moderado",
}

# ── Modelo de PANELES (21 piezas, mAP50 0.90) — asignación daño→pieza ──
MODEL_PARTS = "model_parts.pt"
LABEL_PARTS = {
    "back-bumper": "paragolpes trasero",
    "back-door": "puerta trasera",
    "back-wheel": "rueda trasera",
    "back-window": "ventanilla trasera",
    "back-windshield": "luna trasera",
    "fender": "aleta",
    "front-bumper": "paragolpes delantero",
    "front-door": "puerta delantera",
    "front-wheel": "rueda delantera",
    "front-window": "ventanilla delantera",
    "grille": "parrilla",
    "headlight": "faro delantero",
    "hood": "capó",
    "license-plate": "matrícula",
    "mirror": "retrovisor",
    "quarter-panel": "panel lateral trasero",
    "rocker-panel": "faldón",
    "roof": "techo",
    "tail-light": "piloto trasero",
    "trunk": "portón",
    "windshield": "parabrisas",
}

# ── Modelo comunitario (respaldo, 14 clases) ──
LABEL_ES = {
    "front-windscreen-damage": "Parabrisas dañado",
    "headlight-damage": "Faro delantero dañado",
    "rear-windscreen-damage": "Luna trasera dañada",
    "runningboard-damage": "Estribo dañado",
    "sidemirror-damage": "Retrovisor dañado",
    "taillight-damage": "Piloto trasero dañado",
    "bonnet-dent": "Abolladura en capó",
    "boot-dent": "Abolladura en portón",
    "doorouter-dent": "Abolladura en puerta",
    "fender-dent": "Abolladura en aleta",
    "front-bumper-dent": "Abolladura paragolpes delantero",
    "quaterpanel-dent": "Abolladura en panel trasero",
    "rear-bumper-dent": "Abolladura paragolpes trasero",
    "roof-dent": "Abolladura en techo",
    "damage": "Daño",
}

_model = None
_parts = None

MODEL_URL = os.environ.get("MODEL_URL", "").strip()
MODEL_V2 = "model_v2.pt"            # detector propio (prioridad por defecto)
LOCAL_MODEL = "model_finetuned.pt"  # afinado legado (solo con USE_FINETUNED=1)


def get_parts_model():
    """Modelo de paneles (21 piezas). None si no está o USE_PARTS=0."""
    global _parts
    if _parts is None and os.path.exists(MODEL_PARTS) and os.environ.get("USE_PARTS", "1") != "0":
        from ultralytics import YOLO
        _parts = YOLO(MODEL_PARTS)
        log.info("Modelo de PANELES cargado (%s): %s", MODEL_PARTS, list(_parts.names.values()))
    return _parts


def _assign_panels(dets, img):
    """Asignación determinista daño→pieza: intersección de cajas.
    share = área(daño ∩ panel) / área(daño). Gana el panel con más share;
    si empatan (±0.1), el más pequeño (más específico: faro gana a capó)."""
    pm = get_parts_model()
    if pm is None or not dets:
        return
    try:
        res = pm.predict(img, conf=0.40, imgsz=640, verbose=False)[0]
        W, H = img.size
        panels = []
        for b in res.boxes:
            x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
            raw = str(pm.names.get(int(b.cls[0]), "")).strip().lower()
            name = LABEL_PARTS.get(raw)
            if not name:
                continue
            box = [y1 / H * 1000, x1 / W * 1000, y2 / H * 1000, x2 / W * 1000]
            area = max(1.0, (box[2] - box[0]) * (box[3] - box[1]))
            panels.append((name, box, float(b.conf[0]), area))
        if not panels:
            return
        for d in dets:
            db = d["box_2d"]
            d_area = max(1.0, (db[2] - db[0]) * (db[3] - db[1]))
            best = None  # (share, -area, name, conf) → más share y más pequeño
            for name, pb, pconf, parea in panels:
                iy1, ix1 = max(db[0], pb[0]), max(db[1], pb[1])
                iy2, ix2 = min(db[2], pb[2]), min(db[3], pb[3])
                inter = max(0.0, iy2 - iy1) * max(0.0, ix2 - ix1)
                share = inter / d_area
                if share < 0.15:
                    continue
                if best is None or share > best[0] + 0.1 or (abs(share - best[0]) <= 0.1 and parea < best[1]):
                    best = (share, parea, name, pconf)
            if best:
                d["panel"] = best[2]
                d["panel_conf"] = round(best[3], 3)
    except Exception as e:
        log.warning("asignación de paneles falló (se continúa sin panel): %s", e)


def get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO
        if os.path.exists(MODEL_V2) and os.environ.get("USE_V2", "1") != "0":
            path = MODEL_V2
            log.info("Modelo V2 propio (CarDD+DrBimmer, 10 clases) cargado: %s", MODEL_V2)
        elif os.path.exists(LOCAL_MODEL) and os.environ.get("USE_FINETUNED", "") == "1":
            path = LOCAL_MODEL
            log.info("Modelo AFINADO (tus furgonetas) cargado: %s", LOCAL_MODEL)
        elif MODEL_URL:
            import urllib.request
            path = "/tmp/model.pt"
            urllib.request.urlretrieve(MODEL_URL, path)
            log.info("Modelo cargado desde MODEL_URL")
        else:
            from huggingface_hub import hf_hub_download
            path = hf_hub_download(repo_id=REPO, filename=WEIGHTS)
            log.info("Modelo base cargado: %s", REPO)
        _model = YOLO(path)
        log.info("Clases: %s", _model.names)
    return _model


class DetectReq(BaseModel):
    inspection_id: str = ""
    photo_index: int = 0
    image_b64: str
    conf: float = None  # umbral opcional (para diagnóstico/ajuste)


@app.get("/health")
def health():
    try:
        m = get_model()
        return {"ok": True, "model": MODEL_V2 if os.path.exists(MODEL_V2) else REPO,
                "imgsz": IMGSZ, "classes": list(m.names.values()),
                "parts_model": bool(get_parts_model())}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/detect")
def detect(req: DetectReq):
    try:
        m = get_model()
        img = Image.open(io.BytesIO(base64.b64decode(req.image_b64))).convert("RGB")
        W, H = img.size
        res = m.predict(img, conf=(req.conf if req.conf is not None else CONF),
                        imgsz=IMGSZ, verbose=False)[0]
        dets = []
        for b in res.boxes:
            x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
            cls = int(b.cls[0])
            conf = float(b.conf[0])
            raw = str(m.names.get(cls, cls)).strip().lower()
            label = LABEL_V2.get(raw) or LABEL_ES.get(raw) or raw.capitalize()
            severity = SEV_V2.get(raw, "leve")
            # box_2d normalizado 0-1000 como [ymin, xmin, ymax, xmax]
            box = [round(y1 / H * 1000, 1), round(x1 / W * 1000, 1),
                   round(y2 / H * 1000, 1), round(x2 / W * 1000, 1)]
            dets.append({"label": label, "severity": severity, "box_2d": box,
                         "confidence": round(conf, 3), "source": "yolo"})
        _assign_panels(dets, img)
        log.info("detect insp=%s photo=%s → %d daños", req.inspection_id[:8], req.photo_index, len(dets))
        return {"detections": dets}
    except Exception as e:
        log.warning("detect error: %s", e)
        return {"detections": [], "error": str(e)}
