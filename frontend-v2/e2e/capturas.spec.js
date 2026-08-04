import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { simularApi, entrarComoAdmin } from './api-simulada.js'

/* ────────────────────────────────────────────────────────────────────────────
   Generador de capturas REALES del panel para la landing.

   Por qué existe: la landing contaba mucho y enseñaba poco. Explicaba la IA en
   tres pasos y no había ni una imagen del producto. Cartrack —el competidor
   grande del sector— pone un vídeo del producto en el primer scroll, y por eso
   su página parece de una empresa y la nuestra parecía un folleto.

   Estas capturas NO son maquetas dibujadas a mano en CSS: es la aplicación de
   verdad, renderizada por el navegador, con la API simulada del escenario
   "lleno" que ya usan las pruebas de humo. Si mañana cambia una pantalla, se
   vuelve a lanzar esto y las capturas se actualizan solas — no se quedan
   obsoletas como se quedan las imágenes hechas a mano.

   Uso:  npx playwright test capturas --project=escritorio --update-snapshots
   Salida: public/capturas/*.png  (se versionan; son parte de la web)
   ──────────────────────────────────────────────────────────────────────────── */

const DESTINO = path.join(process.cwd(), 'public', 'capturas')

const PANTALLAS = [
  { ruta: 'scorecard', archivo: 'scorecard.png', espera: 'Calidad de entrega en vivo' },
  { ruta: '', archivo: 'dashboard.png' },
  { ruta: 'vehiculos', archivo: 'flota.png' },
  { ruta: 'revision', archivo: 'revision-ia.png' },
  { ruta: 'paquetes', archivo: 'paquetes.png' },
]

test.describe('capturas para la landing', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'solo chromium')

  test('generar', async ({ page }) => {
    test.setTimeout(180_000)
    fs.mkdirSync(DESTINO, { recursive: true })

    await simularApi(page, 'lleno')
    await entrarComoAdmin(page)
    // Ancho de portátil: es como lo va a ver quien decide la compra, y encaja
    // en la maqueta de navegador de la landing sin recortar nada importante.
    await page.setViewportSize({ width: 1440, height: 900 })

    for (const p of PANTALLAS) {
      await page.goto(`/panel/${p.ruta}`, { waitUntil: 'domcontentloaded' })
      // Dar tiempo a que entren los datos simulados y acaben las animaciones
      // de entrada: una captura a medio animar se ve rota, no dinámica.
      await page.waitForTimeout(2500)
      // Fuera el aviso de cookies. La clave es 'cookie_consent' (no 'cookies_ok',
      // que es lo que puse la primera vez y por eso el banner salia en la captura).
      await page.evaluate(() => {
        try { localStorage.setItem('cookie_consent', JSON.stringify({ v: 1, at: new Date().toISOString() })) } catch { /* vacio */ }
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
      await page.screenshot({ path: path.join(DESTINO, p.archivo), animations: 'disabled' })
      console.log('capturada:', p.archivo)
    }
  })
})
