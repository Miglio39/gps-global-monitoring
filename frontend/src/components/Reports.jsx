import React, { useState, useEffect } from 'react';

// Llave de LocationIQ y Memoria Caché para máxima velocidad
const LOCATION_IQ_KEY = 'pk.e0a46bceeed78c708e78aacfc0b2942c';
const geoCache = {}; 

export default function Reports({ devices, token }) {
  // LÓGICA RESPONSIVE: Bloquear módulo en celulares
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

  // Traductor de Coordenadas optimizado con Caché
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
        
        geoCache[cacheKey] = finalAddress; // Guardamos en memoria para acelerar futuras búsquedas
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
        // OPTIMIZACIÓN 1: Fetching Concurrente (Carga el doble de rápido)
        const [resSummary, resRoute] = await Promise.all([
            fetch(`/api/reports/summary?${baseParams}&daily=true`, { headers }),
            fetch(`/api/reports/route?${baseParams}`, { headers }).catch(() => null)
        ]);

        if (resSummary.ok) {
            let summary = await resSummary.json();
            
            try {
                if (resRoute && resRoute.ok) {
                    const route = await resRoute.json();
                    const maxSpeeds = {};
                    route.forEach(pos => {
                        const dateKey = new Date(pos.fixTime).toLocaleDateString();
                        const speedKmh = pos.speed * 1.852;
                        if (!maxSpeeds[dateKey] || speedKmh > maxSpeeds[dateKey]) {
                            maxSpeeds[dateKey] = speedKmh;
                        }
                    });

                    summary = summary.map(day => {
                        const dateKey = new Date(day.startTime).toLocaleDateString();
                        return {
                            ...day,
                            realMaxSpeed: maxSpeeds[dateKey] || (day.maxSpeed ? day.maxSpeed * 1.852 : 0)
                        };
                    });
                }
            } catch (err) {
                console.warn("Cruce de datos de ruta fallido", err);
            }

            setSummaryData(summary);
        }
      } 
      else if (reportType === 'route') {
        const res = await fetch(`/api/reports/route?${baseParams}`, { headers });
        if (res.ok) setRouteData(await res.json());
      }
      else if (reportType === 'speed') {
        const res = await fetch(`/api/reports/route?${baseParams}`, { headers });
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
      else if (reportType === 'harsh') {
        const res = await fetch(`/api/reports/route?${baseParams}`, { headers });
        if (res.ok) {
            const rawRoute = await res.json();
            const calculatedEvents = [];

            const CONFIG = {
              minSpeedKmh: 15,          
              minDeltaVKmh: 15,         
              maxTimeSec: 5,            
              minTimeSec: 1,            
              accelThresholds: { mod: 1.5, harsh: 2.5, extreme: 3.5 }, // m/s²
              brakeThresholds: { mod: 2.0, harsh: 3.0, extreme: 4.5 }, // m/s²
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
        const res = await fetch(`/api/reports/stops?${baseParams}`, { headers });
        if (res.ok) {
            let stops = await res.json();
            if (reportType === 'idle') {
                stops = stops.filter(stop => stop.engineHours && stop.engineHours > 0);
            }
            
            // OPTIMIZACIÓN 2: Renderizado Instantáneo y Geocodificación Asíncrona (Sin bloqueos)
            setStopsData(stops);

            // Proceso en segundo plano para actualizar direcciones una por una sin congelar la pantalla
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
        alert("Hubo un problema de conexión al extraer la información.");
    }
    setIsFetching(false);
  };

  const handleDownloadExcel = () => {
    alert("Para exportar los reportes detallados, sugerimos sombrear y copiar la tabla generada en la pantalla directamente a Excel.");
  };

  // --------------------------------------------------------
  // PANTALLA DE BLOQUEO PARA MÓVILES
  // --------------------------------------------------------
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

  // --------------------------------------------------------
  // RENDERIZADO NORMAL (ESCRITORIO)
  // --------------------------------------------------------
  return (
    <main style={{flex: 1, padding: '20px 30px', overflowY: 'auto'}}>
      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Módulo de Informes Analíticos</h2>
      
      <div style={styles.adminCard}>
        <form onSubmit={handleFetchData} style={{display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end'}}>
          
          <div style={{flex: 1, minWidth: '150px'}}>
            <label style={styles.label}>Vehículo:</label>
            <select required value={reportConfig.deviceId} onChange={e => setReportConfig({...reportConfig, deviceId: e.target.value})} style={styles.input}>
                <option value="">-- Seleccionar --</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
         
          <div style={{flex: 1, minWidth: '220px'}}>
            <label style={styles.label}>Tipo de Informe:</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)} style={styles.input}>
                <option value="daily">Resumen Diario</option>
                <option value="route">Detallado Punto a Punto</option>
                <option value="speed">Exceso de Velocidad</option>
                <option value="harsh">Aceleración y Frenada Brusca</option>
                <option value="idle">Tiempo en Ralentí</option>
                <option value="stops">Vehículo Detenido (Paradas)</option>
            </select>
          </div>

          {reportType === 'speed' && (
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
                    const maxSpeed = day.realMaxSpeed !== undefined ? day.realMaxSpeed : (day.maxSpeed ? day.maxSpeed * 1.852 : 0);
                    const distance = day.distance ? (day.distance / 1000) : 0;
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
                        <td style={{...styles.td, color: '#EF4444', fontWeight: 'bold'}}>{maxSpeed.toFixed(1)} km/h</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 2. TABLA: DETALLADO PUNTO A PUNTO */}
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

        {/* 3 & 4. TABLAS: EVENTOS (SIN EMOJIS EN LA TABLA) */}
        {(reportType === 'speed' || reportType === 'harsh') && (
          <>
            <h3 style={styles.tableTitle}>Registro de Infracciones / Alertas ({eventsData.length} eventos)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827'}}>
                    <tr style={styles.tableHead}>
                        <th>Fecha y Hora</th>
                        <th>Tipo de Evento</th>
                        <th>Análisis Físico y Detalle</th>
                    </tr>
                </thead>
                <tbody>
                  {eventsData.length === 0 ? <tr><td colSpan="3" style={styles.emptyText}>Excelente conducción. No se encontraron infracciones.</td></tr> :
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