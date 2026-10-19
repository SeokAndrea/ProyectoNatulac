@echo off
setlocal

rem === Simulacion (sin PLC) - util para probar la parte de "verlo desde otra
rem PC" sin depender de que el PLC este conectado todavia ===

set PLC_MODO=simulacion
set PLC_BRIDGE_PUERTO=4036

cd /d "%~dp0"

echo ===========================================
echo  Simulacion de llenado (sin PLC)
echo  WebSocket en el puerto %PLC_BRIDGE_PUERTO%
echo ===========================================
echo.

node src\index.js

echo.
pause
