import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addMonths, addWeeks, addDays, subMonths, subWeeks, subDays } from 'date-fns';
import { es } from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './CalendarPanel.css';
import { X, Calendar as CalendarIcon, Clock, AlignLeft, User, Home, Trash2, Phone, CheckSquare, Briefcase, Plus, Bell } from 'lucide-react';

const locales = {
    'es': es,
};

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

const API_URL = 'http://localhost:3001/api';

const messages = {
    allDay: 'Todo el día',
    previous: 'Anterior',
    next: 'Siguiente',
    today: 'Hoy',
    month: 'Mes',
    week: 'Semana',
    day: 'Día',
    agenda: 'Agenda',
    date: 'Fecha',
    time: 'Hora',
    event: 'Evento',
    noEventsInRange: 'No hay eventos en este rango',
    showMore: total => `+ Ver más (${total})`
};

// Custom Toolbar External
const CustomToolbar = ({ date, view, onNavigate, onView, onAddEvent }) => {

    const handleNavigate = (action) => {
        let newDate = new Date(date);
        if (action === 'TODAY') newDate = new Date();
        else if (action === 'PREV') {
            if (view === 'month') newDate = subMonths(date, 1);
            else if (view === 'week') newDate = subWeeks(date, 1);
            else newDate = subDays(date, 1);
        } else if (action === 'NEXT') {
            if (view === 'month') newDate = addMonths(date, 1);
            else if (view === 'week') newDate = addWeeks(date, 1);
            else newDate = addDays(date, 1);
        }
        onNavigate(newDate);
    };

    const label = format(date, 'MMMM yyyy', { locale: es });

    return (
        <div className="rbc-toolbar" style={{ pointerEvents: 'auto', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="rbc-btn-group">
                <button type="button" onClick={() => handleNavigate('TODAY')}>Hoy</button>
                <button type="button" onClick={() => handleNavigate('PREV')}><span className="rbc-icon-left">{'<'}</span></button>
                <button type="button" onClick={() => handleNavigate('NEXT')}><span className="rbc-icon-right">{'>'}</span></button>
            </div>

            <span className="rbc-toolbar-label" style={{ textTransform: 'capitalize', fontSize: '1.5rem', fontWeight: 'bold', color: 'white', textAlign: 'center', flexGrow: 1 }}>{label}</span>

            <div className="rbc-btn-group" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div className="rbc-btn-group">
                    <button type="button" className={view === 'month' ? 'rbc-active' : ''} onClick={() => onView('month')}>Mes</button>
                    <button type="button" className={view === 'week' ? 'rbc-active' : ''} onClick={() => onView('week')}>Semana</button>
                    <button type="button" className={view === 'day' ? 'rbc-active' : ''} onClick={() => onView('day')}>Día</button>
                    <button type="button" className={view === 'agenda' ? 'rbc-active' : ''} onClick={() => onView('agenda')}>Agenda</button>
                </div>

                <button
                    type="button"
                    onClick={onAddEvent}
                    className="btn-add-event"
                    style={{
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        marginLeft: '10px',
                        zIndex: 200
                    }}
                >
                    <Plus size={16} /> Nueva Cita
                </button>
            </div>
        </div>
    );
};

// Componente para evento
const EventComponent = ({ event }) => {
    let Icon = CalendarIcon;
    if (event.type === 'call') Icon = Phone;
    else if (event.type === 'viewing') Icon = Home;
    else if (event.type === 'task') Icon = CheckSquare;
    else if (event.type === 'meeting') Icon = Briefcase;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
            <Icon size={14} style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.85rem' }}>
                {event.title}
            </span>
        </div>
    );
};

// Helper Icon
const PencilIcon = ({ size }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
);

const CalendarPanel = ({ clients = [], properties = [] }) => {
    const [events, setEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Controlled State
    const [currentDate, setCurrentDate] = useState(new Date());
    const [currentView, setCurrentView] = useState(Views.MONTH);

    const [newEvent, setNewEvent] = useState({
        title: '',
        description: '',
        start: new Date(),
        end: new Date(),
        allDay: false,
        type: 'appointment',
        client_id: '',
        property_id: '',
        reminder: 0
    });

    const fetchEvents = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/calendar/events`);
            if (res.ok) {
                const data = await res.json();

                const formattedEvents = data.map(event => ({
                    ...event,
                    start: new Date(event.start_date),
                    end: new Date(event.end_date),
                    allDay: event.all_day === 1 || event.all_day === true
                }));

                setEvents(formattedEvents);
            }
        } catch (error) {
            console.error('Error fetching events:', error);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const handleSelectSlot = ({ start, end }) => {
        let endDate = end;
        if (start.getTime() === end.getTime()) {
            endDate = new Date(start.getTime() + 60 * 60 * 1000);
        }

        setNewEvent({
            title: '',
            description: '',
            start,
            end: endDate,
            allDay: false,
            type: 'appointment',
            client_id: '',
            property_id: '',
            reminder: 0
        });
        setSelectedEvent(null);
        setIsModalOpen(true);
    };

    const handleSelectEvent = (event) => {
        setNewEvent({
            ...event,
            start: new Date(event.start), // Asegurar date object
            end: new Date(event.end),
            client_id: event.client_id || '',
            property_id: event.property_id || '',
            reminder: event.reminder !== undefined ? event.reminder : 0
        });
        setSelectedEvent(event);
        setIsModalOpen(true);
    };

    const handleManualAdd = () => {
        const now = new Date();
        now.setMinutes(0, 0, 0);
        const start = new Date(now.getTime() + 60 * 60 * 1000);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        handleSelectSlot({ start, end });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (newEvent.end <= newEvent.start) {
            alert("La fecha de fin debe ser posterior a la de inicio");
            return;
        }

        const eventData = {
            title: newEvent.title,
            description: newEvent.description,
            start_date: newEvent.start.toISOString(),
            end_date: newEvent.end.toISOString(),
            all_day: newEvent.allDay,
            type: newEvent.type,
            client_id: newEvent.client_id || null,
            property_id: newEvent.property_id || null,
            reminder: newEvent.reminder !== undefined ? newEvent.reminder : 0
        };

        try {
            const url = selectedEvent ? `${API_URL}/calendar/events/${selectedEvent.id}` : `${API_URL}/calendar/events`;
            const method = selectedEvent ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });

            if (!res.ok) throw new Error('Error guardando evento');

            // Play sound
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log("Audio play failed", e));

            setIsModalOpen(false);
            fetchEvents();
        } catch (error) {
            console.error('Error saving event:', error);
            alert('Error guardando el evento. Revisa la consola.');
        }
    };

    const handleDelete = async () => {
        if (!selectedEvent || !window.confirm('¿Seguro que quieres eliminar este evento?')) return;
        try {
            await fetch(`${API_URL}/calendar/events/${selectedEvent.id}`, { method: 'DELETE' });
            setIsModalOpen(false);
            fetchEvents();
        } catch (error) { console.error('Error deleting event:', error); }
    };

    const eventStyleGetter = (event) => {
        let className = 'event-default';
        if (event.type === 'viewing') className = 'event-visit';
        else if (event.type === 'call') className = 'event-call';
        else if (event.type === 'appointment') className = 'event-appointment';
        else if (event.type === 'task') className = 'event-task';
        else if (event.type === 'meeting') className = 'event-meeting';

        return {
            className,
            style: {
                borderRadius: '6px',
                opacity: 0.95,
                border: '0px',
                display: 'block',
                color: event.type === 'task' ? '#111' : 'white'
            }
        };
    };

    return (
        <div className="calendar-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* External Toolbar - Completely outside Calendar logic */}
            <CustomToolbar
                date={currentDate}
                view={currentView}
                onNavigate={setCurrentDate}
                onView={setCurrentView}
                onAddEvent={handleManualAdd}
            />

            <div style={{ flex: 1, position: 'relative' }}>
                <Calendar
                    localizer={localizer}
                    events={events}
                    date={currentDate}
                    view={currentView}
                    onNavigate={setCurrentDate}
                    onView={setCurrentView}
                    startAccessor="start"
                    endAccessor="end"
                    style={{ height: '100%' }}
                    views={['month', 'week', 'day', 'agenda']}
                    messages={messages}
                    culture='es'
                    selectable
                    onSelectSlot={handleSelectSlot}
                    onSelectEvent={handleSelectEvent}
                    eventPropGetter={eventStyleGetter}
                    components={{
                        event: EventComponent,
                        toolbar: () => null // Hide internal toolbar
                    }}
                />
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {selectedEvent ? <React.Fragment><PencilIcon size={24} /> Editar Evento</React.Fragment> : <React.Fragment><CalendarIcon size={24} /> Nueva Cita</React.Fragment>}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="event-form">
                            <div className="form-group">
                                <label><AlignLeft size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Título</label>
                                <input
                                    type="text"
                                    value={newEvent.title}
                                    onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                                    required
                                    placeholder="Ej: Visita con Juan Pérez"
                                    autoFocus
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label>Tipo</label>
                                    <select
                                        value={newEvent.type}
                                        onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                                    >
                                        <option value="appointment">📅 Cita General</option>
                                        <option value="viewing">🏠 Visita Propiedad</option>
                                        <option value="call">📞 Llamada</option>
                                        <option value="task">✅ Tarea</option>
                                        <option value="meeting">💼 Reunión</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label style={{ visibility: 'hidden' }}>Todo el día</label>
                                    <div style={{ display: 'flex', alignItems: 'center', height: '42px', gap: '8px' }}>
                                        <input
                                            type="checkbox"
                                            checked={newEvent.allDay}
                                            onChange={e => setNewEvent({ ...newEvent, allDay: e.target.checked })}
                                            id="allDayCheck"
                                            style={{ width: '20px', height: '20px', margin: 0 }}
                                        />
                                        <label htmlFor="allDayCheck" style={{ margin: 0, cursor: 'pointer', color: 'white' }}>Todo el día</label>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label><Clock size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Inicio</label>
                                    <input
                                        type="datetime-local"
                                        value={newEvent.start ? format(newEvent.start, "yyyy-MM-dd'T'HH:mm") : ''}
                                        onChange={e => setNewEvent({ ...newEvent, start: new Date(e.target.value) })}
                                        required
                                        disabled={newEvent.allDay}
                                    />
                                </div>
                                <div className="form-group">
                                    <label><Clock size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Fin</label>
                                    <input
                                        type="datetime-local"
                                        value={newEvent.end ? format(newEvent.end, "yyyy-MM-dd'T'HH:mm") : ''}
                                        onChange={e => setNewEvent({ ...newEvent, end: new Date(e.target.value) })}
                                        required
                                        disabled={newEvent.allDay}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label><User size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Cliente (Opcional)</label>
                                <select
                                    value={newEvent.client_id}
                                    onChange={e => setNewEvent({ ...newEvent, client_id: e.target.value })}
                                >
                                    <option value="">-- Seleccionar Cliente --</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label><AlignLeft size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Descripción</label>
                                <textarea
                                    value={newEvent.description}
                                    onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                                    rows={3}
                                    placeholder="Detalles adicionales..."
                                />
                            </div>

                            <div className="form-group">
                                <label><Bell size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Recordatorio</label>
                                <select
                                    value={newEvent.reminder}
                                    onChange={e => setNewEvent({ ...newEvent, reminder: parseInt(e.target.value) })}
                                >
                                    <option value="0">Sin aviso</option>
                                    <option value="5">5 minutos antes</option>
                                    <option value="15">15 minutos antes</option>
                                    <option value="30">30 minutos antes</option>
                                    <option value="60">1 hora antes</option>
                                    <option value="1440">1 día antes</option>
                                </select>
                            </div>

                            <div className="modal-actions">
                                {selectedEvent && (
                                    <button type="button" onClick={handleDelete} className="btn-delete">
                                        <Trash2 size={18} style={{ display: 'inline', verticalAlign: '-4px' }} /> Eliminar
                                    </button>
                                )}
                                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-cancel">
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-save">
                                    {selectedEvent ? 'Actualizar' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarPanel;
