import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { API_BASE } from '../config';

// Reparador automático del tamaño del mapa al ocultar el panel
function MapResizer({ isMobilePanelOpen }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 300);
    return () => clearTimeout(timer);
  }, [isMobilePanelOpen, map]);
  return null;
}

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
  
  // --- NUEVOS ESTADOS PARA EL BUSCADOR DE VEHÍCULOS (CUSTOM DROPDOWN) ---
  const [deviceSearchTerm, setDeviceSearchTerm] = useState('');
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [routeData, setRouteData] = useState([]);
  const [stopsData, setStopsData] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [mapCenter, setMapCenter] = useState([4.142, -73.626]);
  
  const [autoFollow, setAutoFollow] = useState(true);
  
  const [isMobile, setIsMobile] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(true);

  // Cerrar el dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDeviceDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lógica Responsive
  useEffect(() => {
    let prevWidth = window.innerWidth;
    
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      const mobile = currentWidth < 768;
      
      setIsMobile(mobile);
      
      if (mobile && prevWidth >= 768) {
        setIsMobilePanelOpen(false);
      }
      prevWidth = currentWidth;
    };
    
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
    if (!reportConfig.deviceId) {
      alert("Por favor, selecciona un vehículo.");
      return;
    }

    setIsFetching(true);
    setIsPlaying(false); 
    setPlaybackIndex(0);
    setAutoFollow(true); 
    
    try {
      const fromISO = new Date(reportConfig.from).toISOString();
      const toISO = new Date(reportConfig.to).toISOString();
      const headers = { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' };

      const [routeRes, stopsRes] = await Promise.all([
        fetch(`${API_BASE}/api/reports/route?deviceId=${reportConfig.deviceId}&from=${fromISO}&to=${toISO}`, { headers }),
        fetch(`${API_BASE}/api/reports/stops?deviceId=${reportConfig.deviceId}&from=${fromISO}&to=${toISO}`, { headers })
      ]);

      if(routeRes.ok && stopsRes.ok) {
        const rData = await routeRes.json();
        const sData = await stopsRes.json();
        
        const filteredStops = sData.filter(stop => stop.duration >= 300000);
        
        setRouteData(rData);
        setStopsData(filteredStops);

        if (rData.length > 0) setMapCenter([rData[0].latitude, rData[0].longitude]);
        if (isMobile) setIsMobilePanelOpen(false);
      }
    } catch (err) { 
      console.error("Error cargando ruta:", err); 
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

  // Filtrado de vehículos para el Custom Dropdown
  const filteredDropdownDevices = useMemo(() => {
    return devices.filter(d => d.name.toLowerCase().includes(deviceSearchTerm.toLowerCase()));
  }, [devices, deviceSearchTerm]);

  const selectedDeviceName = devices.find(d => String(d.id) === String(reportConfig.deviceId))?.name || "";

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

  const renderPlaybackControls = (isMobileView) => (
    <div style={isMobileView ? styles.playbackMobileGlass : styles.playbackContainer}>
      
      {/* FILA 1: Solo Velocidad */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ color: (routeData[playbackIndex]?.speed * 1.852) > 80 ? '#EF4444' : (isMobileView ? 'white' : '#9CA3AF'), fontSize: '15px', fontWeight: 'bold' }}>
          {(routeData[playbackIndex]?.speed * 1.852).toFixed(1)} km/h
        </span>
      </div>
      
      {/* FILA 2: Barra de Progreso */}
      <input 
        type="range" min="0" max={routeData.length - 1} value={playbackIndex} 
        onChange={(e) => { 
          const newIdx = Number(e.target.value);
          setPlaybackIndex(newIdx); 
          setIsPlaying(false); 
          setAutoFollow(true); 
          setMapCenter([routeData[newIdx].latitude, routeData[newIdx].longitude]);
        }} 
        style={{ width: '100%', marginBottom: '12px', cursor: 'pointer' }} 
      />
      
      {/* FILA 3: Botones de Play y Multiplicadores de Velocidad */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button 
          onClick={(e) => {
            e.preventDefault();
            const nextIsPlaying = !isPlaying;
            setIsPlaying(nextIsPlaying);
            if (nextIsPlaying) setAutoFollow(true);
          }} 
          type="button"
          style={{...styles.playBtn, flexShrink: 0, backgroundColor: isPlaying ? '#EF4444' : '#10B981'}}
        >
          {isPlaying ? '⏸️ Pausa' : '▶️ Play'}
        </button>
        
        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {[1, 2, 5, 10, 20].map(speed => (
            <button 
              key={speed} 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setPlaybackSpeed(speed);
              }} 
              style={{...styles.speedBtn, backgroundColor: playbackSpeed === speed ? '#3B82F6' : '#1F2937'}}
            >
              x{speed}
            </button>
          ))}
        </div>
      </div>

    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', width: '100%', backgroundColor: '#0B1120', position: 'relative', overflow: 'hidden' }}>
      
      <aside style={{ 
        width: isMobile ? '100%' : '320px', 
        boxSizing: 'border-box', 
        position: isMobile ? 'absolute' : 'relative',
        top: 0, left: 0, 
        height: '100%',
        backgroundColor: isMobile ? 'rgba(17, 24, 39, 0.97)' : '#111827',
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
          {isMobile && (
            <button onClick={() => setIsMobilePanelOpen(false)} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '24px', cursor: 'pointer' }}>✖</button>
          )}
        </div>
        
        <form onSubmit={handleFetchRoute} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {/* BUSCADOR DE VEHÍCULOS (CUSTOM DROPDOWN) */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <label style={styles.label}>Vehículo:</label>
            
            {/* Input Falso / Gatillo */}
            <div 
              onClick={() => setIsDeviceDropdownOpen(!isDeviceDropdownOpen)}
              style={{...styles.input, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', backgroundColor: '#0B1120', borderColor: isDeviceDropdownOpen ? '#3B82F6' : '#1F2937' }}
            >
              <span style={{ color: selectedDeviceName ? 'white' : '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedDeviceName || "-- Buscar y Seleccionar --"}
              </span>
              <span style={{ color: '#9CA3AF' }}>▼</span>
            </div>

            {/* Menú Desplegable con Buscador */}
            {isDeviceDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '6px', marginTop: '4px', zIndex: 9999, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)', overflow: 'hidden' }}>
                
                {/* Caja de Búsqueda */}
                <div style={{ padding: '8px', borderBottom: '1px solid #1F2937' }}>
                  <input 
                    type="text" 
                    placeholder="🔍 Escribe para filtrar..." 
                    value={deviceSearchTerm}
                    onChange={(e) => setDeviceSearchTerm(e.target.value)}
                    onClick={(e) => e.stopPropagation()} // Evita que al hacer clic se cierre
                    autoFocus
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #3B82F6', backgroundColor: '#0B1120', color: 'white', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Lista de Resultados */}
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {filteredDropdownDevices.length === 0 ? (
                    <div style={{ padding: '10px', color: '#9CA3AF', fontSize: '13px', textAlign: 'center' }}>No hay coincidencias</div>
                  ) : (
                    filteredDropdownDevices.map(d => (
                      <div 
                        key={d.id} 
                        onClick={() => {
                          setReportConfig({...reportConfig, deviceId: d.id});
                          setIsDeviceDropdownOpen(false);
                          setDeviceSearchTerm(''); // Limpiar buscador tras elegir
                        }}
                        style={{ padding: '10px 12px', color: 'white', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: reportConfig.deviceId == d.id ? 'rgba(59, 130, 246, 0.2)' : 'transparent' }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = reportConfig.deviceId == d.id ? 'rgba(59, 130, 246, 0.2)' : 'transparent'}
                      >
                        {d.name}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
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

        {/* Carga del renderizado en PC */}
        {!isMobile && routeData.length > 0 && renderPlaybackControls(false)}

        {stopsData.length > 0 && (
          <div style={{ marginTop: '20px', borderTop: '1px solid #1F2937', paddingTop: '15px' }}>
            <h3 style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '10px' }}>PARADAS {'>'} 5 MIN ({stopsData.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: isMobile ? '120px' : '0' }}>
              {stopsData.map((stop, i) => (
                <div 
                  key={i} 
                  style={styles.stopCard} 
                  onClick={() => { 
                    setMapCenter([stop.latitude, stop.longitude]);
                    setAutoFollow(false); 
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

      <div style={{ flex: 1, position: 'relative', zIndex: 0, height: '100%', width: '100%' }}>
        
        {isMobile && !isMobilePanelOpen && (
          <button 
            onClick={() => setIsMobilePanelOpen(true)}
            style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 1000, backgroundColor: '#2563EB', color: 'white', padding: '10px 16px', borderRadius: '8px', border: 'none', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,0,0,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⚙️ Controles
          </button>
        )}

        <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%' }}>
          <MapInteractions center={mapCenter} autoFollow={autoFollow} setAutoFollow={setAutoFollow} />
          <MapResizer isMobilePanelOpen={isMobilePanelOpen} />
          
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />          
          
          {coloredRouteSegments.map((segment, idx) => (
            <Polyline 
              key={idx} 
              positions={segment.positions} 
              color={segment.isOverspeed ? "#EF4444" : "#3B82F6"}
              weight={segment.isOverspeed ? 6 : 4} 
              opacity={0.8} 
            />
          ))}

          {routeData.length > 0 && routeData[playbackIndex] && (
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

        {/* Carga del renderizado flotante en Móvil */}
        {isMobile && routeData.length > 0 && (
          <div style={{ position: 'absolute', bottom: '90px', left: '5%', width: '90%', zIndex: 1000 }}>
            {renderPlaybackControls(true)}
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
  
  playbackContainer: { 
    backgroundColor: '#0B1120', 
    padding: '15px', 
    borderRadius: '8px', 
    marginTop: '20px', 
    border: '1px solid #1F2937',
    boxSizing: 'border-box' 
  },
  
  playbackMobileGlass: { 
    backgroundColor: 'rgba(11, 17, 32, 0.85)', 
    backdropFilter: 'blur(10px)', 
    padding: '15px', 
    borderRadius: '12px', 
    border: '1px solid rgba(31, 41, 55, 0.5)', 
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
    boxSizing: 'border-box' 
  },
  
  playBtn: { color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' },
  speedBtn: { color: 'white', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', flex: 1, fontSize: '12px' },
  stopCard: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '10px', cursor: 'pointer', transition: 'border-color 0.2s' }
};