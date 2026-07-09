import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Componente para forzar centrado de cámara
function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

export default function Alerts({ devices, token }) {
  const [reportConfig, setReportConfig] = useState({ 
    deviceId: '', 
    from: '', 
    to: '', 
    speedLimit: 80,
    alertType: 'overspeed' // Tipo de alerta por defecto
  });
  const [quickRange, setQuickRange] = useState('today');
  
  const [alertData, setAlertData] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [mapCenter, setMapCenter] = useState([4.142, -73.626]);

  // Lógica Responsive importada al estilo de tu LiveDashboard
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // URL ABSOLUTA PARA FUNCIONAMIENTO ONLINE
  const BASE_URL = 'https://api.labtesting.online';

  // Marcador Dinámico (Cambia de color según el tipo de alerta)
  const createAlertMarker = (title, color) => {
    const html = `
      <div style="display: flex; flex-direction: column; align-items: center; margin-top: -15px;">
        <span style="background: ${color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3); margin-bottom: 3px;">
          ${title}
        </span>
        <div style="width: 14px; height: 14px; background: white; border: 3px solid ${color}; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
          <div style="width: 4px; height: 4px; background: ${color}; border-radius: 50%;"></div>
        </div>
      </div>
    `;
    return L.divIcon({
      className: 'traccar-alert-icon',
      html: html,
      iconSize: [20, 30],
      iconAnchor: [10, 25],
      popupAnchor: [0, -25]
    });
  };

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
    else if (rangeValue === 'thisMonth') { 
      start.setDate(1); 
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999); 
    }
    
    const format = (d) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}T${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    setReportConfig({ ...reportConfig, from: format(start), to: format(end) });
  };

  useEffect(() => {
    handleRangeChange('today');
  }, []);

  const handleFetchAlerts = async (e) => {
    e.preventDefault();

    if (!reportConfig.deviceId || !reportConfig.from || !reportConfig.to) {
      alert('Por favor completa todos los filtros.'); return;
    }
    
    setIsFetching(true);
    setAlertData([]);

    try {
      const fromIso = new Date(reportConfig.from).toISOString();
      const toIso = new Date(reportConfig.to).toISOString();

      // CONEXIÓN ONLINE: Apuntando directamente a la nube para extraer coordenadas
      const urlRoute = `${BASE_URL}/api/reports/route?deviceId=${reportConfig.deviceId}&from=${fromIso}&to=${toIso}`;
      const resRoute = await fetch(urlRoute, { headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' } });
      const routeData = resRoute.ok ? await resRoute.json() : [];

      let foundAlerts = [];

      // LÓGICA 1: Exceso de Velocidad (Filtro Matemático Personalizado)
      if (reportConfig.alertType === 'overspeed') {
        const limit = parseFloat(reportConfig.speedLimit);
        foundAlerts = routeData
          .filter(pos => (pos.speed * 1.852) > limit)
          .map(pos => ({
            id: pos.id,
            type: 'Exceso de Velocidad',
            time: pos.fixTime,
            lat: pos.latitude,
            lon: pos.longitude,
            desc: `${(pos.speed * 1.852).toFixed(1)} km/h (Límite: ${limit})`,
            color: '#EF4444' // Rojo
          }));
      } 
      // LÓGICA 2: Eventos Nativos de Traccar (Encendidos, Apagados, Alarmas, Geocercas)
      else {
        // CONEXIÓN ONLINE: Apuntando a la nube para extraer los eventos
        const urlEvents = `${BASE_URL}/api/reports/events?deviceId=${reportConfig.deviceId}&from=${fromIso}&to=${toIso}`;
        const resEvents = await fetch(urlEvents, { headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' } });
        const eventsData = resEvents.ok ? await resEvents.json() : [];

        // Mapeamos las posiciones para encontrar rápido las coordenadas del evento
        const posMap = {};
        routeData.forEach(p => posMap[p.id] = p);

        // Filtramos solo el evento que el usuario seleccionó
        const filteredEvents = eventsData.filter(ev => ev.type === reportConfig.alertType);

        foundAlerts = filteredEvents.map(ev => {
          const pos = posMap[ev.positionId] || {}; // Buscamos la lat/lon usando el positionId del evento
          
          let title = 'Evento';
          let desc = 'Registrado por el sistema';
          let color = '#F59E0B'; // Naranja por defecto

          // Diccionario de Traducción y Estilos
          if (ev.type === 'ignitionOn') { title = 'Motor Encendido'; desc = 'El vehículo fue encendido'; color = '#10B981'; } // Verde
          if (ev.type === 'ignitionOff') { title = 'Motor Apagado'; desc = 'El vehículo fue apagado'; color = '#8B5CF6'; } // Morado
          if (ev.type === 'deviceOffline') { title = 'Desconexión'; desc = 'Pérdida de señal de datos'; color = '#6B7280'; } // Gris
          if (ev.type === 'alarm') { title = 'Alarma'; desc = ev.attributes?.alarm || 'Alarma general detectada'; color = '#EF4444'; } // Rojo
          if (ev.type === 'deviceStopped') { title = 'Parada'; desc = 'El vehículo se detuvo'; color = '#3B82F6'; } // Azul
          
          // ALERTAS DE GEOCERCAS INTEGRADAS
          if (ev.type === 'geofenceEnter') { title = 'Entrada a Zona'; desc = 'El vehículo ingresó a una geocerca'; color = '#059669'; } // Verde esmeralda
          if (ev.type === 'geofenceExit') { title = 'Salida de Zona'; desc = 'El vehículo salió de una geocerca'; color = '#D97706'; } // Naranja oscuro

          return {
            id: ev.id,
            type: title,
            time: ev.serverTime,
            lat: pos.latitude, // Puede ser undefined si se desconectó y no guardó posición
            lon: pos.longitude,
            desc: desc,
            color: color
          };
        });
      }
      
      setAlertData(foundAlerts);

      // Centrar el mapa en la primera alerta que tenga coordenadas válidas
      const firstValidAlert = foundAlerts.find(a => a.lat && a.lon);
      if (firstValidAlert) {
        setMapCenter([firstValidAlert.lat, firstValidAlert.lon]);
      } else if (foundAlerts.length > 0) {
        alert('Se encontraron alertas, pero no reportaron coordenadas exactas (ej: desconexiones bruscas). Revise la tabla.');
      } else {
        alert('No se encontraron alertas de este tipo en el rango seleccionado.');
      }

    } catch (err) { 
      console.error(err);
      alert("Error al conectarse con el servidor de Traccar.");
    }
    
    setIsFetching(false);
  };

  return (
    <main style={{
      flex: 1, 
      padding: isMobile ? '15px' : '20px 30px', // Ajuste padding móvil
      display: 'flex', 
      flexDirection: 'column', 
      overflowY: 'auto',
      paddingBottom: isMobile ? '80px' : '20px' // Margen inferior para barra de navegación móvil
    }}>
      <h2 style={{color:'white', margin:'0 0 20px 0', fontSize: isMobile ? '20px' : '24px'}}>Centro de Alertas y Eventos</h2>
      
      {/* PANEL DE FILTROS */}
      <div style={styles.adminCard}>
        <form onSubmit={handleFetchAlerts} style={{
          display: 'flex', 
          gap: '15px', 
          flexDirection: isMobile ? 'column' : 'row', // En móvil se apilan hacia abajo
          flexWrap: 'wrap', 
          alignItems: isMobile ? 'stretch' : 'flex-end'
        }}>
          
          <div style={{flex: 1, minWidth: '150px'}}>
            <label style={styles.label}>Vehículo:</label>
            <select required value={reportConfig.deviceId} onChange={e => setReportConfig({...reportConfig, deviceId: e.target.value})} style={styles.input}>
              <option value="">-- Seleccionar --</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div style={{flex: 1, minWidth: '180px'}}>
            <label style={styles.label}>Tipo de Alerta:</label>
            <select value={reportConfig.alertType} onChange={e => setReportConfig({...reportConfig, alertType: e.target.value})} style={styles.input}>
              <option value="overspeed">⚡ Exceso de Velocidad</option>
              <option value="ignitionOn">🟢 Motor Encendido</option>
              <option value="ignitionOff">🟣 Motor Apagado</option>
              <option value="deviceStopped">🔵 Paradas</option>
              <option value="deviceOffline">⚪ Desconexión de Señal</option>
              <option value="alarm">🚨 Alarmas (SOS/Corte)</option>
              <option value="geofenceEnter">🌐 Entrada a Geocerca</option>
              <option value="geofenceExit">⭕ Salida de Geocerca</option>
            </select>
          </div>

          {/* SOLO MOSTRAR LÍMITE DE VELOCIDAD SI SELECCIONA EXCESO DE VELOCIDAD */}
          {reportConfig.alertType === 'overspeed' && (
            <div style={{width: isMobile ? '100%' : '100px'}}>
              <label style={styles.label}>Límite (km/h):</label>
              <input type="number" required value={reportConfig.speedLimit} onChange={e => setReportConfig({...reportConfig, speedLimit: e.target.value})} style={{...styles.input, color: '#EF4444', fontWeight: 'bold'}} />
            </div>
          )}

          <div style={{flex: 1, minWidth: '150px'}}>
            <label style={styles.label}>Rango de Fecha:</label>
            <select value={quickRange} onChange={e => handleRangeChange(e.target.value)} style={styles.input}>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="thisMonth">Este Mes</option>
              <option value="custom">📅 Personalizado</option>
            </select>
          </div>

          {quickRange === 'custom' && (
            <>
              <div style={{flex: 1}}><input type="datetime-local" required value={reportConfig.from} onChange={e => setReportConfig({...reportConfig, from: e.target.value})} style={styles.input} /></div>
              <div style={{flex: 1}}><input type="datetime-local" required value={reportConfig.to} onChange={e => setReportConfig({...reportConfig, to: e.target.value})} style={styles.input} /></div>
            </>
          )}

          <button type="submit" disabled={isFetching} style={{...styles.btn, width: isMobile ? '100%' : 'auto'}}>
            {isFetching ? 'Analizando...' : '🚨 Extraer Alertas'}
          </button>

        </form>
      </div>

      {/* CONTENEDOR DIVIDIDO: MAPA Y TABLA (Se apilan en móvil) */}
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row', 
        gap: '20px', 
        marginTop: '20px', 
        flex: 1, 
        minHeight: isMobile ? 'auto' : '50vh' 
      }}>
        
        {/* MAPA DE ALERTAS */}
        <div style={{
          ...styles.mapContainer, 
          flex: isMobile ? 'none' : 2, 
          height: isMobile ? '350px' : 'auto', // Altura fija en móvil para que no desaparezca
          minHeight: isMobile ? '350px' : 'auto'
        }}>
          <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
            <ChangeView center={mapCenter} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />            
            {alertData.map((alert, index) => {
              // Si no tiene coordenadas válidas, no pintamos el marcador
              if (!alert.lat || !alert.lon) return null;
              
              return (
                <Marker 
                  key={index} 
                  position={[alert.lat, alert.lon]}
                  icon={createAlertMarker(alert.type, alert.color)}
                  eventHandlers={{ click: () => setMapCenter([alert.lat, alert.lon]) }}
                >
                  <Popup>
                    <b style={{color: alert.color, fontSize: '14px'}}>{alert.type}</b><br/>
                    <span style={{color:'#111827'}}><b>Fecha:</b> {new Date(alert.time).toLocaleString()}</span><br/>
                    <span style={{color:'#6B7280'}}><b>Detalle:</b> {alert.desc}</span>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        </div>

        {/* TABLA DE RESULTADOS */}
        <div style={{
          ...styles.tableContainer, 
          flex: isMobile ? 'none' : 1, 
          height: isMobile ? '400px' : 'auto', // Límite de altura en móvil para poder hacer scroll
          marginTop: 0, 
          display: 'flex', 
          flexDirection: 'column'
        }}>
          <h3 style={styles.tableTitle}>Registro de Eventos ({alertData.length})</h3>
          
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {alertData.length === 0 ? (
              <p style={{ color: '#6B7280', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>
                No hay alertas para mostrar.
              </p>
            ) : (
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827', zIndex: 1}}>
                  <tr style={styles.tableHead}>
                    <th style={styles.th}>Fecha y Hora</th>
                    <th style={styles.th}>Alerta / Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {alertData.map((alert, index) => (
                    <tr 
                      key={index} 
                      style={{ cursor: alert.lat ? 'pointer' : 'default', transition: 'background 0.2s', borderLeft: `4px solid ${alert.color}` }} 
                      onClick={() => alert.lat && setMapCenter([alert.lat, alert.lon])}
                    >
                      <td style={styles.td}>
                        {new Date(alert.time).toLocaleString()}
                        {!alert.lat && <span style={{display: 'block', fontSize: '9px', color: '#EF4444'}}>Sin posición GPS</span>}
                      </td>
                      <td style={styles.td}>
                        <strong style={{color: alert.color}}>{alert.type}</strong><br/>
                        <span style={{fontSize: '11px', color: '#9CA3AF'}}>{alert.desc}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}

const styles = {
  adminCard: { backgroundColor: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1F2937' },
  label: { color:'#9CA3AF', fontSize:'13px', fontWeight: 'bold', display: 'block', marginBottom: '5px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '10px', color: 'white', width: '100%', outline: 'none' },
  btn: { backgroundColor: '#3B82F6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  mapContainer: { borderRadius: '12px', overflow: 'hidden', border: '1px solid #1F2937' },
  tableContainer: { backgroundColor: '#111827', padding: '15px', borderRadius: '12px', border: '1px solid #1F2937' },
  tableTitle: { margin: '0 0 10px 0', color: 'white', fontSize: '14px', borderBottom: '1px solid #1F2937', paddingBottom: '10px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#9CA3AF' },
  tableHead: { color: 'white', fontSize: '12px' },
  th: { padding: '10px', borderBottom: '1px solid #1F2937' },
  td: { padding: '10px', fontSize: '12px', borderBottom: '1px solid #1F2937' }
};