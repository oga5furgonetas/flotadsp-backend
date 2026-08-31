import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import { Loader2, FileUp, Truck, Info } from 'lucide-react'
import { importVehicles } from '../api'

export default function Importaciones() {
  const { center } = useOutletContext()
  const { t } = useT()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [crear, setCrear] = useState(false)

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const r = await importVehicles(file, center, crear)
      const d = r.data || {}
      /* Se enseña el mensaje que manda el backend, no uno recompuesto aquí:
         antes se leía `d.creados`, `d.created` o `d.importados` y el backend
         devuelve `imported`, así que SIEMPRE ponía «0 nuevos» aunque hubiera
         importado cincuenta. Y el del backend además dice qué hacer cuando
         algo se omite. */
      setMsg({ ok: true, t: d.message || 'Importado.' })
    } catch (err) {
      setMsg({ ok: false, t: err?.response?.data?.detail || 'No se pudo importar el archivo.' })
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="rise mb-6 font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">{t('imp.title')}</h1>
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.t}</div>}

      <div className="card p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-dark-200"><Truck size={16} /> {t('imp.fleet.title')}</div>
        <p className="mb-3 text-sm text-dark-400">{center !== 'Todos' ? t('imp.fleet.desc.center').replace('{center}', center) : t('imp.fleet.desc.all')}</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" id="imp-file" />
        <label htmlFor="imp-file" className="btn-primary inline-flex cursor-pointer items-center gap-2">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} {t('imp.choose.file')}
        </label>
        {/* La casilla que decide si se dan de alta las que no estén. Va sin
            marcar a propósito: el fichero más habitual es el de Amazon, que
            trae 600 furgonetas de toda la región y solo unas pocas son tuyas.
            Crear de más ensucia la flota y hay que borrarlas una a una; no
            crear solo obliga a repetir la importación. */}
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-[13px] text-dark-300">
          <input type="checkbox" checked={crear} onChange={(e) => setCrear(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-500" />
          <span>
            Dar de alta las que no estén
            <span className="mt-0.5 block text-[12px] text-dark-500">
              Márcalo si este fichero es TU flota. Déjalo sin marcar si es el listado
              de Amazon, que trae furgonetas de otras empresas.
            </span>
          </span>
        </label>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-dark-500"><Info size={13} className="mt-0.5 shrink-0" /> {t('imp.columns.hint')}</p>
      </div>
    </div>
  )
}
