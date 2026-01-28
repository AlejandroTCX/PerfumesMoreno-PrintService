const express = require('express');
const cors = require('cors');
const { BrowserWindow } = require('electron');

let serverInstance = null;
let mainWindowRef = null;

/**
 * Inicia el servidor HTTP para recibir solicitudes de impresión
 */
async function startServer(port, defaultPrinter, mainWindow) {
  mainWindowRef = mainWindow;

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'PerfumesMoreno Print Service',
      version: '1.0.0',
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
      await printHTML(content, targetPrinter, copies, silent);
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
      await printHTML(htmlContent, targetPrinter, copies, true);
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
 * Imprime HTML usando una ventana oculta de Electron
 */
async function printHTML(htmlContent, printerName, copies = 1, silent = true) {
  return new Promise((resolve, reject) => {
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

    // HTML completo con estilos para impresora térmica
    const fullHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    @page {
      size: 80mm auto;
      margin: 0;
    }
    @media print {
      html, body {
        width: 80mm;
        margin: 0;
        padding: 0;
      }
    }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 80mm;
      padding: 2mm;
      display: flex;
      justify-content: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body > * {
      width: 100%;
      max-width: 76mm;
      margin: 0 auto;
      text-align: center;
    }
    table {
      width: 100%;
      text-align: left;
    }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`;

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHTML)}`);

    printWindow.webContents.on('did-finish-load', () => {
      // Pequeño delay para asegurar que el contenido se renderizó
      setTimeout(() => {
        const printOptions = {
          silent: silent,
          printBackground: true,
          deviceName: printerName,
          copies: copies,
          margins: {
            marginType: 'none'
          },
          pageSize: {
            width: 80000, // microns (80mm)
            height: 3000000 // 3000mm - large enough for continuous roll paper
          }
        };

        printWindow.webContents.print(printOptions, (success, failureReason) => {
          printWindow.close();

          if (success) {
            resolve();
          } else {
            reject(new Error(failureReason || 'Error de impresión desconocido'));
          }
        });
      }, 100);
    });

    printWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      printWindow.close();
      reject(new Error(`Error cargando contenido: ${errorDescription}`));
    });
  });
}

module.exports = { startServer, stopServer };
