import React, { useState, useEffect } from 'react';

// Llaves y Caché de Geocodificación
const LOCATION_IQ_KEY = 'pk.e0a46bceeed78c708e78aacfc0b2942c';
const geoCache = {}; 

// EL DOMINIO DE TU SERVIDOR
const BASE_URL = 'https://api.globalmonitorgps.com'; 

// 🔥 MOTOR CINEMÁTICO CENTRALIZADO (Comparte la misma lógica en todos los reportes)
const calculateHarshEvents = (rawRoute) => {
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
    let sumKnots = 0; let count = 0;
    for (let j = Math.max(0, i - 1); j <= Math.min(rawRoute.length - 1, i + 1); j++) {
      sumKnots += rawRoute[j].speed; count++;
    }
    const speedKmh = (sumKnots / count) * 1.852;
    smoothedRoute.push({ ...rawRoute[i], speedKmh, speedMs: speedKmh / 3.6, timeMs: new Date(rawRoute[i].fixTime).getTime() });
  }

  let skipAnalysisUntil = 0;
  for (let i = 0; i < smoothedRoute.length - 1; i++) {
    const p1 = smoothedRoute[i];
    if (p1.timeMs < skipAnalysisUntil || p1.speedKmh < CONFIG.minSpeedKmh) continue;

    let maxAbsAccel = 0; let bestEvent = null;

    for (let j = i + 1; j < smoothedRoute.length; j++) {
      const p2 = smoothedRoute[j];
      const deltaT = (p2.timeMs - p1.timeMs) / 1000; 
      if (deltaT > CONFIG.maxTimeSec) break;
      if (deltaT < CONFIG.minTimeSec) continue;

      const absDeltaV_Kmh = Math.abs(p2.speedKmh - p1.speedKmh);
      const acceleration = (p2.speedMs - p1.speedMs) / deltaT;
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
            severity, 
            speed1: p1.speedKmh, 
            speed2: p2.speedKmh, 
            deltaT, 
            acceleration: absAccel, 
            ignition: p2.attributes?.ignition, 
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
  return calculatedEvents;
};

// 🔥 NUEVO CEREBRO: ANALIZADOR DE FATIGA Y TIEMPOS DE CONDUCCIÓN
const calculateDrivingHours = (routeData, deviceName) => {
  const routeByDay = {};
  const getLocalDateStr = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  routeData.forEach(pos => {
    const dateStr = getLocalDateStr(pos.fixTime);
    if (!routeByDay[dateStr]) routeByDay[dateStr] = [];
    routeByDay[dateStr].push(pos);
  });

  const results = [];

  Object.keys(routeByDay).forEach(dateStr => {
    const dayRoute = routeByDay[dateStr];
    let startTime = null;
    let endTime = null;
    let totalDrivingMs = 0;
    let maxConsecutiveMs = 0;

    let currentSegmentStart = null;
    let lastMovingTime = null;

    dayRoute.forEach(pos => {
      const speedKmh = pos.speed * 1.852;
      const timeMs = new Date(pos.fixTime).getTime();

      if (speedKmh > 2) {
        if (!startTime) startTime = pos.fixTime;
        endTime = pos.fixTime;

        if (!currentSegmentStart) {
          currentSegmentStart = timeMs;
          lastMovingTime = timeMs;
        } else {
          const gap = timeMs - lastMovingTime;
          // Criterio de seguridad: si el carro para más de 10 minutos (600,000 ms), rompe las horas seguidas
          if (gap > 600000) { 
            const duration = lastMovingTime - currentSegmentStart;
            totalDrivingMs += duration;
            if (duration > maxConsecutiveMs) maxConsecutiveMs = duration;
            currentSegmentStart = timeMs;
          }
          lastMovingTime = timeMs;
        }
      } else {
        if (currentSegmentStart) {
          const gap = timeMs - lastMovingTime;
          if (gap > 600000) { 
            const duration = lastMovingTime - currentSegmentStart;
            totalDrivingMs += duration;
            if (duration > maxConsecutiveMs) maxConsecutiveMs = duration;
            currentSegmentStart = null;
          }
        }
      }
    });

    if (currentSegmentStart && lastMovingTime) {
      const duration = lastMovingTime - currentSegmentStart;
      totalDrivingMs += duration;
      if (duration > maxConsecutiveMs) maxConsecutiveMs = duration;
    }

    if (totalDrivingMs > 0) {
      results.push({
        deviceName,
        dateStr,
        startTime,
        endTime,
        totalDrivingMs,
        maxConsecutiveMs
      });
    }
  });

  return results;
};

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
  const [engineData, setEngineData] = useState([]); // 🔥 NUEVO: Estado para ciclos de motor
  
  const [isFetching, setIsFetching] = useState(false);
  const [progressMsg, setProgressMsg] = useState(''); // Indicador de progreso en vivo

  // ESTADO: Controla la ventana flotante del mapa
  const [mapModal, setMapModal] = useState({ isOpen: false, lat: 0, lng: 0 });

  // Traductor Inverso de Coordenadas a Direcciones Reales
  const reverseGeocodeFallback = async (lat, lon) => {
    if (!lat || !lon) return 'Coordenadas inválidas';
    
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (geoCache[cacheKey]) return geoCache[cacheKey];

    try {
      await new Promise(resolve => setTimeout(resolve, 500)); // Retraso de 500ms para evitar bloqueo por Spam
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

  // Calendario a prueba de desbordamientos (Mes Anterior)
  const handleRangeChange = (rangeValue) => {
    setQuickRange(rangeValue);
    if (rangeValue === 'custom') return;

    const now = new Date(); 
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();

    let start, end;

    if (rangeValue === 'today') { 
      start = new Date(year, month, date, 0, 0, 0, 0);
      end = new Date(year, month, date, 23, 59, 59, 999);
    } 
    else if (rangeValue === 'yesterday') { 
      start = new Date(year, month, date - 1, 0, 0, 0, 0);
      end = new Date(year, month, date - 1, 23, 59, 59, 999);
    } 
    else if (rangeValue === 'thisWeek') { 
      const currentDay = now.getDay() === 0 ? 7 : now.getDay();
      start = new Date(year, month, date - currentDay + 1, 0, 0, 0, 0);
      end = new Date(year, month, date, 23, 59, 59, 999);
    } 
    else if (rangeValue === 'thisMonth') { 
      start = new Date(year, month, 1, 0, 0, 0, 0);
      end = new Date(year, month, date, 23, 59, 59, 999);
    } 
    else if (rangeValue === 'lastMonth') { 
      start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      end = new Date(year, month, 0, 23, 59, 59, 999);
    }

    const format = (d) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}T${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    setReportConfig({ ...reportConfig, from: format(start), to: format(end) });
  };

  const formatDuration = (ms) => {
    if (!ms) return '0 h 0 m';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours} h ${minutes} m`;
  };

  const getLocalDateStr = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  const handleFetchData = async (e) => {
    e.preventDefault();
    setIsFetching(true);
    setProgressMsg(''); 

    setSummaryData([]); setRouteData([]); setEventsData([]); setStopsData([]); setEngineData([]);
    

    const fromISO = encodeURIComponent(new Date(reportConfig.from).toISOString());
    const toISO = encodeURIComponent(new Date(reportConfig.to).toISOString());
    const baseParams = `deviceId=${reportConfig.deviceId}&from=${fromISO}&to=${toISO}`;
    const headers = { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' };

    try {
      if (reportType === 'daily') {
        const resSummary = await fetch(`${BASE_URL}/api/reports/summary?${baseParams}&daily=true`, { headers });
        if (resSummary.ok) {
            let rawSummary = await resSummary.json();
            
            // AGRUPADOR INTELIGENTE POR DÍA 
            const grouped = {};
            rawSummary.forEach(day => {
                if (day.distance < 10 && day.engineHours === 0) return; 
                
                const localDateStr = getLocalDateStr(day.startTime);

                if (!grouped[localDateStr]) {
                    grouped[localDateStr] = { ...day, displayDate: localDateStr };
                } else {
                    grouped[localDateStr].distance += day.distance;
                    grouped[localDateStr].engineHours += day.engineHours;
                    grouped[localDateStr].averageSpeed = (grouped[localDateStr].averageSpeed + (day.averageSpeed || 0)) / 2;

                    if (new Date(day.startTime).getTime() < new Date(grouped[localDateStr].startTime).getTime()) {
                        grouped[localDateStr].startTime = day.startTime;
                        grouped[localDateStr].startOdometer = day.startOdometer;
                    }
                }
            });

            setSummaryData(Object.values(grouped));
        }
      } 
      else if (reportType === 'route' || reportType === 'ecopetrol') {
        const res = await fetch(`${BASE_URL}/api/reports/route?${baseParams}`, { headers });
        if (res.ok) setRouteData(await res.json());
      }
      else if (reportType === 'speed') {
        const res = await fetch(`${BASE_URL}/api/reports/route?${baseParams}`, { headers });
        if (res.ok) {
            const route = await res.json();
            const overspeed = route.filter(pos => (pos.speed * 1.852) > speedLimit);
            const events = overspeed.map(pos => ({
                id: pos.id, 
                serverTime: pos.fixTime, 
                type: 'overspeed', 
                speed: pos.speed, 
                ignition: pos.attributes?.ignition,
                latitude: pos.latitude, 
                longitude: pos.longitude
            }));
            
            setEventsData(events);
            
            // Traducción Secuencial 
            const translateEvents = async () => {
                const limit = Math.min(events.length, 100); 
                for (let i = 0; i < limit; i++) {
                    const ev = events[i];
                    const finalAddress = await reverseGeocodeFallback(ev.latitude, ev.longitude);
                    setEventsData(prev => {
                        const updated = [...prev];
                        const idx = updated.findIndex(e => e.id === ev.id);
                        if (idx !== -1) updated[idx] = { ...updated[idx], address: finalAddress };
                        return updated;
                    });
                }
            };
            translateEvents();
        }
      }
      else if (reportType === 'fleet_speed') {
        let allEvents = [];
        const totalVehicles = devices.length;
        const chunkSize = 2; 

        for (let i = 0; i < totalVehicles; i += chunkSize) {
            const chunk = devices.slice(i, i + chunkSize);
            setProgressMsg(`Analizando velocidad: ${Math.min(i + chunkSize, totalVehicles)} de ${totalVehicles} vehículos...`);

            const promises = chunk.map(device => {
                const params = `deviceId=${device.id}&from=${fromISO}&to=${toISO}`;
                return fetch(`${BASE_URL}/api/reports/route?${params}`, { headers })
                    .then(res => res.ok ? res.json() : [])
                    .then(route => {
                        if (!Array.isArray(route)) return [];
                        const overspeed = route.filter(pos => (pos.speed * 1.852) > speedLimit);
                        return overspeed.map(pos => ({
                            id: pos.id, deviceName: device.name, serverTime: pos.fixTime, type: 'overspeed', speed: pos.speed, ignition: pos.attributes?.ignition, latitude: pos.latitude, longitude: pos.longitude
                        }));
                    }).catch(() => []); 
            });

            const chunkResults = await Promise.all(promises);
            allEvents.push(...chunkResults.flat());
            await new Promise(resolve => setTimeout(resolve, 400));
        }
        
        allEvents.sort((a, b) => new Date(b.serverTime) - new Date(a.serverTime));
        setEventsData(allEvents);
        
        const translateEvents = async () => {
            const limit = Math.min(allEvents.length, 100);
            for (let i = 0; i < limit; i++) {
                const ev = allEvents[i];
                const finalAddress = await reverseGeocodeFallback(ev.latitude, ev.longitude);
                setEventsData(prev => {
                    const updated = [...prev];
                    const idx = updated.findIndex(e => e.id === ev.id);
                    if (idx !== -1) updated[idx] = { ...updated[idx], address: finalAddress };
                    return updated;
                });
            }
        };
        translateEvents();
      }
      else if (reportType === 'behavior') {
        setProgressMsg('Analizando telemetría y consolidando infracciones...');
        const resSummary = await fetch(`${BASE_URL}/api/reports/summary?${baseParams}&daily=true`, { headers });
        const resRoute = await fetch(`${BASE_URL}/api/reports/route?${baseParams}`, { headers });

        if (resSummary.ok && resRoute.ok) {
            const rawSummary = await resSummary.json();
            const rawRoute = await resRoute.json();

            const grouped = {};
            
            // 1. Iniciamos creando los días según el resumen
            rawSummary.forEach(day => {
                if (day.distance < 10 && day.engineHours === 0) return;
                const localDateStr = getLocalDateStr(day.startTime);
                if (!grouped[localDateStr]) {
                    grouped[localDateStr] = { 
                        dateStr: localDateStr, distanceKm: day.distance / 1000,
                        overspeeds: 0, harshAccels: 0, harshBrakes: 0
                    };
                } else {
                    grouped[localDateStr].distanceKm += (day.distance / 1000);
                }
            });

            // 2. Extraemos Excesos de velocidad
            let isOver = false;
            rawRoute.forEach(pos => {
                const speedKmh = pos.speed * 1.852;
                const localDateStr = getLocalDateStr(pos.fixTime);

                // 🔥 PROTECCIÓN: Si el día no existe en el resumen, lo creamos forzadamente
                if (!grouped[localDateStr]) {
                     grouped[localDateStr] = { dateStr: localDateStr, distanceKm: 0, overspeeds: 0, harshAccels: 0, harshBrakes: 0 };
                }

                if (speedKmh > speedLimit) {
                    if (!isOver) { grouped[localDateStr].overspeeds++; isOver = true; }
                } else { isOver = false; }
            });

            // 3. Extraemos Aceleraciones y Frenadas usando el mismo motor cinemático avanzado
            const harshEvents = calculateHarshEvents(rawRoute);
            harshEvents.forEach(ev => {
                const localDateStr = getLocalDateStr(ev.serverTime);
                
                // 🔥 PROTECCIÓN ADICIONAL: Por si acaso
                if (!grouped[localDateStr]) {
                     grouped[localDateStr] = { dateStr: localDateStr, distanceKm: 0, overspeeds: 0, harshAccels: 0, harshBrakes: 0 };
                }
                
                if (ev.type === 'harshAcceleration') grouped[localDateStr].harshAccels++;
                if (ev.type === 'harshBraking') grouped[localDateStr].harshBrakes++;
            });

            // 4. Ordenamos por fecha cronológica para que no salgan revueltos
            const finalData = Object.values(grouped).sort((a,b) => {
                const [d1, m1, y1] = a.dateStr.split('/');
                const [d2, m2, y2] = b.dateStr.split('/');
                return new Date(y1, m1-1, d1) - new Date(y2, m2-1, d2);
            });

            setSummaryData(finalData);
        }
      }
      else if (reportType === 'fleet_behavior') {
        const totalVehicles = devices.length;
        const chunkSize = 2; 
        const fleetStats = [];

        for (let i = 0; i < totalVehicles; i += chunkSize) {
            const chunk = devices.slice(i, i + chunkSize);
            setProgressMsg(`Auditando hábitos: Vehículos ${Math.min(i + chunkSize, totalVehicles)} de ${totalVehicles}...`);

            const promises = chunk.map(async (device) => {
                let distanceKm = 0; let overspeeds = 0; let harshAccels = 0; let harshBrakes = 0;
                const params = `deviceId=${device.id}&from=${fromISO}&to=${toISO}`;
                
                try {
                    const resSum = await fetch(`${BASE_URL}/api/reports/summary?${params}`, { headers });
                    if (resSum.ok) {
                        const sums = await resSum.json();
                        if (sums && sums.length > 0) distanceKm = sums[0].distance / 1000;
                    }
                    
                    const resRoute = await fetch(`${BASE_URL}/api/reports/route?${params}`, { headers });
                    if (resRoute.ok) {
                        const rawRoute = await resRoute.json();
                        
                        // 1. Conteo de Excesos
                        let isOver = false;
                        rawRoute.forEach(pos => {
                            const speedKmh = pos.speed * 1.852;
                            if (speedKmh > speedLimit) {
                                if (!isOver) { overspeeds++; isOver = true; }
                            } else { isOver = false; }
                        });

                        // 2. Conteo de Aceleración y Frenada (Motor Avanzado)
                        const harshEvents = calculateHarshEvents(rawRoute);
                        harshEvents.forEach(ev => {
                            if (ev.type === 'harshAcceleration') harshAccels++;
                            if (ev.type === 'harshBraking') harshBrakes++;
                        });
                    }
                } catch(e) { console.warn("Fallo auditoría en:", device.name); }

                return { name: device.name, distanceKm, overspeeds, harshAccels, harshBrakes };
            });

            const chunkResults = await Promise.all(promises);
            fleetStats.push(...chunkResults);
            await new Promise(resolve => setTimeout(resolve, 400));
        }

        fleetStats.sort((a, b) => (b.overspeeds + b.harshBrakes + b.harshAccels) - (a.overspeeds + a.harshBrakes + a.harshAccels));
        setSummaryData(fleetStats);
      }
      else if (reportType === 'harsh') {
        const res = await fetch(`${BASE_URL}/api/reports/route?${baseParams}`, { headers });
        if (res.ok) {
            const rawRoute = await res.json();
            
            // Usamos el cerebro centralizado
            const calculatedEvents = calculateHarshEvents(rawRoute);
            setEventsData(calculatedEvents);
            
            const translateEvents = async () => {
                const limit = Math.min(calculatedEvents.length, 100);
                for (let i = 0; i < limit; i++) {
                    const ev = calculatedEvents[i];
                    const finalAddress = await reverseGeocodeFallback(ev.latitude, ev.longitude);
                    setEventsData(prev => {
                        const updated = [...prev];
                        const idx = updated.findIndex(e => e.id === ev.id);
                        if (idx !== -1) updated[idx] = { ...updated[idx], address: finalAddress };
                        return updated;
                    });
                }
            };
            translateEvents();
        }
      }
      else if (reportType === 'stops' || reportType === 'idle') {
        const res = await fetch(`${BASE_URL}/api/reports/stops?${baseParams}`, { headers });
        if (res.ok) {
            let stops = await res.json();
            if (reportType === 'idle') stops = stops.filter(stop => stop.engineHours && stop.engineHours > 0);
            
            setStopsData(stops);
            
            const translateStops = async () => {
                const limit = Math.min(stops.length, 100);
                for (let i = 0; i < limit; i++) {
                    const stop = stops[i];
                    if (!stop.address || /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(stop.address)) {
                        const finalAddress = await reverseGeocodeFallback(stop.latitude, stop.longitude);
                        setStopsData(prev => {
                            const updated = [...prev];
                            if (updated[i]) {
                                updated[i] = { ...updated[i], address: finalAddress };
                            }
                            return updated;
                        });
                    }
                }
            };
            translateStops();
        }
      }
      // 🔥 NUEVOS REPORTES DE FATIGA Y CONDUCCIÓN (INDIVIDUAL Y FLOTA)
      else if (reportType === 'driving_hours') {
        setProgressMsg('Analizando telemetría y calculando tiempos de conducción...');
        const resRoute = await fetch(`${BASE_URL}/api/reports/route?${baseParams}`, { headers });

        if (resRoute.ok) {
            const rawRoute = await resRoute.json();
            const deviceName = devices.find(d => String(d.id) === String(reportConfig.deviceId))?.name || 'Vehículo';
            const analyzedData = calculateDrivingHours(rawRoute, deviceName);
            setSummaryData(analyzedData);
        }
      }
      else if (reportType === 'fleet_driving_hours') {
        const totalVehicles = devices.length;
        const chunkSize = 2; 
        const fleetStats = [];

        for (let i = 0; i < totalVehicles; i += chunkSize) {
            const chunk = devices.slice(i, i + chunkSize);
            setProgressMsg(`Calculando horas de conducción: ${Math.min(i + chunkSize, totalVehicles)} de ${totalVehicles}...`);

            const promises = chunk.map(async (device) => {
                const params = `deviceId=${device.id}&from=${fromISO}&to=${toISO}`;
                try {
                    const resRoute = await fetch(`${BASE_URL}/api/reports/route?${params}`, { headers });
                    if (resRoute.ok) {
                        const rawRoute = await resRoute.json();
                        return calculateDrivingHours(rawRoute, device.name);
                    }
                } catch(e) { console.warn("Fallo auditoría en:", device.name); }
                return [];
            });

            const chunkResults = await Promise.all(promises);
            fleetStats.push(...chunkResults.flat());
            await new Promise(resolve => setTimeout(resolve, 400));
        }

        // Ordenar por vehículo y luego por fecha
        fleetStats.sort((a, b) => {
            if (a.deviceName < b.deviceName) return -1;
            if (a.deviceName > b.deviceName) return 1;
            const [d1, m1, y1] = a.dateStr.split('/');
            const [d2, m2, y2] = b.dateStr.split('/');
            return new Date(y1, m1-1, d1) - new Date(y2, m2-1, d2);
        });

        setSummaryData(fleetStats);
      }
    } catch (err) { 
        console.error(err);
        alert("Hubo un problema de conexión al extraer la información.");
    }
    setIsFetching(false);
    setProgressMsg(''); 
  };

  const handleDownloadExcel = () => {
    if (isFetching) return alert("Por favor espera a que termine de cargar el informe para exportarlo.");

    const selectedDevice = devices.find(d => String(d.id) === String(reportConfig.deviceId));
    const isFleetReport = (reportType === 'fleet_speed' || reportType === 'fleet_behavior' || reportType === 'fleet_driving_hours');
    const placaVehiculo = isFleetReport ? "TODA LA FLOTA" : (selectedDevice ? selectedDevice.name.toUpperCase() : "TODOS LOS VEHÍCULOS");
    
    let filename = `Reporte_${reportType}_${new Date().getTime()}.xls`;
    let nombreReporteMayus = "INFORME DETALLADO DE TELEMETRÍA";

    if (reportType === 'daily') nombreReporteMayus = "RESUMEN DIARIO";
    else if (reportType === 'route') nombreReporteMayus = "INFORME DETALLADO PUNTO A PUNTO";
    else if (reportType === 'ecopetrol') nombreReporteMayus = "INFORME COMPLETO DE ECOPETROL"; 
    else if (reportType === 'speed') nombreReporteMayus = "INFORME DE EXCESOS DE VELOCIDAD (INDIVIDUAL)";
    else if (reportType === 'fleet_speed') nombreReporteMayus = "INFORME DE EXCESOS DE VELOCIDAD (TODA LA FLOTA)";
    else if (reportType === 'harsh') nombreReporteMayus = "INFORME DE ACELERACIONES Y FRENADAS BRUSCAS";
    else if (reportType === 'idle') nombreReporteMayus = "INFORME DE TIEMPOS EN RALENTÍ";
    else if (reportType === 'stops') nombreReporteMayus = "INFORME DE VEHÍCULOS DETENIDOS (PARADAS)";
    else if (reportType === 'behavior') nombreReporteMayus = "HÁBITOS DE CONDUCCIÓN (INDIVIDUAL DIARIO)";
    else if (reportType === 'fleet_behavior') nombreReporteMayus = "RANKING DE CONDUCCIÓN (TODA LA FLOTA)";
    // Títulos nuevos
    else if (reportType === 'driving_hours') nombreReporteMayus = "HORAS DE CONDUCCIÓN NETAS Y FATIGA (INDIVIDUAL)";
    else if (reportType === 'fleet_driving_hours') nombreReporteMayus = "HORAS DE CONDUCCIÓN NETAS Y FATIGA (FLOTA)";

    let htmlTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"/><style>
        th { background-color: #1F2937; color: #FFFFFF; font-weight: bold; text-align: left; font-family: Arial; font-size: 11pt; padding: 6px; }
        td { border: 0.5pt solid #D1D5DB; font-family: Arial; font-size: 10pt; padding: 4px; }
        .meta-title { font-size: 12pt; font-weight: bold; color: #111827; font-family: Arial; }
      </style></head>
      <body>
      <table>
        <tr><td colspan="8" class="meta-title"><b>TIPO DE INFORME: ${nombreReporteMayus}</b></td></tr>
        <tr><td colspan="8" class="meta-title"><b>VEHÍCULO / PLACA: ${placaVehiculo}</b></td></tr>
        <tr><td colspan="8" style="color: #6B7280;">Fecha de exportación: ${new Date().toLocaleString()}</td></tr>
        <tr></tr>
    `;

    if (reportType === 'daily') {
      if (summaryData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `<tr><th><b>DISPOSITIVO</b></th><th><b>FECHA DE INICIO</b></th><th><b>VELOCIDAD MEDIA (KM/H)</b></th><th><b>DISTANCIA (KM)</b></th><th><b>HORAS MOTOR</b></th><th><b>ODÓMETRO INICIAL (KM)</b></th></tr>`;
      summaryData.forEach(day => {
        const deviceName = devices.find(d => d.id === day.deviceId)?.name || 'Desconocido';
        const dateStr = day.displayDate || getLocalDateStr(day.startTime);
        const avgSpeed = day.averageSpeed ? (day.averageSpeed * 1.852).toFixed(2).replace('.', ',') : '0,00';
        const distanceVal = day.distance ? (day.distance / 1000).toFixed(2).replace('.', ',') : '0,00';
        const engineStr = formatDuration(day.engineHours);
        const startOdo = day.startOdometer ? (day.startOdometer / 1000).toFixed(2).replace('.', ',') : '0,00';

        htmlTemplate += `<tr><td>${deviceName}</td><td>${dateStr}</td><td>${avgSpeed}</td><td>${distanceVal}</td><td>${engineStr}</td><td>${startOdo}</td></tr>`;
      });
    } 
    else if (reportType === 'behavior') {
      if (summaryData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `<tr><th><b>FECHA</b></th><th><b>DISTANCIA RECORRIDA (KM)</b></th><th><b>EXCESOS DE VELOCIDAD (>${speedLimit} KM/H)</b></th><th><b>ACELERACIONES BRUSCAS</b></th><th><b>FRENADAS BRUSCAS</b></th></tr>`;
      summaryData.forEach(day => {
        htmlTemplate += `<tr><td>${day.dateStr}</td><td>${day.distanceKm.toFixed(2).replace('.', ',')}</td><td>${day.overspeeds}</td><td>${day.harshAccels}</td><td>${day.harshBrakes}</td></tr>`;
      });
    }
    else if (reportType === 'fleet_behavior') {
      if (summaryData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `<tr><th><b>VEHÍCULO / PLACA</b></th><th><b>DISTANCIA TOTAL (KM)</b></th><th><b>EXCESOS DE VELOCIDAD (>${speedLimit} KM/H)</b></th><th><b>ACELERACIONES BRUSCAS</b></th><th><b>FRENADAS BRUSCAS</b></th><th><b>TOTAL INFRACCIONES</b></th></tr>`;
      summaryData.forEach(dev => {
        const total = dev.overspeeds + dev.harshAccels + dev.harshBrakes;
        htmlTemplate += `<tr><td>${dev.name}</td><td>${dev.distanceKm.toFixed(2).replace('.', ',')}</td><td>${dev.overspeeds}</td><td>${dev.harshAccels}</td><td>${dev.harshBrakes}</td><td><b>${total}</b></td></tr>`;
      });
    }
    else if (reportType === 'route') {
      if (routeData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `<tr><th><b>FECHA Y HORA EXACTA</b></th><th><b>ESTADO MOTOR</b></th><th><b>VELOCIDAD (KM/H)</b></th><th><b>BATERÍA GPS</b></th><th><b>DIRECCIÓN / COORDENADAS</b></th></tr>`;
      routeData.forEach(pos => {
        const dt = new Date(pos.fixTime).toLocaleString();
        const speed = (pos.speed * 1.852);
        
        const isEngineOn = pos.attributes?.ignition || speed > 0;
        const ignition = isEngineOn ? 'Encendido' : 'Apagado';
        
        const speedText = speed.toFixed(1).replace('.', ',');
        const battery = pos.attributes?.batteryLevel ? `${pos.attributes.batteryLevel}%` : 'N/A';
        const address = pos.address ? pos.address : `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;
        htmlTemplate += `<tr><td>${dt}</td><td>${ignition}</td><td>${speedText}</td><td>${battery}</td><td>${address}</td></tr>`;
      });
    }
    else if (reportType === 'ecopetrol') {
      if (routeData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `<tr><th><b>PLACA</b></th><th><b>FECHA</b></th><th><b>HORA</b></th><th><b>ESTADO MOTOR</b></th><th><b>VELOCIDAD (KM/H)</b></th><th><b>ODÓMETRO (KM)</b></th><th><b>LATITUD</b></th><th><b>LONGITUD</b></th><th><b>UBICACIÓN</b></th></tr>`;
      routeData.forEach(pos => {
        const dt = new Date(pos.fixTime);
        const placa = selectedDevice ? selectedDevice.name : (devices.find(d => String(d.id) === String(pos.deviceId))?.name || 'Desconocido');
        const speed = (pos.speed * 1.852);
        
        const isEngineOn = pos.attributes?.ignition || speed > 0;
        const ignition = isEngineOn ? 'Encendido' : 'Apagado';

        const speedText = speed.toFixed(1).replace('.', ',');
        const odometer = ((pos.attributes?.totalDistance || pos.attributes?.odometer || 0) / 1000).toFixed(2).replace('.', ',');
        const address = pos.address || `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;
        htmlTemplate += `<tr><td>${placa}</td><td>${dt.toLocaleDateString()}</td><td>${dt.toLocaleTimeString()}</td><td>${ignition}</td><td>${speedText}</td><td>${odometer}</td><td>${pos.latitude.toFixed(5)}</td><td>${pos.longitude.toFixed(5)}</td><td>${address}</td></tr>`;
      });
    }
    else if (reportType === 'speed' || reportType === 'harsh' || reportType === 'fleet_speed') {
      if (eventsData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `<tr>${reportType === 'fleet_speed' ? '<th><b>VEHÍCULO / PLACA</b></th>' : ''}<th><b>FECHA Y HORA</b></th><th><b>TIPO DE EVENTO</b></th><th><b>SEVERIDAD</b></th><th><b>DETALLE FÍSICO / TELEMETRÍA</b></th><th><b>UBICACIÓN TRADUCIDA</b></th></tr>`;
      
      eventsData.forEach(ev => {
        const dt = new Date(ev.serverTime).toLocaleString();
        let typeText = ev.type.toUpperCase();
        let detail = '';
        
        if (ev.type === 'overspeed') { typeText = 'EXCESO DE VELOCIDAD'; detail = `Registrado: ${(ev.speed * 1.852).toFixed(1).replace('.', ',')} km/h`; }
        else if (ev.type === 'harshAcceleration') { typeText = 'ACELERACIÓN BRUSCA'; detail = `De ${ev.speed1.toFixed(0)} a ${ev.speed2.toFixed(0)} km/h en ${ev.deltaT.toFixed(1)}s`; }
        else if (ev.type === 'harshBraking') { typeText = 'FRENADA BRUSCA'; detail = `De ${ev.speed1.toFixed(0)} a ${ev.speed2.toFixed(0)} km/h en ${ev.deltaT.toFixed(1)}s`; }
        
        const speedKmh = ev.speed ? (ev.speed * 1.852) : (ev.speed2 || 0);
        const isEngineOn = ev.ignition || speedKmh > 0;
        detail += ` | Motor: ${isEngineOn ? 'Encendido' : 'Apagado'}`;

        const address = ev.address ? ev.address : `${ev.latitude?.toFixed(5)}, ${ev.longitude?.toFixed(5)}`;
        
        htmlTemplate += `<tr>${reportType === 'fleet_speed' ? `<td><b>${ev.deviceName}</b></td>` : ''}<td>${dt}</td><td>${typeText}</td><td>${ev.severity || 'ALERTA'}</td><td>${detail}</td><td>${address}</td></tr>`;
      });
    }
    else if (reportType === 'stops' || reportType === 'idle') {
      if (stopsData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `<tr><th><b>HORA DE INICIO</b></th><th><b>HORA DE FIN</b></th><th><b>DURACIÓN TOTAL (PARQUEADO)</b></th><th><b>HORAS MOTOR (RALENTÍ)</b></th><th><b>UBICACIÓN TRADUCIDA</b></th></tr>`;
      stopsData.forEach(stop => {
        const start = new Date(stop.startTime).toLocaleString();
        const end = new Date(stop.endTime).toLocaleString();
        const engine = stop.engineHours > 0 ? formatDuration(stop.engineHours) : 'Motor Apagado';
        const address = stop.address ? stop.address : `${stop.latitude.toFixed(4)}, ${stop.longitude.toFixed(4)}`;
        htmlTemplate += `<tr><td>${start}</td><td>${end}</td><td>${formatDuration(stop.duration)}</td><td>${engine}</td><td>${address}</td></tr>`;
      });
    }
    // Exportación nuevos reportes
    else if (reportType === 'driving_hours' || reportType === 'fleet_driving_hours') {
      if (summaryData.length === 0) return alert("No hay datos para exportar.");
      htmlTemplate += `<tr>${reportType === 'fleet_driving_hours' ? '<th><b>VEHÍCULO</b></th>' : ''}<th><b>FECHA</b></th><th><b>HORA INICIO (1er Mov)</b></th><th><b>HORA FIN (Último Mov)</b></th><th><b>CONDUCCIÓN SEGUIDA MÁXIMA</b></th><th><b>TOTAL CONDUCCIÓN DÍA</b></th><th><b>ALERTA SEG. VIAL</b></th></tr>`;
      summaryData.forEach(day => {
        const maxConsecutiveHours = day.maxConsecutiveMs / 3600000;
        const isFatigued = maxConsecutiveHours > 4; // Umbral de alerta: 4 horas continuas
        const fatigaStatus = isFatigued ? '⚠️ Riesgo de Fatiga (>4h)' : '✅ Descanso Óptimo';
        htmlTemplate += `<tr>${reportType === 'fleet_driving_hours' ? `<td>${day.deviceName}</td>` : ''}<td>${day.dateStr}</td><td>${new Date(day.startTime).toLocaleTimeString()}</td><td>${new Date(day.endTime).toLocaleTimeString()}</td><td>${formatDuration(day.maxConsecutiveMs)}</td><td>${formatDuration(day.totalDrivingMs)}</td><td>${fatigaStatus}</td></tr>`;
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
            El Módulo de Informes Analíticos procesa grandes volúmenes de telemetría y no está diseñado para pantallas de teléfonos móviles.
          </p>
        </div>
      </main>
    );
  }

  // 🔥 ACTUALIZADO PARA BLOQUEAR EL VEHÍCULO EN EL MODO FLOTA
  const isFleetReport = (reportType === 'fleet_speed' || reportType === 'fleet_behavior' || reportType === 'fleet_driving_hours');

  return (
    <main style={{flex: 1, padding: '20px 30px', overflowY: 'auto'}}>
      <h2 style={{color:'white', margin:'0 0 20px 0'}}>Módulo de Informes Analíticos</h2>
      
      <div style={styles.adminCard}>
        <form onSubmit={handleFetchData} style={{display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end'}}>
          
          <div style={{flex: 1, minWidth: '150px'}}>
            <label style={styles.label}>Vehículo:</label>
            <select 
              required={!isFleetReport} 
              disabled={isFleetReport}
              value={isFleetReport ? 'all' : reportConfig.deviceId} 
              onChange={e => setReportConfig({...reportConfig, deviceId: e.target.value})} 
              style={styles.input}
            >
                {isFleetReport ? (
                  <option value="all">Toda la Flota</option>
                ) : (
                  <option value="">-- Seleccionar --</option>
                )}
                {!isFleetReport && devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        
          <div style={{flex: 1, minWidth: '220px'}}>
            <label style={styles.label}>Tipo de Informe:</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)} style={styles.input}>
                <optgroup label="Uso y Tiempos">
                    <option value="daily">Resumen Diario </option>
                    <option value="idle">Tiempo en Ralentí</option>
                    <option value="stops">Vehículos Detenidos (Paradas)</option>
                </optgroup>
                <optgroup label="Seguridad y Auditoría">
                    {/* 🔥 DOS NUEVAS OPCIONES INTEGRADAS AQUÍ */}
                    <option value="driving_hours">Horas de Conducción Netas (Individual)</option>
                    <option value="fleet_driving_hours">Horas de Conducción Netas (Flota)</option>
                    <option value="behavior">Hábitos de Conducción (Individual Diario)</option>
                    <option value="fleet_behavior">Ranking de Conducción (Toda la Flota)</option>
                    <option value="speed">Exceso de Velocidad (Individual Punto a Punto)</option>
                    <option value="fleet_speed">Exceso de Velocidad (Toda la Flota Punto a Punto)</option>
                    <option value="harsh">Aceleración y Frenada Brusca</option>
                </optgroup>
                <optgroup label="Especiales / Avanzados">
                    <option value="route">Detallado Punto a Punto</option>
                    <option value="ecopetrol">Informe Completo Ecopetrol</option>
                </optgroup>
            </select>
          </div>

          {(reportType === 'speed' || reportType === 'fleet_speed' || reportType === 'behavior' || reportType === 'fleet_behavior') && (
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
            {isFetching ? (progressMsg || 'Analizando...') : 'Analizar Data'}
          </button>
          
          <button type="button" onClick={handleDownloadExcel} style={{...styles.btn, backgroundColor: '#10B981'}}>
            Descargar Excel
          </button>
        </form>
      </div>

      <div style={styles.tableContainer}>
        
        {/* 🔥 NUEVO RENDERIZADO: HORAS DE CONDUCCIÓN */}
        {(reportType === 'driving_hours' || reportType === 'fleet_driving_hours') && (
          <>
            <h3 style={styles.tableTitle}>
              {reportType === 'driving_hours' 
                 ? `Horas de Conducción y Fatiga (${summaryData.length} días)`
                 : `Horas de Conducción por Flota (${summaryData.length} registros)`}
            </h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827', zIndex: 1}}>
                    <tr style={styles.tableHead}>
                        {reportType === 'fleet_driving_hours' && <th>Vehículo</th>}
                        <th>Fecha</th>
                        <th>Hora Inicio (1er Mov)</th>
                        <th>Hora Fin (Último Mov)</th>
                        <th>Conducción Seguidas (Máxima)</th>
                        <th>Total Horas al Día</th>
                        <th>Seguridad Vial</th>
                    </tr>
                </thead>
                <tbody>
                  {summaryData.length === 0 ? <tr><td colSpan={reportType === 'fleet_driving_hours' ? 7 : 6} style={styles.emptyText}>No hay datos de movimiento en este rango.</td></tr> :
                  summaryData.map((day, index) => {
                      const maxConsecutiveHours = day.maxConsecutiveMs / 3600000;
                      // Condición de seguridad vial: alerta sugerida si manejan más de 4 horas seguidas
                      const isFatigued = maxConsecutiveHours > 4; 
                      
                      return (
                          <tr key={index} style={{ borderBottom: '1px solid #1F2937' }}>
                            {reportType === 'fleet_driving_hours' && (
                               <td style={{...styles.td, fontWeight: 'bold', color: '#3B82F6'}}>{day.deviceName}</td>
                            )}
                            <td style={{...styles.td, fontWeight: 'bold', color: '#F3F4F6'}}>{day.dateStr}</td>
                            <td style={{...styles.td, color: '#9CA3AF'}}>{new Date(day.startTime).toLocaleTimeString()}</td>
                            <td style={{...styles.td, color: '#9CA3AF'}}>{new Date(day.endTime).toLocaleTimeString()}</td>
                            
                            <td style={{...styles.td, color: isFatigued ? '#EF4444' : '#10B981', fontWeight: 'bold'}}>
                                {formatDuration(day.maxConsecutiveMs)}
                            </td>
                            <td style={{...styles.td, color: '#3B82F6', fontWeight: 'bold'}}>
                                {formatDuration(day.totalDrivingMs)}
                            </td>
                            <td style={{...styles.td, color: isFatigued ? '#EF4444' : '#9CA3AF', fontSize: '12px'}}>
                                {isFatigued ? '⚠️ Riesgo de Fatiga (>4h continuas)' : '✅ Descanso Óptimo'}
                            </td>
                          </tr>
                      );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {reportType === 'behavior' && (
          <>
            <h3 style={styles.tableTitle}>Hábitos de Conducción (Desglose Diario) ({summaryData.length} días)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827', zIndex: 1}}>
                    <tr style={styles.tableHead}>
                        <th>Fecha</th>
                        <th>Distancia Recorrida</th>
                        <th>Excesos de Vel. (&gt;{speedLimit} km/h)</th>
                        <th>Aceleraciones Bruscas</th>
                        <th>Frenadas Bruscas</th>
                    </tr>
                </thead>
                <tbody>
                  {summaryData.length === 0 ? <tr><td colSpan="5" style={styles.emptyText}>No hay datos en este rango.</td></tr> :
                  summaryData.map((day, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #1F2937' }}>
                        <td style={{...styles.td, fontWeight: 'bold', color: '#F3F4F6'}}>{day.dateStr}</td>
                        <td style={{...styles.td, color: '#3B82F6', fontWeight: 'bold'}}>{day.distanceKm.toFixed(2)} km</td>
                        <td style={{...styles.td, color: day.overspeeds > 0 ? '#EF4444' : '#10B981', fontWeight: 'bold'}}>{day.overspeeds}</td>
                        <td style={{...styles.td, color: day.harshAccels > 0 ? '#F59E0B' : '#10B981', fontWeight: 'bold'}}>{day.harshAccels}</td>
                        <td style={{...styles.td, color: day.harshBrakes > 0 ? '#F59E0B' : '#10B981', fontWeight: 'bold'}}>{day.harshBrakes}</td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {reportType === 'fleet_behavior' && (
          <>
            <h3 style={styles.tableTitle}>Ranking de Conducción (Toda la Flota Consolidada)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827', zIndex: 1}}>
                    <tr style={styles.tableHead}>
                        <th>Vehículo / Placa</th>
                        <th>Distancia Total</th>
                        <th>Excesos de Vel. (&gt;{speedLimit} km/h)</th>
                        <th>Aceleraciones Bruscas</th>
                        <th>Frenadas Bruscas</th>
                        <th>Total Infracciones</th>
                    </tr>
                </thead>
                <tbody>
                  {summaryData.length === 0 ? <tr><td colSpan="6" style={styles.emptyText}>No hay datos en este rango.</td></tr> :
                  summaryData.map((dev, index) => {
                      const total = dev.overspeeds + dev.harshAccels + dev.harshBrakes;
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid #1F2937' }}>
                          <td style={{...styles.td, fontWeight: 'bold', color: '#3B82F6'}}>{dev.name}</td>
                          <td style={styles.td}>{dev.distanceKm.toFixed(2)} km</td>
                          <td style={{...styles.td, color: dev.overspeeds > 0 ? '#EF4444' : '#10B981'}}>{dev.overspeeds}</td>
                          <td style={{...styles.td, color: dev.harshAccels > 0 ? '#F59E0B' : '#10B981'}}>{dev.harshAccels}</td>
                          <td style={{...styles.td, color: dev.harshBrakes > 0 ? '#F59E0B' : '#10B981'}}>{dev.harshBrakes}</td>
                          <td style={{...styles.td, color: total > 0 ? '#EF4444' : '#10B981', fontWeight: 'bold'}}>{total}</td>
                        </tr>
                      )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {reportType === 'daily' && (
          <>
            <h3 style={styles.tableTitle}>Informe Diario Consolidado ({summaryData.length} registros)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827', zIndex: 1}}>
                    <tr style={styles.tableHead}>
                        <th>Dispositivo</th>
                        <th>Fecha de inicio</th>
                        <th>Velocidad media</th>
                        <th>Distancia</th>
                        <th>Horas motor</th>
                        <th>Odómetro inicial</th>
                    </tr>
                </thead>
                <tbody>
                  {summaryData.length === 0 ? <tr><td colSpan="6" style={styles.emptyText}>No hay datos en este rango.</td></tr> :
                  summaryData.map((day, index) => {
                    const deviceName = devices.find(d => d.id === day.deviceId)?.name || 'Desconocido';
                    const dateStr = day.displayDate || getLocalDateStr(day.startTime);
                    const avgSpeed = day.averageSpeed ? (day.averageSpeed * 1.852).toFixed(2) : '0.00';
                    const distanceVal = day.distance ? (day.distance / 1000).toFixed(2) : '0.00';
                    const engineStr = formatDuration(day.engineHours);
                    const startOdo = day.startOdometer ? (day.startOdometer / 1000).toFixed(2) : '0.00';

                    return (
                      <tr key={index} style={{ borderBottom: '1px solid #1F2937' }}>
                        <td style={{...styles.td, fontWeight: 'bold', color: '#3B82F6'}}>{deviceName}</td>
                        <td style={{...styles.td, color: '#F3F4F6'}}>{dateStr}</td>
                        <td style={{...styles.td, color: '#F3F4F6'}}>{avgSpeed} km/h</td>
                        <td style={{...styles.td, color: '#10B981', fontWeight: 'bold'}}>{distanceVal} Km</td>
                        <td style={{...styles.td, color: '#F59E0B'}}>{engineStr}</td>
                        <td style={{...styles.td, color: '#D1D5DB'}}>{startOdo} Km</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

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
                    const isEngineOn = pos.attributes?.ignition || speed > 0;

                    return (
                      <tr key={pos.id} style={{ borderBottom: '1px solid #1F2937' }}>
                        <td style={styles.td}>{new Date(pos.fixTime).toLocaleString()}</td>
                        <td style={{...styles.td, color: isEngineOn ? '#10B981' : '#6B7280', fontWeight: 'bold'}}>
                          {isEngineOn ? 'Encendido' : 'Apagado'}
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
                        <th>Estado Motor</th>
                        <th>Velocidad (km/h)</th>
                        <th>Odómetro (km)</th>
                        <th>Latitud</th>
                        <th>Longitud</th>
                        <th>Ubicación</th>
                    </tr>
                </thead>
                <tbody>
                  {routeData.length === 0 ? <tr><td colSpan="9" style={styles.emptyText}>No hay datos en este rango.</td></tr> :
                  routeData.slice(0, 3000).map((pos) => { 
                    const speed = (pos.speed * 1.852).toFixed(1);
                    const dt = new Date(pos.fixTime);
                    const selectedDevice = devices.find(d => String(d.id) === String(reportConfig.deviceId));
                    const placa = selectedDevice ? selectedDevice.name : (devices.find(d => String(d.id) === String(pos.deviceId))?.name || 'Desconocido');
                    const odometer = ((pos.attributes?.totalDistance || pos.attributes?.odometer || 0) / 1000).toFixed(2);
                    const address = pos.address || `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;
                    
                    const isEngineOn = pos.attributes?.ignition || speed > 0;

                    return (
                      <tr key={pos.id} style={{ borderBottom: '1px solid #1F2937' }}>
                        <td style={{...styles.td, color: '#3B82F6', fontWeight: 'bold'}}>{placa}</td>
                        <td style={styles.td}>{dt.toLocaleDateString()}</td>
                        <td style={styles.td}>{dt.toLocaleTimeString()}</td>
                        <td style={{...styles.td, color: isEngineOn ? '#10B981' : '#6B7280', fontWeight: 'bold'}}>{isEngineOn ? 'Encendido' : 'Apagado'}</td>
                        <td style={{...styles.td, color: speed > 80 ? '#EF4444' : '#F3F4F6', fontWeight: speed > 80 ? 'bold' : 'normal'}}>{speed}</td>
                        <td style={{...styles.td, color: '#10B981', fontWeight: 'bold'}}>{odometer}</td>
                        <td style={styles.td}>{pos.latitude.toFixed(5)}</td>
                        <td style={styles.td}>{pos.longitude.toFixed(5)}</td>
                        <td style={{...styles.td, fontSize: '12px', maxWidth: '250px', whiteSpace: 'normal'}}>
                          <button 
                            type="button" onClick={() => setMapModal({ isOpen: true, lat: pos.latitude, lng: pos.longitude })}
                            style={{ background: 'none', border: 'none', color: '#60A5FA', cursor: 'pointer', textDecoration: 'underline', padding: 0, textAlign: 'left', fontSize: '11px' }}
                          >📍 {address}</button>
                        </td>
                      </tr>
                    )
                  })}
                  {routeData.length > 3000 && <tr><td colSpan="9" style={{...styles.emptyText, color: '#F59E0B'}}>Se muestran los primeros 3000 registros para evitar sobrecarga del navegador.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {(reportType === 'speed' || reportType === 'harsh' || reportType === 'fleet_speed') && (
          <>
            <h3 style={styles.tableTitle}>Registro de Infracciones Detalladas ({eventsData.length} eventos)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827', zIndex: 1}}>
                    <tr style={styles.tableHead}>
                        {reportType === 'fleet_speed' && <th>Vehículo / Placa</th>}
                        <th>Fecha y Hora</th>
                        <th>Tipo de Evento</th>
                        <th>Severidad</th>
                        <th>Detalle Físico / Telemetría</th>
                        <th>Ubicación</th>
                    </tr>
                </thead>
                <tbody>
                  {eventsData.length === 0 ? <tr><td colSpan={reportType === 'fleet_speed' ? 6 : 5} style={styles.emptyText}>Excelente conducción. No se encontraron infracciones.</td></tr> :
                  eventsData.map((ev, index) => {
                    let typeText = ev.type;
                    let severityColor = '#F3F4F6'; 
                    let detail = '';

                    if (ev.severity === 'Moderado') severityColor = '#FBBF24'; 
                    if (ev.severity === 'Brusco') severityColor = '#F97316';   
                    if (ev.severity === 'Muy Brusco') severityColor = '#EF4444'; 

                    if (ev.type === 'overspeed') { 
                      typeText = 'Exceso de Velocidad'; severityColor = '#EF4444';
                      detail = `Registrado: ${(ev.speed * 1.852).toFixed(1).replace('.', ',')} km/h`;
                    }
                    else if (ev.type === 'harshAcceleration') { 
                      typeText = 'Aceleración Brusca';
                      detail = `De ${ev.speed1.toFixed(0)} a ${ev.speed2.toFixed(0)} km/h en ${ev.deltaT.toFixed(1)}s`;
                    }
                    else if (ev.type === 'harshBraking') { 
                      typeText = 'Frenada Brusca';
                      detail = `De ${ev.speed1.toFixed(0)} a ${ev.speed2.toFixed(0)} km/h en ${ev.deltaT.toFixed(1)}s`;
                    }

                    const speedKmh = ev.speed ? (ev.speed * 1.852) : (ev.speed2 || 0);
                    const isEngineOn = ev.ignition || speedKmh > 0;
                    detail += ` | Motor: ${isEngineOn ? 'Encendido' : 'Apagado'}`;

                    const addressText = ev.address ? ev.address : `Lat: ${ev.latitude?.toFixed(4)}`;

                    return (
                      <tr key={ev.id || index} style={{ borderBottom: '1px solid #1F2937' }}>
                        {reportType === 'fleet_speed' && (
                          <td style={{...styles.td, color: '#3B82F6', fontWeight: 'bold'}}>{ev.deviceName}</td>
                        )}
                        <td style={styles.td}>{new Date(ev.serverTime).toLocaleString()}</td>
                        <td style={{...styles.td, color: severityColor, fontWeight: 'bold'}}>{typeText}</td>
                        <td style={{...styles.td, color: severityColor, fontWeight: 'bold'}}>
                           {ev.severity ? <span style={{fontSize: '11px', backgroundColor: '#1F2937', color: severityColor, padding: '2px 6px', borderRadius: '4px'}}>{ev.severity}</span> : 'ALERTA'}
                        </td>
                        <td style={{...styles.td, fontSize: '12px', color: '#D1D5DB'}}>{detail}</td>
                        
                        <td style={{...styles.td, fontSize: '11px', maxWidth: '200px', whiteSpace: 'normal'}}>
                          <button 
                            type="button" 
                            onClick={() => setMapModal({ isOpen: true, lat: ev.latitude, lng: ev.longitude })}
                            style={{ background: 'none', border: 'none', color: '#60A5FA', cursor: 'pointer', textDecoration: 'underline', padding: 0, textAlign: 'left', fontSize: '11px' }}
                            title="Haz clic para ver el mapa"
                          >
                            📍 {addressText}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {(reportType === 'stops' || reportType === 'idle') && (
          <>
            <h3 style={styles.tableTitle}>{reportType === 'idle' ? 'Tiempos en Ralentí (Motor encendido sin movimiento)' : 'Registro de Paradas' } ({stopsData.length} eventos)</h3>
            <div style={{maxHeight: '500px', overflowY: 'auto'}}>
              <table style={styles.table}>
                <thead style={{position:'sticky', top:0, backgroundColor:'#111827', zIndex: 1}}>
                    <tr style={styles.tableHead}>
                        <th>Hora de Inicio</th>
                        <th>Hora de Fin</th>
                        <th>Duración Total (Parqueado)</th>
                        <th>Horas Motor (Ralentí)</th>
                        <th>Ubicación Traducida</th>
                    </tr>
                </thead>
                <tbody>
                  {stopsData.length === 0 ? <tr><td colSpan="5" style={styles.emptyText}>No se registraron eventos bajo este criterio.</td></tr> :
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

      {mapModal.isOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: 'white' }}>Ubicación Satelital Exacta</h3>
              <button onClick={() => setMapModal({ isOpen: false, lat: 0, lng: 0 })} style={styles.closeBtn}>X</button>
            </div>
            <iframe
              title="Google Maps"
              width="100%"
              height="350"
              style={{ border: 0, borderRadius: '8px' }}
              loading="lazy"
              allowFullScreen
              src={`https://maps.google.com/maps?q=${mapModal.lat},${mapModal.lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
            ></iframe>
          </div>
        </div>
      )}
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
  emptyText: { padding: '30px', textAlign: 'center', color: '#6B7280' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  modalContent: { backgroundColor: '#1F2937', padding: '20px', borderRadius: '12px', width: '90%', maxWidth: '600px', border: '1px solid #374151', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
  closeBtn: { backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer', fontWeight: 'bold' }
};