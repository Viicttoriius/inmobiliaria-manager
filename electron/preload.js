const { contextBridge, ipcRenderer } = require('electron');

// try {
//     const Sentry = require('@sentry/electron/renderer');
//     // Inicializar Sentry en Preload
//     Sentry.init();
// } catch (error) {
//     console.error('Failed to initialize Sentry in preload:', error);
// }

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
