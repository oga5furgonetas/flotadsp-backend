/* ¿Es el fallo de "chunk viejo o envenenado tras un deploy"?

   El index cacheado pide un JS con hash antiguo, o el edge sirvio HTML bajo
   la URL de un .js (gotcha 8): el modulo llega sin `default` y React.lazy
   revienta al montar. La cura es reparar la cache y recargar UNA vez, y eso
   solo pasa si el ErrorBoundary RECONOCE el mensaje.

   Cada navegador lo dice a su manera, y esta lista se hizo con los mensajes
   REALES de `client_errors` en produccion:
     · Chrome:  "Cannot read properties of undefined (reading 'default')"
     · Safari:  "undefined is not an object (evaluating 'y._result.default')"
       — cuatro conductores con iPhone entre el 26-08 y el 01-09-2026 se
       quedaron en la pantalla de error del portal porque este patron no
       estaba: el ErrorBoundary lo trataba como un fallo normal y no reparaba.
     · Firefox: "error loading dynamically imported module"
     · Vite:    "Importing a module script failed", "Loading chunk N failed"
   Lo vigila `scripts/check-chunk-error.mjs` con esos mismos mensajes. */
export const isStaleChunkError = (msg = '') =>
  /reading 'default'|_result\.default|evaluating '[^']*\.default'|dynamically imported module|Importing a module script failed|Loading chunk/i.test(String(msg || ''))
