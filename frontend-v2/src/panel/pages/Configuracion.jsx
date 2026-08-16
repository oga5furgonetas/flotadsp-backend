import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { Loader2, Plus, Building, Send, CreditCard, Check, Copy, ExternalLink, BellRing, Pencil, Trash2, Clock } from 'lucide-react'
import { getOrgCenters, addOrgCenter, getTelegramConfig, getOrgBilling, listarDestinatarios, guardarDestinatario, borrarDestinatario, enviarResumenDiario, getHorariosAvisos, setHorariosAvisos } from '../api'
import { lista } from '../../lib/lista'
import { getAdmin } from '../auth'

const PORTAL_BASE = 'https://flotadsp.com'

function CopyRow({ label, url }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  return (
    <div>
      {label && <div className="mb-1 text-xs font-medium text-dark-400">{label}</div>}
      <div className="flex gap-2">
        <input readOnly value={url} className="input flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button onClick={() => { navigator.clipboard?.writeText(url).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className="btn-secondary flex items-center gap-1.5 whitespace-nowrap text-sm">
          {copied ? <><Check size={14} /> {t('portal.copied')}</> : <><Copy size={14} /> {t('portal.copy')}</>}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="btn-ghost px-2" title="Abrir"><ExternalLink size={15} /></a>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   QUIÉN RECIBE EL RESUMEN DE CADA CENTRO
   ---------------------------------------------------------------------------
   Los teléfonos se editan AQUÍ y viven en la base de datos. Escritos en el
   código acabarían en GitHub y en el historial de git, que es para siempre —
   y son números de personas reales, no configuración.
   ──────────────────────────────────────────────────────────────────────────── */
/* A qué hora sale cada aviso. Se guarda en la base y el servidor lo relee cada
   minuto, así que el cambio surte efecto ese mismo día sin redesplegar nada. */
const AVISOS = [
  { k: 'resumen_diario', label: 'Resumen del día', ayuda: 'Correo a cada persona con la entrega, los golpes y el checklist de sus centros.' },
  { k: 'turno_manana', label: 'Cierre del turno de mañana', ayuda: 'Qué quedó sin hacer. Ponlo a la hora en que acaba el turno, no antes: lo que aún da tiempo a hacer saldría como pendiente.' },
  { k: 'turno_tarde', label: 'Cierre del turno de tarde', ayuda: 'Igual que el de mañana, para el segundo turno.' },
]

function Horarios() {
  const [h, setH] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => { getHorariosAvisos().then((r) => setH(r.data)).catch(() => setH(null)) }, [])

  async function guardar(clave, valor) {
    const v = Math.max(0, Math.min(23, Number(valor)))
    setH((x) => ({ ...x, [clave]: v }))
    setGuardando(true); setOk(false)
    try {
      const r = await setHorariosAvisos({ [clave]: v })
      setH(r.data); setOk(true); setTimeout(() => setOk(false), 2000)
    } catch { /* se queda lo que había al recargar */ } finally { setGuardando(false) }
  }

  if (!h) return null
  return (
    <div className="mb-4 rounded-lg border border-dark-800 bg-dark-900/40 p-3">
      <p className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-dark-500">
        <Clock size={12} /> A qué hora sale cada aviso
        {guardando && <Loader2 size={11} className="animate-spin" />}
        {ok && <span className="normal-case tracking-normal text-emerald-400">guardado</span>}
      </p>
      <div className="space-y-2">
        {AVISOS.map((a) => (
          <div key={a.k} className="flex items-start gap-3">
            <select value={h[a.k]} onChange={(e) => guardar(a.k, e.target.value)}
              className="input w-[74px] shrink-0 py-1 text-center text-sm tabular-nums">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
            <div className="min-w-0">
              <p className="text-[13px] text-dark-200">{a.label}</p>
              <p className="text-[11px] leading-relaxed text-dark-600">{a.ayuda}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] text-dark-600">Hora de España. El cambio vale desde hoy mismo.</p>
    </div>
  )
}

function Destinatarios({ centers }) {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(null)   // null = cerrado
  const [busy, setBusy] = useState(false)
  const [probando, setProbando] = useState(null)   // null | true (todos) | id
  const [err, setErr] = useState('')

  // Con `d` va sólo a esa persona y sin copia al grupo: es la prueba de
  // "¿le llega a Judyt?" sin molestar a los demás.
  async function probar(d) {
    setProbando(d?.id || true)
    try {
      const r = await enviarResumenDiario(d ? { id: d.id } : {})
      const e = r.data?.enviados || []
      if (d && !e.length) {
        alert(`${d.nombre} no tiene ningún centro asignado, así que no hay nada que mandarle.`)
        return
      }
      alert(e.length
        ? e.map((x) => [
            `${x.center} — ${x.fecha}`,
            `Entrega: ${x.entrega}`,
            (x.incidencias?.sin_direccion || x.incidencias?.missing || x.incidencias?.lost)
              ? `  ${x.incidencias.sin_direccion} sin dirección · ${x.incidencias.missing} no en furgoneta · ${x.incidencias.lost} extraviados`
              : '  Sin incidencias de paquetes',
            `Golpes nuevos: ${x.golpes}`,
            ...(x.danos || []).slice(0, 6).map((d) => `  • ${d.matricula} — ${d.parte}${d.gravedad ? ` (${d.gravedad})` : ''}${d.conductor ? ` · ${d.conductor}` : ''}`),
            ...(x.turnos || []).map((t) => `Checklist ${t.turno}: ${t.hechas}/${t.total}`),
            `Para: ${x.destinatarios.join(', ')}`,
            x.correos?.length ? `✉️ Correo enviado a: ${x.correos.join(', ')}` : '(nadie con correo configurado)',
          ].join('\n')).join('\n\n')
        : 'Nadie tiene centros asignados, así que no se ha mandado nada.')
    } catch (e) {
      alert(e?.response?.data?.detail || 'No se pudo enviar')
    } finally { setProbando(null) }
  }

  const load = () => listarDestinatarios()
    .then((r) => setRows(lista(r.data?.rows))).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const abrir = (d) => setForm(d
    ? { ...d }
    : { nombre: '', email: '', telefono: '', centers: [], avisos: ['resumen_diario'], activo: true })

  async function guardar() {
    setBusy(true); setErr('')
    try {
      await guardarDestinatario(form)
      setForm(null); await load()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo guardar')
    } finally { setBusy(false) }
  }

  async function borrar(d) {
    if (!confirm(`¿Quitar a ${d.nombre}? Dejará de recibir el resumen.`)) return
    await borrarDestinatario(d.id); await load()
  }

  const alternarCentro = (c) => setForm((f) => ({
    ...f, centers: f.centers.includes(c) ? f.centers.filter((x) => x !== c) : [...f.centers, c],
  }))

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-dark-200">
        <BellRing size={16} /> Resumen diario por centro
      </div>
      <p className="mb-3 text-xs leading-relaxed text-dark-500">
        Un mensaje al día por persona con la entrega, el checklist y los golpes nuevos de sus
        centros, tarea por tarea y golpe a golpe. Sale por correo a cada persona y al grupo
        de Telegram. El teléfono se queda guardado para el día que WhatsApp esté conectado.
      </p>

      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-dark-400"><Loader2 size={14} className="animate-spin" /> …</div>
      ) : (
        <div className="mb-3 divide-y divide-dark-800 rounded-lg border border-dark-800">
          {rows.length === 0 && <p className="px-3 py-3 text-sm text-dark-500">Nadie configurado todavía.</p>}
          {rows.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-dark-100">{d.nombre}</span>
                <span className="block font-mono text-[11px] text-dark-500">
                  {d.email || d.telefono} · {d.centers?.join(' · ') || 'todos los centros'}
                </span>
              </span>
              {!d.activo && <span className="rounded bg-dark-800 px-1.5 text-[10px] text-dark-500">en pausa</span>}
              {/* Mandárselo sólo a esta persona, para comprobar que le llega
                  antes de dejarlo funcionando. No va copia al grupo. */}
              <button onClick={() => probar(d)} disabled={probando === d.id || !d.email}
                className="btn-ghost p-1.5 text-dark-400 hover:text-brand-300 disabled:opacity-30"
                title={d.email ? `Enviarle el resumen ahora sólo a ${d.nombre}` : 'Sin correo: no se le puede enviar'}>
                {probando === d.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
              <button onClick={() => abrir(d)} className="btn-ghost p-1.5 text-dark-400" title="Editar"><Pencil size={13} /></button>
              <button onClick={() => borrar(d)} className="btn-ghost p-1.5 text-red-400" title="Quitar"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <Horarios />

      {!form ? (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => abrir(null)} className="btn-secondary inline-flex items-center gap-1.5 text-sm">
            <Plus size={14} /> Añadir persona
          </button>
          {/* Sale solo cada tarde; esto es para ver el mensaje ahora y
              comprobar que dice lo que tiene que decir. */}
          {rows?.length > 0 && (
            <button onClick={() => probar()} disabled={probando === true}
              className="btn-ghost inline-flex items-center gap-1.5 text-xs text-dark-400 hover:text-brand-300">
              {probando === true ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviárselo a todos
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5 rounded-lg border border-dark-700 bg-dark-900/50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input text-sm" placeholder="Nombre" value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <input className="input text-sm" placeholder="correo@ejemplo.com" value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          {/* El teléfono se queda para el día que WhatsApp esté conectado. Hoy
              el que hace falta es el correo, que es por donde sale. */}
          <input className="input text-sm" placeholder="Teléfono (para WhatsApp, opcional)"
            value={form.telefono || ''}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          <div>
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-dark-500">Centros</p>
            <div className="flex flex-wrap gap-1.5">
              {centers.map((c) => (
                <button key={c} onClick={() => alternarCentro(c)}
                  className={`rounded-lg border px-2 py-1 text-[11.5px] transition-colors ${
                    form.centers.includes(c) ? 'border-brand-500/50 bg-brand-500/10 text-brand-200'
                                             : 'border-dark-700 text-dark-500'}`}>{c}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-dark-400">
            <input type="checkbox" checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Recibe los avisos (desmárcalo para pausarla sin borrarla)
          </label>
          {err && <p className="text-[12px] text-red-300">{err}</p>}
          <div className="flex gap-2">
            <button onClick={guardar} disabled={busy || !form.nombre.trim() || !(form.email || '').trim()}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Guardar
            </button>
            <button onClick={() => { setForm(null); setErr('') }} className="btn-ghost text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Configuracion() {
  const { t } = useT()
  const [centers, setCenters] = useState(null)
  const [tg, setTg] = useState(null)
  const [billing, setBilling] = useState(null)
  const [nuevo, setNuevo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  function load() {
    getOrgCenters().then((r) => setCenters(r.data?.centers || [])).catch(() => setCenters([]))
    getTelegramConfig().then((r) => setTg(r.data)).catch(() => setTg({}))
    getOrgBilling().then((r) => setBilling(r.data)).catch(() => setBilling(null))
  }
  useEffect(load, [])

  async function add() {
    const name = nuevo.trim().toUpperCase()
    if (!name) return
    setBusy(true); setMsg(null)
    try {
      const r = await addOrgCenter(name)
      setCenters(r.data?.centers || [])
      const a = getAdmin(); if (a) { a.centers = r.data?.centers || []; localStorage.setItem('flotadsp_admin', JSON.stringify(a)) }
      setNuevo(''); setMsg({ ok: true, t: `Centro ${name} añadido.` })
    } catch (e) {
      setMsg({ ok: false, t: e?.response?.data?.detail || 'No se pudo añadir el centro.' })
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="rise font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('cfg.title')}</h1>
      {msg && <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      <p className="text-sm text-dark-400">Los enlaces para conductores están en la página <b>Portal Conductor</b> del menú lateral.</p>

      {/* Centros */}
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-dark-200"><Building size={16} /> {t('cfg.centers')}</div>
        {!centers ? <Loader2 className="animate-spin text-dark-400" size={16} /> : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {centers.length === 0 ? <span className="text-sm text-dark-500">{t('cfg.no.centers')}</span> :
                centers.map((c) => <span key={c} className="rounded-lg bg-dark-800 px-3 py-1.5 text-sm font-medium">{c}</span>)}
            </div>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder={t('cfg.new.center')} value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button onClick={add} disabled={busy || !nuevo.trim()} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {t('cfg.add')}
              </button>
            </div>
            <p className="mt-2 text-xs text-dark-500">Cada centro tiene sus conductores, vehículos y baremos de scorecard propios.</p>
          </>
        )}
      </div>

      {/* Telegram */}
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-dark-200"><Send size={16} /> {t('cfg.telegram')}</div>
        {!tg ? <Loader2 className="animate-spin text-dark-400" size={16} /> : (
          <div className="flex items-center gap-3 text-sm">
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tg.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-dark-700 text-dark-400'}`}>
              {tg.enabled ? <><Check size={12} /> {t('cfg.tg.enabled')}</> : t('cfg.tg.disabled')}
            </span>
            <span className="text-dark-400">{(tg.chat_ids || []).filter(Boolean).length} {t('cfg.tg.chats')}</span>
          </div>
        )}
        <p className="mt-2 text-xs text-dark-500">Recibe alertas de daños graves, ITV y coberturas directamente en Telegram.</p>
      </div>

      <Destinatarios centers={centers || []} />

      {/* Plan */}
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-dark-200"><CreditCard size={16} /> {t('cfg.plan')}</div>
        {billing ? (
          <div className="text-sm text-dark-300">
            Estado: <b>{billing.status || billing.estado || '—'}</b>{billing.plan ? ` · Plan ${billing.plan}` : ''}
          </div>
        ) : <span className="text-sm text-dark-500">Información de plan no disponible.</span>}
        <a href="/planes" className="btn-secondary mt-3 inline-flex text-sm">{t('cfg.see.plans')}</a>
      </div>
    </div>
  )
}
