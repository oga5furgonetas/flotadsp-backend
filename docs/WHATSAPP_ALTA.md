# Dar de alta WhatsApp — paso a paso

> Escrito el 31-08-2026, después de que el primer intento se quedara bloqueado
> porque no llegaban los SMS de verificación.
>
> **Lo que hay que saber antes de empezar:** no hace falta verificar la empresa
> para probar el flujo entero. Meta da un **número de prueba** al crear la app,
> y con él se puede enviar a 5 teléfonos reales desde el primer minuto. Eso es
> lo que desbloquea el intento anterior — la verificación del negocio solo hace
> falta para escribir a talleres que no estén en esa lista de 5.

---

## Por qué falló la primera vez

Dos cosas distintas que se mezclaron:

1. **No llegaban los SMS.** Casi siempre es porque **ese número ya tiene WhatsApp
   normal instalado**. Un número no puede estar en WhatsApp personal y en
   WhatsApp Business API a la vez: Meta lo rechaza y el aviso que da no lo
   explica.
2. **El bloqueo antispam** al crear la cuenta de desarrollador. Es temporal y se
   levanta solo, pero se reactiva si se reintenta muchas veces seguidas.

**Las dos se esquivan con el número de prueba**, que no necesita SMS ninguno.

---

## Lo que hay que conseguir

Cuatro datos. Los cuatro salen de la misma pantalla de Meta.

| Dato | Para qué |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Permiso para enviar |
| `WHATSAPP_PHONE_NUMBER_ID` | Desde qué número se envía |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | La cuenta, para crear las plantillas |
| `WHATSAPP_VERIFY_TOKEN` | Una contraseña **que te inventas tú**, solo para el webhook |

---

## Paso 1 · Crear la app

1. Entra en **developers.facebook.com** con tu Facebook de siempre.
   Si pide verificar la cuenta de desarrollador y **no llega el SMS**, busca el
   enlace de **«Llamarme»** («Call me»): la llamada sí entra cuando el SMS no.
2. Arriba a la derecha: **Mis aplicaciones** → **Crear aplicación**.
3. Nombre: `FlotaDSP`. Correo: el tuyo.
4. Caso de uso: elige **Otro** → tipo **Empresa**.
5. Al terminar, en el panel de la app: **Añadir productos** → busca
   **WhatsApp** → **Configurar**.

En ese momento Meta crea sola una cuenta de prueba con un número de prueba. **No
hay que verificar nada todavía.**

---

## Paso 2 · Copiar los tres primeros datos

Estás en **WhatsApp → Configuración de la API**. Ahí mismo ves:

- **Token de acceso temporal** — arriba. Vale 24 horas; sirve para probar hoy.
  (El definitivo, en el paso 5.)
- **Identificador del número de teléfono** — es `WHATSAPP_PHONE_NUMBER_ID`.
  Ojo: **NO es el número de teléfono**, es el identificador largo de debajo.
- **Identificador de la cuenta de WhatsApp Business** — es
  `WHATSAPP_BUSINESS_ACCOUNT_ID`.

En esa misma pantalla, en **«Para»**, añade tu móvil como destinatario de
prueba. Te llega un código por WhatsApp y lo confirmas. Puedes añadir hasta 5:
mete también el de un taller de confianza si quieres probar de verdad.

---

## Paso 3 · Ponerlos en el servidor

Esto lo haces tú, en tu terminal, desde la carpeta del proyecto. **Las
credenciales no se pegan en el chat ni en ningún formulario.**

```bash
fly secrets set -a flotadsp-backend WHATSAPP_ACCESS_TOKEN="pega_aqui_el_token" WHATSAPP_PHONE_NUMBER_ID="pega_aqui_el_id" WHATSAPP_BUSINESS_ACCOUNT_ID="pega_aqui_la_cuenta" WHATSAPP_VERIFY_TOKEN="flotadsp-2026-loquesea"
```

El `VERIFY_TOKEN` te lo inventas: cualquier palabra larga vale, solo tiene que
coincidir con la que pongas en el paso 4.

Fly reinicia el backend solo. Para comprobar que lo ha cogido:

```bash
curl -s https://flotadsp-backend.fly.dev/api/whatsapp/estado -H "Authorization: Bearer TU_TOKEN" | head -c 200
```

Tiene que poner `"configurado": true` y la lista `faltan` vacía.

---

## Paso 4 · Enganchar el webhook (lo que hace que ELLOS puedan escribir)

Sin esto los recordatorios salen, pero lo que conteste el taller no llega. Es la
mitad del canal.

En el panel de la app: **WhatsApp → Configuración** → apartado **Webhook** →
**Editar**:

- **URL de devolución de llamada**:
  `https://flotadsp-backend.fly.dev/api/webhooks/whatsapp`
- **Token de verificación**: el mismo `flotadsp-2026-loquesea` del paso 3.

Dale a **Verificar y guardar**. Si da error, es que el token no coincide.

Después, en **Campos del webhook**, pulsa **Administrar** y marca **`messages`**.
Ese es el que trae lo que escriben los talleres.

---

## Paso 5 · El token permanente

El del paso 2 caduca en 24 horas. Para el definitivo:

1. **business.facebook.com** → **Configuración del negocio** → **Usuarios** →
   **Usuarios del sistema** → **Añadir**.
2. Nombre: `flotadsp-api`. Rol: **Administrador**.
3. **Asignar activos** → tu app y tu cuenta de WhatsApp → permiso de control
   total.
4. **Generar nuevo token** → elige la app → marca `whatsapp_business_messaging`
   y `whatsapp_business_management` → **Caducidad: nunca**.
5. Vuelve a lanzar el `fly secrets set` del paso 3 con ese token.

---

## Paso 6 · Las plantillas

**No hay que crearlas a mano.** La app las sube por API:

```bash
curl -X POST https://flotadsp-backend.fly.dev/api/whatsapp/crear-plantillas -H "Authorization: Bearer TU_TOKEN"
```

Meta las revisa en unos minutos. Si alguna sale rechazada, el error dice el
motivo y se puede reescribir desde **Taller → Canal con el taller**.

---

## Cuando quieras usar tu número de verdad

Solo hace falta para escribir a talleres que no estén en la lista de 5.

- El número **no puede tener WhatsApp normal instalado**. Si lo tiene:
  desinstálalo y borra la cuenta desde la propia app (Ajustes → Cuenta →
  Eliminar mi cuenta), y espera unas horas.
- Un fijo vale, y de hecho va mejor: la verificación se hace por llamada.
- Verificar el negocio pide el CIF y un documento de la empresa. **Eso espera a
  que constituyas la sociedad** — hasta entonces, el número de prueba cubre
  todo lo demás.

---

## Cómo saber que funciona

En **Taller → Canal con el taller**:

- **Lo que dicen los talleres** deja de estar vacío en cuanto uno conteste.
- Los recordatorios pasan de llegarte a ti para reenviar, a salir solos.

Y en la pauta, el canal `whatsapp` empieza a usarse. El canal `oficina` no se
quita nunca: es el que garantiza que el aviso salga aunque WhatsApp falle.
