-- ============================================================
-- Corridas de turnos cerrados que una transferencia (u otra función
-- "por lote y activa") arrastró a un lote preparado DESPUÉS del cierre.
-- Revisión del 2026-10-20 (T2 y T3 de Fernando del 19/10).
--
-- Cada una vuelve al lote que tenía al cerrar su turno. El lote salió de
-- la auditoría (lote antes del primer cambio posterior al cierre) y se
-- confirmó con la foto de cierre del turno (volumenes_lote_cierre). Las
-- cajas, litros y contadores no cambian: solo de qué lote salió el PT
-- (merma de semielaborado de esos turnos).
--
-- Correr DESPUÉS de la migración 20261111190000 (el trigger nuevo congela
-- las corridas entregadas; aquí se abre a propósito con set_config).
-- Se puede correr dos veces: la segunda no cambia nada.
--
-- Plano para el SQL editor de Supabase: sin tabla temporal ni begin/commit
-- (el editor no mantiene la sesión entre sentencias). La corrección va en
-- un solo bloque DO, que es una sola transacción: si algo falla, no cambia
-- nada. La lista de corridas está dos veces (corrección y verificación).
-- ============================================================

-- 1. Corrección
do $$
declare
  v_n integer;
begin
  perform set_config('natulac.corregir_corrida_entregada', 'on', true);

  update turno_lineas tl
  set lote_id = p.id, lote = p.lote, sabor_id = p.sabor_id
  from (values
    ('ce4bc9b3-2d33-4782-ad35-480869764c52'::uuid, 'b11c1bad-e873-4571-99a5-902ebb1180ac'::uuid),  -- A20260901_T1G1 LINEA_1: 0002 -> 0001
    ('64dd2038-cfe9-4be3-b572-3e20efa787d7'::uuid, 'b11c1bad-e873-4571-99a5-902ebb1180ac'::uuid),  -- A20260901_T1G1 LINEA_2: 0002 -> 0001
    ('82b106be-9a8e-4cdf-9692-4c0280812aad'::uuid, '3bf35c29-af7d-44de-be35-94cb0c3cc218'::uuid),  -- A20260903_T3G2 LINEA_1: 0004 -> 0002
    ('3a13fe07-1692-4ba7-a6aa-25df40633e2e'::uuid, '3bf35c29-af7d-44de-be35-94cb0c3cc218'::uuid),  -- A20260903_T3G2 LINEA_3: 0004 -> 0002
    ('61109666-4032-4863-a064-7702bafe43aa'::uuid, 'dba9fb68-9013-4329-babb-820b1cc7d0d6'::uuid),  -- A20260907_T3G1 LINEA_1: 0007 -> 0005
    ('d5c40e36-c04c-4dbf-9ee9-35c535cc2baf'::uuid, 'dba9fb68-9013-4329-babb-820b1cc7d0d6'::uuid),  -- A20260907_T3G1 LINEA_3: 0007 -> 0005
    ('ee3bff90-7f53-4085-9aa1-3b67a84b8c96'::uuid, '6f4d0f7a-8b38-41b6-92a7-c37d754ccc0d'::uuid),  -- A20260917_T1G2 LINEA_1: 0008 -> 0007
    ('ad016cc5-1aba-40ba-aa8d-35fab6de76ce'::uuid, '6f4d0f7a-8b38-41b6-92a7-c37d754ccc0d'::uuid),  -- A20260917_T1G2 LINEA_3: 0008 -> 0007
    ('c6fa779a-597d-442d-b2c7-c1f5a3921f6e'::uuid, 'd208f950-2351-4a5c-ba44-4b4bfcf8caea'::uuid),  -- A20260928_T2G2 LINEA_2: 0003 -> 0001
    ('e8d59595-9749-48b1-ba83-c716a8a23087'::uuid, 'd208f950-2351-4a5c-ba44-4b4bfcf8caea'::uuid),  -- A20260928_T2G2 LINEA_3: 0003 -> 0001
    ('93cbf8fb-d743-47f3-8e27-5ce3406849b7'::uuid, '8cfc9b15-797b-49d3-8e99-c953817f6d8d'::uuid),  -- A20260930_T3G1 LINEA_3: 0011 -> 0008
    ('99b81f32-1273-45e5-8cfe-37bae6eaf6ad'::uuid, 'b8bbf0a3-4e7f-4157-9158-4e1c04dd0e49'::uuid),  -- A20261001_T1G3 LINEA_2: 0011 -> 0005
    ('d3ac0055-fec4-438c-a01b-4844dd0f497b'::uuid, '7defbac7-a4d6-4f94-b486-dbd7f0efa9ad'::uuid),  -- A20261001_T2G2 LINEA_2: 0015 -> 0012
    ('63decfd2-2a06-4558-ab48-a35aab4fc84c'::uuid, '7defbac7-a4d6-4f94-b486-dbd7f0efa9ad'::uuid),  -- A20261001_T2G2 LINEA_3: 0015 -> 0012
    ('23926a0c-fb9f-4baa-b2c2-b17c932a2dd8'::uuid, 'bac6f82d-c2ff-4f41-9d04-9a1600fd1953'::uuid),  -- A20261007_T3G3_2 LINEA_1: 0007 -> 0005
    ('aafcafe6-4add-40b4-9dba-92523ea55cec'::uuid, 'ae3e1f24-77ff-4b6a-8247-44ccab353059'::uuid),  -- A20261015_T3G2 LINEA_1: 0004 -> 0002
    ('d1d94756-e686-4ed5-820e-9f782c3455ab'::uuid, 'ae3e1f24-77ff-4b6a-8247-44ccab353059'::uuid),  -- A20261015_T3G2 LINEA_3: 0004 -> 0002
    ('9748beb6-8751-409e-9265-4671fbb5a4b5'::uuid, '897ed4a2-d10e-4e59-a144-2c203fb8eb8d'::uuid),  -- A20261019_T3G1 LINEA_1: 0004 -> 0002
    ('f4ad3fc0-8bbf-4833-b312-074474aa8fb0'::uuid, '897ed4a2-d10e-4e59-a144-2c203fb8eb8d'::uuid)   -- A20261019_T2G2_2 LINEA_1: 0004 -> 0002
  ) as f (corrida_id, lote_id)
  join preparaciones p on p.id = f.lote_id
  where tl.id = f.corrida_id
    and tl.lote_id is distinct from p.id;

  get diagnostics v_n = row_count;
  raise notice 'Corridas corregidas: % (la segunda vez da 0)', v_n;
end $$;

-- 2. Verificación: las 19 filas deben decir ok
select t.codigo, l.codigo as linea, tl.lote,
       case when tl.lote_id = f.lote_id then 'ok' else 'REVISAR' end as estado
from (values
  ('ce4bc9b3-2d33-4782-ad35-480869764c52'::uuid, 'b11c1bad-e873-4571-99a5-902ebb1180ac'::uuid),
  ('64dd2038-cfe9-4be3-b572-3e20efa787d7'::uuid, 'b11c1bad-e873-4571-99a5-902ebb1180ac'::uuid),
  ('82b106be-9a8e-4cdf-9692-4c0280812aad'::uuid, '3bf35c29-af7d-44de-be35-94cb0c3cc218'::uuid),
  ('3a13fe07-1692-4ba7-a6aa-25df40633e2e'::uuid, '3bf35c29-af7d-44de-be35-94cb0c3cc218'::uuid),
  ('61109666-4032-4863-a064-7702bafe43aa'::uuid, 'dba9fb68-9013-4329-babb-820b1cc7d0d6'::uuid),
  ('d5c40e36-c04c-4dbf-9ee9-35c535cc2baf'::uuid, 'dba9fb68-9013-4329-babb-820b1cc7d0d6'::uuid),
  ('ee3bff90-7f53-4085-9aa1-3b67a84b8c96'::uuid, '6f4d0f7a-8b38-41b6-92a7-c37d754ccc0d'::uuid),
  ('ad016cc5-1aba-40ba-aa8d-35fab6de76ce'::uuid, '6f4d0f7a-8b38-41b6-92a7-c37d754ccc0d'::uuid),
  ('c6fa779a-597d-442d-b2c7-c1f5a3921f6e'::uuid, 'd208f950-2351-4a5c-ba44-4b4bfcf8caea'::uuid),
  ('e8d59595-9749-48b1-ba83-c716a8a23087'::uuid, 'd208f950-2351-4a5c-ba44-4b4bfcf8caea'::uuid),
  ('93cbf8fb-d743-47f3-8e27-5ce3406849b7'::uuid, '8cfc9b15-797b-49d3-8e99-c953817f6d8d'::uuid),
  ('99b81f32-1273-45e5-8cfe-37bae6eaf6ad'::uuid, 'b8bbf0a3-4e7f-4157-9158-4e1c04dd0e49'::uuid),
  ('d3ac0055-fec4-438c-a01b-4844dd0f497b'::uuid, '7defbac7-a4d6-4f94-b486-dbd7f0efa9ad'::uuid),
  ('63decfd2-2a06-4558-ab48-a35aab4fc84c'::uuid, '7defbac7-a4d6-4f94-b486-dbd7f0efa9ad'::uuid),
  ('23926a0c-fb9f-4baa-b2c2-b17c932a2dd8'::uuid, 'bac6f82d-c2ff-4f41-9d04-9a1600fd1953'::uuid),
  ('aafcafe6-4add-40b4-9dba-92523ea55cec'::uuid, 'ae3e1f24-77ff-4b6a-8247-44ccab353059'::uuid),
  ('d1d94756-e686-4ed5-820e-9f782c3455ab'::uuid, 'ae3e1f24-77ff-4b6a-8247-44ccab353059'::uuid),
  ('9748beb6-8751-409e-9265-4671fbb5a4b5'::uuid, '897ed4a2-d10e-4e59-a144-2c203fb8eb8d'::uuid),
  ('f4ad3fc0-8bbf-4833-b312-074474aa8fb0'::uuid, '897ed4a2-d10e-4e59-a144-2c203fb8eb8d'::uuid)
) as f (corrida_id, lote_id)
join turno_lineas tl on tl.id = f.corrida_id
join turnos t on t.id = tl.turno_id
join lineas l on l.id = tl.linea_id
order by t.fecha, t.hora_inicio, l.codigo;
