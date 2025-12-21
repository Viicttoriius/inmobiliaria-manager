const Sentry = require('@sentry/node');
const path = require('path');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');

// Definir directorio de scrapers
const SCRAPERS_DIR = path.join(__dirname, 'scrapers');

// Cargar variables de entorno con prioridad:
// 1. process.env (ya cargado por sistema)
// 2. USER_DATA_PATH/.env (configuración persistente en producción)
// 3. .env local (desarrollo)
if (process.env.USER_DATA_PATH) {
    require('dotenv').config({ path: path.join(process.env.USER_DATA_PATH, '.env') });
}
require('dotenv').config();

// --- INICIALIZACIÓN SENTRY BACKEND ---
Sentry.init({
    dsn: "https://15bf6ed890e254dc94272dd272911ddd@o4510509929857024.ingest.de.sentry.io/4510509939032144",
    tracesSampleRate: 1.0,
    beforeSend(event, hint) {
                const error = hint.originalException;
                if (error) {
                    const errorMessage = (error.message || error.toString() || '').toLowerCase();
                    
                    // Filtrar errores conocidos de Puppeteer / WhatsApp que son ruido
                    if (
                        errorMessage.includes('navigation failed because browser has disconnected') ||
                        errorMessage.includes('protocol error') ||
                        errorMessage.includes('target closed') ||
                        errorMessage.includes('session closed') ||
                        errorMessage.includes('browser process') ||
                        errorMessage.includes('waiting for target failed: timeout')
                    ) {
                        return null; // Ignorar este evento
                    }
                }
                return event;
            }
});
// -------------------------------------

const express = require('express');
const cors = require('cors');
const compression = require('compression'); // Para comprimir respuestas HTTP
const fs = require('fs');

// SQLite Database Manager
const sqliteManager = require('./db/sqlite-manager');
const whatsappScripts = require('./templates/whatsappScripts');
const emailService = require('./services/emailService');
const { spawn, exec, execSync } = require('child_process');

// DEBUG: Loguear inicio
const LOG_FILE = path.join(process.env.USER_DATA_PATH || process.env.APPDATA || '.', 'backend_debug.log');

// Rotación de logs simple al inicio: Si supera 5MB, reiniciar
try {
    if (fs.existsSync(LOG_FILE)) {
        const stats = fs.statSync(LOG_FILE);
        if (stats.size > 5 * 1024 * 1024) { // 5MB
            const backupPath = LOG_FILE + '.old';
            if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
            fs.renameSync(LOG_FILE, backupPath);
            console.log('📝 Log rotado debido al tamaño.');
        }
    }
} catch (e) {
    console.error('Error rotando logs:', e);
}

const log = (msg) => {
    try {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
    } catch (e) { 
        // Si falla escribir (ej. disco lleno), intentar liberar espacio borrando el .old
        if (e.code === 'ENOSPC') {
            try {
                const backupPath = LOG_FILE + '.old';
                if (fs.existsSync(backupPath)) {
                    fs.unlinkSync(backupPath);
                    // Reintentar una vez
                    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg} (Recovered from ENOSPC)\n`);
                }
            } catch (err) {}
        }
    }
};

log('🚀 Backend iniciando...');
log(`Node Version: ${process.version}`);
log(`Platform: ${process.platform}`);

process.on('uncaughtException', (err) => {
    log(`🔥 FATAL ERROR: ${err.message}\n${err.stack}`);
    console.error(err);
    Sentry.captureException(err);
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

// Sentry Setup for Express (Error Handler)
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
        // Nombres de ejecutables comunes (incluyendo chrome-headless-shell para nuevas versiones de Puppeteer)
        const exeNames = isWin 
            ? ['chrome.exe', 'chromium.exe', 'chrome-headless-shell.exe'] 
            : ['chrome', 'chromium', 'google-chrome', 'chrome-headless-shell', 'Google Chrome', 'Chromium'];

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
    Sentry.captureException(err);
    // No salimos del proceso para mantener el servidor vivo, pero logueamos el error crítico
});

process.on('unhandledRejection', (reason, promise) => {
    const msg = reason?.message || '';
    
    // Filtrar errores conocidos de Puppeteer/WhatsApp para no saturar Sentry
    const isKnownError = msg.includes('Execution context was destroyed') || 
                         msg.includes('Target closed') ||
                         msg.includes('Protocol error') ||
                         msg.includes('Failed to launch the browser process') ||
                         msg.includes('Navigation failed because browser has disconnected') ||
                         msg.includes('waiting for target failed: timeout');

    if (!isKnownError) {
        console.error('🔥 UNHANDLED REJECTION:', reason);
        Sentry.captureException(reason);
    } else {
        console.warn(`⚠️ Error conocido capturado (no enviado a Sentry): ${msg}`);
    }

    // Auto-recuperación para errores comunes de Puppeteer/WhatsApp
    if (isKnownError) {
        console.log(`♻️ Detectado error crítico (${msg}). Reiniciando servicio de WhatsApp en 5s...`);
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

const WHATSAPP_DATA_DIR = path.join(BASE_PATH, '.wwebjs_auth'); // Usar directorio de datos de usuario para persistencia
const SESSION_DIR = path.join(WHATSAPP_DATA_DIR, 'session');

// Función crítica para eliminar SingletonLock (Fix error macOS/Linux)
const removeSingletonLock = () => {
    try {
        // La ruta estándar creada por LocalAuth es session-{clientId}
        // En este caso clientId es 'client-one'
        const sessionPath = path.join(WHATSAPP_DATA_DIR, 'session-client-one');
        const lockFile = path.join(sessionPath, 'SingletonLock');
        
        if (fs.existsSync(lockFile)) {
            console.log(`🔒 SingletonLock detectado en: ${lockFile}`);
            try {
                fs.unlinkSync(lockFile);
                console.log('✅ SingletonLock eliminado correctamente. Permitiendo nuevo proceso.');
            } catch (unlinkErr) {
                // Si falla borrarlo, puede ser permisos o que el proceso sigue vivo
                console.warn(`⚠️ No se pudo eliminar SingletonLock: ${unlinkErr.message}`);
                
                // Intento agresivo: matar procesos de Chrome huérfanos si estamos en macOS/Linux
                if (process.platform !== 'win32') {
                    try {
                        console.log('🔪 Intentando matar procesos Chrome huérfanos...');
                        execSync('pkill -f "Google Chrome" || true');
                        execSync('pkill -f "Chromium" || true');
                    } catch (e) {}
                }
            }
        }
        
        // También limpiar directorios temporales de Puppeteer si existen
        const tempDirs = [
            path.join(sessionPath, 'Default', 'SingletonLock'),
            path.join(sessionPath, 'SingletonLock') 
        ];
        
        // Limpieza preventiva adicional
    } catch (e) {
        console.error('Error en limpieza de SingletonLock:', e);
    }
};

// Función para limpiar caché de WhatsApp al inicio
const cleanWhatsAppCache = () => {
    try {
        removeSingletonLock(); // Llamar a limpieza de lock antes de nada
        
        const cachePath = path.join(WHATSAPP_DATA_DIR, '.wwebjs_cache');
        if (fs.existsSync(cachePath)) {
            console.log('🧹 Limpiando caché antigua de WhatsApp...');
            fs.rmSync(cachePath, { recursive: true, force: true });
        }
        // También limpiar cache local de versiones si existe en otro lado (legacy)
        const localCachePath = path.join(__dirname, '.wwebjs_cache');
         if (fs.existsSync(localCachePath)) {
            console.log('🧹 Limpiando caché local de WhatsApp...');
            try {
                fs.rmSync(localCachePath, { recursive: true, force: true });
            } catch (e) { console.warn('No se pudo borrar caché local (posiblemente readonly):', e.message); }
        }
    } catch (e) {
        console.warn('⚠️ No se pudo limpiar la caché de WhatsApp:', e.message);
    }
};

cleanWhatsAppCache();

// --- CONFIGURACIÓN WHATSAPP LOCAL ---
// --- CONFIGURACIÓN WHATSAPP LOCAL ---
console.log('🔄 Inicializando cliente de WhatsApp...');

// Debug Browser Path
// Debug Browser Path
const browserPath = getSystemBrowserPath();
const finalBrowserPath = browserPath || getBundledChromiumPath();
console.log(`🐛 [DEBUG] Browser Path detectado: ${browserPath || 'NINGUNO'}`);
console.log(`🚀 [LAUNCH] Iniciando WhatsApp con ejecutable: ${finalBrowserPath || 'DEFAULT (Puppeteer Resolution)'}`);

const whatsappClient = new Client({
    authStrategy: new LocalAuth({
        clientId: 'client-one', // ID específico para mantener sesión consistente
        dataPath: WHATSAPP_DATA_DIR // Ruta base para datos de sesión
    }),
    authTimeoutMs: 180000,
    // Forzar User-Agent a nivel de cliente para evitar detección como MacOS
    // Usar un UA estándar de Chrome Windows reciente para máxima compatibilidad
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    qrMaxRetries: 0,
    // Desactivamos la caché persistente para evitar errores de regex en index.html
    // y forzamos el uso de la versión más reciente compatible (o la que descargue)
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    // Añadido para intentar mitigar problemas de timeout/evaluación en mac
    restartOnAuthFail: true,
    puppeteer: {
        // Si browserPath es undefined, intentamos usar el bundled
        executablePath: finalBrowserPath || undefined,
        headless: true,
        dumpio: false, // Desactivar dumpio en producción para reducir ruido
        ignoreHTTPSErrors: true, // Ignorar errores de certificado
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            // '--single-process', // DESACTIVADO: Causa inestabilidad en Windows recientes (Target closed)
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--mute-audio',
            '--no-default-browser-check',
            '--autoplay-policy=user-gesture-required',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-infobars',
            '--disable-breakpad', // Desactivar crash reporting
            '--disable-ipc-flooding-protection',
            '--disable-dev-shm-usage', // Redundante pero crítico
            // Añadir estos flags para mejorar compatibilidad Windows
            '--disable-software-rasterizer',
            '--disable-gl-drawing-for-tests',
            '--disable-features=HttpsFirstBalancedModeAutoEnable', // Fix para error net::ERR_BLOCKED_BY_CLIENT
            '--disable-features=Translate', // Desactivar traducción
            '--disable-features=site-per-process', // Ahorro de memoria
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        ],
        timeout: 120000 // Aumentar timeout de inicialización de puppeteer (120s)
    }
});

let isWhatsAppReady = false;
let currentQR = null; // Guardar el QR actual para enviarlo al frontend
let whatsappLastError = null; // Guardar el último error para mostrarlo al usuario

// Manejo robusto de eventos
whatsappClient.on('qr', (qr) => {
    whatsappLastError = null; // Limpiar errores previos si se genera QR
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

// Escuchar mensajes entrantes
whatsappClient.on('message', async msg => {
    try {
        // Ignorar mensajes de grupos o estados
        if (msg.from.includes('@g.us') || msg.from.includes('status')) return;

        console.log(`📩 Mensaje recibido de ${msg.from}: ${msg.body.substring(0, 50)}...`);

        // Buscar cliente por teléfono
        const phone = msg.from.replace('@c.us', '');
        let client = sqliteManager.getClientByPhone(phone);

        // Si no existe, crear uno básico (opcional, pero útil para chat)
        if (!client) {
            console.log(`   ⚠️ Cliente desconocido (${phone}). Creando registro básico...`);
            try {
                const newClient = {
                    name: msg._data.notifyName || 'WhatsApp Contact',
                    phone: phone,
                    status: 'Nuevo',
                    source: 'WhatsApp Incoming',
                    created_at: new Date().toISOString()
                };
                client = sqliteManager.insertClient(newClient);
            } catch (e) {
                console.error('Error creando cliente automático:', e);
            }
        }

        if (client) {
            // Guardar mensaje en historial
            sqliteManager.saveMessage(client.id, 'whatsapp', msg.body, 'received');
            console.log(`   ✅ Mensaje guardado para cliente ${client.name} (${client.id})`);
            
            // Actualizar estado de "respondido" si es necesario
            if (client.answered === 0) {
                 sqliteManager.updateClient(client.id, { answered: 1, response: msg.body });
            }
        }

    } catch (err) {
        console.error('Error procesando mensaje entrante:', err);
    }
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
        console.log('🔄 Intentando reconexión automática...');
        // Usar la función robusta con retries
        setTimeout(() => initializeWhatsApp(), 5000);
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

        // --- FIX: SingletonLock Cleanup ---
        // Eliminar lock file huérfano si existe (común tras crashes en macOS/Linux)
        try {
            // WHATSAPP_DATA_DIR apunta a .wwebjs_auth. La sesión es 'session-client-one'
            const lockFile = path.join(WHATSAPP_DATA_DIR, 'session-client-one', 'SingletonLock');
            if (fs.existsSync(lockFile)) {
                console.log(`⚠️ Detectado SingletonLock huérfano: ${lockFile}. Eliminando para evitar error de perfil...`);
                fs.unlinkSync(lockFile);
                console.log('✅ SingletonLock eliminado.');
            }
        } catch (lockErr) {
            console.warn(`⚠️ No se pudo eliminar SingletonLock (¿permisos?): ${lockErr.message}`);
        }
        // ----------------------------------

        whatsappState = 'INITIALIZING';
        qrAttempts = 0;

        await whatsappClient.initialize();
    } catch (err) {
        console.error('❌ Error fatal al inicializar WhatsApp Client:', err);
        
        // Filtrar errores operativos conocidos
        const msg = err.message || '';
        const isKnownError = msg.includes('waiting for target failed: timeout') || 
                             msg.includes('Target closed') ||
                             msg.includes('Protocol error') ||
                             msg.includes('Failed to launch the browser process') ||
                             msg.includes('Navigation failed because browser has disconnected');

        if (!isKnownError) {
            Sentry.captureException(err);
        } else {
            console.warn(`⚠️ Error operativo conocido (no enviado a Sentry): ${msg}`);
        }

        whatsappLastError = err.message || 'Error desconocido al inicializar';

        // Nuevo: Si es error de timeout (selector) o evaluación, borrar caché de autenticación para forzar reinicio limpio
        if (err.message && (err.message.includes('Timeout') || err.message.includes('Evaluation failed') || err.message.includes('Protocol error'))) {
            console.log('⚠️ Error crítico detectado (Timeout/Evaluation/Protocol). Posible corrupción de sesión. Limpiando caché...');
            try {
                 // Usar la ruta correcta de WhatsApp
                 const authPath = WHATSAPP_DATA_DIR;
                 const cachePath = path.join(WHATSAPP_DATA_DIR, '.wwebjs_cache');
                 
                 // Intentar borrar con reintentos para evitar bloqueos de archivo
                 const deleteFolder = (p) => {
                    if (fs.existsSync(p)) {
                        try {
                            fs.rmSync(p, { recursive: true, force: true });
                        } catch (e) {
                            console.warn(`⚠️ No se pudo borrar ${p} inmediatamente: ${e.message}`);
                        }
                    }
                 };

                 deleteFolder(authPath);
                 deleteFolder(cachePath);
                 
                 console.log('✅ Caché de sesión eliminada. Se requerirá nuevo escaneo de QR.');
            } catch (cleanupErr) {
                console.error('❌ Error limpiando caché:', cleanupErr);
            }
        }

        // Intento de recuperación: Si falla con el navegador del sistema, intentar sin executablePath
        if (err.message && err.message.includes('Failed to launch the browser process') && browserPath) {
            console.log('⚠️ Detectado fallo al lanzar navegador del sistema. Reintentando con Puppeteer Bundled Chromium...');

            // Reiniciar cliente con executablePath undefined
            try {
                // Destruir cliente anterior si es posible (aunque initialize falló)
                try { await whatsappClient.destroy(); } catch (e) { }

                // Reconfigurar puppeteer options
                const bundledPath = getBundledChromiumPath();
                whatsappClient.options.puppeteer = {
                    ...whatsappClient.options.puppeteer,
                    executablePath: bundledPath || undefined
                };

                console.log(`🔄 Reintentando inicialización con navegador bundled: ${bundledPath || 'Auto-Resolution'}...`);
                await whatsappClient.initialize();
                return; // Éxito en el segundo intento
            } catch (retryErr) {
                console.error('❌ También falló el intento con navegador bundled:', retryErr);
            }
        }

        whatsappState = 'ERROR';
        
        // Ensure client is destroyed to avoid "Client already initialized" on retry
        try {
            console.log('🧹 Limpiando instancia fallida de WhatsApp...');
            await whatsappClient.destroy();
        } catch (destroyErr) {
            console.warn('⚠️ Error al destruir cliente fallido (puede ser normal):', destroyErr.message);
        }

        // Reintentar en 10 segundos (o 20 si fue un error de protocolo/cierre)
        const retryDelay = (err.message && err.message.includes('Target closed')) ? 20000 : 10000;
        console.log(`⏳ Reintentando inicialización en ${retryDelay/1000} segundos...`);
        setTimeout(initializeWhatsApp, retryDelay);
    }
};

try {
    initializeWhatsApp();
} catch (error) {
    console.error('❌ Excepción síncrona al inicializar WhatsApp:', error);
    whatsappState = 'ERROR';
}

// --- CONFIGURACIÓN EMAIL (NODEMAILER) ---

// Función helper para obtener configuración de email (Env o JSON)
const getEmailConfig = () => {
    let config = {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    };

    // Intentar cargar de archivo de configuración (prioridad sobre ENV)
    try {
        const BASE_PATH = process.env.USER_DATA_PATH || process.env.APPDATA || path.join(__dirname, '..');
        const CONFIG_FILE = path.join(BASE_PATH, 'data', 'email_config.json');
        
        if (fs.existsSync(CONFIG_FILE)) {
            const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (savedConfig.email && savedConfig.password) {
                config.user = savedConfig.email;
                config.pass = savedConfig.password;
            }
        }
    } catch (e) {
        console.error('Error cargando configuración de email:', e);
    }
    return config;
};

// Función para crear el transporter con credenciales actualizadas
const createTransporter = () => {
    const config = getEmailConfig();
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: config.user,
            pass: config.pass
        },
        tls: {
            rejectUnauthorized: false
        }
    });
};

let emailTransporter = createTransporter();

// Función auxiliar para notificar (Sistema + Email)
const notifyUser = async (options) => {
    // 1. Notificación de Sistema (Desktop)
    notifier.notify(options);

    // 2. Notificación por Email
    // Obtener configuración actual
    const config = getEmailConfig();

    // Solo si tenemos credenciales configuradas
    if (config.user && config.pass) {
        try {
            console.log(`   📧 Enviando copia de notificación por email a ${config.user}...`);
            
            // Crear transporter on-the-fly para asegurar credenciales frescas
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: config.user,
                    pass: config.pass
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            await transporter.sendMail({
                from: config.user,
                to: config.user, // Auto-envío
                subject: `[Notificación Sistema] ${options.title}`,
                text: `${options.message}\n\n--\nNotificación generada automáticamente por Inmobiliaria Manager.`
            });
            console.log('   ✅ Copia de notificación enviada por email.');
        } catch (error) {
            console.error('   ❌ Error enviando copia de notificación por email:', error.message);
        }
    }
};

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

// Endpoint unificado para correr scrapers (Disparado desde InboxPanel)
app.post('/api/scraper/run', async (req, res) => {
    try {
        console.log('🚀 Iniciando escaneo manual de portales (solicitado por usuario)...');
        
        // 1. Forzar chequeo de emails (busca nuevas URLs)
        emailService.checkEmails();

        // 2. Ejecutar scrapers de portales en paralelo (si están habilitados/configurados)
        // Nota: Idealmente deberíamos llamar a la función interna, pero aquí simulamos la llamada a los endpoints existentes
        // O mejor, invocamos los scrapers directamente si tenemos acceso a la lógica.
        // Dado que runPythonScraper es interno, lo invocamos.

        const runFotocasa = runPythonScraper(path.join(SCRAPERS_DIR, 'fotocasa_scraper.py'), null, 'fotocasa-manual', ['--headless']);
        const runIdealista = runPythonScraper(path.join(SCRAPERS_DIR, 'idealista_scraper.py'), null, 'idealista-manual', ['--headless']);

        res.json({ success: true, message: 'Scrapers iniciados en segundo plano.' });
    } catch (error) {
        console.error('❌ Error iniciando scrapers manuales:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint para re-escanear un correo específico
app.post('/api/scraper/rescrape-email', async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'UID requerido' });

    console.log(`🚀 Solicitud de re-escaneo para email UID: ${uid}`);

    let connection = null;
    try {
        // 1. Configuración IMAP
        let config = {
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASS,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 30000
        };

        // Try to load from local config file if env vars are missing
        if (!config.user || !config.password) {
             const BASE_PATH = process.env.USER_DATA_PATH || path.join(__dirname, '..');
             const CONFIG_FILE = path.join(BASE_PATH, 'data', 'email_config.json');
             if (fs.existsSync(CONFIG_FILE)) {
                 const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
                 if (savedConfig.email && savedConfig.password) {
                     config.user = savedConfig.email;
                     config.password = savedConfig.password;
                 }
             }
        }

        if (!config.user || !config.password) {
            return res.status(400).json({ error: 'Credenciales de email no configuradas' });
        }

        // 2. Conectar y buscar el correo
        connection = await imaps.connect({ imap: config });
        await connection.openBox('INBOX');

        const searchCriteria = [['UID', uid]];
        const fetchOptions = { bodies: ['HEADER', 'TEXT'], markSeen: false };
        const messages = await connection.search(searchCriteria, fetchOptions);

        if (messages.length === 0) {
            return res.status(404).json({ error: 'Correo no encontrado' });
        }

        const item = messages[0];
        const all = item.parts.find(part => part.which === 'TEXT');
        const idHeader = "Imap-Id: " + uid + "\r\n";
        const header = item.parts.find(p => p.which === 'HEADER');
        const fromLine = header.body.from ? header.body.from[0] : '';
        
        const mail = await simpleParser(idHeader + all.body);

        // 3. Extraer URL
        const lowerFrom = fromLine.toLowerCase();
        const source = lowerFrom.includes('fotocasa') ? 'fotocasa' : (lowerFrom.includes('idealista') ? 'idealista' : 'unknown');
        let propertyUrls = [];

        console.log(`   📧 Fuente detectada para UID ${uid}: ${source} (From: ${fromLine})`);

        if (source === 'idealista') {
            const urlRegex = /https:\/\/www\.idealista\.com\/inmueble\/\d+\/?/g;
            const matchesText = mail.text ? mail.text.match(urlRegex) : [];
            const matchesHtml = mail.html ? mail.html.match(urlRegex) : [];
            propertyUrls = [...new Set([...(matchesText || []), ...(matchesHtml || [])])];
        } else if (source === 'fotocasa') {
            // Regex robusta para capturar URLs de Fotocasa
            // Captura cualquier URL de fotocasa.es/es/... que contenga dígitos y termine en /d o similar
            // Usa lazy matching .*? para cubrir cualquier estructura de ruta intermedia
            const urlRegex = /https:\/\/www\.fotocasa\.es\/es\/.*?\/\d+\/d(?:\?[\w=&-]+)?/g;
            
            const matchesText = mail.text ? mail.text.match(urlRegex) : [];
            const matchesHtml = mail.html ? mail.html.match(urlRegex) : [];
            propertyUrls = [...new Set([...(matchesText || []), ...(matchesHtml || [])])];
            
            // Fallback: Si no encuentra con /d, buscar patrones de ID numérico largo si la URL contiene fotocasa.es
            if (propertyUrls.length === 0) {
                 console.log('   ⚠️ Regex estricta de Fotocasa falló. Intentando búsqueda amplia...');
                 // Busca cualquier link de fotocasa
                 const broadRegex = /https:\/\/www\.fotocasa\.es\/es\/[^\s"']+/g;
                 const textLinks = mail.text ? mail.text.match(broadRegex) : [];
                 const htmlLinks = (mail.html && typeof mail.html === 'string') ? mail.html.match(broadRegex) : [];
                 const allLinks = [...(textLinks || []), ...(htmlLinks || [])];
                 // Filtrar los que parecen tener un ID (numeros de >7 digitos)
                 propertyUrls = [...new Set(allLinks.filter(url => /\/\d{7,}\//.test(url) || url.endsWith('/d')))];
            }
        }

        if (propertyUrls.length === 0) {
            console.warn(`⚠️ No se encontraron URLs en correo UID ${uid}. Source: ${source}`);
            console.warn('--- Snippet del correo ---');
            console.warn(mail.text ? mail.text.substring(0, 500) : 'Sin texto plano');
            console.warn('--------------------------');
            return res.status(400).json({ error: 'No se encontraron URLs de propiedad en el correo' });
        }

        console.log(`   🔗 URLs encontradas para re-escaneo (${propertyUrls.length}):`, propertyUrls);

        // 4. Ejecutar scraper de actualización con TODAS las URLs
        // Guardamos las URLs en un archivo temporal del sistema (os.tmpdir) para evitar problemas de permisos en Program Files
        const os = require('os');
        const tempUrlsFile = path.join(os.tmpdir(), `inmobiliaria_temp_urls_${uid}.json`);
        fs.writeFileSync(tempUrlsFile, JSON.stringify(propertyUrls));

        const scriptPath = path.join(SCRAPERS_DIR, 'update_scraper.py');
        runPythonScraper(scriptPath, null, `rescrape-${uid}`, [tempUrlsFile]);

        // Programar eliminación del archivo temporal después de un tiempo prudencial (ej. 5 minutos)
        setTimeout(() => {
            if (fs.existsSync(tempUrlsFile)) fs.unlinkSync(tempUrlsFile);
        }, 300000);

        res.json({ success: true, message: 'Re-escaneo iniciado', urls: propertyUrls });

    } catch (error) {
        console.error('❌ Error en re-escaneo:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) {
            try { connection.end(); } catch(e) {}
        }
    }
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
            lastError: whatsappLastError,
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
                // Ignorar errores de protocolo o target closed al hacer logout, ya que el objetivo es desconectar
                if (err.message && (err.message.includes('Protocol error') || err.message.includes('Target closed'))) {
                    console.log('Logout completado (con advertencia de conexión cerrada).');
                } else {
                    console.warn('Logout falló:', err.message);
                }
            }
        }

        // Forzar destrucción del cliente para asegurar limpieza
        try {
            await whatsappClient.destroy();
            console.log('Cliente destruido.');
        } catch (err) {
            if (err.message && (err.message.includes('Protocol error') || err.message.includes('Target closed'))) {
                 // Ignorar ruido
            } else {
                 console.warn('Error destruyendo cliente:', err.message);
            }
        }

        // Reinicializar para generar nuevo QR (Usando la función robusta)
        console.log('Reinicializando cliente...');
        // Usar setTimeout para dar tiempo a que el sistema operativo libere recursos
        setTimeout(() => {
            initializeWhatsApp();
        }, 1000);
        
        isWhatsAppReady = false;
        currentQR = null;
        whatsappState = 'INITIALIZING';

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
        const sessionPath = WHATSAPP_DATA_DIR;
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
                    fs.renameSync(sessionPath, path.join(path.dirname(WHATSAPP_DATA_DIR), `.wwebjs_auth_bak_${Date.now()}`));
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
                Advertiser: extraData.advertiser || extraData.Advertiser || '',
                Phone: prop.phone || extraData.phone || extraData.Phone || 'None',

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

// DELETE /api/properties/:id - Eliminar propiedad
app.delete('/api/properties/:id', (req, res) => {
    try {
        const id = req.params.id;
        // Si el ID parece una URL (contiene http), usamos deleteProperty(url)
        // Pero sqliteManager tiene deleteProperty(url).
        // Vamos a asumir que si pasamos un ID numérico, deberíamos tener una función para borrar por ID.
        // Como sqliteManager solo expuso deleteProperty(url), vamos a obtener la URL por ID primero o modificar sqliteManager.
        // Para simplificar y dado que el frontend puede pasar la URL codificada:
        
        let url = decodeURIComponent(id);
        
        // Si es un ID numérico (ej. "15"), buscamos la URL primero
        // Pero para ser prácticos, añadiremos deletePropertyById en sqliteManager o usamos SQL directo aquí si fuera necesario.
        // Mejor: usar deleteProperty de sqliteManager que espera URL.
        // Frontend debe enviar encodeURIComponent(property.url).
        
        const result = sqliteManager.deleteProperty(url);
        
        if (result.changes > 0) {
            res.json({ success: true });
        } else {
            // Intentar borrar por ID si la URL falló (por si acaso pasaron un ID)
             const stmt = sqliteManager.db.prepare('DELETE FROM properties WHERE id = ?');
             const resultId = stmt.run(id);
             if (resultId.changes > 0) {
                 res.json({ success: true });
             } else {
                 res.status(404).json({ error: 'Propiedad no encontrada' });
             }
        }
    } catch (error) {
        console.error('Error eliminando propiedad:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para actualizar una propiedad (Edición Manual)
app.put('/api/properties/:id', (req, res) => {
    try {
        const id = req.params.id;
        const data = req.body;
        // console.log('Updating property:', id, data); // Debug
        const result = sqliteManager.updatePropertyById(id, data);
        if (result.changes > 0) {
            res.json({ success: true });
        } else {
            // Si changes es 0, puede ser que no exista o que los datos sean idénticos.
            // Verificamos si existe
            const exists = sqliteManager.db.prepare('SELECT id FROM properties WHERE id = ?').get(id);
            if (!exists) {
                res.status(404).json({ error: 'Propiedad no encontrada' });
            } else {
                // Existe pero no hubo cambios (o solo se actualizó last_updated si la lógica lo permite)
                res.json({ success: true, message: 'No changes detected but confirmed existence' });
            }
        }
    } catch (error) {
        console.error('Error actualizando propiedad:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mount Inbox Routes
const inboxRoutes = require('./routes/inbox');
app.use('/api/inbox', inboxRoutes);

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
        notifyUser({
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
const runPythonScraper = (scraperPath, res, scraperId, args = []) => {
    // Determinar el ejecutable de Python
    const pythonExecutable = getPythonExecutable();

    console.log(`🚀 Iniciando scraper desde ${scraperPath} (ID: ${scraperId})...`);
    if (args.length > 0) console.log(`   📝 Argumentos: ${JSON.stringify(args)}`);
    console.log(`🐍 Usando intérprete Python: ${pythonExecutable}`);

    const pythonProcess = spawn(pythonExecutable, [scraperPath, ...args], {
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
        // Evitar respuestas múltiples si ya se respondió
        if (res && res.headersSent) {
            console.warn('⚠️ Intento de respuesta duplicada ignorado en evento close.');
            return;
        }

        // Limpiar del mapa si existe
        if (scraperId && activeScrapers.has(scraperId)) {
            activeScrapers.delete(scraperId);
        }

        if (code === 0) {
            console.log(`✅ Scraper completado exitosamente`);

            // Notificación de ÉXITO
            notifyUser({
                title: 'Scraper Finalizado',
                message: `El proceso de scraping terminó correctamente.`,
                sound: 'Glass', // Sonido en Windows/macOS
                wait: false
            });

            // Lógica de consolidación unificada
            // Intentamos procesar inmediatamente para dar respuesta al usuario
            const stats = consolidatePropertiesFolder();

            console.log(`✅ Consolidación completada: ${sqliteManager.getPropertiesCount()} propiedades en SQLite.`);
            
            if (res) {
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
            }

        } else {
            console.error(`❌ Scraper falló con código ${code}`);

            notifyUser({
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
            
            // Reportar a Sentry con contexto
            Sentry.withScope(scope => {
                scope.setTag("scraper_id", scraperId || "unknown");
                scope.setExtra("python_executable", pythonExecutable);
                scope.setExtra("args", args);
                scope.setExtra("error_output", errorOutput);
                Sentry.captureException(new Error(`Scraper Failed: ${errorMessage}`));
            });

            if (res) {
                res.status(500).json({
                    success: false,
                    error: errorMessage,
                    output: output,
                    errorDetails: errorOutput,
                    pythonUsed: pythonExecutable
                });
            }
        }
    });

    pythonProcess.on('error', (error) => {
        if (res && res.headersSent) return;
        console.error('❌ Error iniciando scraper:', error);
        
        Sentry.captureException(error);
        
        if (res) {
            res.status(500).json({ success: false, error: 'Error iniciando scraper: ' + error.message });
        }
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
            notifyUser({
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
    const { type } = req.body; // 'viviendas', 'locales', 'terrenos'

    if (!fs.existsSync(IDEALISTA_SCRAPER)) {
        return res.status(404).json({ success: false, error: 'El scraper de Idealista no está instalado o no se encuentra el archivo.' });
    }
    
    // Usamos ID único basado en el tipo si existe
    const scraperId = type ? `idealista_${type}` : 'idealista';
    
    // Argumentos para el script python (espera JSON en argv[1])
    const args = type ? [JSON.stringify({ type })] : [];

    runPythonScraper(IDEALISTA_SCRAPER, res, scraperId, args);
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

const IDEALISTA_SCRAPER_SINGLE = path.join(__dirname, 'scrapers/idealista/run_idealista_single.py');

// Función helper para procesar actualizaciones de propiedades
async function processPropertyUpdates(urls) {
    if (!urls || urls.length === 0) return { success: false, error: 'No URLs provided' };

    console.log(`🔄 [Helper] Actualizando ${urls.length} propiedades...`);
    
    // Separar URLs por plataforma
    const idealistaUrls = urls.filter(u => u.includes('idealista'));
    const otherUrls = urls.filter(u => !u.includes('idealista')); // Fotocasa y otros

    const pythonExecutable = getPythonExecutable();
    let updatedProperties = [];
    let combinedErrorData = '';

    try {
        // --- 1. PROCESAR IDEALISTA (Uno a uno) ---
        if (idealistaUrls.length > 0) {
            console.log(`🔎 Procesando ${idealistaUrls.length} propiedades de Idealista...`);
            for (const url of idealistaUrls) {
                try {
                    const result = await new Promise((resolve) => {
                        const proc = spawn(pythonExecutable, [IDEALISTA_SCRAPER_SINGLE, url], {
                            env: { ...process.env, PYTHONIOENCODING: 'utf-8', USER_DATA_PATH: BASE_PATH },
                            shell: false
                        });
                        
                        let stdout = '';
                        let stderr = '';
                        proc.stdout.on('data', d => stdout += d.toString());
                        proc.stderr.on('data', d => stderr += d.toString());
                        
                        proc.on('close', (code) => {
                            if (code !== 0) {
                                console.error(`❌ Idealista scraper falló para ${url}`);
                                combinedErrorData += `[Idealista ${url}] ${stderr}\n`;
                                resolve(null);
                            } else {
                                try {
                                    const jsonStartIndex = stdout.indexOf('{');
                                    const jsonEndIndex = stdout.lastIndexOf('}');
                                    
                                    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                                        const jsonStr = stdout.substring(jsonStartIndex, jsonEndIndex + 1);
                                        const data = JSON.parse(jsonStr);
                                        if (!data.error) resolve(data);
                                        else resolve(null);
                                    } else {
                                        console.warn("Invalid JSON output from Idealista scraper:", stdout);
                                        resolve(null);
                                    }
                                } catch (e) {
                                    console.error("Error parsing Idealista JSON:", e);
                                    resolve(null);
                                }
                            }
                        });
                    });

                    if (result) updatedProperties.push(result);
                } catch (e) {
                    console.error(`Error loop Idealista: ${e}`);
                }
            }
        }

        // --- 2. PROCESAR OTROS (Fotocasa - Batch) ---
        if (otherUrls.length > 0) {
            console.log(`🔎 Procesando ${otherUrls.length} propiedades de Fotocasa/Otros...`);
            
            // Crear archivo temporal
            const updateDir = path.join(DATA_DIR, 'update');
            if (!fs.existsSync(updateDir)) fs.mkdirSync(updateDir, { recursive: true });
            const tempUrlsFile = path.join(updateDir, `temp_urls_${Date.now()}.json`);
            fs.writeFileSync(tempUrlsFile, JSON.stringify(otherUrls));

            // Ejecutar batch scraper
            await new Promise((resolve, reject) => {
                const pythonProcess = spawn(pythonExecutable, [UPDATE_SCRAPER, tempUrlsFile], {
                    env: { ...process.env, PYTHONIOENCODING: 'utf-8', USER_DATA_PATH: BASE_PATH },
                    shell: false
                });

                let rawData = '';
                
                pythonProcess.stdout.on('data', (data) => rawData += data.toString());
                pythonProcess.stderr.on('data', (data) => {
                    combinedErrorData += data.toString();
                    if (data.toString().includes('Error') || data.toString().includes('Procesando')) {
                        console.log(`      [Python] ${data.toString().trim()}`);
                    }
                });

                pythonProcess.on('close', (code) => {
                    // Borrar temp file
                    try { if (fs.existsSync(tempUrlsFile)) fs.unlinkSync(tempUrlsFile); } catch (e) {}

                    if (code !== 0) {
                        console.error(`❌ Batch scraper falló con código ${code}`);
                        resolve(); 
                    } else {
                        try {
                            const jsonStartIndex = rawData.indexOf('[');
                            const jsonEndIndex = rawData.lastIndexOf(']');
                            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                                const jsonString = rawData.substring(jsonStartIndex, jsonEndIndex + 1);
                                const batchResults = JSON.parse(jsonString);
                                updatedProperties = [...updatedProperties, ...batchResults];
                            }
                        } catch (e) {
                            console.error("Error parseando salida batch:", e);
                        }
                        resolve();
                    }
                });
            });
        }

        if (updatedProperties.length === 0) {
             if (combinedErrorData) {
                 console.warn("⚠️ No se obtuvieron propiedades, pero hubo logs:", combinedErrorData.substring(0, 200));
             }
             return { success: true, updatedCount: 0, message: "No se obtuvieron datos actualizados.", newClientsCount: 0 };
        }

        console.log(`💾 Guardando ${updatedProperties.length} propiedades actualizadas en SQLite...`);
        const dbStats = sqliteManager.bulkInsertProperties(updatedProperties);
        console.log(`   ✅ SQLite Stats: ${dbStats.inserted} nuevas, ${dbStats.updated} actualizadas`);

        const allProperties = [];
        const files = fs.readdirSync(PROPERTIES_DIR);
        files.forEach(file => {
            if (path.extname(file) === '.json') {
                const filePath = path.join(PROPERTIES_DIR, file);
                try {
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(fileContent);
                    if (data && Array.isArray(data.properties)) {
                        data.properties.forEach(p => {
                            if (p.url) allProperties.push({ url: p.url, originalFile: file });
                        });
                    }
                } catch (e) { }
            }
        });

        let successCount = 0;
        const updatesByFile = {};

        updatedProperties.forEach(updatedProp => {
            const match = allProperties.find(p => p.url === updatedProp.url);
            if (match) {
                if (!updatesByFile[match.originalFile]) updatesByFile[match.originalFile] = [];
                updatesByFile[match.originalFile].push(updatedProp);
            }
        });

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

        let newClientsCount = 0;
        try {
            const newClientMatches = combinedErrorData.match(/Nuevo cliente añadido/g);
            if (newClientMatches) newClientsCount = newClientMatches.length;
        } catch (e) {}

        // Usamos updatedProperties.length como la cuenta real de éxito (propiedades scrapeadas y guardadas en DB)
        const totalProcessed = updatedProperties.length;

        return { success: true, updatedCount: successCount, newClientsCount, totalProcessed };

    } catch (error) {
        console.error('❌ Error en el proceso de actualización de propiedades:', error);
        return { success: false, error: 'Error interno en el proceso de actualización.' };
    }
}

// Actualizar propiedades seleccionadas
app.post('/api/properties/update', async (req, res) => {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ success: false, error: 'No se proporcionaron URLs para actualizar.' });
    }

    console.log(`🔄 Actualizando ${urls.length} propiedades...`);
    
    // Separar URLs por plataforma
    const idealistaUrls = urls.filter(u => u.includes('idealista'));
    const otherUrls = urls.filter(u => !u.includes('idealista')); // Fotocasa y otros

    const pythonExecutable = getPythonExecutable();
    let updatedProperties = [];
    let combinedErrorData = '';

    try {
        // --- 1. PROCESAR IDEALISTA (Uno a uno) ---
        if (idealistaUrls.length > 0) {
            console.log(`� Procesando ${idealistaUrls.length} propiedades de Idealista...`);
            for (const url of idealistaUrls) {
                try {
                    const result = await new Promise((resolve) => {
                        const proc = spawn(pythonExecutable, [IDEALISTA_SCRAPER_SINGLE, url], {
                            env: { ...process.env, PYTHONIOENCODING: 'utf-8', USER_DATA_PATH: BASE_PATH },
                            shell: false
                        });
                        
                        let stdout = '';
                        let stderr = '';
                        proc.stdout.on('data', d => stdout += d.toString());
                        proc.stderr.on('data', d => stderr += d.toString());
                        
                        proc.on('close', (code) => {
                            if (code !== 0) {
                                console.error(`❌ Idealista scraper falló para ${url}`);
                                combinedErrorData += `[Idealista ${url}] ${stderr}\n`;
                                resolve(null);
                            } else {
                                try {
                                    // Idealista script prints JSON at the end
                                    // Robust parsing: Find the first { and last }
                                    const jsonStartIndex = stdout.indexOf('{');
                                    const jsonEndIndex = stdout.lastIndexOf('}');
                                    
                                    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                                        const jsonStr = stdout.substring(jsonStartIndex, jsonEndIndex + 1);
                                        const data = JSON.parse(jsonStr);
                                        if (!data.error) resolve(data);
                                        else resolve(null);
                                    } else {
                                        console.warn("Invalid JSON output from Idealista scraper:", stdout);
                                        resolve(null);
                                    }
                                } catch (e) {
                                    console.error("Error parsing Idealista JSON:", e);
                                    resolve(null);
                                }
                            }
                        });
                    });

                    if (result) updatedProperties.push(result);
                } catch (e) {
                    console.error(`Error loop Idealista: ${e}`);
                }
            }
        }

        // --- 2. PROCESAR OTROS (Fotocasa - Batch) ---
        if (otherUrls.length > 0) {
            console.log(`🔎 Procesando ${otherUrls.length} propiedades de Fotocasa/Otros...`);
            
            // Crear archivo temporal
            const updateDir = path.join(DATA_DIR, 'update');
            if (!fs.existsSync(updateDir)) fs.mkdirSync(updateDir, { recursive: true });
            const tempUrlsFile = path.join(updateDir, `temp_urls_${Date.now()}.json`);
            fs.writeFileSync(tempUrlsFile, JSON.stringify(otherUrls));

            // Ejecutar batch scraper
            await new Promise((resolve, reject) => {
                const pythonProcess = spawn(pythonExecutable, [UPDATE_SCRAPER, tempUrlsFile], {
                    env: { ...process.env, PYTHONIOENCODING: 'utf-8', USER_DATA_PATH: BASE_PATH },
                    shell: false
                });

                let rawData = '';
                
                pythonProcess.stdout.on('data', (data) => rawData += data.toString());
                pythonProcess.stderr.on('data', (data) => {
                    combinedErrorData += data.toString();
                    if (data.toString().includes('Error') || data.toString().includes('Procesando')) {
                        console.log(`      [Python] ${data.toString().trim()}`);
                    }
                });

                pythonProcess.on('close', (code) => {
                    // Borrar temp file
                    try { if (fs.existsSync(tempUrlsFile)) fs.unlinkSync(tempUrlsFile); } catch (e) {}

                    if (code !== 0) {
                        console.error(`❌ Batch scraper falló con código ${code}`);
                        // No rechazamos para permitir que lo de Idealista se guarde si funcionó
                        resolve(); 
                    } else {
                        // Parsear resultados batch
                        try {
                            const jsonStartIndex = rawData.indexOf('[');
                            const jsonEndIndex = rawData.lastIndexOf(']');
                            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                                const jsonString = rawData.substring(jsonStartIndex, jsonEndIndex + 1);
                                const batchResults = JSON.parse(jsonString);
                                updatedProperties = [...updatedProperties, ...batchResults];
                            }
                        } catch (e) {
                            console.error("Error parseando salida batch:", e);
                        }
                        resolve();
                    }
                });
            });
        }

        if (updatedProperties.length === 0) {
             // Si falló todo, devolver error o mensaje vacío
             if (combinedErrorData) {
                 // Si hubo error data y no hay propiedades, quizás falló todo
                 console.warn("⚠️ No se obtuvieron propiedades, pero hubo logs:", combinedErrorData.substring(0, 200));
             }
             return res.json({ success: true, updatedCount: 0, message: "No se obtuvieron datos actualizados.", newClientsCount: 0 });
        }

        // 3. Actualizar Base de Datos SQLite (CRÍTICO: La fuente de verdad)
        console.log(`💾 Guardando ${updatedProperties.length} propiedades actualizadas en SQLite...`);
        const dbStats = sqliteManager.bulkInsertProperties(updatedProperties);
        console.log(`   ✅ SQLite Stats: ${dbStats.inserted} nuevas, ${dbStats.updated} actualizadas`);

        // 4. Actualizar archivos persistentes (Legacy / Backup)
        // Mantenemos esto por compatibilidad, pero la respuesta al frontend se basará en el éxito del scraping/SQLite
        const allProperties = [];
        const files = fs.readdirSync(PROPERTIES_DIR);
        files.forEach(file => {
            if (path.extname(file) === '.json') {
                const filePath = path.join(PROPERTIES_DIR, file);
                try {
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(fileContent);
                    if (data && Array.isArray(data.properties)) {
                        data.properties.forEach(p => {
                            if (p.url) allProperties.push({ url: p.url, originalFile: file });
                        });
                    }
                } catch (e) { }
            }
        });

        let successCount = 0;
        const updatesByFile = {};

        updatedProperties.forEach(updatedProp => {
            // Normalizar URL para comparación (quitar slash final si existe)
            const cleanUrl = updatedProp.url.replace(/\/$/, '');
            
            const match = allProperties.find(p => {
                const pClean = p.url.replace(/\/$/, '');
                return pClean === cleanUrl;
            });

            if (match) {
                if (!updatesByFile[match.originalFile]) updatesByFile[match.originalFile] = [];
                updatesByFile[match.originalFile].push(updatedProp);
            }
        });

        for (const fileName in updatesByFile) {
            const filePath = path.join(PROPERTIES_DIR, fileName);
            if (fs.existsSync(filePath)) {
                try {
                    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    let modified = false;

                    updatesByFile[fileName].forEach(update => {
                        // Normalizar URL para búsqueda
                        const updateUrlClean = update.url.replace(/\/$/, '');
                        
                        const propIndex = fileData.properties.findIndex(p => {
                            const pUrlClean = (p.url || '').replace(/\/$/, '');
                            return pUrlClean === updateUrlClean;
                        });

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

        // Contar nuevos clientes (regex sobre stderr acumulado)
        let newClientsCount = 0;
        try {
            const newClientMatches = combinedErrorData.match(/Nuevo cliente añadido/g);
            if (newClientMatches) newClientsCount = newClientMatches.length;
        } catch (e) {}

        // Usamos updatedProperties.length como la cuenta real de éxito (propiedades scrapeadas y guardadas en DB)
        // Fallback a dbStats si por alguna razón updatedProperties estuviera vacío pero dbStats no (raro)
        const finalCount = updatedProperties.length || (dbStats.inserted + dbStats.updated);
        
        res.json({ success: true, updatedCount: finalCount, newClientsCount });

    } catch (error) {
        console.error('❌ Error en el proceso de actualización de propiedades:', error);
        res.status(500).json({ success: false, error: 'Error en el servidor al actualizar propiedades.' });
    }
});


// ============ RUTAS DE CALENDARIO ============

app.get('/api/calendar/events', (req, res) => {
    try {
        const { start, end } = req.query;
        const events = sqliteManager.getEvents(start, end);
        res.json(events);
    } catch (err) {
        console.error('Error fetching events:', err);
        res.status(500).json({ error: 'Error fetching events' });
    }
});

app.post('/api/calendar/events', (req, res) => {
    try {
        const event = req.body;
        // Validación básica
        if (!event.title || !event.start_date || !event.end_date) {
            return res.status(400).json({ error: 'Faltan campos requeridos (title, start_date, end_date)' });
        }

        const newEvent = sqliteManager.createEvent(event);
        res.json(newEvent);
    } catch (err) {
        console.error('Error creating event:', err);
        res.status(500).json({ error: 'Error creating event' });
    }
});

app.put('/api/calendar/events/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = sqliteManager.updateEvent(id, req.body);

        if (result.changes > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Evento no encontrado' });
        }
    } catch (err) {
        console.error('Error updating event:', err);
        res.status(500).json({ error: 'Error updating event' });
    }
});

app.delete('/api/calendar/events/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = sqliteManager.deleteEvent(id);

        if (result.changes > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Evento no encontrado' });
        }
    } catch (err) {
        console.error('Error deleting event:', err);
        res.status(500).json({ error: 'Error deleting event' });
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

        // --- AUTO-SYNC CALENDAR ---
        const apptDate = req.body.appointmentDate || req.body.appointment_date;
        if (apptDate) {
            try {
                const startDate = new Date(apptDate);
                if (!isNaN(startDate.getTime())) {
                    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hora
                    sqliteManager.createEvent({
                        title: `Cita: ${newClient.name}`,
                        description: `Cita inicial con cliente. Tel: ${newClient.phone}. Notas: ${req.body.notes || ''}`,
                        start_date: startDate.toISOString(),
                        end_date: endDate.toISOString(),
                        all_day: false,
                        client_id: newClient.id,
                        type: 'appointment'
                    });
                    console.log("📅 Evento de calendario creado para nuevo cliente.");
                }
            } catch (calErr) { console.error("Error sync calendario:", calErr); }
        }
        // -------------------------

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

        // --- AUTO-SYNC CALENDAR (Update) ---
        const apptDate = req.body.appointmentDate || req.body.appointment_date;
        if (apptDate) {
            try {
                const startDate = new Date(apptDate);
                if (!isNaN(startDate.getTime())) {
                    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
                    const clientName = client.name || "Cliente"; // Usar nombre existente si no viene en body

                    // Buscar eventos existentes para este cliente en esta fecha aprox para no duplicar a lo loco?
                    // Por simplicidad, creamos uno nuevo. El usuario puede borrar si sobran.
                    sqliteManager.createEvent({
                        title: `Cita: ${req.body.name || clientName}`,
                        description: `Actualización de cita cliente. Notas: ${req.body.notes || ''}`,
                        start_date: startDate.toISOString(),
                        end_date: endDate.toISOString(),
                        all_day: false,
                        client_id: req.params.id,
                        type: 'meeting'
                    });
                    console.log("📅 Evento de calendario añadido tras actualización de cliente.");
                }
            } catch (calErr) { console.error("Error sync calendario update:", calErr); }
        }
        // ----------------------------------

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

// Obtener historial de mensajes de un cliente
app.get('/api/messages/:clientId', (req, res) => {
    try {
        const messages = sqliteManager.getClientMessages(req.params.clientId);
        res.json(messages);
    } catch (error) {
        console.error('Error obteniendo mensajes:', error);
        res.status(500).json({ error: 'Error obteniendo mensajes' });
    }
});

// Generar mensaje con IA (o Template)
app.post('/api/messages/generate', async (req, res) => {
    const { clientName, clientPhone, properties, preferences, model, template, scriptType, history } = req.body;

    // Unificar template y scriptType
    const effectiveTemplate = scriptType || template;
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    try {
        // 0. ENRIQUECIMIENTO DE DATOS (PROPIEDAD)
        let propertyContext = {};
        if (properties && properties.length > 0) {
            // Si nos llega una URL (ad_link), intentamos buscar la info completa en la BD
            const link = properties[0].ad_link || properties[0].url;
            if (link) {
                try {
                    const property = db.prepare('SELECT * FROM properties WHERE url = ?').get(link);
                    if (property) {
                        propertyContext = {
                            type: property.title ? property.title.split(' ')[0] : 'Inmueble', // "Piso en venta..." -> "Piso"
                            location: property.location || 'su zona',
                            price: property.price ? `${property.price}€` : null,
                            description: property.description || '',
                            url: link
                        };
                    } else {
                        // Si no está en BD, usamos lo poco que tengamos
                        propertyContext = { url: link, type: 'Propiedad' };
                    }
                } catch (e) {
                    console.error("Error fetching property details for context:", e);
                    propertyContext = { url: link, type: 'Propiedad' };
                }
            }
        }

        // 1. CASO SIN HISTORIAL: Retornar plantilla estática (si existe)
        if (effectiveTemplate && whatsappScripts[effectiveTemplate] && (!history || history.length === 0)) {
            let message = whatsappScripts[effectiveTemplate].text;
            
            // Reemplazo INTELIGENTE de variables
            message = message.replace('{{CLIENT_NAME}}', clientName || '');
            
            // Reemplazo de {{LINK}}
            if (propertyContext.url) {
                message = message.replace('{{LINK}}', propertyContext.url);
            }

            // Reemplazo de {{PROPERTY_TYPE}} (Ej: "Piso", "Chalet", "Local")
            // Si no tenemos tipo, usamos "Propiedad"
            const typeTerm = propertyContext.type || 'propiedad';
            // Ajuste gramatical básico (si es 'Piso' -> 'el piso', si es 'Casa' -> 'la casa')
            // Por simplicidad en esta iteración, reemplazamos el término directo.
            // En los scripts hemos puesto "propiedad" genérico. Vamos a intentar ser específicos si podemos.
            
            // Si el script tiene {{PROPERTY_TYPE}}, lo usamos. Si no, intentamos reemplazar "propiedad" o "inmueble" si tenemos un tipo específico.
            // Pero para ser seguros, solo reemplazamos si el script tiene el placeholder explícito o si hacemos un replace global de términos genéricos.
            // ESTRATEGIA: Si tenemos datos específicos, personalizamos.
            
            if (propertyContext.type && propertyContext.location) {
                // "le contacto por su propiedad" -> "le contacto por su Piso en Dénia"
                // Esto requiere que el script tenga un placeholder o hacemos un replace inteligente.
                // Vamos a optar por inyectar variables si el script las tuviera, o hacer un replace de "la propiedad" -> "su [TIPO] en [ZONA]"
                
                // Opción segura: Reemplazar "la propiedad que tiene en venta" por "su [TIPO] en [UBICACION]"
                if (message.includes("la propiedad que tiene en venta")) {
                     message = message.replace("la propiedad que tiene en venta", `su ${propertyContext.type} en ${propertyContext.location}`);
                }
                 if (message.includes("su propiedad")) {
                     message = message.replace("su propiedad", `su ${propertyContext.type}`);
                }
            }

            return res.json({ message, source: 'script_template' });
        }

        // 3. GENERACIÓN CON IA (Con Historial o sin template definido)
        if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'tu_api_key_aqui') {
             // Fallback si no hay API Key pero hay historial (no podemos generar dinámico)
             return res.json({ message: "Error: No API Key configured for AI responses.", source: 'error' });
        }

        const AGENTE = "Alex Aldazabal"; // Quitamos Dufurneaux si prefiere ser más directo
        const COMPANIA = "IAD Inmobiliaria"; // O "Asesor Independiente" según toque
        
        let systemPrompt = "";
        let goalText = "";
        
        // Construir contexto del inmueble para la IA
        let propertyPromptContext = "";
        if (propertyContext.url) {
            propertyPromptContext = `
DATOS DEL INMUEBLE DEL CLIENTE (USAR PARA PERSONALIZAR):
- Tipo: ${propertyContext.type || 'Desconocido'}
- Ubicación: ${propertyContext.location || 'Desconocida'}
- Precio: ${propertyContext.price || 'Desconocido'}
- Descripción (Extracto): ${propertyContext.description ? propertyContext.description.substring(0, 300) + '...' : 'No disponible'}
`;
        }

        // Determinar el OBJETIVO basado en el script seleccionado
        if (effectiveTemplate && whatsappScripts[effectiveTemplate]) {
            goalText = whatsappScripts[effectiveTemplate].text;
            systemPrompt = `Eres ${AGENTE}, Asesor Inmobiliario (particular/independiente). Tu objetivo es seguir la estrategia del siguiente GUION, pero adaptándote a la conversación actual con el cliente (${clientName}).

${propertyPromptContext}

GUION ORIGINAL (REFERENCIA DE ESTILO Y OBJETIVO):
"${goalText}"

INSTRUCCIONES:
- Analiza el historial de conversación.
- USA LOS DATOS DEL INMUEBLE: Si el cliente vende un "Chalet con piscina", menciónalo. Demuestra que has leído su anuncio.
- Si el cliente responde positivamente, avanza hacia el cierre (cita/visita).
- Si el cliente tiene dudas, respóndelas usando la información del guion como base.

REGLAS DE ORO (SEGURIDAD Y HONESTIDAD):
1. NO MIENTAS NI INVENTES COMPRADORES: Nunca digas "tengo un cliente específico para tu casa" o "tengo una visita lista" si no es cierto.
2. SI TE PREGUNTAN POR CLIENTES CONCRETOS: Responde que gestionas una cartera de compradores buscando en esa zona/rango, y que necesitas VER la propiedad para saber si encaja con alguno de ellos.
3. TU OBJETIVO: Vender tu SERVICIO PROFESIONAL y tu PLAN DE MARKETING, no prometer una venta falsa inmediata.
4. MANTÉN EL TONO profesional, cercano y directo del guion original.
5. NO copies el guion palabra por palabra si ya no tiene sentido en el contexto.
6. Sé conciso y natural.

ADAPTACIÓN LINGÜÍSTICA Y DE FORMATO:
- IDIOMA: Detecta el idioma en el que escribe el cliente (Español, Inglés, Alemán, Francés, etc.) y RESPONDE EN EL MISMO IDIOMA.
- EMOJIS: Úsalos con moderación (máximo 1 por mensaje) para mantener la seriedad.
- SEGURIDAD: Si el cliente se muestra agresivo o amenaza legalmente, responde con máxima educación y brevedad, cerrando la conversación sin insistir.`;

        } else {
            // Fallback genérico si no hay script seleccionado o es desconocido
             systemPrompt = `Eres ${AGENTE}, Asesor Inmobiliario. Estás contactando a ${clientName} sobre su propiedad.
${propertyPromptContext}
Objetivo: Concertar una visita para captar el inmueble.
Tono: Profesional, empático y directo. Demuestra conocimiento sobre el inmueble específico (tipo, zona, características) si dispones de los datos.`;
        }

        // Añadir contexto de historial
        let historyContext = "";
        if (history && history.length > 0) {
            historyContext = history.map(m => `${m.type === 'received' ? 'Cliente' : 'Yo'}: ${m.content}`).join('\n');
        }

        // Llamada a OpenRouter
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
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: historyContext ? `HISTORIAL DE CONVERSACIÓN:\n${historyContext}\n\nGenera la respuesta adecuada continuando la conversación.` : "Genera el mensaje inicial." }
                ],
                temperature: 0.7,
                max_tokens: 500
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices[0]) {
            res.json({ message: data.choices[0].message.content, source: 'openrouter' });
        } else {
            console.error('AI Response error:', data);
            throw new Error('No response from AI');
        }

    } catch (error) {
        console.error('Error generando mensaje con IA:', error);
        res.status(500).json({ error: 'Error generating message' });
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
                
                // Timeout de seguridad para evitar bloqueos infinitos
                const sendPromise = whatsappClient.sendMessage(chatId, message);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout enviando mensaje de WhatsApp (>45s)')), 45000)
                );

                const response = await Promise.race([sendPromise, timeoutPromise]);
                
                console.log('   ✅ WhatsApp enviado. ID:', response.id ? response.id._serialized : 'Desconocido');
                results.whatsapp = 'sent';
                success = true;
            } catch (err) {
                console.error('   ❌ Error enviando WhatsApp:', err);
                errors.push(`Error WhatsApp: ${err.message}`);
                results.whatsapp = 'failed';
                
                // Si es un error de desconexión o timeout, intentar reiniciar el cliente en segundo plano
                if (err.message.includes('Timeout') || err.message.includes('disconnected')) {
                    console.warn('⚠️ Detectado posible estado zombie de WhatsApp. Programando reinicio...');
                    setTimeout(() => initializeWhatsApp(), 5000);
                }
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

                    // Notificar al sistema operativo (alerta bot)
                    notifyUser({
                        title: 'Mensaje Enviado',
                        message: `Mensaje enviado correctamente a ${client.name}`,
                        sound: 'Glass',
                        wait: false
                    });
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

    const config = getEmailConfig();

    if (!config.user || !config.pass) {
        return res.status(500).json({ error: 'Faltan credenciales de email en el servidor.' });
    }

    try {
        console.log(`   📧 Enviando solicitud de soporte a ${DEVELOPER_EMAIL}...`);
        
        // Usar credenciales dinámicas
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: config.user,
                pass: config.pass
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        await transporter.sendMail({
            from: config.user,
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
    let pythonExecutable = getPythonExecutable();

    const types = ['viviendas', 'terrenos', 'locales'];
    for (const type of types) {
        const scraperScript = `run_${type}_auto.py`;
        const scraperPath = path.join(__dirname, `scrapers/fotocasa/${scraperScript}`);
        if (fs.existsSync(scraperPath)) {
            console.log(`   ▶ Running ${scraperScript}...`);
            // We use a promise wrapper around spawn to await completion
            await new Promise((resolve) => {
                const spawnScraper = (execPath, isRetry = false) => {
                    const child = spawn(execPath, [scraperPath], {
                        env: {
                            ...process.env,
                            PROPERTIES_OUTPUT_DIR: PROPERTIES_DIR
                        },
                        shell: false
                    });

                    child.on('error', (err) => {
                        console.error(`[${type}] Error spawn:`, err);
                        // Fallback strategy for macOS architecture mismatch (Error -86) or missing binary
                        if (!isRetry && (err.message.includes('-86') || err.code === 'BAD_CPU_TYPE' || err.code === 'ENOENT')) {
                            console.warn(`[${type}] ⚠️ Detectado error de binario/arquitectura. Reintentando con 'python3' del sistema...`);
                            spawnScraper('python3', true);
                        } else {
                            resolve(); // Resolve anyway to continue with next scraper
                        }
                    });

                    child.stdout.on('data', (data) => console.log(`[${type}] ${data}`));
                    child.stderr.on('data', (data) => console.error(`[${type} ERROR] ${data}`));
                    
                    child.on('close', (code) => {
                        console.log(`[${type}] Finished with code ${code}`);
                        resolve();
                    });
                };

                spawnScraper(pythonExecutable);
            }).catch(e => console.error(`[${type}] Unexpected promise error:`, e));
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
            notifyUser({
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

        autoScraperInterval = setInterval(() => {
            runAutoScrapers().catch(err => console.error('🔥 Error crítico en ciclo de Auto Scraper:', err));
        }, minutes * 60 * 1000);
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

// Endpoint de Análisis de Métricas IA
app.post('/api/ai/analyze-metrics', async (req, res) => {
    const { data, model } = req.body;

    if (!data) {
        return res.status(400).json({ success: false, error: 'Datos no proporcionados' });
    }

    // Función auxiliar para análisis basado en reglas (Fallback)
    const generateRuleBasedAnalysis = (d) => {
        const { total_propiedades, total_clientes, precio_promedio, tipos_propiedades } = d;
        let text = `### 1. Resumen Ejecutivo\n`;
        text += `La agencia cuenta con **${total_propiedades} propiedades** y **${total_clientes} clientes**. `;
        text += `El precio promedio de la cartera es de **${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(precio_promedio)}**.\n\n`;
        
        text += `### 2. Análisis de Cartera\n`;
        const topType = tipos_propiedades && tipos_propiedades.length > 0 
            ? tipos_propiedades.sort((a, b) => b.value - a.value)[0] 
            : { name: 'General', value: 0 };
        
        if (topType) {
            text += `El tipo de propiedad predominante es **${topType.name}** con ${topType.value} unidades. `;
        }
        text += `Se recomienda diversificar la cartera para cubrir más segmentos de mercado.\n\n`;

        text += `### 3. Análisis de Clientes\n`;
        text += `Con ${total_clientes} clientes registrados, el ratio propiedad/cliente es de ${(total_propiedades / (total_clientes || 1)).toFixed(1)}. `;
        text += `Un ratio saludable suele estar entre 0.5 y 1.5. Es importante mantener un equilibrio entre captación y ventas.\n\n`;

        text += `### 4. Recomendaciones\n`;
        text += `- **Captación**: Enfocarse en captar más propiedades si el ratio es bajo.\n`;
        text += `- **Seguimiento**: Contactar a los clientes antiguos para reactivar interés.\n`;
        text += `- **Datos**: Completar la información de "Intereses" para mejorar el matching.`;
        return text;
    };

    try {
        const fetch = (await import('node-fetch')).default;
        
        // --- FALLBACK SIN API KEY ---
        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
        if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'tu_api_key_aqui') {
            console.warn("⚠️ No OPENROUTER_API_KEY found. Using rule-based fallback.");
            const analysis = generateRuleBasedAnalysis(data);
            return res.json({ success: true, analysis: analysis });
        }
        // -----------------------------

        const systemPrompt = `Eres un experto analista de datos inmobiliarios y estratega de negocios.
Tu objetivo es analizar las métricas proporcionadas de una agencia inmobiliaria y generar un informe estratégico en formato Markdown.
El informe debe ser profesional, directo y orientado a la acción.
Estructura del informe:
1. **Resumen Ejecutivo**: Visión general del estado de la agencia.
2. **Análisis de Cartera**: Interpretación de los tipos de propiedades y precios.
3. **Análisis de Clientes**: Insights sobre la demanda y preferencias.
4. **Recomendaciones Estratégicas**: 3-5 acciones concretas para mejorar captación o ventas basadas en los datos.

Usa emojis para hacer la lectura más amena pero mantén la profesionalidad.
No inventes datos, basa tu análisis estrictamente en el JSON proporcionado.`;

        const userPrompt = `Aquí tienes los datos actuales de la agencia:
${JSON.stringify(data, null, 2)}

Por favor, genera el informe estratégico.`;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3001',
                'X-Title': 'Inmobiliaria Manager'
            },
            body: JSON.stringify({
                model: model || 'openai/gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 1500
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const analysis = result.choices[0].message.content;

        res.json({ success: true, analysis });

    } catch (error) {
        console.error('Error generating AI analysis:', error);
        // Fallback a reglas en caso de error de API
        console.log("⚠️ API Error. Falling back to rule-based analysis.");
        const analysis = generateRuleBasedAnalysis(data);
        res.json({ success: true, analysis: analysis + "\n\n*(Nota: Informe generado offline debido a un error de conexión con la IA)*" });
    }
});

let initStartTime = Date.now();
// Watchdog para reiniciar si se queda atascado inicializando
setInterval(() => {
    // Si lleva más de 2 minutos en INITIALIZING sin estar ready
    if (whatsappState === 'INITIALIZING' && !isWhatsAppReady) {
        const timeStuck = Date.now() - initStartTime;
        if (timeStuck > 120000) { 
             console.log('♻️ Watchdog: WhatsApp atascado en inicialización > 2min. Forzando reinicio...');
             initStartTime = Date.now(); // Reset timer
             if (whatsappClient) {
                 whatsappClient.destroy()
                    .then(() => {
                        console.log('♻️ Cliente destruido. Reinicializando...');
                        initializeWhatsApp();
                    })
                    .catch(e => {
                        console.error('Error destruyendo cliente:', e);
                        initializeWhatsApp();
                    });
             }
        }
    }
}, 30000);

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Backend API corriendo en http://localhost:${PORT}`);
    console.log(`📊 Propiedades: http://localhost:${PORT}/api/properties`);
    console.log(`👥 Clientes: http://localhost:${PORT}/api/clients`);
    console.log(`🔧 Fotocasa: POST http://localhost:${PORT}/api/scraper/fotocasa/run`);
    console.log(`🔧 Idealista: POST http://localhost:${PORT}/api/scraper/idealista/run`);

    // Iniciar monitor de email con callback para procesar URLs
    emailService.startMonitoring(async (url, source) => {
        console.log(`📧 URL detectada por email (${source}): ${url}`);
        
        // Notificar inicio de procesamiento (opcional, para feedback inmediato)
        notifyUser({
            title: 'Alerta Inmobiliaria Detectada',
            message: `Procesando enlace de ${source}...`,
            sound: false // Silencioso para no molestar si hay muchos
        });

        try {
            // processPropertyUpdates espera un array de URLs
            const result = await processPropertyUpdates([url]);
            
            if (result.success) {
                console.log(`✅ Propiedad actualizada desde email: ${url}`);
                
                // Notificar ÉXITO al usuario
                notifyUser({
                    title: '¡Nueva Oportunidad Captada!',
                    message: `Se ha importado correctamente una propiedad de ${source}.`,
                    sound: 'Hero', // Sonido distintivo de éxito
                    wait: false
                });

            } else {
                console.error(`❌ Error actualizando propiedad desde email: ${result.error}`);
                
                // Notificar ERROR
                notifyUser({
                    title: 'Error Importando Alerta',
                    message: `No se pudo procesar el enlace de ${source}. Revisa el log.`,
                    sound: 'Basso'
                });
            }
        } catch (error) {
            console.error(`❌ Error crítico procesando URL de email:`, error);
            notifyUser({
                title: 'Error Crítico Scraper Email',
                message: `Ocurrió un error inesperado al procesar la alerta.`,
                sound: 'Sosumi'
            });
        }
    });
});
