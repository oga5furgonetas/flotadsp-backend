/* Teléfono para ENSEÑAR: «+34672102802», «0034 672102802» y «672102802» son el
   mismo móvil y en una lista no pueden verse de tres formas. Solo se agrupan los
   españoles de 9 cifras («672 102 802»); cualquier otro se deja como está. El
   dato guardado no se toca: con él se arma el enlace de WhatsApp (gotcha 47). */
export function verTelefono(t) {
  const s = String(t ?? '').trim()
  const d = s.replace(/[\s.-]/g, '').replace(/^(\+34|0034)/, '')
  return /^[6-9]\d{8}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : s
}
