import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const BACKEND = 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Canal WebSocket de notificaciones en tiempo real. Se declara antes
      // que /api para que Vite lo resuelva con su propia regla y no como una
      // petición HTTP normal.
      '/api/notificaciones/ws': {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (error) => {
            const codigo = (error as NodeJS.ErrnoException).code
            // Cierres esperados al recargar la página, cambiar de usuario o
            // reconectar (React StrictMode monta dos veces en desarrollo).
            if (codigo === 'ECONNABORTED' || codigo === 'ECONNRESET') return
            console.error('[vite] Error en el proxy WebSocket:', error)
          })
        },
      },
      // Todas las llamadas HTTP a /api se reenvían al backend FastAPI.
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
