const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Aquí puedes exponer funciones seguras al frontend si es necesario
    // Por ejemplo:
    // sendNotification: (message) => ipcRenderer.send('notify', message)
});
