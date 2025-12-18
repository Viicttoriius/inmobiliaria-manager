import React, { useState, useEffect } from 'react';
import { X, Save, User, Phone, MapPin, AlignLeft, Euro, Type } from 'lucide-react';
import './EditPropertyModal.css';

const EditPropertyModal = ({ property, isOpen, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        price: '',
        description: '',
        advertiser: '',
        phone: '',
        location: '',
        notes: ''
    });

    useEffect(() => {
        if (property) {
            setFormData({
                title: property.Title || '',
                price: property.Price === 'A consultar' ? '' : property.Price,
                description: property.Description || '',
                advertiser: property.Advertiser || '',
                phone: property.Phone === 'None' ? '' : property.Phone,
                location: property.Municipality || property.location || '',
                notes: property.notes || ''
            });
        }
    }, [property]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(property.id, formData);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content edit-property-modal">
                <div className="modal-header">
                    <h2>Editar Propiedad</h2>
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="edit-property-form">
                    <div className="form-group full-width">
                        <label><Type size={16} /> Título</label>
                        <input 
                            type="text" 
                            name="title" 
                            value={formData.title} 
                            onChange={handleChange} 
                            placeholder="Título del anuncio"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label><Euro size={16} /> Precio</label>
                            <input 
                                type="text" 
                                name="price" 
                                value={formData.price} 
                                onChange={handleChange} 
                                placeholder="Ej: 250000"
                            />
                        </div>
                        <div className="form-group">
                            <label><MapPin size={16} /> Ubicación</label>
                            <input 
                                type="text" 
                                name="location" 
                                value={formData.location} 
                                onChange={handleChange} 
                                placeholder="Municipio / Zona"
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label><User size={16} /> Anunciante (Particular/Agencia)</label>
                            <input 
                                type="text" 
                                name="advertiser" 
                                value={formData.advertiser} 
                                onChange={handleChange} 
                                placeholder="Nombre del contacto"
                            />
                            <small className="help-text">Esencial para corregir datos faltantes</small>
                        </div>
                        <div className="form-group">
                            <label><Phone size={16} /> Teléfono</label>
                            <input 
                                type="text" 
                                name="phone" 
                                value={formData.phone} 
                                onChange={handleChange} 
                                placeholder="Ej: 600123456"
                            />
                        </div>
                    </div>

                    <div className="form-group full-width">
                        <label><AlignLeft size={16} /> Descripción</label>
                        <textarea 
                            name="description" 
                            value={formData.description} 
                            onChange={handleChange} 
                            rows={4}
                            placeholder="Descripción de la propiedad..."
                        />
                    </div>

                    <div className="form-group full-width">
                        <label>Notas Internas</label>
                        <textarea 
                            name="notes" 
                            value={formData.notes} 
                            onChange={handleChange} 
                            rows={2}
                            placeholder="Notas privadas para gestión interna..."
                        />
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="cancel-btn" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="save-btn">
                            <Save size={18} /> Guardar Cambios
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditPropertyModal;
