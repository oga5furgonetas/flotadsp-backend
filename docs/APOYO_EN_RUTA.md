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
5. **La página del ayudante** (`/apoyo/t/<token>`, `GET /api/apoyo/t/{token}`):
   mapa con las paradas numeradas, «Ir» a cada una (Google Maps con
   coordenadas: funciona aunque no haya dirección), «Ruta en Maps» con hasta
   10 paradas, «Hecha» para ir tachando
   (`POST /api/apoyo/t/{token}/parada/{stop_id}`), y lo que Cortex ya da por
   entregado aparece tachado solo. Se recarga cada minuto. Válido 3 días.

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
- Cada respuesta lleva `bajado_hace_min` (de `seen_at`, gotcha 29) y la
  pantalla lo enseña en ámbar pasados 10 min. Medido el 02-09-2026: 1,5 min.
- Un apoyo abierto por pareja y día; crear otro devuelve 409 y manda a cambiar
  el que hay.
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

1. **Envío automático por la API de Meta** cuando lleguen las credenciales:
   hoy `wa.me` abre WhatsApp con el texto escrito y la oficina pulsa enviar.
   El módulo de WhatsApp (`/whatsapp/*`) ya existe; enganchar `_apoyo_textos`.
2. **Dirección para el 83 % sin ella**: `/cortex/geo/inverso` ya sabe poner
   calle sin número (gotcha 18). Enseñarla en la página del ayudante como
   orientación, nunca como destino.
3. **Orden óptimo de las paradas quitadas** desde donde está el ayudante
   (hoy: orden de la ruta original, que suele ser el bueno).
4. Medir el uso: apoyos por semana, minutos entre crear y primera «hecha».
