import LegalLayout from './LegalLayout'
import { COMPANY } from './config'

export default function Terminos() {
  return (
    <LegalLayout title="Términos y Condiciones de Uso">
      <p>Al registrarte o usar {COMPANY.brand} (en adelante, "el Servicio"), aceptas estas condiciones. Si no estás de acuerdo, no uses el Servicio.</p>

      <h2>1. Quiénes somos</h2>
      <p>El Servicio es prestado por {COMPANY.legalName} (CIF {COMPANY.cif}), con domicilio en {COMPANY.address}. Contacto: <a href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a>.</p>

      <h2>2. Objeto del Servicio</h2>
      <p>{COMPANY.brand} es una plataforma web SaaS para gestionar flotas de furgonetas, conductores e inspecciones, incluyendo el análisis automático de fotografías mediante inteligencia artificial.</p>

      <h2>3. Cuenta y responsabilidad del cliente</h2>
      <ul>
        <li>El cliente garantiza que los datos aportados son veraces y que tiene base legal para tratar los datos de sus conductores y vehículos.</li>
        <li>El cliente es responsable de la custodia de sus credenciales y de la actividad realizada bajo su cuenta.</li>
        <li>Está prohibido usar el Servicio para fines ilícitos, vulnerar derechos de terceros o intentar comprometer su seguridad.</li>
      </ul>

      <h2>4. Inteligencia Artificial — alcance y límites</h2>
      <p><strong>Los análisis generados por la IA son una asistencia automatizada y no sustituyen la revisión humana.</strong> {COMPANY.brand} no garantiza que la detección de daños, severidad o coste estimado sea exacta en todos los casos. El cliente es responsable de validar los resultados antes de utilizarlos en disputas con terceros (talleres, conductores, aseguradoras, etc.). Las correcciones humanas pueden usarse, de forma anonimizada, para mejorar el modelo.</p>

      <h2>5. Suscripción, prueba y pagos</h2>
      <ul>
        <li>El alta incluye un periodo de prueba gratuito de <strong>14 días</strong>.</li>
        <li>Los pagos se gestionan a través de <strong>Lemon Squeezy</strong>, que actúa como <strong>Merchant of Record</strong> (emite las facturas con IVA).</li>
        <li>Las suscripciones se <strong>renuevan automáticamente</strong> al final de cada periodo facturable, salvo cancelación previa.</li>
        <li>Puedes <strong>cancelar en cualquier momento</strong> desde el panel o escribiendo a {COMPANY.contactEmail}. La cancelación es efectiva al final del periodo ya pagado; no procede reembolso del periodo en curso salvo error técnico imputable a {COMPANY.brand} o derecho legal de desistimiento aplicable a consumidores (no aplica a clientes empresariales).</li>
        <li>Los precios pueden actualizarse con aviso previo de al menos 30 días.</li>
      </ul>

      <h2>6. Disponibilidad del Servicio</h2>
      <p>{COMPANY.brand} hace esfuerzos razonables para mantener el Servicio disponible 24/7, pero no garantiza un nivel de servicio (SLA) específico salvo acuerdo separado. Pueden producirse interrupciones por mantenimiento o causas ajenas (fallos de proveedores, fuerza mayor).</p>

      <h2>7. Propiedad intelectual</h2>
      <p>El software, marca, diseño y código del Servicio son propiedad de {COMPANY.legalName}. El cliente conserva la titularidad de los datos y fotografías que sube, y otorga a {COMPANY.brand} una licencia limitada para alojarlos y procesarlos con el único fin de prestar el Servicio (incluido el análisis IA y la mejora anonimizada del modelo).</p>

      <h2>8. Limitación de responsabilidad</h2>
      <p>En la máxima medida permitida por la ley, {COMPANY.brand} no responderá por daños indirectos, lucro cesante, pérdida de datos o reclamaciones de terceros derivadas del uso del Servicio. La responsabilidad agregada quedará limitada al importe pagado por el cliente en los 12 meses anteriores al hecho que motive la reclamación.</p>

      <h2>9. Suspensión y baja</h2>
      <p>{COMPANY.brand} podrá suspender o cancelar cuentas que incumplan estos términos, que impaguen suscripciones, o ante actividad fraudulenta. Se notificará por email cuando sea posible.</p>

      <h2>10. Protección de datos</h2>
      <p>El tratamiento de datos personales se rige por la <a href="/privacidad">Política de Privacidad</a>. Si el cliente trata datos personales de sus empleados/conductores a través de {COMPANY.brand}, podrá solicitar un <strong>Acuerdo de Encargo de Tratamiento (DPA)</strong> escribiendo a {COMPANY.privacyEmail}.</p>

      <h2>11. Ley aplicable y jurisdicción</h2>
      <p>Estos términos se rigen por la {COMPANY.governingLaw}. Las controversias se someterán a los Juzgados y Tribunales de {COMPANY.jurisdiction}, salvo norma imperativa en contrario para consumidores.</p>

      <h2>12. Cambios</h2>
      <p>Podemos actualizar estos términos; los cambios sustanciales se notificarán con al menos 15 días de antelación. Si no estás de acuerdo, podrás cancelar tu cuenta antes de que entren en vigor.</p>
    </LegalLayout>
  )
}
