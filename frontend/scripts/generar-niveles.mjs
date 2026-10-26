/**
 * Genera frontend/src/player/minigames/core/niveles.generado.ts desde la ÚNICA tabla de niveles de los minijuegos,
 * backend/app/runtime/niveles_minijuegos.json (el servidor la aplica; el panel y el cliente la leen de aquí).
 *
 *   node frontend/scripts/generar-niveles.mjs          # escribe el fichero
 *   node frontend/scripts/generar-niveles.mjs --check  # sale con 1 si no está sincronizado (lo usa una prueba)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const origen = resolve(aqui, '..', '..', 'backend', 'app', 'runtime', 'niveles_minijuegos.json')
const destino = resolve(aqui, '..', 'src', 'player', 'minigames', 'core', 'niveles.generado.ts')

const tabla = JSON.parse(readFileSync(origen, 'utf8'))
delete tabla._doc
const salida =
  '// GENERADO por frontend/scripts/generar-niveles.mjs desde backend/app/runtime/niveles_minijuegos.json. NO se edita a mano.\n' +
  '// Cambia la tabla en el JSON y vuelve a generar: una prueba comprueba que están sincronizados.\n' +
  'export const TABLA_DE_NIVELES = ' +
  JSON.stringify(tabla, null, 2) +
  ' as const\n'

if (process.argv.includes('--check')) {
  const actual = existsSync(destino) ? readFileSync(destino, 'utf8').replace(/\r\n/g, '\n') : ''
  if (actual !== salida) {
    console.error('niveles.generado.ts no está sincronizado con niveles_minijuegos.json: node frontend/scripts/generar-niveles.mjs')
    process.exit(1)
  }
  process.exit(0)
}
writeFileSync(destino, salida)
console.log('niveles.generado.ts escrito')
