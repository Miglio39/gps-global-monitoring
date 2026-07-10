import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Componente para forzar el centrado del mapa
function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, 15);
  return null;
}

export default function PublicTracking() {
  const { token } = useParams(); // Rescata el token secreto de la URL
  const [device, setDevice] = useState(null);
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState('loading'); // loading, active, expired

  const BASE_URL = 'https://api.labtesting.online';

  useEffect(() => {
    if (!token) { setStatus('expired'); return; }

    const fetchLiveLocation = async () => {
      try {
        const headers = { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' };
        
        // Petición a Traccar usando el token del enlace
        const [resDevices, resPositions] = await Promise.all([
          fetch(`${BASE_URL}/api/devices`, { headers }), 
          fetch(`${BASE_URL}/api/positions`, { headers })
        ]);

        // Si responde 401, el enlace fue revocado o el tiempo expiró automáticamente en Traccar
        if (resDevices.status === 401 || resPositions.status === 401) {
          setStatus('expired');
          return;
        }

        if (resDevices.ok && resPositions.ok) {
          const devs = await resDevices.json();
          const posArray = await resPositions.json();
          
          if (devs.length > 0 && posArray.length > 0) {
            setDevice(devs[0]); // El usuario temporal solo tiene 1 vehículo
            setPosition(posArray[0]);
            setStatus('active');
          } else {
            setStatus('expired');
          }
        }
      } catch (error) {
        console.error("Error conectando con GPS:", error);
        setStatus('expired');
      }
    };

    fetchLiveLocation();
    // Actualizar cada 5 segundos
    const interval = setInterval(fetchLiveLocation, 5000);
    return () => clearInterval(interval);
  }, [token]);

  // Ícono personalizado para el mapa público
  const movingIcon = new L.DivIcon({
    html: `<div style="background-color: #2563EB; border: 3px solid white; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 0 10px rgba(37, 99, 235, 0.8);"></div>`,
    className: 'custom-moving-icon',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  if (status === 'loading') {
    return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B1120', color: 'white' }}><h3>Conectando con el GPS...</h3></div>;
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

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative', overflow: 'hidden' }}>
      
      {/* MAPA A PANTALLA COMPLETA */}
      <MapContainer center={[position.latitude, position.longitude]} zoom={15} style={{ height: '100%', width: '100%' }}>
        <ChangeView center={[position.latitude, position.longitude]} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        
        <Marker position={[position.latitude, position.longitude]} icon={movingIcon}>
          <Popup>
            <b style={{color: 'black'}}>{device?.name}</b><br/>
            <span>Velocidad: {(position.speed * 1.852).toFixed(1)} km/h</span>
          </Popup>
        </Marker>
      </MapContainer>

      {/* TARJETA FLOTANTE DE INFORMACIÓN (Estilo Uber) */}
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
          <h3 style={{ margin: 0, color: 'white', fontSize: '15px' }}>{device?.name || 'Vehículo'}</h3>
          <p style={{ margin: 0, color: '#10B981', fontSize: '13px', fontWeight: 'bold' }}>
            {(position.speed * 1.852).toFixed(0)} km/h • {position.attributes?.ignition ? 'Encendido' : 'Apagado'}
          </p>
        </div>
      </div>

    </div>
  );
}