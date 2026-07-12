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

## Privacidad

El token solo permite **enviar** datos de paquetes a tu DSP (aislado del resto). No da
acceso a nada más de tu cuenta y caduca al año. Los datos viajan de tu navegador a tu
backend por HTTPS.
