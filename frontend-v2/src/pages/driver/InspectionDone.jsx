import { useState } from 'react'
import { CheckCircle2, ShieldCheck, Loader2, FileSignature, AlertTriangle } from 'lucide-react'
import { signInspection } from '../../services/api'

const DECLARATION = "Confirmo que el estado del vehículo es como aparece en las fotos. Firmo electrónicamente con mi nombre a la fecha y hora actuales."

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

  // Estado: firma completada
  if (signed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950 p-4">
        <div className="card w-full max-w-sm animate-fadeIn p-7 text-center">
          <ShieldCheck size={48} className="mx-auto mb-3 text-emerald-400" />
          <h2 className="mb-1 text-xl font-bold text-dark-50">Inspección firmada</h2>
          <p className="mb-3 text-sm text-dark-400">Peritaje técnico con cadena de custodia.</p>
          {hash && (
            <div className="mb-4 rounded-lg border border-dark-700 bg-dark-900 p-3 text-left">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-dark-500">Hash de tu firma</div>
              <code className="break-all text-[11px] text-emerald-300">{hash.slice(0, 32)}…</code>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onNew} className="btn-primary flex-1">Nueva inspección</button>
            <button onClick={onLogout} className="btn-secondary">Salir</button>
          </div>
        </div>
      </div>
    )
  }

  // Estado: el conductor decidió saltarse la firma → mostrar pantalla original
  if (skipped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950 p-4">
        <div className="card w-full max-w-sm animate-fadeIn p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
          <h2 className="mb-2 text-xl font-bold text-dark-50">Inspección enviada</h2>
          <p className="mb-1 text-sm text-amber-400">⚠ Pendiente de firma. Tu administrador puede firmarla desde el panel.</p>
          {analysis && (
            <div className="card mt-4 space-y-1 p-3 text-left text-sm">
              <div className="flex justify-between"><span className="text-dark-400">Severidad</span><span className="font-medium">{analysis.severity}</span></div>
              <div className="flex justify-between"><span className="text-dark-400">Daños</span><span>{analysis.total_damages_count}</span></div>
            </div>
          )}
          <div className="mt-6 flex gap-2">
            <button onClick={onNew} className="btn-primary flex-1">Nueva inspección</button>
            <button onClick={onLogout} className="btn-secondary">Salir</button>
          </div>
        </div>
      </div>
    )
  }

  // Estado: paso de firma (por defecto cuando hay inspId)
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 p-4">
      <div className="card w-full max-w-sm animate-fadeIn p-6">
        <div className="mb-4 flex items-center gap-2">
          <FileSignature size={22} className="text-brand-400" />
          <h2 className="text-lg font-bold text-dark-50">Firma tu inspección</h2>
        </div>

        {analysis && (
          <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
            <div className="card p-2">
              <div className="text-[10px] uppercase text-dark-500">Severidad</div>
              <div className={`font-bold ${analysis.severity === 'grave' || analysis.severity === 'critico' ? 'text-red-400' : analysis.severity === 'moderado' ? 'text-amber-400' : 'text-emerald-400'}`}>{analysis.severity || '—'}</div>
            </div>
            <div className="card p-2">
              <div className="text-[10px] uppercase text-dark-500">Daños</div>
              <div className="font-bold text-dark-100">{analysis.total_damages_count ?? 0}</div>
            </div>
          </div>
        )}

        <div className="mb-3 rounded-lg border border-dark-800 bg-dark-900 p-3 text-sm text-dark-300">
          «{DECLARATION}»
        </div>

        <label className="mb-4 flex cursor-pointer items-start gap-2 text-sm text-dark-300">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer" />
          <span>Acepto y firmo electrónicamente.</span>
        </label>

        {err && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <button onClick={doSign} disabled={!accepted || signing || !inspId} className="btn-primary mb-2 flex w-full items-center justify-center gap-2 disabled:opacity-50">
          {signing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {signing ? 'Firmando…' : 'Firmar y enviar'}
        </button>
        <button onClick={() => setSkipped(true)} className="w-full text-xs text-dark-500 hover:text-dark-300">
          Continuar sin firma (mi administrador la firmará)
        </button>
      </div>
    </div>
  )
}
