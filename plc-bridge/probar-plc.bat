@echo off
setlocal

rem === Bridge leyendo el PLC real ===
rem Toda la configuracion (IP del PLC, puerto, tags) esta en bridge.conf.
rem Este .bat solo fuerza el modo "real".
rem Deja esta ventana abierta mientras se hace la prueba. Para detenerlo:
rem cerrar la ventana, o Ctrl+C y luego "S" (o "Y" si Windows esta en ingles).

set PLC_MODO=real

rem Se mueve a la carpeta donde esta este .bat (plc-bridge), sin importar
rem desde donde se haga doble clic.
cd /d "%~dp0"

echo ===========================================
echo  plc-bridge - modo REAL (lee el PLC)
echo  Configuracion: bridge.conf
echo ===========================================
echo.

node src\index.js

echo.
echo ---------------------------------------------
echo El bridge se detuvo. Si fue un error, el mensaje
echo de arriba dice por que (ej. direccion mal escrita
echo en bridge.conf, no encuentra el PLC, PUT/GET).
echo ---------------------------------------------
pause
