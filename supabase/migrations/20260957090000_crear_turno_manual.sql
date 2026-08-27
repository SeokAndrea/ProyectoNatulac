-- ============================================================
-- CARGA MANUAL DE TURNOS VIEJOS (SUPER ADMIN) — desde un acta en papel
-- ============================================================
-- Mientras no todos los supervisores usan el sistema en vivo, el
-- Super Admin necesita poder cargar un turno ya pasado a partir de su
-- acta en papel, para que salga en Panel de Producción/Auditoría igual
-- que uno cargado en vivo. El acta en papel no tiene la secuencia de
-- lotes/tanques que sí tiene un turno real — solo totales por sabor:
-- paletas + cajas sueltas, envases de la llenadora, y litros
-- consumidos del tanque (para la merma de semielaborado).
--
-- Se resuelve reusando EXACTAMENTE las mismas tablas que un turno en
-- vivo (turno_lineas/contadores/producto_terminado/preparaciones), una
-- fila de cada una por (línea, sabor) — así todo lo que ya existe
-- (mermaEnvasesTurno, mermaSemielaboradoTurno, el Acta en PDF,
-- Auditoría) funciona sin tocarlo. No hace falta simular tanques
-- físicos (recepcion_tanques) — este turno nunca se abre en
-- Status/Preparación, solo se ve en reportes.
--
-- "Litros consumidos" se guarda como volumen_inicial_l del lote, con
-- volumen_l = 0 (lote agotado, matemáticamente correcto para
-- mermaSemielaboradoTurno: consumido = inicial - actual = inicial - 0).
--
-- El lote de cada fila se marca con lote = 'ACTA' — así
-- editar_fila_turno_manual() de abajo puede negarse a tocar cualquier
-- fila que NO venga de acá (protege datos reales de turnos en vivo).
-- ============================================================

create or replace function crear_turno_manual(
  p_usuario text,
  p_area_codigo text,
  p_supervisor_usuario text,
  p_fecha date,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
  p_hora_inicio time,
  p_hora_fin time,
  p_filas jsonb
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
  v_supervisor_id uuid;
  v_area_id uuid;
  v_turno_tipo_id uuid;
  v_grupo_id uuid;
  v_turno_id uuid;
  v_codigo text;
  v_fila jsonb;
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
  select id into v_supervisor_id from usuarios where usuario = lower(p_supervisor_usuario);
  if v_supervisor_id is null then
    raise exception 'Usuario % no existe', p_supervisor_usuario;
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  select id into v_turno_tipo_id from turno_tipos where codigo = p_turno_tipo_codigo;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;

  v_codigo := left(p_area_codigo, 1) || to_char(p_fecha, 'YYYYMMDD') || '_T' || replace(p_turno_tipo_codigo, 'TURNO_', '') || 'G' || replace(p_grupo_codigo, 'GRUPO_', '');

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, estado, fecha_fin, hora_fin)
  values (v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, p_fecha, p_hora_inicio, 'CERRADO', p_fecha, p_hora_fin)
  returning id into v_turno_id;

  for v_fila in select * from jsonb_array_elements(p_filas)
  loop
    select id into v_linea_id from lineas where codigo = v_fila ->> 'linea_codigo';
    select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
    from presentaciones where volumen_ml = (v_fila ->> 'presentacion_volumen_ml')::integer;

    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en, cerrado_en)
    values (
      v_turno_id, 1, (v_fila ->> 'sabor_id')::uuid, 'ACTA', 0, (v_fila ->> 'litros_consumidos')::numeric, 0, v_usuario_id,
      p_fecha + p_hora_inicio, p_fecha + coalesce(p_hora_fin, p_hora_inicio)
    )
    returning id into v_lote_id;

    insert into turno_lineas (turno_id, linea_id, presentacion_id, sabor_id, lote, lote_id, activa, activada_en, activada_por, finalizada_en, confirmado_inicio_en)
    values (
      v_turno_id, v_linea_id, v_presentacion_id, (v_fila ->> 'sabor_id')::uuid, 'ACTA', v_lote_id, false,
      p_fecha + p_hora_inicio, v_usuario_id, p_fecha + coalesce(p_hora_fin, p_hora_inicio), now()
    )
    returning id into v_turno_linea_id;

    insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, justificacion, usuario_id)
    values (v_turno_id, v_turno_linea_id, v_linea_id, (v_fila ->> 'envases_llenadora')::integer, 'Carga manual desde acta', v_usuario_id);

    insert into producto_terminado (turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id)
    values (
      v_turno_id, v_turno_linea_id, v_linea_id, (v_fila ->> 'sabor_id')::uuid, v_presentacion_id,
      (v_fila ->> 'paletas')::integer, (v_fila ->> 'cajas_sueltas')::integer, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
    );
  end loop;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function crear_turno_manual(text, text, text, date, text, text, time, time, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- editar_fila_turno_manual(): ajustar UNA fila (línea+sabor) de un
-- turno cargado por crear_turno_manual() — "faltaban paletas", "el
-- contador estaba mal", etc. Se niega si esa fila no vino de acá
-- (lote <> 'ACTA') para no poder tocar por este atajo los deltas
-- cuidadosos de un turno real (registrar_producto_terminado()).
-- ------------------------------------------------------------
create or replace function editar_fila_turno_manual(
  p_usuario text,
  p_turno_linea_id uuid,
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
  v_turno_id uuid;
  v_lote_id uuid;
  v_lote text;
begin
  select * into v_rol, v_area_rol from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'Solo el Super Administrador puede editar un turno cargado manualmente.';
  end if;

  select tl.turno_id, tl.lote_id, tl.lote into v_turno_id, v_lote_id, v_lote
  from turno_lineas tl where tl.id = p_turno_linea_id;

  if v_turno_id is null then
    raise exception 'Esa fila no existe.';
  end if;
  if v_lote is distinct from 'ACTA' then
    raise exception 'Esta fila no vino de una carga manual — no se puede editar por acá.';
  end if;

  update producto_terminado
  set paletas = p_paletas, cajas_sueltas = p_cajas_sueltas, updated_at = now()
  where turno_linea_id = p_turno_linea_id;

  update contadores
  set envases_llenadora = p_envases_llenadora
  where turno_linea_id = p_turno_linea_id;

  if v_lote_id is not null then
    update preparaciones set volumen_inicial_l = p_litros_consumidos where id = v_lote_id;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function editar_fila_turno_manual(text, uuid, integer, integer, integer, numeric) to anon, authenticated;
