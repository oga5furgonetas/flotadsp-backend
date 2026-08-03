import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Loader2, Building2, CheckCircle2, Clock, Euro, Sparkles, Gift, PauseCircle,
  LogIn, Trash2, Database, BrainCircuit, ExternalLink, RefreshCw, Megaphone,
  Play, Pause, Plus, Star, Eye, MousePointerClick, Tag, Save,
  Receipt, Upload, Check, Undo2, Building,
} from 'lucide-react'
import {
  getAdminOverview, getAdminOrgs, getLeads, updateOrg, impersonateOrg, deleteOrg,
  backupNow, adminGetDriverOffers, adminCreateDriverOffer, adminToggleDriverOffer,
  adminDeleteDriverOffer, adminGetFounderReservations,
  adminGetPlanes, adminSetPlanes,
  adminGetCobros, adminMarcarCobro, adminConciliar,
  adminGetEmisor, adminSetEmisor,
} from '../api'
import { API_BASE } from '../../services/api'

// ST labels are now translated inside the component via t()

function Kpi({ icon: Icon, label, value, accent }) {
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2"><Icon size={17} style={{ color: accent }} /><span className="text-2xl font-extrabold">{value}</span></div>
      <div className="text-sm text-dark-400">{label}</div>
    </div>
  )
}


/* Editor de tarifas. Antes los precios vivían en el código: cambiar 8 € por
   7 € era un despliegue. Ahora se guardan en la base y la página de precios
   los lee al momento. Los planes que existen NO se tocan desde aquí: si se
   pudiera inventar uno nuevo, el cliente pagaría por algo que la app no le
   abre, porque los permisos siguen atados a las tres claves conocidas. */
function EditorTarifas() {
  const [cat, setCat] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    adminGetPlanes().then((r) => setCat(r.data)).catch(() => setErr('No se pudo cargar el catálogo'))
  }, [])

  const cambiar = (clave, campo, valor) => {
    setCat((c) => ({
      ...c,
      planes: c.planes.map((p) => (p.clave === clave ? { ...p, [campo]: valor } : p)),
    }))
    setAviso('')
  }

  const guardar = async () => {
    setGuardando(true); setErr(''); setAviso('')
    try {
      await adminSetPlanes({
        planes: cat.planes,
        moneda: cat.moneda,
        descuento_anual_meses: cat.descuento_anual_meses,
        iva_pct: cat.iva_pct,
      })
      setAviso('Tarifas guardadas. La página de precios ya las muestra.')
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo guardar')
    } finally { setGuardando(false) }
  }

  if (err && !cat) return <p className="text-sm text-red-300">{err}</p>
  if (!cat) return <div className="flex items-center gap-2 text-sm text-dark-400"><Loader2 size={14} className="animate-spin" /> Cargando tarifas…</div>

  return (
    <div className="card mt-6 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-dark-100">
          <Tag size={16} /> Tarifas
        </h2>
        <button onClick={guardar} disabled={guardando}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          {guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </div>

      {err && <p className="mb-2 text-xs text-red-300">{err}</p>}
      {aviso && <p className="mb-2 text-xs text-emerald-300">{aviso}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-dark-500">
              <th className="pb-2 text-left font-semibold">Plan</th>
              <th className="pb-2 text-right font-semibold">€ / furgoneta</th>
              <th className="pb-2 text-right font-semibold">Mínimo</th>
              <th className="pb-2 text-right font-semibold">Desde</th>
              <th className="pb-2 text-right font-semibold">Con 40</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-800">
            {cat.planes.map((p) => {
              const pv = Number(p.por_vehiculo) || 0
              const min = Number(p.minimo_vehiculos) || 0
              return (
                <tr key={p.clave}>
                  <td className="py-2 pr-3">
                    <span className="font-medium text-dark-100">{p.nombre}</span>
                    <span className="ml-2 text-[11px] text-dark-600">{p.para}</span>
                  </td>
                  <td className="py-2 text-right">
                    <input type="text" inputMode="decimal" value={p.por_vehiculo ?? ''}
                      onChange={(e) => cambiar(p.clave, 'por_vehiculo', e.target.value)}
                      className="w-20 rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-right text-dark-100" />
                  </td>
                  <td className="py-2 text-right">
                    <input type="number" min="0" value={p.minimo_vehiculos ?? 0}
                      onChange={(e) => cambiar(p.clave, 'minimo_vehiculos', e.target.value)}
                      className="w-20 rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-right text-dark-100" />
                  </td>
                  <td className="py-2 text-right text-dark-300">{pv ? `${Math.round(pv * min)} €` : 'a medida'}</td>
                  <td className="py-2 text-right font-semibold text-dark-100">
                    {pv ? `${Math.round(pv * Math.max(40, min))} €` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-dark-400">
        <label className="flex items-center gap-2">
          Meses gratis al pagar el año
          <input type="number" min="0" max="6" value={cat.descuento_anual_meses ?? 2}
            onChange={(e) => { setCat((c) => ({ ...c, descuento_anual_meses: e.target.value })); setAviso('') }}
            className="w-14 rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-center text-dark-100" />
        </label>
        <label className="flex items-center gap-2">
          IVA %
          <input type="text" inputMode="decimal" value={cat.iva_pct ?? 21}
            onChange={(e) => { setCat((c) => ({ ...c, iva_pct: e.target.value })); setAviso('') }}
            className="w-14 rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-center text-dark-100" />
        </label>
        <span className="text-dark-600">Se aplica a la página de precios en menos de un minuto.</span>
      </div>
    </div>
  )
}


/* Cobros del mes. Sin pasarela: cada cliente paga por transferencia y aquí se
   lleva la cuenta. El botón de conciliar lee el extracto que descargas del
   banco y marca solos los que ya han entrado — sin API ni claves. */
function Cobros() {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [datos, setDatos] = useState(null)
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState('')
  const ficheroRef = useRef(null)

  const cargar = (m) => {
    setDatos(null); setErr('')
    adminGetCobros(m).then((r) => setDatos(r.data))
      .catch((e) => setErr(e?.response?.data?.detail || 'No se pudieron cargar los cobros'))
  }
  useEffect(() => { cargar(mes) }, [mes])

  const marcar = async (c, estado) => {
    setOcupado(c.id)
    try { await adminMarcarCobro(c.id, estado); cargar(mes) }
    catch { setErr('No se pudo guardar') }
    finally { setOcupado('') }
  }

  const conciliar = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setOcupado('conciliar'); setErr(''); setAviso('')
    try {
      const r = await adminConciliar(f, mes)
      const d = r.data || {}
      setAviso(`${d.conciliados} cobro(s) marcados como cobrados`
        + (d.dudosos?.length ? ` · ${d.dudosos.length} sin tocar por dudosos` : ''))
      cargar(mes)
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'No se pudo leer el extracto')
    } finally { setOcupado('') }
  }

  const EST = {
    cobrado: { txt: 'Cobrado', cls: 'bg-emerald-500/15 text-emerald-300' },
    pendiente: { txt: 'Pendiente', cls: 'bg-amber-500/15 text-amber-300' },
    en_prueba: { txt: 'En prueba', cls: 'bg-dark-700 text-dark-400' },
  }
  const eur = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`

  return (
    <div className="card mt-6 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-dark-100">
          <Receipt size={16} /> Cobros
        </h2>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
          className="rounded-lg border border-dark-700 bg-dark-900 px-2 py-1 text-xs text-dark-100" />
        <div className="flex-1" />
        <input ref={ficheroRef} type="file" accept=".csv,.txt,.xls,.xlsx,.q43,.n43"
          className="hidden" onChange={conciliar} />
        <button onClick={() => ficheroRef.current?.click()} disabled={!!ocupado}
          className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          {ocupado === 'conciliar' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Conciliar con el extracto
        </button>
      </div>

      {err && <p className="mb-2 text-xs text-red-300">{err}</p>}
      {aviso && <p className="mb-2 text-xs text-emerald-300">{aviso}</p>}

      {!datos ? (
        <div className="flex items-center gap-2 text-sm text-dark-400"><Loader2 size={14} className="animate-spin" /> Cargando…</div>
      ) : datos.cobros.length === 0 ? (
        <p className="text-sm text-dark-500">Todavía no hay clientes a los que cobrar.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-4 text-xs">
            <span className="text-dark-400">Facturado <b className="text-dark-100">{eur(datos.resumen.facturado)}</b></span>
            <span className="text-emerald-300">Cobrado <b>{eur(datos.resumen.cobrado)}</b></span>
            <span className="text-amber-300">Pendiente <b>{eur(datos.resumen.pendiente)}</b></span>
            {datos.resumen.en_prueba > 0 && <span className="text-dark-500">{datos.resumen.en_prueba} en prueba</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-dark-500">
                  <th className="pb-2 text-left font-semibold">Cliente</th>
                  <th className="pb-2 text-right font-semibold">Furgos</th>
                  <th className="pb-2 text-right font-semibold">Base</th>
                  <th className="pb-2 text-right font-semibold">Total</th>
                  <th className="pb-2 text-left font-semibold">Estado</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {datos.cobros.map((c) => {
                  const e = EST[c.estado] || EST.pendiente
                  return (
                    <tr key={c.id}>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-dark-100">{c.org_nombre}</div>
                        <div className="text-[11px] text-dark-600">{c.plan}</div>
                      </td>
                      <td className="py-2 text-right text-dark-300">{c.vehiculos}</td>
                      <td className="py-2 text-right text-dark-400">{eur(c.base)}</td>
                      <td className="py-2 text-right font-semibold text-dark-100">{eur(c.total)}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.cls}`}>{e.txt}</span>
                      </td>
                      <td className="py-2 text-right">
                        {c.estado === 'pendiente' && (
                          <button onClick={() => marcar(c, 'cobrado')} disabled={ocupado === c.id}
                            className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 disabled:opacity-50">
                            <Check size={12} /> Cobrado
                          </button>
                        )}
                        {c.estado === 'cobrado' && (
                          <button onClick={() => marcar(c, 'pendiente')} disabled={ocupado === c.id}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-dark-500 hover:text-dark-300 disabled:opacity-50">
                            <Undo2 size={12} /> Deshacer
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] text-dark-600">
            Esto lleva el control de qué cobrar, no emite la factura legal: esa la
            haces con tu programa de facturación o tu gestoría.
          </p>
        </>
      )}
    </div>
  )
}


/* Quién emite las facturas. Hace falta para el borrador y, cuando el banco dé
   el identificador de acreedor, para el fichero de domiciliación SEPA. */
function DatosEmisor() {
  const [d, setD] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    adminGetEmisor().then((r) => setD(r.data || {})).catch(() => setD({}))
  }, [])

  const set = (k, v) => { setD((x) => ({ ...x, [k]: v })); setAviso('') }

  const guardar = async () => {
    setGuardando(true); setErr(''); setAviso('')
    try { await adminSetEmisor(d); setAviso('Datos guardados') }
    catch (e) { setErr(e?.response?.data?.detail || 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  if (!d) return null

  return (
    <div className="card mt-6 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-dark-100">
          <Building size={16} /> Tus datos de facturación
        </h2>
        <button onClick={guardar} disabled={guardando}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          {guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </div>

      {err && <p className="mb-2 text-xs text-red-300">{err}</p>}
      {aviso && <p className="mb-2 text-xs text-emerald-300">{aviso}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label key="razon_social" className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">Razón social *</span>
              <input value={d.razon_social || ''} placeholder="Mi Empresa SL"
                onChange={(e) => set('razon_social', e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-sm text-dark-100 placeholder:text-dark-700" />
            </label>
            <label key="nif" className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">NIF / CIF *</span>
              <input value={d.nif || ''} placeholder="B12345678"
                onChange={(e) => set('nif', e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-sm text-dark-100 placeholder:text-dark-700" />
            </label>
            <label key="direccion" className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">Dirección</span>
              <input value={d.direccion || ''} placeholder="C/ Ejemplo 1"
                onChange={(e) => set('direccion', e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-sm text-dark-100 placeholder:text-dark-700" />
            </label>
            <label key="cp" className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">C.P.</span>
              <input value={d.cp || ''} placeholder="15701"
                onChange={(e) => set('cp', e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-sm text-dark-100 placeholder:text-dark-700" />
            </label>
            <label key="ciudad" className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">Ciudad</span>
              <input value={d.ciudad || ''} placeholder="Santiago"
                onChange={(e) => set('ciudad', e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-sm text-dark-100 placeholder:text-dark-700" />
            </label>
            <label key="provincia" className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">Provincia</span>
              <input value={d.provincia || ''} placeholder="A Coruña"
                onChange={(e) => set('provincia', e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-sm text-dark-100 placeholder:text-dark-700" />
            </label>
            <label key="email" className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">Email de facturación</span>
              <input value={d.email || ''} placeholder="facturas@…"
                onChange={(e) => set('email', e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-sm text-dark-100 placeholder:text-dark-700" />
            </label>
            <label key="telefono" className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">Teléfono</span>
              <input value={d.telefono || ''} placeholder="6…"
                onChange={(e) => set('telefono', e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-sm text-dark-100 placeholder:text-dark-700" />
            </label>
            <label key="iban" className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">IBAN donde cobras</span>
              <input value={d.iban || ''} placeholder="ES00 0000 …"
                onChange={(e) => set('iban', e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-sm text-dark-100 placeholder:text-dark-700" />
            </label>
            <label key="identificador_acreedor" className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-dark-500">Identificador de acreedor (para domiciliar)</span>
              <input value={d.identificador_acreedor || ''} placeholder="ES00ZZZ…"
                onChange={(e) => set('identificador_acreedor', e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5 text-sm text-dark-100 placeholder:text-dark-700" />
            </label>
      </div>

      <p className="mt-3 text-[11px] text-dark-600">
        El identificador de acreedor te lo da tu banco al contratar los adeudos
        SEPA. Sin él no se puede generar la domiciliación.
      </p>
    </div>
  )
}

export default function Negocio() {
  const nav = useNavigate()
  const { t } = useT()
  const ST = {
    active:    { label: t('neg.status.active'),    cls: 'bg-emerald-500/15 text-emerald-400' },
    trial:     { label: t('neg.status.trial'),     cls: 'bg-sky-500/15 text-sky-400' },
    suspended: { label: t('neg.status.suspended'), cls: 'bg-red-500/15 text-red-400' },
    canceled:  { label: t('neg.status.canceled'),  cls: 'bg-dark-700 text-dark-300' },
  }
  const [ov, setOv] = useState(null)
  const [orgs, setOrgs] = useState(null)
  const [leads, setLeads] = useState(null)
  const [offers, setOffers] = useState(null)
  const [founders, setFounders] = useState(null)
  const [offerForm, setOfferForm] = useState(null)   // null = cerrado
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  function load() {
    getAdminOverview().then((r) => setOv(r.data)).catch(() => {})
    getAdminOrgs().then((r) => setOrgs(r.data?.orgs || [])).catch(() => setOrgs([]))
    getLeads().then((r) => setLeads(r.data?.leads || [])).catch(() => setLeads([]))
    adminGetDriverOffers().then((r) => setOffers(r.data?.offers || [])).catch(() => setOffers([]))
    adminGetFounderReservations().then((r) => setFounders(r.data?.reservations || [])).catch(() => setFounders([]))
  }
  useEffect(load, [])

  async function saveOffer(e) {
    e.preventDefault()
    setBusy('offer'); setMsg('')
    try {
      await adminCreateDriverOffer(offerForm)
      setOfferForm(null); setMsg('Oferta creada ✓'); load()
    } catch (e2) { setMsg(e2?.response?.data?.detail || 'No se pudo crear la oferta') }
    finally { setBusy('') }
  }

  async function toggleOffer(o) {
    setBusy(o.id)
    try { await adminToggleDriverOffer(o.id, !o.active); load() }
    catch { setMsg('No se pudo cambiar el estado') } finally { setBusy('') }
  }

  async function removeOffer(o) {
    if (!window.confirm(`¿Eliminar la oferta «${o.title}»? Se perderán sus métricas.`)) return
    setBusy(o.id)
    try { await adminDeleteDriverOffer(o.id); load() }
    catch { setMsg('No se pudo eliminar') } finally { setBusy('') }
  }

  async function act(id, body, label) {
    setBusy(id); setMsg('')
    try { await updateOrg({ id, ...body }); setMsg(`${label} ✓`); load() }
    catch (e) { setMsg(e?.response?.data?.detail || 'Error') }
    finally { setBusy('') }
  }

  async function impersonate(o) {
    setBusy(o.id)
    try {
      const r = await impersonateOrg(o.id)
      if (r.data?.token) {
        localStorage.setItem('flotadsp_token_super', localStorage.getItem('flotadsp_token'))
        localStorage.setItem('flotadsp_token', r.data.token)
        localStorage.setItem('flotadsp_admin', JSON.stringify({ name: o.name, role: 'admin', account_type: 'dsp', slug: r.data.slug, centers: o.centers || [], impersonating: true }))
        nav('/panel'); window.location.reload()
      }
    } catch { setMsg(t('neg.impersonate.err')) } finally { setBusy('') }
  }

  async function removeOrg(o) {
    if (!window.confirm(t('neg.delete.confirm').replace('{n}', o.name))) return
    setBusy(o.id)
    try { await deleteOrg(o.id); setMsg(t('neg.deleted')); load() }
    catch { setMsg(t('neg.delete.err')) } finally { setBusy('') }
  }

  async function doBackup() {
    setBusy('backup'); setMsg('')
    try { const r = await backupNow(); setMsg(`Backup hecho: ${r.data?.documents} docs, ${r.data?.size_mb}MB`) }
    catch { setMsg('Backup falló') } finally { setBusy('') }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('neg.title')}</h1>
        <button onClick={load} className="btn-secondary flex items-center gap-1.5 text-sm"><RefreshCw size={14} /> {t('neg.refresh')}</button>
      </div>

      {msg && <div className="mb-3 rounded-lg bg-brand-500/10 px-3 py-2 text-sm text-brand-300">{msg}</div>}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={Building2} label={t('neg.kpi.clients')} value={ov?.dsps_total ?? '—'} accent="#0ea5e9" />
        <Kpi icon={CheckCircle2} label={t('neg.kpi.active')} value={ov?.activos ?? '—'} accent="#34d399" />
        <Kpi icon={Clock} label={t('neg.kpi.trial')} value={ov?.en_prueba ?? '—'} accent="#fbbf24" />
        <Kpi icon={Euro} label={t('neg.kpi.mrr')} value={ov ? `${ov.mrr_estimado} €` : '—'} accent="#a78bfa" />
        <Kpi icon={Sparkles} label={t('neg.kpi.leads')} value={ov?.interesados ?? '—'} accent="#fb923c" />
      </div>

      <EditorTarifas />
      <Cobros />
      <DatosEmisor />

      {/* Facturación (honesto: facturas reales en Lemon Squeezy) */}
      <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">{t('neg.billing')}</h2>
          <p className="text-sm text-dark-400">{t('neg.billing.desc')} <b className="text-dark-100">{ov?.mrr_estimado ?? '—'} €/mes</b>. {t('neg.billing.lemon')}</p>
        </div>
        <a href="https://app.lemonsqueezy.com" target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-1.5 text-sm">{t('neg.billing.panel')} <ExternalLink size={14} /></a>
      </div>

      {/* Clientes / DSPs */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-dark-500">{t('neg.clients')}</h2>
      {!orgs ? (
        <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('neg.loading')}</div>
      ) : orgs.length === 0 ? (
        <div className="card p-8 text-center text-dark-400">{t('neg.no.clients')}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-dark-800 text-left text-xs uppercase tracking-wide text-dark-500">
              <th className="px-3 py-2.5">{t('neg.col.company')}</th><th className="px-3 py-2.5">{t('neg.col.status')}</th><th className="px-3 py-2.5">{t('neg.col.plan')}</th>
              <th className="px-3 py-2.5">{t('neg.col.centers')}</th><th className="px-3 py-2.5">{t('neg.col.trial')}</th><th className="px-3 py-2.5 text-right">{t('neg.col.actions')}</th>
            </tr></thead>
            <tbody>
              {orgs.map((o) => {
                const st = ST[o.status] || ST.canceled
                const isBusy = busy === o.id
                return (
                  <tr key={o.id} className="border-b border-dark-800/60 align-middle hover:bg-dark-800/30">
                    <td className="px-3 py-2.5"><div className="font-semibold">{o.name}</div><div className="text-[11px] text-dark-500">/{o.slug}</div></td>
                    <td className="px-3 py-2.5"><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span></td>
                    <td className="px-3 py-2.5 text-dark-300">{o.plan || '—'}</td>
                    <td className="px-3 py-2.5 text-dark-400">{(o.centers || []).join(', ') || '—'}</td>
                    <td className="px-3 py-2.5 text-dark-400">{o.dias_prueba != null ? `${o.dias_prueba}d` : '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {o.status !== 'active' && (
                          <button disabled={isBusy} onClick={() => act(o.id, { status: 'active' }, t('neg.activate'))} className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs text-emerald-400" title={t('neg.activate')}><Gift size={14} /> {t('neg.activate')}</button>
                        )}
                        <button disabled={isBusy} onClick={() => act(o.id, { extend_trial_days: 14 }, 'Prueba +14d')} className="btn-ghost px-2 py-1 text-xs" title="Ampliar prueba 14 días"><Clock size={14} /></button>
                        {o.status !== 'suspended' && (
                          <button disabled={isBusy} onClick={() => act(o.id, { status: 'suspended' }, 'Suspendido')} className="btn-ghost px-2 py-1 text-xs text-amber-400" title="Suspender"><PauseCircle size={14} /></button>
                        )}
                        <button disabled={isBusy} onClick={() => impersonate(o)} className="btn-ghost px-2 py-1 text-xs text-sky-400" title="Entrar como este cliente"><LogIn size={14} /></button>
                        <button disabled={isBusy} onClick={() => removeOrg(o)} className="btn-ghost px-2 py-1 text-xs text-red-400" title="Eliminar"><Trash2 size={14} /></button>
                        {isBusy && <Loader2 size={14} className="animate-spin text-dark-400" />}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Leads */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-dark-500">{t('neg.leads')}</h2>
      {!leads ? null : leads.length === 0 ? (
        <div className="card p-6 text-center text-dark-400">{t('neg.no.leads')}</div>
      ) : (
        <div className="card divide-y divide-dark-800">
          {leads.slice(0, 30).map((l, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="font-medium">{l.name || l.email || '—'}</span>
              <span className="text-dark-400">{l.email}</span>
              <span className="text-dark-400">{l.phone || ''}</span>
              <span className="text-xs text-dark-500">{(l.created_at || '').slice(0, 10)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Reservas fundador — llamar y cerrar la venta */}
      <h2 className="mb-2 mt-6 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-dark-500">
        <Star size={13} className="text-amber-400" /> Reservas fundador
      </h2>
      {!founders ? null : founders.length === 0 ? (
        <div className="card p-6 text-center text-sm text-dark-400">
          Aún no hay reservas. La oferta está viva en <a href="https://flotadsp.com/planes" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">flotadsp.com/planes</a> — compártela con DSPs que conozcas.
        </div>
      ) : (
        <div className="card divide-y divide-dark-800">
          {founders.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="font-semibold">{f.name}</span>
              <a href={`mailto:${f.email}`} className="text-sky-400 hover:underline">{f.email}</a>
              {f.phone ? <a href={`tel:${f.phone}`} className="font-semibold text-emerald-400 hover:underline">{f.phone}</a> : <span className="text-dark-600">sin teléfono</span>}
              <span className="text-dark-400">{f.fleet_size ? `${f.fleet_size} furgos` : '—'}</span>
              <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${f.status === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                {f.status === 'pending' ? 'Por llamar' : f.status}
              </span>
              <span className="text-xs text-dark-500">{(f.created_at || '').slice(0, 10)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Ofertas del portal conductor — el espacio patrocinado */}
      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-dark-500">
          <Megaphone size={13} className="text-brand-400" /> Ofertas del portal conductor
        </h2>
        {!offerForm && (
          <button
            onClick={() => setOfferForm({ emoji: '🎁', title: '', description: '', cta: '', url: 'https://', active: true })}
            className="btn-secondary flex items-center gap-1.5 py-1.5 text-xs"
          >
            <Plus size={13} /> Nueva oferta
          </button>
        )}
      </div>

      {offerForm && (
        <form onSubmit={saveOffer} className="card mb-3 grid gap-2.5 p-4 sm:grid-cols-2">
          <div className="flex gap-2">
            <div className="w-16">
              <label className="label">Emoji</label>
              <input className="input text-center text-lg" value={offerForm.emoji} onChange={e => setOfferForm(f => ({ ...f, emoji: e.target.value }))} />
            </div>
            <div className="flex-1">
              <label className="label">Título *</label>
              <input className="input" required maxLength={120} placeholder="Neumáticos -20% para conductores DSP" value={offerForm.title} onChange={e => setOfferForm(f => ({ ...f, title: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Texto del botón</label>
            <input className="input" maxLength={60} placeholder="Reservar cita" value={offerForm.cta} onChange={e => setOfferForm(f => ({ ...f, cta: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Descripción</label>
            <input className="input" maxLength={240} placeholder="Descuento exclusivo presentando el código FLOTA en cualquier taller de la cadena." value={offerForm.description} onChange={e => setOfferForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">URL de destino * (https://)</label>
            <input className="input" required type="url" pattern="https://.*" value={offerForm.url} onChange={e => setOfferForm(f => ({ ...f, url: e.target.value }))} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy === 'offer'} className="btn-primary flex items-center gap-1.5 text-sm">
              {busy === 'offer' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Publicar oferta
            </button>
            <button type="button" onClick={() => setOfferForm(null)} className="btn-secondary text-sm">Cancelar</button>
          </div>
        </form>
      )}

      {!offers ? null : offers.length === 0 ? (
        <div className="card p-6 text-center text-sm text-dark-400">
          Sin ofertas propias: el portal muestra la auto-promo de referidos. Crea la primera cuando cierres un patrocinador.
        </div>
      ) : (
        <div className="card divide-y divide-dark-800">
          {offers.map((o) => {
            const ctr = o.views ? Math.round(((o.clicks || 0) / o.views) * 100) : 0
            const isBusy = busy === o.id
            return (
              <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="text-xl">{o.emoji || '🎁'}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{o.title}</div>
                  <div className="truncate text-xs text-dark-500">{o.url}</div>
                </div>
                <span className="flex items-center gap-1 text-xs text-dark-300" title="Veces mostrada">
                  <Eye size={13} className="text-dark-500" /> {o.views ?? 0}
                </span>
                <span className="flex items-center gap-1 text-xs text-dark-300" title="Clics">
                  <MousePointerClick size={13} className="text-dark-500" /> {o.clicks ?? 0}
                </span>
                <span className="text-xs text-dark-500" title="Ratio de clics">{ctr}% CTR</span>
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${o.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-dark-700 text-dark-400'}`}>
                  {o.active ? 'Activa' : 'Pausada'}
                </span>
                <button disabled={isBusy} onClick={() => toggleOffer(o)} className="btn-ghost p-1.5" title={o.active ? 'Pausar' : 'Activar'}>
                  {o.active ? <Pause size={14} className="text-amber-400" /> : <Play size={14} className="text-emerald-400" />}
                </button>
                <button disabled={isBusy} onClick={() => removeOffer(o)} className="btn-ghost p-1.5 text-red-400" title="Eliminar">
                  <Trash2 size={14} />
                </button>
                {isBusy && <Loader2 size={13} className="animate-spin text-dark-400" />}
              </div>
            )
          })}
        </div>
      )}

      {/* Herramientas */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-dark-500">{t('neg.tools')}</h2>
      <div className="flex flex-wrap gap-3">
        <button onClick={doBackup} disabled={busy === 'backup'} className="btn-secondary flex items-center gap-2 text-sm">
          {busy === 'backup' ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />} {t('neg.backup')}
        </button>
        <a href={`${API_BASE}/ai/export-dataset`} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2 text-sm">
          <BrainCircuit size={15} /> {t('neg.export.ai')}
        </a>
      </div>
    </div>
  )
}
