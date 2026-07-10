import React, { useState, useEffect } from 'react';

export default function ShareLocation({ token, devices }) {
  const [sharedLinks, setSharedLinks] = useState([]);
  const [form, setForm] = useState({ deviceId: '', duration: '1h' });
  const [isLoading, setIsLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState({ text: '', type: '' });
  const [generatedUrl, setGeneratedUrl] = useState('');

  const APP_URL = 'https://app.labtesting.online'; // <-- Ajusta a tu dominio frontend
  const BASE_URL = 'https://api.labtesting.online';

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

  const handleGenerateLink = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setAdminMessage({ text: '', type: '' });
    setGeneratedUrl('');

    const selectedDevice = devices?.find(d => d.id === parseInt(form.deviceId));
    if (!selectedDevice) return;

    const randomPassword = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const tempEmail = `share_${Date.now()}@temp.com`;
    const expirationTime = calculateExpiration(form.duration);

    const userPayload = {
      name: `🔗 Link: ${selectedDevice.name}`,
      email: tempEmail,
      password: randomPassword,
      readonly: true,
      expirationTime: expirationTime,
      attributes: { 
        isShareLink: true, 
        deviceId: selectedDevice.id,
        deviceName: selectedDevice.name
      }
    };

    try {
      const userRes = await fetch(`${BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(userPayload)
      });

      if (!userRes.ok) throw new Error("Error creando enlace");
      const newUser = await userRes.json();

      const permRes = await fetch(`${BASE_URL}/api/permissions`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: newUser.id, deviceId: selectedDevice.id })
      });

      if (!permRes.ok) throw new Error("Error asignando permisos");

      const secretToken = btoa(`${tempEmail}:${randomPassword}`);
      const link = `${APP_URL}/track/${secretToken}`;
      
      setGeneratedUrl(link);
      setAdminMessage({ text: '✅ Enlace generado exitosamente.', type: 'success' });
      fetchSharedLinks();

    } catch (error) {
      console.error(error);
      setAdminMessage({ text: '❌ Hubo un error al generar el enlace.', type: 'error' });
    }
    setIsLoading(false);
  };

  const handleRevokeLink = async (userId) => {
    if (!window.confirm("🚨 ¿Deseas revocar este enlace? El tercero perderá el acceso inmediatamente.")) return;
    
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
        .share-main-container { padding: 20px 30px; overflow-y: auto; flex: 1; }
        .share-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 20px; }
        
        @media (max-width: 768px) {
          .share-main-container { padding: 15px 10px; }
          .share-grid { grid-template-columns: 1fr; }
          .share-card { padding: 15px !important; }
        }
      `}</style>

      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Compartir Ubicación</h2>

      {adminMessage.text && (
        <div style={{ backgroundColor: adminMessage.type === 'success' ? '#065F46' : '#991B1B', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          {adminMessage.text}
        </div>
      )}

      <div className="share-grid">
        
        {/* PANEL IZQUIERDO */}
        <div style={styles.adminCard} className="share-card">
          <h3 style={styles.adminCardTitle}>🌐 Nuevo Enlace</h3>
          <p style={{ color: '#9CA3AF', fontSize: '12px', marginBottom: '15px' }}>
            Genera un link seguro que caduca automáticamente. Ideal para clientes o terceros.
          </p>

          <form onSubmit={handleGenerateLink} style={styles.form}>
            <div>
              <label style={styles.label}>Vehículo a compartir:</label>
              <select required value={form.deviceId} onChange={e => setForm({...form, deviceId: e.target.value})} style={styles.input}>
                <option value="">-- Seleccionar GPS --</option>
                {devices?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
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
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px dashed #10B981', borderRadius: '8px' }}>
              <label style={{ ...styles.label, color: '#10B981' }}>Enlace listo para enviar:</label>
              <input type="text" readOnly value={generatedUrl} style={{ ...styles.input, backgroundColor: '#0B1120', color: '#10B981', marginBottom: '10px' }} />
              <button onClick={() => copyToClipboard(generatedUrl)} style={{ ...styles.btn, width: '100%' }}>
                📋 Copiar Enlace
              </button>
            </div>
          )}
        </div>

        {/* PANEL DERECHO */}
        <div style={styles.adminCard} className="share-card">
          <h3 style={styles.adminCardTitle}>📡 Enlaces Activos ({sharedLinks.length})</h3>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Vehículo</th>
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
                        <td style={styles.td}>
                          <strong style={{ color: '#60A5FA' }}>{link.attributes?.deviceName || 'GPS'}</strong>
                        </td>
                        <td style={styles.td}>
                          {new Date(link.expirationTime).toLocaleString()}<br/>
                          {isExpired ? (
                            <span style={{ color: '#EF4444', fontSize: '11px', fontWeight: 'bold' }}>VENCIDO</span>
                          ) : (
                            <span style={{ color: '#10B981', fontSize: '11px', fontWeight: 'bold' }}>ACTIVO</span>
                          )}
                        </td>
                        <td style={styles.td}>
                          <button 
                            onClick={() => {
                              const creds = btoa(`${link.email}:${link.attributes?.token}`);
                              copyToClipboard(`${APP_URL}/track/${creds}`);
                            }} 
                            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#F3F4F6', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                          >
                            📋 Copiar Link
                          </button>
                        </td>
                        <td style={styles.td}>
                          <button 
                            onClick={() => handleRevokeLink(link.id)} 
                            style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #EF4444', color: '#EF4444', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
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
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white', minWidth: '450px' },
  th: { padding: '12px', backgroundColor: '#1F2937', borderBottom: '2px solid #374151', fontSize: '12px', color: '#9CA3AF', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #1F2937' },
  td: { padding: '12px', fontSize: '13px', verticalAlign: 'middle' }
};