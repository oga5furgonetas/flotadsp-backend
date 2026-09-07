import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Pencil, X, Shirt, RotateCcw, Wand2, Copy, Check, Calculator, Upload } from 'lucide-react'
import {
  tiendaPrendas, tiendaCrearPrenda, tiendaEditarPrenda, tiendaArchivarPrenda,
  tiendaInterpretar, tiendaFicha, tiendaLogos, tiendaSubirLogo, tiendaBorrarLogo,
} from '../api'

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
  const [logos, setLogos] = useState(null)

  const cargar = useCallback(() => {
    setCargando(true)
    tiendaPrendas()
      .then((r) => { setDatos(r.data); setError('') })
      .catch(() => setError('No se han podido cargar tus prendas.'))
      .finally(() => setCargando(false))
  }, [])

  const cargarLogos = useCallback(() => {
    tiendaLogos().then((r) => setLogos(r.data)).catch(() => setLogos({ logos: {} }))
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { cargarLogos() }, [cargarLogos])

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

      <ElLogo datos={logos} onCambio={cargarLogos} />

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
                  <Lienzo prenda={p} datos={datos} logos={logos?.logos} cara="delante" />
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
        <Editor prenda={editando} datos={datos} logos={logos?.logos}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar() }} />
      )}
    </div>
  )
}

/* ───────────────────────── El dibujo ───────────────────────── */

/* Cada prenda son cuatro o cinco trazos, y ni uno mas: lo que se decide aqui
   es donde va el logo y de que tamaño, no si el dibujo es bonito. Aun asi
   tienen que PARECER ropa — la primera version dibujaba la capucha como una
   bola gris flotando sobre los hombros y el cuerpo como un ladrillo, y con eso
   no se puede decidir nada.

   Lo que hace que se lean: hombros redondeados en vez de esquinas, mangas que
   se estrechan y acaban en puño, bajo con su costura, y en la sudadera la
   capucha DETRAS de los hombros (se dibuja primero y el cuerpo la tapa por
   abajo, que es como se ve de verdad) con sus cordones y su bolsillo canguro.

   Los seis se miraron en pantalla, en negro y en blanco, antes de entrar aqui.

   `c` es el color de la prenda, `b` el borde y `l` la linea de costura. */
const CUERPOS = {
  camiseta: {
    trazos: (c, b, l) => (
      <>
        <path d="M 70,38 Q 100,58 130,38 L 154,45 C 167,50 173,58 172,65 L 161,93 C 157,99 148,99 144,94 L 138,87 L 138,220 C 138,228 133,233 125,233 L 75,233 C 67,233 62,228 62,220 L 62,87 L 56,94 C 52,99 43,99 39,93 L 28,65 C 27,58 33,50 46,45 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 76,40 Q 100,62 124,40" fill="none" stroke={l} strokeWidth="1.6" />
        <path d="M 145,88 L 160,88 M 55,88 L 40,88" fill="none" stroke={l} strokeWidth="1.2" />
        <path d="M 62,222 L 138,222" fill="none" stroke={l} strokeWidth="1" />
      </>
    ),
    mangas: [[166, 55, 157, 86], [34, 55, 43, 86]],
  },
  polo: {
    trazos: (c, b, l) => (
      <>
        <path d="M 70,38 Q 100,54 130,38 L 154,45 C 167,50 173,58 172,65 L 161,93 C 157,99 148,99 144,94 L 138,87 L 138,220 C 138,228 133,233 125,233 L 75,233 C 67,233 62,228 62,220 L 62,87 L 56,94 C 52,99 43,99 39,93 L 28,65 C 27,58 33,50 46,45 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 78,38 L 96,60 L 100,52 L 104,60 L 122,38" fill={l} stroke={b} strokeWidth="1" />
        <path d="M 96,60 L 95,92 M 104,60 L 105,92" fill="none" stroke={l} strokeWidth="1.3" />
        <circle cx="99" cy="70" r="1.6" fill={l} />
        <circle cx="99" cy="84" r="1.6" fill={l} />
        <path d="M 62,222 L 138,222" fill="none" stroke={l} strokeWidth="1" />
      </>
    ),
    mangas: [[166, 55, 157, 86], [34, 55, 43, 86]],
  },
  sudadera: {
    trazos: (c, b, l) => (
      <>
        <path d="M 70,58 C 70,20 130,20 130,58 L 130,80 L 70,80 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 78,58 C 80,32 120,32 122,58" fill="none" stroke={l} strokeWidth="1.6" />
        <path d="M 70,42 Q 100,66 130,42 L 156,50 C 170,55 177,64 176,72 L 164,102 C 160,109 150,109 146,103 L 140,95 L 140,216 L 60,216 L 60,95 L 54,103 C 50,109 40,109 36,102 L 24,72 C 23,64 30,55 44,50 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 60,216 L 140,216 L 140,232 C 140,235 137,237 134,237 L 66,237 C 63,237 60,235 60,232 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 70,219 L 70,235 M 82,219 L 82,235 M 94,219 L 94,235 M 106,219 L 106,235 M 118,219 L 118,235 M 130,219 L 130,235" stroke={l} strokeWidth="0.8" />
        <path d="M 146,96 L 164,96 M 54,96 L 36,96" stroke={l} strokeWidth="1.2" />
        <path d="M 92,66 L 90,98 M 108,66 L 110,98" stroke="#D8DCDF" strokeWidth="1.8" fill="none" />
        <circle cx="90" cy="99" r="1.8" fill="#D8DCDF" />
        <circle cx="110" cy="99" r="1.8" fill="#D8DCDF" />
        <path d="M 72,168 L 128,168 L 132,206 L 68,206 Z" fill="none" stroke={l} strokeWidth="1.3" />
      </>
    ),
    mangas: [[170, 60, 160, 95], [30, 60, 40, 95]],
  },
  chubasquero: {
    trazos: (c, b, l) => (
      <>
        <path d="M 72,44 L 100,58 L 128,44 L 130,30 L 70,30 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 70,42 Q 100,62 130,42 L 156,50 C 170,55 177,64 176,72 L 164,102 C 160,109 150,109 146,103 L 140,95 L 140,228 C 140,232 137,235 133,235 L 67,235 C 63,235 60,232 60,228 L 60,95 L 54,103 C 50,109 40,109 36,102 L 24,72 C 23,64 30,55 44,50 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 100,58 L 100,235" stroke={l} strokeWidth="1.6" fill="none" />
        <path d="M 70,168 L 92,168 L 92,182 L 70,182 Z M 108,168 L 130,168 L 130,182 L 108,182 Z" fill="none" stroke={l} strokeWidth="1.2" />
        <path d="M 146,96 L 164,96 M 54,96 L 36,96" stroke={l} strokeWidth="1.2" />
      </>
    ),
    mangas: [[170, 60, 160, 95], [30, 60, 40, 95]],
  },
  pantalon: {
    trazos: (c, b, l) => (
      <>
        <path d="M 60,34 L 140,34 L 140,52 L 60,52 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 60,52 L 140,52 L 133,236 C 133,240 130,242 126,242 L 110,242 C 106,242 104,240 104,236 L 100,120 L 96,236 C 96,240 94,242 90,242 L 74,242 C 70,242 67,240 67,236 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 60,42 L 140,42" stroke={l} strokeWidth="1" />
        <path d="M 66,66 L 88,66 L 90,96 L 68,96 Z M 134,66 L 112,66 L 110,96 L 132,96 Z" fill="none" stroke={l} strokeWidth="1.2" />
        <path d="M 100,52 L 100,120" stroke={l} strokeWidth="1" fill="none" />
      </>
    ),
    mangas: [],
  },
  gorra: {
    trazos: (c, b, l) => (
      <>
        <path d="M 56,180 C 56,126 144,126 144,180 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 100,129 L 100,180 M 78,134 C 86,150 88,166 88,180 M 122,134 C 114,150 112,166 112,180" fill="none" stroke={l} strokeWidth="1" />
        <circle cx="100" cy="129" r="3.5" fill={l} stroke={b} strokeWidth="0.8" />
        <path d="M 56,180 L 144,180 L 144,191 L 56,191 Z" fill={c} stroke={b} strokeWidth="1" />
        <path d="M 144,183 C 178,185 192,202 162,210 L 143,202 Z" fill={c} stroke={b} strokeWidth="1" />
      </>
    ),
    mangas: [],
  },
}

/* Donde cae cada estampacion en el dibujo, por tipo de prenda. Van aqui y no
   repartidas por el componente para que no puedan descuadrarse entre si. */
const ANCLAS = {
  camiseta: { pecho: [82, 112], espalda: [100, 122], manga: [156, 68] },
  polo: { pecho: [82, 118], espalda: [100, 122], manga: [156, 68] },
  sudadera: { pecho: [84, 122], espalda: [100, 132], manga: [160, 78] },
  chubasquero: { pecho: [80, 122], espalda: [100, 132], manga: [160, 78] },
  pantalon: { pecho: [78, 62], espalda: [100, 150], manga: [100, 200] },
  gorra: { pecho: [100, 158], espalda: [100, 158], manga: [100, 158] },
}

/* Que variante del logo toca para esta tinta. Es lo que pide un taller: sobre
   prenda oscura la blanca a una tinta, sobre clara la negra, y la de color solo
   cuando el presupuesto admite dos tintas. Si la que toca no esta subida se cae
   a otra antes que no pintar nada. */
function logoDe(logos, tinta, claro) {
  if (!logos) return null
  const orden = tinta === 'blanco' ? ['blanco', 'color', 'negro']
    : tinta === 'negro' ? ['negro', 'color', 'blanco']
      : ['color', claro ? 'negro' : 'blanco', claro ? 'blanco' : 'negro']
  for (const v of orden) if (logos[v]?.url) return logos[v].url
  return null
}

export function Lienzo({ prenda, datos, logos, cara = 'delante' }) {
  const color = (datos.colores || []).find((c) => c.id === prenda.color) || datos.colores[0]
  const tipo = CUERPOS[prenda.tipo] ? prenda.tipo : 'camiseta'
  const cuerpo = CUERPOS[tipo]
  const borde = color.claro ? '#C9CFD3' : '#0A0C0D'
  // La costura tiene que verse sobre la prenda: mas clara en las oscuras y mas
  // oscura en las claras. Con un gris fijo, en la blanca desaparecia.
  const costura = color.claro ? '#DDE2E6' : '#2E343A'
  const anclas = ANCLAS[tipo]
  /* TONAL: el bordado del mismo color que la prenda, un tono por encima. No es
     un color fijo —sale de la prenda—, asi que se calcula: se aclara la prenda
     oscura y se oscurece la clara. Sin desplazarlo no se veria nada, y con
     demasiado dejaria de ser tonal. */
  const desplaza = (hex, d) => '#' + [1, 3, 5].map((i) => {
    const v = Math.round(Math.min(255, Math.max(0, parseInt(hex.slice(i, i + 2), 16) + d)))
    return v.toString(16).padStart(2, '0')
  }).join('')
  const tintaHex = (id) => {
    if (id === 'tonal') return desplaza(color.hex, color.claro ? -34 : 42)
    return ((datos.tintas || []).find((t) => t.id === id) || {}).hex || '#F5F7F8'
  }

  const visibles = (prenda.estampaciones || []).filter((e) => {
    const pos = (datos.posiciones || []).find((p) => p.id === e.posicion)
    return (pos?.cara || 'delante') === cara
  })
  const franja = prenda.franja_manga && cara === 'delante' && cuerpo.mangas.length > 0

  return (
    <svg viewBox="0 0 200 260" width="100%" role="img"
      aria-label={`Vista ${cara} de ${prenda.nombre || 'la prenda'}`}>
      {cuerpo.trazos(color.hex, borde, costura)}
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
        // Con tinta TONAL se dibuja el texto y no el logo subido: recolorear
        // un vectorial ajeno sale mal, y aqui el color es justo lo que define
        // la estampacion. Cuando tengas el logo tonal, se sube como variante.
        const url = (e.usa_logo !== false && e.tinta !== 'tonal')
          ? logoDe(logos, e.tinta, color.claro) : null
        return (
          <g key={e.posicion}>
            {url ? (
              /* Va dentro de un <image> y NUNCA incrustado en la página: un SVG
                 puede llevar `<script>` dentro, y pegado en el DOM correría con
                 nuestro origen y la sesión abierta. En un <image> el navegador
                 lo pinta en modo estático seguro. Y `meet` conserva la
                 proporción: lo que se respeta son los centímetros de ANCHO,
                 que es lo que se estampa. */
              <image href={url} x={x - ancho / 2} y={y - ancho / 2}
                width={ancho} height={ancho} preserveAspectRatio="xMidYMid meet" />
            ) : (
            <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              textLength={ancho} lengthAdjust="spacingAndGlyphs"
              fontSize={fs} fontWeight="600" fill={tintaHex(e.tinta)}
              fontFamily="Archivo Variable, system-ui, sans-serif">{texto}</text>
            )}
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

function Editor({ prenda, datos, logos, onCerrar, onGuardado }) {
  const [f, setF] = useState(() => ({
    ...VACIA, ...prenda,
    coste: prenda.coste ?? '', pvp: prenda.pvp ?? '',
    estampaciones: prenda.estampaciones?.length ? prenda.estampaciones : VACIA.estampaciones,
  }))
  const [cara, setCara] = useState('delante')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const [pedido, setPedido] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [lectura, setLectura] = useState(null)
  const [ficha, setFicha] = useState(null)
  const [calculando, setCalculando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  /* Pidelo con palabras. NO lo hace una IA a proposito: la clave de Gemini va
     en plan gratuito con 20 peticiones al dia para TODO el backend, asi que un
     generador ahi estaria muerto media jornada y encima le robaria cuota al
     analisis de daños. El vocabulario aqui es nuestro y cerrado —seis prendas,
     cinco colores, cuatro tintas, tres posiciones—, o sea que no hace falta un
     modelo: hace falta un diccionario. Y sale siempre lo mismo. */
  const dibujar = async () => {
    if (pedido.trim().length < 3) return
    setLeyendo(true); setErr(''); setFicha(null)
    try {
      const r = await tiendaInterpretar(pedido.trim())
      const rec = r.data.receta
      setF((x) => ({ ...x, ...rec, nombre: x.nombre || rec.nombre,
        coste: rec.coste ?? '', pvp: x.pvp ?? '' }))
      setLectura({ entendido: r.data.entendido, dudas: r.data.dudas })
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No he podido interpretarlo.')
    } finally { setLeyendo(false) }
  }

  const calcular = async () => {
    setCalculando(true); setErr('')
    try {
      const cuerpo = {
        nombre: f.nombre.trim() || 'Prenda', tipo: f.tipo, color: f.color,
        tallas: f.tallas, estampaciones: f.estampaciones,
        franja_manga: !!f.franja_manga,
      }
      const r = await tiendaFicha(cuerpo, 40)
      setFicha(r.data)
      if (!f.pvp) set('pvp', String(r.data.pvp_sugerido).replace('.', ','))
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No he podido calcularlo.')
    } finally { setCalculando(false) }
  }

  const copiarTaller = () => {
    navigator.clipboard?.writeText(ficha?.texto_para_el_taller || '').then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    }).catch(() => {})
  }

  const hayLogo = !!(logos && Object.keys(logos).length)
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
            {/* Dilo con palabras y sale dibujada */}
            <div className="rounded-xl border border-brand-500/25 bg-brand-500/[0.06] p-3">
              <label className="label mb-1.5">Dime como la quieres</label>
              <textarea rows={2} className="input resize-none text-[13px]"
                placeholder="sudadera negra con el logo pequeno en cian en el pecho, flotadsp grande y el nombre detras, y franja en la manga"
                value={pedido} onChange={(e) => setPedido(e.target.value)} />
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={dibujar} disabled={leyendo || pedido.trim().length < 3}
                  className="btn-primary inline-flex items-center gap-1.5 py-1.5 text-[12.5px] disabled:opacity-50">
                  {leyendo ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Dibujala
                </button>
                <span className="text-[11.5px] text-dark-500">Luego la retocas abajo.</span>
              </div>
              {lectura && (
                <div className="mt-2 space-y-1 text-[12px]">
                  {lectura.entendido.length > 0 && (
                    <p className="text-dark-400">
                      <b className="text-dark-300">He entendido:</b> {lectura.entendido.join(' · ')}
                    </p>
                  )}
                  {lectura.dudas.map((d, i) => (
                    <p key={i} className="text-amber-300">{d}</p>
                  ))}
                </div>
              )}
            </div>

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
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <label className="flex items-center gap-1.5 text-[12px] text-dark-400">
                          <input type="checkbox" checked={!!e.con_nombre}
                            onChange={(ev) => setEst(i, 'con_nombre', ev.target.checked)} />
                          Lleva el nombre del conductor
                        </label>
                        <label className={`flex items-center gap-1.5 text-[12px] ${hayLogo ? 'text-dark-400' : 'text-dark-600'}`}
                          title={hayLogo ? '' : 'Sube tu logo arriba para poder usarlo'}>
                          <input type="checkbox" disabled={!hayLogo} checked={hayLogo && e.usa_logo !== false}
                            onChange={(ev) => setEst(i, 'usa_logo', ev.target.checked)} />
                          Usar mi logo
                        </label>
                      </div>
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
              <Lienzo prenda={f} datos={datos} logos={logos} cara={cara} />
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
            <button onClick={calcular} disabled={calculando}
              className="btn-secondary mt-3 inline-flex w-full items-center justify-center gap-1.5 text-[12px]">
              {calculando ? <Loader2 size={13} className="animate-spin" /> : <Calculator size={13} />}
              Como hacerla y a cuanto sale
            </button>
          </div>
        </div>

        {ficha && <Ficha ficha={ficha} onCopiar={copiarTaller} copiado={copiado} />}
      </div>
    </div>
  )
}

/* Como se hace y a cuanto sale. Los costes son ESTIMACIONES y se dice aqui, no
   en una nota al pie: con un numero que parece cerrado se encargan 40 unidades. */
function Ficha({ ficha, onCopiar, copiado }) {
  return (
    <div className="mt-5 rounded-xl border border-dark-800 bg-dark-900/40 p-4">
      <div className="mb-2 text-[13px] font-semibold text-dark-100">
        Como hacerla · pedido de {ficha.unidades} unidades
      </div>

      <div className="space-y-2">
        {ficha.lineas.map((l, i) => (
          <div key={i} className="rounded-lg border border-dark-800 px-3 py-2 text-[12.5px]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium text-dark-100">{l.que}</span>
              <span className="text-brand-300">{l.tecnica}</span>
            </div>
            <div className="mt-0.5 text-[11.5px] text-dark-500">{l.porque}</div>
            {(l.por_unidad > 0 || l.preparacion > 0) && (
              <div className="mt-1 text-[11.5px] tabular-nums text-dark-400">
                {eur(l.por_unidad)}/unidad
                {l.preparacion > 0 && <> · {eur(l.preparacion)} de preparacion, una sola vez</>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cifra t="Prenda" v={eur(ficha.coste_prenda)} />
        <Cifra t="Estampacion" v={eur(ficha.coste_estampacion)} />
        <Cifra t="Preparacion" v={eur(ficha.preparacion_por_unidad) + '/ud'} />
        <Cifra t="Te cuesta" v={eur(ficha.coste)} fuerte />
      </div>

      <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-[12.5px] text-dark-300">
        Vendela a <b className="text-emerald-300">{eur(ficha.pvp_sugerido)}</b> y te quedan{' '}
        <b className="text-emerald-300">{eur(ficha.margen)}</b> ({ficha.margen_pct}%), ya quitado el IVA.
        <span className="text-dark-500"> Objetivo: {ficha.objetivo_pct}%.</span>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-medium text-dark-300">Que mandarle al taller</span>
          <button onClick={onCopiar} className="inline-flex items-center gap-1 text-[12px] text-brand-400 hover:text-brand-300">
            {copiado ? <Check size={12} /> : <Copy size={12} />} {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-dark-800 bg-dark-950 p-3 text-[11.5px] leading-relaxed text-dark-300">{ficha.texto_para_el_taller}</pre>
      </div>

      <p className="mt-2 text-[11.5px] leading-snug text-dark-500">
        Los costes son estimaciones de mercado, no presupuestos. Manda ese texto a tres
        talleres y sustituye los numeros: entonces este margen es tu cuenta.
      </p>
    </div>
  )
}

function Cifra({ t, v, fuerte }) {
  return (
    <div className="rounded-lg border border-dark-800 px-2.5 py-1.5">
      <div className="text-[11px] text-dark-500">{t}</div>
      <div className={`text-[13px] tabular-nums ${fuerte ? 'font-semibold text-dark-100' : 'text-dark-300'}`}>{v}</div>
    </div>
  )
}


/* ───────────────────────── Tu logo ───────────────────────── */

/* TRES VARIANTES, no una. No es capricho de diseño: es lo que pide un taller.
   Sobre prenda oscura se estampa la blanca a una tinta, sobre clara la negra, y
   la de color solo cuando el presupuesto admite dos. Guardando solo la de color
   habria que recolorearla en pantalla —que con un vectorial ajeno sale mal— y
   ademas no es lo que se le manda al serigrafiador. */
const VARIANTES = [
  { id: 'blanco', titulo: 'Blanco', para: 'para prenda oscura', fondo: '#16191C' },
  { id: 'negro', titulo: 'Negro', para: 'para prenda clara', fondo: '#F5F7F8' },
  { id: 'color', titulo: 'Color', para: 'solo si hay 2 tintas', fondo: '#2A2F33' },
]

function ElLogo({ datos, onCambio }) {
  const [subiendo, setSubiendo] = useState('')
  const [err, setErr] = useState('')
  const logos = datos?.logos || {}
  const hay = Object.keys(logos).length

  const subir = async (variante, archivo) => {
    if (!archivo) return
    setSubiendo(variante); setErr('')
    try {
      await tiendaSubirLogo(variante, archivo)
      onCambio()
    } catch (e) {
      setErr(e?.response?.data?.detail || 'No se ha podido subir.')
    } finally { setSubiendo('') }
  }

  const quitar = async (variante) => {
    setErr('')
    try {
      await tiendaBorrarLogo(variante)
      onCambio()
    } catch { setErr('No se ha podido quitar.') }
  }

  return (
    <div id="tienda-logo" className="mt-4 rounded-xl border border-dark-800 bg-dark-900/40 p-3">
      <div className="mb-1 text-[13px] font-semibold text-dark-100">Tu logo</div>
      <p className="mb-2.5 text-[12px] leading-snug text-dark-500">
        Súbelo en vectorial (.svg) y se dibujará él en las prendas en vez de las letras.
        {hay ? '' : ' Mientras no lo subas se pinta «FDs» de muestra.'}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {VARIANTES.map((v) => {
          const l = logos[v.id]
          return (
            <div key={v.id} className="rounded-lg border border-dark-800 p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-medium text-dark-200">{v.titulo}</span>
                <span className="text-[11px] text-dark-500">{v.para}</span>
              </div>
              <div className="mt-1.5 flex h-[54px] items-center justify-center rounded"
                style={{ background: v.fondo }}>
                {l ? <img src={l.url} alt={`Logo ${v.titulo}`} style={{ maxHeight: 44, maxWidth: '90%' }} />
                  : <span className="text-[11px] text-dark-600">sin subir</span>}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <label className="cursor-pointer text-[11.5px] text-brand-400 hover:text-brand-300">
                  {subiendo === v.id
                    ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Subiendo</span>
                    : <span className="inline-flex items-center gap-1"><Upload size={11} /> {l ? 'Cambiar' : 'Subir'}</span>}
                  <input type="file" accept=".svg,.png,image/svg+xml,image/png" className="hidden"
                    onChange={(e) => { subir(v.id, e.target.files?.[0]); e.target.value = '' }} />
                </label>
                {l && (
                  <button onClick={() => quitar(v.id)}
                    className="text-[11.5px] text-dark-500 hover:text-red-400">Quitar</button>
                )}
              </div>
              {l && (
                <div className="mt-0.5 truncate text-[10.5px] text-dark-600">
                  {l.nombre} · {Math.round(l.bytes / 1024)} KB{l.vectorial ? ' · vectorial' : ' · PNG'}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {err && <p className="mt-2 text-[12px] text-red-400">{err}</p>}
    </div>
  )
}
