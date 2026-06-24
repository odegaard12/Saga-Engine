import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = 'http://127.0.0.1:8097'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'sagaengine.odegaard12.es',
      
      'localhost',
      '127.0.0.1',
    ],
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
})
