import React, { useState } from 'react';

export default function Reports({ devices, token }) {
  const [reportConfig, setReportConfig] = useState({ deviceId: '', from: '', to: '' });
  const [quickRange, setQuickRange] = useState('custom');
  const [reportType, setReportType] = useState('daily');
  const [routeData, setRouteData] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [isFetching, setIsFetching] = useState(false);

  const handleRangeChange = (rangeValue) => {
    setQuickRange(rangeValue);
    if (rangeValue === 'custom') return;
    const now = new Date(); const start = new Date(now); const end = new Date(now);
    if (rangeValue === 'today') { start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); }
    else if (rangeValue === 'yesterday') { start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0); end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999); }
    else if (rangeValue === 'thisMonth') { start.setDate(1); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); }
    const format = (d) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}T${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    setReportConfig({ ...reportConfig, from: format(start), to: format(end) });
  };

  const handleFetchData = async (e) => {
    e.preventDefault();
    setIsFetching(true); setRouteData([]); setSummaryData(null);
    try {
      const endpoint = reportType === 'daily' ? 'summary' : 'route';
      const url = `/api/reports/${endpoint}?deviceId=${reportConfig.deviceId}&from=${new Date(reportConfig.from).toISOString()}&to=${new Date(reportConfig.to).toISOString()}`;
      const response = await fetch(url, { headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' } });
      if(response.ok) {
        const data = await response.json();
        if (endpoint === 'summary') setSummaryData(data[0]);
        else setRouteData(data);
      }
    } catch (err) { console.error(err); }
    setIsFetching(false);
  };

  const handleDownloadExcel = async () => {
    const endpoint = reportType === 'daily' ? 'summary' : 'route';
    const url = `/api/reports/${endpoint}?deviceId=${reportConfig.deviceId}&from=${new Date(reportConfig.from).toISOString()}&to=${new Date(reportConfig.to).toISOString()}`;
    const response = await fetch(url, { headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    if(response.ok) {
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = `Informe_${reportType}.xlsx`;
      a.click();
    }
  };

  return (
    <main style={{flex: 1, padding: '20px 30px', overflowY: 'auto'}}>
      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Módulo de Informes Analíticos</h2>
      
      <div style={styles.adminCard}>
        <form onSubmit={handleFetchData} style={{display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end'}}>
          <div style={{flex: 1}}><label style={styles.label}>Vehículo:</label><select required value={reportConfig.deviceId} onChange={e => setReportConfig({...reportConfig, deviceId: e.target.value})} style={styles.input}><option value="">-- Seleccionar --</option>{devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div style={{flex: 1}}><label style={styles.label}>Tipo:</label><select value={reportType} onChange={e => setReportType(e.target.value)} style={styles.input}><option value="daily">Resumen Diario</option><option value="route">Detallado Punto a Punto</option></select></div>
          <div style={{flex: 1}}><label style={styles.label}>Rango:</label><select value={quickRange} onChange={e => handleRangeChange(e.target.value)} style={styles.input}><option value="today">Hoy</option><option value="yesterday">Ayer</option><option value="thisMonth">Este Mes</option><option value="custom">📅 Personalizado</option></select></div>
          {quickRange === 'custom' && (
            <><div style={{flex: 1}}><input type="datetime-local" required value={reportConfig.from} onChange={e => setReportConfig({...reportConfig, from: e.target.value})} style={styles.input} /></div><div style={{flex: 1}}><input type="datetime-local" required value={reportConfig.to} onChange={e => setReportConfig({...reportConfig, to: e.target.value})} style={styles.input} /></div></>
          )}
          <button type="submit" disabled={isFetching} style={styles.btn}>{isFetching ? 'Cargando...' : '📄 Generar'}</button>
          <button type="button" onClick={handleDownloadExcel} style={{...styles.btn, backgroundColor: '#10B981'}}>📊 Excel</button>
        </form>
      </div>

      {summaryData && reportType === 'daily' && (
        <div style={styles.tableContainer}>
          <h3 style={styles.tableTitle}>Informe Diario Consolidado</h3>
          <table style={styles.table}>
            <thead><tr style={styles.tableHead}><th>Vehículo</th><th>Inicio</th><th>Fin</th><th>Km Recorridos</th><th>Velocidad Max</th></tr></thead>
            <tbody>
              <tr>
                <td style={styles.td}>{devices.find(d => d.id === parseInt(reportConfig.deviceId))?.name}</td>
                <td style={styles.td}>{new Date(summaryData.startTime).toLocaleString()}</td>
                <td style={styles.td}>{new Date(summaryData.endTime).toLocaleString()}</td>
                <td style={{...styles.td, color: '#10B981'}}>{(summaryData.distance / 1000).toFixed(2)} km</td>
                <td style={{...styles.td, color: '#EF4444'}}>{(summaryData.maxSpeed * 1.852).toFixed(1)} km/h</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {routeData.length > 0 && reportType === 'route' && (
        <div style={styles.tableContainer}>
          <h3 style={styles.tableTitle}>Informe Detallado</h3>
          <div style={{maxHeight: '400px', overflowY: 'auto'}}>
            <table style={styles.table}>
              <thead style={{position:'sticky', top:0, backgroundColor:'#111827'}}><tr style={styles.tableHead}><th>#</th><th>Fecha y Hora</th><th>Velocidad</th><th>Lat</th><th>Lng</th></tr></thead>
              <tbody>
                {routeData.map((punto, index) => (
                  <tr key={index}>
                    <td style={styles.td}>{index + 1}</td>
                    <td style={styles.td}>{new Date(punto.fixTime).toLocaleString()}</td>
                    <td style={styles.td}>{(punto.speed * 1.852).toFixed(1)} km/h</td>
                    <td style={styles.td}>{punto.latitude.toFixed(5)}</td>
                    <td style={styles.td}>{punto.longitude.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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