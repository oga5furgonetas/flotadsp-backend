# Checkpoint

> Para retomar sin depender de ninguna conversación. Si esto contradice lo que
> hay en el repositorio o en producción, **gana el repositorio**.
>
> Escrito: **2026-09-02**

---

## Objetivo de esta tanda

Auditoría completa con el método de `PROMPT-SESION-NUEVA.md` (las nueve
técnicas, cero falsos positivos), dos pasadas, todo desplegado y comprobado en
producción. El detalle está en `ESTADO.md` («Estado a 2026-09-02»).

---

## Qué se descubrió

| Hallazgo | Medida | Clase |
|---|---|---|
| Dos meses de Cortex borrados el 01-09 por el botón «Borrar todo» | 265.986 paquetes · 555.730 eventos | **Bug confirmado** — restaurado de R2 y cerrado (gotcha 45) |
| `congelar-dia` a mano recorría todas las empresas y devolvía sus DCR | 1 foto de OGA5 creada desde otra empresa | **Fallo multiempresa confirmado** — corregido |
| Dashboard ignoraba el centro y los centros permitidos | 125 furgonetas con OGA5 (son 69) | **Bug confirmado** — corregido, cuadra |
| Tabla día a día de la scorecard en blanco desde junio | `daily_ratios` = 0 docs, apuntaba al 14-06 | **Bug confirmado** — conectada a Cortex |
| Bandeja del taller sin forma de asignar mensajes sin clasificar | ruta sin botón | **Bug confirmado** — enganchado |
| iPhone no se curaban del chunk envenenado | 4 errores reales en `client_errors` | **Bug confirmado** — patrón de Safari añadido |
| `check-huerfanas` daba por consumidas 16 rutas por su export en `api.js` | 16 → 4 sin consumidor real | **Checker corregido** — 4 anotadas con motivo |
| `smoke_endpoints.py` medía con `org_id: oga5` (no existe) | organización vacía | **Herramienta corregida** |
| 500 en `PATCH /incidents` sin cuerpo, `/auth/me` con token de mantenimiento; 200 en borrados de ids inexistentes | barrido de 350 mutaciones | **Bugs confirmados** — corregidos |
| 5 altas a la vez: 3 furgonetas con la misma matrícula, 5 conductores con el mismo correo, 5 órdenes, 21 cuentas por persona | `smoke_concurrencia.py` | **Bugs confirmados** — índices únicos parciales + cerrojo atómico (gotcha 46) |
| El único de `ai_feedback` nunca existió (WARNING en cada arranque) | 10 parejas repetidas, 0 con `scope` | **Bug confirmado** — redeclarado con la clave del upsert |
| `check-huerfanas` no escaneaba la app Flutter (`flotadsp_app/lib` no existe) | 23 rutas sin contar | **Checker corregido** |

**Descartado con evidencia:** aislamiento multiempresa con ids reales (404 en
todo), duplicados por `upsert` en `geo_rescate` (van por `_id`), 30 literales
de filtro «que no existen» (estados legítimos aún no ocurridos), N+1 (todas
las GET < 1 s a volumen real).

---

## Qué cambió

**Datos de producción:** 265.513 paquetes y 553.997 eventos insertados en
`flotadsp` desde `backups/flotadsp_2026-09-01_0200.jsonl.gz`, marcados con
`restaurado_de`; resumen en `app_meta.respaldo_restauracion_cortex`.
Deshacer: `delete_many({"restaurado_de": "backups/flotadsp_2026-09-01_0200.jsonl.gz"})`
en `cortex_packages` y `cortex_events`.

**Código:** ver los commits `ce7819d`, `9f5270c` y el siguiente. Dos checkers
nuevos (`check_borrado.py`, `check-chunk-error.mjs`), los dos probados
reintroduciendo el fallo. Invariante nuevo en `smoke_endpoints.py`.

---

## Riesgos abiertos (necesitan a Dani)

1. **La clave de Google Geocoding sigue en el historial público** (`2f0bb46`).
   Rotarla en Google Cloud y `fly secrets set GOOGLE_GEOCODING_KEY=...`.
2. **Bases `dsp_*` huérfanas** (25): el usuario de Atlas no puede
   `dropDatabase`. Se limpian desde Atlas o dando el permiso.
3. **`license_plate` sin índice único**: hay fichas `fusionada` con la misma
   matrícula, así que un único simple fallaría. Hoy lo cierra el 409 al crear
   y el invariante `parten_historial == 0` del smoke.
4. **`alerts` (50 docs, última en junio)** no tiene pantalla: el dashboard
   cuenta `unread_alerts` y nadie puede leerlas. Decidir si se retira el
   contador o se engancha `GET /alerts`.
5. **Gemini** sigue con cuota diaria; **WhatsApp** bloqueado por Meta.

---

## Siguiente acción exacta

Cuarta pasada. Lo que las tres primeras no podían ver:

1. **Estados y transiciones** de órdenes de taller e incidencias: provocar
   saltos, retrocesos y transiciones duplicadas por API (`PATCH /work-orders`)
   y comprobar que la furgoneta vuelve a su estado previo al entregar.
2. **Escala**: `/cortex/debrief` y `/inspections` sin paginar; medir con
   1.000× más datos (empresa sintética) antes de tocar nada.
3. **«Mis turnos» en el portal**: `/shifts/mine` ya devuelve el cuadrante y
   el portal lo tiene en PRONTO a propósito. Decisión de producto de Dani.
4. Los 13 correos repetidos entre conductores dados de baja: fusionar fichas
   (`/drivers/fusionar`) para poder quitar el `partial` del índice.

---

## Cómo continuar

```bash
cd C:\Users\Usuario\Downloads\flotadsp_lab
git log --oneline -5
python backend/tests/run_all.py
for f in check-i18n check-routes check-huerfanas check-permisos check-tema \
         check-ayuda check-contraste check-extension check-patrones \
         check-tema-mezclado check-efectos check-chunk-error; do node scripts/$f.mjs; done
for f in check_contracts check_objectid check_tenant check_multiempresa check_borrado; do python scripts/$f.py; done
python backend/scripts/smoke_empresa_nueva.py
fly ssh console -a flotadsp-backend -C "/bin/sh -c 'cd /app && python scripts/smoke_endpoints.py'"
```
