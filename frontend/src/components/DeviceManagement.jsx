import React, { useState } from 'react';

export default function DeviceManagement({ token, devices }) {
  // El puerto inicia vacío, forzando al usuario a seleccionar una marca
  const [deviceForm, setDeviceForm] = useState({ placa: '', imei: '', sim: '', puerto: '' });
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [adminMessage, setAdminMessage] = useState({ text: '', type: '' });

  const handleSaveDevice = async (e) => {
    e.preventDefault();
    const payload = {
        name: deviceForm.placa,
        uniqueId: deviceForm.imei,
        phone: deviceForm.sim,
        attributes: { puerto: parseInt(deviceForm.puerto) } // Se asegura de guardarlo como número
    };

    if (editingDeviceId) {
        payload.id = editingDeviceId;
        const res = await fetch(`/api/devices/${editingDeviceId}`, { 
            method: 'PUT', 
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });

        if (res.ok) { 
            setAdminMessage({ text: 'GPS Actualizado exitosamente.', type: 'success' });
            setDeviceForm({ placa: '', imei: '', sim: '', puerto: '' }); 
            setEditingDeviceId(null);
        }
    } else {
        const res = await fetch('https://api.labtesting.online/api/devices', { 
            method: 'POST', 
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });

        if (res.ok) { 
            setAdminMessage({ text: 'GPS registrado exitosamente.', type: 'success' });
            setDeviceForm({ placa: '', imei: '', sim: '', puerto: '' }); 
        } else {
            setAdminMessage({ text: 'Error: El IMEI ya está registrado.', type: 'error' });
        }
    }
  };

  const handleEditClick = (device) => {
      setDeviceForm({ 
          placa: device.name, 
          imei: device.uniqueId,
          sim: device.phone || '',
          puerto: device.attributes?.puerto || ''
      });
      setEditingDeviceId(device.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteDevice = async (id) => {
      if (!window.confirm("🚨 ¿Eliminar este dispositivo permanentemente?")) return;
      const res = await fetch(`/api/devices/${id}`, { method: 'DELETE', headers: { 'Authorization': `Basic ${token}` } });
      if (res.ok) { 
          setAdminMessage({ text: 'GPS eliminado correctamente.', type: 'success' });
          if (editingDeviceId === id) {
              setDeviceForm({ placa: '', imei: '', sim: '', puerto: '' });
              setEditingDeviceId(null);
          }
      }
  };

  return (
    <div>
      {adminMessage.text && (
          <div style={{backgroundColor: adminMessage.type === 'success' ? '#065F46' : '#991B1B', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px'}}>
              {adminMessage.text}
          </div>
      )}
      
      {/* FORMULARIO DE GPS */}
      <div style={{...styles.adminCard, border: editingDeviceId ? '1px solid #10B981' : '1px solid #1F2937'}}>
        <h3 style={styles.adminCardTitle}>{editingDeviceId ? 'Editar Dispositivo GPS ✏️' : 'Registro de Nuevo GPS'}</h3>
        <form onSubmit={handleSaveDevice} style={styles.form}>
          <div style={{display: 'flex', gap: '15px', flexWrap: 'wrap'}}>
            <input type="text" placeholder="Placa / Alias" required value={deviceForm.placa} onChange={e => setDeviceForm({...deviceForm, placa: e.target.value})} style={{...styles.input, flex: 1}} />
            <input type="text" placeholder="IMEI" required value={deviceForm.imei} onChange={e => setDeviceForm({...deviceForm, imei: e.target.value})} style={{...styles.input, flex: 1}} />
            <input type="text" placeholder="Número SIM" value={deviceForm.sim} onChange={e => setDeviceForm({...deviceForm, sim: e.target.value})} style={{...styles.input, flex: 1}} />
            
            {/* AQUÍ ESTÁ LA MEJORA: SELECTOR AUTOMÁTICO DE PUERTOS POR MARCA */}
            <select 
                required 
                value={deviceForm.puerto} 
                onChange={e => setDeviceForm({...deviceForm, puerto: e.target.value})} 
                style={{...styles.input, flex: 1, color: deviceForm.puerto ? 'white' : '#9CA3AF'}}
            >
                <option value="" disabled>-- Seleccionar Marca del GPS --</option>
                <option value="5023">Concox / Jimi IoT (5023)</option>
                <option value="5159">Protrack / Huabao (5159)</option>
                <option value="5001">Coban / TK (5001)</option>
                <option value="5013">SinoTrack (5013)</option>
                <option value="5027">Teltonika (5027)</option>
                <option value="5093">Ruptela (5093)</option>
            </select>
          </div>

          <div style={{display: 'flex', gap: '10px'}}>
              <button type="submit" style={{...styles.btn, backgroundColor:'#10B981', width: '200px'}}>
                  {editingDeviceId ? 'Guardar Cambios' : 'Registrar Equipo'}
              </button>
              {editingDeviceId && (
                  <button type="button" onClick={() => {setEditingDeviceId(null); setDeviceForm({ placa: '', imei: '', sim: '', puerto: '' })}} style={{...styles.btn, backgroundColor:'#374151', width: '150px'}}>Cancelar</button>
              )}
          </div>
        </form>
      </div>

      {/* TABLA DE DISPOSITIVOS */}
      <div style={{...styles.adminCard, marginTop: '20px'}}>
        <h3 style={styles.adminCardTitle}>Hardware Registrado ({devices.length})</h3>
        <div style={{overflowX: 'auto'}}>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Placa</th>
                        <th style={styles.th}>IMEI</th>
                        <th style={styles.th}>Número SIM</th>
                        <th style={styles.th}>Puerto / Marca</th>
                        <th style={styles.th}>Última Conexión</th>
                        <th style={styles.th}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {devices.map(d => {
                        // Pequeña lógica visual para mostrar el nombre de la marca en la tabla si se conoce el puerto
                        const p = d.attributes?.puerto;
                        let marcaTexto = p ? `${p}` : 'N/A';
                        if (p === 5023) marcaTexto = 'Concox (5023)';
                        if (p === 5159) marcaTexto = 'Protrack (5159)';
                        
                        return (
                            <tr key={d.id} style={styles.tr}>
                                <td style={styles.td}><strong>{d.name}</strong></td>
                                <td style={{...styles.td, color: '#9CA3AF'}}>{d.uniqueId}</td>
                                <td style={styles.td}>{d.phone || 'N/A'}</td>
                                <td style={styles.td}>{marcaTexto}</td>
                                <td style={styles.td}>{d.lastUpdate ? new Date(d.lastUpdate).toLocaleString() : 'Nunca'}</td>
                                <td style={styles.td}>
                                    <button onClick={() => handleEditClick(d)} style={styles.actionBtnEdit}>✏️</button>
                                    <button onClick={() => handleDeleteDevice(d.id)} style={styles.actionBtnDelete}>🗑️</button>
                                </td>
                            </tr>
                        )
                    })}
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
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '12px', color: 'white', fontSize: '14px', outline: 'none', minWidth: '200px' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white' },
  th: { padding: '12px 15px', backgroundColor: '#1F2937', borderBottom: '2px solid #374151', fontSize: '13px', color: '#9CA3AF', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #1F2937' },
  td: { padding: '12px 15px', fontSize: '14px', whiteSpace: 'nowrap' },
  actionBtnEdit: { background: 'transparent', border: '1px solid #3B82F6', color: '#3B82F6', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' },
  actionBtnDelete: { background: 'transparent', border: '1px solid #EF4444', color: '#EF4444', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }
};