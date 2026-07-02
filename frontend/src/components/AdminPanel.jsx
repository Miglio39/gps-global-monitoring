import React, { useState } from 'react';
import UserManagement from './UserManagement';
import DeviceManagement from './DeviceManagement';

export default function AdminPanel({ devices, token, currentUser }) {
  const [activeTab, setActiveTab] = useState('usuarios');

  return (
    <main style={{flex: 1, padding: '20px 30px', overflowY: 'auto', backgroundColor: '#0B1120'}}>
      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Panel de Administración Global</h2>
      
      {/* PESTAÑAS DE NAVEGACIÓN */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #1F2937', paddingBottom: '10px' }}>
        <button 
          onClick={() => setActiveTab('usuarios')} 
          style={{...styles.tabBtn, backgroundColor: activeTab === 'usuarios' ? '#2563EB' : 'transparent', color: activeTab === 'usuarios' ? 'white' : '#9CA3AF'}}
        >
          👥 Gestión de Usuarios y Flota
        </button>
        <button 
          onClick={() => setActiveTab('dispositivos')} 
          style={{...styles.tabBtn, backgroundColor: activeTab === 'dispositivos' ? '#10B981' : 'transparent', color: activeTab === 'dispositivos' ? 'white' : '#9CA3AF'}}
        >
          📡 Gestión de Dispositivos GPS
        </button>
      </div>

      {/* RENDERIZADO DINÁMICO */}
      {activeTab === 'usuarios' && <UserManagement token={token} devices={devices} />}
      {activeTab === 'dispositivos' && <DeviceManagement token={token} devices={devices} />}

    </main>
  );
}

const styles = {
  tabBtn: { border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'all 0.2s' }
};