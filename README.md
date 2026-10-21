# Natulac · Aséptico

App web de la planta Aséptico de Natulac: turnos, preparación de tanques, líneas,
producto terminado, paradas, calidad, indicadores, programación y paneles en vivo.

## Cómo está armada

- **Frontend:** React + TypeScript + Vite + Tailwind (`src/`).
- **Base de datos:** PostgreSQL 17. La app habla con ella con la librería de Supabase
  (`@supabase/supabase-js`): llama funciones de la base por la API REST (PostgREST) y
  guarda los PDF de las actas en el Storage (bucket `actas`). No usa Supabase Auth: el
  login es propio (`verificar_login`) y cada petición lleva una credencial en el header
  `x-sesion`.
- **Lógica:** casi toda vive en funciones de la base (`supabase/migrations/`, en orden por
  fecha). Las tablas tienen RLS sin políticas: todo pasa por funciones.
- **Tareas programadas:** `pg_cron` (cerrar turnos vencidos, relevo de respaldo, sellar
  corridas).
- **PLC (en prueba):** `plc-bridge/` lee el PLC de Preparación y lo manda por WebSocket.

## Correr la app

1. Copiar `.env.example` como `.env.local` y completar `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY`.
2. `npm install`
3. `npm run dev` (desarrollo) · `npm run build` (producción) · `npm test` (pruebas).

En el servidor de planta corre con Docker: `docker compose --profile preview up -d --build`
(app en el puerto 4035, plc-bridge en el 4036).

## Base de datos

- `supabase/migrations/`: cada cambio de la base, en orden. Se aplican en ese orden.
- `supabase/ESQUEMA.md`: mapa de tablas y funciones.
- `scripts/generar-sql-maestro.ps1`: copia completa (estructura + datos) para un PostgreSQL
  normal. No incluye los PDF de las actas: esos se bajan con `node scripts/descargar-actas.mjs`.

## Documentación

- `MAPA.md`: dónde está cada pantalla y su lógica.
- `docs/`: planes y decisiones de cada módulo.
- `manual-de-usuario.md`: manual para quien usa la app.
