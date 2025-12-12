'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Determine database path based on environment
// Forzar el uso de la carpeta 'data' local en desarrollo O producción si se desea portabilidad/visibilidad
// En producción (packaged), path.dirname(process.execPath) es la carpeta del .exe
// En desarrollo, __dirname sube a backend/db, así que ../.. va a la raíz del proyecto
const ROOT_PATH = process.env.USER_DATA_PATH 
    ? process.env.USER_DATA_PATH 
    : (process.env.NODE_ENV === 'production' 
        ? path.dirname(process.execPath) // Al lado del .exe en producción
        : path.join(__dirname, '..', '..')); // Raíz del proyecto en desarrollo

const DB_PATH = path.join(ROOT_PATH, 'data', 'inmobiliaria.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Create database connection with verbose logging in development
const isDev = process.env.NODE_ENV !== 'production';
const db = new Database(DB_PATH, {
    verbose: isDev ? console.log : null
});

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`📦 SQLite Database conectada en: ${DB_PATH}`);

/**
 * Initialize database tables
 */
function initDB() {
    console.log('🔧 Inicializando tablas de base de datos...');

    // Create properties table
    db.exec(`
        CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE NOT NULL,
            title TEXT,
            price TEXT,
            direccion TEXT,
            location TEXT,
            habitaciones TEXT,
            banos TEXT,
            metros TEXT,
            phone TEXT,
            description TEXT,
            property_type TEXT,
            source TEXT DEFAULT 'Fotocasa',
            timeago TEXT,
            scrape_date TEXT,
            publication_date TEXT,
            last_updated TEXT,
            image_url TEXT,
            features TEXT,
            extra_data TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_properties_url ON properties(url);
        CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
        CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(location);
        CREATE INDEX IF NOT EXISTS idx_properties_property_type ON properties(property_type);
        CREATE INDEX IF NOT EXISTS idx_properties_source ON properties(source);
        CREATE INDEX IF NOT EXISTS idx_properties_scrape_date ON properties(scrape_date);
    `);

    // Create clients table (phone NOT unique to allow migration of existing data)
    db.exec(`
        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT,
            contact_name TEXT,
            phone TEXT,
            email TEXT,
            location TEXT,
            ad_link TEXT,
            whatsapp_link TEXT,
            status TEXT DEFAULT 'pending',
            property_type TEXT,
            interest TEXT,
            preferences TEXT,
            answered INTEGER DEFAULT 0,
            response TEXT,
            date TEXT,
            appointment_date TEXT,
            contact_history TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
        CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
        CREATE INDEX IF NOT EXISTS idx_clients_property_type ON clients(property_type);
    `);

    // Create messages table for message history
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT,
            type TEXT,
            content TEXT,
            status TEXT DEFAULT 'pending',
            sent_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id)
        );

        CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_id);
    `);

    console.log('✅ Tablas de base de datos inicializadas correctamente');
}

// ============ PROPERTIES FUNCTIONS ============

/**
 * Get all properties with optional pagination and filtering
 */
function getAllProperties({ page = 1, limit = 100, filters = {} } = {}) {
    let query = 'SELECT * FROM properties WHERE 1=1';
    const params = [];

    // Apply filters
    if (filters.property_type) {
        query += ' AND property_type = ?';
        params.push(filters.property_type);
    }
    if (filters.source) {
        query += ' AND source = ?';
        params.push(filters.source);
    }
    if (filters.location) {
        query += ' AND location LIKE ?';
        params.push(`%${filters.location}%`);
    }
    if (filters.minPrice) {
        query += ' AND CAST(REPLACE(REPLACE(price, ".", ""), "€", "") AS INTEGER) >= ?';
        params.push(filters.minPrice);
    }
    if (filters.maxPrice) {
        query += ' AND CAST(REPLACE(REPLACE(price, ".", ""), "€", "") AS INTEGER) <= ?';
        params.push(filters.maxPrice);
    }
    if (filters.search) {
        query += ' AND (title LIKE ? OR direccion LIKE ? OR location LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    // Order by scrape date (newest first)
    query += ' ORDER BY scrape_date DESC';

    // Pagination
    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const properties = stmt.all(...params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM properties WHERE 1=1';
    const countParams = params.slice(0, -2); // Remove LIMIT and OFFSET params

    // Re-apply filters for count query
    let filterIndex = 0;
    if (filters.property_type) countQuery += ' AND property_type = ?';
    if (filters.source) countQuery += ' AND source = ?';
    if (filters.location) countQuery += ' AND location LIKE ?';
    if (filters.minPrice) countQuery += ' AND CAST(REPLACE(REPLACE(price, ".", ""), "€", "") AS INTEGER) >= ?';
    if (filters.maxPrice) countQuery += ' AND CAST(REPLACE(REPLACE(price, ".", ""), "€", "") AS INTEGER) <= ?';
    if (filters.search) countQuery += ' AND (title LIKE ? OR direccion LIKE ? OR location LIKE ?)';

    const countStmt = db.prepare(countQuery);
    const { total } = countStmt.get(...countParams) || { total: 0 };

    // Parse JSON fields
    const parsedProperties = properties.map(prop => ({
        ...prop,
        features: prop.features ? JSON.parse(prop.features) : [],
        extra_data: prop.extra_data ? JSON.parse(prop.extra_data) : {}
    }));

    return {
        properties: parsedProperties,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
}

/**
 * Get a single property by URL
 */
function getPropertyByUrl(url) {
    const stmt = db.prepare('SELECT * FROM properties WHERE url = ?');
    const property = stmt.get(url);

    if (property) {
        property.features = property.features ? JSON.parse(property.features) : [];
        property.extra_data = property.extra_data ? JSON.parse(property.extra_data) : {};
    }

    return property;
}

/**
 * Insert or update a property (upsert)
 */
function upsertProperty(property) {
    const stmt = db.prepare(`
        INSERT INTO properties (
            url, title, price, direccion, location, habitaciones, banos, metros,
            phone, description, property_type, source, timeago, scrape_date,
            publication_date, last_updated, image_url, features, extra_data
        ) VALUES (
            @url, @title, @price, @direccion, @location, @habitaciones, @banos, @metros,
            @phone, @description, @property_type, @source, @timeago, @scrape_date,
            @publication_date, @last_updated, @image_url, @features, @extra_data
        )
        ON CONFLICT(url) DO UPDATE SET
            title = excluded.title,
            price = excluded.price,
            direccion = excluded.direccion,
            location = excluded.location,
            habitaciones = excluded.habitaciones,
            banos = excluded.banos,
            metros = excluded.metros,
            phone = excluded.phone,
            description = excluded.description,
            property_type = excluded.property_type,
            source = excluded.source,
            timeago = excluded.timeago,
            scrape_date = excluded.scrape_date,
            publication_date = excluded.publication_date,
            last_updated = datetime('now'),
            image_url = excluded.image_url,
            features = excluded.features,
            extra_data = excluded.extra_data
    `);

    const data = {
        url: property.url,
        title: property.title || property.Title || property.Título || null,
        price: property.price || property.Price || property.Precio || null,
        direccion: property.direccion || property.Municipality || property.Dirección || null,
        location: property.location || property.Municipality || property.Ubicación || null,
        habitaciones: property.habitaciones || property.hab || property.Habitaciones || null,
        banos: property.banos || property.Baños || null,
        metros: property.metros || property.m2 || property.Metros || null,
        phone: property.phone || property.Phone || property.Teléfono || null,
        description: property.description || property.Description || property.Descripción || null,
        property_type: property.property_type || null,
        source: property.source || 'Fotocasa',
        timeago: property.timeago || property.Timeago || null,
        scrape_date: property.scrape_date || new Date().toISOString(),
        publication_date: property.publication_date || property.publicationDate || null,
        last_updated: new Date().toISOString(),
        image_url: property.image_url || property.imgurl || property.Imagen || null,
        features: property.features ? JSON.stringify(property.features) : null,
        // Guardar campos adicionales en extra_data para no perder información
        extra_data: JSON.stringify({
            Advertiser: property.Advertiser || null,
            imgurl: property.imgurl || property.image_url || null,
            hab: property.hab || property.habitaciones || null,
            m2: property.m2 || property.metros || null,
            ...property.extra_data
        })
    };

    return stmt.run(data);
}

/**
 * Bulk insert properties (transaction for performance)
 */
function bulkInsertProperties(properties) {
    const insertMany = db.transaction((props) => {
        let inserted = 0;
        let updated = 0;

        for (const prop of props) {
            const existing = getPropertyByUrl(prop.url);
            upsertProperty(prop);

            if (existing) {
                updated++;
            } else {
                inserted++;
            }
        }

        return { inserted, updated };
    });

    return insertMany(properties);
}

/**
 * Delete a property by URL
 */
function deleteProperty(url) {
    const stmt = db.prepare('DELETE FROM properties WHERE url = ?');
    return stmt.run(url);
}

/**
 * Get properties count
 */
function getPropertiesCount() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM properties');
    return stmt.get().count;
}

// ============ CLIENTS FUNCTIONS ============

/**
 * Get all clients with optional pagination and filtering
 */
function getAllClients({ page = 1, limit = 100, filters = {} } = {}) {
    let query = 'SELECT * FROM clients WHERE 1=1';
    const params = [];

    if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
    }
    if (filters.property_type) {
        query += ' AND property_type = ?';
        params.push(filters.property_type);
    }
    if (filters.search) {
        query += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    query += ' ORDER BY created_at DESC';

    // Pagination
    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const clients = stmt.all(...params);

    // Get total count
    const countParams = params.slice(0, -2);
    let countQuery = 'SELECT COUNT(*) as total FROM clients WHERE 1=1';
    if (filters.status) countQuery += ' AND status = ?';
    if (filters.property_type) countQuery += ' AND property_type = ?';
    if (filters.search) countQuery += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';

    const countStmt = db.prepare(countQuery);
    const { total } = countStmt.get(...countParams) || { total: 0 };

    // Parse JSON fields
    const parsedClients = clients.map(client => ({
        ...client,
        contact_history: client.contact_history ? JSON.parse(client.contact_history) : [],
        contactHistory: client.contact_history ? JSON.parse(client.contact_history) : [] // For backward compatibility
    }));

    return {
        clients: parsedClients,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
}

/**
 * Get all clients without pagination (for backward compatibility)
 */
function getAllClientsSimple() {
    const stmt = db.prepare('SELECT * FROM clients ORDER BY created_at DESC');
    const clients = stmt.all();

    return clients.map(client => ({
        // Campos directos de la base de datos
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        location: client.location,
        status: client.status,
        interest: client.interest,
        preferences: client.preferences,
        answered: client.answered,
        response: client.response,
        date: client.date,
        notes: client.notes,

        // Campos mapeados a camelCase para compatibilidad con frontend
        contactName: client.contact_name,
        adLink: client.ad_link,
        whatsappLink: client.whatsapp_link,
        propertyType: client.property_type,
        appointmentDate: client.appointment_date,
        contactHistory: client.contact_history ? JSON.parse(client.contact_history) : [],
        createdAt: client.created_at,
        updatedAt: client.updated_at
    }));
}

/**
 * Get client by ID
 */
function getClientById(id) {
    const stmt = db.prepare('SELECT * FROM clients WHERE id = ?');
    const client = stmt.get(id);

    if (client) {
        client.contactHistory = client.contact_history ? JSON.parse(client.contact_history) : [];
    }

    return client;
}

/**
 * Get client by phone (or ID-based phone)
 */
function getClientByPhone(phone) {
    if (!phone) return null;
    
    // Check if it's a generated ID (starts with ID_)
    if (phone.startsWith('ID_')) {
        const stmt = db.prepare('SELECT * FROM clients WHERE phone = ?');
        const client = stmt.get(phone);
        if (client) {
             client.contactHistory = client.contact_history ? JSON.parse(client.contact_history) : [];
        }
        return client;
    }

    // Normal phone lookup
    // Remove all non-numeric characters for comparison
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) return null;

    // Strategy 1: Try exact match on cleaned phone (stripping DB phone of non-digits)
    // We use a custom function or just REPLACE common separators
    // Since SQLite doesn't have REGEXP_REPLACE by default without extensions, we use LIKE for partials
    // or we try to match the last 9 digits which is common for mobile phones
    
    const last9 = cleanPhone.slice(-9);
    
    // Search for any phone that ends with the last 9 digits of the provided phone
    // Use single quotes for string literals in SQL to avoid "no such column" errors
    const stmt = db.prepare("SELECT * FROM clients WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?");
    let client = stmt.get(`%${last9}`);

    if (client) {
        client.contactHistory = client.contact_history ? JSON.parse(client.contact_history) : [];
    }

    return client;
}

/**
 * Insert a new client
 */
function insertClient(client) {
    const stmt = db.prepare(`
        INSERT INTO clients (
            id, name, contact_name, phone, email, location, ad_link, whatsapp_link,
            status, property_type, interest, preferences, answered, response,
            date, appointment_date, contact_history, notes, created_at
        ) VALUES (
            @id, @name, @contact_name, @phone, @email, @location, @ad_link, @whatsapp_link,
            @status, @property_type, @interest, @preferences, @answered, @response,
            @date, @appointment_date, @contact_history, @notes, @created_at
        )
    `);

    const data = {
        id: client.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: client.name || null,
        contact_name: client.contactName || client.contact_name || null,
        phone: client.phone || null,
        email: client.email || null,
        location: client.location || null,
        ad_link: client.adLink || client.ad_link || null,
        whatsapp_link: client.whatsappLink || client.whatsapp_link || null,
        status: client.status || 'pending',
        property_type: client.propertyType || client.property_type || null,
        interest: client.interest || null,
        preferences: client.preferences || null,
        answered: client.answered ? 1 : 0,
        response: client.response || null,
        date: client.date || null,
        appointment_date: client.appointmentDate || client.appointment_date || null,
        contact_history: client.contactHistory ? JSON.stringify(client.contactHistory) : '[]',
        notes: client.notes || null,
        created_at: client.createdAt || new Date().toISOString()
    };

    const result = stmt.run(data);
    return { ...data, id: data.id };
}

/**
 * Update a client
 */
function updateClient(id, updates) {
    // Build dynamic update query
    const fields = [];
    const params = [];

    const fieldMapping = {
        name: 'name',
        contactName: 'contact_name',
        contact_name: 'contact_name',
        phone: 'phone',
        email: 'email',
        location: 'location',
        adLink: 'ad_link',
        ad_link: 'ad_link',
        whatsappLink: 'whatsapp_link',
        whatsapp_link: 'whatsapp_link',
        status: 'status',
        propertyType: 'property_type',
        property_type: 'property_type',
        interest: 'interest',
        preferences: 'preferences',
        answered: 'answered',
        response: 'response',
        date: 'date',
        appointmentDate: 'appointment_date',
        appointment_date: 'appointment_date',
        contactHistory: 'contact_history',
        contact_history: 'contact_history',
        notes: 'notes'
    };

    for (const [key, value] of Object.entries(updates)) {
        if (fieldMapping[key]) {
            const dbField = fieldMapping[key];
            fields.push(`${dbField} = ?`);

            if (key === 'contactHistory' || key === 'contact_history') {
                params.push(JSON.stringify(value));
            } else if (key === 'answered') {
                params.push(value ? 1 : 0);
            } else {
                params.push(value);
            }
        }
    }

    // Always update the updated_at timestamp
    fields.push('updated_at = ?');
    params.push(new Date().toISOString());

    params.push(id);

    const query = `UPDATE clients SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(query);
    return stmt.run(...params);
}

/**
 * Delete a client
 */
function deleteClient(id) {
    const stmt = db.prepare('DELETE FROM clients WHERE id = ?');
    return stmt.run(id);
}

/**
 * Bulk upsert clients (for import)
 */
function bulkUpsertClients(clients) {
    const upsertMany = db.transaction((clientList) => {
        let added = 0;
        let updated = 0;

        for (const client of clientList) {
            try {
                // Validación básica para evitar crashes
                if (!client.phone) continue;

                // Asegurar tipos básicos
                if (client.phone && typeof client.phone !== 'string') client.phone = String(client.phone);
                if (client.name && typeof client.name !== 'string') client.name = String(client.name);

                // --- LIMPIEZA AUTOMÁTICA DE DATOS ---
                // 1. Limpiar teléfono: Quitar espacios ("690 70 22"), guiones, letras, dejar solo NUMEROS y '+'
                if (client.phone) {
                    client.phone = client.phone.replace(/[^0-9+]/g, '');
                }

                // 2. Limpiar nombre: Quitar espacios extra
                if (client.name) {
                    client.name = client.name.trim();
                }
                
                // Si no hay teléfono válido pero hay nombre, generar un ID ficticio para permitir la importación
                // Esto es útil para contactos de email o "chat enviado"
                if (!client.phone && client.name) {
                    // Generar un "teléfono" único basado en el nombre para poder guardarlo
                    // Usamos un prefijo 'ID_' para distinguir
                    const nameSlug = client.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    client.phone = `ID_${nameSlug}_${Date.now().toString().slice(-4)}`;
                    console.log(`   ⚠️ Cliente sin teléfono (${client.name}). Asignado ID temporal: ${client.phone}`);
                }
                // ------------------------------------
                
                // Si sigue sin haber identificador (ni teléfono ni nombre), saltar
                if (!client.phone) {
                    console.warn(`   ⚠️ Saltando cliente sin teléfono ni nombre válido.`);
                    continue;
                }

                // Normalizar answered a booleano/integer si viene string ('Si'/'No')
                // Aunque insertClient ya hace `client.answered ? 1 : 0`, nos aseguramos

                const existing = getClientByPhone(client.phone);

                if (existing) {
                    // Avoid overwriting with older/empty data if possible, or just update
                    // For now, we update, but we might want to be careful about blanking out fields
                    updateClient(existing.id, client);
                    updated++;
                } else {
                    insertClient(client);
                    added++;
                }
            } catch (err) {
                console.error(`❌ Error crítico importando cliente (${client.name || 'sin nombre'} - ${client.phone || 'sin tlf'}):`, err.message);
                // No relanzamos el error para permitir que continúe con el resto del lote
            }
        }

        console.log(`✅ Importación finalizada. Agregados: ${added}, Actualizados: ${updated}`);
        // Ensure we return the transaction result
        return { added, updated };
    });
    
    // Execute the transaction
    return upsertMany(clients);
}

/**
 * Get clients count
 */
function getClientsCount() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM clients');
    return stmt.get().count;
}

// ============ MESSAGE FUNCTIONS ============

/**
 * Save a message to history
 */
function saveMessage(clientId, type, content, status = 'pending') {
    const stmt = db.prepare(`
        INSERT INTO messages (client_id, type, content, status, sent_at)
        VALUES (?, ?, ?, ?, ?)
    `);

    return stmt.run(clientId, type, content, status, new Date().toISOString());
}

/**
 * Get messages for a client
 */
function getClientMessages(clientId) {
    const stmt = db.prepare('SELECT * FROM messages WHERE client_id = ? ORDER BY created_at DESC');
    return stmt.all(clientId);
}

// ============ UTILITY FUNCTIONS ============

/**
 * Close database connection
 */
function closeDB() {
    db.close();
    console.log('📦 Conexión SQLite cerrada');
}

/**
 * Check if database is initialized
 */
function isDatabaseReady() {
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        return tables.some(t => t.name === 'properties') && tables.some(t => t.name === 'clients');
    } catch (e) {
        return false;
    }
}

/**
 * Get database stats
 */
function getDatabaseStats() {
    const propertiesCount = getPropertiesCount();
    const clientsCount = getClientsCount();
    const messagesCount = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;

    return {
        properties: propertiesCount,
        clients: clientsCount,
        messages: messagesCount,
        dbPath: DB_PATH,
        dbSize: fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0
    };
}

// Initialize database on module load
initDB();

// Export all functions
module.exports = {
    db,
    initDB,
    closeDB,
    isDatabaseReady,
    getDatabaseStats,

    // Properties
    getAllProperties,
    getPropertyByUrl,
    upsertProperty,
    bulkInsertProperties,
    deleteProperty,
    getPropertiesCount,

    // Clients
    getAllClients,
    getAllClientsSimple,
    getClientById,
    getClientByPhone,
    insertClient,
    updateClient,
    deleteClient,
    bulkUpsertClients,
    getClientsCount,

    // Messages
    saveMessage,
    getClientMessages
};
