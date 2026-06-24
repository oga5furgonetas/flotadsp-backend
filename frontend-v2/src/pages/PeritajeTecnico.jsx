import { Link } from 'react-router-dom'
import { ShieldCheck, FileLock2, Fingerprint, AlertTriangle, Check, ArrowRight } from 'lucide-react'
import { LANGS, useT } from '../i18n'

// Landing dedicada del feature estrella (Pro + AI Forensics).
// Lenguaje: "evidencia técnica con cadena de custodia". NUNCA "admisible en juicio".
export default function PeritajeTecnico() {
  const { lang, setLang } = useT()
  return (
    <div className="min-h-screen bg-dark-950 text-dark-50">
      {/* Nav */}
      <nav className="border-b border-dark-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold">⚡</div>
            <b>FlotaDSP</b>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/planes" className="text-sm text-dark-300 hover:text-dark-100">Precios</Link>
            <Link to="/contacto" className="text-sm text-dark-300 hover:text-dark-100">Contacto</Link>
            <Link to="/panel/login" className="rounded-lg border border-dark-700 px-3 py-1.5 text-sm hover:bg-dark-800">Entrar</Link>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-lg border border-dark-800 bg-dark-900 px-2 py-1 text-xs">
              {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 py-16 text-center">
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-300">
          <ShieldCheck size={14} /> Pro + AI Forensics
        </span>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight md:text-5xl">
          Demuestra <span className="text-sky-400">quién golpeó cada furgo</span>. Sin discusión.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-dark-300">
          Peritaje técnico con firma del conductor y cadena de custodia con hash inmutable. Para DSPs de Amazon que están cansados de comerse daños que no causaron.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link to="/registro?plan=Forensics" className="rounded-lg bg-gradient-to-r from-sky-500 to-sky-700 px-6 py-3 text-base font-bold text-white shadow-lg shadow-sky-900/40 hover:from-sky-400 hover:to-sky-600">
            Empezar 14 días gratis · 499€/mes
          </Link>
          <Link to="/contacto?asunto=Peritaje" className="rounded-lg border border-dark-700 px-5 py-3 text-base font-semibold text-dark-200 hover:bg-dark-800">
            Hablar con ventas →
          </Link>
        </div>
        <p className="mt-3 text-xs text-dark-500">Sin tarjeta durante la prueba. Cancela cuando quieras.</p>
      </section>

      {/* Antes vs Después */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-red-300">
              <AlertTriangle size={16} /> Antes (lo que pasa hoy)
            </div>
            <ul className="space-y-3 text-sm text-dark-300">
              <li>📸 Conductor entrega furgo sin parte. Al día siguiente aparece un golpe.</li>
              <li>🤷 Nadie sabe si fue él, el anterior, o un tercero en la calle.</li>
              <li>💸 Te comes 800-3.000€ de reparación.</li>
              <li>⚠ Tu scorecard de Amazon se resiente y nadie reconoce nada.</li>
              <li>😤 Acabas pagando para evitar el conflicto laboral.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-emerald-300">
              <ShieldCheck size={16} /> Después (con AI Forensics)
            </div>
            <ul className="space-y-3 text-sm text-dark-300">
              <li>📱 Conductor fotografía vehículo al salir y al volver. 90 segundos.</li>
              <li>🤖 La IA detecta daños nuevos comparando con la inspección anterior.</li>
              <li>🔒 Cada inspección queda sellada con hash y firma del conductor (timestamp + IP).</li>
              <li>📄 PDF de evidencia técnica generado al instante.</li>
              <li>🛡️ Cuando hay disputa, sabes <b>quién</b> tenía el vehículo cuando apareció el daño.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="border-y border-dark-800 bg-dark-900/40 py-16">
        <div className="mx-auto max-w-5xl px-5">
          <h2 className="mb-12 text-center text-3xl font-extrabold">Cómo funciona en 3 pasos</h2>
          <div className="grid gap-8 md:grid-cols-3">
            <Step n={1} icon={<Fingerprint size={26} />} title="Inspección con firma"
              text="Al salir y volver, el conductor hace fotos guiadas en el móvil. Firma digital al terminar. 90 segundos." />
            <Step n={2} icon={<ShieldCheck size={26} />} title="Análisis IA + comparación"
              text="La IA detecta daños nuevos comparando con la última inspección del mismo vehículo. Si lo hay, lo señala con confianza visible." />
            <Step n={3} icon={<FileLock2 size={26} />} title="Cadena de custodia"
              text="Cada inspección se sella con hash SHA-256, timestamp y datos del conductor. Inmutable, descargable como PDF de evidencia." />
          </div>
        </div>
      </section>

      {/* Qué incluye */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="mb-3 text-center text-3xl font-extrabold">Qué incluye Pro + AI Forensics</h2>
        <p className="mb-10 text-center text-dark-400">Todo lo del plan Pro, más lo que de verdad cierra disputas:</p>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ['Peritaje técnico firmado', 'PDF con cadena de custodia hash + datos del conductor.'],
            ['Detección de fraude', 'Foto antigua, vehículo equivocado, imagen manipulada → alerta inmediata.'],
            ['Scorecard AI Coach', 'La IA lee tu scorecard semanal y te da plan de acción por conductor.'],
            ['Confidence scoring', 'Cada daño detectado lleva su % de confianza. Lo dudoso pasa a revisión humana.'],
            ['Hash inmutable', 'Imposible falsificar el peritaje a posteriori (auditoría reproducible).'],
            ['Soporte prioritario', 'Chat con respuesta <2h en horario comercial.'],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-3 rounded-xl border border-dark-800 bg-dark-900/50 p-4">
              <Check className="mt-0.5 shrink-0 text-emerald-400" size={18} />
              <div>
                <div className="font-semibold">{t}</div>
                <div className="text-sm text-dark-400">{d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Honestidad explícita */}
      <section className="mx-auto max-w-3xl px-5 pb-16">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase text-amber-300">
            <AlertTriangle size={16} /> Honestidad por delante
          </div>
          <p className="text-sm leading-relaxed text-dark-300">
            <b>FlotaDSP no es asesoría jurídica.</b> El peritaje técnico que generamos es evidencia documental con cadena de custodia — tu abogado decide su uso ante terceros (Amazon, conductores, aseguradoras, juzgados). Lo que sí garantizamos: análisis técnico reproducible, no manipulable, generado en el momento del incidente.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-dark-300">
            <b>Acceso anticipado:</b> algunas piezas del peritaje firmado se entregan asistidas por nuestro equipo durante las primeras semanas de tu cuenta, mientras finalizamos la automatización. Tu peritaje siempre llega; el proceso solo es más artesanal al principio.
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-3xl px-5 pb-24 text-center">
        <h2 className="mb-3 text-2xl font-extrabold">Si te ahorra una sola disputa al año, paga 3 veces el plan.</h2>
        <p className="mb-7 text-dark-400">Pero no lo vendemos por el ahorro. Lo vendemos para que dejes de pelearte con cada conductor.</p>
        <Link to="/registro?plan=Forensics" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-sky-700 px-7 py-3.5 text-base font-bold text-white shadow-lg shadow-sky-900/40 hover:from-sky-400 hover:to-sky-600">
          Empezar 14 días gratis <ArrowRight size={17} />
        </Link>
      </section>

      <footer className="border-t border-dark-800 py-6 text-center text-xs text-dark-500">
        © {new Date().getFullYear()} FlotaDSP · <Link to="/privacidad" className="hover:text-dark-300">Privacidad</Link> · <Link to="/terminos" className="hover:text-dark-300">Términos</Link> · <Link to="/contacto" className="hover:text-dark-300">Contacto</Link>
      </footer>
    </div>
  )
}

function Step({ n, icon, title, text }) {
  return (
    <div className="relative rounded-2xl border border-dark-800 bg-dark-900 p-6">
      <div className="absolute -top-4 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 text-sm font-extrabold text-white">{n}</div>
      <div className="mb-3 text-sky-400">{icon}</div>
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <p className="text-sm text-dark-400">{text}</p>
    </div>
  )
}
