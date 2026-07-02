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
  `cd frontend-v2 && npm run build && npx wrangler pages deploy dist --project-name flotadsp-v2 --commit-dirty=true`
- Backend: Fly.io → **https://flotadsp-backend.fly.dev**
  `cd backend && fly deploy --strategy immediate`
  Smoke test tras deploy: `GET /api/health` debe dar `status=ok, mongo=True`.
- `app.flotadsp.com` sirve la app antigua (legado, no tocar).
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
5. El repo versiona `frontend-v2/dist/` (build) a propósito, para paridad entre ordenadores.

## Reglas de trabajo

- Tras cambios: `npm run build` (frontend) y deploy de lo tocado; siempre smoke test.
- Commits en español, estilo `feat:`/`fix:`, y push a `main` (sincroniza 2 ordenadores).
- Los checkers de `scripts/` deben quedar a cero antes de commitear.
