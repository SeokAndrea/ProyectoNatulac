-- ============================================================
-- CREAR TURNO MANUAL: FLUJO PASO A PASO (turno primero, sabores uno x uno)
-- ============================================================
-- crear_turno_manual() pedía TODOS los sabores de una — más cómodo es
-- crear el turno vacío primero (supervisor + turno + grupo, el área
-- sale sola del supervisor elegido) y después ir agregando sabores de
-- a uno con agregar_fila_turno_manual(), viendo el total acumularse,
-- hasta terminar. Cada llamada nueva devuelve turno_json() completo,
-- así el frontend siempre muestra la lista actualizada sin tener que
-- pedirla aparte.
-- ============================================================

drop function if exists crear_turno_manual(text, text, text, date, text, text, time, time, jsonb);

create or replace function crear_turno_manual(
  p_usuario text,
  p_supervisor_usuario text,
  p_fecha date,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
  p_hora_inicio time,
  p_hora_fin time
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area_rol text;
  v_supervisor_id uuid;
  v_area_id uuid;
  v_area_codigo text;
  v_turno_tipo_id uuid;
  v_grupo_id uuid;
  v_turno_id uuid;
  v_codigo text;
begin
  select * into v_rol, v_area_rol from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'Solo el Super Administrador puede cargar un turno manualmente.';
  end if;

  select id into v_supervisor_id from usuarios where usuario = lower(p_supervisor_usuario);
  if v_supervisor_id is null then
    raise exception 'Usuario % no existe', p_supervisor_usuario;
  end if;

  select a.id, a.codigo into v_area_id, v_area_codigo
  from usuario_roles ur
  join areas a on a.id = ur.area_id
  where ur.usuario_id = v_supervisor_id
  limit 1;

  if v_area_id is null then
    raise exception '% no tiene un área asignada.', p_supervisor_usuario;
  end if;

  select id into v_turno_tipo_id from turno_tipos where codigo = p_turno_tipo_codigo;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;

  v_codigo := left(v_area_codigo, 1) || to_char(p_fecha, 'YYYYMMDD') || '_T' || replace(p_turno_tipo_codigo, 'TURNO_', '') || 'G' || replace(p_grupo_codigo, 'GRUPO_', '');

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, estado, fecha_fin, hora_fin)
  values (v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, p_fecha, p_hora_inicio, 'CERRADO', p_fecha, p_hora_fin)
  returning id into v_turno_id;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function crear_turno_manual(text, text, date, text, text, time, time) to anon, authenticated;

-- ------------------------------------------------------------
-- agregar_fila_turno_manual(): una fila (línea+sabor) a la vez, sobre
-- un turno ya creado por crear_turno_manual(). Mismo criterio que
-- tenía el loop de la versión anterior — lote = 'ACTA', un lote/tanque
-- genérico por fila, litros consumidos como volumen_inicial_l con
-- volumen_l = 0.
-- ------------------------------------------------------------
create or replace function agregar_fila_turno_manual(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_presentacion_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_envases_llenadora integer,
  p_litros_consumidos numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area_rol text;
  v_usuario_id uuid;
  v_fecha date;
  v_hora_inicio time;
  v_hora_fin time;
  v_linea_id uuid;
  v_presentacion_id uuid;
  v_cajas_x_paleta integer;
  v_litros_x_caja numeric;
  v_lote_id uuid;
  v_turno_linea_id uuid;
begin
  select * into v_rol, v_area_rol from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'Solo el Super Administrador puede cargar un turno manualmente.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select fecha, hora_inicio, hora_fin into v_fecha, v_hora_inicio, v_hora_fin from turnos where id = p_turno_id;
  if v_fecha is null then
    raise exception 'Ese turno no existe.';
  end if;

  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_presentacion_volumen_ml;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en, cerrado_en)
  values (p_turno_id, 1, p_sabor_id, 'ACTA', 0, p_litros_consumidos, 0, v_usuario_id, v_fecha + v_hora_inicio, v_fecha + coalesce(v_hora_fin, v_hora_inicio))
  returning id into v_lote_id;

  insert into turno_lineas (turno_id, linea_id, presentacion_id, sabor_id, lote, lote_id, activa, activada_en, activada_por, finalizada_en, confirmado_inicio_en)
  values (
    p_turno_id, v_linea_id, v_presentacion_id, p_sabor_id, 'ACTA', v_lote_id, false,
    v_fecha + v_hora_inicio, v_usuario_id, v_fecha + coalesce(v_hora_fin, v_hora_inicio), now()
  )
  returning id into v_turno_linea_id;

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, justificacion, usuario_id)
  values (p_turno_id, v_turno_linea_id, v_linea_id, p_envases_llenadora, 'Carga manual desde acta', v_usuario_id);

  insert into producto_terminado (turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id)
  values (
    p_turno_id, v_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id,
    p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function agregar_fila_turno_manual(text, uuid, text, uuid, integer, integer, integer, integer, numeric) to anon, authenticated;
