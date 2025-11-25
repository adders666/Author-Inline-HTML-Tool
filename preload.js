const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveState: (data) => ipcRenderer.invoke('save-state', data),
    saveStateAs: (data) => ipcRenderer.invoke('save-state-as', data),
    loadState: () => ipcRenderer.invoke('load-state'),
    exportPdf: () => ipcRenderer.invoke('export-pdf')
});
