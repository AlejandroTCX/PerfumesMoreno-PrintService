const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();

// Cargar configuración desde archivo
let config = {
  printer: 'ImpresoraTicket',
  port: 3003,
  lineWidth: 32
};

try {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    console.log('✅ Configuración cargada desde config.json');
  }
} catch (e) {
  console.warn('⚠️ No se pudo cargar config.json, usando valores por defecto');
}

const PORT = config.port;
const DEFAULT_PRINTER = config.printer;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Directorio temporal para los archivos
const TEMP_DIR = path.join(os.tmpdir(), 'perfumes-print');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Lista las impresoras disponibles en el sistema
 */
app.get('/printers', (req, res) => {
  exec('lpstat -p', (error, stdout, stderr) => {
    if (error) {
      console.error('Error listando impresoras:', error);
      return res.status(500).json({ error: 'No se pudieron listar las impresoras' });
    }

    const printers = stdout
      .split('\n')
      .filter(line => line.startsWith('printer'))
      .map(line => {
        const match = line.match(/printer (\S+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    res.json({ printers, default: DEFAULT_PRINTER });
  });
});

/**
 * Imprime HTML - convierte a texto para impresoras térmicas
 */
app.post('/print', async (req, res) => {
  const { content, printer = DEFAULT_PRINTER, copies = 1 } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'No se proporcionó contenido para imprimir' });
  }

  try {
    const timestamp = Date.now();
    const txtFile = path.join(TEMP_DIR, `ticket-${timestamp}.txt`);

    // Convertir HTML a texto formateado para impresora térmica
    const textContent = htmlToThermalText(content);
    fs.writeFileSync(txtFile, textContent);

    console.log(`📄 Archivo creado: ${txtFile}`);
    console.log(`🖨️  Imprimiendo en: ${printer}`);

    // Imprimir usando lp (macOS/Linux)
    const printCmd = `lp -d "${printer}" -n ${copies} "${txtFile}"`;

    exec(printCmd, (error, stdout, stderr) => {
      // Limpiar archivo temporal después de un delay
      setTimeout(() => {
        try {
          if (fs.existsSync(txtFile)) fs.unlinkSync(txtFile);
        } catch (e) {
          console.warn('Error limpiando archivo temporal:', e);
        }
      }, 5000);

      if (error) {
        console.error('❌ Error al imprimir:', error);
        console.error('stderr:', stderr);
        return res.status(500).json({
          error: 'Error al imprimir',
          details: error.message,
          stderr
        });
      }

      console.log('✅ Impresión enviada correctamente');
      res.json({ success: true, message: 'Impresión enviada', output: stdout });
    });

  } catch (error) {
    console.error('❌ Error procesando impresión:', error);
    res.status(500).json({ error: 'Error procesando la impresión', details: error.message });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', printer: DEFAULT_PRINTER, port: PORT });
});

/**
 * Convierte HTML a texto formateado para impresoras térmicas de 80mm
 * Mantiene el formato visual aproximado
 */
function htmlToThermalText(html) {
  const LINE_WIDTH = config.lineWidth || 32; // Caracteres por línea en impresora térmica

  let text = html
    // Remover scripts y estilos
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

    // Convertir elementos de bloque a líneas
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n' + '─'.repeat(LINE_WIDTH) + '\n')

    // Procesar tablas básicas
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/th>/gi, ' | ')

    // Remover todas las demás etiquetas
    .replace(/<[^>]+>/g, '')

    // Decodificar entidades HTML
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')

    // Limpiar espacios
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/ \n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Procesar líneas para centrar encabezados y alinear precios
  const lines = text.split('\n').map(line => {
    line = line.trim();

    // Detectar y formatear líneas con precios (ej: "Producto $123.45")
    const priceMatch = line.match(/^(.+?)\s*\$(\d+(?:\.\d{2})?)\s*$/);
    if (priceMatch) {
      const label = priceMatch[1].trim();
      const price = '$' + priceMatch[2];
      const spaces = LINE_WIDTH - label.length - price.length;
      if (spaces > 0) {
        return label + ' '.repeat(spaces) + price;
      }
    }

    // Detectar líneas que parecen encabezados (todo mayúsculas, cortas)
    if (line === line.toUpperCase() && line.length < LINE_WIDTH - 4 && !line.includes('$')) {
      const padding = Math.floor((LINE_WIDTH - line.length) / 2);
      return ' '.repeat(Math.max(0, padding)) + line;
    }

    return line;
  });

  // Agregar líneas de avance para el corte
  return lines.join('\n') + '\n\n\n\n\n';
}

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     🖨️  PerfumesMoreno Print Server                        ║
╠════════════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                             ║
║  Impresora: ${DEFAULT_PRINTER.padEnd(43)}║
║                                                            ║
║  Endpoints:                                                ║
║    POST /print      - Imprimir HTML/texto                  ║
║    GET  /printers   - Listar impresoras                    ║
║    GET  /health     - Estado del servidor                  ║
║                                                            ║
║  Para ver impresoras disponibles: lpstat -p                ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Mostrar impresoras disponibles al iniciar
  exec('lpstat -p 2>/dev/null', (error, stdout) => {
    if (!error && stdout) {
      console.log('Impresoras detectadas:');
      stdout.split('\n').filter(l => l).forEach(line => {
        console.log('  •', line);
      });
    }
  });
});
