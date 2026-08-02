# Auditoría completa — FlotaDSP

**Fecha:** 16 de julio de 2026  
**Alcance:** Repositorio `flotadsp_work` (producción: flotadsp.com)  
**Estado del código:** Sin modificaciones — solo documento de auditoría y plan  
**Autor del análisis:** Revisión CTO + perspectiva inversor (YC-style)

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Auditoría técnica por área](#2-auditoría-técnica-por-área)
3. [Perspectiva inversor (Y Combinator)](#3-perspectiva-inversor-y-combinator)
4. [Catálogo de mejoras priorizadas](#4-catálogo-de-mejoras-priorizadas)
5. [Plan por fases](#5-plan-por-fases)
6. [Mejora #1 — Plan de implementación (sin ejecutar)](#6-mejora-1--plan-de-implementación-sin-ejecutar)
7. [Protocolo de validación post-cambio](#7-protocolo-de-validación-post-cambio)
8. [Estado actual vs. objetivo (baseline)](#8-estado-actual-vs-objetivo-baseline)
9. [Prompt maestro reutilizable](#9-prompt-maestro-reutilizable)

---

## 1. Resumen ejecutivo

FlotaDSP es un **SaaS vertical B2B en producción** para Delivery Service Partners (DSP) de Amazon: inspecciones con foto + IA de daños, alertas ITV, scoring de conductores, scorecard, operaciones diarias, chat, incidencias e integración Cortex (Package Intelligence).

| Dimensión | Nota | Veredicto |
|-----------|------|-----------|
| Producto / PMF potencial | 8/10 | Dolor real, ROI cuantificable, vertical claro |
| Ingeniería / arquitectura | 5/10 | Funciona, monolito frágil |
| Preparación SaaS comercial | 7/10 | Multi-tenant, billing, planes |
| Preparación SaaS internacional | 5/10 | i18n UI sí; ops/legal/SEO no |
| Invertibilidad (seed) | 6/10 | Prometedor con riesgos de ejecución y bus factor |

**Veredicto inversor:** *Interesante wedge en un nicho desatendido con tracción técnica real, pero necesita cerrar la brecha entre promesa de IA y producto, profesionalizar ops, y demostrar retención antes de una ronda seria.*

---

## 2. Auditoría técnica por área

### 2.1 Arquitectura — 6/10

**Actual:** React SPA (frontend-v2) + FastAPI monolito (~16.200 líneas) + MongoDB Atlas (BD por tenant) + R2 + Gemini + ai-service (YOLO11).

**Fortalezas:** Multi-tenant con BD física por org; routers auth/api separados; schedulers (backup, digest, Telegram).

**Debilidades:** Sin cola async para IA; sin staging; ai-service desacoplado pero fusión CV incompleta; 3 frontends legados.

---

### 2.2 Organización del código — 5/10

**Fortalezas:** Code-splitting lazy; CLAUDE.md; checkers CI (contratos, rutas, i18n); Flutter feature-based.

**Debilidades:** `server.py` concentra todo; API clients duplicados (`services/api.js` + `panel/api.js`); i18n monolítico (1.018 líneas); strings hardcodeados en español.

---

### 2.3 Calidad del código — 5/10

**Fortalezas:** Pydantic v2; tests anti-whitelist; idempotencia webhooks; error boundary frontend.

**Debilidades:** Whitelists PATCH silenciosas; rutas duplicadas posibles; cobertura tests ~5% del dominio; landing promete IA que prod no entrega al 100%.

---

### 2.4 Escalabilidad — 4/10

**Limites:** 1 VM Fly 1GB; Gemini cuota diaria; rate limiters in-memory; backup JSON.gz full; startup O(n) orgs para índices.

---

### 2.5 Rendimiento — 6/10

**Fortalezas:** Lazy routes; ThreadPoolExecutor para imágenes; R2 CDN.

**Debilidades:** Upload inspección síncrono (90s timeout); sin bundle analysis CI; few-shot descarga fotos por request.

---

### 2.6 Seguridad — 7/10

**Fortalezas:** JWT + bcrypt; CORS whitelist; CSP; HSTS; rate limit endpoints públicos; demo read-only; HMAC webhooks.

**Debilidades:** JWT en localStorage; LS_WEBHOOK_SECRET opcional; sin 2FA; rate limits no distribuidos.

---

### 2.7 Base de datos — 7/10

**Fortalezas:** ~30 índices por tenant; backup R2 diario; ledger de daños; idempotencia global.

**Debilidades:** Atlas M0; sin TTL/archivado; backup no escala; paginación inconsistente.

---

### 2.8 APIs — 6/10

**Fortalezas:** ~242 endpoints; health check; response_model en CRUD core.

**Debilidades:** Sin versionado; sin OpenAPI pública; Body(dict) sin schema en algunos endpoints; PUT/PATCH mixto.

---

### 2.9 Autenticación — 7/10

**Fortalezas:** Roles granulares; plan enforcement; impersonate solo SA; cortex ingest token scoped.

**Debilidades:** Sin refresh token; sin audit log impersonaciones; errores backend solo en español.

---

### 2.10 UX/UI — 7/10

**Fortalezas:** Panel maduro (31 páginas); command palette; Revisión Rápida HITL; portal conductor móvil; landing premium.

**Debilidades:** Curva aprendizaje alta; onboarding ausente; inconsistencia loading states; strings ES sueltos.

---

### 2.11 SEO — 3/10

SPA sin meta description, og:tags, sitemap, robots.txt ni prerender de landing.

---

### 2.12 Accesibilidad — 4/10

`prefers-reduced-motion` sí; WCAG 2.1 AA no; alt vacíos; sin tests a11y.

---

### 2.13 Internacionalización — 8/10

6 idiomas UI; checker CI; fallback EN. Backend/PDFs/emails mayormente ES.

---

### 2.14 Preparación SaaS — 7/10

Multi-tenant, Lemon Squeezy, planes, trial, demo, legal pages. Falta: onboarding, SLA, status page, API pública, DPA.

---

### 2.15 Costes infraestructura

**Operación mínima:** $10–30/mes. **Con escala (Gemini pago + M10 + GPU):** $100–300/mes.

---

### 2.16 Riesgos críticos

| ID | Riesgo |
|----|--------|
| R1 | Cuota Gemini → inspecciones caen |
| R2 | Bug monolito → outage global |
| R3 | IA imprecisa → churn |
| R4 | Bus factor = 1 |
| R5 | Promesa marketing ≠ producto real |
| R6 | Deploy sin staging |

---

### 2.17 Deuda técnica principal

Monolito 16k líneas · IA v3 no implementada · sin worker async · sin staging · tests limitados · SEO/a11y · frontends legados · reentrenamiento IA manual.

---

## 3. Perspectiva inversor (Y Combinator)

### 3.1 ¿Invertiría un partner de YC?

**Condicionalmente sí en pre-seed**, si el fundador demuestra:
- 3–5 DSPs de pago con uso semanal real (inspecciones, no solo login)
- NRR > 90% tras 6 meses
- CAC payback < 6 meses vía outreach directo (canal ya documentado en `docs/ventas/`)
- Roadmap IA creíble con métricas (precisión bbox, tiempo revisión HITL)

**No invertiría aún** si:
- La IA sigue siendo el diferenciador prometido pero no demostrado con datos
- Todo depende de una persona sin plan de contratación
- No hay entorno staging ni observabilidad → riesgo operacional alto

### 3.2 Tesis de inversión (pitch deck mental)

| Elemento | Evaluación |
|----------|------------|
| **Market** | Nicho acotado (~100–200 DSPs ES, expandible EU/US) pero ARPU alto (99–399€/mes) |
| **Problem** | Daños no documentados cuestan 300–1.500€; multas ITV; scorecard Amazon |
| **Solution** | Inspección móvil + IA + ops integradas (Cortex, scorecard) |
| **Moat potencial** | Datos propios de daños (1.300+ correcciones, modelo v2) + vertical depth |
| **Moat actual** | Débil — cualquier competidor con mejor CV puede copiar en 6 meses |
| **Traction** | Producción activa; métricas de clientes no visibles en repo |
| **Team** | Solo founder técnico — red flag clásico YC mitigable con primer hire |

### 3.3 ¿Qué falta para parecer un SaaS internacional?

| Gap | Por qué importa | Prioridad |
|-----|----------------|-----------|
| **Landing/marketing en EN first** | Inversores y mercado US/EU asumen EN default | Alta |
| **Status page pública** (status.flotadsp.com) | Señal de madurez ops; requisito enterprise | Alta |
| **Staging + preview deploys** | CI/CD profesional; reduce miedo a bugs | Alta |
| **Observabilidad** (Sentry, uptime) | MTTR y confianza B2B | Alta |
| **DPA / GDPR pack** | Venta EU/UK obligatoria | Alta |
| **Facturación multi-moneda visible** | Lemon Squeezy lo soporta; UI debe mostrarlo | Media |
| **Onboarding wizard post-signup** | Time-to-value internacional = self-service | Media |
| **Documentación API + webhooks** | Integraciones y partners | Media |
| **SSO/SAML** | Enterprise Amazon ecosystem | Fase 4 |
| **SOC 2 path documentado** | Enterprise US | Fase 4 |
| **Centro de ayuda / KB multilingüe** | Reduce soporte, escala ventas | Media |
| **Case studies + logos clientes** | Social proof | Alta (GTM, no código) |
| **SEO técnico landing** | Captación orgánica internacional | Media |

### 3.4 ¿Qué funcionalidades premium faltan?

Funcionalidades que justifican tier **Flota (399€)** y **Enterprise** frente a competidores:

| Feature premium | Valor para DSP | Estado |
|-----------------|----------------|--------|
| **Peritaje forense certificado** (PDF firmado, verify hash) | Disputas con renting/Amazon | Parcial ✅ |
| **Integración GT Motive / Audatex** (costes reales) | Ajustadores profesionales | ❌ |
| **API abierta + webhooks salientes** | Integrar ERP, nóminas | ❌ |
| **Multi-estación avanzada** (roll-up de 5+ centros) | DSPs grandes | Parcial ✅ |
| **Auditoría de actividad** (quién hizo qué) | Compliance | ❌ |
| **Export masivo / BI connector** | Enterprise reporting | Parcial (plan gate) |
| **SLA garantizado + soporte prioritario** | Enterprise | ❌ |
| **White-label portal conductor** | DSPs que quieren su marca | ❌ |
| **Predicción scorecard con alertas proactivas** | Diferenciador Amazon | Parcial ✅ |
| **Fleet telematics lite** (GPS, km automático) | Competidores lo tienen | ❌ |
| **Insurance claim automation** | Flujo siniestro → aseguradora | ❌ |
| **Benchmark anónimo entre DSPs** | "Tu score vs media estación" | ❌ |
| **IA v3 con confianza score + auto-publish** | Reduce HITL, escala | ❌ (doc, no prod) |

### 3.5 ¿Qué transmitiría poca profesionalidad?

| Señal | Impacto | Dónde se ve |
|-------|---------|-------------|
| **Promesa IA en landing ≠ producto real** | Destruye confianza post-demo | Landing vs Revisión Rápida |
| **Errores en español hardcodeados en UI EN** | Parece traducción a medias | Usuarios.jsx, PlantillaGenerador |
| **Sin status page / sin "trust center"** | "¿Y si se cae?" | Ausente |
| **Deploy directo a prod sin staging** | Riesgo percibido | Proceso actual |
| **App legada en app.flotadsp.com** | Marca fragmentada | Infra |
| **Mobile.zip suelto en repo root** | Repo poco cuidado | Root |
| **Sin página de seguridad (/security)** | Enterprise bloquea compra | Ausente |
| **Demo con datos sintéticos genéricos** | OK para demo, mal si es lo único | dsp_demo |
| **Gemini caído = producto caído** | "No es serio para operaciones críticas" | Cuota diaria |
| **Sin changelog público** | Transparencia producto | Ausente |
| **Título HTML solo "FlotaDSP"** | SEO/amateur | index.html |
| **Typos / inconsistencia PUT vs PATCH** | Deuda visible a integradores | API |

### 3.6 ¿Qué añadiría para competir con líderes del sector?

Referentes: **Solera Qapter**, **Tractable**, **Fleetio**, **Verizon Connect**, **Samsara** (adaptado a DSP Amazon).

| Capacidad líder | Qué hace FlotaDSP | Gap a cerrar |
|-----------------|-------------------|--------------|
| **Detección CV especialista** | Gemini + YOLO parcial | IA v3: CV localiza, LLM razona |
| **Estimación línea a línea** | Baremo propio | Integrar GT Motive o calibrar con facturas |
| **Segmentación paneles** | model_parts.pt existe | Integrar en pipeline prod end-to-end |
| **Telematics** | Solo km manual/foto | Partner OBD o integración renting |
| **Maintenance predictive** | Alertas ITV/renting/aceite | ML sobre histórico km + patrones |
| **Driver behavior scoring** | Scorecard Amazon + scoring propio | Unificar en un "driver 360" |
| **Mobile native offline** | PWA conductor + Flutter admin | Offline-first inspecciones |
| **Marketplace talleres** | Red seed workshops | Booking + seguimiento reparación |
| **Claims workflow** | Incidencias básicas | Flujo siniestro completo |
| **Amazon ecosystem depth** | Cortex ext, scorecard, plantillas | Más profundo = más sticky |

**Wedge defensible:** *"El único SaaS hecho para DSP Amazon que une inspección IA + scorecard + Cortex + ops diarias en un solo panel multi-idioma."* No competir head-on con Fleetio; dominar el nicho.

---

## 4. Catálogo de mejoras priorizadas

Lista maestra ordenada. **La Mejora #1 es la primera a implementar** (incremental, validable, alto ROI).

| # | ID | Mejora | Impacto | Esfuerzo | Riesgo |
|---|-----|--------|---------|----------|--------|
| **1** | M01 | **Fail-closed webhook Lemon Squeezy en producción** | Seguridad revenue | 2h | Bajo |
| 2 | M02 | Variables entorno frontend (`VITE_API_URL`) + `.env.example` | Staging foundation | 3h | Bajo |
| 3 | M03 | Entorno staging Fly.io + CF Pages preview documentado | Ops profesional | 1d | Medio |
| 4 | M04 | Sentry frontend + backend | Observabilidad | 4h | Bajo |
| 5 | M05 | Meta SEO landing (description, og:tags) + robots.txt | Captación | 4h | Bajo |
| 6 | M06 | Página `/security` (trust center básico) | Enterprise sales | 1d | Bajo |
| 7 | M07 | Status page (Better Stack / CF) | Confianza ops | 4h | Bajo |
| 8 | M08 | Unificar API_BASE (eliminar hardcode PlantillaGenerador) | Mantenibilidad | 1h | Bajo |
| 9 | M09 | Extraer `backend/auth.py` del monolito (primer corte) | Mantenibilidad | 2d | Medio |
| 10 | M10 | Tests: tenant isolation + webhook LS | Confianza CI | 1d | Bajo |
| 11 | M11 | Gate fotos cuentakm/checklist fuera análisis daños | Calidad IA | 4h | Medio |
| 12 | M12 | Inicio IA v3: pipeline CV-first (fase detección) | Producto core | 2–4 sem | Alto |
| 13 | M13 | Worker async inspecciones (Fly Machines / Redis) | Escalabilidad | 1 sem | Medio |
| 14 | M14 | i18n → JSON por locale | Mantenibilidad | 2d | Medio |
| 15 | M15 | Strings ES hardcodeados → claves i18n | Profesionalidad | 2d | Bajo |
| 16 | M16 | Paginación consistente list endpoints | Performance | 2d | Medio |
| 17 | M17 | TTL/archivado cortex_events + chat antiguo | Costes DB | 1d | Medio |
| 18 | M18 | Lifecycle R2 (archivar fotos >12 meses) | Costes storage | 1d | Medio |
| 19 | M19 | Refresh token / httpOnly cookies | Seguridad | 1 sem | Alto |
| 20 | M20 | 2FA admins | Seguridad enterprise | 3d | Medio |
| 21 | M21 | Audit log (impersonate, billing, deletes) | Compliance | 3d | Bajo |
| 22 | M22 | Onboarding wizard post-registro | Time-to-value | 3d | Bajo |
| 23 | M23 | OpenAPI publicada + `/api/v1/` versioning | Integraciones | 1 sem | Medio |
| 24 | M24 | API keys + webhooks salientes | Premium tier | 2 sem | Medio |
| 25 | M25 | DPA template + cookie policy EN/DE/FR | GDPR venta EU | 2d | Bajo |
| 26 | M26 | Prerender/SSG landing (Astro o CF) | SEO | 2d | Medio |
| 27 | M27 | Tests a11y Lighthouse CI | Accesibilidad | 1d | Bajo |
| 28 | M28 | Eliminar frontends legados + mobile.zip root | Repo hygiene | 2d | Medio |
| 29 | M29 | Rate limiters → Redis | Escalabilidad multi-VM | 2d | Medio |
| 30 | M30 | Reentrenamiento IA automatizado desde ai_feedback | Moat | 2–4 sem | Alto |
| 31 | M31 | Integración GT Motive / costes reales | Premium | 4+ sem | Alto |
| 32 | M32 | SSO/SAML | Enterprise | 3 sem | Alto |
| 33 | M33 | White-label portal conductor | Enterprise | 2 sem | Medio |
| 34 | M34 | Offline-first portal conductor | Mobile premium | 3 sem | Alto |
| 35 | M35 | Benchmark anónimo DSPs | Network effect | 2 sem | Medio |
| 36 | M36 | SOC 2 readiness doc + policies | Enterprise US | 1 sem | Bajo |
| 37 | M37 | Multi-región deploy (US-EAST + EU) | Global scale | 2 sem | Alto |
| 38 | M38 | Cola eventos + CQRS lecturas pesadas | Escala 1000+ orgs | 1 mes | Alto |

---

## 5. Plan por fases

### Fase 1 — Imprescindible (0–4 semanas)

*Sin esto, cada demo comercial y cada euro de MRR están en riesgo.*

| ID | Mejora |
|----|--------|
| M01 | Webhook LS fail-closed en producción |
| M02 | VITE_API_URL + .env.example |
| M03 | Staging Fly + CF preview |
| M04 | Sentry |
| M08 | Unificar API_BASE |
| M10 | Tests tenant isolation + webhook |
| M11 | Excluir cuentakm/checklist del análisis daños |
| M15 | Strings hardcodeados → i18n (críticos UI) |

**Objetivo:** Operaciones seguras, deploy predecible, primer corte de deuda visible.

---

### Fase 2 — Muy importante (1–3 meses)

*Credibilidad producto + conversión internacional.*

| ID | Mejora |
|----|--------|
| M05 | SEO landing |
| M06 | Trust center /security |
| M07 | Status page |
| M09 | Primer extracto monolito (auth) |
| M12 | IA v3 fase 1 (CV localiza cajas en prod) |
| M14 | i18n JSON por locale |
| M22 | Onboarding wizard |
| M25 | DPA + legal EN |
| M26 | Prerender landing |
| M21 | Audit log básico |

**Objetivo:** Producto alineado con marketing; primer hire puede contribuir.

---

### Fase 3 — Escalabilidad (3–6 meses)

*Preparar 50–200 DSPs activos.*

| ID | Mejora |
|----|--------|
| M13 | Worker async inspecciones |
| M16 | Paginación API |
| M17 | TTL MongoDB |
| M18 | Lifecycle R2 |
| M29 | Rate limits Redis |
| M30 | Reentrenamiento IA pipeline |
| M09+ | Más extractos monolito (inspections, cortex) |
| M19 | Refresh tokens |

**Objetivo:** Infra aguanta crecimiento sin reescritura.

---

### Fase 4 — Enterprise (6–12 meses)

*Contratos 500€+/mes, DSPs multi-estación grandes.*

| ID | Mejora |
|----|--------|
| M20 | 2FA |
| M23 | API v1 + OpenAPI |
| M24 | API keys + webhooks |
| M31 | GT Motive / costes |
| M32 | SSO/SAML |
| M33 | White-label |
| M36 | SOC 2 readiness |
| M21+ | Audit log completo + export |

**Objetivo:** Checklist procurement enterprise cerrable.

---

### Fase 5 — Nivel mundial (12–24 meses)

*Expansión US/EU/LATAM, moat de datos.*

| ID | Mejora |
|----|--------|
| M12+ | IA v3 completa + confianza score auto-publish |
| M34 | Offline-first mobile |
| M35 | Benchmark red DSPs |
| M37 | Multi-región |
| M38 | Event-driven architecture |
| M31+ | Insurance claims automation |
| — | Fleet telematics partner |
| — | Marketplace talleres con booking |
| — | ML maintenance predictivo |

**Objetivo:** Categoría leader en "Fleet OS for Amazon DSPs".

---

## 6. Mejora #1 — Plan de implementación (sin ejecutar)

> **Estado:** PENDIENTE — No se ha modificado ningún archivo de código.  
> **Mejora seleccionada:** M01 — Fail-closed webhook Lemon Squeezy en producción

### 6.1 Qué se va a cambiar

**Archivo único:** `backend/server.py`  
**Función:** `lemonsqueezy_webhook` (~línea 3913)

**Cambio propuesto:**

```python
# ANTES (actual):
secret = os.environ.get("LS_WEBHOOK_SECRET", "")
raw = await request.body()
if secret:
    sig = request.headers.get("X-Signature", "")
    # ... verifica firma ...
# Si secret vacío → acepta cualquier payload ⚠️

# DESPUÉS (propuesto):
secret = os.environ.get("LS_WEBHOOK_SECRET", "")
if not secret:
    logger.error("LS_WEBHOOK_SECRET no configurado — webhook rechazado")
    raise HTTPException(status_code=503, detail="Webhook no configurado")
raw = await request.body()
sig = request.headers.get("X-Signature", "")
digest = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
if not hmac.compare_digest(digest, sig):
    raise HTTPException(status_code=401, detail="Firma inválida")
```

**Opcional (test):** Añadir test en `backend/tests/test_api.py` que verifique 503 sin secret y 401 con firma incorrecta.

### 6.2 Por qué es la Mejora #1

1. **Protege ingresos:** Un atacante podría activar/suspender DSPs falsamente si el secret no está configurado.
2. **Cambio mínimo:** ~10 líneas, un archivo, reversible en minutos.
3. **Validable al 100%** con pytest existente + py_compile.
4. **Cero impacto UX:** Endpoint solo lo llama Lemon Squeezy server-to-server.
5. **Señal profesional:** Fail-closed es estándar en SaaS con billing.

### 6.3 Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Producción no tiene `LS_WEBHOOK_SECRET` → webhooks fallan | Media | Verificar `fly secrets list` ANTES de deploy |
| Tests CI no setean secret → test falla | Alta | Usar secret de test en conftest/fixture |
| LS reintenta webhooks 503 → ruido logs | Baja | Configurar secret antes de deploy |

### 6.4 Cómo comprobar que no se rompe nada

**Pre-implementación:**
```powershell
cd backend
python -m py_compile server.py
python ../scripts/check_contracts.py
pytest tests -q
```

**Post-implementación (misma batería + nuevo test):**
```powershell
# 1. Sintaxis
python -m py_compile backend/server.py backend/ai_learning.py backend/damage_segmentation.py

# 2. Contratos
python scripts/check_contracts.py

# 3. Tests API
$env:SECRET_KEY="test-secret-key-only-for-tests"
$env:MONGO_URL="mongodb://localhost:27017"
$env:DB_NAME="test_flotadsp"
$env:GLOBAL_DB_NAME="test_flotadsp_global"
$env:LS_WEBHOOK_SECRET="test-webhook-secret"
pytest backend/tests -q

# 4. Frontend (no debería verse afectado)
cd frontend-v2
npm ci
npm run build
node ../scripts/check-i18n.mjs
node ../scripts/check-routes.mjs
```

**Smoke test manual post-deploy:**
```powershell
# Health (sin cambios)
curl https://flotadsp-backend.fly.dev/api/health

# Webhook sin firma → debe dar 401 (no 200)
curl -X POST https://flotadsp-backend.fly.dev/api/billing/lemonsqueezy/webhook `
  -H "Content-Type: application/json" -d "{}"
```

**Criterio de éxito:** CI verde + webhook rechaza payloads no firmados + Lemon Squeezy sigue activando planes en evento real de prueba.

**Rollback:** Revertir commit; Fly deploy anterior. Tiempo: <5 min.

---

## 7. Protocolo de validación post-cambio

Ejecutar **después de cada mejora implementada** (Pasos 8–9 del flujo maestro):

### 7.1 Backend
- [ ] `python -m py_compile backend/server.py backend/ai_learning.py backend/damage_segmentation.py`
- [ ] `python scripts/check_contracts.py`
- [ ] `pytest backend/tests -q` (Mongo local o CI)

### 7.2 Frontend
- [ ] `cd frontend-v2 && npm ci && npm run build`
- [ ] `node scripts/check-i18n.mjs`
- [ ] `node scripts/check-routes.mjs`

### 7.3 Regresión
- [ ] Si cualquier checker falla → **revertir cambio**, no continuar
- [ ] Si test nuevo falla → arreglar antes de commit
- [ ] Smoke test manual según mejora (documentar en commit)

### 7.4 Pre-deploy producción
- [ ] `GET /api/health` → `status=ok, mongo=True`
- [ ] Verificar secrets Fly afectados
- [ ] Monitor Telegram 15 min post-deploy

---

## 8. Estado actual vs. objetivo (baseline)

> **Nota:** A fecha de este documento, **ninguna mejora del catálogo ha sido implementada**.  
> La comparativa before/after se actualizará tras cada mejora completada.

### 8.1 Baseline (ANTES — 16 jul 2026)

| Métrica | Valor |
|---------|-------|
| Líneas server.py | ~16.237 |
| Endpoints API | ~242 |
| Tests automatizados | ~8 casos |
| Cobertura dominio | ~5% |
| Entornos | Producción only |
| Webhook LS fail-closed | ❌ |
| IA v3 en prod | ❌ |
| SEO landing | ❌ |
| Status page | ❌ |
| Sentry | ❌ |
| Módulos backend | 3 archivos |

### 8.2 Objetivo (DESPUÉS — tras Fase 1 completa)

| Métrica | Objetivo |
|---------|----------|
| Entornos | Prod + Staging |
| Webhook LS fail-closed | ✅ |
| Sentry | ✅ |
| Tests | +tenant isolation, +webhook |
| API_BASE unificado | ✅ |
| Strings i18n críticos | ✅ |
| Regresiones CI | 0 |

### 8.3 Mejoras realmente implementadas

| # | Mejora | Fecha | Commit | Estado |
|---|--------|-------|--------|--------|
| — | *Ninguna aún* | — | — | Pendiente |

*(Esta tabla se actualiza tras cada mejora completada y validada.)*

---

## 9. Prompt maestro reutilizable

```
Actúa como un CTO senior con más de 20 años de experiencia construyendo SaaS internacionales.

Antes de escribir código:
1. Comprende completamente la arquitectura y el negocio de la aplicación.
2. Lee AUDITORIA_COMPLETA.md y CLAUDE.md.
3. Identifica la siguiente mejora pendiente en el catálogo (orden numérico).

Reglas de trabajo:
- Nunca hagas cambios masivos.
- Trabaja de forma incremental (una mejora por sesión).
- Antes de cada modificación explica: qué archivos, por qué, riesgos, validación.
- Después de cada cambio ejecuta TODAS las comprobaciones del §7 de AUDITORIA_COMPLETA.md.
- Si hay errores, arréglalos. Si hay regresión, revierte.
- No finalices hasta que CI local pase completo.
- Prioriza: mantenibilidad, rendimiento, seguridad, escalabilidad, UX, calidad.
- Si una decisión no está clara, pregunta antes de implementar.
- Commits en español, estilo feat:/fix:, push a main.
- Actualiza la tabla §8.3 de AUDITORIA_COMPLETA.md tras cada mejora completada.

Mejora actual objetivo: [NÚMERO Y ID del catálogo]
```

---

## Apéndice A — Checklist due diligence inversor

Documentos/capacidades que un inversor YC pediría en data room:

- [ ] MRR / clientes activos / churn (métricas reales, no repo)
- [ ] Demo en vivo + cuenta demo funcional ✅
- [ ] Arquitectura diagram (este doc + CLAUDE.md) ✅
- [ ] Plan seguridad / incident response
- [ ] Contratos tipo (T&C, DPA, SLA)
- [ ] Cap table / vesting
- [ ] Roadmap 12 meses con milestones
- [ ] Análisis competencia (Solera, Tractable, Fleetio)
- [ ] Unit economics (CAC, LTV, payback)
- [ ] Pipeline ventas (docs/ventas/) ✅

---

## Apéndice B — Comandos CI locales (referencia rápida)

```powershell
# Backend completo
python -m py_compile backend/server.py backend/ai_learning.py backend/damage_segmentation.py
python scripts/check_contracts.py
pip install -r backend/requirements.txt pytest pytest-asyncio
$env:SECRET_KEY="test-secret-key-only-for-tests"
$env:MONGO_URL="mongodb://localhost:27017"
$env:DB_NAME="test_flotadsp"
$env:GLOBAL_DB_NAME="test_flotadsp_global"
pytest backend/tests -q

# Frontend completo
cd frontend-v2
npm ci
npm run build
cd ..
node scripts/check-i18n.mjs
node scripts/check-routes.mjs
```

---

*Documento generado como parte de auditoría CTO. Próximo paso: implementar Mejora #1 (M01) siguiendo §6 y validar con §7.*
