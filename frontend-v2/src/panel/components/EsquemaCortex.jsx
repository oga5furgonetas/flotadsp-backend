/* ─────────────────────────────────────────────────────────────────────────────
   QUÉ MANDA CORTEX DE VERDAD
   ---------------------------------------------------------------------------
   Enseña el esquema real de las respuestas de Cortex (route-details, el sumario
   y el informe de faltas) tal y como lo ve la extensión en el navegador.

   POR QUÉ EXISTE ESTA PANTALLA
   Para dejar de escribir reglas a ojo. El caso concreto: para dar un DCR real
   habría que descontar las anulaciones hechas en la propia nave antes de salir,
   pero Cortex no tiene un estado de "anulado". Mientras no se sepa qué campo lo
   marca —un taskType, un taskStateContext, un tipo de parada— cualquier
   exclusión del DCR es una suposición. Y una suposición que mueve el DCR es
   peor que no tocarlo: nadie la puede comprobar.

   La extensión ya capturaba esto desde hace meses, pero se lo quedaba en el
   almacenamiento local del navegador y no lo mandaba a ninguna parte.

   Es ESTRUCTURA, no datos: el `schemaOf` del interceptor sustituye los valores
   por su tipo y solo conserva las cadenas cortas, que son justamente los
   códigos de estado. Ni nombres ni teléfonos de cliente.
   ───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Braces, Loader2 } from 'lucide-react'
import { cortexDiagnostico } from '../api'

const TITULOS = {
  details: 'route-details (los paquetes)',
  summary: 'route-summaries (las rutas del día)',
  report: 'informe de faltas',
}

export default function EsquemaCortex() {
  const [datos, setDatos] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    setCargando(true)
    cortexDiagnostico()
      .then((r) => setDatos(r.data))
      .catch(() => setDatos({ diagnostico: [], hay_esquema: false }))
      .finally(() => setCargando(false))
  }, [])

  const esquemas = (datos?.diagnostico || []).filter((d) => d.kind === 'schema' && d.schema)
  const versiones = datos?.versiones || []
  const estadosInforme = (datos?.diagnostico || []).find((d) => d.which === 'estados_informe')

  return (
    <div className="rounded-xl border border-dark-800 bg-dark-900/30 p-4">
      <div className="flex items-center gap-2">
        <Braces size={14} className="text-brand-400" />
        <h3 className="text-sm font-bold text-dark-100">Qué manda Cortex de verdad</h3>
        {cargando && <Loader2 size={12} className="animate-spin text-dark-500" />}
      </div>
      <p className="mt-1 max-w-[640px] text-[11.5px] leading-relaxed text-dark-500">
        La estructura de las respuestas de Cortex, capturada por la extensión. Sirve para
        decidir con pruebas qué campo marca una anulación en nave, en vez de inventarse un
        umbral de hora y dirección para tocar el DCR.
      </p>

      {/* QUE VERSION LLEVA CADA EQUIPO. Antes se guardaba una sola por empresa
          y el ultimo PC que hablara pisaba a los demas, asi que no habia forma
          de instalar una version nueva en uno solo y comprobar que era ese. */}
      {versiones.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {versiones.map((v) => (
            <span key={v.version} className="rounded-lg border border-dark-800 bg-dark-950/40 px-2.5 py-1 text-[11.5px] text-dark-300">
              extensión <b className="text-dark-100">{v.version}</b>
              <span className="text-dark-500"> · {v.equipos} {v.equipos === 1 ? 'equipo' : 'equipos'}</span>
            </span>
          ))}
        </div>
      )}

      {/* De que estados pide Cortex el informe de direcciones. Es lo unico que
          decide si «Apoyo en ruta» tiene ubicaciones o solo numeros de parada,
          y hasta ahora solo se veia en el popup del equipo que lo probo. */}
      {estadosInforme && (
        <div className="mt-2 rounded-lg border border-dark-800 bg-dark-950/40 px-3 py-2 text-[11.5px] leading-relaxed text-dark-300">
          <span className="font-semibold text-dark-100">Informe de direcciones · </span>
          {estadosInforme.url}
        </div>
      )}

      {!cargando && esquemas.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dark-800 bg-dark-950/40 px-3 py-2 text-[11.5px] leading-relaxed text-dark-300">
          Todavía no ha llegado ninguno. Se manda solo la primera vez que la extensión ve una
          respuesta de Cortex: abre una ruta en Cortex con la extensión activa y vuelve aquí.
          Hace falta la versión 2.11 o superior — las anteriores lo guardaban en el navegador
          sin enviarlo.
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {esquemas.map((d) => (
            <div key={d.which} className="overflow-hidden rounded-lg border border-dark-800">
              <button
                onClick={() => setAbierto(abierto === d.which ? null : d.which)}
                className="flex w-full items-center gap-2 bg-dark-950/40 px-3 py-2 text-left"
              >
                <span className="flex-1 text-[12.5px] font-semibold text-dark-200">
                  {TITULOS[d.which] || d.which}
                </span>
                <span className="text-[10.5px] text-dark-600">
                  {String(d.visto_en || '').slice(0, 10)}
                </span>
                {abierto === d.which
                  ? <ChevronUp size={14} className="text-dark-500" />
                  : <ChevronDown size={14} className="text-dark-500" />}
              </button>
              {abierto === d.which && (
                <pre className="max-h-96 overflow-auto bg-dark-950/60 px-3 py-2 text-[10.5px] leading-relaxed text-dark-300">
                  {formatear(d.schema)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* El esquema llega como una cadena JSON, y puede venir recortada a 8.000
   caracteres: si no parsea se enseña en crudo en vez de no enseñar nada. */
function formatear(s) {
  try { return JSON.stringify(JSON.parse(s), null, 1) } catch { return s }
}
