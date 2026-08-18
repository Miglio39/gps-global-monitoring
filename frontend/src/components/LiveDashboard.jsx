import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { API_BASE } from '../config';

// Función auxiliar para centrar el mapa
function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

// === GALERÍA DE SPRITES ===
const VEHICLE_SPRITES = {
  automovil: { label: 'Carro', url: 'https://img.icons8.com/fluency/96/car.png' },
  camioneta: { label: 'Camioneta', url: 'https://img.icons8.com/color/96/pickup.png' }, 
  van: { label: 'Van', url: 'https://img.icons8.com/fluency/96/van.png' },
  camion: { label: 'Camión', url: 'https://img.icons8.com/fluency/96/truck.png' },
  tractocamion: { label: 'Semi-Truck', url: 'https://img.icons8.com/color/96/container-truck.png' }, 
  volqueta: { label: 'Volqueta', url: 'https://img.icons8.com/color/96/dump-truck.png' }, 
  taxi: { label: 'Taxi', url: 'https://img.icons8.com/fluency/96/taxi.png' },
  furgon: { label: 'Reparto', url: 'https://img.icons8.com/color/96/in-transit.png' },
  grua: { label: 'Grúa', url: 'https://img.icons8.com/color/96/tow-truck.png' },
  moto: { label: 'Moto', url: 'https://img.icons8.com/fluency/96/motorcycle.png' },
  scooter: { label: 'Scooter', url: 'https://img.icons8.com/fluency/96/scooter.png' },
  bus: { label: 'Bus', url: 'https://img.icons8.com/fluency/96/bus.png' },
  tractor: { label: 'Tractor', url: 'https://img.icons8.com/fluency/96/tractor.png' },
  ambulancia: { label: 'Ambulancia', url: 'https://img.icons8.com/fluency/96/ambulance.png' },
  patrulla: { label: 'Policía', url: 'https://img.icons8.com/fluency/96/police-car.png' },
  bicicleta: { label: 'Bicicleta', url: 'https://img.icons8.com/fluency/96/bicycle.png' }
};

export default function LiveDashboard({ devices, positions }) {
  const [map, setMap] = useState(null); 
  const [hasInitialCentered, setHasCentered] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [filter, setFilter] = useState('all');
  
  const [searchTerm, setSearchTerm] = useState('');

  // Lógica Responsive
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isListOpen, setIsListOpen] = useState(window.innerWidth >= 768);

  const [armedDevices, setArmedDevices] = useState({});

  // ESTADO DE EDICIÓN DE ÍCONO
  const [iconEditModal, setIconEditModal] = useState({ isOpen: false, device: null });
  const [localCategories, setLocalCategories] = useState({}); 

  // === CONFIGURACIÓN DE MAPAS ===
  const [mapStyle, setMapStyle] = useState('streets'); 
  const [showLayerMenu, setShowLayerMenu] = useState(false); 

  const MAP_TILES = {
    dark: { name: '🌙 Oscuro', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; CartoDB' },
    googleHybrid: { name: '🌍 Híbrido', url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', attribution: '&copy; Google Maps' },
    googleSat: { name: '🛰️ Satélite', url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attribution: '&copy; Google Maps' },
    streets: { name: '🗺️ Calles', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap' }
  };

  useEffect(() => {
    let prevWidth = window.innerWidth;
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      const mobile = currentWidth < 768;
      setIsMobile(mobile);
      if (mobile && prevWidth >= 768) { setIsListOpen(false); }
      prevWidth = currentWidth;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const token = localStorage.getItem('traccar_token');
  const getDevicePosition = (deviceId) => positions[deviceId];

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

  useEffect(() => {
    try {
      const hasNotificationAPI = 'Notification' in window;

      if (hasNotificationAPI && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission().catch(e => console.warn("Permisos ignorados", e));
      }

      let alarmTriggered = false;
      let deviceNameTriggered = '';
      
      const updatedArmedDevices = { ...armedDevices }; 

      Object.keys(armedDevices).forEach(deviceIdStr => {
        const deviceId = parseInt(deviceIdStr);
        const isArmed = armedDevices[deviceId];
        const pos = positions[deviceId];
        
        if (pos) {
          const isMoving = pos.speed > 0;
          const physicalIgnition = pos.attributes?.ignition;
          const isEngineOn = isMoving || physicalIgnition;

          if (isArmed && isEngineOn) {
            alarmTriggered = true;
            deviceNameTriggered = devices.find(d => d.id === deviceId)?.name || 'Vehículo';
            updatedArmedDevices[deviceId] = false; 
          }
        }
      });

      if (alarmTriggered) {
        setArmedDevices(updatedArmedDevices);

        try {
          const alarmSound = new Audio('/alarma-agresiva.mp3'); 
          alarmSound.loop = false;
          alarmSound.play().catch(e => console.warn("Audio bloqueado por falta de interacción:", e));
        } catch (audioErr) {
          console.error("Error en el objeto Audio:", audioErr);
        }

        try {
          if (hasNotificationAPI && Notification.permission === "granted") {
            new Notification("🚨 ¡ALERTA DE SEGURIDAD!", {
              body: `El vehículo "${deviceNameTriggered}" ha sido ENCENDIDO o MOVIDO.`,
              icon: '/favicon.ico', 
              vibrate: [500, 250, 500, 250, 500] 
            });
          } else {
            alert(`🚨 ¡ALERTA DE SEGURIDAD!\n\nEl vehículo "${deviceNameTriggered}" ha sido ENCENDIDO o MOVIDO.`);
          }
        } catch (notifError) {
          alert(`🚨 ¡ALERTA DE SEGURIDAD!\n\nEl vehículo "${deviceNameTriggered}" ha sido ENCENDIDO o MOVIDO.`);
        }
      }
    } catch (error) {
      console.error("Error crítico general manejado:", error);
    }
  }, [positions, armedDevices, devices]);

  const totalCount = devices.length;
  const onlineCount = devices.filter(d => d.status === 'online' && !d.disabled).length;
  const unknownCount = devices.filter(d => !d.lastUpdate && !d.disabled).length; 
  const offlineCount = devices.filter(d => d.status !== 'online' && d.lastUpdate && !d.disabled).length; 
  const movingCount = Object.values(positions).filter(p => p && p.speed > 0).length;
  const stoppedCount = Object.values(positions).filter(p => p && p.speed === 0).length;

  const handleEngineControl = async (deviceId, deviceName, stopEngine) => {
    const actionText = stopEngine ? 'APAGAR EL MOTOR' : 'HABILITAR EL ENCENDIDO';
    const commandData = stopEngine ? 'RELAY,1#' : 'RELAY,0#';

    if (!window.confirm(`⚠️ CONFIRMACIÓN DE SEGURIDAD\n\n¿Estás seguro de que deseas ${actionText} de "${deviceName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/commands/send`, {
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

      if (response.ok) {
        alert(`✅ Comando enviado a "${deviceName}".`);
      } else {
        const errorText = await response.text();
        alert(`❌ Error en Servidor Traccar (${response.status}): ${errorText}`);
      }
    } catch (error) {
      console.error(error);
      alert("❌ Error de red: No se pudo conectar con el servidor.");
    }
  };

  const handleSaveIcon = async (newCategory) => {
    const device = iconEditModal.device;
    if (!device) return;

    setLocalCategories(prev => ({ ...prev, [device.id]: newCategory }));
    setIconEditModal({ isOpen: false, device: null });

    try {
      const updatedDevice = { ...device, category: newCategory };
      const response = await fetch(`${API_BASE}/api/devices/${device.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDevice)
      });
      if (!response.ok) { throw new Error('No se pudo guardar la configuración'); }
    } catch (error) { console.error(error); }
  };

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

  // === MARCADOR ESTILO SPRITE ===
  const createCustomMarker = (device, speed, status) => {
    const isMoving = speed > 0;
    const isUnknown = !device.lastUpdate; 
    
    let statusColor = '#8B5CF6'; 
    // 🔴 LA MAGIA: Si está suspendido, el marcador se vuelve gris muy oscuro
    if (device.disabled) statusColor = '#374151'; 
    else if (isUnknown) statusColor = '#9CA3AF'; 
    else if (status !== 'online') statusColor = '#EF4444'; 
    else if (isMoving) statusColor = '#10B981'; 

    const categoryKey = localCategories[device.id] || device.category || 'automovil';
    const spriteUrl = VEHICLE_SPRITES[categoryKey] ? VEHICLE_SPRITES[categoryKey].url : VEHICLE_SPRITES.automovil.url;
    
    const html = `
      <div style="display: flex; flex-direction: column; align-items: center; transform: translateY(-50%); opacity: ${device.disabled ? '0.6' : '1'};">
        <img 
          src="${spriteUrl}" 
          onerror="this.onerror=null;this.src='https://img.icons8.com/fluency/96/car.png';"
          style="width: 25px; height: 25px; object-fit: contain; filter: drop-shadow(0px 6px 4px rgba(0,0,0,0.5)) ${device.disabled ? 'grayscale(100%)' : ''};" 
          alt="sprite" 
        />
        <div style="background: rgba(15, 23, 42, 0.9); padding: 2px 6px; border-radius: 4px; font-size: 10px; font-family: 'Inter', Arial, sans-serif; font-weight: 700; color: #F3F4F6; white-space: nowrap; border: 1px solid rgba(255,255,255,0.1); border-bottom: 3px solid ${statusColor}; box-shadow: 0 4px 6px rgba(0,0,0,0.4); margin-top: -4px;">
          ${device.disabled ? '🚫 ' : ''}${device.name}
        </div>
      </div>
    `;
    
    return L.divIcon({ 
      className: 'traccar-videogame-pin', 
      html: html, 
      iconAnchor: [10, 10], 
      popupAnchor: [0, -25] 
    });
  };

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
    const isUnknown = !device.lastUpdate;
    const isOnline = device.status === 'online';
    const isOffline = device.status !== 'online' && !isUnknown; 

    let matchesStatus = true;
    if (filter === 'moving') matchesStatus = isMoving && isOnline && !device.disabled;
    if (filter === 'stopped') matchesStatus = isStopped && isOnline && !device.disabled;
    if (filter === 'online') matchesStatus = isOnline && !device.disabled;
    if (filter === 'offline') matchesStatus = isOffline && !device.disabled;
    if (filter === 'unknown') matchesStatus = isUnknown && !device.disabled; 

    const matchesSearch = device.name.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch; 
  });

  const handleDeviceClick = (device, pos) => {
    setSelectedDevice(device);
    if (pos && map) map.flyTo([pos.latitude, pos.longitude], 16, { animate: true, duration: 1.5 });
    
    if (isMobile) {
      setIsListOpen(false);
    }
  };

  const openStreetView = (lat, lng) => {
    if (!lat || !lng) return;
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    window.open(url, '_blank');
  };

  return (
    <main style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      
      {/* MAPA */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 0 }}>
        
        <div style={{ position: 'absolute', top: '80px', left: '10px', zIndex: 9999, pointerEvents: 'auto' }}>
          <div 
            onClick={(e) => {
              e.stopPropagation();
              setShowLayerMenu(!showLayerMenu);
            }}
            title="Cambiar vista del mapa"
            style={{ backgroundColor: '#111827', border: '2px solid rgba(0,0,0,0.2)', borderRadius: '4px', width: '34px', height: '34px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', boxShadow: '0 1px 5px rgba(0,0,0,0.65)', color: mapStyle !== 'dark' ? '#60A5FA' : '#9CA3AF', transition: 'all 0.2s ease' }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M11.99 2.5l-9.5 5.5 9.5 5.5 9.5-5.5-9.5-5.5zm0 13.5l-9.5-5.5-2 1.16 11.5 6.66 11.5-6.66-2-1.16-9.5 5.5zm0 5.25l-9.5-5.5-2 1.16 11.5 6.66 11.5-6.66-2-1.16-9.5 5.5z"/>
            </svg>
          </div>

          {showLayerMenu && (
            <div style={{ position: 'absolute', top: '0', left: '42px', backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '6px', padding: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '2px', width: '140px' }}>
              {Object.keys(MAP_TILES).map((key) => (
                <button key={key} onClick={(e) => { e.stopPropagation(); setMapStyle(key); setShowLayerMenu(false); }} style={{ backgroundColor: mapStyle === key ? '#2563EB' : 'transparent', color: mapStyle === key ? 'white' : '#9CA3AF', border: 'none', borderRadius: '4px', padding: '8px 10px', fontSize: '12px', fontWeight: 'bold', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s ease-in-out' }}>
                  {MAP_TILES[key].name}
                </button>
              ))}
            </div>
          )}
        </div>

        <MapContainer center={[4.142, -73.626]} zoom={13} style={{ height: '100%', width: '100%' }} ref={setMap} onClick={() => setShowLayerMenu(false)}>
          <TileLayer url={MAP_TILES[mapStyle].url} attribution={MAP_TILES[mapStyle].attribution} />          
          
          <MarkerClusterGroup chunkedLoading maxClusterRadius={80} iconCreateFunction={createClusterCustomIcon}>
            {filteredDevices.map(device => {
              const pos = getDevicePosition(device.id);
              if (!pos) return null; 
              
              const batteryInfo = getBatteryInfo(device, pos);
              const isMoving = pos.speed > 0;
              const rawIgnition = pos.attributes?.ignition;
              const hasIgnition = (rawIgnition !== undefined && rawIgnition !== null) || isMoving;
              const finalIgnition = isMoving ? true : rawIgnition;

              const isUnknown = !device.lastUpdate;

              // 🔴 LA MAGIA DEL POPUP: Detectar suspensión para el usuario
              const estadoStr = device.disabled 
                ? '🚫 Suspendido por Falta de Pago' 
                : (isUnknown ? '⚪ Nunca conectado' : (device.status === 'online' ? '🟢 Conectado' : '🔴 Apagado'));
              
              const ultimaConexion = device.lastUpdate ? new Date(device.lastUpdate).toLocaleString('es-CO') : 'Desconocida';

              return (
                <Marker 
                  key={device.id} 
                  position={[pos.latitude, pos.longitude]} 
                  icon={createCustomMarker(device, pos.speed, device.status)}
                  eventHandlers={{ click: () => handleDeviceClick(device, pos) }}
                >
                  <Popup>
                    <b style={{color: device.disabled ? '#EF4444' : 'black', fontSize:'13px', textDecoration: device.disabled ? 'line-through' : 'none'}}>
                      {device.name}
                    </b><br/>
                    <span style={{color:'#666', fontSize:'12px'}}>Velocidad: {(pos.speed * 1.852).toFixed(1)} km/h</span><br/>
                    <span style={{color: device.disabled ? '#EF4444' : '#666', fontSize:'11px', fontWeight: device.disabled ? 'bold' : 'normal'}}>
                      Estado: {estadoStr}
                    </span><br/>
                    <span style={{color:'#666', fontSize:'11px'}}>Últ. conexión: {ultimaConexion}</span><br/>
                    {hasIgnition && !device.disabled && (<span style={{color: finalIgnition ? '#10B981' : '#6B7280', fontSize:'11px'}}>🔑 Motor: {finalIgnition ? 'Encendido' : 'Apagado'}</span>)}<br/>
                    {batteryInfo.text && !device.disabled && (<span style={{color: batteryInfo.color, fontSize:'11px', fontWeight: 'bold'}}>Batería: {batteryInfo.text}</span>)}
                    
                    <div style={{ marginTop: '10px' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); openStreetView(pos.latitude, pos.longitude); }}
                        style={{ backgroundColor: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 0', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                      >
                        👁️ Ver Street View
                      </button>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      {/* 🛠️ KPIs */}
      {!isMobile && (
        <div style={{ position: 'absolute', bottom: 30, left: 15, zIndex: 1000, display: 'flex', flexWrap: 'wrap', gap: '8px', pointerEvents: 'none', maxWidth: 'calc(100vw - 30px)' }}>
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
            <span style={styles.kpiLabel}>Apagados</span><span style={{...styles.kpiValue, color: '#EF4444'}}>{offlineCount}</span>
          </div>
          <div onClick={() => setFilter('unknown')} style={{...styles.kpiCard, pointerEvents: 'auto', border: filter === 'unknown' ? '1.5px solid #9CA3AF' : '1px solid rgba(255,255,255,0.1)'}}>
            <span style={styles.kpiLabel}>Nunca</span><span style={{...styles.kpiValue, color: '#9CA3AF'}}>{unknownCount}</span>
          </div>
        </div>
      )}

      {/* PANEL FLOTANTE DE UNIDADES */}
      <div style={{ 
        position: 'absolute', top: 15, right: 15, bottom: isListOpen ? 15 : 'auto', 
        width: isListOpen ? (isMobile ? 'calc(100% - 30px)' : '380px') : '44px', 
        height: isListOpen ? 'auto' : '44px', maxHeight: isListOpen ? 'calc(100% - 30px)' : '44px',
        backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', borderRadius: '14px', 
        border: '1px solid rgba(255,255,255,0.08)', zIndex: 1000, display: 'flex', flexDirection: 'column', 
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', overflow: 'hidden' 
      }}>
        
        <div style={{ padding: isListOpen ? '14px 16px' : '0', height: isListOpen ? 'auto' : '100%', borderBottom: isListOpen ? '1px solid rgba(255,255,255,0.08)' : 'none', display: 'flex', justifyContent: isListOpen ? 'space-between' : 'center', alignItems: 'center' }}>
          {isListOpen && (
            <div>
              <h3 style={{ margin: 0, color: '#F3F4F6', fontSize: '14px', fontWeight: '700' }}>Flota Activa ({filteredDevices.length})</h3>
              <p style={{ margin: '2px 0 0 0', color: '#9CA3AF', fontSize: '10px', textTransform: 'uppercase', fontWeight: '600' }}>Filtro: {filter}</p>
            </div>
          )}
          <button onClick={() => setIsListOpen(!isListOpen)} style={{ background: isListOpen ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: isListOpen ? '14px' : '18px', width: isListOpen ? '28px' : '100%', height: isListOpen ? '28px' : '100%', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
            {isListOpen ? '✕' : '🚚'}
          </button>
        </div>

        {isListOpen && (
          <div style={{ padding: '10px 16px 0 16px' }}>
            <input 
              type="text" 
              placeholder="🔍 Buscar vehículo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.3)', color: '#F3F4F6', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {isListOpen && (
          <div style={{ overflowY: 'auto', flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredDevices.map(device => {
              const pos = getDevicePosition(device.id);
              const isMoving = pos && pos.speed > 0;
              const isSelected = selectedDevice?.id === device.id;
              const isArmed = armedDevices[device.id] || false;
              
              const isUnknown = !device.lastUpdate;

              // 🔴 LA MAGIA EN LA LISTA LATERAL: Colores y textos
              let statusDotColor = '#8B5CF6'; 
              if (device.disabled) statusDotColor = '#374151'; // Suspendido es Gris oscuro
              else if (isUnknown) statusDotColor = '#9CA3AF'; // Gris
              else if (device.status !== 'online') statusDotColor = '#EF4444'; // Rojo
              else if (isMoving) statusDotColor = '#10B981'; // Verde

              let listStatusText = '0 km/h';
              if (device.disabled) listStatusText = '🚫 Servicio Suspendido';
              else if (isUnknown) listStatusText = 'Nunca conectado';
              else if (device.status !== 'online') listStatusText = 'Apagado';
              else if (pos) listStatusText = `${(pos.speed * 1.852).toFixed(0)} km/h`;

              const batteryInfo = getBatteryInfo(device, pos);
              const rawIgnition = pos?.attributes?.ignition;
              const hasIgnition = (rawIgnition !== undefined && rawIgnition !== null) || isMoving;
              const finalIgnition = isMoving ? true : rawIgnition;

              return (
                <div 
                  key={device.id} 
                  onClick={() => handleDeviceClick(device, pos)}
                  style={{ padding: '12px', borderRadius: '10px', cursor: 'pointer', backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.18)' : 'rgba(255,255,255,0.02)', border: isSelected ? '1px solid rgba(59, 130, 246, 0.4)' : (isArmed ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(255,255,255,0.04)'), transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: '10px', opacity: device.disabled ? 0.6 : 1 }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: statusDotColor, boxShadow: `0 0 8px ${statusDotColor}`, flexShrink: 0 }}></div>
                  
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: isSelected ? '#60A5FA' : (isArmed ? '#FDE047' : '#F9FAFB'), fontSize: '12.5px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', fontWeight: '600', textDecoration: device.disabled ? 'line-through' : 'none' }}>
                        {device.disabled ? '🚫 ' : ''}{device.name}
                      </strong>
                      
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                        {hasIgnition && !device.disabled && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 5px', borderRadius: '4px', backgroundColor: finalIgnition ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.2)', border: `1px solid ${finalIgnition ? 'rgba(16, 185, 129, 0.3)' : 'rgba(107, 114, 128, 0.3)'}` }} title={finalIgnition ? 'Motor Encendido' : 'Motor Apagado'}>
                            <span style={{ fontSize: '10px' }}>🔑</span>
                            <span style={{ fontSize: '9px', color: finalIgnition ? '#10B981' : '#9CA3AF', fontWeight: '800' }}>
                              {finalIgnition ? 'ON' : 'OFF'}
                            </span>
                          </div>
                        )}

                        {batteryInfo.text && !device.disabled && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 5px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} title="Nivel de Batería">
                            <span style={{ fontSize: '10px' }}>🔋</span>
                            <span style={{ fontSize: '9px', color: batteryInfo.color, fontWeight: '800' }}>
                              {batteryInfo.text}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: device.disabled ? '#EF4444' : '#9CA3AF', fontWeight: '500' }}>
                        {listStatusText}
                      </span>
                      
                      <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                        
                        {/* 🚫 CONDICIÓN: Si está suspendido, le ocultamos los controles y le mandamos un aviso */}
                        {device.disabled ? (
                           <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 'bold', padding: '2px 0' }}>COMUNICARSE CON ADMINISTRACIÓN</span>
                        ) : (
                          <>
                            <button 
                              title="Cambiar Ícono"
                              onClick={(e) => { e.stopPropagation(); setIconEditModal({ isOpen: true, device: device }); }}
                              style={{ backgroundColor: 'transparent', border: '1px solid rgba(59, 130, 246, 0.5)', color: '#60A5FA', padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
                              onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(59, 130, 246, 0.15)'; }}
                              onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; }}
                            >
                              ✏️ Ícono
                            </button>

                            <button 
                              title={isArmed ? "Desactivar Alarma" : "Activar Alarma de Encendido"}
                              onClick={(e) => { e.stopPropagation(); setArmedDevices(prev => ({...prev, [device.id]: !isArmed})); }}
                              style={{ backgroundColor: isArmed ? 'rgba(234, 179, 8, 0.15)' : 'transparent', border: isArmed ? '1px solid #EAB308' : '1px solid rgba(156, 163, 175, 0.3)', color: isArmed ? '#EAB308' : '#9CA3AF', padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
                              onMouseEnter={(e) => { if(!isArmed) e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'; }}
                              onMouseLeave={(e) => { if(!isArmed) e.target.style.backgroundColor = 'transparent'; }}
                            >
                              {isArmed ? '🔔 Vigilando' : '🔕 Vigilar'}
                            </button>

                            <button 
                              title="Apagar Motor"
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
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODAL PARA ELEGIR EL SPRITE */}
      {iconEditModal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setIconEditModal({ isOpen: false, device: null })}>
          <div style={{
            backgroundColor: '#111827', padding: '20px', borderRadius: '12px',
            border: '1px solid #374151', width: '90%', maxWidth: '420px', 
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '15px'
          }} onClick={e => e.stopPropagation()}>
            
            <h3 style={{ margin: 0, color: 'white', fontSize: '16px', textAlign: 'center' }}>
              Seleccionar Vehículo<br/>
              <span style={{fontSize: '12px', color: '#9CA3AF', fontWeight: 'normal'}}>
                {iconEditModal.device?.name}
              </span>
            </h3>
            
            <div style={{ 
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', 
              maxHeight: '60vh', overflowY: 'auto', padding: '5px' 
            }}>
              {Object.keys(VEHICLE_SPRITES).map(key => {
                const sprite = VEHICLE_SPRITES[key];
                
                return (
                  <button
                    key={key}
                    onClick={() => handleSaveIcon(key)} 
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px', padding: '12px 5px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                      cursor: 'pointer', color: 'white', transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)'; e.currentTarget.style.borderColor = '#3B82F6'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                  >
                    <img 
                      src={sprite.url} 
                      onError={(e) => { e.target.onerror = null; e.target.src = 'https://img.icons8.com/fluency/96/car.png'; }}
                      style={{ width: '32px', height: '32px', objectFit: 'contain' }} 
                      alt={sprite.label} 
                    />
                    <span style={{ fontSize: '10px', fontWeight: 'bold', textAlign: 'center' }}>{sprite.label}</span>
                  </button>
                )
              })}
            </div>
            
            <button 
              onClick={() => setIconEditModal({ isOpen: false, device: null })}
              style={{ marginTop: '5px', padding: '10px', borderRadius: '8px', backgroundColor: '#374151', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#4B5563'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#374151'}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
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