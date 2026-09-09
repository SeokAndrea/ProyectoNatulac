-- ============================================================
-- LIMPIAR EL ÁREA DE PRUEBAS — dejar el sandbox en cero
-- ============================================================
-- Plano para pegar en el SQL editor de Supabase (proyecto de pruebas).
--
-- Borra TODOS los datos operativos del área con código 'PRUEBAS':
-- turnos (abiertos o cerrados) y todo lo que cuelga de ellos. NO toca
-- la configuración maestra (áreas, líneas, tanques, sabores,
-- presentaciones, velocidades, usuarios, roles, programación del día).
--
-- Qué se borra, y cómo:
--   * turnos del área PRUEBAS  -> DELETE directo
--   * lo que cuelga del turno   -> por "on delete cascade":
--       turno_lineas, recepcion_tanques, lineas_estado,
--       contadores (+ contadores_historial),
--       producto_terminado, producto_terminado_parciales,
--       preparaciones (+ preparaciones_ajuste,
--                       preparaciones_ajuste_volumen),
--       transferencias, actas, turnos_historial,
--       validacion_produccion
--   * desvases (ex reservas_tobos) -> DELETE aparte: su FK a turnos
--     NO tiene cascade, así que se limpian antes por área/turno.
--
-- Qué NO se borra (no está ligado al área ni al turno; son globales):
--   * auditoria                       (log universal, append-only)
--   * servicios_industriales_lecturas (lecturas del Panel)
--   Si de verdad hace falta vaciarlas, ver el bloque opcional al final.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ANTES — cuántas filas se van a borrar (solo lectura)
-- ------------------------------------------------------------
with pruebas as (
  select id from areas where codigo = 'PRUEBAS'
),
t as (
  select id from turnos where area_id = (select id from pruebas)
)
select
  (select count(*) from t)                                                              as turnos,
  (select count(*) from turno_lineas         where turno_id in (select id from t))      as turno_lineas,
  (select count(*) from recepcion_tanques    where turno_id in (select id from t))      as recepcion_tanques,
  (select count(*) from preparaciones        where turno_id in (select id from t))      as preparaciones,
  (select count(*) from contadores           where turno_id in (select id from t))      as contadores,
  (select count(*) from producto_terminado   where turno_id in (select id from t))      as producto_terminado,
  (select count(*) from transferencias       where turno_id in (select id from t))      as transferencias,
  (select count(*) from actas                where turno_id in (select id from t))      as actas,
  (select count(*) from desvases
     where area_id = (select id from pruebas)
        or turno_id_origen  in (select id from t)
        or turno_id_consumo in (select id from t)
        or usado_en_lote_id in (select id from preparaciones where turno_id in (select id from t))) as desvases;

-- ------------------------------------------------------------
-- 2. LIMPIEZA — una sola transacción
-- ------------------------------------------------------------
do $$
declare
  v_pruebas uuid;
  v_turnos  int;
  v_desv    int;
begin
  select id into v_pruebas from areas where codigo = 'PRUEBAS';
  if v_pruebas is null then
    raise exception 'No existe el área con código PRUEBAS — nada que limpiar.';
  end if;

  -- desvases: la FK a turnos no cascadea; se borran primero.
  delete from desvases
  where area_id = v_pruebas
     or turno_id_origen  in (select id from turnos where area_id = v_pruebas)
     or turno_id_consumo in (select id from turnos where area_id = v_pruebas)
     or usado_en_lote_id in (
          select id from preparaciones
          where turno_id in (select id from turnos where area_id = v_pruebas));
  get diagnostics v_desv = row_count;

  -- turnos: arrastra en cascada todo el resto de lo operativo.
  delete from turnos where area_id = v_pruebas;
  get diagnostics v_turnos = row_count;

  raise notice 'Área PRUEBAS limpia: % turno(s) y % desvase(s) borrados.',
    v_turnos, v_desv;
end $$;

-- ------------------------------------------------------------
-- 3. DESPUÉS — verificación (todo debe dar 0)
-- ------------------------------------------------------------
with pruebas as (
  select id from areas where codigo = 'PRUEBAS'
),
t as (
  select id from turnos where area_id = (select id from pruebas)
)
select
  (select count(*) from t)                                                         as turnos,
  (select count(*) from turno_lineas       where turno_id in (select id from t))   as turno_lineas,
  (select count(*) from recepcion_tanques  where turno_id in (select id from t))   as recepcion_tanques,
  (select count(*) from preparaciones      where turno_id in (select id from t))   as preparaciones,
  (select count(*) from contadores         where turno_id in (select id from t))   as contadores,
  (select count(*) from producto_terminado where turno_id in (select id from t))   as producto_terminado,
  (select count(*) from transferencias     where turno_id in (select id from t))   as transferencias,
  (select count(*) from actas              where turno_id in (select id from t))   as actas,
  (select count(*) from desvases           where area_id = (select id from pruebas)) as desvases;

-- ============================================================
-- OPCIONAL — vaciar los logs GLOBALES (no son del área de pruebas)
-- ============================================================
-- Descomentar SOLO si se quiere el proyecto de pruebas de verdad en
-- blanco. Esto borra auditoría y lecturas de TODAS las áreas, no solo
-- PRUEBAS. En un proyecto de pruebas normalmente da igual; en uno con
-- datos que sirvan, NO correr.
--
-- truncate table auditoria;
-- truncate table servicios_industriales_lecturas;
