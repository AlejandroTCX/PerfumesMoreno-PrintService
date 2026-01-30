const express = require('express');
const cors = require('cors');
const { BrowserWindow } = require('electron');

let serverInstance = null;
let mainWindowRef = null;

// Persistent hidden window for fast printing
let printWindow = null;
let printBusy = false;
const printQueue = [];

/**
 * Creates or returns the persistent hidden print window
 */
function getPrintWindow() {
  if (printWindow && !printWindow.isDestroyed()) {
    return printWindow;
  }
  printWindow = new BrowserWindow({
    width: 302,
    height: 402,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true
    }
  });
  printWindow.on('closed', () => { printWindow = null; });
  return printWindow;
}

/**
 * Inicia el servidor HTTP para recibir solicitudes de impresión
 */
async function startServer(port, defaultPrinter, mainWindow) {
  mainWindowRef = mainWindow;

  // Pre-create the print window so first print is fast
  getPrintWindow();

  const app = express();
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: false
  }));
  // Explicit preflight for all routes
  app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept');
    res.sendStatus(204);
  });
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'PerfumesMoreno Print Service',
      version: '1.0.4',
      port: port,
      printer: defaultPrinter
    });
  });

  // Listar impresoras
  app.get('/printers', async (req, res) => {
    try {
      const printers = await mainWindowRef.webContents.getPrintersAsync();
      res.json({
        printers: printers.map(p => ({
          name: p.name,
          isDefault: p.isDefault,
          status: p.status
        })),
        default: defaultPrinter || printers.find(p => p.isDefault)?.name
      });
    } catch (error) {
      res.status(500).json({ error: 'Error obteniendo impresoras', details: error.message });
    }
  });

  // Imprimir HTML
  app.post('/print', async (req, res) => {
    const { content, printer, copies = 1, silent = true } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'No se proporcionó contenido para imprimir' });
    }

    const targetPrinter = printer || defaultPrinter;

    try {
      await enqueuePrint(content, targetPrinter, copies, silent);
      console.log(`✅ Impresión enviada a: ${targetPrinter}`);
      res.json({ success: true, message: 'Impresión enviada', printer: targetPrinter });
    } catch (error) {
      console.error('❌ Error al imprimir:', error);
      res.status(500).json({ error: 'Error al imprimir', details: error.message });
    }
  });

  // Imprimir texto plano
  app.post('/print-text', async (req, res) => {
    const { content, printer, copies = 1 } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'No se proporcionó contenido para imprimir' });
    }

    const targetPrinter = printer || defaultPrinter;
    const htmlContent = `<pre style="font-family: monospace; font-size: 12px; margin: 0;">${content}</pre>`;

    try {
      await enqueuePrint(htmlContent, targetPrinter, copies, true);
      res.json({ success: true, message: 'Impresión enviada', printer: targetPrinter });
    } catch (error) {
      res.status(500).json({ error: 'Error al imprimir', details: error.message });
    }
  });

  return new Promise((resolve, reject) => {
    serverInstance = app.listen(port, '127.0.0.1', () => {
      console.log(`🖨️ Print Server escuchando en http://localhost:${port}`);
      resolve(serverInstance);
    });

    serverInstance.on('error', (err) => {
      console.error('Error iniciando servidor:', err);
      reject(err);
    });
  });
}

/**
 * Detiene el servidor HTTP
 */
async function stopServer(server) {
  return new Promise((resolve) => {
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.close();
      printWindow = null;
    }
    if (server) {
      server.close(() => {
        console.log('🛑 Print Server detenido');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Queues a print job. Only one print runs at a time to avoid conflicts
 * on the shared window.
 */
function enqueuePrint(htmlContent, printerName, copies, silent) {
  return new Promise((resolve, reject) => {
    printQueue.push({ htmlContent, printerName, copies, silent, resolve, reject });
    if (!printBusy) processQueue();
  });
}

async function processQueue() {
  if (printBusy || printQueue.length === 0) return;
  printBusy = true;

  const job = printQueue.shift();
  try {
    await printHTML(job.htmlContent, job.printerName, job.copies, job.silent);
    job.resolve();
  } catch (err) {
    job.reject(err);
  } finally {
    printBusy = false;
    if (printQueue.length > 0) processQueue();
  }
}

/**
 * Imprime HTML reutilizando la ventana oculta persistente
 */
async function printHTML(htmlContent, printerName, copies = 1, silent = true) {
  const win = getPrintWindow();

  const fullHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    @page{size:80mm auto;margin:0}
    @media print{html,body{width:80mm;margin:0;padding:0}}
    body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:1mm 0 0 0;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body>*{width:100%;max-width:80mm;text-align:center;margin-left:0!important;margin-right:0!important}
    table{width:100%;text-align:left}
  </style>
</head>
<body>${htmlContent}</body>
</html>`;

  // Load new content into the existing window
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHTML)}`);

  // Measure actual content height so PDF printers get a fitted page
  const contentHeightPx = await win.webContents.executeJavaScript(
    'document.body.scrollHeight'
  );
  // Convert px to microns (1px ≈ 264.58 microns at 96dpi) + 5mm buffer
  const contentHeightMicrons = Math.ceil(contentHeightPx * 264.58) + 5000;
  // Use measured height but cap minimum at 50mm and no max limit for long tickets
  const pageHeightMicrons = Math.max(50000, contentHeightMicrons);

  return new Promise((resolve, reject) => {
    const printOptions = {
      silent: silent,
      printBackground: true,
      deviceName: printerName,
      copies: copies,
      margins: { marginType: 'none' },
      pageSize: {
        width: 80000,
        height: pageHeightMicrons
      }
    };

    win.webContents.print(printOptions, (success, failureReason) => {
      if (success) {
        resolve();
      } else {
        reject(new Error(failureReason || 'Error de impresión desconocido'));
      }
    });
  });
}

module.exports = { startServer, stopServer };
