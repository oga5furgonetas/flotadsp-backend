# Auditoría de la Scorecard de Amazon — qué está demostrado y qué no

Fecha: 2026-08-08. Sustituye a la versión del 2026-08-07.

**Fuente primaria: 85 scorecards reales** (97 PDFs, 12 duplicados exactos), DSP
TDSL, **10 centros** (DCT4, DCT9, DGA1, DGA2, DIC1, DMA3, DQA4, DQB9, OGA5,
OML1), semanas 12 a 31 de 2026. La versión anterior trabajaba con 17 scorecards
de un solo centro.

Reproducible:

```bash
python scripts/extraer_scorecards.py    # PDFs -> docs/scorecards.json
```

```bash
python scripts/scorecard_analisis.py    # -> docs/scorecards_analisis.txt
```

---

## 0. QUÉ CAMBIA RESPECTO A LA AUDITORÍA ANTERIOR

| Afirmación anterior | Estado |
|---|---|
| «Cobertura: 14 de 16 métricas. FICO, Speeding y VSA quedan fuera» | **Corregido.** 16/16, sin huecos. |
| «El Overall no se puede reconstruir: faltan al menos 3 métricas y todos los pesos» | **Conclusión correcta, diagnóstico equivocado.** No faltaban esas 3 (ya se extraen). Lo que falta es otra cosa — ver §5. |
| El enigma S26 vs S30 de OGA5 («gana en 5 de 6 métricas y saca 3,7 puntos menos») | **Resuelto, y era un artefacto.** Ver §4. |
| «DSC DPMO: definición desconocida» | **Corregido.** El propio PDF la define (§2.4). Y confirma que el módulo DSC de FlotaDSP no mide el DSC de Amazon: sigue en pie la corrección del 2026-08-07. |
| WHC: fórmula demostrada | **Se mantiene**, y ahora además se conoce su umbral de tier. |

Lo importante: **la auditoría anterior no había leído las páginas 6, 7 y 8 del
PDF**, donde Amazon publica sus propios umbrales y las definiciones de cada
métrica. Ahí estaba casi todo lo que faltaba.

---

## 1. EXTRACCIÓN — 16/16 métricas, con dos controles de integridad

`extract_text()` entrelaza las **dos columnas** de la página 2 y pega el valor
de una métrica a la etiqueta de otra. El extractor trabaja por **coordenadas**:
parte la página en dos columnas por x=296, agrupa palabras en líneas por altura,
y dentro de cada (línea, columna) la etiqueta es una secuencia contigua de
tokens conocida y el valor es lo que queda a su derecha. Siempre casa la
etiqueta **más larga** primero (`Capacity Reliability` es subsecuencia de
`Next Day Capacity Reliability`; sin esto, dos centros daban valores cruzados).

Cobertura sobre las 85 scorecards:

| | Resultado |
|---|---|
| Tier presente | **16/16 métricas, 85/85 scorecards (100 %)** |
| Valor numérico ausente pero con tier real | **0 casos** |
| Métricas con pinta de valor sin etiqueta reconocida | **0 casos** |

Los huecos numéricos que quedan **no son fallos de extracción**: son `N/A` en el
propio PDF (CDF desaparece a partir de la semana 21, POD a partir de la 24;
BOC siempre es `None` y CAS siempre `In Compliance`).

**Control de integridad independiente:** el PDF pinta cada valor con el color de
su tier (azul Fantastic, verde Great, naranja Fair, rojo Poor). Se leyó el color
de relleno de cada carácter y se comparó con el tier escrito:
**0 discrepancias en las 1.055 celdas comparables**. Si el emparejamiento
etiqueta-valor estuviera mal en algún sitio, esto lo habría cazado.

---

## 2. LO QUE ESTÁ DEMOSTRADO

### 2.1 La regla de tier de cada métrica — confianza muy alta

Cada PDF publica en su página de *Performance Standards and Service Levels* un
**Target** y un **Minimum** para cada métrica. Hipótesis puesta a prueba:

```
Fantastic  <=>  el valor cumple el Target
Poor       <=>  el valor no llega al Minimum
```

| Métrica | n | Fantastic⇔Target | Poor⇔bajo Minimum |
|---|---|---|---|
| fico, speeding, mentor, vsa, ce_dpmo | 84 c/u | 100 % | 100 % |
| whc, dcr, lor_dpmo, dsc_dpmo, cc, capacity | 85 c/u | 100 % | 100 % |
| pod | 37 | 100 % | 100 % |
| cdf | 17 | 100 % | 100 % |
| **TOTAL** | **984** | **984/984** | **984/984** |

**Cero contraejemplos en 984 observaciones.** No se ha podido falsar.

Esto es lo que explica por qué los cortes «globales» de la auditoría anterior
salían solapados: **los umbrales no son globales.** DCR, DSC y DNR llevan
umbrales **por estación** (el PDF lo dice: *«Thresholds are set at the station
level to account for regional differences»*) y cambian también por semana:

| Métrica | Valores distintos de Target entre los 10 centros |
|---|---|
| DSC DPMO | **17** (de 500 a 1070) |
| DCR | **7** (97,75 % a 99 %) |
| DNR DPMO | **8** (1000 a 1300) |
| POD, LoR, Capacity, CDF | 2 cada una (cambian a mitad de temporada) |
| VSA, FICO, CC, Speeding, Mentor, CAS, WHC | 1 (fijos) |

Salvedad honesta: WHC y Mentor **no aparecen** en la tabla SLS. Su Target sí
está publicado en las definiciones (WHC 100 %, Mentor 90 %); el Minimum de WHC
(95) es el corte medido, no publicado, y el de Mentor es un supuesto nuestro.

### 2.2 El corte Great|Fair — parcial

Amazon publica dos de los tres cortes. El intermedio no lo publica. Ajustando
la posición `q` dentro de la banda Minimum→Target:

| Métrica | n | q | Errores |
|---|---|---|---|
| whc | 21 | 0,380 | **0** |
| vsa | 13 | 0,406 | **0** |
| lor_dpmo | 26 | 0,506 | **0** |
| cc | 62 | 0,657 | **0** |
| ce_dpmo | 40 | 0,711 | **0** |
| pod | 12 | 0,731 | **0** |
| **dsc_dpmo** | 48 | 0,599 | **4 — falsado** |
| **dcr** | 46 | 0,714 | **8 — falsado** |

Para seis métricas hay un corte limpio. Para **DCR y DSC no existe ningún `q`
constante que funcione**: su tercer umbral tampoco es una fracción fija de la
banda. Es un dato que no tenemos.

### 2.3 Los cortes del propio Overall — demostrados

| Tier | n | Rango observado |
|---|---|---|
| Fair | 28 | 52,53 – 69,74 |
| Great | 36 | 70,17 – 84,67 |
| Fantastic | 21 | 85,92 – 94,69 |

Cortes: **Fantastic ≥ 85**, **Great ≥ 70**, y la tabla SLS publica para
*Scorecard Performance* **Target 85 / Minimum 50**. El 85 medido coincide
exactamente con el 85 publicado. No hay ninguna scorecard en Poor, así que el
corte 50 es del PDF, no medido.

### 2.4 DNR DPMO NO cuenta para el Overall — demostrado

El PDF avisa: *«Metrics highlighted in red are for visibility only and do not
impact final DSP Scores/Tiers»*. Leyendo el color de las etiquetas:

- **La etiqueta de DNR DPMO está en rojo puro en 85/85 scorecards.** Es la
  única etiqueta roja que existe en todo el corpus.
- El rojo también se usa para los *valores* de tier Poor, así que había
  ambigüedad. **Test discriminante:** hay **21 scorecards sin ninguna métrica en
  Poor** que llevan igualmente el aviso. Si el aviso hablara de los valores
  Poor, en esas 21 no tendría a qué referirse. Habla de la etiqueta de DNR.
- Coherente: DNR es la **única** métrica visible que no tiene fila propia en la
  tabla SLS.

### 2.5 WHC — se mantiene lo anterior

```
WHC % = (conductores − conductores con excepción) / conductores
```

16/16 semanas comprobables reproducidas al cuarto decimal, peor desviación
0,0032 pp (el redondeo del PDF). Y ahora se sabe además que su Target es 100 %:
**solo el 100 % da Fantastic**, confirmado en 85/85.

### 2.6 Definiciones oficiales, ya no hace falta buscarlas fuera

Estaban en las páginas 7-8 de cada PDF. Las relevantes:

- **DSC DPMO**: concesiones DNR que caen en 8 causas raíz (entregado a un
  vecino, a un familiar, a recepción, a más de 25 m, sin foto, sin seguir
  preferencias del cliente, con parada de grupo simultánea), por millón de
  paquetes **entregados**.
- **LoR DPMO**: despachados y no entregados ni devueltos, por millón
  **despachados**.
- **VSA**: auditorías pasadas / auditorías totales de **las dos semanas
  anteriores** (WK-2 y WK-1), no de la semana en curso.
- **CE DPMO**: violaciones cuentan **triple**, defectos simple, y con **4
  semanas de retraso** (la semana 45 refleja la 41).
- **Contact Compliance**: llamadas y SMS por la app Flex sobre paquetes
  entregados con contacto más los no entregados por UTA/UTL/NSL.
- **Capacity Reliability**: % de días con ≥100 % de fiabilidad por tipo de
  servicio, descontando cancelaciones causadas por Amazon.

---

## 3. EL OVERALL SCORE — NO reconstruido

Se formularon y atacaron cinco familias. Resultados **fuera de muestra**, con
ventana móvil (entrenar solo con semanas anteriores, predecir la siguiente),
61 predicciones:

| Modelo | MAE | RMSE | Peor error | Acierto de tier |
|---|---|---|---|---|
| persistencia (semana anterior) | 7,830 | 10,042 | 25,45 | 52,5 % |
| media histórica | 10,356 | 11,812 | 26,07 | 41,0 % |
| lineal en p (min→target) | 3,521 | 4,346 | 10,40 | 68,9 % |
| bandas 50/70/85, pesos libres | 3,378 | 4,322 | 9,89 | 68,9 % |
| bandas 50/70/85, media ponderada real | 3,102 | 3,997 | 9,62 | 70,5 % |
| lineal en el tier ordinal | 2,986 | 3,813 | 9,62 | 75,4 % |
| **multiplicativa (log-log)** | **2,651** | **3,432** | **9,62** | **82,0 %** |

Desviación típica del Overall: 10,54. Es decir, el mejor modelo explica bastante
— pero **el Overall se publica con dos decimales**. Tener la fórmula significa
un error de ~0,005 puntos, como pasa con WHC. Estamos **500 veces peor**.

### Hipótesis destruidas

**H1 — «el Overall es función solo del vector de tiers»: FALSADA.**
Siete pares de scorecards con **tiers idénticos en las 10 métricas puntuables**
y Overall distinto. Los más limpios:

| Par | Overall |
|---|---|
| DCT9-W27 / DQA4-W27 | 62,86 vs 63,85 |
| DQA4-W28 / DQA4-W29 | 58,34 vs 59,71 |
| DGA1-W15 / DGA2-W28 | 83,61 vs 79,06 |

Hay componente continua: el tier no basta.

**H3 — «media ponderada donde el Target vale 85 y el Minimum 50»: no
concluyente, y probablemente casualidad.**
Era una predicción numérica limpia: al ajustar `Overall = a + Σ bᵢ·pᵢ` debía
salir `a≈50` y `Σb≈35`. Salió **a = 46,00 y Σb = 36,81**, sospechosamente
cerca. Pero el ajuste es malo (MAE 3,48 dentro de muestra, peor error 11,13) y
tiene coeficientes negativos donde no debería (FICO −1,39). Con 11 parámetros y
47 puntos, esa coincidencia no soporta peso. **No se acepta.**

**H5 — «media ponderada de puntuaciones por bandas, pesos ≥0 que suman 1»:
insuficiente.** MAE 2,28 dentro de muestra, 3,10 fuera. Los pesos que salen
(DCR 0,25, DSC 0,19, CE 0,12, VSA 0,10…) son plausibles pero no reproducen nada.

**Los «Recommended Focus Areas» no son las 3 métricas peor posicionadas:
FALSADO.** El PDF lista las 3 métricas prioritarias — el ranking del propio
Amazon. Predecirlas como «las 3 con menor p» acierta el **conjunto en el 49 %**
de los casos y el **orden en el 13,7 %**. Sea cual sea la puntuación interna por
métrica, **no es la posición lineal entre Minimum y Target**.

---

## 4. EL ENIGMA S26 vs S30 ERA UN ARTEFACTO

La auditoría anterior lo presentaba como la prueba de que faltaba algo grande.
Con las 16 métricas y sabiendo que DNR no puntúa:

| Métrica | OGA5-W26 | OGA5-W30 |
|---|---|---|
| VSA | **94,44 · Poor** | **100 · Fantastic** |
| LoR DPMO | 32 · Great | **0 · Fantastic** |
| CE DPMO | **0 · Fantastic** | 31 · Great |
| DSC DPMO | **678 · Great** | 1091 · Fair |
| Contact Compliance | **98,07 · Fantastic** | 95,35 · Fair |
| DCR | 98,95 · Fantastic | 98,14 · Fantastic |
| DNR DPMO | 914 | 1619 | *(no puntúa)* |
| **Overall** | 82,19 · Great | **85,92 · Fantastic** |

La S26 no ganaba «5 de 6»: **estaba en Poor en VSA**, la métrica que la
auditoría anterior no sabía extraer, y se le daba crédito por un DNR que no
cuenta. Salto de tres niveles de tier en VSA y dos en LoR contra tres ventajas
de un nivel. No hace falta ninguna variable oculta para explicarlo.

---

## 5. POR QUÉ NO SE CIERRA EL OVERALL (razones concretas, no excusas)

1. **Hay una métrica puntuada que el scorecard no enseña.** *DVIC Compliance*
   tiene Target 95 % y Minimum 90 % en la tabla SLS de **85/85** scorecards, y
   aparece en las definiciones como parte del bloque de Safety. **No se muestra
   en ninguna página de ninguna scorecard: 0/85.** Es una entrada del cálculo
   que no podemos observar.
2. **El tercer umbral (Great|Fair) no se publica**, y para DCR y DSC ni siquiera
   es una fracción fija de la banda conocida.
3. **El residuo depende del centro.** F entre centros = 3,35 sobre el mejor
   modelo; DGA1 se queda sistemáticamente +2,17 puntos y DIC1 −1,74. Eso es la
   firma de una variable de estación que no estamos viendo.
4. **La escala del scorecard cambió a mitad de temporada.** CDF desaparece tras
   la semana 20 y POD tras la 23; los umbrales de POD, LoR, Capacity y CDF
   cambian a la vez. El conjunto de métricas puntuables no es el mismo en las 20
   semanas, lo que parte el corpus en tres regímenes de 17, 20 y 48 scorecards.

**Veredicto: el Overall NO está reconstruido y con estos datos no puede
estarlo.** Lo que sí hay es un predictor con MAE 2,65 y 82 % de acierto de tier
fuera de muestra — útil para avisar, insuficiente para afirmar un número.

---

## 6. HALLAZGO SIN CERRAR: las páginas 3-4

Cada scorecard trae una tabla **por conductor** (Transporter ID, paquetes
entregados, DCR, DSC DPMO, LoR DPMO, POD, CC, CE, CDF DPMO) que no se había
usado. Agregándola sobre las 17 semanas de OGA5:

| Métrica del DSP | Agregación probada | Desviación media | Peor |
|---|---|---|---|
| DCR | Σentregados / Σdespachados | 0,196 pp | 0,66 |
| DSC DPMO | media ponderada por entregados | 39,1 DPMO | 183,7 |
| LoR DPMO | media ponderada por despachados | 9,6 DPMO | 39,0 |

Se acerca pero **no cuadra**, y no es un fallo de parseo (se comprobó: 0 filas
descartadas). O la población de conductores de la tabla no es la misma que la
del cálculo del DSP, o el denominador es otro. **Sin resolver.**

---

## 7. ESTADO DE CADA MÉTRICA

| Métrica | ¿Umbral de tier? | ¿Fórmula? | ¿Datos propios? | Confianza |
|---|---|---|---|---|
| WHC | ✅ Target 100 % (85/85) | ✅ demostrada | ✅ plan del portal | **Muy alta** |
| VSA | ✅ 98,5 / 96 (84/84) | ✅ definición oficial | 🟡 inspecciones | Alta |
| DCR | ✅ por estación (85/85) | ✅ definición oficial | ✅ Cortex | Alta |
| DSC DPMO | ✅ por estación (85/85) | ✅ definición oficial | ❌ concesiones | Media |
| CC | ✅ 98 / 95 (85/85) | ✅ definición oficial | ❌ | Media |
| LoR DPMO | ✅ (85/85) | ✅ definición oficial | 🟡 parcial | Media |
| CE DPMO | ✅ (84/84) | ✅ definición oficial | ❌ dato de Amazon | Media |
| POD | ✅ (37/37) | ✅ definición oficial | ❌ | Media |
| FICO / Speeding / Mentor | ✅ (84/84) | ✅ definición oficial | ❌ Netradyne/Mentor | Media |
| Capacity | ✅ (85/85) | ✅ definición oficial | ❌ Okami | Media |
| CDF | ✅ (17/17) | ✅ definición oficial | ❌ | Media |
| **DNR DPMO** | — | ✅ definición oficial | ❌ | **No puntúa** |
| **DVIC** | ✅ 95 / 90 publicado | ✅ definición oficial | 🟡 inspecciones | **No visible** |
| **Overall** | ✅ 85 / 70 / 50 | ❌ | 🟡 | **No reconstruible** |

De 16 métricas visibles: **13 tienen su regla de tier demostrada al 100 %**,
1 no puntúa (DNR), 2 son constantes (BOC siempre `None`, CAS siempre
`In Compliance`).

---

## 8. QUÉ SE PUEDE HACER YA CON ESTO

1. **Predecir el tier de cada métrica es ahora exacto**, no aproximado: basta
   comparar el valor con el Target y el Minimum de la propia estación. Es la
   parte del scorecard que FlotaDSP puede reproducir sin margen de error.
2. **Guardar los umbrales por estación y semana.** Cambian, y son la mitad del
   cálculo. Ya salen en `docs/scorecards.json`.
3. **No prometer el Overall.** Como mucho, una banda: «entre X e Y, tier
   probable Z», con el 82 % de acierto medido, no inventado.
4. **VSA mira las dos semanas anteriores**, no la actual. Cualquier alerta que
   se construya sobre inspecciones tiene que respetar ese desfase.
5. **CE DPMO va con 4 semanas de retraso.** Un pico de escalaciones de esta
   semana no aparece hasta dentro de un mes.

### Siguientes pasos con valor real

1. Cerrar la agregación por conductor de §6: es la vía para predecir DCR, DSC y
   LoR **antes** de que llegue la scorecard.
2. Conseguir scorecards de semanas donde alguna métrica caiga a Poor en DCR o
   DSC dentro del mismo grupo de umbrales: acotaría el corte Great|Fair que hoy
   está falsado.
3. Comprobar si DVIC aparece en algún otro informe del portal. Es la única
   entrada conocida del Overall que hoy no se ve.
