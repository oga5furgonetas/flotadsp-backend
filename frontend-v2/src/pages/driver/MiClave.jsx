import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Loader2, Lock } from 'lucide-react'
import { changeMyPassword, getMiFicha } from '../../services/api'

/* Cambiar la contraseña uno mismo.

   Antes esto solo lo podía hacer un admin, así que un conductor que quisiera
   cambiarla tenía que pedírselo a la oficina y decirle cuál quería — es decir,
   contarle su contraseña a otra persona. Ahora se la pone él y nadie más la ve. */
export default function MiClave({ onBack }) {
  /* CREAR NO ES CAMBIAR. Al portal se entra con el correo y ya: `driver_accounts`
     estaba VACIA, o sea que ninguno de los 140 tenia contrasena. Esta pantalla
     les pedia igualmente la ACTUAL y devolvia siempre «la contrasena actual no
     es correcta» — una pantalla que no podia funcionar para nadie. El servidor
     dice si la tiene (`tiene_clave`) y aqui solo se pinta lo que toca. */
  const [tieneClave, setTieneClave] = useState(null)
  useEffect(() => {
    getMiFicha().then((r) => setTieneClave(!!r.data?.tiene_clave)).catch(() => setTieneClave(true))
  }, [])
  const creando = tieneClave === false

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [err, setErr] = useState('')
  const [hecho, setHecho] = useState(false)

  const corta = nueva.length > 0 && nueva.length < 6
  const distintas = repetir.length > 0 && nueva !== repetir
  const puede = (creando || actual) && nueva.length >= 6 && nueva === repetir && !ocupado
    && tieneClave !== null

  async function guardar() {
    setOcupado(true); setErr('')
    try {
      await changeMyPassword(actual, nueva)
      setHecho(true)
    } catch (e) {
      setErr(e?.response?.status === 401
        ? 'La contraseña actual no es correcta.'
        : (e?.response?.data?.detail || 'No se pudo cambiar. Inténtalo otra vez.'))
    } finally { setOcupado(false) }
  }

  return (
    <div className="min-h-screen bg-dark-950 px-4 py-6">
      <div className="mx-auto max-w-md">
        <button onClick={onBack} className="mb-5 flex items-center gap-1.5 text-[13px] text-dark-400">
          <ArrowLeft size={15} /> Volver
        </button>

        <h1 className="font-display text-[22px] font-bold tracking-[-.02em] text-dark-50">
          {creando ? 'Crear mi contraseña' : 'Cambiar mi contraseña'}
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-dark-500">
          {creando
            ? 'Ahora entras solo con tu correo. Ponte una contraseña y a partir de la próxima vez te la pedirá también a ti — y solo a ti: nadie de la oficina la ve.'
            : 'Ponte la que quieras, mínimo 6 caracteres. Nadie de la oficina la va a ver.'}
        </p>

        {hecho ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-emerald-300">
              <Check size={16} /> {creando ? 'Contraseña creada' : 'Contraseña cambiada'}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-emerald-200/80">
              {creando
                ? 'La próxima vez entra con tu correo y esta contraseña. El correo no cambia.'
                : 'La próxima vez entra con la nueva. Tu email no cambia.'}
            </p>
            <button onClick={onBack} className="mt-4 w-full rounded-xl bg-dark-800 py-2.5 text-[14px] font-semibold text-dark-100">
              Volver al inicio
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {/* Solo si YA tiene una. Pedirle la anterior a quien nunca la tuvo
                es lo que hacia que esta pantalla no funcionara para nadie. */}
            {!creando && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                  Tu contraseña de ahora
                </label>
                <input type="password" value={actual} onChange={(e) => setActual(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-dark-700 bg-dark-900 px-3.5 py-3 text-[15px] text-dark-50 outline-none focus:border-brand-500/60" />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                {creando ? 'Tu contraseña' : 'La nueva'}
              </label>
              <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-xl border border-dark-700 bg-dark-900 px-3.5 py-3 text-[15px] text-dark-50 outline-none focus:border-brand-500/60" />
              {corta && <p className="mt-1.5 text-[12px] text-amber-300">Te faltan {6 - nueva.length} caracteres.</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-dark-500">
                Repítela
              </label>
              <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-xl border border-dark-700 bg-dark-900 px-3.5 py-3 text-[15px] text-dark-50 outline-none focus:border-brand-500/60" />
              {distintas && <p className="mt-1.5 text-[12px] text-amber-300">Las dos no coinciden.</p>}
            </div>

            {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{err}</p>}

            <button onClick={guardar} disabled={!puede}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-[15px] font-bold text-white disabled:opacity-40">
              {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
              {creando ? 'Crear mi contraseña' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
