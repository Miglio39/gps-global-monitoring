import React, { useState, useEffect } from 'react';

export default function Maintenance({ devices, token }) {
  // Estado para la lista de mantenimientos (Simulado inicialmente para diseño, listo para conectar a API)
  const [maintenances, setMaintenances] = useState([
    { id: 1, deviceId: devices[0]?.id || 1, type: 'Cambio de Aceite', metric: 'Kilometraje', limit: '10000', status: 'overdue', date: '2026-07-28' },
    { id: 2, deviceId: devices[1]?.id || 2, type: 'Renovación SOAT', metric: 'Fecha', limit: '2026-08-15', status: 'pending', date: '2026-08-15' }
  ]);

  const [formData, setFormData] = useState({ deviceId: '', type: 'Cambio de Aceite', metric: 'Kilometraje', limit: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // KPIs
  const overdueCount = maintenances.filter(m => m.status === 'overdue').length;
  const pendingCount = maintenances.filter(m => m.status === 'pending').length;
  const completedCount = maintenances.filter(m => m.status === 'completed').length;

  const handleSave = (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Aquí iría el fetch a tu base de datos o API de Traccar (/api/maintenance)
    setTimeout(() => {
      const newMaintenance = {
        id: Date.now(),
        ...formData,
        status: 'pending',
        date: new Date().toISOString().split('T')[0]
      };
      setMaintenances([newMaintenance, ...maintenances]);
      setFormData({ deviceId: '', type: 'Cambio de Aceite', metric: 'Kilometraje', limit: '' });
      setIsSaving(false);
    }, 500);
  };

  const handleComplete = (id) => {
    if(!window.confirm("¿Marcar este mantenimiento como completado?")) return;
    setMaintenances(maintenances.map(m => m.id === id ? { ...m, status: 'completed' } : m));
  };

  const handleDelete = (id) => {
    if(!window.confirm("¿Eliminar este registro de mantenimiento?")) return;
    setMaintenances(maintenances.filter(m => m.id !== id));
  };

  const getDeviceName = (id) => devices.find(d => String(d.id) === String(id))?.name || 'Desconocido';

  const filteredMaintenances = maintenances.filter(m => 
    getDeviceName(m.deviceId).toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main style={{flex: 1, padding: '20px 30px', overflowY: 'auto', backgroundColor: '#0B1120'}}>
      <style>{`
        .maint-layout { display: flex; gap: 20px; align-items: flex-start; }
        .maint-form-panel { flex: 1; min-width: 300px; max-width: 400px; }
        .maint-list-panel { flex: 2; min-width: 0; }
        
        .kpi-container { display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap; }
        .kpi-card { flex: 1; min-width: 150px; background-color: #111827; border: 1px solid #1F2937; border-radius: 12px; padding: 15px; display: flex; align-items: center; gap: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        .kpi-icon { width: 45px; height: 45px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 20px; }
        
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; display: inline-block; }
        .badge-overdue { background-color: rgba(239, 68, 68, 0.15); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.3); }
        .badge-pending { background-color: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3); }
        .badge-completed { background-color: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3); }

        @media (max-width: 768px) {
          .maint-layout { flex-direction: column; }
          .maint-form-panel, .maint-list-panel { width: 100%; max-width: 100%; }
          .kpi-card { min-width: 100%; }
          main { padding: 15px 10px !important; }
        }
      `}</style>

      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Gestión de Mantenimientos 🛠️</h2>

      {/* TARJETAS KPI */}
      <div className="kpi-container">
        <div className="kpi-card">
          <div className="kpi-icon" style={{backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444'}}>🚨</div>
          <div>
            <div style={{color: '#9CA3AF', fontSize: '12px', fontWeight: 'bold'}}>VENCIDOS</div>
            <div style={{color: 'white', fontSize: '24px', fontWeight: '900'}}>{overdueCount}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B'}}>⚠️</div>
          <div>
            <div style={{color: '#9CA3AF', fontSize: '12px', fontWeight: 'bold'}}>PROGRAMADOS</div>
            <div style={{color: 'white', fontSize: '24px', fontWeight: '900'}}>{pendingCount}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981'}}>✅</div>
          <div>
            <div style={{color: '#9CA3AF', fontSize: '12px', fontWeight: 'bold'}}>COMPLETADOS</div>
            <div style={{color: 'white', fontSize: '24px', fontWeight: '900'}}>{completedCount}</div>
          </div>
        </div>
      </div>

      <div className="maint-layout">
        
        {/* PANEL IZQUIERDO: FORMULARIO */}
        <div className="maint-form-panel" style={styles.adminCard}>
          <h3 style={styles.cardTitle}>Programar Servicio</h3>
          <form onSubmit={handleSave} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
            
            <div>
              <label style={styles.label}>Vehículo</label>
              <select required value={formData.deviceId} onChange={e => setFormData({...formData, deviceId: e.target.value})} style={styles.input}>
                <option value="" disabled>-- Seleccionar Vehículo --</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div>
              <label style={styles.label}>Tipo de Servicio</label>
              <select required value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} style={styles.input}>
                <option value="Cambio de Aceite">🛢️ Cambio de Aceite</option>
                <option value="Frenos y Balatas">⚙️ Frenos y Balatas</option>
                <option value="Rotación de Llantas">🛞 Rotación de Llantas</option>
                <option value="Renovación SOAT">📄 Renovación Seguro / SOAT</option>
                <option value="Revisión Tecnomecánica">🔧 Revisión Tecnomecánica</option>
                <option value="Mantenimiento General">🛠️ Mantenimiento General</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>Basado en (Métrica)</label>
              <select required value={formData.metric} onChange={e => setFormData({...formData, metric: e.target.value})} style={styles.input}>
                <option value="Kilometraje">📏 Kilometraje (Km)</option>
                <option value="Fecha">📅 Fecha Límite</option>
                <option value="Horas de Motor">⏱️ Horas de Motor</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>
                {formData.metric === 'Fecha' ? 'Fecha de Vencimiento' : `Valor Límite (${formData.metric})`}
              </label>
              <input 
                required 
                type={formData.metric === 'Fecha' ? 'date' : 'number'} 
                value={formData.limit} 
                onChange={e => setFormData({...formData, limit: e.target.value})} 
                style={styles.input} 
                placeholder={formData.metric === 'Kilometraje' ? 'Ej. 50000' : ''}
              />
            </div>

            <button type="submit" disabled={isSaving || !formData.deviceId} style={{...styles.btn, backgroundColor: '#2563EB', marginTop: '10px'}}>
              {isSaving ? 'Guardando...' : '➕ Programar Mantenimiento'}
            </button>
          </form>
        </div>

        {/* PANEL DERECHO: LISTA / TABLA */}
        <div className="maint-list-panel" style={styles.adminCard}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px'}}>
            <h3 style={{...styles.cardTitle, borderBottom: 'none', margin: 0, padding: 0}}>Historial e Inventario</h3>
            <input 
              type="text" 
              placeholder="🔍 Buscar placa o servicio..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{...styles.input, width: '100%', maxWidth: '250px'}}
            />
          </div>

          <div style={{overflowX: 'auto'}}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Vehículo</th>
                  <th style={styles.th}>Servicio</th>
                  <th style={styles.th}>Alerta Base</th>
                  <th style={styles.th}>Límite</th>
                  <th style={styles.th}>Estado</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaintenances.length === 0 ? (
                  <tr><td colSpan="6" style={{padding: '20px', textAlign: 'center', color: '#6B7280'}}>No hay mantenimientos registrados.</td></tr>
                ) : (
                  filteredMaintenances.map(m => (
                    <tr key={m.id} style={styles.tr}>
                      <td style={{...styles.td, fontWeight: 'bold', color: 'white'}}>{getDeviceName(m.deviceId)}</td>
                      <td style={styles.td}>{m.type}</td>
                      <td style={styles.td}>{m.metric}</td>
                      <td style={{...styles.td, color: '#60A5FA', fontWeight: 'bold'}}>
                        {m.metric === 'Kilometraje' ? `${m.limit} km` : m.metric === 'Horas de Motor' ? `${m.limit} hrs` : m.limit}
                      </td>
                      <td style={styles.td}>
                        <span className={`badge badge-${m.status}`}>
                          {m.status === 'overdue' ? 'VENCIDO' : m.status === 'pending' ? 'PENDIENTE' : 'COMPLETADO'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {m.status !== 'completed' && (
                          <button onClick={() => handleComplete(m.id)} title="Marcar Realizado" style={styles.actionBtnSuccess}>✔️</button>
                        )}
                        <button onClick={() => handleDelete(m.id)} title="Eliminar Registro" style={styles.actionBtnDelete}>🗑️</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  );
}

const styles = {
  adminCard: { backgroundColor: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1F2937' },
  cardTitle: { color: 'white', fontSize: '15px', margin: '0 0 20px 0', borderBottom: '1px solid #1F2937', paddingBottom: '10px' },
  label: { color:'#9CA3AF', fontSize:'12px', fontWeight: 'bold', display: 'block', marginBottom: '6px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #374151', borderRadius: '6px', padding: '10px', color: 'white', width: '100%', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' },
  btn: { color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'transform 0.1s' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' },
  th: { padding: '12px', backgroundColor: '#1F2937', borderBottom: '2px solid #374151', fontSize: '12px', color: '#9CA3AF', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #1F2937', transition: 'background-color 0.2s' },
  td: { padding: '12px', fontSize: '13px', color: '#D1D5DB' },
  actionBtnSuccess: { background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10B981', color: '#10B981', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', marginRight: '5px' },
  actionBtnDelete: { background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #EF4444', color: '#EF4444', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' }
};