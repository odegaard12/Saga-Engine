import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Version de la app, leida del fichero VERSION de la raiz.
 *
 * Se usa para versionar la URL del worker de vision. Cloudflare cachea los
 * .js por delante del backend y servia el worker viejo aunque la imagen
 * estuviera desplegada: el arranque se quedaba colgado para siempre.
 */
function readAppVersion(): string {
  try {
    return readFileSync(resolve(process.cwd(), '..', 'VERSION'), 'utf8').trim() || 'dev'
  } catch {
    return 'dev'
  }
}


/**
 * Lista de paquetes que necesita el JUGADOR, para guardarlos sin red.
 *
 * El service worker sólo veía los <script>/<link> del HTML, es decir el paquete
 * de arranque. Todo lo que se carga con import() dinámico (el mapa, cada
 * minijuego, los paneles) se guardaba únicamente si el jugador lo había usado
 * ya con cobertura: un minijuego que aún no había abierto no estaba en caché y
 * sin red el nodo no cargaba.
 *
 * Este plugin recorre el grafo del build desde la entrada del jugador
 * (imports estáticos y dinámicos) y escribe `player-precache.json` con TODO lo
 * alcanzable, dejando fuera lo que sólo carga el panel de administración
 * (AdminApp y su Leaflet) y el banco del mapa. El backend lo sirve en
 * `/player-precache.json` y `pwaShell.ts` lo usa al preparar el modo offline.
 */
function listaDePaquetesDelJugador(): Plugin {
  const soloAdmin = /[\\/]src[\\/](admin[\\/]AdminApp|banco[\\/]BancoMapa)\.tsx?$/
  return {
    name: 'saga-player-precache',
    apply: 'build',
    generateBundle(_opciones, bundle) {
      const chunks = Object.values(bundle).filter((f) => f.type === 'chunk')
      const porNombre = new Map(chunks.map((c) => [c.fileName, c]))
      const entrada = chunks.find((c) => c.isEntry)
      if (!entrada) return

      const alcanzables = new Set<string>()
      const visitar = (nombre: string) => {
        if (alcanzables.has(nombre)) return
        const chunk = porNombre.get(nombre)
        if (!chunk) return
        // El panel de administración y el banco no viajan al móvil del jugador.
        if (chunk.facadeModuleId && soloAdmin.test(chunk.facadeModuleId)) return
        alcanzables.add(nombre)
        for (const hijo of [...chunk.imports, ...chunk.dynamicImports]) visitar(hijo)
      }
      visitar(entrada.fileName)

      // Lo que carga el panel de administración (o el banco) y NO el jugador:
      // sus chunks y las hojas de estilo que cuelgan de ellos.
      const desdeAdmin = new Set<string>()
      const recorrerAdmin = (nombre: string) => {
        if (desdeAdmin.has(nombre)) return
        const chunk = porNombre.get(nombre)
        if (!chunk) return
        desdeAdmin.add(nombre)
        for (const hijo of [...chunk.imports, ...chunk.dynamicImports]) recorrerAdmin(hijo)
      }
      for (const c of chunks) {
        if (c.facadeModuleId && soloAdmin.test(c.facadeModuleId)) recorrerAdmin(c.fileName)
      }
      const cssDe = (nombre: string): string[] => (porNombre.get(nombre) as any)?.viteMetadata?.importedCss ?? []
      const recursosDe = (nombre: string): string[] => (porNombre.get(nombre) as any)?.viteMetadata?.importedAssets ?? []

      const ficheros = new Set<string>()
      for (const nombre of alcanzables) {
        ficheros.add(nombre)
        cssDe(nombre).forEach((f) => ficheros.add(f))
        recursosDe(nombre).forEach((f) => ficheros.add(f))
      }
      // Sólo de admin = colgado de admin y no alcanzable desde el jugador.
      const excluidos = new Set<string>()
      for (const nombre of desdeAdmin) {
        if (alcanzables.has(nombre)) continue
        excluidos.add(nombre)
        cssDe(nombre).forEach((f) => excluidos.add(f))
        recursosDe(nombre).forEach((f) => excluidos.add(f))
      }
      // Trabajadores y otros recursos sueltos que no cuelgan de ningún import
      // (p. ej. el worker de MapLibre): se guardan todos los que no sean admin.
      for (const fichero of Object.values(bundle)) {
        const nombre = fichero.fileName
        if (nombre === 'index.html' || excluidos.has(nombre)) continue
        if (fichero.type === 'chunk' ? !alcanzables.has(nombre) : nombre.startsWith('assets/')) {
          ficheros.add(nombre)
        }
      }

      // Informe opcional para medir qué pesa dentro de cada chunk:
      //   SAGA_ANALIZAR=ruta.json npm run build
      if (process.env.SAGA_ANALIZAR) {
        const informe = chunks.map((c) => ({
          fichero: c.fileName,
          imports: c.imports,
          dinamicos: c.dynamicImports,
          modulos: Object.entries(c.modules)
            .map(([id, m]) => ({ id: id.replace(/^.*node_modules[\/]/, 'nm/').replace(/^.*[\/]src[\/]/, 'src/'), bytes: (m as any).renderedLength }))
            .sort((a, b) => b.bytes - a.bytes),
        }))
        writeFileSync(process.env.SAGA_ANALIZAR, JSON.stringify(informe))
      }

      const lista = [...ficheros].filter((f) => f !== 'index.html').sort().map((f) => '/' + f)
      // Los nombres llevan el hash del contenido: la huella de la lista ES la
      // identidad de esta compilación. Sirve para diagnosticar «versión nueva» y
      // para saber que la lista guardada en el móvil es de otra compilación.
      const revision = createHash('sha1').update(lista.join('\n')).digest('hex').slice(0, 12)
      this.emitFile({
        type: 'asset',
        fileName: 'player-precache.json',
        source: JSON.stringify({ revision, files: lista }, null, 2) + '\n',
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.SAGA_DEV_BACKEND_URL || 'http://127.0.0.1:8097'
  const allowedHosts = [
    'localhost',
    '127.0.0.1',
    ...String(env.SAGA_DEV_ALLOWED_HOSTS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ]

  return {
    plugins: [react(), listaDePaquetesDelJugador()],
    define: {
      __SAGA_VERSION__: JSON.stringify(readAppVersion()),
    },
    build: {
      // esbuild (el minificador por defecto) renombra variables locales a
      // 1-2 caracteres, y en un componente tan grande como PlayerApp.tsx
      // (miles de bindings locales) se vio de verdad colisionando dos
      // variables DISTINTAS con el mismo nombre corto en ámbitos que sí se
      // solapan -"Cannot access 'X' before initialization" en producción,
      // en cada actualización de posición del GPS, reproducido con
      // Playwright/CDP-. Cambiar SOLO el nombre en duda no lo arregló: el
      // mismo fallo saltó en la siguiente variable que ocupó esa posición.
      // terser es más lento pero mucho más conservador con el ámbito;
      // sigue minificando igual de bien, solo que sin este fallo.
      minify: 'terser',
      // Los vendors van en paquetes propios y estables: tocar código de la app
      // no cambia el hash de MapLibre/three/React, y el móvil no los rebaja.
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'vendor-maplibre', test: /node_modules[\\/]maplibre-gl[\\/]/, priority: 30 },
              { name: 'vendor-three', test: /node_modules[\\/]three[\\/]/, priority: 30 },
              { name: 'vendor-leaflet', test: /node_modules[\\/]leaflet[\\/]/, priority: 30 },
              { name: 'vendor-jsqr', test: /node_modules[\\/]jsqr[\\/]/, priority: 30 },
              { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler|@tanstack|zustand)[\\/]/, priority: 20 },
            ],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      // shared/game_registry.json vive en la raíz del repo, fuera de frontend/.
      fs: { allow: ['..'] },
      allowedHosts,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
        },
        '^/admin(?:/|$)': {
          target: backend,
          changeOrigin: true,
        },
        '/player': {
          target: backend,
          changeOrigin: true,
        },
      },
    },
  }
})
