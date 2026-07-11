# Plan de transformación del motor de detección de daños — FlotaDSP

**Fecha:** 2026-07-11 · **Alcance:** auditoría técnica del pipeline actual + arquitectura v3 + roadmap
**Principio rector:** *el LLM no localiza; localiza un modelo especialista. El LLM razona, explica y contrasta.*

---

## 1. Auditoría del sistema actual (hechos, no suposiciones)

Leído el código real (`backend/server.py`, `ai-service/main.py`, portal del conductor, panel).

### 1.1 Lo que hay hoy

| Etapa | Implementación real |
|---|---|
| Captura | Portal conductor: 4 ángulos + cuentakm + fotos de checklist. Validación por foto con Gemini (zona/nitidez/matrícula), fail-open |
| Análisis | **Gemini 2.5 Flash en un solo pase** hace TODO: severidad, tipo, **cajas box_2d y polígonos**, matrícula, fraude, suciedad, coste, resumen |
| Detector CV | `ai-service`: **YOLOv11-nano comunitario** (`vineetsarpal/yolov11n-car-damage`, 14 clases, casi todo abolladuras), conf 0.35, severidad fija "leve". **SAM2 NO está integrado** (la etiqueta "yolo11+sam2" del health es aspiracional) |
| Fusión | Las detecciones YOLO van a `inspection_ai_results` (colección aparte). **No corrigen** las cajas de Gemini: lo que ve el usuario (fotos anotadas, pins, revisión) sale del LLM |
| Validadores | Etapa0 (orientación), coherencia espacial, catálogo negativo, regla de reflejo cruzado, ledger de paneles conocidos, baremo por panel |
| Aprendizaje | `ai_feedback` (1.300+ correcciones humanas) → few-shot multimodal + patrones agregados en el prompt. Export de dataset + `reentrenar_colab.py` (manual). Existe `model_finetuned.pt` propio (solo activo con `USE_FINETUNED=1`) |
| Referencia | 2-4 fotos de la última inspección se pasan a Gemini para "daño nuevo vs preexistente" |

### 1.2 Debilidades, causa raíz y prioridad

| # | Debilidad observada | Causa raíz técnica | Impacto |
|---|---|---|---|
| D1 | **Daños desplazados / zona incorrecta** | Las coordenadas las genera un **modelo de lenguaje**. Los VLM son débiles en localización precisa (limitación documentada de la clase de modelo, no un bug) | 🔴 Crítico — es lo que destruye la confianza |
| D2 | Tipo de daño no coincide con el impacto | Un solo pase hace 10 tareas a la vez (matrícula+fraude+cajas+coste+…): sobrecarga cognitiva; y el detector CV que sí distingue clases no participa en el resultado final | 🔴 Crítico |
| D3 | Pieza afectada imprecisa | **No hay segmentación de paneles**: la pieza la "adivina" el LLM mirando; no hay geometría real del vehículo | 🔴 Crítico |
| D4 | Contornos imprecisos | Sin máscara a nivel de píxel en producción (SAM2 ausente); los polígonos los dibuja el LLM | 🟠 Alto |
| D5 | Fotos de cuentakm y checklist **entran al análisis de daños** | El portal añade `odometro.jpg` y `checklist_*.jpg` a `files`; el backend manda TODAS las fotos a Gemini como si fueran carrocería | 🟠 Alto — ruido, tokens, daños fantasma en salpicaderos |
| D6 | Resultados no reproducibles | temperature 0.2 sin seed; sin conjunto de referencia: **no se puede medir** si un cambio mejora o empeora | 🟠 Alto |
| D7 | Detector CV débil | YOLOv11-**nano** (el más pequeño), dataset genérico de turismos, sin arañazos/grietas finas, sin furgonetas; el modelo afinado propio existe pero está desactivado | 🟠 Alto |
| D8 | Conocimiento estático / sin contraste externo | Baremo de costes propio (razonable para flota) pero sin contraste con casos reales ni catálogo de piezas; el histórico propio (miles de inspecciones) no se consulta como evidencia | 🟡 Medio |
| D9 | Disponibilidad | Cuota gratuita de Gemini (20 pet./día en flash) = el sistema entero se cae con los créditos (ya mitigado con gestión de cuota, pero el techo es el que es) | 🔴 Crítico operativo |
| D10 | Ciclo de reentrenamiento manual | Export + Colab a mano; las 1.300 correcciones no vuelven al detector automáticamente | 🟡 Medio |

**Por qué ocurre lo esencial (D1-D4):** la arquitectura invierte los papeles. Se pide al modelo generalista (LLM) la tarea en la que es peor (geometría de píxeles) y se ignora al especialista (detector) en la tarea en la que es mejor. Los líderes del sector (Solera **Qapter**, Tractable) hacen lo contrario: visión especialista para detectar/segmentar/asignar pieza + estimación línea a línea contra bases de datos de siniestros — no un LLM dibujando cajas ([Qapter Intelligent Estimating](https://www.claims.solera.com/products/intelligent-estimating/), [Qapter](https://www.qapter.com/)).

---

## 2. Arquitectura v3 propuesta

### 2.1 Pipeline de inferencia (por inspección)

```
FOTOS (solo ángulos de carrocería; cuentakm/checklist quedan FUERA)
  │
  ├─ A. GATE DE CALIDAD (existe: zona/nitidez/matrícula, fail-open)
  │
  ├─ B. GEOMETRÍA DEL VEHÍCULO  → segmentación de PANELES (máscaras por pieza:
  │     puerta del/tras, aleta, capó, paragolpes, portón, techo, luna, faro…)
  │     Modelo: YOLO11s-seg afinado en datasets de piezas (§3) — GPU, ~50 ms
  │
  ├─ C. DETECCIÓN DE DAÑOS ESPECIALISTA → cajas + clase + confianza
  │     Clases CarDD: dent | scratch | crack | glass shatter | lamp broken | tire flat
  │     Modelo: YOLO11s/m-seg afinado en CarDD + dataset propio (§3)
  │
  ├─ D. REFINADO DE MÁSCARA → SAM 2.1 prompteado con las cajas de C
  │     (integrarlo de verdad; hoy es solo una etiqueta en el health)
  │
  ├─ E. ASIGNACIÓN DAÑO→PIEZA (determinista, sin IA):
  │     intersección máscara-daño ∩ máscara-panel → "puerta delantera izq, 62% del daño"
  │     + coherencia multi-foto (mismo panel en 2 fotos → mismo daño, no dos)
  │
  ├─ F. PERITO VLM (Gemini) — SIN coordenadas. Recibe por daño: crop ampliado,
  │     máscara, panel asignado, clase del detector, historial del panel (ledger),
  │     foto de referencia anterior del mismo ángulo. Devuelve: tipo fino,
  │     severidad (baremo), ¿nuevo o preexistente?, explicación técnica, fraude.
  │     ⇒ 1 llamada por inspección con N crops (barato, enfocado, verificable)
  │
  ├─ G. CONTRASTE (RAG interno + fuentes):
  │     · ledger del vehículo (ya existe) → nunca re-reportar lo conocido
  │     · casos similares propios: búsqueda por embedding sobre inspecciones
  │       pasadas del tenant ("daños parecidos en este panel costaron X, foto Y")
  │     · costes: baremo propio CALIBRADO con facturas reales de taller cargadas
  │       al sistema; opcional integrar GT Motive/Audatex si hay presupuesto
  │
  └─ H. CONFIANZA Y SALIDA:
        score = conf_detector × acuerdo_VLM × coherencia_multi-foto
        · score ≥ 0.85 → publicado como confirmado
        · 0.6–0.85    → "sugerido" → cola de Revisión Rápida (HITL, ya existe)
        · < 0.6       → descartado (queda en log para active learning)
        Salida por daño: pieza exacta, tipo, severidad, confianza, explicación,
        EVIDENCIA (crop + máscara), coste, tiempo estimado, piezas relacionadas,
        recomendación. Reproducible: misma foto ⇒ mismo resultado (CV determinista
        + LLM con temperature 0 y seed fija).
```

### 2.2 Por qué esta arquitectura y no otra

- **Grounded-SAM / Grounding DINO + SAM2** es el patrón de referencia 2024-2026 para "detecta X por texto y segmenta al píxel" ([Grounded-SAM en 2026](https://eng-mhasan.medium.com/grounded-sam-in-2026-why-it-still-matters-even-in-the-sam3-era-15315532365a), [DASeg: DINOv2+GroundingDINO+SAM](https://doi.org/10.3390/rs17162812)). Para un dominio cerrado (6-10 clases de daño) un YOLO-seg afinado rinde igual o mejor con 10× menos coste de inferencia; Grounding DINO queda como herramienta de **auto-etiquetado** del dataset, no de producción.
- La literatura específica de seguros va exactamente aquí: segmentación de instancias de daño con conocimiento de pieza ([SLICK, 2025](https://arxiv.org/html/2506.10528), [revisión sistemática 2025](https://wires.onlinelibrary.wiley.com/doi/10.1002/widm.70027)).
- **CarDD** demuestra que el problema es difícil incluso para SOTA (por eso el LLM solo no basta) y es el mejor punto de partida público: 4.000 imágenes, 9.163 instancias, 6 clases, anotación COCO ([paper](https://arxiv.org/pdf/2211.00945), [HF](https://huggingface.co/datasets/harpreetsahota/CarDD)).

---

## 3. Datos y entrenamiento

| Fuente | Qué aporta | Tamaño |
|---|---|---|
| [CarDD](https://huggingface.co/datasets/harpreetsahota/CarDD) | Daños con máscaras (6 clases), base del detector C | 4.000 img |
| [DrBimmer car-parts-and-damage](https://huggingface.co/datasets/DrBimmer/car-parts-and-damage-dataset) | Piezas + daños con polígonos | 1.812 img |
| [DSMLR Car-Parts-Segmentation](https://github.com/dsmlr/Car-Parts-Segmentation) | 18 piezas segmentadas (COCO), base del modelo B | 500 img |
| [Roboflow car-parts](https://universe.roboflow.com/segmentation-9q8ob/car-parts-llqro) | Refuerzo de piezas | 1.755 img |
| **Dataset propio** (ya existe el export) | Furgonetas reales, TUS condiciones de luz/parking, correcciones humanas | 1.300+ etiquetas y creciendo |

**Estrategia:** (1) pre-entrenar en públicos → (2) afinar con el propio → (3) **active learning**: cada ✗/corrección de Revisión Rápida entra al set (ya se guarda en `ai_feedback`); reentrenos mensuales con `reentrenar_colab.py` formalizados; los daños con score 0.4-0.6 (los dudosos) se priorizan para etiquetado humano. Auto-etiquetado asistido con Grounding DINO + SAM2 para acelerar (revisado por humano).

**Human-in-the-loop:** la Revisión Rápida actual ES el HITL — se formaliza: nada con score <0.85 se publica sin pasar por ella, y cada decisión alimenta el reentrenamiento. Es exactamente el ciclo "aprende de la base de siniestros" de Qapter, a escala flota.

## 4. Validación y métricas (sin esto, todo lo demás es fe)

1. **Conjunto dorado:** 200 inspecciones reales etiquetadas a mano (daño, clase, máscara, pieza, severidad). Congelado y versionado.
2. **Métricas por release:** mAP50 y mAP50-95 por clase; precision/recall de "daño nuevo"; **falsos positivos por inspección** (la métrica que más duele al cliente); % de daños con pieza correcta; tiempo medio de revisión humana.
3. **Shadow mode:** v3 corre en paralelo sin publicarse; se compara contra v2 y contra el veredicto humano 2 semanas antes del switch.
4. **Reproducibilidad:** CV determinista; Gemini con `temperature=0` + `seed`; snapshot del prompt versionado con el código.

## 5. Roadmap

### Quick wins (0–2 semanas, sin GPU nueva)
| # | Acción | Ataca |
|---|---|---|
| QW1 | **Excluir cuentakm/checklist del análisis de daños** (filtrar por nombre de archivo al construir `photos_base64`; mantener índices coherentes) | D5 |
| QW2 | **Fusión real YOLO→Gemini en el pipeline principal**: si una caja Gemini tiene IoU>0.3 con una YOLO, usar la caja YOLO (snap); si Gemini reporta un daño sin apoyo YOLO en foto nítida → bajar confianza | D1 parcial |
| QW3 | Evaluar `model_finetuned.pt` contra el dorado y activar `USE_FINETUNED=1` si gana | D7 |
| QW4 | `temperature=0` + `seed` + conjunto dorado v0 (50 casos) + script de métricas | D6 |
| QW5 | **Gemini de pago** (Tier 1). Sin esto no hay servicio vendible: 20 pet./día no da ni para un centro | D9 |
| QW6 | Subir el detector a YOLO11**s** afinado con CarDD (Colab gratuito llega) y desplegarlo en el ai-service actual | D7 |

### Medio plazo (1–2 meses)
- Modelo B de **paneles** (YOLO11s-seg sobre DSMLR+DrBimmer+Roboflow) + asignación determinista daño→pieza (E). Elimina la "pieza adivinada".
- **SAM 2.1 real** en el ai-service (GPU serverless bajo demanda: Modal/Replicate por segundo, o Fly GPU con auto-stop; una L4/A10 sobra, coste estimado 30-80 €/mes al volumen actual).
- Rediseño del rol del VLM (F): crops + contexto, sin coordenadas. Menos tokens por análisis que hoy.
- Score de confianza compuesto + gate HITL formal (H).
- UX de confianza: cada daño muestra su **crop con máscara**, explicación, badge de confianza y "visto en 2 fotos" — el usuario ve la evidencia, no un veredicto opaco.

### Largo plazo (3–6 meses)
- Active learning industrializado (cola de etiquetado priorizada + reentreno mensual automático con métricas de aceptación).
- RAG de casos propios (embeddings de crops; "3 daños similares en tu flota, coste medio real 240 €").
- Calibración de costes con facturas reales de taller (subida de factura → se asocia al daño → el baremo aprende). Integración GT Motive/Audatex opcional si el producto se vende a aseguradoras.
- Comparación antes/después por registro de imagen (alinear foto actual con la de referencia del mismo ángulo → diff estructural, no "memoria" del LLM).
- 3D: proyección de daños sobre el gemelo (los pins ya existen; con máscaras reales la proyección es fiable). Investigación relacionada: [CrashSplat (2D→3D)](https://arxiv.org/pdf/2509.23947).

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| GPU encarece la operación | Serverless por segundo + batch; el detector nano actual ya corre en CPU: mantener fallback CPU |
| El dataset propio es pequeño para clases raras (grietas, cristal) | Pre-entrenar en CarDD; auto-etiquetado asistido; las clases raras pasan siempre por HITL |
| Cambiar el pipeline rompe lo que funciona | Shadow mode + conjunto dorado + switch por flag (`PIPELINE_V3=1`) reversible |
| Coste Gemini de pago | El rediseño (F) reduce tokens/llamadas por inspección; con crops el análisis es más corto que el actual de 5 fotos completas |
| Un solo desarrollador | Cada fase entrega valor por sí sola y es independiente; nada bloquea la operación actual |

## 7. Costes estimados (orden de magnitud)

| Concepto | Coste |
|---|---|
| Gemini API Tier 1 (pago por uso) | ~10-40 €/mes al volumen actual (crops reducen coste vs hoy) |
| GPU inferencia (B+C+D) serverless | ~30-80 €/mes (segundos por inspección, auto-stop) |
| Entrenamiento (Colab Pro o A100 puntual) | 0-30 €/mes |
| Etiquetado dorado (una vez) | ~20-30 h de trabajo propio/coordinador |
| GT Motive/Audatex (opcional, fase venta a terceros) | licencia comercial, evaluar entonces |

**Total fase 1-2: < 150 €/mes.** El diferencial competitivo no es gastar más: es que la flota propia genera un dataset y un ciclo de corrección que un genérico no tiene.

---

### Fuentes
- [CarDD paper (IEEE T-ITS)](https://arxiv.org/pdf/2211.00945) · [CarDD en HF](https://huggingface.co/datasets/harpreetsahota/CarDD) · [resumen](https://www.emergentmind.com/topics/cardd)
- [SLICK: car damage segmentation para seguros (2025)](https://arxiv.org/html/2506.10528)
- [Revisión sistemática: Vehicle Damage Detection con IA (WIREs, 2025)](https://wires.onlinelibrary.wiley.com/doi/10.1002/widm.70027)
- [Grounded-SAM en 2026](https://eng-mhasan.medium.com/grounded-sam-in-2026-why-it-still-matters-even-in-the-sam3-era-15315532365a) · [DASeg (DINOv2+GroundingDINO+SAM)](https://doi.org/10.3390/rs17162812) · [SAM en detección de daños estructurales](https://arxiv.org/pdf/2401.15266)
- [Solera Qapter Intelligent Estimating](https://www.claims.solera.com/products/intelligent-estimating/) · [qapter.com](https://www.qapter.com/)
- Datasets de piezas: [DSMLR](https://github.com/dsmlr/Car-Parts-Segmentation) · [DrBimmer](https://huggingface.co/datasets/DrBimmer/car-parts-and-damage-dataset) · [Roboflow](https://universe.roboflow.com/segmentation-9q8ob/car-parts-llqro)
- [CrashSplat: 2D→3D vehicle damage](https://arxiv.org/pdf/2509.23947)
