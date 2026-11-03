@echo off
setlocal

rem === plc-bridge: un solo archivo para todo ===
rem Toda la configuracion (IP del PLC, puerto, tags, base de datos) esta en
rem bridge.conf; este menu solo elige que correr.
rem   1) Bridge con el PLC real: lee el PLC y acepta las ordenes de la app
rem      para abrir/cerrar las valvulas auxiliares.
rem   2) Bridge en simulacion: datos inventados, sin PLC.
rem   3) Prueba de escritura manual: abre/cierra Valv_Aux_Tank1..3 desde la
rem      consola, sin la app (OJO: mueve la valvula de verdad).
rem Para detener el bridge: Ctrl+C y luego "N" vuelve al menu ("S" cierra).

cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install --omit=dev
  echo.
)

:menu
cls
echo ===========================================
echo  plc-bridge (Preparacion - Contador de Agua)
echo  Configuracion: bridge.conf
echo ===========================================
echo.
echo   1) Bridge con el PLC real (lectura + control desde la app)
echo   2) Bridge en simulacion (sin PLC)
echo   3) Prueba de escritura manual (Valv_Aux_Tank1..3)
echo   0) Salir
echo.
set "opcion="
set /p "opcion=Opcion: "

if "%opcion%"=="1" goto real
if "%opcion%"=="2" goto simulacion
if "%opcion%"=="3" goto escritura
if "%opcion%"=="0" goto fin
goto menu

:real
echo.
echo --- Bridge modo REAL (deja esta ventana abierta durante la prueba) ---
echo.
set PLC_MODO=real
node srcindex.js
goto despues

:simulacion
echo.
echo --- Bridge modo SIMULACION ---
echo.
set PLC_MODO=simulacion
node srcindex.js
goto despues

:escritura
echo.
echo --- Prueba de escritura al PLC (DB9) ---
echo.
node srcprueba-escritura.js
goto despues

:despues
echo.
echo ---------------------------------------------
echo Termino. Si fue un error, el mensaje de arriba
echo dice por que (ej. direccion mal escrita en
echo bridge.conf, no encuentra el PLC, PUT/GET).
echo ---------------------------------------------
pause
goto menu

:fin
endlocal
