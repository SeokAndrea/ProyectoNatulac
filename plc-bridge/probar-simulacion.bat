@echo off
setlocal

rem === Bridge en simulacion (sin PLC) ===
rem Util para probar la pantalla o "verlo desde otra PC" sin el PLC conectado.
rem El resto de la configuracion (puerto, tags extra) sale de bridge.conf.

set PLC_MODO=simulacion

cd /d "%~dp0"

echo ===========================================
echo  plc-bridge - modo SIMULACION (sin PLC)
echo  Configuracion: bridge.conf
echo ===========================================
echo.

node src\index.js

echo.
pause
