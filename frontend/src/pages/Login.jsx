import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config'; // <-- 1. Importas la variable central 

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      // 2. Inyectas la variable antes de la ruta relativa
      const response = await fetch(`${API_BASE}/api/session`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded' 
        },
        body: new URLSearchParams({ email: email, password: password })
      });
      // ... el resto de tu código queda igual

      if (response.ok) {
        // Autenticación exitosa
        const userData = await response.json();
        
        // Creamos el token Basic Auth para usarlo en el Dashboard
        const basicAuth = btoa(`${email}:${password}`);
        localStorage.setItem('traccar_token', basicAuth);
        localStorage.setItem('traccar_user', JSON.stringify(userData));
        
        navigate('/dashboard');
      } else {
        // Error 401 (Credenciales rechazadas por Traccar)
        setErrorMsg('Correo o contraseña incorrectos.');
      }
    } catch (error) {
      console.error("Error de red:", error);
      setErrorMsg('Error de conexión con el servidor.');
    }
    
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginCard}>
        
        <div style={styles.header}>
          {/* AQUÍ CARGAMOS TU LOGO OFICIAL */}
          <img 
            src="/logo.png" 
            alt="Logo Global GPS Monitor" 
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
            <label style={styles.label}>Correo Electrónico</label>
            <input 
              type="email" 
              placeholder="admin@ejemplo.com" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Contraseña</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
            />
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
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#0B1120', // Fondo oscuro coincidente con el Dashboard
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    padding: '20px',
  },
  loginCard: {
    backgroundColor: '#FFFFFF',
    padding: '40px',
    borderRadius: '15px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    width: '100%',
    maxWidth: '420px',
    textAlign: 'center',
  },
  header: {
    marginBottom: '30px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  companyName: {
    margin: 0,
    fontSize: '24px',
    letterSpacing: '3px',
    color: '#0B1120',
    fontWeight: '800',
  },
  tagline: {
    fontSize: '11px',
    color: '#E61E2A', // Rojo de tu logo
    marginTop: '5px',
    letterSpacing: '1px',
    fontWeight: 'bold',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    textAlign: 'left',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  },
  input: {
    padding: '12px 15px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '16px',
    outline: 'none',
    transition: 'border-color 0.3s',
  },
  button: {
    padding: '14px',
    backgroundColor: '#E61E2A', // Rojo corporativo
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'background-color 0.3s',
  },
  footer: {
    marginTop: '30px',
    fontSize: '11px',
    color: '#999',
  }
};