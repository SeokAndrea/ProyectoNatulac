-- ============================================================
-- AUDITORÍA UNIVERSAL — módulo Programación (FASE 2)
-- ============================================================
-- Se elimina la tabla propia programacion_dia_historial (creada en
-- 20260977) y la programación pasa a registrarse en la tabla común
-- `auditoria`, igual que Personal. Un registro por renglón del plan
-- que cambió (alta / cambio / baja de cajas), con antes/después.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Traspaso de lo que ya había en programacion_dia_historial.
-- ------------------------------------------------------------
insert into auditoria (ocurrido_en, usuario_id, usuario, accion, entidad, entidad_id, pagina, resumen, antes, despues)
select
  h.creado_en,
  h.usuario_id,
  (select usuario from usuarios where id = h.usuario_id),
  case h.accion when 'ALTA' then 'CREAR' when 'BAJA' then 'ELIMINAR' else 'EDITAR' end,
  'programacion_dia',
  coalesce((select codigo from areas where id = h.area_id), '?') || '/' || h.fecha::text
    || '/' || h.sabor_id::text || '/' || h.presentacion_id::text,
  'Programación',
  format(
    '%s · %s · %s %s ml: %s',
    coalesce((select codigo from areas where id = h.area_id), '?'),
    h.fecha,
    coalesce((select sabor_display(s.nombre, f.nombre)
              from sabores s left join familias_producto f on f.id = s.familia_id
              where s.id = h.sabor_id), '?'),
    coalesce((select volumen_ml from presentaciones where id = h.presentacion_id)::text, '?'),
    case
      when h.cajas_antes is null then h.cajas_despues || ' cajas'
      when h.cajas_despues is null then 'quitado (eran ' || h.cajas_antes || ' cajas)'
      else h.cajas_antes || ' → ' || h.cajas_despues || ' cajas'
    end
  ),
  case when h.cajas_antes is null then null else jsonb_build_object('cajas_plan', h.cajas_antes) end,
  case when h.cajas_despues is null then null else jsonb_build_object('cajas_plan', h.cajas_despues) end
from programacion_dia_historial h;

-- ------------------------------------------------------------
-- 2. Fuera la tabla propia y su RPC de lectura (ya no se usan; la
--    lectura pasa por listar_auditoria).
-- ------------------------------------------------------------
drop function if exists listar_programacion_historial(text, date, date);
drop table if exists programacion_dia_historial;

-- ------------------------------------------------------------
-- 3. guardar_programacion_dia: mismo cuerpo, pero el diff se registra
--    en `auditoria` (una llamada a registrar_auditoria por renglón que
--    cambió) y suma p_pagina.
-- ------------------------------------------------------------
drop function if exists guardar_programacion_dia(text, text, date, jsonb);

create function guardar_programacion_dia(
  p_usuario text,
  p_area_codigo text,
  p_fecha date,
  p_items jsonb,
  p_pagina text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_area_id uuid;
  v_usuario_id uuid;
  v_diff record;
  v_resumen text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'Solo el Super Administrador puede editar la programación.';
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  if v_area_id is null then
    raise exception 'Área no encontrada.';
  end if;

  -- Diff (viejo vs. nuevo, clave = sabor + presentación). Un registro
  -- de auditoría por renglón que cambió; los sin cambios no generan nada.
  for v_diff in
    with nuevos as (
      select
        (elem ->> 'sabor_id')::uuid as sabor_id,
        (elem ->> 'presentacion_id')::uuid as presentacion_id,
        greatest(coalesce((elem ->> 'cajas_plan')::int, 0), 0) as cajas
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
    ),
    viejos as (
      select sabor_id, presentacion_id, cajas_plan as cajas
      from programacion_dia
      where area_id = v_area_id and fecha = p_fecha
    )
    select
      coalesce(n.sabor_id, v.sabor_id) as sabor_id,
      coalesce(n.presentacion_id, v.presentacion_id) as presentacion_id,
      case
        when v.sabor_id is null then 'CREAR'
        when n.sabor_id is null then 'ELIMINAR'
        else 'EDITAR'
      end as accion,
      v.cajas as cajas_antes,
      n.cajas as cajas_despues
    from nuevos n
    full outer join viejos v
      on v.sabor_id = n.sabor_id and v.presentacion_id = n.presentacion_id
    where v.sabor_id is null
       or n.sabor_id is null
       or n.cajas is distinct from v.cajas
  loop
    v_resumen := format(
      '%s · %s · %s %s ml: %s',
      p_area_codigo,
      p_fecha,
      coalesce((select sabor_display(s.nombre, f.nombre)
                from sabores s left join familias_producto f on f.id = s.familia_id
                where s.id = v_diff.sabor_id), '?'),
      coalesce((select volumen_ml from presentaciones where id = v_diff.presentacion_id)::text, '?'),
      case
        when v_diff.cajas_antes is null then v_diff.cajas_despues || ' cajas'
        when v_diff.cajas_despues is null then 'quitado (eran ' || v_diff.cajas_antes || ' cajas)'
        else v_diff.cajas_antes || ' → ' || v_diff.cajas_despues || ' cajas'
      end
    );

    perform registrar_auditoria(
      p_usuario, v_diff.accion, 'programacion_dia',
      p_area_codigo || '/' || p_fecha::text || '/' || v_diff.sabor_id::text || '/' || v_diff.presentacion_id::text,
      p_pagina,
      v_resumen,
      case when v_diff.cajas_antes is null then null else jsonb_build_object('cajas_plan', v_diff.cajas_antes) end,
      case when v_diff.cajas_despues is null then null else jsonb_build_object('cajas_plan', v_diff.cajas_despues) end
    );
  end loop;

  delete from programacion_dia pd
  where pd.area_id = v_area_id
    and pd.fecha = p_fecha
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
      where (elem ->> 'sabor_id')::uuid = pd.sabor_id
        and (elem ->> 'presentacion_id')::uuid = pd.presentacion_id
    );

  insert into programacion_dia (area_id, fecha, sabor_id, presentacion_id, cajas_plan, actualizada_por, actualizada_en)
  select
    v_area_id,
    p_fecha,
    (elem ->> 'sabor_id')::uuid,
    (elem ->> 'presentacion_id')::uuid,
    greatest(coalesce((elem ->> 'cajas_plan')::int, 0), 0),
    v_usuario_id,
    now()
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
  on conflict (area_id, fecha, sabor_id, presentacion_id) do update
    set cajas_plan = excluded.cajas_plan,
        actualizada_por = excluded.actualizada_por,
        actualizada_en = excluded.actualizada_en;

  return programacion_dia_de(p_area_codigo, p_fecha);
end;
$$;

grant execute on function guardar_programacion_dia(text, text, date, jsonb, text) to anon, authenticated;
