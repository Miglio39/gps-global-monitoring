import React, { useState, useEffect } from 'react';

export default function UserManagement({ token, devices }) {
  const [allUsers, setAllUsers] = useState([]);
  const [assignedDevicesMap, setAssignedDevicesMap] = useState({}); 
  
  const [userForm, setUserForm] = useState({ name: '', cedula: '', usuario: '', password: '' });
  const [editingUserId, setEditingUserId] = useState(null);
  
  const [assignForm, setAssignForm] = useState({ userId: '', deviceId: '' });
  const [adminMessage, setAdminMessage] = useState({ text: '', type: '' });
  
  // NUEVO: Estado para el buscador
  const [searchTerm, setSearchTerm] = useState('');

  const BASE_URL = 'https://api.labtesting.online';

  useEffect(() => {
    fetchUsersAndDevices();
    // eslint-disable-next-line
  }, [token]);

  const fetchUsersAndDevices = async () => {
    try {
      const resUsers = await fetch(`${BASE_URL}/api/users`, { headers: { 'Authorization': `Basic ${token}` } });
      if (!resUsers.ok) return;
      const usersData = await resUsers.json();

      const mapping = {};
      await Promise.all(usersData.map(async (u) => {
          const resDev = await fetch(`${BASE_URL}/api/devices?userId=${u.id}`, { headers: { 'Authorization': `Basic ${token}` } });
          if (resDev.ok) {
              mapping[u.id] = await resDev.json();
          } else {
              mapping[u.id] = [];
          }
      }));

      setAssignedDevicesMap(mapping);
      setAllUsers(usersData);
    } catch (err) {
      console.error("Error cargando usuarios:", err);
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    const payload = {
        name: userForm.name,
        phone: userForm.cedula,
        email: userForm.usuario, 
        password: userForm.password
    };

    let url = `${BASE_URL}/api/users`;
    let method = 'POST';

    if (editingUserId) {
        url = `${BASE_URL}/api/users/${editingUserId}`;
        method = 'PUT';
        payload.id = editingUserId;
    }

    const res = await fetch(url, { 
        method: method, 
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
    });

    if (res.ok) { 
        setAdminMessage({ text: editingUserId ? 'Cliente actualizado exitosamente.' : 'Cliente creado exitosamente.', type: 'success' });
        setUserForm({ name: '', cedula: '', usuario: '', password: '' }); 
        setEditingUserId(null);
        fetchUsersAndDevices();
    } else {
        setAdminMessage({ text: 'Error al procesar. Verifique que el usuario no exista ya.', type: 'error' });
    }
  };

  const handleDeleteUser = async (id) => {
      if (!window.confirm("🚨 ¿Estás seguro de eliminar este cliente? Perderá el acceso a la plataforma.")) return;
      const res = await fetch(`${BASE_URL}/api/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Basic ${token}` } });
      if (res.ok) { 
          setAdminMessage({ text: 'Usuario eliminado correctamente.', type: 'success' });
          if (editingUserId === id) {
              setUserForm({ name: '', cedula: '', usuario: '', password: '' });
              setEditingUserId(null);
          }
          fetchUsersAndDevices();
      }
  };

  const handleEditClick = (u) => {
      setUserForm({ name: u.name, cedula: u.phone || '', usuario: u.email, password: '' });
      setEditingUserId(u.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAssignPermissions = async (e) => {
    e.preventDefault();
    const res = await fetch(`${BASE_URL}/api/permissions`, { 
        method: 'POST', 
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ userId: parseInt(assignForm.userId), deviceId: parseInt(assignForm.deviceId) }) 
    });

    if (res.ok) { 
        setAdminMessage({ text: '✅ Vehículo asignado al cliente correctamente.', type: 'success' });
        setAssignForm({ ...assignForm, deviceId: '' }); 
        fetchUsersAndDevices(); 
    } else {
        setAdminMessage({ text: 'Error al asignar el vehículo. Puede que ya esté asignado.', type: 'error' });
    }
  };

  const handleUnlinkDevice = async (userId, deviceId, deviceName) => {
    if (!window.confirm(`¿Deseas desvincular el vehículo "${deviceName}" de este cliente?`)) return;
    
    const res = await fetch(`${BASE_URL}/api/permissions`, { 
        method: 'DELETE', 
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ userId: userId, deviceId: deviceId }) 
    });

    if (res.ok) {
        setAdminMessage({ text: `Vehículo "${deviceName}" desvinculado con éxito.`, type: 'success' });
        fetchUsersAndDevices();
    } else {
        setAdminMessage({ text: 'Error al intentar desvincular el vehículo.', type: 'error' });
    }
  };

  // NUEVO: Lógica de Filtrado (Buscador)
  const filteredUsers = allUsers.filter(u => {
    const term = searchTerm.toLowerCase();
    return (
      (u.name && u.name.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.phone && u.phone.toLowerCase().includes(term))
    );
  });

  return (
    <div>
      <style>{`
        .admin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .vehicle-badge { 
          display: inline-flex; align-items: center; gap: 6px; 
          background-color: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3);
          color: #60A5FA; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;
          margin: 2px; transition: all 0.2s;
        }
        .vehicle-badge:hover { border-color: #3B82F6; background-color: rgba(59, 130, 246, 0.25); }
        .btn-unlink { 
          background: transparent; border: none; color: #9CA3AF; cursor: pointer; 
          font-size: 10px; padding: 0; margin: 0; font-weight: bold;
        }
        .btn-unlink:hover { color: #EF4444; }
        .search-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; }
        @media (max-width: 768px) {
          .admin-form-group { display: flex; flex-direction: column; gap: 10px; }
          .admin-card-container { padding: 15px !important; }
          .search-input { width: 100% !important; max-width: none !important; }
        }
      `}</style>

      {adminMessage.text && (
          <div style={{backgroundColor: adminMessage.type === 'success' ? '#065F46' : '#991B1B', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px'}}>
              {adminMessage.text}
          </div>
      )}
      
      <div className="admin-grid">
        <div style={{...styles.adminCard, border: editingUserId ? '1px solid #3B82F6' : '1px solid #1F2937'}} className="admin-card-container">
          <h3 style={styles.adminCardTitle}>{editingUserId ? 'Editar Cliente ✏️' : 'Crear Nuevo Cliente'}</h3>
          <form onSubmit={handleSaveUser} className="admin-form-group" style={styles.form}>
            <input type="text" placeholder="Nombre completo" required value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} style={styles.input} />
            <input type="text" placeholder="Cédula / NIT" required value={userForm.cedula} onChange={e => setUserForm({...userForm, cedula: e.target.value})} style={styles.input} />
            <input type="text" placeholder="Usuario (Ej: cliente1)" required value={userForm.usuario} onChange={e => setUserForm({...userForm, usuario: e.target.value})} style={styles.input} />
            <input type="password" placeholder={editingUserId ? "Nueva Contraseña (Opcional)" : "Contraseña"} required={!editingUserId} value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} style={styles.input} />
            
            <div style={{display: 'flex', gap: '10px'}}>
              <button type="submit" style={{...styles.btn, flex: 1}}>{editingUserId ? 'Guardar Cambios' : 'Registrar Usuario'}</button>
              {editingUserId && <button type="button" onClick={() => {setEditingUserId(null); setUserForm({ name: '', cedula: '', usuario: '', password: '' })}} style={{...styles.btn, backgroundColor:'#374151'}}>Cancelar</button>}
            </div>
          </form>
        </div>

        <div style={styles.adminCard} className="admin-card-container">
          <h3 style={styles.adminCardTitle}>Vincular Flota (1 a N) 🔗</h3>
          <p style={{color: '#9CA3AF', fontSize: '12px', marginBottom: '15px'}}>Asigna uno o múltiples vehículos a un mismo cliente para que pueda monitorearlos.</p>
          <form onSubmit={handleAssignPermissions} className="admin-form-group" style={styles.form}>
            <select required value={assignForm.userId} onChange={e => setAssignForm({...assignForm, userId: e.target.value})} style={styles.input}>
              <option value="">-- 1. Seleccionar Cliente --</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select required value={assignForm.deviceId} onChange={e => setAssignForm({...assignForm, deviceId: e.target.value})} style={styles.input}>
              <option value="">-- 2. Seleccionar GPS --</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button type="submit" style={{...styles.btn, backgroundColor:'#F59E0B'}}>+ Asignar Vehículo al Cliente</button>
          </form>
        </div>
      </div>

      {/* TABLA DE USUARIOS Y VEHÍCULOS ASIGNADOS */}
      <div style={{...styles.adminCard, marginTop: '20px'}} className="admin-card-container">
        
        {/* NUEVO: Contenedor del Buscador */}
        <div className="search-container">
          <h3 style={{...styles.adminCardTitle, borderBottom: 'none', margin: 0, padding: 0}}>
            Directorio y Accesos ({filteredUsers.length})
          </h3>
          <input 
            type="text" 
            placeholder="🔍 Buscar por nombre, email o cédula..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{...styles.input, width: '100%', maxWidth: '300px'}}
            className="search-input"
          />
        </div>

        <div style={{overflowX: 'auto', borderTop: '1px solid #1F2937', paddingTop: '10px'}}>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Datos del Cliente</th>
                        <th style={styles.th}>Vehículos Asignados a su Cuenta</th>
                        <th style={styles.th}>Usuario / Clave</th>
                        <th style={styles.th}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {/* Renderizamos la tabla usando el array filtrado */}
                    {filteredUsers.length === 0 ? (
                      <tr><td colSpan="4" style={{padding: '20px', textAlign: 'center', color: '#9CA3AF'}}>No se encontraron usuarios que coincidan con la búsqueda.</td></tr>
                    ) : (
                      filteredUsers.map(u => {
                        const userDevices = assignedDevicesMap[u.id] || [];

                        return (
                          <tr key={u.id} style={styles.tr}>
                              <td style={styles.td}>
                                <strong style={{color: '#F3F4F6'}}>{u.name}</strong><br/>
                                <span style={{color: '#9CA3AF', fontSize: '12px'}}>ID/NIT: {u.phone || 'N/A'}</span>
                              </td>
                              
                              <td style={{...styles.td, maxWidth: '300px', whiteSpace: 'normal'}}>
                                {userDevices.length > 0 ? (
                                  userDevices.map(d => (
                                    <div key={d.id} className="vehicle-badge">
                                      🚗 {d.name}
                                      <button className="btn-unlink" onClick={() => handleUnlinkDevice(u.id, d.id, d.name)} title="Desvincular GPS">✕</button>
                                    </div>
                                  ))
                                ) : (
                                  <span style={{color: '#6B7280', fontSize: '12px', fontStyle: 'italic'}}>No tiene vehículos asignados</span>
                                )}
                              </td>

                              <td style={styles.td}>
                                <span style={{color: '#E5E7EB'}}>{u.email}</span><br/>
                                <span style={{color: '#10B981', fontSize: '12px'}}>Segura 🔒</span>
                              </td>

                              <td style={styles.td}>
                                  <button onClick={() => handleEditClick(u)} style={styles.actionBtnEdit}>✏️</button>
                                  <button onClick={() => handleDeleteUser(u.id)} style={styles.actionBtnDelete}>🗑️</button>
                              </td>
                          </tr>
                        )
                      })
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}

const styles = {
  adminCard: { backgroundColor: '#111827', padding: '25px', borderRadius: '12px', border: '1px solid #1F2937' },
  adminCardTitle: { color: 'white', fontSize: '16px', margin: '0 0 10px 0', borderBottom: '1px solid #1F2937', paddingBottom: '10px' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '12px', color: 'white', fontSize: '14px', outline: 'none' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white', minWidth: '700px' },
  th: { padding: '12px 15px', backgroundColor: '#1F2937', borderBottom: '2px solid #374151', fontSize: '13px', color: '#9CA3AF', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #1F2937' },
  td: { padding: '12px 15px', fontSize: '14px', verticalAlign: 'top' },
  actionBtnEdit: { background: 'transparent', border: '1px solid #3B82F6', color: '#3B82F6', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' },
  actionBtnDelete: { background: 'transparent', border: '1px solid #EF4444', color: '#EF4444', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }
};