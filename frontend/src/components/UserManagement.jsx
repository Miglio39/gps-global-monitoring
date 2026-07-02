import React, { useState, useEffect } from 'react';

export default function UserManagement({ token, devices }) {
  const [allUsers, setAllUsers] = useState([]);
  const [userForm, setUserForm] = useState({ name: '', cedula: '', usuario: '', password: '' });
  const [assignForm, setAssignForm] = useState({ userId: '', deviceId: '' });
  const [adminMessage, setAdminMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const fetchUsers = () => {
    fetch('/api/users', { headers: { 'Authorization': `Basic ${token}` } })
      .then(res => res.json())
      .then(data => setAllUsers(data))
      .catch(err => console.error("Error cargando usuarios:", err));
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const payload = {
        name: userForm.name,
        phone: userForm.cedula,
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
        setUserForm({ name: '', cedula: '', usuario: '', password: '' }); 
        fetchUsers();
    } else {
        setAdminMessage({ text: 'Error al crear cliente. Verifique que el usuario no exista.', type: 'error' });
    }
  };

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
        setAdminMessage({ text: 'Error al asignar el vehículo.', type: 'error' });
    }
  };

  return (
    <div>
      {adminMessage.text && (
          <div style={{backgroundColor: adminMessage.type === 'success' ? '#065F46' : '#991B1B', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px'}}>
              {adminMessage.text}
          </div>
      )}
      
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px'}}>
        {/* NUEVO CLIENTE */}
        <div style={styles.adminCard}>
          <h3 style={styles.adminCardTitle}>Crear Cliente</h3>
          <form onSubmit={handleCreateUser} style={styles.form}>
            <input type="text" placeholder="Nombre completo" required value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} style={styles.input} />
            <input type="text" placeholder="Cédula" required value={userForm.cedula} onChange={e => setUserForm({...userForm, cedula: e.target.value})} style={styles.input} />
            <input type="text" placeholder="Usuario (Ej: cliente1)" required value={userForm.usuario} onChange={e => setUserForm({...userForm, usuario: e.target.value})} style={styles.input} />
            <input type="password" placeholder="Contraseña" required value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} style={styles.input} />
            <button type="submit" style={styles.btn}>Registrar Usuario</button>
          </form>
        </div>

        {/* ASIGNAR FLOTA */}
        <div style={styles.adminCard}>
          <h3 style={styles.adminCardTitle}>Asignar Vehículo a Cliente</h3>
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

      {/* TABLA DE USUARIOS */}
      <div style={{...styles.adminCard, marginTop: '20px'}}>
        <h3 style={styles.adminCardTitle}>Directorio de Usuarios ({allUsers.length})</h3>
        <div style={{overflowX: 'auto'}}>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Nombre Completo</th>
                        <th style={styles.th}>Cédula</th>
                        <th style={styles.th}>Usuario</th>
                        <th style={styles.th}>Contraseña</th>
                    </tr>
                </thead>
                <tbody>
                    {allUsers.map(u => (
                        <tr key={u.id} style={styles.tr}>
                            <td style={styles.td}><strong>{u.name}</strong></td>
                            <td style={{...styles.td, color: '#9CA3AF'}}>{u.phone || 'N/A'}</td>
                            <td style={styles.td}>{u.email}</td>
                            <td style={{...styles.td, color: '#10B981'}}>Segura 🔒</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}

const styles = {
  adminCard: { backgroundColor: '#111827', padding: '25px', borderRadius: '12px', border: '1px solid #1F2937' },
  adminCardTitle: { color: 'white', fontSize: '16px', margin: '0 0 20px 0', borderBottom: '1px solid #1F2937', paddingBottom: '10px' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '12px', color: 'white', fontSize: '14px', outline: 'none' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white' },
  th: { padding: '12px 15px', backgroundColor: '#1F2937', borderBottom: '2px solid #374151', fontSize: '13px', color: '#9CA3AF' },
  tr: { borderBottom: '1px solid #1F2937' },
  td: { padding: '12px 15px', fontSize: '14px' }
};