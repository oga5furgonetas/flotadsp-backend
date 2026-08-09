# FlotaDSP — replanteamiento de producto

Documento de laboratorio. Escrito desde la pregunta que importa: **¿por qué
pagaría un dueño de DSP cientos de euros al mes por esto?**

No es un plan de rediseño. Es un intento de encontrar qué debería ser este
producto, con la disciplina de no afirmar nada que los datos no sostengan.

---

## 0. Lo primero: me equivoqué de métrica

Antes de nada, una corrección que afecta a lo que construí en este mismo LAB.

La versión anterior (`/lab/semana`) giraba alrededor del **WHC** y de proteger el
*Fantastic*. Es una idea atractiva y está bien fundamentada… pero apunta a la
métrica equivocada. `docs/DSC.md` lo demuestra sobre las 17 scorecards reales de
OGA5, extrayendo las *Recommended Focus Areas* de cada semana:

| Métrica | Semanas en foco | Peso |
|---|---|---|
| **DSC DPMO** | **14 de 17** | **40** |
| Lost on Road | 7 | 14 |
| **WHC** | **5** | **10** |
| Customer escalation | 5 | 8 |

Y el dato que lo remata: **la semana 29 tuvo el WHC al 100 % (Fantastic) y aun
así el Overall fue 69,49 · Fair**, el peor de las 17. *Arreglar el WHC entero no
habría salvado esa semana.*

Conclusión: el WHC merece existir, pero como higiene, no como titular. **El
titular es DSC.** Todo lo que sigue se reordena alrededor de eso.

---

## A. Qué es FlotaDSP hoy

Un SaaS vertical en producción para DSPs de Amazon. 35 pantallas, ~285 rutas de
backend, multi-tenant. Cinco bloques reales:

1. **Inspecciones con IA de daños** — foto → Gemini + baremo → ledger por panel.
2. **Cortex** — extensión de Chrome que captura el estado de cada paquete.
3. **Scorecard / WHC / DSC** — reconstrucción de las métricas de Amazon.
4. **Operación diaria** — asignación, turnos, checklist, chat, incidencias.
5. **Flota** — vehículos, ITV, renting, talleres, aparcamiento.

Lo que **de verdad** lo diferencia no es ninguno de los cinco por separado. Es
que, cruzando Cortex con los scorecards, el producto **reconstruye las métricas
por las que Amazon te penaliza, antes de que Amazon te las diga**. Eso no lo hace
un software genérico de flotas, y no lo hace un Excel.

## B. Qué está mal o desaprovechado

**Desaprovechado (existe y no se ve):**

| Qué | Estado |
|---|---|
| `GET /stats/attention` — "qué necesita mi atención hoy" | Calculado. **`frontend-v2` no lo llama desde ninguna pantalla**: sólo la app legada |
| `vehicle_damage_ledger` | Memoria del vehículo panel a panel, construida como *supresión interna* para la IA, sin lectura de usuario |
| `_whc_ritmo()` | Proyección semanal ya calculada; sólo se ve entrando a WHC |
| `cortex_events` (186 656 docs) | Nadie los lee. El propio `DSC.md` demuestra que **no hacen falta** (el `timeline` basta y es 11× más rápido) |
| Suelo observado de 56 h 30 m | Es el único umbral con respaldo empírico y no se usa para cribar |

**Mal planteado:**

- **7 pantallas para entender a un conductor** (Conductores → Scorecard → WHC →
  Turnos → Inspecciones → Incidencias → PackageIntel) y ninguna enlaza con la
  siguiente por esa persona.
- **La ITV vive en 4 sitios** (Dashboard, AvisosITV, Vencimientos, ExpiryAlerts).
- **Pantallas esqueleto**: Renting (17 líneas), AvisosITV (9), Metricas (39),
  Turnos (77 y cero botones).
- **Sin registro de eventos.** Se sabe cuándo se *creó* algo, pero las
  transiciones de estado se sobrescriben. Sin eso no hay diferencial, ni
  auditoría, ni "qué está empeorando".

## C. Qué debería ser

> **El sistema que te dice, cada día, en qué métrica de Amazon estás perdiendo
> puntos, por qué, quién puede moverla y qué hacer — con la evidencia delante.**

Tres capas:

1. **Medir lo que penaliza** (DSC, DCR, WHC) desde datos propios y en vivo.
2. **Explicar la causa** (no "tienes 199 fallos", sino "el 44 % cae entre las 14
   y las 16 h: es la franja, no la gente").
3. **Proteger la capacidad de medir** — la parte que nadie pide y que sostiene
   las otras dos (ver oportunidad #2).

## D. Qué compraría un manager

- **Saber el lunes lo que Amazon le dirá el martes.** El reporte diario es la
  única vía; ya está descifrado.
- **Un factor 15× entre conductores en la misma ruta.** DSC por conductor va de
  1,3 % a 21,8 %. Eso es dinero y es gestionable.
- **Causas accionables**, no regañinas: mover paradas de franja horaria.
- **Que le digan qué NO mirar.** "Estos 3 están demostrablemente fuera de riesgo."
- **Defensa documental frente al renting** con la ventana de atribución de daños.

## E. Qué NO compraría

- Otro dashboard de KPIs.
- Predicciones sin respaldo. Ya se probó y se descartó el predictor de rescates.
- Un "riesgo por conductor" en un número: con esta muestra es azar con nombre.
- Impacto en euros de decisiones operativas: no hay forma de calcularlo.
- Mapa de flota: Cortex da la coordenada del **paquete**, no la de la furgoneta.

## F. Veinte oportunidades

| # | Oportunidad | Evidencia | Riesgo FP | Valor |
|---|---|---|---|---|
| 1 | **Foco de la semana** — qué métrica mover, con pesos medidos | Alta (17 scorecards) | Bajo | **Muy alto** |
| 2 | **Guardián de la ventana DSC** — reportes que se pierden en 1-3 días | Alta (131/131) | Nulo | **Muy alto** |
| 3 | **DSC por conductor con exceso** | Alta (48 136 entregas) | Bajo (compuertas) | **Muy alto** |
| 4 | **Causa raíz horaria** (comercio cerrado 14-16 h) | Alta (773 retornos) | Bajo | **Muy alto** |
| 5 | **Ficha 360** conductor/vehículo en drawer | Alta | Nulo | Alto |
| 6 | Retornos "sin causa" (18,6 %) → formación | Alta | Nulo | Alto |
| 7 | Contradicciones `DELIVERED`+`NOT_DELIVERED` (172/7d) | Alta | Nulo | Alto |
| 8 | Ventana de atribución de daños | Media | Medio | Alto |
| 9 | Daños "sin gestionar" (ni taller ni coste) | Alta | Nulo | Alto |
| 10 | Cadencia de inspección como palanca de atribución | Alta | Nulo | Medio |
| 11 | Suelo 56 h 30 m como criba de WHC | Alta | Bajo | Medio |
| 12 | Simulador de traspaso de horas | Alta (aritmética) | Nulo | Medio |
| 13 | Unificar los 4 vencimientos en uno | Alta | Nulo | Medio |
| 14 | Repetición de incidencias por vehículo | Media | **Alto** | Medio |
| 15 | Registro de eventos (audit log) | — | Nulo | Medio (habilitador) |
| 16 | Frescura de fuentes visible | Alta | Nulo | Medio |
| 17 | Huecos de datos como lista de tareas | Alta | Nulo | Medio |
| 18 | Calibrar baremo contra facturas reales | Media | Bajo | Medio |
| 19 | Libreta de portales ← "dirección no encontrada" (10,3 %) | Alta | Nulo | Bajo |
| 20 | Reconstrucción del Overall semanal | **Baja** | **Alto** | — |

## G. Las cinco más potentes

1. **Foco de la semana.** Responde "¿en qué me juego el tier?" con pesos medidos.
2. **Guardián de la ventana DSC.** Nadie lo pediría y protege todo lo demás.
3. **DSC por conductor, ordenado por exceso.** El 15× es el argumento de venta.
4. **Causa raíz horaria.** Es el momento "¿cómo sabe esto?".
5. **Ficha 360.** Colapsa 7 pantallas en 1 sin inventar nada.

## H. Tres arquitecturas alternativas

- **A · Por métrica de Amazon** — la app se organiza por lo que te penalizan
  (DSC, DCR, WHC), cada una con causa y responsables. *Vende sola; no cubre la
  operación diaria.*
- **B · Por decisión** — Hoy / Riesgos / Acciones / Memoria. *Buena para operar;
  no comunica el porqué del precio.*
- **C · Por entidad con inteligencia encima** — listas + drawer 360. *Familiar y
  potente; no cambia el modelo mental.*

**Recomendación: A como portada, C como profundidad.** B ya está medio hecho en
la portada actual.

## I. Tres conceptos visuales

- **Papel editorial claro** — tipografía como instrumento (`/lab/semana`).
- **Instrumento oscuro denso** — el panel actual.
- **Informe** — la pantalla se lee como un documento que se puede enseñar en una
  reunión con Amazon. *Es el que más encaja con vender.*

## J. Conexiones de datos aún sin explotar

- `cortex_packages.timeline.context` → **dónde se dejó cada paquete** (DSC).
- Retorno + **hora del intento** → causa raíz de franja horaria.
- `ledger.first_seen_inspection` + `daily_assignments` → ventana de atribución.
- Reporte diario (F−2) + calendario domingo-sábado → semana en curso.
- `damage.repair_status` + `workshop_id` + `actual_cost` → cubo "sin gestionar".

## K-L. Experiencias y automatizaciones nuevas

- **"Esta semana te la juegas en DSC"** con el reparto de pesos medido.
- **"Tienes 3 días-reporte a punto de perderse"** — con cuenta atrás real.
- **"Mueve estas paradas de franja"** en vez de "habla con estos conductores".
- Automatización segura: *detectar → explicar → proponer → confirmar → ejecutar*.
  Nunca ejecutar sin confirmación.

## M. Qué datos faltan

| Falta | Bloquea |
|---|---|
| Registro de eventos | Diferencial, auditoría, "qué empeora" |
| Horas **fichadas** por día | Excepción diaria de WHC |
| Posición GPS de la furgoneta | Cualquier predicción de fin de ruta |
| Facturas de reparación | € reales; calibrar el baremo |
| Contacto con el cliente | Contact Compliance (Cortex no lo captura) |
| DVIC de la scorecard | Reconstruir el Overall |

## N. Qué NO deberíamos construir

- **Predictor de rescates.** Probado sobre 702 rutas: las malas iban al 60 % a
  las 14:00, las buenas al 62 %. Indistinguibles.
- **Excepción diaria de WHC.** Ningún umbral la reproduce.
- **Lost on Road.** 20 casos contra 116 102 entregas.
- **Contact Compliance.** Sin dato de origen.
- **Overall reconstruido.** Falta DVIC.
- **Score de riesgo por persona.** Falso positivo con nombre y apellidos.

## O. Plan de experimentos

| ID | Experimento | Estado |
|---|---|---|
| E09 | **Foco de la semana** (arquitectura A) | Prototipar ahora |
| E10 | **Guardián de la ventana DSC** | Prototipar ahora |
| E11 | Informe para reunión con Amazon | Siguiente |
| E12 | Ficha 360 con datos reales del LAB | Hecho a medias (`/lab/ficha`) |

---

## Product scorecard

Evaluación de producto, no métricas de negocio. 1-10.

| | Foco semana | Guardián DSC | DSC conductor | Ficha 360 | Semana v1 (WHC) |
|---|---|---|---|---|---|
| Utilidad | 9 | 8 | 9 | 8 | 6 |
| Claridad | 9 | 9 | 8 | 9 | 8 |
| Valor económico | 9 | 8 | 9 | 6 | 5 |
| Diferenciación | **10** | **10** | 9 | 7 | 6 |
| Evidencia | 9 | 10 | 9 | 8 | 9 |
| Riesgo (10 = bajo) | 9 | 10 | 8 | 8 | 8 |
| Complejidad (10 = simple) | 8 | 9 | 7 | 6 | 8 |
| Potencial de venta | **10** | 7 | 9 | 7 | 6 |

**¿Pagaría por ello si me lo enseñaran mañana?**

- Foco de la semana — **Sí.** Contesta la pregunta cara.
- Guardián DSC — **Sí**, aunque no lo habría pedido. Protege la medición.
- DSC por conductor — **Sí.** El 15× justifica el precio solo.
- Ficha 360 — **Sí**, pero es comodidad, no argumento de compra.
- Semana v1 (WHC) — **No como titular.** Apunta a la métrica nº 3.
