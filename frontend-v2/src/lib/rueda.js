/* ─────────────────────────────────────────────────────────────────────────────
   RUEDA DE REPUESTO — lectura de la declaración del conductor
   ---------------------------------------------------------------------------
   El portal del conductor guarda la respuesta dentro del JSON de `notes` de la
   auditoría, junto a quién la firmó. Aquí se lee ESE mismo campo, con las
   mismas reglas que aplica el backend en /vehicles/spare-wheel, para que la
   ficha del vehículo y la lista de flota no puedan contar cosas distintas.

   Tres estados y un cuarto que no lo es:
     'si' | 'no' | 'no_se'   → alguien miró (o intentó mirar) y lo dijo
     null                    → NUNCA se preguntó

   `null` no es "no la lleva". Confundirlos convertiría el backlog de auditorías
   viejas —anteriores a que existiera la pregunta— en una flota entera sin rueda.
   ───────────────────────────────────────────────────────────────────────────── */

export const RUEDA_ESTADOS = ['si', 'no', 'no_se']

/** Declaración de UNA auditoría, o null si esa auditoría no la trae. */
export function ruedaDeInspeccion(insp) {
  if (!insp) return null
  let n = null
  try { n = JSON.parse(insp.notes || '') } catch { return null }
  if (!n || typeof n !== 'object') return null
  const estado = n.rueda_repuesto
  // Un valor que no reconocemos se descarta: mejor "sin datos" que un dato
  // inventado por una versión del portal que aún no existe.
  if (!RUEDA_ESTADOS.includes(estado)) return null
  return {
    estado,
    at: insp.created_at || null,
    driver_name: (n.driver_name || insp.driver_name || '').trim(),
    inspection_id: insp.id || null,
    foto: !!n.rueda_repuesto_foto,
  }
}

/** La declaración más reciente de una lista de auditorías (o null si ninguna). */
export function ultimaRueda(inspecciones) {
  // Las auditorías llegan ya ordenadas de más nueva a más vieja, pero no se
  // da por hecho: se ordena por fecha antes de quedarse con la primera.
  const conDato = (inspecciones || [])
    .map(ruedaDeInspeccion)
    .filter(Boolean)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
  return conDato[0] || null
}
