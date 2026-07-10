import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PublicTracking from "./components/PublicTracking";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta principal: Te lleva al Login por defecto */}
        <Route path="/" element={<Navigate to="/login" />} />
        
        {/* Pantallas de uso interno */}
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />

        {/* 2. NUEVA RUTA PÚBLICA DE SEGUIMIENTO */}
        <Route path="/track/:token" element={<PublicTracking />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;