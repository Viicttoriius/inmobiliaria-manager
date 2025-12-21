const { app, BrowserWindow, ipcMain, Notification, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const { autoUpdater } = require('electron-updater');
const Sentry = require('@sentry/electron/main');

Sentry.init({
  dsn: "https://15bf6ed890e254dc94272dd272911ddd@o4510509929857024.ingest.de.sentry.io/4510509939032144",
  debug: false,
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (error) {
        const errorMessage = (error.message || error.toString() || '').toLowerCase();
        
        // Filtrar errores conocidos de AutoUpdater y Electron que son ruido
        if (
            errorMessage.includes('no files provided') ||
            errorMessage.includes('net::err_connection_refused') ||
            errorMessage.includes('cannot find latest')
        ) {
            return null; // Ignorar este evento
        }
    }
    return event;
  }
});

let mainWindow;
let backendProcess;

// Detectar si estamos en modo desarrollo
const isDev = !app.isPackaged;

// Establecer App ID para Windows (Importante para notificaciones y barra de tareas)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.victormunoz.inmobiliaria');
}

// Detectar si estamos en macOS antiguo (para ajustes de compatibilidad)
const isMacOSLegacy = () => {
  if (process.platform !== 'darwin') return false;
  try {
    const release = require('os').release();
    const majorVersion = parseInt(release.split('.')[0], 10);
    // Darwin 18.x = macOS 10.14 Mojave, Darwin 17.x = 10.13 High Sierra
    return majorVersion < 19; // Menor a Catalina (10.15)
  } catch (e) {
    return false;
  }
};

// Aplicar configuraciones de compatibilidad para sistemas legacy
if (isMacOSLegacy()) {
  console.log('🍎 macOS legacy detectado, aplicando configuraciones de compatibilidad...');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Optimización: No mostrar hasta que esté listo para evitar pantallazo blanco
    backgroundColor: '#1a1a2e', // Color de fondo oscuro inicial (mejor UX)
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // Evitar que se congele en segundo plano
      webviewTag: true, // Permitir <webview> para WhatsApp integrado
      // Configuraciones de compatibilidad
      webgl: !isMacOSLegacy(),
      offscreen: false,
    },
    // Configuración de ventana para mejor compatibilidad
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 15, y: 10 } : undefined,
    // Icono de la aplicación
    icon: process.platform === 'win32' 
      ? path.join(__dirname, 'assets/icon.ico')
      : process.platform === 'darwin'
        ? path.join(__dirname, 'assets/icon.icns')
        : path.join(__dirname, 'assets/icon.png')
  });

  // Mostrar ventana solo cuando esté lista visualmente
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // En macOS, asegurar que la ventana esté en primer plano
    if (process.platform === 'darwin') {
      mainWindow.focus();
    }
  });

  // Manejar errores de renderer para evitar pantallas blancas
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Error cargando contenido: ${errorDescription} (${errorCode})`);
    // Reintentar carga en 2 segundos
    if (!isDev) {
      setTimeout(() => {
        mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
      }, 2000);
    }
  });

  // Cargar la aplicación
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // En producción, cargar el archivo index.html construido
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  // Manejar apertura de enlaces externos en el navegador predeterminado
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Si la URL es externa (http/https), abrirla en el navegador del sistema
    if (url.startsWith('http:') || url.startsWith('https:')) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Comprobar actualizaciones al iniciar
  if (!isDev) {
    autoUpdater.autoDownload = false;
    
    autoUpdater.checkForUpdates().catch(err => {
        // Catch inicial por si falla síncronamente
        console.warn('⚠️ AutoUpdater check failed:', err.message);
    });
  }
}

function startBackend() {
  let scriptPath;

  if (isDev) {
    scriptPath = path.join(__dirname, '..', 'backend', 'server.js');
  } else {
    // En producción, el backend está en resources/backend
    scriptPath = path.join(process.resourcesPath, 'backend', 'server.js');
  }

  // Verificación de existencia del script
  const fs = require('fs');
  if (!fs.existsSync(scriptPath)) {
    dialog.showErrorBox('Error Crítico', `No se encuentra el archivo del servidor backend en:\n${scriptPath}\n\nLa aplicación no funcionará correctamente.`);
    return;
  }

  console.log('Iniciando Backend desde:', scriptPath);

  const userDataPath = app.getPath('userData');
  console.log('User Data Path:', userDataPath);
  
  // Archivo de logs del proceso principal (para debug en producción)
  const mainLogPath = path.join(userDataPath, 'main.log');

  // Rotación de logs main
  try {
      if (fs.existsSync(mainLogPath)) {
          const stats = fs.statSync(mainLogPath);
          if (stats.size > 5 * 1024 * 1024) { // 5MB
              const backupPath = mainLogPath + '.old';
              if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
              fs.renameSync(mainLogPath, backupPath);
          }
      }
  } catch (e) {}

  const logToFile = (msg) => {
    try {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(mainLogPath, `[${timestamp}] ${msg}\n`);
    } catch (e) { console.error('Error writing to main log:', e); }
  };

  logToFile('--- Starting Backend ---');
  logToFile(`Script Path: ${scriptPath}`);

  try {
    // Usar fork para lanzar el backend como un proceso hijo independiente
    // Esto usa el binario de Node.js integrado en Electron
    backendProcess = fork(scriptPath, [], {
      cwd: path.dirname(scriptPath), // IMPORTANTE: Fijar directorio de trabajo
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        PORT: 3001,
        USER_DATA_PATH: userDataPath
      }
    });

    backendProcess.on('error', (err) => {
      const msg = `Failed to start backend process: ${err.message}`;
      console.error(msg);
      logToFile(msg);
      dialog.showErrorBox('Error de Inicio', `Falló el inicio del proceso backend:\n${err.message}`);
    });

    backendProcess.stdout.on('data', (data) => {
      const msg = `[Backend]: ${data}`;
      console.log(msg);
      logToFile(msg.trim());
    });

    backendProcess.stderr.on('data', (data) => {
      const msg = `[Backend Error]: ${data}`;
      console.error(msg);
      logToFile(msg.trim());
    });

    backendProcess.on('exit', (code, signal) => {
      const msg = `Backend exited with code ${code} and signal ${signal}`;
      console.log(msg);
      logToFile(msg);
      if (code !== 0 && code !== null) {
        if (!app.isQuitting) {
          dialog.showErrorBox('Error del Servidor Backend',
            `El proceso del servidor se ha detenido inesperadamente (Código: ${code}, Señal: ${signal}).\n\n` +
            `Posibles causas:\n` +
            `1. Base de datos corrupta o bloqueada.\n` +
            `2. Puerto 3001 ocupado.\n` +
            `3. Error en módulo nativo (better-sqlite3).\n\n` +
            `La aplicación puede no funcionar correctamente. Se recomienda reiniciar.`);
        }
      }
    });
  } catch (err) {
    const msg = `Exception starting backend: ${err.message}`;
    console.error(msg);
    logToFile(msg);
    dialog.showErrorBox('Excepción Fatal', `Error al intentar iniciar el backend:\n${err.message}`);
  }
}

let splashWindow;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: process.platform === 'win32' 
      ? path.join(__dirname, 'assets/icon.ico')
      : process.platform === 'darwin'
        ? path.join(__dirname, 'assets/icon.icns')
        : path.join(__dirname, 'assets/icon.png')
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

async function waitForBackend() {
  const { net } = require('electron');
  const checkUrl = 'http://localhost:3001/';
  
  const check = () => {
    return new Promise((resolve) => {
      try {
        const request = net.request(checkUrl);
        request.on('response', (response) => {
          resolve(response.statusCode === 200);
        });
        request.on('error', (error) => {
          resolve(false);
        });
        request.end();
      } catch (e) {
        resolve(false);
      }
    });
  };

  let retries = 0;
  // Esperar hasta 45 segundos (algunos sistemas son lentos iniciando node/sqlite)
  while (retries < 45) {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('status-update', `Iniciando servidor... (${retries + 1}/45)`);
    }
    
    const isReady = await check();
    if (isReady) {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send('status-update', `¡Servidor conectado! Iniciando interfaz...`);
      }
      // Pequeña pausa para que el usuario vea "Conectado"
      await new Promise(r => setTimeout(r, 800));
      return true;
    }
    
    await new Promise(r => setTimeout(r, 1000));
    retries++;
  }
  return false;
}

app.whenReady().then(async () => {
  createSplashWindow();
  
  // Dar tiempo a que el splash se renderice
  await new Promise(r => setTimeout(r, 500));
  
  startBackend();
  
  const backendReady = await waitForBackend();
  
  createWindow();
  
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }

  if (!backendReady) {
    dialog.showErrorBox('Advertencia de Inicio', 
      'El servidor backend tardó demasiado en responder.\n' + 
      'La aplicación se abrirá, pero es posible que veas errores de conexión iniciales.');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (backendProcess) {
    console.log('Matando proceso backend...');
    try {
      process.kill(backendProcess.pid, 'SIGKILL'); // Forzar cierre inmediato
    } catch (e) {
      console.error('Error matando backend:', e);
    }
  }
});

// Eventos de Auto-Updater
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available.', info);
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'available', info });

  // Notificación nativa con versión
  new Notification({
    title: 'Nueva Actualización Disponible',
    body: `La versión ${info.version} está lista para descargar.`
  }).show();
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available.', info);
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'not-available', info });
});

autoUpdater.on('error', (err) => {
  const msg = err.message || '';
  console.log('Error in auto-updater. ' + msg);
  
  // FILTRADO DE ERRORES CONOCIDOS (Sentry & UI)
  // Ignorar error 404, "Cannot find latest" y "No files provided" (común cuando no hay release o artifacts válidos)
  if (msg.includes('404') || msg.includes('Cannot find latest') || msg.includes('No files provided')) {
    console.log('⚠️ Suppressing expected AutoUpdater error - treating as update-not-available');
    
    // Notificar a la UI que no hay actualización (en lugar de error)
    if (mainWindow) {
        mainWindow.webContents.send('update-status', { 
            status: 'not-available', 
            info: { version: 'latest', reason: msg } 
        });
    }
    return;
  }

  // Si es un error real, enviarlo a Sentry y a la UI
  console.error('❌ AutoUpdater Real Error:', err);
  Sentry.captureException(err);

  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', error: msg });
});

// Global Error Handlers para evitar reportes basura en Sentry
process.on('unhandledRejection', (reason, promise) => {
  const msg = reason instanceof Error ? reason.message : JSON.stringify(reason);
  
  // Filtrar errores conocidos
  if (msg.includes('No files provided') || msg.includes('net::ERR_CONNECTION_REFUSED')) {
      console.warn('⚠️ Unhandled Rejection ignorado (conocido):', msg);
      return;
  }
  
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Dejar que Sentry lo capture (o capturarlo manualmente si Sentry no está hookeado automáticamente)
  // Sentry suele capturar esto automáticamente, pero si queremos filtrar, deberíamos usar beforeSend en Sentry.init
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'progress', progress: progressObj });
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded');
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloaded', info });

  // Notificación nativa de descarga completada
  new Notification({
    title: 'Actualización Lista',
    body: `La versión ${info.version} se ha descargado. Reinicia para instalar.`
  }).show();
});

// IPC Handlers para control manual desde el frontend
ipcMain.handle('check-for-updates', () => {
  if (!isDev) {
    autoUpdater.checkForUpdates();
  }
});

ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
