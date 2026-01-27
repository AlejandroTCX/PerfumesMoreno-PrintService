#!/bin/bash

# PerfumesMoreno Print Server Startup Script
# Este script inicia el servidor de impresión local

cd "$(dirname "$0")"

echo "🖨️  Iniciando PerfumesMoreno Print Server..."
echo ""

# Verificar que node esté instalado
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js no está instalado"
    echo "   Instálalo desde: https://nodejs.org"
    exit 1
fi

# Verificar dependencias
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
fi

# Mostrar impresoras disponibles
echo "📋 Impresoras disponibles en el sistema:"
lpstat -p 2>/dev/null || echo "   No se encontraron impresoras"
echo ""

# Iniciar servidor
node server.js
