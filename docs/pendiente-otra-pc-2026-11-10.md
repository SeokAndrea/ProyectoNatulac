# Pendiente para el 10 de noviembre de 2026 (revisar la otra PC)

Nota para Claude. Primero se revisa la otra PC; lo hecho en la laptop nueva no se commitea hasta entonces.

## Qué falta

- La rama de **nitrógeno** no está en GitHub. Debe estar en la otra PC.
- En la otra PC: `git branch`, `git status`, commit si hay cambios y `git push -u origin <rama>`.
- Ver también si hay trabajo sin subir en otras ramas.

## Hecho en la laptop nueva el 9 de noviembre (sin commitear, solo en esa laptop)

1. **Anotar paradas sin choque de horas.**
   - Migración nueva `supabase/migrations/20261115290000_anotar_parada_sin_choque_de_horas.sql`: copia de `anotar_parada` (de `20261113290000`) sin el chequeo "Ya hay una parada con horas en esa línea en ese horario".
   - `src/components/lineas/PanelParadasLinea.tsx`: si no hay tramo libre, anota igual como «terminó recién» (antes: "No queda tiempo libre").
   - Motivo: desde el 4 de noviembre (`4ee3cef`) las paradas suman todos sus minutos aunque se pisen, pero Anotar y la base seguían rechazando solapes.
   - Aplicada solo en el Supabase local. Falta aplicarla en el servidor de planta.
2. **Migraciones duplicadas en `main`** (mismo número, rompen `supabase start`):
   - `20261114690000_valvula_aux_remota.sql` pasó a `20261114700000_...`
   - `20261114790000_estado_lineas.sql` pasó a `20261114800000_...`
   - Riesgo: si el servidor de planta ya aplicó esas versiones con el nombre viejo, el nombre nuevo se ejecutaría otra vez. Confirmar cómo se aplican las migraciones allá antes de commitear.
3. `20261104090000_corrida_pt_en_cero_no_bloquea_lote.sql`: se quitó `cajas_retenidas` (ya la borró `20261037090000`; `20261111790000` hace la misma corrección).

## Pendientes y dudas

- Líneas cuenta las paradas pendientes de los últimos 30 días (`LineasEstadoPlanta.tsx:114-118`). Por eso la Línea 2 mostró varias a dos supervisores. Decidir si se limita al turno actual.
- Falla 1 test que ya fallaba antes: `ModoParadas.test.tsx` (parada Operacional abierta de una línea sin corrida).
- La rama `rework/preparacion-PLC` (de hoy) no está en `main`. Sus migraciones son `20261115890000` y `20261115990000`; no chocan con la nueva.

## Al traer la rama de nitrógeno

1. `git merge origin/main` y renombrar sus migraciones con una fecha mayor a la última de `main`.
2. Buscar números repetidos: `git ls-tree --name-only origin/<rama> supabase/migrations | sed 's/_.*//' | sort | uniq -d`.
3. Revisar que ninguna migración con número menor redefina `anotar_parada` con una copia vieja (volvería el rechazo de solape).
4. Probar con `supabase stop` y `supabase start` (aplica todo desde cero).
5. No renombrar migraciones que ya corrieron en el servidor de planta.

## Para llevar los cambios a la otra PC (sin commitear)

Desde la laptop nueva: `git diff > cambios-2026-11-09.patch`. En la otra PC: `git apply cambios-2026-11-09.patch`. Las migraciones nuevas (archivos sin seguimiento) hay que copiarlas a mano.
