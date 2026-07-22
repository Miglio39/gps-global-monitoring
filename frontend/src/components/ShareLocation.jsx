import React, { useState, useEffect } from 'react';

export default function ShareLocation({ token, devices }) {
  const [sharedLinks, setSharedLinks] = useState([]);
  const [form, setForm] = useState({ deviceIds: [], duration: '1h' });
  const [isLoading, setIsLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState({ text: '', type: '' });
  const [generatedUrl, setGeneratedUrl] = useState('');

  const APP_URL = 'https://app.globalmonitorgps.com'; 
  const BASE_URL = 'https://api.globalmonitorgps.com';

  useEffect(() => {
    fetchSharedLinks();
    // eslint-disable-next-line
  }, [token]);

  const fetchSharedLinks = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/users`, { headers: { 'Authorization': `Basic ${token}` } });
      if (res.ok) {
        const users = await res.json();
        const links = users.filter(u => u.attributes && u.attributes.isShareLink);
        setSharedLinks(links);
      }
    } catch (err) {
      console.error("Error cargando enlaces:", err);
    }
  };

  const calculateExpiration = (duration) => {
    const now = new Date();
    switch (duration) {
      case '1h': now.setHours(now.getHours() + 1); break;
      case '12h': now.setHours(now.getHours() + 12); break;
      case '1d': now.setDate(now.getDate() + 1); break;
      case '1w': now.setDate(now.getDate() + 7); break;
      case '1m': now.setMonth(now.getMonth() + 1); break;
      default: now.setHours(now.getHours() + 1);
    }
    return now.toISOString();
  };

  const handleCheckboxChange = (deviceId) => {
    setForm(prev => {
      if (prev.deviceIds.includes(deviceId)) {
        return { ...prev, deviceIds: prev.deviceIds.filter(id => id !== deviceId) };
      } else {
        return { ...prev, deviceIds: [...prev.deviceIds, deviceId] };
      }
    });
  };

  const handleGenerateLink = async (e) => {
    e.preventDefault();
    
    if (form.deviceIds.length === 0) {
      setAdminMessage({ text: '⚠️ Debes seleccionar al menos un vehículo.', type: 'error' });
      return;
    }

    setIsLoading(true);
    setAdminMessage({ text: '', type: '' });
    setGeneratedUrl('');

    const selectedDevices = devices?.filter(d => form.deviceIds.includes(d.id)) || [];
    const deviceNames = selectedDevices.map(d => d.name).join(', ');

    const randomPassword = Math.random().toString(36).substring(2, 12);
    const tempEmail = `share_${Date.now()}@temp.com`;
    const expirationTime = calculateExpiration(form.duration);

    const linkTitle = form.deviceIds.length === 1 ? `🔗 Link: ${deviceNames}` : `🔗 Link: Flota (${form.deviceIds.length} Vehículos)`;
    
    // TRUCO MAESTRO: Guardamos las credenciales crudas directamente en los atributos
    // porque Traccar jamás nos devolverá el campo link.password en los GET generales.
    const secretToken = btoa(`${tempEmail}:${randomPassword}`);

    const userPayload = {
      name: linkTitle,
      email: tempEmail,
      password: randomPassword,
      readonly: true,
      expirationTime: expirationTime,
      attributes: { 
        isShareLink: true, 
        deviceIds: form.deviceIds,
        deviceName: deviceNames,
        savedToken: secretToken // <-- Almacenado de forma segura y permanente
      }
    };

    try {
      const userRes = await fetch(`${BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(userPayload)
      });

      if (!userRes.ok) throw new Error("Error creando enlace temporal");
      const newUser = await userRes.json();

      const permPromises = form.deviceIds.map(deviceId => 
        fetch(`${BASE_URL}/api/permissions`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: newUser.id, deviceId: deviceId })
        })
      );

      const permResults = await Promise.all(permPromises);
      const allOk = permResults.every(res => res.ok);

      if (!allOk) throw new Error("Error asignando permisos a los vehículos");

      const link = `${APP_URL}/track/${secretToken}`;
      
      setGeneratedUrl(link);
      setAdminMessage({ text: '✅ Enlace múltiple generado exitosamente.', type: 'success' });
      fetchSharedLinks();
      setForm({ ...form, deviceIds: [] });

    } catch (error) {
      console.error(error);
      setAdminMessage({ text: '❌ Hubo un error al generar el enlace.', type: 'error' });
    }
    setIsLoading(false);
  };

  const handleRevokeLink = async (userId) => {
    if (!window.confirm("🚨 ¿Deseas revocar este enlace? El cliente o tercero perderá el acceso inmediatamente.")) return;
    try {
      const res = await fetch(`${BASE_URL}/api/users/${userId}`, { 
        method: 'DELETE', 
        headers: { 'Authorization': `Basic ${token}` } 
      });
      if (res.ok) {
        setAdminMessage({ text: 'Enlace revocado correctamente.', type: 'success' });
        fetchSharedLinks();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url);
    alert("¡Enlace copiado al portapapeles!");
  };

  return (
    <div className="share-main-container">
      <style>{`
        .share-main-container { padding: 20px 30px; overflow-y: auto; flex: 1; width: 100%; box-sizing: border-box; }
        .share-flex { display: flex; gap: 20px; align-items: flex-start; }
        .share-card-left { flex: 1; min-width: 280px; }
        .share-card-right { flex: 2; min-width: 0; }
        .table-responsive-wrapper { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .checkbox-list::-webkit-scrollbar { width: 6px; }
        .checkbox-list::-webkit-scrollbar-track { background: #111827; border-radius: 4px; }
        .checkbox-list::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        @media (max-width: 768px) {
          .share-main-container { padding: 15px 15px 90px 15px; }
          .share-flex { flex-direction: column; }
          .share-card-left, .share-card-right { width: 100%; flex: none; }
          .share-card-right { padding: 15px !important; }
        }
      `}</style>

      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Compartir Ubicación</h2>

      {adminMessage.text && (
        <div style={{ backgroundColor: adminMessage.type === 'success' ? '#065F46' : '#991B1B', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          {adminMessage.text}
        </div>
      )}

      <div className="share-flex">
        <div style={styles.adminCard} className="share-card-left">
          <h3 style={styles.adminCardTitle}>🌐 Nuevo Enlace</h3>
          <form onSubmit={handleGenerateLink} style={styles.form}>
            <div>
              <label style={styles.label}>Vehículo(s) a compartir:</label>
              <div className="checkbox-list" style={{ maxHeight: '180px', overflowY: 'auto', backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '10px' }}>
                {devices?.map(d => (
                  <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'white', marginBottom: '10px', cursor: 'pointer', fontSize: '14px' }}>
                    <input 
                      type="checkbox" 
                      checked={form.deviceIds.includes(d.id)}
                      onChange={() => handleCheckboxChange(d.id)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#10B981' }}
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={styles.label}>Tiempo de validez:</label>
              <select value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} style={styles.input}>
                <option value="1h">⏱️ 1 Hora</option>
                <option value="12h">⏱️ 12 Horas</option>
                <option value="1d">📅 24 Horas (1 Día)</option>
                <option value="1w">📅 7 Días (1 Semana)</option>
                <option value="1m">📆 30 Días (1 Mes)</option>
              </select>
            </div>

            <button type="submit" disabled={isLoading} style={{ ...styles.btn, backgroundColor: '#10B981', marginTop: '10px' }}>
              {isLoading ? 'Generando...' : '🔗 Generar Enlace'}
            </button>
          </form>

          {generatedUrl && (
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px dashed #10B981', borderRadius: '8px', wordBreak: 'break-all' }}>
              <label style={{ ...styles.label, color: '#10B981' }}>Enlace listo para enviar:</label>
              <input type="text" readOnly value={generatedUrl} style={{ ...styles.input, backgroundColor: '#0B1120', color: '#10B981', marginBottom: '10px' }} />
              <button onClick={() => copyToClipboard(generatedUrl)} style={{ ...styles.btn, width: '100%' }}>
                📋 Copiar Enlace
              </button>
            </div>
          )}
        </div>

        <div style={styles.adminCard} className="share-card-right">
          <h3 style={styles.adminCardTitle}>📡 Enlaces Activos ({sharedLinks.length})</h3>
          <div className="table-responsive-wrapper">
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Vehículos Incluidos</th>
                  <th style={styles.th}>Caduca en</th>
                  <th style={styles.th}>Enlace</th>
                  <th style={styles.th}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sharedLinks.length === 0 ? (
                  <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>No hay enlaces activos.</td></tr>
                ) : (
                  sharedLinks.map(link => {
                    const isExpired = new Date(link.expirationTime) < new Date();
                    return (
                      <tr key={link.id} style={{ ...styles.tr, opacity: isExpired ? 0.5 : 1 }}>
                        <td style={{...styles.td, maxWidth: '200px', whiteSpace: 'normal'}}>
                          <strong style={{ color: '#60A5FA' }}>{link.attributes?.deviceName || 'Vehículos'}</strong>
                        </td>
                        <td style={styles.td}>
                          {new Date(link.expirationTime).toLocaleString()}
                        </td>
                        <td style={styles.td}>
                          <button 
                            onClick={() => {
                              // ENLACE CORREGIDO: Extrae el token guardado idéntico al de arriba
                              const activeToken = link.attributes?.savedToken || '';
                              copyToClipboard(`${APP_URL}/track/${activeToken}`);
                            }} 
                            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#F3F4F6', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap' }}
                          >
                            📋 Copiar Link
                          </button>
                        </td>
                        <td style={styles.td}>
                          <button onClick={() => handleRevokeLink(link.id)} style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #EF4444', color: '#EF4444', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                            Revocar ✕
                          </button>
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
    </div>
  );
}

const styles = {
  adminCard: { backgroundColor: '#111827', padding: '25px', borderRadius: '12px', border: '1px solid #1F2937' },
  adminCardTitle: { color: 'white', fontSize: '16px', margin: '0 0 15px 0', borderBottom: '1px solid #1F2937', paddingBottom: '10px' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  label: { color: '#9CA3AF', fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '5px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '12px', color: 'white', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', width: '100%', boxSizing: 'border-box' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white', minWidth: '450px' },
  th: { padding: '12px', backgroundColor: '#1F2937', borderBottom: '2px solid #374151', fontSize: '12px', color: '#9CA3AF', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #1F2937' },
  td: { padding: '12px', fontSize: '13px', verticalAlign: 'middle', whiteSpace: 'nowrap' }
};