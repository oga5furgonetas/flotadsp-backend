import LegalLayout from './LegalLayout'
import { COMPANY } from './config'

export default function Cookies() {
  return (
    <LegalLayout title="Política de Cookies">
      <h2>1. ¿Qué son las cookies?</h2>
      <p>Las cookies (y tecnologías similares como el <em>localStorage</em>) son pequeños archivos que un sitio web guarda en tu dispositivo para que funcione correctamente o para recordar información entre visitas.</p>

      <h2>2. Cookies que utiliza {COMPANY.brand}</h2>
      <p>Actualmente {COMPANY.brand} utiliza <strong>únicamente almacenamiento estrictamente necesario</strong> para el funcionamiento del Servicio. No usamos cookies de seguimiento publicitario ni analítica de terceros.</p>
      <table className="w-full text-xs">
        <thead><tr className="border-b border-dark-800 text-left text-dark-500"><th className="py-1">Nombre</th><th>Finalidad</th><th>Duración</th><th>Tipo</th></tr></thead>
        <tbody className="text-dark-300">
          <tr className="border-b border-dark-800/60"><td className="py-1.5"><code>flotadsp_token</code></td><td>Mantener tu sesión iniciada</td><td>Hasta cerrar sesión</td><td>Necesaria</td></tr>
          <tr className="border-b border-dark-800/60"><td className="py-1.5"><code>flotadsp_admin</code></td><td>Recordar tu cuenta y permisos</td><td>Hasta cerrar sesión</td><td>Necesaria</td></tr>
          <tr className="border-b border-dark-800/60"><td className="py-1.5"><code>panel_tab</code>, <code>panel_center</code></td><td>Recordar tu pestaña y centro activo</td><td>Hasta limpiar el navegador</td><td>Preferencia</td></tr>
          <tr className="border-b border-dark-800/60"><td className="py-1.5"><code>flota_plan</code></td><td>Recordar el plan elegido durante el registro</td><td>Sesión</td><td>Necesaria</td></tr>
          <tr><td className="py-1.5"><code>cookie_consent</code></td><td>Recordar que has visto este aviso</td><td>12 meses</td><td>Necesaria</td></tr>
        </tbody>
      </table>

      <h2>3. Cookies de terceros</h2>
      <p>Durante el proceso de pago serás redirigido a <strong>Lemon Squeezy</strong>, que puede establecer sus propias cookies necesarias para procesar el pago. Consulta su política en <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noreferrer">lemonsqueezy.com/privacy</a>.</p>

      <h2>4. Gestión y consentimiento</h2>
      <p>Como solo usamos almacenamiento estrictamente necesario, no requerimos consentimiento previo según la guía de la AEPD; aun así, te mostramos un aviso informativo al entrar. Puedes borrar el almacenamiento desde la configuración de tu navegador en cualquier momento (esto cerrará tu sesión).</p>

      <h2>5. Cambios</h2>
      <p>Si añadimos cookies analíticas o de marketing en el futuro, te pediremos consentimiento previo explícito y actualizaremos esta página.</p>
    </LegalLayout>
  )
}
