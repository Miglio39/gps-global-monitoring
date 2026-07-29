import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import LiveDashboard from '../components/LiveDashboard';
import RoutePlayback from '../components/RoutePlayback';
import Reports from '../components/Reports';
import AdminPanel from '../components/AdminPanel';
import Alerts from '../components/Alerts';
import WorkRoutesReport from '../components/WorkRoutesReport';
import Geofences from '../components/Geofences';
import ShareLocation from '../components/ShareLocation';
import Maintenance from '../components/Maintenance';

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

  // Estado para controlar si el menú de usuario está visible
  const [showUserMenu, setShowUserMenu] = useState(false);

  // --- LÓGICA PARA INSTALAR COMO APP MÓVIL (PWA) ---
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  
  // Detector de si es un celular
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e); 
    });

    const handleResize = () => setIsMobileView(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };
  // --------------------------------------------------

  const token = localStorage.getItem('traccar_token');

  useEffect(() => {
    const userStr = localStorage.getItem('traccar_user');
    if (!token) { navigate('/login'); return; }
    if (userStr) setCurrentUser(JSON.parse(userStr));

    const fetchData = async () => {
      try {
        const headers = { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' };
        
        const [resDevices, resPositions] = await Promise.all([
          fetch('https://api.globalmonitorgps.com/api/devices', { headers }), 
          fetch('https://api.globalmonitorgps.com/api/positions', { headers })
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
      } catch (error) { 
        console.error("Error conectando con Traccar:", error);
      }
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
        * { box-sizing: border-box; }

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
          z-index: 50000;
          width: 35px;
          flex-direction: column;
          border-right: 1px solid #1F2937;
          padding: 15px 0;
        }

        .main-content {
          flex: 1; 
          display: flex; 
          flex-direction: column; 
          overflow: hidden;
          position: relative;
        }

        .logo-container { margin-bottom: 30px; display: flex; justify-content: center; }
        .nav-menu { flex: 1; display: flex; width: 100%; flex-direction: column; gap: 12px; }
        .user-panel { 
          display: flex;
          align-items: center; 
          flex-direction: column; 
          padding-top: 15px; 
          border-top: 1px solid #1F2937; 
          width: 100%; 
          position: relative;
        }

        .user-menu-dropdown {
          position: absolute;
          left: 45px;
          bottom: 10px;
          background-color: #1F2937;
          border: 1px solid #374151;
          border-radius: 8px;
          width: 160px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.5);
          display: flex;
          flex-direction: column;
          z-index: 50001;
          overflow: hidden;
        }

        .user-menu-header {
          padding: 12px;
          border-bottom: 1px solid #374151;
          color: #F3F4F6;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .install-btn {
          background: transparent;
          border: none;
          border-bottom: 1px solid #374151;
          color: #3B82F6; 
          cursor: pointer;
          font-size: 13px;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: background-color 0.2s ease;
          width: 100%;
          font-weight: bold;
        }
        .install-btn:hover { background-color: rgba(59, 130, 246, 0.1); }

        .logout-btn {
          background: transparent;
          border: none;
          color: #EF4444;
          cursor: pointer;
          font-size: 13px;
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: background-color 0.2s ease;
          width: 100%;
          font-weight: 500;
        }
        .logout-btn:hover { background-color: rgba(239, 68, 68, 0.1); }

        @media (max-width: 768px) {
          .layout-main { flex-direction: column; }
          .sidebar { position: fixed; bottom: 0; left: 0; width: 100%; height: 60px; flex-direction: row; border-right: none; border-top: 1px solid #1F2937; padding: 0 15px; justify-content: space-between; }
          .main-content { height: calc(100dvh - 60px); width: 100%; }
          .logo-container { display: none; }
          .nav-menu { flex: 1; flex-direction: row; justify-content: space-around; align-items: center; height: 100%; margin-right: 10px; }
          .user-panel { flex-shrink: 0; flex-direction: row; justify-content: center; width: auto; padding-top: 0; border-top: none; border-left: 1px solid #1F2937; padding-left: 15px; height: 100%; }
          .user-menu-dropdown { left: auto; right: 15px; bottom: 70px; }
        }
      `}</style>

      <div className="layout-main">
        
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

            {/* Filtros ocultos en móvil para no saturar la barra */}
            {!isMobileView && (
              <>
                <div onClick={() => setActiveTab('report')} title="Informes y Analíticas" style={{...styles.navItem, ...(activeTab === 'report' ? styles.navItemActive : {})}}>
                  <MenuIcon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> 
                </div>
                
                {/* BOTÓN DE RUTAS LABORALES - PÚBLICO PARA TODOS */}
                <div onClick={() => setActiveTab('workRoutes')} title="Informe Rutas Laborales" style={{...styles.navItem, ...(activeTab === 'workRoutes' ? styles.navItemActive : {})}}>
                  <MenuIcon path="M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /> 
                </div>
              </>
            )}

            <div onClick={() => setActiveTab('geofences')} title="Geocercas (Zonas Seguras)" style={{...styles.navItem, ...(activeTab === 'geofences' ? styles.navItemActive : {})}}>
              <MenuIcon path="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /> 
            </div>
            
            <div onClick={() => setActiveTab('alerts')} title="Alertas de Velocidad" style={{...styles.navItem, ...(activeTab === 'alerts' ? styles.navItemActive : {})}}>
              <MenuIcon path="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0" /> 
            </div>

            <div onClick={() => setActiveTab('share')} title="Compartir Ubicación" style={{...styles.navItem, ...(activeTab === 'share' ? styles.navItemActive : {})}}>
              <MenuIcon path="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13" /> 
            </div>

            <div  onClick={() => setActiveTab('mantenimientos')}   title="Mantenimientos de Flota"   style={{...styles.navItem, ...(activeTab === 'mantenimientos' ? styles.navItemActive : {})}}>
             <MenuIcon path="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /> 
            </div>


            
            
            {/* EL PANEL DE ADMINISTRACIÓN SIGUE ESTRICTAMENTE PROTEGIDO SÓLO PARA ADMINS */}
            {currentUser?.administrator && (
              <div onClick={() => setActiveTab('admin')} title="Panel de Administración" style={{...styles.navItem, ...(activeTab === 'admin' ? styles.navItemActive : {}), color: activeTab === 'admin' ? 'white' : '#F59E0B' }}>
                <MenuIcon path="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /> 
              </div>
            )}
          </nav>

          <div className="user-panel">
            <div 
              onClick={() => setShowUserMenu(!showUserMenu)}
              title="Opciones de perfil" 
              style={{ 
                backgroundColor: '#2563EB', color: 'white', width: '28px', height: '28px', 
                borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', 
                fontWeight: 'bold', fontSize: '13px', cursor: 'pointer',
                boxShadow: '0 2px 5px rgba(0,0,0,0.3)', transition: 'transform 0.2s',
                transform: showUserMenu ? 'scale(1.1)' : 'scale(1)'
              }}
            >
              {currentUser ? currentUser.name.charAt(0).toUpperCase() : 'U'}
            </div>
            
            {showUserMenu && (
              <div className="user-menu-dropdown">
                <div className="user-menu-header">
                  {currentUser ? currentUser.name : 'Usuario'}
                </div>

                {deferredPrompt && isMobileView && (
                  <button onClick={handleInstallApp} className="install-btn">
                    📱 Instalar App
                  </button>
                )}

                <button onClick={handleLogout} className="logout-btn">
                  <MenuIcon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL */}
        <div className="main-content">
          {deferredPrompt && isMobileView && (
            <div style={{ position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, backgroundColor: '#2563EB', color: 'white', padding: '10px 15px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', width: '90%', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>📱 Instalar Global GPS App</span>
              <button onClick={handleInstallApp} style={{ backgroundColor: 'white', color: '#2563EB', border: 'none', padding: '5px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Descargar</button>
            </div>
          )}

          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }} onClick={() => showUserMenu && setShowUserMenu(false)}>
            {activeTab === 'dashboard' && <LiveDashboard devices={devices} positions={positions} />}
            {activeTab === 'route' && <RoutePlayback devices={devices} token={token} />}
            {activeTab === 'report' && <Reports devices={devices} token={token} />}
            
            {/* RENDERIZADO DE RUTAS LABORALES PÚBLICO PARA TODOS */}
            {activeTab === 'workRoutes' && <WorkRoutesReport devices={devices} />} 
            
            {activeTab === 'geofences' && <Geofences />}
            {activeTab === 'alerts' && <Alerts devices={devices} token={token} />} 
            {activeTab === 'share' && <ShareLocation devices={devices} token={token} />}
            {activeTab === 'mantenimientos' && <Maintenance devices={devices} token={token} />}
            
            {/* EL PANEL DE ADMINISTRACIÓN SIGUE ESTRICTAMENTE PROTEGIDO SÓLO PARA ADMINS */}
            {currentUser?.administrator && activeTab === 'admin' && <AdminPanel devices={devices} token={token} currentUser={currentUser} />}
          </div>
        </div>

      </div>
    </>
  );
}

const styles = {
  navItem: { padding: '4px', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'all 0.2s ease', width: '28px', height: '28px', margin: '0 auto' },
  navItemActive: { backgroundColor: '#2563EB', color: 'white', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)' }
};