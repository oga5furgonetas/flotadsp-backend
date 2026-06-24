import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ShieldCheck, ShieldAlert, Search, Loader2, AlertTriangle } from 'lucide-react'
import { API_BASE } from '../services/api'

// Página pública SIN auth para verificar un peritaje técnico por hash.
// El backend devuelve solo info mínima no sensible (matrícula enmascarada, fecha, firmante).
export default function Verify() {
  const { hash: hashParam } = useParams()
  const [hash, setHash] = useState(hashParam || '')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { if (hashParam) verify(hashParam) }, [hashParam])

  function cleanHash(input) {
    if (!input) return ''
    // Extrae el primer match de 64 hex chars consecutivos. Acepta paste con espacios, "Hash:", saltos de línea, mayúsculas, etc.
    const compact = String(input).replace(/[\s ]+/g, '')
    const m = compact.match(/[0-9a-fA-F]{64}/)
    return (m ? m[0] : compact).toLowerCase()
  }

  async function verify(h) {
    setLoading(true); setErr(''); setData(null)
    const cleaned = cleanHash(h)
    if (cleaned.length !== 64) {
      setErr(`El hash debe tener 64 caracteres hexadecimales. Te falta ${64 - cleaned.length} (probablemente lo has copiado incompleto del PDF).`)
      setLoading(false); return
    }
    try {
      const r = await fetch(`${API_BASE}/verify/${cleaned}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j?.detail || 'Error de verificación')
      setData(j)
    } catch (e) { setErr(String(e.message || e)) }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-dark-950 text-dark-50">
      <nav className="border-b border-dark-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold">⚡</div>
            <b className="text-sm">FlotaDSP</b>
          </Link>
          <Link to="/peritaje-tecnico" className="text-xs text-dark-400 hover:text-dark-200">¿Qué es esto?</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="mb-2 text-3xl font-extrabold">Verificador de peritaje</h1>
        <p className="mb-7 text-dark-400">Introduce el hash SHA-256 del peritaje (lo encuentras en el PDF o escaneando su QR).</p>

        <form onSubmit={(e) => { e.preventDefault(); if (hash) verify(hash) }} className="mb-6 flex gap-2">
          <input
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            placeholder="abcdef1234… (64 caracteres hex)"
            className="input flex-1 font-mono text-sm"
            spellCheck={false}
            autoComplete="off"
          />
          <button disabled={!hash || loading} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Verificar
          </button>
        </form>

        {err && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {err}
          </div>
        )}

        {data && data.valid && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6">
            <div className="mb-4 flex items-center gap-3">
              <ShieldCheck size={32} className="text-emerald-400" />
              <div>
                <div className="text-xl font-bold text-emerald-200">Peritaje auténtico</div>
                <div className="text-xs text-dark-400">Hash registrado en la cadena de custodia de FlotaDSP.</div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Item label="Matrícula" value={data.vehicle_plate_masked || '—'} />
              <Item label="Firmado por" value={data.signed_by_name || '—'} />
              <Item label="Fecha inspección" value={fmt(data.inspection_date)} />
              <Item label="Fecha firma" value={fmt(data.signed_at)} />
              <Item label="Hash anterior" value={data.prev_hash} mono />
              <Item label="Hash siguiente" value={data.has_next_in_chain ? 'sí (cadena continuada)' : 'no (última firma)'} />
            </dl>
            <div className="mt-5 border-t border-emerald-500/20 pt-4 text-xs text-dark-400">
              <b className="text-dark-200">Hash verificado:</b>
              <code className="mt-1 block break-all text-[11px] text-emerald-300">{data.hash}</code>
            </div>
            {data.disclaimer && (
              <p className="mt-4 text-xs text-dark-500">{data.disclaimer}</p>
            )}
          </div>
        )}

        {data && !data.valid && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6">
            <div className="mb-2 flex items-center gap-3">
              <ShieldAlert size={28} className="text-amber-400" />
              <div className="text-lg font-bold text-amber-200">Hash no encontrado</div>
            </div>
            <p className="text-sm text-dark-300">{data.error || 'Este hash no corresponde a ningún peritaje firmado en FlotaDSP.'}</p>
          </div>
        )}
      </main>

      <footer className="border-t border-dark-800 py-6 text-center text-xs text-dark-500">
        © {new Date().getFullYear()} FlotaDSP · <Link to="/privacidad" className="hover:text-dark-300">Privacidad</Link> · <Link to="/terminos" className="hover:text-dark-300">Términos</Link>
      </footer>
    </div>
  )
}

function Item({ label, value, mono = false }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-dark-500">{label}</div>
      <div className={`break-all text-dark-100 ${mono ? 'font-mono text-[11px]' : ''}`}>{value || '—'}</div>
    </div>
  )
}

function fmt(s) { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
