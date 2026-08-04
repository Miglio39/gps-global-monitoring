import React, { useState, useEffect } from 'react';

export default function DeviceManagement({ token, devices }) {
  const [deviceForm, setDeviceForm] = useState({ placa: '', imei: '', sim: '', puerto: '', fechaRegistro: '' });
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [adminMessage, setAdminMessage] = useState({ text: '', type: '' });
  
  // Estados para el buscador de dispositivos y la asignación de usuarios
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUserToAssign, setSelectedUserToAssign] = useState('');

  const BASE_URL = 'https://api.globalmonitorgps.com';

  // Cargar la lista de usuarios para poder asignarlos al crear el GPS
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/users`, {
          headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        }
      } catch (err) {
        console.error("Error cargando usuarios:", err);
      }
    };
    fetchUsers();
  }, [token]);

  const handleSaveDevice = async (e) => {
    e.preventDefault();
    
    // Inyectamos la fecha actual. Si es nuevo, toma hoy. Si estamos editando, conserva la que ya tenía.
    const fechaActual = new Date().toISOString();

    const payload = {
        name: deviceForm.placa,
        uniqueId: deviceForm.imei,
        phone: deviceForm.sim,
        attributes: { 
          puerto: parseInt(deviceForm.puerto),
          fechaRegistro: deviceForm.fechaRegistro || fechaActual
        } 
    };

    if (editingDeviceId) {
        payload.id = editingDeviceId;
        const res = await fetch(`${BASE_URL}/api/devices/${editingDeviceId}`, { 
            method: 'PUT', 
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        if (res.ok) { 
            setAdminMessage({ text: 'GPS Actualizado exitosamente.', type: 'success' });
            setDeviceForm({ placa: '', imei: '', sim: '', puerto: '', fechaRegistro: '' }); 
            setEditingDeviceId(null);
        }
    } else {
        const res = await fetch(`${BASE_URL}/api/devices`, { 
            method: 'POST', 
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        
        if (res.ok) { 
            const newDevice = await res.json(); // Obtenemos el objeto del GPS recién creado con su ID
            
            // === LA MAGIA: Asignación inmediata al usuario seleccionado ===
            if (selectedUserToAssign) {
              try {
                await fetch(`${BASE_URL}/api/permissions`, {
                  method: 'POST',
                  headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: parseInt(selectedUserToAssign), deviceId: newDevice.id })
                });
              } catch (permErr) {
                console.error("Error asignando el GPS al usuario:", permErr);
              }
            }

            setAdminMessage({ text: 'GPS registrado y asignado exitosamente.', type: 'success' });
            setDeviceForm({ placa: '', imei: '', sim: '', puerto: '', fechaRegistro: '' });
            setSelectedUserToAssign(''); // Limpiar el selector de usuarios
        } else {
            setAdminMessage({ text: 'Error: El IMEI ya está registrado o hay un error en los datos.', type: 'error' });
        }
    }
  };

  const handleEditClick = (device) => {
      setDeviceForm({ 
          placa: device.name, 
          imei: device.uniqueId,
          sim: device.phone || '',
          puerto: device.attributes?.puerto || '',
          fechaRegistro: device.attributes?.fechaRegistro || ''
      });
      setEditingDeviceId(device.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteDevice = async (id) => {
      if (!window.confirm("🚨 ¿Eliminar este dispositivo permanentemente?")) return;
      const res = await fetch(`${BASE_URL}/api/devices/${id}`, { method: 'DELETE', headers: { 'Authorization': `Basic ${token}` } });
      if (res.ok) { 
          setAdminMessage({ text: 'GPS eliminado correctamente.', type: 'success' });
          if (editingDeviceId === id) {
              setDeviceForm({ placa: '', imei: '', sim: '', puerto: '', fechaRegistro: '' });
              setEditingDeviceId(null);
          }
      }
  };

  // Lógica de Filtrado (Buscador)
  const filteredDevices = devices.filter(d => {
    const term = searchTerm.toLowerCase();
    return (
      (d.name && d.name.toLowerCase().includes(term)) ||
      (d.uniqueId && d.uniqueId.toLowerCase().includes(term)) ||
      (d.phone && d.phone.toLowerCase().includes(term))
    );
  });

  return (
    <div>
      <style>{`
        .dev-form-row { display: flex; gap: 15px; flex-wrap: wrap; }
        .dev-form-input { flex: 1; min-width: 200px; }
        .search-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; }
        @media (max-width: 768px) {
          .dev-form-row { flex-direction: column; gap: 10px; }
          .dev-form-input { width: 100%; min-width: auto; }
          .dev-card-container { padding: 15px !important; }
          .search-input { width: 100% !important; max-width: none !important; }
        }
      `}</style>

      {adminMessage.text && (
          <div style={{backgroundColor: adminMessage.type === 'success' ? '#065F46' : '#991B1B', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px'}}>
              {adminMessage.text}
          </div>
      )}
      
      {/* FORMULARIO DE GPS */}
      <div style={{...styles.adminCard, border: editingDeviceId ? '1px solid #10B981' : '1px solid #1F2937'}} className="dev-card-container">
        <h3 style={styles.adminCardTitle}>{editingDeviceId ? 'Editar Dispositivo GPS ✏️' : 'Registro de Nuevo GPS'}</h3>
        <form onSubmit={handleSaveDevice} style={styles.form}>
          <div className="dev-form-row">
            <input type="text" placeholder="Placa / Alias" required value={deviceForm.placa} onChange={e => setDeviceForm({...deviceForm, placa: e.target.value})} style={styles.input} className="dev-form-input" />
            <input type="text" placeholder="IMEI" required value={deviceForm.imei} onChange={e => setDeviceForm({...deviceForm, imei: e.target.value})} style={styles.input} className="dev-form-input" />
            <input type="text" placeholder="Número SIM" value={deviceForm.sim} onChange={e => setDeviceForm({...deviceForm, sim: e.target.value})} style={styles.input} className="dev-form-input" />
            
            <select 
                required 
                value={deviceForm.puerto} 
                onChange={e => setDeviceForm({...deviceForm, puerto: e.target.value})} 
                style={{...styles.input, color: deviceForm.puerto ? 'white' : '#9CA3AF'}}
                className="dev-form-input"
            >
                <option value="" disabled>-- Seleccionar Marca del GPS --</option>
                <option value="5023">Concox / Jimi IoT (5023)</option>
                <option value="5159">Protrack / Huabao (5159)</option>
                <option value="5001">Coban / TK (5001)</option>
                <option value="5013">SinoTrack (5013)</option>
                <option value="5027">Teltonika (5027)</option>
                <option value="5093">Ruptela (5093)</option>
            </select>

            {/* SELECTOR DE USUARIO (Solo visible al crear un nuevo GPS) */}
            {!editingDeviceId && (
              <select 
                  value={selectedUserToAssign} 
                  onChange={e => setSelectedUserToAssign(e.target.value)} 
                  style={{...styles.input, color: selectedUserToAssign ? 'white' : '#9CA3AF', border: '1px solid #3B82F6'}}
                  className="dev-form-input"
                  title="Selecciona a qué cliente pertenecerá este GPS"
              >
                  <option value="">-- Asignar a cliente (Opcional) --</option>
                  {users.map(u => (
                      <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                      </option>
                  ))}
              </select>
            )}
          </div>

          <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
              <button type="submit" style={{...styles.btn, backgroundColor:'#10B981', flex: 1, maxWidth: '250px'}}>
                  {editingDeviceId ? 'Guardar Cambios' : 'Registrar Equipo'}
              </button>
              {editingDeviceId && (
                  <button type="button" onClick={() => {setEditingDeviceId(null); setDeviceForm({ placa: '', imei: '', sim: '', puerto: '', fechaRegistro: '' })}} style={{...styles.btn, backgroundColor:'#374151', flex: 1, maxWidth: '150px'}}>Cancelar</button>
              )}
          </div>
        </form>
      </div>

      {/* TABLA DE DISPOSITIVOS */}
      <div style={{...styles.adminCard, marginTop: '20px'}} className="dev-card-container">
        
        {/* Contenedor del Buscador */}
        <div className="search-container">
          <h3 style={{...styles.adminCardTitle, borderBottom: 'none', margin: 0, padding: 0}}>
            Hardware Registrado ({filteredDevices.length})
          </h3>
          <input 
            type="text" 
            placeholder="🔍 Buscar placa, IMEI o SIM..." 
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
                        <th style={styles.th}>Placa</th>
                        <th style={styles.th}>IMEI</th>
                        <th style={styles.th}>Número SIM</th>
                        <th style={styles.th}>Puerto / Marca</th>
                        <th style={styles.th}>Fecha Registro</th>
                        <th style={styles.th}>Última Conexión</th>
                        <th style={styles.th}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredDevices.length === 0 ? (
                      <tr><td colSpan="7" style={{padding: '20px', textAlign: 'center', color: '#9CA3AF'}}>No se encontraron GPS que coincidan con la búsqueda.</td></tr>
                    ) : (
                      filteredDevices.map(d => {
                          const p = d.attributes?.puerto;
                          let marcaTexto = p ? `${p}` : 'N/A';
                          if (p === 5023) marcaTexto = 'Concox (5023)';
                          if (p === 5159) marcaTexto = 'Protrack (5159)';
                          if (p === 5013) marcaTexto = 'SinoTrack (5013)';
                          if (p === 5001) marcaTexto = 'Coban (5001)';
                          if (p === 5027) marcaTexto = 'Teltonika (5027)';
                          if (p === 5093) marcaTexto = 'Ruptela (5093)';
                          
                          // Formateo de la nueva fecha inyectada
                          const fechaReg = d.attributes?.fechaRegistro ? new Date(d.attributes.fechaRegistro).toLocaleDateString() : 'Antiguo';

                          return (
                              <tr key={d.id} style={styles.tr}>
                                  <td style={styles.td}><strong>{d.name}</strong></td>
                                  <td style={{...styles.td, color: '#9CA3AF'}}>{d.uniqueId}</td>
                                  <td style={styles.td}>{d.phone || 'N/A'}</td>
                                  <td style={styles.td}>{marcaTexto}</td>
                                  <td style={{...styles.td, color: '#60A5FA', fontSize: '12px'}}>{fechaReg}</td>
                                  <td style={styles.td}>{d.lastUpdate ? new Date(d.lastUpdate).toLocaleString() : 'Nunca'}</td>
                                  <td style={styles.td}>
                                      <button onClick={() => handleEditClick(d)} style={styles.actionBtnEdit}>✏️</button>
                                      <button onClick={() => handleDeleteDevice(d.id)} style={styles.actionBtnDelete}>🗑️</button>
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
  adminCardTitle: { color: 'white', fontSize: '16px', margin: '0 0 20px 0', borderBottom: '1px solid #1F2937', paddingBottom: '10px' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '12px', color: 'white', fontSize: '14px', outline: 'none' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white', minWidth: '900px' },
  th: { padding: '12px 15px', backgroundColor: '#1F2937', borderBottom: '2px solid #374151', fontSize: '13px', color: '#9CA3AF', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #1F2937' },
  td: { padding: '12px 15px', fontSize: '14px', whiteSpace: 'nowrap' },
  actionBtnEdit: { background: 'transparent', border: '1px solid #3B82F6', color: '#3B82F6', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' },
  actionBtnDelete: { background: 'transparent', border: '1px solid #EF4444', color: '#EF4444', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }
};