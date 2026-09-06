import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Pencil, X, Shirt, RotateCcw } from 'lucide-react'
import { tiendaPrendas, tiendaCrearPrenda, tiendaEditarPrenda, tiendaArchivarPrenda } from '../api'

/* ────────────────────────────────────────────────────────────────────────────
   EL TALLER DE PRENDAS — crear tu propia ropa y verla antes de encargarla
   ---------------------------------------------------------------------------
   Es a propósito una MAQUETA, no un archivo listo para el serigrafiador: sirve
   para decidir (qué prenda, qué color, dónde va el logo y de qué tamaño) y
   para enseñársela al taller al pedir presupuesto. El arte final en vectorial
   lo sigue haciendo el diseñador.

   EL DIBUJO VA A ESCALA DE VERDAD. Un logo de 8 cm sobre una prenda de ~52 cm
   de ancho sale pequeño en pantalla, y eso es exactamente lo que se quiere
   ver: la tentación de todo el mundo es poner el logo enorme, y un logo enorme
   convierte la prenda en un cartel que nadie se pone fuera del trabajo. Si
   aquí saliera falsamente grande, la decisión se tomaría con un dibujo que
   miente.

   Se guarda la RECETA, no el dibujo: el día que cambie el logo o el precio,
   cambian todas las prendas sin volver a dibujar ninguna.
   ──────────────────────────────────────────────────────────────────────────── */

// El cuerpo de la prenda mide 68 unidades y representa unos 52 cm de ancho.
const PX_POR_CM = 68 / 52

const VACIA = {
  nombre: '', tipo: 'camiseta', color: 'negro', tallas: ['S', 'M', 'L', 'XL'],
  estampaciones: [{ posicion: 'pecho', tinta: 'cian', cm: 8, texto: 'FDs', con_nombre: false }],
  franja_manga: true, coste: '', pvp: '', notas: '',
}

const eur = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`

export default function TiendaPrendas() {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null)   // objeto prenda o null

  const cargar = useCallback(() => {
    setCargando(true)
    tiendaPrendas()
      .then((r) => { setDatos(r.data); setError('') })
      .catch(() => setError('No se han podido cargar tus prendas.'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const archivar = async (p) => {
    if (!window.confirm(`¿Quitar «${p.nombre}» de la lista? Se archiva, no se borra.`)) return
    try {
      await tiendaArchivarPrenda(p.id)
      cargar()
    } catch {
      setError('No se ha podido archivar.')
    }
  }

  if (cargando && !datos) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-dark-400">
        <Loader2 size={15} className="animate-spin" /> Cargando tus prendas…
      </div>
    )
  }
  if (!datos) return <p className="mt-6 text-sm text-red-400">{error}</p>

  const { prendas, tipos } = datos

  return (
    <div className="mt-6">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-dark-100">Tus prendas</div>
          <div className="text-[12px] text-dark-500">
            Móntalas, míralas y guárdalas. Todavía no se venden: el precio es opcional.
          </div>
        </div>
        <button onClick={() => setEditando({ ...VACIA })}
          className="btn-primary inline-flex shrink-0 items-center gap-1.5 text-[13px]">
          <Plus size={14} /> Crear prenda
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {prendas.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-dark-700 px-4 py-8 text-center">
          <Shirt size={22} className="mx-auto mb-2 text-dark-600" />
          <p className="text-[13px] text-dark-400">Todavía no has creado ninguna prenda.</p>
          <p className="mt-0.5 text-[12px] text-dark-500">
            Empieza por la camiseta técnica: es la de mejor margen y la más barata de equivocarse.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {prendas.map((p) => (
            <div key={p.id} className="rounded-xl border border-dark-800 bg-dark-900/40 p-3">
              <div className="flex gap-3">
                <div className="w-[92px] shrink-0 rounded-lg bg-dark-950/60 p-1">
                  <Lienzo prenda={p} datos={datos} cara="delante" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-dark-100">{p.nombre}</div>
                  <div className="text-[11.5px] text-dark-500">
                    {(tipos.find((t) => t.id === p.tipo) || {}).nombre} · {p.tallas.join(' ')}
                  </div>
                  <div className="mt-1 text-[12px] text-dark-400">
                    Cuesta {eur(p.coste)}
                    {p.pvp ? <> · vendes {eur(p.pvp)} · <b className="text-dark-200">queda {eur(p.margen)}</b> ({p.margen_pct}%)</>
                      : <span className="text-dark-500"> · sin precio todavía</span>}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <button onClick={() => setEditando(p)}
                      className="btn-secondary inline-flex items-center gap-1 px-2 py-1 text-[12px]">
                      <Pencil size={12} /> Editar
                    </button>
                    <button onClick={() => archivar(p)} aria-label={`Archivar ${p.nombre}`}
                      className="rounded-lg border border-dark-700 px-2 py-1 text-dark-500 hover:border-red-500/40 hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <Editor prenda={editando} datos={datos}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar() }} />
      )}
    </div>
  )
}

/* ───────────────────────── El dibujo ───────────────────────── */

/* Cada prenda es un `path` y nada más: sin degradados ni sombras, porque lo
   que se está decidiendo es dónde va el logo y de qué tamaño, no si el dibujo
   es bonito. */
const CUERPOS = {
  camiseta: {
    trazos: (c, b) => (
      <>
        <path d="M 58,28 Q 100,46 142,28 L 172,52 L 150,78 L 134,66 L 134,232 L 66,232 L 66,66 L 50,78 L 28,52 Z" fill={c} stroke={b} strokeWidth="0.8" />
        <path d="M 64,31 Q 100,49 136,31" fill="none" stroke={b} strokeWidth="1" />
      </>
    ),
    mangas: [[150, 74, 168, 54], [50, 74, 32, 54]],
  },
  polo: {
    trazos: (c, b) => (
      <>
        <path d="M 58,28 Q 100,46 142,28 L 172,52 L 150,78 L 134,66 L 134,232 L 66,232 L 66,66 L 50,78 L 28,52 Z" fill={c} stroke={b} strokeWidth="0.8" />
        <path d="M 82,30 L 96,52 L 100,44 L 104,52 L 118,30" fill="none" stroke={b} strokeWidth="1.2" />
        <path d="M 96,52 L 96,84 M 104,52 L 104,84" fill="none" stroke={b} strokeWidth="1" />
      </>
    ),
    mangas: [[150, 74, 168, 54], [50, 74, 32, 54]],
  },
  sudadera: {
    trazos: (c, b) => (
      <>
        <path d="M 72,36 C 72,6 128,6 128,36 L 122,52 Q 100,68 78,52 Z" fill={c} stroke={b} strokeWidth="0.8" opacity="0.82" />
        <path d="M 58,36 Q 100,56 142,36 L 176,62 L 152,92 L 136,78 L 136,240 L 64,240 L 64,78 L 48,92 L 24,62 Z" fill={c} stroke={b} strokeWidth="0.8" />
        <path d="M 66,41 Q 100,60 134,41" fill="none" stroke={b} strokeWidth="1" />
        <path d="M 90,66 L 90,92 M 110,66 L 110,92" fill="none" stroke={b} strokeWidth="1.4" />
        <rect x="74" y="188" width="52" height="30" rx="3" fill="none" stroke={b} strokeWidth="1" />
      </>
    ),
    mangas: [[152, 88, 172, 64], [48, 88, 28, 64]],
  },
  chubasquero: {
    trazos: (c, b) => (
      <>
        <path d="M 58,36 Q 100,56 142,36 L 176,62 L 152,92 L 136,78 L 136,240 L 64,240 L 64,78 L 48,92 L 24,62 Z" fill={c} stroke={b} strokeWidth="0.8" />
        <path d="M 72,32 L 100,52 L 128,32" fill="none" stroke={b} strokeWidth="1.4" />
        <path d="M 100,52 L 100,240" fill="none" stroke={b} strokeWidth="1.2" />
        <rect x="70" y="176" width="24" height="12" rx="2" fill="none" stroke={b} strokeWidth="1" />
        <rect x="106" y="176" width="24" height="12" rx="2" fill="none" stroke={b} strokeWidth="1" />
      </>
    ),
    mangas: [[152, 88, 172, 64], [48, 88, 28, 64]],
  },
  pantalon: {
    trazos: (c, b) => (
      <>
        <rect x="62" y="30" width="76" height="14" rx="2" fill={c} stroke={b} strokeWidth="0.8" />
        <path d="M 62,44 L 138,44 L 131,244 L 108,244 L 100,112 L 92,244 L 69,244 Z" fill={c} stroke={b} strokeWidth="0.8" />
        <rect x="68" y="70" width="22" height="26" rx="2" fill="none" stroke={b} strokeWidth="1" />
        <rect x="110" y="70" width="22" height="26" rx="2" fill="none" stroke={b} strokeWidth="1" />
      </>
    ),
    mangas: [],
  },
  gorra: {
    trazos: (c, b) => (
      <>
        <path d="M 58,150 C 58,100 142,100 142,150 Z" fill={c} stroke={b} strokeWidth="0.8" />
        <rect x="58" y="150" width="84" height="9" fill={c} stroke={b} strokeWidth="0.8" />
        <path d="M 142,154 C 176,155 190,170 162,176 L 142,168 Z" fill={c} stroke={b} strokeWidth="0.8" />
      </>
    ),
    mangas: [],
  },
}

/* Dónde cae cada estampación en el dibujo, por tipo de prenda. Van aquí y no
   repartidas por el componente para que no puedan descuadrarse entre sí. */
const ANCLAS = {
  camiseta: { pecho: [82, 100], espalda: [100, 108], manga: [158, 66] },
  polo: { pecho: [82, 104], espalda: [100, 108], manga: [158, 66] },
  sudadera: { pecho: [84, 112], espalda: [100, 118], manga: [160, 78] },
  chubasquero: { pecho: [84, 112], espalda: [100, 118], manga: [160, 78] },
  pantalon: { pecho: [78, 60], espalda: [100, 120], manga: [100, 200] },
  gorra: { pecho: [100, 132], espalda: [100, 132], manga: [100, 132] },
}

export function Lienzo({ prenda, datos, cara = 'delante' }) {
  const color = (datos.colores || []).find((c) => c.id === prenda.color) || datos.colores[0]
  const tipo = CUERPOS[prenda.tipo] ? prenda.tipo : 'camiseta'
  const cuerpo = CUERPOS[tipo]
  const borde = color.claro ? '#C9CFD3' : '#0A0C0D'
  const anclas = ANCLAS[tipo]
  const tintaHex = (id) => ((datos.tintas || []).find((t) => t.id === id) || {}).hex || '#F5F7F8'

  const visibles = (prenda.estampaciones || []).filter((e) => {
    const pos = (datos.posiciones || []).find((p) => p.id === e.posicion)
    return (pos?.cara || 'delante') === cara
  })
  const franja = prenda.franja_manga && cara === 'delante' && cuerpo.mangas.length > 0

  return (
    <svg viewBox="0 0 200 260" width="100%" role="img"
      aria-label={`Vista ${cara} de ${prenda.nombre || 'la prenda'}`}>
      {cuerpo.trazos(color.hex, borde)}
      {franja && cuerpo.mangas.map(([x1, y1, x2, y2], i) => (
        <path key={i} d={`M ${x1},${y1} L ${x2},${y2}`} fill="none"
          stroke={tintaHex((prenda.estampaciones?.[0]?.tinta) || 'cian')} strokeWidth="2.6" />
      ))}
      {visibles.map((e) => {
        const [x, y] = anclas[e.posicion] || anclas.pecho
        const ancho = Math.max(4, (Number(e.cm) || 8) * PX_POR_CM)
        const texto = e.texto || 'FDs'
        // El tamaño de letra sale del ANCHO pedido, no al revés: lo que manda
        // son los centímetros que va a medir la estampación de verdad.
        const fs = Math.max(2.5, Math.min(22, ancho / (texto.length * 0.56)))
        return (
          <g key={e.posicion}>
            <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              textLength={ancho} lengthAdjust="spacingAndGlyphs"
              fontSize={fs} fontWeight="600" fill={tintaHex(e.tinta)}
              fontFamily="Archivo Variable, system-ui, sans-serif">{texto}</text>
            {e.con_nombre && (
              <text x={x} y={y + fs * 1.5} textAnchor="middle" dominantBaseline="middle"
                textLength={ancho * 0.75} lengthAdjust="spacingAndGlyphs"
                fontSize={fs * 0.6} fill={tintaHex(e.tinta)}
                fontFamily="Archivo Variable, system-ui, sans-serif">Nombre</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* ───────────────────────── El editor ───────────────────────── */

function Editor({ prenda, datos, onCerrar, onGuardado }) {
  const [f, setF] = useState(() => ({
    ...VACIA, ...prenda,
    coste: prenda.coste ?? '', pvp: prenda.pvp ?? '',
    estampaciones: prenda.estampaciones?.length ? prenda.estampaciones : VACIA.estampaciones,
  }))
  const [cara, setCara] = useState('delante')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const tintasUsadas = new Set((f.estampaciones || []).map((e) => e.tinta))
  const demasiadas = tintasUsadas.size > (datos.max_tintas || 2)

  const setEst = (i, k, v) => setF((x) => ({
    ...x, estampaciones: x.estampaciones.map((e, j) => (j === i ? { ...e, [k]: v } : e)),
  }))
  const quitarEst = (i) => setF((x) => ({ ...x, estampaciones: x.estampaciones.filter((_, j) => j !== i) }))
  const anadirEst = () => {
    const libres = (datos.posiciones || []).filter(
      (p) => !f.estampaciones.some((e) => e.posicion === p.id))
    if (!libres.length) return
    setF((x) => ({ ...x, estampaciones: [...x.estampaciones,
      { posicion: libres[0].id, tinta: 'blanco', cm: libres[0].id === 'pecho' ? 8 : 22, texto: 'flotadsp', con_nombre: false }] }))
  }

  const guardar = async () => {
    setErr(''); setGuardando(true)
    const cuerpo = {
      nombre: f.nombre.trim(), tipo: f.tipo, color: f.color, tallas: f.tallas,
      estampaciones: f.estampaciones, franja_manga: !!f.franja_manga,
      coste: f.coste === '' ? null : f.coste,
      pvp: f.pvp === '' ? null : f.pvp,
      notas: f.notas,
    }
    try {
      if (f.id) await tiendaEditarPrenda(f.id, cuerpo)
      else await tiendaCrearPrenda(cuerpo)
      onGuardado()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido guardar.')
    } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCerrar}>
      <div className="my-6 w-full max-w-3xl rounded-2xl border border-dark-800 bg-dark-950 p-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[15px] font-semibold text-dark-100">
            {f.id ? 'Editar prenda' : 'Crear prenda'}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-dark-500 hover:text-dark-200">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-[1fr_240px]">
          {/* Formulario */}
          <div className="order-2 space-y-3 sm:order-1">
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={f.nombre} placeholder="Camiseta OGA5"
                onChange={(e) => set('nombre', e.target.value)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Prenda</label>
                <select className="input" value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
                  {datos.tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Color</label>
                <select className="input" value={f.color} onChange={(e) => set('color', e.target.value)}>
                  {datos.colores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Tallas</label>
              <div className="flex flex-wrap gap-1.5">
                {datos.tallas.map((t) => {
                  const puesta = f.tallas.includes(t)
                  return (
                    <button key={t} type="button"
                      onClick={() => set('tallas', puesta ? f.tallas.filter((x) => x !== t) : [...f.tallas, t])}
                      className={`rounded-lg border px-2.5 py-1 text-[12px] font-medium ${
                        puesta ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                          : 'border-dark-700 text-dark-400 hover:border-dark-500'}`}>
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0">Estampaciones</label>
                {f.estampaciones.length < (datos.max_estampaciones || 3) && (
                  <button type="button" onClick={anadirEst}
                    className="text-[12px] text-brand-400 hover:text-brand-300">+ Añadir</button>
                )}
              </div>
              <div className="space-y-2">
                {f.estampaciones.map((e, i) => (
                  <div key={i} className="rounded-lg border border-dark-800 p-2.5">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <select className="input py-1.5 text-[12px]" value={e.posicion}
                        onChange={(ev) => setEst(i, 'posicion', ev.target.value)}>
                        {datos.posiciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                      <select className="input py-1.5 text-[12px]" value={e.tinta}
                        onChange={(ev) => setEst(i, 'tinta', ev.target.value)}>
                        {datos.tintas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                      <input className="input py-1.5 text-[12px]" value={e.texto || ''} placeholder="FDs"
                        onChange={(ev) => setEst(i, 'texto', ev.target.value)} />
                      <div className="flex items-center gap-1">
                        <input type="number" min="2" className="input py-1.5 text-[12px]" value={e.cm}
                          onChange={(ev) => setEst(i, 'cm', Number(ev.target.value))} />
                        <span className="text-[11px] text-dark-500">cm</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[12px] text-dark-400">
                        <input type="checkbox" checked={!!e.con_nombre}
                          onChange={(ev) => setEst(i, 'con_nombre', ev.target.checked)} />
                        Lleva el nombre del conductor
                      </label>
                      <button type="button" onClick={() => quitarEst(i)}
                        className="text-[12px] text-dark-500 hover:text-red-400">Quitar</button>
                    </div>
                  </div>
                ))}
              </div>
              {demasiadas && (
                <p className="mt-1.5 text-[12px] text-amber-300">
                  Estás usando {tintasUsadas.size} tintas. Cada una de más es otra pasada de
                  máquina: con más de {datos.max_tintas} el margen se te va del 60% al 35%.
                </p>
              )}
              <label className="mt-2 flex items-center gap-1.5 text-[12px] text-dark-400">
                <input type="checkbox" checked={!!f.franja_manga}
                  onChange={(e) => set('franja_manga', e.target.checked)} />
                Franja de contraste en la manga
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Te cuesta (€)</label>
                <input className="input" inputMode="decimal" value={f.coste} placeholder="6,00"
                  onChange={(e) => set('coste', e.target.value)} />
              </div>
              <div>
                <label className="label">La vendes a (€) — opcional</label>
                <input className="input" inputMode="decimal" value={f.pvp} placeholder="Aún sin precio"
                  onChange={(e) => set('pvp', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">Notas</label>
              <input className="input" value={f.notas || ''} placeholder="Modelo del proveedor, referencia…"
                onChange={(e) => set('notas', e.target.value)} />
            </div>

            {err && <p className="text-[13px] text-red-400">{err}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={guardar} disabled={guardando || f.nombre.trim().length < 2}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                {guardando && <Loader2 size={15} className="animate-spin" />} Guardar
              </button>
              <button onClick={onCerrar} className="btn-secondary">Cancelar</button>
            </div>
          </div>

          {/* Vista previa */}
          <div className="order-1 sm:order-2">
            <div className="rounded-xl border border-dark-800 bg-dark-900/40 p-3">
              <Lienzo prenda={f} datos={datos} cara={cara} />
            </div>
            <button onClick={() => setCara(cara === 'delante' ? 'detras' : 'delante')}
              className="btn-secondary mt-2 inline-flex w-full items-center justify-center gap-1.5 text-[12px]">
              <RotateCcw size={13} /> Ver {cara === 'delante' ? 'detrás' : 'delante'}
            </button>
            <p className="mt-2 text-[11.5px] leading-snug text-dark-500">
              A escala real: 8 cm sobre una prenda de 52 cm se ve pequeño, y así es como se
              va a ver puesta. Es una maqueta para decidir y para enseñarle al taller, no
              el archivo de estampación.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
