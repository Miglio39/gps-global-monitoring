import React, { useState, useEffect } from 'react';

const BASE_URL = 'https://api.globalmonitorgps.com';

export default function UserManagement({ devices, token }) {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const [userDevices, setUserDevices] = useState({});
  const [selectedDeviceToLink, setSelectedDeviceToLink] = useState({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    nitCedula: '',
    email: '', 
    password: '',
    administrator: false
  });

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/users`, {
        headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        data.forEach(u => loadDevicesForUser(u.id));
      }
    } catch (err) {
      console.error("Error cargando usuarios:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadDevicesForUser = async (userId) => {
    try {
      const res = await fetch(`${BASE_URL}/api/devices?userId=${userId}`, {
        headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setUserDevices(prev => ({ ...prev, [userId]: data }));
      }
    } catch (err) {
      console.error(`Error cargando dispositivos para el usuario ${userId}:`, err);
    }
  };

  const handleLinkDevice = async (userId) => {
    const deviceId = selectedDeviceToLink[userId];
    if (!deviceId) return;

    try {
      const res = await fetch(`${BASE_URL}/api/permissions`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, deviceId: parseInt(deviceId) })
      });
      if (res.ok) {
        loadDevicesForUser(userId);
        setSelectedDeviceToLink(prev => ({ ...prev, [userId]: '' }));
      } else {
        alert("Error al vincular el dispositivo.");
      }
    } catch (err) {
      console.error("Error vinculando:", err);
    }
  };

  const handleUnlinkDevice = async (userId, deviceId) => {
    if (!window.confirm("¿Seguro que deseas desvincular este vehículo del usuario?")) return;
    try {
      const res = await fetch(`${BASE_URL}/api/permissions`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, deviceId: deviceId })
      });
      if (res.ok) {
        loadDevicesForUser(userId);
      }
    } catch (err) {
      console.error("Error desvinculando:", err);
    }
  };

  // 🔴 SUSPENSIÓN INDIVIDUAL DE VEHÍCULO
  const handleToggleDeviceSuspend = async (userId, device) => {
    const confirmMessage = device.disabled 
      ? `¿Deseas REACTIVAR el servicio del vehículo ${device.name}?` 
      : `¿Deseas SUSPENDER el vehículo ${device.name} por falta de pago? Dejará de reportar y se ocultará para el cliente.`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const updatedDevice = { ...device, disabled: !device.disabled };
      const res = await fetch(`${BASE_URL}/api/devices/${device.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDevice)
      });

      if (res.ok) {
        // Refrescamos solo los vehículos de ese usuario para actualizar el color
        loadDevicesForUser(userId);
      } else {
        alert("Error al cambiar el estado del vehículo.");
      }
    } catch (err) {
      console.error("Error en la suspensión del vehículo:", err);
    }
  };

  // 🔴 SUSPENSIÓN GLOBAL DEL USUARIO
  const handleToggleSuspend = async (user) => {
    if (user.administrator) {
      alert("No puedes suspender a un administrador del sistema.");
      return;
    }

    const confirmMessage = user.disabled 
      ? `¿Deseas REACTIVAR el servicio para el usuario ${user.name}?` 
      : `¿Deseas SUSPENDER por falta de pago al usuario ${user.name}? Perderá el acceso de inmediato a toda su flota.`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const updatedUser = { ...user, disabled: !user.disabled };
      const res = await fetch(`${BASE_URL}/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      });

      if (res.ok) {
        const savedUser = await res.json();
        setUsers(prev => prev.map(u => u.id === user.id ? savedUser : u));
      } else {
        alert("Error al cambiar el estado del usuario.");
      }
    } catch (err) {
      console.error("Error en la suspensión global:", err);
    }
  };

  const togglePremiumAccess = async (user) => {
    const isPremium = user.attributes?.isPremium === true || user.attributes?.isPremium === 'true';
    
    const updatedUser = {
      ...user,
      attributes: {
        ...(user.attributes || {}),
        isPremium: !isPremium
      }
    };

    try {
      const res = await fetch(`${BASE_URL}/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      });

      if (res.ok) {
        const savedUser = await res.json();
        setUsers(prev => prev.map(u => u.id === user.id ? savedUser : u));
      } else {
        alert("Error al actualizar los permisos Premium.");
      }
    } catch (err) {
      console.error("Error de conexión:", err);
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      const url = editingUser ? `${BASE_URL}/api/users/${editingUser.id}` : `${BASE_URL}/api/users`;
      const method = editingUser ? 'PUT' : 'POST';

      const bodyData = {
        ...editingUser,
        name: formData.name,
        email: formData.email, 
        administrator: formData.administrator,
        phone: formData.nitCedula, 
        userLimit: formData.administrator ? 0 : 1000, 
        ...(formData.password ? { password: formData.password } : {})
      };

      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      if (res.ok) {
        fetchUsers();
        setIsModalOpen(false);
        resetForm();
      } else {
        alert("Error al guardar usuario. Verifica que el nombre de usuario sea único.");
      }
    } catch (err) {
      console.error("Error guardando usuario:", err);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      nitCedula: user.phone || '',
      email: user.email || '',
      password: '',
      administrator: user.administrator || false
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("¿Seguro que deseas eliminar permanentemente este usuario?")) return;
    try {
      const res = await fetch(`${BASE_URL}/api/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${token}` }
      });
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== userId));
      }
    } catch (err) {
      console.error("Error eliminando usuario:", err);
    }
  };

  const resetForm = () => {
    setEditingUser(null);
    setFormData({ name: '', nitCedula: '', email: '', password: '', administrator: false });
  };

  const filteredUsers = users.filter(u => 
    (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.phone && u.phone.includes(searchTerm))
  );

  return (
    <div style={{ color: '#F3F4F6', fontFamily: 'Inter, sans-serif' }}>
      
      <style>{`
        .user-row { transition: background-color 0.2s ease; }
        .user-row:hover { background-color: rgba(31, 41, 55, 0.8); }
        .btn-primary { background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3); }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 8px -1px rgba(37, 99, 235, 0.4); }
        .custom-input { width: 100%; padding: 10px 12px; border-radius: 8px; background-color: #1F2937; border: 1px solid #374151; color: white; outline: none; transition: border-color 0.2s ease; }
        .custom-input:focus { border-color: #3B82F6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .glass-modal { background: rgba(17, 24, 39, 0.8); backdrop-filter: blur(8px); position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; display: flex; justify-content: center; align-items: center; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ position: 'relative', width: '350px', maxWidth: '100%' }}>
          <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#9CA3AF' }}>🔍</span>
          <input 
            type="text" 
            placeholder="Buscar por nombre, NIT/Cédula o usuario..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="custom-input"
            style={{ paddingLeft: '38px', backgroundColor: '#111827' }}
          />
        </div>

        <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="btn-primary">
          ➕ Nuevo Usuario
        </button>
      </div>

      <div style={{ backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1F2937', overflowX: 'auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1050px' }}>
          <thead>
            <tr style={{ backgroundColor: '#1F2937', color: '#9CA3AF', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '16px 20px', borderBottom: '2px solid #374151' }}>Nombre / NIT o Cédula</th>
              <th style={{ padding: '16px 20px', borderBottom: '2px solid #374151' }}>Usuario</th>
              <th style={{ padding: '16px 20px', borderBottom: '2px solid #374151' }}>Rol</th>
              <th style={{ padding: '16px 20px', borderBottom: '2px solid #374151' }}>Flota Asignada (Vehículos)</th>
              <th style={{ padding: '16px 20px', borderBottom: '2px solid #374151', textAlign: 'center' }}>Estado Global</th>
              <th style={{ padding: '16px 20px', borderBottom: '2px solid #374151', textAlign: 'center' }}>Módulo Premium</th>
              <th style={{ padding: '16px 20px', borderBottom: '2px solid #374151', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                  {loading ? '⏳ Cargando base de datos...' : 'No se encontraron usuarios.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const isPremium = user.attributes?.isPremium === true || user.attributes?.isPremium === 'true';
                const assignedDevices = userDevices[user.id] || [];

                return (
                  <tr key={user.id} className="user-row" style={{ borderBottom: '1px solid #1F2937', opacity: user.disabled ? 0.6 : 1 }}>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ fontWeight: 'bold', color: '#F3F4F6', fontSize: '14px', textDecoration: user.disabled ? 'line-through' : 'none' }}>{user.name}</div>
                      <div style={{ color: '#9CA3AF', fontSize: '12px', marginTop: '2px' }}>NIT/Cédula: {user.phone || 'N/A'}</div>
                    </td>

                    <td style={{ padding: '12px 20px', color: '#38BDF8', fontWeight: '500', fontSize: '13.5px' }}>
                      {user.email}
                    </td>
                    
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ 
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', display: 'inline-block',
                        backgroundColor: user.administrator ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        color: user.administrator ? '#F59E0B' : '#60A5FA',
                        border: `1px solid ${user.administrator ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
                      }}>
                        {user.administrator ? '👑 Administrador' : '👤 Cliente'}
                      </span>
                    </td>

                    <td style={{ padding: '8px 20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px' }}>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <select 
                            value={selectedDeviceToLink[user.id] || ''} 
                            onChange={(e) => setSelectedDeviceToLink(prev => ({ ...prev, [user.id]: e.target.value }))}
                            style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#1F2937', color: '#FFF', border: '1px solid #374151', fontSize: '11px', flex: 1, outline: 'none' }}
                          >
                            <option value="">+ Vincular vehículo...</option>
                            {devices?.map(dev => {
                              if (assignedDevices.find(ad => ad.id === dev.id)) return null;
                              return <option key={dev.id} value={dev.id}>{dev.name}</option>
                            })}
                          </select>
                          <button 
                            onClick={() => handleLinkDevice(user.id)}
                            style={{ padding: '4px 10px', backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', height: '25px' }}
                          >
                            Añadir
                          </button>
                        </div>

                        {/* 🔴 AQUI OCURRE LA MAGIA DE LA SUSPENSIÓN INDIVIDUAL */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {assignedDevices.map(d => (
                            <span key={d.id} style={{ 
                              backgroundColor: d.disabled ? 'rgba(239, 68, 68, 0.15)' : '#374151', 
                              color: d.disabled ? '#F87171' : '#D1D5DB', 
                              fontSize: '11px', padding: '4px 8px', borderRadius: '12px', 
                              display: 'flex', alignItems: 'center', gap: '6px',
                              border: `1px solid ${d.disabled ? 'rgba(239, 68, 68, 0.4)' : '#4B5563'}`,
                              textDecoration: d.disabled ? 'line-through' : 'none'
                            }}>
                              {d.disabled ? '🔴' : '🟢'} {d.name}
                              
                              {/* Botón de Pausa / Reactivación */}
                              <button 
                                onClick={() => handleToggleDeviceSuspend(user.id, d)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '12px' }}
                                title={d.disabled ? "Click para Reactivar" : "Click para Suspender (Pausar)"}
                              >
                                {d.disabled ? '▶️' : '⏸️'}
                              </button>

                              <span style={{ color: '#4B5563', margin: '0 2px' }}>|</span>

                              {/* Botón de Desvincular (Borrar asignación) */}
                              <button 
                                onClick={() => handleUnlinkDevice(user.id, d.id)}
                                style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', padding: '0', fontSize: '12px', fontWeight: 'bold' }}
                                title="Desvincular del usuario"
                              >×</button>
                            </span>
                          ))}
                          {assignedDevices.length === 0 && <span style={{ color: '#6B7280', fontSize: '11px', fontStyle: 'italic' }}>Sin vehículos vinculados</span>}
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleToggleSuspend(user)}
                        title={user.disabled ? 'Reactivar acceso' : 'Suspender CUENTA COMPLETA por falta de pago'}
                        style={{
                          padding: '6px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease',
                          backgroundColor: user.disabled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: user.disabled ? '#EF4444' : '#10B981',
                          border: `1px solid ${user.disabled ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`
                        }}
                      >
                        {user.disabled ? '🔴 Cuenta Suspendida' : '🟢 Cuenta Activa'}
                      </button>
                    </td>

                    <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                      <button
                        onClick={() => togglePremiumAccess(user)}
                        title={isPremium ? 'Revocar acceso' : 'Otorgar acceso a Rutas Laborales'}
                        style={{
                          padding: '6px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease',
                          backgroundColor: isPremium ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.1)',
                          color: isPremium ? '#10B981' : '#9CA3AF',
                          border: `1px solid ${isPremium ? 'rgba(16, 185, 129, 0.4)' : 'rgba(107, 114, 128, 0.3)'}`
                        }}
                      >
                        {isPremium ? '⭐ Premium' : '⚪ Estándar'}
                      </button>
                    </td>

                    <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                      <button 
                        onClick={() => handleEdit(user)}
                        title="Editar Usuario"
                        style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60A5FA', padding: '6px', borderRadius: '6px', cursor: 'pointer', marginRight: '8px' }}
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={() => handleDelete(user.id)}
                        title="Eliminar Usuario"
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#F87171', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="glass-modal">
          <div style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '16px', padding: '30px', width: '90%', maxWidth: '450px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <h3 style={{ margin: '0 0 25px 0', color: '#F3F4F6', fontSize: '18px' }}>
              {editingUser ? '✏️ Editar Perfil de Usuario' : '➕ Crear Nuevo Usuario'}
            </h3>
            
            <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '5px', fontWeight: 'bold' }}>Nombre Completo *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="custom-input" placeholder="Nombre completo o Empresa" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '5px', fontWeight: 'bold' }}>NIT o Cédula *</label>
                <input required type="text" value={formData.nitCedula} onChange={e => setFormData({ ...formData, nitCedula: e.target.value })} className="custom-input" placeholder="Ej. 900123456-7 o 12345678" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '5px', fontWeight: 'bold' }}>Usuario (Login) *</label>
                <input required type="text" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="custom-input" placeholder="Nombre de usuario para iniciar sesión" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '5px', fontWeight: 'bold' }}>
                  Contraseña {editingUser && <span style={{ color: '#F59E0B', fontWeight: 'normal' }}>(Dejar en blanco para no cambiar)</span>}
                </label>
                <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="custom-input" placeholder="••••••••" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', padding: '10px', backgroundColor: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px' }}>
                <input type="checkbox" id="adminCheck" checked={formData.administrator} onChange={e => setFormData({ ...formData, administrator: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="adminCheck" style={{ fontSize: '13px', color: '#F3F4F6', cursor: 'pointer', fontWeight: '500' }}>
                  Otorgar privilegios de Administrador Global
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '15px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 18px', backgroundColor: 'transparent', color: '#9CA3AF', border: '1px solid #374151', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}