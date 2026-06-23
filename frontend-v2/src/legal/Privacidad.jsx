import LegalLayout from './LegalLayout'
import { COMPANY, PROCESSORS } from './config'

export default function Privacidad() {
  return (
    <LegalLayout title="Política de Privacidad">
      <p>En {COMPANY.brand} tratamos los datos personales conforme al Reglamento (UE) 2016/679 (RGPD) y la legislación nacional aplicable. Esta política explica qué datos recogemos, para qué los usamos, con quién los compartimos y cómo puedes ejercer tus derechos.</p>

      <h2>1. Responsable del tratamiento</h2>
      <ul>
        <li><strong>{COMPANY.legalName}</strong>, CIF {COMPANY.cif}.</li>
        <li>Domicilio: {COMPANY.address}.</li>
        <li>Contacto en materia de privacidad: <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>.</li>
      </ul>

      <h2>2. Datos que tratamos</h2>
      <ul>
        <li><strong>Cuenta de cliente (empresa):</strong> nombre de la empresa, nombre y apellidos del titular, correo electrónico, contraseña (en hash), datos de facturación.</li>
        <li><strong>Conductores dados de alta por el cliente:</strong> nombre, correo, teléfono, DNI (si lo aporta), centro/estación, fotografía de perfil (opcional).</li>
        <li><strong>Vehículos:</strong> matrícula, marca, modelo, VIN, kilometraje, fechas de ITV y renting, documentos.</li>
        <li><strong>Inspecciones:</strong> fotografías del vehículo, fecha y hora, análisis de la IA (daños detectados), comentarios.</li>
        <li><strong>Uso del servicio:</strong> registros técnicos (logs) imprescindibles para la seguridad y el funcionamiento.</li>
      </ul>
      <p>No recogemos categorías especiales de datos (salud, ideología, etc.). No tratamos datos de geolocalización en tiempo real.</p>

      <h2>3. Finalidades y base jurídica</h2>
      <ul>
        <li><strong>Prestar el servicio</strong> (alta de empresa, gestión de flota, inspecciones, análisis IA): ejecución del contrato (art. 6.1.b RGPD).</li>
        <li><strong>Facturación y pagos:</strong> cumplimiento de obligaciones legales (art. 6.1.c) y ejecución contractual.</li>
        <li><strong>Seguridad y prevención de fraude:</strong> interés legítimo (art. 6.1.f).</li>
        <li><strong>Comunicaciones del servicio</strong> (avisos, soporte): ejecución del contrato.</li>
        <li><strong>Mejora del modelo de IA (anonimizado / agregado):</strong> interés legítimo; nunca se publican imágenes ni se identifican personas.</li>
      </ul>

      <h2>4. Conservación</h2>
      <ul>
        <li>Datos de cuenta: durante la vigencia del contrato y hasta 1 año tras la baja, para responder reclamaciones.</li>
        <li>Inspecciones y fotos: durante la vigencia del contrato; el cliente puede solicitar su eliminación en cualquier momento.</li>
        <li>Datos fiscales: 6 años (art. 30 Código de Comercio).</li>
      </ul>

      <h2>5. Encargados del tratamiento (a quién comunicamos datos)</h2>
      <p>Para prestar el servicio nos apoyamos en proveedores que actúan como encargados del tratamiento bajo contrato:</p>
      <ul>
        {PROCESSORS.map((p) => (
          <li key={p.name}><strong>{p.name}</strong> — {p.purpose} <span className="text-dark-500">({p.country})</span></li>
        ))}
      </ul>
      <p>Cuando hay transferencias internacionales, se realizan al amparo del EU-US Data Privacy Framework o Cláusulas Contractuales Tipo.</p>

      <h2>6. Tus derechos</h2>
      <p>Puedes ejercer en cualquier momento los derechos de <strong>acceso, rectificación, supresión, oposición, limitación y portabilidad</strong>, así como retirar tu consentimiento, escribiéndonos a <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>. Si consideras que no atendemos correctamente tu solicitud, puedes presentar una reclamación ante la <a href="https://www.aepd.es" target="_blank" rel="noreferrer">Agencia Española de Protección de Datos (AEPD)</a>.</p>

      <h2>7. Seguridad</h2>
      <p>Aplicamos medidas técnicas y organizativas razonables: cifrado en tránsito (HTTPS/TLS), control de acceso por roles, contraseñas con hash (bcrypt), copias de seguridad periódicas, y registros de auditoría.</p>

      <h2>8. Menores</h2>
      <p>El servicio está dirigido a empresas. No tratamos conscientemente datos de menores de 14 años.</p>

      <h2>9. Cambios</h2>
      <p>Podemos actualizar esta política; te avisaremos por correo o en el panel cuando los cambios sean sustanciales. La versión vigente es siempre la publicada en esta página.</p>
    </LegalLayout>
  )
}
