import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Briefcase, Plus, Copy, Check, Loader2, AlertTriangle, Trash2, X,
  MessageCircle, IdCard, Link2, Search, Download, FileText,
  Phone, Mail, Calendar, MapPin, Clock, ExternalLink, Save, History,
  TrendingUp, UserPlus,
} from 'lucide-react'
import { useT } from '../../i18n'
import {
  getOfertas, crearOferta, editarOferta,
  getCandidatos, moverCandidato, contratarCandidato, borrarCandidato,
} from '../api'

/* EMPLEO — DE LA OFERTA AL ALTA DEL CONDUCTOR.
   ══════════════════════════════════════════════════════════════════════════
   Un tablero de selección de verdad, no una lista con botones:

   · SE ARRASTRA de una columna a otra. Es lo que hace que un tablero sea un
     tablero; con botones hay que leer seis etiquetas para mover a uno.
   · LA FICHA SE ABRE AL LADO, no dentro de la tarjeta. Abriendo la tarjeta se
     descolocaba la columna entera y se perdía de vista el resto.
   · «SIN TOCAR DESDE HACE N DÍAS» en rojo. Es el único número que evita perder
     gente: a los tres días sin llamar ya están en otra empresa. Sale del
     historial, que apunta quién movió a quién y cuándo.
   · EL EMBUDO ARRIBA con la conversión real: cuántos entran, cuántos se llaman
     y cuántos acaban de alta. Sin eso no se sabe si el problema es que no llega
     gente o que no se la llama.
   · DE DÓNDE VIENE cada uno (indeed, whatsapp…), que ya se guardaba y no se veía.

   El CENTRO de la oferta no es decorativo: decide en qué tablero salen sus
   candidatos y en qué nave nace la ficha al contratarlos. */

const FASES = ['nuevo', 'llamado', 'entrevista', 'prueba', 'contratado', 'descartado']

const FASE = {
  nuevo: { pill: 'bg-sky-500/10 text-sky-300 ring-sky-500/20', barra: 'bg-sky-500' },
  llamado: { pill: 'bg-violet-500/10 text-violet-300 ring-violet-500/20', barra: 'bg-violet-500' },
  entrevista: { pill: 'bg-amber-500/10 text-amber-300 ring-amber-500/20', barra: 'bg-amber-500' },
  prueba: { pill: 'bg-orange-500/10 text-orange-300 ring-orange-500/20', barra: 'bg-orange-500' },
  contratado: { pill: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20', barra: 'bg-emerald-500' },
  descartado: { pill: 'bg-dark-800 text-dark-400 ring-dark-700', barra: 'bg-dark-700' },
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

const clave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const dia = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—')

/* Días desde el último movimiento. Se mide desde `tocado_en` si alguien lo
   movió, y si no desde que se apuntó: un candidato que nadie ha tocado lleva
   esperando desde que llegó, no desde hoy. */
function diasQuieto(c) {
  const ref = c.tocado_en || c.creado_en
  if (!ref) return null
  const d = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000)
  return Number.isFinite(d) && d >= 0 ? d : null
}

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
  const [ficha, setFicha] = useState(null)
  const [busca, setBusca] = useState('')
  const [soloOrigen, setSoloOrigen] = useState('')
  /* QUE SE ARRASTRA, EN UN REF Y NO EN UN ESTADO. `setState` no se aplica
     hasta el siguiente render, asi que un arrastre corto —o rapido— llegaba al
     `drop` con el valor todavia vacio y la tarjeta no se movia: el tablero
     parecia roto sin dar ningun error. Con un ref el valor esta ya en la misma
     vuelta. Y ademas se escribe el id en el `dataTransfer`, que es lo que hace
     que el navegador de verdad lo trate como un arrastre. */
  const arrastraRef = useRef(null)
  const [encima, setEncima] = useState('')

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
    setSel(oferta); setBusca(''); setSoloOrigen(''); setFicha(null)
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
      if (o.id) await editarOferta(o.id, o); else await crearOferta(o)
      setEditando(null); setError(''); await cargar()
    } catch (e) {
      setError(e?.response?.data?.detail || t('empleo.errGuardar'))
    } finally { setGuardando(false) }
  }

  const actualizar = (c, datos) => setCands((xs) => xs.map((x) => (x.id === c.id ? { ...x, ...datos } : x)))

  const mover = async (c, fase) => {
    if (!c || c.fase === fase) return
    // Se pinta ya y se corrige si el servidor dice otra cosa: arrastrar tiene
    // que responder al instante o no se siente como arrastrar.
    const antes = c.fase
    actualizar(c, { fase })
    if (ficha?.id === c.id) setFicha((f) => ({ ...f, fase }))
    try {
      const { data } = await moverCandidato(c.id, { fase })
      actualizar(c, data)
      if (ficha?.id === c.id) setFicha((f) => ({ ...f, ...data }))
    } catch (e) {
      actualizar(c, { fase: antes })
      setError(e?.response?.data?.detail || t('empleo.errMover'))
    }
  }

  const contratar = async (c) => {
    try {
      const { data } = await contratarCandidato(c.id)
      actualizar(c, { fase: 'contratado', driver_id: data.driver_id })
      setFicha(null)
      await cargar()
    } catch (e) { setError(e?.response?.data?.detail || t('empleo.errContratar')) }
  }

  const borrar = async (c) => {
    if (!window.confirm(t('empleo.confirmBorrar'))) return
    try {
      await borrarCandidato(c.id)
      setCands((xs) => xs.filter((x) => x.id !== c.id))
      setFicha(null)
    } catch (e) { setError(e?.response?.data?.detail || t('empleo.errBorrar')) }
  }

  const guardarNotas = async (c, notas) => {
    try {
      const { data } = await moverCandidato(c.id, { notas })
      actualizar(c, data)
      return true
    } catch { setError(t('empleo.errMover')); return false }
  }

  /* Buscar y filtrar antes de repartir en columnas: filtrando después, el
     contador de cada columna diría una cosa y la columna enseñaría otra. */
  const visibles = useMemo(() => {
    const q = clave(busca)
    return cands.filter((c) => {
      if (soloOrigen && (c.origen || 'directo') !== soloOrigen) return false
      if (!q) return true
      return clave(`${c.nombre} ${c.telefono} ${c.ciudad} ${c.email} ${c.dni}`).includes(q)
    })
  }, [cands, busca, soloOrigen])

  const porFase = useMemo(() => {
    const m = {}
    for (const f of FASES) m[f] = visibles.filter((c) => (c.fase || 'nuevo') === f)
    return m
  }, [visibles])

  const origenes = useMemo(
    () => [...new Set(cands.map((c) => c.origen || 'directo'))].sort(), [cands])

  /* El embudo. Sin esto no se sabe si el problema es que no llega gente o que
     no se la llama, que son dos problemas distintos con dos soluciones. */
  const embudo = useMemo(() => {
    const n = cands.length
    const enProceso = cands.filter((c) => ['llamado', 'entrevista', 'prueba'].includes(c.fase)).length
    const alta = cands.filter((c) => c.fase === 'contratado').length
    const tocados = cands.filter((c) => c.fase !== 'nuevo').length
    const olvidados = cands.filter((c) => c.fase === 'nuevo' && (diasQuieto(c) ?? 0) >= 3).length
    return { n, enProceso, alta, olvidados, pct: n ? Math.round((tocados / n) * 100) : 0 }
  }, [cands])

  /* Descargar lo que se está viendo. CSV con punto y coma y BOM: es lo que
     Excel en español abre en columnas de una vez, sin el asistente. */
  const exportar = () => {
    const cab = ['Nombre', 'Teléfono', 'Correo', 'DNI', 'Edad', 'Ciudad', 'Carnet desde',
      'Experiencia', 'Disponibilidad', 'Origen', 'Fase', 'Motivo', 'Notas', 'Día', 'CV']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const filas = visibles.map((c) => [
      c.nombre, c.telefono, c.email, c.dni, c.edad, c.ciudad, c.carnet_desde,
      c.experiencia, c.disponibilidad, c.origen, c.fase, c.motivo_descarte, c.notas,
      (c.creado_en || '').slice(0, 10), c.cv_url,
    ].map(esc).join(';'))
    const csv = '﻿' + [cab.map(esc).join(';'), ...filas].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `candidatos-${(sel?.slug || 'oferta')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

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
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span className="min-w-0 flex-1">{error}</span>
          <button onClick={() => setError('')} className="shrink-0 text-red-400/70"><X size={14} /></button>
        </div>
      )}

      {editando && (
        <EditorOferta oferta={editando} setOferta={setEditando} centros={centrosReales}
          guardando={guardando} onGuardar={guardar} onCerrar={() => setEditando(null)} t={t} />
      )}

      <ListaOfertas ofertas={ofertas} cargando={cargando} sel={sel} t={t}
        onAbrir={cargarCands} onEditar={(o) => { setEditando({ ...o, preguntas: (o.preguntas || []).map((p) => ({ ...p })) }); setError('') }}
        onCerrarOferta={(o) => editarOferta(o.id, { activa: !o.activa }).then(cargar)}
        copiar={copiar} copiado={copiado} />

      {sel && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-dark-800 px-4 py-3">
            <div className="text-sm font-semibold text-dark-200">
              {sel.titulo} <span className="text-dark-500">· {sel.centro}</span>
            </div>
            <div className="relative ml-auto">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-600" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('empleo.buscar')}
                className="w-48 rounded-lg border border-dark-700 bg-dark-950 py-1.5 pl-7 pr-2 text-[12px] text-dark-100 outline-none focus:border-brand-500/40" />
            </div>
            {origenes.length > 1 && (
              <select value={soloOrigen} onChange={(e) => setSoloOrigen(e.target.value)}
                className="rounded-lg border border-dark-700 bg-dark-950 px-2 py-1.5 text-[12px] text-dark-100">
                <option value="">{t('empleo.todosOrigenes')}</option>
                {origenes.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            )}
            <button onClick={exportar} disabled={!visibles.length}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-dark-300 ring-1 ring-dark-700 hover:text-dark-100 disabled:opacity-40">
              <Download size={13} /> {t('empleo.exportar')}
            </button>
            <button onClick={() => { setSel(null); setCands([]); setFicha(null) }} className="text-dark-500 hover:text-dark-200"><X size={16} /></button>
          </div>

          <Embudo e={embudo} t={t} />

          <div className="grid gap-4 p-4 xl:grid-cols-[1fr_340px]">
            {/* ── El tablero ─────────────────────────────────────────── */}
            <div className="grid gap-2.5 overflow-x-auto md:grid-cols-3 2xl:grid-cols-6">
              {FASES.map((f) => (
                <div key={f}
                  onDragOver={(e) => { e.preventDefault(); setEncima(f) }}
                  onDragLeave={() => setEncima((x) => (x === f ? '' : x))}
                  onDrop={(e) => {
                    e.preventDefault(); setEncima('')
                    const id = e.dataTransfer?.getData('text/plain') || ''
                    const c = cands.find((x) => x.id === id) || arrastraRef.current
                    if (c) mover(c, f)
                    arrastraRef.current = null
                  }}
                  className={`min-w-0 rounded-lg p-1 transition ${encima === f ? 'bg-brand-500/10 ring-1 ring-brand-500/40' : ''}`}>
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${FASE[f].pill}`}>
                      {t('empleo.fase.' + f)}
                    </span>
                    <span className="cifra text-[11px] font-bold text-dark-500">{porFase[f].length}</span>
                  </div>
                  <div className="space-y-2">
                    {porFase[f].map((c) => (
                      <Tarjeta key={c.id} c={c} t={t} activa={ficha?.id === c.id}
                        onAbrir={() => setFicha(c)}
                        onArrastrar={(e) => {
                          arrastraRef.current = c
                          try { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move' } catch { /* navegador raro */ }
                        }}
                        onSoltar={() => { arrastraRef.current = null }} />
                    ))}
                    {porFase[f].length === 0 && (
                      <p className="rounded-lg border border-dashed border-dark-800 px-2 py-4 text-center text-[11px] text-dark-700">
                        {encima === f ? t('empleo.suelta') : '—'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ── La ficha, al lado ──────────────────────────────────── */}
            <div className="xl:sticky xl:top-4 xl:self-start">
              {ficha ? (
                <FichaCandidato c={cands.find((x) => x.id === ficha.id) || ficha} oferta={sel} t={t}
                  onCerrar={() => setFicha(null)} onMover={mover} onContratar={contratar}
                  onBorrar={borrar} onNotas={guardarNotas} />
              ) : (
                <div className="rounded-xl border border-dashed border-dark-800 p-6 text-center text-[12.5px] text-dark-600">
                  {t('empleo.eligeCandidato')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── El embudo ────────────────────────────────────────────────────────── */
function Embudo({ e, t }) {
  if (!e.n) return null
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-dark-800 px-4 py-2.5 text-[12px]">
      <span className="text-dark-400">
        <b className="cifra text-[15px] text-dark-100">{e.n}</b> {t('empleo.candidatos')}
      </span>
      <span className="text-dark-400">
        <b className="cifra text-[15px] text-dark-100">{e.enProceso}</b> {t('empleo.enProceso')}
      </span>
      <span className="text-dark-400">
        <b className="cifra text-[15px] text-emerald-300">{e.alta}</b> {t('empleo.deAlta')}
      </span>
      <span className="flex items-center gap-1 text-dark-500">
        <TrendingUp size={12} /> {e.pct} % {t('empleo.atendidos')}
      </span>
      {/* El único número que evita perder gente: a los tres días sin llamar ya
          están en otra empresa. */}
      {e.olvidados > 0 && (
        <span className="ml-auto flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1 font-semibold text-red-300 ring-1 ring-red-500/25">
          <Clock size={12} /> {e.olvidados} {t('empleo.sinLlamar')}
        </span>
      )}
    </div>
  )
}

/* ── Una tarjeta del tablero ──────────────────────────────────────────── */
function Tarjeta({ c, t, activa, onAbrir, onArrastrar, onSoltar }) {
  const quieto = diasQuieto(c)
  const urge = c.fase === 'nuevo' && (quieto ?? 0) >= 3
  return (
    <button
      draggable
      onDragStart={(e) => onArrastrar(e)}
      onDragEnd={onSoltar}
      onClick={onAbrir}
      className={`w-full cursor-grab rounded-lg border bg-dark-900/60 p-2 text-left transition active:cursor-grabbing ${
        activa ? 'border-brand-500/50 bg-brand-500/5' : 'border-dark-800 hover:border-dark-700'}`}>
      <div className="truncate text-xs font-medium text-dark-100">{c.nombre}</div>
      <div className="truncate text-[11px] text-dark-500">
        {[c.ciudad, c.edad ? `${c.edad} a` : '', c.disponibilidad].filter(Boolean).join(' · ') || '—'}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
        <span className="rounded bg-dark-800 px-1 py-px text-dark-400">{c.origen}</span>
        <span className="text-dark-600">{dia(c.creado_en)}</span>
        {c.cv_url && <FileText size={10} className="text-brand-400" />}
        {urge && (
          <span className="ml-auto rounded bg-red-500/15 px-1 py-px font-semibold text-red-300">
            {quieto} {t('empleo.dias')}
          </span>
        )}
      </div>
      {c.descarte_automatico && (
        <div className="mt-1 truncate rounded bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-300">
          {c.motivo_descarte}
        </div>
      )}
    </button>
  )
}

/* ── La ficha completa ────────────────────────────────────────────────── */
function FichaCandidato({ c, oferta, t, onCerrar, onMover, onContratar, onBorrar, onNotas }) {
  const [notas, setNotas] = useState(c.notas || '')
  const [guardando, setGuardando] = useState(false)
  const idRef = useRef(c.id)
  useEffect(() => {
    // Al cambiar de candidato se recarga su nota; si no, se le escribiría la
    // del anterior encima, que es un dato falso en la ficha de otra persona.
    if (idRef.current !== c.id) { idRef.current = c.id; setNotas(c.notas || '') }
  }, [c.id, c.notas])

  const hist = [...(c.historial || [])].reverse()

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start gap-2 border-b border-dark-800 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-dark-50">{c.nombre}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-dark-500">
            <span className={`rounded px-1.5 py-px font-semibold uppercase ring-1 ${FASE[c.fase || 'nuevo'].pill}`}>
              {t('empleo.fase.' + (c.fase || 'nuevo'))}
            </span>
            <span>{t('empleo.apuntado')} {dia(c.creado_en)}</span>
            <span className="rounded bg-dark-800 px-1 py-px">{c.origen}</span>
          </div>
        </div>
        <button onClick={onCerrar} className="shrink-0 text-dark-600 hover:text-dark-300"><X size={15} /></button>
      </div>

      {/* Lo primero, lo que hace falta para llamarle. */}
      <div className="flex flex-wrap gap-1.5 border-b border-dark-800 px-3.5 py-2.5">
        {c.telefono && (
          <a href={`tel:${c.telefono}`} className="flex items-center gap-1.5 rounded-lg bg-dark-800/60 px-2.5 py-1.5 text-[12px] font-medium text-dark-200 hover:bg-dark-800">
            <Phone size={12} /> {c.telefono}
          </a>
        )}
        {c.wa && (
          <a href={c.wa} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[12px] font-medium text-emerald-300 ring-1 ring-emerald-500/25">
            <MessageCircle size={12} /> WhatsApp
          </a>
        )}
        {c.cv_url && (
          <a href={c.cv_url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-brand-500/10 px-2.5 py-1.5 text-[12px] font-medium text-brand-300 ring-1 ring-brand-500/25">
            <FileText size={12} /> {t('empleo.verCv')} <ExternalLink size={10} />
          </a>
        )}
      </div>

      <div className="space-y-3 px-3.5 py-3">
        <Datos c={c} t={t} />

        {(oferta.preguntas || []).length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-dark-900/60 p-2.5">
            {(oferta.preguntas || []).map((p) => {
              const v = c.respuestas?.[p.id]
              const txt = Array.isArray(v) ? v.join(', ') : v
              const fuera = c.descarte_automatico && (c.motivo_descarte || '').includes(p.texto)
              return (
                <div key={p.id} className="text-[11.5px]">
                  <div className="text-dark-500">{p.texto}</div>
                  <div className={fuera ? 'font-semibold text-amber-300' : 'text-dark-200'}>
                    {txt || '—'} {fuera && `· ${t('empleo.aptoNo')}`}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Mover: los seis botones a la vista, porque arrastrar no vale en el
            móvil y la oficina también abre esto desde una tablet. */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-dark-600">{t('empleo.moverA')}</div>
          <div className="flex flex-wrap gap-1.5">
            {FASES.filter((x) => x !== 'contratado').map((x) => (
              <button key={x} onClick={() => onMover(c, x)} disabled={c.fase === x}
                className={`rounded-lg px-2 py-1 text-[11.5px] ring-1 ${
                  c.fase === x ? 'bg-dark-800 text-dark-500 ring-dark-700' : 'text-dark-300 ring-dark-700 hover:text-dark-100'}`}>
                {t('empleo.fase.' + x)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-dark-600">{t('empleo.notas')}</div>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3}
            placeholder={t('empleo.notasAyuda')}
            className="w-full rounded-lg border border-dark-700 bg-dark-950 px-2.5 py-2 text-[12.5px] text-dark-100 outline-none focus:border-brand-500/40" />
          {notas !== (c.notas || '') && (
            <button onClick={async () => { setGuardando(true); await onNotas(c, notas); setGuardando(false) }}
              disabled={guardando}
              className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-brand-500/15 px-2.5 py-1 text-[11.5px] font-semibold text-brand-300 ring-1 ring-brand-500/30">
              {guardando ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} {t('empleo.guardar')}
            </button>
          )}
        </div>

        {hist.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-dark-600">
              <History size={11} /> {t('empleo.historial')}
            </div>
            <div className="space-y-1">
              {hist.slice(0, 6).map((h, i) => (
                <div key={i} className="flex items-baseline gap-1.5 text-[11px] text-dark-500">
                  <span className="cifra shrink-0 text-dark-600">{dia(h.en)}</span>
                  <span className="min-w-0">
                    {t('empleo.fase.' + (h.a || 'nuevo'))}
                    {h.por && <span className="text-dark-600"> · {h.por}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-dark-800 px-3.5 py-2.5">
        {!c.driver_id ? (
          <button onClick={() => onContratar(c)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-[12.5px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25">
            <UserPlus size={13} /> {t('empleo.contratar')}
          </button>
        ) : (
          <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-[12.5px] font-semibold text-emerald-300">
            <IdCard size={13} /> {t('empleo.tieneFicha')}
          </span>
        )}
        <button onClick={() => onBorrar(c)} aria-label={t('empleo.borrar')} title={t('empleo.borrar')}
          className="rounded-lg px-2.5 py-2 text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/10">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function Datos({ c, t }) {
  const filas = [
    [Mail, c.email],
    [IdCard, [c.dni, c.edad ? `${c.edad} ${t('empleo.anos')}` : ''].filter(Boolean).join(' · ')],
    [MapPin, c.ciudad],
    [Calendar, [c.carnet_desde && `${t('empleo.carnet')} ${c.carnet_desde}`, c.disponibilidad].filter(Boolean).join(' · ')],
    [Briefcase, c.experiencia],
  ].filter(([, v]) => v)
  if (!filas.length) return null
  return (
    <div className="grid gap-1">
      {filas.map(([Icon, v], i) => (
        <div key={i} className="flex items-center gap-1.5 text-[12px] text-dark-300">
          <Icon size={12} className="shrink-0 text-dark-600" /> <span className="min-w-0 truncate">{v}</span>
        </div>
      ))}
    </div>
  )
}

/* ── La lista de ofertas ──────────────────────────────────────────────── */
function ListaOfertas({ ofertas, cargando, sel, t, onAbrir, onEditar, onCerrarOferta, copiar, copiado }) {
  return (
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
              <button onClick={() => onAbrir(o)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-dark-100">{o.titulo}</span>
                  {/* El centro va SIEMPRE a la vista: decide en qué nave acaba
                      esta gente, y confundirlo no da ningún error. */}
                  <span className="shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-300">{o.centro || '—'}</span>
                  {!o.activa && <span className="shrink-0 rounded bg-dark-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-dark-400">{t('empleo.cerrada')}</span>}
                </div>
                <div className="truncate text-xs text-dark-500">
                  {[o.ciudad, o.jornada, o.salario].filter(Boolean).join(' · ') || '—'}
                </div>
              </button>
              {/* Barra del embudo: se ve de un vistazo dónde se atasca. */}
              <div className="hidden h-1.5 w-40 shrink-0 overflow-hidden rounded-full bg-dark-800 sm:flex">
                {FASES.map((f) => {
                  const n = o.por_fase?.[f] || 0
                  if (!n || !o.candidatos) return null
                  return <span key={f} className={FASE[f].barra} style={{ width: `${(n / o.candidatos) * 100}%` }} title={`${t('empleo.fase.' + f)}: ${n}`} />
                })}
              </div>
              <div className="w-[70px] shrink-0 text-right leading-tight">
                <div className="cifra text-base font-bold text-dark-200">{o.candidatos || 0}</div>
                <div className="text-[10px] uppercase text-dark-500">{t('empleo.candidatos')}</div>
              </div>
            </div>

            {Object.keys(o.por_origen || {}).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {Object.entries(o.por_origen).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                  <span key={k} className="rounded bg-dark-900 px-1.5 py-0.5 text-[10px] text-dark-400">
                    {k} · <b className="text-dark-200">{n}</b>
                  </span>
                ))}
              </div>
            )}

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
              <a href={o.url} target="_blank" rel="noreferrer"
                className="rounded-lg px-2 py-1 text-[11px] text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">
                {t('empleo.verla')}
              </a>
              <button onClick={() => onEditar(o)}
                className="rounded-lg px-2 py-1 text-[11px] text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">{t('empleo.editar')}</button>
              <button onClick={() => onCerrarOferta(o)}
                className="rounded-lg px-2 py-1 text-[11px] text-dark-300 ring-1 ring-dark-700 hover:text-dark-100">
                {o.activa ? t('empleo.cerrar') : t('empleo.reabrir')}
              </button>
            </div>
          </div>
        ))}
      </div>
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
