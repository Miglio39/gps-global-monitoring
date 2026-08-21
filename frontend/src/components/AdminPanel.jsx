import React, { useState } from 'react';
import UserManagement from './UserManagement';
import DeviceManagement from './DeviceManagement';

export default function AdminPanel({ devices, token, currentUser }) {
  const [activeTab, setActiveTab] = useState('usuarios');

  return (
    <main style={{flex: 1, padding: '20px 30px', overflowY: 'auto', backgroundColor: '#0B1120'}}>
      <style>{`
        @media (max-width: 768px) {
          .admin-tabs { flex-direction: column; }
          .admin-tab-btn { width: 100%; text-align: center; }
          .admin-main { padding: 15px 10px !important; }
        }
      `}</style>
      
      <div className="admin-main" style={{maxWidth: '1200px', margin: '0 auto'}}>
        <h2 style={{color:'white', margin:'0 0 20px 0'}}>Panel de Administración Global</h2>
        
        {/* PESTAÑAS DE NAVEGACIÓN RESPONSIVASS */}
        <div className="admin-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '25px', borderBottom: '1px solid #1F2937', paddingBottom: '15px' }}>
          <button 
            className="admin-tab-btn"
            onClick={() => setActiveTab('usuarios')} 
            style={{...styles.tabBtn, backgroundColor: activeTab === 'usuarios' ? '#2563EB' : 'transparent', color: activeTab === 'usuarios' ? 'white' : '#9CA3AF'}}
          >
            👥 Gestión de Usuarios y Permisos
          </button>
          <button 
            className="admin-tab-btn"
            onClick={() => setActiveTab('dispositivos')} 
            style={{...styles.tabBtn, backgroundColor: activeTab === 'dispositivos' ? '#10B981' : 'transparent', color: activeTab === 'dispositivos' ? 'white' : '#9CA3AF'}}
          >
            📡 Gestión de Dispositivos GPS
          </button>
        </div>

        {/* RENDERIZADO DINÁMICO */}
        {activeTab === 'usuarios' && <UserManagement token={token} devices={devices} />}
        {activeTab === 'dispositivos' && <DeviceManagement token={token} devices={devices} />}
      </div>
    </main>
  );
}

const styles = {
  tabBtn: { border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'all 0.2s' }
};