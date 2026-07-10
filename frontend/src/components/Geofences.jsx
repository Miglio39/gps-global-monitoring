import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
};

export default function Geofences() {
  const [geofences, setGeofences] = useState([]);
  const [devices, setDevices] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [name, setName] = useState('');
  const [radius, setRadius] = useState(300);
  const [center, setCenter] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState('ALL'); 

  const BASE_URL = 'https://api.labtesting.online/api';
  const token = localStorage.getItem('traccar_token');

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Basic ${token}`
  });

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const geoRes = await fetch(`${BASE_URL}/geofences`, { headers: getHeaders() });
      if (geoRes.ok) setGeofences(await geoRes.json());

      const devRes = await fetch(`${BASE_URL}/devices`, { headers: getHeaders() });
      if (devRes.ok) setDevices(await devRes.json());
    } catch (error) {
      console.error("Error al cargar datos:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, [token]);

  const handleSaveGeofence = async (e) => {
    e.preventDefault();
    if (!center || !name.trim()) {
      alert('Asigna un nombre y haz clic sobre el mapa para fijar el centro de la zona.');
      return;
    }

    setIsSaving(true);
    const areaWKT = `CIRCLE (${center[0]} ${center[1]}, ${radius})`;

    const carName = selectedDevice === 'ALL' 
      ? 'Todos los vehículos' 
      : devices?.find(d => d.id === Number(selectedDevice))?.name || 'Vehículo específico';

    const geofencePayload = {
      name: name,
      description: `Asignado a: ${carName}`, 
      area: areaWKT,
      attributes: { assignedTo: carName }
    };

    try {
      const response = await fetch(`${BASE_URL}/geofences`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(geofencePayload)
      });

      if (response.ok) {
        const newGeofence = await response.json(); 

        if (selectedDevice === 'ALL') {
          const permissionPromises = devices.map(device => 
            fetch(`${BASE_URL}/permissions`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify({ deviceId: device.id, geofenceId: newGeofence.id })
            })
          );
          await Promise.all(permissionPromises);
          alert('✅ Geocerca creada y vinculada a TODOS los vehículos.');
        } else {
          await fetch(`${BASE_URL}/permissions`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ deviceId: Number(selectedDevice), geofenceId: newGeofence.id })
          });
          alert(`✅ Geocerca vinculada exclusivamente a: ${carName}.`);
        }

        setName('');
        setCenter(null);
        setRadius(300);
        setSelectedDevice('ALL');
        fetchData(); 
      } else {
        alert('❌ Error en el servidor al intentar registrar la geocerca.');
      }
    } catch (error) {
      console.error(error);
      alert('❌ Hubo un error de red al procesar la solicitud.');
    }
    setIsSaving(false);
  };

  const handleDeleteGeofence = async (id) => {
    if (!window.confirm('¿Deseas eliminar permanentemente esta geocerca?')) return;
    try {
      const response = await fetch(`${BASE_URL}/geofences/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (response.ok) fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const parseWKTtoCircle = (wktString) => {
    if (wktString && wktString.startsWith('CIRCLE')) {
      const matches = wktString.match(/CIRCLE \(([-\d.]+) ([-\d.]+), ([-\d.]+)\)/);
      if (matches) return { lat: parseFloat(matches[1]), lng: parseFloat(matches[2]), radius: parseFloat(matches[3]) };
    }
    return null;
  };

  const getAssignedName = (geo) => {
    if (geo.attributes?.assignedTo) return geo.attributes.assignedTo;
    if (geo.description && geo.description.includes('Asignado a:')) return geo.description.replace('Asignado a: ', '');
    return 'Todos los vehículos'; 
  };

  return (
    <>
      <style>{`
        .geo-layout { display: flex; height: 100%; width: 100%; background-color: #0B1120; font-family: 'Inter', sans-serif; color: #9CA3AF; overflow: hidden; }
        .geo-panel { width: 320px; background-color: #111827; border-right: 1px solid #1F2937; display: flex; flex-direction: column; padding: 20px; overflow-y: auto; box-sizing: border-box; gap: 20px; flex-shrink: 0; }
        .geo-map-container { flex: 1; position: relative; height: 100%; }
        .geo-title { font-size: 16px; font-weight: 700; color: #FFFFFF; margin: 0 0 4px 0; }
        .geo-subtitle { font-size: 12px; color: #6B7280; margin: 0; }
        .geo-form { background-color: #0B1120; border: 1px solid #1F2937; padding: 15px; border-radius: 8px; display: flex; flex-direction: column; gap: 12px; }
        .geo-input { background-color: #111827; border: 1px solid #1F2937; border-radius: 6px; padding: 8px 12px; color: #FFFFFF; font-size: 13px; outline: none; transition: border 0.2s ease; width: 100%; box-sizing: border-box; }
        .geo-label { font-size: 12px; color: #9CA3AF; display: flex; justify-content: space-between; margin-bottom: 4px; }
        .geo-slider { width: 100%; accent-color: #2563EB; cursor: pointer; margin: 4px 0; }
        .geo-status-box { font-size: 12px; padding: 8px; border-radius: 6px; text-align: center; font-weight: 500; }
        .status-waiting { background-color: rgba(245, 158, 11, 0.1); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.2); }
        .status-ready { background-color: rgba(16, 185, 129, 0.1); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.2); }
        .geo-btn-submit { background-color: #2563EB; color: #FFFFFF; border: none; border-radius: 6px; padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .geo-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .geo-list-title { font-size: 13px; font-weight: 600; color: #FFFFFF; margin: 5px 0 10px 0; border-bottom: 1px solid #1F2937; padding-bottom: 6px; }
        .geo-list-wrapper { display: flex; flex-direction: column; gap: 8px; }
        .geo-card { background-color: #0B1120; border: 1px solid #1F2937; border-radius: 6px; padding: 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .geo-card-info { display: flex; flex-direction: column; overflow: hidden; }
        .geo-card-name { font-size: 13px; font-weight: 600; color: #E5E7EB; }
        .geo-card-desc { font-size: 11px; color: #4B5563; margin-top: 2px; }
        .geo-btn-delete { background: transparent; border: none; color: #EF4444; cursor: pointer; font-size: 14px; padding: 4px; border-radius: 4px; }

        /* MAGIA RESPONSIVA */
        @media (max-width: 768px) {
          .geo-layout { flex-direction: column-reverse; overflow-y: auto; }
          .geo-panel { width: 100%; height: auto; border-right: none; border-top: 1px solid #1F2937; padding: 15px; }
          .geo-map-container { min-height: 450px; flex: none; height: 45vh; }
        }
      `}</style>

      <div className="geo-layout">
        <div className="geo-panel">
          <div>
            <h2 className="geo-title">Geocercas virtuales</h2>
            <p className="geo-subtitle">Crea perímetros de control en tiempo real.</p>
          </div>

          <form onSubmit={handleSaveGeofence} className="geo-form">
            <div>
              <label className="geo-label">Asignar a:</label>
              <select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} className="geo-input">
                <option value="ALL">🚗 Todos los vehículos de la flota</option>
                <optgroup label="Vehículos Específicos">
                  {devices?.map(device => (
                    <option key={device.id} value={device.id}>{device.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <input type="text" placeholder="Nombre de la geocerca..." value={name} onChange={(e) => setName(e.target.value)} className="geo-input" required />

            <div>
              <div className="geo-label">
                <span>Radio asignado</span>
                <span style={{ color: '#2563EB', fontWeight: 'bold' }}>
                  {radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}
                </span>
              </div>
              <input type="range" min="50" max="20000" step="100" value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="geo-slider" />
            </div>

            {!center ? (
              <div className="geo-status-box status-waiting">📍 Haz clic en el mapa para fijar el centro</div>
            ) : (
              <div className="geo-status-box status-ready">✔️ Centro fijado correctamente</div>
            )}

            <button type="submit" disabled={!center || !name.trim() || isSaving} className="geo-btn-submit">
              {isSaving ? 'Vinculando...' : 'Guardar zona'}
            </button>
          </form>

          <div>
            <h3 className="geo-list-title">Zonas configuradas ({geofences.length})</h3>
            <div className="geo-list-wrapper">
              {loading && <div style={{ fontSize: '12px', color: '#6B7280' }}>Cargando zonas...</div>}
              {!loading && geofences.length === 0 && (
                <div style={{ fontSize: '12px', color: '#4B5563', textAlign: 'center', padding: '10px 0' }}>No hay geocercas en la cuenta.</div>
              )}
              {geofences.map((geo) => {
                const circleInfo = parseWKTtoCircle(geo.area);
                const assignedName = getAssignedName(geo);
                return (
                  <div key={geo.id} className="geo-card">
                    <div className="geo-card-info">
                      <span className="geo-card-name">{geo.name}</span>
                      <span className="geo-card-desc">
                        {circleInfo ? (circleInfo.radius >= 1000 ? `Radio: ${(circleInfo.radius / 1000).toFixed(1)}km` : `Radio: ${circleInfo.radius}m`) : 'Área poligonal'}
                      </span>
                      <span style={{ fontSize: '10px', color: '#3B82F6', marginTop: '4px', fontWeight: '700' }}>🎯 {assignedName}</span>
                    </div>
                    <button type="button" onClick={() => handleDeleteGeofence(geo.id)} className="geo-btn-delete" title="Eliminar geocerca">🗑️</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="geo-map-container">
          <MapContainer center={[4.1420, -73.6266]} zoom={13} style={{ width: '100%', height: '100%', zIndex: 1 }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
            <MapClickHandler onMapClick={setCenter} />
            {geofences.map((geo) => {
              const circleData = parseWKTtoCircle(geo.area);
              const assignedName = getAssignedName(geo);
              if (circleData) {
                return (
                  <Circle key={geo.id} center={[circleData.lat, circleData.lng]} radius={circleData.radius} pathOptions={{ color: '#2563EB', fillColor: '#2563EB', fillOpacity: 0.25, weight: 2 }}>
                    <Popup>
                      <div style={{ color: '#111827', fontFamily: 'sans-serif' }}>
                        <strong style={{ fontSize: '13px' }}>{geo.name}</strong><br/>
                        <span style={{ fontSize: '11px', color: '#6B7280' }}>Radio: {circleData.radius >= 1000 ? `${(circleData.radius / 1000).toFixed(1)} km` : `${circleData.radius} m`}</span><br/>
                        <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 'bold', display: 'block', marginTop: '3px' }}>🎯 {assignedName}</span>
                      </div>
                    </Popup>
                  </Circle>
                );
              }
              return null;
            })}
            {center && <Circle center={center} radius={radius} pathOptions={{ color: '#10B981', fillColor: '#10B981', fillOpacity: 0.4, dashArray: '6, 6', weight: 2 }} />}
          </MapContainer>
        </div>
      </div>
    </>
  );
}