# Auditoría de la Scorecard — qué está demostrado y qué no

Fecha: 2026-08-07. Fuente primaria: **17 scorecards reales de OGA5**, semanas 12
a 31 de 2026, en PDF.

Reproducible: `scripts/extraer_scorecards.py` genera
`docs/scorecard_17_semanas.json` desde los PDFs originales.

---

## 0. CORRECCIÓN DE UN ERROR PROPIO (lo primero, porque estuvo en producción)

**El módulo "DSC" que se desplegó el 2026-08-07 estaba mal etiquetado.**

Se presentó como si midiera el *Delivery Success Conditions DPMO* de Amazon.
**Es falso.** La prueba:

| | Valor |
|---|---|
| DSC DPMO real, 17 semanas | **598 – 1712** |
| En % de paquetes | **0,06 % – 0,17 %** |
| Métrica de Cortex "ubicación de riesgo" | **8,31 %** = **83.100 DPMO** |
| **Factor de diferencia** | **90 ×** |

Si Amazon contase "dejar el paquete en el jardín" como defecto de DSC, el DPMO
de este DSP sería de decenas de miles, no de 600-1700. **No pueden ser la misma
cosa.**

La métrica sigue siendo real y útil —mide un hecho comprobable y hay un factor
15× entre conductores— pero es **nuestra**, no la de Amazon. Ya está corregido
el texto de la pantalla, el subtítulo y los comentarios del código.

Cómo se detectó: extrayendo el valor real de DSC DPMO de los PDFs por
**coordenadas físicas** de la página, en vez de por orden del texto. El orden
del texto entrelaza mal las dos columnas del scorecard y hace imposible saber
qué valor pertenece a qué etiqueta.

---

## 1. MÉTODO DE EXTRACCIÓN (por qué es fiable)

`pypdf` devuelve el texto de la página 2 con las etiquetas en un bloque y los
valores en otro, desordenados. Emparejarlos por proximidad en el texto **da
resultados falsos** (en un intento anterior salieron WHC de 103,2 % y 104,3 %,
imposibles para un porcentaje de cumplimiento).

El método válido, con `pdfplumber`: se extraen las palabras **con sus
coordenadas**, se agrupan en líneas por su altura, y el valor de una etiqueta es
el primer token con forma de valor (`X|Tier`, `N/A`, `None`, `In Compliance`)
que está a su derecha y antes de que empiece la siguiente etiqueta.

Cobertura conseguida: **14 de 16 métricas en las 17 semanas** (FICO, Speeding y
VSA quedan fuera porque su valor se sitúa en otra posición del layout).

---

## 2. LO QUE ESTÁ DEMOSTRADO

### WHC — fórmula demostrada, confianza alta

```
WHC % = (conductores de la semana − conductores con excepción) / conductores
```

Test de falsación sobre las 16 semanas que traen hoja de excepciones:

| Sem | Cond | Exc | Calculado | PDF | Desviación |
|---|---|---|---|---|---|
| 12 | 55 | 1 | 98,1818 | 98,18 | 0,0018 |
| 16 | 53 | 1 | 98,1132 | 98,11 | 0,0032 |
| 25 | 53 | 1 | 98,1132 | 98,11 | 0,0032 |
| 28 | 65 | 12 | 81,5385 | 81,54 | 0,0015 |
| 31 | 69 | 2 | 97,1014 | 97,10 | 0,0014 |
| (11 más) | | 0 | 100,0000 | 100,00 | 0,0000 |

**Peor desviación: 0,0032 puntos porcentuales**, que es exactamente el redondeo
del PDF a dos decimales. **No se ha podido falsar.**

La semana 20 no entra: su PDF tiene 7 páginas y carece de la hoja de
excepciones. Su 98 % sobre 50 conductores es 49/50 exacto, coherente con la
fórmula.

**Confianza: muy alta.** Fórmula reproducida al cuarto decimal en 16 de 16 casos
comprobables, incluido el extremo de 12 excepciones.

---

## 3. LO QUE NO ESTÁ DEMOSTRADO

### El Overall Score — NO reconstruido

Se buscaron contraejemplos de dominancia estricta (una semana mejor o igual en
todas las métricas observadas y con menor Overall). **No se encontraron**, pero
eso **no demuestra nada**: con 6+ métricas comparadas, la dominancia estricta es
rara y el test tiene poca potencia. Es un resultado **neutro**, no positivo.

Un caso que sí merece atención, aunque no sea dominancia estricta:

| | S26 | S30 |
|---|---|---|
| DCR | **98,95 %** | 98,14 % |
| Contact Compliance | **98,07 %** | 95,35 % |
| Customer escalation | **0** | 31 |
| DNR DPMO | **914** | 1619 |
| DSC DPMO | **678** | 1091 |
| LoR DPMO | 32 | **0** |
| **Overall** | **82,19 · Great** | **85,92 · Fantastic** |

La S26 gana en 5 de 6 métricas observadas y saca **3,7 puntos menos** y peor
tier. O LoR pesa muchísimo, o faltan variables (FICO, Speeding, VSA) que no
hemos podido extraer, o ambas cosas.

**Veredicto: el Overall NO se puede reconstruir con los datos disponibles.**
Faltan al menos 3 métricas y todos los pesos. Cualquier fórmula que se
propusiera ahora sería inventada.

---

## 4. TABLA DE LAS 17 SEMANAS

El dataset completo está en `docs/scorecard_17_semanas.json`. Resumen de las
métricas con cobertura 17/17:

| Sem | Overall | Tier | WHC | DCR | CC | DSC DPMO | DNR DPMO | LoR | CE |
|---|---|---|---|---|---|---|---|---|---|
| 12 | 91,86 | Fantastic | 98,18 | 98,66 | 98,09 | 885 | 1089 | 0 | 0 |
| 13 | 89,22 | Fantastic | 100 | 99,20 | 98,56 | 997 | 1151 | 0 | 81 |
| 16 | 83,55 | Great | 98,11 | 99,13 | 98,66 | 1174 | 1566 | 0 | 0 |
| 17 | 94,20 | Fantastic | 100 | 98,90 | 98,17 | 598 | 718 | 39 | 0 |
| 19 | 90,70 | Fantastic | 100 | 99,08 | 98,29 | 923 | 1208 | 0 | 38 |
| 20 | 94,69 | Fantastic | 98 | 99,04 | 97,84 | 666 | 1018 | 0 | 0 |
| 21 | 91,99 | Fantastic | 100 | 99,13 | 98,33 | 632 | 869 | 77 | 0 |
| 22 | 91,60 | Fantastic | 100 | 98,98 | 98,60 | 989 | 1187 | 0 | 0 |
| 23 | 88,54 | Fantastic | 100 | 99,11 | 98,39 | 1029 | 1360 | 39 | 0 |
| 24 | 91,15 | Fantastic | 100 | 99,11 | 98,08 | 767 | 1132 | 36 | 0 |
| 25 | 91,29 | Fantastic | 98,11 | 99,12 | 98,27 | 817 | 1045 | 0 | 0 |
| 26 | 82,19 | Great | 100 | 98,95 | 98,07 | 678 | 914 | 32 | 0 |
| 27 | 86,92 | Fantastic | 100 | 98,93 | 98,06 | 695 | 1113 | 29 | 0 |
| 28 | 69,01 | **Fair** | 81,54 | 98,19 | 95,38 | 1272 | 1774 | 0 | 76 |
| 29 | 69,49 | **Fair** | 100 | 98,05 | 95,64 | 1712 | 2292 | 87 | 35 |
| 30 | 85,92 | Fantastic | 100 | 98,14 | 95,35 | 1091 | 1619 | 0 | 31 |
| 31 | 80,46 | Great | 97,10 | 97,91 | 94,97 | 814 | 1657 | 32 | 60 |

Observación sobre las dos semanas Fair: la **S29 tuvo el WHC al 100 %** y aun
así cerró en 69,49. Sus métricas malas fueron DSC 1712 (la peor de las 17), DNR
2292 (la peor) y LoR 87 (la peor). **El WHC no explica esa semana.**

---

## 5. ESTADO DE CADA MÉTRICA

| Métrica | ¿Fórmula? | ¿Datos? | ¿Predictor? | Confianza | Qué falta |
|---|---|---|---|---|---|
| WHC | ✅ demostrada | ✅ plan del portal | ✅ | **Muy alta** | nada |
| DCR | 🟡 definición clara | ✅ Cortex | ✅ en vivo | Alta | validar semana a semana contra el PDF |
| DSC DPMO | ❌ | ❌ | ❌ | — | qué cuenta Amazon como defecto |
| DNR DPMO | ❌ | ❌ | ❌ | — | reclamaciones de cliente |
| LoR DPMO | ❌ | 🟡 parcial | ❌ | — | definición y denominador |
| Contact Compliance | ❌ | ❌ | ❌ | — | Cortex no capta contactos |
| Customer escalation | ❌ | ❌ | ❌ | — | dato de Amazon |
| POD / CDF | ❌ | ❌ | ❌ | — | lo audita Amazon |
| FICO / Speeding / Mentor | ❌ | ❌ | ❌ | — | vienen de Netradyne/Mentor |
| VSA | ❌ | 🟡 inspecciones | ❌ | — | cruzar con la auditoría real |
| **Overall** | ❌ | 🟡 14/16 métricas | ❌ | — | 3 métricas + los pesos |

**Resumen honesto: de 16 métricas, 1 está demostrada (WHC), 1 es observable en
vivo con definición clara pero sin validar semana a semana (DCR), y 14 no son
reconstruibles con lo que hay.**

---

## 6. PRÓXIMOS PASOS CON VALOR REAL

1. **Validar DCR semana a semana** contra el valor del PDF, que ahora ya se
   extrae. Es el único test pendiente que puede cerrar una segunda métrica.
2. **Extraer FICO, Speeding y VSA** afinando el emparejamiento por coordenadas.
   Sin las 16 métricas completas, el Overall no se puede ni intentar.
3. **Guardar un histórico semanal** de predicción vs. real para poder medir el
   error. Hoy no existe: sin él, cualquier "predictor" es una afirmación sin
   comprobar.
4. Contrastar las definiciones oficiales de Amazon con fuentes externas
   (pendiente: la búsqueda web se agotó por límite semanal).
