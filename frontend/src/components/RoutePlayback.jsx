import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css'; // <-- CSS AGREGADO AQUÍ TAMBIÉN

function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

export default function RoutePlayback({ devices, token }) {
  const [reportConfig, setReportConfig] = useState({ deviceId: '', from: '', to: '' });
  const [quickRange, setQuickRange] = useState('custom');
  const [routeData, setRouteData] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [mapCenter, setMapCenter] = useState([4.142, -73.626]);

  useEffect(() => {
    let interval;
    if (isPlaying && routeData.length > 0) {
      interval = setInterval(() => {
        setPlaybackIndex(prev => {
          if (prev >= routeData.length - 1) { setIsPlaying(false); return prev; }
          setMapCenter([routeData[prev + 1].latitude, routeData[prev + 1].longitude]);
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, routeData]);

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

  const handleFetchRoute = async (e) => {
    e.preventDefault();
    setIsFetching(true); setIsPlaying(false); setPlaybackIndex(0);
    try {
      const url = `/api/reports/route?deviceId=${reportConfig.deviceId}&from=${new Date(reportConfig.from).toISOString()}&to=${new Date(reportConfig.to).toISOString()}`;
      const response = await fetch(url, { headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' } });
      if(response.ok) {
        const data = await response.json();
        setRouteData(data);
        if (data.length > 0) setMapCenter([data[0].latitude, data[0].longitude]);
      }
    } catch (err) { console.error(err); }
    setIsFetching(false);
  };

  return (
    <main style={{flex: 1, padding: '20px 30px', display: 'flex', flexDirection: 'column'}}>
      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Repetición de Recorrido Visual</h2>
      
      <div style={styles.adminCard}>
        <form onSubmit={handleFetchRoute} style={{display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end'}}>
          <div style={{flex: 1}}><label style={styles.label}>Vehículo:</label><select required value={reportConfig.deviceId} onChange={e => setReportConfig({...reportConfig, deviceId: e.target.value})} style={styles.input}><option value="">-- Seleccionar --</option>{devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div style={{flex: 1}}><label style={styles.label}>Rango:</label><select value={quickRange} onChange={e => handleRangeChange(e.target.value)} style={styles.input}><option value="today">Hoy</option><option value="yesterday">Ayer</option><option value="thisMonth">Este Mes</option><option value="custom">📅 Personalizado</option></select></div>
          {quickRange === 'custom' && (
            <><div style={{flex: 1}}><input type="datetime-local" required value={reportConfig.from} onChange={e => setReportConfig({...reportConfig, from: e.target.value})} style={styles.input} /></div><div style={{flex: 1}}><input type="datetime-local" required value={reportConfig.to} onChange={e => setReportConfig({...reportConfig, to: e.target.value})} style={styles.input} /></div></>
          )}
          <button type="submit" disabled={isFetching} style={styles.btn}>{isFetching ? 'Cargando...' : '🗺️ Cargar Ruta'}</button>
        </form>
      </div>

      {routeData.length > 0 && (
        <div style={styles.playbackContainer}>
          <button onClick={() => setIsPlaying(!isPlaying)} style={styles.playBtn}>{isPlaying ? '⏸️ Pausar' : '▶️ Reproducir'}</button>
          <input type="range" min="0" max={routeData.length - 1} value={playbackIndex} onChange={(e) => { setPlaybackIndex(Number(e.target.value)); setIsPlaying(false); }} style={{ flex: 1 }} />
          {[1, 2, 5, 10].map(speed => <button key={speed} onClick={() => setPlaybackSpeed(speed)} style={{...styles.speedBtn, backgroundColor: playbackSpeed === speed ? '#3B82F6' : '#1F2937'}}>x{speed}</button>)}
        </div>
      )}

      <div style={{...styles.mapContainer, flex: 1, marginTop: '20px'}}>
        <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
          <ChangeView center={mapCenter} />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          {routeData.length > 0 && (
            <><Polyline positions={routeData.map(p => [p.latitude, p.longitude])} color="#E61E2A" weight={4} opacity={0.6} /><Marker position={[routeData[playbackIndex].latitude, routeData[playbackIndex].longitude]}><Popup><b style={{color: '#2563EB'}}>Vehículo en Movimiento</b><br/>{(routeData[playbackIndex].speed * 1.852).toFixed(1)} km/h</Popup></Marker></>
          )}
        </MapContainer>
      </div>
    </main>
  );
}

const styles = {
  adminCard: { backgroundColor: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1F2937' },
  label: { color:'#9CA3AF', fontSize:'13px', fontWeight: 'bold', display: 'block', marginBottom: '5px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '10px', color: 'white', width: '100%' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  playbackContainer: { display: 'flex', alignItems: 'center', gap: '15px', backgroundColor: '#111827', padding: '15px', borderRadius: '12px', marginTop: '20px' },
  playBtn: { backgroundColor: '#10B981', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  speedBtn: { color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  mapContainer: { minHeight: '50vh', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid #1F2937' }
};