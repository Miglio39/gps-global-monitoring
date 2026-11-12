import React, { useState, useEffect, useRef } from 'react';

export default function DeviceManagement({ token, devices }) {
  const [deviceForm, setDeviceForm] = useState({ placa: '', imei: '', sim: '', whatsapp: '', puerto: '', fechaRegistro: '', fechaVencimiento: '' });
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [adminMessage, setAdminMessage] = useState({ text: '', type: '' });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUserToAssign, setSelectedUserToAssign] = useState('');
  
  const [deviceUserMap, setDeviceUserMap] = useState({});
  const [sortOrder, setSortOrder] = useState('default'); 
  const [inlineAssignDeviceId, setInlineAssignDeviceId] = useState(null);

  const [localSent, setLocalSent] = useState({});

  const BASE_URL = 'https://api.globalmonitorgps.com';

  const fetchUsersAndMapping = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/users`, {
        headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const usersData = await res.json();
        setUsers(usersData);

        const mapping = {};
        const fetchPromises = usersData.filter(u => !u.administrator).map(async (user) => {
          const devRes = await fetch(`${BASE_URL}/api/devices?userId=${user.id}`, {
            headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' }
          });
          if (devRes.ok) {
            const userDevs = await devRes.json();
            userDevs.forEach(d => {
              mapping[d.id] = mapping[d.id] ? `${mapping[d.id]}, ${user.name}` : user.name;
            });
          }
        });
        await Promise.all(fetchPromises);
        setDeviceUserMap(mapping);
      }
    } catch (err) {
      console.error("Error cargando usuarios y asignaciones:", err);
    }
  };

  useEffect(() => {
    fetchUsersAndMapping();
  }, [token]);

  const handleSaveDevice = async (e) => {
    e.preventDefault();
    
    const fechaActualObj = new Date();
    const fechaActualISO = fechaActualObj.toISOString();

    let expirationTimeISO;
    if (deviceForm.fechaVencimiento) {
        expirationTimeISO = new Date(`${deviceForm.fechaVencimiento}T23:59:59`).toISOString();
    } else {
        const fechaVencimientoObj = new Date(fechaActualObj);
        fechaVencimientoObj.setFullYear(fechaVencimientoObj.getFullYear() + 1);
        expirationTimeISO = fechaVencimientoObj.toISOString();
    }

    const payload = {
        name: deviceForm.placa,
        uniqueId: deviceForm.imei,
        phone: deviceForm.sim,
        expirationTime: expirationTimeISO,
        attributes: { 
          whatsapp: deviceForm.whatsapp, 
          puerto: parseInt(deviceForm.puerto),
          fechaRegistro: deviceForm.fechaRegistro || fechaActualISO
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
            setDeviceForm({ placa: '', imei: '', sim: '', whatsapp: '', puerto: '', fechaRegistro: '', fechaVencimiento: '' }); 
            setEditingDeviceId(null);
            setTimeout(() => window.location.reload(), 1500);
        }
    } else {
        const res = await fetch(`${BASE_URL}/api/devices`, { 
            method: 'POST', 
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        
        if (res.ok) { 
            const newDevice = await res.json(); 
            
            if (selectedUserToAssign) {
              try {
                await fetch(`${BASE_URL}/api/permissions`, {
                  method: 'POST',
                  headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: parseInt(selectedUserToAssign), deviceId: newDevice.id })
                });
                fetchUsersAndMapping();
              } catch (permErr) {
                console.error("Error asignando el GPS al usuario:", permErr);
              }
            }

            setAdminMessage({ text: 'GPS registrado y asignado exitosamente.', type: 'success' });
            setDeviceForm({ placa: '', imei: '', sim: '', whatsapp: '', puerto: '', fechaRegistro: '', fechaVencimiento: '' });
            setSelectedUserToAssign(''); 
            setTimeout(() => window.location.reload(), 1500);
        } else {
            setAdminMessage({ text: 'Error: El IMEI ya está registrado o hay un error en los datos.', type: 'error' });
        }
    }
  };

  const handleEditClick = (device) => {
      let expDateFormatted = '';
      if (device.expirationTime) {
          expDateFormatted = device.expirationTime.split('T')[0];
      }

      setDeviceForm({ 
          placa: device.name, 
          imei: device.uniqueId,
          sim: device.phone || '',
          whatsapp: device.attributes?.whatsapp || '',
          puerto: device.attributes?.puerto || '',
          fechaRegistro: device.attributes?.fechaRegistro || '',
          fechaVencimiento: expDateFormatted 
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
              setDeviceForm({ placa: '', imei: '', sim: '', whatsapp: '', puerto: '', fechaRegistro: '', fechaVencimiento: '' });
              setEditingDeviceId(null);
          }
      }
  };

  const handleInlineAssign = async (deviceId, userId) => {
    if (!userId) {
      setInlineAssignDeviceId(null);
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/api/permissions`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: parseInt(userId), deviceId: deviceId })
      });
      if (res.ok) {
        fetchUsersAndMapping(); 
      } else {
        alert("Error al asignar el cliente en línea.");
      }
    } catch (err) {
      console.error("Error al asignar cliente:", err);
    }
    setInlineAssignDeviceId(null); 
  };

  const handleSortToggle = () => {
    if (sortOrder === 'default') setSortOrder('asc');
    else if (sortOrder === 'asc') setSortOrder('desc');
    else setSortOrder('default');
  };

 const handleSendManualWhatsApp = async (device, daysLeft, fechaFormateada, tipoAviso) => {
      const telefono = device.attributes?.whatsapp;
      if (!telefono || telefono.length < 10) {
          alert(`❌ El dispositivo ${device.name} no tiene un número de WhatsApp asignado en su configuración.`);
          return;
      }

      let mensaje = '';
      let atributoMarca = '';

      if (tipoAviso === 'proximo') {
        // MENSAJE CON EMOJIS Y ESTRUCTURA LIMPIA
        mensaje = `🔔 *AVISO DE VENCIMIENTO – SERVICIO GPS*

Hola 👋 
Le informamos que el vehículo de placas *${device.name}* está próximo a vencer su suscripción en *${daysLeft} días*.

📅 *Fecha de vencimiento:* ${fechaFormateada}
💰 *Valor de la renovación:* $275.000
📊 *Estado:* Activo

Para evitar la suspensión del servicio, le agradecemos realizar la renovación antes de la fecha indicada.

🏢 *GLOBAL MONITOR GPS*`;
        
        atributoMarca = 'avisoProximoVencimientoWhatsApp';
      } else if (tipoAviso === 'vencido') {
        // MENSAJE ROJO (VENCIDO) CON EMOJIS
        mensaje = `🚨 *SUSCRIPCIÓN VENCIDA – SERVICIO GPS*

Hola 👋 
Le informamos que la suscripción del vehículo de placas *${device.name}* se encuentra vencida desde el *${fechaFormateada}*.

💰 *Valor de la renovación:* $275.000
🚫 *Estado:* Suspendido / Próximo a suspensión

Por favor, realice el pago de la renovación a la brevedad para restablecer o mantener el servicio.

🏢 *GLOBAL MONITOR GPS*`;
        
        atributoMarca = 'avisoYaVencidoWhatsApp';
      }

      const cleanPhone = telefono.replace(/\D/g, ''); 
      const url = `https://wa.me/57${cleanPhone}?text=${encodeURIComponent(mensaje)}`;
      window.open(url, '_blank');

      if (window.confirm(`¿Se abrió WhatsApp correctamente para avisar a ${device.name}? (Al dar Aceptar se marcará como Enviado)`)) {
          try {
              const payload = {
                  ...device,
                  attributes: {
                      ...device.attributes,
                      [atributoMarca]: device.expirationTime 
                  }
              };

              const res = await fetch(`${BASE_URL}/api/devices/${device.id}`, {
                  method: 'PUT',
                  headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
              });

              if (res.ok) {
                  setAdminMessage({ text: `Aviso marcado como OK para ${device.name}.`, type: 'success' });
                  setLocalSent(prev => ({ ...prev, [`${device.id}-${tipoAviso}`]: true }));
              }
          } catch (error) {
              console.error('Error registrando el OK:', error);
          }
      }
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setAdminMessage({ text: '⏳ Procesando archivo de Excel, conectando con Traccar...', type: 'success' });

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
        
        if (rows.length < 2) {
            setAdminMessage({ text: '❌ Archivo vacío o sin datos válidos.', type: 'error' });
            return;
        }

        const headers = rows[0].split(/[;,]/).map(h => h.trim().replace(/^"|"$/g, '').toUpperCase());
        const imeiIndex = headers.findIndex(h => h.includes('IMEI'));
        const fechaIndex = headers.findIndex(h => h.includes('VENCIMIENTO') || h.includes('FECHA'));

        if (imeiIndex === -1 || fechaIndex === -1) {
          setAdminMessage({ text: '❌ Error: El archivo CSV debe contener obligatoriamente una columna "IMEI" y una columna "VENCIMIENTO".', type: 'error' });
          return;
        }

        let successCount = 0;
        let notFoundCount = 0;

        for (let i = 1; i < rows.length; i++) {
          const columns = rows[i].split(/[;,]/).map(c => c.trim().replace(/^"|"$/g, ''));
          const imei = columns[imeiIndex];
          const fechaExcel = columns[fechaIndex];

          if (!imei || !fechaExcel) continue;

          const targetDevice = devices.find(d => String(d.uniqueId) === String(imei));

          if (targetDevice) {
             let formattedDate = fechaExcel;
             
             if (formattedDate.includes('/')) {
                 const parts = formattedDate.split('/');
                 if (parts[0].length <= 2 && parts[2].length === 4) {
                     const day = parts[0].padStart(2, '0');
                     const month = parts[1].padStart(2, '0');
                     formattedDate = `${parts[2]}-${month}-${day}`;
                 }
             }

             let expirationTimeISO;
             try {
                 expirationTimeISO = new Date(`${formattedDate}T23:59:59`).toISOString();
             } catch (dateErr) {
                 continue;
             }

             const payload = {
               ...targetDevice,
               expirationTime: expirationTimeISO
             };

             const res = await fetch(`${BASE_URL}/api/devices/${targetDevice.id}`, {
               method: 'PUT',
               headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
               body: JSON.stringify(payload)
             });

             if (res.ok) successCount++;
          } else {
            notFoundCount++;
          }
        }

        setAdminMessage({ text: `✅ ¡Importación Masiva Exitosa! Equipos actualizados: ${successCount}. (IMEIs no encontrados en sistema: ${notFoundCount})`, type: 'success' });
        e.target.value = ''; 
        setTimeout(() => window.location.reload(), 3500);

      } catch (err) {
        console.error("Error procesando CSV:", err);
        setAdminMessage({ text: '❌ Hubo un error crítico leyendo el archivo.', type: 'error' });
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const filteredDevices = devices.filter(d => {
    const term = searchTerm.toLowerCase();
    const clientName = deviceUserMap[d.id] ? deviceUserMap[d.id].toLowerCase() : '';
    return (
      (d.name && d.name.toLowerCase().includes(term)) ||
      (d.uniqueId && d.uniqueId.toLowerCase().includes(term)) ||
      (d.phone && d.phone.toLowerCase().includes(term)) ||
      (d.attributes?.whatsapp && d.attributes.whatsapp.includes(term)) ||
      (clientName.includes(term))
    );
  });

  let sortedDevices = [...filteredDevices];
  if (sortOrder !== 'default') {
    sortedDevices.sort((a, b) => {
      const dateA = a.lastUpdate ? new Date(a.lastUpdate).getTime() : 0;
      const dateB = b.lastUpdate ? new Date(b.lastUpdate).getTime() : 0;
      if (sortOrder === 'asc') return dateA - dateB; 
      if (sortOrder === 'desc') return dateB - dateA; 
      return 0;
    });
  }

  const handleDownloadExcel = () => {
    if (sortedDevices.length === 0) return alert("No hay dispositivos en la lista para exportar.");
    let filename = `Inventario_Flota_GPS_${new Date().getTime()}.xls`;

    let htmlTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"/><style>
        th { background-color: #1F2937; color: #FFFFFF; font-weight: bold; text-align: left; font-family: Arial; font-size: 11pt; padding: 6px; }
        td { border: 0.5pt solid #D1D5DB; font-family: Arial; font-size: 10pt; padding: 4px; }
        .meta-title { font-size: 12pt; font-weight: bold; color: #111827; font-family: Arial; }
      </style></head>
      <body>
      <table>
        <tr><td colspan="9" class="meta-title"><b>INVENTARIO GENERAL DE HARDWARE Y LÍNEAS SIM</b></td></tr>
        <tr><td colspan="9" style="color: #6B7280;">Fecha de exportación: ${new Date().toLocaleString()}</td></tr>
        <tr><td colspan="9" style="color: #6B7280;">Total Registros Exportados: ${sortedDevices.length}</td></tr>
        <tr></tr>
        <tr>
          <th><b>PLACA / VEHÍCULO</b></th>
          <th><b>CLIENTE ASIGNADO</b></th>
          <th><b>IMEI</b></th>
          <th><b>NÚMERO SIM</b></th>
          <th><b>WHATSAPP CLIENTE</b></th>
          <th><b>MARCA / PUERTO</b></th>
          <th><b>FECHA DE REGISTRO</b></th>
          <th><b>VENCIMIENTO</b></th>
          <th><b>ÚLTIMA CONEXIÓN</b></th>
        </tr>
    `;

    sortedDevices.forEach(d => {
      const p = d.attributes?.puerto;
      let marcaTexto = p ? `${p}` : 'N/A';
      if (p === 5001) marcaTexto = 'Coban (5001)';
      if (p === 5004) marcaTexto = 'Queclink (5004)';
      if (p === 5011) marcaTexto = 'Suntech (5011)';
      if (p === 5013) marcaTexto = 'SinoTrack (5013)';
      if (p === 5023) marcaTexto = 'Concox (5023)';
      if (p === 5027) marcaTexto = 'Teltonika (5027)';
      if (p === 5039) marcaTexto = 'Queclink (5039)';
      if (p === 5053) marcaTexto = 'Protrack V2 (5053)';
      if (p === 5055) marcaTexto = 'Traccar Client (5055)';
      if (p === 5065) marcaTexto = 'BOXtracker (5065)';
      if (p === 5159) marcaTexto = 'Protrack V1 (5159)';
      if (p === 5093) marcaTexto = 'Ruptela (5093)';

      const cliente = deviceUserMap[d.id] || 'Sin asignar';
      const fechaReg = d.attributes?.fechaRegistro ? new Date(d.attributes.fechaRegistro).toLocaleDateString() : 'Antiguo';
      const fechaVenc = d.expirationTime ? new Date(d.expirationTime).toLocaleDateString() : 'Ilimitado';
      const ultimaConexion = d.lastUpdate ? new Date(d.lastUpdate).toLocaleString() : 'Nunca';
      const whatsapp = d.attributes?.whatsapp || 'N/A';

      htmlTemplate += `
        <tr>
          <td>${d.name}</td>
          <td>${cliente}</td>
          <td style="mso-number-format:'\\@';">${d.uniqueId}</td>
          <td style="mso-number-format:'\\@';">${d.phone || 'N/A'}</td>
          <td style="mso-number-format:'\\@';">${whatsapp}</td>
          <td>${marcaTexto}</td>
          <td>${fechaReg}</td>
          <td>${fechaVenc}</td>
          <td>${ultimaConexion}</td>
        </tr>
      `;
    });
    htmlTemplate += `</table></body></html>`;

    const blob = new Blob([htmlTemplate], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .dev-form-row { display: flex; gap: 15px; flex-wrap: wrap; }
        .dev-form-input { flex: 1; min-width: 150px; }
        .search-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; }
        @media (max-width: 768px) {
          .dev-form-row { flex-direction: column; gap: 10px; }
          .dev-form-input { width: 100%; min-width: auto; }
          .dev-card-container { padding: 15px !important; }
          .search-input { width: 100% !important; max-width: none !important; }
          .action-buttons-group { width: 100%; justify-content: space-between; }
        }
      `}</style>

      {adminMessage.text && (
          <div style={{backgroundColor: adminMessage.type === 'success' ? '#065F46' : '#991B1B', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px'}}>
              {adminMessage.text}
          </div>
      )}
      
      <div style={{...styles.adminCard, border: editingDeviceId ? '1px solid #10B981' : '1px solid #1F2937'}} className="dev-card-container">
        <h3 style={styles.adminCardTitle}>{editingDeviceId ? 'Editar Dispositivo GPS ✏️' : 'Registro de Nuevo GPS'}</h3>
        <form onSubmit={handleSaveDevice} style={styles.form}>
          <div className="dev-form-row">
            <input type="text" placeholder="Placa / Alias" required value={deviceForm.placa} onChange={e => setDeviceForm({...deviceForm, placa: e.target.value})} style={styles.input} className="dev-form-input" />
            <input type="text" placeholder="IMEI" required value={deviceForm.imei} onChange={e => setDeviceForm({...deviceForm, imei: e.target.value})} style={styles.input} className="dev-form-input" />
            <input type="text" placeholder="Número SIM" value={deviceForm.sim} onChange={e => setDeviceForm({...deviceForm, sim: e.target.value})} style={styles.input} className="dev-form-input" />
            <input type="text" placeholder="WhatsApp Cliente" value={deviceForm.whatsapp} onChange={e => setDeviceForm({...deviceForm, whatsapp: e.target.value})} style={styles.input} className="dev-form-input" title="Número del cliente para notificarle el vencimiento (Ej: 3101234567)" />
            
            <input 
                type={deviceForm.fechaVencimiento ? 'date' : 'text'}
                placeholder="Fecha de Vencimiento"
                onFocus={(e) => e.target.type = 'date'}
                onBlur={(e) => { if (!e.target.value) e.target.type = 'text' }}
                title="Vencimiento manual (Opcional)."
                value={deviceForm.fechaVencimiento} 
                onChange={e => setDeviceForm({...deviceForm, fechaVencimiento: e.target.value})} 
                style={{...styles.input, color: deviceForm.fechaVencimiento ? 'white' : '#9CA3AF'}} 
                className="dev-form-input" 
            />
            
            <select 
                required 
                value={deviceForm.puerto} 
                onChange={e => setDeviceForm({...deviceForm, puerto: e.target.value})} 
                style={{...styles.input, color: deviceForm.puerto ? 'white' : '#9CA3AF'}}
                className="dev-form-input"
            >
                <option value="" disabled>-- Seleccionar Marca --</option>
                <option value="5001">Coban / TK103 (5001)</option>
                <option value="5004">Queclink - Alt (5004)</option>
                <option value="5011">Suntech (5011)</option>
                <option value="5013">SinoTrack / Boxtrack (5013)</option>
                <option value="5023">Concox / Jimi IoT (5023)</option>
                <option value="5027">Teltonika (5027)</option>
                <option value="5039">Queclink - Principal (5039)</option>
                <option value="5053">Protrack V2 (5053)</option>
                <option value="5055">Traccar Client (5055)</option>
                <option value="5065">BOXtracker (5065)</option>
                <option value="5159">Protrack V1 (5159)</option>
                <option value="5093">Ruptela (5093)</option>
            </select>

            {!editingDeviceId && (
              <select 
                  value={selectedUserToAssign} 
                  onChange={e => setSelectedUserToAssign(e.target.value)} 
                  style={{...styles.input, color: selectedUserToAssign ? 'white' : '#9CA3AF', border: '1px solid #3B82F6'}}
                  className="dev-form-input"
              >
                  <option value="">-- Asignar a cliente --</option>
                  {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
              </select>
            )}
          </div>
          <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
              <button type="submit" style={{...styles.btn, backgroundColor:'#10B981', flex: 1, maxWidth: '250px'}}>
                  {editingDeviceId ? 'Guardar Cambios' : 'Registrar Equipo'}
              </button>
              {editingDeviceId && (
                  <button type="button" onClick={() => {setEditingDeviceId(null); setDeviceForm({ placa: '', imei: '', sim: '', whatsapp: '', puerto: '', fechaRegistro: '', fechaVencimiento: '' })}} style={{...styles.btn, backgroundColor:'#374151', flex: 1, maxWidth: '150px'}}>Cancelar</button>
              )}
          </div>
        </form>
      </div>

      <div style={{...styles.adminCard, marginTop: '20px'}} className="dev-card-container">
        
        <div className="search-container">
          <h3 style={{...styles.adminCardTitle, borderBottom: 'none', margin: 0, padding: 0}}>
            Hardware Registrado ({sortedDevices.length})
          </h3>
          <div className="action-buttons-group" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: '100%', maxWidth: '520px' }}>
            <input 
              type="text" 
              placeholder="🔍 Buscar placa, IMEI, WhatsApp..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{...styles.input, flex: 1, minWidth: '150px'}}
              className="search-input"
            />
            
            <input type="file" accept=".csv" style={{ display: 'none' }} id="import-csv-input" onChange={handleImportCSV} />
            <button 
              onClick={() => document.getElementById('import-csv-input').click()}
              style={{...styles.btn, backgroundColor: '#3B82F6', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 15px', fontSize: '13px'}}
            >
              📥 Cargar Fechas
            </button>

            <button 
              onClick={handleDownloadExcel}
              style={{...styles.btn, backgroundColor: '#10B981', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 15px', fontSize: '13px'}}
            >
              📊 Exportar
            </button>
          </div>
        </div>

        <div style={{overflowX: 'auto', borderTop: '1px solid #1F2937', paddingTop: '10px'}}>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Placa</th>
                        <th style={styles.th}>Cliente Asignado</th>
                        <th style={styles.th}>IMEI</th>
                        <th style={styles.th}>Número SIM</th>
                        <th style={styles.th}>WhatsApp</th>
                        <th style={styles.th}>Marca</th>
                        <th style={styles.th}>Registro</th>
                        <th style={styles.th}>Vencimiento</th> 
                        <th onClick={handleSortToggle} style={{...styles.th, cursor: 'pointer', userSelect: 'none', color: sortOrder !== 'default' ? '#60A5FA' : '#9CA3AF'}}>
                          Conexión {sortOrder === 'asc' ? '⬆️' : sortOrder === 'desc' ? '⬇️' : '↕️'}
                        </th>
                        <th style={styles.th}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedDevices.length === 0 ? (
                      <tr><td colSpan="10" style={{padding: '20px', textAlign: 'center', color: '#9CA3AF'}}>No se encontraron GPS que coincidan.</td></tr>
                    ) : (
                      sortedDevices.map(d => {
                          const p = d.attributes?.puerto;
                          let marcaTexto = p ? `${p}` : 'N/A';
                          
                          if (p === 5001) marcaTexto = 'Coban';
                          if (p === 5004 || p === 5039) marcaTexto = 'Queclink';
                          if (p === 5011) marcaTexto = 'Suntech';
                          if (p === 5013) marcaTexto = 'SinoTrack';
                          if (p === 5023) marcaTexto = 'Concox';
                          if (p === 5027) marcaTexto = 'Teltonika';
                          if (p === 5053 || p === 5159) marcaTexto = 'Protrack';
                          if (p === 5055) marcaTexto = 'Traccar Client';
                          if (p === 5065) marcaTexto = 'BOXtracker';
                          if (p === 5093) marcaTexto = 'Ruptela';
                          
                          const fechaReg = d.attributes?.fechaRegistro ? new Date(d.attributes.fechaRegistro).toLocaleDateString() : 'Antiguo';
                          const isExpired = d.expirationTime && new Date(d.expirationTime) < new Date();
                          const fechaVenc = d.expirationTime ? new Date(d.expirationTime).toLocaleDateString() : 'Ilimitado';

                          let daysLeft = null;
                          let mostrarBotonProximo = false;
                          let mostrarBotonVencido = false;
                          
                          if (d.expirationTime) {
                              const diffTime = new Date(d.expirationTime).getTime() - new Date().getTime();
                              daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                              
                              if (daysLeft >= 5 && daysLeft <= 15) {
                                  mostrarBotonProximo = true;
                              } else if (daysLeft < 0) {
                                  mostrarBotonVencido = true;
                              }
                          }
                          
                          const yaMarcadoOKProximo = (d.attributes?.avisoProximoVencimientoWhatsApp === d.expirationTime) || localSent[`${d.id}-proximo`];
                          const yaMarcadoOKVencido = (d.attributes?.avisoYaVencidoWhatsApp === d.expirationTime) || localSent[`${d.id}-vencido`];

                          return (
                              <tr key={d.id} style={styles.tr}>
                                  <td style={{...styles.td, fontWeight: 'bold'}}>{d.name}</td>
                                  
                                  <td style={styles.td}>
                                    {deviceUserMap[d.id] ? (
                                      <span title={deviceUserMap[d.id]} style={{color: '#34D399', fontWeight: 'bold'}}>
                                        {deviceUserMap[d.id].length > 12 ? deviceUserMap[d.id].substring(0, 12) + '...' : deviceUserMap[d.id]}
                                      </span>
                                    ) : inlineAssignDeviceId === d.id ? (
                                      <select 
                                        autoFocus
                                        onChange={(e) => handleInlineAssign(d.id, e.target.value)}
                                        onBlur={() => setInlineAssignDeviceId(null)}
                                        style={{...styles.input, padding: '2px', fontSize: '11px', minWidth: '100px'}}
                                      >
                                        <option value="">-- Elegir --</option>
                                        {users.filter(u => !u.administrator).map(u => (
                                          <option key={u.id} value={u.id}>{u.name}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span onClick={() => setInlineAssignDeviceId(d.id)} style={{color: '#6B7280', fontSize: '11px', fontStyle: 'italic', cursor: 'pointer', borderBottom: '1px dashed #6B7280'}}>
                                        Sin asignar ✏️
                                      </span>
                                    )}
                                  </td>

                                  <td style={{...styles.td, color: '#9CA3AF'}}>{d.uniqueId}</td>
                                  <td style={styles.td}>{d.phone || 'N/A'}</td>
                                  
                                  <td style={{...styles.td, color: d.attributes?.whatsapp ? '#10B981' : '#9CA3AF'}}>
                                    {d.attributes?.whatsapp || 'N/A'}
                                  </td>

                                  <td style={styles.td}>{marcaTexto}</td>
                                  <td style={{...styles.td, color: '#60A5FA'}}>{fechaReg}</td>
                                  
                                  <td style={{...styles.td, color: isExpired ? '#EF4444' : '#10B981', fontWeight: 'bold'}}>
                                    {isExpired ? '⚠️ ' : ''}{fechaVenc}
                                  </td>
                                  
                                  <td style={styles.td}>{d.lastUpdate ? new Date(d.lastUpdate).toLocaleString() : 'Nunca'}</td>
                                  <td style={styles.td}>
                                      <button onClick={() => handleEditClick(d)} style={styles.actionBtnEdit}>✏️</button>
                                      <button onClick={() => handleDeleteDevice(d.id)} style={styles.actionBtnDelete}>🗑️</button>

                                      {/* BOTÓN 1: PRÓXIMO A VENCER (Amarillo) */}
                                      {mostrarBotonProximo && (
                                          <button 
                                              onClick={() => handleSendManualWhatsApp(d, daysLeft, fechaVenc, 'proximo')} 
                                              disabled={yaMarcadoOKProximo}
                                              style={{
                                                  background: yaMarcadoOKProximo ? '#C6EFCE' : '#F59E0B', 
                                                  border: yaMarcadoOKProximo ? '1px solid #0B8043' : 'none',
                                                  color: yaMarcadoOKProximo ? '#0B8043' : 'white', 
                                                  padding: '4px 6px',
                                                  borderRadius: '4px',
                                                  cursor: yaMarcadoOKProximo ? 'not-allowed' : 'pointer',
                                                  marginLeft: '4px',
                                                  fontSize: '10px',
                                                  fontWeight: 'bold',
                                                  whiteSpace: 'nowrap'
                                              }}
                                              title={yaMarcadoOKProximo ? "El mensaje de próximo a vencer ya fue enviado." : `Faltan ${daysLeft} días. Clic para avisar.`}
                                          >
                                              {yaMarcadoOKProximo ? '✅ OK' : '📲 Notificar Próximo'}
                                          </button>
                                      )}

                                      {/* BOTÓN 2: YA VENCIDO (Rojo) */}
                                      {mostrarBotonVencido && (
                                          <button 
                                              onClick={() => handleSendManualWhatsApp(d, daysLeft, fechaVenc, 'vencido')} 
                                              disabled={yaMarcadoOKVencido}
                                              style={{
                                                  background: yaMarcadoOKVencido ? '#C6EFCE' : '#EF4444', 
                                                  border: yaMarcadoOKVencido ? '1px solid #0B8043' : 'none',
                                                  color: yaMarcadoOKVencido ? '#0B8043' : 'white', 
                                                  padding: '4px 6px',
                                                  borderRadius: '4px',
                                                  cursor: yaMarcadoOKVencido ? 'not-allowed' : 'pointer',
                                                  marginLeft: '4px',
                                                  fontSize: '10px',
                                                  fontWeight: 'bold',
                                                  whiteSpace: 'nowrap'
                                              }}
                                              title={yaMarcadoOKVencido ? "El mensaje de vencimiento ya fue enviado." : `Vencido hace ${Math.abs(daysLeft)} días. Clic para avisar.`}
                                          >
                                              {yaMarcadoOKVencido ? '✅ OK' : '🚨 Vencido - Avisar'}
                                          </button>
                                      )}
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
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '10px', color: 'white', fontSize: '13px', outline: 'none' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white' }, 
  th: { padding: '8px 5px', backgroundColor: '#1F2937', borderBottom: '2px solid #374151', fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap' }, 
  tr: { borderBottom: '1px solid #1F2937' },
  td: { padding: '8px 5px', fontSize: '12px', whiteSpace: 'nowrap' }, 
  
  actionBtnEdit: { background: 'transparent', border: '1px solid #3B82F6', color: '#3B82F6', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', marginRight: '4px', fontSize: '11px' },
  actionBtnDelete: { background: 'transparent', border: '1px solid #EF4444', color: '#EF4444', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }
};