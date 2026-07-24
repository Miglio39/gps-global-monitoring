import React, { useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Tu API Key real inyectada para rescatar direcciones vacías
const LOCATION_IQ_KEY = 'pk.e0a46bceeed78c708e78aacfc0b2942c';
const geoCache = {}; 

function MapBounds({ routeData }) {
  const map = useMap();
  React.useEffect(() => {
    if (routeData && routeData.length > 1) {
      const bounds = L.latLngBounds(routeData.map(p => [p.latitude, p.longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
    } else if (routeData && routeData.length === 1) {
      map.setView([routeData[0].latitude, routeData[0].longitude], 15);
    }
  }, [routeData, map]);
  return null;
}

export default function WorkRoutesReport({ devices }) {
  const [selectedDevice, setSelectedDevice] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalRouteData, setModalRouteData] = useState([]);
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  const token = localStorage.getItem('traccar_token');

  // URL base de tu servidor para que funcione en producción
  const BASE_URL = 'https://api.globalmonitorgps.com';

  // 1. Lector principal (Lee lo que Traccar sí logró traducir)
  const extractLocationInfo = (fullAddress) => {
    if (!fullAddress || fullAddress.trim() === '') return null;
    if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(fullAddress)) return null;
    
    const parts = fullAddress.split(',').map(p => p.trim());
    const len = parts.length;
    let municipio = 'Desconocido';
    let referencia = parts[0];
    
    if (len >= 5) {
      const possibleZip = parts[len - 2];
      if (/^\d+$/.test(possibleZip)) { municipio = parts[len - 4]; } 
      else { municipio = parts[len - 3]; }
      referencia = parts[0] + (parts[1] ? ` - ${parts[1]}` : '');
    } else if (len >= 3) {
      municipio = parts[len - 3];
    } else {
      municipio = parts[0];
    }
    
    return { municipio: municipio || 'Desconocido', referencia: referencia || 'Sin referencia' };
  };

  // 2. Traductor de Rescate (Si Traccar deja el destino en blanco, esto lo arregla)
  const reverseGeocodeFallback = async (lat, lon) => {
    if (!lat || !lon) return { municipio: 'Desconocido', referencia: 'Sin coordenadas' };
    
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (geoCache[cacheKey]) return geoCache[cacheKey];

    try {
      const res = await fetch(`https://us1.locationiq.com/v1/reverse.php?key=${LOCATION_IQ_KEY}&lat=${lat}&lon=${lon}&format=json&accept-language=es`);
      
      // Pausa de 350ms obligatoria para no saturar el límite gratuito de LocationIQ
      await new Promise(resolve => setTimeout(resolve, 350)); 
      
      if (res.ok) {
        const data = await res.json();
        const address = data.address || {};
        const city = address.city || address.town || address.village || address.county || address.state || 'Zona Rural';
        const road = address.road || address.neighbourhood || address.suburb || 'Vía principal';
        
        const result = { municipio: city, referencia: road };
        geoCache[cacheKey] = result; 
        return result;
      }
    } catch (error) {
      console.warn("Fallo de red en LocationIQ", error);
    }
    
    return { municipio: 'No mapeado', referencia: `Coord: ${lat.toFixed(3)}, ${lon.toFixed(3)}` };
  };

  const formatDateTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleString('es-CO', {
      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const generateReport = async () => {
    if (!selectedDevice || !dateFrom || !dateTo) {
      alert("Por favor selecciona un vehículo y el rango de fechas.");
      return;
    }

    setLoading(true);
    setReportData([]);

    try {
      const fromISO = new Date(dateFrom).toISOString();
      const toISO = new Date(dateTo).toISOString();
      
      const res = await fetch(`${BASE_URL}/api/reports/trips?deviceId=${selectedDevice}&from=${fromISO}&to=${toISO}`, {
        headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' }
      });
      
      if (!res.ok) throw new Error("Error al obtener datos");
      const trips = await res.json();

      const processedTrips = [];
      const routesMap = {};

      for (let trip of trips) {
        let originInfo = extractLocationInfo(trip.startAddress);
        let destInfo = extractLocationInfo(trip.endAddress);

        if (!originInfo) originInfo = await reverseGeocodeFallback(trip.startLat, trip.startLon);
        if (!destInfo) destInfo = await reverseGeocodeFallback(trip.endLat, trip.endLon);

        const routeKey = `${originInfo.municipio}-${originInfo.referencia}-${destInfo.municipio}-${destInfo.referencia}`;
        if (!routesMap[routeKey]) routesMap[routeKey] = 0;
        routesMap[routeKey] += 1;

        processedTrips.push({
          id: trip.id || Math.random(),
          deviceId: trip.deviceId,
          startTime: trip.startTime,
          endTime: trip.endTime,
          origenMunicipio: originInfo.municipio,
          origenReferencia: originInfo.referencia,
          destinoMunicipio: destInfo.municipio,
          destinoReferencia: destInfo.referencia,
          distancia: (trip.distance / 1000).toFixed(1),
          routeKey: routeKey
        });
      }

      const finalData = processedTrips.map(t => ({
        ...t, freqMensual: routesMap[t.routeKey], freqTrimestral: routesMap[t.routeKey] * 3
      }));
      
      finalData.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      setReportData(finalData);

    } catch (error) {
      console.error(error);
      alert("❌ Hubo un error al generar el informe.");
    } finally {
      setLoading(false);
    }
  };

  const handleViewRouteMap = async (trip) => {
    setIsModalOpen(true);
    setIsRouteLoading(true);
    setModalRouteData([]);
    
    try {
      const startDate = new Date(trip.startTime);
      const endDate = new Date(trip.endTime);
      
      startDate.setMinutes(startDate.getMinutes() - 2);
      endDate.setMinutes(endDate.getMinutes() + 2);
      
      const fromISO = encodeURIComponent(startDate.toISOString());
      const toISO = encodeURIComponent(endDate.toISOString());
      
      const res = await fetch(`${BASE_URL}/api/reports/route?deviceId=${trip.deviceId}&from=${fromISO}&to=${toISO}`, {
        headers: { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' }
      });
      
      if (res.ok) {
        const data = await res.json();
        setModalRouteData(data);
      } else {
        console.error("Traccar devolvió un error HTTP", res.status);
      }
    } catch (err) {
      console.error("Error cargando ruta:", err);
    } finally {
      setIsRouteLoading(false);
    }
  };

  // --- NUEVA LÓGICA DE EXCEL (PLANTILLA HTML .XLS) BASADA EN TU REPORTS.JSX ---
  const handleDownloadExcel = () => {
    if (reportData.length === 0) {
      return alert("No hay datos para exportar. Genera el reporte primero.");
    }

    const currentDevice = devices?.find(d => String(d.id) === String(selectedDevice));
    const placaVehiculo = currentDevice ? currentDevice.name.toUpperCase() : "VEHÍCULO NO IDENTIFICADO";
    
    let filename = `Reporte_Rutas_Laborales_${new Date().getTime()}.xls`;

    let htmlTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"/><style>
        th { background-color: #1F2937; color: #FFFFFF; font-weight: bold; text-align: left; font-family: Arial; font-size: 11pt; padding: 6px; }
        td { border: 0.5pt solid #D1D5DB; font-family: Arial; font-size: 10pt; padding: 4px; }
        .meta-title { font-size: 12pt; font-weight: bold; color: #111827; font-family: Arial; }
      </style></head>
      <body>
      <table>
        <tr><td colspan="8" class="meta-title"><b>INFORME ESPECIAL: RUTAS DE DESPLAZAMIENTO LABORAL</b></td></tr>
        <tr><td colspan="8" class="meta-title"><b>VEHÍCULO / PLACA: ${placaVehiculo}</b></td></tr>
        <tr><td colspan="8" style="color: #6B7280;">Desde: ${dateFrom ? new Date(dateFrom).toLocaleString('es-CO') : 'N/A'} - Hasta: ${dateTo ? new Date(dateTo).toLocaleString('es-CO') : 'N/A'}</td></tr>
        <tr><td colspan="8" style="color: #6B7280;">Fecha de exportación: ${new Date().toLocaleString('es-CO')}</td></tr>
        <tr></tr>
        <tr>
          <th><b>FECHA Y HORA DE SALIDA</b></th>
          <th><b>MUNICIPIO ORIGEN</b></th>
          <th><b>PUNTO DE SALIDA (REFERENCIA)</b></th>
          <th><b>MUNICIPIO DESTINO</b></th>
          <th><b>PUNTO DE LLEGADA (REFERENCIA)</b></th>
          <th><b>DISTANCIA (KM)</b></th>
          <th><b>FRECUENCIA MENSUAL</b></th>
          <th><b>FRECUENCIA TRIMESTRAL</b></th>
        </tr>
    `;

    reportData.forEach(trip => {
      htmlTemplate += `
        <tr>
          <td>${formatDateTime(trip.startTime)}</td>
          <td>${trip.origenMunicipio}</td>
          <td>${trip.origenReferencia}</td>
          <td>${trip.destinoMunicipio}</td>
          <td>${trip.destinoReferencia}</td>
          <td>${trip.distancia}</td>
          <td>${trip.freqMensual}</td>
          <td>${trip.freqTrimestral}</td>
        </tr>
      `;
    });

    htmlTemplate += `</table></body></html>`;

    const blob = new Blob([htmlTemplate], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#0F172A', minHeight: '100vh', color: '#F3F4F6', fontFamily: 'Inter, sans-serif', overflowY: 'auto' }}>
      
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #1E293B', paddingBottom: '15px' }}>
        <h2 style={{ margin: 0, fontSize: '22px', color: '#38BDF8' }}>📑 Informe Especial: Rutas de Desplazamiento Laboral</h2>
        <p style={{ margin: '5px 0 0 0', color: '#94A3B8', fontSize: '13px' }}>
          Listado cronológico de viajes y frecuencias. Haz clic en "Ver Mapa" para visualizar el trazado recorrido o descárgalo en Excel.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '15px', backgroundColor: '#1E293B', padding: '15px', borderRadius: '10px', alignItems: 'flex-end', marginBottom: '25px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 'bold' }}>Flota / Vehículo</label>
          <select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} style={{ padding: '8px', borderRadius: '6px', backgroundColor: '#0F172A', border: '1px solid #334155', color: '#FFF', outline: 'none' }}>
            <option value="">-- Seleccionar Unidad --</option>
            {devices?.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 'bold' }}>Desde</label>
          <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: '7px', borderRadius: '6px', backgroundColor: '#0F172A', border: '1px solid #334155', color: '#FFF', outline: 'none' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 'bold' }}>Hasta</label>
          <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: '7px', borderRadius: '6px', backgroundColor: '#0F172A', border: '1px solid #334155', color: '#FFF', outline: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={generateReport} disabled={loading} style={{ padding: '8px 20px', height: '36px', backgroundColor: '#0284C7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Calculando Rutas...' : 'Generar Reporte'}
          </button>
          
          <button 
            onClick={handleDownloadExcel} 
            disabled={reportData.length === 0} 
            style={{ 
              padding: '8px 15px', 
              height: '36px', 
              backgroundColor: reportData.length === 0 ? '#374151' : '#10B981', 
              color: reportData.length === 0 ? '#9CA3AF' : 'white', 
              border: 'none', 
              borderRadius: '6px', 
              fontWeight: 'bold', 
              cursor: reportData.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background-color 0.2s'
            }}
          >
            📊 Descargar Excel
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: '#1E293B', borderRadius: '10px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
          <thead>
            <tr style={{ backgroundColor: '#334155', color: '#CBD5E1', fontSize: '12px', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px 15px' }}>Día / Fecha y Hora</th>
              <th style={{ padding: '12px 15px' }}>Origen (Municipio)</th>
              <th style={{ padding: '12px 15px' }}>Punto Salida</th>
              <th style={{ padding: '12px 15px' }}>Destino (Municipio)</th>
              <th style={{ padding: '12px 15px' }}>Punto Llegada</th>
              <th style={{ padding: '12px 15px', textAlign: 'center' }}>Distancia</th>
              <th style={{ padding: '12px 15px', textAlign: 'center' }}>Frec. Ruta</th>
              <th style={{ padding: '12px 15px', textAlign: 'center' }}>Mapa</th>
            </tr>
          </thead>
          <tbody>
            {reportData.length === 0 && !loading && (
              <tr>
                <td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: '#64748B' }}>
                  No hay datos para mostrar. Ajusta los filtros y genera el reporte.
                </td>
              </tr>
            )}
            {reportData.map((trip) => (
              <tr key={trip.id} style={{ borderBottom: '1px solid #334155', fontSize: '12.5px' }}>
                <td style={{ padding: '12px 15px', color: '#F3F4F6', whiteSpace: 'nowrap' }}>{formatDateTime(trip.startTime)}</td>
                <td style={{ padding: '12px 15px', fontWeight: 'bold', color: '#38BDF8' }}>{trip.origenMunicipio}</td>
                <td style={{ padding: '12px 15px', color: '#94A3B8' }}>{trip.origenReferencia}</td>
                <td style={{ padding: '12px 15px', fontWeight: 'bold', color: '#10B981' }}>{trip.destinoMunicipio}</td>
                <td style={{ padding: '12px 15px', color: '#94A3B8' }}>{trip.destinoReferencia}</td>
                <td style={{ padding: '12px 15px', textAlign: 'center', fontWeight: 'bold' }}>{trip.distancia} km</td>
                <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                    <span title="Frecuencia Mensual" style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38BDF8', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>Mes: {trip.freqMensual}</span>
                    <span title="Frecuencia Trimestral" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>Trim: {trip.freqTrimestral}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                  <button 
                    onClick={() => handleViewRouteMap(trip)}
                    style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid #3B82F6', color: '#60A5FA', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.target.style.background = '#3B82F6'; e.target.style.color = '#FFF'; }}
                    onMouseLeave={(e) => { e.target.style.background = 'rgba(59, 130, 246, 0.15)'; e.target.style.color = '#60A5FA'; }}
                  >
                    🗺️ Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '85%', maxWidth: '1000px', height: '80%', backgroundColor: '#0F172A', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)', border: '1px solid #1E293B' }}>
            
            <div style={{ padding: '15px 20px', borderBottom: '1px solid #1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111827' }}>
              <h3 style={{ margin: 0, color: '#F3F4F6', fontSize: '16px' }}>🗺️ Trazado Exacto de la Ruta</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#EF4444', fontSize: '20px', cursor: 'pointer', padding: '0 5px' }}>✕</button>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
              {isRouteLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94A3B8', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ width: '30px', height: '30px', border: '3px solid rgba(59, 130, 246, 0.2)', borderTop: '3px solid #3B82F6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  <span>Trazando puntos GPS...</span>
                </div>
              ) : modalRouteData.length > 0 ? (
                <MapContainer center={[modalRouteData[0].latitude, modalRouteData[0].longitude]} zoom={14} style={{ height: '100%', width: '100%', zIndex: 0 }}>
                  <MapBounds routeData={modalRouteData} />
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap' />
                  
                  <Polyline positions={modalRouteData.map(p => [p.latitude, p.longitude])} color="#3B82F6" weight={5} opacity={0.8} />
                  
                  <Marker position={[modalRouteData[0].latitude, modalRouteData[0].longitude]}>
                    <Popup><b style={{color: '#10B981'}}>🟢 Punto de Origen</b><br/>{new Date(modalRouteData[0].fixTime).toLocaleString()}</Popup>
                  </Marker>
                  
                  <Marker position={[modalRouteData[modalRouteData.length - 1].latitude, modalRouteData[modalRouteData.length - 1].longitude]}>
                    <Popup><b style={{color: '#EF4444'}}>🔴 Punto de Destino</b><br/>{new Date(modalRouteData[modalRouteData.length - 1].fixTime).toLocaleString()}</Popup>
                  </Marker>
                </MapContainer>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#EF4444', fontWeight: 'bold' }}>
                  No se pudo recuperar la telemetría detallada de este viaje.
                </div>
              )}
            </div>
            <style>
              {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
            </style>
          </div>
        </div>
      )}

    </div>
  );
}