-- ============================================================
-- CORRECCIÓN PUNTUAL: un Turno 3 arrancado después de medianoche quedó
-- con la fecha (y el código) del día siguiente.
-- ============================================================
-- Caso: Javier, noche del 2026-09-07 → 08. Activó el Turno 3 pasadas
-- las 00:00 y el sistema lo guardó como Turno 3 del 08 en vez del 07.
--
-- Esto NO es la solución de fondo (ver plan-rework-3-modulos-y-merma.md
-- §2.10 — la regla va en iniciar_turno). Es el arreglo de la fila que
-- ya quedó mal.
--
-- Plano, sin comandos de psql: se puede pegar tal cual en el SQL editor
-- de Supabase. Correr bloque por bloque.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Encontrar el turno. Copiar el id.
-- ------------------------------------------------------------
select id, codigo, fecha, hora_inicio, estado, fecha_fin, hora_fin
from turnos
where codigo like 'A20260908_T3%'      -- inicial de área + fecha MALA (08) + T3
order by created_at desc;


-- ------------------------------------------------------------
-- 2. Chequeo de seguridad: tiene que devolver CERO filas.
--    Si devuelve una, PARAR: ya hay un Turno 3 real de la fecha
--    correcta para ese grupo/área.
--    (Reemplazar 'PEGAR-UUID-AQUI' por el id del paso 1, 3 veces.)
-- ------------------------------------------------------------
select id, codigo, fecha, hora_inicio, estado
from turnos
where id <> 'PEGAR-UUID-AQUI'
  and (area_id, turno_tipo_id, grupo_id) = (
    select area_id, turno_tipo_id, grupo_id from turnos where id = 'PEGAR-UUID-AQUI'
  )
  and fecha = (select fecha from turnos where id = 'PEGAR-UUID-AQUI') - 1;


-- ------------------------------------------------------------
-- 3. Aplicar. Corre dentro de una transacción y termina en ROLLBACK:
--    muestra el ANTES/DESPUÉS sin tocar nada.
--    Si el DESPUÉS es correcto, cambiar `rollback;` por `commit;` y
--    volver a correr este bloque.
--    (Reemplazar 'PEGAR-UUID-AQUI' por el id, 2 veces.)
-- ------------------------------------------------------------
begin;

update turnos t
set fecha     = t.fecha - 1,
    fecha_fin = case when t.fecha_fin = t.fecha then t.fecha_fin - 1 else t.fecha_fin end,
    codigo    = left((select codigo from areas where id = t.area_id), 1)
                || to_char(t.fecha - 1, 'YYYYMMDD')
                || '_T' || replace((select codigo from turno_tipos where id = t.turno_tipo_id), 'TURNO_', '')
                || 'G' || replace((select codigo from grupos where id = t.grupo_id), 'GRUPO_', '')
where t.id = 'PEGAR-UUID-AQUI';

select id, codigo, fecha, hora_inicio, estado, fecha_fin, hora_fin
from turnos
where id = 'PEGAR-UUID-AQUI';

rollback;
