import React, { useState, useEffect } from 'react';
import { Mail, RefreshCw, ExternalLink, Calendar, Search, Play } from 'lucide-react';

const InboxPanel = ({ API_URL, showNotification, onOpenConfig }) => {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedForRescrape, setSelectedForRescrape] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [runningScraper, setRunningScraper] = useState(false);
  const [error, setError] = useState(null);

  const fetchEmails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/inbox`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error cargando correos');
      }
      const data = await res.json();
      setEmails(data);
      // Limpiar selección al recargar
      setSelectedForRescrape([]);
    } catch (err) {
      console.error(err);
      setError(err.message);
      showNotification(`Error cargando bandeja: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRunScraper = async () => {
    setRunningScraper(true);
    
    // Si hay correos seleccionados, ejecutar re-escaneo específico
    if (selectedForRescrape.length > 0) {
      showNotification(`Iniciando re-escaneo de ${selectedForRescrape.length} correos...`, 'info');
      
      let successCount = 0;
      let errorCount = 0;

      for (const uid of selectedForRescrape) {
        try {
          const res = await fetch(`${API_URL}/scraper/rescrape-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid })
          });
          const data = await res.json();
          if (data.success) {
            successCount++;
          } else {
            errorCount++;
            console.error(`Error re-escaneando UID ${uid}:`, data.error);
          }
        } catch (err) {
          errorCount++;
          console.error(`Error de conexión UID ${uid}:`, err);
        }
      }

      if (successCount > 0) {
        showNotification(`Re-escaneo iniciado para ${successCount} correos.`, 'success');
      }
      if (errorCount > 0) {
        showNotification(`Hubo errores al iniciar ${errorCount} correos.`, 'warning');
      }
      
      // Limpiar selección y estado
      setSelectedForRescrape([]);
      setRunningScraper(false);
      return;
    }

    // Comportamiento por defecto (Scraper completo)
    showNotification('Iniciando scraper de portales...', 'info');
    try {
      const res = await fetch(`${API_URL}/scraper/run`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('Scrapers iniciados correctamente.', 'success');
        // Opcional: Recargar emails después de un tiempo
        setTimeout(fetchEmails, 5000);
      } else {
        showNotification('Error iniciando scrapers: ' + (data.error || 'Desconocido'), 'error');
      }
    } catch (err) {
      console.error(err);
      showNotification('Error de conexión al iniciar scrapers', 'error');
    } finally {
      setRunningScraper(false);
    }
  };

  const toggleRescrapeSelect = (uid, e) => {
    e.stopPropagation();
    setSelectedForRescrape(prev => {
      if (prev.includes(uid)) {
        return prev.filter(id => id !== uid);
      } else {
        return [...prev, uid];
      }
    });
  };

  const fetchEmailBody = async (uid) => {
    setLoadingBody(true);
    try {
      const res = await fetch(`${API_URL}/inbox/${uid}`);
      if (!res.ok) throw new Error('Error cargando contenido');
      const data = await res.json();
      setSelectedEmail(data);
      
      // Actualizar estado local a leido
      setEmails(prev => prev.map(e => e.uid === uid ? { ...e, seen: true } : e));
      
    } catch (err) {
      console.error(err);
      showNotification('No se pudo cargar el contenido del correo', 'error');
    } finally {
      setLoadingBody(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleString('es-ES', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    } catch { return dateStr; }
  };

  // Helper para formatear direcciones de correo y evitar errores de objetos en React
  const formatAddress = (val) => {
    if (!val) return '';
    if (Array.isArray(val)) {
      return val.map(v => formatAddress(v)).join(', ');
    }
    if (typeof val === 'object' && val !== null) {
      // Manejar objeto {address, name} que causa el error React #31
      if (val.name && val.address) {
        return `${val.name} <${val.address}>`;
      }
      return val.address || val.name || '';
    }
    return String(val);
  };

  return (
    <div className="inbox-container" style={{ display: 'flex', height: 'calc(100vh - 100px)', gap: '1rem' }}>
      {/* Left List Panel */}
      <div className="inbox-list" style={{ 
        width: '350px', 
        background: 'var(--bg-secondary)', 
        borderRadius: '8px', 
        overflow: 'hidden', 
        display: 'flex', 
        flexDirection: 'column',
        border: '1px solid var(--border)'
      }}>
        <div className="inbox-header" style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={20} /> Bandeja
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={handleRunScraper} 
              disabled={runningScraper}
              title={selectedForRescrape.length > 0 ? `Re-escanear ${selectedForRescrape.length} seleccionados` : "Escanear Portales (Fotocasa/Idealista)"}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: selectedForRescrape.length > 0 ? '#3b82f6' : 'var(--text)', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {selectedForRescrape.length > 0 && <span style={{fontSize: '0.8rem', fontWeight: 'bold'}}>{selectedForRescrape.length}</span>}
              <Play size={18} className={runningScraper ? 'spinning' : ''} fill={runningScraper || selectedForRescrape.length > 0 ? "currentColor" : "none"} />
            </button>
            <button 
              onClick={fetchEmails} 
              disabled={loading}
              title="Actualizar Bandeja"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
            >
              <RefreshCw size={18} className={loading ? 'spinning' : ''} />
            </button>
          </div>
        </div>

        <div className="email-list-content" style={{ overflowY: 'auto', flex: 1 }}>
          {loading && emails.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando...</div>
          ) : error ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
              <p>{error}</p>
              {(error.includes('Credenciales') || error.includes('autenticación') || error.includes('credentials')) && (
                 <button 
                   onClick={onOpenConfig}
                   style={{ 
                     marginTop: '1rem', 
                     padding: '0.5rem 1rem', 
                     background: '#3b82f6', 
                     color: 'white', 
                     border: 'none', 
                     borderRadius: '4px', 
                     cursor: 'pointer' 
                   }}
                 >
                   Configurar Email
                 </button>
              )}
            </div>
          ) : emails.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay correos recientes</div>
          ) : (
            emails.map(email => (
              <div 
                key={email.uid}
                onClick={() => fetchEmailBody(email.uid)}
                style={{ 
                  padding: '1rem', 
                  borderBottom: '1px solid var(--border)', 
                  cursor: 'pointer',
                  background: selectedEmail?.uid === email.uid ? 'rgba(59, 130, 246, 0.1)' : (email.seen ? 'transparent' : 'rgba(59, 130, 246, 0.08)'),
                  borderLeft: selectedEmail?.uid === email.uid ? '4px solid #3b82f6' : (email.seen ? '4px solid transparent' : '4px solid #ef4444'),
                  fontWeight: email.seen ? 'normal' : '700'
                }}
                className="email-item-hover"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span style={{ fontWeight: email.seen ? 'normal' : 'bold', color: 'var(--text)' }}>{formatAddress(email.from).replace(/<.*>/, '').trim()}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: email.seen ? 'normal' : 'bold' }}>{formatDate(email.date)}</span>
                    <input 
                        type="checkbox" 
                        title="Seleccionar para re-escanear"
                        checked={selectedForRescrape.includes(email.uid)}
                        onClick={(e) => toggleRescrapeSelect(email.uid, e)}
                        onChange={() => {}} // React requiere onChange para inputs controlados, pero manejamos click
                        style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                    />
                  </div>
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: email.seen ? '500' : 'bold', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email.subject}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Content Panel */}
      <div className="inbox-content" style={{ 
        flex: 1, 
        background: 'var(--bg-secondary)', 
        borderRadius: '8px', 
        overflow: 'hidden', 
        display: 'flex', 
        flexDirection: 'column',
        border: '1px solid var(--border)'
      }}>
        {loadingBody ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <RefreshCw size={32} className="spinning" style={{ color: 'var(--text-secondary)' }} />
          </div>
        ) : selectedEmail ? (
          <>
            <div className="email-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem' }}>{selectedEmail.subject}</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <div>
                  <strong>De:</strong> {formatAddress(selectedEmail.from)}
                  <br />
                  <strong>Para:</strong> {formatAddress(selectedEmail.to)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {formatDate(selectedEmail.date)}
                </div>
              </div>
            </div>
            <div className="email-body" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#fff', color: '#000' }}>
               {/* Render HTML safely */}
               <div dangerouslySetInnerHTML={{ __html: selectedEmail.html || selectedEmail.text.replace(/\n/g, '<br/>') }} />
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-secondary)' }}>
            <Mail size={64} style={{ marginBottom: '1rem', opacity: 0.5 }} />
            <p>Selecciona un correo para leerlo</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InboxPanel;
