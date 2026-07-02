// Única fuente de la URL del backend. Módulo sin dependencias a propósito:
// main.jsx lo importa para el reporte de errores y NO debe arrastrar axios
// al chunk inicial (services/api.js sí importa axios).
export const API_BASE = 'https://flotadsp-backend.fly.dev/api'
