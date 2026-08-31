#!/usr/bin/env node
/**
 * Empaqueta cortex-extension/ en el ZIP que descargan los clientes.
 *
 * Por qué existe: hasta hoy la pantalla decía «te lo paso», o sea que había que
 * mandar el ZIP a mano por WhatsApp. Con una nave eso se aguanta; con dos
 * empresas dándose de alta el mismo día, no — y encima nadie sabe qué versión
 * tiene puesta cada una.
 *
 * Se ejecuta ANTES de cada despliegue del frontend (va cosido en
 * deploy-frontend.ps1), así que el ZIP que se descarga es siempre el del código
 * que hay en el repositorio. Un ZIP generado a mano se queda viejo y nadie se
 * entera hasta que un cliente reporta un fallo ya arreglado hace tres versiones.
 *
 * NO mete ningún token: cada empresa pega el suyo al instalar. Ese es el
 * aislamiento — un ZIP con un token dentro haría que todas compartieran datos.
 */
import { createWriteStream, readFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEN = join(RAIZ, 'cortex-extension')
const DESTINO = join(RAIZ, 'frontend-v2', 'public', 'FlotaDSP-Cortex.zip')

/* Se escribe el ZIP a mano en vez de tirar de una librería: son ocho ficheros
   pequeños y así el empaquetado no depende de que alguien haya hecho npm
   install en la máquina que despliega. */
function crc32(buf) {
  let c, tabla = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c
  }
  let crc = 0 ^ (-1)
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ tabla[(crc ^ buf[i]) & 0xFF]
  return (crc ^ (-1)) >>> 0
}

const ficheros = readdirSync(ORIGEN)
  .filter((n) => !n.startsWith('.') && statSync(join(ORIGEN, n)).isFile())
  .sort()

if (!ficheros.includes('manifest.json')) {
  console.error('FALLO: no hay manifest.json en cortex-extension/. Eso no es una extensión.')
  process.exit(1)
}
const version = JSON.parse(readFileSync(join(ORIGEN, 'manifest.json'), 'utf8')).version

const locales = []
const central = []
let desplaz = 0
const trozos = []

for (const nombre of ficheros) {
  const datos = readFileSync(join(ORIGEN, nombre))
  const comprimido = deflateRawSync(datos)
  const crc = crc32(datos)
  const nom = Buffer.from(nombre, 'utf8')

  const cab = Buffer.alloc(30)
  cab.writeUInt32LE(0x04034b50, 0)
  cab.writeUInt16LE(20, 4)          // versión necesaria
  cab.writeUInt16LE(0x0800, 6)      // nombres en UTF-8
  cab.writeUInt16LE(8, 8)           // deflate
  cab.writeUInt32LE(crc, 14)
  cab.writeUInt32LE(comprimido.length, 18)
  cab.writeUInt32LE(datos.length, 22)
  cab.writeUInt16LE(nom.length, 26)
  trozos.push(cab, nom, comprimido)

  const cen = Buffer.alloc(46)
  cen.writeUInt32LE(0x02014b50, 0)
  cen.writeUInt16LE(20, 4)
  cen.writeUInt16LE(20, 6)
  cen.writeUInt16LE(0x0800, 8)
  cen.writeUInt16LE(8, 10)
  cen.writeUInt32LE(crc, 16)
  cen.writeUInt32LE(comprimido.length, 20)
  cen.writeUInt32LE(datos.length, 24)
  cen.writeUInt16LE(nom.length, 28)
  cen.writeUInt32LE(desplaz, 42)
  central.push(cen, nom)
  locales.push(nombre)
  desplaz += cab.length + nom.length + comprimido.length
}

const cuerpo = Buffer.concat(trozos)
const dirCentral = Buffer.concat(central)
const fin = Buffer.alloc(22)
fin.writeUInt32LE(0x06054b50, 0)
fin.writeUInt16LE(locales.length, 8)
fin.writeUInt16LE(locales.length, 10)
fin.writeUInt32LE(dirCentral.length, 12)
fin.writeUInt32LE(cuerpo.length, 16)

mkdirSync(dirname(DESTINO), { recursive: true })
const salida = Buffer.concat([cuerpo, dirCentral, fin])
createWriteStream(DESTINO).end(salida)

console.log(`extensión v${version} empaquetada: ${locales.length} ficheros, ` +
            `${(salida.length / 1024).toFixed(1)} KB`)
console.log(`   -> frontend-v2/public/FlotaDSP-Cortex.zip`)

/* La versión se escribe aparte para que la pantalla pueda decir cuál se está
   descargando. Sin esto, un cliente con un problema ya arreglado no sabe si
   tiene la última, y nosotros tampoco. */
const meta = join(RAIZ, 'frontend-v2', 'public', 'extension.json')
createWriteStream(meta).end(JSON.stringify({
  version, ficheros: locales, kb: Math.round(salida.length / 1024),
  generado: new Date().toISOString().slice(0, 10),
}, null, 2))
console.log(`   -> frontend-v2/public/extension.json (v${version})`)
