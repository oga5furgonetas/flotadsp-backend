import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Briefcase, Plus, Copy, Check, Loader2, AlertTriangle, Trash2, X,
  MessageCircle, IdCard, ChevronRight, Link2,
} from 'lucide-react'
import { useT } from '../../i18n'
import {
  getOfertas, crearOferta, editarOferta,
  getCandidatos, moverCandidato, contratarCandidato, borrarCandidato,
} from '../api'

/* EMPLEO — LA OFERTA, EL CUESTIONARIO Y EL TABLERO DE CANDIDATOS.
   ══════════════════════════════════════════════════════════════════════════
   El anuncio (Indeed o donde sea) apunta al enlace de la oferta; quien se
   apunta cae aquí; y «contratar» crea la ficha del conductor con lo que él
   mismo escribió, que es el paso que evita las fichas tecleadas a mano.

   El CENTRO de la oferta no es decorativo: decide en qué tablero salen sus
   candidatos y en qué nave nace la ficha al contratarlos. Una oferta de
   Coruña guardada en OGA5 mete a esa gente en el cuadrante de Santiago, así
   que aquí es obligatorio y el backend lo comprueba contra los centros de la
   empresa. */

const FASES = ['nuevo', 'llamado', 'entrevista', 'prueba', 'contratado', 'descartado']

const COLOR_FASE = {
  nuevo: 'bg-sky-500/10 text-sky-300 ring-sky-500/20',
  llamado: 'bg-violet-500/10 text-violet-300 ring-violet-500/20',
  entrevista: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  prueba: 'bg-orange-500/10 text-orange-300 ring-orange-500/20',
  contratado: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
  descartado: 'bg-dark-800 text-dark-400 ring-dark-700',
}

const PREGUNTA_NUEVA = () => ({
  id: Math.random().toString(36).slice(2, 10),
  texto: '', tipo: 'si_no', opciones: ['Si', 'No'], obligatoria: true, descarta: [],
})

const OFERTA_VACIA = (centro) => ({
  titulo: '', centro: centro && centro !== 'Todos' ? centro : '',
  ciudad: '', jornada: '', salario: '', descripcion: '', requisitos: '',
  activa: true, preguntas: [],
})

const clave = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export default function Empleo() {
  const { t } = useT()
  const { center, centers } = useOutletContext()
  const [ofertas, setOfertas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null)
  const [cands, setCands] = useState([])
  const [editando, setEditando] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [copiado, setCopiado] = useState('')
  const [abierto, setAbierto] = useState(null)

  const centrosReales = useMemo(
    () => (centers || []).filter((c) => c && c !== 'Todos'), [centers])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { data } = await getOfertas({ center })
      setOfertas(data.ofertas || [])
      setError('')
    } catch (e) {
      setError(e?.response?.data?.detail || t('empleo.errCargar'))
    } finally { setCargando(false) }
  }, [center, t])

  useEffect(() => { cargar() }, [cargar])

  const cargarCands = useCallback(async (oferta) => {
    setSel(oferta)
    try {
      const { data } = await getCandidatos({ oferta: oferta?.id, center })
      setCands(data.candidatos || [])
    } catch { setCands([]) }
  }, [center])

  const copiar = async (texto, cual) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(cual); setTimeout(() => setCopiado(''), 1800) } catch { /* sin portapapeles */ }
  }

  const guardar = async () => {
    const o = editando
    if (!o.titulo.trim()) { setError(t('empleo.faltaTitulo')); return }
    if (!o.centro) { setError(t('empleo.faltaCentro')); return }
    setGuardando(true)
    try {
      if (o.id) await editarOferta(o.id, o)
      else await crearOferta(o)
      setEditando(null)
      setError('')
      await cargar()
    } catch (e) {
      setError(e?.response?.data?.detail || t('empleo.errGuardar'))
    } finally { setGuardando(false) }
  }

  const mover = async (c, fase) => {
    try {
      const { data } = await moverCandidato(c.id, { fase })
      setCands((xs) => xs.map((x) => (x.id === c.id ? { ...x, ...data } : x)))
    } catch (e) { setError(e?.response?.data?.detail || t('empleo.errMover')) }
  }

  const contratar = async (c) => {
    try {
      await contratarCandidato(c.id)
      await cargarCands(sel)
      await cargar()
    } catch (e) { setError(e?.response?.data?.detail || t('empleo.errContratar')) }
  }

  const borrar = async (c) => {
    if (!window.confirm(t('empleo.confirmBorrar'))) return
    try {
      await borrarCandidato(c.id)
      setCands((xs) => xs.filter((x) => x.id !== c.id))
    } catch (e) { setError(e?.response?.data?.detail || t('empleo.errBorrar')) }
  }

  const porFase = useMemo(() => {
    const m = {}
    for (const f of FASES) m[f] = cands.filter((c) => (c.fase || 'nuevo') === f)
    return m
  }, [cands])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-dark-50">
            <Briefcase size={20} className="text-brand-400" /> {t('empleo.titulo')}
          </h1>
          <p className="text-sm text-dark-500">{t('empleo.sub')}</p>
        </div>
        <button onClick={() => { setEditando(OFERTA_VACIA(center)); setError('') }}
          className="flex items-center gap-2 rounded-lg bg-brand-500/15 px-3 py-2 text-sm font-semibold text-brand-300 ring-1 ring-brand-500/30 hover:bg-brand-500/25">
          <Plus size={15} /> {t('empleo.nueva')}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span className="min-w-0">{error}</span>
        </div>
      )}

      {editando && (
        <EditorOferta oferta={editando} setOferta={setEditando} centros={centrosReales}
          guardando={guardando} onGuardar={guardar} onCerrar={() => setEditando(null)} t={t} />
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-dark-800 px-4 py-3 text-sm font-semibold text-dark-200">
          {t('empleo.ofertas')} <span className="text-dark-500">· {ofertas.length}</span>
        </div>
        {cargando && <div className="p-6 text-center text-dark-500"><Loader2 className="mx-auto animate-spin" /></div>}
        {!cargando && ofertas.length === 0 && (
          <div className="p-6 text-center text-sm text-dark-500">{t('empleo.vacio')}</div>
        )}
        <div className="divide-y divide-dark-800">
          {ofertas.map((o) => (
            <div key={o.id} className={`px-4 py-3 ${sel?.id === o.id ? 'bg-sky-500/5' : ''}`}>
              <div className="flex items-center gap-3">
                <button onClick={() => cargarCands(o)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-dark-100">{o.titulo}</span>
                    {/* El centro va SIEMPRE a la vista: es lo que decide en qué
                        nave acaba esta gente, y confundirlo no da ningún error. */}
                    <span className="shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-300">{o.centro || '—'}</span>
                    {!o.activa && <span className="shrink-0 rounded bg-dark-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-dark-400">{t('empleo.cerrada')}</span>}
                  </div>
                  <div className="truncate text-xs text-dark-500">
                    {[o.ciudad, o.jornada, o.salario].filter(Boolean).join(' · ') || '—'}
                  </div>
                </button>
                <div className="w-[70px] shrink-0 text-right leading-tight">
                  <div className="cifra text-base font-bold text-dark-200">{o.candidatos || 0}</div>
                  <div className="text-[10px] uppercase text-dark-500">{t('empleo.candidatos')}</div>
                </div>
                <ChevronRight size={14} className="shrink-0 text-dark-600" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="max-w-full truncate rounded bg-dark-900 px-2 py-1 text-[11px] text-dark-400">{o.url}</code>
                <button onClick={() => copiar(o.url, o.id)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">
                  {copiado === o.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copiado === o.id ? t('empleo.copiado') : t('empleo.copiar')}
                </button>
                <button onClick={() => copiar(o.url_indeed, o.id + 'i')}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">
                  {copiado === o.id + 'i' ? <Check size={12} className="text-emerald-400" /> : <Link2 size={12} />}
                  {t('empleo.paraIndeed')}
                </button>
                <button onClick={() => { setEditando({ ...o, preguntas: (o.preguntas || []).map((p) => ({ ...p })) }); setError('') }}
                  className="rounded-lg px-2 py-1 text-[11px] text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">{t('empleo.editar')}</button>
                <button onClick={() => editarOferta(o.id, { activa: !o.activa }).then(cargar)}
                  className="rounded-lg px-2 py-1 text-[11px] text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">
                  {o.activa ? t('empleo.cerrar') : t('empleo.reabrir')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {sel && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dark-800 px-4 py-3">
            <div className="text-sm font-semibold text-dark-200">
              {sel.titulo} <span className="text-dark-500">· {sel.centro}</span>
            </div>
            <button onClick={() => { setSel(null); setCands([]) }} className="text-dark-500 hover:text-dark-200"><X size={16} /></button>
          </div>
          <div className="grid gap-3 overflow-x-auto p-4 md:grid-cols-3 xl:grid-cols-6">
            {FASES.map((f) => (
              <div key={f} className="min-w-0">
                <div className={`mb-2 inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${COLOR_FASE[f]}`}>
                  {t('empleo.fase.' + f)} · {porFase[f].length}
                </div>
                <div className="space-y-2">
                  {porFase[f].map((c) => (
                    <div key={c.id} className="rounded-lg border border-dark-800 bg-dark-900/60 p-2">
                      <button onClick={() => setAbierto(abierto === c.id ? null : c.id)} className="w-full text-left">
                        <div className="truncate text-xs font-medium text-dark-100">{c.nombre}</div>
                        <div className="truncate text-[11px] text-dark-500">{[c.ciudad, c.experiencia].filter(Boolean).join(' · ') || '—'}</div>
                      </button>
                      {c.descarte_automatico && (
                        <div className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-300">
                          {t('empleo.aptoNo')}: {c.motivo_descarte}
                        </div>
                      )}
                      {abierto === c.id && (
                        <div className="mt-2 space-y-1.5 border-t border-dark-800 pt-2">
                          <div className="text-[11px] text-dark-400">{c.telefono || '—'} · {c.origen}</div>
                          {c.email && <div className="truncate text-[11px] text-dark-400">{c.email}</div>}
                          {(sel.preguntas || []).map((p) => (
                            <div key={p.id} className="text-[11px]">
                              <span className="text-dark-500">{p.texto}: </span>
                              <span className="text-dark-200">
                                {Array.isArray(c.respuestas?.[p.id]) ? (c.respuestas[p.id].join(', ') || '—') : (c.respuestas?.[p.id] || '—')}
                              </span>
                            </div>
                          ))}
                          <div className="flex flex-wrap gap-1 pt-1">
                            {/* El enlace de WhatsApp lo da el backend (gotcha 47). */}
                            {c.wa && (
                              <a href={c.wa} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-emerald-300 ring-1 ring-emerald-500/30">
                                <MessageCircle size={11} /> WhatsApp
                              </a>
                            )}
                            {FASES.filter((x) => x !== f && x !== 'contratado').map((x) => (
                              <button key={x} onClick={() => mover(c, x)}
                                className="rounded px-1.5 py-1 text-[10px] text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">
                                {t('empleo.fase.' + x)}
                              </button>
                            ))}
                            {!c.driver_id && (
                              <button onClick={() => contratar(c)}
                                className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                                <IdCard size={11} /> {t('empleo.contratar')}
                              </button>
                            )}
                            <button onClick={() => borrar(c)} aria-label={t('empleo.borrar')}
                              className="rounded px-1.5 py-1 text-[10px] text-red-300 ring-1 ring-red-500/30">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EditorOferta({ oferta, setOferta, centros, guardando, onGuardar, onCerrar, t }) {
  const set = (k, v) => setOferta((o) => ({ ...o, [k]: v }))
  const setP = (i, k, v) => setOferta((o) => ({
    ...o, preguntas: o.preguntas.map((p, j) => (j === i ? { ...p, [k]: v } : p)),
  }))

  const cambiarTipo = (i, tipo) => setOferta((o) => ({
    ...o,
    preguntas: o.preguntas.map((p, j) => {
      if (j !== i) return p
      // Al cambiar de tipo hay que rehacer opciones Y descartes: si se
      // quedaran los viejos, el backend rechazaría la oferta entera por un
      // descarte que ya no está entre las opciones.
      const opciones = tipo === 'si_no' ? ['Si', 'No'] : (tipo === 'opcion' || tipo === 'varias') ? ['', ''] : []
      return { ...p, tipo, opciones, descarta: [] }
    }),
  }))

  const setOpcion = (i, k, v) => setOferta((o) => ({
    ...o,
    preguntas: o.preguntas.map((p, j) => (j === i ? { ...p, opciones: p.opciones.map((x, y) => (y === k ? v : x)) } : p)),
  }))

  const toggleDescarta = (i, opcion) => setOferta((o) => ({
    ...o,
    preguntas: o.preguntas.map((p, j) => {
      if (j !== i) return p
      const k = clave(opcion)
      const hay = (p.descarta || []).some((d) => clave(d) === k)
      return { ...p, descarta: hay ? p.descarta.filter((d) => clave(d) !== k) : [...(p.descarta || []), opcion] }
    }),
  }))

  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-dark-200">{oferta.id ? t('empleo.editarOferta') : t('empleo.nuevaOferta')}</div>
        <button onClick={onCerrar} className="text-dark-500 hover:text-dark-200"><X size={16} /></button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label={t('empleo.tituloOferta')} value={oferta.titulo} onChange={(v) => set('titulo', v)} placeholder="Conductor de reparto" />
        <div>
          <label className="mb-1 block text-xs text-dark-500">{t('empleo.centro')}</label>
          <select value={oferta.centro || ''} onChange={(e) => set('centro', e.target.value)}
            className="w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-100">
            <option value="">{t('empleo.eligeCentro')}</option>
            {centros.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-dark-500">{t('empleo.centroAyuda')}</p>
        </div>
        <Campo label={t('empleo.ciudad')} value={oferta.ciudad} onChange={(v) => set('ciudad', v)} placeholder="Santiago de Compostela" />
        <Campo label={t('empleo.jornada')} value={oferta.jornada} onChange={(v) => set('jornada', v)} placeholder="Jornada completa" />
        <Campo label={t('empleo.salario')} value={oferta.salario} onChange={(v) => set('salario', v)} placeholder="Segun convenio" />
        <Campo label={t('empleo.requisitos')} value={oferta.requisitos} onChange={(v) => set('requisitos', v)} placeholder="Carnet B con 1 ano" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-dark-500">{t('empleo.descripcion')}</label>
        <textarea value={oferta.descripcion} onChange={(e) => set('descripcion', e.target.value)} rows={3}
          className="w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-100" />
      </div>

      <div className="rounded-xl border border-dark-800 p-3">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold text-dark-200">{t('empleo.cuestionario')}</div>
          <button onClick={() => setOferta((o) => ({ ...o, preguntas: [...(o.preguntas || []), PREGUNTA_NUEVA()] }))}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">
            <Plus size={13} /> {t('empleo.anadirPregunta')}
          </button>
        </div>
        <p className="mb-3 text-[11px] text-dark-500">{t('empleo.cuestionarioAyuda')}</p>

        {(oferta.preguntas || []).length === 0 && (
          <p className="text-xs text-dark-500">{t('empleo.sinPreguntas')}</p>
        )}

        <div className="space-y-3">
          {(oferta.preguntas || []).map((p, i) => (
            <div key={p.id || i} className="rounded-lg border border-dark-800 bg-dark-900/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input value={p.texto} onChange={(e) => setP(i, 'texto', e.target.value)}
                  placeholder={t('empleo.enunciado')}
                  className="min-w-0 flex-1 rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-100" />
                <select value={p.tipo} onChange={(e) => cambiarTipo(i, e.target.value)}
                  className="rounded-lg border border-dark-700 bg-dark-900 px-2 py-2 text-xs text-dark-100">
                  <option value="si_no">{t('empleo.tipo.si_no')}</option>
                  <option value="opcion">{t('empleo.tipo.opcion')}</option>
                  <option value="varias">{t('empleo.tipo.varias')}</option>
                  <option value="texto">{t('empleo.tipo.texto')}</option>
                  <option value="numero">{t('empleo.tipo.numero')}</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-dark-400">
                  <input type="checkbox" checked={p.obligatoria !== false}
                    onChange={(e) => setP(i, 'obligatoria', e.target.checked)} />
                  {t('empleo.obligatoria')}
                </label>
                <button onClick={() => setOferta((o) => ({ ...o, preguntas: o.preguntas.filter((_, j) => j !== i) }))}
                  aria-label={t('empleo.quitarPregunta')} className="rounded p-1 text-red-300 ring-1 ring-red-500/30">
                  <Trash2 size={13} />
                </button>
              </div>

              {(p.tipo === 'si_no' || p.tipo === 'opcion' || p.tipo === 'varias') && (
                <div className="mt-2 space-y-1.5">
                  {(p.opciones || []).map((op, k) => (
                    <div key={k} className="flex flex-wrap items-center gap-2">
                      <input value={op} disabled={p.tipo === 'si_no'}
                        onChange={(e) => setOpcion(i, k, e.target.value)}
                        placeholder={t('empleo.opcion') + ' ' + (k + 1)}
                        className="min-w-0 flex-1 rounded-lg border border-dark-700 bg-dark-900 px-3 py-1.5 text-sm text-dark-100 disabled:text-dark-400" />
                      <label className="flex items-center gap-1.5 text-[11px] text-amber-300">
                        <input type="checkbox"
                          checked={(p.descarta || []).some((d) => clave(d) === clave(op))}
                          onChange={() => toggleDescarta(i, op)} />
                        {t('empleo.descarta')}
                      </label>
                      {p.tipo !== 'si_no' && (p.opciones || []).length > 2 && (
                        <button onClick={() => setOferta((o) => ({
                          ...o,
                          preguntas: o.preguntas.map((q, j) => (j === i ? {
                            ...q,
                            opciones: q.opciones.filter((_, y) => y !== k),
                            descarta: (q.descarta || []).filter((d) => clave(d) !== clave(op)),
                          } : q)),
                        }))} aria-label={t('empleo.quitarOpcion')} className="rounded p-1 text-dark-400">
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  {p.tipo !== 'si_no' && (p.opciones || []).length < 8 && (
                    <button onClick={() => setP(i, 'opciones', [...(p.opciones || []), ''])}
                      className="text-[11px] text-dark-400 hover:text-dark-200">+ {t('empleo.opcion')}</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onGuardar} disabled={guardando}
          className="flex items-center gap-2 rounded-lg bg-brand-500/15 px-3 py-2 text-sm font-semibold text-brand-300 ring-1 ring-brand-500/30 disabled:opacity-50">
          {guardando && <Loader2 size={14} className="animate-spin" />} {t('empleo.guardar')}
        </button>
        <button onClick={onCerrar} className="rounded-lg px-3 py-2 text-sm text-dark-300 ring-1 ring-dark-700">{t('empleo.cancelar')}</button>
      </div>
    </div>
  )
}

function Campo({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-dark-500">{label}</label>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-100" />
    </div>
  )
}
