const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let backendProcess;

// Detectar si estamos en modo desarrollo
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../frontend/public/vite.svg')
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

  console.log('Iniciando Backend desde:', scriptPath);

  const userDataPath = app.getPath('userData');
  console.log('User Data Path:', userDataPath);

  // Usar fork para lanzar el backend como un proceso hijo independiente
  // Esto usa el binario de Node.js integrado en Electron
  backendProcess = fork(scriptPath, [], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: { 
      ...process.env, 
      PORT: 3001,
      USER_DATA_PATH: userDataPath
    }
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend]: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend Error]: ${data}`);
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend exited with code ${code}`);
  });
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
