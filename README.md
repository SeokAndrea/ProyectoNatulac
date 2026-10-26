# Natulac · Aséptico

App web de la planta Aséptico de Natulac: turnos, preparación de tanques, líneas,
producto terminado, paradas, calidad, indicadores, programación y paneles en vivo.

## Cómo está armada

- **Frontend:** React + TypeScript + Vite + Tailwind (`src/`).
- **Base de datos:** PostgreSQL propio en el servidor de planta (`db_control_nectares`,
  antes Supabase). La app llama funciones de la base por PostgREST (servicio `api`) con
  `@supabase/postgrest-js`, y guarda los PDF de las actas en una carpeta del servidor
  (servicio `archivos`). El navegador solo habla con el puerto de la app: Vite reenvía
  `/api` y `/archivos` (ver `vite.config.ts`). El login es propio (`verificar_login`) y
  cada petición lleva una credencial en el header `x-sesion`.
- **Lógica:** casi toda vive en funciones de la base (`supabase/migrations/`, en orden por
  fecha). Las tablas tienen RLS sin políticas: todo pasa por funciones.
- **Tareas programadas:** `pg_cron` (cerrar turnos vencidos, relevo de respaldo, sellar
  corridas).
- **PLC (en prueba):** `plc-bridge/` lee el PLC de Preparación y lo manda por WebSocket.

## Correr la app

1. Copiar `.env.example` como `.env.local` y completar los `DB_*`.
2. `npm install`
3. `npm run dev` (desarrollo; usa la API del servidor de planta, puertos 4037/4038) ·
   `npm run build` (producción) · `npm test` (pruebas).

En el servidor de planta corre con Docker:
`docker compose --env-file .env.local --profile preview up -d --build`
(app en el 4035, plc-bridge en el 4036, PostgREST en el 4037, PDF de actas en el 4038; el servicio
`correo` manda los avisos de Solicitudes de Inspección / Intervención si `SMTP_*` y `CORREO_PARA` están puestos).
Los PDF quedan en `../natulac-actas` (al lado de la carpeta del proyecto).

## Base de datos

- `supabase/migrations/`: cada cambio de la base, en orden. Se aplican en ese orden.
- `supabase/ESQUEMA.md`: mapa de tablas y funciones.
- `scripts/generar-sql-maestro.ps1`: copia completa (estructura + datos) para un PostgreSQL
  normal. No incluye los PDF de las actas: esos se bajan con `node scripts/descargar-actas.mjs`.

## Documentación

- `MAPA.md`: dónde está cada pantalla y su lógica.
- `docs/`: planes y decisiones de cada módulo.