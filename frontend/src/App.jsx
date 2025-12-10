import { useState, useEffect, useRef, useCallback } from 'react'
import { Home, Building2, MapPin, Calendar, Phone, ExternalLink, Search, Filter, Play, Users, MessageSquare, Plus, Trash2, Send, RefreshCw, Image as ImageIcon, Pencil, History, Settings, AlertCircle, CheckCircle, Info, X, Bell, LifeBuoy, Upload, Mail } from 'lucide-react'
import Papa from 'papaparse';
import UpdateNotification from './components/UpdateNotification';
import './App.css'

const API_URL = 'http://localhost:3001/api';
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

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

  // Refs para detección de cambios (nuevos clientes/propiedades)
  const prevClientsRef = useRef(null);
  const prevPropertiesRef = useRef(null);
  const audioRef = useRef(new Audio(NOTIFICATION_SOUND_URL));

  // Estados para Modal de Configuración
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configStatus, setConfigStatus] = useState({ whatsapp: { ready: false, qr: null }, email: { configured: false, user: '' } });
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });
  const [savingEmail, setSavingEmail] = useState(false);
  const [scraperConfig, setScraperConfig] = useState({ fotocasa: { enabled: false, interval: "60" } });
  const [savingScraperConfig, setSavingScraperConfig] = useState(false);
  const [pythonPathInput, setPythonPathInput] = useState('');
  const [savingPythonPath, setSavingPythonPath] = useState(false);

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
    onConfirm: () => { }
  });

  // Column Resizing Logic
  const [columnWidths, setColumnWidths] = useState({
    name: 150,
    phone: 120,
    email: 200,
    contactName: 150,
    location: 150,
    propertyType: 120,
    adLink: 100,
    whatsappLink: 100,
    answered: 100,
    response: 200,
    date: 120,
    appointmentDate: 150,
    actions: 120
  });

  const resizingRef = useRef({ column: null, startX: 0, startWidth: 0 });

  const handleMouseMove = useCallback((e) => {
    if (!resizingRef.current.column) return;
    const { column, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX;
    setColumnWidths(prev => ({
      ...prev,
      [column]: Math.max(50, startWidth + diff)
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    resizingRef.current.column = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
  }, [handleMouseMove]);

  const startResizing = (e, column) => {
    e.preventDefault();
    resizingRef.current = {
      column,
      startX: e.clientX,
      startWidth: columnWidths[column] || 100
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const showNotification = (message, type = 'info') => {
    const id = Date.now();
    const newNotification = { id, message, type, timestamp: new Date().toISOString() };

    // Reproducir sonido
    try {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log("Audio play failed (interaction needed first):", e));
    } catch (e) {
      console.error("Error playing notification sound:", e);
    }

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



  const [newClient, setNewClient] = useState({
    name: '',
    phone: '',
    email: '',
    interest: 'Comprar',
    preferences: '',
    contactName: '',
    location: '',
    adLink: '',
    status: 'Enviado',
    propertyType: '',
    answered: '',
    response: '',
    date: '',
    appointmentDate: ''
  })
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
  const [showClientForm, setShowClientForm] = useState(false);

  // Filtros de Clientes
  const [clientFilters, setClientFilters] = useState({
    search: '',
    status: 'all',
    propertyType: 'all',
    answered: 'all',
    location: '',
    date: '',
    appointmentDate: '',
    phone: '',
    email: '',
    adLink: ''
  });
  const [filteredClients, setFilteredClients] = useState([]);

  useEffect(() => {
    loadProperties()
    loadClients()

    // Polling automático cada 10 segundos para actualizar datos y notificar
    const interval = setInterval(() => {
      loadProperties(true);
      loadClients(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [])

  useEffect(() => {
    filterAndSortProperties()
  }, [properties, searchTerm, filterType, sortBy])

  // Polling para actualizar el estado del QR cuando el modal está abierto
  useEffect(() => {
    let interval;
    if (configModalOpen && !configStatus.whatsapp.ready) {
      // Hacer una carga inicial
      loadConfigStatus();

      // Y luego polling cada 3 segundos
      interval = setInterval(() => {
        loadConfigStatus();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [configModalOpen, configStatus.whatsapp.ready]);

  // Efecto para filtrar clientes
  useEffect(() => {
    let result = [...clients];

    // Helper para normalizar fechas del CSV (DD/MM/YY o D/M/YY) a YYYY-MM-DD
    const normalizeDate = (dateStr) => {
      if (!dateStr) return '';
      // Quitar hora si existe (para fecha cita)
      const datePart = dateStr.split(' ')[0];
      const parts = datePart.trim().split('/');
      if (parts.length === 3) {
        let [d, m, y] = parts;
        if (d.length === 1) d = '0' + d;
        if (m.length === 1) m = '0' + m;
        if (y.length === 2) y = '20' + y;
        return `${y}-${m}-${d}`;
      }
      return '';
    };

    if (clientFilters.search) {
      const search = clientFilters.search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(search) ||
        c.phone.includes(search) ||
        (c.email && c.email.toLowerCase().includes(search)) ||
        (c.contactName && c.contactName.toLowerCase().includes(search)) ||
        (c.response && c.response.toLowerCase().includes(search))
      );
    }

    if (clientFilters.status !== 'all') {
      result = result.filter(c => c.status === clientFilters.status);
    }

    if (clientFilters.propertyType !== 'all') {
      const type = clientFilters.propertyType;
      if (type === 'Viviendas') {
        result = result.filter(c => {
          const pType = (c.propertyType || '').trim();
          return ['Casa', 'Piso', 'Viviendas', 'Chalet', 'Finca rústica', 'Finca rustica'].includes(pType);
        });
      } else {
        result = result.filter(c => (c.propertyType || '').trim() === type);
      }
    }

    if (clientFilters.answered !== 'all') {
      result = result.filter(c => c.answered === clientFilters.answered);
    }

    if (clientFilters.location) {
      const loc = clientFilters.location.toLowerCase();
      result = result.filter(c => c.location && c.location.toLowerCase().includes(loc));
    }

    if (clientFilters.date) {
      result = result.filter(c => normalizeDate(c.date) === clientFilters.date);
    }

    if (clientFilters.appointmentDate) {
      result = result.filter(c => normalizeDate(c.appointmentDate) === clientFilters.appointmentDate);
    }

    if (clientFilters.phone) {
      result = result.filter(c => c.phone && c.phone.includes(clientFilters.phone));
    }

    if (clientFilters.email) {
      const emailFilter = clientFilters.email.toLowerCase();
      result = result.filter(c => c.email && c.email.toLowerCase().includes(emailFilter));
    }

    if (clientFilters.adLink) {
      const linkFilter = clientFilters.adLink.toLowerCase();
      result = result.filter(c => c.adLink && c.adLink.toLowerCase().includes(linkFilter));
    }

    setFilteredClients(result);
  }, [clients, clientFilters]);

  const loadProperties = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await fetch(`${API_URL}/properties?t=${new Date().getTime()}`)
      const data = await response.json()

      // Detección de nuevas propiedades
      if (prevPropertiesRef.current) {
        const oldIds = new Set(prevPropertiesRef.current.map(p => p.id));
        const newItems = data.filter(p => !oldIds.has(p.id));
        if (newItems.length > 0) {
          showNotification(`¡${newItems.length} nueva(s) propiedad(es) detectada(s)!`, 'success');
        }
      }
      prevPropertiesRef.current = data;

      setProperties(data)
    } catch (error) {
      console.error('Error cargando propiedades:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const loadClients = async (silent = false) => {
    try {
      const response = await fetch(`${API_URL}/clients?t=${new Date().getTime()}`)
      const data = await response.json()

      // Detección de nuevos clientes
      if (prevClientsRef.current) {
        const oldIds = new Set(prevClientsRef.current.map(c => c.id));
        const newItems = data.filter(c => !oldIds.has(c.id));
        if (newItems.length > 0) {
          showNotification(`¡${newItems.length} nuevo(s) cliente(s) detectado(s)!`, 'success');
        }
      }
      prevClientsRef.current = data;

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
      if (data.python && data.python.path) {
        setPythonPathInput(data.python.path);
      }

      // Load scraper config
      const scraperResponse = await fetch(`${API_URL}/config/scraper`);
      if (scraperResponse.ok) {
        const scraperData = await scraperResponse.json();
        setScraperConfig(scraperData);
      }
    } catch (error) {
      console.error('Error cargando estado de configuración:', error);
    }
  };

  const handleScraperConfigSave = async () => {
    setSavingScraperConfig(true);
    try {
      const response = await fetch(`${API_URL}/config/scraper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scraperConfig)
      });
      const data = await response.json();
      if (data.success) {
        showNotification('Configuración de scraper guardada.', 'success');
      } else {
        showNotification('Error guardando configuración.', 'error');
      }
    } catch (error) {
      showNotification('Error de conexión.', 'error');
    } finally {
      setSavingScraperConfig(false);
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

  const handlePythonPathSave = async (e) => {
    e.preventDefault();
    setSavingPythonPath(true);
    try {
      const response = await fetch(`${API_URL}/config/python`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pythonPath: pythonPathInput })
      });
      const data = await response.json();
      if (data.success) {
        showNotification('Ruta de Python guardada correctamente.', 'success');
        loadConfigStatus();
      } else {
        showNotification('Error guardando ruta: ' + data.error, 'error');
      }
    } catch (error) {
      showNotification('Error de conexión.', 'error');
    } finally {
      setSavingPythonPath(false);
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
      // Usar un timeout en el fetch para evitar esperas infinitas si el backend tarda, pero dando margen suficiente (5 min)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutos

      const response = await fetch(`${API_URL}/scraper/${scraperName}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: propertyType }),
        signal: controller.signal
      })

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Error del servidor: ${response.status} ${response.statusText}`);
      }

      if (data.success) {
        setScrapingLog(prev => prev + `\n✅ Scraper de ${scraperName}${propertyType ? ` (${propertyType})` : ''} completado!\n` + (data.output || ''))
        await loadProperties()
      } else {
        setScrapingLog(prev => prev + `\n❌ Error en ${scraperName}${propertyType ? ` (${propertyType})` : ''}: ` + (data.error || 'Error desconocido'))
      }
    } catch (error) {
      let errorMsg = error.message;
      if (error.name === 'AbortError') {
        errorMsg = 'Tiempo de espera agotado (Timeout)';
      } else if (errorMsg === 'Failed to fetch') {
        errorMsg = 'No se pudo conectar con el servidor. Verifica que el backend esté corriendo.';
      }
      setScrapingLog(prev => prev + `\n❌ Error ejecutando scraper de ${scraperName}${propertyType ? ` (${propertyType})` : ''}: ` + errorMsg)
    } finally {
      setScrapingInProgress(prev => ({ ...prev, [stateKey]: false }))
    }
  }

  const handleCleanup = async () => {
    requestConfirm({
      title: 'Limpiar Archivos Temporales',
      message: '¿Estás seguro de que deseas eliminar los archivos temporales de actualización y propiedades? Esta acción no se puede deshacer.',
      isDanger: true,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_URL}/config/cleanup`, { method: 'POST' });
          const data = await response.json();

          if (data.success) {
            showNotification(data.message, 'success');
          } else {
            showNotification('Error: ' + data.error, 'error');
          }
        } catch (error) {
          console.error('Error cleanup:', error);
          showNotification('Error de conexión al limpiar archivos.', 'error');
        }
      }
    });
  };

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
      setNewClient({
        name: '', phone: '', email: '', interest: 'Comprar', preferences: '',
        contactName: '', location: '', adLink: '',
        status: 'Enviado',
        propertyType: '', answered: '', response: '', date: '', appointmentDate: ''
      })
      setShowClientForm(false)
    } catch (error) {
      console.error('Error guardando cliente:', error)
      showNotification('Error guardando cliente', 'error')
    }
  }

  const startEditing = (client) => {
    setNewClient(client)
    setEditingId(client.id)
    setShowClientForm(true)
  }

  const cancelEditing = () => {
    setNewClient({
      name: '', phone: '', email: '', interest: 'Comprar', preferences: '',
      contactName: '', location: '', adLink: '',
      status: 'Enviado',
      propertyType: '', answered: '', response: '', date: '', appointmentDate: ''
    })
    setEditingId(null)
    setShowClientForm(false)
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

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const importedClients = results.data.map(row => {
          const phone = (row['Teléfono'] || row['telefono'] || '').replace(/\s+/g, '');
          const whatsappLink = row['Click para contactar'] || row['Link Wtp'] || row['Link WTP'] || (phone ? `https://web.whatsapp.com/send?phone=34${phone}` : '');

          return {
            name: row['Nombre'] || row['Nombre del cliente'] || '',
            phone: phone,
            contactName: row['Contacto'] || '',
            location: row['UBICACION '] || row['UBICACION'] || row['Ubicacion'] || '',
            adLink: row['Enlace del anuncio'] || '',
            status: row['Estado'] || 'Enviado',
            propertyType: (row['Tipo de Inmueble '] || row['Tipo de Inmueble'] || '').trim(),
            whatsappLink: whatsappLink,
            answered: row['Contestado '] || row['Contestado'] || '',
            response: row['Respuesta'] || '',
            date: row['Fecha'] || '',
            appointmentDate: row['Fecha de Cita'] || '',
            email: '', // CSV doesn't seem to have email
            interest: 'Comprar', // Default
            preferences: ''
          };
        }).filter(c => c.name || c.phone); // Filter empty rows

        if (importedClients.length === 0) {
          showNotification('No se encontraron clientes válidos en el archivo.', 'warning');
          return;
        }

        try {
          const response = await fetch(`${API_URL}/clients/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(importedClients)
          });
          const data = await response.json();
          if (data.success) {
            showNotification(data.message || `Importados ${data.count} clientes correctamente.`, 'success');
            loadClients();
          } else {
            showNotification('Error al importar clientes.', 'error');
          }
        } catch (error) {
          console.error('Error importing clients:', error);
          showNotification('Error de conexión al importar.', 'error');
        }
      },
      error: (error) => {
        console.error('CSV Error:', error);
        showNotification('Error al leer el archivo CSV.', 'error');
      }
    });
  };

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

        // Notificar si hay nuevos clientes
        if (data.newClientsCount && data.newClientsCount > 0) {
          showNotification(`🎉 Se han añadido ${data.newClientsCount} nuevos clientes!`, 'success');
        }

        await loadProperties(); // Recargar propiedades
        await loadClients(); // Recargar clientes (nuevos clientes pueden haber sido creados)
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
            <div className="clients-header-unified" style={{ marginBottom: '2rem' }}>
              <div className="controls-unified" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--surface)', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px var(--shadow)' }}>
                <div className="controls-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h2 style={{ margin: 0 }}>Gestión de Clientes</h2>
                  <div className="action-buttons-top" style={{ display: 'flex', gap: '0.5rem' }}>
                    <label className="import-btn" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', background: '#22c55e', color: 'white', borderRadius: '0.5rem', fontSize: '0.9rem', fontWeight: '500', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', transition: 'all 0.2s', height: '40px', boxSizing: 'border-box' }}>
                      <Upload size={18} />
                      <span className="btn-text">Importar</span>
                      <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                    <button
                      onClick={() => {
                        if (showClientForm) cancelEditing();
                        else setShowClientForm(true);
                      }}
                      className={showClientForm ? 'cancel-btn' : 'add-btn'}
                      style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', background: showClientForm ? 'var(--danger)' : 'var(--primary)', color: 'white', fontWeight: '500', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', transition: 'all 0.2s', height: '40px', boxSizing: 'border-box' }}
                    >
                      {showClientForm ? <X size={18} /> : <Plus size={18} />}
                      {showClientForm ? 'Cerrar Formulario' : 'Añadir Cliente'}
                    </button>
                  </div>
                </div>

                {showClientForm && (
                  <div className="client-form-container" style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <form id="client-form" onSubmit={handleClientSubmit} className="client-form">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', width: '100%' }}>
                        <input type="text" placeholder="Nombre *" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} required />
                        <input type="tel" placeholder="Teléfono *" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} required />
                        <input type="email" placeholder="Email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                        <input type="text" placeholder="Nombre Contacto" value={newClient.contactName} onChange={(e) => setNewClient({ ...newClient, contactName: e.target.value })} />
                        <input type="text" placeholder="Ubicación" value={newClient.location} onChange={(e) => setNewClient({ ...newClient, location: e.target.value })} />
                        <input type="text" placeholder="Enlace Anuncio" value={newClient.adLink} onChange={(e) => setNewClient({ ...newClient, adLink: e.target.value })} />
                        <input type="text" placeholder="Tipo Inmueble" value={newClient.propertyType} onChange={(e) => setNewClient({ ...newClient, propertyType: e.target.value })} />
                        <select value={newClient.answered} onChange={(e) => setNewClient({ ...newClient, answered: e.target.value })} style={{ background: 'var(--background)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem' }}>
                          <option value="">-- Contestado --</option>
                          <option value="Si">Si</option>
                          <option value="No">No</option>
                        </select>
                        <input type="date" placeholder="Fecha" value={newClient.date} onChange={(e) => setNewClient({ ...newClient, date: e.target.value })} />
                        <input type="datetime-local" placeholder="Fecha Cita" value={newClient.appointmentDate} onChange={(e) => setNewClient({ ...newClient, appointmentDate: e.target.value })} />
                        <input type="text" placeholder="Respuesta" value={newClient.response} onChange={(e) => setNewClient({ ...newClient, response: e.target.value })} style={{ gridColumn: 'span 2' }} />
                      </div>
                      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                        <button type="button" onClick={cancelEditing} className="cancel-btn" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}>Cancelar</button>
                        <button type="submit" className="save-btn" style={{ background: 'var(--secondary)', color: 'white', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer' }}>
                          {editingId ? 'Actualizar Cliente' : 'Guardar Cliente'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="filters-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--background)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                  {/* Search Bar Row - Full Width */}
                  <div className="search-bar" style={{ width: '100%', marginBottom: 0, height: '42px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', padding: '0 1rem', display: 'flex', alignItems: 'center' }}>
                    <Search size={20} style={{ color: 'var(--text-secondary)' }} />
                    <input
                      type="text"
                      placeholder="Buscar clientes (Nombre, Teléfono, Email...)"
                      value={clientFilters.search}
                      onChange={(e) => setClientFilters(prev => ({ ...prev, search: e.target.value }))}
                      style={{ height: '100%', border: 'none', background: 'transparent', width: '100%', marginLeft: '0.5rem', outline: 'none', color: 'var(--text)', fontSize: '1rem' }}
                    />
                    {clientFilters.search && (
                      <button onClick={() => setClientFilters(prev => ({ ...prev, search: '' }))} className="clear-search">✕</button>
                    )}
                  </div>

                  {/* Filters Row */}
                  <div className="filters-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="filter-group" style={{ marginBottom: 0 }}>
                      <CheckCircle size={18} style={{ color: 'var(--text-secondary)' }} />
                      <select value={clientFilters.answered} onChange={(e) => setClientFilters(prev => ({ ...prev, answered: e.target.value }))} style={{ padding: '0.5rem 2rem 0.5rem 0.5rem', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', cursor: 'pointer', fontWeight: '500' }}>
                        <option value="all">Estado</option>
                        <option value="Si">Si</option>
                        <option value="Pendiente">Pendiente</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    <div className="filter-group" style={{ marginBottom: 0 }}>
                      <Home size={18} style={{ color: 'var(--text-secondary)' }} />
                      <select value={clientFilters.propertyType} onChange={(e) => setClientFilters(prev => ({ ...prev, propertyType: e.target.value }))} style={{ padding: '0.5rem 2rem 0.5rem 0.5rem', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', cursor: 'pointer', fontWeight: '500' }}>
                        <option value="all">Tipo</option>
                        <option value="Viviendas">Viviendas</option>
                        <option value="Casa">Casa</option>
                        <option value="Piso">Piso</option>
                        <option value="Chalet">Chalet</option>
                        <option value="Finca rústica">Finca rústica</option>
                        <option value="Local">Local</option>
                        <option value="Terreno">Terreno</option>
                      </select>
                    </div>

                    <div className="filter-group" style={{ marginBottom: 0 }}>
                      <MapPin size={18} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        placeholder="Ubicación"
                        value={clientFilters.location}
                        onChange={(e) => setClientFilters(prev => ({ ...prev, location: e.target.value }))}
                        style={{ padding: '0.5rem', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', width: '120px' }}
                      />
                    </div>

                    <div className="filter-group" style={{ marginBottom: 0 }}>
                      <Calendar size={18} style={{ color: 'var(--text)' }} />
                      <span style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 500 }}>Fecha:</span>
                      <input
                        type="date"
                        value={clientFilters.date}
                        onChange={(e) => setClientFilters(prev => ({ ...prev, date: e.target.value }))}
                        style={{ padding: '0.5rem', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', width: 'auto', fontFamily: 'inherit', cursor: 'pointer' }}
                      />
                    </div>

                    <div className="filter-group" style={{ marginBottom: 0 }}>
                      <History size={18} style={{ color: 'var(--text)' }} />
                      <span style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 500 }}>Cita:</span>
                      <input
                        type="date"
                        value={clientFilters.appointmentDate}
                        onChange={(e) => setClientFilters(prev => ({ ...prev, appointmentDate: e.target.value }))}
                        style={{ padding: '0.5rem', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', width: 'auto', fontFamily: 'inherit', cursor: 'pointer' }}
                      />
                    </div>

                    <div className="filter-group" style={{ marginBottom: 0 }}>
                      <Phone size={18} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        placeholder="Teléfono"
                        value={clientFilters.phone}
                        onChange={(e) => setClientFilters(prev => ({ ...prev, phone: e.target.value }))}
                        style={{ padding: '0.5rem', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', width: '120px' }}
                      />
                    </div>

                    <div className="filter-group" style={{ marginBottom: 0 }}>
                      <Mail size={18} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        placeholder="Email"
                        value={clientFilters.email}
                        onChange={(e) => setClientFilters(prev => ({ ...prev, email: e.target.value }))}
                        style={{ padding: '0.5rem', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', width: '150px' }}
                      />
                    </div>

                    <div className="filter-group" style={{ marginBottom: 0 }}>
                      <ExternalLink size={18} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        placeholder="Enlace Anuncio"
                        value={clientFilters.adLink}
                        onChange={(e) => setClientFilters(prev => ({ ...prev, adLink: e.target.value }))}
                        style={{ padding: '0.5rem', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', width: '150px' }}
                      />
                    </div>

                    <button
                      onClick={() => setClientFilters({ search: '', status: 'all', propertyType: 'all', answered: 'all', location: '', date: '', appointmentDate: '', phone: '', email: '', adLink: '' })}
                      style={{ marginLeft: 'auto', padding: '0.5rem 1rem', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}
                      title="Limpiar filtros"
                    >
                      <X size={16} />
                      <span>Limpiar</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="clients-table-wrapper">
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
                      <th style={{ width: columnWidths.name }}>
                        Nombre
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'name')} />
                      </th>
                      <th style={{ width: columnWidths.phone }}>
                        Teléfono
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'phone')} />
                      </th>
                      <th style={{ width: columnWidths.email }}>
                        Email
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'email')} />
                      </th>
                      <th style={{ width: columnWidths.contactName }}>
                        Contacto
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'contactName')} />
                      </th>
                      <th style={{ width: columnWidths.location }}>
                        Ubicación
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'location')} />
                      </th>
                      <th style={{ width: columnWidths.propertyType }}>
                        Tipo
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'propertyType')} />
                      </th>
                      <th style={{ width: columnWidths.adLink }}>
                        Anuncio
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'adLink')} />
                      </th>
                      <th style={{ width: columnWidths.whatsappLink }}>
                        WhatsApp
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'whatsappLink')} />
                      </th>
                      <th style={{ width: columnWidths.answered }}>
                        Estado
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'answered')} />
                      </th>
                      <th style={{ width: columnWidths.response }}>
                        Respuesta
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'response')} />
                      </th>
                      <th style={{ width: columnWidths.date }}>
                        Fecha
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'date')} />
                      </th>
                      <th style={{ width: columnWidths.appointmentDate }}>
                        Cita
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'appointmentDate')} />
                      </th>
                      <th style={{ width: columnWidths.actions }}>
                        Acciones
                        <div className="resizer" onMouseDown={(e) => startResizing(e, 'actions')} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.length === 0 ? (
                      <tr>
                        <td colSpan="13" style={{ textAlign: 'center', padding: '2rem' }}>
                          {clients.length === 0 ? 'No hay clientes. Añade uno usando el formulario de arriba o importa un CSV.' : 'No se encontraron clientes con los filtros seleccionados.'}
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
                          <td title={client.name}>{client.name}</td>
                          <td title={client.phone}>{client.phone}</td>
                          <td title={client.email || '-'}>{client.email || '-'}</td>
                          <td title={client.contactName || '-'}>{client.contactName || '-'}</td>
                          <td title={client.location || '-'}>{client.location || '-'}</td>
                          <td title={client.propertyType || '-'}>{client.propertyType || '-'}</td>
                          <td>
                            {client.adLink ? (
                              <a href={client.adLink} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                                <ExternalLink size={14} /> Link
                              </a>
                            ) : '-'}
                          </td>
                          <td>
                            {client.whatsappLink ? (
                              <a href={client.whatsappLink} target="_blank" rel="noopener noreferrer" style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <MessageSquare size={14} /> Chat
                              </a>
                            ) : '-'}
                          </td>
                          <td>
                            {client.answered ? (
                              <span className={`badge ${client.answered.toLowerCase().includes('si') ? 'success' : 'warning'}`}>
                                {client.answered}
                              </span>
                            ) : '-'}
                          </td>
                          <td title={client.response || '-'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {client.response || '-'}
                          </td>
                          <td title={client.date || '-'}>{client.date || '-'}</td>
                          <td title={client.appointmentDate || '-'}>{client.appointmentDate || '-'}</td>
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
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="messages-section">
            <h2>Generador de Mensajes Personalizados con IA</h2>

            <div className="message-config">
              <div className="config-panel">
                <h3>1. Selecciona Propiedades (Opcional)</h3>
                <p className={selectedProperties.length > 0 ? 'selected' : ''}>{selectedProperties.length} propiedad(es) seleccionada(s)</p>
                <small>Ve a "Propiedades" y marca las propiedades relevantes (si aplica)</small>
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
                disabled={selectedClients.length === 0 || generatingMessage}
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
                  <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <p className="loading-text">
                      {configStatus.whatsapp.state === 'ERROR'
                        ? '❌ Error iniciando WhatsApp. Intenta reiniciar el servicio.'
                        : '⏳ Iniciando servicio de WhatsApp...'}
                    </p>
                    <small style={{ display: 'block', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                      {configStatus.whatsapp.state || 'Esperando conexión...'}
                    </small>
                    <button
                      onClick={handleWhatsAppLogout}
                      className="logout-btn"
                      style={{ background: '#f59e0b', fontSize: '0.9rem' }}
                    >
                      <RefreshCw size={14} /> Reiniciar Servicio WhatsApp
                    </button>
                  </div>
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
                    onChange={e => setEmailForm({ ...emailForm, email: e.target.value })}
                    placeholder="tu_email@gmail.com"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Contraseña de Aplicación:</label>
                  <input
                    type="password"
                    value={emailForm.password}
                    onChange={e => setEmailForm({ ...emailForm, password: e.target.value })}
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

            <div className="config-section">
              <h4><RefreshCw size={20} /> Scraper Automático (Fotocasa)</h4>
              <p className="config-info">
                Configura la búsqueda automática de nuevas propiedades en Fotocasa (solo 1ª página).
              </p>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={scraperConfig.fotocasa?.enabled || false}
                    onChange={e => setScraperConfig(prev => ({
                      ...prev,
                      fotocasa: { ...prev.fotocasa, enabled: e.target.checked }
                    }))}
                    style={{ width: 'auto' }}
                  />
                  Activar Scraper Automático
                </label>
              </div>

              {scraperConfig.fotocasa?.enabled && (
                <div className="form-group">
                  <label>Intervalo de ejecución:</label>
                  <select
                    value={scraperConfig.fotocasa?.interval || "60"}
                    onChange={e => setScraperConfig(prev => ({
                      ...prev,
                      fotocasa: { ...prev.fotocasa, interval: e.target.value }
                    }))}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                  >
                    <option value="15">Cada 15 minutos</option>
                    <option value="30">Cada 30 minutos</option>
                    <option value="60">Cada 1 hora</option>
                  </select>
                </div>
              )}

              <button
                onClick={handleScraperConfigSave}
                className="save-btn"
                disabled={savingScraperConfig}
                style={{ marginTop: '1rem' }}
              >
                {savingScraperConfig ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </div>

            <div className="config-section">
              <h4><Settings size={20} /> Configuración del Sistema</h4>
              <p className="config-info">
                Configura rutas y opciones del sistema. Si los scrapers fallan con error 9009, especifica la ruta completa a Python.
              </p>
              <form onSubmit={handlePythonPathSave} className="config-form">
                <div className="form-group">
                  <label>Ruta ejecutable Python:</label>
                  <input
                    type="text"
                    value={pythonPathInput}
                    onChange={e => setPythonPathInput(e.target.value)}
                    placeholder="Ej: C:\Python314\python.exe (Win) o /usr/bin/python3 (Mac)"
                  />
                  <small style={{ display: 'block', marginTop: '0.25rem', color: 'var(--text-secondary)' }}>
                    Por defecto: 'python' (Win) o 'python3' (Mac/Linux). Si falla, pon la ruta completa.
                  </small>
                </div>
                <button type="submit" className="save-btn" disabled={savingPythonPath}>
                  {savingPythonPath ? 'Guardando...' : 'Guardar Configuración Sistema'}
                </button>
              </form>
            </div>

            <div className="config-section">
              <h4><RefreshCw size={20} /> Actualizaciones</h4>
              <p className="config-info">
                Comprueba si hay nuevas versiones de la aplicación disponibles.
              </p>
              <button
                onClick={() => {
                  if (window.electronAPI) {
                    window.electronAPI.checkForUpdates();
                    showNotification('Buscando actualizaciones...', 'info');
                  } else {
                    showNotification('Esta función solo está disponible en la versión de escritorio.', 'warning');
                  }
                }}
                className="save-btn"
                style={{ marginTop: '1rem', backgroundColor: '#3b82f6' }}
              >
                Buscar Actualizaciones Ahora
              </button>
            </div>

            <div className="config-section">
              <h4><Trash2 size={20} /> Mantenimiento</h4>
              <p className="config-info">
                Elimina archivos temporales generados por los scrapers y actualizaciones para liberar espacio.
              </p>
              <button
                onClick={handleCleanup}
                className="save-btn"
                style={{ marginTop: '1rem', backgroundColor: '#ef4444' }}
              >
                Limpiar Archivos Temporales
              </button>
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
                  onChange={e => setSupportForm({ ...supportForm, subject: e.target.value })}
                  placeholder="Ej: Sugerencia, Error, Duda..."
                  className="support-input"
                />
              </div>
              <div className="form-group">
                <label>Mensaje (*):</label>
                <textarea
                  value={supportForm.message}
                  onChange={e => setSupportForm({ ...supportForm, message: e.target.value })}
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

      {/* Componente de Notificación de Actualización */}
      <UpdateNotification />
    </div >
  )
}

export default App
