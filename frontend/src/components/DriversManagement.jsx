import React, { useState, useEffect } from 'react';

// Ajusta la URL de tu API si es necesario
const API_BASE = 'https://api.globalmonitorgps.com'; 

const COURSE_LIST = [
  { key: 'sgSst', label: '50 Hrs SG-SST' },
  { key: 'mecanica', label: 'Mecánica Básica' },
  { key: 'defensivo', label: 'Manejo Defensivo' },
  { key: 'normas', label: 'Normas de Tránsito' },
  { key: 'extintores', label: 'Extintores/Incendios' },
  { key: 'auxilios', label: 'Primeros Auxilios' },
  { key: 'teorico', label: 'Teórico Práctico' }
];

export default function DriversManagement({ token }) {
  const [drivers, setDrivers] = useState([]);
  const [devices, setDevices] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    uniqueId: '',
    phone: '',
    photo: '',
    bloodType: '',
    eps: '',
    restrictions: '',
    licenses: [],
    assignedDeviceId: '',
    courses: {
      sgSst: '', mecanica: '', defensivo: '', normas: '', 
      extintores: '', auxilios: '', teorico: ''
    }
  });

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      const headers = {
        'Authorization': `Basic ${token}`,
        'Accept': 'application/json'
      };
      
      const [resDrivers, resDevices] = await Promise.all([
        fetch(`${API_BASE}/api/drivers`, { headers }),
        fetch(`${API_BASE}/api/devices`, { headers })
      ]);

      if (resDrivers.ok && resDevices.ok) {
        setDrivers(await resDrivers.json());
        setDevices(await resDevices.json());
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
    }
  };

  // 1. AUMENTO DE RESOLUCIÓN (96x96 a 60% Calidad - Nitidez en tarjeta)
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const SIZE = 99 ; // Incrementado para mayor nitidez
          canvas.width = SIZE;
          canvas.height = SIZE;
          
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, SIZE, SIZE);
          
          // Calidad ajustada a 60% para equilibrar peso y visión
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
          setFormData(prev => ({ ...prev, photo: compressedBase64 }));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const addLicense = () => {
    setFormData({
      ...formData,
      licenses: [...formData.licenses, { category: '', expiration: '' }]
    });
  };

  const removeLicense = (indexToRemove) => {
    const newLicenses = formData.licenses.filter((_, index) => index !== indexToRemove);
    setFormData({ ...formData, licenses: newLicenses });
  };

  const updateLicense = (index, field, value) => {
    const newLicenses = [...formData.licenses];
    newLicenses[index][field] = value;
    setFormData({ ...formData, licenses: newLicenses });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const cleanCourses = {};
    if (formData.courses) {
      Object.keys(formData.courses).forEach(key => {
        if (formData.courses[key] && formData.courses[key].trim() !== '') {
          cleanCourses[key] = formData.courses[key];
        }
      });
    }

    const validLicenses = (formData.licenses || []).filter(l => l.category && l.category.trim() !== '');

    const attributesPayload = {};
    if (formData.phone && formData.phone.trim() !== '') attributesPayload.phone = formData.phone;
    if (formData.photo && formData.photo.trim() !== '') attributesPayload.photo = formData.photo;
    if (formData.bloodType && formData.bloodType.trim() !== '') attributesPayload.bloodType = formData.bloodType;
    if (formData.eps && formData.eps.trim() !== '') attributesPayload.eps = formData.eps;
    if (formData.restrictions && formData.restrictions.trim() !== '') attributesPayload.restrictions = formData.restrictions;
    
    if (validLicenses.length > 0) attributesPayload.licenses = JSON.stringify(validLicenses);
    if (Object.keys(cleanCourses).length > 0) attributesPayload.courses = cleanCourses;

    const attributesStringLength = JSON.stringify(attributesPayload).length;
    if (attributesStringLength > 3980) {
      alert(`⚠️ ERROR DE TAMAÑO (${attributesStringLength}/4000 caracteres): La información acumulada supera el límite máximo de Traccar.\n\nSube una foto más liviana o elimina algunos campos opcionales para liberar espacio.`);
      setIsLoading(false);
      return;
    }

    const payload = {
      ...(editingDriver && { id: editingDriver.id }),
      name: formData.name,
      uniqueId: formData.uniqueId,
      attributes: attributesPayload
    };

    const method = editingDriver ? 'PUT' : 'POST';
    const url = editingDriver 
      ? `${API_BASE}/api/drivers/${editingDriver.id}` 
      : `${API_BASE}/api/drivers`;

    try {
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        let driverId = editingDriver ? editingDriver.id : null;
        
        if (!driverId) {
          const savedDriver = await response.json();
          driverId = savedDriver.id;
        }

        const oldDevice = devices.find(d => d.attributes?.driverId === driverId);
        const newDeviceId = formData.assignedDeviceId ? parseInt(formData.assignedDeviceId) : null;

        if (oldDevice && oldDevice.id !== newDeviceId) {
          const updatedOldAttrs = { ...oldDevice.attributes };
          delete updatedOldAttrs.driverId; 
          
          await fetch(`${API_BASE}/api/devices/${oldDevice.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${token}` },
            body: JSON.stringify({ ...oldDevice, attributes: updatedOldAttrs })
          });
        }

        if (newDeviceId && (!oldDevice || oldDevice.id !== newDeviceId)) {
          const newDevice = devices.find(d => d.id === newDeviceId);
          if (newDevice) {
            const updatedNewAttrs = { ...newDevice.attributes, driverId: driverId };
            await fetch(`${API_BASE}/api/devices/${newDevice.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${token}` },
              body: JSON.stringify({ ...newDevice, attributes: updatedNewAttrs })
            });
          }
        }

        setIsModalOpen(false);
        resetForm();
        fetchData(); 
      } else {
        const errorText = await response.text();
        alert(`❌ Error del Servidor (${response.status}):\n${errorText}\n\n*Nota: Verifica si ya existe otro conductor con esta misma Cédula.`);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("❌ Error de red: No se pudo contactar al servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar este conductor? Esta acción no se puede deshacer.")) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/drivers/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${token}`
        }
      });
      
      if (response.ok) {
        fetchData();
      } else {
        const errorText = await response.text();
        alert(`Error al eliminar: ${errorText}`);
      }
    } catch (error) {
      console.error("Error al eliminar:", error);
    }
  };

  const openEditModal = (driver) => {
    let parsedLicenses = [];
    try {
      if (typeof driver.attributes?.licenses === 'string') {
        parsedLicenses = JSON.parse(driver.attributes.licenses);
      } else if (Array.isArray(driver.attributes?.licenses)) {
        parsedLicenses = driver.attributes.licenses;
      }
    } catch(e) {
      console.warn("No se pudieron parsear las licencias", e);
    }

    const assignedDev = devices.find(d => d.attributes?.driverId === driver.id);
    
    const driverCourses = driver.attributes?.courses || {};
    const defaultCourses = {
      sgSst: '', mecanica: '', defensivo: '', normas: '', 
      extintores: '', auxilios: '', teorico: ''
    };

    setEditingDriver(driver);
    setFormData({
      name: driver.name || '',
      uniqueId: driver.uniqueId || '',
      phone: driver.attributes?.phone || '',
      photo: driver.attributes?.photo || '',
      bloodType: driver.attributes?.bloodType || '',
      eps: driver.attributes?.eps || '',
      restrictions: driver.attributes?.restrictions || '',
      licenses: parsedLicenses,
      assignedDeviceId: assignedDev ? assignedDev.id : '',
      courses: { ...defaultCourses, ...driverCourses }
    });
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingDriver(null);
    setFormData({ 
      name: '', uniqueId: '', phone: '', photo: '', 
      bloodType: '', eps: '', restrictions: '', licenses: [], assignedDeviceId: '',
      courses: {
        sgSst: '', mecanica: '', defensivo: '', normas: '', 
        extintores: '', auxilios: '', teorico: ''
      }
    });
  };

  // 2. FUNCIÓN DE SEMÁFORO DOCUMENTAL
  const getDocumentStatusColor = (driver) => {
    const today = new Date().toISOString().split('T')[0]; // Fecha en formato YYYY-MM-DD
    
    let licArray = [];
    try {
      licArray = typeof driver.attributes?.licenses === 'string' 
        ? JSON.parse(driver.attributes.licenses) 
        : (driver.attributes?.licenses || []);
    } catch(e) {}

    // Condición 1: Falta información vital (No tiene licencias) -> ROJO
    if (licArray.length === 0) return '#EF4444';

    // Condición 2: Licencias vencidas o sin fecha -> ROJO
    const hasExpiredLicense = licArray.some(lic => !lic.expiration || lic.expiration < today);
    if (hasExpiredLicense) return '#EF4444';

    // Condición 3: Cursos vencidos -> ROJO
    const courses = driver.attributes?.courses || {};
    const hasExpiredCourse = Object.values(courses).some(dateStr => dateStr && dateStr !== '' && dateStr < today);
    if (hasExpiredCourse) return '#EF4444';

    // Todo al día -> VERDE
    return '#10B981';
  };

  const filteredDrivers = drivers.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.uniqueId.includes(searchTerm)
  );

  return (
    <>
      <style>{`
        .drivers-wrapper {
          padding: 24px;
          height: 100%;
          overflow-y: auto;
          background-color: transparent;
          color: #E5E7EB;
          font-family: 'Inter', sans-serif;
        }

        .drivers-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          flex-wrap: wrap;
          gap: 15px;
        }
        .header-titles h2 { margin: 0; font-size: 24px; font-weight: bold; color: #FFFFFF; }
        .header-titles p { margin: 5px 0 0 0; font-size: 14px; color: #9CA3AF; }
        
        .header-actions {
          display: flex;
          gap: 12px;
          flex: 1;
          justify-content: flex-end;
          min-width: 300px;
        }
        .search-input {
          flex: 1;
          max-width: 350px;
          background-color: #1F2937;
          border: 1px solid #374151;
          color: white;
          padding: 10px 15px;
          border-radius: 8px;
          outline: none;
          transition: border-color 0.2s;
        }
        .search-input:focus { border-color: #2563EB; }
        
        .btn-primary {
          background-color: #2563EB;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-primary:hover { background-color: #1D4ED8; }

        .drivers-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 20px;
        }
        
        .driver-card {
          background-color: #111827;
          border-radius: 12px;
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        }
        .driver-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
        }

        .driver-photo {
          width: 90px;
          height: 90px;
          border-radius: 50%;
          border: 3px solid #374151;
          background-color: #1F2937;
          overflow: hidden;
          margin-bottom: 15px;
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 35px;
        }
        .driver-photo img { width: 100%; height: 100%; object-fit: cover; }
        
        .driver-name { font-size: 18px; font-weight: bold; color: #FFFFFF; margin: 0 0 5px 0; text-align: center; }
        .driver-id { font-size: 13px; color: #9CA3AF; margin: 0 0 5px 0; }
        .driver-phone { font-size: 14px; color: #60A5FA; margin: 0 0 15px 0; font-weight: 500; }

        .driver-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
          margin-bottom: 12px;
          width: 100%;
        }
        .badge {
          background-color: #1F2937;
          color: #D1D5DB;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid #374151;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .badge-license { background-color: rgba(37, 99, 235, 0.1); border-color: rgba(37, 99, 235, 0.3); color: #93C5FD; }
        .badge-vehicle { background-color: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); color: #34D399; font-weight: bold; }
        
        .restriction-text {
          font-size: 12px;
          color: #F87171;
          text-align: center;
          margin: 0 0 15px 0;
          background-color: rgba(248, 113, 113, 0.1);
          padding: 6px;
          border-radius: 4px;
          width: 100%;
        }

        .course-container {
          width: 100%;
          margin-bottom: 15px;
          background-color: rgba(59, 130, 246, 0.05);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: 8px;
          padding: 10px;
        }
        
        .card-actions {
          display: flex;
          width: 100%;
          gap: 10px;
          margin-top: auto;
          border-top: 1px solid #1F2937;
          padding-top: 15px;
        }
        .btn-edit, .btn-delete {
          flex: 1;
          padding: 8px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: background-color 0.2s;
        }
        .btn-edit { background-color: #374151; color: #E5E7EB; }
        .btn-edit:hover { background-color: #4B5563; }
        .btn-delete { background-color: rgba(220, 38, 38, 0.1); color: #EF4444; }
        .btn-delete:hover { background-color: rgba(220, 38, 38, 0.2); }

        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 99999;
          padding: 20px;
        }
        .modal-content {
          background-color: #111827;
          border: 1px solid #1F2937;
          border-radius: 12px;
          width: 100%;
          max-width: 550px;
          max-height: 90vh;
          overflow-y: auto;
          padding: 25px;
          position: relative;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .modal-content::-webkit-scrollbar { width: 6px; }
        .modal-content::-webkit-scrollbar-track { background: #111827; }
        .modal-content::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        .modal-content::-webkit-scrollbar-thumb:hover { background: #4B5563; }

        .modal-close {
          position: absolute;
          top: 15px; right: 15px;
          background: transparent;
          border: none;
          color: #9CA3AF;
          font-size: 20px;
          cursor: pointer;
        }
        .modal-close:hover { color: #FFFFFF; }
        
        .modal-title { margin: 0 0 20px 0; font-size: 20px; color: #FFFFFF; border-bottom: 1px solid #1F2937; padding-bottom: 10px; }
        
        .form-group { margin-bottom: 15px; }
        .form-row { display: flex; gap: 15px; }
        .form-row .form-group { flex: 1; }
        
        .form-label { display: block; font-size: 13px; color: #9CA3AF; margin-bottom: 5px; font-weight: 500;}
        .form-input {
          width: 100%;
          background-color: #1F2937;
          border: 1px solid #374151;
          color: white;
          padding: 10px 12px;
          border-radius: 6px;
          outline: none;
          color-scheme: dark;
        }
        .form-input:focus { border-color: #2563EB; }
        select.form-input { appearance: auto; }

        .photo-uploader {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 20px;
        }
        .photo-preview {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 2px dashed #4B5563;
          background-color: #1F2937;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          position: relative;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .photo-preview:hover { border-color: #2563EB; }
        .photo-preview img { width: 100%; height: 100%; object-fit: cover; }
        .photo-preview input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .photo-hint { font-size: 11px; color: #6B7280; margin-top: 8px; }

        .license-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          border-bottom: 1px dashed #374151;
          padding-bottom: 8px;
        }
        .btn-add-small {
          background-color: rgba(37, 99, 235, 0.2);
          color: #60A5FA;
          border: 1px solid rgba(37, 99, 235, 0.5);
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-add-small:hover { background-color: rgba(37, 99, 235, 0.4); color: white; }
        
        .license-row {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 10px;
          background-color: #1f293780;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #374151;
        }
        .btn-remove-icon {
          background: rgba(220, 38, 38, 0.1);
          color: #EF4444;
          border: 1px solid rgba(220, 38, 38, 0.3);
          border-radius: 6px;
          padding: 8px;
          cursor: pointer;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .btn-remove-icon:hover { background: rgba(220, 38, 38, 0.3); }

        .courses-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        @media (max-width: 768px) {
          .drivers-header { flex-direction: column; align-items: stretch; }
          .header-actions { flex-direction: column; min-width: 100%; }
          .search-input { max-width: 100%; }
          .form-row { flex-direction: column; gap: 0; }
          .license-row { flex-direction: column; align-items: stretch; }
          .btn-remove-icon { height: auto; padding: 10px; }
          .courses-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="drivers-wrapper">
        <div className="drivers-header">
          <div className="header-titles">
            <h2>Gestión de Conductores</h2>
            <p>Administra personal, licencias (multicategoría), cursos y salud</p>
          </div>
          
          <div className="header-actions">
            <input 
              type="text" 
              placeholder="Buscar por nombre o cédula..." 
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button 
              className="btn-primary"
              onClick={() => {
                resetForm();
                setIsModalOpen(true);
              }}
            >
              <span>➕</span> Nuevo Conductor
            </button>
          </div>
        </div>

        <div className="drivers-grid">
          {filteredDrivers.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#6B7280' }}>
              No se encontraron conductores.
            </div>
          ) : (
            filteredDrivers.map(driver => {
              const assignedDevice = devices.find(d => d.attributes?.driverId === driver.id);
              const driverCourses = driver.attributes?.courses || {};
              const hasCourses = Object.values(driverCourses).some(val => val && val !== '');
              
              // Verificamos estado documental (Rojo o Verde)
              const cardStatusColor = getDocumentStatusColor(driver);

              return (
                <div 
                  key={driver.id} 
                  className="driver-card" 
                  style={{ border: `2px solid ${cardStatusColor}` }} // BORDE DINÁMICO
                >
                  <div className="driver-photo">
                    {driver.attributes?.photo ? (
                      <img src={driver.attributes.photo} alt={driver.name} />
                    ) : (
                      "👤"
                    )}
                  </div>
                  <h3 className="driver-name">{driver.name}</h3>
                  <p className="driver-id">ID: {driver.uniqueId}</p>
                  {driver.attributes?.phone && (
                    <p className="driver-phone">📞 {driver.attributes.phone}</p>
                  )}

                  <div className="driver-badges">
                    {assignedDevice && (
                      <span className="badge badge-vehicle" title="Vehículo Asignado">
                        🚙 {assignedDevice.name}
                      </span>
                    )}
                    {driver.attributes?.bloodType && (
                      <span className="badge">🩸 {driver.attributes.bloodType}</span>
                    )}
                    {driver.attributes?.eps && (
                      <span className="badge">🏥 {driver.attributes.eps}</span>
                    )}
                  </div>

                  {(() => {
                    let licArray = [];
                    try {
                      licArray = typeof driver.attributes?.licenses === 'string' 
                        ? JSON.parse(driver.attributes.licenses) 
                        : (driver.attributes?.licenses || []);
                    } catch(e) {}
                    
                    if (licArray.length > 0) {
                      return (
                        <div className="driver-badges" style={{ marginBottom: '10px' }}>
                          {licArray.map((lic, idx) => {
                            const isExpired = lic.expiration && lic.expiration < new Date().toISOString().split('T')[0];
                            return (
                              <span key={idx} className="badge badge-license" style={isExpired ? {backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#FCA5A5', borderColor: 'rgba(239, 68, 68, 0.4)'} : {}}>
                                🪪 {lic.category} (Vence: {lic.expiration || 'Sin fecha'})
                              </span>
                            );
                          })}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Vencimiento de Cursos */}
                  {hasCourses && (
                    <div className="course-container">
                      <div style={{ fontSize: '10px', color: '#60A5FA', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold' }}>🎓 Vencimiento de Cursos</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {COURSE_LIST.map(course => {
                          if (driverCourses[course.key]) {
                            const isCourseExpired = driverCourses[course.key] < new Date().toISOString().split('T')[0];
                            return (
                              <div key={course.key} style={{ fontSize: '10px', color: isCourseExpired ? '#FCA5A5' : '#D1D5DB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={course.label}>
                                • {course.label}: <span style={{ color: isCourseExpired ? '#EF4444' : 'white', fontWeight: 'bold' }}>{driverCourses[course.key]}</span>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  )}

                  {driver.attributes?.restrictions && (
                    <div className="restriction-text">
                      ⚠️ Restricciones: {driver.attributes.restrictions}
                    </div>
                  )}
                  
                  <div className="card-actions">
                    <button className="btn-edit" onClick={() => openEditModal(driver)}>
                      ✏️ Editar
                    </button>
                    <button className="btn-delete" onClick={() => handleDelete(driver.id)}>
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {isModalOpen && (
          <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
              <h3 className="modal-title">
                {editingDriver ? 'Actualizar Conductor' : 'Registrar Conductor'}
              </h3>
              
              <form onSubmit={handleSubmit}>
                <div className="photo-uploader">
                  <div className="photo-preview">
                    {formData.photo ? (
                      <img src={formData.photo} alt="Preview" />
                    ) : (
                      <span style={{ fontSize: '24px' }}>📷</span>
                    )}
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload}
                    />
                  </div>
                  <span className="photo-hint">Clic para subir foto (Se recortará y adaptará automáticamente)</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Nombre Completo *</label>
                  <input 
                    type="text" 
                    required 
                    className="form-input"
                    placeholder="Ej. Juan Pérez"
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>

                <div className="form-group" style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '10px', borderRadius: '8px' }}>
                  <label className="form-label" style={{ color: '#34D399', fontWeight: 'bold' }}>🚙 Asignar a Vehículo</label>
                  <select 
                    className="form-input"
                    style={{ borderColor: 'rgba(16, 185, 129, 0.5)' }}
                    value={formData.assignedDeviceId}
                    onChange={e => setFormData({...formData, assignedDeviceId: e.target.value})}
                  >
                    <option value="">-- No asignar a ningún vehículo --</option>
                    {devices.map(dev => (
                      <option key={dev.id} value={dev.id}>
                        {dev.name} {dev.attributes?.driverId && dev.attributes.driverId !== (editingDriver?.id) ? '⚠️ (Ya tiene otro conductor)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Número de Identificación *</label>
                    <input 
                      type="text" 
                      required 
                      className="form-input"
                      placeholder="Ej. 1020304050"
                      value={formData.uniqueId} 
                      onChange={e => setFormData({...formData, uniqueId: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input 
                      type="text" 
                      className="form-input"
                      placeholder="Ej. 3001234567"
                      value={formData.phone} 
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Tipo de Sangre</label>
                    <select 
                      className="form-input"
                      value={formData.bloodType}
                      onChange={e => setFormData({...formData, bloodType: e.target.value})}
                    >
                      <option value="">Seleccione...</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">EPS</label>
                    <input 
                      type="text" 
                      className="form-input"
                      placeholder="Ej. Sura, Sanitas"
                      value={formData.eps} 
                      onChange={e => setFormData({...formData, eps: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ backgroundColor: '#111827', padding: '15px', borderRadius: '8px', border: '1px solid #1F2937' }}>
                  <div className="license-header">
                    <label className="form-label" style={{ margin: 0 }}>Licencias Autorizadas</label>
                    <button type="button" onClick={addLicense} className="btn-add-small">
                      + Añadir Categoría
                    </button>
                  </div>

                  {formData.licenses.length === 0 && (
                    <p style={{ fontSize: '12px', color: '#6B7280', fontStyle: 'italic', textAlign: 'center', margin: '10px 0' }}>
                      No se han agregado categorías de licencia.
                    </p>
                  )}

                  {formData.licenses.map((lic, index) => (
                    <div key={index} className="license-row">
                      <div style={{ flex: 1 }}>
                        <select 
                          className="form-input"
                          style={{ marginBottom: '5px' }}
                          value={lic.category}
                          onChange={e => updateLicense(index, 'category', e.target.value)}
                        >
                          <option value="">Seleccione categoría...</option>
                          <option value="A1">A1 (Motos hasta 125cc)</option>
                          <option value="A2">A2 (Motos más de 125cc)</option>
                          <option value="B1">B1 (Autos/Camionetas Particular)</option>
                          <option value="B2">B2 (Camiones/Busetas Particular)</option>
                          <option value="B3">B3 (Articulados Particular)</option>
                          <option value="C1">C1 (Autos/Camionetas Público)</option>
                          <option value="C2">C2 (Camiones/Busetas Público)</option>
                          <option value="C3">C3 (Articulados Público)</option>
                        </select>
                        <input 
                          type="date" 
                          className="form-input"
                          title="Fecha de Vencimiento"
                          value={lic.expiration} 
                          onChange={e => updateLicense(index, 'expiration', e.target.value)}
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => removeLicense(index)} 
                        className="btn-remove-icon"
                        title="Eliminar esta licencia"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>

                {/* VIGENCIA DE CURSOS */}
                <div className="form-group" style={{ backgroundColor: '#111827', padding: '15px', borderRadius: '8px', border: '1px solid #1F2937' }}>
                  <label className="form-label" style={{ color: '#60A5FA', borderBottom: '1px dashed #374151', paddingBottom: '8px', marginBottom: '15px' }}>🎓 Vigencia de Cursos (Opcional)</label>
                  <div className="courses-grid">
                    {COURSE_LIST.map(course => (
                      <div key={course.key} style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '4px', textTransform: 'uppercase' }}>
                          {course.label}
                        </label>
                        <input 
                          type="date" 
                          className="form-input" 
                          value={formData.courses[course.key] || ''} 
                          onChange={e => setFormData({
                            ...formData, 
                            courses: { ...formData.courses, [course.key]: e.target.value }
                          })} 
                          style={{ padding: '8px', fontSize: '12px' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Restricciones del Conductor</label>
                  <textarea 
                    className="form-input"
                    rows="2"
                    placeholder="Ej. Uso de lentes obligatorios, audífonos, etc."
                    value={formData.restrictions} 
                    onChange={e => setFormData({...formData, restrictions: e.target.value})}
                  ></textarea>
                </div>

                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="btn-primary" 
                  style={{ width: '100%', justifyContent: 'center', marginTop: '10px', padding: '12px' }}
                >
                  {isLoading ? '⏳ Guardando...' : '💾 Guardar Conductor y Asignación'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}