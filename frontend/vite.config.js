import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/', 
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://157.173.201.188:8082', // <-- Tu nueva IP de Contabo
        changeOrigin: true,
      }
    }
  }
})