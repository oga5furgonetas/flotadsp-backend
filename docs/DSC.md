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

---

# Los que vuelven a la estación, por causa

El motor de calidad ya los contaba como "fallo". Sin la causa no se puede
actuar: no es lo mismo un cliente ausente (nada que hacer) que un comercio
cerrado (orden de ruta). Medido en 14 días, **773 retornos**:

| Causa | n | % | Acción |
|---|---|---|---|
| Cliente ausente | 213 | 27,6 % | — |
| **Comercio cerrado** | **199** | **25,7 %** | Orden de ruta |
| **Sin causa registrada** | **144** | **18,6 %** | Formación: no marcan el motivo |
| Dirección no encontrada | 80 | 10,3 % | Libreta de portales |
| Reprogramado por el cliente | 39 | 5,0 % | — |
| Nada entregado en la parada | 31 | 4,0 % | — |
| Acceso imposible | 22 | 2,8 % | Libreta de portales |
| Paquete no encontrado | 11 | 1,4 % | Carga |

## El hallazgo del horario

Los fallos por comercio cerrado repartidos por hora del intento:

```
09h  11  #####
10h  26  #############
11h  24  ############
12h  25  ############
13h  17  ########
14h  26  #############   ← cierre
15h  32  ################ ← cierre
16h  29  ##############   ← cierre
17h   8  ####
18h   1
```

**El 44 % cae entre las 14 y las 16 h**, el cierre comercial del mediodía en
España. Eso no se arregla riñendo a nadie: se arregla moviendo esas paradas de
franja. Es 1 de cada 4 retornos.

El segundo accionable es que **el 18,6 % vuelve sin causa marcada**. Eso sí es
formación pura: el conductor no rellena el motivo y se pierde la información.

Rendimiento verificado: `cortex_dsc(dias=14)` end-to-end en **1 595 ms**, con
cuadre exacto (773 causas = 773 retornos).

---

# Lo que NO se puede hacer, y por qué

Investigado con datos reales de producción. No se monta nada de esto porque
sería hacer por hacer.

## Lost on Road (LoR) — no hay volumen

Aparece en 7 de las 17 semanas, así que importa. Pero los eventos de pérdida en
todo el histórico de Cortex son:

| Evento | n |
|---|---|
| `UNCOLLECTED` / `OBJECT_MISSING` | 256 |
| `BACK_TO_ORIGIN` / `OBJECT_MISSING` | 22 |
| `MISSING` / `OBJECT_MISSING` | 20 |
| `DAMAGED` | 18 |

Contra **116 102 entregados**. Una pantalla construida sobre 20 casos no
permite gestionar nada, y el **predictor de rescates ya cubre los `MISSING`**.
Duplicarlo no aporta.

## Contact Compliance — no hay dato

Cortex **no captura ni una llamada ni un SMS al cliente**. De las 48 colecciones
de la base, la única con pinta de contacto es `chat_messages`, que es el chat
interno de FlotaDSP entre gestor y conductor, no contacto con el cliente final.

Sin dato de origen no hay métrica posible. No se inventa.

## Las que dependen de sistemas ajenos

DNR DPMO, Customer Escalation DPMO, Customer Delivery Feedback y POD los mide
Amazon después, con reclamaciones y auditorías que no llegan al portal en
tiempo real. FICO, Speeding Event Rate y Mentor Adoption vienen de
Netradyne/Mentor, que son otro sistema. Ninguna es derivable desde Cortex.

## Resumen del mapa

| Métrica | Semanas en foco | Estado en FlotaDSP |
|---|---|---|
| DSC DPMO | 14 | ✅ **módulo nuevo** |
| Lost on Road | 7 | 🟡 cubierto por el predictor de rescates |
| WHC | 5 | ✅ validado 17/17 |
| Customer escalation | 5 | ❌ dato de Amazon |
| Contact Compliance | 3 | ❌ sin dato en Cortex |
| VSA Compliance | 2 | 🟡 las inspecciones ya lo alimentan |
| Mentor Adoption | 1 | ❌ otro sistema |
| Photo-On-Delivery | 1 | ❌ lo audita Amazon |
| DCR | 1 | ✅ en vivo desde Cortex |

**De las 9 métricas que penalizan a este DSP, 3 están resueltas en vivo, 2
parcialmente cubiertas y 4 son imposibles sin datos que Amazon no cede.** Las 3
resueltas cubren las semanas de foco número 1, 3 y 9 del ranking.
