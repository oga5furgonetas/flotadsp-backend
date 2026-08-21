# Estado a 20-08-2026 — para retomar desde otro sitio

Este fichero es el relevo. Si abres una sesión nueva (otro ordenador, Claude en
la web), lee **CLAUDE.md** primero —ahí están las reglas y los 18 gotchas— y
luego esto, que es lo que está a medias hoy.

---

## Lo que se ha hecho hoy y ya está en producción

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

## Lo que está PENDIENTE, por orden de lo que más duele

### 1. Confirmar el plan de Atlas — puede ser grave
`hostInfo` está bloqueado en el clúster al que se conecta la app, que es lo que
pasa en la capa gratuita. Dos explicaciones y hay que saber cuál es:

- el usuario de la base no tiene permiso de admin (entonces no pasa nada), **o**
- se creó un clúster **nuevo** y la app sigue apuntando al viejo — y entonces la
  ampliación no le sirve de nada a la aplicación.

Los datos (334 MB) están en el clúster al que apunta `MONGO_URL`. Mirar en el
panel de Atlas qué tier tiene **WiniwWinw** y si hay más de un clúster.
Si el límite real no son 10 GB: `fly secrets set ATLAS_LIMITE_MB=<mb>`.

### 2. Contestar a los dos mensajes de la web
Llevan esperando desde el 15-08 y los dos son **candidaturas de empleo**, no
clientes:
- David García Sáez — `d.garciasz03@gmail.com`, jefe de tráfico/flota, vio una
  oferta en LinkedIn, quiere mandar el CV.
- `arsgphillies@gmail.com` — solo dejó el correo, asunto "Empleo".

### 3. Borrar `sample_mflix`
115 MB de la base de datos de ejemplo de MongoDB (21.349 películas). No es
nuestra: el propio código ya la excluye de las copias de seguridad. Falta el OK
de Dani porque borrar una base entera no se deshace.

### 4. Fusionar las fichas duplicadas
17 personas repetidas (21 fichas de más) y 12 matrículas repetidas. Hoy se ha
tapado el síntoma (el portal mira todas las fichas de la persona), pero el
historial de daños de esas personas sigue partido en dos. Es destructivo: hay
que reapuntar inspecciones, incidencias, cuadrantes y scorecard, y decidir qué
ficha sobrevive. Enseñar la lista antes de tocar nada.

### 5. Rotar la clave de Google Geocoding
La clave de Google Geocoding que se pegó en un chat sigue viva. **Estaba escrita
aquí, en claro, y este repositorio es PÚBLICO** — o sea que llevaba desde el
20-08 publicada en GitHub, en el fichero que avisaba de que estaba filtrada.
Se ha quitado de aquí el 21-08, pero sigue en el historial de git y puede estar
ya rastreada: quitarla del texto no la desactiva. **Hay que rotarla en la consola
de Google Cloud**, que es lo único que sirve. Empieza por `AIzaSyCd45` (los
cuatro primeros bloques bastan para reconocerla en la consola).

### 6. Direcciones: las 55 que no se sitúan
De 173 que han fallado alguna vez, quedan 55 sin situar ni siquiera con el
normalizador. Son las de nombre de empresa, las de "Centro de Negocios, 2ª
planta" y las de lugares que no están en ningún callejero. El siguiente paso
razonable **no** es pagar otro geocodificador —está medido, no aportaría— sino
un botón de "confirmar ubicación" para que una persona la fije una vez y quede
para siempre.

### 7. El cuadrante
Diseñado y hablado, sin construir. Dani ofreció mandar el Sheets entero.

### 8. Módulo de taller
Idea nueva de hoy, con diagrama hecho. Nivel 0 = enlace mágico con tres campos
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
