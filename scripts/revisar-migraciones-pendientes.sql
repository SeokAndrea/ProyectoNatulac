-- ============================================================
-- ¿QUÉ MIGRACIONES DE OCTUBRE YA ESTÁN APLICADAS?
-- ============================================================
-- Solo lectura: no cambia nada. Una fila por migración, con lo que busca
-- y si lo encontró. En el servidor de planta (base db_control_nectares):
--   psql -h localhost -U <DB_USER> -d db_control_nectares -f scripts/revisar-migraciones-pendientes.sql
--
-- Cada migración se reconoce por algo que deja en la base (una tabla, una
-- función nueva, un texto dentro de una función o un dato). Algunas solo
-- reescriben una función que después vuelve a reescribir otra migración
-- más nueva: esas salen como "la reemplaza …" y no hace falta aplicarlas
-- si la nueva ya está. Nunca aplicar una vieja DESPUÉS de una nueva que
-- toca la misma función: la pisaría.
--
-- 20261110990000 (parada de la Línea 3 «Eje de corrección de diseño») fue
-- un arreglo de un solo día: usa la hora de HOY. No se aplica más.
--
-- Los scripts de datos (scripts/fix-*.sql) no dejan una marca fija; ver
-- cada uno.
--
-- Las preguntas sobre indicadores_mes van como texto (query_to_xml) para
-- que la consulta corra aunque esa tabla todavía no exista.
-- ============================================================

with
  fn as (
    select p.proname, p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  hay_ind as (select to_regclass('public.indicadores_mes') is not null as ok),
  nueva_rol as (select exists (select 1 from roles where codigo = 'SERVICIOS_INDUSTRIALES') as ok)
select migracion, que_es, case when aplicada then 'aplicada' else 'FALTA' end as estado
from (
  values
  ('20261109990000', 'Indicadores (tabla y funciones)',
    (select ok from hay_ind) and exists (select 1 from fn where proname = 'indicadores_turnos')),
  ('20261110090000', 'Indicadores: septiembre a mano',
    case when (select ok from hay_ind) then (xpath('/row/x/text()', query_to_xml($q$
      select exists (select 1 from indicadores_mes im join areas a on a.id = im.area_id
                     where a.codigo = 'ASEPTICO' and im.mes = date '2026-09-01') as x
    $q$, false, true, '')))[1]::text = 'true' else false end),
  ('20261110190000', 'Indicadores sin superadmin (la reemplaza 20261111290000)',
    (select ok from nueva_rol)),
  ('20261110290000', 'Indicadores: Excel de septiembre (TPA-250 4,02 %)',
    case when (select ok from hay_ind) then (xpath('/row/x/text()', query_to_xml($q$
      select coalesce(bool_or(im.datos #>> '{presentaciones,2|250,merma}' = '4.02'), false) as x
      from indicadores_mes im join areas a on a.id = im.area_id
      where a.codigo = 'ASEPTICO' and im.mes = date '2026-09-01'
    $q$, false, true, '')))[1]::text = 'true' else false end),
  ('20261110390000', 'Indicadores: unidades y abril',
    case when (select ok from hay_ind) then (xpath('/row/x/text()', query_to_xml($q$
      select coalesce(bool_or((im.datos #> '{presentaciones,2|250}') ? 'mermaUnidades'), false) as x
      from indicadores_mes im join areas a on a.id = im.area_id
      where a.codigo = 'ASEPTICO' and im.mes = date '2026-09-01'
    $q$, false, true, '')))[1]::text = 'true' else false end),
  ('20261110490000', 'Indicadores: total Aséptico julio/agosto',
    case when (select ok from hay_ind) then (xpath('/row/x/text()', query_to_xml($q$
      select exists (select 1 from indicadores_mes im join areas a on a.id = im.area_id
                     where a.codigo = 'ASEPTICO' and im.mes = date '2026-07-01' and im.datos ? 'totalAseptico') as x
    $q$, false, true, '')))[1]::text = 'true' else false end),
  ('20261110590000', 'Paradas: LNPE hasta el fin del turno en curso',
    exists (select 1 from fn where proname = 'anotar_parada' and prosrc like '%LNPE: hasta el final del turno en curso%')),
  ('20261110690000', 'Indicadores por cargo (la reemplaza 20261111290000)',
    (select ok from nueva_rol)),
  ('20261110790000', 'Programación semanal',
    to_regclass('public.programacion_semana') is not null and exists (select 1 from fn where proname = 'programacion_semanal_de')),
  ('20261110890000', 'Corregir contador de corrida',
    exists (select 1 from fn where proname = 'corregir_contador_corrida')),
  ('20261111090000', 'Revisión de bloqueos 1-5',
    exists (select 1 from fn where proname = 'exigir_parada_borrable')),
  ('20261111190000', 'Corridas entregadas congeladas',
    exists (select 1 from fn where proname = 'congelar_corrida_entregada')),
  ('20261111290000', 'Área, rol y cargo',
    (select ok from nueva_rol) and not exists (select 1 from roles where codigo = 'GESTION')),
  ('20261111390000', 'Resumen Diario: observaciones por corrida',
    to_regclass('public.observaciones_corrida') is not null),
  ('20261111490000', 'Edición de Datos con permiso y autor',
    exists (select 1 from fn where proname = 'guardar_catalogo')),
  ('20261111590000', 'Paradas: la parada abierta de la línea',
    exists (select 1 from fn where proname = 'aplicar_paradas_a_lineas')),
  ('20261111690000', 'SIF: primero Inspección, después Intervención',
    to_regclass('public.correos_pendientes') is not null and exists (select 1 from fn where proname = 'escalar_sif')),
  ('20261111790000', 'corrida_produjo() sin cajas_retenidas',
    exists (select 1 from fn where proname = 'corrida_produjo' and prosrc not like '%cajas_retenidas%')),
  ('20261111890000', 'LNP automático: se corta al arrancar',
    exists (select 1 from fn where proname = 'cortar_lnpe_en_curso')),
  ('20261111990000', 'Panel en vivo: el turno más reciente es el último creado',
    exists (select 1 from fn where proname = 'estado_planta_actual' and prosrc like '%order by (t.estado = ''ABIERTO'') desc, t.created_at desc%')),
  ('20261112090000', 'Día extraordinario',
    to_regclass('public.dias_extraordinarios') is not null and exists (select 1 from fn where proname = 'guardar_dia_extraordinario'))
) as m (migracion, que_es, aplicada)
order by migracion;
