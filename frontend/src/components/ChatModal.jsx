import React, { useState, useEffect, useRef } from 'react';
import { X, Send, RefreshCw, MessageSquare, Bot, Phone, User, PauseCircle, PlayCircle } from 'lucide-react';

const ChatModal = ({ client, onClose, API_URL, onSendMessage, showNotification }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [automationStatus, setAutomationStatus] = useState(client.automation_status || 'active');
  const [togglingAutomation, setTogglingAutomation] = useState(false);
  const messagesEndRef = useRef(null);
  const [pollInterval, setPollInterval] = useState(null);

  // Load messages on mount and start polling
  useEffect(() => {
    fetchMessages();
    
    // Poll every 3 seconds
    const interval = setInterval(fetchMessages, 3000);
    setPollInterval(interval);

    return () => clearInterval(interval);
  }, [client.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const toggleAutomation = async () => {
    const newStatus = automationStatus === 'active' ? 'paused' : 'active';
    setTogglingAutomation(true);
    try {
        const response = await fetch(`${API_URL}/clients/${client.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ automation_status: newStatus })
        });
        
        if (response.ok) {
            setAutomationStatus(newStatus);
            if (showNotification) showNotification(`Bot ${newStatus === 'active' ? 'ACTIVADO' : 'PAUSADO'}`, 'success');
        } else {
            if (showNotification) showNotification('Error actualizando estado del bot', 'error');
        }
    } catch (error) {
        console.error('Error toggling automation:', error);
        if (showNotification) showNotification('Error de conexión', 'error');
    } finally {
        setTogglingAutomation(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const response = await fetch(`${API_URL}/messages/${client.id}`);
      if (response.ok) {
        const data = await response.json();
        // Only update if different (simple check)
        setMessages(prev => {
            if (prev.length !== data.length) return data.reverse(); // Backend returns DESC, we want ASC for chat? 
            // Wait, backend returns DESC (newest first). Chat usually displays oldest at top.
            // So we should reverse them for display.
            return data.reverse();
        });
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const response = await fetch(`${API_URL}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          clientPhone: client.phone,
          clientEmail: client.email,
          message: newMessage,
          channels: 'whatsapp' // Force WhatsApp for this chat
        })
      });

      const data = await response.json();

      if (data.success) {
        setNewMessage('');
        fetchMessages(); // Refresh immediately
        if (showNotification) showNotification('Mensaje enviado', 'success');
      } else {
        if (showNotification) showNotification('Error enviando mensaje: ' + (data.details ? data.details.join(', ') : 'Error desconocido'), 'error');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      if (showNotification) showNotification('Error de conexión', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleGenerateReply = async () => {
    setGenerating(true);
    try {
      // Get default script from localStorage
      const defaultScript = localStorage.getItem('whatsapp_default_script') || 'initial_contact';
      const defaultModel = localStorage.getItem('whatsapp_default_model') || 'openai/gpt-oss-20b:free';

      // 1. Intentar obtener contexto de propiedad si el cliente tiene ad_link
      let contextProperties = [];
      if (client.ad_link) {
          try {
            // Buscamos la propiedad en la base de datos local del frontend si es posible, 
            // o enviamos el link para que el backend la busque.
            // Al ser un modal, no tenemos acceso directo al estado 'properties' de App.jsx fácilmente sin prop drilling.
            // Lo más robusto es enviar el ad_link y que el backend resuelva.
            // Pero para el prompt inmediato, podemos enviar un objeto básico si lo tuviéramos.
            // Vamos a enviar el ad_link en la petición.
            contextProperties = [{ url: client.ad_link }];
          } catch (e) { console.error("Error setting property context", e); }
      }

      const response = await fetch(`${API_URL}/messages/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: client.name,
          clientPhone: client.phone,
          properties: contextProperties, 
          preferences: client.preferences,
          model: defaultModel,
          scriptType: defaultScript,
          history: messages.slice(-10) // Send last 10 messages as context
        })
      });

      const data = await response.json();
      if (data.message) {
        setNewMessage(data.message);
      }
    } catch (error) {
      console.error('Error generating reply:', error);
      if (showNotification) showNotification('Error generando respuesta IA', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content chat-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', height: '80vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        
        {/* Header */}
        <div className="modal-header-custom" style={{ 
            padding: '1rem', 
            borderBottom: '1px solid var(--border)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            backgroundColor: 'var(--surface)',
            color: 'var(--text)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--primary)', color: 'white', padding: '8px', borderRadius: '50%' }}>
                <User size={20} />
            </div>
            <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)' }}>{client.name}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{client.phone}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <button 
                  onClick={toggleAutomation} 
                  disabled={togglingAutomation}
                  title={automationStatus === 'active' ? "Pausar Bot" : "Activar Bot"}
                  style={{ 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer', 
                      color: automationStatus === 'active' ? '#22c55e' : '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      backgroundColor: automationStatus === 'active' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      padding: '6px 12px',
                      borderRadius: '20px'
                  }}
              >
                  {togglingAutomation ? <RefreshCw size={16} className="spinning" /> : (
                      automationStatus === 'active' ? 
                      <><PauseCircle size={16} /> BOT ON</> : 
                      <><PlayCircle size={16} /> BOT PAUSED</>
                  )}
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={24} />
              </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="chat-messages" style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '1rem', 
            backgroundColor: 'var(--background)', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '10px' 
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Cargando conversación...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                No hay mensajes previos. ¡Inicia la conversación!
            </div>
          ) : (
            messages.map((msg, index) => {
                const isMe = msg.type !== 'received';
                return (
                    <div key={msg.id || index} style={{ 
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        backgroundColor: isMe ? '#005c4b' : 'var(--surface)',
                        color: isMe ? '#e9edef' : 'var(--text)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        boxShadow: '0 1px 1px rgba(0,0,0,0.2)',
                        position: 'relative',
                        border: isMe ? 'none' : '1px solid var(--border)'
                    }}>
                        <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        <div style={{ fontSize: '0.7rem', color: isMe ? '#8696a0' : 'var(--text-secondary)', textAlign: 'right', marginTop: '4px' }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {isMe && <span style={{ marginLeft: '4px' }}>{msg.status === 'read' ? '✓✓' : '✓'}</span>}
                        </div>
                    </div>
                );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input" style={{ 
            padding: '1rem', 
            borderTop: '1px solid var(--border)', 
            backgroundColor: 'var(--surface)' 
        }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <button 
                    onClick={handleGenerateReply} 
                    disabled={generating}
                    title="Sugerir respuesta con IA"
                    style={{ 
                        background: 'none', 
                        border: '1px solid var(--border)', 
                        borderRadius: '8px', 
                        padding: '10px', 
                        cursor: 'pointer',
                        color: 'var(--primary)'
                    }}
                >
                    {generating ? <RefreshCw size={20} className="spinning" /> : <Bot size={20} />}
                </button>
                
                <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Escribe un mensaje..."
                    rows={1}
                    style={{ 
                        flex: 1, 
                        padding: '10px', 
                        borderRadius: '8px', 
                        border: '1px solid var(--border)', 
                        resize: 'none',
                        fontFamily: 'inherit',
                        minHeight: '44px',
                        background: 'var(--background)',
                        color: 'var(--text)'
                    }}
                />
                
                <button 
                    onClick={handleSend}
                    disabled={sending || !newMessage.trim()}
                    style={{ 
                        background: 'var(--primary)', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '8px', 
                        padding: '10px 15px', 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    {sending ? <RefreshCw size={20} className="spinning" /> : <Send size={20} />}
                </button>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '5px', textAlign: 'center' }}>
                Enter para enviar, Shift+Enter para salto de línea.
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatModal;
