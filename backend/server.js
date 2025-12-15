const Sentry = require('@sentry/node');
// --- INICIALIZACIÓN SENTRY BACKEND ---
Sentry.init({
    dsn: "https://15bf6ed890e254dc94272dd272911ddd@o4510509929857024.ingest.de.sentry.io/4510509939032144",
    tracesSampleRate: 1.0,
});
// -------------------------------------

const express = require('express');
const cors = require('cors');
const compression = require('compression'); // Para comprimir respuestas HTTP
const fs = require('fs');
const path = require('path');

// SQLite Database Manager
const sqliteManager = require('./db/sqlite-manager');
const { spawn, exec, execSync } = require('child_process');

// DEBUG: Loguear inicio
const LOG_FILE = path.join(process.env.USER_DATA_PATH || process.env.APPDATA || '.', 'backend_debug.log');
const log = (msg) => {
    try {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
    } catch (e) { }
};

log('🚀 Backend iniciando...');
log(`Node Version: ${process.version}`);
log(`Platform: ${process.platform}`);

process.on('uncaughtException', (err) => {
    log(`🔥 FATAL ERROR: ${err.message}\n${err.stack}`);
    console.error(err);
});

// Función para guardar la ruta de Python en .env
const savePythonPathToEnv = (newPath) => {
    if (!newPath) return;
    process.env.PYTHON_PATH = newPath;
    try {
        let envContent = '';
        if (fs.existsSync(ENV_FILE)) {
            envContent = fs.readFileSync(ENV_FILE, 'utf8');
        }

        // Reemplazar o agregar PYTHON_PATH
        if (envContent.includes('PYTHON_PATH=')) {
            envContent = envContent.replace(/^PYTHON_PATH=.*$/m, `PYTHON_PATH=${newPath}`);
        } else {
            envContent += `\nPYTHON_PATH=${newPath}`;
        }

        fs.writeFileSync(ENV_FILE, envContent);
        log(`✅ Ruta de Python guardada en .env: ${newPath}`);
    } catch (err) {
        log(`❌ Error guardando configuración de Python: ${err.message}`);
    }
};

// Función para buscar Python Bundled (Portable)
const getBundledPythonPath = () => {
    const potentialPaths = [];
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'python.exe' : path.join('bin', 'python3');

    // 1. Producción (Electron): resources/backend/python_env/...
    if (process.resourcesPath) {
        potentialPaths.push(path.join(process.resourcesPath, 'backend', 'python_env', binaryName));
    }

    // 2. Desarrollo / Relativo: backend/python_env/...
    potentialPaths.push(path.join(__dirname, 'python_env', binaryName));

    // 3. Fallback: Intentar subir un nivel si estamos en backend/
    potentialPaths.push(path.join(__dirname, '..', 'backend', 'python_env', binaryName));

    log(`🔍 Buscando Python Portable en: ${potentialPaths.join(', ')}`);

    for (const p of potentialPaths) {
        if (fs.existsSync(p)) {
            log(`✨ Python Portable ENCONTRADO y VALIDADO en: ${p}`);
            return p;
        }
    }

    log('⚠️ Python Portable NO encontrado en ninguna de las rutas esperadas.');
    return null;
};

// Función simplificada para buscar Python (Prioriza Portable)
const findBundledPython = () => {
    // 0. Primero buscar si tenemos el Python Portable incluido
    const bundledPath = getBundledPythonPath();
    if (bundledPath) {
        return bundledPath;
    }
    return null;
};

// Función para normalizar el comando para spawn con shell:false
const prepareSpawnCommand = (cmd, args) => {
    return { cmd, args };
};
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal'); // Para terminal (legacy/debug)
const QRCode = require('qrcode'); // Para generar QR en frontend
const nodemailer = require('nodemailer');
const axios = require('axios'); // Para verificar conexión y descargar updates
const notifier = require('node-notifier'); // Restaurado

const app = express();

// Sentry Setup for Express (v8+)
Sentry.setupExpressErrorHandler(app);

const getSystemBrowserPath = () => {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    if (platform === 'darwin') {
        // macOS: Lista extendida de navegadores Chromium-based
        // Incluye ubicaciones estándar y alternativas para sistemas legacy
        const commonPaths = [
            // Google Chrome
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            `${homeDir}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
            // Microsoft Edge
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            `${homeDir}/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`,
            // Brave Browser (popular alternativa)
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            `${homeDir}/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`,
            // Chromium (versión open source)
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            `${homeDir}/Applications/Chromium.app/Contents/MacOS/Chromium`,
            // Opera (también basado en Chromium)
            '/Applications/Opera.app/Contents/MacOS/Opera',
            // Vivaldi
            '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
            // Arc Browser
            '/Applications/Arc.app/Contents/MacOS/Arc',
        ];

        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                console.log(`🌐 Navegador detectado para WhatsApp (macOS): ${p}`);
                return p;
            }
        }

        // Fallback: Intentar encontrar Chrome via mdfind (Spotlight)
        try {
            const { execSync } = require('child_process');
            const result = execSync('mdfind "kMDItemCFBundleIdentifier == com.google.Chrome" 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
            if (result) {
                const chromePath = `${result}/Contents/MacOS/Google Chrome`;
                if (fs.existsSync(chromePath)) {
                    console.log(`🌐 Chrome encontrado via Spotlight: ${chromePath}`);
                    return chromePath;
                }
            }
        } catch (e) {
            // Spotlight search failed, continuar sin navegador específico
        }

        console.warn('⚠️ No se encontró ningún navegador Chromium en macOS. WhatsApp puede no funcionar.');
        return undefined;
    }

    if (platform === 'linux') {
        // Linux: Lista extendida de navegadores
        const commonPaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/snap/bin/chromium',
            '/usr/bin/brave-browser',
            '/usr/bin/microsoft-edge',
            '/usr/bin/microsoft-edge-stable',
            '/opt/google/chrome/chrome',
            '/opt/brave.com/brave/brave-browser',
            `${homeDir}/.local/bin/chrome`,
            `${homeDir}/.local/bin/chromium`,
        ];

        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                console.log(`🌐 Navegador detectado para WhatsApp (Linux): ${p}`);
                return p;
            }
        }

        // Fallback: Intentar encontrar con 'which'
        try {
            const { execSync } = require('child_process');
            for (const browser of ['google-chrome', 'chromium', 'chromium-browser', 'brave-browser']) {
                try {
                    const result = execSync(`which ${browser} 2>/dev/null`, { encoding: 'utf8' }).trim();
                    if (result && fs.existsSync(result)) {
                        console.log(`🌐 Navegador encontrado via which: ${result}`);
                        return result;
                    }
                } catch (e) {
                    // Continuar con el siguiente
                }
            }
        } catch (e) {
            // which command failed
        }

        console.warn('⚠️ No se encontró ningún navegador Chromium en Linux. WhatsApp puede no funcionar.');
        return undefined;
    }

    if (platform !== 'win32') {
        console.warn(`⚠️ Plataforma no reconocida: ${platform}`);
        return undefined;
    }

    // Windows: Lista extendida incluyendo ubicaciones de usuario
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const commonPaths = [
        // Edge
        `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
        // Chrome
        `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
        `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
        `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
        // Brave
        `${programFiles}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
        `${localAppData}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
        // Chromium
        `${localAppData}\\Chromium\\Application\\chrome.exe`,
        // Fallback hardcoded
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];

    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            console.log(`🌐 Navegador detectado para WhatsApp (Windows): ${p}`);
            return p;
        }
    }

    console.warn('⚠️ No se encontró ningún navegador Chromium en Windows. WhatsApp puede no funcionar.');
    return undefined;
};

// Función para buscar Chromium Bundled (Puppeteer)
const getBundledChromiumPath = () => {
    try {
        const isWin = process.platform === 'win32';
        // Nombres de ejecutables comunes
        const exeNames = isWin ? ['chrome.exe', 'chromium.exe'] : ['chrome', 'chromium', 'google-chrome'];

        // Rutas base posibles donde buscar la cache de puppeteer
        const searchPaths = [
            path.join(__dirname, '.cache', 'puppeteer'), // Desarrollo / Local
            path.join(process.resourcesPath || '', 'backend', '.cache', 'puppeteer') // Producción (Electron)
        ];

        // Función recursiva para buscar ejecutable
        const findExe = (dir) => {
            if (!fs.existsSync(dir)) return null;
            const items = fs.readdirSync(dir, { withFileTypes: true });

            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    // Recurse
                    const found = findExe(fullPath);
                    if (found) return found;
                } else if (exeNames.includes(item.name)) {
                    return fullPath;
                }
            }
            return null;
        };

        for (const searchPath of searchPaths) {
            if (fs.existsSync(searchPath)) {
                console.log(`🔍 Buscando Chromium Bundled en: ${searchPath}`);
                const found = findExe(searchPath);
                if (found) {
                    console.log(`✨ Chromium Bundled ENCONTRADO en: ${found}`);
                    return found;
                }
            }
        }

        console.warn('⚠️ No se encontró Chromium Bundled en ninguna ruta esperada.');
        return null;
    } catch (e) {
        console.error('❌ Error buscando Chromium Bundled:', e);
        return null;
    }
};

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
const getPythonExecutable = () => {
    // 1. PRIORIDAD ABSOLUTA: Buscar Python Portable (Bundled)
    // Siempre intentamos usar la versión empaquetada primero para evitar errores de sistema (Error 9009)
    // Ahora funciona en Windows, Mac y Linux
    const detected = findBundledPython();
    if (detected) {
        console.log(`💡 Usando Python Portable detectado: ${detected}`);
        // Actualizar ENV en memoria para consistencia
        if (process.env.PYTHON_PATH !== detected) {
            process.env.PYTHON_PATH = detected;
        }
        return detected;
    }

    // 2. Si no hay portable, verificar configuración manual en ENV
    if (process.env.PYTHON_PATH && process.env.PYTHON_PATH !== 'python') {
        if (fs.existsSync(process.env.PYTHON_PATH)) {
            console.log(`💡 Usando Python configurado en ENV: ${process.env.PYTHON_PATH}`);
            return process.env.PYTHON_PATH;
        } else {
            console.warn(`⚠️ Ruta PYTHON_PATH configurada no existe: ${process.env.PYTHON_PATH}.`);
        }
    }

    // 3. Fallback: Sistema
    console.warn('⚠️ No se encontró Python Portable ni configuración válida. Usando "python" del sistema.');
    return process.platform === 'win32' ? 'python' : 'python3';
};

const checkPythonDependencies = () => {
    const requirementsPath = path.join(__dirname, 'requirements.txt');
    const flagFile = path.join(__dirname, '.dependencies_installed');

    if (fs.existsSync(requirementsPath)) {
        // Optimización: Si el flag existe y es más reciente que requirements.txt, saltar
        if (fs.existsSync(flagFile)) {
            try {
                const reqStats = fs.statSync(requirementsPath);
                const flagStats = fs.statSync(flagFile);

                if (flagStats.mtime > reqStats.mtime) {
                    console.log('⚡ Dependencias de Python ya verificadas (caché).');
                    return;
                }
            } catch (e) { }
        }

        console.log('Checking dependencies...');

        const pythonExecutable = getPythonExecutable();
        console.log(`🔍 Usando Python para dependencias: ${pythonExecutable}`);

        // Intentar instalar dependencias
        // Asegurar que el path de python esté entre comillas si tiene espacios
        const safePythonExec = pythonExecutable.includes(' ') ? `"${pythonExecutable}"` : pythonExecutable;

        // Usar --no-warn-script-location y --disable-pip-version-check para acelerar
        exec(`${safePythonExec} -m pip install -r "${requirementsPath}" --disable-pip-version-check --no-warn-script-location`, (error, stdout, stderr) => {
            if (error) {
                console.warn('⚠️ No se pudieron instalar las dependencias de Python automáticamente.');
                console.warn('Si el scraper falla, asegúrate de tener instalado: selenium, beautifulsoup4, webdriver-manager');
                console.warn('Error:', error.message);
            } else {
                console.log('✅ Dependencias de Python verificadas/instaladas.');
                // Crear/Actualizar flag file
                try {
                    fs.writeFileSync(flagFile, new Date().toISOString());
                } catch (e) {
                    console.error('Error escribiendo flag de dependencias:', e);
                }
            }
        });
    }
};

// Manejo de errores globales para evitar cierres inesperados
process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', err);
    // No salimos del proceso para mantener el servidor vivo, pero logueamos el error crítico
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED REJECTION:', reason);

    // Auto-recuperación para error común de Puppeteer/WhatsApp
    if (reason && reason.message && reason.message.includes('Execution context was destroyed')) {
        console.log('♻️ Detectado error de contexto destruido. Reiniciando servicio de WhatsApp en 5s...');
        // Verificación básica para evitar bucles si ya se está reiniciando
        setTimeout(() => {
            // Intentar reiniciar si el cliente existe
            if (typeof whatsappClient !== 'undefined') {
                whatsappClient.destroy()
                    .then(() => initializeWhatsApp())
                    .catch(() => initializeWhatsApp());
            }
        }, 5000);
    }
});

// Ejecutar verificación en segundo plano al iniciar
checkPythonDependencies();

const PORT = 3001;

// --- CONFIGURACIÓN WHATSAPP LOCAL ---
// --- CONFIGURACIÓN WHATSAPP LOCAL ---
console.log('🔄 Inicializando cliente de WhatsApp...');

// Debug Browser Path
// Debug Browser Path
const browserPath = getSystemBrowserPath();
console.log(`🐛 [DEBUG] Browser Path detectado: ${browserPath || 'NINGUNO (Se intentará usar Puppeteer Bundled Chromium)'}`);

const whatsappClient = new Client({
    authStrategy: new LocalAuth({
        dataPath: DATA_DIR
    }),
    authTimeoutMs: 120000,
    qrMaxRetries: 0,
    // Fix: Forzar versión de WhatsApp Web para evitar bucles de QR o incompatibilidades
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        // Si browserPath es undefined, intentamos usar el bundled
        executablePath: browserPath || getBundledChromiumPath() || undefined,
        headless: true,
        dumpio: true, // Mostrar logs del navegador en consola
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-extensions',
            // Añadir estos flags para mejorar compatibilidad Windows
            '--disable-software-rasterizer',
            '--disable-gl-drawing-for-tests'
        ]
    }
});

let isWhatsAppReady = false;
let currentQR = null; // Guardar el QR actual para enviarlo al frontend

// Manejo robusto de eventos
whatsappClient.on('qr', (qr) => {
    console.log('\n=============================================================');
    console.log('⚠️  ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP PARA INICIAR SESIÓN:');
    console.log('=============================================================\n');
    try {
        qrcodeTerminal.generate(qr, { small: true });
    } catch (e) { console.log('QR en terminal omitido (no TTY)'); }

    whatsappState = 'SCAN_QR';
    qrAttempts++;

    // Generar Data URL para el frontend
    QRCode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('Error generando QR para frontend:', err);
        } else {
            currentQR = url;
            console.log('✅ QR generado correctamente para mostrar en frontend.');
        }
    });
});

whatsappClient.on('loading_screen', (percent, message) => {
    console.log(`⏳ WhatsApp Cargando: ${percent}% - ${message}`);
    whatsappState = 'INITIALIZING';
});

whatsappClient.on('ready', () => {
    console.log('\n✅ Cliente de WhatsApp conectado y listo para enviar mensajes!\n');
    isWhatsAppReady = true;
    whatsappState = 'CONNECTED';
    currentQR = null; // Ya no se necesita QR
});

whatsappClient.on('authenticated', () => {
    console.log('✅ WhatsApp autenticado correctamente');
    whatsappState = 'CONNECTED';
});

whatsappClient.on('auth_failure', msg => {
    console.error('❌ Error de autenticación de WhatsApp:', msg);
    currentQR = null;
    isWhatsAppReady = false;
    whatsappState = 'ERROR';
});

whatsappClient.on('disconnected', (reason) => {
    console.log('❌ WhatsApp desconectado:', reason);
    isWhatsAppReady = false;
    whatsappState = 'DISCONNECTED';
    currentQR = null;
    // Reinicializar para permitir reconexión
    try {
        whatsappClient.initialize().catch(err => console.error('Error reinicializando WhatsApp tras desconexión:', err));
    } catch (e) {
        console.error('Excepción al intentar reinicializar WhatsApp:', e);
    }
});

// Variables de estado global
let whatsappState = 'INITIALIZING'; // INITIALIZING, SCAN_QR, CONNECTED, DISCONNECTED, ERROR
let qrAttempts = 0;

// Inicialización segura con reintentos
const initializeWhatsApp = async () => {
    try {
        console.log('🔄 Inicializando cliente de WhatsApp...');
        whatsappState = 'INITIALIZING';
        qrAttempts = 0;

        await whatsappClient.initialize();
    } catch (err) {
        console.error('❌ Error fatal al inicializar WhatsApp Client:', err);

        // Intento de recuperación: Si falla con el navegador del sistema, intentar sin executablePath
        if (err.message && err.message.includes('Failed to launch the browser process') && browserPath) {
            console.log('⚠️ Detectado fallo al lanzar navegador del sistema. Reintentando con Puppeteer Bundled Chromium...');

            // Reiniciar cliente con executablePath undefined
            try {
                // Destruir cliente anterior si es posible (aunque initialize falló)
                try { await whatsappClient.destroy(); } catch (e) { }

                // Reconfigurar puppeteer options
                whatsappClient.options.puppeteer = {
                    ...whatsappClient.options.puppeteer,
                    executablePath: undefined
                };

                console.log('🔄 Reintentando inicialización con navegador bundled...');
                await whatsappClient.initialize();
                return; // Éxito en el segundo intento
            } catch (retryErr) {
                console.error('❌ También falló el intento con navegador bundled:', retryErr);
            }
        }

        whatsappState = 'ERROR';
        // Reintentar en 10 segundos
        setTimeout(initializeWhatsApp, 10000);
    }
};

try {
    initializeWhatsApp();
} catch (error) {
    console.error('❌ Excepción síncrona al inicializar WhatsApp:', error);
    whatsappState = 'ERROR';
}

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
app.use(compression()); // Comprimir todas las respuestas HTTP
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Aumentar límite para importaciones masivas

// Ruta raíz para verificación simple
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Inmobiliaria Manager Backend is running',
        version: require('./package.json').version
    });
});

// Rutas GET de ayuda para endpoints que requieren POST (evita confusión "Cannot GET")
app.get('/api/scraper/fotocasa/run', (req, res) => {
    res.status(405).json({ error: 'Method Not Allowed', message: 'This endpoint requires a POST request. Use the application interface to run scrapers.' });
});
app.get('/api/scraper/idealista/run', (req, res) => {
    res.status(405).json({ error: 'Method Not Allowed', message: 'This endpoint requires a POST request. Use the application interface to run scrapers.' });
});

// ============ RUTAS DE CONFIGURACIÓN ============

// Obtener estado de servicios y QR
app.get('/api/config/status', (req, res) => {
    // Si estamos en estado SCAN_QR pero no hay imagen QR, loguear para depuración
    if (whatsappState === 'SCAN_QR' && !currentQR) {
        console.warn('⚠️ Estado es SCAN_QR pero currentQR es null. Esperando generación...');
    }

    res.json({
        whatsapp: {
            ready: isWhatsAppReady,
            qr: currentQR,
            state: whatsappState, // Nuevo campo de estado detallado
            attempts: qrAttempts
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

    // Usar la función helper para guardar y actualizar variable en memoria
    savePythonPathToEnv(pythonPath);

    res.json({ success: true });
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

// Resetear WhatsApp (Borrar sesión y reiniciar) - Útil si se queda trabado o corrupto
app.post('/api/config/whatsapp/reset', async (req, res) => {
    try {
        console.log('🔄 Solicitud de RESET COMPLETO de WhatsApp recibida...');

        // 1. Destruir cliente actual
        try {
            await whatsappClient.destroy();
            console.log('Cliente destruido.');
        } catch (e) { }

        isWhatsAppReady = false;
        currentQR = null;
        whatsappState = 'INITIALIZING';

        // 2. Borrar carpeta de sesión
        const sessionPath = path.join(DATA_DIR, '.wwebjs_auth');
        console.log(`🗑️ Eliminando datos de sesión en: ${sessionPath}`);
        if (fs.existsSync(sessionPath)) {
            // Reintentos para borrar en Windows si el archivo está en uso
            try {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log('✅ Datos de sesión eliminados.');
            } catch (rmError) {
                console.error("Error borrando carpeta de sesión (posiblemente bloqueada):", rmError);
                // Si falla, intentamos renombrarla para que no moleste en el siguiente arranque
                try {
                    fs.renameSync(sessionPath, path.join(DATA_DIR, `.wwebjs_auth_bak_${Date.now()}`));
                    console.log('⚠️ Carpeta renombrada en lugar de borrada.');
                } catch (renError) { }
            }
        }

        // 3. Reiniciar
        setTimeout(() => {
            console.log('🚀 Reiniciando cliente tras reset...');
            initializeWhatsApp();
        }, 3000);

        res.json({ success: true, message: 'WhatsApp reseteado correctamente. Espera unos segundos al nuevo QR.' });

    } catch (error) {
        console.error('Error crítico reseteando WhatsApp:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rutas a los archivos
const PROPERTIES_DIR = path.join(DATA_DIR, 'properties');

const IDEALISTA_SCRAPER = path.join(__dirname, 'scrapers/idealista/run_idealista_scraper.py');
// const CLIENTS_FILE = path.join(DATA_DIR, 'clients/clients.json'); // LEGACY

// const PROPERTIES_JSON_FILE = path.join(DATA_DIR, 'properties.json'); // LEGACY

// Asegurar que existen las carpetas
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
} catch (e) {
    console.error('Error escribiendo debug info:', e);
}

// const dataClientsDir = path.join(DATA_DIR, 'clients'); // LEGACY
// if (!fs.existsSync(dataClientsDir)) {
//    fs.mkdirSync(dataClientsDir, { recursive: true });
// }
// if (!fs.existsSync(CLIENTS_FILE)) {
//    fs.writeFileSync(CLIENTS_FILE, JSON.stringify([], null, 2));
// }
// Asegurar que el directorio de propiedades existe
if (!fs.existsSync(PROPERTIES_DIR)) {
    fs.mkdirSync(PROPERTIES_DIR, { recursive: true });
}
// Asegurar que el archivo de propiedades consolidado existe
// if (!fs.existsSync(PROPERTIES_JSON_FILE)) {
//    fs.writeFileSync(PROPERTIES_JSON_FILE, JSON.stringify([], null, 2));
// }

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

// Obtener todas las propiedades desde SQLite
app.get('/api/properties', (req, res) => {
    try {
        // Extraer parámetros de paginación y filtros
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 500; // Default alto para compatibilidad
        const filters = {};

        if (req.query.property_type) filters.property_type = req.query.property_type;
        if (req.query.source) filters.source = req.query.source;
        if (req.query.location) filters.location = req.query.location;
        if (req.query.minPrice) filters.minPrice = parseInt(req.query.minPrice);
        if (req.query.maxPrice) filters.maxPrice = parseInt(req.query.maxPrice);
        if (req.query.search) filters.search = req.query.search;

        // Obtener propiedades desde SQLite
        const result = sqliteManager.getAllProperties({ page, limit, filters });

        // Calcular timeago dinámico y mapear campos al formato del frontend
        const propertiesWithDetails = result.properties.map(prop => {
            const { publicationDate, displayTimeago } = calculatePublicationDetails(
                prop.scrape_date,
                prop.timeago
            );

            // Parsear extra_data para obtener campos adicionales
            const extraData = prop.extra_data || {};

            return {
                // ID y URL (fundamentales)
                id: prop.id,
                url: prop.url,

                // Campos con nombres que espera el frontend
                Title: prop.title || extraData.Title || '',
                Price: prop.price || extraData.Price || 'A consultar',
                Description: prop.description || extraData.Description || '',
                imgurl: prop.image_url || extraData.imgurl || 'None',

                // Detalles de la propiedad
                hab: prop.habitaciones || extraData.hab || 'None',
                m2: prop.metros || extraData.m2 || 'None',
                Municipality: prop.location || prop.direccion || extraData.Municipality || '',
                Advertiser: extraData.Advertiser || '',
                Phone: prop.phone || extraData.Phone || 'None',

                // Metadatos
                property_type: prop.property_type || '',
                source: prop.source || 'Fotocasa',
                Timeago: displayTimeago,
                publicationDate: publicationDate,
                scrape_date: prop.scrape_date,
                lastUpdated: prop.last_updated,

                // Campos adicionales para compatibilidad total
                features: prop.features || [],
                ...extraData // Incluir cualquier otro campo que venga de extra_data
            };
        });

        // Si se solicita paginación explícita, devolver con metadatos
        if (req.query.page || req.query.limit) {
            res.json({
                properties: propertiesWithDetails,
                pagination: result.pagination
            });
        } else {
            // Compatibilidad: devolver solo el array
            res.json(propertiesWithDetails);
        }
    } catch (error) {
        console.error('Error obteniendo propiedades desde SQLite:', error);
        res.status(500).json({ error: 'Error leyendo propiedades' });
    }
});

// Obtener estadísticas de la base de datos
app.get('/api/stats', (req, res) => {
    try {
        const stats = sqliteManager.getDatabaseStats();
        res.json(stats);
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }
});

// Función para procesar un archivo JSON de propiedades de forma segura (evitando condiciones de carrera)
const processJsonFile = (filePath) => {
    const fileName = path.basename(filePath);
    const processingPath = filePath + '.processing';

    try {
        // Intentar renombrar para bloquear el archivo (atomic operation)
        fs.renameSync(filePath, processingPath);
    } catch (e) {
        // Si falla el renombrado, es que otro proceso (watcher o api) ya lo tomó
        return null;
    }

    try {
        console.log(`🔄 Procesando archivo de propiedades: ${fileName}`);
        const content = fs.readFileSync(processingPath, 'utf-8');

        // Validar JSON vacío
        if (!content.trim()) {
            fs.unlinkSync(processingPath);
            return { inserted: 0, updated: 0, error: 'Archivo vacío' };
        }

        const data = JSON.parse(content);

        // Normalizar estructura
        let propertiesArray = [];
        let source = 'Importado';
        let propertyType = 'vivienda';

        if (Array.isArray(data)) {
            propertiesArray = data;
        } else if (data.properties && Array.isArray(data.properties)) {
            propertiesArray = data.properties;
            source = data.source || source;
            propertyType = data.property_type || propertyType;
        }

        let result = { inserted: 0, updated: 0 };

        if (propertiesArray.length > 0) {
            // Mapear
            const toInsert = propertiesArray.map(prop => ({
                ...prop,
                property_type: prop.property_type || propertyType,
                source: prop.source || source,
                scrape_date: prop.scrape_date || data.scrape_date || new Date().toISOString()
            }));

            result = sqliteManager.bulkInsertProperties(toInsert);
            console.log(`   ✅ [Import] ${fileName}: ${result.inserted} insertadas, ${result.updated} actualizadas`);
        }

        // NO eliminar archivo procesado - Moverlo a carpeta 'processed' para mantener historial
        try {
            const processedDir = path.join(PROPERTIES_DIR, 'processed');
            if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });
            const processedPath = path.join(processedDir, fileName);
            fs.renameSync(processingPath, processedPath);
            console.log(`   📦 Archivo movido a: processed/${fileName}`);
        } catch (e) {
            console.error(`   ⚠️ Error moviendo archivo procesado: ${e.message}`);
            // Si hay error moviendo, intentar al menos borrarlo para no bloquearlo
            try { fs.unlinkSync(processingPath); } catch (e2) { }
        }
        return result;

    } catch (err) {
        console.error(`❌ Error procesando ${fileName}:`, err);
        // Mover a carpeta de error
        try {
            const errorDir = path.join(PROPERTIES_DIR, 'errors');
            if (!fs.existsSync(errorDir)) fs.mkdirSync(errorDir);
            fs.renameSync(processingPath, path.join(errorDir, fileName));
        } catch (e) { }
        return { inserted: 0, updated: 0, error: err.message };
    }
};

// Función para escanear y consolidar carpeta de propiedades
const consolidatePropertiesFolder = () => {
    if (!fs.existsSync(PROPERTIES_DIR)) return { inserted: 0, updated: 0, filesProcessed: 0 };

    const files = fs.readdirSync(PROPERTIES_DIR)
        .filter(file => file.endsWith('.json') && (file.startsWith('fotocasa') || file.startsWith('idealista')));

    let totalInserted = 0;
    let totalUpdated = 0;
    let filesProcessed = 0;

    for (const file of files) {
        const result = processJsonFile(path.join(PROPERTIES_DIR, file));
        if (result) {
            totalInserted += result.inserted;
            totalUpdated += result.updated;
            filesProcessed++;
        }
    }

    if (totalInserted > 0) {
        notifier.notify({
            title: 'Nuevas Propiedades',
            message: `Se han importado ${totalInserted} nuevas propiedades automáticamente.`,
            sound: 'Ping',
            wait: false
        });
    }

    return { inserted: totalInserted, updated: totalUpdated, filesProcessed };
};

// Watcher: Intervalo de chequeo automático (cada 15 segundos)
setInterval(() => {
    try {
        consolidatePropertiesFolder();
    } catch (e) {
        console.error('Error en watcher de propiedades:', e);
    }
}, 15000);

// Función auxiliar para ejecutar un scraper de Python
const runPythonScraper = (scraperPath, res, scraperId) => {
    // Determinar el ejecutable de Python
    const pythonExecutable = getPythonExecutable();

    console.log(`🚀 Iniciando scraper desde ${scraperPath} (ID: ${scraperId})...`);
    console.log(`🐍 Usando intérprete Python: ${pythonExecutable}`);

    const pythonProcess = spawn(pythonExecutable, [scraperPath], {
        env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PROPERTIES_OUTPUT_DIR: PROPERTIES_DIR
        },
        shell: false // IMPORTANTE: shell:false evita problemas con espacios en rutas en Windows si pasamos el ejecutable directo
    });

    // Guardar referencia si hay ID
    if (scraperId) {
        activeScrapers.set(scraperId, { process: pythonProcess, res });
    }

    // Manejo explícito de errores de spawn (ej. ejecutable no encontrado)
    pythonProcess.on('error', (err) => {
        console.error('❌ Error CRÍTICO al iniciar proceso Python:', err);
        errorOutput += `\nError al iniciar proceso: ${err.message}\nVerifica que Python esté instalado y en el PATH o configurado en .env`;

        // Si el error es ENOENT o 9009, es muy probable que la ruta de Python sea incorrecta.
        if (err.code === 'ENOENT' || err.errno === 'ENOENT' || err.code === 9009) {
            console.error(`⚠️ La ruta de Python falló: ${pythonExecutable}`);
            // Opcional: Podríamos intentar limpiar la variable de entorno si falla, pero es arriesgado automáticamente.
        }
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
        // Limpiar del mapa si existe
        if (scraperId && activeScrapers.has(scraperId)) {
            activeScrapers.delete(scraperId);
        }

        if (code === 0) {
            console.log(`✅ Scraper completado exitosamente`);

            // Notificación de ÉXITO
            notifier.notify({
                title: 'Scraper Finalizado',
                message: `El proceso de scraping terminó correctamente.`,
                sound: 'Glass', // Sonido en Windows/macOS
                wait: false
            });

            // Lógica de consolidación unificada
            // Intentamos procesar inmediatamente para dar respuesta al usuario
            const stats = consolidatePropertiesFolder();

            console.log(`✅ Consolidación completada: ${sqliteManager.getPropertiesCount()} propiedades en SQLite.`);
            res.json({
                success: true,
                message: 'Scraper y consolidación completados',
                output,
                stats: {
                    inserted: stats.inserted,
                    updated: stats.updated,
                    total: sqliteManager.getPropertiesCount()
                }
            });

        } else {
            console.error(`❌ Scraper falló con código ${code}`);

            notifier.notify({
                title: 'Error Fatal en Scraper',
                message: `El proceso falló con código ${code}`,
                sound: 'Sosumi',
                wait: false
            });

            // Construir un mensaje de error más útil
            let errorMessage = 'Error ejecutando scraper';
            if (code === 9009 || (errorOutput && errorOutput.includes('not recognized'))) {
                errorMessage = 'Python no encontrado en el sistema (Error 9009). Por favor, instala Python y agrégalo al PATH, o configúralo en el menú de ajustes.';
            } else if (errorOutput) {
                errorMessage = `Error del script: ${errorOutput.slice(0, 300)}...`; // Limitar longitud
            }

            res.status(500).json({
                success: false,
                error: errorMessage,
                output: output,
                errorDetails: errorOutput,
                pythonUsed: pythonExecutable
            });
        }
    });

    pythonProcess.on('error', (error) => {
        console.error('❌ Error iniciando scraper:', error);
        res.status(500).json({ success: false, error: 'Error iniciando scraper: ' + error.message });
    });
};

/**
 * IMPORTANTE: Nueva ruta para recibir datos de scrapers externos (auto)
 * Permite que scripts Python envíen datos directamente a SQLite
 */
app.post('/api/properties/import', (req, res) => {
    const { properties, source, type } = req.body;

    if (!properties || !Array.isArray(properties) || properties.length === 0) {
        return res.status(400).json({ success: false, error: 'No se recibieron propiedades válidas' });
    }

    console.log(`📥 Importando ${properties.length} propiedades externas (${source || 'Desconocido'} - ${type || 'Varios'})...`);

    // Normalizar datos
    const propertiesToInsert = properties.map(p => ({
        ...p,
        source: source || p.source || 'Importado',
        property_type: type || p.property_type || 'vivienda',
        scrape_date: p.scrape_date || new Date().toISOString()
    }));

    try {
        const result = sqliteManager.bulkInsertProperties(propertiesToInsert);
        console.log(`   ✅ Importación completada: ${result.inserted} nuevas, ${result.updated} actualizadas`);

        // Notificar si hay nuevas
        if (result.inserted > 0) {
            notifier.notify({
                title: 'Propiedades Importadas',
                message: `Se han importado ${result.inserted} nuevas propiedades.`,
                sound: 'Ping'
            });
        }

        res.json({
            success: true,
            stats: result
        });
    } catch (error) {
        console.error('❌ Error importando propiedades:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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

    const scraperId = `fotocasa_${type}`;
    runPythonScraper(scraperPath, res, scraperId);
});

// Almacén de procesos activos
const activeScrapers = new Map(); // Clave: scraperName, Valor: { process, res }

// Ejecutar el scraper de Idealista
app.post('/api/scraper/idealista/run', (req, res) => {
    if (!fs.existsSync(IDEALISTA_SCRAPER)) {
        return res.status(404).json({ success: false, error: 'El scraper de Idealista no está instalado o no se encuentra el archivo.' });
    }
    // Usamos 'idealista' como ID único
    runPythonScraper(IDEALISTA_SCRAPER, res, 'idealista');
});

// Detener un scraper en ejecución
app.post('/api/scraper/stop', async (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Nombre del scraper requerido' });
    }

    const processInfo = activeScrapers.get(name);
    if (processInfo && processInfo.process) {
        console.log(`🛑 Deteniendo scraper manual: ${name}`);

        try {
            // 1. IMPORTANTE: Consolidar datos ANTES de matar el proceso
            console.log('📦 Consolidando datos extraídos antes de detener...');
            const stats = consolidatePropertiesFolder();
            console.log(`   ✅ Consolidación: ${stats.inserted} nuevas, ${stats.updated} actualizadas, ${stats.filesProcessed} archivos procesados`);

            // 2. Matar el proceso
            processInfo.process.kill();

            // 3. Eliminar del mapa
            activeScrapers.delete(name);

            // 4. Responder a la petición original si aún está pendiente
            if (processInfo.res && !processInfo.res.headersSent) {
                processInfo.res.json({
                    success: true,
                    stopped: true,
                    message: `Scraper detenido. Se guardaron ${stats.inserted} propiedades nuevas.`,
                    stats: {
                        inserted: stats.inserted,
                        updated: stats.updated,
                        total: sqliteManager.getPropertiesCount()
                    }
                });
            }

            res.json({
                success: true,
                message: `Scraper ${name} detenido. Datos guardados: ${stats.inserted} nuevas propiedades.`,
                stats: {
                    inserted: stats.inserted,
                    updated: stats.updated,
                    filesProcessed: stats.filesProcessed,
                    total: sqliteManager.getPropertiesCount()
                }
            });
        } catch (e) {
            console.error(`Error deteniendo proceso ${name}:`, e);
            res.status(500).json({ error: `Error al detener proceso: ${e.message}` });
        }
    } else {
        res.status(404).json({ error: 'No hay scraper activo con ese nombre' });
    }
});

// Limpiar archivos temporales
app.post('/api/config/cleanup', (req, res) => {
    try {
        const updateDir = path.join(DATA_DIR, 'update');

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

        // SOLO limpiar la carpeta de update (archivos temporales)
        // NO tocar los archivos de propiedades ya que ahora se mantienen como historial
        cleanDirectory(updateDir);

        if (errors.length > 0) {
            console.warn('Errores durante la limpieza:', errors);
            // Retornamos success true porque parcialmente funcionó, pero avisamos
            res.json({ success: true, message: `Limpieza completada con advertencias. ${deletedCount} archivos borrados.`, errors });
        } else {
            res.json({ success: true, message: `Limpieza completada. ${deletedCount} archivos temporales borrados.` });
        }

    } catch (error) {
        console.error('Error crítico en limpieza:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Limpiar archivos procesados (historial de propiedades ya importadas)
app.post('/api/config/cleanup-processed', (req, res) => {
    try {
        const processedDir = path.join(PROPERTIES_DIR, 'processed');

        let deletedCount = 0;
        let errors = [];

        if (fs.existsSync(processedDir)) {
            const files = fs.readdirSync(processedDir);
            for (const file of files) {
                try {
                    const filePath = path.join(processedDir, file);
                    if (fs.lstatSync(filePath).isFile()) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                } catch (err) {
                    errors.push(`Error borrando ${file}: ${err.message}`);
                }
            }
        }

        if (errors.length > 0) {
            console.warn('Errores durante la limpieza de procesados:', errors);
            res.json({ success: true, message: `${deletedCount} archivos procesados borrados (con advertencias).`, errors });
        } else {
            res.json({ success: true, message: `${deletedCount} archivos procesados borrados correctamente.` });
        }

    } catch (error) {
        console.error('Error crítico en limpieza de procesados:', error);
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
        // Determinar el ejecutable de Python usando la función centralizada
        const pythonExecutable = getPythonExecutable();

        console.log(`🚀 Iniciando Update Scraper con: ${pythonExecutable}`);

        const pythonProcess = spawn(pythonExecutable, [UPDATE_SCRAPER, tempUrlsFile], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', USER_DATA_PATH: BASE_PATH },
            shell: false
        });

        pythonProcess.on('error', (err) => {
            console.error('❌ Error CRÍTICO al iniciar update scraper:', err);
            // No podemos hacer mucho más aquí ya que es un proceso detached/async en este contexto
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
        /* LEGACY: Eliminado para usar solo SQLite
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
        */

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

// Obtener todos los clientes desde SQLite
app.get('/api/clients', (req, res) => {
    try {
        // Soportar paginación y filtros opcionales
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 1000; // Default alto para compatibilidad
        const filters = {};

        if (req.query.status) filters.status = req.query.status;
        if (req.query.property_type) filters.property_type = req.query.property_type;
        if (req.query.search) filters.search = req.query.search;

        // Si se piden con paginación explícita
        if (req.query.page || req.query.limit) {
            const result = sqliteManager.getAllClients({ page, limit, filters });
            res.json({
                clients: result.clients,
                pagination: result.pagination
            });
        } else {
            // Compatibilidad: devolver array simple
            const clients = sqliteManager.getAllClientsSimple();
            res.json(clients);
        }
    } catch (error) {
        console.error('Error obteniendo clientes desde SQLite:', error);
        res.status(500).json({ error: 'Error leyendo clientes' });
    }
});

// Agregar un nuevo cliente
app.post('/api/clients', (req, res) => {
    try {
        const newClient = sqliteManager.insertClient(req.body);
        res.json(newClient);
    } catch (error) {
        console.error('Error añadiendo cliente:', error);
        res.status(500).json({ error: 'Error añadiendo cliente' });
    }
});

// Importar clientes masivamente usando SQLite
app.post('/api/clients/batch', (req, res) => {
    try {
        const newClients = req.body;

        if (!Array.isArray(newClients)) {
            return res.status(400).json({ error: 'El cuerpo debe ser un array de clientes' });
        }

        // Usar la función de bulk upsert de SQLite
        const result = sqliteManager.bulkUpsertClients(newClients);

        res.json({
            success: true,
            count: result.added,
            updatedCount: result.updated,
            totalProcessed: result.added + result.updated,
            message: `Importación: ${result.added} nuevos, ${result.updated} actualizados.`
        });
    } catch (error) {
        console.error('Error importando clientes masivamente:', error);
        res.status(500).json({ error: 'Error importando clientes' });
    }
});

// Actualizar un cliente
app.put('/api/clients/:id', (req, res) => {
    try {
        const client = sqliteManager.getClientById(req.params.id);

        if (!client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        sqliteManager.updateClient(req.params.id, req.body);

        // Obtener el cliente actualizado
        const updatedClient = sqliteManager.getClientById(req.params.id);
        res.json(updatedClient);
    } catch (error) {
        console.error('Error actualizando cliente:', error);
        res.status(500).json({ error: 'Error actualizando cliente' });
    }
});

// Eliminar un cliente
app.delete('/api/clients/:id', (req, res) => {
    try {
        const result = sqliteManager.deleteClient(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

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
                'X-Title': 'Inmobiliaria Manager'
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
                // Obtener el cliente y su historial actual
                const client = sqliteManager.getClientById(clientId);

                if (client) {
                    const contactHistory = client.contactHistory || [];
                    contactHistory.push({
                        date: new Date().toISOString(),
                        propertyUrl: propertyUrl || 'Multiple/General',
                        channel: channels,
                        message: message.substring(0, 100) + '...', // Guardar preview
                        status: results
                    });

                    // Actualizar el cliente con el nuevo historial
                    sqliteManager.updateClient(clientId, { contactHistory });

                    // También guardar en la tabla de mensajes para mejor tracking
                    sqliteManager.saveMessage(clientId, channels, message, 'sent');

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

    // Usar la función centralizada para obtener el ejecutable de Python
    const pythonExecutable = getPythonExecutable();

    const types = ['viviendas', 'terrenos', 'locales'];
    for (const type of types) {
        const scraperScript = `run_${type}_auto.py`;
        const scraperPath = path.join(__dirname, `scrapers/fotocasa/${scraperScript}`);
        if (fs.existsSync(scraperPath)) {
            console.log(`   ▶ Running ${scraperScript}...`);
            // We use a promise wrapper around spawn to await completion
            await new Promise((resolve) => {
                const child = spawn(pythonExecutable, [scraperPath], {
                    env: {
                        ...process.env,
                        PROPERTIES_OUTPUT_DIR: PROPERTIES_DIR
                    },
                    shell: false
                });
                child.on('error', (err) => console.error(`[${type}] Error spawn:`, err));
                child.stdout.on('data', (data) => console.log(`[${type}] ${data}`));
                child.stderr.on('data', (data) => console.error(`[${type} ERROR] ${data}`));
                child.on('close', (code) => {
                    console.log(`[${type}] Finished with code ${code}`);
                    resolve();
                });
            });
        }
    }
    console.log("✅ Auto scrapers cycle completed.");

    // IMPORTANTE: Consolidar datos inmediatamente después de completar los scrapers
    try {
        console.log("📦 Consolidando datos de scrapers automáticos...");
        const stats = consolidatePropertiesFolder();
        console.log(`   ✅ Consolidación automática: ${stats.inserted} nuevas, ${stats.updated} actualizadas, ${stats.filesProcessed} archivos procesados`);

        // Notificar solo si hay propiedades nuevas
        if (stats.inserted > 0) {
            notifier.notify({
                title: 'Scraper Automático',
                message: `Se encontraron ${stats.inserted} nuevas propiedades automáticamente.`,
                sound: 'Ping',
                wait: false
            });
        }
    } catch (error) {
        console.error('❌ Error consolidando datos auto:', error);
    }
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
