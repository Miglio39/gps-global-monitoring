import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import LiveDashboard from '../components/LiveDashboard';
import RoutePlayback from '../components/RoutePlayback';
import Reports from '../components/Reports';
import AdminPanel from '../components/AdminPanel';
import Alerts from '../components/Alerts';
// <-- IMPORT DEL NUEVO MÓDULO
import WorkRoutesReport from '../components/WorkRoutesReport'; 

const MenuIcon = ({ path }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d={path} />
  </svg>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');

  const [devices, setDevices] = useState([]);
  const [positions, setPositions] = useState({});
  const [currentUser, setCurrentUser] = useState(null);

  const token = localStorage.getItem('traccar_token');

  useEffect(() => {
    const userStr = localStorage.getItem('traccar_user');
    if (!token) { navigate('/login'); return; }
    if (userStr) setCurrentUser(JSON.parse(userStr));

    const fetchData = async () => {
      try {
        const headers = { 'Authorization': `Basic ${token}` };
        const [resDevices, resPositions] = await Promise.all([
          fetch('https://api.labtesting.online/api/devices', { headers }), fetch('https://api.labtesting.online/api/positions', { headers })
        ]);

        if (resDevices.status === 401) { handleLogout(); return; }

        if (resDevices.ok && resPositions.ok) {
          const devs = await resDevices.json();
          const posArray = await resPositions.json();
          
          setDevices(devs);
          const posMap = {};
          posArray.forEach(p => { posMap[p.deviceId] = p; });
  
          setPositions(posMap);
        }
      } catch (error) { console.error("Error conectando con Traccar:", error); }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [token, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('traccar_token');
    localStorage.removeItem('traccar_user');
    navigate('/login');
  };

  return (
    <>
      <style>{`
        /* ESTILOS BASE (ESCRITORIO) - Manteniendo tus diseños originales */
        .layout-main {
          display: flex;
          height: 100vh;
          width: 100vw;
          background-color: #0B1120;
          color: #9CA3AF;
          font-family: 'Inter', sans-serif;
          overflow: hidden;
          flex-direction: row; 
        }
        
        .sidebar {
          background-color: #111827;
          display: flex;
          align-items: center;
          z-index: 10;
          width: 35px;
          flex-direction: column;
          border-right: 1px solid #1F2937;
          padding: 15px 0;
        }

        .logo-container {
          margin-bottom: 30px;
          display: flex;
          justify-content: center;
        }

        .nav-menu {
          flex: 1;
          display: flex;
          width: 100%;
          flex-direction: column;
          gap: 12px;
        }

        .user-panel {
          display: flex;
          align-items: center;
          flex-direction: column;
          gap: 15px;
          padding-top: 15px;
          border-top: 1px solid #1F2937;
          width: 100%;
        }

        /* DISEÑO RESPONSIVE (MÓVIL) */
        @media (max-width: 768px) {
          .layout-main {
            flex-direction: column-reverse; /* Pasa la barra a la parte inferior */
          }
          
          .sidebar {
            width: 100%;
            height: 60px;
            flex-direction: row;
            border-right: none;
            border-top: 1px solid #1F2937;
            padding: 0 10px;
            justify-content: space-between;
          }

          .logo-container {
            display: none; /* Oculta el logo en el celular para dar espacio a los iconos */
          }

          .nav-menu {
            flex-direction: row;
            justify-content: space-around;
            align-items: center;
            gap: 5px;
            height: 100%;
          }

          .user-panel {
            flex-direction: row;
            width: auto;
            padding-top: 0;
            border-top: none;
            border-left: 1px solid #1F2937;
            padding-left: 10px;
            margin-left: 5px;
            height: 100%;
          }
        }
      `}</style>

      <div className="layout-main">
        
        {/* SIDEBAR ADAPTADO CON CLASES CSS */}
        <aside className="sidebar">
          
          <div className="logo-container" title="Global GPS Monitor">
            <img src="/logo.png" alt="Logo" style={{ width: '22px', filter: 'drop-shadow(0px 2px 4px rgba(37, 99, 235, 0.7))' }} />
          </div>

          <nav className="nav-menu">
            <div onClick={() => setActiveTab('dashboard')} title="Dashboard en Vivo" style={{...styles.navItem, ...(activeTab === 'dashboard' ? styles.navItemActive : {})}}>
              <MenuIcon path="M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z" /> 
            </div>
            
            <div onClick={() => setActiveTab('route')} title="Repetición de Recorrido" style={{...styles.navItem, ...(activeTab === 'route' ? styles.navItemActive : {})}}>
              <MenuIcon path="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /> 
            </div>
            
            <div onClick={() => setActiveTab('report')} title="Informes y Analíticas" style={{...styles.navItem, ...(activeTab === 'report' ? styles.navItemActive : {})}}>
              <MenuIcon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> 
            </div>

            {/* NUEVO MÓDULO DE RUTAS LABORALES */}
            <div onClick={() => setActiveTab('workRoutes')} title="Informe Rutas Laborales" style={{...styles.navItem, ...(activeTab === 'workRoutes' ? styles.navItemActive : {})}}>
              <MenuIcon path="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /> 
            </div>

            <div onClick={() => setActiveTab('alerts')} title="Alertas de Velocidad" style={{...styles.navItem, ...(activeTab === 'alerts' ? styles.navItemActive : {})}}>
              <MenuIcon path="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0" /> 
            </div>
            
            {currentUser?.administrator && (
              <div onClick={() => setActiveTab('admin')} title="Panel de Administración" style={{...styles.navItem, ...(activeTab === 'admin' ? styles.navItemActive : {}), color: activeTab === 'admin' ? 'white' : '#F59E0B', marginTop: window.innerWidth > 768 ? '15px' : '0' }}>
                <MenuIcon path="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /> 
              </div>
            )}
          </nav>

          <div className="user-panel">
            <div title={currentUser ? `${currentUser.name} (${currentUser.administrator ? 'Administrador' : 'Cliente'})` : 'Cargando...'} style={{ backgroundColor: '#2563EB', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '12px', cursor: 'help' }}>
              {currentUser ? currentUser.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <button onClick={handleLogout} title="Cerrar sesión" style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '16px', padding: 0 }}>🚪</button>
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeTab === 'dashboard' && <LiveDashboard devices={devices} positions={positions} />}
          {activeTab === 'route' && <RoutePlayback devices={devices} token={token} />}
          {activeTab === 'report' && <Reports devices={devices} token={token} />}
          {activeTab === 'workRoutes' && <WorkRoutesReport devices={devices} />} 
          {activeTab === 'alerts' && <Alerts devices={devices} token={token} />} 
          {activeTab === 'admin' && <AdminPanel devices={devices} token={token} currentUser={currentUser} />}
        </div>

      </div>
    </>
  );
}

const styles = {
  navItem: { padding: '4px', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'all 0.2s ease', width: '28px', height: '28px', margin: '0 auto' },
  navItemActive: { backgroundColor: '#2563EB', color: 'white', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)' }
};