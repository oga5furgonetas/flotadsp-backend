import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  Loader2, CheckCircle2, Check, X, ChevronLeft, ChevronRight, User, Clock,
  AlertTriangle, BrainCircuit, Pencil, Plus, FileText, TrendingUp, EyeOff,
  Zap, HelpCircle,
} from 'lucide-react'
import { getReviewQueue, getInspection, getAiDatasetStats, damageFeedback, markReviewed, missedDamage, submitAiFeedback, fetchAuthedBlob, autoexamenIA, iaParaRevisar } from '../api'
import PolygonEditor from '../components/PolygonEditor'
import BboxEditor from '../components/BboxEditor'
import CompareSlider from '../components/CompareSlider'

/* REVISION EXPRES
   ─────────────────────────────────────────────────────────────────────────
   El problema no era que nadie quisiera revisar: era el coste. Revisar una
   inspeccion es abrirla, mirar cinco fotos y navegar; en 30 dias se hicieron
   11 revisiones sobre 1.568 inspecciones.

   Aqui se revisa UN DAÑO, no una inspeccion: la foto con el recuadro donde
   la IA dice que esta, y tres botones. Cinco segundos.

   El tercer boton —"No se ve"— no es un "no se". Es informacion distinta y
   valiosa: sin el, quien revisa tiene que marcar "no existe" cuando lo que
   pasa es que la foto no deja verlo, y eso entra en el aprendizaje como un
   falso positivo que no lo es. */
function RevisionExpres({ center, alCerrar, alGuardar }) {
  const [lista, setLista] = useState(null)
  const [i, setI] = useState(0)
  const [total, setTotal] = useState(0)
  const [hechas, setHechas] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [err, setErr] = useState('')
  const [descartados, setDescartados] = useState(0)
  const [ampliada, setAmpliada] = useState(false)

  useEffect(() => {
    iaParaRevisar(center, 25)
      .then((r) => {
        setLista(r.data?.pendientes || [])
        setTotal(r.data?.total_sin_revisar || 0)
        setDescartados(r.data?.no_validables || 0)
      })
      .catch(() => setLista([]))
  }, [center])

  /* DEFENSA EN PROFUNDIDAD. El backend ya filtra lo que no se puede juzgar,
     pero esta pantalla no puede fiarse: preguntar por un daño sin señalar
     donde esta es peor que no preguntar —quien revisa contesta "no existe"
     porque no lo ve, y esa respuesta entra en el aprendizaje como un falso
     positivo que no lo es—. Si llega uno sin recuadro utilizable, se salta. */
  const cajaValida = (b) => Array.isArray(b) && b.length === 4
    && b.every((x) => typeof x === 'number') && b[2] > b[0] && b[3] > b[1]
  const actual = (lista || []).slice(i).find((x) => x.foto && cajaValida(x.box))

  const responder = async (verdict) => {
    if (!actual || ocupado) return
    setOcupado(true); setErr('')
    try {
      await damageFeedback(actual.inspection_id, {
        verdict, damage_index: actual.damage_index, scope: actual.scope || 'new',
      })
      setHechas((n) => n + 1)
      /* Al pasar de daño se cierra el zoom. Con las teclas 1-4 se puede
         contestar desde la foto ampliada, y la ampliacion no ensena ni
         matricula ni descripcion: si se quedara abierta, pasaria a mostrar
         la foto del SIGUIENTE daño sin avisar y la siguiente pulsacion
         validaria uno que nadie ha leido. Vuelve siempre a la ficha. */
      setAmpliada(false)
      // Se avanza desde la posicion del que se acaba de contestar, que no
      // tiene por que ser `i` si por el camino se salto alguno.
      setI((lista || []).findIndex((x) => x === actual) + 1)
      alGuardar?.()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se pudo guardar. Inténtalo otra vez.')
    } finally { setOcupado(false) }
  }

  /* Teclado para el que revisa desde el ordenador: 1 sí y está ahí, 2 sí pero
     no ahí, 3 no existe, 4 no se ve. Con raton son 25 clics; con teclado, 25
     pulsaciones sin mover la mano. */
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') return ampliada ? setAmpliada(false) : alCerrar?.()
      // Ctrl+1 / Cmd+1 es "ir a la primera pestaña del navegador", no una
      // respuesta: sin esto, cambiar de pestaña validaba un daño de paso.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '1') responder('correct')
      if (e.key === '2') responder('corrected')
      if (e.key === '3') responder('wrong')
      if (e.key === '4') responder('no_evaluable')
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  })

  const caja = actual?.box && actual.box.length === 4 ? {
    // box_2d viene [ymin, xmin, ymax, xmax] normalizado 0-1000
    top: `${actual.box[0] / 10}%`, left: `${actual.box[1] / 10}%`,
    height: `${(actual.box[2] - actual.box[0]) / 10}%`,
    width: `${(actual.box[3] - actual.box[1]) / 10}%`,
  } : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-dark-950/95 backdrop-blur">
      <div className="flex items-center gap-3 border-b border-dark-800 px-4 py-3">
        <Zap size={17} className="text-violet-400" />
        <span className="text-sm font-semibold text-dark-100">Revisión exprés</span>
        {!!hechas && <span className="text-[13px] text-emerald-400">{hechas} revisadas</span>}
        <span className="ml-auto text-[13px] text-dark-500">
          {lista ? `${hechas + 1} de ${(lista || []).filter((x) => x.foto && cajaValida(x.box)).length}` : ''}
          {total > (lista?.length || 0) && ` · ${total} sin revisar`}
        </span>
        <button onClick={alCerrar} className="text-dark-400 hover:text-dark-100"><X size={20} /></button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
        {!lista ? (
          <Loader2 size={26} className="animate-spin text-violet-400" />
        ) : !actual ? (
          <div className="max-w-sm text-center">
            <CheckCircle2 size={34} className="mx-auto mb-3 text-emerald-400" />
            <p className="text-[15px] font-semibold text-dark-100">
              {hechas ? `Listo — ${hechas} revisadas.` : 'No hay daños pendientes de revisar.'}
            </p>
            {total > hechas && (
              <p className="mt-1 text-[13px] text-dark-400">Quedan {total - hechas} para otro rato.</p>
            )}
            {!!descartados && (
              <p className="mx-auto mt-3 max-w-xs text-[12.5px] leading-relaxed text-dark-500">
                Otros {descartados} daños no se preguntan aquí: la IA no dijo en qué foto
                están ni marcó dónde, así que no se pueden confirmar de un vistazo.
              </p>
            )}
            <button onClick={alCerrar} className="btn-primary mt-4 text-sm">Cerrar</button>
          </div>
        ) : (
          <div className="w-full max-w-lg">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold text-dark-50">{actual.matricula}</span>
              <span className="rounded bg-dark-800 px-2 py-0.5 text-[12px] capitalize text-dark-300">
                {actual.pieza}
              </span>
              <span className="text-[12px] text-dark-500">{actual.fecha}</span>
              {/* Por qué esta y no otra: el orden es por lo que enseña. */}
              {actual.validaciones_pieza < 5 && (
                <span className="rounded bg-violet-500/15 px-2 py-0.5 text-[11.5px] text-violet-300">
                  pieza poco vista ({actual.validaciones_pieza})
                </span>
              )}
            </div>

            {/* LA DESCRIPCION VA ANTES QUE LA FOTO, y no al reves.
                Lo que se valida es la AFIRMACION de la IA ("carcasa del
                retrovisor izquierdo rota"), no el rectangulo. Con el recuadro
                arriba, la vista va primero ahi y se contesta sobre el sitio
                marcado — que puede estar mal— en vez de sobre el daño. */}
            {actual.descripcion && (
              <p className="mb-2 text-[15px] leading-snug text-dark-100">{actual.descripcion}</p>
            )}

            {/* El contenedor se ajusta a la imagen (inline-block + la imagen
                como bloque): asi el recuadro, que va en porcentajes, cae sobre
                la imagen y no sobre las bandas negras que deja `object-contain`
                cuando la proporcion no coincide. */}
            <div className="flex justify-center">
              <button onClick={() => setAmpliada(true)}
                className="relative inline-block cursor-zoom-in overflow-hidden rounded-xl border border-dark-800 bg-dark-900">
                <img src={actual.foto} alt="" className="block max-h-[46vh] w-auto max-w-full" />
                {caja && (
                  <span className="pointer-events-none absolute border-2 border-dashed border-amber-400"
                    style={caja} />
                )}
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-2 py-0.5 text-[11px] text-dark-200">
                  tocar para ampliar
                </span>
              </button>
            </div>

            {/* El recuadro es una PISTA, no una certeza. Medido: la IA situo
                un retrovisor izquierdo en la trasera del vehiculo. Decirlo
                aqui es lo que evita que alguien conteste "No existe" cuando
                lo que falla es el sitio. */}
            {caja && (
              <p className="mt-1.5 text-center text-[12px] text-dark-500">
                El recuadro es donde <b className="text-dark-400">la IA cree</b> que está. A veces se equivoca de sitio:
                mira la furgoneta entera antes de contestar.
              </p>
            )}

            {err && (
              <p className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{err}</p>
            )}

            <p className="mt-4 text-center text-[14px] text-dark-400">
              ¿Existe este daño en la furgoneta?
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button disabled={ocupado} onClick={() => responder('correct')}
                className="flex min-h-[62px] items-center justify-center gap-2 rounded-xl border border-emerald-600/50 bg-emerald-600/10 px-2 text-[14.5px] font-semibold text-emerald-300 disabled:opacity-40">
                <Check size={19} /> Sí, y está ahí <span className="text-[11px] text-emerald-400/60">1</span>
              </button>
              {/* La respuesta que faltaba. Se guarda como 'corrected', que NO
                  cuenta como falso positivo en las lecciones: el daño existe,
                  lo que falla es donde lo puso. */}
              <button disabled={ocupado} onClick={() => responder('corrected')}
                className="flex min-h-[62px] items-center justify-center gap-2 rounded-xl border border-amber-600/50 bg-amber-600/10 px-2 text-[14.5px] font-semibold text-amber-300 disabled:opacity-40">
                <Pencil size={19} /> Sí, pero no ahí <span className="text-[11px] text-amber-400/60">2</span>
              </button>
              <button disabled={ocupado} onClick={() => responder('wrong')}
                className="flex min-h-[62px] items-center justify-center gap-2 rounded-xl border border-red-600/50 bg-red-600/10 px-2 text-[14.5px] font-semibold text-red-300 disabled:opacity-40">
                <X size={19} /> No existe <span className="text-[11px] text-red-400/60">3</span>
              </button>
              <button disabled={ocupado} onClick={() => responder('no_evaluable')}
                className="flex min-h-[62px] items-center justify-center gap-2 rounded-xl border border-dark-700 px-2 text-[14.5px] font-semibold text-dark-300 disabled:opacity-40">
                <HelpCircle size={19} /> No se ve <span className="text-[11px] text-dark-500">4</span>
              </button>
            </div>
            <p className="mt-2 text-center text-[11.5px] leading-relaxed text-dark-600">
              «Sí, pero no ahí» = el daño existe y el recuadro está mal puesto.
              «No se ve» = la foto no deja juzgarlo. Ninguna de las dos cuenta como
              fallo de la IA en el sitio equivocado.
            </p>
          </div>
        )}
      </div>

      {/* AMPLIAR. Sin esto no se puede juzgar una rozadura de 10 cm en una
          foto de la furgoneta entera: la imagen se sirve a tamaño completo y
          el contenedor hace scroll, que en un movil es pellizcar para hacer
          zoom. */}
      {ampliada && actual && (
        <div className="fixed inset-0 z-[60] overflow-auto bg-black/95"
          onClick={() => setAmpliada(false)}>
          <button onClick={() => setAmpliada(false)}
            className="fixed right-3 top-3 z-10 rounded-full bg-black/70 p-2 text-dark-200">
            <X size={22} />
          </button>
          {/* SIN `min-w-full`. Con el, este div medía el ancho de la pantalla
              (1280 px) mientras la foto medía 1000, y como el recuadro se
              posiciona en PORCENTAJES sobre su contenedor, caía desplazado:
              medido, salía al 23 % cuando el dato decía 18 %. El contenedor
              tiene que medir EXACTAMENTE lo que la imagen. */}
          <div className="relative inline-block">
            {/* TAMAÑO NATURAL, sin `w-full`. Con el ancho al 100 % la foto se
                veia igual de pequeña que antes en un movil —no ampliaba nada—
                y no se podia juzgar una rozadura de 10 cm. A tamaño natural
                (las fotos vienen de 1000 px para arriba) la imagen desborda y
                el contenedor hace scroll: eso es poder mirar de cerca. */}
            <img src={actual.foto} alt="" className="block max-w-none" />
            {caja && (
              <span className="pointer-events-none absolute border-2 border-dashed border-amber-400"
                style={caja} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const GOAL = 3000

/* AUTOEXAMEN DE LA IA
   ─────────────────────────────────────────────────────────────────────────
   La tarjeta que habia aqui solo contaba ejemplos hacia una meta de 3.000.
   Eso dice cuanto has trabajado TU, no si la IA esta mejorando: se puede
   llegar a 3.000 con la IA acertando cada vez menos y la barra se veria
   igual de llena.

   Esto enseña lo otro —si acierta, donde falla y si la tendencia sube o
   baja— y enseña tambien la letra pequeña, porque un porcentaje sin su
   contexto es peor que no tener ninguno: aqui solo se mide lo REVISADO, y
   se revisa sobre todo cuando la IA reporta algo. */
function Autoexamen({ datos, total, alRevisar }) {
  const [abierto, setAbierto] = useState(false)
  if (!datos) return null

  const cob = datos.cobertura || {}
  const sinSenal = (cob.porcentaje ?? 100) < 5
  // Semanas con menos de 5 daños REPORTADOS no se pintan: con 2 casos, uno
  // solo mueve el porcentaje 50 puntos y la linea contaria una historia
  // falsa. El corte va sobre el mismo denominador que el porcentaje —si se
  // mira `total`, una semana entera de daños que se le escaparon pasa el
  // filtro y llega sin acierto que pintar.
  const ult = (datos.tendencia || []).filter((x) => x.reportados >= 5).slice(-8)
  /* CADA PORCENTAJE SOBRE SU DENOMINADOR, que el backend manda ya contado.
     "Se inventa" es una parte de lo que la IA REPORTÓ; "se le escapan", una
     parte de los daños que EXISTEN. Son dos preguntas distintas: dividir las
     dos entre el total de revisiones daba números que no significaban nada
     —y hundía a la pieza que acierta todo lo que dice pero no ve mucho—. */
  const pct = (k, den) => (den ? Math.round((100 * (datos.global?.[k] || 0)) / den) : null)
  const conSigno = (v) => (v == null ? '—' : `${v}%`)

  return (
    <div className="card mb-4 border-violet-500/30 bg-violet-500/5 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-violet-300">
          <BrainCircuit size={16} /> Cómo lo está haciendo la IA
        </span>
        <span className="text-sm font-bold text-dark-100">
          {total} / {GOAL.toLocaleString('es-ES')} ejemplos
        </span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-dark-800">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
          style={{ width: `${Math.min(100, (total / GOAL) * 100)}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Acierta', conSigno(datos.acierto), 'de lo que reporta'],
          ['Se inventa', conSigno(pct('wrong', datos.reportados)), 'de lo que reporta'],
          ['Se le escapan', conSigno(pct('missed', datos.reales)), 'de los daños reales'],
          ['Dice «sin daños»', conSigno(datos.cuando_calla?.porcentaje), 'de las inspecciones'],
        ].map(([k, v, pie]) => (
          <div key={k}>
            <p className="text-[10.5px] uppercase tracking-wider text-dark-500">{k}</p>
            <p className="text-[22px] font-bold leading-none tabular-nums text-dark-50">{v}</p>
            <p className="text-[11px] leading-tight text-dark-600">{pie}</p>
          </div>
        ))}
      </div>

      {/* Sin señal no hay aprendizaje posible. Es lo más importante de la
          tarjeta, así que va en rojo y por delante del detalle. */}
      {sinSenal && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/[0.08] px-3 py-2 text-[12.5px] leading-snug text-red-200">
          <EyeOff size={15} className="mt-0.5 flex-none" />
          Solo se revisa el {cob.porcentaje}% de las inspecciones ({cob.revisadas_30d} de{' '}
          {cob.inspecciones_30d} en 30 días). Sin revisiones la IA no aprende nada nuevo.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={alRevisar}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-violet-500">
          <Zap size={15} /> Revisar en 5 segundos
        </button>
        <button onClick={() => setAbierto((v) => !v)}
          className="text-[12.5px] font-semibold text-violet-300 hover:text-violet-200">
          {abierto ? 'Ocultar detalle' : 'Ver en qué falla'}
        </button>
      </div>

      {abierto && (
        <div className="mt-3 space-y-4 border-t border-white/[0.07] pt-3">
          {!!ult.length && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-dark-500">
                <TrendingUp size={12} /> Acierto por semana
              </p>
              <div className="flex items-end gap-1.5" style={{ height: 68 }}>
                {ult.map((s) => (
                  <div key={s.semana} className="flex flex-1 flex-col justify-end text-center"
                    title={`${s.semana}: ${s.acierto}% sobre ${s.reportados} daños reportados`}>
                    <div className="w-full rounded-t bg-violet-500/70"
                      style={{ height: `${Math.max(3, s.acierto * 0.5)}px` }} />
                    <p className="mt-1 text-[10px] tabular-nums text-dark-600">{s.acierto}%</p>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-dark-600">
                Solo semanas con 5 o más daños reportados: con menos, un caso mueve el porcentaje 20 puntos.
              </p>
            </div>
          )}

          {!!(datos.piezas || []).length && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-dark-500">
                Dónde más se equivoca
              </p>
              <ul className="space-y-1">
                {datos.piezas.slice(0, 6).map((p) => {
                  /* Cada pieza falla a SU manera y hay que decir cuál. Un
                     "0 inventados / 0% ok" hacía parecer pésima a una pieza
                     cuyo problema es justo el contrario: que se le escapan. */
                  const inventa = p.wrong >= p.missed
                  return (
                    <li key={p.pieza} className="flex items-center gap-2 text-[12.5px]">
                      <span className="flex-1 truncate capitalize text-dark-300">{p.pieza}</span>
                      <span className={`tabular-nums ${inventa ? 'text-red-300' : 'text-amber-300'}`}>
                        {inventa ? `${p.wrong} inventados` : `${p.missed} se le escapan`}
                      </span>
                      {/* El "% ok" es de lo que la pieza REPORTÓ, y por eso se
                          enseña solo si reportó algo: `p.reportados`. Antes se
                          decidía con `correct + wrong` pero se pintaba un
                          número calculado sobre TODOS los veredictos, así que
                          una pieza con 3 aciertos, 0 inventados y 7 escapados
                          salía como "30 % ok" acertando el 100 % de lo suyo. */}
                      <span className="w-16 text-right tabular-nums text-dark-500">
                        {p.reportados ? `${p.acierto}% ok` : '—'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {!!Object.keys(datos.no_evaluables || {}).length && (
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wider text-dark-500">
                Fotos que no ha podido juzgar
              </p>
              <p className="text-[12.5px] text-dark-300">
                {Object.entries(datos.no_evaluables).map(([m, n]) => `${m}: ${n}`).join(' · ')}
              </p>
            </div>
          )}

          <p className="text-[11.5px] leading-relaxed text-dark-500">{datos.aviso}</p>
        </div>
      )}
    </div>
  )
}

const SEV_CLS = {
  leve: 'bg-amber-500/20 text-amber-300', moderado: 'bg-orange-500/20 text-orange-300',
  grave: 'bg-red-500/20 text-red-300', critico: 'bg-red-600/30 text-red-200',
  sin_danos: 'bg-emerald-500/20 text-emerald-300', sin_analisis: 'bg-dark-700 text-dark-300',
}

function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d)) return s
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function RevisionRapida() {
  const { center } = useOutletContext()
  const { t } = useT()
  const sevLabel = (k) => t('sev.' + k) || k
  const [queue, setQueue] = useState(null)
  const [idx, setIdx] = useState(0)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [stats, setStats] = useState(null)
  const [verdicts, setVerdicts] = useState({}) // `${inspId}:${dmgIdx}` -> 'correct'|'wrong'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Dibujo de caja: drawMode = null | {type:'missed'} | {type:'corrected', dmgIndex}
  const [drawMode, setDrawMode] = useState(null)
  const [box, setBox] = useState(null)      // {left,top,w,h} en % de la imagen
  const [drag, setDrag] = useState(null)    // punto inicial mientras se arrastra
  const [showAnnotated, setShowAnnotated] = useState(true)  // toggle: foto IA vs original
  const [compareMode, setCompareMode] = useState(false)     // slider antes/después vs referencia
  const [partName, setPartName] = useState('')
  const [filterIA, setFilterIA] = useState(false)
  const [autoex, setAutoex] = useState(null)
  const [expres, setExpres] = useState(false)
  // Modal editor de polígono/bbox
  const [polyEdit, setPolyEdit] = useState(null) // { dmgIndex, damage, photoUrl, editorMode }
  const [polyEditorMode, setPolyEditorMode] = useState('polygon') // 'bbox' | 'polygon'
  const [fullInsp, setFullInsp] = useState(null) // inspección completa con daños

  const loadStats = useCallback(() => {
    getAiDatasetStats().then((r) => setStats(r.data)).catch(() => {})
    // Que falle el autoexamen no puede dejar a nadie sin cola de revision:
    // es informacion de apoyo, no el trabajo.
    autoexamenIA().then((r) => setAutoex(r.data)).catch(() => {})
  }, [])

  // Calcular item actual antes de cualquier return para poder usar hooks
  const displayQueue = queue ? (filterIA ? queue.filter(i => (i.annotated_photos || []).some(Boolean)) : queue) : []
  const item = displayQueue[idx] ?? null
  const total = stats?.total ?? 0

  useEffect(() => {
    setQueue(null); setIdx(0); setPhotoIdx(0); setErr(''); setFullInsp(null)
    getReviewQueue(center)
      .then((r) => setQueue(Array.isArray(r.data) ? r.data : r.data?.queue || []))
      .catch(() => setErr(t('rev.load.error')))
    loadStats()
  }, [center, loadStats])

  // Carga la inspección completa cuando cambia el item (el queue solo trae el conteo, no el array de daños)
  useEffect(() => {
    if (!item?.id) { setFullInsp(null); return }
    setFullInsp(null)
    getInspection(item.id)
      .then((r) => setFullInsp(r.data))
      .catch(() => setFullInsp({}))
  }, [item?.id])

  // Daños: inspección completa primero, luego fallbacks del item de queue
  // damageScope determina qué array usa el backend al validar
  const damageScope = fullInsp?.analysis?.new_damages?.length > 0 ? 'new'
    : fullInsp?.analysis?.damages?.length > 0 ? 'all'
    : item?.new_damages?.length > 0 ? 'new'
    : 'new'
  const allDamages = fullInsp?.analysis?.new_damages?.length > 0
    ? fullInsp.analysis.new_damages
    : fullInsp?.analysis?.damages?.length > 0
      ? fullInsp.analysis.damages
      : item?.new_damages?.length > 0
        ? item.new_damages
        : item?.analysis?.new_damages || []
  // Un daño ya registrado en el ledger del vehículo NO se vuelve a validar.
  // _idx conserva el índice del array original: el backend valida por índice+scope.
  const isKnownDamage = (d) => d?.is_new === false || (d?.description || '').includes('[ya registrado')
  const damages = allDamages.map((d, i) => ({ ...d, _idx: i })).filter((d) => !isKnownDamage(d))
  const knownCount = allDamages.length - damages.length

  // Atajos de teclado: ←/→ navegar, Enter marcar revisada. El equipo valida
  // cientos de inspecciones — sin tocar el ratón se va mucho más rápido.
  // (go y reviewDone son function declarations: hoisted, accesibles desde aquí)
  useEffect(() => {
    const h = (e) => {
      if (!queue) return
      /* CON UNA CAPA ENCIMA, ESTE TECLADO NO EXISTE.
         El overlay tapa la pantalla pero NO para los eventos: este listener
         vive en `document` y RevisionRapida sigue montada debajo. Sin este
         corte, pulsar Enter con la Revisión exprés o el editor de zona
         abiertos llamaba a reviewDone(), que hace markReviewed() contra el
         backend y saca de la cola la inspección que hay DETRÁS del overlay,
         sin que se vea nada; y ←/→ movían esa cola oculta, así que al cerrar
         aparecías en otra inspección. El filtro por tagName de abajo no
         valía: solo evita chocar con lo que se escribe, no con lo que se
         tapa. Toda capa nueva a pantalla completa se añade aquí. */
      if (polyEdit || expres) return
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      else if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); reviewDone() }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  })

  if (err) return <p className="text-red-400">{err}</p>
  if (!queue) return <div className="flex items-center gap-2 text-dark-400"><Loader2 className="animate-spin" size={18} /> {t('ui.loading')}</div>

  function go(delta) {
    setPhotoIdx(0)
    setShowAnnotated(true)
    setCompareMode(false)
    // max DESPUÉS de min: con cola vacía el resultado queda en 0, nunca -1
    setIdx((i) => Math.max(0, Math.min(i + delta, displayQueue.length - 1)))
    cancelDraw()
  }

  async function sendFeedback(dmgIndex, verdict) {
    if (!item || busy) return
    setBusy(true)
    try {
      await damageFeedback(item.id, { verdict, damage_index: dmgIndex, scope: damageScope })
      setVerdicts((v) => ({ ...v, [`${item.id}:${dmgIndex}`]: verdict }))
      loadStats()
    } catch {
      setErr(t('rev.save.verdict.error'))
    } finally {
      setBusy(false)
    }
  }

  async function downloadDamageReport(dmgIndex) {
    // Parte de daño en PDF: un clic → documento listo para el renting/seguro
    try {
      const url = await fetchAuthedBlob(
        `/inspections/${item.id}/damage-report?damage_index=${dmgIndex}&scope=${damageScope}`)
      const a = document.createElement('a')
      a.href = url
      a.download = `parte-dano-${(item.vehicle_plate || item.license_plate || 'vehiculo').replace(/\s+/g, '')}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch {
      setErr(t('rev.pdf.error'))
    }
  }

  async function reviewDone() {
    if (!item || busy) return
    setBusy(true)
    try {
      await markReviewed(item.id)
      const next = queue.filter((q) => q.id !== item.id)
      setQueue(next)
      setIdx((i) => Math.min(i, Math.max(0, next.filter(q => filterIA ? (q.annotated_photos||[]).some(Boolean) : true).length - 1)))
      setPhotoIdx(0)
      cancelDraw()
    } catch {
      setErr(t('rev.mark.error'))
    } finally {
      setBusy(false)
    }
  }

  // ── Dibujo de caja sobre la foto ──
  function cancelDraw() { setDrawMode(null); setBox(null); setDrag(null); setPartName('') }
  function pct(e, el) {
    const r = el.getBoundingClientRect()
    return { x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) }
  }
  function onDown(e) { if (!drawMode) return; const p = pct(e, e.currentTarget); setDrag(p); setBox({ left: p.x, top: p.y, w: 0, h: 0 }) }
  function onMove(e) { if (!drawMode || !drag) return; const p = pct(e, e.currentTarget); setBox({ left: Math.min(drag.x, p.x), top: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) }) }
  function onUp() { setDrag(null) }
  function boxTo2d(b) {
    const c = (v) => Math.round(Math.min(1000, Math.max(0, v * 10)))
    return [c(b.top), c(b.left), c(b.top + b.h), c(b.left + b.w)] // [ymin,xmin,ymax,xmax]
  }
  async function saveDraw() {
    if (!box || box.w < 1 || box.h < 1) return setErr(t('rev.draw.no.box'))
    setBusy(true); setErr('')
    try {
      const box_2d = boxTo2d(box)
      if (drawMode.type === 'missed') {
        if (!partName.trim()) { setBusy(false); return setErr(t('rev.draw.no.part')) }
        await missedDamage(item.id, { part: partName.trim(), box_2d, photo_index: photoIdx + 1 })
      } else {
        await damageFeedback(item.id, { verdict: 'corrected', damage_index: drawMode.dmgIndex, scope: damageScope, corrected_box: box_2d })
        setVerdicts((v) => ({ ...v, [`${item.id}:${drawMode.dmgIndex}`]: 'corrected' }))
      }
      loadStats()
      cancelDraw()
    } catch {
      setErr(t('rev.save.error'))
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Cabecera */}
      <header className="rise mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[clamp(26px,3vw,36px)] font-semibold leading-none tracking-[-0.03em] text-dark-50">
          {t('rev.title')}
          <span className="text-dark-600"> · {displayQueue.length}</span>
        </h1>
        <div className="flex items-center gap-2.5">
          <button onClick={() => { setFilterIA(f => !f); setIdx(0) }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${filterIA ? 'bg-brand-500/15 text-brand-300 ring-brand-500/30' : 'text-dark-500 ring-white/[0.07] hover:text-dark-300'}`}>
            ⬡ Solo IA {filterIA && `(${displayQueue.length})`}
          </button>
          <span className="text-[13px] text-dark-500">{t('rev.pending')}</span>
        </div>
      </header>

      <Autoexamen datos={autoex} total={total} alRevisar={() => setExpres(true)} />
      {expres && (
        <RevisionExpres center={center} alCerrar={() => { setExpres(false); loadStats() }}
          alGuardar={loadStats} />
      )}

      {queue.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center text-dark-300">
          <CheckCircle2 size={32} className="text-emerald-400" /> {t('rev.no.pending')} {center !== 'Todos' && `${t('rev.in.center')} ${center}`}.
        </div>
      ) : filterIA && displayQueue.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center text-dark-300">
          <span className="text-3xl">⬡</span>
          <p className="text-sm">{t('rev.no.ai.photos')}</p>
          <p className="text-xs text-dark-500">{t('rev.go.ia.hint')}</p>
          <button onClick={() => setFilterIA(false)} className="btn-ghost text-xs px-3 py-1.5">{t('rev.show.all')}</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* barra superior de la tarjeta */}
          <div className="flex items-center justify-between gap-2 border-b border-dark-800 px-4 py-2.5">
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${SEV_CLS[item.severity] || SEV_CLS.sin_analisis}`}>
              {sevLabel(item.severity || 'sin_analisis').toUpperCase()} · {item.new_damages_count || item.total_damages_count || 0} {t('rev.damages')}
            </span>
            <div className="flex items-center gap-2 text-sm text-dark-400">
              <span className="mr-1 hidden items-center gap-1 text-[10px] text-dark-600 lg:flex" title={`← → · Enter — ${t('rev.kbd.hint')}`}>
                <kbd className="kbd">←</kbd><kbd className="kbd">→</kbd><kbd className="kbd">↵</kbd>
              </span>
              <button className="btn-ghost p-1.5 disabled:opacity-30" disabled={idx === 0} onClick={() => go(-1)}><ChevronLeft size={18} /></button>
              <span>{idx + 1} {t('rev.of')} {queue.length}</span>
              <button className="btn-ghost p-1.5 disabled:opacity-30" disabled={idx === queue.length - 1} onClick={() => go(1)}><ChevronRight size={18} /></button>
            </div>
          </div>

          {/* Imagen + anotaciones IA */}
          <div className="relative bg-black">
            {item.photos?.[photoIdx] ? (
              <>
                {/* Toggle original / IA — solo si hay foto anotada para este índice */}
                {item.annotated_photos?.[photoIdx] && (
                  <div className="absolute right-2 top-2 z-10 flex overflow-hidden rounded-lg border border-dark-600 text-xs font-semibold shadow-lg">
                    <button
                      onClick={() => setShowAnnotated(false)}
                      className={`px-2.5 py-1.5 transition ${!showAnnotated ? 'bg-dark-700 text-white' : 'bg-dark-900/80 text-dark-400 hover:text-dark-200'}`}
                    >{t('rev.original')}</button>
                    <button
                      onClick={() => setShowAnnotated(true)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 transition ${showAnnotated ? 'bg-brand-600 text-white' : 'bg-dark-900/80 text-dark-400 hover:text-dark-200'}`}
                    >
                      <BrainCircuit size={11} />
                      {t('rev.ai.analysis')}
                    </button>
                  </div>
                )}

                {/* Comparador antes/después — cuando hay foto de referencia */}
                {(() => {
                  const refs = fullInsp?.reference_photos || []
                  const refUrl = refs[photoIdx] || refs[0]
                  return refUrl && !drawMode ? (
                    <button
                      onClick={() => setCompareMode((c) => !c)}
                      className={`absolute left-2 top-2 z-10 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-lg transition ${
                        compareMode ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-dark-600 bg-dark-900/80 text-dark-300 hover:text-white'
                      }`}
                    >
                      ⇄ {t('rev.compare')}
                    </button>
                  ) : null
                })()}

                <div className={`relative mx-auto ${drawMode ? 'cursor-crosshair select-none' : ''}`} style={{ maxWidth: 520 }}
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>

                  {/* Foto: comparador / anotada (profesional) / original */}
                  {compareMode && (fullInsp?.reference_photos?.[photoIdx] || fullInsp?.reference_photos?.[0])
                    ? <CompareSlider
                        beforeUrl={fullInsp.reference_photos[photoIdx] || fullInsp.reference_photos[0]}
                        afterUrl={item.photos[photoIdx]} />
                    : showAnnotated && item.annotated_photos?.[photoIdx]
                      ? <img src={item.annotated_photos[photoIdx]} alt="Análisis IA" className="block w-full" draggable={false} />
                      : <img src={item.photos[photoIdx]} alt="" className="block w-full" draggable={false} />
                  }

                  {/* Cajas CSS solo en modo original (la foto anotada ya las lleva quemadas) */}
                  {!compareMode && (!showAnnotated || !item.annotated_photos?.[photoIdx]) && damages.map((d, i) => {
                    if (!Array.isArray(d.box_2d) || d.box_2d.length !== 4) return null
                    if (d.photo_index && d.photo_index - 1 !== photoIdx) return null
                    const [ymin, xmin, ymax, xmax] = d.box_2d
                    if (ymin + xmin + ymax + xmax === 0) return null
                    const isConfirmed = d.confirmed !== false
                    return (
                      <div key={i}
                        className={`pointer-events-none absolute rounded border-2 ${isConfirmed ? 'border-orange-400' : 'border-dashed border-yellow-400/70'}`}
                        style={{ left: `${xmin / 10}%`, top: `${ymin / 10}%`, width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%` }}>
                        <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-orange-400 px-1.5 text-[10px] font-bold text-black">
                          {d.part || 'daño'}{!isConfirmed ? ' ?' : ''}
                        </span>
                      </div>
                    )
                  })}

                  {/* Caja en dibujo */}
                  {box && (
                    <div className="pointer-events-none absolute rounded border-2 border-dashed border-emerald-400 bg-emerald-400/10"
                      style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.w}%`, height: `${box.h}%` }} />
                  )}
                  {drawMode && (
                    <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] text-emerald-300">
                      {drawMode.type === 'missed' ? t('rev.drag.mark') : t('rev.drag.fix')}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center text-dark-500">{t('rev.no.photo')}</div>
            )}
          </div>

          {/* Barra de dibujo */}
          {drawMode && (
            <div className="flex flex-wrap items-center gap-2 border-b border-dark-800 bg-dark-800/60 px-4 py-2.5">
              {drawMode.type === 'missed' && (
                <input autoFocus className="input h-9 w-48" placeholder="Pieza (ej. tulipa trasera)" value={partName} onChange={(e) => setPartName(e.target.value)} />
              )}
              <button onClick={saveDraw} disabled={busy || !box || box.w < 1} className="btn-primary flex items-center gap-1.5 py-1.5 text-sm disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar {drawMode.type === 'missed' ? 'daño' : 'caja'}
              </button>
              <button onClick={cancelDraw} className="btn-ghost px-3 py-1.5 text-sm">Cancelar</button>
            </div>
          )}

          {/* Miniaturas */}
          {item.photos?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto border-b border-dark-800 p-2">
              {item.photos.map((p, i) => {
                const hasAnnotated = !!item.annotated_photos?.[i]
                return (
                  <button key={i} onClick={() => { setPhotoIdx(i); setShowAnnotated(true) }}
                    className={`relative h-14 w-16 shrink-0 overflow-hidden rounded border-2 ${i === photoIdx ? 'border-brand-400' : 'border-transparent opacity-70'}`}>
                    <img src={p} alt="" className="h-full w-full object-cover" />
                    {hasAnnotated && (
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-brand-600/90 px-0.5 text-[8px] font-bold text-white">IA</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Info vehículo */}
          <div className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{item.license_plate}</span>
              {item.center && <span className="badge-orange">{item.center}</span>}
              {item.plate_mismatch && <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] text-red-400">matrícula no coincide</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dark-400">
              <span className="flex items-center gap-1"><User size={13} /> {item.driver_name}</span>
              <span className="flex items-center gap-1"><Clock size={13} /> {fmtDate(item.created_at)}</span>
              {item.vehicle_label && <span>· {item.vehicle_label}</span>}
            </div>

            {item.image_quality_warnings?.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>{item.image_quality_warnings.join(' · ')}</div>
              </div>
            )}

            {item.executive_summary && (
              <p className="mt-3 border-l-2 border-brand-500/50 pl-3 text-sm leading-relaxed text-dark-300">{item.executive_summary}</p>
            )}

            {/* Daños nuevos con ✓ / ✗ */}
            {!fullInsp && item && (
              <div className="mt-4 flex items-center gap-2 text-xs text-dark-500">
                <Loader2 size={13} className="animate-spin" /> {t('ui.loading')}
              </div>
            )}
            {damages.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-dark-500">{t('rev.damages.validate')}</div>
                {damages.map((d) => {
                  const i = d._idx
                  const v = verdicts[`${item.id}:${i}`]
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-dark-800 bg-dark-800/40 p-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{d.part || t('rev.damage')}</span>
                          {d.severity && <span className={`rounded px-1.5 py-0.5 text-[10px] ${SEV_CLS[d.severity] || SEV_CLS.sin_analisis}`}>{sevLabel(d.severity)}</span>}
                        </div>
                        {d.description && <div className="truncate text-xs text-dark-400">{d.description}</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button disabled={busy || v} onClick={() => sendFeedback(i, 'correct')}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${v === 'correct' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-dark-700 text-dark-300 hover:bg-emerald-500/10 hover:text-emerald-300'} disabled:opacity-50`} title="Correcto">
                          <Check size={16} />
                        </button>
                        <button disabled={busy || v} onClick={() => sendFeedback(i, 'wrong')}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${v === 'wrong' ? 'border-red-500 bg-red-500/20 text-red-300' : 'border-dark-700 text-dark-300 hover:bg-red-500/10 hover:text-red-300'} disabled:opacity-50`} title="Falso positivo">
                          <X size={16} />
                        </button>
                        <button disabled={busy} onClick={() => {
                            const photos = item.photos || []
                            const pi = d.photo_index
                            const photoUrl = (typeof pi === 'number' && pi >= 1 && pi <= photos.length)
                              ? photos[pi - 1] : photos[photoIdx] || photos[0] || ''
                            setPolyEditorMode('polygon')
                            setPolyEdit({ dmgIndex: i, damage: d, photoUrl })
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${v === 'corrected' ? 'border-amber-500 bg-amber-500/20 text-amber-300' : 'border-dark-700 text-dark-300 hover:bg-amber-500/10 hover:text-amber-300'} disabled:opacity-50`} title="Corregir zona">
                          <Pencil size={15} />
                        </button>
                        <button disabled={busy} onClick={() => downloadDamageReport(i)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-dark-700 text-dark-300 hover:bg-brand-500/10 hover:text-brand-300 disabled:opacity-50"
                          title="Parte de daño en PDF (para renting/seguro)">
                          <FileText size={15} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Daños ya en el ledger del vehículo: informativo, sin re-validar */}
            {knownCount > 0 && (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-dark-800/40 px-2.5 py-2 text-xs text-dark-500">
                <Check size={13} className="shrink-0 text-emerald-500/70" />
                {knownCount === 1
                  ? '1 daño ya registrado anteriormente en este vehículo — no requiere nueva validación'
                  : `${knownCount} daños ya registrados anteriormente en este vehículo — no requieren nueva validación`}
              </div>
            )}

            {/* Daño que la IA no vio */}
            <button onClick={() => { setDrawMode({ type: 'missed' }); setBox(null); setPartName('') }} disabled={busy || !!drawMode}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-dark-600 py-2 text-sm text-dark-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-40">
              <Plus size={15} /> Marcar un daño que la IA no vio
            </button>

            <button onClick={reviewDone} disabled={busy}
              className="btn-primary mt-3 flex w-full items-center justify-center gap-2 py-2.5 disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Marcar revisada y siguiente
            </button>
          </div>
        </div>
      )}

      {/* Modal editor polígono/bbox */}
      {polyEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ background: '#111827', borderRadius: 12, padding: 20, width: '100%', maxWidth: 860, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 600 }}>
                Corregir zona — {polyEdit.damage.part}
              </h3>
              <button onClick={() => setPolyEdit(null)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['polygon', '🔶 Polígono preciso'], ['bbox', '⬜ Rectángulo rápido']].map(([mode, label]) => (
                <button key={mode} onClick={() => setPolyEditorMode(mode)} style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                  border: `1px solid ${polyEditorMode === mode ? '#f59e0b' : '#374151'}`,
                  background: polyEditorMode === mode ? 'rgba(245,158,11,0.1)' : 'transparent',
                  color: polyEditorMode === mode ? '#fbbf24' : '#9ca3af',
                }}>{label}</button>
              ))}
            </div>
            {polyEditorMode === 'polygon' ? (
              <PolygonEditor
                photoUrl={polyEdit.photoUrl}
                currentPolygon={polyEdit.damage.polygon_points}
                currentBox={polyEdit.damage.box_2d}
                onConfirm={async (correctedPolygon) => {
                  setBusy(true)
                  try {
                    const ys = correctedPolygon.map(p => p[0])
                    const xs = correctedPolygon.map(p => p[1])
                    const correctedBox = [Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)]
                    await submitAiFeedback({
                      inspection_id: item.id,
                      damage_index: polyEdit.dmgIndex,
                      verdict: 'corrected',
                      corrected_box: correctedBox,
                      corrected_polygon_points: correctedPolygon,
                    })
                    setVerdicts(v => ({ ...v, [`${item.id}:${polyEdit.dmgIndex}`]: 'corrected' }))
                    loadStats()
                  } catch { setErr('No se pudo guardar.') }
                  finally { setBusy(false); setPolyEdit(null) }
                }}
                onCancel={() => setPolyEdit(null)}
              />
            ) : (
              <BboxEditor
                photoUrl={polyEdit.photoUrl}
                currentBox={polyEdit.damage.box_2d}
                onConfirm={async (correctedBox) => {
                  setBusy(true)
                  try {
                    await damageFeedback(item.id, {
                      verdict: 'corrected', damage_index: polyEdit.dmgIndex,
                      scope: damageScope, corrected_box: correctedBox,
                    })
                    setVerdicts(v => ({ ...v, [`${item.id}:${polyEdit.dmgIndex}`]: 'corrected' }))
                    loadStats()
                  } catch { setErr('No se pudo guardar.') }
                  finally { setBusy(false); setPolyEdit(null) }
                }}
                onCancel={() => setPolyEdit(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
