# Plan — Calidad libera los lotes

Creado 2026-09-28. Estado: **hecho, activo solo en el Área de Pruebas.** La planta todavía no decidió si Calidad
va a liberar en Aséptico.

## Qué hace

- El supervisor prepara el tanque. Calidad registra **Brix, acidez (%) y conformidad** en la pantalla **Calidad**.
- Conforme: el mismo registro libera el lote (tanque Liberado). No conforme: observación obligatoria; el
  supervisor ajusta y Calidad vuelve a analizar. Se guardan todos los análisis.
- Rol **Analista de Calidad** y permiso **Analizar y liberar lotes** (`LOTE_LIBERAR`): lo traen Calidad y Jefe de
  Producción; se puede dar a otra persona desde Personal.
- Interruptor por área `areas.calidad_libera`. Apagado: el supervisor libera como siempre.

Migración `20261086090000_calidad_libera_lotes.sql`. Ensayo: `scripts/ensayo-20261086-calidad.sql`.

## Para aplicarlo (Pruebas)

1. Supabase → SQL Editor: pegar `scripts/ensayo-20261086-calidad.sql`. Debe terminar en «ENSAYO OK».
2. `npx supabase db push`.

## Para habilitarlo en Aséptico (cuando se decida)

1. Crear los usuarios de Calidad en Personal con rol **Analista de Calidad** y área **Aséptico**.
2. En `src/lib/apps.tsx`, tarjeta `calidad`: quitar `areasPermitidas: ["PRUEBAS"]`. Desplegar.
3. Encender el interruptor:
   ```sql
   update areas set calidad_libera = true where codigo = 'ASEPTICO';
   ```

## Pendiente

- Rangos de Brix y acidez por sabor (aviso de fuera de rango).
- Mostrar los análisis en el Acta.
