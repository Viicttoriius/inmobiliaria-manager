const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode'); // Para generar QR en frontend
const nodemailer = require('nodemailer');
const notifier = require('node-notifier');

// Determine base path for data
const BASE_PATH = process.env.USER_DATA_PATH || path.join(__dirname, '..');
const DATA_DIR = path.join(BASE_PATH, 'data');
const ENV_FILE = path.join(BASE_PATH, '.env');
const ROOT_ENV_FILE = path.join(__dirname, '..', '.env');

// --- MIGRATION LOGIC START ---
// Intenta migrar datos desde la carpeta resources (legacy) si la carpeta de datos de usuario está vacía
try {
    const LEGACY_DATA_PATH = path.join(__dirname, '..', 'data');
    // Solo migrar si estamos usando USER_DATA_PATH, la carpeta de destino no existe (o está vacía de clientes) y la de origen sí existe
    if (process.env.USER_DATA_PATH && fs.existsSync(LEGACY_DATA_PATH)) {
        const destClients = path.join(DATA_DIR, 'clients', 'clients.json');
        if (!fs.existsSync(destClients)) {
             console.log('🔄 Migrando datos desde ubicación legacy:', LEGACY_DATA_PATH, '->', DATA_DIR);
             // Crear directorio destino si no existe
             if (!fs.existsSync(DATA_DIR)) {
                 fs.mkdirSync(DATA_DIR, { recursive: true });
             }
             
             // Copiar recursivamente (requiere Node 16.7+)
             fs.cpSync(LEGACY_DATA_PATH, DATA_DIR, { recursive: true });
             console.log('✅ Datos migrados correctamente.');
        }
    }
} catch (error) {
    console.error('❌ Error durante la migración de datos:', error);
}
// --- MIGRATION LOGIC END ---

require('dotenv').config({ path: ENV_FILE });
// Also try to load from project root if different (useful for dev or if USER_DATA_PATH is set but no .env there)
if (ROOT_ENV_FILE !== ENV_FILE) {
    require('dotenv').config({ path: ROOT_ENV_FILE });
}

// --- VERIFICACIÓN DE DEPENDENCIAS PYTHON ---
const checkPythonDependencies = () => {
    const requirementsPath = path.join(__dirname, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
        console.log('📦 Verificando dependencias de Python...');
        
        let defaultPython = 'python';
        if (process.platform !== 'win32') defaultPython = 'python3';
        const pythonExecutable = process.env.PYTHON_PATH || defaultPython;

        // Intentar instalar dependencias
        exec(`${pythonExecutable} -m pip install -r "${requirementsPath}"`, (error, stdout, stderr) => {
            if (error) {
                console.warn('⚠️ No se pudieron instalar las dependencias de Python automáticamente.');
                console.warn('Si el scraper falla, asegúrate de tener instalado: selenium, beautifulsoup4');
                console.warn('Error:', error.message);
            } else {
                console.log('✅ Dependencias de Python verificadas/instaladas.');
            }
        });
    }
};

// Ejecutar verificación en segundo plano al iniciar
checkPythonDependencies();

const app = express();
const PORT = 3001;

// --- CONFIGURACIÓN WHATSAPP LOCAL ---
console.log('🔄 Inicializando cliente de WhatsApp...');
const whatsappClient = new Client({
    authStrategy: new LocalAuth({
        dataPath: DATA_DIR
    }),
    authTimeoutMs: 60000, // Aumentar tiempo de espera de autenticación
    qrMaxRetries: 0, // Reintentos infinitos de QR
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-extensions', // Deshabilitar extensiones
            // '--single-process', // Descomentar si sigue fallando, pero puede ser inestable
        ]
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/guigo613/alternative-wa-version/main/html/2.2412.54v2.html',
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

whatsappClient.on('loading_screen', (percent, message) => {
    console.log(`⏳ WhatsApp Cargando: ${percent}% - ${message}`);
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
        },
        python: {
            path: process.env.PYTHON_PATH || 'python'
        }
    });
});

// Actualizar ruta de Python
app.post('/api/config/python', (req, res) => {
    const { pythonPath } = req.body;

    if (!pythonPath) {
        return res.status(400).json({ error: 'Ruta de Python requerida' });
    }

    // Actualizar variable en memoria
    process.env.PYTHON_PATH = pythonPath;

    // Persistir en .env
    try {
        const envPath = ENV_FILE;
        let envContent = '';

        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        // Reemplazar o agregar PYTHON_PATH
        if (envContent.includes('PYTHON_PATH=')) {
            envContent = envContent.replace(/PYTHON_PATH=.*/g, `PYTHON_PATH=${pythonPath}`);
        } else {
            envContent += `\nPYTHON_PATH=${pythonPath}`;
        }

        fs.writeFileSync(envPath, envContent);
        console.log(`✅ Ruta de Python actualizada a: ${pythonPath}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error guardando .env:', error);
        res.status(500).json({ error: 'Error guardando configuración' });
    }
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
        const envPath = ENV_FILE;
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
const PROPERTIES_DIR = path.join(DATA_DIR, 'properties');

const IDEALISTA_SCRAPER = path.join(__dirname, 'scrapers/idealista/run_idealista_scraper.py');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients/clients.json');

const PROPERTIES_JSON_FILE = path.join(DATA_DIR, 'properties.json');

// Asegurar que existen las carpetas y el archivo de clientes
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// DEBUG: Escribir información de rutas para depuración
try {
    const debugInfo = `
Time: ${new Date().toISOString()}
Platform: ${process.platform}
BASE_PATH: ${BASE_PATH}
DATA_DIR: ${DATA_DIR}
ENV_FILE: ${ENV_FILE}
USER_DATA_ENV: ${process.env.USER_DATA_PATH}
LEGACY_PATH_CHECK: ${path.join(__dirname, '..', 'data')}
`;
    fs.writeFileSync(path.join(DATA_DIR, 'debug_paths.txt'), debugInfo);
} catch(e) {
    console.error('Error escribiendo debug info:', e);
}

const dataClientsDir = path.join(DATA_DIR, 'clients');
if (!fs.existsSync(dataClientsDir)) {
    fs.mkdirSync(dataClientsDir, { recursive: true });
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
        let properties = JSON.parse(fileContent);
        let modified = false;

        // Migración on-the-fly: Asegurar que todos tengan scrape_date
        properties = properties.map(prop => {
            if (!prop.scrape_date) {
                modified = true;
                return {
                    ...prop,
                    scrape_date: prop.lastUpdated || new Date().toISOString()
                };
            }
            return prop;
        });

        if (modified) {
            fs.writeFileSync(PROPERTIES_JSON_FILE, JSON.stringify(properties, null, 2));
            console.log('🔄 Propiedades migradas: se añadió scrape_date a registros antiguos.');
        }

        // Aunque los datos ya están consolidados, aún necesitamos calcular el timeago dinámico
        const propertiesWithDetails = properties.map(prop => {
            const { publicationDate, displayTimeago } = calculatePublicationDetails(prop.scrape_date, prop.Timeago);
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
    // Determinar el ejecutable de Python
    // 1. Usar PYTHON_PATH del .env si existe
    // 2. Si no, determinar por plataforma: 'python' en Win, 'python3' en Mac/Linux
    let defaultPython = 'python';
    if (process.platform !== 'win32') {
        defaultPython = 'python3';
    }
    
    const pythonExecutable = process.env.PYTHON_PATH || defaultPython;
    
    console.log(`🚀 Iniciando scraper desde ${scraperPath}...`);
    console.log(`🐍 Usando intérprete Python: ${pythonExecutable}`);

    const pythonProcess = spawn(pythonExecutable, [scraperPath], {
        env: { 
            ...process.env, 
            PYTHONIOENCODING: 'utf-8',
            PROPERTIES_OUTPUT_DIR: PROPERTIES_DIR
        },
        shell: process.platform === 'win32' // shell:true solo en Windows para evitar problemas en Mac
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
            
            // Notificación de ÉXITO
            notifier.notify({
              title: 'Scraper Finalizado',
              message: `El proceso de scraping terminó correctamente.`,
              sound: 'Glass', // Sonido en Windows/macOS
              wait: false
            });

            // Lógica de consolidación
            const mainPropertiesFile = path.join(DATA_DIR, 'properties.json');

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
                
                notifier.notify({
                  title: 'Error en Scraper',
                  message: 'Datos inválidos generados.',
                  sound: 'Basso',
                  wait: false
                });

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

            // Detectar cuántas nuevas se añadieron realmente
            const actuallyAddedCount = uniqueProperties.length - existingProperties.length;
            
            if (actuallyAddedCount > 0) {
                 notifier.notify({
                  title: 'Nuevas Propiedades',
                  message: `Se han encontrado ${actuallyAddedCount} nuevas propiedades.`,
                  sound: 'Ping', // Sonido diferente para nuevos items
                  wait: false
                });
            }

            console.log(`✅ Consolidación completada: ${uniqueProperties.length} propiedades únicas.`);
            res.json({ success: true, message: 'Scraper y consolidación completados', output });

        } else {
            console.error(`❌ Scraper falló con código ${code}`);
            
            notifier.notify({
              title: 'Error Fatal en Scraper',
              message: `El proceso falló con código ${code}`,
              sound: 'Sosumi',
              wait: false
            });

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
    if (!fs.existsSync(IDEALISTA_SCRAPER)) {
        return res.status(404).json({ success: false, error: 'El scraper de Idealista no está instalado o no se encuentra el archivo.' });
    }
    runPythonScraper(IDEALISTA_SCRAPER, res);
});

// Limpiar archivos temporales
app.post('/api/config/cleanup', (req, res) => {
    try {
        const updateDir = path.join(DATA_DIR, 'update');
        const propertiesDir = PROPERTIES_DIR;
        
        let deletedCount = 0;
        let errors = [];

        // Función auxiliar para limpiar directorio
        const cleanDirectory = (dirPath) => {
            if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath);
                for (const file of files) {
                    try {
                        const filePath = path.join(dirPath, file);
                        // Verificar si es un archivo antes de borrar
                        if (fs.lstatSync(filePath).isFile()) {
                            fs.unlinkSync(filePath);
                            deletedCount++;
                        }
                    } catch (err) {
                        errors.push(`Error borrando ${file}: ${err.message}`);
                    }
                }
            }
        };

        cleanDirectory(updateDir);
        cleanDirectory(propertiesDir);

        if (errors.length > 0) {
            console.warn('Errores durante la limpieza:', errors);
            // Retornamos success true porque parcialmente funcionó, pero avisamos
            res.json({ success: true, message: `Limpieza completada con advertencias. ${deletedCount} archivos borrados.`, errors });
        } else {
            res.json({ success: true, message: `Limpieza completada. ${deletedCount} archivos borrados.` });
        }

    } catch (error) {
        console.error('Error crítico en limpieza:', error);
        res.status(500).json({ success: false, error: error.message });
    }
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
        const updateDir = path.join(DATA_DIR, 'update');
        if (!fs.existsSync(updateDir)) {
            fs.mkdirSync(updateDir, { recursive: true });
        }
        const tempUrlsFile = path.join(updateDir, `temp_urls_${Date.now()}.json`);
        fs.writeFileSync(tempUrlsFile, JSON.stringify(urls));
        console.log(`   📄 Archivo temporal creado: ${tempUrlsFile}`);

        // 2. Ejecutar scraper con el archivo de URLs
        // Determinar el ejecutable de Python
        let defaultPython = 'python';
        if (process.platform !== 'win32') {
            defaultPython = 'python3';
        }
        const pythonExecutable = process.env.PYTHON_PATH || defaultPython;

        const pythonProcess = spawn(pythonExecutable, [UPDATE_SCRAPER, tempUrlsFile], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', USER_DATA_PATH: BASE_PATH },
            shell: process.platform === 'win32'
        });

        let rawData = '';
        let errorData = '';

        pythonProcess.on('error', (err) => {
            console.error('❌ Error iniciando proceso Python:', err);
            // Intentar borrar archivo temporal si existe
            try { if (fs.existsSync(tempUrlsFile)) fs.unlinkSync(tempUrlsFile); } catch (e) { }
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
                const updateDir = path.join(DATA_DIR, 'update');
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
                } catch (e) { }
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

        // Contar nuevos clientes desde la salida stderr
        let newClientsCount = 0;
        try {
            const newClientMatches = errorData.match(/Nuevo cliente añadido/g);
            if (newClientMatches) {
                newClientsCount = newClientMatches.length;
            }
        } catch (e) {
            console.error("Error contando nuevos clientes:", e);
        }

        res.json({ success: true, updatedCount: successCount, newClientsCount });

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

// Importar clientes masivamente
app.post('/api/clients/batch', (req, res) => {
    try {
        const clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
        const newClients = req.body;

        if (!Array.isArray(newClients)) {
            return res.status(400).json({ error: 'El cuerpo debe ser un array de clientes' });
        }

        let addedCount = 0;
        let updatedCount = 0;
        const cleanPhone = (p) => (p || '').replace(/\D/g, '');

        newClients.forEach(newClient => {
            const newClientPhone = cleanPhone(newClient.phone);
            if (!newClientPhone) return;

            // Buscar si ya existe un cliente con este teléfono (comparando versiones limpias)
            const existingIndex = clients.findIndex(c => cleanPhone(c.phone) === newClientPhone);

            if (existingIndex !== -1) {
                // ACTUALIZAR (Upsert) - Solo campos relevantes del CSV, preservando datos locales
                const existing = clients[existingIndex];
                
                // Campos que permitimos actualizar desde el CSV si tienen valor
                const fieldsToUpdate = [
                    'name', 'contactName', 'location', 'adLink', 'status', 
                    'propertyType', 'whatsappLink', 'answered', 'response', 
                    'date', 'appointmentDate', 'phone'
                ];

                const updatedFields = {};
                fieldsToUpdate.forEach(field => {
                    if (newClient[field]) {
                        updatedFields[field] = newClient[field];
                    }
                });

                clients[existingIndex] = {
                    ...existing,
                    ...updatedFields,
                    // Asegurar que no sobrescribimos ID o historial
                    id: existing.id,
                    createdAt: existing.createdAt,
                    contactHistory: existing.contactHistory || [],
                    // Preservar email e intereses si el CSV no trae nuevos datos válidos
                    email: (newClient.email && newClient.email.length > 0) ? newClient.email : existing.email,
                    interest: (newClient.interest && newClient.interest !== 'Comprar') ? newClient.interest : existing.interest,
                    preferences: (newClient.preferences && newClient.preferences.length > 0) ? newClient.preferences : existing.preferences
                };
                updatedCount++;
            } else {
                // INSERTAR NUEVO
                clients.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    ...newClient,
                    createdAt: new Date().toISOString(),
                    contactHistory: []
                });
                addedCount++;
            }
        });

        fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));

        res.json({ 
            success: true, 
            count: addedCount, 
            updatedCount: updatedCount,
            totalProcessed: addedCount + updatedCount,
            message: `Importación: ${addedCount} nuevos, ${updatedCount} actualizados.` 
        });
    } catch (error) {
        console.error('Error importando clientes masivamente:', error);
        res.status(500).json({ error: 'Error importando clientes' });
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

// ============ CONFIGURACIÓN DE SCRAPER AUTOMÁTICO ============
const SCRAPER_CONFIG_FILE = path.join(DATA_DIR, 'scraper_config.json');
let autoScraperInterval = null;

// Ensure config file exists
if (!fs.existsSync(SCRAPER_CONFIG_FILE)) {
    try {
        fs.writeFileSync(SCRAPER_CONFIG_FILE, JSON.stringify({ fotocasa: { enabled: false, interval: "60" } }, null, 2));
    } catch (e) {
        console.error("Error creating scraper config file:", e);
    }
}

const loadScraperConfig = () => {
    try {
        if (fs.existsSync(SCRAPER_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(SCRAPER_CONFIG_FILE, 'utf8'));
        }
    } catch (error) {
        console.error("Error reading scraper config:", error);
    }
    return { fotocasa: { enabled: false, interval: "60" } };
};

const runAutoScrapers = async () => {
    console.log("⏰ Running auto scrapers...");
    
    // Determinar el ejecutable de Python
    let defaultPython = 'python';
    if (process.platform !== 'win32') {
        defaultPython = 'python3';
    }
    const pythonExecutable = process.env.PYTHON_PATH || defaultPython;
    
    const types = ['viviendas', 'terrenos', 'locales'];
    for (const type of types) {
        const scraperScript = `run_${type}_auto.py`;
        const scraperPath = path.join(__dirname, `scrapers/fotocasa/${scraperScript}`);
        if (fs.existsSync(scraperPath)) {
            console.log(`   ▶ Running ${scraperScript}...`);
             // We use a promise wrapper around spawn to await completion
            await new Promise((resolve) => {
                const process = spawn(pythonExecutable, [scraperPath], {
                    env: { 
                        ...process.env, 
                        PROPERTIES_OUTPUT_DIR: PROPERTIES_DIR
                    },
                    shell: process.platform === 'win32' // shell:true solo en Windows para evitar problemas en Mac
                });
                process.stdout.on('data', (data) => console.log(`[${type}] ${data}`));
                process.stderr.on('data', (data) => console.error(`[${type} ERROR] ${data}`));
                process.on('close', (code) => {
                    console.log(`[${type}] Finished with code ${code}`);
                    resolve();
                });
            });
        }
    }
    console.log("✅ Auto scrapers cycle completed.");
};

const setupAutoScraper = () => {
    // Clear existing interval
    if (autoScraperInterval) {
        clearInterval(autoScraperInterval);
        autoScraperInterval = null;
    }

    const config = loadScraperConfig();
    if (config.fotocasa && config.fotocasa.enabled) {
        const minutes = parseInt(config.fotocasa.interval);
        console.log(`⏰ Setting up auto scraper every ${minutes} minutes.`);
        
        autoScraperInterval = setInterval(runAutoScrapers, minutes * 60 * 1000);
    } else {
        console.log("⏰ Auto scraper is disabled.");
    }
};

// Initialize on startup
setupAutoScraper();

// Routes
app.get('/api/config/scraper', (req, res) => {
    res.json(loadScraperConfig());
});

app.post('/api/config/scraper', (req, res) => {
    const newConfig = req.body;
    try {
        fs.writeFileSync(SCRAPER_CONFIG_FILE, JSON.stringify(newConfig, null, 2));
        setupAutoScraper(); // Apply changes
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to save config" });
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
