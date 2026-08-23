import { defineConfig, devices } from '@playwright/test'

/* Pruebas de humo del frontend.

   HERMÉTICAS a propósito: la API se intercepta con datos simulados, así que
   NO dependen de que staging esté encendido ni de la red. Lo que verifican es
   que ninguna pantalla se cae, se queda en blanco o suelta errores de consola
   — que es justo lo que un usuario nota primero y lo que ningún checker
   anterior detectaba. */
export default defineConfig({
  testDir: './e2e',
  /* 90 s y no 30.

     El barrido de botones pulsa hasta 45 por pantalla, y el cuadrante ha
     pasado a tener la paleta de códigos, los patrones y las herramientas de
     copiado: son muchos más que cuando se fijó el presupuesto. El test NO
     fallaba por romperse la pantalla —comprobado, con más tiempo pasa en
     35 s— sino porque se le acababa el reloj a mitad del barrido.

     Se sube el tiempo, que es lo que sobraba; NO se recorta el barrido ni se
     debilita lo que comprueba. Un test que pasa porque mira menos cosas no
     sirve para nada. */
  timeout: 90_000,
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
