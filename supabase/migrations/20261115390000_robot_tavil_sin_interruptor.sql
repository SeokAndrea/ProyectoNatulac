-- ============================================================
-- Robot Tavil sin interruptor (Alexander, 2026-11-13)
-- ============================================================
-- Va después de 20261115290000_trazabilidad_paletizado.sql.
--
-- Hasta hoy el Robot Tavil tenía un interruptor por área (areas.robot_tavil,
-- 20261114690000) en Edición de Datos → Ajustes de planta. Quién entra a la
-- tarjeta ya lo decide el permiso ROBOT_TAVIL_CARGAR, así que el interruptor
-- sobra: desde ahora el permiso es lo único que controla el Robot Tavil.
--
--   1. robot_tavil_preparar: ya no mira el interruptor (pierde
--      p_tolerar_apagado). robot_tavil_estado deja de devolver
--      «habilitado: false».
--   2. listar_precarga_robot_tavil y estimacion_tanques_robot_tavil: ya no
--      filtran por el área encendida.
--   3. Se borran robot_tavil_area_activo, guardar_robot_tavil y las columnas
--      areas.robot_tavil y areas.robot_tavil_desde.
--
-- Las funciones se reescriben desde su definición vigente (20261114690000;
-- 20261115290000 no las tocó): cambia solo lo del interruptor.
-- Efecto en Aséptico: quien tenga el permiso puede cargar paletas apenas se
-- aplique, y el supervisor ve la precarga en Producto Terminado.
-- Se puede correr más de una vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Preparar sin interruptor
-- ------------------------------------------------------------
-- Las funciones plpgsql no dependen unas de otras en el catálogo: se puede
-- borrar la versión de 3 argumentos y crear la de 2. Las que la llaman con
-- 2 argumentos (sumar, restar, guardar_resto, iniciar, editar_paleta,
-- cambiar_manual) siguen igual.
drop function if exists robot_tavil_preparar(text, text, boolean);

-- Permiso + área + seguimiento al día, para toda función del operador.
create or replace function robot_tavil_preparar(p_funcion text, p_usuario text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid;
begin
  perform public.exigir_usuario(p_funcion, p_usuario);
  if not tiene_permiso(p_usuario, 'ROBOT_TAVIL_CARGAR') then
    raise exception 'No tienes permiso para cargar paletas del Robot Tavil.';
  end if;
  v_area := robot_tavil_area(p_usuario);
  if v_area is null then
    raise exception 'No se encontró el área de planta.';
  end if;
  perform robot_tavil_sincronizar(v_area);
  return v_area;
end;
$$;
revoke execute on function robot_tavil_preparar(text, text) from public, anon, authenticated;

create or replace function robot_tavil_estado(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- En su propia instrucción: la pantalla (stable) tiene que ver lo que sincronizó.
  v_area uuid := robot_tavil_preparar('robot_tavil_estado', p_usuario);
begin
  return robot_tavil_pantalla(v_area);
end;
$$;
grant execute on function robot_tavil_estado(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Precarga y estimación sin interruptor
-- ------------------------------------------------------------
-- Solo lectura (no sincroniza: eso lo hace la pantalla del operador).
create or replace function listar_precarga_robot_tavil(p_usuario text, p_turno_id uuid)
returns table (
  turno_linea_id uuid,
  paletas integer,
  ultima_paleta_en timestamptz,
  ultima_paleta_por text,
  resto integer,
  resto_en timestamptz,
  resto_por text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.exigir_usuario('listar_precarga_robot_tavil', p_usuario);
  return query
  select tl.id,
         coalesce(pa.n, 0)::integer,
         pa.ultima,
         pu.nombre,
         r.cajas,
         r.actualizado_en,
         ru.nombre
  from turno_lineas tl
  left join lateral (
    select count(*) as n, max(rp.creada_en) as ultima
    from robot_tavil_paletas rp
    where rp.turno_linea_id = tl.id and rp.anulada_en is null
  ) pa on true
  left join lateral (
    select u.nombre from robot_tavil_paletas rp join usuarios u on u.id = rp.creada_por
    where rp.turno_linea_id = tl.id and rp.anulada_en is null
    order by rp.creada_en desc limit 1
  ) pu on true
  left join robot_tavil_resto r on r.turno_linea_id = tl.id
  left join usuarios ru on ru.id = r.actualizado_por
  where tl.turno_id = p_turno_id
    and (coalesce(pa.n, 0) > 0 or r.turno_linea_id is not null);
end;
$$;
grant execute on function listar_precarga_robot_tavil(text, uuid) to anon, authenticated;

/*
 * Por tanque con líquido del turno: el volumen oficial (volumen_vivo_tanque)
 * y los litros de la precarga que el supervisor todavía no confirmó. El Panel
 * muestra oficial − pendientes; el volumen oficial no se toca.
 * Pendiente de una corrida del lote: lo precargado menos el PT ya registrado,
 * nunca negativo; 0 si la corrida ya cerró y tiene su PT (el supervisor
 * confirmó). Las paletas que salieron con la línea entregada (sin corrida)
 * cuentan para el lote de la corrida que seguía el operador.
 * Solo turnos abiertos. Solo lectura.
 */
create or replace function estimacion_tanques_robot_tavil(p_usuario text, p_turno_id uuid)
returns table (numero_tanque smallint, volumen_oficial_l numeric, litros_pendientes numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.exigir_usuario('estimacion_tanques_robot_tavil', p_usuario);
  return query
  with tanques as (
    select rt.numero_tanque, rt.lote_id
    from recepcion_tanques rt
    join turnos t on t.id = rt.turno_id and t.estado = 'ABIERTO'
    where rt.turno_id = p_turno_id
      and rt.condicion in ('LISTO', 'STANDBY')
      and rt.lote_id is not null
  ),
  corridas as (
    select tl.id, tl.lote_id, p.cajas_x_paleta, p.litros_x_caja,
           robot_tavil_corrida_abierta(tl.id) as abierta
    from turno_lineas tl
    join presentaciones p on p.id = tl.presentacion_id
    where tl.lote_id in (select lote_id from tanques)
  ),
  pendientes as (
    select c.lote_id,
           case
             when not c.abierta and pt.turno_linea_id is not null then 0::numeric
             else greatest(0::numeric,
               ((select count(*) from robot_tavil_paletas rp where rp.turno_linea_id = c.id and rp.anulada_en is null) * c.cajas_x_paleta
                + coalesce(r.cajas, 0)) * c.litros_x_caja
               - coalesce(pt.litros_producidos, 0))
           end as litros
    from corridas c
    left join robot_tavil_resto r on r.turno_linea_id = c.id
    left join producto_terminado pt on pt.turno_linea_id = c.id
    union all
    select c.lote_id, (count(*) * c.cajas_x_paleta * c.litros_x_caja)::numeric
    from robot_tavil_paletas rp
    join robot_tavil_seguimiento s on s.linea_id = rp.linea_id
    join corridas c on c.id = s.turno_linea_id
    where rp.turno_linea_id is null and rp.anulada_en is null
    group by c.lote_id, c.cajas_x_paleta, c.litros_x_caja
  )
  select tq.numero_tanque,
         volumen_vivo_tanque(p_turno_id, tq.numero_tanque),
         coalesce((select sum(pe.litros) from pendientes pe where pe.lote_id = tq.lote_id), 0)::numeric
  from tanques tq
  order by tq.numero_tanque;
end;
$$;
grant execute on function estimacion_tanques_robot_tavil(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Fuera el interruptor
-- ------------------------------------------------------------
drop function if exists robot_tavil_area_activo(text);
drop function if exists guardar_robot_tavil(text, text, boolean);
alter table areas drop column if exists robot_tavil;
alter table areas drop column if exists robot_tavil_desde;

-- Regla de 20261109690000: cada función nueva con p_usuario revisa que sea el de la credencial.
select * from asegurar_control_usuario();
