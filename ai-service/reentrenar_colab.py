# ╔══════════════════════════════════════════════════════════════════╗
# ║  FlotaDSP — Reentrenar el detector de daños con TUS correcciones    ║
# ║  Se ejecuta en Google Colab (GPU gratis). Pasos:                   ║
# ║   1) Abre https://colab.research.google.com → nuevo cuaderno        ║
# ║   2) Menú: Entorno de ejecución → Cambiar tipo → GPU (T4)           ║
# ║   3) Pega TODO esto en una celda, pon tu TOKEN y dale a ▶          ║
# ║   4) Al acabar, descarga best.pt y pásamelo (o súbelo a Hugging    ║
# ║      Face) y yo actualizo el modelo en producción.                 ║
# ╚══════════════════════════════════════════════════════════════════╝

TOKEN   = "PEGA_AQUI_TU_TOKEN_DE_DANI"   # lo sacas logueándote como dani
BACKEND = "https://flotadsp-backend.fly.dev/api"
EPOCHS  = 100

import subprocess, sys
subprocess.run([sys.executable, "-m", "pip", "-q", "install", "ultralytics", "requests", "pillow"])

import requests, io, random
from pathlib import Path
from PIL import Image

# 1) Descargar tus correcciones (el dataset que has ido marcando)
r = requests.get(f"{BACKEND}/ai/export-dataset", headers={"Authorization": f"Bearer {TOKEN}"})
samples = r.json()["samples"]
print(f"📦 {len(samples)} ejemplos marcados por ti")

# 2) Convertir a formato YOLO (1 clase: 'damage' = dónde hay daño). Split 80/20.
random.seed(0); random.shuffle(samples)
n_val = max(1, len(samples) // 5)
root = Path("dataset")
for split in ("train", "val"):
    (root / f"images/{split}").mkdir(parents=True, exist_ok=True)
    (root / f"labels/{split}").mkdir(parents=True, exist_ok=True)

ok = 0
for i, s in enumerate(samples):
    split = "val" if i < n_val else "train"
    try:
        img = Image.open(io.BytesIO(requests.get(s["image_url"], timeout=30).content)).convert("RGB")
    except Exception:
        continue
    img.save(root / f"images/{split}/{i}.jpg")
    ymin, xmin, ymax, xmax = s["box_2d"]          # normalizado 0-1000
    cx = (xmin + xmax) / 2 / 1000; cy = (ymin + ymax) / 2 / 1000
    w = (xmax - xmin) / 1000;      h = (ymax - ymin) / 1000
    (root / f"labels/{split}/{i}.txt").write_text(f"0 {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")
    ok += 1
print(f"✅ {ok} imágenes preparadas")

(root / "data.yaml").write_text(
    f"path: {root.resolve()}\ntrain: images/train\nval: images/val\nnames:\n  0: damage\n")

# 3) Fine-tuning (parte de yolo11n, rápido en GPU)
from ultralytics import YOLO
model = YOLO("yolo11n.pt")
model.train(data=str(root / "data.yaml"), epochs=EPOCHS, imgsz=640, patience=25, plots=True)

print("\n🎯 LISTO. Tu modelo entrenado está en: runs/detect/train/weights/best.pt")
print("   Descárgalo (panel de archivos de Colab) y pásamelo, o súbelo a Hugging Face.")

# 4) (Opcional) descargar automáticamente en Colab
try:
    from google.colab import files
    files.download("runs/detect/train/weights/best.pt")
except Exception:
    pass
