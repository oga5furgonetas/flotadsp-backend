/* ── LOS CANDIDATOS DE LA ETT, SIN COPIAR Y PEGAR ────────────────────────────
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ ES ESTO
 *
 * Las ETT cuelgan a sus candidatos en la plataforma de la empresa
 * (`winiw.es/winiw/centro_candidatos.php`). De ahí salen los 26 que hoy están
 * en Incorporaciones, y hasta ahora entraban copiando la pantalla entera y
 * pegándola a mano. Todos los días, para ver si hay alguien nuevo.
 *
 * NO LLEVA NINGÚN LECTOR NUEVO, Y ES LO MEJOR QUE TIENE.
 *
 * Manda `document.body.innerText`: exactamente el mismo texto que se pegaba.
 * Eso lo lee `_onb_parsear` en el backend, que está escrito contra el listado
 * REAL y probado con las 26 fichas de verdad —nombre, teléfono, DNI, IDPER,
 * ETT, nave y los documentos que faltan—. Escribir aquí un lector del DOM
 * sería inventarme una estructura que no he visto, que es exactamente el fallo
 * que costó veinte versiones con las direcciones de Cortex.
 *
 * Y LAS CONTRASEÑAS NO SE GUARDAN. El listado trae la del correo y la del
 * Rabbit de cada persona; el lector del backend no las toca, y hay un caso que
 * lo comprueba. Aquí se manda el texto tal cual porque el filtro está donde
 * tiene que estar: en quien decide qué se guarda.
 *
 * DÓNDE CORRE, Y SOLO AHÍ. El manifiesto lo inyecta únicamente en
 * `centro_candidatos.php`. Ni en el resto de la plataforma ni en ningún otro
 * sitio: la extensión no tiene por qué poder leer nada más.
 */
if (!window.__flotadspWiniw) {
  window.__flotadspWiniw = true;

  /* Marcas de que estamos DE VERDAD en el listado y ya ha cargado. Las dos
     salen del texto que se pegaba, así que si la página cambia y dejan de
     aparecer, esto deja de mandar en vez de mandar otra cosa. */
  const MARCA_TITULO = /Contacto con Candidatos/i;
  const MARCA_FICHAS = /Datos de incorporaci[oó]n/i;
  const MIN_LARGO = 400;
  const CADA_MS = 20000;

  let ultima = '';

  /* Huella barata para no mandar dos veces lo mismo: la página se refresca sola
     y sin esto iría una copia cada veinte segundos. */
  const huella = (t) => `${t.length}:${t.slice(0, 160)}:${t.slice(-160)}`;

  const mirar = () => {
    let texto = '';
    try { texto = document.body ? document.body.innerText : ''; } catch (_) { return; }
    if (!texto || texto.length < MIN_LARGO) return;
    if (!MARCA_TITULO.test(texto) || !MARCA_FICHAS.test(texto)) return;
    const h = huella(texto);
    if (h === ultima) return;
    ultima = h;
    try {
      chrome.runtime.sendMessage(
        { type: 'candidatosWiniw', texto: texto.slice(0, 2000000) },
        (r) => {
          if (chrome.runtime.lastError) { ultima = ''; return; }   // worker dormido: se reintenta
          if (r && r.ok) {
            console.log(`%c[FlotaDSP] candidatos: ${r.nuevas} nuevos, ${r.actualizadas} al día`,
                        'color:#34d399;font-weight:bold');
          } else if (r) {
            console.log('%c[FlotaDSP] candidatos: ' + (r.motivo || ''), 'color:#f59e0b');
          }
        });
    } catch (_) { ultima = ''; }
  };

  // Al cargar y cada veinte segundos: la tabla se rellena después del HTML y
  // cambia al filtrar por semana o por centro sin recargar la página.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mirar, { once: true });
  } else { mirar(); }
  setInterval(mirar, CADA_MS);
}
