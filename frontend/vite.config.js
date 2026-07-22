import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/', 
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo.png'], // Asegúrate de tener estos archivos en tu carpeta public
      manifest: {
        name: 'Global GPS Monitor',
        short_name: 'GPS Monitor',
        description: 'Sistema de Monitoreo Global de Vehículos',
        theme_color: '#0B1120',
        background_color: '#0B1120',
        display: 'standalone',
        icons: [
          {
            src: '/logo.png', // Tu logo (debe estar en la carpeta public)
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/logo.png', 
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://157.173.201.188:8082', 
        changeOrigin: true,
      }
    }
  }
});