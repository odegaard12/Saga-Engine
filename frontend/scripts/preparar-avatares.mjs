/**
 * Prepara los activos de los avatares 3D para desplegarlos y escribe su manifiesto.
 *
 *   node scripts/preparar-avatares.mjs [carpetaDeTrabajo]
 *
 * Los modelos, animaciones y agarres NO están en git (llevan licencias de Mixamo/Adobe que no
 * permiten redistribuir los ficheros): viven en `assets_privados/avatares/` (ignorada por git),
 * se copian a las Pis con `scripts/desplegar_avatares.ps1` y el servidor los sirve desde ahí
 * (`SAGA_AVATAR_DIR`). Lo único que se versiona es el MANIFIESTO con los nombres (con la huella
 * sha1 del contenido), que es lo que el código y la lista de precarga necesitan.
 *
 * Con `carpetaDeTrabajo` copia con huella en el nombre:
 *   out/anims.glb              -> anims.<huella>.glb
 *   out/<Ch>_512.glb           -> <Ch>.<huella>.glb
 *   m4/opt/hold_<Ch>.glb       -> hold-<Ch>.<huella>.glb
 * Sin argumentos sólo regenera el manifiesto con lo que haya (por ejemplo tras `hornear_avatares_mixamo.py`,
 * que escribe los retratos `cara-<Ch>.<huella>.webp` en esa misma carpeta).
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..', '..')
const destino = resolve(raiz, 'assets_privados', 'avatares')
const manifiesto = resolve(aqui, '..', 'src', 'player', 'avatares3d', 'mixamo', 'manifiesto.json')
mkdirSync(destino, { recursive: true })

/** Personajes descargados que la aplicación no usa (no se copian). */
const SIN_USO = new Set(['Ch06'])

const huella = (ruta) => createHash('sha1').update(readFileSync(ruta)).digest('hex').slice(0, 8)

function copiar(origen, base, ext) {
  const nombre = `${base}.${huella(origen)}.${ext}`
  for (const f of readdirSync(destino)) {
    if (f.startsWith(`${base}.`) && f.endsWith(`.${ext}`) && f !== nombre) rmSync(resolve(destino, f))
  }
  copyFileSync(origen, resolve(destino, nombre))
}

const fuente = process.argv[2]
if (fuente) {
  const f = (...p) => resolve(fuente, ...p)
  if (!existsSync(f('out', 'anims.glb'))) throw new Error('No encuentro out/anims.glb en ' + fuente)
  copiar(f('out', 'anims.glb'), 'anims', 'glb')
  for (const n of readdirSync(f('out'))) {
    const m = /^(Ch\d+)_512\.glb$/.exec(n)
    if (m && !SIN_USO.has(m[1])) copiar(f('out', n), m[1], 'glb')
  }
  for (const n of readdirSync(f('m4', 'opt'))) {
    const m = /^hold_(Ch\d+)\.glb$/.exec(n)
    if (m && !SIN_USO.has(m[1])) copiar(f('m4', 'opt', n), `hold-${m[1]}`, 'glb')
  }
}

const salida = { anims: '', personajes: {}, agarres: {}, caras: {} }
for (const n of readdirSync(destino).sort()) {
  let m
  if ((m = /^anims\.[0-9a-f]{8}\.glb$/.exec(n))) salida.anims = n
  else if ((m = /^(Ch\d+)\.[0-9a-f]{8}\.glb$/.exec(n))) salida.personajes[m[1]] = n
  else if ((m = /^hold-(Ch\d+)\.[0-9a-f]{8}\.glb$/.exec(n))) salida.agarres[m[1]] = n
  else if ((m = /^cara-(Ch\d+)\.[0-9a-f]{8}\.webp$/.exec(n))) salida.caras[m[1]] = n
}
writeFileSync(manifiesto, JSON.stringify(salida, null, 2) + '\n')
console.log(`manifiesto: ${Object.keys(salida.personajes).length} personajes, ${Object.keys(salida.agarres).length} agarres, ${Object.keys(salida.caras).length} caras`)
