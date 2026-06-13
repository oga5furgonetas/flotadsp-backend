@echo off
title FlotaDSP - Vigilante de descargas
cd /d "%~dp0"
echo ============================================
echo   FlotaDSP - Vigilante de descargas
echo ============================================
echo.
echo Manten esta ventana abierta. Descarga tus
echo informes de Cortex como siempre y se suben
echo solos. Para parar: cierra esta ventana.
echo.
if not exist node_modules (
  echo Primera vez: instalando... espera un momento.
  call npm install
)
node vigilante.js
echo.
echo (El vigilante se ha detenido)
pause
