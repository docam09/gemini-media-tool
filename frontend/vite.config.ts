import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all network interfaces so other people on the same LAN can
    // open the app via this machine's IP (e.g. http://192.168.1.50:5173).
    host: true,
    port: 5173,
    proxy: {
      // Forward API calls to the FastAPI backend so the frontend can use
      // same-origin requests during local dev.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
