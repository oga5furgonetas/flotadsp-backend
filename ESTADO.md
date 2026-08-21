# Estado a 21-08-2026 — para retomar desde otro sitio

Este fichero es el relevo. Si abres una sesión nueva (otro ordenador, Claude en
la web), lee **CLAUDE.md** primero —ahí están las reglas y los 18 gotchas— y
luego esto, que es lo que está a medias hoy.

---

## Hecho el 20-08 y ya en producción

| Qué | Dónde se ve |
|---|---|
| 5 conductores en ruta no podían auditar (fichas duplicadas) | Portal del conductor |
| La app entera caída 2 h 26 por un tropiezo de Mongo | `/api/vivo`, fly.toml |
| 60 de 140 documentos invisibles | Vehículos → pestaña **Documentación** |
| Direcciones: normalizador + Catastro + Overpass, 40% → 68% | Paquetes IA → "No puedo encontrar la dirección" |
| Qué hay en la coordenada cuando no hay texto | La misma pantalla |
| Los mensajes de la web no avisaban a nadie | Telegram |
| La tarjeta de salud decía "amplía ya" con el plan ampliado | Negocio → Salud |

Todo commiteado y empujado a `lab` y a `main`.

---

## Hecho el 21-08 y ya en producción

| Qué | Dónde se ve |
|---|---|
| Dar y quitar permisos no funcionaba (el rol nunca viajaba en el token) | Usuarios |
| Quitar un módulo no se notaba hasta 72 h después o hasta volver a entrar | Usuarios |
| Borrar un usuario no exigía ningún permiso | API `/auth/admins` |
| "Asignación diaria" salía en el menú y al pulsarla te expulsaba | Menú del panel |
| "Dónde se entrega" estaba CAÍDA (`t is not a function`) | Panel → Dónde se entrega |
| Vehículos → Documentación, caída por lo mismo | Vehículos |
| El calendario de flota se caía con un mes sin datos | Vencimientos → Calendario |
| El despliegue no se comprobaba: ahora falla a gritos | `scripts/verificar-produccion.ps1` |
| 4 tests de permisos, donde no había ninguno | `backend/tests/test_api.py` |

Commits `169d5d1`, `1a7d5e0` y `7b47ddd`, en `main` y en `lab`.

**Cambio que se nota:** los gestores de centro ahora ven MENOS gente en Usuarios.
No es un fallo nuevo — es el filtro por centros, que llevaba desde siempre sin
aplicarse porque `admin_role` no llegaba nunca al servidor.

---

## Lo que está PENDIENTE, por orden de lo que más duele

### 1. Rotar la clave de Google Geocoding — LO QUE MÁS CORRE
No era "se pegó en un chat". **Estaba escrita en claro en este mismo fichero, y
el repositorio de GitHub es PÚBLICO**: llevaba desde el 20-08 publicada, en el
párrafo que avisaba de que estaba filtrada. Se quitó del texto el 21-08, pero
sigue en el historial de git (commit `2f0bb46`) y puede estar ya rastreada.

Se buscó en TODO el historial: hay exactamente un commit con una clave de Google
dentro, y es ese. Nunca estuvo en el código.

Quitarla del texto NO la desactiva. **Hay que rotarla en la consola de Google
Cloud.** Empieza por `AIzaSyCd45`, suficiente para reconocerla allí.

### 2. Los permisos no se comprueban en el servidor — lo gordo que queda
Lo del 21-08 arregló que dar y quitar permisos FUNCIONE. No arregló que los
permisos PROTEJAN algo.

`_puede()` está definido una vez en server.py y llamado UNA sola vez en 13.000
líneas (`aprobar-dias`). Todo lo demás es esconder botones del menú: quien sepa
la dirección de la API entra igual, tenga el módulo o no. Y esa única
comprobación se salta entera si la organización es `owner` — la tuya.

No es un arreglo de una tarde: empezar a exigirlos deja fuera a gente que hoy
entra, sobre todo con `permissions: null` mezclado con listas viejas
incompletas. **Antes de tocar nada, sacar la lista de qué permisos tiene cada
usuario en BD y mirarla.** Después, ir por fases.

### 3. Saber si el job de backend del CI pasa
El CI llevaba 35 commits en rojo, desde `91f6e9b` ("calendario mensual de
flota"). El 21-08 se arreglaron los 6 fallos del frontend (144 pruebas en verde
en local).

Queda el job de **Backend**, que también fallaba ANTES de tocarlo (se comprobó
con el commit `8ef64d9`, que solo tocaba ficheros .ps1 y documentación). No se
ha podido leer su log: GitHub pide iniciar sesión para verlo, y en el PC de
Downloads no hay ni Mongo ni Docker para reproducirlo.

Dos maneras: entrar en GitHub y leer el final del log del job "Backend", o
instalar MongoDB en local y correr `pytest backend/tests`.

### 4. Ponerle un cerrojo a `capturas.spec.js`
Reescribe las 5 imágenes de la landing (`frontend-v2/public/capturas/`) CADA VEZ
que alguien lanza la batería completa de pruebas, sin pedirlo. Pasó el 21-08:
las sustituyó por unas 7 veces más pesadas (93 KB → 794 KB) y hubo que
revertirlas. Está pensado para lanzarlo a propósito con `--update-snapshots`,
pero no se protege. Son dos líneas.

### 5. Confirmar el plan de Atlas
`hostInfo` está bloqueado en el clúster al que se conecta la app, que es lo que
pasa en la capa gratuita. Dos explicaciones y hay que saber cuál es:

- el usuario de la base no tiene permiso de admin (entonces no pasa nada), **o**
- se creó un clúster **nuevo** y la app sigue apuntando al viejo — y entonces la
  ampliación no le sirve de nada a la aplicación.

Los datos (334 MB) están en el clúster al que apunta `MONGO_URL`. Mirar en el
panel de Atlas qué tier tiene **WiniwWinw** y si hay más de un clúster.
Si el límite real no son 10 GB: `fly secrets set ATLAS_LIMITE_MB=<mb>`.

### 6. Contestar a los dos mensajes de la web
Llevan esperando desde el 15-08 y los dos son **candidaturas de empleo**, no
clientes:
- David García Sáez — `d.garciasz03@gmail.com`, jefe de tráfico/flota, vio una
  oferta en LinkedIn, quiere mandar el CV.
- `arsgphillies@gmail.com` — solo dejó el correo, asunto "Empleo".

### 7. Borrar `sample_mflix`
115 MB de la base de datos de ejemplo de MongoDB (21.349 películas). No es
nuestra: el propio código ya la excluye de las copias de seguridad. Falta el OK
de Dani porque borrar una base entera no se deshace.

### 8. Fusionar las fichas duplicadas
17 personas repetidas (21 fichas de más) y 12 matrículas repetidas. El síntoma
está tapado (el portal mira todas las fichas de la persona), pero el historial
de daños de esas personas sigue partido en dos. Es destructivo: hay que
reapuntar inspecciones, incidencias, cuadrantes y scorecard, y decidir qué ficha
sobrevive. Enseñar la lista antes de tocar nada.

### 9. Direcciones: las 55 que no se sitúan
De 173 que han fallado alguna vez, quedan 55 sin situar ni siquiera con el
normalizador. Son las de nombre de empresa, las de "Centro de Negocios, 2ª
planta" y las de lugares que no están en ningún callejero. El siguiente paso
razonable **no** es pagar otro geocodificador —está medido, no aportaría— sino
un botón de "confirmar ubicación" para que una persona la fije una vez y quede
para siempre.

### 10. El cuadrante
Diseñado y hablado, sin construir. Dani ofreció mandar el Sheets entero.

### 11. Módulo de taller
Idea del 20-08, con diagrama hecho. Nivel 0 = enlace mágico con tres campos
y reloj por dueño de cada hora parada. Sin empezar.

---

## Cómo desplegar desde otro ordenador

Hace falta autenticarse una vez en cada servicio. **No hacen falta tokens
pegados en ningún sitio**: los dos comandos abren el navegador.

```bash
fly auth login
npx wrangler login
```

Y luego el frontend, con una sola orden. Compila, despliega **a la rama main**
y comprueba que flotadsp.com sirve lo recién compilado:

```powershell
.\scripts\deploy-frontend.ps1
```

El backend sigue igual:

```bash
cd backend && fly deploy --strategy immediate
```

> **`--branch main` no es opcional.** Sin él el despliegue entra como Preview de
> la rama `lab` y flotadsp.com no cambia, sin dar ningún error. Es el gotcha 16 y
> el 20-08 costó que dos cosas parecieran no funcionar. En `deploy-frontend.ps1`
> va cosido y no se puede olvidar: para eso existe.

## La comprobación de después (21-08)

Esto es lo que faltaba el 20-08: el despliegue se iba a Preview y nadie lo miraba.

```powershell
.\scripts\verificar-produccion.ps1
```

Compara el hash del bundle de `frontend-v2\dist` con el que sirve flotadsp.com,
y mira `/api/health` (backend vivo + Mongo conectado). Si producción se quedó con
lo viejo sale en rojo, dice que casi seguro es el gotcha 16 y **devuelve código 1**
—o sea, en CI o en un `&&` se para ahí—. Probado en los dos sentidos el 21-08:
pasa cuando coincide y grita cuando no.

Admite `-Esperar <segundos>` para reintentar mientras el edge propaga (el deploy
lo llama con 90) y `-SoloBackend` si no has tocado el frontend.

## La primera vez en un ordenador

Además de los dos logins de arriba:

```bash
cd frontend-v2 && npm ci
```

El 21-08, en un clon que llevaba parado desde julio, `node_modules` era viejo y le faltaban
dependencias nuevas (`@react-three/fiber`): la compilación fallaba sin más pista
que un "Rollup failed to resolve import". `npm ci` y listo.
