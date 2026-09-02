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

**Código:** ver los commits desde `ce7819d`; el registro de escrituras (`audit_requests`, `GET /admin/actividad`) es el último. Dos checkers
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

## Mandato de Dani (02-09-2026, tarde)

Usabilidad y producto, no solo bugs: (1) un flujo DSP↔taller que el taller
quiera usar, (2) la plantilla diaria sin errores de horas, nombres ni
furgonetas, (3) cada sección a su máximo, (4) que Revisión rápida se
autorrevise y corrija sola sin que él entre. Los tres primeros pasos están
hechos y desplegados (ver «Quinta pasada» en `ESTADO.md`). Lo que sigue:

- **Que la IA mejore sola de verdad**: hoy decide con el modelo de
  fiabilidad entrenado con 1.423 veredictos humanos (AUC 0,762). Para subir el
  techo hacen falta señales independientes de la propia IA: órdenes de taller
  cerradas (un daño reparado era real), «marcar un daño que la IA no vio» del
  portal, y el detector de visión (hoy dispara en el 11 % de los recortes
  confirmados). Medir cada una contra los humanos antes de usarla
  (`probar_autovalidacion.py`).
- **Plantilla sin OCR**: la extensión ya captura las rutas y los conductores
  de Cortex; falta la hora de salida (`plannedDepartureTime` está en
  route-details). Con eso la plantilla sale de datos, no de capturas.
- **Taller**: aprobar presupuesto desde el móvil del DSP con un toque y avisar
  al taller; medir cuántos talleres abren el enlace fijo (`visitas`).

## Hecho en la sexta pasada (noche del 02-09)

Registro de escrituras (`audit_requests`), listado de inspecciones proyectado,
`turno_unico`, checklist sin «Todos», teléfonos desde Cortex (52 rellenados)
y el módulo **Apoyo en ruta** entero (`docs/APOYO_EN_RUTA.md`). Todo en
producción y comprobado con datos reales. Detalle en `ESTADO.md`.

## Siguiente acción exacta

Sexta pasada (la cuarta fue recorrer el panel como usuario; la quinta, el
mandato de producto; ver `ESTADO.md`):

1. **Apoyo en ruta, segunda vuelta**: que Dani lo use un día real y medir
   (apoyos creados, minutos hasta la primera «hecha»); dirección orientativa
   para el 83 % de paradas sin ella (`/cortex/geo/inverso`); envío automático
   cuando Meta desbloquee la API. Y cargar el cuadrante de septiembre: sin él
   no hay «backup de hoy» que proponer (hoy 0).
2. **Los 32 conductores que siguen sin teléfono**: 24 no tienen
   `transporter_id` en la ficha (Conductores → propuestas de id) y 8 no salen
   en Cortex. Los 6 teléfonos distintos entre app y Cortex: que la oficina
   diga cuál vale.
3. **Pantallas recorridas sin fallo esta noche**: Chat (8 mensajes desde
   julio, sin uso), Checklist, Bandeja (super-admin), IA Peritaje, Turnos,
   Contactos (0 registros). Queda Debrief a fondo (diseño de Dani).
2. **Portal del conductor como conductor real** en móvil (viewport 375):
   inspección con foto, petición de días, cambio de contraseña.
3. **Escala**: `/inspections` ya va proyectado (`campos=lista`, 801 → 238 KB);
   `/cortex/debrief` medido en 209 KB y 0,7 s para OGA5, se deja. Falta medir
   con una empresa sintética 1.000× antes de paginar nada.
4. **«Mis turnos» en el portal**: `/shifts/mine` ya devuelve el cuadrante y
   el portal lo tiene en PRONTO a propósito. Decisión de producto de Dani.
5. Los 13 correos repetidos entre conductores dados de baja: fusionar fichas
   (`/drivers/fusionar`) para poder quitar el `partial` del índice.
6. `alerts` (50 docs de junio) sin pantalla; el dashboard ya no la usa como
   decisión. Retirar el generador o darle pantalla.

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
