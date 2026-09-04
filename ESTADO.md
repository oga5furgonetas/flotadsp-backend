# Estado del proyecto

> Este fichero es **la memoria del proyecto y el relevo entre sesiones**.
> El repositorio y los datos mandan sobre lo que recuerde una conversación:
> si algo aquí contradice producción, gana producción y esto está viejo.
>
> Lee **CLAUDE.md** primero (las reglas y los 45 gotchas), luego esto.
>
> Última actualización: **2026-09-02**

---

## Objetivo principal

FlotaDSP es la capa de inteligencia operativa de un DSP de Amazon. El objetivo
de negocio es que **Amazon la compre y se la imponga a sus DSPs**, empezando por
convencer en España.

El núcleo del producto —y donde está la diferenciación— es unir lo que en el
resto de herramientas vive separado:

```
VEHÍCULO ↔ CONDUCTOR ↔ RUTA ↔ KILOMETRAJE ↔ INCIDENCIA
        ↔ TALLER ↔ MANTENIMIENTO ↔ COSTE ↔ DISPONIBILIDAD ↔ DSP
```

Con eso unido y fiable se pueden producir decisiones que ninguna otra
herramienta puede producir. Sin fiabilidad de datos, no se puede producir
ninguna.

---

## Regla que ordena el trabajo

**No se construye capa predictiva sobre datos que no son fiables.** Primero
integridad, después reglas, después predicción. Lo contrario produce números que
parecen medidos y no lo son, que es el peor resultado posible: se toman
decisiones con ellos.

---

## Estado a 2026-09-05 (décima pasada: los filtros y las rutas públicas)

Baseline al empezar: 112 tests, 18 checkers, pyflakes 0, smoke de producción
21/21, y el código desplegado idéntico byte a byte al del repositorio.

**Dos hallazgos, los dos midiendo contra producción y ninguno leyendo código.**

- **Un 500 en un endpoint público.** Barrido de las 196 rutas GET contra la
  empresa REAL —el barrido anterior fue con la empresa vacía, y este fallo solo
  existe si hay enlaces de las tres clases—. `taller_enlaces` guarda el enlace
  de una orden, el fijo de un taller y el de un apoyo; `_ot_por_token` los
  aceptaba todos y luego hacía `enlace["orden_id"]`: KeyError en
  `/api/taller/<token>` y en los cinco POST del portal del taller. Un taller que
  guarde su enlace sin el `/t/` veía una página rota. Corregido, verificado con
  los cuatro casos en producción y con cuatro tests. Gotcha 59.
- **Cuatro personas invisibles.** Reconciliando filtros: `GET /drivers` daba 150
  activos y la suma por centro 146. Los cuatro tienen `center: ""`, así que con
  un centro elegido —siempre— no salían en ninguna pantalla. Uno de ellos
  llevaba **469 paquetes repartidos en OGA5**. `/checkers/centros` decía «0
  hallazgos» porque unifica variantes sucias y vacío no es una variante.
  `GET /drivers/sin-centro` los enseña con lo que sabe Cortex y
  `POST /drivers/sin-centro/aplicar` pone la nave solo cuando no hay duda (una
  sola nave, mínimo 20 paquetes). Aplicado: 1 puesto, 3 esperando a que lo diga
  una persona y ya visibles con el motivo. Gotcha 60.

**Comprobado y descartado** (sin evidencia de fallo): los 38 endpoints públicos
fijan la empresa con `_set_tenant_by_slug`/`set_current_org_db`/`_ot_por_token`
(gotcha 26 sigue cerrado); el enlace público de un apoyo caduca a los 3 días y
va por lista blanca de campos; los 127 paquetes de Cortex sin centro son de
julio, sin `station_id` ni ruta, de una versión antigua de la extensión; las 33
BDs `dsp_*` huérfanas son restos de smoke y ocupan ~15 MB de los 10 GB.

**Pendiente sin resolver:** la sección nueva de Conductores está desplegada y
verificada por API, pero **no se ha visto renderizada en un navegador** — hace
falta una sesión del panel. Es lo único de esta pasada sin comprobar a ojo.

`run_all.py` deja de contar como aprobado lo que no ejecuta (una función `async`
llamada a pelo no corre ni una línea) y pone el mismo entorno que `conftest.py`:
112 → **126 casos reales** en local. En este PC ya están instaladas las
dependencias del backend, así que `pytest backend/tests -q` corre aquí.

---

## Estado a 2026-09-02 (auditoría completa, dos pasadas)

### Lo grave, y ya resuelto

**El 01-09-2026 desaparecieron de producción 265.986 paquetes y 555.730
eventos de Cortex** (julio y agosto enteros). No fue el TTL: fue el botón
«Borrar todo y empezar limpio» de Paquetes IA, que llamaba a
`POST /cortex/reset` con solo `require_admin` y un `window.confirm`. Se fechó
por las copias de R2 (67 MB el 01-09 a las 02:00, 14,6 MB el 02-09) y **se
restauró de la copia del 01-09**: 265.513 paquetes y 553.997 eventos
insertados (solo lo que faltaba), cada uno con `restaurado_de`, resumen en
`app_meta.respaldo_restauracion_cortex`. Las semanas de la scorecard en vivo,
las direcciones que fallan y el selector de días (hasta el 1 de julio)
volvieron a salir. Gotcha 45 y `scripts/check_borrado.py`.

### Producción

| | |
|---|---|
| Frontend | flotadsp.com — sirviendo el último build (verificado por hash) |
| Backend | flotadsp-backend.fly.dev — `/api/health` ok, mongo conectado |
| Smoke empresa nueva | **25 de 25** (`smoke_empresa_nueva.py`) |
| Barrido con empresa vacía | 196 rutas GET × 9 variantes = 1.526 llamadas, **0 de 5xx**; 175 mutaciones × 2 = 350 llamadas, 1 de 5xx (corregido) |
| Tests | **24 en local**; CI corre también los de API |
| Checkers | los **dieciocho** en verde (`check_borrado.py`, `check-chunk-error.mjs` y `check_unicos.py` nuevos) |
| Smoke de concurrencia | **5 de 5** (`smoke_concurrencia.py`, nuevo) |
| Latencia | todas las GET de la empresa principal < 1 s con Cortex a volumen real (279.396 paquetes) |

### Datos (medido, no supuesto)

| | |
|---|---|
| Furgonetas activas | 125 (69 OGA5 · 39 DGA1 · 17 DGA2); 11 en taller, todas con `taller_desde` |
| Conductores activos | 145 |
| Inspecciones | 3.965 |
| Paquetes de Cortex | 279.396 (desde 2026-07-01, TTL 90 días) |
| Días congelados | 5 (desde el 29-08); los anteriores al 30-08 salen como mínimo, no como real |
| Atlas | 10 GB contratados; medir con `/admin/salud` |

### Corregido en esta auditoría (todo desplegado y comprobado en producción)

- `POST /cortex/reset` y `DELETE /metrics/reports/all`: super-admin,
  `confirmar: "BORRAR"` y `audit_log`; el botón solo lo ve el super-admin.
- `POST /cortex/congelar-dia` congelaba **todas** las empresas y devolvía el
  centro y el DCR de las demás al que llamaba; ahora solo la suya.
- `/stats/dashboard` ignoraba el centro y los centros permitidos: con OGA5
  decía 125 furgonetas (las de los tres centros). Ahora 69, y 69+39+17 cuadra
  con los 125 de «Todos», que no ha cambiado.
- `/scorecard/daily-trend` estaba en blanco desde junio (`daily_ratios`
  vacía) y apuntaba a la semana del 14-06; cuenta desde Cortex con la misma
  regla que la scorecard en vivo (`_cx_dias_reparto`, compartida).
- La bandeja del taller decía «N sin saber de cuál hablan» sin forma de
  asignarlos; ahora se elige la orden abierta y se asigna.
- Los iPhone no se curaban del chunk envenenado: Safari lo describe distinto
  que Chrome y el patrón no lo reconocía (4 conductores entre el 26-08 y el
  01-09). `lib/chunkError.js` + `check-chunk-error.mjs` con los mensajes reales.
- `check-huerfanas` contaba como consumidor un export de `api.js` que ninguna
  pantalla importa: 16 rutas pasaban por enganchadas. Corregido; 4 anotadas.
- `smoke_endpoints.py` firmaba su token con `org_id: oga5`, que no existe:
  medía contra una organización vacía. Ahora `owner`, e invariante nuevo:
  los días congelados conservan sus paquetes (habría cantado el borrado).
- `PATCH /incidents/{id}` sin cuerpo daba 500; `/auth/me` con token de
  mantenimiento daba 500; borrar o editar alquiladoras e informes con id
  inexistente decía «success».

### Tercera pasada (tarde del 02-09): lo que solo falla con cinco a la vez

Medido con `backend/scripts/smoke_concurrencia.py` en una empresa de prueba,
antes de arreglarlo: 5 altas de la misma matrícula dejaban **3 furgonetas**;
5 del mismo correo, **5 conductores** (`POST /drivers` no comprobaba nada, ni
en secuencia); 5 partes de la misma furgoneta, **5 órdenes**; 5 «generar
accesos», **21 cuentas** para una persona. Ahora, en producción:

- Índices únicos parciales en cada empresa: `matricula_unica_viva` (solo
  `active/taller/baja`), `email_unico_activo` (solo `active: true`, sin
  distinguir mayúsculas) y `driver_id_unico` en `driver_accounts`. Se midió
  antes que no hubiera repetidos vivos en `flotadsp`; los tres se crearon.
- `POST /drivers` da 409 con un correo activo repetido; los seis escritores
  traducen `DuplicateKeyError` a 409 en vez de 500.
- Abrir un parte es idempotente dos minutos por (furgoneta, taller) con un
  cerrojo atómico por `_id` en `app_meta` (un `find_one` previo no valía: dos
  peticiones miraban antes de escribir, medido).
- `scripts/check_unicos.py`: todo `except DuplicateKeyError` tiene que tener
  su índice único; `generar_accesos` lo capturaba sobre una colección sin
  único y por eso parecía protegido. Probado quitando el índice a propósito.
- El único de `ai_feedback` (inspección, daño) **nunca existió**: fallaba en
  cada arranque con un WARNING porque los «daño no visto» van sin índice y
  el upsert va por (inspección, scope, daño). Redeclarado con esa clave y
  parcial; `smoke_endpoints.py` comprueba ahora que los únicos declarados
  existen de verdad.
- `check-huerfanas` escaneaba `flotadsp_app/lib`, que no existe: la app
  Flutter vive en `mobile/lib` y sus 23 rutas no contaban como consumidas.
- Portal del conductor recorrido como usuario (empresa demo): las seis
  llamadas de la home responden 200; «Mis turnos» sigue en PRONTO a
  propósito (comentario en `DriverPortal.jsx`) aunque `/shifts/mine` existe.
  `/cortex/debrief` va comprimido por Fly (gzip): 401 KB en JSON, no es
  problema de red.

### Cuarta pasada (noche del 02-09): el panel recorrido como usuario

Con sesión de super-admin en el navegador, pantalla por pantalla, con datos
reales de OGA5. Todo desplegado y comprobado en producción:

- **Dashboard.** «0 rutas en curso» con 1.209 paquetes `PICKED_UP` en la
  calle: `/cortex/routes` contaba «en la furgoneta» solo `LOADED/ARRIVED`,
  estados que dejaron de existir con el gotcha 28. Ahora 42 en curso con sus
  minutos sin entregar. «79 ITV vencidas o inminentes» eran 16 + 6 + **57
  sin fecha**: tres líneas. El KPI histórico de críticos/graves pasa a
  «daños sin reparar · N graves en M furgonetas». Con un centro elegido decía
  «100 % disponibilidad · 0 en taller» (filtraba `status==='workshop'`, que
  no existe) con 9 en el taller.
- **Mi día.** Con «Todos» quedaba en blanco; sin cuadrante decía «Todas
  asignadas ✓»; contaba 56 incidencias «abiertas» de toda la empresa (16
  resueltas). `GET /incidents` admite `status` y `center`.
- **Scorecard.** Dos DCR de la semana en la misma pantalla (99,79 % arriba,
  98,4 % abajo): `/cortex/calidad` no usaba la foto congelada del gotcha 39.
  Ahora manda la foto en las dos. Abría en la semana del 14 de junio;
  `_semana_a_seguir` cae a la actual si lo subido tiene más de dos semanas.
- **Incidencias.** Las automáticas «Vehículo en taller» no se cerraban al
  salir (7 abiertas desde julio, cerradas con respaldo) ni evitaban
  duplicados por variaciones del título (13 parejas). Se cierran solas y no se
  duplican; invariante en el smoke; probado de punta a punta.
- **Inspecciones.** 126 con severidad «leve/moderado/grave» y cero daños en
  la lista (la IA las devuelve por separado): validador en el modelo y las
  126 corregidas con respaldo (`respaldo_severidad_sin_danos`).
- **Vehículos.** `/vehicles` y el portal sin `mileage_history`: 540 → 92 KB
  y 532 → 82 KB. La 3328 NFY con 1.880.712 km coherentes consigo misma sale
  en Revisar datos como «kilometraje imposible».
- **Talleres.** Pedía dirección o GPS antes de enseñar nada; arranca desde el
  centro elegido (`GET /org/centros-geo`) con «Cambiar ubicación».
- **Órdenes de taller.** Una cerrada ya no se reabre (409) y `taller_desde`
  se limpia al entregar; anular y reabrir en dos minutos funciona.
- **Chunk envenenado.** Visto en vivo durante un despliegue: la curación
  intentaba una vez por minuto y la ventana dura más. Tres intentos
  escalonados en diez minutos.

### Quinta pasada (noche del 02-09): lo que Dani pidió a nivel de producto

- **La IA se revisa sola.** De 2.324 inspecciones «sin mirar», 2.219 no
  tenían ningún daño nuevo (nada que decidir) y el puntuador de fiabilidad ya
  sabía cerrar los extremos con un 90 % de acierto medido, pero nadie actuaba.
  `autorrevisar_inspecciones`: cierra sola las que no tienen daños nuevos y
  las que tiene claras (aplica el veredicto al libro como haría una persona),
  guarda `fiabilidad`/`veredicto_ia` en cada daño y deja a la persona solo
  las dudas. Corre cada 15 min en todas las empresas y en el acto tras cada
  análisis; botón «Que la IA revise ahora». Lo que decide la IA **nunca**
  entra en `ai_feedback`: el modelo se reentrena solo con humanos. Resultado
  en producción: **2.325 → 103 pendientes** (todas con una duda real).
  `test_autorrevision.py`.
- **La plantilla diaria no sale con errores.** `POST /api/tools/plantilla-validar`
  contrasta cada fila con la empresa (conductores por tokens, matrículas
  normalizadas, horas con forma y rango, repetidos) y con **lo que Cortex dice
  de hoy** (ruta → conductor, sin OCR: si discrepa, manda Cortex). La pantalla
  enseña los avisos con un botón «Poner» que aplica la sugerencia y marca la
  celda. `test_plantilla_validar.py`.
- **Un enlace fijo por taller.** Cada orden tenía su enlace y el taller acababa
  con seis mensajes de WhatsApp. `POST /workshops/{id}/enlace` da uno para
  siempre; `/taller/t/{token}` enseña lo que tienen nuestro ahora mismo y
  cada furgoneta abre su paso a paso de siempre (lista blanca de campos). En
  Talleres, dentro de «Más»: copiar o mandar por WhatsApp. Cubierto en
  `smoke_empresa_nueva.py`.

### Comprobado y descartado (sin evidencia de fallo)

- Aislamiento multiempresa con ids reales de la principal desde otra
  empresa: 404 en lectura y en escritura, sin tocar nada.
- Los `upsert` de `geo_rescate` van por `_id`: no duplican bajo concurrencia.
- Los literales de filtro que no existen en producción (`LOST`, `REJECTED`,
  `descartada`, `extra`…) son estados legítimos aún no ocurridos o
  compatibilidad con datos antiguos, no filtros muertos.
- `current_driver_id` no lo tiene ninguna furgoneta, pero solo decide como
  alternativa al cuadrante; el portal no llama a la ruta que lo exige.

---

### Sexta pasada (02-09, noche): quién escribió qué, y listados a su tamaño

- **Registro duradero de escrituras.** La pregunta del 01-09 («¿quién borró
  esto?») no tenía respuesta porque ningún log duraba. El middleware
  `_registro_escrituras` deja en `flotadsp_global.audit_requests` cada
  POST/PUT/PATCH/DELETE (menos la ingesta de Cortex): fecha, ruta, estado,
  milisegundos, IP, usuario, empresa y BD, con TTL de 30 días. Se lee con
  `GET /admin/actividad?path=&sub=&horas=` (super-admin). Comprobado en
  producción: 13 apuntes en la primera hora, incluidas subidas reales de
  inspecciones de conductores.
- **Inspecciones bajaba 801 KB por 200 tarjetas** que solo pintan la primera
  foto, la severidad y dos contadores. `GET /inspections?campos=lista`
  proyecta fuera daños, resumen, fotos anotadas y notas y deja una sola foto:
  **238 KB y 0,53 s frente a 801 KB y 0,90 s**, mismos ids y mismo orden. El
  detalle se pide al abrir la tarjeta con `GET /inspections/{id}`.
- **Plantilla diaria con la plantilla real de DGA1 (01-09, 16 filas):** tras
  dejar la regla de horas solo para los casos imposibles, un único aviso y
  verdadero (un nombre que la empresa tiene escrito de otra forma, con su
  sugerencia). `/cortex/debrief` medido: 209 KB y 0,7 s para OGA5 (49
  conductores), sin cambio.
- **Turnos: un turno por conductor y día, dicho por la base.** Los cuatro
  sitios que guardan turnos hacían `upsert` por (conductor, día) sin índice
  único (gotcha 9). Medidos 0 repetidos antes de crear `turno_unico`; los
  cuatro pasan por `_upsert_turno`/`_bulk_turnos`, y `smoke_concurrencia`
  tiene el paso «5 guardados del mismo turno → UN turno» (7/7 en producción).
- **La lista de tareas ya no se crea para «Todos».** `GET /checklist` creaba
  un turno fantasma para ese pseudocentro (lo reproduje con mi propia sonda
  y retiré mis dos documentos); ahora 400 con mensaje.
- **Teléfonos: 84 de 146 conductores activos no tenían, y el portal se lo
  pedía a ellos.** Cortex publica el teléfono de cada conductor en
  `cortex_resumen.gente` (49 de 49 en el último resumen).
  `_telefonos_desde_cortex` rellena SOLO los vacíos por `transporter_id`
  (nunca por nombre, gotcha 15), en cada ingesta y con el botón «Teléfonos
  desde Cortex» de Conductores: **52 rellenados** (`telefono_por: "cortex"`),
  idempotente (segunda pasada 0), y **6 que ya tenían uno distinto se
  devuelven sin tocar** (JUAN ANTONIO ARCOS, JUAN CARLOS LÓPEZ, CHRISTIAN
  GALLEGO, MARÍA CERVIÑO, MARÍA VICTORIA CAMPOS, DAVID SIERRA). Quedan 32
  sin teléfono: 24 sin `transporter_id` y 8 que Cortex no trae.
- **Apoyo en ruta (nuevo, pedido por Dani esa tarde).** Un conductor va tarde
  y otro le quita paradas: se eligen en el mapa (Leaflet + OSM, sin clave),
  se elige quién va (el backup del cuadrante sale primero), y salen dos
  WhatsApp con el texto escrito —al que ayuda, con el enlace `/apoyo/t/<token>`
  (mapa, «Ir» a cada parada, «Ruta en Maps», «Hecha»); al que recibe la
  ayuda, con lo que le quitan—. Registro en `apoyos` (campo `fase`), editable
  con historial; el enlace enseña siempre la última versión y tacha solo lo
  que Cortex ya da por entregado. Multiempresa desde el primer día (BD de la
  empresa, enlace con `db_name`). Cero falsos positivos: «pendiente» sale de
  `_cx_ruta_cajon`, se vuelve a mirar Cortex al crear (`ya_entregadas`), y
  cada respuesta lleva `bajado_hace_min`. Medido a las 20:00: 587 paquetes
  sin entregar en 433 paradas de 38 conductores, 99 % con coordenadas, 17 %
  con dirección, frescura 1,5 min. Probado en producción de punta a punta con
  un apoyo real anulado al final. `docs/APOYO_EN_RUTA.md`,
  `backend/tests/test_apoyo.py`.
  **Falso positivo cazado en la primera prueba visual:** las paradas en
  furgoneta salían todas en la misma coordenada, la nave —`lat/lng` del
  paquete es el último escaneo, no el destino—. Ahora solo se pinta lo que
  tiene destino conocido (intento, dirección o `dest_lat` de la extensión
  2.22, que aprende los estados del informe de Cortex) y lo demás dice
  «Cortex no da la ubicación». Extensión 2.22 publicada; falta que Dani la
  recargue y abra una vez «Packages by status» con el estado de en furgoneta.
  Y el ayudante puede ser cualquier ficha activa con teléfono aunque no tenga
  `transporter_id` (24 de 146 no lo tienen): se identifica por la ficha.
- **Descartado con evidencia:** cobertura del cuadrante 47 frente a 48 turnos
  (uno lleva código `S`, que no saca ruta: correcto); `/shifts?center=Todos`
  igual a OGA5 (esta semana solo OGA5 tiene cuadrante); chat interno con 8
  mensajes desde julio y `contacts` a 0: no son fallos, es que no se usan.

### Novena pasada (02-09, noche): el móvil de verdad, con su captura delante

Dani abrió el panel en su Android y mandó la foto: el menú de usuario se veía
transparente, con el texto de la pantalla escrito por encima, y al pulsar
«Salir» no pasaba nada. Dos fallos, los dos medidos y ninguno visible leyendo
el código.

- **No se podía cerrar sesión desde el móvil.** La cabecera lleva
  `backdrop-blur`, que crea contexto de apilado, y no tenía `position` ni
  `z-index`: el `z-50` del desplegable solo competía DENTRO de la cabecera, y
  `main`, que va después en el DOM, pintaba por encima. `elementFromPoint` en
  el centro de «Salir» devolvía el titular de la página. Con `relative z-30`
  devuelve el botón y la sesión se cierra (comprobado: lleva al login con el
  token borrado). Gotcha 48.
- **La cabecera medía 479 px en una pantalla de 375** y no tenía scroll, así
  que el avatar (con Perfil, Portal y Salir dentro) quedaba entre 416 y 479:
  fuera de la pantalla. Ahora: botón de menú y avatar fijos, el selector de
  centro encoge y hace scroll, y buscar, ayuda y tema se van al menú del móvil.
  375 de 375, nada fuera.
- **Botón de menú también arriba**, porque en iOS la barra de abajo se queda
  debajo del navegador y no siempre se ve. Y los «cerrar al tocar fuera»
  escuchan `pointerdown`, que con el dedo sí llega, en vez de `mousedown`.
- **Sin efecto de rebote**: el modal de Vehículos mantiene sus 16 controles
  alcanzables con la cabecera en z-30, la paleta de comandos sus 6, y ni la
  cabecera ni la página se salen en Órdenes de taller.

### Octava pasada (02-09, noche): lo suyo, para el conductor

Dos pantallas nuevas en el portal, pedidas por Dani: «Tus estadísticas» y
«Ayudas de este mes». Las dos salen de datos que ya existían.

- **Tus estadísticas** (`GET /portal/mis-numeros`). Hoy en vivo con su ruta,
  entregados de total, lo que le queda y de cuándo es el dato. Debajo, sus
  siete días en barras y la comparación contra el CENTRO, calculada con la
  misma función que usa la oficina (`_cx_dias_reparto`, que respeta las fotos
  congeladas). Verificado con un conductor real: 181 de 194 hoy (93,3 %), 746
  paquetes en 5 días, el centro al 98,6 %.
- **Lo que NO lleva, a propósito.** Los días cerrados no llevan porcentaje:
  `state` es el estado de ahora, y un paquete devuelto el viernes que se
  reparte el lunes figura hoy como entregado el viernes. Un DCR de un día
  pasado saldría mejor de lo que fue, o sea una mentira a favor del conductor,
  que es la peor de todas. Se enseña lo que no se degrada hacia abajo
  (paquetes entregados) y se explica por qué en la propia pantalla.
- **Ayudas de este mes** (`GET /portal/mis-ayudas`). Las paradas que le ha
  quitado a un compañero, quién se lo debe, lo que a él le ayudaron y el total
  del equipo. Una parada suma solo cuando el que fue a ayudar la marca como
  hecha, y un apoyo anulado no cuenta. Si le pasaron paradas y no las marcó,
  la pantalla se lo dice en vez de quedarse en cero sin explicación.
- **Multiempresa y primer día**: `smoke_empresa_nueva.py` sube a 29
  comprobaciones. En una empresa recién creada las dos pantallas dicen que
  falta emparejar la ficha con Cortex, en vez de enseñar un cero que parezca
  un dato.

### Séptima pasada (02-09, noche): el móvil, que era lo más atrasado

Dani: «trabaja en la app para Android y iOS, que puedan entrar desde los
navegadores y se vea bien; es un coñazo histórico». Medido a 375 px en el
navegador, pantalla por pantalla, no a ojo.

- **Navegación.** En el móvil las 40 pantallas salían en una tira horizontal
  de pastillas, sin grupos: para llegar a una había que barrer a ciegas. Ahora
  hay un **menú de verdad** (hoja que sube desde abajo) con los MISMOS grupos
  del escritorio, filas de 48 px, se cierra al elegir, al tocar fuera y con
  Escape, y respeta la zona segura del iPhone. La barra de abajo pasa a cuatro
  destinos + Menú; el sitio lo deja Chat interno, que tiene 8 mensajes desde
  el 16 de julio.
- **Páginas que se arrastraban de lado** (el gesto que hace que una web
  parezca rota en el móvil). Medidas y corregidas: Scorecard **621 px** en una
  pantalla de 375 (la tabla del día a día tenía scroll, pero su columna no
  podía encoger: `min-width: auto` de un hijo de rejilla), Paquetes IA 453,
  DNR 400, Órdenes de taller 429, Vehículos 371. Las cinco quedan a cero.
- **Recorridas y limpias sin tocar nada**: Mi día, Actividad, Apoyo en ruta,
  Debrief, Métricas, Checklist de turno, Incidencias, Talleres, Horas · WHC,
  Configuración, Conductores, Inspecciones, Asignación diaria, Turnos.
- **Sin evidencia todavía**: Plantilla de turno se sale 17 px, que no se nota
  al arrastrar; se deja anotado y no se toca sin verlo en un móvil real.

## Estado a 2026-08-30

### Producción

| | |
|---|---|
| Frontend | flotadsp.com (Cloudflare Pages) — sirviendo el último build |
| Backend | flotadsp-backend.fly.dev — `/api/health` ok, mongo conectado |
| Smoke test | **17 de 17** (`backend/scripts/smoke_endpoints.py`) |
| Tests | **17 en local** (`python backend/tests/run_all.py`); CI corre también los de API |
| Checkers | los nueve en verde, contraste AA incluido |

### Datos (medido, no supuesto)

| | |
|---|---|
| Furgonetas activas | 124 (185 fichas en total) |
| Conductores | 218 |
| Inspecciones | 3.806 · 1.641 revisadas a mano (43%) |
| Paquetes de Cortex | 259.804 (con TTL: ~60 días de histórico) |
| Daños en el libro | 680 · 213 abiertos |
| Órdenes de taller | **2, las dos anuladas** |
| Colecciones | 72 · 27 vivas, 18 muertas (>30 días), 7 vacías |

---

## Problemas abiertos, por prioridad

### P0 — Integridad

Ninguno crítico sin resolver a fecha de hoy. Resueltos esta noche: matrículas
duplicadas, kilometrajes imposibles, conductor duplicado. Ver `docs/DATA_INTEGRITY.md`.

### P1 — Operación crítica

| Problema | Medida | Estado |
|---|---|---|
| Furgonetas en taller sin `taller_desde` | 13 de 13 · **441 días-furgoneta** parados sin trazabilidad | **Siguiente acción** |
| ITV vencida | 16 furgonetas, una desde 2024-12-20 | Herramienta hecha, falta que Dani rellene |
| ITV sin fecha | 56 de 124 activas (45%) | Herramienta hecha, falta rellenar |
| Sin km del último cambio de aceite | 109 de 124 | Herramienta hecha, bloquea la predicción |
| Módulo de órdenes de taller sin usar | 2 órdenes, ambas anuladas | Ver `docs/OPERATIONS.md` |

### P2 — Automatización

- Seguimiento del taller: **hecho**, sale solo a media mañana
- Aviso de caída del DCR: **hecho**, sale con el resumen del día
- Consolidación de direcciones antes del TTL: **hecha**, cada tarde
- Recuperar `BUSINESS_CLOSED` reordenando ruta: **pendiente**, 438 paquetes/90 días

### P3 — Ventaja competitiva

- Origen de daños, expediente por furgoneta, exposición: **hechos**
- Perfil operativo de cada taller (tiempo, coste, desviación, repetidas): **pendiente**, bloqueado por falta de órdenes
- Mantenimiento predictivo: **bloqueado** por el km del último cambio

### P4 — UX

Sistema visual rehecho (Archivo + IBM Plex Mono, colores del logo, tablas
densas). Aprobado por Dani el 29-08.

---

## Hallazgo sin resolver que necesita a Dani

**El DCR se desplomó el viernes 28 y el sábado 29 de agosto.** 98,3% y 97,69%
frente al 99,7-99,9% habitual: **237 paquetes** que no salieron. La causa es
`BACK_TO_ORIGIN` (77 y 90, contra **1** el jueves) repartido en **30 rutas
distintas**, así que no es un conductor ni una ruta — cambió algo en la estación.

`UNKNOWN`: qué cambió. Solo Dani puede saberlo.

---

## Bloqueado por terceros

- **WhatsApp**: código completo y probado, esperando a que Meta desbloquee la
  cuenta de Dani (bloqueo antispam por SMS). Ver `docs/INTEGRATIONS.md`.
- **Verificación de negocio en Meta**: Dani aún no tiene la empresa constituida;
  la creará al firmar con Amazon.
- **Clave de Google Geocoding**: sigue pendiente de rotar (se subió a un repo
  público en el commit `2f0bb46`).

---

## Puntos de vuelta

```bash
git checkout punto-seguro-2026-08-29 -- .      # antes del trabajo autónomo
git checkout estado-2026-08-30-madrugada -- .  # después, todo verde
```

Los cambios de **datos** no se revierten con eso: están en la base. Los
respaldos viven en `app_meta/respaldo_fusion_vehiculos` y
`app_meta/respaldo_odometro`.

---

# Lo anterior (26-08-2026 y antes)

Este fichero es el relevo. Si abres una sesión nueva (otro ordenador, Claude en
la web), lee **CLAUDE.md** primero —ahí están las reglas y los 27 gotchas— y
luego esto, que es lo que está a medias hoy.

> Este repositorio es **PÚBLICO**. Nada de claves, contraseñas, teléfonos ni
> correos de personas aquí dentro. Ya pasó una vez con una clave de Google y
> sigue en el historial de git; ver el punto 1.

---

## Hecho el 20-08 y ya en producción

| Qué | Dónde se ve |
|---|---|
| 5 conductores en ruta no podían auditar (fichas duplicadas) | Portal del conductor |
| La app entera caída 2 h 26 por un tropiezo de Mongo | `/api/vivo`, fly.toml |
| 60 de 140 documentos invisibles | Vehículos → pestaña **Documentación** |
| Direcciones: normalizador + Catastro + Overpass, 40% → 68% | Paquetes IA → "No puedo encontrar la dirección" |
| Qué hay en la coordenada cuando no hay texto | La misma pantalla |
| Los mensajes de la web no avisaban a nadie | Telegram |
| La tarjeta de salud decía "amplía ya" con el plan ampliado | Negocio → Salud |

Todo commiteado y empujado a `lab` y a `main`.

---

## Hecho el 21-08 y ya en producción

| Qué | Dónde se ve |
|---|---|
| Dar y quitar permisos no funcionaba (el rol nunca viajaba en el token) | Usuarios |
| Quitar un módulo no se notaba hasta 72 h después o hasta volver a entrar | Usuarios |
| Borrar un usuario no exigía ningún permiso | API `/auth/admins` |
| "Asignación diaria" salía en el menú y al pulsarla te expulsaba | Menú del panel |
| "Dónde se entrega" estaba CAÍDA (`t is not a function`) | Panel → Dónde se entrega |
| Vehículos → Documentación, caída por lo mismo | Vehículos |
| El calendario de flota se caía con un mes sin datos | Vencimientos → Calendario |
| El despliegue no se comprobaba: ahora falla a gritos | `scripts/verificar-produccion.ps1` |
| 4 tests de permisos, donde no había ninguno | `backend/tests/test_api.py` |

Commits `169d5d1`, `1a7d5e0` y `7b47ddd`, en `main` y en `lab`.

**Cambio que se nota:** los gestores de centro ahora ven MENOS gente en Usuarios.
No es un fallo nuevo — es el filtro por centros, que llevaba desde siempre sin
aplicarse porque `admin_role` no llegaba nunca al servidor.

---

## Hecho del 22 al 26-08 y ya en producción

Cuatro días parados por facturas de Fly sin pagar: el código estaba escrito y
probado desde el 22 pero **Fly bloquea la compilación**, no la ejecución, así
que producción seguía viva con la versión vieja. Desbloqueado el 25 y desplegado
todo de golpe.

| Qué | Dónde se ve |
|---|---|
| Cuadrante rehecho: códigos con hora, orden alfabético, máximas / piden / a ruta, días aprobados bloqueados en rosa, rango de fechas libre, descarga a Excel | Turnos |
| Módulo DNR: lee los Daily Report en `.html` tal cual se bajan de Cortex (las 5 tablas, hasta 120 de golpe) y cruza con el historial | DNR · Diarios |
| El Transporter ID vive en la ficha del conductor y se puede corregir | Conductores · DNR |
| Inspecciones y Revisión Rápida en negro para quien tiene centros limitados | El centro se filtraba DESPUÉS del límite |
| Órdenes de taller + portal del taller sin usuario ni contraseña, por pasos | Flota → Órdenes de taller |
| La IA se autoexamina, puede decir "no lo puedo juzgar", y revisión exprés | Revisión rápida |
| `check-permisos.mjs`: una pantalla sin su casilla ya no puede colarse | CI |

Ocho commits, de `752e8ed` a `b4806c3`. Todo en `main`.

**Lo que más cambia el día a día:** el portal del taller. Se manda un enlace por
WhatsApp, el taller lo abre en el móvil sin registrarse y va poniendo estado,
fotos, fecha de entrega y presupuesto. Te avisa por Telegram cuando está lista,
falta una pieza o **se mueve la fecha de entrega**.

---

## Lo que está PENDIENTE, por orden de lo que más duele

### 1. Rotar la clave de Google Geocoding — LO QUE MÁS CORRE
No era "se pegó en un chat". **Estaba escrita en claro en este mismo fichero, y
el repositorio de GitHub es PÚBLICO**: llevaba desde el 20-08 publicada, en el
párrafo que avisaba de que estaba filtrada. Se quitó del texto el 21-08, pero
sigue en el historial de git (commit `2f0bb46`) y puede estar ya rastreada.

Se buscó en TODO el historial: hay exactamente un commit con una clave de Google
dentro, y es ese. Nunca estuvo en el código.

Quitarla del texto NO la desactiva. **Hay que rotarla en la consola de Google
Cloud.** Empieza por `AIzaSyCd45`, suficiente para reconocerla allí.

### 2. Los permisos no se comprueban en el servidor — lo gordo que queda
Lo del 21-08 arregló que dar y quitar permisos FUNCIONE. No arregló que los
permisos PROTEJAN algo.

`_puede()` está definido una vez en server.py y, en 29.201 líneas, se llama en
**cuatro sitios — los cuatro para lo mismo**, `aprobar-dias`. Todo lo demás es
esconder botones del menú: quien sepa la dirección de la API entra igual, tenga
el módulo o no. Y esa única comprobación se salta entera si la organización es
`owner` — la tuya.

(Medido de nuevo el 26-08: `grep -n "_puede(" backend/server.py`. Si algún día
esa cuenta sube de verdad, actualiza este párrafo.)

No es un arreglo de una tarde: empezar a exigirlos deja fuera a gente que hoy
entra, sobre todo con `permissions: null` mezclado con listas viejas
incompletas. **Antes de tocar nada, sacar la lista de qué permisos tiene cada
usuario en BD y mirarla.** Después, ir por fases.

### 3. ~~Saber si el job de backend del CI pasa~~ — RESUELTO 22-08
Se ejecutaron los tests contra una base `test_` del propio Atlas (borrada
después). Fallaba **un solo test**, y estaba destapando un fallo de producción:
`_date_range` no existía, así que `/shifts/generate` y `/shifts/generate-auto`
reventaban con `NameError`. El botón "Generar cuadrante" de Turnos llevaba
devolviendo 500 desde siempre.

Arreglado. **23 de 23 en verde.** De paso, `pyflakes` sacó otros dos nombres
inexistentes (ver gotcha 19 en CLAUDE.md); ahora da cero.

### 4. Ponerle un cerrojo a `capturas.spec.js`
Reescribe las 5 imágenes de la landing (`frontend-v2/public/capturas/`) CADA VEZ
que alguien lanza la batería completa de pruebas, sin pedirlo. Pasó el 21-08:
las sustituyó por unas 7 veces más pesadas (93 KB → 794 KB) y hubo que
revertirlas. Está pensado para lanzarlo a propósito con `--update-snapshots`,
pero no se protege. Son dos líneas.

### 5. Confirmar el plan de Atlas — medio resuelto
`hostInfo` está bloqueado porque **el usuario de la base no tiene permisos de
admin**, no porque el clúster siga siendo gratuito. Se comprobó el 22-08 al
intentar borrar las bases `test_`: `not authorized ... to execute command
dropDatabase`. O sea que **desde dentro no se puede saber el plan**, y punto.

Queda mirarlo en el panel de Atlas: qué tier tiene **WiniwWinw** y si hay más de
un clúster. Si el límite real no son 10 GB: `fly secrets set ATLAS_LIMITE_MB=<mb>`.

### 6. Contestar a los dos mensajes de la web
Llevan esperando desde el 15-08 y los dos son **candidaturas de empleo**, no
clientes. Uno es jefe de tráfico/flota y vio una oferta en LinkedIn; el otro
solo dejó el correo con asunto "Empleo".

Los nombres y correos estaban escritos aquí y **este repositorio es público**:
se han quitado el 26-08. Están en el panel, en **Bandeja**, que es su sitio.

### 7. Borrar `sample_mflix`
115 MB de la base de datos de ejemplo de MongoDB (21.349 películas). No es
nuestra: el propio código ya la excluye de las copias de seguridad. Falta el OK
de Dani porque borrar una base entera no se deshace.

### 8. Fusionar las fichas duplicadas
17 personas repetidas (21 fichas de más) y 12 matrículas repetidas. El síntoma
está tapado (el portal mira todas las fichas de la persona), pero el historial
de daños de esas personas sigue partido en dos. Es destructivo: hay que
reapuntar inspecciones, incidencias, cuadrantes y scorecard, y decidir qué ficha
sobrevive. Enseñar la lista antes de tocar nada.

### 9. Direcciones: las 55 que no se sitúan
De 173 que han fallado alguna vez, quedan 55 sin situar ni siquiera con el
normalizador. Son las de nombre de empresa, las de "Centro de Negocios, 2ª
planta" y las de lugares que no están en ningún callejero. El siguiente paso
razonable **no** es pagar otro geocodificador —está medido, no aportaría— sino
un botón de "confirmar ubicación" para que una persona la fije una vez y quede
para siempre.

### 9b. Lo que sacó la auditoría de datos del 22-08
Cero referencias rotas: ni un solo documento apunta a una furgoneta o un
conductor que ya no exista. La base está sana. Lo que sí hay:

- **Centros escritos de cuatro formas.** `'OGA5'` (65), `'AMZL OGA5 SANTIAGO XPT'`
  (37), `'oga5'` (5) y `'OGA5 '` con espacio (2). Funciona porque todos los
  filtros van por regex (gotcha 6), pero cualquier recuento por centro que
  alguien escriba sin acordarse sale mal. Normalizarlo es una migración de
  datos: hace falta el OK de Dani.
- **14 matrículas y 12 correos duplicados.** Los índices existen pero NO son
  únicos, y no pueden serlo hasta fusionar las fichas (gotcha 9: crear el único
  con duplicados dentro falla y te deja sin índice).
- **17 conductores sin centro y 12 sin correo** — los 12 no pueden entrar al
  portal.
- **10 peticiones pendientes sin explicación**, de antes de exigirla. No pasa
  nada, son antiguas.

Arreglado ya: `drivers.email` no tenía **ningún** índice y es la llave del
portal. Cada login recorría las 202 fichas enteras; ahora examina 2.

### 10. ~~El cuadrante~~ — HECHO 22-08
En Turnos, con los 16 códigos reales, hora por celda, días aprobados que nadie
puede mover salvo quien tenga `aprobar-dias`, y descarga a Excel.

### 11. ~~Módulo de taller~~ — HECHO 25/26-08
Órdenes de trabajo + portal del taller por pasos, sin usuario ni contraseña.
Lo que NO está y es decisión tuya: **el bot de WhatsApp**. Necesita verificar la
empresa en Meta y plantillas aprobadas; son semanas y no depende del código. Lo
que hay funciona hoy sin depender de nadie.

### 12. Marcar la casilla "DNR · Diarios" a quien deba verla
La casilla no existía, así que **nadie la tiene**. Se creó el 26-08. Usuarios →
la persona → marcar. Crear la casilla no concede nada: eso lo decides tú.

### 13. Los 450 daños esperando validación
Revisión rápida → "Revisar en 5 segundos". Salen ordenados por lo que enseñan,
no por fecha: primero las piezas de las que no hay ni un ejemplo.

Es lo único que hace que la IA mejore. Medido el 25-08: acierta el **7,1 %** de
lo que reporta, pero dice "sin daños" en el **86 %** de las inspecciones y ahí
casi nunca falla. O sea: **cuando calla acierta, cuando habla suele fallar.** Y
la señal está muerta — 11 validaciones en 30 días sobre 1.568 inspecciones.

Aviso para leerlo bien: sus recuadros **se equivocan de sitio a menudo** (hay un
retrovisor izquierdo marcado en la trasera del vehículo). Por eso hay un botón
"Sí, pero no ahí": si el daño existe y el recuadro está mal, ESE es el botón. El
"No existe" solo cuando de verdad no hay daño.

### 14. Cargar los 144 Daily Report que están en Descargas
DNR · Diarios → "Subir Daily Report", arrastrando los `.html`. Son de cuatro
centros (OGA5, DGA1, DIC1 y DMA3) y suman 10.790 € en fallos de entrega que
hoy no están en la app. Los anteriores al 13-05 no traen columna DSC: sus DNR
se guardan **sin clasificar**, ni acierto ni fallo.

### 15. Cinco talleres sin teléfono
Los dos Carglass y los tres Toyota. Sin teléfono, el botón de "mandar por
WhatsApp" abre la app pero hay que elegir el contacto a mano.

---

## Cómo desplegar desde otro ordenador

Hace falta autenticarse una vez en cada servicio. **No hacen falta tokens
pegados en ningún sitio**: los dos comandos abren el navegador.

```bash
fly auth login
npx wrangler login
```

Y luego el frontend, con una sola orden. Compila, despliega **a la rama main**
y comprueba que flotadsp.com sirve lo recién compilado:

```powershell
.\scripts\deploy-frontend.ps1
```

El backend sigue igual:

```bash
cd backend && fly deploy --strategy immediate
```

> **`--branch main` no es opcional.** Sin él el despliegue entra como Preview de
> la rama `lab` y flotadsp.com no cambia, sin dar ningún error. Es el gotcha 16 y
> el 20-08 costó que dos cosas parecieran no funcionar. En `deploy-frontend.ps1`
> va cosido y no se puede olvidar: para eso existe.

## La comprobación de después (21-08)

Esto es lo que faltaba el 20-08: el despliegue se iba a Preview y nadie lo miraba.

```powershell
.\scripts\verificar-produccion.ps1
```

Compara el hash del bundle de `frontend-v2\dist` con el que sirve flotadsp.com,
y mira `/api/health` (backend vivo + Mongo conectado). Si producción se quedó con
lo viejo sale en rojo, dice que casi seguro es el gotcha 16 y **devuelve código 1**
—o sea, en CI o en un `&&` se para ahí—. Probado en los dos sentidos el 21-08:
pasa cuando coincide y grita cuando no.

Admite `-Esperar <segundos>` para reintentar mientras el edge propaga (el deploy
lo llama con 90) y `-SoloBackend` si no has tocado el frontend.

## La primera vez en un ordenador

Además de los dos logins de arriba:

```bash
cd frontend-v2 && npm ci
```

El 21-08, en un clon que llevaba parado desde julio, `node_modules` era viejo y le faltaban
dependencias nuevas (`@react-three/fiber`): la compilación fallaba sin más pista
que un "Rollup failed to resolve import". `npm ci` y listo.
