# FlotaDSP

SaaS de gestión de flota para DSPs de Amazon (empresas de reparto de última
milla). Inspecciones con foto y análisis de daños por IA, avisos de ITV y
vencimientos, scorecard y DCR, cuadrante de turnos, asignación diaria, órdenes
de taller, portal del conductor, selección de personal, y un módulo de «apoyo en
ruta» para reasignar paradas entre conductores sobre la marcha.

Multi-tenant: cada empresa tiene su propia base de datos.
En producción: **flotadsp.com** (frontend) y **flotadsp-backend.fly.dev** (API).

---

## Por dónde empezar a leer

**Lee `CLAUDE.md` primero.** No es documentación de cortesía: son 58 fallos que
ya han ocurrido en producción, cada uno con el número que lo midió y la razón de
por qué la solución obvia no servía. Sin eso, media revisión del código propone
cosas que ya se probaron y se descartaron por un motivo concreto.

Después, en este orden:

| Fichero | Qué es |
|---|---|
| `backend/server.py` | El monolito FastAPI. ~40.000 líneas, y ahí está casi todo. |
| `frontend-v2/src/` | React 18 + Vite. **El frontend activo.** |
| `cortex-extension/` | Extensión de Chrome (MV3) que captura los datos de Cortex de Amazon. |
| `scripts/` | 18 checkers que corren en CI. Cada uno nació de un fallo real. |
| `backend/tests/` | 26 ficheros de test. `python backend/tests/run_all.py`. |
| `docs/` | Notas de módulos concretos, con las mediciones que los justifican. |

### Lo que NO hay que leer

- `frontend/` y `frontend-src/` son el frontend **viejo**. No se toca.
- `mobile/` es una app Flutter en construcción, no está en producción.

---

## Arquitectura, en corto

- **Multi-tenant por base de datos.** `db` en `server.py` es un proxy que
  resuelve la base por un contextvar que fija el JWT. Login, organizaciones y
  enlaces públicos viven en `global_db`. Cualquier endpoint **sin sesión** tiene
  que fijar la empresa a mano o escribe en la base equivocada sin dar error
  (esto ya pasó: gotcha 26).
- **Auth**: JWT en localStorage. Roles `super-admin`, `owner`, `admin`, `driver`.
- **Los datos de Amazon** entran por la extensión de Chrome, que intercepta las
  respuestas de Cortex en el navegador de la oficina y las manda al backend
  autenticada con una llave de ingesta. No hay API oficial de Amazon.
- **IA**: Gemini para el análisis de daños en foto, más un servicio propio con
  YOLO11 + SAM2 (`ai-service/`). La IA aprende de las correcciones que hace la
  oficina en «Revisión rápida».
- **Infra**: Fly.io (backend), Cloudflare Pages (frontend), MongoDB Atlas,
  Cloudflare R2 (fotos y documentos). Copia diaria a R2.

---

## Si vas a revisar este código

Tres cosas que conviene saber antes de sacar conclusiones:

1. **Los fallos que más han dolido aquí no se ven leyendo el código.** Salieron
   midiendo contra la base de producción: teléfonos cruzados entre personas,
   estados que se traducían de más, paradas que desaparecían de un histórico,
   una versión de extensión que decía una cosa y ejecutaba otra. Una revisión
   estática encuentra otras cosas, y son bienvenidas — pero no esperes que el
   código confiese estos.

2. **Casi todo comentario largo explica un fallo real, no una obviedad.** Si un
   trozo de código parece innecesariamente retorcido, lo normal es que el
   comentario de encima diga qué se rompió cuando era simple.

3. **Los checkers de `scripts/` son el sitio donde va una regla nueva.** Si
   encuentras un patrón peligroso, lo útil no es solo el parche: es la regla que
   impide que vuelva a entrar. Cada checker se probó reintroduciendo el fallo
   que vigila, porque un checker que no ve es peor que no tenerlo.

---

## Desarrollo

```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn server:app --reload

# Frontend
cd frontend-v2 && npm install && npm run dev

# Tests y checkers (tienen que quedar a cero antes de commitear)
python backend/tests/run_all.py
node scripts/check-i18n.mjs   # …y los otros 17
```

Las credenciales no están en el repositorio: van por `fly secrets` en el backend
y por variables de entorno en el frontend. Los `.env` versionados son ejemplos
con URLs públicas.

---

Un solo desarrollador. Si algo parece hecho a mano es porque lo está, y si algo
parece exagerado para el tamaño del proyecto, probablemente sea la cicatriz de
un día malo.
