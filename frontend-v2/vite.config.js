import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',   // app v2 completa (staging). La web actual NO se toca.
  plugins: [react()],
  build: {
    sourcemap: true, // nunca más un bundle sin fuente recuperable
    rollupOptions: {
      output: {
        // Subcarpeta versionada: el edge de Cloudflare llegó a cachear el HTML
        // del fallback SPA bajo URLs /assets/*.js (carrera de deploy) y lo
        // sirvió envenenado durante horas → panel roto para todos. Rutas
        // nuevas = caché limpio garantizado; subir v2→v3 si volviera a pasar.
        entryFileNames: 'assets/v2/[name]-[hash].js',
        chunkFileNames: 'assets/v2/[name]-[hash].js',
        assetFileNames: 'assets/v2/[name]-[hash][extname]',
      },
    },
  },
})
