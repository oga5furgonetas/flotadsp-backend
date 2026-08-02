import { defineConfig, devices } from '@playwright/test'

/* Pruebas de humo del frontend.

   HERMÉTICAS a propósito: la API se intercepta con datos simulados, así que
   NO dependen de que staging esté encendido ni de la red. Lo que verifican es
   que ninguna pantalla se cae, se queda en blanco o suelta errores de consola
   — que es justo lo que un usuario nota primero y lo que ningún checker
   anterior detectaba. */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
