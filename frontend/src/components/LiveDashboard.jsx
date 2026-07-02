import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { API_BASE } from '../config'; // <--- Importamos la configuración dinámica

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
      const center = [sumLat / validPositions.length, sumLng / validPositions.length];
      map.setView(center, 7);
      setHasCentered(true);
    }
  }, [positions, map, hasInitialCentered]);

  // Control de apagado/encendido del motor por comando
  const handleEngineControl = async (deviceId, deviceName, state) => {
    const actionText = state ? "HABILITAR el encendido" : "APAGAR el motor";
    if (!window.confirm(`¿Está seguro que desea ${actionText} del vehículo ${deviceName}?`)) {
      return;
    }

    try {
      // Inyectamos API_BASE dinámicamente antes de la ruta del endpoint
      const response = await fetch(`${API_BASE}/api/commands/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + token
        },
        body: JSON.stringify({
          deviceId: deviceId,
          type: state ? 'engineResume' : 'engineStop'
        })
      });

      if (response.ok) {
        alert(`Comando de ${state ? 'Habilitación' : 'Corte'} enviado con éxito.`);
      } else {
        alert('Error al enviar el comando. Verifique los permisos.');
      }
    } catch (error) {
      console.error("Error al enviar comando:", error);
      alert('Error de conexión al enviar el comando.');
    }
  };

  // Iconos personalizados de Leaflet para el estado del GPS
  const getCustomIcon = (course, status) => {
    let color = '#EF4444'; // Desconectado / Detenido (Rojo)
    if (status === 'online') color = '#10B981'; // En movimiento (Verde)

    return L.divIcon({
      html: `
        <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
          <div style="background-color: ${color}; width: 14px; height: 14px; borderRadius: 50%; border: 2px solid white; boxShadow: 0 2px 4px rgba(0,0,0,0.3); transform: rotate(${course || 0}deg); display: flex; align-items: center; justify-content: center;">
            <div style="width: 0; height: 0; border-left: 3px solid transparent; border-right: 3px solid transparent; border-bottom: 5px solid white; margin-bottom: 5px;"></div>
          </div>
        </div>
      `,
      className: 'custom-gps-icon',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  };

  const filteredDevices = devices.filter(d => {
    if (filter === 'all') return true;
    return d.status === filter;
  });

  // Contadores para KPIs
  const totalDevices = devices.length;
  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineDevices = totalDevices - onlineDevices;

  return (
    <main style={{ flex: 1, display: 'flex', position: 'relative', backgroundColor: '#0B1120' }}>
      
      {/* SECCIÓN DE KPIs EN LA PARTE SUPERIOR IZQUIERDA DEL MAPA */}
      <div style={{
        position: 'absolute', top: '20px', left: '70px', 
        display: 'flex', gap: '10px', zIndex: 1000,
        fontFamily: 'sans-serif'
      }}>
        <div 
          onClick={() => setFilter('all')}
          style={{...styles.kpiCard, border: filter === 'all' ? '1px solid #3B82F6' : '1px solid #1E293B'}}
        >
          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: '600' }}>TOTALES</span>
          <span style={{ fontSize: '16px', color: 'white', fontWeight: 'bold' }}>{totalDevices}</span>
        </div>
        <div 
          onClick={() => setFilter('online')}
          style={{...styles.kpiCard, border: filter === 'online' ? '1px solid #10B981' : '1px solid #1E293B'}}
        >
          <span style={{ fontSize: '10px', color: '#10B981', fontWeight: '600' }}>ONLINE</span>
          <span style={{ fontSize: '16px', color: '#10B981', fontWeight: 'bold' }}>{onlineDevices}</span>
        </div>
        <div 
          onClick={() => setFilter('offline')}
          style={{...styles.kpiCard, border: filter === 'offline' ? '1px solid #EF4444' : '1px solid #1E293B'}}
        >
          <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: '600' }}>OFFLINE</span>
          <span style={{ fontSize: '16px', color: '#EF4444', fontWeight: 'bold' }}>{offlineDevices}</span>
        </div>
      </div>

      {/* MAPA NATIVO LEAFLET */}
      <div style={{ flex: 1, height: '100%', position: 'relative' }}>
        <MapContainer 
          center={[4.570868, -74.297333]} 
          zoom={6} 
          style={{ height: '100%', width: '100%' }}
          ref={setMap}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          
          <MarkerClusterGroup>
            {filteredDevices.map(device => {
              const pos = getDevicePosition(device.id);
              if (!pos) return null;
              return (
                <Marker 
                  key={device.id} 
                  position={[pos.latitude, pos.longitude]}
                  icon={getCustomIcon(pos.course, device.status)}
                  eventHandlers={{
                    click: () => {
                      setSelectedDevice(device);
                    },
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'sans-serif', color: '#333', minWidth: '160px' }}>
                      <h4 style={{ margin: '0 0 5px 0', color: '#111827', borderBottom: '1px solid #E5E7EB', paddingBottom: '4px' }}>{device.name}</h4>
                      <p style={{ margin: '4px 0', fontSize: '12px' }}><b>Estado:</b> {device.status === 'online' ? '🟢 En línea' : '🔴 Desconectado'}</p>
                      <p style={{ margin: '4px 0', fontSize: '12px' }}><b>Velocidad:</b> {(pos.speed * 1.852).toFixed(1)} km/h</p>
                      <p style={{ margin: '4px 0', fontSize: '12px' }}><b>Altitud:</b> {pos.altitude.toFixed(0)} m</p>
                      <p style={{ margin: '4px 0', fontSize: '12px' }}><b>Curso:</b> {pos.course}°</p>
                      <p style={{ margin: '4px 0', fontSize: '12px' }}><b>Última info:</b> <span style={{fontSize: '11px', color: '#6B7280'}}>{new Date(pos.fixTime).toLocaleString()}</span></p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>

          {selectedDevice && getDevicePosition(selectedDevice.id) && (
            <ChangeView center={[getDevicePosition(selectedDevice.id).latitude, getDevicePosition(selectedDevice.id).longitude]} />
          )}
        </MapContainer>
      </div>

      {/* LISTADO LATERAL DE FLOTA */}
      <div style={{
        position: 'absolute', top: '20px', right: '20px', bottom: '20px',
        width: isListOpen ? '320px' : '50px', backgroundColor: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(10px)', borderRadius: '12px', border: '1px solid #1E293B',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
        zIndex: 1000, transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px', borderBottom: '1px solid #1E293B' }}>
          {isListOpen && <h3 style={{ color: 'white', margin: 0, fontSize: '14px', fontWeight: '600' }}>Flota Vehicular ({filteredDevices.length})</h3>}
          <button 
            onClick={() => setIsListOpen(!isListOpen)}
            style={{ backgroundColor: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}
          >
            {isListOpen ? '▶️' : '◀️'}
          </button>
        </div>

        {isListOpen && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredDevices.length === 0 ? (
              <div style={{color: '#64748B', textAlign: 'center', marginTop: '20px', fontSize: '12px'}}>No hay vehículos en este estado</div>
            ) : (
              filteredDevices.map(device => {
                const pos = getDevicePosition(device.id);
                const isSelected = selectedDevice?.id === device.id;
                return (
                  <div 
                    key={device.id}
                    onClick={() => pos && setSelectedDevice(device)}
                    style={{
                      backgroundColor: isSelected ? '#1E293B' : '#111827', padding: '12px', borderRadius: '8px',
                      cursor: pos ? 'pointer' : 'not-allowed', border: isSelected ? '1px solid #3B82F6' : '1px solid rgba(255,255,255,0.03)',
                      transition: 'all 0.15s', opacity: pos ? 1 : 0.6
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'white', fontWeight: '600', fontSize: '13px' }}>{device.name}</span>
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '12px', backgroundColor: device.status === 'online' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: device.status === 'online' ? '#10B981' : '#EF4444', fontWeight: 'bold' }}>
                        {device.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>

                    {pos && (
                      <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                          <span>Velocidad:</span>
                          <span style={{ color: 'white', fontWeight: '500' }}>{(pos.speed * 1.852).toFixed(0)} km/h</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94A3B8', marginBottom: '8px' }}>
                          <span>Último reporte:</span>
                          <span style={{ color: '#64748B', fontSize: '10px' }}>{new Date(pos.fixTime).toLocaleTimeString()}</span>
                        </div>
                        
                        {/* CONTROLES DE MOTOR INCORPORADOS */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', backgroundColor: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '6px' }}>
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: '600' }}>Motor:</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              title="Apagar Motor (Corte)"
                              onClick={(e) => { e.stopPropagation(); handleEngineControl(device.id, device.name, false); }}
                              style={{ backgroundColor: 'transparent', border: '1px solid rgba(239, 68, 68, 0.5)', color: '#EF4444', padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
                              onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'; }}
                              onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; }}
                            >
                              Apagar
                            </button>
                            <button 
                              title="Habilitar Encendido"
                              onClick={(e) => { e.stopPropagation(); handleEngineControl(device.id, device.name, true); }}
                              style={{ backgroundColor: 'transparent', border: '1px solid rgba(16, 185, 129, 0.5)', color: '#10B981', padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
                              onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(16, 185, 129, 0.15)'; }}
                              onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; }}
                            >
                              Activar
                            </button>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </main>
  );
}

const styles = {
  kpiCard: { 
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    backgroundColor: 'rgba(11, 17, 32, 0.85)', backdropFilter: 'blur(8px)', 
    padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', 
    transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    minWidth: '70px', height: '42px'
  }
};