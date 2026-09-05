# FlotaDSP — contexto del proyecto

SaaS de gestión de flotas para DSPs de Amazon: inspecciones con foto + IA de daños,
alertas de ITV, scoring de conductores, scorecard, asignación diaria, chat, incidencias.
Multi-tenant con planes de pago (Lemon Squeezy). Un solo desarrollador (Dani).

## Estructura

- `frontend-v2/` — React 18 + Vite. **El frontend activo.** (`frontend/` es el viejo, NO tocar.)
- `backend/server.py` — FastAPI monolito (~13k líneas) + `ai_learning.py` (aprendizaje IA).
- `scripts/` — checkers que corren en CI (i18n, rutas duplicadas, contratos).
- `.github/workflows/ci.yml` — build + checkers en cada push.

## Producción y deploy

- Frontend: Cloudflare Pages → **flotadsp.com**
  **`.\scripts\deploy-frontend.ps1`** — compila, despliega y **comprueba** que
  flotadsp.com sirve de verdad el bundle recién compilado. Usa esto, no el
  comando a mano.
  A mano sería: `cd frontend-v2 && npm run build && npx wrangler pages deploy dist --project-name flotadsp-v2 --branch main --commit-dirty=true`
  **`--branch main` no es opcional** (gotcha 16): sin él el despliegue entra como
  Preview de la rama `lab` y flotadsp.com no cambia, sin ningún error. Por eso
  existe el script: ahí va cosido y no se puede olvidar.
- Backend: Fly.io → **https://flotadsp-backend.fly.dev**
  `cd backend && fly deploy --strategy immediate`
  Smoke test tras deploy: `GET /api/health` debe dar `status=ok, mongo=True`.
- **Comprobación después de cualquier despliegue**: `.\scripts\verificar-produccion.ps1`
  Compara el hash del bundle de `frontend-v2/dist` con el que sirve flotadsp.com
  y mira `/api/health`. Sale con código 1 y grita en rojo si producción se quedó
  con lo viejo. Es la red que faltaba el 20-08: nadie comprobaba el despliegue.
- `app.flotadsp.com` sirve la app antigua (legado, no tocar).

### Staging (probar sin miedo antes de tocar producción)

- Backend: **https://flotadsp-backend-staging.fly.dev** — app Fly aparte con
  `min_machines_running=0` (se apaga sola en reposo, coste ~0 €; el primer
  request tras dormir tarda ~2-3 s). BD `staging_flotadsp` +
  `staging_flotadsp_global` en el MISMO Atlas. Sin Telegram/Gemini/webhook LS
  a propósito. Login staging: usuario `admin` (password en secrets de Fly).
  `cd backend && fly deploy -c fly.staging.toml --strategy immediate`
- Frontend: **https://staging.flotadsp-v2.pages.dev** — alias de rama del mismo
  proyecto Pages, compilado apuntando al backend de staging:
  `cd frontend-v2 && VITE_API_URL=https://flotadsp-backend-staging.fly.dev/api npm run build -- --outDir dist-staging && npx wrangler pages deploy dist-staging --project-name flotadsp-v2 --branch staging --commit-dirty=true`
  (usa `dist-staging/` para NO pisar el `dist/` de producción).
- CORS ya admite `*.flotadsp-v2.pages.dev` por regex: no hay que tocar nada.
- MongoDB Atlas + Cloudflare R2 (fotos/documentos) + Gemini (análisis) + ai-service YOLO11+SAM2.
- Backup diario automático a R2 a las 04:00 (scheduler en startup de server.py).

## Arquitectura clave

- **Multi-tenant**: cada org tiene su BD Mongo (`dsp_<org_id>`). `db` en server.py es un
  `_TenantDBProxy` que resuelve por contextvar (lo fija `get_current_user` desde el JWT).
  Login/orgs/resets viven en `global_db`. ¡Cachés en memoria deben separarse por BD!
- **Auth**: JWT en localStorage (`flotadsp_token`). Roles: super-admin (`sa`), owner, admin,
  driver. `require_admin`/`require_superadmin`/`require_any_auth` como Depends.
- **i18n**: `frontend-v2/src/i18n.jsx`, `useT()`, claves `'veh.title'`, 6 idiomas.
  Clave no definida = se ve literal en la UI. El checker de CI lo detecta.
- **Panel**: páginas en `src/panel/pages/`, reciben `{ center, centers }` de `useOutletContext()`.
  Rutas lazy en `main.jsx` (code-splitting: no añadir imports eager de páginas).
- **IA que aprende**: ✓/✗/corrección/daño-no-visto de Revisión Rápida → `ai_feedback` →
  `ai_learning.py` inyecta ejemplos few-shot + patrones agregados en los prompts de Gemini.
- **Monetización** (bloque MONETIZACIÓN al final de server.py, colecciones en `global_db`):
  oferta fundador en /planes (10 plazas reales, `founder_reservations`, avisa por Telegram)
  y ofertas patrocinadas del portal conductor (`driver_offers`, views/clicks; sin ofertas
  activas sirve auto-promo de referidos). Gestión super-admin en el panel de Negocio.
- **Apoyo en ruta** (`/api/apoyo/*`, `docs/APOYO_EN_RUTA.md`, 02-09-2026): un
  conductor le quita paradas a otro. Las paradas salen de `cortex_packages` de
  la empresa con los cajones canonicos (`_cx_ruta_cajon`), el registro va en
  `apoyos` (campo de estado **`fase`**, no `estado`: `test_estados_orden`
  vigila los literales de las ordenes de taller), y cada uno recibe un enlace
  `wa.me` con el texto escrito y la pagina publica `/apoyo/t/<token>` (mapa
  Leaflet + OSM). Sin API de Meta: la oficina pulsa enviar.
- **Enlaces publicos**: `flotadsp_global.taller_enlaces` es el registro de
  TODOS los enlaces sin sesion (`tipo: taller | apoyo`), siempre con `db_name`;
  el endpoint fija la empresa con `_ot_por_token` / `_apoyo_por_token` (gotcha 26).
- **Telefonos desde Cortex**: `cortex_resumen.gente` trae nombre y telefono de
  cada conductor. `_telefonos_desde_cortex` rellena SOLO los vacios por
  `transporter_id` (`telefono_por: "cortex"`), en cada ingesta y con el boton
  de Conductores. Nunca pisa uno escrito: 6 de 19 no coincidian (02-09-2026).
- **Registro de escrituras**: todo POST/PUT/PATCH/DELETE queda 30 dias en
  `flotadsp_global.audit_requests` (usuario, empresa, ruta, estado, ms);
  `GET /admin/actividad` lo consulta. Es lo que faltaba el 01-09 (gotcha 45).

## Gotchas (bugs reales ya sufridos — no repetir)

1. **Whitelists de PATCH** (`_VEHICLE_ALLOWED`, `_DRIVER_ALLOWED`): si el frontend envía un
   campo que no está en la whitelist, se descarta EN SILENCIO. Al añadir un campo editable,
   añadirlo a la whitelist Y al modelo Pydantic (los `response_model=` filtran la respuesta).
   `scripts/check_contracts.py` valida esto en CI.
2. **Funciones/rutas duplicadas en server.py**: la segunda def pisa a la primera; la segunda
   ruta igual es inalcanzable. `scripts/check-routes.mjs` lo detecta.
3. **change-my-password devuelve 401** con contraseña actual errónea — el interceptor de
   sesión expirada del frontend lo excluye a propósito (services/api.js).
4. Python local en Windows: `%LOCALAPPDATA%\Programs\Python\Python312\python.exe`
   (instalado 2026-07; el alias `python` de la Store puede no funcionar en shells no interactivos).
   Validar backend antes de commitear: `python -m py_compile backend/server.py` +
   `python scripts/check_contracts.py`. server.py lleva BOM UTF-8 (leer con utf-8-sig).
5. **La BD del tenant principal se llama `flotadsp`, NO `dsp_<org_id>`.** Las orgs
   nuevas sí usan `dsp_<id>`, pero la tuya es la original y se quedó con el nombre
   viejo. Un script que recorra solo `dsp_*` para comprobar algo en producción se
   salta TODOS tus datos y da un falso negativo (pasó: dije "0 documentos" de cosas
   que tenían cientos). Recorre todas las BDs y excluye `admin/local/config`.
6. **`center` está guardado sucio**: `'OGA5'`, `'OGA5 '` (con espacio), `'oga5'`,
   `'AMZL OGA5 SANTIAGO XPT'`. Cualquier filtro por centro va por `$regex` sobre el
   código, nunca por igualdad. Y `inspections`, `incidents` y `alerts` NO tienen
   campo `center`: se acotan por `vehicle_id` contra las furgonetas del centro.
   **Actualizado el 30-08-2026.** Se había corregido el dato y esquivado en la
   lectura, pero nunca se PREVINO: hay 148 sitios que escriben el centro y solo
   dos lo normalizan, así que basta un espacio de más desde cualquiera de los
   otros 146. Parchear los 148 sería frágil —el 149 se olvidaría—, así que la
   defensa es `/checkers/centros`: **descubre solas** las colecciones con campo
   `center` (37 hoy) y unifica con `_centro_norm`, respaldo en
   `app_meta.respaldo_centros`. Encontró dos que estaban partidas y que el
   análisis del código no veía porque nadie las filtraba por igualdad:
   `maintenance_log` (**5 de 9 registros invisibles**) y `ordenes_trabajo`.
   La regla de `_centro_norm` es que **no adivina**: solo reescribe cuando en el
   texto hay EXACTAMENTE UN código que ya existe limpio. Con dos, no toca nada —
   si adivinara, movería documentos al centro equivocado, que no se nota y es
   peor que una lista corta. 15 casos en `backend/tests/test_centros.py`.
7. `frontend-v2/dist/` NO se versiona (está en .gitignore desde 2026-07). Es el build:
   se regenera con `npm run build` antes de cada deploy. Antes se commiteaba y provocaba
   conflictos masivos al trabajar desde dos ordenadores; ya no.
8. **Un asset que no existe devuelve `index.html` con HTTP 200**, no un 404
   (`_redirects` es `/* /index.html 200` y Cloudflare Pages no admite 404 ahí
   ni sintaxis de negación — probado y desplegado, se ignora). Al desplegar,
   `index.html` (no-cache) trae los hashes nuevos al instante pero los chunks
   tardan en propagarse: un navegador que pida uno en esa ventana se guarda ese
   HTML bajo la URL `.js` durante 4 h y la app entera muere con
   *"Cannot read properties of undefined (reading 'default')"*. Pasó el
   2026-08-04: **un solo chunk** envenenado tumbaba flotadsp.com mientras curl
   y `*.pages.dev` servían el JS correcto byte a byte. La defensa es
   `repairAssetCache()` en `main.jsx`: re-descarga los assets con
   `cache:'reload'`. Tiene que llamarse **antes** de cualquier recarga — una
   recarga a secas vuelve a servir el fichero podrido desde caché. Está
   enganchada al `ErrorBoundary` y a `vite:preloadError`.
   **Y el 2026-08-06 volvió a pasar, esta vez con el CSS**, que es peor porque
   es SILENCIOSO: la app monta perfecta, no lanza ningún error, y se ve en HTML
   crudo sin un solo estilo. Ni el `ErrorBoundary` ni `vite:preloadError` se
   enteran. Dos arreglos: (a) `repairAssetCache` solo miraba dentro del JS, y
   **el CSS principal solo aparece en el `<link>` del index.html** — no lo
   reparaba; ahora saca los assets de ambos. (b) Centinela nuevo en `main.jsx`:
   tras el `load`, si `document.styleSheets` suma <20 reglas, repara y recarga
   UNA vez por minuto (`sessionStorage.css_reparado`). Umbral con 68× de
   margen: el build real trae 1362 reglas, medidas en producción.
   **Y el 2026-08-15, tercer caso: el envenenado fue el PROPIO
   `index-<hash>.js`.** Ahí no salva ninguna de las tres defensas anteriores,
   porque las tres viven DENTRO de ese fichero: el navegador rechaza el módulo
   por MIME `text/html`, React no monta nunca y queda una pantalla EN BLANCO,
   sin error y sin recuperación, hasta 4 h. Otra vez `curl` servía el JS
   correcto byte a byte mientras el navegador tenía HTML cacheado bajo la URL
   `.js`. Cuarta defensa: `public/arranque.js`, script CLÁSICO y externo (la
   CSP no admite inline, igual que con `gtag-init.js`), cargado ANTES del
   módulo y servido con `no-cache`. Espera 10 s y, si `window.__flotaArrancada`
   no aparece y `#root` sigue vacío, repara la caché y recarga UNA vez (cerrojo
   en `sessionStorage.arranque_reparado`: un bucle de recargas en manos de
   alguien repartiendo sería peor que la pantalla en blanco).
9. **`update_one(..., upsert=True)` sin índice ÚNICO crea duplicados** en cuanto
   hay concurrencia: dos upserts que no encuentran documento insertan los dos.
   Pasó en `cortex_stations` (la extensión ingesta en ráfagas de miles). El
   síntoma no se parece a la causa: la asignación manual del panel hacía
   `update_one` y tocaba UNO de los duplicados, mientras la lectura montaba
   `{sid: doc}` recorriéndolos todos y **se quedaba con el último**, que podía
   ser el otro. Resultado: pulsabas el centro, el backend devolvía **200** y en
   pantalla no cambiaba nada; y como el ganador no tenía `manual`, la extensión
   lo repisaba en cada captura y la resincronización propagaba ese centro a
   53.000 paquetes — el mapeo oscilaba solo. Reglas: índice único en todo campo
   que sea clave de negocio, `update_many` cuando puedan existir duplicados, y
   al leer preferir explícitamente el documento manual.
   **Ojo al crear el único**: `create_index(campo, unique=True)` sobre un índice
   normal que ya existe con ese nombre NO lo convierte, falla con el código 86
   y se queda todo igual (hay que `drop_index` y recrear — `_idx_unico`). Y
   primero se limpian los duplicados: si no, la creación falla.
10. **Contar en Python lo que Mongo cuenta solo**: `find(...).to_list(20000)` y
   agrupar a mano. `/cortex/days` lo hacía y con ~167.000 paquetes el corte se
   quedaba con los MÁS VIEJOS, así que **el día de hoy no salía nunca** en el
   selector y el panel se abría en "Ayer"; los contadores por día también eran
   falsos (1 paquete en días de 3.000). Se agrupa con `$group` y sin límite.
11. **`toISOString()` sobre una fecha LOCAL corre el día en España.** `new Date(y, m, d)`
   es medianoche local; en UTC+2 su `toISOString()` cae en el día ANTERIOR. El
   calendario de flota montaba las claves de sus celdas así y pintaba todo un
   día tarde: las 5 ITV del 17 salían dentro del recuadro del 18, en silencio y
   sin error. Para una clave `YYYY-MM-DD` de una fecha local hay que componerla
   a mano con `getFullYear/getMonth/getDate`, nunca por ISO.
12. **La sesión del panel se guarda en DOS sitios y solo uno es fiable.** El JWT
   lo firma el servidor; el blob `flotadsp_admin` de localStorage lo escribe el
   cliente. `pages/Login.jsx` (la pantalla vieja de `/login`, que sigue viva y
   enlazada) guardaba a mano solo `name/role/id/account_type/slug`: sin
   `centers`, `allowed_centers`, `permissions` ni `admin_role`. Consecuencia en
   producción: el selector de centro se quedaba con UN solo botón "Todos" —
   `allCenters.filter(c => allowed.includes(c))` sobre una lista vacía — y como
   `getChat`, `getChecklist` y todo Scorecard mandan el centro CRUDO, pedían
   literalmente el centro llamado "Todos" y devolvían vacío. Un dispatcher veía
   el panel entero sin datos y sin ningún error. Reglas: la sesión se guarda
   SIEMPRE con `saveSession()` (un único escritor), y lo que el JWT sepa se lee
   del JWT (`getPermissions`, `getVisibleCenters`), no del blob.
13. **Una furgoneta `status: "baja"` está devuelta: no cuenta en nada.** Eran 16
   de 138 y salían en listas y contadores. `GET /vehicles` las excluye salvo
   `?estado=baja`, que es la pestaña "De baja" de la página de Vehículos. Al
   añadir una consulta nueva sobre `vehicles`, el filtro es
   `{"status": {"$nin": ["deleted", "baja"]}}`, nunca `$ne: "deleted"` a secas.
14. **Mongo OMITE la clave del `_id` en un `$group` cuando el campo no existe**
   en el documento (no la pone a `null`). `r["_id"]["cond"]` revienta con
   `KeyError` en cuanto hay un documento sin ese campo — pasó con los 94
   paquetes de Cortex sin `driver_id`. Usar siempre `.get()`.

15. **Hay conductores dados de alta DOS veces y el login cae en la ficha que
   no toca.** La importación creaba ficha nueva cuando el nombre venía con un
   espacio de más, un tabulador o en minúsculas: `'SERGIO LUIS ROJAS PEREZ '` y
   `'SERGIO LUIS ROJAS PEREZ'` son dos personas para Mongo. En producción: 202
   conductores, **17 personas repetidas** (21 fichas de más) y 26 nombres con
   espacios sobrantes. El daño no es el duplicado en sí, es que el cuadrante
   apunta a UNA ficha y el login del portal resuelve por email con `find_one`,
   que devuelve la que Mongo tenga primero — normalmente la otra. Resultado el
   19-08-2026: **5 conductores en ruta viendo "no tienes furgoneta asignada"**,
   y por pantalla parecía un fallo de separación por centros. Al tocar
   cualquier cosa que empareje conductor con cuadrante, asignación, inspección
   o daños, usar `_fichas_misma_persona()` y comparar contra el CONJUNTO de sus
   ids, nunca contra `user["sub"]` a secas. Se empareja por **correo**, nunca
   por nombre: dos tocayos distintos acabarían auditando el uno la furgoneta
   del otro. Pendiente aparte: fusionar las fichas (el historial de daños de
   esas personas está partido en dos).

16. **`wrangler pages deploy` sin `--branch main` NO toca flotadsp.com.** Coge
   el nombre de la rama de git, y en `flotadsp_lab` esa rama se llama `lab`, así
   que el despliegue entra como **Preview** de la rama `lab` y produccion se
   queda con el build anterior. No falla, no avisa: dice "Deployment complete",
   da una URL que funciona (`https://<hash>.flotadsp-v2.pages.dev`) y **el
   usuario sigue viendo la version vieja**. El unico sintoma es humano: "no lo
   veo". Pasó el 2026-08-20 con dos despliegues seguidos —el rescate de
   direcciones y la pestaña de Documentacion—: los dos "desplegados", ninguno en
   flotadsp.com, que llevaba 21 h con el build de la vispera. El comando bueno es
   `npx wrangler pages deploy dist --project-name flotadsp-v2 --branch main
   --commit-dirty=true`, y se comprueba con
   `npx wrangler pages deployment list --project-name flotadsp-v2` (la fila tiene
   que poner **Production / main**) o comparando el hash del bundle:
   `curl -s https://flotadsp.com/ | grep -o 'assets/v2/index-[A-Za-z0-9_-]*\.js'`.
17. **Un documento cuyo `doc_type` no encaje EXACTAMENTE no se pintaba en
   ninguna parte.** La pestaña Documentos de una furgoneta agrupaba comparando
   contra cinco cajones fijos, y el mismo papel esta guardado de seis maneras
   ('seguro'/'Seguro', 'contrato'/'Contrato renting'). Eran **60 de 140
   documentos invisibles** (43%), 38 de ellos en furgonetas activas. El tipo se
   normaliza ahora en el backend (`_doc_tipo_norm`) y el cajon 'otro' recoge
   TODO lo que no case: una pantalla que agrupa por categorias necesita SIEMPRE
   un cajon de sobras, porque lo que no entra en ninguno desaparece sin error.
   Los que colgaban de furgonetas de baja o borradas se llegan por
   `GET /documents` (pestaña Documentacion, sin filtro por estado a proposito).
18. **En geocodificacion INVERSA el acuerdo no se mide por distancia.** Todas
   las fuentes devuelven aproximadamente el punto que les diste, asi que
   "coinciden" siempre y la regla de cercania de `geoDireccion.js` no vale: hay
   que contrastar el NOMBRE. Y la regla dura de "dos familias o nada" tampoco
   sirve tal cual — en un punto real de Boiro ocho respuestas del Catastro
   decian 'LG PESQUEIRA' y no se afirmaba nada por ser todas de la misma
   familia. `/cortex/geo/inverso` usa tres niveles (`dos_fuentes`,
   `solo_oficial`, nada) y **nunca devuelve numero de portal**: el numero que da
   la inversa es el del edificio mas cercano al punto, y si el punto estuviera
   bien el conductor habria encontrado la direccion. Ojo tambien con inflar
   votos: dar peso doble a las respuestas "exactas" hacia que CartoCiudad, sola,
   ganara con 'AVENIDA RAXOI' en plena Praza do Obradoiro.

19. **Pasa `pyflakes` sobre `server.py` antes de dar nada por bueno.** Python no
   se queja de un nombre que no existe hasta que se ejecuta esa línea, así que un
   `NameError` puede vivir meses en una ruta que nadie prueba. El 22-08-2026
   había **cuatro**: `_date_range` (dos veces), `_generate_schedule_with_gemini`
   e `img_bytes` (tres veces). Dos de ellos tumbaban endpoints reales —
   "Generar cuadrante" en Turnos llevaba devolviendo 500 desde siempre— y uno
   estaba escondido dentro de un `try/except Exception` que lo convertía en un
   502 con un mensaje FALSO ("la IA no pudo generar el cuadrante; reintenta").
   Un `except Exception` ancho se traga los errores de programación igual que
   los de red: si envuelves una llamada, comprueba antes que existe.
   `python -m pyflakes backend/server.py | grep "undefined name"` tiene que dar
   CERO. Ahora lo da, y por eso el próximo se notará.

20. **Si cambias lo que guarda una estructura, busca TODOS los que la leen.**
   La rejilla del cuadrante pasó de guardar el tipo (`'trabaja'`) a guardar el
   código (`'1'`, `'BKP'`, `'V'`). Se cambiaron la celda, el pincel y el
   guardado — y se quedó atrás `cobertura`, que seguía comparando
   `v === 'trabaja'`. Resultado: la fila de cobertura marcaba **0 con 39
   personas trabajando**. No falla, no avisa, y por pantalla parece que no hay
   datos. Ni el build ni el linter lo ven, porque comparar dos strings que
   nunca coinciden es JavaScript perfectamente válido. Tras un cambio así:
   `grep -n "'trabaja'\|'libre'\|'extra'"` sobre el fichero entero y mirar
   uno por uno.

21. **En una rejilla, el rango que se PINTA y el que se PIDE no son el mismo.**
   Dos fallos seguidos por esto: en "mes completo" se pedían los turnos desde
   el inicio de la quincena, así que los días 1 y 2 salían vacíos teniendo
   datos; y "quién sobra en el cuadrante" se calculaba sobre los catorce días
   visibles, así que quien no trabajaba esas dos semanas salía marcado como
   baja. Los dos son falsos negativos silenciosos. El rango que se pide sale de
   `dias[0]`/`dias[último]`, y las preguntas del mes ("¿está esta persona en el
   cuadrante?") se contestan con el mes entero, no con lo que se ve.

22. **Máximo seis colores categóricos, y nunca el color solo.** Un color por
   código convertía el cuadrante en un arcoíris ilegible. Okabe-Ito, la paleta
   de IBM y las guías de accesibilidad coinciden: por encima de seis dejan de
   distinguirse a tamaño pequeño, y una celda de cuadrante mide 22 px. Los
   dieciséis códigos van en **cinco familias** (`ruta`, `apoyo`, `libre`,
   `previsto`, `aviso`) y el texto del código, siempre visible dentro de la
   celda, es el segundo canal. El nombre de la familia lo manda el backend
   (`CODIGOS_CUADRANTE_INFO`); las clases de CSS viven en `Turnos.jsx`.

23. **`sort()` sobre nombres escritos por personas no ordena nada.** Las 204
   fichas están en MAYÚSCULAS, minúsculas y Mixtas. `sort()` compara por código
   de carácter, así que todas las minúsculas caían detrás de todas las
   mayúsculas y la lista parecía aleatoria. Siempre
   `localeCompare(b, 'es', { sensitivity: 'base' })`, que además iguala tildes.

24. **En un fichero de 25.000 líneas, un `def` nuevo puede estar PISANDO otro.**
   Al añadir el módulo de diarios se definieron `_celda(v)` y `_entero(v)`, y
   las dos ya existían: `_entero(valor, campo, ...)` es el validador que usa
   medio backend y `_celda(lat, lng)` es del geocodificador. Python no avisa —
   la última definición gana en silencio— así que quedaron sustituidas y
   habrían reventado todo lo que las llama, con un `TypeError` que no se parece
   en nada a la causa. Salió a la primera petición de prueba. Los helpers
   nuevos van con prefijo del módulo (`_dia_celda`, `_dia_num`), y esto lo
   detecta de golpe:
   `python -c "import ast,io,collections; ..."` — contar los nombres definidos
   a nivel de módulo y listar los que salgan más de una vez. Hoy da cero.

25. **Los diarios de Cortex tienen dos trampas medidas, y las dos invierten el
   resultado.** (a) El reporte del día F trae el bloque DNR de **F−2**: la fecha
   que cuenta es la de concesión, no la de entrega ni la del reporte —asignando
   por fecha de entrega, la conciliación con la scorecard falla en las 4 semanas
   probadas. (b) La columna **DSC se rellena 2-4 días tarde**: un bloque recién
   bajado viene entero a `N` y saldrían CERO defectos. Por eso una fila nunca
   baja de `Y` a `N` al volver a pegar un reporte viejo, y un bloque 100 % `N`
   se marca *sin clasificar* en vez de contarse como un día perfecto. Y el
   defecto es **DSC = `Y`**, no al revés. Todo en `docs/REPORTES_DIARIOS.md`.

26. **Un endpoint PÚBLICO en una app multiempresa escribe en la BD que no es,
   y no falla.** `_current_db_name` es un contextvar **con valor por defecto**
   (`flotadsp`), y `db` lo resuelve sin quejarse. Todo endpoint sin sesión
   —el portal del taller es el primero— cae por tanto en la BD principal
   pasara lo que pasara: hoy acierta por casualidad porque la de Dani ES la
   principal, y el día que haya un segundo cliente el enlace de un taller suyo
   leería y escribiría datos ajenos, en silencio, con HTTP 200 y sin un solo
   error en los logs. La regla: **lo que identifica al que llama vive en
   `global_db` y lleva dentro el `db_name`**, y el endpoint hace
   `set_current_org_db(...)` A MANO antes de tocar `db`
   (`_ot_por_token` es el ejemplo). Nunca confiar en el valor por defecto.
   Y lo que devuelva ese endpoint va por **lista blanca de campos**, nunca por
   lista negra: el enlace se reenvía por WhatsApp y acaba en teléfonos que no
   controlamos, así que ni nombres de conductores ni ids internos.
   **Ampliado el 31-08-2026.** Volvió a pasar, y con la peor cara posible:
   `driver_login` tocaba `db` sin fijar la empresa, mientras sus DOS hermanos
   —`driver_lookup` y `_driver_token_impl`— sí lo hacían. `DriverLoginRequest`
   ni siquiera tenía campo `slug`. Consecuencia: **ningún conductor de ninguna
   empresa que no fuera la principal podía entrar al portal, nunca.** Y el
   síntoma engaña: el paso del email le reconocía —ese sí iba al DSP bueno— y
   el de la contraseña le decía que era incorrecta. Con la suya buena. Además
   el token que emitía no llevaba `db_name`, así que aunque hubiera entrado,
   cada petición suya habría vuelto a caer en la base principal y habría visto
   la aplicación vacía — peor que no dejarle entrar.
   Se encontró probando el portal con una empresa recién creada, no leyendo el
   código. Ahora lo vigila `scripts/check_tenant.py`: marca todo endpoint SIN
   dependencia de sesión que toque `db` sin llamar a `_set_tenant_by_slug`,
   `set_current_org_db`, `_ot_por_token`, `_partner_auth` o
   `_cortex_ingest_org`. `global_db` no cuenta —es única a propósito— ni
   `db.command("ping")`, que pregunta por la conexión y no por los datos de
   nadie. Sacó también `report_client_error`, que guardaba los errores de
   navegador de TODAS las empresas en la principal: la que los sufre no los
   veía en su pantalla, y en la principal salían mezclados sin saber de quién.

27. **Una pantalla nueva sin su casilla de permiso es INVISIBLE, y no avisa.**
   El menú filtra cada entrada con `canSee(clave)`, y `canSee` devuelve false
   si la clave no está en la lista de permisos del usuario. Si la pantalla no
   tiene casilla en `Usuarios.jsx`, **nadie puede concedérsela**: desaparece
   del menú para todo el que tenga permisos definidos —aunque lo tenga todo
   marcado— y la ruta tampoco abre, porque el guard usa la misma comprobación.
   Pasó dos veces: `ordenes` (Órdenes de taller) y `diarios` (DNR · Diarios).
   Mery tenía las 27 casillas marcadas y aun así no veía Diarios; el síntoma
   desde fuera es siempre el mismo y engaña: «no me sale», que parece caché.
   Al añadir una pantalla, una de estas tres: casilla en `MODULES` de
   `Usuarios.jsx`, herencia a mano en PanelLayout —**en `itemVisible` Y en
   `routeAllowed`**, o el menú la enseña y la ruta te echa—, o
   `SIEMPRE_VISIBLES`. Lo comprueba `scripts/check-permisos.mjs` en CI.
   Y ojo con lo otro: los permisos del JWT duran 72 h. `PanelLayout` pregunta
   a `/auth/me` al montar, al volver a la pestaña y cada 2 min; sin eso, dar
   un permiso no se nota hasta recargar y parece que el guardado falló.

28. **Un estado de Cortex traducido de mas es un numero falso que nadie ve.**
   Dos casos el 27-08-2026, con Cortex diciendo 101 pendientes y la app 320.
   (a) `PICKED_UP` se guardaba como `LOADED`. Pero PICKED_UP es una RECOGIDA que
   el conductor ya subio a la furgoneta, no reparto pendiente: de los 281
   paquetes que figuraban LOADED, los 281 tenian PICKED_UP como evento vigente y
   los 281 venian de un PENDING_PICKUP previo. (b) `NOT_DELIVERED` se guardaba
   como `DELIVERED`, porque el emparejador por texto busca subcadenas y
   "delivered" esta dentro de "not_delivered" — 301 paquetes en el historico
   dados por entregados diciendo Cortex lo contrario, e inflando el DCR hacia
   arriba. La guarda de negacion solo puede mirar CODIGOS (sin espacios): el
   texto libre en espanol empieza por "no se ha podido entregar" y esa frase SI
   hay que reconocerla. Todo en `backend/tests/test_estados_cortex.py`.
   Y al meter un estado nuevo hay que decidir SIEMPRE su sitio en
   `_CX_NO_DESPACHADO` / `_CX_EN_VUELO` / `_CX_OK`: lo que no encaje cae al
   cajon por defecto, que es "fallo de entrega", y 107 recogidas de un dia
   normal habrian entrado como 107 fallos y hundido el DCR en vivo.

29. **`updated_at` NO dice cuando capturamos: dice cuando paso en Cortex.**
   Midiendo la antiguedad de una ruta por `max(updated_at)` parece que la
   captura esta muerta cuando funciona perfectamente — una ruta terminada a las
   19:00 no vuelve a mover esa hora aunque la bajemos cincuenta veces mas. Con
   ese numero llegue a afirmar que el barrido estaba parado; el dato bueno era
   que ningun paquete abierto tenia menos de 8 capturas, media 67 y maximo 932.
   Por eso existe `seen_at`, que lo escribe la ingesta en cada captura, y por eso
   la pantalla dice "ultimo movimiento" y aparte "bajado hace N min". Antes
   llamaba "ultima captura" a lo primero, que es justo la confusion.

30. **Una pantalla que reparte en cajones tiene que CUADRAR, y hay que
   comprobarlo.** El debrief contaba 7.171 paquetes y sus cajones sumaban 7.050:
   121 paquetes contados en el total pero en ningun cajon, invisibles y sin que
   nada fallara. Eran las recogidas, que no tenian sitio. Es el mismo fallo que
   el gotcha 17 con los documentos: **siempre un cajon de sobras, y ademas la
   suma comprobada**, porque lo que no entra en ninguno desaparece sin error.

31. **Un multiplo con el denominador cerca de cero MIENTE, aunque el numero
   sea correcto.** La pantalla de exposicion comparaba cada furgoneta con la
   media de su modelo, y una Citroen Jumpy con UN golpe salia "6 veces peor"
   porque las otras cinco no tenian ninguno. El calculo estaba bien y la
   lectura era falsa: parecia una furgoneta problematica cuando lo que pasaba
   es que su grupo esta impecable. Cualquier ratio contra una media necesita
   un suelo en el denominador (`_EXP_MEDIA_MIN`) y, por debajo, decir lo que
   pasa de verdad en vez de dar el numero.

32. **`_ya_enviado_hoy` revienta si la clave lleva la fecha dentro.** El
   cerrojo busca `{_id: envio_X, dia: {$ne: hoy}}` y hace upsert. Con una clave
   que ya incluye el dia (`dcr_OGA5_2026-08-29`), la pareja clave+dia no cambia
   nunca: el filtro no casa, el upsert intenta insertar el mismo `_id` y Mongo
   lanza `DuplicateKeyError` — que subia como 500 y tumbaba el endpoint entero.
   Con las claves de siempre no se veia porque el `dia` cambiaba cada dia. Dos
   reglas: la clave NO lleva la fecha, y el cerrojo captura el duplicado y
   devuelve True, porque un duplicado ahi significa "ya enviado", que es
   justo lo que se preguntaba. Un cerrojo que revienta es peor que no tenerlo.
   **La misma familia, 31-08-2026: sembrar «la primera vez» sin contar con que
   hay dos.** `_seg_plantillas` hacía `count == 0` y luego `insert_many` de las
   plantillas de taller. Entre las dos cosas cabe otra petición, y en una
   empresa nueva eso pasa el primer día —dos personas abriendo Órdenes de
   taller a la vez, o un clic justo cuando corre el bucle de seguimiento—: la
   segunda reventaba con `BulkWriteError` y salía un 500. Que la plantilla ya
   exista es exactamente lo que se quería conseguir, así que **no es un error**:
   `ordered=False` y tragarse `DuplicateKeyError`/`BulkWriteError`. Es el mismo
   caso que `/checklist` (gotcha 42) con otra cara: **todo lo que se crea "solo
   la primera vez" hay que probarlo con dos peticiones simultáneas**, porque en
   producción esa primera vez ocurre una sola vez y nadie la vuelve a ver.

33. **`analysis_status` vale `"ok"`, no `"done"`.** Contando por `"done"` salia
   que CERO de 1.570 inspecciones estaban analizadas por la IA, y estaban las
   1.569. Un filtro por un valor que no existe no da error: da cero, y cero
   parece un hallazgo. Antes de afirmar que algo esta a cero, mirar que valores
   tiene de verdad el campo (`$group` por el, sin filtrar).

34. **`daily_ratios` esta VACIA en produccion**, y por eso
   `/scorecard/daily-trend` no devuelve nada: depende de que alguien suba el
   Resumen diario a mano y no lo sube nadie. Lo mismo se calcula desde
   `cortex_packages`, que se actualiza solo — es lo que hace
   `/scorecard/en-vivo`. Un endpoint que responde 200 con una lista vacia
   parece que funciona.

35. **Las direcciones de Amazon vienen sin normalizar y hay que unirlas con
   cuidado en las DOS direcciones.** 'Rua Isaac Peral, 14' y 'RUA ISAAC PERAL
   14 BAJO' son el mismo portal: si cuentan por separado, ninguna llega al
   minimo de fallos y el problema no lo ve nadie. Pero el 14 y el 41 NO son el
   mismo portal, y juntarlos pondria la nota de uno en la puerta del otro. Ojo
   con letra pegada a numero: 'n°43' se queda en 'n43' al quitar acentos y no
   casa con 'n 43' — pasa de verdad en 'Calle Campanario n°43'. Cubierto en
   `backend/tests/test_direcciones.py`.

36. **Un test que solo tiene `main()` NO lo ejecuta pytest, y CI usa pytest.**
   `test_piezas.py` (37 casos) y `test_estados_cortex.py` (18) se escribieron
   como scripts con `def main()`, asi que `pytest backend/tests -q` los
   importaba y no corria ni uno: 55 comprobaciones pasando en verde sin
   ejecutarse. No fallaban — es peor, parecian cubrir algo. Arreglado con un
   `def test_todos_los_casos()` que llama a `main()` y comprueba que devuelve
   0, sin tocar la forma de ejecutarlos a mano.
   Para correrlos todos de golpe en local: `python backend/tests/run_all.py`,
   que aguanta las dos formas y SALTA (sin marcar fallo) los que necesitan el
   backend entero instalado — esos los corre CI.

37. **Un estado sin nada detras es por donde se escapa la operacion.** Habia 13
   furgonetas —el 10% de la flota— marcadas `status: "taller"` SIN fecha de
   entrada y SIN ninguna orden: 475 dias-furgoneta parados que no salian en
   ninguna pantalla, porque `/work-orders/paradas` mide con `taller_desde` y no
   lo tenian. La prevencion ya existe desde el 28-08 (`_auto_incident_on_workshop`
   pone el reloj, probado con 5 casos en staging), asi que eran anteriores. La
   fecha se recupero de la incidencia de entrada — ojo, LA PRIMERA que diga
   "Vehiculo en taller", no la ultima incidencia: una de ellas tiene otra mas
   reciente por un tema distinto y se habria puesto una fecha equivocada que
   ademas parece medida.
   Regla: al añadir un estado que saca algo de la operacion, preguntarse **que
   lo respalda** y que pasa si alguien lo pone a mano.

38. **Un checker no corrige, y el que corrige no se fia del cliente.**
   `/checkers/estados-vehiculo` detecta, clasifica (`SAFE_TO_AUTOCORRECT` /
   `NEEDS_REVIEW` / `UNKNOWN`) y explica impacto y correccion; corregir es otra
   llamada, que **recalcula la clasificacion en el servidor**. Si el cliente
   pudiera decir "esto es seguro", bastaria con mentir para saltarse la
   clasificacion entera. Y toda correccion automatica exige las CINCO: regla
   determinista, evidencia suficiente, reversible, sin ambiguedad y verificable.
   Cuatro de cinco no bastan.

39. **`cortex_packages.state` es el estado de AHORA, no el del dia de servicio.**
   Un paquete devuelto a la nave el viernes se re-reparte el lunes y su `state`
   pasa a `DELIVERED`: el viernes deja de tener esa devolucion, en silencio y
   sin que falle nada. Medido el 30-08-2026 contra cuatro capturas de Cortex de
   OGA5:

   | dia | Cortex ve | nosotros veiamos | perdido |
   |---|---|---|---|
   | 29-08 (1 dia) | 95 | 83 | 13 % |
   | 28-08 (2 dias) | 130 | 34 | 74 % |
   | 27-08 (3 dias) | 144 | 4 | **97 %** |
   | 26-08 (4 dias) | 97 | 6 | 94 % |

   A los tres dias se ha borrado el 97 % de las devoluciones de ese dia, y la
   pantalla de scorecard enseña entonces dias historicos casi perfectos. Ese es
   justo el numero que Amazon contrastaria contra su propio Cortex.
   **No se puede reconstruir hacia atras**: el `timeline` no guarda todos los
   saltos (para el 28-08 da 155 donde Cortex dice 130, porque recoge tambien
   vueltas de otros dias). Lo unico honesto es dejar de perderlo: `_bucle_congelar`
   guarda cada media hora, de 17:00 a 04:00, la foto del dia en
   `cortex_day_snapshots`, y se queda con la que MAS fallos tenga —la erosion
   solo borra fallos, nunca los añade, asi que el maximo observado es el pico
   real y no hace falta saber a que hora cierra cada centro—.
   Dos guardas que no son obvias y estan probadas en `test_congelar_dia.py`:
   una foto de media tarde **no** pisa a una de dia cerrado aunque tenga mas
   fallos (a media tarde hay paquetes contados como fallo que aun se van a
   entregar), y de un dia con mas de un dia de antiguedad **no se crea foto
   nueva**, porque ya esta erosionado y guardarlo seria inventar un numero que
   ademas pareceria medido. Los dias anteriores al 30-08-2026 estan perdidos y
   salen marcados «sin foto» en la pantalla, con el DCR como `≥`.
   El bucle deja **latido** en CADA pasada, este o no dentro de la ventana, y
   sale en `GET /cortex/dias-congelados` y en `GET /admin/latidos`. Un cron
   muerto y un cron sin trabajo escriben lo mismo —nada—, y aqui esa duda cuesta
   un dia entero irrecuperable: `hace_min` por encima de 30 significa que el
   bucle no esta.
   **Donde mirarlo a mano, que no es obvio y cuesta dos intentos:**
   · el latido esta en **`global_db`**, no en la BD del tenant, con `_id`
     **`latido_congelar`** (lo escribe el `_latido()` generico, que antepone
     `latido_`). Este texto decia `app_meta.congelar_latido` y ya no era
     verdad — el bucle habia pasado a la funcion generica y nadie corrigio la
     nota, asi que buscarlo donde ponia daba «no existe» y parecia un cron
     muerto cuando estaba vivo;
   · la foto va en `cortex_day_snapshots` de la BD del tenant, y el campo del
     dia es **`service_day`** (no `dia`), con `tomado_at` y `fotos` = cuantas
     veces se tomo ese dia.
   **Comprobado end to end el 01-09-2026**, que era la unica forma de cerrarlo:
   el 31-08 quedo congelado a las 17:44 de su PROPIA tarde con 5 tomas y
   DCR 97,98 %. El 29-08, en cambio, tiene solo 2 tomas y se capturo al dia
   siguiente a las 15:03 — ya erosionado. Esa diferencia es justo lo que este
   bucle viene a evitar.
   Regla general: **antes de guardar una serie historica, preguntarse si el
   campo del que sale se sobrescribe.** Si se sobrescribe, el historico no es
   historico: es una foto de hoy con fecha de ayer.

40. **Un script de diagnostico que COPIA las constantes del backend no mide el
   backend: mide la copia.** Investigando el gotcha 39 escribi tres scripts
   seguidos con las listas `_CX_OK` / `_CX_EN_VUELO` / `_CX_NO_DESPACHADO`
   tecleadas a mano, y en las tres faltaban estados reales (`PENDING_PICKUP`,
   `YOU_ARE_NEXT`, `NOT_READY`). Resultado: un dia salio con **DCR 1,58 %** y
   estuve a punto de dar por bueno que la alerta de DCR generaba falsos
   positivos sistematicos. No era cierto —con las listas de verdad el sesgo es
   de +0,14 pp de media, muy por debajo del umbral de 1,5— y el backend estaba
   bien desde el principio. Un script contra produccion se lee del propio
   `server.py` (con `ast`, sin ejecutarlo, que arranca conexiones):

   ```python
   for n in ast.parse(open("/app/server.py", encoding="utf-8-sig").read()).body:
       if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in NOMBRES:
           CONST[n.targets[0].id] = ast.literal_eval(n.value)
   ```

   Lo mismo vale para los tests: `test_congelar_dia.py` extrae la funcion real
   del fichero en vez de reimplementarla, porque una copia deja de probar el
   codigo que corre en cuanto alguien toca el original.

41. **El Atlas tiene 10 GB, no 512 MB — y el limite NO se supone, se lee.**
   El 30-08-2026 di por hecho que era un M0 gratuito de 512 MB, medi 488, y
   avise por correo de que la base se llenaba en CINCO DIAS. Estaba al 4,8 %.
   Dani tuvo que corregirme dos veces.
   El dato correcto estaba en TRES sitios y no mire ninguno:
   · el secret `ATLAS_LIMITE_MB=10240` del backend en Fly;
   · `GET /api/admin/salud` (super-admin), que ya lo leia y respondia
     literalmente «vas sobrado, no toques nada»;
   · la realidad — llevabamos dias escribiendo sin un solo error, cosa
     imposible rozando el tope de un M0.
   Y hay algo peor que el numero: **ya existia el medidor**. `/admin/salud`
   llevaba tiempo hecho, con el limite configurable y este comentario dentro:
   *«una mentira gasta la confianza en todos los demas avisos»*. Aun asi
   escribi un segundo medidor, peor, con el limite a pelo. Se ha borrado; del
   mio solo queda el aviso automatico por Telegram, que es lo unico que
   aportaba, apoyado en `LIMITE_ATLAS_MB`.
   Dos reglas: **un limite que no se ha comprobado no se pone como constante y
   menos aun se le cuelga una alarma**, y **antes de construir un medidor,
   buscar si ya existe**. Un aviso construido sobre una suposicion no avisa de
   nada.

42. **`insert_one(doc)` MUTA `doc`, y devolver ese mismo dict responde 500.**
   pymongo le mete `_id` con un ObjectId y FastAPI no sabe serializarlo. Lo
   peligroso es **cómo** falla: revienta SOLO la petición que crea el
   documento, porque las siguientes lo leen con proyección `{"_id": 0}` y van
   perfectas. Falla una vez, recargas, funciona — y no lo reporta nadie nunca.
   Estaba en `/checklist` desde siempre: **el primero que abría la lista de
   tareas cada día**, en cualquier centro y cualquier empresa, se llevaba un
   «Error interno del servidor». Y el bug ya era conocido — tres endpoints
   (documentos, chat, contactos) lo esquivaban a mano con `doc.pop("_id", None)`
   y uno hasta lo explicaba en un comentario—, pero el cuarto se coló porque no
   seguía la forma `return doc`, sino `result[turno] = new_doc`.
   Se encontró **barriendo las 155 pantallas del panel con una empresa recién
   creada**, no leyendo el código: 1.550 combinaciones de ruta × parámetros
   (`?center=`, `?from=/&to=`, `?week=`, `?days=`) y un único 500 en todas.
   Cualquiera de las dos curas vale: `insert_one(dict(doc))` inserta una copia,
   o `doc.pop("_id", None)` limpia después. Lo vigila
   `scripts/check_objectid.py`, que reconoce las dos y por eso no da ninguno de
   los tres avisos en falso que daba antes de afinarlo — un checker que grita en
   falso deja de leerse, que es exactamente como se coló este.
   Regla general: **con la base vacía se recorre un camino que con datos no se
   recorre nunca**, y ese camino solo lo pisan los clientes nuevos, el primer
   día. Es el mismo origen que los otros tres fallos del 31-08 (conductores sin
   centro, importar sin crear, «0 nuevos» siempre): la app se desarrolla contra
   una flota llena.

43. **Código escrito para UNA empresa: los centros de Dani a mano.**
   `_normalize_center_code` llevaba dentro `for code in ("OGA5","DGA1","DGA2")`
   y devolvía `""` para cualquier otro. La cola de Revisión Rápida compara el
   centro pedido contra eso, así que **en toda empresa que no fuera la
   principal, filtrar por centro devolvía CERO** hubiera lo que hubiera
   esperando — y el panel manda siempre el centro seleccionado, o sea que era
   el caso normal. Se vio el 31-08-2026 con una empresa recién creada: el
   conductor sube la foto, Gemini detecta un daño grave, la cola tiene 1 y
   `?center=IN1` devolvía 0. En pantalla es idéntico a «no hay nada pendiente».
   Ya existía la función buena (`_centro_norm`, gotcha 6), que **devuelve el
   original cuando no reconoce** en vez de borrarlo; ahora delega en ella.
   Al arreglarlo apareció el efecto de rebote: los otros dos usos filtran
   talleres, y con `""` no filtraban nada. Al empezar a filtrar de verdad
   desaparecían los talleres **sin centro** —que da de alta el propio panel
   cuando el selector está en «Todos»—. Los tres filtros aceptan ahora los del
   centro Y los que no tienen ninguno.
   Y otros tres sitios tenían `"OGA5"` como valor por defecto (importar
   cuadrante, subir y leer el plan de reparto): en otra empresa esos datos
   caían en un centro que no existe en su flota y no volvían a aparecer.
   `_centro_por_defecto()` usa ahora el PRIMERO de `organizations.centers`, que
   es el principal. Ojo con la tentación de ordenar alfabéticamente: parece más
   limpio y le habría cambiado a Dani el defecto de OGA5 a DGA1 en silencio.
   Regla: **antes de dar por bueno un arreglo multiempresa, comprobar que la
   empresa principal sigue dando exactamente lo mismo que antes.**
   No todo lo que lleva OGA5 dentro es un fallo: los talleres y alquiladoras
   semilla se siembran solo en la BD por defecto y son idempotentes, y
   `_centros_referencia` no etiqueta si el punto no está a menos de 70 km, que
   es la respuesta correcta. Lo que hay que buscar son **decisiones**
   —comparaciones y valores por defecto—, no datos.

44. **Los `.ps1` van en ASCII puro, sin tildes ni guiones largos.**
   PowerShell 5.1 lee un `.ps1` sin BOM como ANSI, así que cualquier carácter
   UTF-8 multibyte —una tilde, un `—`, una `·`— llega corrupto y puede romper
   el PARSEO: el error que da entonces es `Token '}' inesperado` señalando una
   llave que está perfectamente cerrada, treinta líneas más abajo del carácter
   culpable. Se pierde un buen rato buscando en el sitio equivocado.
   `deploy-frontend.ps1` y `verificar-produccion.ps1` llevan 0 bytes no-ASCII
   desde siempre; era una convención que nadie había escrito.
   Comprobarlo antes de dar un script por bueno:
   `python -c "import io;b=io.open('scripts/x.ps1','rb').read();print(sum(1 for c in b if c>127))"`
   Y dos más de PowerShell 5.1 que también cuestan tiempo: `-in` con una lista
   suelta no parsea (usar `@(...) -contains`), y `Join-Path a ".."` deja el
   `..` dentro mientras `FileInfo.FullName` viene ya resuelto — restar
   longitudes sin `Resolve-Path` se sale de la cadena.

45. **Un botón que borra un histórico entero no puede estar a un clic ni al
   alcance de cualquier admin.** El 01-09-2026 desaparecieron de producción
   **265.986 paquetes y 555.730 eventos de Cortex** —julio y agosto enteros—,
   y con ellos las semanas de la scorecard en vivo, las direcciones que fallan
   y el DCR de cada día. No fue el TTL: en la copia de esa madrugada todos
   caducaban en octubre y noviembre. Fue `POST /cortex/reset`, que hacía
   `delete_many({})` con solo `require_admin` y un `window.confirm`, colgado
   del botón «Borrar todo y empezar limpio» de la tarjeta de arranque de
   Paquetes IA, visible para los 14 usuarios del panel. No dejó rastro en
   ningún log: se fechó por el tamaño de las copias de R2 (67 MB el 01-09 a
   las 02:00, 14,6 MB el 02-09) y se recuperó de la del 01-09 insertando solo
   lo que faltaba, cada documento marcado con `restaurado_de`, y el resumen en
   `app_meta.respaldo_restauracion_cortex` (deshacer:
   `delete_many({"restaurado_de": ...})`). Los 473 paquetes que seguían en
   vuelo se dejaron como estaban.
   Reglas: **todo `delete_many({})` en una ruta exige `require_superadmin`,
   una confirmación explícita en la petición (`confirmar: "BORRAR"`) y un
   apunte en `audit_log`**; el botón solo se pinta al super-admin y pide
   escribir la palabra. Lo vigila `scripts/check_borrado.py`, probado
   quitando la dependencia a propósito. Y la copia de R2 rota a los 14 días:
   una pérdida que no se detecta en dos semanas ya no se recupera, así que
   `smoke_endpoints.py` comprueba ahora que `cortex_packages` no se hunde de un
   día para otro.

46. **Una guarda en Python no protege de dos peticiones a la vez, y un
   `except DuplicateKeyError` sin índice único detrás es papel mojado.**
   Medido el 02-09-2026 en una empresa de prueba con cinco peticiones
   simultáneas: 5 altas de la misma matrícula dejaban **3 furgonetas** (la
   comprobación era un recorrido en Python: las cinco pasaban antes de que
   ninguna insertara); 5 altas del mismo correo dejaban **5 conductores**
   (`POST /drivers` no comprobaba nada, ni en secuencia); 5 partes de la
   misma furgoneta, **5 órdenes abiertas**; y 5 «generar accesos» dejaban
   **21 cuentas para la misma persona**, cada una con su contraseña — ese
   código *ya capturaba* `DuplicateKeyError` «por si dos pestañas a la vez»,
   pero `driver_accounts` no tenía índice único, así que el except no saltaba
   nunca y el código parecía protegido. Todo respondía 200.
   Reglas: lo que tiene que ser único lo dice **la base**, con un índice
   único (parcial cuando el dato viejo lo exige: `matricula_unica_viva` solo
   entre `active/taller/baja`, `email_unico_activo` solo con `active: true` y
   sin distinguir mayúsculas), y el código traduce el `DuplicateKeyError` a
   409. Antes de crear el único se mide que no haya repetidos en producción:
   con repetidos la creación falla, `_idx` lo anota y se queda sin
   protección, en silencio. Lo vigila `scripts/check_unicos.py` (todo
   `except DuplicateKeyError` tiene que tener su único) y lo ejercita
   `backend/scripts/smoke_concurrencia.py`, que es como se encontró.

47. **Un enlace de WhatsApp construido a mano abre un numero que no existe.**
   `wa.me` necesita el numero CON prefijo de pais. `enlace_wa()` lo pone a los
   de 9 digitos y devuelve `""` cuando no hay telefono, pero el panel se lo
   construia por su cuenta en dos sitios (la orden de taller y el enlace fijo
   del taller): `wa.me/${phone.replace(/[^0-9]/g,'')}`. Medido el 02-09-2026:
   de 41 talleres con telefono, **40 lo tienen con prefijo y uno no** (Midas
   Santiago, `981574178`), asi que ese abria `wa.me/981574178`. Y entre los
   conductores es al reves: **61 de 114 estan guardados sin prefijo**, de modo
   que cualquier pantalla que copie ese patron falla para la mayoria. El
   sintoma engana: WhatsApp abre y dice que el numero no existe, y parece cosa
   de WhatsApp o del taller.
   Regla: **la URL de WhatsApp la arma SIEMPRE el backend** con `enlace_wa` y
   viaja en el campo `wa` de la respuesta; el frontend solo la abre. Si viene
   vacia es que no hay telefono, y eso se DICE («este taller no tiene telefono
   guardado: copia el enlace»), no se disimula con un boton que abre WhatsApp
   sin destinatario. Lo vigila la regla `whatsapp-a-mano` de
   `scripts/check-patrones.mjs`.
   Y de paso salio otra: el checker **borraba las URLs** antes de mirarlas,
   porque cortaba la linea en el primer `//` para quitar comentarios. Con eso
   `https://wa.me/…` se quedaba en `https:` y la regla no podia saltar nunca.
   Ahora solo corta cuando el `//` no va precedido de `:`. Un checker que no ve
   es peor que no tenerlo: se probo reintroduciendo el fallo, que es la unica
   forma de saber que mira de verdad.


48. **`backdrop-blur` crea un contexto de apilado, y un desplegable dentro de
   el NO puede salir por encima de lo que va despues en el DOM.** La cabecera
   del panel era `backdrop-blur-md` sin `position` ni `z-index`. El
   desplegable del avatar llevaba `z-50`, pero ese 50 solo compite con sus
   hermanos DE DENTRO de la cabecera: hacia fuera, la cabecera valia `auto` y
   `main` —que va despues— pintaba por encima. Resultado en un movil, con la
   captura de Dani delante: el menu se veia TRANSPARENTE, con el titular de la
   pagina escrito por encima de «ver perfil» y «Salir», y ningun toque llegaba
   a los botones. **No se podia cerrar sesion desde el movil.**
   En el ordenador no se notaba porque el desplegable cae sobre una zona vacia
   y ahi el toque, aunque tampoco llegara, no molestaba a nadie.
   La cura es una linea: `relative z-30` en la cabecera. Y la forma de
   comprobarlo es la unica que no engaña, porque a ojo el menu SE VE:
   ```js
   const b = boton.getBoundingClientRect()
   document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
   ```
   Si eso no devuelve el propio boton, el usuario no puede pulsarlo por mucho
   que lo vea. Antes devolvia el titular de la pagina; ahora devuelve
   `BUTTON · Salir` y la sesion se cierra de verdad (medido el 02-09-2026).
   Regla: **todo panel flotante se prueba con `elementFromPoint`, no mirandolo**,
   y cualquier `backdrop-blur` que contenga algo flotante necesita su propio
   `relative z-N`.
   De la misma tanda: los «cerrar al tocar fuera» escuchaban solo `mousedown`,
   que con el dedo no siempre llega. Ahora escuchan `pointerdown`, que vale
   para los dos (dos sitios: el menu de usuario y la plantilla).


49. **`cortex_resumen` tiene UN DOCUMENTO POR CENTRO Y DIA, y leer uno solo se
   lleva por delante un centro entero.** El `_id` es `"dia:service_area_id"`,
   asi que un dia con dos naves son dos documentos. `_apoyo_gente_cortex` hacia
   `find_one({"dia": dia})` y se quedaba con el que Mongo devolviera primero.
   Medido el 03-09-2026 sobre el 02-09: 49 personas en OGA5 y 25 en DGA1, y esas
   25 —**todas con telefono en Cortex**— salian con el numero de la ficha. De
   ellas, **15 tenian en la ficha un numero DISTINTO**: son exactamente las
   llamadas que acababan con otra persona al otro lado, que es el fallo que Dani
   reporto. Ahora se juntan todos los documentos del dia (`find(...).to_list`).
   Y una segunda cara del mismo sitio: cuando no hay resumen de HOY se coge el
   del dia anterior mas cercano, pero eso ya **no se vende como corroborado**
   (`telefono_fuente: "cortex_otro_dia"`, `sin_corroborar: True`). Quien conduce
   una ruta cambia de un dia para otro, asi que el numero de ayer vale tanto
   como el de la ficha: se usa, pero se avisa. Probado reintroduciendo el fallo
   en `test_apoyo.py`.

50. **La cola de ayudas no puede depender de una casilla del panel.**
   `POST /apoyo` decidia `en_cola` con un campo del cuerpo (`cola`). Si el panel
   no lo mandaba, el apoyo nacia activo aunque el ayudante ya estuviera en otra:
   medido en produccion el 03-09-2026, **cinco apoyos abiertos a la vez sobre la
   misma persona** y dos mas creados a proposito para comprobarlo. La cadena que
   se habia pedido no existia por esa puerta.
   Ahora **todo nace en cola y el servidor decide**: `_apoyo_promover_cola` lo
   activa solo si el ayudante esta libre, y su `update_one` va condicionado a
   `fase: "en_cola"`, asi que dos clics simultaneos no pueden activar dos.
   La misma regla se aplica al **cambiar de ayudante** —si el nuevo ya esta en
   otra, este pasa a la cola— y al soltar al anterior, cuya cola avanza. Antes
   solo avanzaba al cerrar.
   Regla general: **una invariante de negocio se cumple en TODAS las puertas**
   (crear, cambiar, cerrar) o no se cumple; y quien decide es el servidor, no
   un campo que el cliente puede olvidar.


51. **Restar un desfase FIJO a una hora que va en rejilla acierta solo cuando
   el desfase es exactamente ese.** Las olas de reparto salen cada 20 minutos y
   siempre en punto: xx:00, xx:20, xx:40. Cortex enseña la hora unos minutos
   despues de la ola, y `_normalizar_hora_cortex` restaba **12 minutos fijos**.
   Con un desfase de 12 clava; con cualquier otro la hora cae FUERA de la
   rejilla. En una plantilla real de DGA1 (01-09-2026), 8 de 18 filas tenian
   horas como `11:50`, que no existe como ola, y Mery las corregia a mano cada
   dia. Lo correcto es **bajar al escalon de 20 minutos**, que equivale a restar
   el desfase real sea cual sea mientras este entre 0 y 20.
   Lo que hace segura la sustitucion, y esta probado sobre los 1.440 minutos del
   dia en `test_plantilla_hora.py`: **donde la regla vieja acertaba, la nueva da
   exactamente lo mismo** (si `hora - 12` caia en la rejilla, los minutos eran 12
   y bajar al escalon da ese mismo valor). O sea que no puede estropear ninguna
   plantilla que hoy salga bien.
   Regla general: cuando el dato de destino vive en una rejilla conocida, se
   ajusta A LA REJILLA; restar una constante es adivinar el desfase.

52. **Guardar el documento ENTERO en una pantalla que usan dos personas a la
   vez borra el trabajo de una de ellas.** La plantilla diaria se guardaba
   completa cada 900 ms y se refrescaba entera cada 2,5 s. Mery y Judit la
   llenan a la vez desde dos equipos: la ultima en guardar pisaba las celdas de
   la otra, y el refresco sustituia la hoja incluso mientras se escribia, asi
   que se borraban letras en pantalla. El control de version por `revision` no
   salvaba nada, porque el conflicto se resolvia recargando la hoja completa —
   que es justo perder lo escrito.
   La cura no es mas bloqueo, es **bajar el tamaño de lo que se guarda**: cada
   celda viaja sola (`PATCH /tools/plantilla-compartida/{id}/celda`) y ahi el
   ultimo cambio SI puede mandar, porque dos personas solo chocan si tocan la
   MISMA celda. Comprobado en produccion: dos escrituras con la misma revision
   vieja, en filas distintas, sobreviven las dos.
   Dos detalles que no son obvios y sin los cuales vuelve a fallar:
   · el parche lleva la ruta de la fila como referencia (`ruta_ref`): si alguien
     añadio o quito filas, los indices bailan y el cambio caeria en la fila
     equivocada — un dato falso, que es peor que un 409;
   · al aplicar la version de los demas se respeta la celda que se esta
     escribiendo, y se lee con la forma FUNCIONAL de `setData`: leer el estado
     de fuera devuelve el de hace dos segundos y restauraria una letra vieja.


53. **Un respaldo que solo entra cuando NO hay NADA no cubre el caso normal,
   que es que haya algo A MEDIAS.** `_apoyo_gente_cortex` cogia el resumen del
   dia anterior solo si `cortex_resumen` no tenia NINGUN documento de hoy. Pero
   el resumen de hoy se llena segun la extension va pasando por Cortex: a media
   manana existe y trae cuatro personas. Medido el 04-09-2026 a las 11:00 — el
   resumen del dia traia **2 personas** y en ruta habia **39**; de esas, 33
   estaban en el resumen de ayer CON telefono y **16 con un numero DISTINTO al
   de su ficha**. O sea 16 llamadas que acababan en otra persona, que es
   exactamente el fallo que el gotcha 49 daba por arreglado: se arreglo la
   lectura de VARIOS centros y se dejo sin arreglar la de un dia INCOMPLETO.
   Se completa **por persona, no por dia**: quien esta en el resumen de hoy no
   se toca (Cortex de hoy manda) y quien falta se rellena del dia anterior mas
   cercano, marcado `del_dia: False` para que salga «sin corroborar». La fusion
   vive aparte en `_apoyo_fundir_gente` justo para poder probarla sin base de
   datos; 5 casos en `test_apoyo.py`, probados reintroduciendo el fallo.
   Despues: 0 sin telefono (antes 8), 35 de Cortex (antes 2) y 10 avisando de
   que la ficha dice otra cosa.
   Regla general: un respaldo se decide **por el dato que falta**, no por si la
   fuente entera esta vacia. «Vacio» casi nunca es el estado real: el estado
   real es «a medias».

54. **Un estado de Cortex escrito en el frontend es una copia que se queda
   vieja sin avisar.** Al pintar los reintentos de otro color en el mapa de
   apoyo puse en el JSX `(p.estados || []).includes('ATTEMPTED')`. Hoy acierta,
   porque `_CX_REINTENTABLE` solo tiene ese estado — y por eso es peor: no falla
   nada, no hay sintoma, y el dia que entre otro estado reintentable el mapa
   dejaria de pintar en rojo las paradas que MAS urgen. Es el gotcha 28/40 otra
   vez, esta vez a un lado del cable donde ni los tests de estados ni los
   scripts miran. Ahora **la bandera la calcula el backend** (`reintento`, con
   `_cx_ruta_cajon`) y el cliente solo la pinta. Lo vigila la regla
   `estado-cortex-en-el-cliente` de `check-patrones.mjs`, probada
   reintroduciendo el literal. Saco de paso el unico sitio mas que los nombra:
   los botones de filtro de Paquetes IA, que NO clasifican —mandan el estado
   tal cual al backend como `?state=`— y quedan anotados en REVISADOS.
   Regla: el cliente pinta cajones y banderas; **quien reparte en cajones es
   siempre el servidor**, que es donde viven las listas canonicas.


55. **`flex-1` no protege de nada si el hermano puede crecer sin limite.** La
   fila de un conductor en Apoyo en ruta es `[nombre flex-1][cifras][chevron]`,
   y el bloque de cifras llevaba un texto largo sin acotar: «7 PARADAS · 5 CON
   DESTINO CONOCIDO». Medido en produccion el 04-09-2026 con la captura de Dani
   delante: la columna del nombre se quedaba en **44 px de 309** y la fila
   media **185 px de alto** —se leia «GER...» y los codigos de ruta caian uno
   por linea—. `min-w-0 flex-1` deja encoger al nombre, que es lo que se
   pretendia, pero no impide que el hermano se lleve 195 px. Lo que hace falta
   es acotar al HERMANO (`w-[70px] shrink-0`) y partir su texto en lineas
   cortas. Despues: nombre 169 px, fila 70 px de alto, las 39 filas sin
   desbordar y sin scroll horizontal, tambien a 375 px.
   Regla: en una fila flex, la parte que NO se trunca es la que hay que medir y
   acotar. Y se mide, no se mira: `getBoundingClientRect().width` de cada hijo
   y `scrollWidth > clientWidth` para el desbordamiento — a ojo, «GER...»
   parece un nombre corto.


56. **Guardar lo TUYO no te pone al dia, y creerte al dia con los datos viejos
   es lo que borra a la otra persona.** El gotcha 52 arreglo ESCRIBIR celda a
   celda, y Mery lo confirmo el 04-09: «lo de las horas si, lo de hacer cambios
   las dos a la vez no». Faltaba todo lo demas de esa pantalla —marcar una ruta
   en rojo o amarilla, una furgo en rosa, un conductor, anadir o quitar una
   fila, pegar las horas—, que seguia mandando la HOJA ENTERA.
   Y el control de version no protegia nada, por algo que no se ve leyendo el
   codigo: **guardar UNA celda devuelve la revision nueva y el cliente se la
   queda sin recargar los datos.** Con la revision al dia y la hoja vieja, su
   siguiente guardado completo pasaba la comprobacion y pisaba. Reproducido
   contra produccion, en este orden exacto:

   | paso | quien | revision | resultado |
   |---|---|---|---|
   | 1 | Mery escribe en la fila 0 | 2 | ok |
   | 2 | Judit escribe en la fila 1 | 3 | ok |
   | 3 | Judit marca una ruta en rojo | 3 | **la fila 0 se queda vacia**, HTTP 200 |

   Dos arreglos, y hacen falta los dos:
   · **cada cambio manda solo lo suyo**, con operaciones que no pueden pisarse:
     `/celda` ($set de un campo), `/marca` ($addToSet/$pull), `/fila` ($push y
     borrado con `ruta_ref`), `/meta` y `/horas` (solo las tres horas). El
     guardado completo (`PUT`) ya no escribe: contesta 409 pidiendo recargar,
     **porque un despliegue no cierra el navegador de nadie** y la pestana que
     alguien tenga abierta desde por la manana seguiria mandando la hoja entera
     durante horas;
   · **la respuesta de cada guardado trae la hoja del servidor y se aplica.**
     Sin esto los datos ya no se perdian pero la pantalla de Mery no llegaba a
     ver nunca lo de Judit: el refresco de 2,5 s solo entra si la revision del
     servidor es MAYOR, y su propio guardado ya se la habia igualado. Al
     aplicar se respetan TODAS las celdas con guardado pendiente, no solo la que
     tiene el foco: escribiendo dos seguidas, la primera puede estar aun en el
     aire y volveria borrada.
   Comprobado con dos pestanas de verdad en flotadsp.com, escribiendo las dos en
   la MISMA fila a la vez y marcando colores: las dos pantallas acaban iguales y
   no se pierde nada. Trinquete en `test_plantilla_compartida.py`, probado
   devolviendo el `update_one` al guardado completo.
   Regla general: **una respuesta de escritura que devuelve version pero no
   datos deja al cliente creyendose al dia.** O devuelve las dos cosas, o no
   devuelvas la version.


57. **Cortex da el MISMO telefono a mas de una persona, y el relleno automatico
   lo repartia.** `_telefonos_desde_cortex` rellena por `transporter_id` el
   telefono de quien lo tiene vacio y corre SOLO en cada ingesta. Nadie habia
   comprobado si un numero se repite: medido el 04-09-2026, **20 numeros
   compartidos entre 43 transporterIds** y **15 conductores activos con el
   telefono de otro**, puesto por nosotros y con toda la pinta de dato bueno.
   Llamas a PABLO OTERO GENDRA y te coge MARCOS SUAREZ LORENZO. Es el fallo que
   Dani lleva reportando desde el principio, entrando por otra puerta distinta
   de la del gotcha 49.
   Se encontro PROBANDO el boton de «crear ficha», no leyendo el codigo: al dar
   de alta a JOSE ANTONIO PORTO MATO le puso el numero de Karim Errifai.
   Reglas: un numero que Cortex da a dos personas **no se rellena solo** y sale
   en `dudosos`; los que ya estaban puestos se **marcan** (`telefono_dudoso`) y
   **no se borran** —puede que alguno sea correcto, dos que comparten movil— y
   borrarlo seria decidir por la oficina sobre un dato que no es nuestro. El
   panel lo enseña con un «?» al lado del telefono, que es donde se mira justo
   antes de llamar, y escribir uno a mano quita la marca.
   Y el campo hubo que meterlo en el modelo `Driver` **y** en `_DRIVER_ALLOWED`
   (gotcha 1): sin las dos cosas, el aviso no habria salido del backend.
   Probado reintroduciendo el fallo en `test_apoyo.py`.
   Regla general: **antes de copiar un dato de una fuente a una ficha,
   preguntarse si esa fuente puede dar el mismo valor a dos sujetos.** Un dato
   copiado a quien no es no se nota nunca, porque parece completo.


58. **La version que enseñaba el panel NO era la del codigo que corria, y con
   eso di por instaladas TRES versiones seguidas que no estaban funcionando.**
   `X-Ext-Version` sale de `chrome.runtime.getManifest().version`, o sea del
   service worker, que SI se actualiza al reinstalar la extension. Pero
   `interceptor.js` —el que construye cada paquete— vive inyectado en la pestaña
   de Cortex y se auto-protege contra la doble carga
   (`if (window.__flotadspCortexHooked) return`): **mientras esa pestaña no se
   recargue, sigue corriendo el codigo viejo**, por muchas veces que se
   reinstale la extension.
   Medido el 04-09-2026: el panel decia «2.26.0 · 1 equipo» y en tres minutos
   entraron **9.472 paquetes con CERO `address_id`**, el campo que acababa de
   añadir. Lo mismo explica por que la prueba de estados de la 2.24 y la 2.25 no
   llego a correr nunca: no era que fallara, es que no estaba ahi.
   Ahora el interceptor dice SU propia version (`VERSION_INTERCEPTOR`), viaja
   por el latido hasta el backend en `X-Ext-Interceptor`, y el panel pinta el
   aviso en ambar: «recarga Cortex (F5): ahi corre la 2.23».
   Regla general: **un numero de version que no sale del codigo que de verdad
   se esta ejecutando es peor que no tener ninguno**, porque cierra la
   investigacion en falso — tres veces mire el dato equivocado y busque el fallo
   en el sitio equivocado.


59. **Tres clases de enlace publico viven en la MISMA coleccion, y el resolutor
   de una de ellas aceptaba los tokens de las otras dos.** `taller_enlaces`
   guarda el enlace de una orden (`orden_id`), el fijo de un taller
   (`tipo: taller`, con `workshop_id`) y el de un apoyo en ruta
   (`tipo: apoyo`, con `apoyo_id`). `portal_taller_lista` y `_apoyo_por_token`
   exigen cada uno lo suyo; **`_ot_por_token` buscaba solo por token** y despues
   hacia `enlace["orden_id"]`: con cualquiera de los otros dos, `KeyError` ->
   **500 en un endpoint PUBLICO**. Medido en produccion el 04-09-2026 barriendo
   las 196 rutas GET contra la empresa REAL —no la vacia—: el enlace fijo de
   Talleres Muniz y el de un apoyo daban «Error interno del servidor» en
   `/api/taller/<token>`, mientras sus hermanos contestaban 404 correctamente.
   Afecta tambien a los cinco POST del portal del taller, que usan el mismo
   resolutor.
   Lo que se ve desde fuera: un taller que guarde su enlace sin el `/t/` —o que
   lo escriba a mano— se encuentra una pagina rota en vez de «este enlace no es
   valido», y llama por telefono, que es la llamada que este modulo venia a
   quitar.
   Regla: **cuando varias clases de cosa comparten coleccion, cada resolutor
   filtra por su clase Y exige su campo obligatorio.** Un `find_one` por token a
   secas es una puerta que hoy revienta y manana deja pasar. Cuatro casos en
   `test_portal_taller.py`, probados reintroduciendo el fallo.
   Y de paso: **el barrido con la empresa vacia no sustituye al barrido con la
   empresa llena.** Este 500 solo aparece si existen enlaces de las tres clases,
   y en una empresa recien creada no existe ninguno.


60. **Un campo VACIO no es una variante sucia, y por eso el checker de centros
   decia «0 hallazgos» con cuatro personas invisibles.** `/checkers/centros`
   unifica las formas sucias de un centro escrito ('oga5', 'OGA5 ',
   'AMZL OGA5 SANTIAGO XPT'); vacio no entra en esa familia. Medido el
   05-09-2026 barriendo los FILTROS contra produccion: `GET /drivers` daba
   **150 activos** y la suma por centro **83+47+16 = 146**. Los cuatro que
   faltaban tienen `center: ""`, y como el panel manda siempre el centro
   elegido, no salian en ninguna pantalla —ni cuadrante, ni asignacion, ni la
   propia lista— aunque si contaban en el total. Uno de ellos, MARCOS ESPANTOSO
   SANDE, llevaba **469 paquetes repartidos en OGA5**: una persona trabajando a
   la que la oficina no podia ver.
   Es el gotcha 30 (los cajones tienen que sumar el total) aplicado a personas,
   y no lo detecta nada porque un filtro que devuelve de menos no falla.
   `GET /drivers/sin-centro` los lista con lo que Cortex sabe de cada uno, y
   `POST /drivers/sin-centro/aplicar` pone la nave **solo cuando no hay duda**:
   todos sus paquetes en UNA sola nave y al menos `_SIN_CENTRO_MIN_PAQUETES`.
   Con dos naves no se propone nada aunque una sea testimonial —un traslado
   real existe— porque poner a alguien en la nave que no es no se nota: la
   ficha parece completa y la persona sale en el cuadrante equivocado. Es la
   misma regla que `_centro_norm`: no adivina. La sugerencia se recalcula en el
   servidor (gotcha 38), hay respaldo en `app_meta.respaldo_centro_conductores`
   y la escritura va condicionada a que el centro SIGA vacio.
   Regla general: **al reconciliar una suma por categorias, el cajon que hay
   que buscar es el de los que no tienen ninguna.** Y un checker de "dato
   sucio" no cubre el "dato que falta": son dos preguntas distintas.
   Ocho casos en `test_sin_centro.py`, sacando la regla de `server.py` con
   `ast` (gotcha 40) y probados reintroduciendo el fallo.


61. **Un cuerpo vacio no prueba nada: lo que rompe es el campo con el TIPO
   cambiado.** El barrido del 02-09 mando `{}` a las 175 mutaciones y salio casi
   limpio, y eso dejo la impresion de que estaban validadas. No lo estaban.
   `(data.get("x") or "").strip()` es correcto mientras llegue texto y **un 500
   en cuanto no lo es**, porque una lista no tiene `.strip()`.
   Medido el 05-09-2026 contra staging: **43 de las 216 mutaciones devolvian
   «Error interno del servidor»**, dos de ellas PUBLICAS —`/auth/lead` y
   `/auth/forgot-password`, o sea al alcance de cualquiera con curl—. Y un 500
   no es solo un codigo feo: dispara la alerta de Telegram por un dato mal
   escrito, que es exactamente lo que `_entero` vino a evitar para los numeros.
   **Y ojo con como se mide.** La primera version del barrido mandaba diez
   nombres de campo fijos y encontro 11: solo los que casualmente usan esos
   nombres. Sacando los campos del CODIGO de cada endpoint salieron 43. Un
   barrido que lleva la lista dentro mide su lista, no el sistema.
   `_texto_cuerpo` sustituye a esa lectura y **es seguro por construccion**:
   para todo valor con el que la forma vieja no reventaba devuelve exactamente
   lo mismo (None, "", 0, listas vacias -> ""; texto -> recortado igual), asi
   que reescribir 37 sitios de golpe no puede cambiar ningun comportamiento con
   datos buenos. Es el mismo argumento que el gotcha 51. Probado en
   `test_texto_cuerpo.py` comparando las dos formas valor a valor.
   Detalle que muerde: `isinstance(True, int)` es cierto en Python, asi que sin
   una guarda explicita un booleano se colaria como el texto 'True' y se
   guardaria un centro llamado True.
   Y al reescribir con expresion regular, `(?<![\w)])` no es adorno: sin el, el
   parentesis que casa puede ser el de `str(...)` y salen 40 `str_texto_cuerpo`
   — nombres inexistentes que `py_compile` NO ve porque son sintacticamente
   validos. Los caza `pyflakes` (gotcha 19), que por eso se pasa siempre.
   Quedan **30**, ninguna publica, y fallan dentro de helpers o iterando algo
   que no es una lista: `backend/scripts/smoke_cuerpos_raros.py` las lista y
   lleva trinquete en 30, asi que un endpoint nuevo que lea el cuerpo a pelo se
   nota el mismo dia.


62. **Ordenar por un numero y cortar por los N primeros deja la ultima fila en
   manos del azar.** `/cortex/dsc` ordenaba a los conductores por `exceso` y se
   quedaba con `[:40]`. Python ordena de forma ESTABLE, asi que dos empatados
   quedan en el orden en que llegaron — y llegan de un `$group` de Mongo, cuyo
   orden **no esta definido**. Medido el 05-09-2026 con `dias=30`: dos
   peticiones seguidas con los MISMOS datos (total identico, 174.150 paquetes,
   los 17 contextos iguales) devolvian una MARCKSON FELIPE y otra Borja
   Salvado, los dos con exceso 10,5, justo en el puesto 40; y otros dos
   empatados en 12,1 se intercambiaban de sitio.
   No parece un fallo por pantalla: parece que el dato se ha movido. Y es una
   tabla que sirve para hablar con una persona sobre su trabajo, asi que un
   conductor que aparece y desaparece solo es exactamente el falso positivo que
   no puede haber.
   Regla: **toda lista que se ordene y se corte necesita un desempate
   determinista**, y el ultimo criterio tiene que ser algo unico (el id). Aqui:
   `(-exceso, -entregas, driver_id)` — a igual exceso manda quien mas mueve,
   que es el dato mas solido, y el id cierra. Cinco casos en
   `test_dsc_orden.py`, uno de ellos las 24 permutaciones de la misma entrada.
   Salio buscando rendimiento, no correccion: al comparar la respuesta de antes
   y la de despues de una optimizacion para probar que eran iguales. Sin esa
   comparacion no se habria visto nunca.
   **Y no era un caso suelto.** Barriendo el fichero con `ast` en busca de la
   misma forma —ordenar y cortar— salieron ocho sitios; mirados uno a uno con
   datos reales quedaron estos, y **dos se descartaron por no serlo**:
   `generate_schedule_auto` ya devuelve una tupla de cinco criterios acabada en
   el nombre, y el `palabras.sort(key=len)` del Catastro ordena una lista sacada
   de un TEXTO, que es deterministica —ahi el orden entre palabras de igual
   longitud sale de la direccion, no de Mongo—. Comprobarlo antes de tocar
   ahorro dos cambios que no arreglaban nada.
   Los que si lo eran, y con evidencia:
   · **taller recomendado para un dano** — las puntuaciones son sumas de bonos
     fijos (80, 60, 50, 40, 30), asi que empatan siempre: medido sobre doce
     danos reales, **las doce listas tenian empate y en dos estaba en el PRIMER
     puesto** (Chapisteria Riazor y AutoFix Tambre, los dos a 155). Cual salia
     recomendado dependia del orden de `find()`;
   · **sugerencias de ficha para un Transporter ID** — `_parecido` es un
     cociente de enteros pequenos (0.5, 0.66, 0.75, 1), o sea que empata con
     facilidad, y elegir la ficha que no es cuelga las entregas de una persona a
     otra (gotchas 15 y 49);
   · el ranking de talleres de una orden y las colecciones mas gordas de
     `/admin/salud`.
   Todos con desempate por nombre. **El nombre no aporta significado de negocio
   —eso seria inventarselo— pero hace la lista ESTABLE**, que es lo que se
   pedia; la puntuacion y sus motivos van a la vista para que decida una
   persona. Ojo con `reverse=True`: con un desempate por texto ordenaria de la
   Z a la A, asi que se niegan los numeros y el nombre sube normal.
   Comprobado en produccion: las 8 listas conservan EXACTAMENTE el mismo
   contenido y las mismas puntuaciones —solo cambia el orden entre empatados— y
   tres peticiones seguidas dan lo mismo. Ocho casos en `test_dsc_orden.py`.

63. **Mil llamadas pequenas en fila son lentas aunque ninguna lo sea.**
   `/admin/salud` pedia un `collStats` por CADA coleccion de CADA base, una
   detras de otra: 46 dbStats + 46 listCollections + **1.290 collStats = 1.382
   idas y vueltas** a Atlas. A ~7 ms cada una salen los **9,8 s** medidos
   (mediana de tres tiradas, una de 22 s). No habia ninguna consulta lenta: la
   arquitectura del endpoint era la lentitud. Con `asyncio.gather` y un
   semaforo de 24 baja a **3,5 s (2,7x)**.
   El semaforo no es adorno: sin tope se le mandan 1.382 comandos de golpe al
   mismo pool de conexiones y se cambia un problema por otro — el resto del
   backend dejaria de responder mientras tanto.
   Y en la misma tanda, `/cortex/dsc` hacia DOS `aggregate` con el mismo
   `$match` + `$filter` sobre el `timeline` de cada paquete: la etapa cara,
   calculada dos veces sobre los mismos ~48.000 paquetes. Un `$facet` la calcula
   una vez y agrupa dos: **2,2 s -> 1,1 s (2x)**, con la respuesta comprobada
   campo a campo antes y despues.
   Regla: antes de tocar una consulta, contar cuantas VECES se llama. El
   `explain` de una consulta rapida no dice nada si se ejecuta mil veces.
   La misma forma, tercera vez el mismo dia: `/vehicles/duplicados` hacia un
   `count_documents` por cada pareja (ficha, coleccion) — 24 matriculas
   repetidas x 7 colecciones = ~340 consultas en fila para 186 furgonetas, y
   **1.033 ms**. Una consulta por coleccion con `$group` sobre el `$in` de los
   ids: **276 ms (3,3x)**, y la respuesta identica —24 grupos, 28 fichas de
   mas, los mismos conteos y el mismo orden—. El patron bueno YA estaba en el
   fichero, en `/drivers/duplicados`: antes de escribir uno nuevo, mirar como
   se resolvio el hermano.


64. **`route-details` tiene DOS niveles y lo bueno esta en el de arriba. Una
   linea que miraba un nivel de mas costo ~20 versiones de la extension en una
   semana.** La respuesta es:

   ```
   { rmsRouteDetails: { stops[], transporters[] },
     addresses:    [ { addressId, address1, city, geocode:{latitude,longitude} } ],
     transporters: [ { transporterId, firstName, lastName, workPhoneNumber } ] }
   ```

   `addresses` y `transporters` son **hermanos** de `rmsRouteDetails`, no hijos.
   El interceptor hacia `const root = json.rmsRouteDetails` y luego
   `root.addresses`, o sea SIEMPRE `undefined`. Y lo peor no es el fallo: es que
   de ahi se concluyo por escrito «route-details no trae la direccion, por eso
   `addrs` sale vacio siempre», ese comentario quedo en el codigo, y cada
   version siguiente lo dio por cierto y busco la solucion en otro sitio.
   Lo que costo, medido el 05-09-2026: en Apoyo en ruta, **66 de las 67 paradas
   de la XA_C29 decian «Cortex no da la ubicacion»** con el mapa vacio, teniendo
   Cortex la coordenada del destino en cada respuesta que ya nos bajabamos. Y
   por el mismo motivo `driver_name` estaba a **0 de 292.927 paquetes** desde el
   primer dia: el `transporters` de dentro no lleva `firstName`.
   **Como se encontro, que es lo que importa:** leyendo el ESQUEMA REAL que la
   propia extension captura y guarda en `cortex_diagnostico` (`schema:details`),
   no el codigo ni lo que recordabamos. El esquema decia `addresses` a primer
   nivel, con `geocode`. Antes de eso llegue a dar por buenas dos hipotesis
   falsas —que los `addressId` eran de dos espacios distintos y que habia que
   cruzar por TBA— y las dos se cayeron al mirar el dato.
   Reglas: **antes de concluir que una fuente no trae un dato, mirar el esquema
   real completo, no el trozo por donde se entra**; y un comentario que afirma
   que algo no existe necesita la misma prueba que un test — si se equivoca,
   cierra la investigacion para todos los que vengan detras.
   Lo vigila `scripts/check-destinos.mjs`, que ejecuta el parser DE VERDAD
   (extraido del fichero, gotcha 40) contra una respuesta con la forma real y
   comprueba que cada parada sale con direccion, destino, conductor y telefono.
   Probado reintroduciendo el fallo: da los cuatro avisos. **Es la primera vez
   que se puede saber si una version de la extension funciona sin instalarla.**
   Y `lat`/`lng` siguen siendo SOLO el escaneo: el destino va en
   `dest_lat`/`dest_lng`. Mezclarlos cambiaria en silencio el significado de un
   campo que ya usan 281.559 documentos (gotcha 29).


65. **La posicion en vivo del conductor SI existe, y esta en
   `/transporters/locationUpdate` -> `transportersLocation[].geocode`.**
   Es el endpoint que mueve los puntos del mapa de Cortex.

   **Lo escribo asi porque primero escribi lo contrario, y esa es la leccion.**
   El 05-09-2026 di por bueno que Cortex no la publicaba, con estas pruebas:
   `lastLocation` vacio en `route-details` (0 de 37 rutas) y en
   `route-summaries` (0 de 38 personas), y un barrido automatico que solo
   encontraba `executionGeocode` y `centroid`. Todo cierto — y la conclusion,
   falsa. El barrido estaba enganchado DESPUES de
   `if (!marked && !isSummary && !RELEVANT_URL.test(url)) return;`, o sea que
   solo miraba los tres sitios donde ya sabiamos que no estaba. Y los hallazgos
   se guardaban todos bajo el mismo `_id`, asi que se pisaban y solo se veia el
   ultimo. **Demostre «no esta en los tres sitios que miro» y escribi «no
   existe».** Es exactamente el fallo del gotcha 64 —una conclusion de mas
   fijada en un comentario— cometido por segunda vez en el mismo dia, y lo
   corrigio Dani preguntando lo obvio: «los puntos se van actualizando, eso
   tiene que llegar de algun sitio».
   Con el buscador movido delante del filtro salieron CUATRO sitios con
   coordenadas y uno era este.

   Como esta montado: `posiciones_vivas` con sus tres saltos dados de alta
   (interceptor -> bridge -> background; si falta uno se pierde en silencio) y
   `cortex_posiciones` en la BD de cada empresa, un documento por persona y dia
   con TTL de 3 dias. Se queda SIEMPRE la mas reciente (`$max` sobre la hora):
   con dos pestañas abiertas puede llegar una vieja detras de una nueva, y que
   la posicion de alguien retroceda es peor que no tenerla. Si Cortex no manda
   hora se usa la de la captura y se marca `hora_estimada`.
   Medido nada mas conectarlo: **39 conductores con posicion, antiguedad 0,4
   min**, y 14 de 14 en la pantalla de apoyo a 0 min.

   `_apoyo_posicion` tiene CUATRO fuentes por orden y la respuesta dice siempre
   cual es (`que`): la viva -> `route-details` -> el resumen -> el ultimo
   escaneo. Ese ultimo hay que cogerlo entero, sin filtrar por estados «en
   calle»: dejaba fuera la ENTREGA, que es el escaneo mas repetido de un
   reparto, y la posicion pasaba de 8,7 a 40,5 minutos de antiguedad.

   Regla general, y va en serio: **una prueba negativa solo vale dentro de lo
   que ha mirado.** Antes de escribir «no existe», comprobar que el instrumento
   podia verlo — aqui bastaba con mirar si el buscador se ejecutaba para esa
   respuesta, y no lo hice.


## Reglas de trabajo

- Tras cambios: `npm run build` (frontend) y deploy de lo tocado; siempre smoke test.
- Commits en español, estilo `feat:`/`fix:`, y push a `main` (sincroniza 2 ordenadores).
- **Al empezar una sesion**: `CLAUDE.md` -> `ESTADO.md` -> `CHECKPOINT.md` ->
  `docs/ROADMAP.md`. El repositorio manda sobre lo que recuerde una conversacion.
- Tests: `python backend/tests/run_all.py` (todos los de `backend/tests/`; CI
  corre tambien los de API, que necesitan el backend instalado). Ojo al
  encadenar en bash: `run_all.py | tail -1` esconde el fallo — `set -o pipefail`.
- Smoke de produccion: `backend/scripts/smoke_endpoints.py` desde la maquina,
  que comprueba que el DATO cuadra y no solo que responda 200.
- **El primer dia de un cliente**: `python backend/scripts/smoke_empresa_nueva.py`.
  Da de alta una empresa de usar y tirar y la recorre entera: importar de un
  Excel, las 35 pantallas con centro y sin el, el conductor entrando al portal,
  foto + IA + Revision Rapida filtrada por centro, el circuito del taller de ida
  y de vuelta, y lo que solo falla con dos peticiones a la vez. 25
  comprobaciones. **Es el unico sitio donde se prueba la base vacia**, que es el
  camino que con la flota de Dani no se recorre nunca y que los clientes nuevos
  recorren entero el primer dia: saco seis fallos de golpe el 31-08-2026
  (gotchas 26, 32, 42 y 43), todos respondiendo 200 o lista vacia. Pasarlo
  despues de tocar multiempresa, importaciones, centros o el flujo de taller.
  Deja la empresa creada a proposito —no se borra sola: un script de smoke no
  debe poder borrar nada—; se quita desde el panel de super-admin.
- Los checkers de `scripts/` deben quedar a cero antes de commitear. Son dieciocho:
  `check-i18n`, `check-routes`, `check-huerfanas`, `check-permisos`, `check-tema`,
  `check-ayuda`, `check-contraste`, `check-extension`, `check-patrones`,
  `check-tema-mezclado`, `check-efectos`, `check-chunk-error`,
  `check_contracts.py`, `check_objectid.py`, `check_tenant.py`,
  `check_multiempresa.py`, `check_borrado.py` y `check_unicos.py`.
  `check-patrones` admite `soloEn` en una regla: hay patrones que solo son un
  bug en una parte del arbol (el de WhatsApp es correcto dentro de
  `enlace_wa`).
  **Ninguno tolera ya backlog**: los 45 avisos de `check-patrones` y las 29
  rutas de `check-huerfanas` se miraron una a una el 31-08 y el 01-09-2026, y
  los dos trinquetes están a cero. Un checker con backlog no distingue lo nuevo
  de lo viejo, que es como se acumulan.
- `check-huerfanas.mjs` lista rutas del backend que no llama ningún cliente. Una
  ruta sin UI no falla, simplemente no se usa: así estuvieron meses el módulo de
  turnos entero y las subidas de métricas.
  **Trinquete a CERO desde el 01-09-2026**: si añades una ruta, engánchala el
  mismo día o anótala en `SIN_UI_A_PROPOSITO` con el motivo. Las 29 que había se
  cerraron una a una — 5 eran falsos positivos (las de `@app` llevan `/api`
  dentro de la ruta y el cliente lo pone por su lado: se arregló la comparación,
  no la lista), 2 se engancharon (el PDF de flota y las bolsas, que la ficha
  ENSEÑABA sin que nadie pudiera rellenarlas), 1 quedó marcada como NO enganchar
  y el resto tienen su porqué escrito.
  Mientras se tolera un backlog, lo que se añade encima no se distingue de lo
  que ya estaba: por eso los tres trinquetes que quedaban se han bajado a cero
  (`check-patrones` también) y `check_contracts` nunca tuvo.
