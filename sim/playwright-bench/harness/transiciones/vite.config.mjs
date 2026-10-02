// Construye el arnés de transiciones: los componentes REALES del jugador
// (hojas, avisos, prólogo, visor de fotos, "usar objeto", pantalla final)
// montados solos en una página, sin servidor ni misión. Se lanza desde
// `scenarios/transiciones.mjs`; React y los plugins salen de frontend/.
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const frontend = path.resolve(aqui, '../../../../frontend')
const require = createRequire(pathToFileURL(path.join(frontend, 'package.json')))
const react = require('@vitejs/plugin-react')

export default {
  root: aqui,
  base: './',
  plugins: [(react.default || react)()],
  resolve: {
    alias: {
      '@frontend': path.join(frontend, 'src'),
      react: path.join(frontend, 'node_modules/react'),
      'react-dom': path.join(frontend, 'node_modules/react-dom'),
    },
  },
  server: { fs: { allow: [path.resolve(aqui, '../../../..')] } },
  build: {
    outDir: path.resolve(aqui, '../../out/harness-transiciones'),
    emptyOutDir: true,
    minify: false,
  },
}
