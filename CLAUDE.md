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

## Reglas de trabajo

- Tras cambios: `npm run build` (frontend) y deploy de lo tocado; siempre smoke test.
- Commits en español, estilo `feat:`/`fix:`, y push a `main` (sincroniza 2 ordenadores).
- Los checkers de `scripts/` deben quedar a cero antes de commitear:
  `check-i18n.mjs`, `check-routes.mjs`, `check-huerfanas.mjs` y `check_contracts.py`.
- `check-huerfanas.mjs` lista rutas del backend que no llama ningún cliente. Una
  ruta sin UI no falla, simplemente no se usa: así estuvieron meses el módulo de
  turnos entero y las subidas de métricas. Lleva trinquete (tolera el backlog
  actual, falla si sube), así que si añades una ruta, engánchala.
