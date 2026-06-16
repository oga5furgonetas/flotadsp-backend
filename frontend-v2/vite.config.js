import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/conductor/',   // se sirve en flotadsp.com/conductor/<slug>
  plugins: [react()],
  build: {
    sourcemap: true, // nunca más un bundle sin fuente recuperable
  },
})
