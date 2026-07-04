# Fase 2 — Dataset del detector propio de daños

> Objetivo: entrenar un detector/segmentador de daños PROPIO que actúe como
> pre-detector geométrico (propone regiones con máscara precisa) y Gemini
> verifique/describa. Dos opiniones independientes = mínimos falsos positivos
> y cajas clavadas.

## Decisiones de arquitectura (leer antes de tocar nada)

**1. Clase única "damage" (binaria).** Nuestro dataset etiqueta PIEZAS
(puerta corredera…) y severidad; los públicos etiquetan TIPOS (dent, scratch,
crack…). Unificar taxonomías a mano sería frágil. Solución: el modelo propio
solo aprende *dónde hay daño* (regiones + máscaras, clase única); la pieza la
da la geometría (Etapa 0 + orientación) y la severidad/descripcón la da Gemini.
Así CUALQUIER dataset de daños suma sin pelearse con el nuestro.

**2. La validación es SOLO con datos de nuestra flota.** Los datos externos
entran únicamente en train. Las métricas (precision/recall/IoU) se miden sobre
furgonetas reales nuestras. Garantía de "perfeccionar, no empeorar": si mezclar
un dataset externo no mejora las métricas en NUESTRO dominio, no se despliega.

**3. Hard negatives de oro.** Cada ✗ de Revisión Rápida (reflejo, sombra,
suciedad marcados por humanos) es un negativo difícil. Una imagen solo se usa
como negativa pura si NO tiene ningún daño confirmado además del rechazado.

## Fuentes y licencias (verificado 2026-07)

| Fuente | Tamaño | Formato | Licencia | Estado |
|---|---|---|---|---|
| **Nuestro feedback** (`/ai-dataset/export`) | crece a diario (✓/✗/corregido/no-visto) | COCO-like propio | Nuestra, total | ✅ listo |
| **CarDD** (cardd-ustc.github.io) | 4.000 img, 9k instancias, 6 clases, máscaras | COCO | ⚠️ Requiere FORMULARIO firmado a los autores; el uso comercial hay que solicitarlo explícitamente | ⏸ pendiente de permiso |
| **Roboflow Universe** (datasets "car damage" con licencia CC BY 4.0) | varios de 1k-10k img | COCO/YOLO export | ✅ CC BY 4.0 = uso comercial OK citando la fuente (verificar la licencia DE CADA dataset en su página) | ✅ usable ya |

**Acción para CarDD**: descargar el formulario en su web (`/docs/CarDD_license.pdf`),
firmarlo pidiendo autorización de uso comercial y enviarlo a los autores. Hasta
tener el OK por escrito, NO se entrena con CarDD.

## La tubería (3 scripts, solo stdlib + requests)

```
1) python fetch_own_dataset.py --api https://flotadsp-backend.fly.dev/api \
      --token <TOKEN_ADMIN> --out data/propio
   → descarga export + fotos y genera layout YOLO-seg (clase única)

2) python convert_coco_damage.py --coco anotaciones.json --images carpeta_imgs \
      --out data/externo_X --source nombre_fuente
   → convierte CUALQUIER dataset COCO (CarDD, Roboflow…) al mismo layout

3) python merge_datasets.py --own data/propio --extra data/externo_X ... \
      --out data/final
   → fusiona: train = propio + externos · val = SOLO propio · data.yaml listo
```

## Entrenamiento (cuando el dataset esté listo)

En GPU alquilada (RunPod/Lambda, ~50-100€ una RTX 4090 unas horas):

```bash
pip install ultralytics
yolo segment train model=yolo11s-seg.pt data=data/final/data.yaml \
     imgsz=1024 epochs=120 batch=16 patience=25
```

Criterio de aceptación (sobre val = nuestra flota):
- precision ≥ 0.85 y recall ≥ 0.80 a conf 0.4
- FP/imagen < 0.3 en las imágenes negativas (las de ✗)
Si no se cumple → más datos propios, no bajar el listón.

## Integración (después de entrenar)

El peso `best.pt` se sirve en el ai-service existente (flotadsp-ai.fly.dev,
ya corre YOLO11+SAM2) como **etapa de pre-detección**: sus regiones se cruzan
con las de Gemini — coincidencia = confirmado; solo-Gemini = degradar a
sugerido; solo-YOLO = pedir verificación a Gemini con el crop. Ese cruce es
el que elimina los falsos positivos de verdad.
