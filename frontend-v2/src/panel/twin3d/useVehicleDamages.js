import { useMemo } from 'react'
import { canonPanel, parseSide, zonePosition, sideLabel, vanDims } from './vanGeometry'
// dimsOverride: dimensiones reales del modelo (del VehicleModelResolver).

// ─────────────────────────────────────────────────────────────────────────────
// Construye el modelo de daños del gemelo digital a partir de datos REALES:
//   · inspecciones (analysis.damages) → fotos exactas, fecha, conductor, severidad
//   · ledger del vehículo             → qué está abierto / reparado hoy
//
// Agrupa por zona física (panel canónico + lado + extremo): cada grupo es UN
// marcador en el 3D, con su galería de fotos (más reciente primero) y su
// historial temporal (cuándo apareció, en qué inspección).
// ─────────────────────────────────────────────────────────────────────────────

const SEV_RANK = { critico: 4, grave: 3, moderado: 2, leve: 1, sin_danos: 0, sin_analisis: 0 }

function zoneKey(panel, side, end) {
  return `${panel}|${side || '-'}|${end || '-'}`
}

export function useVehicleDamages(vehicle, inspections, ledger, dimsOverride) {
  return useMemo(() => {
    const dims = (dimsOverride && dimsOverride.L) ? dimsOverride : vanDims(vehicle?.brand, vehicle?.model)
    const insps = (inspections || [])
      .filter((i) => i?.analysis)
      .slice()
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')) // antigua → nueva

    const groups = new Map()

    for (const insp of insps) {
      const photos = insp.annotated_photos?.length ? insp.annotated_photos : (insp.photos || [])
      const rawPhotos = insp.photos || []
      const dmgs = insp.analysis?.damages || insp.analysis?.new_damages || []
      for (let idx = 0; idx < dmgs.length; idx++) {
        const d = dmgs[idx]
        if (!d || d.confirmed === false) continue
        const panel = canonPanel(d.part || '')
        if (!panel) continue // no es chapa (suciedad, mecánica…)
        const { side, end } = parseSide(d.location_hint || '', d.description || '')
        const key = zoneKey(panel, side, end)

        const pi = typeof d.photo_index === 'number' && d.photo_index >= 1 ? d.photo_index - 1 : null
        const photoUrl = (pi != null && photos[pi]) || photos[0] || null
        const rawPhotoUrl = (pi != null && rawPhotos[pi]) || rawPhotos[0] || null

        const occurrence = {
          inspectionId: insp.id,
          date: insp.created_at,
          driver: insp.driver_name || '',
          severity: d.severity || 'sin_analisis',
          description: (d.description || '').replace(/ · \[ya registrado[^\]]*\]/g, '').trim(),
          part: d.part || '',
          photoUrl,
          rawPhotoUrl,
          box_2d: Array.isArray(d.box_2d) && d.box_2d.length === 4 ? d.box_2d : null,
          estimatedCost: Number(d.estimated_cost) || 0,
          actualCost: d.actual_cost != null ? Number(d.actual_cost) : null,
          repairStatus: d.repair_status || 'pending',
          isRegistered: d.is_new === false || /\[ya registrado/.test(d.description || ''),
        }

        if (!groups.has(key)) {
          const { pos, normal, label } = zonePosition(panel, d.location_hint || '', d.description || '', dims)
          groups.set(key, {
            key, panel, side, end, pos, normal,
            label, sideText: sideLabel(d.location_hint || '', d.description || ''),
            occurrences: [],
          })
        }
        groups.get(key).occurrences.push(occurrence)
      }
    }

    // Estado desde el ledger: un panel abierto en el ledger = daño vigente.
    const openPanels = new Set((ledger?.open || []).map((e) => e.panel))
    const repairedPanels = new Set((ledger?.repaired || []).map((e) => e.panel))
    const ledgerByPanel = {}
    for (const e of ledger?.open || []) ledgerByPanel[e.panel] = e

    const markers = []
    for (const g of groups.values()) {
      // Ordena ocurrencias: más reciente primero (para galería y "última foto").
      g.occurrences.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      const latest = g.occurrences[0]
      const first = g.occurrences[g.occurrences.length - 1]
      const worstRank = Math.max(...g.occurrences.map((o) => SEV_RANK[o.severity] ?? 0))
      const severity = Object.keys(SEV_RANK).find((k) => SEV_RANK[k] === worstRank) || 'leve'

      const inLedgerOpen = openPanels.has(g.panel)
      const inLedgerRepaired = repairedPanels.has(g.panel) && !inLedgerOpen
      // Sin ledger (aún sin backfill) tratamos el daño más reciente como abierto.
      const status = inLedgerRepaired ? 'repaired' : 'open'

      markers.push({
        ...g,
        severity,
        severityRank: worstRank,
        status,
        firstSeen: first?.date,
        lastSeen: latest?.date,
        firstSeenId: first?.inspectionId,
        photoUrl: latest?.photoUrl,
        count: g.occurrences.length,
        ledgerEntry: ledgerByPanel[g.panel] || null,
      })
    }

    // Marcadores más graves primero (el orden importa para z-index de pines).
    markers.sort((a, b) => b.severityRank - a.severityRank)

    // Fechas de inspección para el comparador temporal.
    const timeline = insps.map((i) => ({ id: i.id, date: i.created_at }))

    return { dims, markers, timeline, brand: vehicle?.brand, model: vehicle?.model }
  }, [vehicle, inspections, ledger, dimsOverride])
}
