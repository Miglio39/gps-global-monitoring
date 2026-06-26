import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Función auxiliar para centrar el mapa
function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

export default function LiveDashboard({ devices, positions }) {
  const [map, setMap] = useState(null); 
  const [hasInitialCentered, setHasCentered] = useState(false);
  
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [filter, setFilter] = useState('all'); 
  const [isListOpen, setIsListOpen] = useState(true);

  const getDevicePosition = (deviceId) => positions[deviceId];

  // Centrado inicial inteligente
  useEffect(() => {
    const validPositions = Object.values(positions).filter(p => p && p.latitude && p.longitude);
    
    if (!hasInitialCentered && validPositions.length > 0 && map) {
      const sumLat = validPositions.reduce((sum, p) => sum + p.latitude, 0);
      const sumLng = validPositions.reduce((sum, p) => sum + p.longitude, 0);
      
      const avgLat = sumLat / validPositions.length;
      const avgLng = sumLng / validPositions.length;

      map.setView([avgLat, avgLng], 12);
      setHasCentered(true);
    }
  }, [positions, hasInitialCentered, map]);

  const totalCount = devices.length;
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status !== 'online').length;
  const movingCount = Object.values(positions).filter(p => p && p.speed > 0).length;
  const stoppedCount = Object.values(positions).filter(p => p && p.speed === 0).length;

  // Lógica para extraer Batería
  const getBatteryInfo = (device, pos) => {
    const bLevel = pos?.attributes?.batteryLevel ?? device?.attributes?.batteryLevel;
    const bVolts = pos?.attributes?.battery ?? device?.attributes?.battery;

    if (bLevel !== undefined && bLevel !== null) {
      const level = Math.round(Number(bLevel));
      return { text: `${level}%`, color: level <= 20 ? '#EF4444' : '#10B981' };
    } else if (bVolts !== undefined && bVolts !== null) {
      const volts = Number(bVolts).toFixed(1);
      return { text: `${volts}v`, color: volts < 3.6 ? '#EF4444' : '#10B981' };
    }
    return { text: null, color: '#10B981' };
  };

  // 1. DISEÑO DEL MARCADOR
  const createCustomMarker = (name, speed, status) => {
    const isMoving = speed > 0;
    let color = '#8B5CF6'; 
    
    if (status !== 'online') {
      color = '#EF4444'; 
    } else if (isMoving) {
      color = '#10B981'; 
    }

    const html = `
      <div style="display: flex; align-items: center; margin-left: -15px; margin-top: -38px;">
        <div style="position: relative; width: 30px; height: 38px; filter: drop-shadow(0px 4px 4px rgba(0,0,0,0.4));">
          <svg viewBox="0 0 24 34" width="30" height="38" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 22 12 22s12-13.75 12-22c0-6.627-5.373-12-12-12z" fill="${color}" />
            <path d="M7 14l1.5-4h7L17 14v4h-1.5v2h-2v-2h-3v2h-2v-2H7v-4zm2.5-3h5l-.5-1.5h-4l-.5 1.5zM8 15.5c0 .28.22.5.5.5s.5-.22.5-.5-.22-.5-.5-.5-.5.22-.5.5zm7 0c0 .28.22.5.5.5s.5-.22.5-.5-.22-.5-.5-.5-.5.22-.5.5z" fill="white" />
          </svg>
        </div>
        <div style="
          background: rgba(17, 24, 39, 0.95); 
          padding: 4px 8px; 
          border-radius: 4px; 
          font-size: 11px; 
          font-family: 'Inter', Arial, sans-serif;
          font-weight: 700; 
          color: #F3F4F6; 
          white-space: nowrap; 
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 4px 6px rgba(0,0,0,0.4); 
          margin-left: 4px;
        ">
          ${name}
        </div>
      </div>
    `;

    return L.divIcon({
      className: 'traccar-custom-pin',
      html: html,
      iconSize: [120, 40], 
      iconAnchor: [15, 38], 
      popupAnchor: [0, -38] 
    });
  };

  // 2. DISEÑO DEL AGRUPADOR CLUSTER
  const createClusterCustomIcon = function (cluster) {
    const count = cluster.getChildCount();
    return L.divIcon({
      html: `
        <div style="
          background-color: #2563EB; 
          color: white; 
          border-radius: 50%; 
          width: 36px; 
          height: 36px; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-family: 'Inter', Arial, sans-serif;
          font-weight: 700; 
          font-size: 14px; 
          border: 2px solid rgba(255, 255, 255, 0.95); 
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        ">
          ${count}
        </div>
      `,
      className: 'custom-marker-cluster-refined',
      iconSize: [36, 36],
      iconAnchor: [18, 18] 
    });
  };

  const filteredDevices = devices.filter(device => {
    const pos = getDevicePosition(device.id);
    const isMoving = pos && pos.speed > 0;
    const isStopped = pos && pos.speed === 0;
    const isOnline = device.status === 'online';
    const isOffline = device.status !== 'online';

    if (filter === 'moving') return isMoving && isOnline;
    if (filter === 'stopped') return isStopped && isOnline;
    if (filter === 'online') return isOnline;
    if (filter === 'offline') return isOffline;
    return true; 
  });

  const handleDeviceClick = (device, pos) => {
    setSelectedDevice(device);
    if (pos && map) {
      map.flyTo([pos.latitude, pos.longitude], 16, { animate: true, duration: 1.5 });
    }
  };

  return (
    <main style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      
      {/* MAPA */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 0 }}>
        <MapContainer center={[4.142, -73.626]} zoom={13} style={{ height: '100%', width: '100%', zoomControl: false }} ref={setMap}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap' />
          
          <MarkerClusterGroup chunkedLoading maxClusterRadius={80} iconCreateFunction={createClusterCustomIcon}>
            {filteredDevices.map(device => {
              const pos = getDevicePosition(device.id);
              if (!pos) return null;
              
              const batteryInfo = getBatteryInfo(device, pos);
              
              // 🚨 NUEVA LÓGICA: Extraer ignición y horas de motor
              const ignition = pos.attributes?.ignition;
              const hasIgnition = ignition !== undefined && ignition !== null;
              const engineHours = pos.attributes?.hours ? (pos.attributes.hours / 3600000).toFixed(1) : null; // Traccar envía las horas en milisegundos

              return (
                <Marker 
                  key={device.id} 
                  position={[pos.latitude, pos.longitude]}
                  icon={createCustomMarker(device.name, pos.speed, device.status)}
                  eventHandlers={{ click: () => handleDeviceClick(device, pos) }}
                >
                  <Popup>
                    <b style={{color:'black', fontSize:'14px'}}>{device.name}</b><br/>
                    
                    <div style={{marginTop: '5px', paddingBottom: '5px', borderBottom: '1px solid #E5E7EB'}}>
                        <span style={{color:'#4B5563', fontSize:'12px'}}>Velocidad: <b>{(pos.speed * 1.852).toFixed(1)} km/h</b></span><br/>
                        <span style={{color:'#4B5563', fontSize:'12px'}}>Estado: {device.status === 'online' ? '🟢 En línea' : '🔴 Desconectado'}</span>
                    </div>
                    
                    <div style={{marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '3px'}}>
                        {/* Motor en el Popup */}
                        {hasIgnition && (
                          <span style={{color: ignition ? '#10B981' : '#6B7280', fontSize:'12px', fontWeight: 'bold'}}>
                            🔑 Motor: {ignition ? 'Encendido' : 'Apagado'}
                          </span>
                        )}
                        
                        {/* Horas de Uso */}
                        {engineHours && (
                          <span style={{color: '#3B82F6', fontSize:'12px', fontWeight: 'bold'}}>
                            ⏱️ Horómetro: {engineHours} hrs
                          </span>
                        )}

                        {/* Batería en el Popup */}
                        {batteryInfo.text && (
                          <span style={{color: batteryInfo.color, fontSize:'12px', fontWeight: 'bold'}}>
                            🔋 Batería: {batteryInfo.text}
                          </span>
                        )}
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      {/* KPIs */}
      <div style={{ position: 'absolute', bottom: 30, left: 15, zIndex: 1000, display: 'flex', gap: '8px', pointerEvents: 'none' }}>
        <div onClick={() => setFilter('all')} style={{...styles.kpiCard, pointerEvents: 'auto', border: filter === 'all' ? '1.5px solid #3B82F6' : '1px solid rgba(255,255,255,0.1)'}}>
          <span style={styles.kpiLabel}>Total</span>
          <span style={styles.kpiValue}>{totalCount}</span>
        </div>
        <div onClick={() => setFilter('moving')} style={{...styles.kpiCard, pointerEvents: 'auto', border: filter === 'moving' ? '1.5px solid #10B981' : '1px solid rgba(255,255,255,0.1)'}}>
          <span style={styles.kpiLabel}>En Ruta</span>
          <span style={{...styles.kpiValue, color: '#10B981'}}>{movingCount}</span>
        </div>
        <div onClick={() => setFilter('stopped')} style={{...styles.kpiCard, pointerEvents: 'auto', border: filter === 'stopped' ? '1.5px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)'}}>
          <span style={styles.kpiLabel}>Detenidos</span>
          <span style={{...styles.kpiValue, color: '#8B5CF6'}}>{stoppedCount}</span>
        </div>
        <div onClick={() => setFilter('online')} style={{...styles.kpiCard, pointerEvents: 'auto', border: filter === 'online' ? '1.5px solid #10B981' : '1px solid rgba(255,255,255,0.1)'}}>
          <span style={styles.kpiLabel}>Online</span>
          <span style={{...styles.kpiValue, color: '#10B981'}}>{onlineCount}</span>
        </div>
        <div onClick={() => setFilter('offline')} style={{...styles.kpiCard, pointerEvents: 'auto', border: filter === 'offline' ? '1.5px solid #EF4444' : '1px solid rgba(255,255,255,0.1)'}}>
          <span style={styles.kpiLabel}>Offline</span>
          <span style={{...styles.kpiValue, color: '#EF4444'}}>{offlineCount}</span>
        </div>
      </div>

      {/* PANEL DE UNIDADES FLOTANTE */}
      <div style={{ position: 'absolute', top: 15, right: 15, bottom: 15, width: isListOpen ? '250px' : '40px', backgroundColor: 'rgba(17, 24, 39, 0.85)', backdropFilter: 'blur(8px)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', zIndex: 1000, display: 'flex', flexDirection: 'column', transition: 'width 0.3s ease', boxShadow: '-2px 4px 15px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '10px', borderBottom: isListOpen ? '1px solid rgba(255,255,255,0.1)' : 'none', display: 'flex', justifyContent: isListOpen ? 'space-between' : 'center', alignItems: 'center' }}>
          {isListOpen && (
            <div>
              <h3 style={{ margin: 0, color: 'white', fontSize: '13px' }}>Unidades ({filteredDevices.length})</h3>
              <p style={{ margin: 0, color: '#9CA3AF', fontSize: '10px' }}>Filtro: {filter.toUpperCase()}</p>
            </div>
          )}
          <button onClick={() => setIsListOpen(!isListOpen)} style={{ background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '16px', padding: 0 }}>
            {isListOpen ? '❌' : '🚘'}
          </button>
        </div>

        {isListOpen && (
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
            {filteredDevices.map(device => {
              const pos = getDevicePosition(device.id);
              const isMoving = pos && pos.speed > 0;
              const isSelected = selectedDevice?.id === device.id;
              
              let indicatorColor = '#8B5CF6'; 
              if (device.status !== 'online') indicatorColor = '#EF4444'; 
              else if (isMoving) indicatorColor = '#10B981'; 

              const batteryInfo = getBatteryInfo(device, pos);
              
              // 🚨 NUEVA LÓGICA: Ignición para la lista lateral
              const ignition = pos?.attributes?.ignition;
              const hasIgnition = ignition !== undefined && ignition !== null;

              return (
                <div 
                  key={device.id} 
                  onClick={() => handleDeviceClick(device, pos)}
                  style={{ padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', marginBottom: '5px', backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.2)' : 'rgba(255,255,255,0.03)', border: isSelected ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{color: 'white', fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden'}}>
                        {device.name}
                      </strong>
                      
                      {/* Contenedor de Íconos (Motor y Batería) alineados a la derecha */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          
                          {/* Ícono de Ignición */}
                          {hasIgnition && (
                            <span style={{
                              fontSize: '11px', 
                              color: ignition ? '#10B981' : '#6B7280', 
                              fontWeight: 'bold',
                              textShadow: ignition ? '0px 0px 4px rgba(16, 185, 129, 0.6)' : 'none'
                            }} title={ignition ? 'Motor Encendido' : 'Motor Apagado'}>
                              🔑
                            </span>
                          )}

                          {/* Ícono de Batería */}
                          {batteryInfo.text && (
                            <span style={{
                              fontSize: '10px', 
                              color: batteryInfo.color, 
                              fontWeight: 'bold'
                            }} title="Nivel de Batería">
                              🔋 {batteryInfo.text}
                            </span>
                          )}

                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{fontSize: '10px', color: '#9CA3AF'}}>
                        {device.status !== 'online' ? 'Desconectado' : pos ? `${(pos.speed * 1.852).toFixed(0)} km/h` : '0 km/h'}
                      </span>
                    </div>

                  </div>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: indicatorColor, flexShrink: 0, marginLeft: '8px' }}></div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  );
}

const styles = {
  kpiCard: { 
    display: 'flex', 
    flexDirection: 'column',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.85)', 
    backdropFilter: 'blur(8px)', 
    padding: '4px 8px', 
    borderRadius: '6px', 
    cursor: 'pointer', 
    transition: 'all 0.2s', 
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    minWidth: '60px' 
  },
  kpiLabel: { margin: 0, fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 'bold' }, 
  kpiValue: { margin: '0', fontSize: '14px', color: 'white', fontWeight: '900' } 
};