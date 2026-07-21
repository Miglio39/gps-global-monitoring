// src/config.js

// Si el proyecto se ejecuta en EasyPanel (Producción), usa tu dominio seguro.
// Si se ejecuta en tu PC (Desarrollo local), se queda vacío para usar el proxy de Vite.
export const API_BASE = import.meta.env.PROD 
  ? 'https://api.globalmonitorgps.com' 
  : '';