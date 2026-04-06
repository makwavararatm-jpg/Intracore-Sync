const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('intracore', {
    unlockPC: () => ipcRenderer.send('unlock-pc'),
    lockPC: () => ipcRenderer.send('lock-pc'),
    showWarning: () => ipcRenderer.send('show-warning') // <-- NEW COMMAND
});