# Checkpoint

> Para retomar sin depender de ninguna conversación. Si esto contradice lo que
> hay en el repositorio o en producción, **gana el repositorio**.
>
> Escrito: **2026-08-30**

---

## Objetivo de esta tanda

Auditoría del estado real del sistema antes de seguir construyendo, y
corrección de lo que la auditoría destapara. Regla que ordena el trabajo:
**no se construye capa predictiva sobre datos que no son fiables**.

---

## Qué se descubrió

| Hallazgo | Medida | Clase |
|---|---|---|
| Furgonetas en `taller` sin fecha de entrada | 13 de 13 · **475 días-furgoneta** invisibles | Corregido |
| Furgonetas en `taller` sin ninguna orden | 13 | `NEEDS_REVIEW` — abierto |
| Colecciones muertas (>30 días sin escribir) | 18 de 72 | Inventariado |
| El DCR se desplomó el 28 y 29 de agosto | 237 paquetes, `BACK_TO_ORIGIN`, 30 rutas | `UNKNOWN` — necesita a Dani |
| La semana recién empezada pintaba «None%» | Cada domingo | Corregido |

**Falsas alarmas propias, registradas para no repetirlas:** `ai_feedback` no
tiene campo `tipo` (son `verdict`/`scope`); los turnos de noviembre son días
libres aprobados y son legítimos.

---

## Qué cambió

**Datos de producción** (todo con respaldo previo y verificación posterior):

- 13 furgonetas recuperaron `taller_desde` desde su incidencia de entrada.
  Respaldo: `app_meta/respaldo_estados_vehiculo`.

**Código:**

- `/checkers/estados-vehiculo` (GET) y `/corregir` (POST) — el primer checker
  del sistema de autocorrección. Detecta, clasifica y explica; **no corrige por
  su cuenta**, y al corregir **recalcula la clasificación en el servidor** en vez
  de fiarse de lo que mande el cliente.
- `scorecard_en_vivo` marca cuál semana enseñar (`ensenar`, `suficiente`) para
  no pintar una semana sin datos.

**Documentación creada:**
`docs/DATA_INTEGRITY.md`, `docs/DECISIONS.md`, `docs/BUSINESS_RULES.md`,
`docs/OPERATIONS.md`, `docs/INTEGRATIONS.md`, `docs/ARCHITECTURE.md`,
`docs/ROADMAP.md`. `ESTADO.md` reescrito como memoria del proyecto.

**No se creó `PROJECT_STATE.md`**: `ESTADO.md` ya cumplía esa función y dos
ficheros de estado discrepan siempre. Ver `docs/DECISIONS.md`.

---

## Qué se verificó

| | |
|---|---|
| Corrección de `taller_desde` | 13 corregidos, `verificado: true`, y **salen en la pantalla de paradas** |
| Que la prevención funciona | 5 casos en staging: se pone, no se reinicia al repetir, se borra al volver, y crea la incidencia |
| Smoke de producción | **18 de 18** |
| Tests | 17 en local (`python backend/tests/run_all.py`) |
| Checkers | los nueve en verde |

---

## Qué NO se verificó

- **Visualmente**, solo se miraron 2 de las 4 pantallas nuevas renderizadas con
  datos reales (origen de daños y cómo va la semana). Faltan «lo que acumulan» y
  «direcciones que fallan». El bug del «None%» salió justo de mirar, no del
  smoke.
- **Cómo entran los conductores al portal.** `driver_accounts` está vacía y
  ninguno tiene contraseña ni PIN en la base del tenant. El acceso de admin vive
  en `global_db.admin_users` (13 usuarios). `UNKNOWN` si los conductores pueden
  entrar y por dónde.
- Los 4 tests de API (necesitan el backend instalado). **CI sí los corre.**

---

## Riesgos abiertos

1. **13 furgonetas en taller sin orden** — la operación de taller ocurre fuera
   de la app. No añadir funciones al módulo hasta saber por qué no se usa.
2. **Los crons corren sin contexto de organización** y caen en la base por
   defecto. Hoy acierta por casualidad; con un segundo cliente, todos fallan.
3. **27 de 38 reglas de negocio no tienen test** (ver `docs/BUSINESS_RULES.md`).
4. **La clave de Google Geocoding sigue sin rotar** y está en un repo público.

---

## Siguiente acción exacta

**Preguntar a Dani por qué se anularon las dos únicas órdenes de taller.** Es la
información más valiosa que falta y solo él la tiene; sin ella, cualquier cosa
que se añada al módulo de talleres es a ciegas.

Si no está disponible, la siguiente por orden de `docs/ROADMAP.md` es **añadir
tests a las reglas que hoy no tienen ninguno**, empezando por las de
disponibilidad del vehículo (ITV, taller, baja), que son las que más caro salen
equivocadas.

---

## Cómo continuar

```bash
cd C:\Users\Usuario\Downloads\flotadsp_lab

# 1. Estado real
git log --oneline -5
python backend/tests/run_all.py
for f in check-i18n check-routes check-huerfanas check-permisos check-tema \
         check-ayuda check-contraste check-extension; do node scripts/$f.mjs; done
python scripts/check_contracts.py

# 2. Producción (desde la máquina, comprueba que el DATO cuadra)
fly ssh console -a flotadsp-backend -C "/bin/sh -c 'cd /app && python scripts/smoke_endpoints.py'"

# 3. Leer, por este orden
#    CLAUDE.md → ESTADO.md → docs/ROADMAP.md → este fichero
```

**Puntos de vuelta:** `punto-seguro-2026-08-29` · `estado-2026-08-30-madrugada`
