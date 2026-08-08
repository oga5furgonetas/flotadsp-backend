# Registro del laboratorio

Memoria de qué se ha probado en el LAB, qué salió y qué se decidió. Incluidos
los fracasos: un experimento descartado con su motivo vale tanto como uno bueno,
porque impide repetirlo dentro de seis meses.

**Nada de aquí está en producción.** Todas las rutas viven bajo `/lab` (sin
sesión, datos sintéticos) o `/panel/lab` (dentro del panel, datos del LAB).

---

## Auditoría de partida

Lo que se midió antes de diseñar nada, sacado de `MAPA_FUNCIONAL.md` y del código.

### Saltos de pantalla para entender UNA cosa

| Pregunta del gestor | Pantallas que hay que visitar hoy |
|---|---|
| ¿Qué pasa con este conductor? | Conductores → Scorecard → WHC → Turnos → Inspecciones → Incidencias → PackageIntel = **7** |
| ¿Qué pasa con esta furgoneta? | Vehículos → Inspecciones → Incidencias → Talleres → Vencimientos → Renting → Aparcamiento = **7** |
| ¿Qué ha cambiado desde ayer? | **Ninguna. No existe.** |

Ninguna de esas pantallas enlaza con la siguiente por la misma entidad: el hilo
lo sostiene el gestor en su cabeza.

### Información duplicada

- **La ITV aparece en 4 sitios**: `Dashboard`, `AvisosITV`, `Vencimientos`, `ExpiryAlerts`.
- `getVehicles` lo llaman **8 pantallas** distintas.
- `Vencimientos` + `AvisosITV` + `Renting` + `ExpiryAlerts` son cuatro pantallas
  de ~50 líneas para la misma idea: *algo caduca*.

### Pantallas por debajo del nivel de un SaaS B2B premium

`Renting` (17 líneas) · `AvisosITV` (9) · `Metricas` (39) · `Actividad` (57) ·
`Turnos` (77, **0 botones**) · `MiDia` (142, **0 botones**). Son esqueletos: leen
un endpoint y pintan una lista.

### Lo que ya existe y no hay que reinventar

- **`CommandPalette`** ya está y funciona (navegación por teclado). Un
  "command center" tipo paleta sería duplicar.
- **La portada ya no es "8 tarjetas KPI"**: es un centro de operaciones
  editorial (atención / trabajo de hoy / bajo control).
- **`_whc_ritmo()`** ya calcula proyección semanal, margen y estado de ritmo.
- **`vehicle_damage_ledger`** ya es memoria del vehículo panel a panel… pero
  construida como mecanismo interno de supresión para la IA, sin pantalla.
- **`GET /stats/attention`** ya calcula "qué necesita mi atención hoy" y en
  `frontend-v2` **no lo llama nadie**: sólo la app legada.

**Conclusión de la auditoría:** el problema principal de FlotaDSP no es que le
falte inteligencia. Es que la que ya calcula está repartida y la interfaz la
expresa como recuentos.

---

## Sistema de veracidad

Toda señal se clasifica y la interfaz lo hace visible **antes** de que la leas.

| Clase | Significa | Ejemplo |
|---|---|---|
| **HECHO** | Está en un campo. Se lee, no se calcula | "La ITV caducó el 4 ago" |
| **ARITMÉTICA** | Suma/resta de hechos, reproducible a mano | "53h + 9h = 62h" |
| **ESTIMACIÓN** | Sale de un modelo, puede estar mal | "Daño moderado, confianza 71 %" |
| **NO DEMOSTRABLE** | No se sostiene con estos datos. No se afirma | "Qué rutas acabarán tarde" |

Regla **fail-closed**: ante la duda, no se muestra alerta. Un falso positivo
cuesta más que un silencio.

---

## Experimentos

### E01 · Feed de señales — `/lab/senales`
- **Hipótesis:** el gestor no quiere métricas, quiere excepciones.
- **Implementado:** motor de 9 reglas; cada señal con cálculo, evidencia campo a campo, invalidadores, frescura y acciones.
- **Datos:** sintéticos (`/lab`) y reales del LAB (`/panel/lab`).
- **Funcionó:** la clasificación se lee de un vistazo; el desplegable "¿por qué aparece esto?" no estorba porque va cerrado.
- **No funcionó:** con muchas señales vuelve a ser una lista larga. Necesita agrupación por entidad — que es justo lo que resuelve E06.
- **Decisión:** **CANDIDATO PARA PRODUCTO**. Es la base, no la pantalla final.

### E02 · El parte — `/lab/parte`
- **Hipótesis:** un párrafo se lee entero; un feed se escanea.
- **Funcionó:** se lee en 30 s. Cerrar con "lo que hoy no se puede afirmar" es lo que más lo diferencia de un dashboard.
- **No funcionó:** **no escala**. Con más de 6 señales la prosa es ilegible. Y la primera versión pasaba los títulos por `toLowerCase()`, destrozando matrículas y siglas ("1002 lab", "itv").
- **Decisión:** **INTERESANTE, ALCANCE LIMITADO**. Vale como resumen de cabecera, no como pantalla.

### E03 · Memoria del vehículo — `/lab/vehiculo`
- **Hipótesis:** el ledger ya guarda la historia; sólo falta enseñarla.
- **Funcionó:** el eje temporal único (inspecciones + daños + reparaciones + ITV) sustituye a 4 pantallas.
- **Decisión:** **VALIDADO VISUALMENTE**, absorbido por E06.

### E04 · Confianza — `/lab/confianza`
- **Hipótesis:** merece pantalla propia saber de cuándo es cada número.
- **Funcionó:** distinguir fuentes **automáticas** de **manuales** es más importante de lo que parecía: las manuales no fallan con un error, fallan quedándose quietas.
- **No funcionó:** **como pantalla propia, no.** Nadie va a abrirla. La información debe vivir pegada a cada señal.
- **Decisión:** **RECHAZADO COMO PANTALLA**, adoptado como componente (`<Frescura>`).

### E05 · Portada, actual vs experimento — `/panel/lab/portada`
- **Hipótesis:** los contadores de la portada deberían ser frases con evidencia.
- **Implementado:** interruptor de dos pestañas. "Como está hoy" **importa el componente `Dashboard` de producción sin tocarlo**: no es una imitación.
- **Funcionó:** el patrón de comparación. Sin ver el antes y el después con los mismos datos no se puede decidir si algo va a producción.
- **Dudoso:** la columna derecha cambia el "pulso" por la frescura. Ocupa un sitio caro; probablemente debería ir dentro de cada señal.
- **Decisión:** **CANDIDATO PARA PRODUCTO** (el patrón de comparación, y el cambio de contadores a señales).

### E06 · Ficha 360 — `/lab/ficha`
- **Problema:** entender a un conductor cuesta 7 pantallas.
- **Hipótesis:** *Intelligence no debe ser una página, sino una capa que se abre sobre la lista donde ya estás.*
- **Implementado:** listas de conductores y vehículos; cada fila abre un drawer con ruta de hoy, horas (proyección), scorecard, memoria de incidencias, inspecciones y señales abiertas con su "por qué". Cierra con Escape.
- **Real vs simulado:** la estructura y los cruces son reales (los campos existen); los datos son `LAB/SIMULATED`.
- **Funcionó:** **colapsa 7 pantallas en 1 sin inventar un solo dato.** Mantener la lista detrás preserva el contexto. Los 440 px obligan a elegir qué importa, que es una ventaja de diseño, no una limitación.
- **Riesgo controlado:** la memoria enseña "3 incidencias de chapa en 6 meses" como **recuento**, y dice explícitamente que 3 casos **no** demuestran un patrón. Ahí es donde este tipo de función se convierte en charlatanería.
- **Decisión:** **CANDIDATO PARA PRODUCTO — el más fuerte de los ocho.**

### E07 · Qué ha cambiado — `/lab/cambios`
- **Problema:** ninguna pantalla responde "¿qué ha pasado desde que me fui?".
- **Resultado — y es el hallazgo más útil del laboratorio:** un diferencial completo **no se puede hacer**, y no por la interfaz sino por el **modelo de datos**. FlotaDSP guarda cuándo se *creó* cada cosa, pero apenas guarda transiciones: entradas a taller, cambios de conductor asignado o ediciones de ITV se **sobrescriben sin dejar rastro**.
- **Implementado:** lo que sí se diferencia (inspecciones, daños nuevos, incidencias abiertas y resueltas) **y la lista explícita de lo que no**.
- **Decisión:** **PENDIENTE DE DATOS.** Necesita un registro de eventos. Ya existe `GET /admin/audit-log` creada y sin pantalla; cerrarlo resolvería esto y el requisito de cumplimiento a la vez.

### E08 · Simulador "¿y si…?" — `/lab/simulador`
- **Hipótesis:** casi ningún what-if se sostiene con estos datos. ¿Hay alguno?
- **Resultado:** **exactamente uno.** Mover horas planificadas entre conductores es aritmética sobre datos medidos.
- **Implementado:** traspaso de bloques con efecto en el límite semanal, antes/después por conductor, y los **supuestos a la vista**.
- **Verificado:** mover 9 h de un conductor a 62 h de proyección hacia otro a 41 h 40 baja de 2 a 1 los que superan el límite. La cuenta cuadra.
- **Lo que se niega a simular** (listado en la propia pantalla): efecto en el DCR, impacto de una furgoneta no disponible, ahorro en euros. Ninguno tiene modelo detrás.
- **Decisión:** **CANDIDATO PARA PRODUCTO**, con alcance deliberadamente pequeño.

---

## Descartados sin construir

| Idea | Por qué no |
|---|---|
| Predictor de rescates / hora de fin de ruta | Demostrado imposible: rutas que acabaron mal iban al 60 % a las 14:00, las buenas al 62 % (`docs/PREDICTOR_RESCATES.md`) |
| WHC diario predictivo | Ningún umbral reproduce la realidad: >10 h marca 42 y fallaron 2 (`docs/WHC.md` §3) |
| Riesgo por conductor en un número | Con esta muestra es azar con gráfico. El motor tiene compuerta (`N_MINIMO`) y emite "datos insuficientes" |
| Command center tipo paleta | `CommandPalette` ya existe y funciona |
| Mapa de flota | Cortex da la coordenada del **paquete**, no la de la furgoneta. Un mapa sin posición del vehículo es decorativo |
| Impacto económico de decisiones | El único € fiable es `actual_cost` tecleado tras la reparación |

---

## Autoevaluación (1-10)

| | E01 Señales | E05 Portada | E06 Ficha 360 | E07 Cambios | E08 Simulador |
|---|---|---|---|---|---|
| Utilidad | 8 | 8 | **9** | 5 | 7 |
| Claridad | 8 | 8 | **9** | 7 | 8 |
| Velocidad de comprensión | 7 | 8 | **9** | 7 | 7 |
| Calidad visual | 8 | 8 | **9** | 7 | 7 |
| Densidad de información | 7 | 7 | **9** | 6 | 6 |
| Confianza | **9** | **9** | **9** | 8 | **9** |
| Riesgo de falsos positivos (10 = ninguno) | 8 | 8 | 8 | **9** | **9** |
| Valor operativo | 7 | 8 | **9** | 5 | 6 |
| Diferenciación | 7 | 6 | **9** | 8 | 7 |
| Complejidad (10 = simple) | 7 | 8 | 6 | 8 | **9** |

**¿Lo mantendría en FlotaDSP?**

- **E06 Ficha 360 — SÍ.** Resuelve el problema medido más grande (7 pantallas → 1) y no inventa nada. Es lo que llevaría a producción primero.
- **E08 Simulador — SÍ.** Pequeño, honesto y útil. Bajo riesgo.
- **E01 Señales — SÍ, como motor**, no necesariamente como pantalla: su sitio natural es dentro de E06 y de la portada.
- **E05 Portada — SÍ el patrón de comparación**; el cambio concreto, tras verlo con datos reales.
- **E07 Cambios — TODAVÍA NO.** La idea es buena y la pantalla está a medias por falta de historial de eventos. Primero el registro, después la pantalla.
- **E02 El parte — NO como pantalla.** No escala.
- **E04 Confianza — NO como pantalla.** Sí como componente pegado a cada señal.

---

## Lo que este laboratorio dice sobre el producto

1. **Falta menos inteligencia de la que parece y más superficie que la exprese.** WHC, ledger y `/stats/attention` ya calculan; nadie los enseña.
2. **El techo no es el modelo, es el modelo de DATOS.** Sin registro de eventos no hay diferencial, no hay auditoría y no hay "qué está empeorando".
3. **La cadencia de inspección es lo que decide si se pueden atribuir daños.** Una inspección por turno cierra la ventana a una persona; una por semana no atribuye nada. Es una decisión de operación, no de software.
4. **Cuatro pantallas de vencimientos deberían ser una.**
