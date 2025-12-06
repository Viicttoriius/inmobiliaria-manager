import { useState, useEffect } from 'react'
import { Home, Building2, MapPin, Calendar, Phone, ExternalLink, Search, Filter, Play, Users, MessageSquare, Plus, Trash2, Send, RefreshCw, Image as ImageIcon, Pencil, History, Settings, AlertCircle, CheckCircle, Info, X, Bell, LifeBuoy } from 'lucide-react'
import './App.css'

const API_URL = 'http://localhost:3001/api';

function App() {
  const [properties, setProperties] = useState([])
  const [filteredProperties, setFilteredProperties] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [sortBy, setSortBy] = useState('date_desc')
  const [activeTab, setActiveTab] = useState('properties')
  const [scrapingInProgress, setScrapingInProgress] = useState({ fotocasa_viviendas: false, fotocasa_locales: false, fotocasa_terrenos: false, idealista: false });
  const [showFotocasaOptions, setShowFotocasaOptions] = useState(false);
  const [scrapingLog, setScrapingLog] = useState('')

  // Estados para Modal de Configuración
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configStatus, setConfigStatus] = useState({ whatsapp: { ready: false, qr: null }, email: { configured: false, user: '' } });
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });
  const [savingEmail, setSavingEmail] = useState(false);

  // Estados para Notificaciones y Modales
  const [notifications, setNotifications] = useState([]);
  const [notificationHistory, setNotificationHistory] = useState([]);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  
  // Estado para Soporte Técnico
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportForm, setSupportForm] = useState({ subject: '', message: '' });
  const [sendingSupport, setSendingSupport] = useState(false);

  // Cargar historial de notificaciones al iniciar
  useEffect(() => {
    const savedHistory = localStorage.getItem('notificationHistory');
    if (savedHistory) {
      try {
        setNotificationHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Error parsing notification history', e);
      }
    }
  }, []);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    isDanger: false,
    onConfirm: () => {}
  });

  const showNotification = (message, type = 'info') => {
    const id = Date.now();
    const newNotification = { id, message, type, timestamp: new Date().toISOString() };
    
    // Mostrar toast
    setNotifications(prev => [...prev, newNotification]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);

    // Guardar en historial
    setNotificationHistory(prev => {
      const updated = [newNotification, ...prev].slice(0, 50); // Guardar últimos 50
      localStorage.setItem('notificationHistory', JSON.stringify(updated));
      return updated;
    });
  };

  const clearNotificationHistory = () => {
    setNotificationHistory([]);
    localStorage.removeItem('notificationHistory');
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const requestConfirm = ({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = false, onConfirm }) => {
    console.log('🛑 requestConfirm llamado:', { title, message });
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      isDanger,
      onConfirm: () => {
        console.log('🖱️ Click en Confirmar dentro del modal detected!');
        // Primero cerramos el modal actual para evitar conflictos de estado
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        
        // Ejecutamos la acción. Si la acción abre otro modal (como en el caso de encadenar confirmaciones),
        // la nueva llamada a setConfirmModal(true) sobrescribirá el cierre anterior.
        onConfirm();
      }
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };


  const formatPrice = (price) => {
    if (price === 'A consultar' || !price) {
      return 'A consultar';
    }
    // Limpiar el string de precio: quitar puntos, símbolo de euro y espacios
    const cleanedPrice = String(price).replace(/\./g, '').replace(/€/g, '').trim();
    const numericPrice = parseFloat(cleanedPrice);

    if (isNaN(numericPrice)) {
      return 'A consultar';
    }
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numericPrice);
  };



  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '', interest: 'Comprar', preferences: '' })
  const [editingId, setEditingId] = useState(null)
  const [selectedClients, setSelectedClients] = useState([])
  const [selectedProperties, setSelectedProperties] = useState([])
  const [generatedMessage, setGeneratedMessage] = useState('')
  const [generatingMessage, setGeneratingMessage] = useState(false)
  const [selectedModel, setSelectedModel] = useState('openai/gpt-oss-20b:free');
  const [selectedChannel, setSelectedChannel] = useState('whatsapp');
  const [updatingProperties, setUpdatingProperties] = useState(false);
  const [updateLog, setUpdateLog] = useState([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [viewingClientHistory, setViewingClientHistory] = useState(null);

  // Filtros de Clientes
  const [clientFilters, setClientFilters] = useState({ search: '', interest: 'all' });
  const [filteredClients, setFilteredClients] = useState([]);

  useEffect(() => {
    loadProperties()
    loadClients()
  }, [])

  useEffect(() => {
    filterAndSortProperties()
  }, [properties, searchTerm, filterType, sortBy])

  // Efecto para filtrar clientes
  useEffect(() => {
    let result = [...clients];
    
    if (clientFilters.search) {
      const search = clientFilters.search.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(search) || 
        c.phone.includes(search) ||
        (c.email && c.email.toLowerCase().includes(search))
      );
    }

    if (clientFilters.interest !== 'all') {
      result = result.filter(c => c.interest === clientFilters.interest);
    }

    setFilteredClients(result);
  }, [clients, clientFilters]);

  const loadProperties = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/properties`)
      const data = await response.json()
      setProperties(data)
    } catch (error) {
      console.error('Error cargando propiedades:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadClients = async () => {
    try {
      const response = await fetch(`${API_URL}/clients`)
      const data = await response.json()
      setClients(data)
    } catch (error) {
      console.error('Error cargando clientes:', error)
    }
  }

  const openConfigModal = async () => {
    setConfigModalOpen(true);
    await loadConfigStatus();
  };

  const loadConfigStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/config/status`);
      const data = await response.json();
      setConfigStatus(data);
      if (data.email.configured) {
          setEmailForm(prev => ({ ...prev, email: data.email.user }));
      }
    } catch (error) {
      console.error('Error cargando estado de configuración:', error);
    }
  };

  const handleEmailSave = async (e) => {
    e.preventDefault();
    setSavingEmail(true);
    try {
        const response = await fetch(`${API_URL}/config/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailForm)
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Credenciales de email guardadas correctamente.', 'success');
            loadConfigStatus();
        } else {
            showNotification('Error guardando credenciales: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Error de conexión.', 'error');
    } finally {
        setSavingEmail(false);
    }
  };

  const handleWhatsAppLogout = async () => {
    requestConfirm({
        title: 'Cerrar sesión WhatsApp',
        message: '¿Estás seguro de que quieres cerrar la sesión de WhatsApp? Tendrás que escanear el QR de nuevo.',
        isDanger: true,
        confirmText: 'Cerrar Sesión',
        onConfirm: async () => {
            try {
                await fetch(`${API_URL}/config/whatsapp/logout`, { method: 'POST' });
                showNotification('Sesión de WhatsApp cerrada.', 'success');
                // Recargar estado para mostrar QR nuevo
                setTimeout(loadConfigStatus, 2000);
            } catch (error) {
                console.error('Error logout whatsapp:', error);
                showNotification('Error al cerrar sesión de WhatsApp', 'error');
            }
        }
    });
  };


  const runScraper = async (scraperName, propertyType) => {
    const stateKey = propertyType ? `${scraperName}_${propertyType}` : scraperName;
    setScrapingInProgress(prev => ({ ...prev, [stateKey]: true }))
    setScrapingLog(`Iniciando scraper de ${scraperName}${propertyType ? ` (${propertyType})` : ''}...\n`)

    try {
      const response = await fetch(`${API_URL}/scraper/${scraperName}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: propertyType })
      })
      const data = await response.json()

      if (data.success) {
        setScrapingLog(prev => prev + `\n✅ Scraper de ${scraperName}${propertyType ? ` (${propertyType})` : ''} completado!\n` + (data.output || ''))
        await loadProperties()
      } else {
        setScrapingLog(prev => prev + `\n❌ Error en ${scraperName}${propertyType ? ` (${propertyType})` : ''}: ` + (data.error || 'Error desconocido'))
      }
    } catch (error) {
      setScrapingLog(prev => prev + `\n❌ Error ejecutando scraper de ${scraperName}${propertyType ? ` (${propertyType})` : ''}: ` + error.message)
    } finally {
      setScrapingInProgress(prev => ({ ...prev, [stateKey]: false }))
    }
  }

  const handleSendSupport = async (e) => {
    e.preventDefault();
    if (!supportForm.message) {
      showNotification('Por favor, escribe un mensaje.', 'error');
      return;
    }
    
    setSendingSupport(true);
    try {
      const response = await fetch(`${API_URL}/support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           ...supportForm,
           userEmail: emailForm.email || 'Usuario Desconocido'
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        showNotification('Mensaje de soporte enviado correctamente.', 'success');
        setSupportForm({ subject: '', message: '' });
        setSupportModalOpen(false);
      } else {
        showNotification('Error enviando mensaje: ' + (data.error || 'Error desconocido'), 'error');
      }
    } catch (error) {
      console.error('Error sending support:', error);
      showNotification('Error de conexión al enviar mensaje.', 'error');
    } finally {
      setSendingSupport(false);
    }
  };

  const filterAndSortProperties = () => {
    let filtered = [...properties]

    // Filtro por búsqueda (case insensitive)
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(prop =>
        (prop.Title?.toLowerCase() || '').includes(search)
      )
    }

    // Filtro por tipo
    if (filterType !== 'all') {
      filtered = filtered.filter(prop => prop.property_type === filterType)
    }

    // Función para convertir el precio a un número comparable
    const getNumericPrice = (price) => {
      if (typeof price !== 'string') return null;
      // Eliminar puntos, comas, símbolo de euro y espacios en blanco
      const cleanedPrice = price.replace(/[.,€\s]/g, '');
      const numericPrice = parseFloat(cleanedPrice);
      return isNaN(numericPrice) ? null : numericPrice;
    };

    // Ordenar
    if (sortBy === 'price_asc') {
      filtered.sort((a, b) => {
        const priceA = getNumericPrice(a.Price);
        const priceB = getNumericPrice(b.Price);
        if (priceA === null) return 1; // 'A consultar' va al final
        if (priceB === null) return -1;
        return priceA - priceB;
      });
    } else if (sortBy === 'price_desc') {
      filtered.sort((a, b) => {
        const priceA = getNumericPrice(a.Price);
        const priceB = getNumericPrice(b.Price);
        if (priceA === null) return 1; // 'A consultar' va al final
        if (priceB === null) return -1;
        return priceB - priceA;
      });
    } else if (sortBy === 'date_desc') {
      filtered.sort((a, b) => new Date(b.publicationDate) - new Date(a.publicationDate));
    } else if (sortBy === 'date_asc') {
      filtered.sort((a, b) => new Date(a.publicationDate) - new Date(b.publicationDate));
    }

    setFilteredProperties(filtered)
  }

  const clearFilters = () => {
    setSearchTerm('');
    setFilterType('all');
    setSortBy('timeago');
  };

  const handleClientSubmit = async (e) => {
    e.preventDefault()
    if (!newClient.name || !newClient.phone) {
      showNotification('Nombre y teléfono son obligatorios', 'error')
      return
    }

    try {
      if (editingId) {
        const response = await fetch(`${API_URL}/clients/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newClient)
        })
        const data = await response.json()
        setClients(clients.map(c => c.id === editingId ? data : c))
        setEditingId(null)
        showNotification('Cliente actualizado correctamente', 'success')
      } else {
        const response = await fetch(`${API_URL}/clients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newClient)
        })
        const data = await response.json()
        setClients([...clients, data])
        showNotification('Cliente creado correctamente', 'success')
      }
      setNewClient({ name: '', phone: '', email: '', interest: 'Comprar', preferences: '' })
    } catch (error) {
      console.error('Error guardando cliente:', error)
      showNotification('Error guardando cliente', 'error')
    }
  }

  const startEditing = (client) => {
    setNewClient(client)
    setEditingId(client.id)
  }

  const cancelEditing = () => {
    setNewClient({ name: '', phone: '', email: '', interest: 'Comprar', preferences: '' })
    setEditingId(null)
  }

  const deleteClient = async (id) => {
    requestConfirm({
        title: 'Eliminar Cliente',
        message: '¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer.',
        isDanger: true,
        confirmText: 'Eliminar',
        onConfirm: async () => {
            try {
                await fetch(`${API_URL}/clients/${id}`, { method: 'DELETE' })
                setClients(clients.filter(c => c.id !== id))
                setSelectedClients(selectedClients.filter(cid => cid !== id))
                showNotification('Cliente eliminado correctamente', 'success')
            } catch (error) {
                console.error('Error eliminando cliente:', error)
                showNotification('Error al eliminar cliente', 'error')
            }
        }
    });
  }

  const generateMessage = async () => {
    if (selectedClients.length === 0) {
      showNotification('Selecciona al menos un cliente', 'info')
      return
    }

    if (selectedProperties.length === 0) {
      showNotification('Selecciona al menos una propiedad', 'info')
      return
    }

    setGeneratingMessage(true)

    try {
      const client = clients.find(c => c.id === selectedClients[0])
      const props = properties.filter(p => selectedProperties.includes(p.url))

      const response = await fetch(`${API_URL}/messages/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: client.name,
          clientPhone: client.phone,
          properties: props,
          preferences: client.preferences || '',
          model: selectedModel
        })
      })

      const data = await response.json()
      setGeneratedMessage(data.message)

      if (data.source === 'openrouter') {
        showNotification('Mensaje generado con IA', 'success')
      }
    } catch (error) {
      console.error('Error generando mensaje:', error)
      showNotification('Error generando mensaje', 'error')
    } finally {
      setGeneratingMessage(false)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedMessage)
    showNotification('Mensaje copiado al portapapeles', 'success')
  }

  const sendMessage = async () => {
    console.log('%c▶️ Click en Enviar Automáticamente', 'color: #00ff00; font-size: 14px; font-weight: bold;');
    
    const client = clients.find(c => c.id === selectedClients[0])
    if (!client) {
        console.warn('⚠️ No se encontró el cliente seleccionado');
        showNotification('Error: No hay cliente seleccionado.', 'error');
        return;
    }
    
    console.log('👤 Cliente:', client.name, '📞 Tel:', client.phone);

    if (client && client.phone) {
      if (!generatedMessage) {
        console.warn('⚠️ No hay mensaje generado');
        showNotification('Primero genera un mensaje.', 'info');
        return;
      }

      const performSend = async () => {
          console.log('%c🔄 Ejecutando performSend', 'color: #00ffff; font-weight: bold;');
          const channelText = selectedChannel === 'both' ? 'WhatsApp y Email' : selectedChannel;
          
          console.log('📝 Solicitando confirmación al usuario...');
          requestConfirm({
            title: 'Enviar Mensaje',
            message: `¿Enviar mensaje a ${client.name} (${client.phone}) vía ${channelText}?`,
            confirmText: 'Enviar',
            onConfirm: async () => {
                console.log('%c🚀 Confirmación aceptada. Iniciando proceso de envío...', 'color: #ffff00; font-weight: bold;');
                try {
                  console.log(`📡 Enviando petición a ${API_URL}/messages/send`);
                  const payload = {
                      clientId: client.id,
                      clientPhone: client.phone,
                      clientEmail: client.email,
                      message: generatedMessage,
                      channels: selectedChannel,
                      propertyUrl: selectedProperties.length === 1 ? selectedProperties[0] : 'Multiple/General'
                  };
                  console.log('📦 Payload:', payload);

                  const response = await fetch(`${API_URL}/messages/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  });
    
                  const data = await response.json();
                  console.log('%c📩 Respuesta del servidor:', 'color: #00ff00;', data);
                  
                  if (data.success) {
                    showNotification('Mensaje enviado a la cola de automatización.', 'success');
                    loadClients(); // Recargar para actualizar historial
                  } else {
                    console.error('❌ Error devuelto por servidor:', data.error);
                    showNotification('Error al enviar mensaje: ' + (data.error || 'Desconocido'), 'error');
                  }
                } catch (error) {
                  console.error('❌ Error de red/fetch:', error);
                  showNotification('Error de conexión al enviar mensaje.', 'error');
                }
            }
          });
      };

      // Verificación de historial
      if (client.contactHistory && selectedProperties.length > 0) {
        const alreadySent = client.contactHistory.some(h => 
            selectedProperties.includes(h.propertyUrl) || h.propertyUrl === 'Multiple/General'
        );
        
        if (alreadySent) {
            requestConfirm({
                title: 'Advertencia de Duplicado',
                message: `Ya se ha enviado un mensaje a ${client.name} relacionado con estas propiedades anteriormente. ¿Deseas enviarlo de nuevo?`,
                confirmText: 'Continuar',
                isDanger: true,
                onConfirm: performSend
            });
            return;
        }
      }

      // Si no hay advertencia, proceder directamente a la confirmación de envío
      performSend();

    } else {
      showNotification('Cliente sin número de teléfono', 'error')
    }
  }

  const selectAllProperties = () => {
    const allFilteredUrls = filteredProperties.map(p => p.url);
    setSelectedProperties(allFilteredUrls);
  };

  const updateProperties = async () => {
    if (selectedProperties.length === 0) {
      showNotification('Selecciona al menos una propiedad para actualizar.', 'info');
      return;
    }

    setUpdatingProperties(true);
    setUpdateLog([`Iniciando actualización de ${selectedProperties.length} propiedades...`]);

    try {
      const response = await fetch(`${API_URL}/properties/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: selectedProperties }),
      });

      const data = await response.json();

      if (data.success) {
        setUpdateLog(prev => [...prev, `\n✅ Actualización completada! ${data.updatedCount} propiedades actualizadas.`]);
        await loadProperties(); // Recargar propiedades
        setSelectedProperties([]); // Limpiar selección
      } else {
        setUpdateLog(prev => [...prev, `\n❌ Error en la actualización: ${data.error || 'Error desconocido'}`]);
      }
    } catch (error) {
      setUpdateLog(prev => [...prev, `\n❌ Error ejecutando la actualización: ${error.message}`]);
    } finally {
      setUpdatingProperties(false);
    }
  };

  const viewHistory = (client) => {
    setViewingClientHistory(client);
    setHistoryModalOpen(true);
  };

  const closeHistory = () => {
    setHistoryModalOpen(false);
    setViewingClientHistory(null);
  };

  if (loading && properties.length === 0) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando datos...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <Home size={32} />
            <div>
              <h1>Inmobiliaria Denia</h1>
              <p className="subtitle">Panel de Gestión Completo</p>
            </div>
          </div>

          <div className="scraper-buttons">
            <button 
                onClick={() => setSupportModalOpen(true)} 
                className="config-btn" 
                title="Soporte Técnico"
                style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none' }}
            >
                <LifeBuoy size={20} />
                <span>Soporte</span>
            </button>

            <div className="notification-wrapper">
              <button 
                onClick={() => setShowNotificationPanel(!showNotificationPanel)} 
                className="config-btn" 
                title="Historial de Notificaciones"
                style={{ position: 'relative' }}
              >
                  <Bell size={20} />
                  {notificationHistory.length > 0 && (
                    <span className="notification-badge">{notificationHistory.length}</span>
                  )}
              </button>
              
              {showNotificationPanel && (
                <div className="notification-panel">
                  <div className="notification-header">
                    <h3>Notificaciones</h3>
                    <button onClick={clearNotificationHistory} className="clear-btn" title="Borrar todo">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="notification-list">
                    {notificationHistory.length === 0 ? (
                      <p className="no-notifications">No hay notificaciones</p>
                    ) : (
                      notificationHistory.map(notif => (
                        <div key={notif.id} className={`notification-item ${notif.type}`}>
                          <div className="notif-icon">
                            {notif.type === 'success' && <CheckCircle size={16} />}
                            {notif.type === 'error' && <AlertCircle size={16} />}
                            {notif.type === 'info' && <Info size={16} />}
                          </div>
                          <div className="notif-content">
                            <p>{notif.message}</p>
                            <span className="notif-time">
                              {new Date(notif.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button onClick={openConfigModal} className="config-btn" title="Configuración de Mensajería">
                <Settings size={20} />
                <span>Configuración</span>
            </button>
            <div className="fotocasa-group">
              <button
                onClick={() => setShowFotocasaOptions(!showFotocasaOptions)}
                className="scraper-btn fotocasa"
              >
                <ImageIcon size={18} />
                <span>Fotocasa</span>
              </button>
              {showFotocasaOptions && (
                <div className="fotocasa-options">
                  <button
                    onClick={() => runScraper('fotocasa', 'viviendas')}
                    disabled={scrapingInProgress.fotocasa_viviendas}
                    className="scraper-btn fotocasa"
                  >
                    {scrapingInProgress.fotocasa_viviendas ? (
                      <><RefreshCw size={18} className="spinning" /><span>Ejecutando...</span></>
                    ) : (
                      <><Home size={18} /><span>Viviendas</span></>
                    )}
                  </button>
                  <button
                    onClick={() => runScraper('fotocasa', 'locales')}
                    disabled={scrapingInProgress.fotocasa_locales}
                    className="scraper-btn fotocasa"
                  >
                    {scrapingInProgress.fotocasa_locales ? (
                      <><RefreshCw size={18} className="spinning" /><span>Ejecutando...</span></>
                    ) : (
                      <><Building2 size={18} /><span>Locales</span></>
                    )}
                  </button>
                  <button
                    onClick={() => runScraper('fotocasa', 'terrenos')}
                    disabled={scrapingInProgress.fotocasa_terrenos}
                    className="scraper-btn fotocasa"
                  >
                    {scrapingInProgress.fotocasa_terrenos ? (
                      <><RefreshCw size={18} className="spinning" /><span>Ejecutando...</span></>
                    ) : (
                      <><MapPin size={18} /><span>Terrenos</span></>
                    )}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => runScraper('idealista')}
              disabled={scrapingInProgress.idealista}
              className="scraper-btn idealista"
            >
              {scrapingInProgress.idealista ? (
                <>
                  <RefreshCw size={18} className="spinning" />
                  <span>Ejecutando...</span>
                </>
              ) : (
                <>
                  <Building2 size={18} />
                  <span>Idealista</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {scrapingLog && (
        <div className="scraping-log">
          <div className="log-header">
            <h4>Log de Ejecución</h4>
            <button onClick={() => setScrapingLog('')} className="close-log">✕</button>
          </div>
          <pre>{scrapingLog}</pre>
        </div>
      )}

      <div className="tabs">
        <button
          className={activeTab === 'properties' ? 'active' : ''}
          onClick={() => setActiveTab('properties')}
        >
          <Building2 size={20} />
          <span>Propiedades ({properties.length})</span>
        </button>
        <button
          className={activeTab === 'clients' ? 'active' : ''}
          onClick={() => setActiveTab('clients')}
        >
          <Users size={20} />
          <span>Clientes ({clients.length})</span>
        </button>
        <button
          className={activeTab === 'messages' ? 'active' : ''}
          onClick={() => setActiveTab('messages')}
        >
          <MessageSquare size={20} />
          <span>Mensajes</span>
        </button>
      </div>

      <main className="main-content">
        {activeTab === 'properties' && (
          <>
            <div className="controls">
              <div className="search-bar">
                <Search size={20} />
                <input
                  type="text"
                  placeholder="Buscar por título..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="clear-search">✕</button>
                )}
              </div>

              <div className="filters">
                <div className="filter-group">
                  <Filter size={20} />
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="all">Todos los tipos ({properties.length})</option>
                    <option value="viviendas">Viviendas ({properties.filter(p => p.property_type === 'viviendas').length})</option>
                    <option value="locales">Locales ({properties.filter(p => p.property_type === 'locales').length})</option>
                    <option value="terrenos">Terrenos ({properties.filter(p => p.property_type === 'terrenos').length})</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label>Ordenar:</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="date_desc">Más recientes</option>
                    <option value="date_asc">Más antiguos</option>
                    <option value="price_asc">Precio (menor a mayor)</option>
                    <option value="price_desc">Precio (mayor a menor)</option>
                  </select>
                </div>
                <button onClick={clearFilters} className="clear-filters-btn">
                  Limpiar Filtros
                </button>
              </div>
            </div>

            <div className="stats">
              <div className="stat-card">
                <Building2 size={24} />
                <div>
                  <h3>{filteredProperties.length}</h3>
                  <p>Encontradas</p>
                </div>
              </div>
              <div className="stat-card">
                <Home size={24} />
                <div>
                  <h3>{properties.filter(p => p.property_type === 'viviendas').length}</h3>
                  <p>Viviendas</p>
                </div>
              </div>
              <div className="stat-card">
                <Building2 size={24} />
                <div>
                  <h3>{properties.filter(p => p.property_type === 'locales').length}</h3>
                  <p>Locales</p>
                </div>
              </div>
              <div className="stat-card">
                <MapPin size={24} />
                <div>
                  <h3>{properties.filter(p => p.property_type === 'terrenos').length}</h3>
                  <p>Terrenos</p>
                </div>
              </div>
            </div>

            {filteredProperties.length > 0 && (
              <div className="selected-info">
                <p>{selectedProperties.length} propiedad(es) seleccionada(s) para mensajería</p>
                <div className="selection-buttons">
                  <button onClick={selectAllProperties} className="select-all-btn">
                    Seleccionar Todas
                  </button>
                  <button onClick={updateProperties} className="update-btn" disabled={updatingProperties || selectedProperties.length === 0}>
                    {updatingProperties ? 'Actualizando...' : 'Actualizar'}
                  </button>
                  {selectedProperties.length > 0 && (
                    <button onClick={() => setSelectedProperties([])} className="clear-selection">
                      Limpiar selección
                    </button>
                  )}
                </div>
                {updateLog.length > 0 && (
                  <div className="update-log">
                    <h4>Registro de Actualización</h4>
                    <pre>{updateLog.join('\n')}</pre>
                    <button onClick={() => setUpdateLog([])} className="clear-log">Limpiar Registro</button>
                  </div>
                )}
              </div>
            )}

            <div className="properties-grid">
              {filteredProperties.map((property) => (
                <div key={property.id} className="property-card">
                  <div className="property-image">
                    <img
                      src={property.imgurl !== 'None' ? property.imgurl : 'https://via.placeholder.com/400x300?text=Sin+imagen'}
                      alt={property.Title}
                      onError={(e) => e.target.src = 'https://via.placeholder.com/400x300?text=Sin+imagen'}
                    />
                    <div className={`property-source ${property.source?.toLowerCase() || 'fotocasa'}`}>{property.source || 'Fotocasa'}</div>

                    <div className="property-type">{property.property_type}</div>
                    <label className="property-checkbox-label">
                      <input
                        type="checkbox"
                        className="property-checkbox"
                        checked={selectedProperties.includes(property.url)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProperties([...selectedProperties, property.url])
                          } else {
                            setSelectedProperties(selectedProperties.filter(url => url !== property.url))
                          }
                        }}
                      />
                    </label>

                  </div>

                  <div className="property-content">
                    <h3>{property.Title}</h3>
                    {property.Description !== 'None' && (
                      <p className="description">{property.Description}</p>
                    )}

                    <div className="property-details">
                      <div className="detail price-detail">
                        <span className="price">{formatPrice(property.Price)}</span>
                      </div>

                      {property.hab !== 'None' && (
                        <div className="detail">
                          <Home size={16} />
                          <span>{property.hab}</span>
                        </div>
                      )}

                      {property.m2 !== 'None' && (
                        <div className="detail">
                          <Building2 size={16} />
                          <span>{property.m2}</span>
                        </div>
                      )}

                      {property.publicationDate && (
                        <div className="detail">
                          <Calendar size={16} />
                          <span>{property.Timeago}</span>
                        </div>
                      )}
                    </div>

                    {/* Municipio */}
                    {property.Municipality && (
                      <div className="property-location">
                        <MapPin size={16} />
                        <span>{property.Municipality}</span>
                      </div>
                    )}

                    {/* Anunciante */}
                    {property.Advertiser && (
                      <div className="property-advertiser">
                        <Users size={16} />
                        <span>{property.Advertiser}</span>
                      </div>
                    )}

                    {property.Phone !== 'None' && (
                      <div className="property-contact">
                        <Phone size={16} />
                        <a href={`tel:${property.Phone}`}>{property.Phone}</a>
                      </div>
                    )}

                    <a
                      href={property.url !== 'None' ? property.url : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-more"
                    >
                      Ver detalles
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {filteredProperties.length === 0 && (
              <div className="empty-state">
                <Search size={48} />
                <h3>No se encontraron propiedades</h3>
                <p>{properties.length === 0 ? 'Ejecuta un scraper para obtener propiedades' : 'Intenta cambiar los filtros de búsqueda'}</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'clients' && (
          <div className="clients-section">
            <div className="clients-header">
              <h2>Gestión de Clientes</h2>
              <form onSubmit={handleClientSubmit} className="client-form">
                <input
                  type="text"
                  placeholder="Nombre *"
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  required
                />
                <input
                  type="tel"
                  placeholder="Teléfono *"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                />
                <select
                  value={newClient.interest}
                  onChange={(e) => setNewClient({ ...newClient, interest: e.target.value })}
                  className="interest-select"
                >
                  <option value="Comprar">Comprar</option>
                  <option value="Vender">Vender</option>
                  <option value="Alquilar">Alquilar</option>
                  <option value="Hipotecar">Hipotecar</option>
                </select>
                <input
                  type="text"
                  placeholder="Características / Preferencias"
                  value={newClient.preferences}
                  onChange={(e) => setNewClient({ ...newClient, preferences: e.target.value })}
                />
                <div className="form-actions">
                  <button type="submit" className={editingId ? 'update-btn' : 'add-btn'}>
                    {editingId ? <RefreshCw size={20} /> : <Plus size={20} />}
                    {editingId ? 'Actualizar' : 'Añadir'}
                  </button>
                  {editingId && (
                    <button type="button" onClick={cancelEditing} className="cancel-btn">
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="controls" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <div className="search-bar">
                <Search size={20} />
                <input 
                  type="text" 
                  placeholder="Buscar clientes (nombre, tel, email)..." 
                  value={clientFilters.search}
                  onChange={(e) => setClientFilters(prev => ({ ...prev, search: e.target.value }))}
                />
                 {clientFilters.search && (
                  <button onClick={() => setClientFilters(prev => ({ ...prev, search: '' }))} className="clear-search">✕</button>
                )}
              </div>
              <div className="filters">
                <div className="filter-group">
                   <Filter size={20} />
                   <select 
                      value={clientFilters.interest} 
                      onChange={(e) => setClientFilters(prev => ({ ...prev, interest: e.target.value }))}
                   >
                     <option value="all">Todos los intereses</option>
                     <option value="Comprar">Comprar</option>
                     <option value="Vender">Vender</option>
                     <option value="Alquilar">Alquilar</option>
                     <option value="Hipotecar">Hipotecar</option>
                   </select>
                </div>
              </div>
            </div>

            <div className="clients-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedClients.length === filteredClients.length && filteredClients.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedClients(filteredClients.map(c => c.id))
                          } else {
                            setSelectedClients([])
                          }
                        }}
                      />
                    </th>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Email</th>
                    <th>Interés</th>
                    <th>Características</th>
                    <th style={{ width: '80px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                        {clients.length === 0 ? 'No hay clientes. Añade uno usando el formulario de arriba.' : 'No se encontraron clientes con los filtros seleccionados.'}
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map(client => (
                      <tr key={client.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedClients.includes(client.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedClients([...selectedClients, client.id])
                              } else {
                                setSelectedClients(selectedClients.filter(id => id !== client.id))
                              }
                            }}
                          />
                        </td>
                        <td>{client.name}</td>
                        <td>{client.phone}</td>
                        <td>{client.email || '-'}</td>
                        <td><span className={`badge ${client.interest?.toLowerCase()}`}>{client.interest || 'Comprar'}</span></td>
                        <td>{client.preferences || '-'}</td>
                        <td>
                          <div className="action-buttons">
                            <button onClick={() => viewHistory(client)} className="edit-btn" title="Ver Historial" style={{ background: '#8b5cf6' }}>
                              <History size={16} />
                            </button>
                            <button onClick={() => startEditing(client)} className="edit-btn" title="Editar">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => deleteClient(client.id)} className="delete-btn" title="Eliminar">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="messages-section">
            <h2>Generador de Mensajes Personalizados con IA</h2>

            <div className="message-config">
              <div className="config-panel">
                <h3>1. Selecciona Propiedades</h3>
                <p className={selectedProperties.length > 0 ? 'selected' : ''}>{selectedProperties.length} propiedad(es) seleccionada(s)</p>
                <small>Ve a "Propiedades" y marca las propiedades relevantes</small>
              </div>

              <div className="config-panel">
                <h3>2. Selecciona Clientes</h3>
                <p className={selectedClients.length > 0 ? 'selected' : ''}>{selectedClients.length} cliente(s) seleccionado(s)</p>
                <small>Ve a la pestaña "Clientes" para seleccionar destinatarios</small>
              </div>

              <div className="config-panel">
                <h3>3. Selecciona Modelo IA</h3>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="model-selector"
                >
                  <option value="openai/gpt-oss-20b:free">GPT-4o Mini (Gratis)</option>
                  <option value="openai/gpt-oss-120b:free">GPT-4o (Gratis)</option>
                  <option value="tngtech/deepseek-r1t-chimera:free">DeepSeek R1 (Gratis)</option>
                </select>
                <small>Elige el cerebro de la IA</small>
              </div>

              <div className="config-panel">
                <h3>4. Canal de Envío</h3>
                <select 
                   value={selectedChannel} 
                   onChange={(e) => setSelectedChannel(e.target.value)}
                   className="channel-selector"
                >
                   <option value="whatsapp">WhatsApp</option>
                   <option value="email">Email</option>
                   <option value="both">WhatsApp + Email</option>
                </select>
                <small>Elige por dónde enviar el mensaje</small>
              </div>

              <button
                onClick={generateMessage}
                className="generate-btn"
                disabled={selectedClients.length === 0 || selectedProperties.length === 0 || generatingMessage}
              >
                {generatingMessage ? (
                  <>
                    <RefreshCw size={20} className="spinning" />
                    Generando con IA...
                  </>
                ) : (
                  <>
                    <MessageSquare size={20} />
                    Generar Mensaje con IA
                  </>
                )}
              </button>
            </div>

            {generatedMessage && (
              <div className="generated-message">
                <h3>Mensaje Generado:</h3>
                <textarea
                  value={generatedMessage}
                  onChange={(e) => setGeneratedMessage(e.target.value)}
                  rows={18}
                />
                
                <div className="message-actions">
                  <button onClick={copyToClipboard} className="copy-btn">
                    📋 Copiar Mensaje
                  </button>
                  <button onClick={sendMessage} className="send-btn">
                    <Send size={16} />
                    Enviar Automáticamente
                  </button>
                </div>
                <small className="tip">💡 El mensaje se enviará directamente desde tu PC (WhatsApp Web local / Email).</small>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal de Configuración */}
      {configModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content config-modal">
            <h3>Configuración de Mensajería Local</h3>
            
            <div className="config-section">
                <h4><Phone size={20} /> WhatsApp Web Local</h4>
                <div className="whatsapp-status">
                    <p>Estado: 
                        <span className={`status-badge ${configStatus.whatsapp.ready ? 'success' : 'warning'}`}>
                            {configStatus.whatsapp.ready ? 'Conectado ✅' : 'Desconectado ❌'}
                        </span>
                    </p>
                    
                    {!configStatus.whatsapp.ready && configStatus.whatsapp.qr ? (
                        <div className="qr-container">
                            <p>Escanea este código QR con WhatsApp en tu móvil:</p>
                            <img src={configStatus.whatsapp.qr} alt="WhatsApp QR Code" className="qr-image" />
                        </div>
                    ) : !configStatus.whatsapp.ready ? (
                        <p>Cargando código QR...</p>
                    ) : (
                        <div className="connected-actions">
                            <p>WhatsApp está listo para enviar mensajes.</p>
                            <button onClick={handleWhatsAppLogout} className="logout-btn">
                                Cerrar Sesión WhatsApp
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="config-section">
                <h4><MessageSquare size={20} /> Configuración Email (Gmail)</h4>
                <p className="config-info">
                    Usa tu cuenta de Gmail. Si tienes activada la verificación en 2 pasos, necesitas crear una "Contraseña de Aplicación".
                </p>
                <form onSubmit={handleEmailSave} className="email-config-form">
                    <div className="form-group">
                        <label>Gmail:</label>
                        <input 
                            type="email" 
                            value={emailForm.email} 
                            onChange={e => setEmailForm({...emailForm, email: e.target.value})}
                            placeholder="tu_email@gmail.com"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Contraseña de Aplicación:</label>
                        <input 
                            type="password" 
                            value={emailForm.password} 
                            onChange={e => setEmailForm({...emailForm, password: e.target.value})}
                            placeholder="xxxx xxxx xxxx xxxx"
                            required
                        />
                    </div>
                    <button type="submit" className="save-btn" disabled={savingEmail}>
                        {savingEmail ? 'Guardando...' : 'Guardar Credenciales'}
                    </button>
                </form>
                {configStatus.email.configured && (
                    <p className="success-text">✅ Email configurado correctamente ({configStatus.email.user})</p>
                )}
            </div>

            <div className="modal-actions">
              <button onClick={() => setConfigModalOpen(false)} className="modal-btn confirm">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {historyModalOpen && viewingClientHistory && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h3>Historial de Contacto: {viewingClientHistory.name}</h3>
            
            {!viewingClientHistory.contactHistory || viewingClientHistory.contactHistory.length === 0 ? (
              <p>No hay mensajes enviados a este cliente.</p>
            ) : (
              <div className="history-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {viewingClientHistory.contactHistory.slice().reverse().map((record, index) => (
                  <div key={index} className="history-item" style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(record.date).toLocaleString()}
                      </span>
                      <span className={`history-badge sent`}>
                        {record.channel === 'both' ? 'WhatsApp + Email' : (record.channel || 'WhatsApp')}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', whiteSpace: 'pre-wrap' }}>{record.message}</p>
                    {record.propertyUrl && record.propertyUrl !== 'Multiple/General' && (
                      <a href={record.propertyUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <ExternalLink size={14} /> Ver Propiedad
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button onClick={closeHistory} className="modal-btn confirm">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Soporte Técnico */}
      {supportModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content support-modal">
            <h3>Soporte Técnico</h3>
            <p className="support-description">
                Envía un mensaje al desarrollador (viicttoriius@gmail.com) para sugerencias, errores o dudas.
            </p>
            <form onSubmit={handleSendSupport} className="config-form support-form">
                <div className="form-group">
                    <label>Asunto:</label>
                    <input 
                        type="text" 
                        value={supportForm.subject}
                        onChange={e => setSupportForm({...supportForm, subject: e.target.value})}
                        placeholder="Ej: Sugerencia, Error, Duda..."
                        className="support-input"
                    />
                </div>
                <div className="form-group">
                    <label>Mensaje (*):</label>
                    <textarea 
                        value={supportForm.message}
                        onChange={e => setSupportForm({...supportForm, message: e.target.value})}
                        placeholder="Describe tu consulta o problema..."
                        rows="5"
                        required
                        className="support-textarea"
                    />
                </div>
                <div className="modal-actions">
                    <button type="button" onClick={() => setSupportModalOpen(false)} className="modal-btn cancel">
                        Cancelar
                    </button>
                    <button type="submit" className="modal-btn confirm" disabled={sendingSupport}>
                        {sendingSupport ? 'Enviando...' : 'Enviar Mensaje'}
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* Sistema de Notificaciones */}
      <div className="notification-container">
        {notifications.map(notification => (
          <div key={notification.id} className={`notification-toast ${notification.type}`}>
            <div className="notification-icon">
              {notification.type === 'success' && <CheckCircle size={20} />}
              {notification.type === 'error' && <AlertCircle size={20} />}
              {notification.type === 'info' && <Info size={20} />}
              {notification.type === 'warning' && <AlertCircle size={20} />}
            </div>
            <div className="notification-content">
              {notification.message}
            </div>
            <button onClick={() => removeNotification(notification.id)} className="notification-close">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Modal de Confirmación */}
      {confirmModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>{confirmModal.title}</h3>
            <p>{confirmModal.message}</p>
            <div className="modal-actions">
              <button onClick={closeConfirmModal} className="modal-btn cancel">
                {confirmModal.cancelText}
              </button>
              <button 
                onClick={confirmModal.onConfirm} 
                className={`modal-btn ${confirmModal.isDanger ? 'danger' : 'confirm'}`}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  )
}

export default App
