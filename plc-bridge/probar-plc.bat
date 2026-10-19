@echo off
setlocal

rem === Prueba de comunicacion con el PLC real (DB_MONITOREO / DB5) ===
rem Deja esta ventana abierta mientras se hace la prueba. Para detenerlo:
rem cerrar la ventana, o Ctrl+C y luego "S" (o "Y" si Windows esta en ingles).

set PLC_MODO=real
set PLC_HOST=192.168.0.10
set PLC_BRIDGE_PUERTO=4036

rem Se mueve a la carpeta donde esta este .bat (plc-bridge), sin importar
rem desde donde se haga doble clic.
cd /d "%~dp0"

echo ===========================================
echo  Prueba de conexion al PLC
echo  PLC_HOST=%PLC_HOST%   PLC_MODO=%PLC_MODO%
echo  WebSocket en el puerto %PLC_BRIDGE_PUERTO%
echo ===========================================
echo.

node src\index.js

echo.
echo ---------------------------------------------
echo El script se detuvo. Si fue un error, el mensaje
echo de arriba dice por que (ej. no encuentra el PLC,
echo PUT/GET no habilitado, direccion incorrecta).
echo ---------------------------------------------
pause
