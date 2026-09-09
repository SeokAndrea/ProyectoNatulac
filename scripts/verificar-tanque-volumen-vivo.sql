-- ============================================================
-- VERIFICACIÓN de 20261029 — tanque muestra el volumen vivo del lote
-- ============================================================
-- Solo lectura. Plano para el SQL editor de Supabase (proyecto de
-- pruebas). Correr DESPUÉS de aplicar la migración.
--
-- Qué se espera:
--   * tanque LISTO/STANDBY con lote abierto  -> turno_json.volumen_l = preparaciones.volumen_l (VIVO)
--   * tanque LISTO con lote ya cerrado        -> turno_json.volumen_l = recepcion_tanques.volumen_l (CONGELADO)
--   * tanque SUCIO / LIMPIO / EN_PREPARACION  -> turno_json.volumen_l = recepcion_tanques.volumen_l
-- ============================================================


-- ------------------------------------------------------------
-- 1. Comparación por tanque, para cada turno ABIERTO (no PRUEBAS y
--    PRUEBAS aparte). Mira la columna `coincide_esperado`.
-- ------------------------------------------------------------
with turnos_abiertos as (
  select t.id, t.codigo, a.codigo as area
  from turnos t
  join areas a on a.id = t.area_id
  where t.estado = 'ABIERTO'
),
tanques_json as (
  select
    ta.codigo,
    ta.area,
    (tq ->> 'numero_tanque')::int          as numero_tanque,
    tq ->> 'condicion'                       as condicion,
    (tq ->> 'volumen_l')::numeric            as volumen_l_json,
    (tq ->> 'volumen_inicial_l')::numeric    as volumen_inicial_l_json,
    tq ->> 'lote'                            as lote
  from turnos_abiertos ta,
       lateral jsonb_array_elements(turno_json(ta.id) -> 'tanques') as tq
)
select
  tj.codigo,
  tj.area,
  tj.numero_tanque                         as tq,
  tj.condicion,
  tj.lote,
  rt.volumen_l                             as rt_volumen_l_congelado,
  prep.volumen_l                           as prep_volumen_l_vivo,
  prep.cerrado_en is null                  as lote_abierto,
  tj.volumen_l_json                        as turno_json_volumen_l,
  case
    when tj.condicion in ('LISTO', 'STANDBY') and prep.id is not null and prep.cerrado_en is null
      then tj.volumen_l_json is not distinct from prep.volumen_l
    else tj.volumen_l_json is not distinct from rt.volumen_l
  end                                      as coincide_esperado
from tanques_json tj
join turnos_abiertos ta on ta.codigo = tj.codigo
join recepcion_tanques rt on rt.turno_id = ta.id and rt.numero_tanque = tj.numero_tanque
left join preparaciones prep on prep.id = rt.lote_id
order by tj.area, tj.codigo, tj.numero_tanque;


-- ------------------------------------------------------------
-- 2. Un turno CERRADO reciente (área ASEPTICO): sus tanques deben dar
--    volumen_l = recepcion_tanques.volumen_l (lote cerrado -> rama ELSE).
--    Reemplazar el código si se quiere otro.
-- ------------------------------------------------------------
with t_cerrado as (
  select t.id, t.codigo
  from turnos t
  join areas a on a.id = t.area_id
  where t.estado = 'CERRADO' and a.codigo = 'ASEPTICO'
  order by t.fecha desc, t.hora_inicio desc
  limit 1
)
select
  tc.codigo,
  (tq ->> 'numero_tanque')::int            as tq,
  tq ->> 'condicion'                        as condicion,
  (tq ->> 'volumen_l')::numeric             as turno_json_volumen_l,
  rt.volumen_l                              as rt_volumen_l,
  (tq ->> 'volumen_l')::numeric is not distinct from rt.volumen_l as coincide
from t_cerrado tc,
     lateral jsonb_array_elements(turno_json(tc.id) -> 'tanques') as tq
join recepcion_tanques rt on rt.turno_id = tc.id and rt.numero_tanque = (tq ->> 'numero_tanque')::int
order by tq;


-- ------------------------------------------------------------
-- 3. Sanidad: ningún tanque con volumen_l del JSON por encima de la
--    capacidad física (30.000 L, tope del CHECK desde 20261008).
-- ------------------------------------------------------------
with turnos_recientes as (
  select t.id, t.codigo
  from turnos t
  join areas a on a.id = t.area_id
  where a.codigo <> 'PRUEBAS'
  order by t.fecha desc, t.hora_inicio desc
  limit 20
)
select tr.codigo,
       (tq ->> 'numero_tanque')::int  as tq,
       tq ->> 'condicion'             as condicion,
       (tq ->> 'volumen_l')::numeric  as volumen_l_json
from turnos_recientes tr,
     lateral jsonb_array_elements(turno_json(tr.id) -> 'tanques') as tq
where (tq ->> 'volumen_l')::numeric > 30000
order by volumen_l_json desc;
