# FlotaDSP · Cortex Bridge (v2)

Extensión de navegador que alimenta el **Package Intelligence Center** de tu panel.

## Qué hace (y qué NO hace)

- **Lee la API real de Cortex** (`route-summaries`, `route-details`, tareas) interceptando
  las peticiones JSON que Cortex ya hace con **tu sesión ya iniciada**.
- **NO** lee la pantalla, **NO** usa OCR, **NO** toca cookies, contraseñas ni hace login.
- **NO** automatiza clics ni abre pestañas: tú navegas Cortex normalmente (o lo dejas
  abierto con su auto-refresco) y los datos se envían solos a tu panel cada ~20 s.
- Solo procesa respuestas de endpoints de rutas/paquetes; ignora todo lo demás.

## Instalación (una vez)

1. Descomprime esta carpeta.
2. Chrome → `chrome://extensions` → activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** → selecciona la carpeta `cortex-extension`.
4. En tu panel FlotaDSP → **Paquetes IA** → copia tu **token de ingesta**.
5. Pulsa el icono de la extensión, pega el token y **Guardar y activar**.
6. Abre `logistics.amazon.es` (Cortex) y navega tus rutas como siempre.

En el panel verás los paquetes aparecer en tiempo real, con su timeline, prioridad y
la ficha del investigador. El popup muestra cuántos paquetes hay en cola y enviados.

## Elegir estación antes de enviar (desde 2.10)

Con dos pestañas de Cortex abiertas de estaciones distintas —que es como se trabaja
aquí— la cola las mezclaba y el panel acababa repartiendo paquetes al centro que no
era. Un DCR con paquetes de otra nave es un número falso que nadie detecta.

Ahora el popup lista **qué estaciones hay en la cola y cuántos paquetes de cada una**,
y tú marcas cuáles se envían:

- **Sin ninguna marcada no se envía nada.** Esperar es mejor que contaminar.
- Lo que llega **sin estación reconocible no se envía jamás**, ni marcando todo.
- Cada estación tiene su botón de **descartar**, para tirar lo que no toca sin
  esperar a que caduque.

Marca tu estación la primera vez y se queda guardada. Si un día abres otra nave, el
popup te lo dice antes de mandar nada.

## Privacidad

El token solo permite **enviar** datos de paquetes a tu DSP (aislado del resto). No da
acceso a nada más de tu cuenta y caduca al año. Los datos viajan de tu navegador a tu
backend por HTTPS.
