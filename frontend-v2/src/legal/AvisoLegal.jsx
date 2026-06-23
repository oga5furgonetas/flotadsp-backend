import LegalLayout from './LegalLayout'
import { COMPANY } from './config'

export default function AvisoLegal() {
  return (
    <LegalLayout title="Aviso Legal">
      <p>De conformidad con el artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y Comercio Electrónico (LSSI-CE), se informa de los siguientes datos del titular del sitio web {COMPANY.website}:</p>

      <h2>1. Titular</h2>
      <ul>
        <li><strong>Denominación:</strong> {COMPANY.legalName}</li>
        {COMPANY.cif && <li><strong>CIF/NIF:</strong> {COMPANY.cif}</li>}
        {COMPANY.address && <li><strong>Domicilio:</strong> {COMPANY.address}</li>}
        {COMPANY.registry && <li><strong>Registro:</strong> {COMPANY.registry}</li>}
        <li><strong>Contacto:</strong> <a href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a></li>
      </ul>

      <h2>2. Objeto</h2>
      <p>El presente sitio web tiene por objeto presentar el servicio {COMPANY.brand} y permitir su contratación y uso por parte de empresas profesionales.</p>

      <h2>3. Condiciones de uso</h2>
      <p>El acceso al sitio web es gratuito. El uso del Servicio requiere registro y aceptación de los <a href="/terminos">Términos y Condiciones</a> y de la <a href="/privacidad">Política de Privacidad</a>.</p>

      <h2>4. Propiedad intelectual</h2>
      <p>Todos los contenidos del sitio (textos, código, gráficos, logotipos, software) son titularidad de {COMPANY.legalName} o de terceros que han autorizado su uso. Queda prohibida su reproducción total o parcial sin autorización expresa.</p>

      <h2>5. Responsabilidad</h2>
      <p>{COMPANY.legalName} no se hace responsable de los daños y perjuicios derivados del uso indebido del sitio o de la interrupción temporal del Servicio por causas ajenas razonables.</p>

      <h2>6. Legislación aplicable</h2>
      <p>El presente Aviso Legal se rige por la {COMPANY.governingLaw}. Para cualquier controversia serán competentes los Juzgados y Tribunales de {COMPANY.jurisdiction}.</p>
    </LegalLayout>
  )
}
