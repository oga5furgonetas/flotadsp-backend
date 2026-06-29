import LegalLayout from './LegalLayout'
import { COMPANY } from './config'

export default function AvisoLegal() {
  return (
    <LegalLayout title="Aviso Legal">
      <p>De conformidad con el artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y Comercio Electrónico (LSSI-CE), se facilita la siguiente información sobre el titular del sitio web <strong>{COMPANY.website}</strong>:</p>

      <h2>1. Titular</h2>
      <ul>
        <li><strong>Denominación:</strong> {COMPANY.legalName} (servicio prestado por su promotor, persona física, sin sociedad mercantil constituida a la fecha de publicación de este aviso).</li>
        {COMPANY.cif && <li><strong>CIF/NIF:</strong> {COMPANY.cif}</li>}
        {COMPANY.address && <li><strong>Domicilio:</strong> {COMPANY.address}</li>}
        {COMPANY.registry && <li><strong>Registro:</strong> {COMPANY.registry}</li>}
        <li><strong>Contacto:</strong> <a href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a></li>
      </ul>
      <p className="text-dark-400 text-sm">Cuando se constituya una sociedad mercantil, este aviso se actualizará con los datos registrales correspondientes.</p>

      <h2>2. Objeto del servicio</h2>
      <p>{COMPANY.brand} es una plataforma web (SaaS) para la gestión de flotas de vehículos de reparto, conductores e inspecciones, con análisis automático de imágenes mediante inteligencia artificial. Va dirigida exclusivamente a empresas y profesionales.</p>

      <h2>3. Condiciones de uso</h2>
      <p>El acceso a la página web pública es gratuito. El uso del servicio requiere registro, aceptación de los <a href="/terminos">Términos y Condiciones</a> y de la <a href="/privacidad">Política de Privacidad</a>, y el pago de la suscripción correspondiente (salvo durante el periodo de prueba).</p>

      <h2>4. Propiedad intelectual</h2>
      <p>Todos los contenidos del sitio (textos, código, gráficos, logotipos, software) son titularidad de {COMPANY.legalName} o de terceros que han autorizado su uso. Queda prohibida su reproducción total o parcial sin autorización escrita previa.</p>

      <h2>5. Responsabilidad</h2>
      <p>{COMPANY.legalName} no se hace responsable de los daños derivados del uso indebido del sitio, de interrupciones temporales del servicio por causas de fuerza mayor, o de la exactitud de los análisis generados por la inteligencia artificial, que tienen carácter orientativo.</p>

      <h2>6. Protección de datos</h2>
      <p>Consulta la <a href="/privacidad">Política de Privacidad</a> para información completa sobre el tratamiento de datos personales y tus derechos.</p>

      <h2>7. Legislación aplicable</h2>
      <p>El presente Aviso Legal se rige por la {COMPANY.governingLaw}. Para cualquier controversia serán competentes los Juzgados y Tribunales de {COMPANY.jurisdiction}, salvo norma imperativa en contrario.</p>

      <p className="text-dark-500 text-xs">Última actualización: {COMPANY.effectiveDate}</p>
    </LegalLayout>
  )
}
