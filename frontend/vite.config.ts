import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
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
    plugins: [react()],
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
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
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
