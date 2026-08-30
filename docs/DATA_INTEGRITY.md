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


### El DCR se calculaba con el estado equivocado — P0, CERRADO HACIA DELANTE

**Encontrado** 2026-08-30 reconciliando contra una captura de Cortex.
**Calibrado** el mismo día con cuatro capturas (26 a 29 de agosto).

**El hecho.** Guardamos el estado **vigente** de cada paquete y Amazon cuenta el
del **día**. Un paquete devuelto el viernes y reentregado el lunes figura hoy
`DELIVERED` en nuestra base, y sigue contando como devuelto en la casilla del
viernes de Cortex.

Con un solo día no se podía determinar la regla: 130 caía entre «al cierre» (53)
y «pasaron por ahí» (159), y se dejó abierto a propósito en vez de elegir un
número que cuadrara por casualidad. Con cuatro días la regla aparece sola, y no
es cuál de las tres formas de contar: **es el tiempo**.

| día | Cortex ve | nosotros veíamos | perdido |
|---|---|---|---|
| 29-08 (1 día) | 95 | 83 | 13 % |
| 28-08 (2 días) | 130 | 34 | 74 % |
| 27-08 (3 días) | 144 | 4 | **97 %** |
| 26-08 (4 días) | 97 | 6 | 94 % |

El error no depende del criterio: **crece con la antigüedad del día**. Y la
prueba directa: de los 80 paquetes que el 27-08 pasaron por `BACK_TO_ORIGIN`,
**78 figuran hoy como `DELIVERED`**.

**Por qué era P0.** El DCR que enseñaba la app **subía solo con el paso de los
días** sin que mejorara nada. Una semana mala parecía arreglarse sola al mirarla
más tarde, y el número no cuadraba nunca con el que puntúa Amazon.

**Lo que NO se pudo hacer: reconstruir el pasado.** El `timeline` no guarda todos
los saltos —para el 28-08 da 155 donde Cortex dice 130, porque recoge también
vueltas de otros días—. Los días anteriores al 30-08-2026 están **perdidos**, y
así se dicen: salen marcados «sin foto» en la pantalla y su DCR se enseña como
`≥`, porque es un suelo, no una medida.

**Lo que sí se hizo: dejar de perderlo.** `_bucle_congelar` guarda cada media
hora, de 17:00 a 04:00, la foto del día en `cortex_day_snapshots`, y se queda con
la que **más fallos** tenga. Funciona sin saber a qué hora cierra cada centro,
que es justo el dato que no tenemos: la erosión solo borra fallos, nunca los
añade, así que el máximo observado es el pico real.

Dos guardas que no son obvias, probadas en `test_congelar_dia.py` (14 casos):

- una foto de media tarde **no** pisa a una de día cerrado ni con más fallos —a
  media tarde hay paquetes contados como fallo que aún se van a entregar—;
- de un día con más de un día de antigüedad **no se crea foto nueva**, porque ya
  está erosionado. Guardarlo daría un número que además **parecería medido**, y
  un hueco se ve mientras que un dato falso no.

**Verificado end to end** el 30-08: se insertó una foto de prueba en el 27-08 y
el scorecard pasó de 14 a 152 fallos con `congelado: true`; al retirarla volvió a
14. Las dos fotos que quedan (29 y 30 de agosto) están medidas.

**Lo que sigue abierto.** Si el máximo observado coincide con lo que puntúa
Amazon. La primera foto comparable será la del 31-08: hasta entonces no hay un
día capturado desde su propia tarde. Se contrasta pidiendo a Dani la captura de
Cortex de ese día — **un día bien capturado vale más que cuatro reconstruidos**.

**Corregido de lo que se había afirmado antes:**

- *«Cortex ve 46 rutas y nosotros guardamos 45».* Falso: la consulta que lo midió
  no filtraba por centro y mezclaba las rutas `CA_*` de **DGA1** con las `XA_*`
  de OGA5. El campo `center` está bien guardado y el backend filtra por `$regex`
  como manda el gotcha 6.
- *«El DCR se desplomó el viernes 28».* Falso, y era este mismo bug: Cortex ve
  97 / 144 / 130 / 95 devueltos los días 26 a 29. El viernes no fue peor que el
  jueves — **no hubo pico**, había un contador que se vaciaba solo.
- *«La alerta de caída del DCR da falsos positivos sistemáticos».* Falso. Se
  midió el sesgo de madurez con las listas de estados reales del backend: **+0,14
  pp de media, peor caso +1,04**, por debajo del umbral de 1,5 pp. Ninguno de los
  15 días evaluables dispararía por esa causa. La alerta está sana; lo que estaba
  mal era el script que la juzgó (gotcha 40).

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

---

### 4 · El centro escrito de varias formas

**Encontrado** 2026-08-30, revisando los avisos del gotcha 6.

**Lo que se esperaba encontrar.** 33 consultas filtran el centro por igualdad
cuando el gotcha 6 manda `$regex`. Se midió antes de tocar nada: **ninguna de
esas colecciones está sucia hoy**, y `vehicles` —la que originó el gotcha—
tampoco. Los 33 avisos aciertan.

**Lo que se encontró de verdad.** Que aciertan **por suerte, no por diseño**. Se
corrigió el dato y se esquivó en la lectura, pero nunca se previno: hay **148
sitios que escriben el centro y solo dos lo normalizan**.

Y al mirar las 37 colecciones con campo `center` en vez de solo las 14 que salían
en el análisis del código, aparecieron **dos partidas en dos** que nadie veía —
precisamente porque nadie las filtraba por igualdad:

| Colección | Formas | Efecto |
|---|---|---|
| `maintenance_log` | `'OGA5'` (4) y `'AMZL OGA5 SANTIAGO XPT'` (5) | **5 de 9 registros invisibles** |
| `ordenes_trabajo` | `'OGA5'` (1) y `'AMZL OGA5 SANTIAGO XPT'` (1) | La mitad fuera |

El historial de mantenimiento de OGA5 llevaba **el 56 % oculto**.

**Corregido.** 6 documentos unificados, verificado a 0, respaldo en
`app_meta.respaldo_centros`.

**Prevención.** `/checkers/centros` **descubre solas** las colecciones con campo
`center`, así que cubre también las que aún no existen — que es la parte que
importa, porque el fallo de esta familia siempre aparece donde no se estaba
mirando. Panel en Vehículos → Revisar datos.

**Lo que enseña este caso.** Buscar el patrón en el código encuentra dónde se
*lee* mal; solo mirar los datos encuentra dónde están *escritos* mal. Las dos
colecciones rotas no aparecían en ninguna de las 33 líneas sospechosas.
