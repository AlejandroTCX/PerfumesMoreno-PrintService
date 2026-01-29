@echo off
title PerfumesMoreno Print Service - Uninstaller
echo ============================================
echo   PerfumesMoreno Print Service - Uninstaller
echo ============================================
echo.

:: Check for admin privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Ejecuta este archivo como Administrador.
    echo    Click derecho ^> Ejecutar como administrador
    echo.
    pause
    exit /b 1
)

echo [1/6] Cerrando procesos...
taskkill /F /IM "PerfumesMoreno Print Service.exe" >nul 2>&1
taskkill /F /IM "PerfumesMoreno*" >nul 2>&1
taskkill /F /IM "Uninstall PerfumesMoreno Print Service.exe" >nul 2>&1

:: Kill anything on port 3003
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3003 ^| findstr LISTENING') do (
    echo    Matando proceso en puerto 3003 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)
echo    Procesos cerrados.
echo.

echo [2/6] Eliminando archivos del programa...
set "APP_LOCAL=%LOCALAPPDATA%\Programs\perfumesmoreno-print-service"
set "APP_LOCAL2=%LOCALAPPDATA%\Programs\PerfumesMoreno Print Service"
set "APP_ROAMING=%APPDATA%\PerfumesMoreno Print Service"
set "APP_ROAMING2=%APPDATA%\perfumesmoreno-print-service"

if exist "%APP_LOCAL%" (
    rmdir /s /q "%APP_LOCAL%" >nul 2>&1
    echo    Eliminado: %APP_LOCAL%
)
if exist "%APP_LOCAL2%" (
    rmdir /s /q "%APP_LOCAL2%" >nul 2>&1
    echo    Eliminado: %APP_LOCAL2%
)
if exist "%APP_ROAMING%" (
    rmdir /s /q "%APP_ROAMING%" >nul 2>&1
    echo    Eliminado: %APP_ROAMING%
)
if exist "%APP_ROAMING2%" (
    rmdir /s /q "%APP_ROAMING2%" >nul 2>&1
    echo    Eliminado: %APP_ROAMING2%
)

:: Also check Program Files
set "APP_PF=%ProgramFiles%\PerfumesMoreno Print Service"
set "APP_PF86=%ProgramFiles(x86)%\PerfumesMoreno Print Service"
if exist "%APP_PF%" (
    rmdir /s /q "%APP_PF%" >nul 2>&1
    echo    Eliminado: %APP_PF%
)
if exist "%APP_PF86%" (
    rmdir /s /q "%APP_PF86%" >nul 2>&1
    echo    Eliminado: %APP_PF86%
)
echo    Archivos eliminados.
echo.

echo [3/6] Limpiando registro (HKCU\Software)...
reg delete "HKCU\Software\PerfumesMoreno Print Service" /f >nul 2>&1
reg delete "HKCU\Software\perfumesmoreno-print-service" /f >nul 2>&1
echo    Registro HKCU limpio.
echo.

echo [4/6] Limpiando registro de desinstalacion...
:: HKCU uninstall entries
for /f "tokens=*" %%k in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "PerfumesMoreno" 2^>nul ^| findstr "HKEY_"') do (
    echo    Eliminando: %%k
    reg delete "%%k" /f >nul 2>&1
)
:: HKLM uninstall entries (64-bit)
for /f "tokens=*" %%k in ('reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "PerfumesMoreno" 2^>nul ^| findstr "HKEY_"') do (
    echo    Eliminando: %%k
    reg delete "%%k" /f >nul 2>&1
)
:: HKLM uninstall entries (32-bit on 64-bit)
for /f "tokens=*" %%k in ('reg query "HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "PerfumesMoreno" 2^>nul ^| findstr "HKEY_"') do (
    echo    Eliminando: %%k
    reg delete "%%k" /f >nul 2>&1
)
echo    Registro de desinstalacion limpio.
echo.

echo [5/6] Eliminando accesos directos...
del /f /q "%USERPROFILE%\Desktop\PerfumesMoreno Print Service.lnk" >nul 2>&1
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\PerfumesMoreno Print Service.lnk" >nul 2>&1
del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\PerfumesMoreno Print Service.lnk" >nul 2>&1
:: Startup entries
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PerfumesMoreno Print Service.lnk" >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PerfumesMoreno Print Service" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "perfumesmoreno-print-service" /f >nul 2>&1
echo    Accesos directos eliminados.
echo.

echo [6/6] Limpiando cache de Electron...
set "ELECTRON_CACHE=%APPDATA%\perfumesmoreno-print-service"
if exist "%ELECTRON_CACHE%" (
    rmdir /s /q "%ELECTRON_CACHE%" >nul 2>&1
    echo    Cache eliminado.
)
echo.

echo ============================================
echo   Desinstalacion completada exitosamente!
echo   Ya puedes instalar la nueva version.
echo ============================================
echo.
pause
