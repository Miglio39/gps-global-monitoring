import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/', 
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://https://api.globalmonitorgps.com', // <-- Tu nueva IP de Contabo
        changeOrigin: true,
      }
    }
  }
})