import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [react()],
  base: './',
  clearScreen: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: false,
  },
  build: {
    // Main bundle is ~518 kB raw / 115 kB gzip after splitting — acceptable for this app.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split heavy libs into their own chunks so the main bundle stays small.
        manualChunks: {
          leaflet: ['leaflet', 'react-leaflet'],
          icons:   ['lucide-react'],
          router:  ['react-router-dom'],
        },
      },
    },
  },
})
