import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://37.60.246.22:8082', // Tu servidor en Contabo
        changeOrigin: true,
      }
    }
  }
})