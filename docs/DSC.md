# DSC — dónde se deja cada paquete

## Por qué esta métrica y no otra

De las 17 scorecards reales de OGA5 (semanas 12 a 31 de 2026), extrayendo las
"Recommended Focus Areas" de cada una:

| Métrica | Semanas en foco | Peso (nº1 = 3 pts) |
|---|---|---|
| **Delivery Success Conditions (DSC) DPMO** | **14 de 17** | **40** |
| Lost on Road (LoR) DPMO | 7 | 14 |
| Working Hours Compliance (WHC) | 5 | 10 |
| Customer escalation DPMO | 5 | 8 |
| Contact Compliance | 3 | 6 |
| VSA Compliance | 2 | 6 |
| Mentor Adoption Rate | 1 | 2 |
| Photo-On-Delivery | 1 | 1 |
| Delivery Completion Rate (DCR) | 1 | 1 |

DSC es la número 1 en 12 de las 17 semanas. El dato que lo remata: **la semana
29 tuvo el WHC al 100 % (Fantastic) y aun así el Overall fue 69,49 · Fair**, el
peor empate de las 17. Arreglar el WHC entero no habría salvado esa semana.

## De dónde salen los datos

Del propio `timeline` de `cortex_packages`, campo `context` del último evento
`DELIVERED`. **No hace falta cruzar con `cortex_events`.**

Medido en producción sobre 48 136 entregas de 7 días:

| Enfoque | Tiempo |
|---|---|
| `$lookup` a cortex_events, sin índice | **expira** (MaxTimeMSExpired) |
| `$lookup` con índice `tba+state` | 6 974 ms |
| **Desde `timeline`, sin cruce** | **602 ms** |
| Endpoint completo `/cortex/dsc` end-to-end | **911 ms** |

El índice `tba_state` que se creó para probar el `$lookup` **se borró**: no se
usa y en un Atlas de 512 MB al 58 % un índice muerto es peso muerto.

## Lo que se mide (y lo que NO)

**NO es el DPMO de Amazon.** Amazon no publica qué ubicaciones penaliza ni con
qué peso. Inventarlo sería un falso positivo con nombres y apellidos.

Lo que sí es un hecho comprobable: **dónde se dejó cada paquete**, y cuánto se
sale cada conductor de lo que haría la media de la flota con SUS entregas.

Reparto real de OGA5 (7 días, 48 136 entregas):

| Ubicación | % | Grupo |
|---|---|---|
| En mano | 49,2 % | mano |
| Punto de recogida | 27,7 % | seguro |
| En la puerta | 7,0 % | otro |
| Locker | 3,6 % | seguro |
| **Buzón** | 3,5 % | riesgo |
| **Lugar seguro** | 1,7 % | riesgo |
| **Jardín** | 1,3 % | riesgo |
| **Vecino** | 1,2 % | riesgo |
| Sin registrar | 1,1 % | otro |

**8,31 % de la flota se deja sin nadie delante.** Pero por conductor va de
**1,3 % a 21,8 %**, con muestras de cientos de entregas cada uno. Un factor de
**15×** entre gente del mismo centro y las mismas rutas. Eso es gestionable.

## La puerta anti-falso-positivo

Dos reglas, las mismas que en el motor de calidad:

1. **Mínimo 80 entregas** para entrar en el ranking. Con menos, un porcentaje
   es ruido y señalar a alguien sería injusto. Por debajo de 250 se marca
   "muestra corta" en la propia fila.
2. **Se ordena por EXCESO, nunca por porcentaje.** Un conductor con 700
   entregas al 9 % no sobra nada si la flota va al 8,31 %; otro con 200 al 20 %
   sobra 23 paquetes. Ordenar por tasa bruta castigaría al de poco volumen.

## Las contradicciones

`state = DELIVERED` con `raw = NOT_DELIVERED` en el mismo evento: el paquete
figura entregado y el registro crudo dice lo contrario. **172 casos en 7 días.**
No es una interpretación, es el dato contradiciéndose a sí mismo — por eso se
puede afirmar sin riesgo. Es el material del que salen los DNR y las
escalaciones.

## Bugs reales encontrados montando esto

1. **`list()` sobre un cursor de Motor.** El backend es async: `aggregate()`
   devuelve `AsyncIOMotorLatentCommandCursor`, que no es iterable. Reventaba al
   abrir la pantalla. Va con `await ... .to_list(length=N)` y con `length`
   explícito y holgado (un `to_list` sin tope corta EN SILENCIO — ya pasó con
   los backups).
2. **`_cx_nombres()` devuelve un dict**, no una cadena: `{nombre, ficha_id,
   activo, origen}`. Usarlo tal cual pintaba `[object Object]`. De paso se
   aprovecha `ficha_id` para poder enlazar con la ficha del conductor.
3. **`cortex_events` no tenía índice por `tba`** — 186 656 documentos y solo
   `_id` y `expira_en`. Irrelevante para este módulo (que no lo lee), pero
   documentado por si algún día hace falta consultarlo.
