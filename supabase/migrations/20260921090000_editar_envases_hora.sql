-- ============================================================
-- editar_velocidad(): gana p_envases_hora — hoy solo se podía
-- corregir la máquina y litros/hora desde Edición de Datos, los
-- envases/hora quedaban de solo lectura. Sin esto no se podía
-- corregir el dato mal cargado de Línea 1 · 500 ml (envases_hora
-- quedó en 3000, igual a litros_hora, cuando en realidad 3000
-- envases de 500 ml son 1500 L, no 3000).
-- ============================================================

drop function if exists editar_velocidad(uuid, text, numeric);

create or replace function editar_velocidad(p_velocidad_id uuid, p_maquina text, p_envases_hora integer, p_litros_hora numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update velocidades_llenadora
  set maquina = p_maquina, envases_hora = p_envases_hora, litros_hora = p_litros_hora
  where id = p_velocidad_id;
end;
$$;

grant execute on function editar_velocidad(uuid, text, integer, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- Corrige el dato mal cargado que el usuario señaló: Línea 1 · 500 ml
-- quedó con envases_hora a la mitad de lo real (3000/3500/4000, la
-- máquina corre a la misma velocidad que con el envase de 1000 ml:
-- 6000/7000/8000) y litros_hora = envases_hora (ej. 3000 envases =
-- "3000 L"), cuando en realidad son 6000 envases = 3000 L, etc.
-- ------------------------------------------------------------
update velocidades_llenadora v
set envases_hora = v.envases_hora * 2, litros_hora = v.envases_hora
from lineas l, presentaciones p
where v.linea_id = l.id and v.presentacion_id = p.id
  and l.codigo = 'LINEA_1' and p.volumen_ml = 500
  and v.litros_hora = v.envases_hora
  and v.activo = true;

-- ------------------------------------------------------------
-- Renombra las máquinas: "TB" (Tetra Brik) pasa a "TBA", "TP" (Tetra
-- Prisma) pasa a "TPA".
-- ------------------------------------------------------------
update velocidades_llenadora set maquina = 'TBA' where maquina = 'TB';
update velocidades_llenadora set maquina = 'TPA' where maquina = 'TP';

-- ------------------------------------------------------------
-- turno_de_fecha_tipo() gana el mismo filtro de área que ya tiene
-- estado_planta_actual() — sin esto, el Super Administrador (que no
-- tiene área fija) podía terminar viendo el turno del Área de
-- Pruebas al buscar una fecha/turno histórico, en vez del área real.
-- ------------------------------------------------------------
drop function if exists turno_de_fecha_tipo(date, text);

create or replace function turno_de_fecha_tipo(p_fecha date, p_turno_tipo text, p_area_codigo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
begin
  select t.id into v_turno_id
  from turnos t
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join areas a on a.id = t.area_id
  where t.fecha = p_fecha and tt.codigo = p_turno_tipo
    and (p_area_codigo is null or a.codigo = p_area_codigo)
  order by t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function turno_de_fecha_tipo(date, text, text) to anon, authenticated;
