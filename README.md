# PerfumesMoreno Print Service

A local print service for silent thermal receipt printing. Designed to work with the PerfumesMoreno POS system, but can be used with any web application that needs to print receipts to thermal printers.

## Overview

This repository contains two solutions for silent thermal printing:

| Solution | Platform | Best For |
|----------|----------|----------|
| **print-server** | macOS/Linux | Simple Node.js server using native `lp` command |
| **print-service** | Windows/macOS/Linux | Full Electron app with GUI, system tray, and configuration |

## Quick Start

### Option 1: print-server (Node.js - macOS/Linux)

```bash
cd print-server
npm install
npm start
```

The server runs on `http://localhost:3003` by default.

### Option 2: print-service (Electron - All Platforms)

```bash
cd print-service
npm install
npm start
```

For production builds:
```bash
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## API Reference

Both solutions expose the same REST API:

### Health Check
```http
GET /health
```
Returns server status and configuration.

### List Printers
```http
GET /printers
```
Returns available printers on the system.

### Print HTML
```http
POST /print
Content-Type: application/json

{
  "content": "<div>Receipt HTML content</div>",
  "printer": "PrinterName",  // optional, uses default
  "copies": 1,               // optional, default: 1
  "silent": true             // optional, default: true
}
```

### Print Plain Text (print-service only)
```http
POST /print-text
Content-Type: application/json

{
  "content": "Plain text receipt content",
  "printer": "PrinterName",
  "copies": 1
}
```

## Configuration

### print-server

Edit `config.json`:
```json
{
  "printer": "YourPrinterName",
  "port": 3003,
  "lineWidth": 32
}
```

### print-service

Use the built-in GUI to configure:
- Default printer
- Server port
- Auto-launch on startup
- Minimize to system tray

## Usage Example

### JavaScript/Fetch
```javascript
async function printReceipt(html) {
  const response = await fetch('http://localhost:3003/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: html })
  });
  return response.json();
}

// Example usage
printReceipt(`
  <div style="text-align: center;">
    <h2>My Store</h2>
    <p>Thank you for your purchase!</p>
    <p>Total: $99.99</p>
  </div>
`);
```

### React Hook Example
```javascript
const usePrinter = () => {
  const print = async (content, options = {}) => {
    try {
      const res = await fetch('http://localhost:3003/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, ...options })
      });
      return await res.json();
    } catch (error) {
      console.error('Print error:', error);
      throw error;
    }
  };

  return { print };
};
```

## System Requirements

### print-server
- Node.js 18+
- macOS or Linux with CUPS printing system
- Thermal printer connected and configured via `lpstat -p`

### print-service
- Node.js 18+ (for development)
- Windows 10+, macOS 10.15+, or Linux
- Thermal printer connected to the system

## Thermal Printer Setup

### macOS
1. Open System Preferences > Printers & Scanners
2. Add your thermal printer
3. Note the printer name (visible in `lpstat -p`)
4. Set the printer name in `config.json` or the GUI

### Windows
1. Install printer drivers from manufacturer
2. Add printer via Settings > Devices > Printers & Scanners
3. Select the printer in the print-service GUI

### Linux
1. Install CUPS: `sudo apt install cups`
2. Add printer via CUPS web interface (`http://localhost:631`)
3. Configure in `config.json`

## Project Structure

```
PerfumesMoreno-PrintService/
├── print-server/          # Simple Node.js server
│   ├── server.js          # Main server file
│   ├── config.json        # Configuration
│   ├── package.json
│   └── start.sh           # Startup script
│
├── print-service/         # Electron desktop app
│   ├── main.js            # Electron main process
│   ├── server.js          # HTTP server module
│   ├── preload.js         # Preload script
│   ├── index.html         # Configuration UI
│   ├── package.json
│   └── assets/            # Icons and images
│
└── README.md
```

## License

MIT License - feel free to use in your own projects.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
