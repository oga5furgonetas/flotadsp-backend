// Única fuente de la URL del backend. Módulo sin dependencias a propósito:
// main.jsx lo importa para el reporte de errores y NO debe arrastrar axios
// al chunk inicial (services/api.js sí importa axios).
// VITE_API_URL permite apuntar a staging/local sin tocar código (.env.example).
export const API_BASE = import.meta.env.VITE_API_URL || 'https://flotadsp-backend.fly.dev/api'
