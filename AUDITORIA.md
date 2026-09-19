# Auditoría de FlotaDSP

**Empezada el 19-09-2026.** Pasada 1 en curso.

Cada hallazgo de este documento sale de un **dato de producción** —el registro
de errores del navegador, las peticiones fallidas, el smoke contra la base
real— o de ejecutar el código, nunca de leerlo y suponer. Lo que no he podido
comprobar está marcado como **no verificado**, con cómo comprobarlo.

Una nota sobre el método, porque cambia lo que sale: buscar bugs leyendo 52.000
líneas de backend encuentra los que uno ya sabe buscar. Buscarlos en lo que la
app **ya ha registrado que le pasó a alguien** encuentra los que nadie sabía.
Los dos primeros de esta pasada salieron así.

---

## 1. Mapa de la app

### Qué es
SaaS multiempresa de gestión de flota para DSP de Amazon. Cada empresa tiene su
base de datos (`dsp_<org_id>`; la principal se llama `flotadsp`), y el login,
las organizaciones y la auditoría viven en `flotadsp_global`.

### Stack (verificado en el repo)
| Parte | Qué es |
|---|---|
| Backend | FastAPI en un solo fichero, `backend/server.py` (~52.000 líneas) + `analitica.py`, `ai_learning.py` |
| Frontend | React 18 + Vite (`frontend-v2/`), desplegado en Cloudflare Pages → flotadsp.com |
| Base de datos | MongoDB Atlas (10 GB), multiempresa por proxy de contextvar |
| Ficheros | Cloudflare R2 (fotos de inspección, documentos, CV) |
| Hosting API | Fly.io (`flotadsp-backend`, región cdg), **una sola máquina** |
| Captura de Amazon | Extensión Chrome MV3 propia (`cortex-extension/`) |

### Pantallas (extraídas de `main.jsx`, no de memoria)
- **Panel (46 pantallas)**: actividad, admin, analitica, aparcamiento, apoyo,
  asignacion, avisos-itv, bandeja, casas-alquiler, chat, checklist-operativo,
  conductores, configuracion, contactos, correo, debrief, diarios, dsc, empleo,
  ia-peritaje, importaciones, incidencias, incorporaciones, informes,
  inspecciones, lab, metricas, mi-dia, ordenes, origen-danos, paquetes, perfil,
  plantilla, portal-conductor, rendimiento, renting, revision, scorecard,
  talleres, tienda, turnos, usuarios, vehiculos, vencimientos, whc.
- **Portal del conductor** (`/conductor`, `/conductor/:slug`): una sola URL con
  ocho pantallas dentro (entrar, inicio, inspección, pedir días, mis turnos, mi
  clave, tienda, mis números, mis ayudas).
- **Públicas sin sesión (29 rutas)**: web comercial (`/`, `/planes`,
  `/contacto`, legales), empleo (`/empleo`, `/empleo/:slug/:oferta`,
  `/empleo/prioridad`), tienda (`/t/:token`), portal del taller
  (`/taller/t/:token`), apoyo en ruta (`/apoyo/t/:token`), DNR (`/dnr/t/:token`),
  registro y verificación.

### Roles
`super-admin` (solo Dani: Negocio, Bandeja, Cómo va el negocio) · `owner` ·
`admin` (oficina, con 30+ permisos por casilla) · `center_manager` (acotado a
sus naves) · `driver` (solo el portal).

### Conectores (por variable de entorno, verificado)
MongoDB Atlas · Cloudflare R2 · **Gemini** (análisis de daños y asistente) ·
**ai-service** propio (YOLO11+SAM2) · **Resend** y **Brevo** (correo, con
relevo automático) · **Stripe** (tienda) · **Lemon Squeezy** (suscripciones) ·
**Telegram** (avisos internos) · **Web Push** (VAPID) · **Apple Maps** y
**Google Geocoding** · Catastro/CartoCiudad (geocodificación inversa) ·
WhatsApp por `wa.me` (sin API de Meta: la oficina pulsa enviar).

---

## 2. Bugs y falsos positivos corregidos en esta pasada

### 2.1 «Mis números» dejaba la pantalla en blanco a 40 conductores
**Dónde**: `GET /portal/mis-numeros` + `pages/driver/MisNumeros.jsx`.
**Evidencia**: 6 errores el 18-09 en `client_errors`:
`undefined is not an object (evaluating 'a.centro.entregados.toLocaleString')`.
**Causa raíz**: el endpoint devolvía `centro` como **objeto**
`{codigo, dcr, entregados}` en el camino normal y como **el código del centro
(texto)** cuando la ficha no tiene emparejado su id de Cortex. El portal pinta
ese bloque con `datos?.centro &&`, y un texto no vacío pasa ese guard: reventaba
al leer `.entregados`. Misma familia que el gotcha 59: un mismo nombre con dos
formas.
**Corrección**: `centro` es objeto o `None`; el código va en `centro_codigo`; y
el guard del portal mira el dato que va a usar.
**Alcance medido**: 40 conductores activos sin id de Cortex.
**Verificado en producción** con el token de un conductor real (MARTIN PEREZ):
`centro: None`, `sin_transporter: true`.

### 2.2 La celda de la RUTA de la plantilla diaria no se guardaba nunca
**Dónde**: `PATCH /tools/plantilla-compartida/{id}/celda` + `PlantillaGenerador.jsx`.
**Evidencia**: 76 × HTTP 409 entre el 02 y el 19-09; **77 de los 409 son de Mery**,
siempre a primera hora.
**Causa raíz**: cada celda viaja con `ruta_ref` (la ruta de su fila) para
detectar que alguien añadió o quitó filas. Al escribir en la celda de la RUTA,
lo que hay en pantalla ya es el texto nuevo y el servidor sigue con el viejo:
no casaban, respondía «las filas han cambiado» y recargaba, borrando lo escrito.
**Corrección**: la referencia sale de lo último que mandó el servidor
(`rutasServidor`), y el servidor no pide recargar si la fila ya tiene el valor
que se quería poner.

### 2.3 Dos furgonetas figuraban en taller estando en la calle
**Evidencia**: `smoke_endpoints.py` contra producción — invariante
`SAFE_TO_AUTOCORRECT == 0` rota; 5739 MVN y 7119 NGB llevaban **8 y 3
inspecciones** desde que «entraron» en taller.
**Corrección**: aplicado el corrector del propio checker (respaldo previo en
`app_meta.respaldo_estados_vehiculo`, reversible).
**Resultado verificado**: hallazgos 11 → 7, **días-furgoneta parados 66 → 0**.

### 2.4 La lista «sin emparejar» contaba a gente que ya no trabaja ahí
**Dónde**: `GET /drivers/sin-transporter`.
**Evidencia**: decía **88** personas por emparejar; en activo solo hay **40**.
Los otros **48 estaban dados de baja**.
**Causa raíz**: filtraba por `status` pero no por `active`, al revés que su
hermano `sin-centro`, que sí lo hacía. Una lista de tareas con el 55 % de ruido
se deja de mirar, y entonces los 40 de verdad se quedan sin emparejar igual.
**Corrección**: mismo filtro que el hermano.

### 2.5 La pantalla de salud tardaba entre 5 y 43 segundos
**Dónde**: `GET /admin/salud` (Negocio → salud del sistema).
**Evidencia**: medido contra producción — 13 s, 23 s y hasta **43 s**; desde
dentro de la propia máquina, 5 s (o sea que no era la red).
**Causa raíz**: pedía un `collStats` por **cada colección de cada base**. Hoy
son **59 bases y 1.908 colecciones**: unas **2.026 idas y vueltas** a Atlas.
Es el gotcha 63 otra vez, y crece solo: cada cliente nuevo suma su base.
**Corrección**: estadísticas baratas de todas las bases (una llamada cada una)
y desglose por colección **solo de las 8 que pesan** — el desglose de una base
de 2 MB no lo mira nadie. El total sigue sumando las 59.
**Medido después**: **1,03 s** desde fuera y 0,9 s desde la máquina, con el
mismo dato en pantalla (1.044,8 MB, 59 bases, las mismas colecciones).
Trinquete en `test_salud_rendimiento.py`.


---

## 3. Lo que parecía un bug y NO lo era (comprobado, no supuesto)

| Sospecha | Qué encontré |
|---|---|
| 84 × `429` en `/client-error` | El reportador del navegador ya se limita solo (5 mensajes distintos por carga, sin reintento): no hay bucle y los primeros errores sí se guardaron |
| `400` en `/tienda/prendas` y `/tienda/logos` | Validación correcta (nombre vacío). Los desplegables de tipo y color salen del propio servidor: la pantalla no ofrece nada que el backend rechace |
| Contraseñas de usuarios en variables de entorno | Correcto: sin la variable la cuenta **no** se crea. No hay contraseña por defecto escondida |
| «El panel no avisa de los conductores sin correo» (lo dije yo antes) | **Falso, me equivoqué**: Conductores muestra «N sin correo» y explica que no pueden entrar |
| `Navigate is not defined` (12 errores el 14-09) | Ya no existe: comprobados todos los ficheros que usan nombres de react-router |
| «`/scoring/drivers` tarda 17-20 s» (lo medí yo) | **Falso: era mi medición.** `curl` sin `Accept-Encoding` se baja la respuesta sin comprimir. Como la pide un navegador tarda **0,99 s**. La lección es la del gotcha 65: una medida solo vale dentro de lo que mide el instrumento |
| «El `/` tarda 21 s» | Arranque en frío de la máquina de Fly. Medido en caliente: 0,12 s |

---

## 4. Estado de las comprobaciones

| Qué | Resultado |
|---|---|
| `backend/tests/run_all.py` | **583 bien, 0 mal** |
| Checkers de `scripts/` (30) | **0 avisos** |
| `npm run build` | OK |
| `npx playwright test` | 139 passed |
| `smoke_endpoints.py` (producción) | 19/21 → corregido lo corregible, 2 eran datos |
| Barrido de las 207 rutas GET (producción, empresa real) | **174 × 2xx, 33 × 4xx, CERO 5xx**. Los 33 leídos uno a uno: todos correctos (falta un parámetro obligatorio, o el rol no entra) |

---

## 5. Pendiente de tu decisión

1. **7 furgonetas con el estado incoherente** que el checker marca
   `NEEDS_REVIEW` a propósito (decide una persona): 9883 NFX, 5688 MVN,
   4461 NKC, 0069 MYS y 9897 NFX en taller sin ninguna orden abierta; 2829NGX y
   0524 MHN con orden abierta (OT-1003, OT-1004) figurando como activas.
2. **2 personas con la ficha duplicada**: ARACELI RAMALLO ARES (16 inspecciones
   en una ficha, el id de Cortex en la otra) y DAVID FREIRE CARLES. El historial
   está partido y el login del portal puede caer en cualquiera de las dos.
   Fusionarlas toca historial real: no lo hago sin que lo digas.
3. **`sample_mflix` ocupa 115,7 MB** en tu Atlas: es el dataset de ejemplo de
   MongoDB (películas), no es tuyo y es el 11 % de lo que usas. Borrarlo lo
   decides tú (no toco datos sin permiso).
4. **Rama de trabajo**: pediste rama nueva; el flujo del repo y lo que llevamos
   hoy es `main` + desplegar cada arreglo. Sigo en `main` salvo que digas.

---

## 6. Pasadas

- **Pasada 1** (en curso): errores del navegador, peticiones fallidas de 14
  días, smoke de producción, barrido de las 207 rutas GET, revisión de
  secretos. 4 bugs corregidos, 5 sospechas descartadas con evidencia.
