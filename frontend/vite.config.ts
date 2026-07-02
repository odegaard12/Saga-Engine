import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
