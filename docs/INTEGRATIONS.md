# Integraciones

> **Regla:** nunca afirmar que una integración existe o que una API está
> disponible sin haberlo verificado. Cada línea de aquí lleva su estado real.
>
> Estado a 2026-08-30.

| Estado | Significado |
|---|---|
| ✅ | Funcionando en producción y verificado |
| ⚠️ | Funciona a medias o depende de algo manual |
| 🔒 | Construido y bloqueado por un tercero |
| ❌ | No existe |

---

## Amazon

### Cortex — ✅ pero por raspado, no por API

**Qué es.** El sistema de Amazon donde se ve el estado de cada paquete. **No hay
API pública para un DSP**: la información se capta con una extensión de Chrome
propia (`cortex-extension/`, MV3) que intercepta las llamadas que hace la propia
página.

**Cómo funciona.** Tres saltos, cada uno con su lista blanca:
`interceptor.js` (mundo MAIN) → `bridge.js` → `background.js` → backend.

**Lo que trae.** 259.804 paquetes con estado, ruta, conductor, dirección,
coordenadas y un `timeline` con el `context` de cada evento — que es el motivo
real del fallo (`ADDRESS_NOT_FOUND`, `BUSINESS_CLOSED`…).

**Fragilidad conocida.** Depende de que Amazon no cambie su web. Ya pasó: los
`routeId` de RDM son UUID y el filtro esperaba `\d{5,}-\d{1,3}`, y se perdieron
118 paquetes en silencio. Por eso existe `scripts/check-extension.mjs`, que
verifica que los tres saltos hablan el mismo idioma.

**TTL.** Los paquetes caducan a los ~60 días. Por eso el análisis de direcciones
consolida su recuento antes de que desaparezcan.

### Scorecard — ⚠️ manual

Se sube el PDF oficial a mano. Última cargada: **semana 29**, y estamos en la 36.
No hay forma automática de traerlo.

De ahí salen los umbrales reales de la nave, que son los que usa todo lo demás.
Sin una scorecard subida, los tiers se calculan con umbrales genéricos y se
marcan como **no fiables** (`cierto: false`), nunca como ciertos.

### Reportes diarios — ⚠️ manual, con dos trampas medidas

Ver `docs/REPORTES_DIARIOS.md`. Las dos importan:

- El reporte del día F trae el bloque DNR de **F−2**
- La columna DSC se rellena **2-4 días tarde**, así que un bloque recién bajado
  viene entero a `N` y saldrían cero defectos

### API oficial de Amazon para DSPs — ❌ `UNKNOWN`

No se ha verificado si existe, qué expone ni qué haría falta para acceder. **No
asumir que existe.** Todo lo que hay hoy pasa por Cortex o por ficheros que
alguien descarga.

---

## WhatsApp Business (Meta Cloud API) — 🔒

**Estado.** Código completo, desplegado y probado contra producción: el webhook
responde, la prueba falla limpio sin credenciales, los avisos salen apagados de
fábrica, y las tres plantillas se suben de un botón.

**Bloqueado por.** Meta tiene la cuenta de Dani en bloqueo antispam: no llega el
SMS de verificación a ningún número. Y la verificación de negocio necesita el
CIF, que aún no existe.

**Camino sin empresa.** Meta da un número y una cuenta de prueba con 5
destinatarios y 250 conversaciones/24 h. Con eso se puede montar y probar entero.

**Coste real.** 0,015–0,02 €/conversación de utilidad en España. Con los tres
avisos, 1–2 €/mes. Por eso se descartó Superchat: su cuota iría **encima**.

**Credenciales.** Las cuatro por `fly secrets set`, nunca por formulario web ni
por chat.

---

## Gemini (Google AI Studio) — ⚠️ con cuota

**Qué hace.** Analiza las fotos de cada inspección: detecta daños, los nombra,
estima coste y lee el odómetro.

**Números.** 3.751 de 3.806 inspecciones analizadas. 8.775 daños con coste
estimado, media 342 €. 36 fallos de Gemini y 1 timeout.

**Trampa conocida.** La clave está en plan gratuito (~20 peticiones/día) y tumba
toda la IA a diario. Antes de sospechar del código, mirar la cuota.

**Anti-alucinación en el odómetro.** Se pregunta **dos veces** con temperatura
alta y solo se acepta si las dos lecturas dan el mismo número: si la IA se
inventa un dígito, casi nunca se inventa el mismo dos veces.

---

## Servicio propio de visión (YOLO11 + SAM2) — ✅

`flotadsp-ai.fly.dev`. Detecta y segmenta daños en la foto y genera las fotos
anotadas (1.883 inspecciones las tienen). **No devuelve las cajas al backend**,
así que hoy no se puede recortar cada golpe por separado — eso limita lo que se
le puede enseñar al taller.

---

## Geocodificación — ⚠️

Nominatim, Photon y CartoCiudad. **Photon y Nominatim son la misma fuente**
(los dos leen OpenStreetMap), así que se vota por **familia** y no por servicio:
si contaran como dos, cualquier error de OSM se confirmaría a sí mismo.

**Pendiente y sensible:** la clave de Google Geocoding se subió a este repo, que
es público (commit `2f0bb46`). **Sigue sin rotar.**

---

## Telegram — ✅

El canal de avisos que funciona hoy: resumen del día, incidencias graves,
seguimiento del taller, caída del DCR. Es también el que recoge lo que WhatsApp
no puede mandar todavía.

---

## Cloudflare R2 — ✅

Fotos y documentos. Bucket `flotadsp-uploads`, público por URL.

---

## MongoDB Atlas — ⚠️ M0

512 MB y **sin copias de seguridad nativas**. Hay backup diario propio a R2 a
las 04:00. Los dos límites (Atlas M0 y la máquina de Fly de 1 GB) **rompen en
silencio**: no avisan, simplemente empieza a fallar.

Por eso las colecciones que crecen sin techo llevan TTL: `cortex_packages`,
`cortex_events`, `whatsapp_envios`.
