-- ============================================================
-- Trazabilidad de paletizado: la leyenda del PDF con los sabores del catálogo
-- (Alexander, 2026-11-13)
-- ============================================================
-- Va después de 20261115390000_robot_tavil_sin_interruptor.sql.
--
-- El PDF copia el formato 1-PR-F-040 Rev.01 tal cual, pero su leyenda
-- («Utilizar para la columna 1.3.2 "Sabor" los siguientes códigos…») sale de
-- la información de hoy: los sabores activos que tienen código en Edición de
-- Datos. trazabilidad_paletizado_listar agrega 'sabores' (código y nombre,
-- un renglón por código). Lo demás de la función no cambia.
--
-- Se puede correr más de una vez.
-- ============================================================

create or replace function trazabilidad_paletizado_listar(
  p_usuario text,
  p_fecha date,
  p_turnos text[] default null,
  p_lineas text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_area uuid;
begin
  perform public.exigir_usuario('trazabilidad_paletizado_listar', p_usuario);
  if not (tiene_permiso(p_usuario, 'TRAZABILIDAD_VER') or tiene_permiso(p_usuario, 'TRAZABILIDAD_EDITAR')) then
    raise exception 'No tienes permiso para ver la Trazabilidad del paletizado.';
  end if;
  v_area := robot_tavil_area(p_usuario);
  return jsonb_build_object(
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', l.codigo, 'nombre', l.nombre) order by l.codigo)
      from lineas l where l.area_id = v_area and l.activo
    ), '[]'::jsonb),
    'paletas', coalesce((
      select jsonb_agg(robot_tavil_paleta_json(rp.id) order by l.codigo, rp.creada_en, rp.id)
      from robot_tavil_paletas rp
      join lineas l on l.id = rp.linea_id and l.area_id = v_area
      where rp.anulada_en is null
        and rp.fecha_produccion = p_fecha
        and (p_turnos is null or rp.turno_tipo = any(p_turnos))
        and (p_lineas is null or l.codigo = any(p_lineas))
    ), '[]'::jsonb),
    -- Leyenda del PDF: un renglón por código, en el orden de las familias de la hoja.
    'sabores', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', x.codigo, 'nombre', x.nombre) order by x.orden_familia, x.nombre)
      from (
        select distinct on (btrim(s.codigo))
               btrim(s.codigo) as codigo,
               sabor_display(s.nombre, f.nombre) as nombre,
               case lower(translate(coalesce(f.nombre, ''), 'áéíóú', 'aeiou'))
                 when 'clasicos' then 1 when 'especiales' then 2 when 'selecto' then 3
                 when 'premium' then 4 when 'jucosa' then 5 else 6
               end as orden_familia
        from sabores s
        left join familias_producto f on f.id = s.familia_id
        where s.activo and nullif(btrim(s.codigo), '') is not null
        order by btrim(s.codigo), s.nombre
      ) x
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function trazabilidad_paletizado_listar(text, date, text[], text[]) to anon, authenticated;

-- Regla de 20261109690000: cada función nueva con p_usuario revisa que sea el de la credencial.
select * from asegurar_control_usuario();
