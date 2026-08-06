import React, { useState, useEffect } from 'react';

// Llaves y Caché de Geocodificación
const LOCATION_IQ_KEY = 'pk.e0a46bceeed78c708e78aacfc0b2942c';
const geoCache = {}; 

// EL DOMINIO DE TU SERVIDOR
const BASE_URL = 'https://api.globalmonitorgps.com'; 

export default function Reports({ devices, token }) {
  // Lógica de Bloqueo para Dispositivos Móviles (Responsive)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [reportConfig, setReportConfig] = useState({ deviceId: '', from: '', to: '' });
  const [quickRange, setQuickRange] = useState('custom');
  const [reportType, setReportType] = useState('daily');
  const [speedLimit, setSpeedLimit] = useState(80); 
  
  const [summaryData, setSummaryData] = useState([]);
  const [routeData, setRouteData] = useState([]);
  const [eventsData, setEventsData] = useState([]);
  const [stopsData, setStopsData] = useState([]);
  
  const [isFetching, setIsFetching] = useState(false);

  // Traductor Inverso de Coordenadas a Direcciones Reales
  const reverseGeocodeFallback = async (lat, lon) => {
    if (!lat || !lon) return 'Coordenadas inválidas';
    
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (geoCache[cacheKey]) return geoCache[cacheKey];

    try {
      await new Promise(resolve => setTimeout(resolve, 350)); 
      const res = await fetch(`https://us1.locationiq.com/v1/reverse.php?key=${LOCATION_IQ_KEY}&lat=${lat}&lon=${lon}&format=json&accept-language=es`);
      
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const city = addr.city || addr.town || addr.village || addr.county || 'Zona Rural';
        const road = addr.road || addr.neighbourhood || addr.suburb || 'Vía';
        const finalAddress = `${road}, ${city}`;
        
        geoCache[cacheKey] = finalAddress; 
        return finalAddress;
      }
    } catch (error) {
      console.warn("Fallo al obtener dirección:", error);
    }
    return `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
  };

  const handleRangeChange = (rangeValue) => {
    setQuickRange(rangeValue);
    if (rangeValue === 'custom') return;

    const now = new Date(); 
    const start = new Date(now); 
    const end = new Date(now);

    if (rangeValue === 'today') { 
      start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
    } 
    else if (rangeValue === 'yesterday') { 
      start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0); 
      end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999);
    } 
    else if (rangeValue === 'thisWeek') { 
      const currentDay = now.getDay() === 0 ? 7 : now.getDay();
      start.setDate(now.getDate() - currentDay + 1); start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } 
    else if (rangeValue === 'thisMonth') { 
      start.setDate(1); start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999); 
    } 
    else if (rangeValue === 'lastMonth') { 
      start.setMonth(now.getMonth() - 1, 1); start.setHours(0, 0, 0, 0);
      end.setMonth(now.getMonth(), 0); end.setHours(23, 59, 59, 999);
    }

    const format = (d) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}T${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    setReportConfig({ ...reportConfig, from: format(start), to: format(end) });
  };

  const formatDuration = (ms) => {
    if (!ms) return '0h 0m';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const getSafeDateKey = (isoString) => {
    const d = new Date(isoString);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  const handleFetchData = async (e) => {
    e.preventDefault();
    setIsFetching(true);
    
    setSummaryData([]); setRouteData([]); setEventsData([]); setStopsData([]);

    const fromISO = new Date(reportConfig.from).toISOString();
    const toISO = new Date(reportConfig.to).toISOString();
    const baseParams = `deviceId=${reportConfig.deviceId}&from=${fromISO}&to=${toISO}`;
    const headers = { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' };

    try {
      if (reportType === 'daily') {
        const resSummary = await fetch(`${BASE_URL}/api/reports/summary?${baseParams}&daily=true`, { headers });

        if (resSummary.ok) {
            let summary = await resSummary.json();
            setSummaryData(summary.map(day => ({ ...day, realMaxSpeed: -1 })));
            
            fetch(`${BASE_URL}/api/reports/route?${baseParams}`, { headers })
                .then(res => res.ok ? res.json() : [])
                .then(route => {
                    const maxSpeeds = {};
                    route.forEach(pos => {
                        const dateKey = getSafeDateKey(pos.fixTime);
                        const speedKmh = pos.speed * 1.852;
                        if (!maxSpeeds[dateKey] || speedKmh > maxSpeeds[dateKey]) {
                            maxSpeeds[dateKey] = speedKmh;
                        }
                    });

                    setSummaryData(prev => prev.map(day => {
                        const dateKey = getSafeDateKey(day.startTime);
                        const calculatedMax = maxSpeeds[dateKey];
                        const fallbackMax = day.maxSpeed ? day.maxSpeed * 1.852 : 0;
                        
                        return {
                            ...day,
                            realMaxSpeed: calculatedMax !== undefined ? calculatedMax : fallbackMax
                        };
                    }));
                })
                .catch(err => {
                    console.warn("Fallo cálculo velocidad fondo", err);
                    setSummaryData(prev => prev.map(day => ({ ...day, realMaxSpeed: day.maxSpeed ? day.maxSpeed * 1.852 : 0 })));
                });
        }
      } 
      // ---> AQUÍ AGRUPAMOS ROUTE Y ECOPETROL PARA REUSAR LA PETICIÓN <---
      else if (reportType === 'route' || reportType === 'ecopetrol') {
        const res = await fetch(`${BASE_URL}/api/reports/route?${baseParams}`, { headers });
        if (res.ok) setRouteData(await res.json());
      }
      else if (reportType === 'speed') {
        const res = await fetch(`${BASE_URL}/api/reports/route?${baseParams}`, { headers });
        if (res.ok) {
            const route = await res.json();
            const overspeed = route.filter(pos => (pos.speed * 1.852) > speedLimit);
            setEventsData(overspeed.map(pos => ({
                id: pos.id,
                serverTime: pos.fixTime,
                type: 'overspeed',
                speed: pos.speed,
                latitude: pos.latitude,
                longitude: pos.longitude
            })));
        }
      }
      else if (reportType === 'fleet_speed') {
        const allEvents = [];
        const chunkSize = 10; 

        for (let i = 0; i < devices.length; i += chunkSize) {
            const chunk = devices.slice(i, i + chunkSize);
            const promises = chunk.map(device => {
                const params = `deviceId=${device.id}&from=${fromISO}&to=${toISO}`;
                return fetch(`${BASE_URL}/api/reports/route?${params}`, { headers })
                    .then(res => res.ok ? res.json() : [])
                    .then(route => {
                        const overspeed = route.filter(pos => (pos.speed * 1.852) > speedLimit);
                        return overspeed.map(pos => ({
                            id: pos.id,
                            deviceName: device.name, 
                            serverTime: pos.fixTime,
                            type: 'overspeed',
                            speed: pos.speed,
                            latitude: pos.latitude,
                            longitude: pos.longitude
                        }));
                    })
                    .catch(() => []); 
            });
            const chunkResults = await Promise.all(promises);
            allEvents.push(...chunkResults.flat());
        }
        
        allEvents.sort((a, b) => new Date(b.serverTime) - new Date(a.serverTime));
        setEventsData(allEvents);
      }
      else if (reportType === 'harsh') {
        const res = await fetch(`${BASE_URL}/api/reports/route?${baseParams}`, { headers });
        if (res.ok) {
            const rawRoute = await res.json();
            const calculatedEvents = [];

            const CONFIG = {
              minSpeedKmh: 15,          
              minDeltaVKmh: 15,         
              maxTimeSec: 5,            
              minTimeSec: 1,            
              accelThresholds: { mod: 1.5, harsh: 2.5, extreme: 3.5 },
              brakeThresholds: { mod: 2.0, harsh: 3.0, extreme: 4.5 },
              physicalLimitG: 9.8       
            };

            const getSeverity = (accel, isAcceleration) => {
              const t = isAcceleration ? CONFIG.accelThresholds : CONFIG.brakeThresholds;
              if (accel >= t.extreme) return 'Muy Brusco';
              if (accel >= t.harsh) return 'Brusco';
              if (accel >= t.mod) return 'Moderado';
              return 'Normal';
            };

            const smoothedRoute = [];
            for (let i = 0; i < rawRoute.length; i++) {
              let sumKnots = 0;
              let count = 0;
              for (let j = Math.max(0, i - 1); j <= Math.min(rawRoute.length - 1, i + 1); j++) {
                sumKnots += rawRoute[j].speed;
                count++;
              }
              const avgKnots = sumKnots / count;
              const speedKmh = avgKnots * 1.852;
              smoothedRoute.push({
                ...rawRoute[i],
                speedKmh: speedKmh,
                speedMs: speedKmh / 3.6,
                timeMs: new Date(rawRoute[i].fixTime).getTime()
              });
            }

            let skipAnalysisUntil = 0;

            for (let i = 0; i < smoothedRoute.length - 1; i++) {
              const p1 = smoothedRoute[i];
              if (p1.timeMs < skipAnalysisUntil || p1.speedKmh < CONFIG.minSpeedKmh) continue;

              let maxAbsAccel = 0;
              let bestEvent = null;

              for (let j = i + 1; j < smoothedRoute.length; j++) {
                const p2 = smoothedRoute[j];
                const deltaT = (p2.timeMs - p1.timeMs) / 1000; 

                if (deltaT > CONFIG.maxTimeSec) break;
                if (deltaT < CONFIG.minTimeSec) continue;

                const deltaV_Kmh = p2.speedKmh - p1.speedKmh;
                const absDeltaV_Kmh = Math.abs(deltaV_Kmh);
                const deltaV_Ms = p2.speedMs - p1.speedMs;

                const acceleration = deltaV_Ms / deltaT;
                const absAccel = Math.abs(acceleration);

                if (absAccel > CONFIG.physicalLimitG) continue; 

                if (absAccel > maxAbsAccel && absDeltaV_Kmh >= CONFIG.minDeltaVKmh) {
                  maxAbsAccel = absAccel;
                  const isAccel = acceleration > 0;
                  const severity = getSeverity(absAccel, isAccel);

                  if (severity !== 'Normal') {
                    bestEvent = {
                      id: `${isAccel ? 'accel' : 'brake'}_${p2.id}`,
                      serverTime: p2.fixTime,
                      type: isAccel ? 'harshAcceleration' : 'harshBraking',
                      severity: severity,
                      speed1: p1.speedKmh,
                      speed2: p2.speedKmh,
                      deltaT: deltaT,
                      acceleration: absAccel, 
                      latitude: p2.latitude,
                      longitude: p2.longitude
                    };
                  }
                }
              }

              if (bestEvent) {
                calculatedEvents.push(bestEvent);
                skipAnalysisUntil = new Date(bestEvent.serverTime).getTime(); 
              }
            }
            setEventsData(calculatedEvents);
        }
      }
      else if (reportType === 'stops' || reportType === 'idle') {
        const res = await fetch(`${BASE_URL}/api/reports/stops?${baseParams}`, { headers });
        if (res.ok) {
            let stops = await res.json();
            if (reportType === 'idle') {
                stops = stops.filter(stop => stop.engineHours && stop.engineHours > 0);
            }
            
            setStopsData(stops);

            stops.forEach(async (stop, index) => {
                const currentAddr = stop.address;
                if (!currentAddr || /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(currentAddr)) {
                    const finalAddress = await reverseGeocodeFallback(stop.latitude, stop.longitude);
                    setStopsData(prev => {
                        const updated = [...prev];
                        if (updated[index]) {
                            updated[index] = { ...updated[index], address: finalAddress };
                        }
                        return updated;
                    });
                }
            });
        }
      }
    } catch (err) { 
        console.error(err);
        alert("Hubo un problema de conexión al extraer la información. Por favor revisa tu conexión a internet.");
    }
    setIsFetching(false);
  };

  const handleDownloadExcel = () => {
    if (isFetching) {
      return alert("Por favor espera a que termine de cargar el informe para exportarlo.");
    }

    const selectedDevice = devices.find(d => String(d.id) === String(reportConfig.deviceId));
    
    const placaVehiculo = reportType === 'fleet_speed' ? "TODA LA FLOTA" : (selectedDevice ? selectedDevice.name.toUpperCase() : "TODOS LOS VEHÍCULOS");
    
    let filename = `Reporte_${reportType}_${new Date().getTime()}.xls`;

    let nombreReporteMayus = "INFORME DETALLADO DE TELEMETRÍA";
    if (reportType === 'daily') nombreReporteMayus = "RESUMEN DIARIO CONSOLIDADO";
    else if (reportType === 'route') nombreReporteMayus = "INFORME DETALLADO PUNTO A PUNTO";
    else if (reportType === 'ecopetrol') nombreReporteMayus = "INFORME COMPLETO DE ECOPETROL"; // Título Excel Ecopetrol
    else if (reportType === 'speed') nombreReporteMayus = "INFORME DE EXCESOS DE VELOCIDAD (INDIVIDUAL)";
    else if (reportType === 'fleet_speed') nombreReporteMayus = "INFORME DE EXCESOS DE VELOCIDAD (TODA LA FLOTA)";
    else if (reportType === 'harsh') nombreReporteMayus = "INFORME DE ACELERACIONES Y FRENADAS BRUSCAS";
    else if (reportType === 'idle') nombreReporteMayus = "INFORME DE TIEMPOS EN RALENTÍ";
    else if (reportType === 'stops') nombreReporteMayus = "INFORME DE VEHÍCULOS DETENIDOS (PARADAS)";

    let htmlTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"/><style>
        th { background-color: #1F2937; color: #FFFFFF; font-weight: bold; text-align: left; font-family: Arial; font-size: 11pt; padding: 6px; }
        td { border: 0.5pt solid #D1D5DB; font-family: Arial; font-size: 10pt; padding: 4px; }
        .meta-title { font-size: 12pt; font-weight: bold; color: #111827; font-family: Arial; }
      </style></head>
      <body>
      <table>
        <tr><td colspan="6" class="meta-title"><b>TIPO DE INFORME: ${nombreReporteMayus}</b></td></tr>
        <tr><td colspan="6" class="meta-title"><b>VEHÍCULO / PLACA: ${placaVehiculo}</b></td></tr>
        <tr><td colspan="6" style="color: #6B7280;">Fecha de exportación: ${new Date().toLocaleString()}</td></tr>
        <tr></tr>
    `;

    if (reportType === 'daily') {
      if (summaryData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `
        <tr>
          <th><b>DÍA / FECHA</b></th>
          <th><b>HORA INICIO</b></th>
          <th><b>HORA FIN</b></th>
          <th><b>DISTANCIA TOTAL (KM)</b></th>
          <th><b>HORAS MOTOR</b></th>
          <th><b>VELOCIDAD MÁX (KM/H)</b></th>
        </tr>
      `;
      summaryData.forEach(day => {
        const date = new Date(day.startTime).toLocaleDateString();
        const start = new Date(day.startTime).toLocaleTimeString();
        const end = new Date(day.endTime).toLocaleTimeString();
        const distance = (day.distance ? (day.distance / 1000) : 0).toFixed(2).replace('.', ',');
        const engine = formatDuration(day.engineHours);
        
        let speed = "Calculando...";
        if (day.realMaxSpeed !== -1) {
            speed = (day.realMaxSpeed !== undefined ? day.realMaxSpeed : (day.maxSpeed ? day.maxSpeed * 1.852 : 0)).toFixed(1).replace('.', ',');
        }

        htmlTemplate += `
          <tr>
            <td>${date}</td>
            <td>${start}</td>
            <td>${end}</td>
            <td>${distance}</td>
            <td>${engine}</td>
            <td>${speed}</td>
          </tr>
        `;
      });
    } 
    else if (reportType === 'route') {
      if (routeData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `
        <tr>
          <th><b>FECHA Y HORA EXACTA</b></th>
          <th><b>ESTADO MOTOR</b></th>
          <th><b>VELOCIDAD (KM/H)</b></th>
          <th><b>BATERÍA GPS</b></th>
          <th><b>DIRECCIÓN / COORDENADAS</b></th>
        </tr>
      `;
      routeData.forEach(pos => {
        const dt = new Date(pos.fixTime).toLocaleString();
        const ignition = pos.attributes?.ignition ? 'Encendido' : 'Apagado';
        const speed = (pos.speed * 1.852).toFixed(1).replace('.', ',');
        const battery = pos.attributes?.batteryLevel ? `${pos.attributes.batteryLevel}%` : 'N/A';
        const address = pos.address ? pos.address : `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;
        
        htmlTemplate += `
          <tr>
            <td>${dt}</td>
            <td>${ignition}</td>
            <td>${speed}</td>
            <td>${battery}</td>
            <td>${address}</td>
          </tr>
        `;
      });
    }
    // ---> INYECCIÓN EXCEL: INFORME ECOPETROL <---
    else if (reportType === 'ecopetrol') {
      if (routeData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `
        <tr>
          <th><b>PLACA</b></th>
          <th><b>FECHA</b></th>
          <th><b>HORA</b></th>
          <th><b>VELOCIDAD (KM/H)</b></th>
          <th><b>ODÓMETRO (KM)</b></th>
          <th><b>LATITUD</b></th>
          <th><b>LONGITUD</b></th>
          <th><b>UBICACIÓN</b></th>
        </tr>
      `;
      routeData.forEach(pos => {
        const dt = new Date(pos.fixTime);
        const fecha = dt.toLocaleDateString();
        const hora = dt.toLocaleTimeString();
        const placa = selectedDevice ? selectedDevice.name : (devices.find(d => String(d.id) === String(pos.deviceId))?.name || 'Desconocido');
        const speed = (pos.speed * 1.852).toFixed(1).replace('.', ',');
        const odometer = ((pos.attributes?.totalDistance || pos.attributes?.odometer || 0) / 1000).toFixed(2).replace('.', ',');
        const address = pos.address || `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;
        
        htmlTemplate += `
          <tr>
            <td>${placa}</td>
            <td>${fecha}</td>
            <td>${hora}</td>
            <td>${speed}</td>
            <td>${odometer}</td>
            <td>${pos.latitude.toFixed(5)}</td>
            <td>${pos.longitude.toFixed(5)}</td>
            <td>${address}</td>
          </tr>
        `;
      });
    }
    else if (reportType === 'speed' || reportType === 'harsh' || reportType === 'fleet_speed') {
      if (eventsData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `
        <tr>
          ${reportType === 'fleet_speed' ? '<th><b>VEHÍCULO / PLACA</b></th>' : ''}
          <th><b>FECHA Y HORA</b></th>
          <th><b>TIPO DE EVENTO</b></th>
          <th><b>SEVERIDAD</b></th>
          <th><b>DETALLE FÍSICO / TELEMETRÍA</b></th>
        </tr>
      `;
      eventsData.forEach(ev => {
        const dt = new Date(ev.serverTime).toLocaleString();
        let typeText = ev.type.toUpperCase();
        let detail = '';
        
        if (ev.type === 'overspeed') { typeText = 'EXCESO DE VELOCIDAD'; detail = `Registrado: ${(ev.speed * 1.852).toFixed(1).replace('.', ',')} km/h`; }
        else if (ev.type === 'harshAcceleration') { typeText = 'ACELERACIÓN BRUSCA'; detail = `De ${ev.speed1.toFixed(0)} a ${ev.speed2.toFixed(0)} km/h en ${ev.deltaT.toFixed(1)}s`; }
        else if (ev.type === 'harshBraking') { typeText = 'FRENADA BRUSCA'; detail = `De ${ev.speed1.toFixed(0)} a ${ev.speed2.toFixed(0)} km/h en ${ev.deltaT.toFixed(1)}s`; }
        
        const severity = (ev.severity || 'ALERTA').toUpperCase();
        htmlTemplate += `
          <tr>
            ${reportType === 'fleet_speed' ? `<td><b>${ev.deviceName}</b></td>` : ''}
            <td>${dt}</td>
            <td>${typeText}</td>
            <td>${severity}</td>
            <td>${detail}</td>
          </tr>
        `;
      });
    }
    else if (reportType === 'stops' || reportType === 'idle') {
      if (stopsData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `
        <tr>
          <th><b>HORA DE INICIO</b></th>
          <th><b>HORA DE FIN</b></th>
          <th><b>DURACIÓN TOTAL (PARQUEADO)</b></th>
          <th><b>HORAS MOTOR (RALENTÍ)</b></th>
          <th><b>UBICACIÓN TRADUCIDA</b></th>
        </tr>
      `;
      stopsData.forEach(stop => {
        const start = new Date(stop.startTime).toLocaleString();
        const end = new Date(stop.endTime).toLocaleString();
        const duration = formatDuration(stop.duration);
        const engine = stop.engineHours > 0 ? formatDuration(stop.engineHours) : 'Motor Apagado';
        const address = stop.address ? stop.address : `${stop.latitude.toFixed(4)}, ${stop.longitude.toFixed(4)}`;
        
        htmlTemplate += `
          <tr>
            <td>${start}</td>
            <td>${end}</td>
            <td>${duration}</td>
            <td>${engine}</td>
            <td>${address}</td>
          </tr>
        `;
      });
    }

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

  if (isMobile) {
    return (
      <main style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '30px', backgroundColor: '#0B1120', textAlign: 'center'}}>
        <div style={{backgroundColor: '#111827', padding: '30px', borderRadius: '15px', border: '1px solid #1F2937', maxWidth: '400px'}}>
          <div style={{fontSize: '40px', marginBottom: '15px'}}>🖥️</div>
          <h2 style={{color: '#EF4444', margin: '0 0 15px 0', fontSize: '18px'}}>Resolución no compatible</h2>
          <p style={{color: '#9CA3AF', fontSize: '14px', lineHeight: '1.6', margin: 0}}>
            El Módulo de Informes Analíticos procesa grandes volúmenes de telemetría y tablas avanzadas que no están diseñadas para pantallas de teléfonos móviles.
            <br/><br/>
            Por favor, ingresa a esta sección desde un <strong>ordenador de escritorio o una tablet</strong> para poder analizar los datos correctamente.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{flex: 1, padding: '20px 30px', overflowY: 'auto'}}>
      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Módulo de Informes Analíticos</h2>
      
      <div style={styles.adminCard}>
        <form onSubmit={handleFetchData} style={{display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end'}}>
          
          <div style={{flex: 1, minWidth: '150px'}}>
            <label style={styles.label}>Vehículo:</label>
            <select 
              required={reportType !== 'fleet_speed'} 
              disabled={reportType === 'fleet_speed'}
              value={reportType === 'fleet_speed' ? 'all' : reportConfig.deviceId} 
              onChange={e => setReportConfig({...reportConfig, deviceId: e.target.value})} 
              style={styles.input}
            >
                {reportType === 'fleet_speed' ? (
                   <option value="all">Toda la Flota</option>
                ) : (
                   <option value="">-- Seleccionar --</option>
                )}
                {reportType !== 'fleet_speed' && devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
         
          <div style={{flex: 1, minWidth: '220px'}}>
            <label style={styles.label}>Tipo de Informe:</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)} style={styles.input}>
                <option value="daily">Resumen Diario</option>
                <option value="route">Detallado Punto a Punto</option>
                {/* NUEVO INFORME ECOPETROL AÑADIDO AL SELECTOR */}
                <option value="ecopetrol">Informe Completo Ecopetrol</option>
                <option value="speed">Exceso de Velocidad (Individual)</option>
                <option value="fleet_speed">Exceso de Velocidad (Toda la Flota)</option>
                <option value="harsh">Aceleración y Frenada Brusca</option>
                <option value="idle">Tiempo en Ralentí</option>
                <option value="stops">Vehículo Detenido (Paradas)</option>
            </select>
          </div>

          {(reportType === 'speed' || reportType === 'fleet_speed') && (
            <div style={{width: '100px'}}>
              <label style={styles.label}>Límite (km/h):</label>
              <input type="number" required value={speedLimit} onChange={e => setSpeedLimit(e.target.value)} style={{...styles.input, color: '#EF4444', fontWeight: 'bold'}} />
            </div>
          )}

          <div style={{flex: 1, minWidth: '150px'}}>
            <label style={styles.label}>Rango Rápido:</label>
            <select value={quickRange} onChange={e => handleRangeChange(e.target.value)} style={styles.input}>
                <option value="today">Hoy</option>
                <option value="yesterday">Ayer</option>
                <option value="thisWeek">Esta Semana</option>
                <option value="thisMonth">Este Mes</option>
                <option value="lastMonth">Mes Pasado</option>
                <option value="custom">Personalizado</option>
            </select>
          </div>

          {quickRange === 'custom' && (
            <>
                <div style={{flex: 1}}>
                    <label style={styles.label}>Desde:</label>
                    <input type="datetime-local" required step="1800" style={{...styles.input, colorScheme: 'dark'}} value={reportConfig.from} onChange={e => setReportConfig({...reportConfig, from: e.target.value})} />
                </div>
                <div style={{flex: 1}}>
                    <label style={styles.label}>Hasta:</label>
                    <input type="datetime-local" required step="1800" style={{...styles.input, colorScheme: 'dark'}} value={reportConfig.to} onChange={e => setReportConfig({...reportConfig, to: e.target.value})} />
                </div>
            </>
          )}
 
          <button type="submit" disabled={isFetching} style={styles.btn}>
            {isFetching ? 'Analizando...' : 'Analizar Data'}
          </button>
          
          <button type="button" onClick={handleDownloadExcel} style={{...styles.btn, backgroundColor: '#10B981'}}>
             Descargar Excel
          </button>
        </form>
      </div>

      <div style={styles.tableContainer}>
        
        {/* 1. TABLA: DIARIO */}
        {reportType === 'daily' && (
          <>
            <h3 style={styles.tableTitle}>Informe Diario Consolidado ({summaryData.length} registros)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827'}}>
                    <tr style={styles.tableHead}>
                        <th>Día / Fecha</th>
                        <th>Inicio (Primera conexión)</th>
                        <th>Fin (Última conexión)</th>
                        <th>Distancia Total</th>
                        <th>Horas Motor</th>
                        <th>Velocidad Máx (Real)</th>
                    </tr>
                </thead>
                <tbody>
                  {summaryData.length === 0 ? <tr><td colSpan="6" style={styles.emptyText}>No hay datos en este rango.</td></tr> :
                  summaryData.map((day, index) => {
                    const distance = day.distance ? (day.distance / 1000) : 0;
                    const isCalculating = day.realMaxSpeed === -1;
                    const maxSpeed = isCalculating ? 0 : (day.realMaxSpeed !== undefined ? day.realMaxSpeed : (day.maxSpeed ? day.maxSpeed * 1.852 : 0));
                    
                    return (
                      <tr key={index} style={{ borderBottom: '1px solid #1F2937' }}>
                        <td style={{...styles.td, fontWeight: 'bold', color: '#F3F4F6'}}>
                          {new Date(day.startTime).toLocaleDateString()}
                        </td>
                        <td style={styles.td}>
                          {new Date(day.startTime).toLocaleTimeString()}
                        </td>
                        <td style={styles.td}>
                          {new Date(day.endTime).toLocaleTimeString()}
                        </td>
                        <td style={{...styles.td, color: '#3B82F6', fontWeight: 'bold'}}>{distance.toFixed(2)} km</td>
                        <td style={{...styles.td, color: '#10B981'}}>{formatDuration(day.engineHours)}</td>
                        <td style={{...styles.td, color: isCalculating ? '#F59E0B' : '#EF4444', fontWeight: 'bold'}}>
                          {isCalculating ? 'Calculando...' : `${maxSpeed.toFixed(1)} km/h`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 2. TABLA: DETALLADO PUNTO A PUNTO (EL NORMAL) */}
        {reportType === 'route' && (
          <>
            <h3 style={styles.tableTitle}>Detallado Punto a Punto ({routeData.length} puntos extraídos)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827', zIndex: 1}}>
                    <tr style={styles.tableHead}>
                        <th>Fecha y Hora Exacta</th>
                        <th>Estado Motor</th>
                        <th>Velocidad</th>
                        <th>Batería Gps</th>
                        <th>Dirección Registrada / Lat, Lon</th>
                    </tr>
                </thead>
                <tbody>
                  {routeData.length === 0 ? <tr><td colSpan="5" style={styles.emptyText}>No hay datos en este rango.</td></tr> :
                  routeData.slice(0, 3000).map((pos) => { 
                    const speed = pos.speed * 1.852;
                    return (
                      <tr key={pos.id} style={{ borderBottom: '1px solid #1F2937' }}>
                        <td style={styles.td}>{new Date(pos.fixTime).toLocaleString()}</td>
                        <td style={{...styles.td, color: pos.attributes?.ignition ? '#10B981' : '#6B7280', fontWeight: 'bold'}}>
                          {pos.attributes?.ignition ? 'Encendido' : 'Apagado'}
                        </td>
                        <td style={{...styles.td, color: speed > 80 ? '#EF4444' : '#F3F4F6', fontWeight: speed > 80 ? 'bold' : 'normal'}}>
                          {speed.toFixed(1)} km/h
                        </td>
                        <td style={styles.td}>{pos.attributes?.batteryLevel ? `${pos.attributes.batteryLevel}%` : 'N/A'}</td>
                        <td style={{...styles.td, fontSize: '11px', maxWidth: '300px', whiteSpace: 'normal'}}>
                          {pos.address || `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`}
                        </td>
                      </tr>
                    )
                  })}
                  {routeData.length > 3000 && <tr><td colSpan="5" style={{...styles.emptyText, color: '#F59E0B'}}>Se muestran los primeros 3000 registros para evitar sobrecarga del navegador.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ---> TABLA NUEVA: INFORME COMPLETO ECOPETROL <--- */}
        {reportType === 'ecopetrol' && (
          <>
            <h3 style={styles.tableTitle}>Informe Completo de Ecopetrol ({routeData.length} registros extraídos)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827', zIndex: 1}}>
                    <tr style={styles.tableHead}>
                        <th>Placa</th>
                        <th>Fecha</th>
                        <th>Hora</th>
                        <th>Velocidad (km/h)</th>
                        <th>Odómetro (km)</th>
                        <th>Latitud</th>
                        <th>Longitud</th>
                        <th>Ubicación</th>
                    </tr>
                </thead>
                <tbody>
                  {routeData.length === 0 ? <tr><td colSpan="8" style={styles.emptyText}>No hay datos en este rango.</td></tr> :
                  routeData.slice(0, 3000).map((pos) => { 
                    const speed = (pos.speed * 1.852).toFixed(1);
                    const dt = new Date(pos.fixTime);
                    
                    // Extraemos placa usando el array de dispositivos y el ID de este punto.
                    const placa = devices.find(d => String(d.id) === String(pos.deviceId))?.name || 'Desconocido';
                    // Traccar aloja el kilometraje en atributos en metros, se divide en 1000.
                    const odometer = ((pos.attributes?.totalDistance || pos.attributes?.odometer || 0) / 1000).toFixed(2);
                    const address = pos.address || `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;

                    return (
                      <tr key={pos.id} style={{ borderBottom: '1px solid #1F2937' }}>
                        <td style={{...styles.td, color: '#3B82F6', fontWeight: 'bold'}}>{placa}</td>
                        <td style={styles.td}>{dt.toLocaleDateString()}</td>
                        <td style={styles.td}>{dt.toLocaleTimeString()}</td>
                        <td style={{...styles.td, color: speed > 80 ? '#EF4444' : '#F3F4F6', fontWeight: speed > 80 ? 'bold' : 'normal'}}>
                          {speed}
                        </td>
                        <td style={{...styles.td, color: '#10B981', fontWeight: 'bold'}}>{odometer}</td>
                        <td style={styles.td}>{pos.latitude.toFixed(5)}</td>
                        <td style={styles.td}>{pos.longitude.toFixed(5)}</td>
                        <td style={{...styles.td, fontSize: '11px', maxWidth: '250px', whiteSpace: 'normal'}}>
                          {address}
                        </td>
                      </tr>
                    )
                  })}
                  {routeData.length > 3000 && <tr><td colSpan="8" style={{...styles.emptyText, color: '#F59E0B'}}>Se muestran los primeros 3000 registros para evitar sobrecarga del navegador.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 3 & 4. TABLAS: EVENTOS (VELOCIDAD FLOTA, INDIVIDUAL Y CONDUCCIÓN) */}
        {(reportType === 'speed' || reportType === 'harsh' || reportType === 'fleet_speed') && (
          <>
            <h3 style={styles.tableTitle}>Registro de Infracciones / Alertas ({eventsData.length} eventos)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827'}}>
                    <tr style={styles.tableHead}>
                        {reportType === 'fleet_speed' && <th>Vehículo / Placa</th>}
                        <th>Fecha y Hora</th>
                        <th>Tipo de Evento</th>
                        <th>Análisis Físico y Detalle</th>
                    </tr>
                </thead>
                <tbody>
                  {eventsData.length === 0 ? <tr><td colSpan={reportType === 'fleet_speed' ? 4 : 3} style={styles.emptyText}>Excelente conducción. No se encontraron infracciones.</td></tr> :
                  eventsData.map((ev, index) => {
                    let typeText = ev.type;
                    let severityColor = '#F3F4F6'; 
                    let detail = '';

                    if (ev.severity === 'Moderado') severityColor = '#FBBF24'; 
                    if (ev.severity === 'Brusco') severityColor = '#F97316';   
                    if (ev.severity === 'Muy Brusco') severityColor = '#EF4444'; 

                    if (ev.type === 'overspeed') { 
                      typeText = 'Exceso de Velocidad'; severityColor = '#EF4444';
                      detail = `Registrado: ${(ev.speed * 1.852).toFixed(1)} km/h`;
                    }
                    else if (ev.type === 'harshAcceleration') { 
                      typeText = 'Aceleración Brusca';
                      detail = `De ${ev.speed1.toFixed(0)} a ${ev.speed2.toFixed(0)} km/h en ${ev.deltaT.toFixed(1)}s (Fuerza: ${ev.acceleration.toFixed(2)} m/s²)`;
                    }
                    else if (ev.type === 'harshBraking') { 
                      typeText = 'Frenada Brusca';
                      detail = `De ${ev.speed1.toFixed(0)} a ${ev.speed2.toFixed(0)} km/h en ${ev.deltaT.toFixed(1)}s (Fuerza: -${ev.acceleration.toFixed(2)} m/s²)`;
                    }

                    return (
                      <tr key={ev.id || index} style={{ borderBottom: '1px solid #1F2937' }}>
                        {reportType === 'fleet_speed' && (
                          <td style={{...styles.td, color: '#3B82F6', fontWeight: 'bold'}}>{ev.deviceName}</td>
                        )}
                        <td style={styles.td}>{new Date(ev.serverTime).toLocaleString()}</td>
                        <td style={{...styles.td, color: severityColor, fontWeight: 'bold'}}>
                           {typeText} 
                           {ev.severity && (
                             <span style={{fontSize: '11px', backgroundColor: '#1F2937', color: severityColor, padding: '2px 6px', borderRadius: '4px', marginLeft: '8px'}}>
                               {ev.severity}
                             </span>
                           )}
                        </td>
                        <td style={{...styles.td, fontSize: '12px', color: '#D1D5DB'}}>{detail}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 5 & 6. TABLAS: RALENTÍ Y PARADAS */}
        {(reportType === 'stops' || reportType === 'idle') && (
          <>
            <h3 style={styles.tableTitle}>{reportType === 'idle' ? 'Tiempos en Ralentí (Motor encendido sin movimiento)' : 'Registro de Paradas' } ({stopsData.length} eventos)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827'}}>
                    <tr style={styles.tableHead}>
                        <th>Hora de Inicio</th>
                        <th>Hora de Fin</th>
                        <th>Duración Total (Parqueado)</th>
                        <th>Horas Motor (Ralentí)</th>
                        <th>Ubicación Traducida</th>
                    </tr>
                </thead>
                <tbody>
                  {stopsData.length === 0 ? <tr><td colSpan="5" style={styles.emptyText}>No se registraron paradas bajo este criterio.</td></tr> :
                  stopsData.map((stop, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #1F2937' }}>
                      <td style={styles.td}>{new Date(stop.startTime).toLocaleString()}</td>
                      <td style={styles.td}>{new Date(stop.endTime).toLocaleString()}</td>
                      <td style={{...styles.td, color: '#3B82F6', fontWeight: 'bold'}}>{formatDuration(stop.duration)}</td>
                      <td style={{...styles.td, color: stop.engineHours > 0 ? '#EF4444' : '#10B981', fontWeight: 'bold'}}>
                        {stop.engineHours ? formatDuration(stop.engineHours) : 'Motor Apagado'}
                      </td>
                      <td style={{...styles.td, fontSize: '11.5px', color: '#E5E7EB', fontWeight: '500'}}>
                        {stop.address ? (stop.address.includes('Lat:') ? stop.address : `📍 ${stop.address}`) : `Lat: ${stop.latitude.toFixed(4)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </main>
  );
}

const styles = {
  adminCard: { backgroundColor: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1F2937' },
  label: { color:'#9CA3AF', fontSize:'13px', fontWeight: 'bold', display: 'block', marginBottom: '5px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #1F2937', borderRadius: '6px', padding: '10px', color: 'white', width: '100%', outline: 'none', boxSizing: 'border-box' },
  btn: { backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' },
  tableContainer: { backgroundColor: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1F2937', marginTop: '20px' },
  tableTitle: { margin: '0 0 15px 0', color: 'white', fontSize: '15px', borderBottom: '1px solid #1F2937', paddingBottom: '10px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#9CA3AF' },
  tableHead: { color: 'white', fontSize: '13px' },
  td: { padding: '12px 10px', fontSize: '13px' },
  emptyText: { padding: '30px', textAlign: 'center', color: '#6B7280' }
};