const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Obtener configuración
  getConfig: () => ipcRenderer.invoke('get-config'),

  // Guardar configuración
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // Obtener impresoras
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  // Probar impresión
  testPrint: (printer) => ipcRenderer.invoke('test-print', printer),

  // Reiniciar servidor
  restartServer: () => ipcRenderer.invoke('restart-server'),

  // Obtener versión
  getVersion: () => ipcRenderer.invoke('get-version')
});
