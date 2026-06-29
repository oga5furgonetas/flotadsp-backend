// === DATOS DEL RESPONSABLE ===
// FlotaDSP es un servicio prestado sin sociedad mercantil constituida.
// Cuando se constituya empresa, rellena cif, address y registry.
export const COMPANY = {
  legalName: 'FlotaDSP',
  brand: 'FlotaDSP',
  cif: '',           // rellenar cuando se constituya la sociedad
  address: '',       // rellenar cuando haya sede
  registry: '',
  contactEmail: 'contacto@flotadsp.com',
  privacyEmail: 'contacto@flotadsp.com',
  website: 'https://flotadsp.com',
  jurisdiction: 'España',
  governingLaw: 'legislación española',
  effectiveDate: '2026-06-20',
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
