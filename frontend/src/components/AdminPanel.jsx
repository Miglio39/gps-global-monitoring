import React, { useState, useEffect } from 'react';

export default function AdminPanel({ devices, token, currentUser }) {
  const [allUsers, setAllUsers] = useState([]);
  
  // 1. Formulario de Cliente modificado (sin correo, solo usuario)
  const [userForm, setUserForm] = useState({ name: '', usuario: '', password: '' });
  
  // 2. Estado para el formulario de GPS y para saber si estamos editando
  const [deviceForm, setDeviceForm] = useState({ name: '', uniqueId: '' });
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  
  const [assignForm, setAssignForm] = useState({ userId: '', deviceId: '' });
  const [adminMessage, setAdminMessage] = useState({ text: '', type: '' });

  // Cargar usuarios al entrar
  useEffect(() => {
    fetch('/api/users', { headers: { 'Authorization': `Basic ${token}` } })
      .then(res => res.json()).then(data => setAllUsers(data));
  }, [token]);

  // --- CREAR CLIENTE ---
  const handleCreateUser = async (e) => {
    e.preventDefault();
    // Traccar utiliza internamente el campo 'email' para el inicio de sesión.
    // Inyectamos lo que escribas en "Usuario" dentro de 'email' para engañar a la API.
    const payload = {
        name: userForm.name,
        email: userForm.usuario, 
        password: userForm.password
    };

    const res = await fetch('/api/users', { 
        method: 'POST', 
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
    });

    if (res.ok) { 
        setAdminMessage({ text: 'Cliente creado exitosamente.', type: 'success' }); 
        setUserForm({ name: '', usuario: '', password: '' }); 
        // Actualizar la lista de clientes del selector
        fetch('/api/users', { headers: { 'Authorization': `Basic ${token}` } })
          .then(r => r.json()).then(data => setAllUsers(data));
    } else {
        setAdminMessage({ text: 'Error al crear cliente. El usuario ya existe.', type: 'error' });
    }
  };

  // --- CREAR O EDITAR DISPOSITIVO ---
  const handleSaveDevice = async (e) => {
    e.preventDefault();

    if (editingDeviceId) {
        // MODO EDITAR: Método PUT a la API de Traccar
        const res = await fetch(`/api/devices/${editingDeviceId}`, { 
            method: 'PUT', 
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ id: editingDeviceId, name: deviceForm.name, uniqueId: deviceForm.uniqueId }) 
        });

        if (res.ok) { 
            setAdminMessage({ text: 'GPS Actualizado. (Se reflejará en unos segundos)', type: 'success' }); 
            setDeviceForm({ name: '', uniqueId: '' }); 
            setEditingDeviceId(null);
        } else {
            setAdminMessage({ text: 'Error al actualizar el GPS.', type: 'error' });
        }
    } else {
        // MODO CREAR NUEVO: Método POST
        const res = await fetch('/api/devices', { 
            method: 'POST', 
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify(deviceForm) 
        });

        if (res.ok) { 
            setAdminMessage({ text: 'GPS registrado exitosamente.', type: 'success' }); 
            setDeviceForm({ name: '', uniqueId: '' }); 
        } else {
            setAdminMessage({ text: 'Error al registrar. El IMEI ya existe.', type: 'error' });
        }
    }
  };

  // Funciones auxiliares para botones Editar/Eliminar
  const handleEditClick = (device) => {
      setDeviceForm({ name: device.name, uniqueId: device.uniqueId });
      setEditingDeviceId(device.id);
      window.scrollTo({ top: 0, behavior: 'smooth' }); // Sube la pantalla al formulario
  };

  const handleCancelEdit = () => {
      setDeviceForm({ name: '', uniqueId: '' });
      setEditingDeviceId(null);
  };

  const handleDeleteDevice = async (id) => {
      if (!window.confirm("🚨 ¿Estás seguro de que deseas eliminar este dispositivo de forma permanente? Se perderá su historial.")) return;

      const res = await fetch(`/api/devices/${id}`, { 
          method: 'DELETE', 
          headers: { 'Authorization': `Basic ${token}` } 
      });

      if (res.ok) { 
          setAdminMessage({ text: 'GPS eliminado. (Desaparecerá en breve)', type: 'success' }); 
          if (editingDeviceId === id) handleCancelEdit();
      } else {
          setAdminMessage({ text: 'Error al eliminar el GPS.', type: 'error' });
      }
  };

  // --- ASIGNAR VEHÍCULO ---
  const handleAssignPermissions = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/permissions', { 
        method: 'POST', 
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ userId: parseInt(assignForm.userId), deviceId: parseInt(assignForm.deviceId) }) 
    });
    if (res.ok) { 
        setAdminMessage({ text: 'Vehículo asignado al cliente con éxito.', type: 'success' }); 
        setAssignForm({ userId: '', deviceId: '' }); 
    } else {
        setAdminMessage({ text: 'Error al asignar.', type: 'error' });
    }
  };

  return (
    <main style={{flex: 1, padding: '20px 30px', overflowY: 'auto', backgroundColor: '#0B1120'}}>
      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Panel de Control de Agencia</h2>
      
      {/* ALERTAS */}
      {adminMessage.text && (
          <div style={{backgroundColor: adminMessage.type === 'success' ? '#065F46' : '#991B1B', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', transition: 'all 0.3s'}}>
              {adminMessage.text}
          </div>
      )}
      
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px'}}>
        
        {/* MODULO 1: NUEVO CLIENTE (Sin correo) */}
        <div style={styles.adminCard}>
          <h3 style={styles.adminCardTitle}>1. Nuevo Cliente</h3>
          <form onSubmit={handleCreateUser} style={styles.form}>
            <input type="text" placeholder="Nombre completo" required value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} style={styles.input} />
            <input type="text" placeholder="Usuario (Ej: cliente1)" required value={userForm.usuario} onChange={e => setUserForm({...userForm, usuario: e.target.value})} style={styles.input} />
            <input type="password" placeholder="Contraseña" required value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} style={styles.input} />
            <button type="submit" style={styles.btn}>Crear Cliente</button>
          </form>
        </div>

        {/* MODULO 2: CREAR / EDITAR GPS */}
        <div style={{...styles.adminCard, border: editingDeviceId ? '1px solid #10B981' : '1px solid #1F2937'}}>
          <h3 style={styles.adminCardTitle}>{editingDeviceId ? '2. Editar GPS ✏️' : '2. Nuevo GPS'}</h3>
          <form onSubmit={handleSaveDevice} style={styles.form}>
            <input type="text" placeholder="Alias (Ej: Camión 1)" required value={deviceForm.name} onChange={e => setDeviceForm({...deviceForm, name: e.target.value})} style={styles.input} />
            <input type="text" placeholder="IMEI" required value={deviceForm.uniqueId} onChange={e => setDeviceForm({...deviceForm, uniqueId: e.target.value})} style={styles.input} />
            
            <div style={{display: 'flex', gap: '10px'}}>
                <button type="submit" style={{...styles.btn, backgroundColor:'#10B981', flex: 1}}>
                    {editingDeviceId ? 'Actualizar' : 'Registrar'}
                </button>
                {editingDeviceId && (
                    <button type="button" onClick={handleCancelEdit} style={{...styles.btn, backgroundColor:'#374151', flex: 1}}>
                        Cancelar
                    </button>
                )}
            </div>
          </form>
        </div>

        {/* MODULO 3: ASIGNAR FLOTA */}
        <div style={styles.adminCard}>
          <h3 style={styles.adminCardTitle}>3. Asignar Flota</h3>
          <form onSubmit={handleAssignPermissions} style={styles.form}>
            <select required value={assignForm.userId} onChange={e => setAssignForm({...assignForm, userId: e.target.value})} style={styles.input}>
              <option value="">-- Seleccionar Cliente --</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select required value={assignForm.deviceId} onChange={e => setAssignForm({...assignForm, deviceId: e.target.value})} style={styles.input}>
              <option value="">-- Seleccionar GPS --</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button type="submit" style={{...styles.btn, backgroundColor:'#F59E0B'}}>Vincular a Cliente</button>
          </form>
        </div>

      </div>

      {/* MODULO 4: TABLA DE GESTIÓN DE DISPOSITIVOS (EDITAR / ELIMINAR) */}
      <div style={{...styles.adminCard, marginTop: '20px', gridColumn: '1 / -1'}}>
        <h3 style={styles.adminCardTitle}>Gestión de Equipos Registrados ({devices.length})</h3>
        
        <div style={{overflowX: 'auto'}}>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Alias del Vehículo</th>
                        <th style={styles.th}>IMEI</th>
                        <th style={styles.th}>Estado</th>
                        <th style={styles.th}>Acciones de Administrador</th>
                    </tr>
                </thead>
                <tbody>
                    {devices.length === 0 ? (
                        <tr><td colSpan="4" style={{textAlign: 'center', padding: '20px', color: '#6B7280'}}>No hay dispositivos registrados aún.</td></tr>
                    ) : (
                        devices.map(d => (
                            <tr key={d.id} style={styles.tr}>
                                <td style={styles.td}><strong>{d.name}</strong></td>
                                <td style={{...styles.td, color: '#9CA3AF'}}>{d.uniqueId}</td>
                                <td style={styles.td}>{d.status === 'online' ? '🟢 En línea' : '🔴 Desconectado'}</td>
                                <td style={styles.td}>
                                    <button onClick={() => handleEditClick(d)} style={styles.actionBtnEdit}>✏️ Editar</button>
                                    <button onClick={() => handleDeleteDevice(d.id)} style={styles.actionBtnDelete}>🗑️ Eliminar</button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>

    </main>
  );
}

// Estilos
const styles = {
  adminCard: { backgroundColor: '#111827', padding: '25px', borderRadius: '12px', border: '1px solid #1F2937' },
  adminCardTitle: { color: 'white', fontSize: '16px', margin: '0 0 20px 0', borderBottom: '1px solid #1F2937', paddingBottom: '10px' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '12px', color: 'white', fontSize: '14px', outline: 'none' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' },
  
  // Estilos de la tabla 5x555
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white' },
  th: { padding: '12px 15px', backgroundColor: '#1F2937', borderBottom: '2px solid #374151', fontSize: '13px', color: '#9CA3AF' },
  tr: { borderBottom: '1px solid #1F2937', transition: 'background 0.2s' },
  td: { padding: '12px 15px', fontSize: '14px' },
  actionBtnEdit: { background: 'transparent', border: '1px solid #3B82F6', color: '#3B82F6', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', marginRight: '8px', fontSize: '12px', fontWeight: 'bold' },
  actionBtnDelete: { background: 'transparent', border: '1px solid #EF4444', color: '#EF4444', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }
};