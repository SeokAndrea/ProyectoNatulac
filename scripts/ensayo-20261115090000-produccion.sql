-- Ensayo de 20261115090000 EN PRODUCCIÓN sin dejar nada: aplica la migración y corre el ensayo dentro de una
-- transacción que se deshace (el ensayo termina con rollback). Correr desde la carpeta del proyecto:
--   bash scripts/aplicar-migracion.sh scripts/ensayo-20261115090000-produccion.sql
-- Mientras dura (unos segundos) la migración bloquea `preparaciones`, igual que al aplicarla de verdad:
-- hacerlo en un momento tranquilo. Los avisos «saltado» del ensayo no son fallas.
begin;
\i supabase/migrations/20261115090000_rendimiento_semielaborado.sql
\i scripts/ensayo-20261115090000.sql
rollback;
