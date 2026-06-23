import { useEffect, useState } from 'react'
import { Loader2, BrainCircuit, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { getHealth, getInspections, reanalyzeFailed, reanalyzeInspection } from '../api'

export default function IAPeritaje() {
  const [health, setHealth] = useState(null)
  const [insps, setInsps] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  function loadInsps() {
    getInspections({ limit: 300 }).then((r) => setInsps(r.data || [])).catch(() => setInsps([]))
  }
  useEffect(() => {
    getHealth().then((r) => setHealth(r.data)).catch(() => setHealth(null))
    loadInsps()
  }, [])

  const ok = (insps || []).filter((i) => i.analysis_status === 'ok').length
  const pending = (insps || []).filter((i) => i.analysis_status === 'pending').length
  const failed = (insps || []).filter((i) => i.analysis_status && i.analysis_status !== 'ok' && i.analysis_status !== 'pending')
  const failedList = failed.slice(0, 30)

  async function doReanalyzeFailed() {
    setBusy('all'); setMsg(null)
    try { const r = await reanalyzeFailed(); setMsg({ ok: true, t: `Reanálisis lanzado: ${r.data?.count ?? r.data?.reanalizadas ?? ''} inspecciones en cola.` }); setTimeout(loadInsps, 1500) }
    catch { setMsg({ ok: false, t: 'No se pudo lanzar el reanálisis.' }) } finally { setBusy('') }
  }
  async function doReanalyze(id) {
    setBusy(id)
    try { await reanalyzeInspection(id); setMsg({ ok: true, t: 'Inspección encolada para reanálisis.' }) }
    catch { setMsg({ ok: false, t: 'No se pudo reanalizar.' }) } finally { setBusy('') }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold"><BrainCircuit size={22} className="text-brand-400" /> IA Peritaje</h1>
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      {/* Motor IA */}
      <div className="card mb-5 p-5">
        <div className="mb-3 text-sm font-semibold text-dark-200">Motor de IA</div>
        {!health ? <Loader2 className="animate-spin text-dark-400" size={16} /> : (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-dark-500">Análisis</div><div className="font-medium">{health.gemini_model || '—'}</div></div>
            <div><div className="text-dark-500">Modo</div><div className="font-medium">{health.gemini_mode || '—'}</div></div>
            <div><div className="text-dark-500">Detección</div><div className="font-medium">{health.detection_mode || '—'}</div></div>
            <div><div className="text-dark-500">Servicio IA</div><div className={`font-medium ${health.ai_service_configured ? 'text-emerald-400' : 'text-amber-400'}`}>{health.ai_service_configured ? 'activo' : 'fallback'}</div></div>
          </div>
        )}
      </div>

      {/* Estado de análisis */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="card p-4"><div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /><span className="text-2xl font-extrabold">{insps ? ok : '—'}</span></div><div className="text-sm text-dark-400">Analizadas OK</div></div>
        <div className="card p-4"><div className="flex items-center gap-2"><Clock size={16} className="text-amber-400" /><span className="text-2xl font-extrabold">{insps ? pending : '—'}</span></div><div className="text-sm text-dark-400">Pendientes</div></div>
        <div className="card p-4"><div className="flex items-center gap-2"><AlertTriangle size={16} className="text-red-400" /><span className="text-2xl font-extrabold">{insps ? failed.length : '—'}</span></div><div className="text-sm text-dark-400">Fallidas</div></div>
      </div>

      <button onClick={doReanalyzeFailed} disabled={busy === 'all' || (insps && failed.length === 0)} className="btn-primary mb-4 flex items-center gap-2 disabled:opacity-50">
        {busy === 'all' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Reanalizar todas las fallidas
      </button>

      {!insps ? <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={16} /> Cargando…</div> :
        failedList.length === 0 ? <div className="card p-8 text-center text-dark-400">No hay inspecciones fallidas. La IA está al día.</div> : (
          <div className="card divide-y divide-dark-800">
            {failedList.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="text-dark-300">{(i.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">{i.analysis_status}</span>
                <button onClick={() => doReanalyze(i.id)} disabled={busy === i.id} className="btn-ghost px-2 py-1 text-xs">{busy === i.id ? '…' : 'Reanalizar'}</button>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
