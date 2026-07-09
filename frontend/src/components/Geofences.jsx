import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Subcomponente interno para detectar clics en el mapa y posicionar la geocerca
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
  const [loading, setLoading] = useState(false);
  
  // Estados de creación de la nueva geocerca
  const [name, setName] = useState('');
  const [radius, setRadius] = useState(300); // 300 metros de radio base
  const [center, setCenter] = useState(null);

  const BASE_URL = 'https://api.labtesting.online/api';
  const token = localStorage.getItem('traccar_token');

  // Headers estandarizados para Traccar
  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Basic ${token}`
  });

  // 1. Obtener Geocercas desde el Servidor
  const fetchGeofences = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/geofences`, { headers: getHeaders() });
      if (response.ok) {
        const data = await response.json();
        setGeofences(data);
      }
    } catch (error) {
      console.error("Error al cargar geocercas:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGeofences();
  }, [token]);

  // 2. Guardar Geocerca (Formato WKT)
  const handleSaveGeofence = async (e) => {
    e.preventDefault();
    if (!center || !name.trim()) {
      alert('Asigna un nombre y haz clic sobre el mapa para fijar el centro de la zona.');
      return;
    }

    // Convertir datos al formato WKT (Well-Known Text) requerido por Traccar
    const areaWKT = `CIRCLE (${center[0]} ${center[1]}, ${radius})`;

    const geofencePayload = {
      name: name,
      description: 'Creado desde Global GPS Monitor',
      area: areaWKT,
      attributes: {}
    };

    try {
      const response = await fetch(`${BASE_URL}/geofences`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(geofencePayload)
      });

      if (response.ok) {
        setName('');
        setCenter(null);
        setRadius(300);
        fetchGeofences(); // Recargar el listado
      } else {
        alert('Error en el servidor al intentar registrar la geocerca.');
      }
    } catch (error) {
      console.error('Error al guardar geocerca:', error);
    }
  };

  // 3. Eliminar Geocerca de la base de datos
  const handleDeleteGeofence = async (id) => {
    if (!window.confirm('¿Deseas eliminar permanentemente esta geocerca?')) return;
    try {
      const response = await fetch(`${BASE_URL}/geofences/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (response.ok) {
        fetchGeofences();
      }
    } catch (error) {
      console.error('Error al eliminar geocerca:', error);
    }
  };

  // Función de soporte para procesar y dibujar el WKT de Traccar en Leaflet
  const parseWKTtoCircle = (wktString) => {
    if (wktString && wktString.startsWith('CIRCLE')) {
      const matches = wktString.match(/CIRCLE \(([-\d.]+) ([-\d.]+), ([-\d.]+)\)/);
      if (matches) {
        return {
          lat: parseFloat(matches[1]),
          lng: parseFloat(matches[2]),
          radius: parseFloat(matches[3])
        };
      }
    }
    return null;
  };

  return (
    <>
      <style>{`
        .geo-layout {
          display: flex;
          height: 100%;
          width: 100%;
          background-color: #0B1120;
          font-family: 'Inter', sans-serif;
          color: #9CA3AF;
        }

        .geo-panel {
          width: 320px;
          background-color: #111827;
          border-right: 1px solid #1F2937;
          display: flex;
          flex-direction: column;
          padding: 20px;
          overflow-y: auto;
          box-sizing: border-box;
          gap: 20px;
        }

        .geo-map-container {
          flex: 1;
          position: relative;
          height: 100%;
        }

        .geo-title {
          font-size: 16px;
          font-weight: 700;
          color: #FFFFFF;
          margin: 0 0 4px 0;
        }

        .geo-subtitle {
          font-size: 12px;
          color: #6B7280;
          margin: 0;
        }

        .geo-form {
          background-color: #0B1120;
          border: 1px solid #1F2937;
          padding: 15px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .geo-input {
          background-color: #111827;
          border: 1px solid #1F2937;
          border-radius: 6px;
          padding: 8px 12px;
          color: #FFFFFF;
          font-size: 13px;
          outline: none;
          transition: border 0.2s ease;
        }

        .geo-input:focus {
          border-color: #2563EB;
        }

        .geo-label {
          font-size: 12px;
          color: #9CA3AF;
          display: flex;
          justify-content: space-between;
        }

        .geo-slider {
          width: 100%;
          accent-color: #2563EB;
          cursor: pointer;
          margin: 4px 0;
        }

        .geo-status-box {
          font-size: 12px;
          padding: 8px;
          border-radius: 6px;
          text-align: center;
          font-weight: 500;
        }

        .status-waiting {
          background-color: rgba(245, 158, 11, 0.1);
          color: #F59E0B;
          border: 1px solid rgba(245, 158, 11, 0.2);
          animation: pulseGeo 2s infinite ease-in-out;
        }

        .status-ready {
          background-color: rgba(16, 185, 129, 0.1);
          color: #10B981;
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .geo-btn-submit {
          background-color: #2563EB;
          color: #FFFFFF;
          border: none;
          border-radius: 6px;
          padding: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .geo-btn-submit:hover:not(:disabled) {
          background-color: #1D4ED8;
        }

        .geo-btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .geo-list-title {
          font-size: 13px;
          font-weight: 600;
          color: #FFFFFF;
          margin: 5px 0 10px 0;
          border-bottom: 1px solid #1F2937;
          padding-bottom: 6px;
        }

        .geo-list-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .geo-card {
          background-color: #0B1120;
          border: 1px solid #1F2937;
          border-radius: 6px;
          padding: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .geo-card-info {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .geo-card-name {
          font-size: 13px;
          font-weight: 600;
          color: #E5E7EB;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .geo-card-desc {
          font-size: 11px;
          color: #4B5563;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }

        .geo-btn-delete {
          background: transparent;
          border: none;
          color: #EF4444;
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
          border-radius: 4px;
          transition: background-color 0.2s ease;
        }

        .geo-btn-delete:hover {
          background-color: rgba(239, 68, 68, 0.1);
        }

        @keyframes pulseGeo {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        /* AJUSTES RESPONSIVOS COMPATIBLES CON MÓVIL */
        @media (max-width: 768px) {
          .geo-layout {
            flex-direction: column;
          }
          .geo-panel {
            width: 100%;
            height: 260px;
            border-right: none;
            border-bottom: 1px solid #1F2937;
            padding: 12px;
            gap: 12px;
          }
          .geo-map-container {
            flex: 1;
            height: 100%;
          }
        }
      `}</style>

      <div className="geo-layout">
        
        {/* PANEL LATERAL DE CONTROLES */}
        <div className="geo-panel">
          <div>
            <h2 className="geo-title">Geocercas virtuales</h2>
            <p className="geo-subtitle">Crea perímetros de control en tiempo real.</p>
          </div>

          {/* Formulario de Registro */}
          <form onSubmit={handleSaveGeofence} className="geo-form">
            <input 
              type="text" 
              placeholder="Nombre de la geocerca..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="geo-input"
              required
            />

            <div>
              <div className="geo-label">
                <span>Radio asignado</span>
                <span style={{ color: '#2563EB', fontWeight: 'bold' }}>{radius}m</span>
              </div>
              <input 
                type="range" 
                min="50" 
                max="10000" 
                step="50"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="geo-slider"
              />
            </div>

            {!center ? (
              <div className="geo-status-box status-waiting">
                📍 Haz clic en el mapa para fijar el centro
              </div>
            ) : (
              <div className="geo-status-box status-ready">
                ✔️ Centro fijado correctamente
              </div>
            )}

            <button 
              type="submit" 
              disabled={!center || !name.trim()}
              className="geo-btn-submit"
            >
              Guardar zona
            </button>
          </form>

          {/* Listado de Geocercas */}
          <div>
            <h3 className="geo-list-title">Zonas configuradas ({geofences.length})</h3>
            <div className="geo-list-wrapper">
              {loading && <div style={{ fontSize: '12px', color: '#6B7280' }}>Cargando zonas...</div>}
              {!loading && geofences.length === 0 && (
                <div style={{ fontSize: '12px', color: '#4B5563', textAlign: 'center', padding: '10px 0' }}>
                  No hay geocercas en la cuenta.
                </div>
              )}
              
              {geofences.map((geo) => {
                const circleInfo = parseWKTtoCircle(geo.area);
                return (
                  <div key={geo.id} className="geo-card">
                    <div className="geo-card-info">
                      <span className="geo-card-name">{geo.name}</span>
                      <span className="geo-card-desc">
                        {circleInfo ? `Radio: ${circleInfo.radius}m` : 'Área poligonal'}
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => handleDeleteGeofence(geo.id)}
                      className="geo-btn-delete"
                      title="Eliminar geocerca"
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* MAPA INTERACTIVO */}
        <div className="geo-map-container">
          <MapContainer 
            center={[4.1420, -73.6266]} // Coordenadas predeterminadas (Villavicencio)
            zoom={13} 
            style={{ width: '100%', height: '100%', zIndex: 1 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            
            {/* Listener de clic sobre el mapa */}
            <MapClickHandler onMapClick={setCenter} />

            {/* Dibujado de Geocercas Almacenadas en la API */}
            {geofences.map((geo) => {
              const circleData = parseWKTtoCircle(geo.area);
              if (circleData) {
                return (
                  <Circle 
                    key={geo.id}
                    center={[circleData.lat, circleData.lng]} 
                    radius={circleData.radius}
                    pathOptions={{ color: '#2563EB', fillColor: '#2563EB', fillOpacity: 0.25, weight: 2 }}
                  >
                    <Popup>
                      <div style={{ color: '#111827', fontFamily: 'sans-serif' }}>
                        <strong style={{ fontSize: '13px' }}>{geo.name}</strong><br/>
                        <span style={{ fontSize: '11px', color: '#6B7280' }}>Radio: {circleData.radius}m</span>
                      </div>
                    </Popup>
                  </Circle>
                );
              }
              return null;
            })}

            {/* Círculo de Previsualización en Tiempo Real al Crear una Nueva Zona */}
            {center && (
              <Circle 
                center={center} 
                radius={radius}
                pathOptions={{ color: '#10B981', fillColor: '#10B981', fillOpacity: 0.4, dashArray: '6, 6', weight: 2 }}
              />
            )}
          </MapContainer>
        </div>

      </div>
    </>
  );
}