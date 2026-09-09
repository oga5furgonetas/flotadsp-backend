#!/usr/bin/env node
/* EL ENVÍO DE UNA CANDIDATURA SE REINTENTA, Y REINTENTARLO ES SEGURO.
   ══════════════════════════════════════════════════════════════════════════
   Por qué existe este checker, con el caso real delante:

   El 09-09-2026 un candidato mandó a la oficina la captura de «No hemos podido
   enviar tu candidatura». En el registro del servidor no había NINGUNA
   petición suya fallida — solo las dos que sí entraron, más tarde. Su envío no
   llegó a salir del móvil: cobertura, timeout subiendo la foto, o el backend
   reiniciándose por un despliegue nuestro. La página se rendía al primer
   intento y ahí se pierde el candidato, porque nadie vuelve a rellenar un
   formulario que ya le ha fallado.

   Lo que se prueba aquí es la función REAL (`src/lib/enviarCandidatura.js`),
   ejecutada con un cliente de mentira: una copia de la lógica dejaría de
   probar lo que corre en cuanto alguien la toque (gotcha 40). Y lo que se
   vigila son las tres cosas que, si se rompen, no dan ningún error:

     · que un corte se reintente (si no, se pierde el candidato);
     · que un 400 NO se reintente (el servidor ya ha dicho qué falta: repetirlo
       tres veces solo tarda más en decir lo mismo);
     · que un 409 en un reintento cuente como éxito. Es el caso que hace que
       reintentar sea seguro: el primer envío entró y solo se perdió la
       respuesta. Sin esto, la persona ve «ya nos llegó tu candidatura» como si
       fuera un error, cuando ya está dentro.

   Probado reintroduciendo los fallos: quitando el reintento, quitando la
   guarda del 400 y quitando el caso del 409 falla uno por cada uno.
*/
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const RUTA = resolve('frontend-v2/src/lib/enviarCandidatura.js')
const { enviarCandidatura, seArreglaSolo, REINTENTOS, TIMEOUT_ENVIO_MS } =
  await import(pathToFileURL(RUTA).href)

const fallos = []
const ok = (cond, msg) => { if (!cond) fallos.push(msg) }
const sinDormir = async () => {}

const corte = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
const conEstado = (status, detail) => Object.assign(new Error('req failed'), {
  response: { status, data: detail ? { detail } : {} },
})

/* ── 1. Un corte se reintenta y acaba entrando ─────────────────────────── */
{
  let n = 0
  const http = { post: async () => { n += 1; if (n < 3) throw corte(); return { data: { ok: true } } } }
  // El try no es adorno: sin reintentos esto revienta, y un checker que casca
  // con la pila de Node en vez de decir qué falta no se lee.
  let r = null
  try { r = await enviarCandidatura(http, '/x', {}, { espera: sinDormir }) } catch { /* lo dice el ok */ }
  ok(n === 3, `un corte tiene que reintentarse: solo se intentó ${n} vez/veces`)
  ok(r?.data?.ok === true, 'tras reintentar con éxito hay que devolver la respuesta buena')
}

/* ── 2. Un 503 (backend levantándose tras un despliegue) también ───────── */
{
  let n = 0
  const http = { post: async () => { n += 1; if (n < 2) throw conEstado(503); return { data: { ok: true } } } }
  try { await enviarCandidatura(http, '/x', {}, { espera: sinDormir }) } catch { /* lo dice el ok */ }
  ok(n === 2, 'un 503 se reintenta: es el servidor arrancando, no un rechazo')
}

/* ── 3. Un 400 NO se reintenta ─────────────────────────────────────────── */
{
  let n = 0
  const http = { post: async () => { n += 1; throw conEstado(400, 'Escribe tu nombre y apellidos') } }
  let detalle = ''
  try { await enviarCandidatura(http, '/x', {}, { espera: sinDormir }) } catch (e) {
    detalle = e?.response?.data?.detail || ''
  }
  ok(n === 1, `un 400 no se reintenta: se intentó ${n} veces`)
  ok(detalle === 'Escribe tu nombre y apellidos',
    'el motivo del servidor tiene que llegar tal cual a la pantalla')
}

/* ── 4. Un 409 en un REINTENTO es un éxito (ya había entrado) ──────────── */
{
  let n = 0
  const http = { post: async () => { n += 1; if (n === 1) throw corte(); throw conEstado(409) } }
  let r = null
  try { r = await enviarCandidatura(http, '/x', {}, { espera: sinDormir }) } catch { /* lo dice el ok */ }
  ok(r?.data?.ok === true, 'un 409 tras un corte significa que la candidatura YA entró')
  ok(r?.data?.repetido === true, 'y se marca, para no confundirlo con un alta nueva')
}

/* ── 5. Un 409 al PRIMER intento sí es un rechazo (ya se había apuntado) ─ */
{
  const http = { post: async () => { throw conEstado(409, 'Ya nos llego tu candidatura') } }
  let hubo = false
  try { await enviarCandidatura(http, '/x', {}, { espera: sinDormir }) } catch { hubo = true }
  ok(hubo, 'un 409 al primer intento lo decide la página, no esta función')
}

/* ── 6. Se rinde, pero solo después de intentarlo de verdad ────────────── */
{
  let n = 0
  const http = { post: async () => { n += 1; throw corte() } }
  try { await enviarCandidatura(http, '/x', {}, { espera: sinDormir }) } catch { /* esperado */ }
  ok(n === REINTENTOS, `tiene que intentarlo ${REINTENTOS} veces; lo hizo ${n}`)
}

/* ── 7. El timeout del envío es mayor que el del cliente ───────────────── */
{
  let visto = null
  const http = { post: async (_u, _c, cfg) => { visto = cfg; return { data: {} } } }
  await enviarCandidatura(http, '/x', {}, { espera: sinDormir })
  ok(visto?.timeout === TIMEOUT_ENVIO_MS && TIMEOUT_ENVIO_MS >= 60000,
    'subir una foto en 4G no cabe en 30 s: el envío necesita su propio timeout')
}

/* ── 8. La página usa esta función y no `http.post` a pelo ─────────────── */
{
  const { readFileSync } = await import('node:fs')
  const src = readFileSync('frontend-v2/src/pages/Empleo.jsx', 'utf8')
  ok(src.includes('enviarCandidatura(http,'),
    'Empleo.jsx tiene que enviar por aquí, o los reintentos no existen')
  ok(!/await http\.post\(`\/empleo\/publica/.test(src),
    'quedó un envío directo sin reintentos en Empleo.jsx')
  ok(seArreglaSolo(corte()) && !seArreglaSolo(conEstado(400)),
    'la regla de qué se reintenta está del revés')
}

if (fallos.length) {
  console.error(`\n[check-envio-candidatura] ${fallos.length} problema(s):`)
  for (const f of fallos) console.error('  - ' + f)
  process.exit(1)
}
console.log('[check-envio-candidatura] ok — el envío se reintenta y reintentarlo es seguro')
