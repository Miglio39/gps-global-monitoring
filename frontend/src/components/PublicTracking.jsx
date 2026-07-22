import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Componente inteligente para forzar el encuadre (Bounds) de múltiples vehículos
function AutoBounds({ positions, forceUpdate }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 0) {
      if (positions.length === 1) {
        map.setView([positions[0].latitude, positions[0].longitude], 15);
      } else {
        const bounds = L.latLngBounds(positions.map(p => [p.latitude, p.longitude]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [positions, forceUpdate, map]);
  return null;
}

// Para hacer FlyTo al hacer clic en la lista
function FlyToLocation({ targetPos }) {
  const map = useMap();
  useEffect(() => {
    if (targetPos) {
      map.flyTo([targetPos.latitude, targetPos.longitude], 16, { animate: true, duration: 1.5 });
    }
  }, [targetPos, map]);
  return null;
}

export default function PublicTracking() {
  const { token } = useParams();
  const [devices, setDevices] = useState([]); 
  const [positions, setPositions] = useState([]); 
  const [status, setStatus] = useState('loading'); 
  const [mapTarget, setMapTarget] = useState(null); // Posición objetivo para FlyTo
  const [forceBounds, setForceBounds] = useState(0); // Para el botón "Ver Todos"
  
  // Lógica Responsive para la lista
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isListOpen, setIsListOpen] = useState(window.innerWidth >= 768);

  const BASE_URL = 'https://api.globalmonitorgps.com';

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setIsListOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!token) { setStatus('expired'); return; }

    const fetchLiveLocation = async () => {
      try {
        const headers = { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' };
        
        const [resDevices, resPositions] = await Promise.all([
          fetch(`${BASE_URL}/api/devices`, { headers }), 
          fetch(`${BASE_URL}/api/positions`, { headers })
        ]);

        if (resDevices.status === 401 || resPositions.status === 401) {
          setStatus('expired');
          return;
        }

        if (resDevices.ok && resPositions.ok) {
          const devs = await resDevices.json();
          const posArray = await resPositions.json();
          
          if (devs.length > 0 && posArray.length > 0) {
            setDevices(devs);
            setPositions(posArray); 
            setStatus('active');
          } else {
            setStatus('expired');
          }
        }
      } catch (error) {
        console.error("Error en mapa público:", error);
        setStatus('expired');
      }
    };

    fetchLiveLocation();
    const interval = setInterval(fetchLiveLocation, 5000);
    return () => clearInterval(interval);
  }, [token]);

  // Ícono personalizado: Verde si avanza, Rojo si está quieto
  const createMovingIcon = (speed) => new L.DivIcon({
    html: `<div style="background-color: ${speed > 0 ? '#10B981' : '#EF4444'}; border: 3px solid white; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 0 10px ${speed > 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'};"></div>`,
    className: 'custom-moving-icon',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  if (status === 'loading') {
    return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B1120', color: 'white' }}><h3>Conectando con la flota de seguimiento...</h3></div>;
  }

  if (status === 'expired') {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B1120', color: 'white', textAlign: 'center', padding: '20px' }}>
        <div>
          <h1 style={{ fontSize: '50px', margin: '0 0 10px 0' }}>⏱️</h1>
          <h2 style={{ color: '#EF4444' }}>Enlace Caducado o Revocado</h2>
          <p style={{ color: '#9CA3AF' }}>Este enlace de seguimiento ya no es válido por razones de seguridad.</p>
        </div>
      </div>
    );
  }

  const movingCount = positions.filter(p => p.speed > 0).length;
  const stoppedCount = positions.length - movingCount;

  // Lógica para clic en la lista
  const handleDeviceClick = (pos) => {
    if (pos) {
      setMapTarget(pos);
      if (isMobile) setIsListOpen(false); // Cierra lista en móvil al seleccionar
    }
  };

  const handleShowAll = () => {
    setMapTarget(null);
    setForceBounds(prev => prev + 1); // Dispara AutoBounds
  };

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative', overflow: 'hidden' }}>
      
      {/* BOTÓN FLOTANTE "VER TODOS" */}
      {devices.length > 1 && (
        <button 
          onClick={handleShowAll}
          style={{
            position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, backgroundColor: '#2563EB', color: 'white', border: 'none',
            padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold', fontSize: '12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)', cursor: 'pointer'
          }}
        >
          🌍 Ver Flota Completa
        </button>
      )}

      {/* MAPA A PANTALLA COMPLETA */}
      <MapContainer style={{ height: '100%', width: '100%', zoomControl: false }}>
        <AutoBounds positions={positions} forceUpdate={forceBounds} />
        <FlyToLocation targetPos={mapTarget} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        
        {/* ITERACIÓN MÚLTIPLE CORRECTA */}
        {positions.map(pos => {
          const device = devices.find(d => d.id === pos.deviceId);
          if (!device) return null; // Previene error si hay asimetría de datos
          
          return (
            <Marker key={pos.id} position={[pos.latitude, pos.longitude]} icon={createMovingIcon(pos.speed)}>
              <Popup>
                <b style={{color: 'black', fontSize:'14px'}}>{device.name}</b><br/>
                <span>Velocidad: {(pos.speed * 1.852).toFixed(1)} km/h</span><br/>
                <span>Ignición: {pos.attributes?.ignition ? 'Encendido 🟢' : 'Apagado 🔴'}</span>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* PANEL FLOTANTE DESPLEGABLE (LISTA DE VEHÍCULOS) */}
      <div style={{ 
        position: 'absolute', 
        top: 15, 
        right: 15, 
        bottom: isListOpen ? 15 : 'auto', 
        width: isListOpen ? (isMobile ? 'calc(100% - 30px)' : '320px') : '44px', 
        height: isListOpen ? 'auto' : '44px',
        maxHeight: isListOpen ? 'calc(100% - 30px)' : '44px',
        backgroundColor: 'rgba(15, 23, 42, 0.85)', 
        backdropFilter: 'blur(16px)', 
        borderRadius: '14px', 
        border: '1px solid rgba(255,255,255,0.08)', 
        zIndex: 1000, 
        display: 'flex', 
        flexDirection: 'column', 
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden' 
      }}>
        <div style={{ 
          padding: isListOpen ? '14px 16px' : '0', 
          height: isListOpen ? 'auto' : '100%',
          borderBottom: isListOpen ? '1px solid rgba(255,255,255,0.08)' : 'none', 
          display: 'flex', 
          justifyContent: isListOpen ? 'space-between' : 'center', 
          alignItems: 'center' 
        }}>
          {isListOpen && (
            <div>
              <h3 style={{ margin: 0, color: '#F3F4F6', fontSize: '14px', fontWeight: '700' }}>Flota Compartida ({devices.length})</h3>
              <p style={{ margin: '2px 0 0 0', color: '#9CA3AF', fontSize: '10px', fontWeight: '600' }}>
                <span style={{ color: '#10B981' }}>{movingCount} Mov.</span> / <span style={{ color: '#EF4444' }}>{stoppedCount} Det.</span>
              </p>
            </div>
          )}
          <button onClick={() => setIsListOpen(!isListOpen)} style={{ 
            background: isListOpen ? 'rgba(255,255,255,0.05)' : 'transparent', 
            border: 'none', color: '#9CA3AF', cursor: 'pointer', 
            fontSize: isListOpen ? '14px' : '18px', width: isListOpen ? '28px' : '100%', 
            height: isListOpen ? '28px' : '100%', borderRadius: '8px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' 
          }}>
            {isListOpen ? '✕' : '🚚'}
          </button>
        </div>

        {isListOpen && (
          <div style={{ overflowY: 'auto', flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {devices.map(device => {
              // Buscar la posición EXACTA de este deviceId
              const pos = positions.find(p => p.deviceId === device.id);
              if (!pos) return null;

              const isMoving = pos.speed > 0;
              const ignition = pos.attributes?.ignition;
              const hasIgnition = ignition !== undefined && ignition !== null;
              const isSelected = mapTarget?.deviceId === device.id;

              return (
                <div 
                  key={device.id} 
                  onClick={() => handleDeviceClick(pos)}
                  style={{ 
                    padding: '12px', borderRadius: '10px', cursor: 'pointer', 
                    backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.18)' : 'rgba(255,255,255,0.02)', 
                    border: isSelected ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255,255,255,0.04)', 
                    transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: '10px' 
                  }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isMoving ? '#10B981' : '#EF4444', boxShadow: `0 0 8px ${isMoving ? '#10B981' : '#EF4444'}`, flexShrink: 0 }}></div>
                  
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: isSelected ? '#60A5FA' : '#F9FAFB', fontSize: '12.5px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', fontWeight: '600' }}>
                        {device.name}
                      </strong>
                      
                      {hasIgnition && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 5px', borderRadius: '4px', backgroundColor: ignition ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.2)', border: `1px solid ${ignition ? 'rgba(16, 185, 129, 0.3)' : 'rgba(107, 114, 128, 0.3)'}` }}>
                          <span style={{ fontSize: '9px', color: ignition ? '#10B981' : '#9CA3AF', fontWeight: '800' }}>
                            {ignition ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '500' }}>
                        {(pos.speed * 1.852).toFixed(0)} km/h
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  );
}