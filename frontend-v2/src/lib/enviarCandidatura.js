/* ENVIAR LA CANDIDATURA, CON REINTENTOS. Lo más caro que pasa en la web.
   ══════════════════════════════════════════════════════════════════════════
   El 09-09-2026 un candidato mandó a la oficina la captura de «No hemos podido
   enviar tu candidatura». Buscando esa petición en el registro del servidor no
   aparecía NINGUNA suya fallida: solo las dos que sí entraron, más tarde. O
   sea que **su envío no llegó a salir del móvil** — no es que el servidor lo
   rechazara, es que no hubo respuesta. Eso pasa por tres motivos y los tres
   duran un momento: se cae la cobertura al darle a enviar, la subida de la
   foto del CV pasa de los 30 s en 4G, o el backend está reiniciándose por un
   despliegue nuestro (una sola máquina: ~40 s sin servicio).

   En los tres casos volver a darle funciona. Pero nadie vuelve a rellenar un
   formulario que ya le ha fallado: ahí se pierde el candidato. Así que lo
   reintenta la propia página.

   TRES DECISIONES QUE NO SON OBVIAS:

   · SOLO SE REINTENTA LO QUE PUEDE ARREGLARSE SOLO. Sin respuesta (cortes,
     timeouts) o 502/503/504 (servidor levantándose). Un 400 es el servidor
     diciendo que falta algo: reintentarlo da el mismo 400 tres veces y encima
     tarda más en decirlo.

   · UN 409 EN UN REINTENTO ES UN ÉXITO. Significa que el primer envío SÍ había
     entrado y solo se perdió la respuesta. Sin esto, la persona ve un error,
     vuelve a intentarlo y le dice «ya nos llegó tu candidatura» — que suena a
     que algo va mal cuando ya está dentro. El índice único de (oferta,
     teléfono) en el servidor es lo que hace que reintentar sea seguro: por eso
     esto se puede reintentar y una compra no.

   · MÁS TIEMPO PARA SUBIR. 30 s los agota una foto de 4 MB en una nave con una
     raya de cobertura, y el corte se lee como un error del formulario.

   Vive aquí y no dentro de la página para poder ejecutarlo de verdad en
   `scripts/check-envio-candidatura.mjs` con un cliente de mentira: una copia
   de esta lógica en un test dejaría de probar lo que corre (gotcha 40). */

/* CUATRO INTENTOS Y LAS ESPERAS ESCRITAS A MANO, no una fórmula.
   El backend corre en UNA sola máquina (comprobado el 09-09-2026:
   `fly status` da un único machine), así que cada despliegue deja unos
   segundos sin servicio. Con esperas de 1 y 2 segundos no se cruza esa
   ventana; con 2, 5 y 10 sí se cruza casi entera, y son ~17 segundos mirando
   una rueda — que es mucho mejor que perder al candidato.
   La solución de verdad para esa ventana es una segunda máquina; esto es la
   red de abajo, y además cubre lo otro: la cobertura que se cae. */
export const ESPERAS_MS = [2000, 5000, 10000]
export const REINTENTOS = ESPERAS_MS.length + 1
export const TIMEOUT_ENVIO_MS = 60000

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/** ¿Este fallo se arregla volviendo a intentarlo, sin que nadie toque nada? */
export function seArreglaSolo(e) {
  if (!e?.response) return true                     // corte, timeout, DNS…
  return [502, 503, 504].includes(e.response.status) // servidor levantándose
}

/**
 * @param {{post: Function}} http  cliente (axios en la app, uno falso en el test)
 * @param {string} url
 * @param {*} cuerpo
 * @param {{espera?: Function, alReintentar?: Function}} opciones
 *   `espera` se inyecta para no dormir en los tests; `alReintentar(n, total)`
 *   deja avisar en pantalla — diecisiete segundos de rueda sin explicación se
 *   leen como que la página se ha colgado, y ahí se cierra la pestaña.
 */
export async function enviarCandidatura(http, url, cuerpo, opciones = {}) {
  const espera = opciones.espera || dormir
  let ultimo
  for (let intento = 1; intento <= REINTENTOS; intento += 1) {
    try {
      return await http.post(url, cuerpo, { timeout: TIMEOUT_ENVIO_MS })
    } catch (e) {
      ultimo = e
      // Ya estaba dentro: el primer envío llegó y solo se perdió la respuesta.
      if (e?.response?.status === 409 && intento > 1) {
        return { data: { ok: true, repetido: true } }
      }
      if (!seArreglaSolo(e) || intento === REINTENTOS) throw e
      if (opciones.alReintentar) opciones.alReintentar(intento + 1, REINTENTOS)
      await espera(ESPERAS_MS[intento - 1])
    }
  }
  throw ultimo
}
