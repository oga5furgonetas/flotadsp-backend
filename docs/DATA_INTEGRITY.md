# Integridad de datos

> Los datos son un activo del negocio, no un subproducto. La base de datos **no
> contiene la verdad por defecto**: contiene lo que se ha escrito, incluidos los
> errores. Este fichero registra cada tipo de corrupción encontrado, cómo se
> corrigió y **qué impide que vuelva a entrar**.
>
> Regla: encontrar un tipo de corrupción obliga a hacer las **dos** cosas —
> corregir lo que hay, e impedir que vuelva. Solo lo primero es limpiar; solo lo
> segundo es dejar la basura dentro.

---

## Cómo se clasifica una anomalía

| Clase | Qué significa | Qué se hace |
|---|---|---|
| `SAFE_TO_AUTOCORRECT` | Regla determinista, evidencia suficiente, reversible, sin ambigüedad, verificable | Se corrige y se verifica |
| `NEEDS_REVIEW` | Falta una decisión que solo puede tomar una persona | Se explica exactamente qué decisión falta |
| `HIGH_RISK` | Irreversible, económicamente relevante o legalmente sensible | Nunca en automático |
| `UNKNOWN` | No hay evidencia suficiente para clasificarlo | Se sigue investigando; **no se toca** |

Las cinco condiciones de `SAFE_TO_AUTOCORRECT` se cumplen **todas** o no se
corrige. Que se cumplan cuatro no basta.

---

## Corrupciones encontradas y cerradas

### 1 · Matrículas dadas de alta dos veces

**Encontrado** 2026-08-30. 24 matrículas repetidas, 28 fichas de más, y **cinco
con más de una ficha viva**.

**Por qué importa.** El daño no es el duplicado: es que **el historial se parte**.
La 9873LTX tenía 19 registros en una ficha y 14 en otra — ni sus daños, ni su
coste, ni sus inspecciones eran ciertos en ninguna de las dos. Y 38 slots del
cuadrante apuntaban a fichas duplicadas, así que «qué furgoneta lleva esta
persona» dependía de cuál tocara el sistema esa mañana.

**Causa.** Gotcha 9 aplicado a `vehicles`: alta sin índice único sobre la
matrícula. Una importación repetida o dos personas dando de alta lo mismo crean
fichas paralelas. La matrícula además viene escrita de dos maneras
(`9886 NFX` y `9886NFX`), así que comparando el texto crudo no se ven.

**Corregido.** Las cinco fusionadas: 18 registros repuntados, 0 huérfanos, 0
slots colgando. Respaldo en `app_meta/respaldo_fusion_vehiculos`. Cada ficha
absorbida guarda `merged_into`.

**Prevención.** `POST /vehicles` devuelve **409** si la matrícula normalizada ya
existe entre las vivas. Probado con las tres variantes (con espacio, sin espacio,
en minúsculas). El smoke test vigila que `parten_historial == 0`.

---

### 2 · Kilometrajes imposibles

**Encontrado** 2026-08-30. 66 lecturas imposibles de 2.517 en `mileage_history`.

**Por qué importa.** Con esos picos dentro, el ritmo salía entre **-6.350 y
+7.616 km/día**: no se podía predecir cuándo toca el aceite, ni saber qué
furgoneta está parada, ni cuál hace más kilómetros de la cuenta. Un solo pico
envenena la serie entera de esa furgoneta. Tras limpiar, va de **21 a 281**, con
mediana 114.

**Causa.** Dos errores humanos, no de la app:
- un dígito de más o de menos: `611105` por `61110`, `253030` por `25303`
- el cuentakilómetros **parcial** en vez del total: 350, 500, 25, 170 km

`_odo_validar` ya rechazaba lo imposible, pero se puso **después** de que
entrara la basura. Y el admin puede corregir a mano a propósito, saltándose esa
validación (para poder arreglar históricos corruptos).

**Corregido.** 66 lecturas marcadas `descartada` con su motivo, en 18 furgonetas.
No se borró ninguna. Respaldo completo en `app_meta/respaldo_odometro`.

**Prevención.** `/vehicles/odometro/sospechosas` las detecta con la regla de la
**cadena válida más larga**, y el smoke test vigila que sea 0. Cubierto por
`backend/tests/test_odometro.py`, 8 casos.

**Lo que se aprendió del algoritmo, que costó dos intentos:**

| Intento | Por qué falló |
|---|---|
| Comparar con la lectura anterior | Un pico marca **también** el dato bueno de detrás, porque respecto al pico ha «bajado». Se limpiaba el error y se tiraba el dato correcto. |
| Comparar con el último bueno + confirmación | La 2851 NGX tiene **cuatro** lecturas malas seguidas que se confirman entre ellas. El algoritmo se dejaba convencer y marcaba como mala la serie buena entera. |
| **Cadena válida más larga** ✓ | Cuatro lecturas malas no ganan a veintiséis buenas. **Es la mayoría la que define qué es normal, no el vecino.** |

Y los días se cuentan **desde que se vio ese kilometraje por primera vez**: el
cuentakilómetros se queda pegado entre inspecciones, y contando de un día para
otro un estancamiento de nueve días parece un salto imposible.

---

### 3 · Conductores duplicados

**Encontrado** ya conocido (gotcha 15), quedaba **uno** sin resolver.

**Por qué importa.** El cuadrante apunta a una ficha y el login del portal
resuelve por correo con `find_one`, que devuelve la que Mongo tenga primero.
Costó un día de operación el 19-08: cinco conductores en ruta viendo «no tienes
furgoneta asignada».

**Corregido.** Fusionado. `/drivers/duplicados` devuelve 0 y el smoke lo vigila.

**Prevención.** La fusión empareja **solo por correo**, nunca por nombre: dos
tocayos acabarían uno auditando la furgoneta del otro.


### El DCR se calcula con el estado equivocado — P0, ABIERTO

**Encontrado** 2026-08-30, reconciliando contra una captura de Cortex.

**El hecho.** Cortex, para el viernes 28-08-2026 en OGA5, dice **130 paquetes
devueltos a la estación**. Nuestro cálculo del mismo día da **35**.

**La causa, confirmada.** Guardamos el estado **vigente** de cada paquete, y
Amazon cuenta el del **día**. Un paquete devuelto el viernes y entregado el
lunes figura hoy `DELIVERED` en nuestra base y sigue contando como devuelto en
la casilla del viernes de Cortex.

Medido sobre los 6.843 paquetes de ese día:

| Forma de contar los devueltos | Sale |
|---|---|
| Estado vigente hoy | 35 |
| Estado al cierre del día | 53 |
| **Pasaron por devuelto ese día** | **159** |
| **Cortex** | **130** |

Y la prueba directa: **de los que pasaron por `BACK_TO_ORIGIN`, 103 figuran hoy
como `DELIVERED`**.

**Por qué es P0.** El DCR que enseña la app **sube solo con el paso de los
días**, sin que mejore nada: los devueltos se van reentregando y salen de la
cuenta. Consecuencias:

1. El número nunca cuadra con el que puntúa Amazon.
2. El aviso de caída del DCR se dispara tarde o no se dispara.
3. Una semana mala parece que se arregla sola al mirarla más tarde.

Es exactamente el tipo de cálculo incorrecto que produce decisiones operativas
equivocadas.

**Lo que aún es `UNKNOWN`.** Cuál de las tres formas usa Amazon exactamente.
Ninguna cuadra al número: 130 está entre «al cierre» (53) y «pasaron por ahí»
(159). Con **una sola captura no se puede determinar la regla**. Hacen falta
capturas de más días para calibrar antes de dar el número por bueno.

**Además, sin explicar todavía:**
- Cortex ve **46 rutas** y nosotros guardamos **45**: falta una entera.
- Cortex tiene **46 en «Restante»**, que según Dani son también devoluciones
  (cuentas que no dejaron cerrar por exceso de paquetes). Nuestros estados sin
  cerrar de ese día suman 21.

---

## Anomalías descartadas tras investigarlas

Se registran porque **una falsa alarma repetida cuesta tiempo cada vez**.

| Sospecha | Veredicto | Por qué |
|---|---|---|
| `ai_feedback` con todos los `tipo` a null | **Falsa alarma** | No existe el campo `tipo`. Los campos son `verdict` (correct/corrected/missed/wrong), `scope`, `damage`. Mismo error que el gotcha 33. |
| Turnos con fecha en noviembre | **Legítimo** | Días libres aprobados con antelación (`cod: N/T APROB`, `type: libre`, con su `aprobado_req`). |
| `analysis_status` a cero | **Falsa alarma** | Vale `"ok"`, no `"done"`. Gotcha 33. |
| `driver_accounts` vacía | `UNKNOWN` | El acceso vive en `global_db.admin_users` (13 usuarios). Los conductores no tienen cuenta individual. **Falta confirmar cómo entran al portal**, si es que entran. |

**Regla que sale de aquí:** antes de afirmar que un campo está vacío o a cero,
mirar qué valores tiene de verdad (`$group` por él, sin filtrar). Un filtro por
un valor que no existe no da error: da cero, y cero parece un hallazgo.

---

## Anomalías abiertas

### Furgonetas en taller sin `taller_desde` — P1

**13 de 13** furgonetas marcadas `status: "taller"` no tienen la fecha de
entrada, así que `/work-orders/paradas` no puede decir cuánto llevan — que es
justo el número que hace que alguien las mire.

**Medido:** según la incidencia de entrada, son **441 días-furgoneta**
acumulados. Mediana 37 días, máximo 54.

**Clasificación:** `SAFE_TO_AUTOCORRECT` con matices. La fecha es recuperable de
la incidencia «Vehículo en taller — [matrícula]», que existe para las 13 y
coincide con `updated_at` en 10 de 13. Las 3 que discrepan es porque la ficha se
tocó después por otra cosa: **la incidencia es la fuente fiable**, porque es el
evento que marca la entrada.

**Cuidado:** una de ellas (4453 NKC) tiene como incidencia más reciente una
distinta («4453 NKC + CARTER»), así que hay que buscar **la de entrada a
taller**, no la última. Coger la última pondría una fecha equivocada que parece
medida.
