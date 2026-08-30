# Arquitectura

> Lo **funcional** (qué hace cada pantalla) está en `MAPA_FUNCIONAL.md`. Esto es
> lo **técnico**: cómo está montado, qué decisiones lo sostienen y dónde están
> las costuras que hay que vigilar.

---

## Las piezas

```
Chrome (extensión MV3)  ─┐
                         ├─→  FastAPI (Fly.io)  ──→  MongoDB Atlas M0
React 18 + Vite ─────────┘         │                 (multi-tenant)
(Cloudflare Pages)                 ├──→  Cloudflare R2   (fotos, documentos)
                                   ├──→  Gemini          (análisis de daños)
                                   ├──→  flotadsp-ai     (YOLO11 + SAM2)
                                   └──→  Telegram        (avisos)
```

- **`backend/server.py`** — un monolito de ~31.000 líneas. Es mucho, pero
  funciona y se navega con `grep`. Partirlo hoy sería mover riesgo sin resolver
  ninguno de los problemas reales de la lista.
- **`frontend-v2/`** — el frontend activo. `frontend/` es el viejo y no se toca.
- **`cortex-extension/`** — la única forma de sacar datos de Amazon.

---

## Multi-tenant: la costura más peligrosa

Cada organización tiene su base (`dsp_<org_id>`), **salvo la original de Dani,
que se llama `flotadsp`**. Un script que recorra solo `dsp_*` se salta todos sus
datos y da un falso negativo silencioso.

`db` es un `_TenantDBProxy` que resuelve por contextvar, y **la contextvar tiene
valor por defecto**. Consecuencia: todo endpoint sin sesión —el portal del
taller es el primero— cae en la base principal pase lo que pase. Hoy acierta por
casualidad porque la de Dani **es** la principal.

**La regla:** lo que identifica a quien llama vive en `global_db` y lleva dentro
su `db_name`; el endpoint hace `set_current_org_db(...)` a mano antes de tocar
`db`. Nunca confiar en el valor por defecto.

**Deuda conocida:** los crons (`_bucle_aviso`) corren sin contexto de
organización y caen en la base por defecto. Todos, no solo los nuevos. Con un
segundo cliente, todos fallarían igual.

---

## Escrituras que se escapan

Un dato con **más de un camino de escritura** acaba inconsistente. Los conocidos:

| Dato | Caminos | Riesgo |
|---|---|---|
| Kilometraje | `_odo_registrar` (valida) y el atajo de admin (solo tope absoluto) | El atajo es deliberado —para arreglar históricos corruptos— pero es por donde entró la basura |
| Estado del vehículo | `crear_orden`, `editar_orden`, edición manual | Las 13 en `taller` sin orden entraron por el tercero |
| Lecturas del histórico | 4 lectores que **no** respetaban `descartada` | Ya unificados en `_odo_lecturas` |

**La regla que sale de aquí (gotcha 20):** si cambias lo que guarda una
estructura, busca **todos** los que la leen. `grep` del campo, y mirar uno por
uno.

---

## Orden de las rutas

FastAPI resuelve por **orden de declaración**. Una ruta estática declarada
después de una con parámetro es inalcanzable: `/vehicles/duplicados` entraría
como si `duplicados` fuera un id.

Todas las estáticas de `/vehicles/*` y `/work-orders/*` van **antes** que sus
`{id}`. `scripts/check-routes.mjs` detecta duplicados, pero **no** este orden:
eso hay que mirarlo al añadir.

---

## Red de seguridad

| | Qué vigila |
|---|---|
| 9 checkers en CI | i18n, rutas, huérfanas, permisos, tema, ayuda, contraste, extensión, contratos |
| `smoke_endpoints.py` | 17 endpoints en producción, comprobando que **el dato cuadra**, no solo que responda 200 |
| `run_all.py` | Todos los tests, aguantando las dos formas que conviven |
| Tags de git | Puntos de vuelta antes de cada tanda grande |

**Por qué el smoke comprueba el dato.** Un endpoint que devuelve una lista vacía
responde 200 igual de bien que uno que funciona. Ya cazó un 500 real una hora
después de meterlo.

---

## Frontend

- Rutas **lazy** en `main.jsx`: no añadir imports eager de páginas.
- Los colores salen de variables CSS (`--dk-*`), así que el tema se cambia en un
  sitio y cae sobre las 27 pantallas.
- **Tres temas**: noche, día e híbrido. Cualquier color nuevo tiene que pasar
  `check-contraste.mjs` en los tres.
- Una pantalla nueva necesita **cinco** registros o es invisible: ruta, menú,
  casilla de permiso, ficha de ayuda e i18n (gotcha 27).

---

## Assets: el fallo que ha vuelto tres veces

Un asset que no existe devuelve `index.html` con **HTTP 200**, no un 404. En la
ventana entre desplegar y que se propaguen los chunks, un navegador puede
guardar ese HTML bajo una URL `.js` durante 4 horas y tumbar la app entera.

Cuatro defensas, cada una por un caso distinto que pasó de verdad:
`repairAssetCache()`, el centinela de CSS, el de `<link>` del index, y
`public/arranque.js` —un script clásico y externo que actúa cuando el propio
bundle es el envenenado y ninguna de las otras tres puede ejecutarse.
