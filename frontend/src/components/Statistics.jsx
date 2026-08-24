import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Line, ReferenceLine, ComposedChart
} from 'recharts';

export default function Statistics({ devices, positions, token }) {
  const BASE_URL = 'https://api.globalmonitorgps.com'; 

  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [timeRange, setTimeRange] = useState(7); 
  const [isLoading, setIsLoading] = useState(false);

  const [mileageData, setMileageData] = useState([]);
  const [behaviorData, setBehaviorData] = useState([]);
  const [fuelData, setFuelData] = useState([]);
  const [speedData, setSpeedData] = useState([]); 

  const [globalRankingData, setGlobalRankingData] = useState([]);
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const [rankingProgress, setRankingProgress] = useState(0);

  // === 1. ESTADO OPERATIVO (TIEMPO REAL) ===
  const checkIsSuspended = (device) => {
    if (device.disabled) return true; 
    if (device.expirationTime && new Date(device.expirationTime) < new Date()) return true; 
    return false;
  };

  let onlineCount = 0; let offlineCount = 0; let unknownCount = 0; let suspendedCount = 0;
  devices.forEach(d => {
    if (checkIsSuspended(d)) suspendedCount++;
    else if (!d.lastUpdate) unknownCount++;
    else if (d.status === 'online') onlineCount++;
    else offlineCount++;
  });

  const pieDataGlobal = [
    { name: '🟢 Conectados', value: onlineCount, color: '#10B981' },
    { name: '🔴 Apagados', value: offlineCount, color: '#EF4444' },
    { name: '⚪ Desconocidos', value: unknownCount, color: '#9CA3AF' },
    { name: '🚫 Suspendidos', value: suspendedCount, color: '#374151' }
  ].filter(item => item.value > 0);

  // === 2. MOTOR DE RANKING GLOBAL ===
  const handleCalculateRanking = async () => {
    setIsRankingLoading(true);
    setRankingProgress(0);
    try {
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(toDate.getDate() - timeRange);
      const toIso = toDate.toISOString();
      const fromIso = fromDate.toISOString();
      const headers = { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' };

      let allSummaries = [];
      const chunkSize = 30; 

      for (let i = 0; i < devices.length; i += chunkSize) {
        const chunk = devices.slice(i, i + chunkSize);
        const queryIds = chunk.map(d => `deviceId=${d.id}`).join('&');
        
        const res = await fetch(`${BASE_URL}/api/reports/summary?${queryIds}&from=${fromIso}&to=${toIso}`, { headers });
        if (res.ok) {
          const data = await res.json();
          allSummaries = [...allSummaries, ...data];
        }
        setRankingProgress(Math.round(((i + chunkSize) / devices.length) * 100));
      }

      const ranking = allSummaries.map(s => {
        const dev = devices.find(d => d.id === s.deviceId);
        return {
          name: dev ? dev.name : `ID: ${s.deviceId}`,
          km: parseFloat((s.distance / 1000).toFixed(1))
        };
      });

      ranking.sort((a, b) => b.km - a.km);
      setGlobalRankingData(ranking.slice(0, 10));

    } catch (err) {
      console.error("Error calculando ranking:", err);
    }
    setIsRankingLoading(false);
    setRankingProgress(100);
  };

  // === 3. ANÁLISIS INDIVIDUAL Y MOTOR CINEMÁTICO ===
  useEffect(() => {
    if (!selectedDeviceId || !token) return;

    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - timeRange);
        
        const toIso = toDate.toISOString();
        const fromIso = fromDate.toISOString();
        const headers = { 'Authorization': `Basic ${token}`, 'Accept': 'application/json' };

        // Descargamos todo, incluyendo la ruta cruda punto a punto
        const [resSummary, resEvents, resStops, resRoute] = await Promise.all([
          fetch(`${BASE_URL}/api/reports/summary?deviceId=${selectedDeviceId}&from=${fromIso}&to=${toIso}&daily=true`, { headers }),
          fetch(`${BASE_URL}/api/reports/events?deviceId=${selectedDeviceId}&from=${fromIso}&to=${toIso}`, { headers }),
          fetch(`${BASE_URL}/api/reports/stops?deviceId=${selectedDeviceId}&from=${fromIso}&to=${toIso}`, { headers }),
          fetch(`${BASE_URL}/api/reports/route?deviceId=${selectedDeviceId}&from=${fromIso}&to=${toIso}`, { headers })
        ]);

        if (resSummary.ok) {
          const rawSummary = await resSummary.json();
          const rawEvents = resEvents.ok ? await resEvents.json() : [];
          const rawStops = resStops.ok ? await resStops.json() : [];
          const rawRoute = resRoute.ok ? await resRoute.json() : [];

          // 🚀 MOTOR CINEMÁTICO: Analiza físicamente la ruta para ignorar las mentiras de Traccar
          let manualOverspeedCount = 0;
          let hardBrakingCount = 0;
          let hardAccelCount = 0;
          let isOver = false;

          const routeStatsByDay = {};

          // Analizamos la telemetría punto por punto
          for (let i = 1; i < rawRoute.length; i++) {
            const p1 = rawRoute[i-1];
            const p2 = rawRoute[i];
            const speed1Kmh = p1.speed * 1.852;
            const speed2Kmh = p2.speed * 1.852;
            const deltaT = (new Date(p2.fixTime).getTime() - new Date(p1.fixTime).getTime()) / 1000;

            const dateObj = new Date(p2.fixTime);
            const diaStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;

            if (!routeStatsByDay[diaStr]) {
                routeStatsByDay[diaStr] = { max: 0, sum: 0, count: 0 };
            }

            // 1. Guardar la Velocidad Máxima real del día (Filtro < 160km/h por seguridad)
            if (speed2Kmh > routeStatsByDay[diaStr].max && speed2Kmh <= 160) {
                routeStatsByDay[diaStr].max = speed2Kmh;
            }

            // 2. Acumular promedio solo si está en movimiento (> 5km/h) para un dato realista
            if (speed2Kmh > 5 && speed2Kmh <= 160) {
                routeStatsByDay[diaStr].sum += speed2Kmh;
                routeStatsByDay[diaStr].count++;
            }

            // 3. Auditoría: Exceso de Velocidad (> 80 km/h)
            if (speed2Kmh > 80) {
              if (!isOver) { manualOverspeedCount++; isOver = true; }
            } else {
              isOver = false;
            }

            // 4. Auditoría: Aceleraciones y Frenadas Bruscas (Basado en Fuerza G)
            if (deltaT > 0 && deltaT <= 10 && speed2Kmh > 10) {
              const acceleration = ((speed2Kmh - speed1Kmh) / 3.6) / deltaT;
              if (acceleration > 2.5) hardAccelCount++; // Aceleración
              if (acceleration < -3.0) hardBrakingCount++; // Frenada
            }
          }

          // Alertas del hardware (Desconexión, Batería, SOS)
          let alarms = 0;
          rawEvents.forEach(ev => {
            if (ev.type === 'alarm' || ev.type === 'deviceOffline') alarms++;
          });

          // Llenamos la Araña con nuestra propia auditoría, no con la de Traccar
          setBehaviorData([
            { subject: 'Excesos (>80 km/h)', A: manualOverspeedCount, fullMark: Math.max(manualOverspeedCount + 5, 10) },
            { subject: 'Frenadas Bruscas', A: hardBrakingCount, fullMark: Math.max(hardBrakingCount + 5, 10) },
            { subject: 'Acel. Bruscas', A: hardAccelCount, fullMark: Math.max(hardAccelCount + 5, 10) },
            { subject: 'Alertas del Equipo', A: alarms, fullMark: Math.max(alarms + 5, 10) }
          ]);

          // Procesamiento de las gráficas de líneas y barras
          const formattedMileage = [];
          const formattedSpeed = [];

          rawSummary.forEach(day => {
            const dateObj = new Date(day.startTime);
            const diaStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
            const distKm = parseFloat((day.distance / 1000).toFixed(1));

            formattedMileage.push({ dia: diaStr, km: distKm });

            // Inyectamos las velocidades extraídas por nuestro motor cinemático
            let maxKmh = 0;
            let avgKmh = 0;

            if (routeStatsByDay[diaStr]) {
                maxKmh = routeStatsByDay[diaStr].max;
                avgKmh = routeStatsByDay[diaStr].count > 0 ? (routeStatsByDay[diaStr].sum / routeStatsByDay[diaStr].count) : 0;
            } else {
                // Solo si la ruta falla, usamos el dato viejo de Traccar como respaldo
                maxKmh = day.maxSpeed ? day.maxSpeed * 1.852 : 0;
                avgKmh = day.averageSpeed ? day.averageSpeed * 1.852 : 0;
            }

            // Regla física universal: Si no anduvo 100 metros, la velocidad es 0
            if (distKm < 0.1) { maxKmh = 0; avgKmh = 0; }

            formattedSpeed.push({
              dia: diaStr,
              maxSpeed: parseFloat(maxKmh.toFixed(1)),
              avgSpeed: parseFloat(avgKmh.toFixed(1))
            });
          });

          setMileageData(formattedMileage);
          setSpeedData(formattedSpeed); 

          // Eficiencia de Motor
          let totalEngineMs = rawSummary.reduce((acc, curr) => acc + curr.engineHours, 0);
          let idleMs = rawStops.reduce((acc, curr) => acc + (curr.engineHours || 0), 0);
          let movingMs = totalEngineMs > idleMs ? (totalEngineMs - idleMs) : totalEngineMs;

          const movingHours = parseFloat((movingMs / 3600000).toFixed(1));
          const idleHours = parseFloat((idleMs / 3600000).toFixed(1));

          if (movingHours === 0 && idleHours === 0) setFuelData([]);
          else setFuelData([{ name: 'En Movimiento', value: movingHours, color: '#3B82F6' }, { name: 'Ralentí', value: idleHours, color: '#F59E0B' }]);
        }
      } catch (error) {
        console.error("Error calculando BI:", error);
      }
      setIsLoading(false);
    };

    fetchAnalytics();
  }, [selectedDeviceId, timeRange, token]);

  const customTooltipStyle = { backgroundColor: 'rgba(17, 24, 39, 0.9)', border: '1px solid #374151', borderRadius: '8px', color: 'white', backdropFilter: 'blur(4px)' };

  return (
    <div style={{ padding: '25px', backgroundColor: '#0B1120', height: '100%', overflowY: 'auto', color: 'white', fontFamily: 'Inter, sans-serif' }}>
      
      {/* CABECERA PRINCIPAL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1F2937', paddingBottom: '20px', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>📊 Inteligencia de Flota (BI)</h2>
          <p style={{ margin: '5px 0 0 0', color: '#9CA3AF', fontSize: '13px' }}>Analíticas globales, rendimiento de activos y auditoría de manejo.</p>
        </div>
        <select value={timeRange} onChange={e => setTimeRange(parseInt(e.target.value))} style={{...styles.select, backgroundColor: '#374151', borderColor: '#4B5563'}}>
          <option value={7}>Analizar Últimos 7 Días</option>
          <option value={15}>Analizar Últimos 15 Días</option>
          <option value={30}>Analizar Últimos 30 Días</option>
        </select>
      </div>

      <h3 style={styles.sectionHeader}>🌍 Métrica General de la Empresa</h3>
      <div style={styles.grid}>
        
        {/* GRÁFICA A: ESTADO DE LA FLOTA */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Estado Operativo de la Flota</h3>
          <div style={{ height: '250px', width: '100%' }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieDataGlobal} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                  {pieDataGlobal.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <RechartsTooltip contentStyle={customTooltipStyle} itemStyle={{ color: 'white', fontWeight: 'bold' }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICA B: RANKING TOP 10 */}
        <div style={{...styles.card, flex: 2, minWidth: '400px'}}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px dashed #374151', paddingBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#F3F4F6', fontWeight: '700' }}>🏆 Top 10: Líderes de Productividad (Km)</h3>
            <button onClick={handleCalculateRanking} disabled={isRankingLoading} style={{ ...styles.actionBtn, opacity: isRankingLoading ? 0.6 : 1 }}>
              {isRankingLoading ? `Calculando... ${Math.min(rankingProgress, 100)}%` : '🔄 Generar Ranking'}
            </button>
          </div>
          <div style={{ height: '250px', width: '100%' }}>
            {globalRankingData.length === 0 && !isRankingLoading ? (
              <div style={styles.placeholder}>Haz clic en "Generar Ranking" para analizar toda tu flota.</div>
            ) : isRankingLoading ? (
              <div style={styles.placeholder}>
                <div style={{ width: '80%', height: '8px', backgroundColor: '#374151', borderRadius: '4px', overflow: 'hidden', margin: '0 auto' }}>
                   <div style={{ width: `${rankingProgress}%`, height: '100%', backgroundColor: '#3B82F6', transition: 'width 0.3s' }}></div>
                </div>
                <p style={{marginTop: '10px', fontSize: '12px', color: '#9CA3AF'}}>Consultando bases de datos corporativas...</p>
              </div>
            ) : (
              <ResponsiveContainer>
                <BarChart layout="vertical" data={globalRankingData} margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="#6B7280" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" stroke="#9CA3AF" width={110} tick={{ fontSize: 11, fontWeight: 'bold' }} />
                  <RechartsTooltip cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} contentStyle={customTooltipStyle} />
                  <Bar dataKey="km" name="Kilómetros" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={15} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '40px', marginBottom: '20px' }}>
        <h3 style={{...styles.sectionHeader, margin: 0}}>🔬 Análisis Individual (Por Vehículo)</h3>
        <select value={selectedDeviceId} onChange={e => setSelectedDeviceId(e.target.value)} style={styles.select}>
          <option value="">-- Seleccionar Unidad --</option>
          {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {!selectedDeviceId ? (
        <div style={{ ...styles.card, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '50px' }}>
          <span style={{ fontSize: '40px', marginBottom: '15px' }}>👆</span>
          <h3 style={{ color: '#F3F4F6' }}>Selecciona un Vehículo Arriba</h3>
          <p style={{ color: '#9CA3AF', maxWidth: '400px' }}>Para visualizar la eficiencia de combustible, infracciones viales y comportamiento detallado.</p>
        </div>
      ) : isLoading ? (
        <div style={{ ...styles.card, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '50px' }}>
          <h3 style={{ color: '#60A5FA', fontStyle: 'italic', animation: 'pulse 1.5s infinite' }}>⏳ Analizando telemetría punto a punto...</h3>
        </div>
      ) : (
        <>
          {/* AGRUPACIÓN 1: RENDIMIENTO Y USO */}
          <h4 style={styles.subHeader}>🛣️ Rendimiento y Uso (Kilometraje y Motor)</h4>
          <div style={styles.grid}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Historial de Recorrido Diario</h3>
              <div style={{ height: '250px', width: '100%' }}>
                <ResponsiveContainer>
                  <BarChart data={mileageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                    <XAxis dataKey="dia" stroke="#6B7280" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} />
                    <RechartsTooltip cursor={{ fill: 'rgba(16, 185, 129, 0.1)' }} contentStyle={customTooltipStyle} />
                    <Bar dataKey="km" name="Kilómetros" fill="#10B981" radius={[4, 4, 0, 0]} barSize={35} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Eficiencia del Combustible (Ralentí)</h3>
              <div style={{ height: '250px', width: '100%' }}>
                {fuelData.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#6B7280', marginTop: '100px' }}>Sin registros en este periodo.</p>
                ) : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={fuelData} cx="50%" cy="50%" innerRadius={0} outerRadius={80} dataKey="value" label={({name, percent}) => `${(percent * 100).toFixed(0)}%`}>
                        {fuelData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <RechartsTooltip contentStyle={customTooltipStyle} formatter={(value) => `${value} Horas`} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* AGRUPACIÓN 2: COMPORTAMIENTO Y SEGURIDAD */}
          <h4 style={{...styles.subHeader, marginTop: '20px'}}>🚦 Comportamiento y Seguridad (Conducción)</h4>
          <div style={styles.grid}>
            
            {/* PERFIL DE VELOCIDAD */}
            <div style={{...styles.card, flex: 1.5}}>
              <h3 style={styles.cardTitle}>Perfil de Velocidad Diaria</h3>
              <div style={{ height: '250px', width: '100%' }}>
                <ResponsiveContainer>
                  <ComposedChart data={speedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                    <XAxis dataKey="dia" stroke="#6B7280" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} />
                    <RechartsTooltip contentStyle={customTooltipStyle} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    
                    <ReferenceLine y={80} stroke="#EF4444" strokeDasharray="3 3" label={{ position: 'top', value: 'Límite (80 km/h)', fill: '#EF4444', fontSize: 10 }} />
                    
                    <Bar dataKey="avgSpeed" name="Vel. Promedio (km/h)" fill="#3B82F6" barSize={20} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="maxSpeed" name="Vel. Máxima (km/h)" stroke="#EF4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Auditoría de Infracciones</h3>
              <div style={{ height: '250px', width: '100%' }}>
                <ResponsiveContainer>
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={behaviorData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 'bold' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} tick={false} axisLine={false} />
                    <Radar name="Eventos Registrados" dataKey="A" stroke="#EF4444" fill="#EF4444" fillOpacity={0.5} />
                    <RechartsTooltip contentStyle={customTooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  sectionHeader: { color: '#60A5FA', fontSize: '18px', margin: '0 0 15px 0', textTransform: 'uppercase', letterSpacing: '1px' },
  subHeader: { color: '#D1D5DB', fontSize: '15px', margin: '0 0 15px 0', borderBottom: '1px solid #374151', paddingBottom: '8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', paddingBottom: '20px' },
  card: { backgroundColor: '#111827', padding: '25px', borderRadius: '16px', border: '1px solid #1F2937', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' },
  cardTitle: { margin: '0 0 20px 0', fontSize: '15px', color: '#F3F4F6', fontWeight: '700', borderBottom: '1px dashed #374151', paddingBottom: '10px' },
  select: { backgroundColor: '#1F2937', color: 'white', border: '1px solid #3B82F6', padding: '10px 15px', borderRadius: '8px', outline: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' },
  actionBtn: { backgroundColor: '#3B82F6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
  placeholder: { height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', color: '#6B7280', fontStyle: 'italic', fontSize: '14px' }
};