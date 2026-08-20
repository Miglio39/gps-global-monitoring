import React, { useState, useEffect } from 'react';

// Ajusta la URL de tu API si es necesario
const API_BASE = 'https://api.globalmonitorgps.com'; 

export default function DriversManagement({ token }) {
  const [drivers, setDrivers] = useState([]);
  const [devices, setDevices] = useState([]); // ESTADO NUEVO: Para cargar los vehículos
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
    assignedDeviceId: '' // NUEVO: Para asignar el vehículo al conductor
  });

  useEffect(() => {
    fetchData();
  }, [token]);

  // Modificado: Ahora traemos Conductores y Vehículos al mismo tiempo
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

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 120; 
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
          setFormData({ ...formData, photo: compressedBase64 });
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

    const attributesPayload = {
      phone: formData.phone,
      photo: formData.photo,
      bloodType: formData.bloodType,
      eps: formData.eps,
      restrictions: formData.restrictions,
      licenses: JSON.stringify(formData.licenses) 
    };

    const attributesStringLength = JSON.stringify(attributesPayload).length;
    if (attributesStringLength > 3900) {
      alert(`⚠️ ERROR DE TAMAÑO: Los datos del conductor alcanzan los ${attributesStringLength} caracteres, superando el límite de 4000 permitidos por Traccar.\n\nPor favor, sube una foto con fondo más simple o elimina algunas categorías para liberar espacio.`);
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
        // --- NUEVA LÓGICA DE ASIGNACIÓN DE VEHÍCULO ---
        let driverId = editingDriver ? editingDriver.id : null;
        
        // Si es un conductor nuevo, capturamos su ID recién creado
        if (!driverId) {
          const savedDriver = await response.json();
          driverId = savedDriver.id;
        }

        const oldDevice = devices.find(d => d.attributes?.driverId === driverId);
        const newDeviceId = formData.assignedDeviceId ? parseInt(formData.assignedDeviceId) : null;

        // 1. Desvincular del vehículo viejo si se cambió o se quitó
        if (oldDevice && oldDevice.id !== newDeviceId) {
          const updatedOldAttrs = { ...oldDevice.attributes };
          delete updatedOldAttrs.driverId; // Le quitamos el conductor
          
          await fetch(`${API_BASE}/api/devices/${oldDevice.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${token}` },
            body: JSON.stringify({ ...oldDevice, attributes: updatedOldAttrs })
          });
        }

        // 2. Vincular al nuevo vehículo seleccionado
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
        // ----------------------------------------------

        setIsModalOpen(false);
        resetForm();
        fetchData(); // Refrescamos todo (conductores y vehículos)
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
      // Opcional: También podríamos desvincularlo del vehículo antes de borrar, 
      // pero Traccar normalmente ignora los driverId huérfanos.
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

    // Buscar si este conductor ya tiene un vehículo asignado
    const assignedDev = devices.find(d => d.attributes?.driverId === driver.id);

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
      assignedDeviceId: assignedDev ? assignedDev.id : '' // Cargamos el carro asignado
    });
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingDriver(null);
    setFormData({ 
      name: '', uniqueId: '', phone: '', photo: '', 
      bloodType: '', eps: '', restrictions: '', licenses: [], assignedDeviceId: '' 
    });
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
          border: 1px solid #1F2937;
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
          border-color: #374151;
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
        
        /* NUEVO: Etiqueta Visual para el Vehículo Asignado */
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

        @media (max-width: 768px) {
          .drivers-header { flex-direction: column; align-items: stretch; }
          .header-actions { flex-direction: column; min-width: 100%; }
          .search-input { max-width: 100%; }
          .form-row { flex-direction: column; gap: 0; }
          .license-row { flex-direction: column; align-items: stretch; }
          .btn-remove-icon { height: auto; padding: 10px; }
        }
      `}</style>

      <div className="drivers-wrapper">
        <div className="drivers-header">
          <div className="header-titles">
            <h2>Gestión de Conductores</h2>
            <p>Administra personal, licencias (multicategoría) y salud</p>
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
              // Buscar si tiene un vehículo asignado para mostrarlo en la tarjeta
              const assignedDevice = devices.find(d => d.attributes?.driverId === driver.id);

              return (
                <div key={driver.id} className="driver-card">
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
                    {/* Tarjeta del vehículo asigando (Si lo tiene) */}
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
                        <div className="driver-badges" style={{ marginBottom: '15px' }}>
                          {licArray.map((lic, idx) => (
                            <span key={idx} className="badge badge-license">
                              🪪 {lic.category} (Vence: {lic.expiration || 'Sin fecha'})
                            </span>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}

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
                  <span className="photo-hint">Clic para subir foto (Alta Calidad)</span>
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

                {/* NUEVA ZONA DE ASIGNACIÓN DE VEHÍCULO */}
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