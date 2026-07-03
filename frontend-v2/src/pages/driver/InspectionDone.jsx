import { useEffect, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, ExternalLink, FileSignature, Loader2, LogOut, Plus, ShieldCheck } from 'lucide-react'
import { signInspection, getDriverOffers, clickDriverOffer } from '../../services/api'

const DECLARATION =
  'Confirmo que el estado del vehículo es como aparece en las fotos. Firmo electrónicamente con mi nombre a la fecha y hora actuales.'

function SeverityBadge({ severity }) {
  const s = (severity || '').toLowerCase()
  const cls =
    s === 'grave' || s === 'critico'
      ? 'bg-red-500/15 text-red-400 border-red-500/30'
      : s === 'moderado'
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-bold uppercase tracking-wider ${cls}`}>
      {severity || '—'}
    </span>
  )
}

/* ── Ofertas patrocinadas: se muestran cuando el conductor ya terminó su tarea
   (momento de atención libre). El backend cuenta views/clicks para poder vender
   el espacio con métricas reales; sin patrocinadores muestra la auto-promo. ── */
function DriverOffers() {
  const [offers, setOffers] = useState([])

  useEffect(() => {
    getDriverOffers().then(r => setOffers(r.data?.offers || [])).catch(() => {})
  }, [])

  if (!offers.length) return null

  function open(o) {
    clickDriverOffer(o.id).catch(() => {})
    window.open(o.url, '_blank', 'noopener')
  }

  return (
    <div className="mt-6 space-y-2">
      {offers.map(o => (
        <button
          key={o.id}
          onClick={() => open(o)}
          className="card-hover flex w-full items-center gap-3 p-3.5 text-left"
        >
          <span className="text-2xl">{o.emoji || '🎁'}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-dark-100">{o.title}</span>
            {o.description && <span className="mt-0.5 block text-xs leading-snug text-dark-400">{o.description}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand-400">
            {o.cta || 'Ver'} <ExternalLink size={11} />
          </span>
        </button>
      ))}
    </div>
  )
}

export default function InspectionDone({ result, onNew, onLogout }) {
  const analysis = result?.analysis
  const inspId = result?.id
  const [accepted, setAccepted] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)
  const [hash, setHash] = useState('')
  const [skipped, setSkipped] = useState(false)
  const [err, setErr] = useState('')

  async function doSign() {
    if (!accepted || !inspId) return
    setSigning(true); setErr('')
    try {
      const r = await signInspection(inspId, DECLARATION)
      setHash(r.data?.hash || '')
      setSigned(true)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo firmar. Puedes continuar y firmar después desde tu administrador.')
    }
    setSigning(false)
  }

  /* ── Firmada ── */
  if (signed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-dark-950 px-4">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/6 blur-3xl" />
        </div>
        <div className="relative w-full max-w-sm text-center">
          {/* Icono animado */}
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 ring-4 ring-emerald-500/20">
            <ShieldCheck size={44} className="text-emerald-400" />
          </div>
          <h2 className="mb-1 text-2xl font-black text-dark-50">¡Inspección firmada!</h2>
          <p className="mb-6 text-sm text-dark-400">Peritaje técnico registrado con cadena de custodia digital.</p>
          {hash && (
            <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-left">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600">Hash criptográfico de tu firma</p>
              <code className="break-all text-[11px] leading-relaxed text-emerald-300">{hash.slice(0, 40)}…</code>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onNew} className="btn-primary flex flex-1 items-center justify-center gap-2 py-3.5">
              <Plus size={16} /> Nueva inspección
            </button>
            <button onClick={onLogout} className="btn-ghost flex items-center justify-center gap-1.5 px-4 py-3.5 text-sm text-dark-400">
              <LogOut size={15} /> Salir
            </button>
          </div>
          <DriverOffers />
        </div>
      </div>
    )
  }

  /* ── Saltada la firma ── */
  if (skipped) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-dark-950 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/20 to-brand-500/20 ring-4 ring-brand-500/20">
            <CheckCircle2 size={44} className="text-emerald-400" />
          </div>
          <h2 className="mb-1 text-2xl font-black text-dark-50">Inspección enviada</h2>
          <p className="mb-1 text-sm text-dark-400">Tu administrador recibirá la inspección y podrá firmarla desde el panel.</p>
          {analysis && (
            <div className="my-5 overflow-hidden rounded-2xl border border-dark-800 bg-dark-900">
              <div className="grid grid-cols-2 divide-x divide-dark-800">
                <div className="p-4 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-dark-500">Severidad</p>
                  <SeverityBadge severity={analysis.severity} />
                </div>
                <div className="p-4 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-dark-500">Daños</p>
                  <span className="text-xl font-black text-dark-100">{analysis.total_damages_count ?? 0}</span>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onNew} className="btn-primary flex flex-1 items-center justify-center gap-2 py-3.5">
              <Plus size={16} /> Nueva inspección
            </button>
            <button onClick={onLogout} className="btn-ghost flex items-center justify-center gap-1.5 px-4 py-3.5 text-sm text-dark-400">
              <LogOut size={15} /> Salir
            </button>
          </div>
          <DriverOffers />
        </div>
      </div>
    )
  }

  /* ── Pantalla de firma ── */
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-950 px-4">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full bg-brand-500/6 blur-3xl" />
      </div>
      <div className="relative w-full max-w-sm">

        {/* Success icon */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-400/20 to-brand-600/20 ring-4 ring-brand-500/20">
            <CheckCircle2 size={38} className="text-brand-400" />
          </div>
          <h2 className="text-xl font-black text-dark-50">Inspección completada</h2>
          <p className="mt-0.5 text-xs text-dark-500">Firma electrónica para validar el informe</p>
        </div>

        {/* Resumen de análisis */}
        {analysis && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-dark-800 bg-dark-900">
            <div className="grid grid-cols-2 divide-x divide-dark-800">
              <div className="p-4 text-center">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-dark-500">Severidad IA</p>
                <SeverityBadge severity={analysis.severity} />
              </div>
              <div className="p-4 text-center">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-dark-500">Daños</p>
                <span className="text-xl font-black text-dark-100">{analysis.total_damages_count ?? 0}</span>
              </div>
            </div>
          </div>
        )}

        {/* Card de firma */}
        <div className="rounded-2xl border border-dark-800 bg-dark-900/80 p-5 backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2">
            <FileSignature size={16} className="text-brand-400" />
            <span className="text-sm font-bold text-dark-100">Declaración de firma</span>
          </div>

          <div className="mb-4 rounded-xl border border-dark-800 bg-dark-950/60 p-3 text-xs leading-relaxed text-dark-400">
            «{DECLARATION}»
          </div>

          <label className="mb-4 flex cursor-pointer items-start gap-3">
            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all ${
              accepted ? 'border-brand-500 bg-brand-500' : 'border-dark-600 bg-transparent'
            }`}>
              {accepted && <Check size={12} className="text-white" />}
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="sr-only" />
            </div>
            <span className="text-sm text-dark-300">Acepto la declaración y firmo electrónicamente.</span>
          </label>

          {err && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <button
            onClick={doSign}
            disabled={!accepted || signing || !inspId}
            className="btn-primary mb-3 flex w-full items-center justify-center gap-2 py-3.5 text-sm font-bold disabled:opacity-50"
          >
            {signing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {signing ? 'Firmando…' : 'Firmar electrónicamente'}
          </button>

          <button
            onClick={() => setSkipped(true)}
            className="w-full text-center text-xs text-dark-600 transition hover:text-dark-400"
          >
            Continuar sin firma — mi administrador la firmará
          </button>
        </div>
      </div>
    </div>
  )
}
