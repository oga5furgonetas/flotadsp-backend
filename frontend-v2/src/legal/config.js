// === DATOS DEL RESPONSABLE ===
// Cuando tengas CIF y dirección formal, rellénalos en `cif` y `address`.
// Si quedan vacíos, las páginas legales lo ocultan y no enseñan placeholders.
export const COMPANY = {
  legalName: 'FlotaDSP',
  brand: 'FlotaDSP',
  cif: '',
  address: '',
  registry: '',
  contactEmail: 'soporte@flotadsp.com',
  privacyEmail: 'privacidad@flotadsp.com',
  website: 'https://flotadsp.com',
  jurisdiction: 'España',
  governingLaw: 'legislación española',
  effectiveDate: '2026-06-23',
}

// Proveedores que tratan datos en tu nombre (encargados del tratamiento).
export const PROCESSORS = [
  { name: 'Cloudflare, Inc.', purpose: 'Hosting de la web y CDN', country: 'EEUU/UE (DPF)' },
  { name: 'Fly.io (Fly.dev)', purpose: 'Hosting del backend (API)', country: 'EEUU/UE' },
  { name: 'MongoDB Atlas', purpose: 'Base de datos', country: 'UE' },
  { name: 'Cloudflare R2', purpose: 'Almacenamiento de imágenes', country: 'EEUU/UE (DPF)' },
  { name: 'Google (Gemini / Vertex AI)', purpose: 'Análisis de imágenes (IA)', country: 'EEUU/UE (DPF)' },
  { name: 'Lemon Squeezy', purpose: 'Pagos (Merchant of Record), facturación', country: 'EEUU/UE (DPF)' },
]
