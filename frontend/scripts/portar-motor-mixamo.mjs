/**
 * Regenera el motor de los avatares 3D a partir del banco de pruebas.
 *
 *   node scripts/portar-motor-mixamo.mjs
 *
 * La fuente es `sim/playwright-bench/harness/mixamo4/` (motor por capas de huesos, giro en el
 * sitio, objetos de mano con clips de agarre horneados en Blender, tinte por shader,
 * complementos procedurales). Este guion copia sus módulos a
 * `src/player/avatares3d/mixamo/motor/` con los cambios que pide la aplicación:
 *
 *  - los modelos no se piden por URL: los registra `cargador.ts` (`registrarBase`, `crearCompartido`,
 *    `leerAgarre`),
 *  - la altura del modelo (1,75 m) se mide una vez por personaje, no en cada avatar,
 *  - las rutas de three.js (`three/addons/` -> `three/examples/jsm/`).
 *
 * Cada sustitución es explícita: si el banco cambia de forma y una no encaja, el guion lo dice
 * y se para en vez de generar algo a medias. Los ficheros generados NO se editan a mano.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..', '..')
const banco = resolve(raiz, 'sim', 'playwright-bench', 'harness', 'mixamo4')
const destino = resolve(aqui, '..', 'src', 'player', 'avatares3d', 'mixamo', 'motor')
mkdirSync(destino, { recursive: true })

const sinCR = (t) => t.split(String.fromCharCode(13)).join('')
const leer = (f) => sinCR(readFileSync(resolve(banco, f), 'utf8'))

function sustituir(texto, buscar, poner, que) {
  if (typeof buscar === 'string' ? !texto.includes(buscar) : !buscar.test(texto)) {
    throw new Error(`No se pudo aplicar el ajuste «${que}»: el banco ha cambiado de forma`)
  }
  return texto.replace(buscar, poner)
}

const cabecera = (fuente) => `/* eslint-disable */
// @ts-nocheck
// GENERADO por frontend/scripts/portar-motor-mixamo.mjs a partir de
// sim/playwright-bench/harness/mixamo4/${fuente}. NO se edita a mano: se vuelve a generar.
`

const rutas = (t) =>
  t
    .replaceAll("'three/addons/", "'three/examples/jsm/")
    .replaceAll("./stage.js'", "./stage'")
    .replaceAll("./clips.js'", "./clips'")
    .replaceAll("./motor.js'", "./motor'")
    .replaceAll("./look.js'", "./look'")
    .replaceAll("./fusion.js'", "./fusion'")
    .replaceAll("./acc.js'", "./acc'")

function escribir(nombre, fuente, texto) {
  writeFileSync(resolve(destino, nombre), cabecera(fuente) + rutas(texto))
}

// ---------------------------------------------------------------- stage.ts
{
  const st = leer('stage.js')
  const base = st.match(/m\.updateMatrixWorld\(true\); let h;[\s\S]*?m\.userData\.hips = \{ rest: h\.position\.clone\(\), d \}/)
  if (!base) throw new Error('stage.js: no encuentro la medida de la cadera (baseModel)')
  let clon = st.match(/export function cloneModel[\s\S]*?\n\}\n/)
  if (!clon) throw new Error('stage.js: no encuentro cloneModel')
  let c = clon[0].replaceAll('bases[id + tier]', 'bases[id]')
  c = sustituir(c, 'export function cloneModel(id, tier = \'1024\')', 'export function cloneModel(id)', 'firma de cloneModel')
  c = sustituir(
    c,
    /const b = new THREE\.Box3\(\)\.setFromObject\(model, true\); model\.scale\.multiplyScalar\(1\.75 \/ Math\.max\(b\.max\.y - b\.min\.y, 1e-4\)\)/,
    'model.scale.multiplyScalar(escalaDe(id, model))',
    'altura del modelo (una vez por personaje)'
  )
  const texto = `import * as THREE from 'three'
import * as SU from 'three/examples/jsm/utils/SkeletonUtils.js'
export { THREE, SU }
export const V3 = THREE.Vector3, Q4 = THREE.Quaternion, M4 = THREE.Matrix4

/** Los modelos base de cada personaje (los registra el cargador al leer su GLB). */
const bases = {}
export function registrarBase(id, m) {
  bases[id] = m
  ${base[0]}
}
export const hayBase = (id) => !!bases[id]
export const baseDe = (id) => bases[id]

/** La altura del modelo (1,75 m) se mide una vez por personaje: medirla cuesta tanto como pintarlo. */
const escalas = {}
function escalaDe(id, model) {
  if (escalas[id] === undefined) {
    const b = new THREE.Box3().setFromObject(model, true)
    escalas[id] = 1.75 / Math.max(b.max.y - b.min.y, 1e-4)
  }
  return escalas[id]
}

${c}`
  escribir('stage.ts', 'stage.js', texto)
}

// ---------------------------------------------------------------- clips, look, acc, avatar
escribir('clips.ts', 'clips.js', leer('clips.js'))
escribir('look.ts', 'look.js', leer('look.js'))
escribir('fusion.ts', 'fusion.js', leer('fusion.js'))
escribir('acc.ts', 'acc.js', leer('acc.js'))
escribir('avatar.ts', 'avatar.js', leer('avatar.js'))

// ---------------------------------------------------------------- motor.ts
{
  let m = leer('motor.js')
  m = sustituir(
    m,
    "import { THREE, V3, Q4, cloneModel, baseModel, load, SU } from './stage.js'",
    "import { THREE, V3, Q4, cloneModel, SU } from './stage.js'",
    'importaciones del motor'
  )
  const ini = m.indexOf('let SHARED = null')
  const fin = m.indexOf('export class Motor')
  if (ini < 0 || fin < 0 || !m.slice(ini, fin).includes('/^it_/')) throw new Error('motor.js: ha cambiado la carga de clips y agarres')
  const carga = `/** Los clips compartidos (anims.glb) por nombre. \`phaseOff\` lo rellena el primer motor que se crea. */
export function crearCompartido(clipsLeidos) {
  const clips = {}; clipsLeidos.forEach(c => clips[c.name] = c)
  return { clips, phaseOff: {} }
}

/** Los clips de agarre y los objetos de mano de UN personaje (hold_<Ch>.glb, autorados en Blender). */
export function leerAgarre(gl) {
  const clips = {}; gl.animations.forEach(c => clips[c.name] = c)
  const items = {}
  gl.scene.updateMatrixWorld(true)
  gl.scene.traverse(n => { if (/^it_/.test(n.name) && n.parent && /^mixamorig/.test(n.parent.name)) { const nm = n.name.replace(/^it_/, '').replace(/_(pipe|body)$/, ''); (items[nm] = items[nm] || []).push({ bone: n.parent.name, node: n, key: n.name }) } })
  for (const piezas of Object.values(items)) for (const p of piezas) fusionar(p.node)   // menos llamadas de dibujo por avatar
  return { clips, items }
}

`
  m = m.slice(0, ini) + carga + m.slice(fin)
  escribir('motor.ts', 'motor.js', m)
}

console.log(`motor regenerado en ${destino} desde ${banco}`)
