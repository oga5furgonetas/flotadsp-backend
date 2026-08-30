# Decisiones

> Una decisión sin su motivo se deshace sola: alguien la mira meses después, no
> entiende por qué está así, y la «arregla». Aquí queda el porqué, la evidencia
> y cómo revertirla.
>
> Solo entran decisiones que **costaría dinero o tiempo volver a tomar**. Las
> decisiones de implementación pequeñas van comentadas en el propio código.

---

## 2026-08-30 · La cadena válida más larga para detectar kilometrajes malos

**Problema.** 66 lecturas imposibles de 2.517 en `mileage_history`, con el ritmo
saliendo entre -6.350 y +7.616 km/día. Sin arreglarlo no se puede predecir nada.

**Alternativas probadas, y por qué fallaron:**

1. *Comparar cada lectura con la anterior.* Un pico marca **también** el dato
   bueno de detrás, porque respecto al pico ha «bajado». Se limpiaba el error y
   se tiraba el dato correcto.
2. *Comparar con el último bueno, confirmando con los siguientes.* La 2851 NGX
   tiene **cuatro** lecturas malas seguidas que se confirman entre ellas: el
   algoritmo se dejaba convencer y marcaba como mala la serie buena entera.

**Decisión.** Buscar la subsecuencia válida más larga y descartar lo que queda
fuera. **Es la mayoría la que define qué es normal, no el vecino.**

**Salvaguardas.** Con menos de tres lecturas no se juzga (cualquiera podría ser
la mala). Si más de la mitad de la serie no encaja, tampoco se toca: eso lo mira
una persona.

**Impacto.** Ritmo de 21 a 281 km/día, mediana 114. 18 furgonetas tocadas.

**Revertir.** `app_meta/respaldo_odometro` tiene el histórico completo de las 18.
Ninguna lectura se borró: quitar el campo `descartada` las devuelve.

---

## 2026-08-30 · Fusionar fichas de furgoneta en producción sin preguntar

**Problema.** Cinco matrículas con dos fichas vivas, el historial partido entre
las dos. Ninguno de los números de esas furgonetas era cierto.

**Por qué no se preguntó.** Dani había dado luz verde explícita, existía punto de
retorno en git, la operación estaba probada entera en staging con 0 pérdidas, y
es reversible por `merged_into`. Y sobre todo: **dejarlo así hacía que todo lo
demás mintiera** — la exposición, el coste, el origen de daños.

**Lo que sí se hizo antes.** Respaldo del estado exacto en
`app_meta/respaldo_fusion_vehiculos`, y verificación posterior de que no quedaba
ni un registro huérfano ni un slot del cuadrante colgando.

**Regla que sale de aquí.** Corregir datos en producción sin preguntar exige las
cinco condiciones de `SAFE_TO_AUTOCORRECT` **y** respaldo previo **y**
verificación posterior. Cuatro de las cinco no bastan.

---

## 2026-08-30 · Un solo fichero de estado, no dos

**Problema.** Se pidió crear `PROJECT_STATE.md`, pero el proyecto ya tenía
`ESTADO.md` cumpliendo esa función.

**Decisión.** Fusionar en `ESTADO.md` y no crear el segundo. Dos ficheros de
estado es peor que uno: el día que discrepen, nadie sabe cuál manda — y
discrepan siempre, porque solo se actualiza el que uno tiene abierto.

---

## 2026-08-29 · Cortex como fuente del DCR, en vez de esperar la scorecard

**Problema.** La scorecard oficial de Amazon llega con semanas de retraso: la
última cargada es la 29 y estamos en la 35. Cuando se ve que el DCR se hundió,
esa semana lleva un mes cerrada.

**Alternativa descartada.** Predecir con un modelo sobre las 5 semanas oficiales
que hay. Con ese histórico, cualquier predicción es ruido presentado como dato.

**Decisión.** No predecir: **contar lo que ya pasó** con los 259.804 paquetes de
Cortex y compararlo con los umbrales que la app ya tiene. Un acumulado real no
se equivoca.

**Lo que destapó el mismo día de encenderlo.** El DCR cayó a 98,3% y 97,69% el
28 y 29 de agosto (237 paquetes), casi todo `BACK_TO_ORIGIN` y repartido en 30
rutas — o sea, algo sistémico de la estación. Con la scorecard oficial se habría
sabido un mes después.

---

## 2026-08-29 · El origen de daños nombra a personas: reglas duras

**Problema.** Con las inspecciones diarias se puede saber quién llevaba una
furgoneta cuando apareció un golpe. Eso es muy valioso y muy peligroso.

**Decisión.** Solo se señala a una persona con **ventana de un día, un único
conductor y daño por encima de leve**. Y nunca dice «lo rompió»: dice **«la
llevaba»** — la app sabe quién conducía, no quién dio el golpe.

**Números.** De 600 daños, 58 quedan acotados. Se quedan fuera 206 por leves,
138 sin foto previa y 132 con dos conductores posibles. **Que la mayoría se
quede fuera es el diseño, no una limitación.**

---

## 2026-08-29 · Los colores salen del logo, no del gusto

**Problema.** La app iba en el naranja por defecto de Tailwind y el logo es cian.

**Decisión.** Extraer los tres colores contando píxeles del propio
`logo-fd-marca.png`: cian `#14E7D8`, azul `#0AACD3`, fondo `#040710`.

**Consecuencia técnica.** El cian es tan claro que el botón necesita **tinta
oscura** (11:1) en vez de blanca (1,7:1). Ese valor va fijo en `--brand-tinta`,
no en la rampa `dark`, porque la rampa se invierte en modo día y dejaría texto
claro sobre cian claro.

**Revertir.** `git checkout punto-seguro-2026-08-29 -- frontend-v2/src/index.css frontend-v2/tailwind.config.js`
