const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode'); // Para generar QR en frontend
const nodemailer = require('nodemailer');

require('dotenv').config();

const app = express();
const PORT = 3001;

// --- CONFIGURACIÓN WHATSAPP LOCAL ---
console.log('🔄 Inicializando cliente de WhatsApp...');
const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isWhatsAppReady = false;
let currentQR = null; // Guardar el QR actual para enviarlo al frontend

whatsappClient.on('qr', (qr) => {
    console.log('\n=============================================================');
    console.log('⚠️  ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP PARA INICIAR SESIÓN:');
    console.log('=============================================================\n');
    qrcodeTerminal.generate(qr, { small: true });
    
    // Generar Data URL para el frontend
    QRCode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('Error generando QR para frontend:', err);
        } else {
            currentQR = url;
        }
    });
});

whatsappClient.on('ready', () => {
    console.log('\n✅ Cliente de WhatsApp conectado y listo para enviar mensajes!\n');
    isWhatsAppReady = true;
    currentQR = null; // Ya no se necesita QR
});

whatsappClient.on('authenticated', () => {
    console.log('✅ WhatsApp autenticado correctamente');
});

whatsappClient.on('auth_failure', msg => {
    console.error('❌ Error de autenticación de WhatsApp:', msg);
    currentQR = null;
});

whatsappClient.on('disconnected', (reason) => {
    console.log('❌ WhatsApp desconectado:', reason);
    isWhatsAppReady = false;
    currentQR = null;
    // Reinicializar para permitir reconexión
    whatsappClient.initialize();
});

whatsappClient.initialize();

// --- CONFIGURACIÓN EMAIL (NODEMAILER) ---
// Función para crear el transporter con credenciales actualizadas
const createTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER, 
            pass: process.env.EMAIL_PASS 
        },
        tls: {
            rejectUnauthorized: false
        }
    });
};

let emailTransporter = createTransporter();

// Middleware
app.use(cors());
app.use(express.json());

// ============ RUTAS DE CONFIGURACIÓN ============

// Obtener estado de servicios y QR
app.get('/api/config/status', (req, res) => {
    res.json({
        whatsapp: {
            ready: isWhatsAppReady,
            qr: currentQR
        },
        email: {
            configured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
            user: process.env.EMAIL_USER || ''
        }
    });
});

// Actualizar credenciales de Email
app.post('/api/config/email', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    // Actualizar variables en memoria
    process.env.EMAIL_USER = email;
    process.env.EMAIL_PASS = password;

    // Actualizar transporter
    emailTransporter = createTransporter();

    // Persistir en .env (básico, reemplazando líneas)
    try {
        const envPath = path.join(__dirname, '.env');
        let envContent = '';
        
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        // Reemplazar o agregar EMAIL_USER
        if (envContent.includes('EMAIL_USER=')) {
            envContent = envContent.replace(/EMAIL_USER=.*/g, `EMAIL_USER=${email}`);
        } else {
            envContent += `\nEMAIL_USER=${email}`;
        }

        // Reemplazar o agregar EMAIL_PASS
        if (envContent.includes('EMAIL_PASS=')) {
            envContent = envContent.replace(/EMAIL_PASS=.*/g, `EMAIL_PASS=${password}`);
        } else {
            envContent += `\nEMAIL_PASS=${password}`;
        }

        fs.writeFileSync(envPath, envContent);
        console.log('✅ Credenciales de email actualizadas y guardadas en .env');
        res.json({ success: true });
    } catch (error) {
        console.error('Error guardando .env:', error);
        res.status(500).json({ error: 'Error guardando configuración' });
    }
});

// Cerrar sesión WhatsApp
app.post('/api/config/whatsapp/logout', async (req, res) => {
    try {
        console.log('Solicitud de cierre de sesión de WhatsApp recibida...');
        
        // Intentar logout si parece estar listo
        if (isWhatsAppReady) {
            try {
                await whatsappClient.logout();
                console.log('Logout ejecutado correctamente.');
            } catch (err) {
                console.warn('Logout falló (posiblemente ya desconectado):', err.message);
            }
        }

        // Forzar destrucción del cliente para asegurar limpieza
        try {
            await whatsappClient.destroy();
            console.log('Cliente destruido.');
        } catch (err) {
             console.warn('Error destruyendo cliente:', err.message);
        }
        
        // Reinicializar para generar nuevo QR
        console.log('Reinicializando cliente...');
        whatsappClient.initialize();
        isWhatsAppReady = false;
        currentQR = null;
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error crítico cerrando sesión WhatsApp:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rutas a los archivos
const PROPERTIES_DIR = path.join(__dirname, '../data/properties');

const IDEALISTA_SCRAPER = path.join(__dirname, '../scrapers/idealista/run_idealista_scraper.py');
const CLIENTS_FILE = path.join(__dirname, '../data/clients/clients.json');

const PROPERTIES_JSON_FILE = path.join(__dirname, '../data/properties.json');

// Asegurar que existen las carpetas y el archivo de clientes
const dataDir = path.join(__dirname, '../data/clients');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(CLIENTS_FILE)) {
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify([], null, 2));
}
// Asegurar que el directorio de propiedades existe
if (!fs.existsSync(PROPERTIES_DIR)) {
    fs.mkdirSync(PROPERTIES_DIR, { recursive: true });
}
// Asegurar que el archivo de propiedades consolidado existe
if (!fs.existsSync(PROPERTIES_JSON_FILE)) {
    fs.writeFileSync(PROPERTIES_JSON_FILE, JSON.stringify([], null, 2));
}

// Función para calcular la fecha de publicación real y el Timeago actualizado
const calculatePublicationDetails = (scrapeDate, timeago) => {
    // Fecha de referencia para los cálculos
    const referenceDate = new Date(scrapeDate);

    // 1. Calcular la fecha de publicación original basándonos en el timeago del scrapeo
    let originalPublicationDate = new Date(referenceDate);
    const timeagoLower = (timeago || '').toLowerCase();
    
    try {
        if (timeagoLower.includes('hoy')) {
            // La fecha de publicación es la misma que la del scrapeo
        } else if (timeagoLower.includes('ayer')) {
            originalPublicationDate.setDate(originalPublicationDate.getDate() - 1);
        } else if (timeagoLower.match(/hace (\d+) días?/)) { // "hace 1 día" o "hace N días"
            const days = parseInt(timeagoLower.match(/hace (\d+) días?/)[1], 10);
            if (!isNaN(days)) {
                originalPublicationDate.setDate(originalPublicationDate.getDate() - days);
            }
        }
        // Se podrían añadir más reglas para semanas, meses, etc. si fuera necesario
    } catch (e) {
        console.error(`Error calculando la fecha de publicación original para el timeago: "${timeago}"`, e);
        // Si hay un error, usamos la fecha de scrapeo como fallback
        originalPublicationDate = new Date(referenceDate);
    }

    // 2. Calcular la diferencia en días entre AHORA y la fecha de publicación original
    const now = new Date();
    // Ignoramos las horas/minutos/segundos para comparar solo los días completos
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfPublicationDay = new Date(originalPublicationDate.getFullYear(), originalPublicationDate.getMonth(), originalPublicationDate.getDate());
    
    const diffTime = startOfToday - startOfPublicationDay;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    // 3. Crear el nuevo string de Timeago para mostrar en la tarjeta
    let displayTimeago = 'Reciente';
    if (diffDays === 0) {
        displayTimeago = 'Hoy';
    } else if (diffDays === 1) {
        displayTimeago = 'Ayer';
    } else if (diffDays > 1) {
        displayTimeago = `Hace ${diffDays} días`;
    }

    return {
        // Devolvemos una fecha ISO real para poder ordenar
        publicationDate: originalPublicationDate.toISOString(),
        // Y el texto actualizado para mostrar
        displayTimeago: displayTimeago
    };
};



// ============ RUTAS DE PROPIEDADES ============

// Obtener todas las propiedades del archivo JSON consolidado
app.get('/api/properties', (req, res) => {
    try {
        const fileContent = fs.readFileSync(PROPERTIES_JSON_FILE, 'utf8');
        const properties = JSON.parse(fileContent);
        
        // Aunque los datos ya están consolidados, aún necesitamos calcular el timeago dinámico
        const propertiesWithDetails = properties.map(prop => {
            const { publicationDate, displayTimeago } = calculatePublicationDetails(prop.scrape_date || new Date(), prop.Timeago);
            return {
                ...prop,
                publicationDate: publicationDate, // Fecha ISO para ordenar
                Timeago: displayTimeago, // Timeago actualizado para mostrar
            };
        });

        res.json(propertiesWithDetails);
    } catch (error) {
        console.error('Error leyendo JSON de propiedades consolidado:', error);
        res.status(500).json({ error: 'Error leyendo propiedades' });
    }
});

// Función auxiliar para ejecutar un scraper de Python
const runPythonScraper = (scraperPath, res) => {
    console.log(`🚀 Iniciando scraper desde ${scraperPath}...`);

    const pythonProcess = spawn('python', [scraperPath], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
        const message = data.toString();
        output += message;
        console.log(message);
    });

    pythonProcess.stderr.on('data', (data) => {
        const message = data.toString();
        errorOutput += message;
        console.error(message);
    });

    pythonProcess.on('close', (code) => {
        if (code === 0) {
                console.log(`✅ Scraper completado exitosamente`);

                // Lógica de consolidación
                const mainPropertiesFile = path.join(__dirname, '../data/properties.json');

                // Encontrar el último archivo JSON generado
                const files = fs.readdirSync(PROPERTIES_DIR)
                    .filter(file => file.startsWith('fotocasa') && file.endsWith('.json'))
                    .map(file => ({ file, mtime: fs.statSync(path.join(PROPERTIES_DIR, file)).mtime }))
                    .sort((a, b) => b.mtime - a.mtime);

                if (files.length === 0) {
                    return res.json({ success: true, message: 'Scraper completado, pero no se encontraron nuevos datos para consolidar.', output });
                }

                const latestScraperFile = path.join(PROPERTIES_DIR, files[0].file);

                // Leer los datos existentes y los nuevos
                let existingProperties = [];
                if (fs.existsSync(mainPropertiesFile)) {
                    try {
                        const existingData = JSON.parse(fs.readFileSync(mainPropertiesFile, 'utf-8'));
                        // Asegurarse de que los datos existentes son un array
                        if (Array.isArray(existingData)) {
                            existingProperties = existingData;
                        }
                    } catch (e) {
                        console.error('Error al parsear el archivo de propiedades principal, se tratará como vacío.', e);
                        existingProperties = [];
                    }
                }

                const newPropertiesData = JSON.parse(fs.readFileSync(latestScraperFile, 'utf-8'));

                // Extraer el tipo de propiedad y la fuente del objeto principal y añadirlo a cada propiedad
                const propertyType = newPropertiesData.property_type;
                const source = newPropertiesData.source || 'Fotocasa'; // Default to Fotocasa if missing
                const newPropertiesArray = newPropertiesData.properties.map(prop => ({
                    ...prop,
                    property_type: propertyType,
                    source: source
                }));

                // Verificar que newPropertiesArray es un array antes de combinar
                if (!Array.isArray(newPropertiesArray)) {
                    console.error('El archivo del scraper no contiene un array de propiedades válido.');
                    // No se puede continuar sin un array, así que se finaliza la respuesta.
                    return res.json({ success: true, message: 'Scraper completado, pero los datos generados no tienen el formato correcto.', output });
                }


                // Combinar y eliminar duplicados
                const allProperties = [...existingProperties, ...newPropertiesArray];
                const uniqueProperties = allProperties.reduce((acc, current) => {
                    // Asegurarse de que el item actual tiene una URL para evitar errores
                    if (current && current.url && !acc.find(item => item.url === current.url)) {
                        acc.push(current);
                    }
                    return acc;
                }, []);

                // Guardar los datos consolidados
                fs.writeFileSync(mainPropertiesFile, JSON.stringify(uniqueProperties, null, 2));

                // (Opcional) Eliminar el archivo temporal
                // fs.unlinkSync(latestScraperFile);

                console.log(`✅ Consolidación completada: ${uniqueProperties.length} propiedades únicas.`);
                res.json({ success: true, message: 'Scraper y consolidación completados', output });

            } else {
            console.error(`❌ Scraper falló con código ${code}`);
            res.status(500).json({ success: false, error: 'Error ejecutando scraper', output: errorOutput });
        }
    });

    pythonProcess.on('error', (error) => {
        console.error('❌ Error iniciando scraper:', error);
        res.status(500).json({ success: false, error: 'Error iniciando scraper: ' + error.message });
    });
};

// Ruta unificada para ejecutar los scrapers de Fotocasa
app.post('/api/scraper/fotocasa/run', (req, res) => {
    const { type } = req.body; // 'viviendas', 'locales', 'terrenos'

    if (!type) {
        return res.status(400).json({ success: false, error: 'El tipo de propiedad es requerido' });
    }

    const scraperScript = `run_${type}_scraper.py`;
    const scraperPath = path.join(__dirname, `scrapers/fotocasa/${scraperScript}`);

    if (!fs.existsSync(scraperPath)) {
        return res.status(404).json({ success: false, error: `No se encontró el scraper para el tipo '${type}'` });
    }

    runPythonScraper(scraperPath, res);
});

// Ejecutar el scraper de Idealista
app.post('/api/scraper/idealista/run', (req, res) => {
    runPythonScraper(IDEALISTA_SCRAPER, res);
});

const UPDATE_SCRAPER = path.join(__dirname, 'scrapers/update_scraper.py');

// ... (el resto de las constantes)

// Actualizar propiedades seleccionadas
app.post('/api/properties/update', async (req, res) => {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ success: false, error: 'No se proporcionaron URLs para actualizar.' });
    }

    console.log(`🔄 Actualizando ${urls.length} propiedades...`);

    try {
        // 1. Crear archivo temporal con las URLs en la carpeta data/update para evitar reinicios por watchers
        const updateDir = path.join(__dirname, '../data/update');
        if (!fs.existsSync(updateDir)) {
            fs.mkdirSync(updateDir, { recursive: true });
        }
        const tempUrlsFile = path.join(updateDir, `temp_urls_${Date.now()}.json`);
        fs.writeFileSync(tempUrlsFile, JSON.stringify(urls));
        console.log(`   📄 Archivo temporal creado: ${tempUrlsFile}`);

        // 2. Ejecutar scraper con el archivo de URLs
        const pythonProcess = spawn('python', [UPDATE_SCRAPER, tempUrlsFile], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });
        
        let rawData = '';
        let errorData = '';

        pythonProcess.on('error', (err) => {
            console.error('❌ Error iniciando proceso Python:', err);
            // Intentar borrar archivo temporal si existe
            try { if (fs.existsSync(tempUrlsFile)) fs.unlinkSync(tempUrlsFile); } catch(e) {}
            // No podemos responder dos veces si ya respondimos, pero aquí es temprano
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: 'Error al iniciar el proceso de actualización: ' + err.message });
            }
        });

        pythonProcess.stdout.on('data', (data) => {
            rawData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
            // Solo loguear si es un error real o información importante, no spam
            if (data.toString().includes('Error') || data.toString().includes('Procesando')) {
                console.log(`      [Python] ${data.toString().trim()}`);
            }
        });

        const exitCode = await new Promise((resolve) => {
            pythonProcess.on('close', resolve);
        });

        // Borrar archivo temporal de URLs
        try {
            if (fs.existsSync(tempUrlsFile)) fs.unlinkSync(tempUrlsFile);
        } catch (e) { console.error("Error borrando archivo temporal:", e); }

        if (exitCode !== 0) {
            console.error(`❌ Scraper falló con código ${exitCode}`);
            return res.status(500).json({ success: false, error: 'Error ejecutando scraper de actualización', output: errorData });
        }

        // 3. Procesar resultados
        let updatedProperties = [];
        try {
            // Intentar encontrar el JSON en la salida (puede haber logs previos si algo falló en suppress)
            const jsonStartIndex = rawData.indexOf('[');
            const jsonEndIndex = rawData.lastIndexOf(']');
            
            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                const jsonString = rawData.substring(jsonStartIndex, jsonEndIndex + 1);
                updatedProperties = JSON.parse(jsonString);
            } else {
                 throw new Error("No se encontró JSON válido en la salida");
            }
        } catch (e) {
            console.error("Error parseando salida del scraper:", e);
            // Fallback: buscar el último archivo en data/update
            try {
                const updateDir = path.join(__dirname, '../data/update');
                if (fs.existsSync(updateDir)) {
                     const files = fs.readdirSync(updateDir)
                        .filter(f => f.startsWith('update_batch_'))
                        .sort((a, b) => fs.statSync(path.join(updateDir, b)).mtime - fs.statSync(path.join(updateDir, a)).mtime);
                     
                     if (files.length > 0) {
                         const content = fs.readFileSync(path.join(updateDir, files[0]), 'utf-8');
                         updatedProperties = JSON.parse(content);
                     }
                }
            } catch (err) {
                console.error("Error fallback leyendo archivo update:", err);
            }
        }

        if (updatedProperties.length === 0) {
            return res.json({ success: true, updatedCount: 0, message: "No se obtuvieron datos actualizados." });
        }

        // 4. Actualizar archivos persistentes
        const allProperties = [];
        // Cargar índice de archivos originales
        const files = fs.readdirSync(PROPERTIES_DIR);
        files.forEach(file => {
            if (path.extname(file) === '.json') {
                const filePath = path.join(PROPERTIES_DIR, file);
                try {
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(fileContent);
                    if (data && Array.isArray(data.properties)) {
                        // Solo necesitamos saber qué URL está en qué archivo
                        data.properties.forEach(p => {
                            if (p.url) {
                                allProperties.push({ url: p.url, originalFile: file });
                            }
                        });
                    }
                } catch(e) {}
            }
        });

        let successCount = 0;

        // Agrupar actualizaciones por archivo original para minimizar escrituras
        const updatesByFile = {};

        updatedProperties.forEach(updatedProp => {
            const match = allProperties.find(p => p.url === updatedProp.url);
            if (match) {
                if (!updatesByFile[match.originalFile]) {
                    updatesByFile[match.originalFile] = [];
                }
                updatesByFile[match.originalFile].push(updatedProp);
            }
        });

        // Aplicar actualizaciones
        for (const fileName in updatesByFile) {
            const filePath = path.join(PROPERTIES_DIR, fileName);
            if (fs.existsSync(filePath)) {
                try {
                    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    let modified = false;

                    updatesByFile[fileName].forEach(update => {
                        const propIndex = fileData.properties.findIndex(p => p.url === update.url);
                        if (propIndex !== -1) {
                            fileData.properties[propIndex] = {
                                ...fileData.properties[propIndex],
                                ...update,
                                lastUpdated: new Date().toISOString()
                            };
                            modified = true;
                            successCount++;
                        }
                    });

                    if (modified) {
                        fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
                        console.log(`💾 Archivo ${fileName} actualizado con ${updatesByFile[fileName].length} cambios.`);
                    }
                } catch (e) {
                    console.error(`Error actualizando archivo ${fileName}:`, e);
                }
            }
        }
        
        // Actualizar properties.json consolidado también
        try {
            if (fs.existsSync(PROPERTIES_JSON_FILE)) {
                const consolidatedData = JSON.parse(fs.readFileSync(PROPERTIES_JSON_FILE, 'utf8'));
                let consolidatedModified = false;
                
                updatedProperties.forEach(update => {
                    const index = consolidatedData.findIndex(p => p.url === update.url);
                    if (index !== -1) {
                        consolidatedData[index] = {
                            ...consolidatedData[index],
                            ...update,
                            lastUpdated: new Date().toISOString()
                        };
                        consolidatedModified = true;
                    }
                });
                
                if (consolidatedModified) {
                    fs.writeFileSync(PROPERTIES_JSON_FILE, JSON.stringify(consolidatedData, null, 2));
                    console.log(`💾 Archivo consolidado properties.json actualizado.`);
                }
            }
        } catch (e) {
             console.error("Error actualizando properties.json:", e);
        }

        res.json({ success: true, updatedCount: successCount });

    } catch (error) {
        console.error('❌ Error en el proceso de actualización de propiedades:', error);
        res.status(500).json({ success: false, error: 'Error en el servidor al actualizar propiedades.' });
    }
});

// ============ RUTAS DE CLIENTES ============

// Obtener todos los clientes
app.get('/api/clients', (req, res) => {
    try {
        const clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
        res.json(clients);
    } catch (error) {
        console.error('Error leyendo clientes:', error);
        res.status(500).json({ error: 'Error leyendo clientes' });
    }
});

// Agregar un nuevo cliente
app.post('/api/clients', (req, res) => {
    try {
        const clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
        const newClient = {
            id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };

        clients.push(newClient);
        fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));

        res.json(newClient);
    } catch (error) {
        console.error('Error añadiendo cliente:', error);
        res.status(500).json({ error: 'Error añadiendo cliente' });
    }
});

// Actualizar un cliente
app.put('/api/clients/:id', (req, res) => {
    try {
        const clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
        const index = clients.findIndex(c => c.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        clients[index] = { ...clients[index], ...req.body };
        fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));

        res.json(clients[index]);
    } catch (error) {
        console.error('Error actualizando cliente:', error);
        res.status(500).json({ error: 'Error actualizando cliente' });
    }
});

// Eliminar un cliente
app.delete('/api/clients/:id', (req, res) => {
    try {
        let clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
        clients = clients.filter(c => c.id !== req.params.id);

        fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));

        res.json({ success: true });
    } catch (error) {
        console.error('Error eliminando cliente:', error);
        res.status(500).json({ error: 'Error eliminando cliente' });
    }
});

// ============ MENSAJERÍA CON IA (OpenRouter) ============

// Generar mensaje personalizado con OpenRouter
app.post('/api/messages/generate', async (req, res) => {
    const { clientName, clientPhone, properties, preferences, model } = req.body;

    try {
        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

        // Si no hay API key, usar template básico
        if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'tu_api_key_aqui') {
            const message = generateBasicTemplate(clientName, clientPhone, properties, preferences);
            return res.json({ message, source: 'template' });
        }

        // Lógica específica del usuario para el contexto
        const tipo = properties.length > 0 ? (properties[0].property_type || 'inmueble').toLowerCase() : 'inmueble';
        let contextoEspecifico = "";
        let tipoPropiedadParaPrompt = "";

        if (tipo.includes("terreno")) {
            contextoEspecifico = "clientes interesados en comprar **terrenos**";
            tipoPropiedadParaPrompt = "el terreno";
        } else if (tipo.includes("inmueble") || tipo.includes("piso") || tipo.includes("casa") || tipo.includes("vivienda")) {
            contextoEspecifico = "clientes interesados en comprar **inmuebles** con las características del que tiene anunciado";
            tipoPropiedadParaPrompt = "el piso/propiedad";
        } else {
            contextoEspecifico = "clientes interesados en comprar **propiedades** como la que tiene anunciada";
            tipoPropiedadParaPrompt = "la propiedad";
        }

        const AGENTE = "Alex Aldazabal Dufurneaux";
        const COMPANIA_Y_LOCALIDAD = "soy Agente Inmobiliario de IAD radico en Denia";

        // Construir el prompt EXACTO solicitado
        const prompt = `Genera un mensaje de contacto inmobiliario cordial y profesional para WhatsApp. Dirígete a ${clientName}. 
El emisor es ${AGENTE}, ${COMPANIA_Y_LOCALIDAD}. 
El motivo es: el emisor tiene ${contextoEspecifico}. 
Finaliza preguntando si pueden quedar para conocer ${tipoPropiedadParaPrompt} y obtener más información, deseando un excelente día. 
El mensaje debe ser directo, conciso y seguir la estructura de la plantilla proporcionada: 
"Hola, mi nombre es Alex Aldazabal Dufurneaux, soy Agente Inmobiliario de IAD radico en Denia, le contacto porque tengo la posibilidad de captar clientes interesados en comprar inmuebles con las características del que tiene anunciado, ¿Podemos quedar para conocer el piso y poder tener mas información?, será un placer atenderle, le deseo un excelente día."`;

        // Llamar a OpenRouter
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3001',
                'X-Title': 'Inmobiliaria Denia'
            },
            body: JSON.stringify({
                model: model || 'openai/gpt-oss-20b:free',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0]) {
            const message = data.choices[0].message.content;
            res.json({ message, source: 'openrouter' });
        } else {
            // Fallback a template básico si falla la IA
            const message = generateBasicTemplate(clientName, clientPhone, properties, preferences);
            res.json({ message, source: 'template' });
        }

    } catch (error) {
        console.error('Error generando mensaje con IA:', error);
        // Fallback a template básico
        const message = generateBasicTemplate(req.body.clientName, req.body.clientPhone, req.body.properties, req.body.preferences);
        res.json({ message, source: 'template' });
    }
});

// Template básico de fallback
function generateBasicTemplate(clientName, clientPhone, properties, preferences) {
    return `Hola ${clientName},

Soy Alex Aldazabal, agente inmobiliario de IAD en Denia.

He encontrado algunas propiedades que podrían interesarte${preferences ? ` según tus preferencias (${preferences})` : ''}:

${properties.map((p, i) => `
*${i + 1}. ${p.Title}*
💰 Precio: ${p.price}
${p.m2 !== 'None' ? `📐 Superficie: ${p.m2}` : ''}
${p.hab !== 'None' ? `🏠 ${p.hab}` : ''}
🕒 ${p.timeago}
🔗 ${p.url}
`).join('\n')}

¿Te gustaría más información sobre alguna de estas propiedades? Estoy disponible para ayudarte.

Saludos,
Alex Aldazabal
IAD Denia
📱 ${clientPhone || 'Contacta conmigo'}`;
}

// Enviar mensaje (WhatsApp Local y Email)
app.post('/api/messages/send', async (req, res) => {
  const { clientId, clientPhone, message, channels, propertyUrl, clientEmail } = req.body;
  
  console.log('\n==================================================');
  console.log('📥 RECIBIDA SOLICITUD DE ENVÍO DESDE FRONTEND');
  console.log('==================================================');
  console.log('   - Phone:', clientPhone);
  console.log('   - Email:', clientEmail);
  console.log('   - Channels:', channels);
  console.log('   - Message length:', message ? message.length : 0);
  
  const results = { whatsapp: 'skipped', email: 'skipped' };
    const errors = [];
    let success = false;

    // 1. ENVIAR WHATSAPP
          if (channels === 'whatsapp' || channels === 'both') {
            console.log('   [DEBUG] Intentando envío WhatsApp. Estado ready:', isWhatsAppReady);
            if (!isWhatsAppReady) {
              errors.push('WhatsApp no está listo. Revisa la terminal del servidor y escanea el QR.');
              results.whatsapp = 'failed';
            } else {
              try {
                // Formatear número: eliminar caracteres no numéricos
                let formattedPhone = clientPhone.replace(/\D/g, '');
                
                // Asegurar código de país (asumiendo España 34 si no lo tiene y tiene 9 dígitos)
                if (formattedPhone.length === 9) {
                  formattedPhone = '34' + formattedPhone;
                }
                
                const chatId = `${formattedPhone}@c.us`;
                
                console.log(`   📱 Enviando WhatsApp a ${chatId}...`);
                const response = await whatsappClient.sendMessage(chatId, message);
                console.log('   ✅ WhatsApp enviado. ID:', response.id ? response.id._serialized : 'Desconocido');
                results.whatsapp = 'sent';
                success = true;
              } catch (err) {
                console.error('   ❌ Error enviando WhatsApp:', err);
                errors.push(`Error WhatsApp: ${err.message}`);
                results.whatsapp = 'failed';
              }
            }
          }

    // 2. ENVIAR EMAIL
    if (channels === 'email' || channels === 'both') {
        if (!clientEmail) {
             errors.push('No se proporcionó email para el cliente.');
             results.email = 'failed';
        } else if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
             errors.push('Faltan credenciales de email en .env (EMAIL_USER, EMAIL_PASS).');
             results.email = 'failed';
        } else {
            try {
                console.log(`   📧 Enviando Email a ${clientEmail}...`);
                await emailTransporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: clientEmail,
                    subject: 'Información Inmobiliaria - Alex Aldazabal',
                    text: message
                });
                console.log('   ✅ Email enviado.');
                results.email = 'sent';
                success = true;
            } catch (err) {
                console.error('   ❌ Error enviando Email:', err);
                errors.push(`Error Email: ${err.message}`);
                results.email = 'failed';
            }
        }
    }

    // Respuesta al cliente
    if (success || (results.whatsapp === 'skipped' && results.email === 'skipped')) {
        // Guardar en historial si al menos uno se envió
        if (clientId && success) {
            try {
                const clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
                const clientIndex = clients.findIndex(c => c.id === clientId);
                
                if (clientIndex !== -1) {
                    if (!clients[clientIndex].contactHistory) {
                        clients[clientIndex].contactHistory = [];
                    }
                    
                    clients[clientIndex].contactHistory.push({
                        date: new Date().toISOString(),
                        propertyUrl: propertyUrl || 'Multiple/General',
                        channel: channels,
                        message: message.substring(0, 100) + '...', // Guardar preview
                        status: results
                    });
                    
                    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
                    console.log(`   📝 Historial actualizado para cliente ${clientId}`);
                }
            } catch (err) {
                console.error('   ⚠️ Error actualizando historial:', err);
            }
        }

        res.json({ success: true, results, errors });
    } else {
        // Si fallaron todos los intentos solicitados
        res.status(500).json({ 
            success: false, 
            error: 'Falló el envío de mensajes.', 
            details: errors,
            results 
        });
    }
});

// Enviar correo de soporte al desarrollador
app.post('/api/support', async (req, res) => {
    const { subject, message, userEmail } = req.body;
    const DEVELOPER_EMAIL = 'viicttoriius@gmail.com';

    if (!message) {
        return res.status(400).json({ error: 'El mensaje es obligatorio' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ error: 'Faltan credenciales de email en el servidor.' });
    }

    try {
        console.log(`   📧 Enviando solicitud de soporte a ${DEVELOPER_EMAIL}...`);
        await emailTransporter.sendMail({
            from: process.env.EMAIL_USER,
            to: DEVELOPER_EMAIL,
            subject: `[Soporte Inmobiliaria] ${subject || 'Consulta General'}`,
            text: `Mensaje enviado por: ${userEmail || 'Usuario Anónimo'}\n\n${message}`
        });
        console.log('   ✅ Email de soporte enviado.');
        res.json({ success: true });
    } catch (err) {
        console.error('   ❌ Error enviando Email de soporte:', err);
        res.status(500).json({ error: `Error enviando email: ${err.message}` });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Backend API corriendo en http://localhost:${PORT}`);
    console.log(`📊 Propiedades: http://localhost:${PORT}/api/properties`);
    console.log(`👥 Clientes: http://localhost:${PORT}/api/clients`);
    console.log(`🔧 Fotocasa: POST http://localhost:${PORT}/api/scraper/fotocasa/run`);
    console.log(`🔧 Idealista: POST http://localhost:${PORT}/api/scraper/idealista/run`);
});
