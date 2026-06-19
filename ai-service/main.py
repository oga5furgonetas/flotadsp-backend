"""FlotaDSP — Microservicio de detección de daños (YOLOv11n, Apache 2.0).
Contrato compatible con el backend: POST /detect {inspection_id, photo_index, image_b64}
→ {"detections":[{label, severity, box_2d:[ymin,xmin,ymax,xmax] 0-1000, confidence, source}]}
El backend lo fusiona con Gemini (no lo sustituye)."""
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

# Traducción de las 14 clases del modelo → etiquetas para el peritaje (español)
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
}

_model = None


MODEL_URL = os.environ.get("MODEL_URL", "").strip()


def get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO
        if MODEL_URL:
            # Modelo reentrenado con TUS correcciones, servido desde una URL (R2/HF/…)
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


@app.get("/health")
def health():
    try:
        m = get_model()
        return {"ok": True, "model": REPO, "classes": list(m.names.values())}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/detect")
def detect(req: DetectReq):
    try:
        m = get_model()
        img = Image.open(io.BytesIO(base64.b64decode(req.image_b64))).convert("RGB")
        W, H = img.size
        res = m.predict(img, conf=CONF, verbose=False)[0]
        dets = []
        for b in res.boxes:
            x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
            cls = int(b.cls[0])
            conf = float(b.conf[0])
            raw = str(m.names.get(cls, cls)).strip().lower()
            label = LABEL_ES.get(raw, raw.capitalize())
            # box_2d normalizado 0-1000 como [ymin, xmin, ymax, xmax]
            box = [round(y1 / H * 1000, 1), round(x1 / W * 1000, 1),
                   round(y2 / H * 1000, 1), round(x2 / W * 1000, 1)]
            dets.append({"label": label, "severity": "leve", "box_2d": box,
                         "confidence": round(conf, 3), "source": "yolo"})
        log.info("detect insp=%s photo=%s → %d daños", req.inspection_id[:8], req.photo_index, len(dets))
        return {"detections": dets}
    except Exception as e:
        log.warning("detect error: %s", e)
        return {"detections": [], "error": str(e)}
