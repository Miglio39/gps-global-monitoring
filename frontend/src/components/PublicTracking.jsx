import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 1. CORRECCIÓN DE UX: Centrado Inteligente (Solo al inicio o al hacer clic en "Ver Todos")
function AutoBounds({ positions, forceUpdate }) {
  const map = useMap();
  const initialCentered = useRef(false);
  const prevForceUpdate = useRef(forceUpdate);

  useEffect(() => {
    if (!positions || positions.length === 0) return;

    // ¿Debe centrarse? SÍ, si es la primera vez que carga la pantalla, o si el usuario apretó un botón para re-centrar.
    const shouldCenter = !initialCentered.current || prevForceUpdate.current !== forceUpdate;

    if (shouldCenter) {
      if (positions.length === 1) {
        map.setView([positions[0].latitude, positions[0].longitude], 15);
      } else {
        const bounds = L.latLngBounds(positions.map(p => [p.latitude, p.longitude]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
      initialCentered.current = true;
      prevForceUpdate.current = forceUpdate;
    }
  }, [positions, forceUpdate, map]);
  return null;
}

// Para hacer FlyTo cuando seleccionas en la lista sin bloquear el mapa luego
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
  const [mapTarget, setMapTarget] = useState(null); 
  const [forceBounds, setForceBounds] = useState(0); 
  
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

  const handleDeviceClick = (pos) => {
    if (pos) {
      setMapTarget(null); // Resetea estado para forzar el re-render
      setTimeout(() => setMapTarget(pos), 10);
      if (isMobile) setIsListOpen(false);
    }
  };

  const handleShowAll = () => {
    setMapTarget(null);
    setForceBounds(prev => prev + 1); 
  };

  // Variables para la tarjeta inferior si es 1 solo dispositivo
  let singleSpeed = 0;
  let singleIgnition = false;
  if (devices.length === 1 && positions.length > 0) {
    singleSpeed = positions[0].speed;
    // 2. CORRECCIÓN LÓGICA DE IGNICIÓN: Si tiene velocidad, está encendido
    singleIgnition = singleSpeed > 0 ? true : (positions[0].attributes?.ignition || false);
  }

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
        
        {positions.map(pos => {
          const device = devices.find(d => d.id === pos.deviceId);
          if (!device) return null; 

          // 2. CORRECCIÓN LÓGICA DE IGNICIÓN PARA EL POPUP
          const isMoving = pos.speed > 0;
          const ignition = isMoving ? true : (pos.attributes?.ignition || false);
          
          return (
            <Marker key={pos.id} position={[pos.latitude, pos.longitude]} icon={createMovingIcon(pos.speed)}>
              <Popup>
                <b style={{color: 'black', fontSize:'14px'}}>{device.name}</b><br/>
                <span>Velocidad: {(pos.speed * 1.852).toFixed(1)} km/h</span><br/>
                <span>Ignición: {ignition ? 'Encendido 🟢' : 'Apagado 🔴'}</span>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* PANEL FLOTANTE DESPLEGABLE (LISTA DE VEHÍCULOS) */}
      <div style={{ 
        position: 'absolute', top: 15, right: 15, bottom: isListOpen ? 15 : 'auto', 
        width: isListOpen ? (isMobile ? 'calc(100% - 30px)' : '320px') : '44px', 
        height: isListOpen ? 'auto' : '44px', maxHeight: isListOpen ? 'calc(100% - 30px)' : '44px',
        backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', 
        borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', zIndex: 1000, 
        display: 'flex', flexDirection: 'column', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', overflow: 'hidden' 
      }}>
        <div style={{ 
          padding: isListOpen ? '14px 16px' : '0', height: isListOpen ? 'auto' : '100%',
          borderBottom: isListOpen ? '1px solid rgba(255,255,255,0.08)' : 'none', 
          display: 'flex', justifyContent: isListOpen ? 'space-between' : 'center', alignItems: 'center' 
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
            background: isListOpen ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', 
            color: '#9CA3AF', cursor: 'pointer', fontSize: isListOpen ? '14px' : '18px', 
            width: isListOpen ? '28px' : '100%', height: isListOpen ? '28px' : '100%', 
            borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' 
          }}>
            {isListOpen ? '✕' : '🚚'}
          </button>
        </div>

        {isListOpen && (
          <div style={{ overflowY: 'auto', flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {devices.map(device => {
              const pos = positions.find(p => p.deviceId === device.id);
              if (!pos) return null;

              // 2. CORRECCIÓN LÓGICA DE IGNICIÓN PARA LA LISTA
              const isMoving = pos.speed > 0;
              const ignition = isMoving ? true : (pos.attributes?.ignition || false);
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
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 5px', borderRadius: '4px', backgroundColor: ignition ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.2)', border: `1px solid ${ignition ? 'rgba(16, 185, 129, 0.3)' : 'rgba(107, 114, 128, 0.3)'}` }}>
                        <span style={{ fontSize: '9px', color: ignition ? '#10B981' : '#9CA3AF', fontWeight: '800' }}>
                          {ignition ? 'ON' : 'OFF'}
                        </span>
                      </div>
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

      {/* TARJETA FLOTANTE INFERIOR (Estilo Uber) */}
      <div style={{
        position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
        backgroundColor: 'rgba(17, 24, 39, 0.9)', backdropFilter: 'blur(10px)',
        padding: '15px 25px', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 1000, width: '90%', maxWidth: '350px',
        display: 'flex', alignItems: 'center', gap: '15px'
      }}>
        <div style={{ width: '40px', height: '40px', backgroundColor: '#2563EB', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '20px' }}>
          🚙
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, color: 'white', fontSize: '15px' }}>
            {devices.length === 1 ? devices[0].name : `Flota Compartida (${devices.length})`}
          </h3>
          {devices.length === 1 ? (
            <p style={{ margin: 0, color: singleSpeed > 0 ? '#10B981' : '#EF4444', fontSize: '13px', fontWeight: 'bold' }}>
              {(singleSpeed * 1.852).toFixed(0)} km/h • {singleIgnition ? 'Encendido' : 'Apagado'}
            </p>
          ) : (
            <p style={{ margin: 0, color: '#9CA3AF', fontSize: '13px', fontWeight: 'bold' }}>
              <span style={{ color: '#10B981' }}>{movingCount} En Ruta</span> • <span style={{ color: '#EF4444' }}>{stoppedCount} Detenidos</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}