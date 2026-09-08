import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  Loader2, MapPin, Clock, Euro, Package, ChevronRight, AlertTriangle, Truck,
} from 'lucide-react'
import { API_BASE } from '../lib/apiBase'

/* LAS OFERTAS ABIERTAS — la página a la que llega quien busca trabajo.
   ══════════════════════════════════════════════════════════════════════════
   Hasta hoy una oferta solo se veía si alguien te pasaba SU enlace: no había
   ningún sitio donde estuvieran todas, así que quien entraba en flotadsp.com
   buscando trabajo no tenía nada que abrir y las tres ofertas circulaban por
   WhatsApp.

   VA EN CLARO Y CON EL OFICIO DELANTE, igual que el formulario de apuntarse:
   esto lo mira una persona desde la calle, con sol, decidiendo en treinta
   segundos si se fía. Furgoneta, horario, ciudad y sueldo — lo que de verdad
   se pregunta— antes que cualquier otra cosa.

   LOS FILTROS SALEN DE LAS OFERTAS QUE HAY, no de una lista escrita a mano: si
   mañana se abre una en Ourense, aparece sola. Una lista fija se queda vieja el
   día que alguien crea una oferta y nadie toca el código. */

export default function Ofertas() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [jornada, setJornada] = useState('')

  useEffect(() => {
    axios.get(`${API_BASE}/empleo/publicas`)
      .then((r) => setD(r.data))
      .catch(() => setErr('No hemos podido cargar las ofertas. Inténtalo en un minuto.'))
  }, [])

  const ofertas = useMemo(() => (d?.ofertas || []).filter(
    (o) => (!ciudad || o.ciudad === ciudad) && (!jornada || o.jornada === jornada)), [d, ciudad, jornada])

  const Chip = ({ activo, onClick, children }) => (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
        activo ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'}`}>
      {children}
    </button>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <a href="/" className="mb-8 inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-slate-800">
          ← FlotaDSP
        </a>

        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500">
            <Package size={20} className="text-white" />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-600">
            Trabaja con nosotros
          </div>
        </div>
        <h1 className="text-[30px] font-bold leading-[1.15] tracking-tight text-slate-900">
          Ofertas abiertas
        </h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-slate-600">
          Reparto de paquetería en Galicia. La furgoneta la pone la empresa, el turno es
          fijo y no vas solo: se entra en equipo y con alguien al lado los primeros días.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2">
          {[[Truck, 'Furgoneta', 'La pone la empresa'],
            [Clock, 'Turno fijo', 'Sabes tu horario'],
            [Package, 'Con equipo', 'No vas solo']].map(([Icono, t, p]) => (
              <div key={t} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <Icono size={15} className="mb-1.5 text-orange-500" />
                <div className="text-[13px] font-bold text-slate-900">{t}</div>
                <div className="text-[11.5px] text-slate-500">{p}</div>
              </div>
            ))}
        </div>

        {!d && !err && (
          <div className="flex items-center gap-2 py-14 text-[14px] text-slate-500">
            <Loader2 className="animate-spin" size={16} /> Cargando ofertas…
          </div>
        )}
        {err && (
          <p className="mt-8 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[14px] text-amber-800">
            <AlertTriangle size={16} /> {err}
          </p>
        )}

        {d && (d.ciudades.length > 1 || d.jornadas.length > 1) && (
          <div className="mt-7 flex flex-wrap gap-1.5">
            <Chip activo={!ciudad && !jornada} onClick={() => { setCiudad(''); setJornada('') }}>Todas</Chip>
            {d.ciudades.map((c) => (
              <Chip key={c} activo={ciudad === c} onClick={() => setCiudad(ciudad === c ? '' : c)}>{c}</Chip>
            ))}
            {d.jornadas.map((j) => (
              <Chip key={j} activo={jornada === j} onClick={() => setJornada(jornada === j ? '' : j)}>{j}</Chip>
            ))}
          </div>
        )}

        {d && (
          <div className="mt-5 space-y-2.5">
            {ofertas.map((o) => (
              <a key={o.slug} href={o.url}
                className="block rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-slate-400">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[17px] font-bold leading-snug text-slate-900">{o.titulo}</h2>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {o.ciudad && <Etiqueta icon={MapPin}>{o.ciudad}</Etiqueta>}
                      {o.jornada && <Etiqueta icon={Clock}>{o.jornada}</Etiqueta>}
                      {o.salario && <Etiqueta icon={Euro}>{o.salario}</Etiqueta>}
                    </div>
                    {o.resumen && (
                      <p className="mt-2.5 line-clamp-2 text-[13.5px] leading-relaxed text-slate-600">
                        {o.resumen}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={18} className="mt-1 shrink-0 text-slate-400" />
                </div>
              </a>
            ))}
            {!ofertas.length && (
              <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
                <p className="text-[14.5px] font-semibold text-slate-800">
                  {d.ofertas.length ? 'Nada con ese filtro.' : 'Ahora mismo no hay ninguna abierta.'}
                </p>
                <p className="mt-1 text-[13.5px] text-slate-500">
                  {d.ofertas.length
                    ? 'Quita el filtro para ver todas.'
                    : 'Vuelve a mirar en unos días: se abren a menudo.'}
                </p>
              </div>
            )}
          </div>
        )}

        <p className="mt-10 text-[12px] text-slate-400">
          Al apuntarte solo te pedimos lo necesario para poder llamarte. Puedes pedirnos
          que borremos tus datos cuando quieras.
        </p>
      </div>
    </div>
  )
}

function Etiqueta({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[12px] font-medium text-slate-700">
      <Icon size={12} className="text-slate-500" /> {children}
    </span>
  )
}
