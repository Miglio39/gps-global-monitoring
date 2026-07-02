// src/config.js

// Vite detecta automáticamente el entorno. 
// PROD es "falso" en tu PC local, y "verdadero" cuando EasyPanel compila la app.
export const API_BASE = import.meta.env.PROD 
  ? 'https://api.labtesting.online' 
  : '';