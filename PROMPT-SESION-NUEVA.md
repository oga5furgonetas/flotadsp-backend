# Prompt para una auditoría completa de FlotaDSP

Abre una sesión nueva **dentro de `C:\Users\Usuario\Downloads\flotadsp_lab`** y
pega como primer mensaje todo lo que hay debajo de la línea.

---

Eres el único desarrollador de **FlotaDSP**, un SaaS de gestión de flotas para
DSPs de Amazon. Lo usa una empresa real todos los días y están entrando
clientes nuevos. Lo que rompas se nota mañana en una nave, con furgonetas
paradas y gente esperando.

Tu trabajo en esta sesión: **auditar la aplicación entera, función por
función, encontrar todo lo que esté mal o a medias, arreglarlo, desplegarlo y
comprobar en producción que funciona.** No pares a preguntar si sigues. Sigue.

**Lo primero, antes de tocar una línea: léete `CLAUDE.md` entero.** Son 44
gotchas y cada uno es un bug real que ya costó dinero o un día de trabajo,
escrito con el síntoma, la causa y cómo se encontró. Si vas a hacer algo que
un gotcha desaconseja, el gotcha gana. Luego `ESTADO.md`, `CHECKPOINT.md` y
`docs/ROADMAP.md`.

## La regla que manda sobre todas: cero falsos positivos

Un aviso que miente gasta la confianza en todos los demás avisos. Ha pasado en
este proyecto: se avisó de que la base se llenaba en cinco días cuando estaba
al 4,8 %, y una pantalla decía «N conductores no pueden entrar al portal»
cuando entraban todos. Los dos avisos eran peor que no tener nada.

De ahí salen cuatro obligaciones, y no son negociables:

1. **Antes de afirmar que algo está mal, demuéstralo con datos.** Ejecuta la
   consulta, llama al endpoint, mira la base. No con lectura de código.
2. **Antes de construir algo, busca si ya existe.** Se han duplicado un medidor
   de espacio, un botón de WhatsApp y un normalizador de centros por no mirar.
3. **Antes de dar un arreglo por bueno, comprueba que la empresa principal
   sigue dando exactamente lo mismo que antes.** Un arreglo multiempresa que
   cambia el comportamiento de quien ya lo usaba es un bug nuevo.
4. **Toda regla nueva que añadas, pruébala reintroduciendo el bug a
   propósito.** Si no lo detecta, no sirve. Y aféinala hasta que no dé ningún
   aviso en falso: un checker que grita en falso deja de leerse, y entonces
   esconde los de verdad. Ha pasado tres veces aquí.

## El método: así es como salen los bugs

Casi ninguno de los bugs graves de este proyecto se encontró leyendo código.
Salieron **ejecutando cosas**. Estas son las técnicas que han funcionado —
úsalas todas, en este orden, y anota lo que salga:

### 1. Recorrer la app con una empresa recién creada

```bash
python backend/scripts/smoke_empresa_nueva.py
```

Da de alta una empresa de usar y tirar y recorre el primer día entero. **Es el
único sitio donde se prueba la base vacía**, que es el camino que los clientes
nuevos recorren completo y que con una flota llena de datos no se pisa nunca.
Sacó seis bugs de golpe que llevaban meses ahí, y **todos respondían HTTP 200**.

Amplíalo. Con una empresa nueva, barre a mano:

- **las 155 rutas GET** con y sin `?center=`, `?from=/&to=`, `?week=`, `?days=`.
  Un 5xx es siempre culpa nuestra: el código dio por hecho que había datos.
- **las mutaciones con el cuerpo vacío** y con campos a medias. Lo sano es 400
  o 422 diciendo qué falta; un 500 es que no valida.
- **las rutas con `{id}`** con un id que no existe: tiene que dar 404, no 500.

### 2. Dos peticiones a la vez

Todo lo que se crea «solo la primera vez» hay que probarlo con **cinco
llamadas simultáneas**. En producción esa primera vez ocurre una sola vez y
nadie la vuelve a ver, así que si no se prueba aquí no se prueba nunca. Así
salieron dos bugs: el checklist y las plantillas de taller.

### 3. Comparar lo que la pantalla enseña con lo que se puede tocar

Busca datos que la interfaz **muestra** y que **nadie puede rellenar**: el chip
de bolsas de cada furgoneta decía 0 en todas las empresas porque las rutas que
lo actualizan no tenían botón. Un dato que se enseña y no se puede rellenar es
peor que no enseñarlo.

Y al revés: rutas del backend que nadie llama. `node scripts/check-huerfanas.mjs`
está a cero — si sube, o se engancha o se anota con el motivo.

### 4. Buscar filtros por valores que no existen

Un filtro por un valor que no existe **no da error: devuelve cero o no filtra
nada**, y cero parece un hallazgo. Ha pasado tres veces:

- `analysis_status == "done"` cuando el valor real es `"ok"` → «0 de 1.570
  inspecciones analizadas» siendo 1.569.
- `$nin ["entregada", "anulada"]` cuando el estado es `"entregado"` → órdenes
  cerradas contando como abiertas.
- `_normalize_center_code` con los tres centros escritos a mano → Revisión
  Rápida filtrada por centro devolvía cero en toda empresa que no fuera la
  principal.

**Antes de creerte un cero, mira qué valores tiene de verdad el campo** con un
`$group` sin filtrar.

### 5. Cuadrar los números de cada pantalla

Si una pantalla reparte en cajones, **la suma tiene que dar el total**. El
debrief contaba 7.171 paquetes y sus cajones sumaban 7.050: 121 invisibles.
Siempre un cajón de sobras, y la suma comprobada. Y si el mismo número aparece
dos veces en una pantalla, comprueba que salen de la misma población.

### 6. Leer los errores que la app ya guarda

`GET /client-errors` tiene los errores de navegador reales de los usuarios. Ahí
salió que salir de Configuración rompía la pantalla siguiente. Míralos: son
fallos que alguien ya ha sufrido.

### 7. Campos y colecciones muertas

Busca:
- colecciones en las que solo se **escribe** y nunca se lee (`driver_assignments`);
- campos que se **leen** para decidir algo y no se escriben desde ningún sitio
  (`current_driver_id`);
- colecciones **vacías en producción** que alimentan una pantalla
  (`daily_ratios`, gotcha 34; `driver_scorecard` lo estaba hasta ayer).

Una pantalla que responde 200 con una lista vacía parece que funciona.

### 8. Eficiencia, medida y no supuesta

- **Contar en Python lo que Mongo cuenta solo.** `find(...).to_list(20000)` +
  agrupar a mano se quedaba con los 20.000 más viejos y el día de hoy no salía
  nunca (gotcha 10). Usa `$group`, sin límite.
- **N+1**: un `find_one` dentro de un bucle sobre cientos de documentos. Búscalos
  y pásalos a una consulta en lote.
- **Índices**: toda consulta que filtre por un campo en una colección grande
  necesita índice. `cortex_packages` tiene ~167.000 documentos.
- **Mide antes y después.** Un «esto será más rápido» sin número no vale.

### 9. Interconexión: seguir el dato de punta a punta

Coge un dato y síguelo desde donde entra hasta donde se enseña: conductor →
cuadrante → inspección → daño → libro de daños → orden de taller → informe de
Amazon. En cada salto pregunta **qué pasa si el paso anterior no ocurrió**. Así
se vio que el daño que detecta la IA no entraba en el libro hasta que un humano
lo confirmaba, y que lo que el taller decía por el portal no llegaba a la
bandeja del DSP.

## Lo que no se toca sin permiso

- **El repositorio es PÚBLICO**: ningún teléfono, correo, matrícula real ni
  clave en el código. Las credenciales las pone Dani con `fly secrets set`.
- **Nada destructivo en producción sin que Dani lo autorice explícitamente**:
  ni `DELETE` masivos, ni `DROP`, ni migraciones que borren, ni
  `git reset --hard`, ni `git clean -fd`. **El silencio no es autorización.**
- Si vas a borrar código que parece muerto, demuestra antes que nadie lo llama
  —incluidos la extensión de Chrome, la app Flutter y los scripts— y pregunta.

## Reglas del proyecto

- **Multiempresa**: `db` resuelve por un contextvar **con valor por defecto**,
  así que un endpoint sin sesión escribe en la empresa principal sin fallar
  (gotcha 26, lo vigila `check_tenant.py`). Y ningún centro de la empresa
  principal puede decidir por las demás (gotcha 43, `check_multiempresa.py`).
- **Frontend siempre con `.\scripts\deploy-frontend.ps1`**: `--branch main` no
  es opcional (gotcha 16) y el script calienta el edge, que evita el
  envenenamiento de assets (gotcha 8) — en un despliegue real cazó dos chunks
  sirviéndose como HTML.
- **Backend**: `cd backend && fly deploy --strategy immediate`, y luego
  `GET /api/health` tiene que dar `status=ok, mongo=True`.
- **Antes de cada commit**: los **15 checkers** de `scripts/` en verde (ninguno
  tolera backlog), `python backend/tests/run_all.py` (24 tests), y
  `python -m pyflakes backend/server.py | grep "undefined name"` a cero — ahí
  se cazan los `NameError` que viven meses en rutas que nadie prueba.
- Commits en español, `feat:`/`fix:`, push a `main`.
- **Los `.ps1` van en ASCII puro** (gotcha 44) y **los heredocs de bash mastican
  `\n`, comillas y tildes**: para editar código usa la herramienta de edición,
  no `cat <<EOF`.

## Cómo escribir lo que arregles

Cuando encuentres algo, deja el porqué donde se vaya a leer:

- **en el comentario del código** si es local — qué pasaba, no qué hace;
- **en un gotcha de `CLAUDE.md`** si es una trampa que se puede repetir;
- **en un test** si se puede automatizar.

Los comentarios de este proyecto explican **el fallo que evitan**, no la
sintaxis. Sigue ese estilo: dentro de seis meses, lo que salva a alguien es
saber por qué está ahí esa línea rara.

## Qué se espera al final

Que cada función de la app esté llevada a su máximo: los flujos completos y
conectados, sin datos que se enseñan y no se pueden rellenar, sin pantallas que
dan cero porque el filtro busca algo que no existe, sin rutas muertas, sin
números que no cuadran, y sin un solo aviso que mienta.

Cuenta lo que haces en cristiano y en español: qué estaba mal, qué se rompía
para quien lo usa, y qué has hecho. Si te equivocas, dilo y sigue. Si algo te
bloquea, di exactamente qué hace falta para desbloquearlo.

**El criterio para priorizar**: la pregunta de un DSP a las seis de la mañana
no es «cuántos partes tengo abiertos», es **«¿me da la flota para hoy?»**. Lo
que responda a eso vale más que lo que solo enseñe datos.

## Lo que ya se sabe que está abierto

1. **La clave de Google Geocoding sigue en el historial público de git**
   (commit `2f0bb46`). Hay que rotarla — es tarea de Dani, recuérdaselo.
2. **`daily_ratios` está vacía en producción** y no la llena nadie: depende de
   que alguien suba un fichero a mano. `/scorecard/en-vivo` calcula lo mismo
   desde `cortex_packages`, que se actualiza solo. O se conecta o se quita.
3. **`driver_assignments` es de solo escritura** y `current_driver_id` no se
   puede poner desde ninguna pantalla, aunque el backend lo lee para decidir si
   un conductor puede inspeccionar «su» furgoneta.
4. **`license_plate` no tiene índice único.** Se aplazó por arriesgado; sigue
   pendiente y puede haber duplicados.
5. **Se acumulan bases `dsp_*` huérfanas** al borrar empresas: el usuario de
   Atlas no tiene permiso de `dropDatabase`.
6. **La cuota de Gemini se agota** (~20 peticiones/día) y cuando pasa, TODA la
   IA deja de funcionar el resto del día. Sospecha de la cuota antes que del
   código, y que ninguna función nueva que la use tumbe lo demás al fallar.
7. **La cuenta de Meta sigue bloqueada**, WhatsApp sin activar. El canal de
   vuelta del taller ya funciona entero por el portal, así que no es urgente.

## Tres formas de perder el tiempo, por haberlas perdido

- **Dar por hecho un límite o un valor sin comprobarlo.** Se supuso que la base
  era de 512 MB y se avisó de una urgencia falsa; eran 10 GB, y el dato estaba
  en un secret, en un endpoint que ya lo medía, y en que llevábamos días
  escribiendo sin un solo error.
- **Copiar constantes del backend en un script de diagnóstico.** Tres scripts
  seguidos con las listas de estados tecleadas a mano dieron un DCR del 1,58 % y
  casi se da por bueno que la alerta fallaba. Léelas del `server.py` con `ast`,
  sin ejecutarlo.
- **Escribir código con heredocs de bash.** Mastican `\n`, comillas y tildes, y
  rompen el fichero. Ha pasado más de cinco veces.

Empieza por el punto 1 del método y ve bajando. Cuando termines la primera
pasada, vuelve a empezar: en cada vuelta salen cosas que en la anterior no se
veían.
