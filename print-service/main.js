const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell, ipcMain, powerMonitor } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { startServer, stopServer } = require('./server');

// Configuración persistente
const store = new Store({
  defaults: {
    port: 3003,
    printer: '',
    autoLaunch: true,
    minimizeToTray: true
  }
});

let mainWindow = null;
let tray = null;
let server = null;

// Evitar múltiples instancias
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    maximizable: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (event) => {
    if (store.get('minimizeToTray')) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.once('ready-to-show', () => {
    // No mostrar al iniciar, solo en tray
  });
}

function createTray() {
  // Crear icono para el tray
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      // Crear un icono simple si no existe el archivo
      trayIcon = nativeImage.createEmpty();
    }
    // Redimensionar para el tray
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('PerfumesMoreno Print Service');

  updateTrayMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}

function updateTrayMenu() {
  const printerName = store.get('printer') || 'No configurada';
  const port = store.get('port');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🖨️ PerfumesMoreno Print Service',
      enabled: false
    },
    { type: 'separator' },
    {
      label: `Puerto: ${port}`,
      enabled: false
    },
    {
      label: `Impresora: ${printerName}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: '⚙️ Configuración',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    {
      label: '🔄 Reiniciar servidor',
      click: async () => {
        await restartServer();
        dialog.showMessageBox({
          type: 'info',
          title: 'Servidor reiniciado',
          message: 'El servidor de impresión ha sido reiniciado.'
        });
      }
    },
    {
      label: '📋 Ver impresoras',
      click: async () => {
        const printers = await mainWindow.webContents.getPrintersAsync();
        const printerList = printers.map(p => `• ${p.name}${p.isDefault ? ' (default)' : ''}`).join('\n');
        dialog.showMessageBox({
          type: 'info',
          title: 'Impresoras disponibles',
          message: printerList || 'No se encontraron impresoras'
        });
      }
    },
    { type: 'separator' },
    {
      label: '❌ Salir',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

async function restartServer() {
  if (server) {
    await stopServer(server);
  }
  server = await startServer(store.get('port'), store.get('printer'), mainWindow);
}

// Auto-launch en Windows
function setupAutoLaunch() {
  if (process.platform === 'win32') {
    const exePath = process.execPath;
    app.setLoginItemSettings({
      openAtLogin: store.get('autoLaunch'),
      path: exePath,
      args: ['--hidden']
    });
  }
}

// Power monitor - restart server on wake from sleep
function setupPowerMonitor() {
  powerMonitor.on('resume', async () => {
    console.log('💤 Sistema despertó del modo suspensión');
    // Wait a moment for network to be ready
    setTimeout(async () => {
      console.log('🔄 Reiniciando servidor de impresión...');
      await restartServer();
      console.log('✅ Servidor de impresión reiniciado después de wakeup');
    }, 3000); // Wait 3 seconds for network/system to stabilize
  });

  powerMonitor.on('suspend', () => {
    console.log('😴 Sistema entrando en modo suspensión');
  });

  powerMonitor.on('lock-screen', () => {
    console.log('🔒 Pantalla bloqueada');
  });

  powerMonitor.on('unlock-screen', async () => {
    console.log('🔓 Pantalla desbloqueada');
    // Also restart on unlock to ensure service is running
    setTimeout(async () => {
      await restartServer();
      console.log('✅ Servidor verificado después de desbloqueo');
    }, 2000);
  });
}

app.whenReady().then(async () => {
  createWindow();
  createTray();
  setupAutoLaunch();
  setupPowerMonitor(); // Listen for sleep/wake events

  // Iniciar servidor HTTP
  server = await startServer(store.get('port'), store.get('printer'), mainWindow);

  console.log('✅ PerfumesMoreno Print Service iniciado');
  console.log('💡 El servicio se reiniciará automáticamente después de:');
  console.log('   - Suspensión/hibernación');
  console.log('   - Desbloqueo de pantalla');

  // Si se inició con --hidden, no mostrar ventana
  if (!process.argv.includes('--hidden')) {
    // Mostrar ventana solo la primera vez o si no hay impresora configurada
    if (!store.get('printer')) {
      mainWindow.show();
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // No cerrar la app, solo ocultar
  }
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  if (server) {
    await stopServer(server);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers para comunicación con el renderer

// Obtener configuración
ipcMain.handle('get-config', () => {
  return {
    port: store.get('port'),
    printer: store.get('printer'),
    autoLaunch: store.get('autoLaunch'),
    minimizeToTray: store.get('minimizeToTray')
  };
});

// Guardar configuración
ipcMain.handle('save-config', (event, config) => {
  store.set('port', config.port);
  store.set('printer', config.printer);
  store.set('autoLaunch', config.autoLaunch);
  store.set('minimizeToTray', config.minimizeToTray);

  // Actualizar auto-launch
  setupAutoLaunch();

  // Actualizar menú del tray
  updateTrayMenu();

  return true;
});

// Obtener impresoras
ipcMain.handle('get-printers', async () => {
  if (mainWindow) {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({
      name: p.name,
      isDefault: p.isDefault,
      status: p.status
    }));
  }
  return [];
});

// Probar impresión
ipcMain.handle('test-print', async (event, printerName) => {
  const testHTML = `
    <div style="font-family: monospace; text-align: center; padding: 20px;">
      <div style="font-size: 18px; font-weight: bold;">🖨️ PRUEBA DE IMPRESIÓN</div>
      <div style="margin: 15px 0; border-top: 1px dashed #000;"></div>
      <div>PerfumesMoreno Print Service</div>
      <div style="margin-top: 10px;">Impresora: ${printerName}</div>
      <div>Fecha: ${new Date().toLocaleString('es-MX')}</div>
      <div style="margin: 15px 0; border-top: 1px dashed #000;"></div>
      <div style="font-size: 12px;">Si puedes leer esto,</div>
      <div style="font-size: 12px;">la configuración es correcta! ✅</div>
      <div style="margin-top: 20px;">================================</div>
    </div>
  `;

  // Crear ventana oculta para imprimir
  const printWindow = new BrowserWindow({
    width: 300,
    height: 400,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { margin: 0; padding: 0; width: 80mm; }
      </style>
    </head>
    <body>${testHTML}</body>
    </html>
  `;

  return new Promise((resolve, reject) => {
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHTML)}`);

    printWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        printWindow.webContents.print({
          silent: true,
          printBackground: true,
          deviceName: printerName,
          margins: { marginType: 'none' }
        }, (success, failureReason) => {
          printWindow.close();
          if (success) {
            resolve(true);
          } else {
            reject(new Error(failureReason || 'Error de impresión'));
          }
        });
      }, 100);
    });
  });
});

// Reiniciar servidor
ipcMain.handle('restart-server', async () => {
  await restartServer();
  return true;
});

// Obtener versión
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

// Exponer funciones para el renderer
global.store = store;
global.updateTrayMenu = updateTrayMenu;
global.restartServer = restartServer;
