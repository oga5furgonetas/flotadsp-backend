import { useMemo } from 'react'
import { canonPanel, parseSide, zonePosition, sideLabel, vanDims } from './vanGeometry'
// dimsOverride: dimensiones reales del modelo (del VehicleModelResolver).

// ─────────────────────────────────────────────────────────────────────────────
// Modelo de daños del gemelo digital, DIRIGIDO POR EL LEDGER (registro por
// matrícula ya deduplicado). Objetivo: nada de daños repetidos ni de más.
//   · El ledger dice QUÉ daños tiene el vehículo hoy (1 entrada por panel).
//   · Las inspecciones aportan la foto exacta, fecha, conductor e historial.
// Resultado: UN marcador por panel registrado (no uno por inspección), con su
// galería (última foto primero) y su historial temporal.
// Si el vehículo aún no tiene ledger, se cae a agrupar las inspecciones por panel
// (también 1 por panel), así nunca se duplica.
// ─────────────────────────────────────────────────────────────────────────────

const SEV_RANK = { critico: 4, grave: 3, moderado: 2, leve: 1, sin_danos: 0, sin_analisis: 0 }
const sevFromRank = (r) => Object.keys(SEV_RANK).find((k) => SEV_RANK[k] === r) || 'leve'

export function useVehicleDamages(vehicle, inspections, ledger, dimsOverride) {
  return useMemo(() => {
    const dims = (dimsOverride && dimsOverride.L) ? dimsOverride : vanDims(vehicle?.brand, vehicle?.model)
    const insps = (inspections || [])
      .filter((i) => i?.analysis)
      .slice()
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')) // antigua → nueva

    // 1) Ocurrencias agrupadas por PANEL canónico (todas las inspecciones).
    const byPanel = new Map() // panel -> occurrences[]
    for (const insp of insps) {
      const photos = insp.annotated_photos?.length ? insp.annotated_photos : (insp.photos || [])
      const rawPhotos = insp.photos || []
      const dmgs = insp.analysis?.damages || insp.analysis?.new_damages || []
      for (const d of dmgs) {
        if (!d || d.confirmed === false) continue
        const panel = canonPanel(d.part || '')
        if (!panel) continue // no es chapa (suciedad, mecánica…)
        const { side, end } = parseSide(d.location_hint || '', d.description || '')
        const pi = typeof d.photo_index === 'number' && d.photo_index >= 1 ? d.photo_index - 1 : null
        const occ = {
          inspectionId: insp.id,
          date: insp.created_at,
          driver: insp.driver_name || '',
          severity: d.severity || 'sin_analisis',
          description: (d.description || '').replace(/ · \[ya registrado[^\]]*\]/g, '').trim(),
          part: d.part || '',
          locationHint: d.location_hint || '',
          side, end,
          photoUrl: (pi != null && photos[pi]) || photos[0] || null,
          rawPhotoUrl: (pi != null && rawPhotos[pi]) || rawPhotos[0] || null,
          box_2d: Array.isArray(d.box_2d) && d.box_2d.length === 4 ? d.box_2d : null,
          estimatedCost: Number(d.estimated_cost) || 0,
          actualCost: d.actual_cost != null ? Number(d.actual_cost) : null,
          repairStatus: d.repair_status || 'pending',
        }
        if (!byPanel.has(panel)) byPanel.set(panel, [])
        byPanel.get(panel).push(occ)
      }
    }

    // Construye un marcador (1 por panel) combinando ledger + inspecciones.
    function buildMarker(panel, status, ledgerEntry) {
      const occs = (byPanel.get(panel) || []).slice()
        .sort((a, b) => (b.date || '').localeCompare(a.date || '')) // reciente primero
      const latest = occs[0]
      // Lado/extremo: el de la ocurrencia más reciente con dato (evita ambigüedad).
      const withSide = occs.find((o) => o.side || o.end) || latest
      const hint = withSide?.locationHint || ''
      const desc = withSide?.description || ''
      const { pos, normal, label } = zonePosition(panel, hint, desc, dims)

      const occRank = occs.length ? Math.max(...occs.map((o) => SEV_RANK[o.severity] ?? 0)) : 0
      const rank = Math.max(occRank, ledgerEntry?.rank || 0)

      return {
        key: panel,
        panel,
        pos, normal, label,
        sideText: sideLabel(hint, desc),
        severity: sevFromRank(rank),
        severityRank: rank,
        status,
        occurrences: occs,
        count: occs.length,
        firstSeen: ledgerEntry?.first_seen || occs[occs.length - 1]?.date,
        lastSeen: latest?.date || ledgerEntry?.updated_at,
        photoUrl: latest?.photoUrl || null,
        ledgerEntry: ledgerEntry || null,
      }
    }

    const open = ledger?.open || []
    const repaired = ledger?.repaired || []
    let markers

    if (open.length || repaired.length) {
      // LEDGER MANDA: 1 marcador por panel registrado (deduplicado de verdad).
      const seen = new Set()
      markers = []
      for (const e of open) {
        if (seen.has(e.panel)) continue
        seen.add(e.panel)
        markers.push(buildMarker(e.panel, 'open', e))
      }
      for (const e of repaired) {
        if (seen.has(e.panel)) continue
        seen.add(e.panel)
        markers.push(buildMarker(e.panel, 'repaired', e))
      }
    } else {
      // Sin ledger todavía: agrupa por panel (1 por panel, nunca duplicado).
      markers = [...byPanel.keys()].map((panel) => buildMarker(panel, 'open', null))
    }

    // Más graves primero (orden de z-index de pines).
    markers.sort((a, b) => b.severityRank - a.severityRank)

    const timeline = insps.map((i) => ({ id: i.id, date: i.created_at }))
    return { dims, markers, timeline, brand: vehicle?.brand, model: vehicle?.model }
  }, [vehicle, inspections, ledger, dimsOverride])
}
