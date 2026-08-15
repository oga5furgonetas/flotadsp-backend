# Lo que queda — retomar desde aquí

## 0 · HECHO Y DESPLEGADO (2026-08-15) — geolocalizar la dirección

`frontend-v2/src/lib/geoDireccion.js` + `POST /cortex/portales/geodir`. Se
busca el TEXTO de `stop_address` en Nominatim, Photon y Cartociudad a la vez y
se confirma por CERCANÍA entre coordenadas. Sale en la Libreta (gestor) y en
`/cortex/portales/mi-ruta` (conductor), con la distancia al punto de Amazon.
Corre solo en el bucle de la Libreta, 1 portal cada 2 s.

**Lo aprendido probando contra los servicios reales — no volver a tropezar:**

- **Photon y Nominatim son LA MISMA FUENTE.** Los dos leen OpenStreetMap. En
  una prueba real devolvieron la coordenada idéntica, a **0 m**. Si cuentan como
  dos, cualquier error de OSM se "confirma" a sí mismo. Por eso se vota por
  FAMILIA (`osm` / `ign`) y no por servicio, y hacen falta dos familias. En la
  práctica: confirmar exige que Cartociudad esté de acuerdo con OSM.
- **Photon devuelve 400 con `lang=es`** (sólo admite default/de/en/fr). Costaba
  la fuente entera y el fallo se veía como "no lo sé", no como error.
- **Photon marca las calles con `type:'street'` y el nombre en `name`, no en
  `street`.** Mirando sólo `street` se tiraban aciertos buenos y no se
  confirmaba casi nada.
- **Cartociudad NO admite la dirección completa.** Con coma + código postal
  devuelve VACÍO; con el CP pegado sin comas devuelve **otra calle distinta**
  marcada `type:portal`. Sólo responde bien a "vía número, municipio", y por eso
  la dirección se despieza antes de preguntar.
- **Cartociudad se equivoca de municipio y lo afirma igual:** a "AVENIDA DA
  CORUÑA 12, 27003 LUGO" contestó un portal en **Guitiriz**, a 40 km. Photon
  acertó en Lugo, no coincidieron y no se afirmó nada. Es la prueba de que una
  sola fuente produciría falsos positivos.
- **El resultado más peligroso es el centro del municipio.** Un buscador que no
  encuentra la dirección devuelve el pueblo; tres haciendo eso caen a metros
  entre sí y fabrican un acuerdo perfecto sobre un punto que no es ninguna
  dirección. Por eso nada por debajo de 'calle' vota.

**Medido (10 direcciones gallegas reales, formato Cortex, sólo 2 fuentes porque
Nominatim da 403 al servidor): 5 confirmadas, 5 no.** Los 5 rechazos son
correctos uno por uno. En el navegador vota también Nominatim.

**SIN COMPROBAR (dicho a propósito):** no se ha podido probar con `stop_address`
REALES de la BD — no hay credenciales de Mongo en este equipo. El despiece está
probado contra el formato que produce `_cortex_addr_str`, pero las direcciones
de verdad traerán casos que estas no tienen (rural gallego con lugar y
parroquia, sobre todo). Tampoco se ha visto la pantalla con datos reales
dentro: hace falta sesión de admin. **Primera comprobación al abrir el panel:**
entrar en Paquetes IA → Portales y mirar cuántos portales quedan en "no se ha
podido confirmar"; si son casi todos, el problema estará en el despiece de las
direcciones rurales, no en el consenso.

---

## 0-bis · El diseño original (queda como referencia)

**Me equivoqué de dirección y hay que corregirlo.** Lo que está hecho resuelve
`coordenada → dirección` (comprobar si lo que dice Amazon cuadra con el mapa).
Lo que Dani pide es lo contrario:

> "si el conductor marca no puedo encontrar la dirección, al toque, mediante 5
> buscadores o 20 o lo que sea, automáticamente me des la geolocalización de ese
> no puedo encontrar la dirección"

O sea: coger el TEXTO de la dirección (`stop_address`, que ya está en cada
paquete) y buscar **dónde está de verdad**, en varios buscadores a la vez.

**Por qué esto sí resuelve el problema del conductor.** El paquete ya trae una
coordenada de Amazon, y es justo a donde le mandaron y no encontró nada. Si
varios geocodificadores independientes coinciden en OTRO punto, ese es el bueno,
y la distancia entre los dos puntos es la explicación del fallo: "la dirección
está a 400 m de donde te mandaron".

**Diseño propuesto (sin falsos positivos):**
1. Entrada: `stop_address` del paquete + la coordenada de Amazon.
2. Consultar N geocodificadores en paralelo (son servicios distintos, no hay
   límite compartido):
   - Nominatim `/search` — solo desde el NAVEGADOR (403 al servidor, probado).
   - Photon `photon.komoot.io/api/?q=` — **PROBADO Y FUNCIONA**: devuelve
     `street`, `housenumber` ("30-32") y coordenadas. Índice OSM distinto.
   - Cartociudad (IGN): el endpoint bueno es
     **`https://www.cartociudad.es/geocoder/api/geocoder/find?q=`** — PROBADO Y
     FUNCIONA: devuelve `type: "portal"` con municipio y coordenadas.
     `/candidates` devuelve `[]` aunque le pases la dirección completa: no
     usarlo. Es la fuente oficial y la más valiosa para España, y su CORS ya
     viene abierto (`Access-Control-Allow-Origin: *`).
     Ya está en la CSP (`connect-src`) del 2026-08-15.
3. **Acuerdo por CERCANÍA, no por texto**: si dos o más resultados caen a menos
   de ~150 m entre ellos, ese grupo es la ubicación confirmada. Con un solo
   resultado NO se afirma nada.
4. Devolver: coordenada confirmada, cuántas fuentes coincidieron, y la
   **distancia a la coordenada de Amazon** — que es el dato accionable.
5. Enseñárselo al conductor en su ruta (`/cortex/portales/mi-ruta`) y al gestor
   en la Libreta, con enlace a Google Maps de la coordenada buena.

**Ya reutilizable:** `_haversine_km` en el backend, y `nucleoVia` /
`compararDirecciones` de `geoPortal.js` para cotejar los nombres de vía.

**Lo que hay hecho y NO se tira:** el contraste `coordenada → dirección` sigue
valiendo para diagnosticar (dice si Amazon manda a la calle equivocada), pero
NO es lo que pidió. Es complementario, no sustituto.

---


Estado al cerrar la sesión del 2026-08-15. Todo lo de abajo está SIN hacer.
`lab`, `main`, los dos worktrees y flotadsp.com están alineados en el mismo
commit, así que se puede empezar por cualquiera.

---

## 1 · Resolución automática de direcciones (lo grande)

**Lo que pidió Dani:** cada vez que un DA marca "no puedo encontrar la
dirección", que la app busque la dirección real —Maps, Earth, lo que sea—,
contraste varias fuentes y dé la dirección exacta, en tiempo real o con
actualizaciones cada 1-2 minutos.

**Lo que YA está hecho** (desplegado):
- `frontend-v2/src/lib/geoPortal.js` — pregunta a Nominatim qué hay en la
  coordenada y compara con la dirección de Amazon. Cuatro veredictos:
  `coincide` / `otro_numero` / `discrepa` / `no_comparable`.
- `POST /cortex/portales/geo` guarda la resolución sin pisar la nota humana.
- Se ve en Paquetes IA → Portales, y la dirección llega al conductor en
  `/cortex/portales/mi-ruta`.

**Lo que falta:**
- Que sea **automático** y no a petición. Ojo: Nominatim prohíbe barridos
  masivos y **devuelve 403 al servidor** (probado: 403 desde node, 200 desde el
  navegador). Así que el bucle tiene que vivir en el navegador de una pestaña
  abierta del panel, con su límite de 1 petición/segundo.
- **Varias fuentes**. Hoy solo hay OpenStreetMap. Una segunda fuente
  independiente convierte "una opinión" en "dos fuentes de acuerdo", que es lo
  único que permite afirmar algo.

**Lo que NO se puede prometer, y hay que decírselo:** "que la encuentre siempre"
y "sin ningún falso positivo" a la vez es imposible. Lo honesto es un sistema
que **o da una dirección confirmada por dos fuentes, o dice "no lo sé"**. Nunca
una dirección equivocada con aire de certeza.

## 2-bis · Panel de estaciones: arreglado el refresco y el banner (2026-08-15)

Dani: "algo falla, no actualiza bien, y ese panel no vale para nada". Eran dos
bugs de verdad, los dos en `PackageIntel.jsx`:

- **`load()` no llamaba a `loadStations()`.** "Repartir automáticamente" sólo
  llamaba a `load()`: reasignaba en el servidor, avisaba de cuántas había
  resuelto y dejaba la pantalla con el reparto VIEJO. El refresco de 30 s
  tampoco miraba nunca las estaciones. (Al meterlo hubo que subir la
  declaración de `loadStations` por encima de `load`: va en su array de
  dependencias, que se evalúa en cada render, y declarado después tumbaba la
  pantalla con un ReferenceError.)
- **El banner no se iba nunca.** La condición llevaba `|| stations.length > 1`,
  así que con dos o más estaciones salía siempre, estuviera todo resuelto o no.
  Ahora sale sólo si hay algo roto: sin centro, mezclada o prefijos en
  conflicto. Con todo correcto queda una línea desplegable para corregir.
- De paso: el backend ya calculaba `mezclado`, `mezcladas` y
  `prefijos_en_conflicto` y **el frontend los tiraba**. Ahora se ven, con el
  reparto de paquetes por centro de cada estación mezclada.
- `manual: false` (centro deducido por mayoría) NO cuenta como pendiente a
  propósito: es lo que dicen los propios paquetes, y contarlo devolvía el mismo
  banner permanente con otra excusa. Se marca 'supuesto' y ya.

**SIN COMPROBAR:** no se ha podido abrir el panel con sesión de admin, así que
el bug original ("clico OGA5/DGA1/DGA2 y no pasa nada") NO está confirmado como
resuelto. Lo que sí está arreglado es que el resultado se vea. Ojo a que
`disabled={!!assigning}` deshabilita los botones de TODAS las estaciones
mientras una está en curso, y en la de 112.311 paquetes eso puede tardar.

## 2 · El botón de asignar estación no responde

En Paquetes IA, los botones OGA5/DGA1/DGA2 de cada estación: Dani clica y no
pasa nada. El handler (`assignStation`, PackageIntel.jsx ~362) se ve correcto y
el endpoint responde. **No se ha podido reproducir sin sesión de admin.**

Para diagnosticarlo hace falta abrir la consola del navegador en flotadsp.com,
clicar y mirar si sale la petición a `POST /cortex/portales`… perdón, a
`POST /cortex/stations`, y qué devuelve. Sospechas por orden:
1. `assigning` se queda con valor y deja todos los botones `disabled`.
2. La petición falla y el `flash(false, …)` pasa desapercibido.

**Mientras tanto hay salida:** el botón "Repartir automáticamente" resuelve
todas las estaciones por geografía de una vez y no depende de ese botón.

## 3 · Staging caído

`flotadsp-backend-staging` no arranca: `bad auth` de Atlas. No es el código (el
mismo código corre en producción y en LAB). Es la credencial de Mongo de esa
app. **Lo tiene que hacer Dani**, es un secreto:

    fly secrets set MONGO_URL='mongodb+srv://...' -a flotadsp-backend-staging

Fly reinicia solo; no hace falta redesplegar.

## 4 · Extensión 2.11.0 sin instalar

Está en `cortex-extension/` y empaquetada. Hasta que Dani la instale, el
**esquema real de Cortex no llega al panel**, y sin ese esquema no se puede
saber qué campo marca una anulación en nave — que es lo que falta para dar un
DCR sin las anulaciones. Se ve en Paquetes IA → Portales → "Qué manda Cortex de
verdad".

Atajo: el esquema ya está en su navegador de meses atrás. En
`chrome://extensions` → service worker → consola:

    chrome.storage.local.get('diag', d => console.log(JSON.stringify(d, null, 1)))

## 5 · Anulaciones en nave fuera del DCR

Bloqueado por el punto 4. El prototipo de la regla está en
`frontend-v2/src/panel/lab/exp/parte/generar.js` (`esAnulacionEnNave`), pero
necesita las direcciones de las estaciones, que **no están guardadas en ningún
sitio** (`cortex_stations` solo mapea serviceAreaId → centro). Sin ellas, o sin
un campo de Cortex que lo marque, cualquier exclusión del DCR es una suposición.

---

## Cómo desplegar (comprobado hoy)

Backend:

    cd backend && fly deploy --strategy immediate

Frontend — **ojo con `--branch main`**: wrangler usa el nombre de la rama de git
para decidir si es producción, y trabajando desde `lab` sin ese flag el deploy
se va a un preview en vez de a flotadsp.com.

    cd frontend-v2 && npm run build
    npx wrangler pages deploy dist --project-name flotadsp-v2 --branch main --commit-dirty=true

El token OAuth de Cloudflare caduca en horas: si sale "Not logged in", hace
falta `npx wrangler login` en una terminal interactiva.
