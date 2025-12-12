const { app, BrowserWindow, ipcMain, Notification, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const { autoUpdater } = require('electron-updater');
const Sentry = require('@sentry/electron/main');

Sentry.init({
  dsn: "https://15bf6ed890e254dc94272dd272911ddd@o4510509929857024.ingest.de.sentry.io/4510509939032144",
  debug: false
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
      // Configuraciones de compatibilidad
      webgl: !isMacOSLegacy(),
      offscreen: false,
    },
    // Configuración de ventana para mejor compatibilidad
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 15, y: 10 } : undefined,
    // Icono de la aplicación
    icon: path.join(__dirname, 'icon.png')
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

  // Comprobar actualizaciones al iniciar
  if (!isDev) {
    autoUpdater.autoDownload = false;
    autoUpdater.checkForUpdates();
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

app.whenReady().then(() => {
  startBackend();
  createWindow();

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
  if (backendProcess) {
    console.log('Matando proceso backend...');
    backendProcess.kill();
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
  console.log('Error in auto-updater. ' + err);
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', error: err.message });
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
