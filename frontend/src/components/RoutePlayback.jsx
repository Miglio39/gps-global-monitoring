import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Manejador Inteligente de la Cámara
function MapInteractions({ center, autoFollow, setAutoFollow }) {
  const map = useMapEvents({
    dragstart: () => {
      if (autoFollow) setAutoFollow(false);
    }
  });

  useEffect(() => {
    if (autoFollow && center) {
      map.setView(center, map.getZoom(), { animate: false });
    }
  }, [center, autoFollow, map]);

  return null;
}

// Iconos personalizados
const stopIcon = new L.DivIcon({
  html: `<div style="background-color: #3B82F6; color: white; border: 2px solid white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.4);">P</div>`,
  className: 'custom-stop-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const movingIcon = new L.DivIcon({
  html: `<div style="background-color: #10B981; border: 3px solid white; border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 0 8px rgba(16, 185, 129, 0.8);"></div>`,
  className: 'custom-moving-icon',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

export default function RoutePlayback({ devices, token }) {
  const [reportConfig, setReportConfig] = useState({ deviceId: '', from: '', to: '' });
  const [quickRange, setQuickRange] = useState('today');
  
  const [routeData, setRouteData] = useState([]);
  const [stopsData, setStopsData] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [mapCenter, setMapCenter] = useState([4.142, -73.626]);
  
  const [autoFollow, setAutoFollow] = useState(true);
  
  // Estados para UX Responsive
  const [isMobile, setIsMobile] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(true);

  // Detector de pantalla
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    handleRangeChange('today');
    // eslint-disable-next-line
  }, []);

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
    const now = new Date();
    const start = new Date(now); 
    const end = new Date(now);
    
    if (rangeValue === 'today') { 
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999); 
    } else if (rangeValue === 'yesterday') { 
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0); 
      end.setDate(end.getDate() - 1); 
      end.setHours(23, 59, 59, 999);
    } else if (rangeValue === 'thisMonth') { 
      start.setDate(1); 
      start.setHours(0, 0, 0, 0); 
      end.setHours(23, 59, 59, 999);
    }
    
    const format = (d) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}T${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    setReportConfig(prev => ({ ...prev, from: format(start), to: format(end) }));
  };

  const handleFetchRoute = async (e) => {
    e.preventDefault();
    setIsFetching(true);
    setIsPlaying(false); 
    setPlaybackIndex(0);
    setAutoFollow(true); 
    
    try {
      const fromISO = new Date(reportConfig.from).toISOString();
      const toISO = new Date(reportConfig.to).toISOString();
      const headers = { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' };

      const [routeRes, stopsRes] = await Promise.all([
        fetch(`https://api.labtesting.online/api/reports/route?deviceId=${reportConfig.deviceId}&from=${fromISO}&to=${toISO}`, { headers }),
        fetch(`https://api.labtesting.online/api/reports/stops?deviceId=${reportConfig.deviceId}&from=${fromISO}&to=${toISO}`, { headers })
      ]);

      if(routeRes.ok && stopsRes.ok) {
        const rData = await routeRes.json();
        const sData = await stopsRes.json();
        
        const filteredStops = sData.filter(stop => stop.duration >= 300000);
        
        setRouteData(rData);
        setStopsData(filteredStops);

        if (rData.length > 0) setMapCenter([rData[0].latitude, rData[0].longitude]);
        
        // Magia UX: Si es celular, cerramos el panel automáticamente al cargar
        if (isMobile) setIsMobilePanelOpen(false);
      }
    } catch (err) { 
      console.error("Error cargando ruta con URLs absolutas:", err); 
    }
    setIsFetching(false);
  };

  const coloredRouteSegments = useMemo(() => {
    if (routeData.length === 0) return [];
    const segments = [];
    let currentSegment = [];
    let isOverspeed = false;

    routeData.forEach((point, index) => {
      const speedKmH = point.speed * 1.852;
      const currentlyOverspeed = speedKmH > 80;

      if (index === 0) {
        isOverspeed = currentlyOverspeed;
        currentSegment.push([point.latitude, point.longitude]);
      } else {
        if (currentlyOverspeed === isOverspeed) {
          currentSegment.push([point.latitude, point.longitude]);
        } else {
          currentSegment.push([point.latitude, point.longitude]);
          segments.push({ positions: currentSegment, isOverspeed });
          currentSegment = [[point.latitude, point.longitude]];
          isOverspeed = currentlyOverspeed;
        }
      }
    });
    
    if (currentSegment.length > 1) {
      segments.push({ positions: currentSegment, isOverspeed });
    }
    return segments;
  }, [routeData]);

  const formatDuration = (ms) => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remMins = minutes % 60;
    return `${hours}h ${remMins}m`;
  };

  const formatTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Componente reutilizable para los controles de reproducción
  const PlaybackControls = () => (
    <div style={isMobile ? styles.playbackMobileGlass : styles.playbackContainer}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setIsPlaying(!isPlaying)} style={styles.playBtn}>
            {isPlaying ? '⏸️ Pausa' : '▶️ Play'}
          </button>
          
          {!autoFollow && (
            <button 
              onClick={() => { 
                setAutoFollow(true); 
                setMapCenter([routeData[playbackIndex].latitude, routeData[playbackIndex].longitude]); 
              }} 
              style={{...styles.playBtn, backgroundColor: '#3B82F6', fontSize: '12px', padding: '6px 10px'}}
              title="Reanudar seguimiento automático"
            >
              🎯 Centrar
            </button>
          )}
        </div>

        <span style={{ color: (routeData[playbackIndex].speed * 1.852) > 80 ? '#EF4444' : (isMobile ? 'white' : '#9CA3AF'), fontSize: '14px', fontWeight: 'bold' }}>
          {(routeData[playbackIndex].speed * 1.852).toFixed(1)} km/h
        </span>
      </div>
      
      <input 
        type="range" min="0" max={routeData.length - 1} value={playbackIndex} 
        onChange={(e) => { 
          const newIdx = Number(e.target.value);
          setPlaybackIndex(newIdx); 
          setIsPlaying(false); 
          setAutoFollow(true); 
          setMapCenter([routeData[newIdx].latitude, routeData[newIdx].longitude]);
        }} 
        style={{ width: '100%', marginBottom: '10px', cursor: 'pointer' }} 
      />
      
      <div style={{ display: 'flex', gap: '5px' }}>
        {[1, 2, 5, 10, 20].map(speed => (
          <button key={speed} onClick={() => setPlaybackSpeed(speed)} style={{...styles.speedBtn, backgroundColor: playbackSpeed === speed ? '#3B82F6' : '#1F2937'}}>
            x{speed}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', width: '100%', backgroundColor: '#0B1120', position: 'relative', overflow: 'hidden' }}>
      
      {/* PANEL LATERAL DE CONTROLES (Overlay en móvil, fijo en Escritorio) */}
      <aside style={{ 
        width: isMobile ? '100%' : '320px', 
        position: isMobile ? 'absolute' : 'relative',
        top: 0, left: 0, 
        height: '100%',
        backgroundColor: isMobile ? 'rgba(17, 24, 39, 0.97)' : '#111827', // Más opaco en móvil
        backdropFilter: isMobile ? 'blur(8px)' : 'none',
        padding: '20px', 
        display: (isMobile && !isMobilePanelOpen) ? 'none' : 'flex', 
        flexDirection: 'column', 
        borderRight: isMobile ? 'none' : '1px solid #1F2937', 
        zIndex: 1001, 
        overflowY: 'auto',
        transition: 'all 0.3s ease'
      }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: 'white', margin: 0, fontSize: '18px' }}>📍 Repetición Visual</h2>
          {/* Botón de cerrar solo en móvil */}
          {isMobile && (
            <button onClick={() => setIsMobilePanelOpen(false)} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '24px', cursor: 'pointer' }}>✖</button>
          )}
        </div>
        
        <form onSubmit={handleFetchRoute} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={styles.label}>Vehículo:</label>
            <select required value={reportConfig.deviceId} onChange={e => setReportConfig({...reportConfig, deviceId: e.target.value})} style={styles.input}>
              <option value="">-- Seleccionar --</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          
          <div>
            <label style={styles.label}>Rango de tiempo:</label>
            <select value={quickRange} onChange={e => handleRangeChange(e.target.value)} style={styles.input}>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="thisMonth">Este Mes</option>
              <option value="custom">📅 Personalizado</option>
            </select>
          </div>

          {quickRange === 'custom' && (
            <>
              <div>
                <label style={styles.label}>Desde:</label>
                <input type="datetime-local" required step="1800" value={reportConfig.from} onChange={e => setReportConfig({...reportConfig, from: e.target.value})} style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>Hasta:</label>
                <input type="datetime-local" required step="1800" value={reportConfig.to} onChange={e => setReportConfig({...reportConfig, to: e.target.value})} style={styles.input} />
              </div>
            </>
          )}

          <button type="submit" disabled={isFetching} style={styles.btn}>
            {isFetching ? 'Cargando datos...' : '🗺️ Cargar Ruta'}
          </button>
        </form>

        {/* CONTROLES EN MODO ESCRITORIO (En móvil flotan) */}
        {!isMobile && routeData.length > 0 && <PlaybackControls />}

        {/* RESUMEN DE PARADAS */}
        {stopsData.length > 0 && (
          <div style={{ marginTop: '20px', borderTop: '1px solid #1F2937', paddingTop: '15px' }}>
            <h3 style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '10px' }}>PARADAS {'>'} 5 MIN ({stopsData.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: isMobile ? '80px' : '0' }}>
              {stopsData.map((stop, i) => (
                <div 
                  key={i} 
                  style={styles.stopCard} 
                  onClick={() => { 
                    setMapCenter([stop.latitude, stop.longitude]);
                    setAutoFollow(false); 
                    // Magia UX: Cierra el menú al tocar una parada en móvil
                    if(isMobile) setIsMobilePanelOpen(false);
                  }}
                >
                  <div style={{ color: 'white', fontSize: '13px', fontWeight: 'bold' }}>Parada #{i + 1}</div>
                  <div style={{ color: '#9CA3AF', fontSize: '11px' }}>
                    ⌚ {formatTime(stop.startTime)} - {formatTime(stop.endTime)}
                  </div>
                  <div style={{ color: '#3B82F6', fontSize: '12px', fontWeight: 'bold', marginTop: '4px' }}>
                    ⏱️ Duración: {formatDuration(stop.duration)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ÁREA DEL MAPA */}
      <div style={{ flex: 1, position: 'relative', zIndex: 0, height: '100%' }}>
        
        {/* BOTÓN FLOTANTE MÓVIL: Para reabrir los filtros */}
        {isMobile && !isMobilePanelOpen && (
          <button 
            onClick={() => setIsMobilePanelOpen(true)}
            style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 1000, backgroundColor: '#2563EB', color: 'white', padding: '10px 16px', borderRadius: '8px', border: 'none', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,0,0,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⚙️ Filtros
          </button>
        )}

        <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%' }}>
          <MapInteractions center={mapCenter} autoFollow={autoFollow} setAutoFollow={setAutoFollow} />
          
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          
          {coloredRouteSegments.map((segment, idx) => (
            <Polyline 
              key={idx} 
              positions={segment.positions} 
              color={segment.isOverspeed ? "#EF4444" : "#3B82F6"}
              weight={segment.isOverspeed ? 6 : 4} 
              opacity={0.8} 
            />
          ))}

          {routeData.length > 0 && (
            <Marker position={[routeData[playbackIndex].latitude, routeData[playbackIndex].longitude]} icon={movingIcon}>
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <b style={{color: '#111827'}}>Velocidad</b><br/>
                  <span style={{ color: (routeData[playbackIndex].speed * 1.852) > 80 ? '#EF4444' : '#111827', fontWeight: 'bold', fontSize: '14px' }}>
                    {(routeData[playbackIndex].speed * 1.852).toFixed(1)} km/h
                  </span><br/>
                  <span style={{ fontSize: '11px', color: '#6B7280' }}>{formatTime(routeData[playbackIndex].fixTime)}</span>
                </div>
              </Popup>
            </Marker>
          )}

          {stopsData.length > 0 && stopsData.map((stop, i) => (
            <Marker key={i} position={[stop.latitude, stop.longitude]} icon={stopIcon}>
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <b style={{color: '#3B82F6'}}>Parada #{i + 1}</b><br/>
                  Duración: {formatDuration(stop.duration)}<br/>
                  <span style={{ fontSize: '11px', color: '#6B7280' }}>
                    De {formatTime(stop.startTime)} a {formatTime(stop.endTime)}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* REPRODUCTOR FLOTANTE EN MÓVIL */}
        {isMobile && routeData.length > 0 && (
          <div style={{ position: 'absolute', bottom: '25px', left: '5%', width: '90%', zIndex: 1000 }}>
            <PlaybackControls />
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  label: { color:'#9CA3AF', fontSize:'13px', fontWeight: 'bold', display: 'block', marginBottom: '5px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '10px', color: 'white', width: '100%', boxSizing: 'border-box', colorScheme: 'dark' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%', marginTop: '5px', transition: 'background-color 0.2s' },
  playbackContainer: { backgroundColor: '#0B1120', padding: '15px', borderRadius: '8px', marginTop: '20px', border: '1px solid #1F2937' },
  
  // Nuevo estilo "Glassmorphism" para el reproductor en móvil
  playbackMobileGlass: { backgroundColor: 'rgba(11, 17, 32, 0.85)', backdropFilter: 'blur(10px)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(31, 41, 55, 0.5)', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)' },
  
  playBtn: { backgroundColor: '#10B981', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  speedBtn: { color: 'white', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', flex: 1, fontSize: '12px' },
  stopCard: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '10px', cursor: 'pointer', transition: 'border-color 0.2s' }
};