import { test, expect } from '@playwright/test'
import { simularApi, entrarComoAdmin } from './api-simulada.js'

/* BARRIDO DE BOTONES — Bloque C de la auditoría.

   El mapa funcional contó 306 botones repartidos por 47 pantallas. Revisarlos
   a mano una vez sirve de poco: la semana que viene alguien toca un componente
   y se rompe otro. Esto los pulsa TODOS en cada push.

   DOS TRAMPAS QUE HUBO QUE ESQUIVAR (la primera versión caía en ambas):
   1. Buscar los botones en toda la página incluía el MENÚ LATERAL: al pulsarlo
      te ibas a otra pantalla y el resto del barrido probaba la equivocada.
      Por eso se busca solo dentro de <main>.
   2. Tras abrir un modal, los botones de debajo quedan tapados y los clics
      fallan en silencio. Por eso se cierra con Escape y se vuelve a consultar
      el DOM en cada vuelta. */

const PAGINAS = [
  'vehiculos', 'conductores', 'inspecciones', 'revision', 'incidencias',
  'aparcamiento', 'asignacion', 'checklist-operativo', 'plantilla', 'chat',
  'scorecard', 'paquetes', 'talleres', 'contactos', 'importaciones',
  'ia-peritaje', 'configuracion', 'usuarios', 'perfil', 'bandeja',
  'mi-dia', 'metricas', 'actividad', 'vencimientos', 'turnos',
]

/* Textos que NO se pulsan: sacarían del flujo o son irreversibles. */
const NO_PULSAR = /salir|cerrar sesión|logout|eliminar|borrar|delete|desconectar/i

function vigilar(page) {
  const fallos = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/favicon|manifest|net::ERR|Failed to load resource|sw\.js/i.test(t)) return
    fallos.push(`consola: ${t.slice(0, 160)}`)
  })
  page.on('pageerror', (e) => fallos.push(`excepcion: ${String(e.message).slice(0, 160)}`))
  return fallos
}

for (const ruta of PAGINAS) {
  test(`botones de ${ruta}`, async ({ page }) => {
    const fallos = vigilar(page)
    // super-admin: asi tambien se barren las pantallas restringidas
    await entrarComoAdmin(page, { superAdmin: true })
    await simularApi(page, 'lleno')

    const destino = `/panel/${ruta}`
    await page.goto(destino, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    expect(page.url(), `${ruta}: redirigió a login`).not.toContain('/login')

    // Solo el contenido de la pantalla: fuera menú lateral y barra inferior.
    const enMain = () => page.locator('main button:visible:not([disabled])')
    // Hay que ESPERAR a que la pantalla termine de pintar. Contando a los
    // 1.000 ms el resultado bailaba entre ejecuciones (Vehículos daba 2 en una
    // y 0 en la siguiente): se estaba midiendo el esqueleto de carga.
    await enMain().first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(400)
    const total = await enMain().count()
    const tope = Math.min(total, 45)
    let pulsados = 0
    const vistos = new Set()

    for (let vuelta = 0; vuelta < tope; vuelta++) {
      // Se vuelve a consultar el DOM: cada clic puede cambiarlo por completo.
      const botones = enMain()
      const n = await botones.count()
      let elegido = null
      let texto = ''

      for (let i = 0; i < n; i++) {
        const b = botones.nth(i)
        let t = ''
        try {
          if (!(await b.isVisible()) || !(await b.isEnabled())) continue
          t = ((await b.innerText().catch(() => '')) || `#${i}`).trim().slice(0, 40)
        } catch { continue }
        const clave = `${i}:${t}`
        if (vistos.has(clave) || NO_PULSAR.test(t)) continue
        elegido = b; texto = t; vistos.add(clave)
        break
      }
      if (!elegido) break   // no queda ninguno por probar

      try {
        await elegido.click({ timeout: 2000, noWaitAfter: true })
        pulsados++
      } catch { continue }

      await page.waitForTimeout(160)

      // Si el clic navegó a otra pantalla, se vuelve: el barrido es de ESTA.
      if (!page.url().includes(destino)) {
        await page.goto(destino, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(600)
        continue
      }

      const rota = await page.getByText(/Algo ha fallado|Error inesperado/i).count()
      expect(rota, `${ruta}: el botón «${texto}» rompió la pantalla`).toBe(0)

      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(80)
    }

    // Se anota cuántos se han pulsado: un test que dice "0 botones probados"
    // pero pasa en verde es peor que no tenerlo.
    test.info().annotations.push({
      type: 'botones', description: `${ruta}: ${pulsados}/${total}`,
    })
    // Hay pantallas que legítimamente no tienen botones propios (usan enlaces,
    // o solo los muestran con ciertos datos). Lo que no se admite es que
    // habiéndolos, no se pueda pulsar ninguno.
    if (total > 0) {
      expect(pulsados, `${ruta}: no se pudo pulsar ninguno de sus ${total} botones`)
        .toBeGreaterThan(0)
    }
    expect(fallos, `${ruta}: ${fallos.join(' | ')}`).toHaveLength(0)
  })
}
