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
`AIzaSyCd45TtmAoPBvDUsvmvAeQeSlCKjQ3s2l4` se pegó en un chat. Sigue viva.

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

Y luego, lo de siempre:

```bash
cd backend && fly deploy --strategy immediate
```

```bash
cd frontend-v2 && npm run build && npx wrangler pages deploy dist --project-name flotadsp-v2 --branch main --commit-dirty=true
```

> **`--branch main` no es opcional.** Sin él el despliegue entra como Preview de
> la rama `lab` y flotadsp.com no cambia, sin dar ningún error. Es el gotcha 16
> y hoy costó que dos cosas parecieran no funcionar.

Comprobación después de desplegar:

```bash
curl -s https://flotadsp-backend.fly.dev/api/vivo && curl -s https://flotadsp.com/ | grep -o 'assets/v2/index-[A-Za-z0-9_-]*\.js'
```

El hash del bundle tiene que cambiar cuando despliegues frontend. Si no cambia,
el despliegue se fue a Preview.
