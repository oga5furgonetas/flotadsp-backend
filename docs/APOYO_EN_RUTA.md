# Apoyo en ruta

> Un conductor va tarde y otro le quita paradas. Antes: una llamada, una foto
> del mapa de Cortex por WhatsApp y nadie sabía después quién había quitado
> qué. Ahora queda registrado, se puede cambiar, y cada uno recibe por
> WhatsApp un enlace con el mapa y la lista de SUS paradas.
>
> Escrito: 2026-09-02. Pedido por Dani ese mismo día.

## Qué hace

1. **Situación** (`GET /api/apoyo/situacion?center&day`): quién tiene paquetes
   sin entregar ahora mismo (de `cortex_packages`, agrupado por conductor y
   parada), ordenado por pendientes, y quién puede ir a ayudar (fichas activas
   del centro con teléfono; los que tienen código de familia «apoyo» en el
   cuadrante de hoy —BKP— salen primero).
2. **Paradas** (`GET /api/apoyo/paradas?driver_id&day`): las paradas pendientes
   de ese conductor con coordenadas, dirección (si Cortex la trajo), cuántos
   paquetes y qué TBAs, ordenadas por número de parada.
3. **Crear** (`POST /api/apoyo`): quién ayuda a quién y con qué paradas. Se
   vuelve a mirar Cortex en ese instante: lo que ya se entregó se devuelve en
   `ya_entregadas` y NO se manda. Devuelve la URL pública y los dos enlaces
   `wa.me` con el texto ya escrito (`wa_ayudante`, `wa_conductor`).
4. **Cambiar** (`PATCH /api/apoyo/{id}`): paradas, ayudante, nota o fase
   (`hecho` / `anulado`). Cada cambio va al `historial`. El enlace ya enviado
   enseña la versión nueva sin mandar nada más.
5. **Dónde está la persona a la que se ayuda** (`de.posicion`): el ÚLTIMO
   ESCANEO SUYO HECHO EN LA CALLE —una entrega o un intento—, con la hora del
   propio Cortex. No es un GPS y no se enseña como tal: viaja siempre con
   `hace_min`, y por encima de 120 minutos no se devuelve nada, porque al lado
   hay un botón de «ir hacia él». Los estados válidos salen de las listas
   canónicas (`_CX_OK` + `_CX_REINTENTABLE`): un escaneo de carga ocurre en la
   nave y pondría a todo el mundo allí. Probado reintroduciendo el fallo.
   Medido en producción: `{hace_min: 46, stop_id: 16, que: "entrega"}`.
6. **La página del ayudante** (`/apoyo/t/<token>`, `GET /api/apoyo/t/{token}`):
   mapa con las paradas numeradas, «Ir» a cada una (Google Maps con
   coordenadas: funciona aunque no haya dirección), «Ruta en Maps» con hasta
   10 paradas, «Hecha» para ir tachando
   (`POST /api/apoyo/t/{token}/parada/{stop_id}`), y lo que Cortex ya da por
   entregado aparece tachado solo. Se recarga cada minuto. Válido 3 días.
   Arriba, la ficha de dónde estaba el otro y un botón para ir hacia él.

## Por qué está montado así

**Multiempresa desde el primer día** (Dani: «debe ser escalable a otras
empresas, otras DSP con otros Cortex»):

- Las paradas salen de `cortex_packages` **de la empresa**: cada extensión
  ingesta en su BD (`_cortex_ingest_org`).
- Nombres y teléfonos salen de `drivers` de la empresa (por `transporter_id`,
  nunca por nombre: gotcha 15) y, si la ficha no tiene, de
  `cortex_resumen.gente`, que es lo que publica el propio Cortex.
- El registro va en `apoyos` de la BD de la empresa.
- El enlace público vive en `flotadsp_global.taller_enlaces` con
  `tipo: "apoyo"` y `db_name`, y `_apoyo_por_token` fija la empresa antes de
  tocar `db` (gotcha 26; `scripts/check_tenant.py` lo conoce). Esa colección
  es el registro de enlaces públicos de la plataforma, no solo de talleres.
- Ningún centro, prefijo ni número escrito a mano: el centro sale del paquete,
  el prefijo de WhatsApp de `WHATSAPP_PREFIJO_PAIS`.

**Cero falsos positivos**, porque aquí un falso positivo es un viaje en balde:

- «Pendiente» = `_cx_ruta_cajon(state)` en `("loaded", "attempted")`: en la
  furgoneta, siguiente, o intentada. NUNCA por listas escritas a mano
  (gotchas 28 y 40). Lo que va de vuelta a la nave (`BACK_TO_ORIGIN`) o no se
  recogió no es pendiente. `backend/tests/test_apoyo.py`.
- **La coordenada del paquete NO es su destino.** `lat/lng` en
  `cortex_packages` es el `executionGeocode` de route-details: dónde se
  escaneó por última vez. Para un paquete en furgoneta es LA NAVE (medido:
  191 de 200 `PICKED_UP` en la coordenada de OGA5). La primera versión lo
  pintaba en el mapa y habría mandado al ayudante a la nave. Ahora una parada
  solo tiene ubicación si (a) la extensión mandó `dest_lat/dest_lng` (geocode
  de la dirección, extensión 2.22+, campo `ubicacion: "cortex"`), (b) el
  escaneo fue en el destino (intento de entrega, `"intento"`) o (c) hay
  dirección en texto (`"direccion"`). Lo demás se lista con número de parada
  y TBA y dice «Cortex no da la ubicación». `sin_ubicacion` en cada respuesta,
  `con_destino` por conductor en la situación.
- Cada respuesta lleva `bajado_hace_min` (de `seen_at`, gotcha 29) y la
  pantalla lo enseña en ámbar pasados 10 min. Medido el 02-09-2026: 1,5 min.
- Un apoyo abierto por pareja y día, dicho por la base (`apoyo_pareja_abierta`,
  único parcial sobre `fase: "enviado"`): cinco «Crear apoyo» a la vez dejan
  uno (medido: 1×200, 4×409). Crear otro devuelve 409 y manda a cambiar el
  que hay. El enlace público se registra DESPUÉS del apoyo: sin huérfanos.
- Sin teléfono del ayudante no se crea (400 con el nombre): no habría a quién
  mandarle el mapa. Por eso `_telefonos_desde_cortex` rellena los que faltan.

**Lo que ve el enlace público** (`_apoyo_publico`, lista blanca): nombre y
teléfono de los DOS implicados —tienen que poder llamarse—, las paradas con
coordenadas, dirección, nº de paquetes y TBAs, la nota y la fase. Ni ids
internos, ni otros conductores, ni nada de la empresa.

## Datos medidos el 02-09-2026 (OGA5+DGA1+DGA2)

| | |
|---|---|
| Paquetes del día | 7.053 |
| Sin entregar a las 20:00 | 587 en 433 paradas de 38 conductores |
| Con coordenadas | 580 (99 %) |
| Con dirección en Cortex | 99 (17 %) → por eso «Ir» usa coordenadas |
| Frescura (`seen_at`) | 1,5 min |

## Lo que falta (en orden)

0. **Que las paradas en furgoneta tengan destino (extensión 2.22).** El único
   sitio de Cortex con dirección y geocode del destino es el informe
   `packagesByStatus`, y la extensión solo lo pedía para `REATTEMPTABLE`.
   Desde 2.22 APRENDE los estados: en cuanto alguien abre en Cortex
   «Packages by status» con otro estado (el de los paquetes en furgoneta),
   ese estado se refresca solo en cada barrido y llegan `dest_lat/dest_lng`.
   Pasos: descargar la extensión nueva desde Paquetes IA, recargarla en
   `chrome://extensions`, abrir una vez «Packages by status» y elegir el
   estado de «en furgoneta». Comprobar después con
   `db.cortex_packages.count_documents({"dest_lat": {"$ne": None}})`.
1. **Envío automático por la API de Meta** cuando lleguen las credenciales:
   hoy `wa.me` abre WhatsApp con el texto escrito y la oficina pulsa enviar.
   El módulo de WhatsApp (`/whatsapp/*`) ya existe; enganchar `_apoyo_textos`.
2. **Dirección para el 83 % sin ella**: `/cortex/geo/inverso` ya sabe poner
   calle sin número (gotcha 18). Enseñarla en la página del ayudante como
   orientación, nunca como destino.
3. **Orden óptimo de las paradas quitadas** desde donde está el ayudante
   (hoy: orden de la ruta original, que suele ser el bueno).
4. Medir el uso: apoyos por semana, minutos entre crear y primera «hecha».
