/**
 * ════════════════════════════════════════════════════════════════
 *  VIGILANTE DE CARPETA FLOTADSP — sube solo lo que descargas
 * ════════════════════════════════════════════════════════════════
 *  Qué hace: vigila tu carpeta de Descargas. Cada vez que descargas
 *  un informe de Cortex (Itinerarios / Rutas / CYCLE), lo detecta y
 *  lo sube SOLO a FlotaDSP. Tú no entras en FlotaDSP a subir nada.
 *
 *  ✅ CERO riesgo con Amazon: el vigilante NO toca Cortex. Tú
 *     descargas como siempre, con tu clic de siempre. Él solo mira
 *     la carpeta y sube el archivo nuevo.
 *
 *  Cómo se pone en marcha: ver LEER-PRIMERO.txt (sección Vigilante)
 * ════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ──────────────── CONFIGURA AQUÍ ────────────────
const CONFIG = {
  // Carpeta que se vigila. Por defecto, la de Descargas del usuario.
  carpeta: path.join(os.homedir(), 'Downloads'),

  // Centro al que pertenecen los datos
  centro: 'DGA1',                       // OGA5 | DGA1 | DGA2

  // Credenciales de tu FlotaDSP (admin) para poder subir
  flotadsp: {
    api: 'https://flotadsp-backend.fly.dev/api',
    usuario: 'admin',
    password: 'ogsan2024',
  },
};
// ─────────────────────────────────────────────────

const YA_SUBIDOS = path.join(__dirname, '.ya-subidos.json');
let subidos = {};
try { subidos = JSON.parse(fs.readFileSync(YA_SUBIDOS, 'utf8')); } catch { subidos = {}; }
const guardarSubidos = () => fs.writeFileSync(YA_SUBIDOS, JSON.stringify(subidos));

let token = null;

function log(msg) {
  const t = new Date().toLocaleTimeString('es-ES');
  console.log(`[${t}] ${msg}`);
}

// ── ¿Es un archivo que nos interesa? ──
// Itinerarios / Rutas / DAs → panel operativo (upload-report)
// CYCLE → plan de paradas/mapa (upload-routeplan)
function clasificar(nombre) {
  const n = nombre.toLowerCase();
  const esExcel = n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv');
  if (!esExcel) return null;
  if (n.includes('cycle')) return '/metrics/upload-routeplan';
  if (n.includes('itinerar') || n.includes('ruta') || n.includes('das') || n.includes('da_')) return '/metrics/upload-report';
  // Cualquier otro excel reciente: lo tratamos como informe operativo
  return '/metrics/upload-report';
}

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

// Espera a que el archivo termine de descargarse (tamaño estable)
async function esperarEstable(ruta) {
  let prev = -1;
  for (let i = 0; i < 30; i++) {
    let size;
    try { size = fs.statSync(ruta).size; } catch { return false; }
    if (size > 0 && size === prev) return true;
    prev = size;
    await new Promise(r => setTimeout(r, 1000));
  }
  return true;
}

async function subir(ruta, endpoint) {
  const nombre = path.basename(ruta);
  if (!(await esperarEstable(ruta))) return;
  try {
    const buf = fs.readFileSync(ruta);
    const fd = new FormData();
    fd.append('file', new Blob([buf]), nombre);
    fd.append('center', CONFIG.centro);
    const r = await fetch(CONFIG.flotadsp.api + endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: fd,
    });
    const j = await r.json();
    if (j.success) {
      log(`⬆️  Subido "${nombre}" → ${j.routes ? j.routes + ' rutas' : 'OK'}`);
      subidos[nombre] = fs.statSync(ruta).size;
      guardarSubidos();
    } else {
      log(`⚠️  FlotaDSP rechazó "${nombre}": ` + JSON.stringify(j).slice(0, 160));
    }
  } catch (e) {
    log(`❌ Error subiendo "${nombre}": ` + e.message);
  }
}

async function revisar(nombre) {
  const ruta = path.join(CONFIG.carpeta, nombre);
  let st;
  try { st = fs.statSync(ruta); } catch { return; }
  if (!st.isFile()) return;
  const endpoint = clasificar(nombre);
  if (!endpoint) return;
  // ya subido con el mismo tamaño → ignorar
  if (subidos[nombre] === st.size) return;
  log(`📄 Detectado: ${nombre}`);
  await subir(ruta, endpoint);
}

(async () => {
  if (!fs.existsSync(CONFIG.carpeta)) {
    console.log('\n⛔ La carpeta a vigilar no existe:\n   ' + CONFIG.carpeta);
    console.log('   Abre vigilante.js y corrige CONFIG.carpeta\n');
    process.exit(1);
  }
  await loginFlotadsp();
  log(`👀 Vigilando: ${CONFIG.carpeta}`);
  log('   Descarga tus informes de Cortex como siempre. Se subirán solos.');
  log('   (Ctrl+C para parar)');

  // Procesa lo que ya esté en la carpeta del día de hoy (por si descargaste antes de arrancar)
  try {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    for (const f of fs.readdirSync(CONFIG.carpeta)) {
      try {
        const st = fs.statSync(path.join(CONFIG.carpeta, f));
        if (st.mtime >= hoy) await revisar(f);
      } catch {}
    }
  } catch {}

  // Vigilancia en vivo
  fs.watch(CONFIG.carpeta, (evt, nombre) => {
    if (!nombre) return;
    // pequeño respiro para que el navegador termine de escribir
    setTimeout(() => revisar(nombre), 1500);
  });
})();
