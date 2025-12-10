const { contextBridge, ipcRenderer } = require('electron');
const Sentry = require('@sentry/electron/renderer');

// Inicializar Sentry en Preload
Sentry.init();

contextBridge.exposeInMainWorld('electronAPI', {
    // Event listener
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, value) => callback(value)),
    
    // Actions
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    
    // Otros (ejemplo)
    sendNotification: (message) => ipcRenderer.send('notify', message)
});
