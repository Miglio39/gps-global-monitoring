import React, { useState } from 'react';

export default function Reports({ devices, token }) {
  const [reportConfig, setReportConfig] = useState({ deviceId: '', from: '', to: '' });
  const [quickRange, setQuickRange] = useState('custom');
  const [reportType, setReportType] = useState('daily');
  const [routeData, setRouteData] = useState([]);
  const [summaryData, setSummaryData] = useState([]); // Ahora es un array para soportar múltiples días
  const [isFetching, setIsFetching] = useState(false);
  

  // Selector dinámico de rangos de fecha
  const handleRangeChange = (rangeValue) => {
    setQuickRange(rangeValue);
    if (rangeValue === 'custom') return;

    const now = new Date(); 
    const start = new Date(now); 
    const end = new Date(now);

    if (rangeValue === 'today') { 
      start.setHours(0, 0, 0, 0); 
      end.setHours(23, 59, 59, 999);
    } 
    else if (rangeValue === 'yesterday') { 
      start.setDate(start.getDate() - 1); 
      start.setHours(0, 0, 0, 0); 
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999); 
    } 
    else if (rangeValue === 'thisWeek') { 
      const currentDay = now.getDay() === 0 ? 7 : now.getDay();
      start.setDate(now.getDate() - currentDay + 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } 
    else if (rangeValue === 'thisMonth') { 
      start.setDate(1); 
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999); 
    } 
    else if (rangeValue === 'lastMonth') { 
      start.setMonth(now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
    }

    const format = (d) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}T${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    setReportConfig({ ...reportConfig, from: format(start), to: format(end) });
  };

  // Motor de conversión: Milisegundos a formato Horas y Minutos legibles
  const formatEngineHours = (ms) => {
    if (!ms) return '0h 0m';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const handleFetchData = async (e) => {
    e.preventDefault();
    setIsFetching(true);
    setRouteData([]); 
    setSummaryData([]);
    
    try {
      const endpoint = reportType === 'daily' ? 'summary' : 'route';
      // Inyección del parámetro '&daily=true' si el usuario pide el informe diario
      const dailyParam = reportType === 'daily' ? '&daily=true' : '';
      const url = `/api/reports/${endpoint}?deviceId=${reportConfig.deviceId}&from=${new Date(reportConfig.from).toISOString()}&to=${new Date(reportConfig.to).toISOString()}${dailyParam}`;
      
      const response = await fetch(url, { headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' } });
      if(response.ok) {
        const data = await response.json();
        if (endpoint === 'summary') {
            setSummaryData(data); // Ahora guardamos la lista completa de días
        } else {
            setRouteData(data);
        }
      }
    } catch (err) { 
        console.error(err); 
    }
    setIsFetching(false);
  };

  const handleDownloadExcel = async () => {
    const endpoint = reportType === 'daily' ? 'summary' : 'route';
    const dailyParam = reportType === 'daily' ? '&daily=true' : '';
    const url = `/api/reports/${endpoint}?deviceId=${reportConfig.deviceId}&from=${new Date(reportConfig.from).toISOString()}&to=${new Date(reportConfig.to).toISOString()}${dailyParam}`;
    
    // Descarga nativa en Excel generada por Traccar
    const response = await fetch(url, { headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    if(response.ok) {
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = `Informe_${reportType}_${new Date().getTime()}.xlsx`;
      a.click();
    }
  };

  return (
    <main style={{flex: 1, padding: '20px 30px', overflowY: 'auto'}}>
      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Módulo de Informes Analíticos</h2>
      
      <div style={styles.adminCard}>
        <form onSubmit={handleFetchData} style={{display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end'}}>
          
          <div style={{flex: 1}}>
            <label style={styles.label}>Vehículo:</label>
            <select required value={reportConfig.deviceId} onChange={e => setReportConfig({...reportConfig, deviceId: e.target.value})} style={styles.input}>
                <option value="">-- Seleccionar --</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
         
          <div style={{flex: 1}}>
            <label style={styles.label}>Tipo de Informe:</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)} style={styles.input}>
                <option value="daily">Resumen Diario</option>
                <option value="route">Detallado Punto a Punto</option>
            </select>
          </div>

          <div style={{flex: 1}}>
            <label style={styles.label}>Rango de Fecha:</label>
            <select value={quickRange} onChange={e => handleRangeChange(e.target.value)} style={styles.input}>
                <option value="today">Hoy</option>
                <option value="yesterday">Ayer</option>
                <option value="thisWeek">Esta Semana</option>
                <option value="thisMonth">Este Mes</option>
                <option value="lastMonth">Mes Pasado</option>
                <option value="custom">📅 Personalizado</option>
            </select>
          </div>

          {quickRange === 'custom' && (
            <>
                <div style={{flex: 1}}>
                    <label style={styles.label}>Desde:</label>
                    <input type="datetime-local" required step="1800" style={{...styles.input, colorScheme: 'dark'}} value={reportConfig.from} onChange={e => setReportConfig({...reportConfig, from: e.target.value})} />
                </div>
                <div style={{flex: 1}}>
                    <label style={styles.label}>Hasta:</label>
                    <input type="datetime-local" required step="1800" style={{...styles.input, colorScheme: 'dark'}} value={reportConfig.to} onChange={e => setReportConfig({...reportConfig, to: e.target.value})} />
                </div>
            </>
          )}
 
          <button type="submit" disabled={isFetching} style={styles.btn}>
            {isFetching ? 'Cargando...' : '📄 Visualizar'}
          </button>
          <button type="button" onClick={handleDownloadExcel} style={{...styles.btn, backgroundColor: '#10B981'}}>
            📊 Exportar Excel
          </button>
        </form>
      </div>

      {/* TABLA DE RESUMEN DIARIO (MÚLTIPLES DÍAS) */}
      {summaryData.length > 0 && reportType === 'daily' && (
        <div style={styles.tableContainer}>
          <h3 style={styles.tableTitle}>Informe Diario Consolidado</h3>
          <div style={{maxHeight: '400px', overflowY: 'auto'}}>
            <table style={styles.table}>
              <thead style={{position:'sticky', top:0, backgroundColor:'#111827'}}>
                  <tr style={styles.tableHead}>
                      <th>Fecha del Reporte</th>
                      <th>Vehículo</th>
                      <th>Hora Inicio</th>
                      <th>Hora Fin</th>
                      <th>Km Recorridos</th>
                      <th>Horas de Motor</th>
                      <th>Vel. Máxima</th>
                  </tr>
              </thead>
              <tbody>
                {summaryData.map((day, index) => (
                  <tr key={index}>
                    <td style={styles.td}>{new Date(day.startTime).toLocaleDateString()}</td>
                    <td style={styles.td}>{devices.find(d => d.id === parseInt(reportConfig.deviceId))?.name}</td>
                    <td style={styles.td}>{new Date(day.startTime).toLocaleTimeString()}</td>
                    <td style={styles.td}>{new Date(day.endTime).toLocaleTimeString()}</td>
                    <td style={{...styles.td, color: '#3B82F6'}}>{(day.distance / 1000).toFixed(2)} km</td>
                    <td style={{...styles.td, color: '#10B981'}}>{formatEngineHours(day.engineHours)}</td>
                    <td style={{...styles.td, color: '#EF4444'}}>{(day.maxSpeed * 1.852).toFixed(1)} km/h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Aquí permanece intacta tu tabla routeData para el Detallado Punto a Punto si la necesitas... */}
 
    </main>
  );
}

const styles = {
  adminCard: { backgroundColor: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1F2937' },
  label: { color:'#9CA3AF', fontSize:'13px', fontWeight: 'bold', display: 'block', marginBottom: '5px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '10px', color: 'white', width: '100%' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  tableContainer: { backgroundColor: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1F2937', marginTop: '20px' },
  tableTitle: { margin: '0 0 15px 0', color: 'white', fontSize: '15px', borderBottom: '1px solid #1F2937', paddingBottom: '10px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#9CA3AF' },
  tableHead: { color: 'white', fontSize: '13px' },
  td: { padding: '12px 10px', fontSize: '13px', borderBottom: '1px solid #1F2937' }
};