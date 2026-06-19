import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',   // app v2 completa (staging). La web actual NO se toca.
  plugins: [react()],
  build: {
    sourcemap: true, // nunca más un bundle sin fuente recuperable
  },
})
