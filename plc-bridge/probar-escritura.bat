@echo off
setlocal

rem === Prueba de ESCRITURA al PLC sobre DB_COMANDOS (DB9, bloque de pruebas) ===
rem Escribe una variable, la lee de vuelta y dice si llego. Comparar con la
rem pantalla de prueba de la HMI. No toca el bridge ni la app.

set PLC_HOST=192.168.0.10

cd /d "%~dp0"

echo ===========================================
echo  Prueba de escritura al PLC (DB9)
echo  PLC_HOST=%PLC_HOST%
echo ===========================================
echo.

node src\prueba-escritura.js

echo.
pause
