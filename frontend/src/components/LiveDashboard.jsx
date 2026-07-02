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

  // Token para comandos
  const token = localStorage.getItem('traccar_token');

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

  // Lógica de Comandos GPRS
  const handleEngineControl = async (deviceId, deviceName, stopEngine) => {
    const actionText = stopEngine ? 'APAGAR EL MOTOR' : 'HABILITAR EL ENCENDIDO';
    const commandData = stopEngine ? 'RELAY,1#' : 'RELAY,0#';

    if (!window.confirm(`⚠️ CONFIRMACIÓN DE SEGURIDAD\n\n¿Estás seguro de que deseas ${actionText} de "${deviceName}"?`)) {
      return;
    }

    try {
      const res = await fetch('/api/commands/send', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: 0,
          deviceId: deviceId,
          type: 'custom',
          attributes: { data: commandData }
        })
      });

      if (res.ok) {
        alert(`✅ Comando enviado a "${deviceName}".`);
      } else {
        const errorText = await res.text();
        alert(`❌ Error en Servidor Traccar (${res.status}): ${errorText}`);
      }
    } catch (error) {
      console.error(error);
      alert("❌ Error de red: No se pudo conectar con el servidor.");
    }
  };

  // Lógica de extracción de Batería
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
    if (status !== 'online') color = '#EF4444'; 
    else if (isMoving) color = '#10B981'; 

    const html = `
      <div style="display: flex; align-items: center; margin-left: -15px; margin-top: -38px;">
        <div style="position: relative; width: 30px; height: 38px; filter: drop-shadow(0px 4px 4px rgba(0,0,0,0.4));">
          <svg viewBox="0 0 24 34" width="30" height="38" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 22 12 22s12-13.75 12-22c0-6.627-5.373-12-12-12z" fill="${color}" />
            <path d="M7 14l1.5-4h7L17 14v4h-1.5v2h-2v-2h-3v2h-2v-2H7v-4zm2.5-3h5l-.5-1.5h-4l-.5 1.5zM8 15.5c0 .28.22.5.5.5s.5-.22.5-.5-.22-.5-.5-.5-.5.22-.5.5zm7 0c0 .28.22.5.5.5s.5-.22.5-.5-.22-.5-.5-.5-.5.22-.5.5z" fill="white" />
          </svg>
        </div>
        <div style="background: rgba(17, 24, 39, 0.95); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-family: 'Inter', Arial, sans-serif; font-weight: 700; color: #F3F4F6; white-space: nowrap; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 6px rgba(0,0,0,0.4); margin-left: 4px;">
          ${name}
        </div>
      </div>
    `;
    return L.divIcon({ className: 'traccar-custom-pin', html: html, iconSize: [120, 40], iconAnchor: [15, 38], popupAnchor: [0, -38] });
  };

  // 2. DISEÑO DEL CLUSTER
  const createClusterCustomIcon = function (cluster) {
    const count = cluster.getChildCount();
    return L.divIcon({
      html: `<div style="background-color: #2563EB; color: white; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-family: 'Inter', Arial, sans-serif; font-weight: 700; font-size: 14px; border: 2px solid rgba(255, 255, 255, 0.95); box-shadow: 0 2px 6px rgba(0,0,0,0.3);">${count}</div>`,
      className: 'custom-marker-cluster-refined', iconSize: [36, 36], iconAnchor: [18, 18] 
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
    if (pos && map) map.flyTo([pos.latitude, pos.longitude], 16, { animate: true, duration: 1.5 });
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
              const ignition = pos.attributes?.ignition;
              const hasIgnition = ignition !== undefined && ignition !== null;

              return (
                <Marker key={device.id} position={[pos.latitude, pos.longitude]} icon={createCustomMarker(device.name, pos.speed, device.status)} eventHandlers={{ click: () => handleDeviceClick(device, pos) }}>
                  <Popup>
                    <b style={{color:'black', fontSize:'13px'}}>{device.name}</b><br/>
                    <span style={{color:'#666', fontSize:'12px'}}>Velocidad: {(pos.speed * 1.852).toFixed(1)} km/h</span><br/>
                    <span style={{color:'#666', fontSize:'11px'}}>Estado: {device.status === 'online' ? '🟢 Conectado' : '🔴 Fuera de Línea'}</span><br/>
                    {hasIgnition && (<span style={{color: ignition ? '#10B981' : '#6B7280', fontSize:'11px'}}>🔑 Motor: {ignition ? 'Encendido' : 'Apagado'}</span>)}<br/>
                    {batteryInfo.text && (<span style={{color: batteryInfo.color, fontSize:'11px', fontWeight: 'bold'}}>Batería: {batteryInfo.text}</span>)}
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
          <span style={styles.kpiLabel}>Total</span><span style={styles.kpiValue}>{totalCount}</span>
        </div>
        <div onClick={() => setFilter('moving')} style={{...styles.kpiCard, pointerEvents: 'auto', border: filter === 'moving' ? '1.5px solid #10B981' : '1px solid rgba(255,255,255,0.1)'}}>
          <span style={styles.kpiLabel}>En Ruta</span><span style={{...styles.kpiValue, color: '#10B981'}}>{movingCount}</span>
        </div>
        <div onClick={() => setFilter('stopped')} style={{...styles.kpiCard, pointerEvents: 'auto', border: filter === 'stopped' ? '1.5px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)'}}>
          <span style={styles.kpiLabel}>Detenidos</span><span style={{...styles.kpiValue, color: '#8B5CF6'}}>{stoppedCount}</span>
        </div>
        <div onClick={() => setFilter('online')} style={{...styles.kpiCard, pointerEvents: 'auto', border: filter === 'online' ? '1.5px solid #10B981' : '1px solid rgba(255,255,255,0.1)'}}>
          <span style={styles.kpiLabel}>Online</span><span style={{...styles.kpiValue, color: '#10B981'}}>{onlineCount}</span>
        </div>
        <div onClick={() => setFilter('offline')} style={{...styles.kpiCard, pointerEvents: 'auto', border: filter === 'offline' ? '1.5px solid #EF4444' : '1px solid rgba(255,255,255,0.1)'}}>
          <span style={styles.kpiLabel}>Offline</span><span style={{...styles.kpiValue, color: '#EF4444'}}>{offlineCount}</span>
        </div>
      </div>

      {/* PANEL FLOTANTE DE UNIDADES - REDISEÑO TÁCTICO */}
      <div style={{ position: 'absolute', top: 15, right: 15, bottom: 15, width: isListOpen ? '290px' : '44px', backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', zIndex: 1000, display: 'flex', flexDirection: 'column', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        
        <div style={{ padding: '14px 16px', borderBottom: isListOpen ? '1px solid rgba(255,255,255,0.08)' : 'none', display: 'flex', justifyContent: isListOpen ? 'space-between' : 'center', alignItems: 'center' }}>
          {isListOpen && (
            <div>
              <h3 style={{ margin: 0, color: '#F3F4F6', fontSize: '14px', fontWeight: '700' }}>Flota Activa ({filteredDevices.length})</h3>
              <p style={{ margin: '2px 0 0 0', color: '#9CA3AF', fontSize: '10px', textTransform: 'uppercase', fontWeight: '600' }}>Filtro: {filter}</p>
            </div>
          )}
          <button onClick={() => setIsListOpen(!isListOpen)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '14px', width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
            {isListOpen ? '✕' : '🚚'}
          </button>
        </div>

        {isListOpen && (
          <div style={{ overflowY: 'auto', flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredDevices.map(device => {
              const pos = getDevicePosition(device.id);
              const isMoving = pos && pos.speed > 0;
              const isSelected = selectedDevice?.id === device.id;
              
              let statusDotColor = '#8B5CF6'; 
              if (device.status !== 'online') statusDotColor = '#EF4444'; 
              else if (isMoving) statusDotColor = '#10B981'; 

              const batteryInfo = getBatteryInfo(device, pos);
              const ignition = pos?.attributes?.ignition;
              const hasIgnition = ignition !== undefined && ignition !== null;

              return (
                <div 
                  key={device.id} 
                  onClick={() => handleDeviceClick(device, pos)}
                  style={{ padding: '12px', borderRadius: '10px', cursor: 'pointer', backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.18)' : 'rgba(255,255,255,0.02)', border: isSelected ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255,255,255,0.04)', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: statusDotColor, boxShadow: `0 0 8px ${statusDotColor}`, flexShrink: 0 }}></div>
                  
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    
                    {/* PRIMERA FILA: Nombre y Telemetría Destacada (Batería y Motor) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: isSelected ? '#60A5FA' : '#F9FAFB', fontSize: '12.5px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', fontWeight: '600' }}>
                        {device.name}
                      </strong>
                      
                      {/* BADGES (INSIGNIAS) TELEMÉTRICAS MODERNAS */}
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                        
                        {/* Badge de Ignición */}
                        {hasIgnition && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 5px', borderRadius: '4px', backgroundColor: ignition ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.2)', border: `1px solid ${ignition ? 'rgba(16, 185, 129, 0.3)' : 'rgba(107, 114, 128, 0.3)'}` }} title={ignition ? 'Motor Encendido' : 'Motor Apagado'}>
                            <span style={{ fontSize: '10px' }}>🔑</span>
                            <span style={{ fontSize: '9px', color: ignition ? '#10B981' : '#9CA3AF', fontWeight: '800' }}>
                              {ignition ? 'ON' : 'OFF'}
                            </span>
                          </div>
                        )}

                        {/* Badge de Batería */}
                        {batteryInfo.text && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 5px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} title="Nivel de Batería">
                            <span style={{ fontSize: '10px' }}>🔋</span>
                            <span style={{ fontSize: '9px', color: batteryInfo.color, fontWeight: '800' }}>
                              {batteryInfo.text}
                            </span>
                          </div>
                        )}
                        
                      </div>
                    </div>
                    
                    {/* SEGUNDA FILA: Velocidad y Botones de Control */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '500' }}>
                        {device.status !== 'online' ? 'Desconectado' : pos ? `${(pos.speed * 1.852).toFixed(0)} km/h` : '0 km/h'}
                      </span>
                      
                      {/* MICRO-BOTONES GPRS */}
                      <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                        <button 
                          title="Apagar Motor (Corte Remoto)"
                          onClick={() => handleEngineControl(device.id, device.name, true)}
                          style={{ backgroundColor: 'transparent', border: '1px solid rgba(239, 68, 68, 0.5)', color: '#EF4444', padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'; }}
                          onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; }}
                        >
                          Apagar
                        </button>
                        <button 
                          title="Habilitar Encendido"
                          onClick={() => handleEngineControl(device.id, device.name, false)}
                          style={{ backgroundColor: 'transparent', border: '1px solid rgba(16, 185, 129, 0.5)', color: '#10B981', padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(16, 185, 129, 0.15)'; }}
                          onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; }}
                        >
                          Activar
                        </button>
                      </div>
                    </div>

                  </div>
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
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.85)', backdropFilter: 'blur(8px)', 
    padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', 
    transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', minWidth: '60px' 
  },
  kpiLabel: { margin: 0, fontSize: '9px', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 'bold' }, 
  kpiValue: { margin: '0', fontSize: '14px', color: 'white', fontWeight: '900' } 
};