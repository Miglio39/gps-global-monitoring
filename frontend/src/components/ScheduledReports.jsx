import React, { useState } from 'react';

export default function ScheduledReports({ devices }) {
  // 1. Estado inicial del formulario
  const [config, setConfig] = useState({
    deviceId: '',
    reportType: 'daily',
    frequency: 'daily',
    time: '08:00',
    email: '',
    whatsapp: ''
  });

  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [isSaving, setIsSaving] = useState(false);

  // 2. Manejador del envío del formulario
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    
    // Validación de destinos: Al menos uno debe estar presente
    if (!config.email && !config.whatsapp) {
      setStatusMsg({ text: '⚠️ Debes ingresar al menos un Correo o un número de WhatsApp.', type: 'error' });
      return;
    }

    setIsSaving(true);
    setStatusMsg({ text: '⏳ Guardando programación...', type: 'info' });

    try {
      // 3. Webhook Ready: Aquí enviaremos los datos a n8n
      // Debes reemplazar esta URL con la que te genere n8n en el nodo "Webhook"
      const WEBHOOK_URL = 'https://plataforma-testeo-n8n.ykqavz.easypanel.host/webhook-test/0fe1e607-dff6-49e2-a834-7b70fd6b6017    '; 
      
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        setStatusMsg({ text: '✅ ¡Reporte programado exitosamente!', type: 'success' });
        // Opcional: Limpiar el formulario después de guardar
        // setConfig({ deviceId: '', reportType: 'daily', frequency: 'daily', time: '08:00', email: '', whatsapp: '' });
      } else {
        setStatusMsg({ text: '❌ Error al comunicar con el servidor.', type: 'error' });
      }
    } catch (error) {
      console.error(error);
      setStatusMsg({ text: '❌ Error de conexión.', type: 'error' });
    }
    
    setIsSaving(false);
    
    // Ocultar mensaje después de unos segundos
    setTimeout(() => setStatusMsg({ text: '', type: '' }), 4000);
  };

  // 4. Renderizado de la Interfaz
  return (
    <div style={styles.adminCard}>
      <h3 style={styles.tableTitle}>⏰ Programar Envío Automático de Reportes</h3>
      <p style={{color: '#9CA3AF', fontSize: '13px', marginBottom: '20px'}}>
        Configura reportes para que se generen y envíen automáticamente sin necesidad de ingresar a la plataforma.
      </p>

      <form onSubmit={handleSaveSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        
        {/* FILA 1: Vehículo y Tipo de Informe */}
        <div className="dev-form-row" style={styles.row}>
          <div className="dev-form-input" style={styles.inputGroup}>
            <label style={styles.label}>Vehículo o Flota:</label>
            <select 
              required 
              value={config.deviceId} 
              onChange={e => setConfig({...config, deviceId: e.target.value})} 
              style={styles.input}
            >
              <option value="">-- Seleccionar --</option>
              <option value="all" style={{fontWeight: 'bold', color: '#3B82F6'}}>Toda la Flota Consolidada</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className="dev-form-input" style={styles.inputGroup}>
            <label style={styles.label}>Tipo de Informe:</label>
            <select 
              value={config.reportType} 
              onChange={e => setConfig({...config, reportType: e.target.value})} 
              style={styles.input}
            >
              <option value="daily">Resumen Diario (Kilometraje)</option>
              <option value="route">Detallado Punto a Punto</option>
              <option value="speed">Infracciones y Velocidad</option>
              <option value="ecopetrol">Formato Ecopetrol</option>
            </select>
          </div>
        </div>

        {/* FILA 2: Frecuencia y Hora */}
        <div className="dev-form-row" style={styles.row}>
          <div className="dev-form-input" style={styles.inputGroup}>
            <label style={styles.label}>Frecuencia de Envío:</label>
            <select 
              value={config.frequency} 
              onChange={e => setConfig({...config, frequency: e.target.value})} 
              style={styles.input}
            >
              <option value="daily">Todos los días (Resumen del día anterior)</option>
              <option value="weekly">Semanal (Cada Lunes)</option>
              <option value="15_days">Quincenal (Cada 15 días)</option>
              <option value="monthly">Mensual (Día 1 de cada mes)</option>
            </select>
          </div>

          <div className="dev-form-input" style={styles.inputGroup}>
            <label style={styles.label}>Hora de Envío (Formato 24h):</label>
            <input 
              type="time" 
              required 
              value={config.time} 
              onChange={e => setConfig({...config, time: e.target.value})} 
              style={{...styles.input, colorScheme: 'dark'}} 
            />
          </div>
        </div>

        {/* FILA 3: Destinos */}
        <div className="dev-form-row" style={styles.row}>
           <div className="dev-form-input" style={styles.inputGroup}>
            <label style={styles.label}>Enviar por Correo:</label>
            <input 
              type="email" 
              placeholder="ejemplo@empresa.com" 
              value={config.email} 
              onChange={e => setConfig({...config, email: e.target.value})} 
              style={styles.input} 
            />
          </div>

          <div className="dev-form-input" style={styles.inputGroup}>
            <label style={styles.label}>Enviar por WhatsApp:</label>
            <input 
              type="tel" 
              placeholder="+573001234567" 
              value={config.whatsapp} 
              onChange={e => setConfig({...config, whatsapp: e.target.value})} 
              style={styles.input} 
            />
          </div>
        </div>

        {/* Botón Guardar y Mensajes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '10px' }}>
          <button 
            type="submit" 
            disabled={isSaving || (!config.email && !config.whatsapp)} 
            style={{
              ...styles.btn, 
              backgroundColor: (!config.email && !config.whatsapp) ? '#4B5563' : '#10B981',
              cursor: (!config.email && !config.whatsapp) ? 'not-allowed' : 'pointer'
            }}
          >
            {isSaving ? 'Guardando...' : '💾 Guardar Programación'}
          </button>
          
          {statusMsg.text && (
            <span style={{ 
              color: statusMsg.type === 'error' ? '#EF4444' : statusMsg.type === 'success' ? '#10B981' : '#60A5FA', 
              fontSize: '14px', 
              fontWeight: 'bold' 
            }}>
              {statusMsg.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

// 5. Estilos Consistentes
const styles = {
  adminCard: { backgroundColor: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1F2937', marginBottom: '20px' },
  tableTitle: { margin: '0 0 10px 0', color: 'white', fontSize: '16px', borderBottom: '1px solid #1F2937', paddingBottom: '10px' },
  label: { color:'#9CA3AF', fontSize:'13px', fontWeight: 'bold', display: 'block', marginBottom: '5px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '10px', color: 'white', width: '100%', outline: 'none', boxSizing: 'border-box' },
  btn: { color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', whiteSpace: 'nowrap' },
  row: { display: 'flex', gap: '15px', flexWrap: 'wrap' },
  inputGroup: { flex: 1, minWidth: '200px' }
};