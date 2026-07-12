FROM python:3.11-slim

WORKDIR /app

# Dependencias de sistema para OpenCV/Pillow que usa ultralytics
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# PyTorch CPU primero (mucho más ligero que la versión CUDA)
RUN pip install --no-cache-dir torch==2.5.1 torchvision==0.20.1 \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
# Modelo afinado con las furgonetas reales (legado, activable con USE_FINETUNED=1)
COPY model_finetuned.pt .
# Detector propio v2 (CarDD+DrBimmer, 10 clases, 832px) — prioridad por defecto
COPY model_v2.pt .

# Descarga también el modelo base como respaldo
RUN python -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id='vineetsarpal/yolov11n-car-damage', filename='best.pt')"

ENV PORT=8001
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
