import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, ShieldAlert, Camera, ChevronRight, Info } from 'lucide-react'
import { getAtribucionDanos } from '../api'

/* La misma pieza viene escrita de dos formas desde la IA ('Paragolpes
   delantero' 30 veces y 'paragolpes delantero' otras 26), y en una lista se
   leen como dos cosas distintas. Se enseñan igual sin tocar el dato: el texto
   original es más legible que la clave canónica que devuelve el backend, que
   sirve para contar y no para leer. */
function nombrePieza(t) {
  const s = String(t || '').trim()
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/* ORIGEN DE DAÑOS
   ═══════════════════════════════════════════════════════════════════════════
   Para cada golpe del libro busca la ÚLTIMA foto en la que la furgoneta estaba
   limpia. Con eso acota cuándo apareció y quién la llevaba en esa ventana.

   Hoy nadie sabe quién rompe las furgonetas: se ve el golpe y ya está. Las
   herramientas del mercado que hacen algo parecido exigen cambiar el proceso
   —que el conductor siguiente firme al recoger— y solo sirven hacia delante.
   Aquí sale de las 3.804 inspecciones que ya hay guardadas, mirando hacia atrás.

   ═══ ESTO SEÑALA A PERSONAS ═══
   Por eso la pantalla está montada al revés de lo normal: lo primero que se ve
   son las DOS FOTOS, y el nombre va después. Un nombre sin la prueba delante no
   es un dato, es una acusación — y quien mira esto va a hablar con esa persona.

   Y nunca dice «lo rompió»: dice «la llevaba». La app sabe quién conducía, no
   quién dio el golpe; pudo ser un tercero en un parking. Esa diferencia es la
   que hace que esto se pueda enseñar sin que nadie se sienta acusado en falso. */

const CERTEZA = {
  alta: { txt: 'Un solo conductor', cls: 'bg-lime-500/15 text-lime-300 ring-lime-500/30' },
  media: { txt: 'Varios posibles', cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
  baja: { txt: 'Sin acotar', cls: 'bg-dark-800 text-dark-400 ring-dark-700' },
}
const SEV = {
  critico: 'text-red-300', grave: 'text-orange-300',
  moderado: 'text-amber-300', leve: 'text-dark-400',
}

function Prueba({ d }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <figure className="m-0">
        <img src={d.foto_limpia} alt="" loading="lazy"
          className="h-36 w-full rounded-lg border border-dark-700 object-cover" />
        <figcaption className="mt-1 text-[11px] text-dark-500">
          Limpia el <span className="cifra text-dark-400">{d.foto_limpia_fecha}</span>
        </figcaption>
      </figure>
      <figure className="m-0">
        <img src={d.foto_golpe} alt="" loading="lazy"
          className="h-36 w-full rounded-lg border border-orange-500/40 object-cover" />
        <figcaption className="mt-1 text-[11px] text-orange-300">
          Con el golpe el <span className="cifra">{d.aparecio}</span>
        </figcaption>
      </figure>
    </div>
  )
}

export default function OrigenDanos() {
  const { center } = useOutletContext()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('alta')
  const [abierto, setAbierto] = useState(null)

  useEffect(() => {
    setCargando(true)
    getAtribucionDanos(center, 200)
      .then((r) => setDatos(r.data))
      .catch(() => setDatos({ danos: [], resumen: {} }))
      .finally(() => setCargando(false))
  }, [center])

  const lista = useMemo(() => {
    const ds = datos?.danos || []
    return filtro === 'todos' ? ds : ds.filter((d) => d.certeza === filtro)
  }, [datos, filtro])

  const r = datos?.resumen || {}

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold text-dark-50">Origen de daños</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] text-dark-400">
          De cada golpe, la última foto en la que la furgoneta estaba limpia. Con eso
          se sabe qué día apareció y quién la llevaba.
        </p>
      </div>

      {/* El aviso NO es decorativo y no se puede quitar: es lo que evita que
          esto se lea como una lista de culpables. */}
      <div className="flex gap-2.5 rounded-lg border border-dark-700 bg-dark-900/60 px-3.5 py-2.5">
        <Info size={15} className="mt-0.5 flex-none text-dark-400" />
        <p className="text-[12.5px] leading-relaxed text-dark-400">
          Esto dice <span className="font-semibold text-dark-200">quién la llevaba</span>, no
          quién dio el golpe. Un roce en un parking o un tercero marcha atrás no dejan
          rastro distinto. Mira siempre las dos fotos antes de hablar con nadie.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[['alta', 'Un solo conductor', r.alta],
          ['media', 'Varios posibles', r.media],
          ['baja', 'Sin acotar', r.baja],
          ['todos', 'Todos', datos?.total]].map(([k, txt, n]) => (
          <button key={k} onClick={() => { setFiltro(k); setAbierto(null) }}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              filtro === k ? 'bg-dark-700 text-dark-100' : 'bg-dark-800/60 text-dark-400 hover:text-dark-200'}`}>
            {txt} {n != null && <span className="cifra ml-1 text-dark-500">{n}</span>}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="card flex items-center justify-center gap-2 p-12 text-dark-400">
          <Loader2 size={16} className="animate-spin" /> Buscando la última foto limpia de cada golpe…
        </div>
      ) : !lista.length ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center text-dark-400">
          <ShieldAlert size={26} />
          <p className="text-[13px]">No hay golpes en este grupo.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {lista.map((d) => {
            const c = CERTEZA[d.certeza] || CERTEZA.baja
            const esta = abierto === d.ledger_id
            const tieneFotos = d.foto_limpia && d.foto_golpe
            return (
              <div key={d.ledger_id} className="card overflow-hidden">
                <button onClick={() => setAbierto(esta ? null : d.ledger_id)}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-dark-800/40">
                  <span className="cifra w-[86px] flex-none font-semibold text-dark-100">{d.matricula}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] ${SEV[d.severity] || 'text-dark-300'}`}>
                      {nombrePieza(d.part || d.panel)}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-dark-500">
                      Apareció el <span className="cifra">{d.aparecio}</span>
                      {d.ventana_dias != null && <> · ventana de <span className="cifra">{d.ventana_dias}</span> {d.ventana_dias === 1 ? 'día' : 'días'}</>}
                    </span>
                  </span>
                  {d.certeza === 'alta' && d.conductores[0] && (
                    <span className="hidden max-w-[200px] truncate text-[12.5px] text-dark-200 md:block">
                      {d.conductores[0].nombre}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${c.cls}`}>
                    {c.txt}
                  </span>
                  {tieneFotos && <Camera size={13} className="flex-none text-dark-600" />}
                  <ChevronRight size={14} className={`flex-none text-dark-600 transition-transform ${esta ? 'rotate-90' : ''}`} />
                </button>

                {esta && (
                  <div className="border-t border-dark-800 px-3.5 py-3">
                    {tieneFotos ? <Prueba d={d} /> : (
                      <p className="text-[12.5px] text-dark-500">
                        No hay foto anterior de esta furgoneta sin el golpe, así que no se
                        puede saber cuándo apareció.
                      </p>
                    )}
                    <div className="mt-3 space-y-1.5 border-t border-dark-800 pt-3 text-[12.5px]">
                      {d.conductores.length > 0 ? (
                        <p className="text-dark-300">
                          {d.conductores.length === 1 ? 'La llevaba' : 'La llevaron'}{' '}
                          {d.conductores.map((x, i) => (
                            <span key={x.id}>
                              {i > 0 && ' y '}
                              <span className="font-semibold text-dark-100">{x.nombre}</span>
                            </span>
                          ))}
                          {' '}entre las dos fotos.
                        </p>
                      ) : (
                        <p className="text-dark-500">No consta quién la llevaba en esos días.</p>
                      )}
                      {d.motivo && (
                        <p className="text-dark-500">Por qué no se acota más: {d.motivo}.</p>
                      )}
                      <p className="text-dark-600">
                        Gravedad <span className={SEV[d.severity] || ''}>{d.severity || '—'}</span>
                        {d.center && <> · {d.center}</>}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
