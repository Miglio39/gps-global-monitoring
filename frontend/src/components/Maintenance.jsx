import React, { useState, useMemo, useEffect } from 'react';

export default function Maintenance({ devices, positions, token }) {
  // 1. DETECTOR DE PANTALLA MÓVIL
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [activeTab, setActiveTab] = useState('preventivo');
  const [searchTerm, setSearchTerm] = useState('');

  // ESTADOS PARA EL FORMULARIO MODAL
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    deviceId: '',
    type: 'preventivo',
    name: '',
    manualKm: '',   
    targetKm: '',   
    intervalKm: '', 
    cost: '',
    status: 'Pendiente',
    expireDate: ''
  });

  // --------------------------------------------------------
  // LÓGICA DEL GPS EN TIEMPO REAL (CONECTADO A POSITIONS)
  // --------------------------------------------------------
  const getVehicleGpsMeters = (deviceId) => {
    // Busca primero en las posiciones en VIVO
    const pos = positions && positions[deviceId];
    if (pos?.attributes?.totalDistance !== undefined) {
      return pos.attributes.totalDistance;
    }
    // Si no está en vivo, usa el último guardado en el dispositivo
    const device = devices.find(d => String(d.id) === String(deviceId));
    return device?.attributes?.totalDistance || 0; 
  };

  // --------------------------------------------------------
  // BASE DE DATOS (CON PERSISTENCIA EN LOCALSTORAGE)
  // --------------------------------------------------------
  const [tasks, setTasks] = useState(() => {
    const savedTasks = localStorage.getItem('fleet_maintenance_tasks');
    return savedTasks ? JSON.parse(savedTasks) : [];
  });

  useEffect(() => {
    localStorage.setItem('fleet_maintenance_tasks', JSON.stringify(tasks));
  }, [tasks]);

  // 2. FILTRO DE PRIVACIDAD: ¡Solo mostrar tareas de los vehículos asignados a este usuario!
  const myUserTasks = useMemo(() => {
    return tasks.filter(task => devices.some(d => String(d.id) === String(task.deviceId)));
  }, [tasks, devices]);

  const getDeviceName = (id) => devices.find(d => String(d.id) === String(id))?.name || 'Vehículo Desconocido';

  // --------------------------------------------------------
  // MANEJO DEL FORMULARIO
  // --------------------------------------------------------
  const handleOpenModal = () => {
    setFormData({ ...formData, type: activeTab, deviceId: '', manualKm: '', targetKm: '', intervalKm: '', name: '' });
    setIsModalOpen(true);
  };

  const handleSaveTask = (e) => {
    e.preventDefault();
    let newTask = {
      id: Date.now(),
      deviceId: formData.deviceId,
      type: formData.type,
      name: formData.name
    };

    if (formData.type === 'preventivo') {
      newTask.manualKm = Number(formData.manualKm);
      newTask.targetKm = Number(formData.targetKm);
      newTask.intervalKm = Number(formData.intervalKm);
      newTask.baseGpsMeters = getVehicleGpsMeters(formData.deviceId); // Toma foto en vivo
    } else if (formData.type === 'correctivo') {
      newTask.cost = Number(formData.cost) || 0;
      newTask.status = formData.status;
      newTask.date = new Date().toISOString().split('T')[0];
    } else if (formData.type === 'documentos') {
      newTask.expireDate = formData.expireDate;
    }

    setTasks([...tasks, newTask]);
    setIsModalOpen(false);
  };

  const handleDeleteTask = (id) => {
    if(window.confirm("¿Estás seguro de eliminar este registro?")) {
      setTasks(tasks.filter(t => t.id !== id));
    }
  };

  // --------------------------------------------------------
  // LÓGICA DE ALERTAS E INTELIGENCIA (SINCRONIZACIÓN EN VIVO)
  // --------------------------------------------------------
  const evaluateTask = (task) => {
    if (task.type === 'preventivo') {
      const currentGpsMeters = getVehicleGpsMeters(task.deviceId);
      const metersTraveledSinceCreation = Math.max(0, currentGpsMeters - task.baseGpsMeters);
      const kmTraveledSinceCreation = Math.round(metersTraveledSinceCreation / 1000);
      
      const liveOdometer = task.manualKm + kmTraveledSinceCreation;
      const remainingKm = task.targetKm - liveOdometer;
      
      const startOfInterval = task.targetKm - task.intervalKm;
      let progress = 0;
      if (task.intervalKm > 0) {
        progress = Math.min(100, Math.max(0, ((liveOdometer - startOfInterval) / task.intervalKm) * 100));
      }
      
      let status = 'ok'; 
      if (remainingKm <= 0) status = 'danger'; 
      else if (remainingKm <= 500) status = 'warning'; 

      return { liveOdometer, remainingKm, progress, status };
    } 
    
    if (task.type === 'documentos') {
      const today = new Date();
      const expDate = new Date(task.expireDate);
      const diffTime = expDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let status = 'ok';
      if (diffDays < 0) status = 'danger'; 
      else if (diffDays <= 15) status = 'warning'; 

      return { diffDays, status };
    }

    if (task.type === 'correctivo') {
      return { status: task.status === 'Pendiente' ? 'danger' : task.status === 'En Taller' ? 'warning' : 'ok' };
    }
  };

  // 3. LA TABLA AHORA SE ACTUALIZA CON CADA MOVIMIENTO (Depende de 'positions')
  const filteredTasks = useMemo(() => {
    return myUserTasks
      .filter(t => t.type === activeTab)
      .filter(t => getDeviceName(t.deviceId).toLowerCase().includes(searchTerm.toLowerCase()) || t.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(t => ({ ...t, evaluation: evaluateTask(t) }))
      .sort((a, b) => {
        const priority = { 'danger': 1, 'warning': 2, 'ok': 3 };
        return priority[a.evaluation.status] - priority[b.evaluation.status];
      });
  }, [myUserTasks, activeTab, searchTerm, devices, positions]);

  const kpis = {
    danger: filteredTasks.filter(t => t.evaluation.status === 'danger').length,
    warning: filteredTasks.filter(t => t.evaluation.status === 'warning').length,
    ok: filteredTasks.filter(t => t.evaluation.status === 'ok').length,
  };

  // VISTA ALTERNATIVA SI ES MÓVIL
  if (isMobile) {
    return (
      <main style={{flex: 1, padding: '20px', backgroundColor: '#0B1120', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
         <div style={{textAlign: 'center', color: 'white', padding: '30px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #374151', maxWidth: '90%'}}>
           <div style={{fontSize: '50px', marginBottom: '15px'}}>🚫📱</div>
           <h3 style={{margin: '0 0 10px 0'}}>Módulo de Escritorio</h3>
           <p style={{color: '#9CA3AF', fontSize: '13px', margin: 0, lineHeight: '1.5'}}>
             El panel de Mantenimientos contiene tablas detalladas y herramientas de gestión que requieren una pantalla más grande.<br/><br/>
             <b>Por favor, ingresa desde una computadora o tablet.</b>
           </p>
         </div>
      </main>
    );
  }

  // VISTA NORMAL DE ESCRITORIO
  return (
    <main style={{flex: 1, padding: '20px 30px', overflowY: 'auto', backgroundColor: '#0B1120', position: 'relative'}}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
        <h2 style={{color:'white', margin: 0}}>Centro de Mantenimiento 🔧</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          <input 
            type="text" 
            placeholder="🔍 Buscar placa o registro..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '10px 15px', color: 'white', width: '100%', maxWidth: '250px', outline: 'none' }}
          />
          <button onClick={handleOpenModal} style={{ backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)' }}>
            ➕ Añadir Registro
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
        <button onClick={() => setActiveTab('preventivo')} style={activeTab === 'preventivo' ? styles.tabActive : styles.tabInactive}>⚙️ Preventivo (Tablero + GPS)</button>
        <button onClick={() => setActiveTab('correctivo')} style={activeTab === 'correctivo' ? styles.tabActive : styles.tabInactive}>🚨 Correctivo (Fallas)</button>
        <button onClick={() => setActiveTab('documentos')} style={activeTab === 'documentos' ? styles.tabActive : styles.tabInactive}>📄 Documentos (Fechas)</button>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', flexWrap: 'wrap' }}>
        <div style={{...styles.kpiCard, borderLeft: '4px solid #EF4444'}}>
          <div style={{color: '#9CA3AF', fontSize: '12px', fontWeight: 'bold'}}>CRÍTICOS / VENCIDOS</div>
          <div style={{color: '#EF4444', fontSize: '24px', fontWeight: '900'}}>{kpis.danger}</div>
        </div>
        <div style={{...styles.kpiCard, borderLeft: '4px solid #F59E0B'}}>
          <div style={{color: '#9CA3AF', fontSize: '12px', fontWeight: 'bold'}}>PRÓXIMOS A VENCER</div>
          <div style={{color: '#F59E0B', fontSize: '24px', fontWeight: '900'}}>{kpis.warning}</div>
        </div>
        <div style={{...styles.kpiCard, borderLeft: '4px solid #10B981'}}>
          <div style={{color: '#9CA3AF', fontSize: '12px', fontWeight: 'bold'}}>AL DÍA / COMPLETADOS</div>
          <div style={{color: '#10B981', fontSize: '24px', fontWeight: '900'}}>{kpis.ok}</div>
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div style={{ backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #1F2937', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
            <thead>
              <tr>
                <th style={styles.th}>Vehículo</th>
                <th style={styles.th}>{activeTab === 'documentos' ? 'Documento Legal' : 'Tarea / Descripción'}</th>
                
                {/* COLUMNAS PREVENTIVAS */}
                {activeTab === 'preventivo' && <th style={styles.th}>Km Actual (En Vivo)</th>}
                {activeTab === 'preventivo' && <th style={styles.th}>Intervalo</th>}
                {activeTab === 'preventivo' && <th style={styles.th}>Próximo Cambio</th>}
                {activeTab === 'preventivo' && <th style={styles.th}>Estado / Faltante</th>}

                {/* COLUMNAS CORRECTIVAS */}
                {activeTab === 'correctivo' && <th style={styles.th}>Fecha de Falla</th>}
                {activeTab === 'correctivo' && <th style={styles.th}>Costo Estimado</th>}
                {activeTab === 'correctivo' && <th style={styles.th}>Gravedad</th>}

                {/* COLUMNAS DOCUMENTOS */}
                {activeTab === 'documentos' && <th style={styles.th}>Fecha Vencimiento</th>}
                {activeTab === 'documentos' && <th style={styles.th}>Días Restantes</th>}
                {activeTab === 'documentos' && <th style={styles.th}>Gravedad</th>}

                <th style={styles.th}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr><td colSpan="8" style={{padding: '30px', textAlign: 'center', color: '#6B7280'}}>No hay registros para mostrar.</td></tr>
              ) : (
                filteredTasks.map(task => (
                  <tr key={task.id} style={{ borderBottom: '1px solid #1F2937', transition: 'background-color 0.2s' }}>
                    <td style={{...styles.td, fontWeight: 'bold', color: 'white'}}>{getDeviceName(task.deviceId)}</td>
                    <td style={{...styles.td, color: '#D1D5DB'}}>{task.name}</td>
                    
                    {/* RENDER PREVENTIVO */}
                    {activeTab === 'preventivo' && <td style={{...styles.td, color: '#60A5FA', fontWeight: 'bold'}}>{task.evaluation.liveOdometer.toLocaleString()} Km</td>}
                    {activeTab === 'preventivo' && <td style={{...styles.td, color: '#9CA3AF'}}>{task.intervalKm.toLocaleString()} Km</td>}
                    {activeTab === 'preventivo' && <td style={{...styles.td, fontWeight: 'bold', color: 'white'}}>{task.targetKm.toLocaleString()} Km</td>}
                    {activeTab === 'preventivo' && (
                      <td style={styles.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: task.evaluation.remainingKm <= 0 ? '#EF4444' : '#10B981' }}>
                            {task.evaluation.remainingKm <= 0 ? `Vencido por ${Math.abs(task.evaluation.remainingKm).toLocaleString()} Km` : `Faltan ${task.evaluation.remainingKm.toLocaleString()} Km`}
                          </span>
                          <div style={{ width: '120px', backgroundColor: '#374151', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${task.evaluation.progress}%`, height: '100%', backgroundColor: task.evaluation.status === 'danger' ? '#EF4444' : task.evaluation.status === 'warning' ? '#F59E0B' : '#10B981', transition: 'width 0.5s ease-in-out' }}></div>
                          </div>
                        </div>
                      </td>
                    )}

                    {/* RENDER CORRECTIVO */}
                    {activeTab === 'correctivo' && <td style={{...styles.td, color: '#9CA3AF'}}>{task.date}</td>}
                    {activeTab === 'correctivo' && <td style={{...styles.td, color: '#10B981', fontWeight: 'bold'}}>${task.cost.toLocaleString()}</td>}
                    
                    {/* RENDER DOCUMENTOS */}
                    {activeTab === 'documentos' && <td style={{...styles.td, color: '#D1D5DB'}}>{task.expireDate}</td>}
                    {activeTab === 'documentos' && (
                      <td style={{...styles.td, fontWeight: 'bold', color: task.evaluation.diffDays < 0 ? '#EF4444' : '#60A5FA'}}>
                        {task.evaluation.diffDays < 0 ? `Vencido hace ${Math.abs(task.evaluation.diffDays)} días` : `Faltan ${task.evaluation.diffDays} días`}
                      </td>
                    )}

                    {/* ESTADO GLOBAL Y ACCIONES */}
                    {activeTab !== 'preventivo' && (
                      <td style={styles.td}>
                        <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', backgroundColor: task.evaluation.status === 'danger' ? 'rgba(239,68,68,0.1)' : task.evaluation.status === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', color: task.evaluation.status === 'danger' ? '#EF4444' : task.evaluation.status === 'warning' ? '#F59E0B' : '#10B981', border: `1px solid ${task.evaluation.status === 'danger' ? 'rgba(239,68,68,0.3)' : task.evaluation.status === 'warning' ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'}` }}>
                          {task.evaluation.status === 'danger' ? 'CRÍTICO' : task.evaluation.status === 'warning' ? 'ATENCIÓN' : 'AL DÍA'}
                        </span>
                      </td>
                    )}
                    <td style={styles.td}>
                      <button onClick={() => handleDeleteTask(task.id)} style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }} title="Eliminar Registro">🗑️</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PARA AGREGAR NUEVOS MANTENIMIENTOS Y DOCUMENTOS */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '20px' }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '12px', width: '100%', maxWidth: '450px', padding: '25px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflowY: 'auto', maxHeight: '90vh' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: 'white', margin: 0 }}>Crear Nuevo Registro</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>

            <form onSubmit={handleSaveTask} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              <div>
                <label style={styles.label}>Categoría</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} style={styles.input} required>
                  <option value="preventivo">⚙️ Mantenimiento Preventivo (Km)</option>
                  <option value="correctivo">🚨 Mantenimiento Correctivo (Falla)</option>
                  <option value="documentos">📄 Documento o Seguro (Fecha)</option>
                </select>
              </div>

              <div>
                <label style={styles.label}>Vehículo Afectado</label>
                <select value={formData.deviceId} onChange={e => setFormData({...formData, deviceId: e.target.value})} style={styles.input} required>
                  <option value="" disabled>-- Seleccione un Vehículo --</option>
                  {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {formData.type === 'documentos' ? (
                <div>
                  <label style={styles.label}>Documento a Vencer</label>
                  <select value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={styles.input} required>
                    <option value="" disabled>-- Seleccione el Documento --</option>
                    <option value="SOAT">SOAT</option>
                    <option value="Revisión Tecnomecánica">Revisión Tecnomecánica</option>
                    <option value="Seguro Todo Riesgo">Seguro Todo Riesgo</option>
                    <option value="Pólizas Extra y Contra">Pólizas Extra y Contra</option>
                    <option value="Tarjeta de Operación">Tarjeta de Operación</option>
                    <option value="Otro">Otro Documento...</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label style={styles.label}>Descripción de la Tarea</label>
                  <input type="text" placeholder="Ej. Cambio de Aceite, Frenos..." value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={styles.input} required />
                </div>
              )}

              {formData.type === 'preventivo' && (
                <>
                  <div>
                    <label style={styles.label}>Odómetro Actual del Tablero (Km)</label>
                    <input type="number" placeholder="Ej. 2500" value={formData.manualKm} onChange={e => setFormData({...formData, manualKm: e.target.value})} style={styles.input} required />
                  </div>
                  <div>
                    <label style={styles.label}>Próximo Mantenimiento a los (Km)</label>
                    <input type="number" placeholder="Ej. 3000" value={formData.targetKm} onChange={e => setFormData({...formData, targetKm: e.target.value})} style={styles.input} required />
                  </div>
                  <div>
                    <label style={styles.label}>Intervalo (Se repite cada...)</label>
                    <input type="number" placeholder="Ej. 3000" value={formData.intervalKm} onChange={e => setFormData({...formData, intervalKm: e.target.value})} style={styles.input} required />
                  </div>
                </>
              )}

              {formData.type === 'correctivo' && (
                <>
                  <div>
                    <label style={styles.label}>Estado Actual</label>
                    <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} style={styles.input}>
                      <option value="Pendiente">🔴 Pendiente de Revisión</option>
                      <option value="En Taller">🟡 En Taller Mecánico</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Costo Estimado ($)</label>
                    <input type="number" placeholder="Ej. 150000" value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value})} style={styles.input} />
                  </div>
                </>
              )}

              {formData.type === 'documentos' && (
                <div>
                  <label style={styles.label}>Fecha de Vencimiento Legal</label>
                  <input type="date" value={formData.expireDate} onChange={e => setFormData({...formData, expireDate: e.target.value})} style={styles.input} required />
                </div>
              )}

              <button type="submit" style={{ backgroundColor: '#10B981', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>
                Guardar Registro
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

const styles = {
  kpiCard: { flex: 1, minWidth: '180px', backgroundColor: '#111827', borderRadius: '8px', padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' },
  tabInactive: { flex: 1, minWidth: '150px', padding: '12px 20px', backgroundColor: '#111827', color: '#9CA3AF', border: '1px solid #1F2937', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', transition: 'all 0.2s', whiteSpace: 'nowrap' },
  tabActive: { flex: 1, minWidth: '150px', padding: '12px 20px', backgroundColor: '#2563EB', color: 'white', border: '1px solid #2563EB', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', transition: 'all 0.2s', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)', whiteSpace: 'nowrap' },
  th: { padding: '15px', backgroundColor: '#1F2937', borderBottom: '2px solid #374151', fontSize: '12px', color: '#9CA3AF', whiteSpace: 'nowrap', textTransform: 'uppercase' },
  td: { padding: '15px', fontSize: '13px' },
  label: { color:'#9CA3AF', fontSize:'12px', fontWeight: 'bold', display: 'block', marginBottom: '6px' },
  input: { backgroundColor: '#0B1120', border: '1px solid #374151', borderRadius: '6px', padding: '10px', color: 'white', width: '100%', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }
};