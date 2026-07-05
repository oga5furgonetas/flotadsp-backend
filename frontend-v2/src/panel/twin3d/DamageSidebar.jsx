import { useState, useEffect } from 'react'
import {
  X, MapPin, Calendar, User, ShieldAlert, Wrench, Euro, History,
  ChevronLeft, ChevronRight, Image as ImageIcon, CheckCircle2,
} from 'lucide-react'
import { SEV_COLOR, SEV_LABEL } from './DamagePins'

function fmtDate(s) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}

// ─────────────────────────────────────────────────────────────────────────────
// DamageSidebar — panel lateral (NUNCA popup/alert) con el detalle completo de
// un daño: zona, severidad, fecha, conductor, estado, coste, observaciones,
// FOTO EXACTA de ese daño (última primero, galería si hay varias) e historial.
// ─────────────────────────────────────────────────────────────────────────────
export default function DamageSidebar({ marker, onClose }) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const [zoom, setZoom] = useState(false)

  useEffect(() => { setPhotoIdx(0); setZoom(false) }, [marker?.key])
  if (!marker) return null

  const color = SEV_COLOR[marker.severity] || SEV_COLOR.sin_analisis
  const occ = marker.occurrences
  const cur = occ[photoIdx] || occ[0]
  const gallery = occ.filter((o) => o.photoUrl)
  const cost = occ.reduce((acc, o) => acc + (o.actualCost ?? o.estimatedCost ?? 0), 0)
  const hasActual = occ.some((o) => o.actualCost != null)

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, height: '100%', width: 'min(380px, 92%)',
      background: 'rgba(15,18,26,.97)', backdropFilter: 'blur(12px)',
      borderLeft: '1px solid rgba(255,255,255,.08)', boxShadow: '-12px 0 40px rgba(0,0,0,.5)',
      display: 'flex', flexDirection: 'column', zIndex: 200,
      animation: 'twinSlideIn .28s cubic-bezier(.16,1,.3,1)',
    }}>
      {/* Cabecera */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}` }} />
              <h3 style={{ margin: 0, color: '#fff', fontSize: 16, fontWeight: 700 }}>{marker.label}</h3>
            </div>
            {marker.sideText && (
              <div style={{ marginTop: 3, color: '#94a3b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={12} /> {marker.sideText}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 8, width: 30, height: 30, color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ background: `${color}22`, color, border: `1px solid ${color}55`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
            {SEV_LABEL[marker.severity] || marker.severity}
          </span>
          <span style={{
            background: marker.status === 'repaired' ? 'rgba(34,197,94,.15)' : 'rgba(249,115,22,.15)',
            color: marker.status === 'repaired' ? '#22c55e' : '#fb923c',
            border: `1px solid ${marker.status === 'repaired' ? '#22c55e55' : '#fb923c55'}`,
            borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {marker.status === 'repaired' ? <><CheckCircle2 size={12} /> Reparado</> : <><ShieldAlert size={12} /> Abierto</>}
          </span>
          {marker.count > 1 && (
            <span style={{ background: 'rgba(255,255,255,.06)', color: '#cbd5e1', borderRadius: 20, padding: '3px 10px', fontSize: 11 }}>
              {marker.count} registros
            </span>
          )}
        </div>
      </div>

      {/* Cuerpo scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {/* FOTO EXACTA del daño */}
        {cur?.photoUrl ? (
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,.08)' }}>
            <img
              src={cur.photoUrl} alt={marker.label}
              onClick={() => setZoom(true)}
              style={{ display: 'block', width: '100%', cursor: 'zoom-in' }}
            />
            {gallery.length > 1 && (
              <>
                <button onClick={() => setPhotoIdx((i) => (i - 1 + occ.length) % occ.length)}
                  style={navBtn('left')}><ChevronLeft size={18} /></button>
                <button onClick={() => setPhotoIdx((i) => (i + 1) % occ.length)}
                  style={navBtn('right')}><ChevronRight size={18} /></button>
                <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
                  {occ.map((_, i) => (
                    <span key={i} onClick={() => setPhotoIdx(i)} style={{
                      width: 6, height: 6, borderRadius: '50%', cursor: 'pointer',
                      background: i === photoIdx ? '#fff' : 'rgba(255,255,255,.4)',
                    }} />
                  ))}
                </div>
              </>
            )}
            <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.65)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
              {fmtDate(cur.date)}{photoIdx === 0 ? ' · última' : ''}
            </div>
          </div>
        ) : (
          <div style={{ borderRadius: 12, background: 'rgba(255,255,255,.04)', padding: 28, textAlign: 'center', color: '#64748b', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <ImageIcon size={26} /> Sin foto de este daño
          </div>
        )}

        {cur?.description && (
          <p style={{ marginTop: 14, color: '#cbd5e1', fontSize: 13, lineHeight: 1.55 }}>{cur.description}</p>
        )}

        {/* Ficha de datos */}
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field icon={<Calendar size={13} />} label="Detectado" value={fmtDate(marker.firstSeen)} />
          <Field icon={<History size={13} />} label="Visto por última vez" value={fmtDate(marker.lastSeen)} />
          <Field icon={<User size={13} />} label="Conductor" value={cur?.driver || '—'} />
          <Field icon={<Wrench size={13} />} label="Reparación" value={repairLabel(cur?.repairStatus, marker.status)} />
          {cost > 0 && (
            <Field icon={<Euro size={13} />} label={hasActual ? 'Coste real' : 'Coste estimado'}
              value={`${cost.toFixed(0)} €`} />
          )}
          <Field icon={<MapPin size={13} />} label="Zona / pieza" value={cur?.part || marker.label} />
        </div>

        {/* Historial temporal */}
        {occ.length > 1 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
              Historial ({occ.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {occ.map((o, i) => (
                <div key={i} onClick={() => setPhotoIdx(i)} style={{
                  display: 'flex', gap: 10, padding: '8px 0', cursor: 'pointer',
                  borderBottom: i < occ.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none',
                  opacity: i === photoIdx ? 1 : 0.72,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: SEV_COLOR[o.severity] || '#94a3b8' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{fmtDate(o.date)}</div>
                    <div style={{ color: '#94a3b8', fontSize: 11 }}>
                      {SEV_LABEL[o.severity] || o.severity}{o.driver ? ` · ${o.driver}` : ''}
                    </div>
                  </div>
                  {o.photoUrl && <img src={o.photoUrl} alt="" style={{ width: 40, height: 30, objectFit: 'cover', borderRadius: 4 }} />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox de foto */}
      {zoom && cur?.photoUrl && (
        <div onClick={() => setZoom(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 1200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out',
        }}>
          <img src={cur.photoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}

function Field({ icon, label, value }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {icon} {label}
      </div>
      <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginTop: 3, wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

function repairLabel(rs, status) {
  if (status === 'repaired') return 'Reparado'
  const m = { pending: 'Pendiente', assigned: 'Asignada', in_repair: 'En taller', done: 'Hecha', declined: 'Descartada' }
  return m[rs] || 'Pendiente'
}

function navBtn(side) {
  return {
    position: 'absolute', top: '50%', [side]: 6, transform: 'translateY(-50%)',
    background: 'rgba(0,0,0,.55)', border: 'none', borderRadius: '50%', width: 30, height: 30,
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
