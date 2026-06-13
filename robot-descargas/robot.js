/**
 * ════════════════════════════════════════════════════════════════
 *  ROBOT DE DESCARGAS FLOTADSP — Cortex → FlotaDSP automático
 * ════════════════════════════════════════════════════════════════
 *  Qué hace: cada X minutos abre Cortex (con TU sesión ya iniciada),
 *  descarga el informe que le digas y lo sube solo a FlotaDSP, que
 *  recalcula el rescate al instante. Tú no tocas nada.
 *
 *  ⚠️ Corre en TU PC de oficina. Debe estar encendido y con la sesión
 *  de Cortex iniciada (la primera vez logueas tú a mano, se recuerda).
 *
 *  Cómo se pone en marcha: ver LEER-PRIMERO.txt
 * ════════════════════════════════════════════════════════════════
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ──────────────── CONFIGURA AQUÍ ────────────────
const CONFIG = {
  // Cada cuántos minutos descargar y subir (ej: 30)
  intervaloMinutos: 30,

  // Centro al que pertenecen los datos
  centro: 'DGA1',                       // OGA5 | DGA1 | DGA2

  // Credenciales de tu FlotaDSP (admin) para poder subir
  flotadsp: {
    api: 'https://flotadsp-backend.fly.dev/api',
    usuario: 'admin',
    password: 'ogsan2024',
  },

  // ── La parte que TÚ tienes que rellenar viendo Cortex ──
  // URL de la página de Cortex donde está el informe que quieres
  cortexUrl: 'PEGA_AQUI_LA_URL_DE_LA_PAGINA_DE_ITINERARIOS_DE_CORTEX',

  // Cómo descarga el informe. Lo más fácil: graba tus clics una vez
  // con  `npx playwright codegen <cortexUrl>`  y pega aquí el texto
  // exacto del botón de descargar (o su selector). Ejemplos:
  //   textoBotonDescarga: 'Descargar'
  //   o un selector CSS:  selectorBotonDescarga: 'button[title="Download"]'
  textoBotonDescarga: 'Descargar',
  selectorBotonDescarga: '',            // si usas selector, ponlo aquí y deja el texto vacío

  // Endpoint de FlotaDSP al que subir (no tocar salvo que sepas):
  //   '/metrics/upload-report'    → Itinerarios/Rutas (panel operativo + rescate)
  //   '/metrics/upload-routeplan' → archivo CYCLE de la mañana (paradas/mapa)
  endpointSubida: '/metrics/upload-report',
};
// ─────────────────────────────────────────────────

const PERFIL = path.join(__dirname, 'perfil-cortex');   // sesión persistente
const DESCARGAS = path.join(__dirname, 'descargas');
if (!fs.existsSync(DESCARGAS)) fs.mkdirSync(DESCARGAS, { recursive: true });

let token = null;

async function loginFlotadsp() {
  const r = await fetch(CONFIG.flotadsp.api + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: CONFIG.flotadsp.usuario, password: CONFIG.flotadsp.password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Login FlotaDSP falló: ' + JSON.stringify(j));
  token = j.access_token;
  log('✅ Conectado a FlotaDSP');
}

async function subirArchivo(rutaArchivo) {
  const buf = fs.readFileSync(rutaArchivo);
  const blob = new Blob([buf]);
  const fd = new FormData();
  fd.append('file', blob, path.basename(rutaArchivo));
  fd.append('center', CONFIG.centro);
  const r = await fetch(CONFIG.flotadsp.api + CONFIG.endpointSubida, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  });
  const j = await r.json();
  if (j.success) log('⬆️  Subido a FlotaDSP: ' + (j.routes ? j.routes + ' rutas' : 'OK'));
  else log('⚠️  FlotaDSP respondió: ' + JSON.stringify(j).slice(0, 200));
}

function log(msg) {
  const t = new Date().toLocaleTimeString('es-ES');
  console.log(`[${t}] ${msg}`);
}

async function unaVuelta(context) {
  const page = await context.newPage();
  try {
    log('Abriendo Cortex…');
    await page.goto(CONFIG.cortexUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // ¿sesión caducada? (heurística: aparece un campo de login)
    if (await page.locator('input[type="password"]').count() > 0) {
      log('⚠️  La sesión de Cortex ha caducado. Inicia sesión en la ventana que se abrió y vuelve a lanzar el robot.');
      await page.waitForTimeout(120000); // dar tiempo a loguear a mano
      return;
    }

    // Disparar la descarga
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      CONFIG.selectorBotonDescarga
        ? page.click(CONFIG.selectorBotonDescarga)
        : page.getByText(CONFIG.textoBotonDescarga, { exact: false }).first().click(),
    ]);

    const destino = path.join(DESCARGAS, download.suggestedFilename());
    await download.saveAs(destino);
    log('📥 Descargado: ' + download.suggestedFilename());

    await subirArchivo(destino);
  } catch (e) {
    log('❌ Error en esta vuelta: ' + e.message);
  } finally {
    await page.close();
  }
}

(async () => {
  if (CONFIG.cortexUrl.includes('PEGA_AQUI')) {
    console.log('\n⛔ Antes de usar el robot, abre robot.js y rellena CONFIG.cortexUrl');
    console.log('   y el botón de descarga. Lee LEER-PRIMERO.txt\n');
    process.exit(1);
  }
  await loginFlotadsp();
  const context = await chromium.launchPersistentContext(PERFIL, {
    headless: false,            // visible: para poder loguear a mano la 1ª vez
    acceptDownloads: true,
  });
  log(`🤖 Robot en marcha. Descargará cada ${CONFIG.intervaloMinutos} min. (Ctrl+C para parar)`);
  log('   Si es la primera vez y Cortex pide login, hazlo en la ventana y déjala abierta.');

  await unaVuelta(context);
  setInterval(() => unaVuelta(context), CONFIG.intervaloMinutos * 60 * 1000);
})();
