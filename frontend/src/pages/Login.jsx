import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  // Cambiamos 'email' por 'identifier' para que sea más semántico (Usuario o Correo)
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // Estado para ver/ocultar clave
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      // Traccar recibe el parámetro como 'email', pero acepta tanto usuario como correo
      const response = await fetch('https://api.labtesting.online/api/session', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded' 
        },
        body: new URLSearchParams({ email: identifier, password: password })
      });

      if (response.ok) {
        // Autenticación exitosa
        const userData = await response.json();
        
        // Creamos el token Basic Auth para usarlo en el Dashboard
        const basicAuth = btoa(`${identifier}:${password}`);
        localStorage.setItem('traccar_token', basicAuth);
        localStorage.setItem('traccar_user', JSON.stringify(userData));
        
        navigate('/dashboard');
      } else {
        setErrorMsg('Usuario/Correo o contraseña incorrectos.');
      }
    } catch (error) {
      console.error("Error de red:", error);
      setErrorMsg('Error de conexión con el servidor.');
    }
    
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      {/* INYECCIÓN DE CSS PARA LAS ANIMACIONES */}
      <style>
        {`
          @keyframes floatLogo {
            0% { transform: translateY(0px); filter: drop-shadow(0px 5px 5px rgba(0,0,0,0.1)); }
            50% { transform: translateY(-10px); filter: drop-shadow(0px 15px 10px rgba(0,0,0,0.15)); }
            100% { transform: translateY(0px); filter: drop-shadow(0px 5px 5px rgba(0,0,0,0.1)); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animated-logo {
            animation: floatLogo 3s ease-in-out infinite;
          }
          .animated-card {
            animation: fadeIn 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          }
        `}
      </style>

      <div style={{...styles.loginCard}} className="animated-card">
        
        <div style={styles.header}>
          <img 
            src="/logo.png" 
            alt="Logo Global GPS Monitor" 
            className="animated-logo"
            style={{ width: '160px', marginBottom: '10px' }} 
          />
          <h1 style={styles.companyName}>MONITOR</h1>
          <p style={styles.tagline}>SISTEMA DE MONITOREO GLOBAL</p>
        </div>

        {errorMsg && (
          <div style={{backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '5px', marginBottom: '15px', fontSize: '14px', fontWeight: 'bold'}}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Usuario o Correo Electrónico</label>
            {/* Cambiado a type="text" para permitir nombres de usuario sin "@" */}
            <input 
              type="text" 
              placeholder="admin o admin@ejemplo.com" 
              required 
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Contraseña</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••••" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{...styles.input, width: '100%', paddingRight: '45px', boxSizing: 'border-box'}}
              />
              {/* Botón para ver/ocultar contraseña con íconos SVG profesionales */}
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} style={loading ? {...styles.button, opacity: 0.7} : styles.button}>
            {loading ? 'AUTENTICANDO...' : 'INICIAR SESIÓN'}
          </button>
        </form>

        <div style={styles.footer}>
          <p>© 2026 Global GPS Monitor. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  );
}

// Estilos de la tarjeta de Login
const styles = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0B1120', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", padding: '20px' },
  loginCard: { backgroundColor: '#FFFFFF', padding: '40px', borderRadius: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', width: '100%', maxWidth: '420px', textAlign: 'center' },
  header: { marginBottom: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  companyName: { margin: 0, fontSize: '24px', letterSpacing: '3px', color: '#0B1120', fontWeight: '800' },
  tagline: { fontSize: '11px', color: '#E61E2A', marginTop: '5px', letterSpacing: '1px', fontWeight: 'bold' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '14px', fontWeight: '600', color: '#333' },
  input: { padding: '12px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px', outline: 'none', transition: 'border-color 0.3s' },
  eyeButton: { position: 'absolute', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' },
  button: { padding: '14px', backgroundColor: '#E61E2A', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px', transition: 'background-color 0.3s' },
  footer: { marginTop: '30px', fontSize: '11px', color: '#999' }
};