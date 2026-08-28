-- ============================================================
-- MENSAJES DE ERROR EN ESPAÑOL NEUTRO (sin voseo)
-- ============================================================
-- Varias funciones lanzaban errores con voseo ("No tenés permiso…",
-- "Elegí dos tanques…", "pará o terminá…") que llegan tal cual a la
-- UI (el frontend muestra error.message). Se reemiten esas funciones
-- IDÉNTICAS salvo el texto de los raise, ahora en tuteo neutro.
-- (cambiar_condicion_linea se corrige en 20260969; acá van el resto.)
-- ============================================================

create or replace function listar_personal(p_usuario text)
returns table (
  usuario_id uuid,
  usuario text,
  nombre text,
  cedula text,
  rol_codigo text,
  area_codigo text,
  activo boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);

  if v_rol is null then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, u.activo, u.created_at
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  where v_rol = 'SUPERADMINISTRADOR' or a.codigo = v_area
  order by u.created_at desc;
end;
$$;

create or replace function crear_usuario(
  p_creador_usuario text,
  p_usuario text,
  p_password text,
  p_rol_codigo text,
  p_area_codigo text default null,
  p_nombre text default null,
  p_cedula text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creador_rol text;
  v_creador_area text;
  v_usuario_id uuid;
  v_rol_id uuid;
  v_area_id uuid;
begin
  select * into v_creador_rol, v_creador_area from rol_y_area_de(p_creador_usuario);

  if v_creador_rol = 'ADMINISTRADOR_AREA' then
    if p_rol_codigo = 'SUPERADMINISTRADOR' then
      raise exception 'No tienes permiso para asignar ese rol.';
    end if;
    if p_area_codigo is distinct from v_creador_area then
      raise exception 'Solo puedes agregar personal de tu propia área.';
    end if;
  elsif v_creador_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para hacer esto.';
  end if;

  select id into v_rol_id from roles where codigo = p_rol_codigo;
  if v_rol_id is null then
    raise exception 'Rol % no existe', p_rol_codigo;
  end if;

  if p_area_codigo is not null then
    select id into v_area_id from areas where codigo = p_area_codigo;
    if v_area_id is null then
      raise exception 'Área % no existe', p_area_codigo;
    end if;
  end if;

  insert into usuarios (usuario, password_hash, nombre, cedula)
  values (lower(p_usuario), extensions.crypt(p_password, extensions.gen_salt('bf')), coalesce(p_nombre, p_usuario), p_cedula)
  returning id into v_usuario_id;

  insert into usuario_roles (usuario_id, rol_id, area_id)
  values (v_usuario_id, v_rol_id, v_area_id);

  return v_usuario_id;
end;
$$;

create or replace function editar_personal(
  p_creador_usuario text,
  p_usuario_id uuid,
  p_nombre text,
  p_cedula text,
  p_area_codigo text,
  p_rol_codigo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creador_rol text;
  v_creador_area text;
  v_rol_id uuid;
  v_area_id uuid;
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para editar a esta persona.';
  end if;

  select * into v_creador_rol, v_creador_area from rol_y_area_de(p_creador_usuario);
  if v_creador_rol = 'ADMINISTRADOR_AREA' and (p_rol_codigo = 'SUPERADMINISTRADOR' or p_area_codigo is distinct from v_creador_area) then
    raise exception 'No tienes permiso para asignar ese rol o área.';
  end if;

  select id into v_rol_id from roles where codigo = p_rol_codigo;
  if v_rol_id is null then
    raise exception 'Rol % no existe', p_rol_codigo;
  end if;
  if p_area_codigo is not null then
    select id into v_area_id from areas where codigo = p_area_codigo;
  end if;

  update usuarios set nombre = p_nombre, cedula = p_cedula where id = p_usuario_id;
  update usuario_roles set rol_id = v_rol_id, area_id = v_area_id where usuario_id = p_usuario_id;
end;
$$;

create or replace function restablecer_password(p_creador_usuario text, p_usuario_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para restablecer la contraseña de esta persona.';
  end if;

  update usuarios
  set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
  where id = p_usuario_id;
end;
$$;

create or replace function desactivar_personal(p_creador_usuario text, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para dar de baja a esta persona.';
  end if;
  update usuarios set activo = false where id = p_usuario_id;
end;
$$;

create or replace function reactivar_personal(p_creador_usuario text, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para reactivar a esta persona.';
  end if;
  update usuarios set activo = true where id = p_usuario_id;
end;
$$;

create or replace function transferir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_numero_tanque_destino smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_origen recepcion_tanques%rowtype;
  v_destino recepcion_tanques%rowtype;
  v_origen_prep preparaciones%rowtype;
  v_nuevo_lote_id uuid;
begin
  if p_numero_tanque_origen = p_numero_tanque_destino then
    raise exception 'Elige dos tanques distintos.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_origen from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;
  select * into v_destino from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

  if v_origen.condicion not in ('LISTO', 'STANDBY') or v_origen.lote_id is null then
    raise exception 'El tanque origen no tiene un lote activo para transferir.';
  end if;
  if v_destino.condicion not in ('LISTO', 'STANDBY', 'LIMPIO') then
    raise exception 'El tanque destino debe estar Limpio, o tener el mismo sabor ya cargado (Listo o Standby).';
  end if;
  if v_destino.condicion in ('LISTO', 'STANDBY') and v_origen.sabor_id is distinct from v_destino.sabor_id then
    raise exception 'Los dos tanques deben tener el mismo sabor.';
  end if;

  if v_destino.condicion = 'LIMPIO' then
    -- Mover el lote entero: el destino no tenía nada, se crea su lote
    -- con el mismo sabor/lote/volumen que traía el origen — es el
    -- mismo lote, solo que ahora vive en otro tanque físico.
    select * into v_origen_prep from preparaciones where id = v_origen.lote_id;

    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en)
    values (p_turno_id, p_numero_tanque_destino, v_origen_prep.sabor_id, v_origen_prep.lote, v_origen.volumen_l, v_origen.volumen_l, 0, v_usuario_id, now())
    returning id into v_nuevo_lote_id;

    update recepcion_tanques
    set condicion = 'LISTO',
        sabor_id = v_origen.sabor_id,
        volumen_l = v_origen.volumen_l,
        lote = v_origen.lote,
        lote_id = v_nuevo_lote_id,
        activada_en = now(),
        actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_nuevo_lote_id
    where lote_id = v_origen.lote_id and activa;
  else
    -- Sumar: el destino ya tenía el mismo sabor cargado — es líquido
    -- nuevo de verdad entrando al tanque, no una corrección de
    -- medición (distinto del caso de
    -- 20260956090000_corregir_tanque_ajusta_inicial_con_delta.sql).
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + coalesce(v_origen.volumen_l, 0),
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + coalesce(v_origen.volumen_l, 0)
    where id = v_destino.lote_id;

    update recepcion_tanques
    set volumen_l = (select volumen_l from preparaciones where id = v_destino.lote_id)
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_destino.lote_id, lote = v_destino.lote, sabor_id = v_destino.sabor_id
    where lote_id = v_origen.lote_id and activa;
  end if;

  update preparaciones set cerrado_en = now() where id = v_origen.lote_id and cerrado_en is null;

  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_origen.sabor_id,
      ultimo_lote = 'Transferido al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, ''),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

create or replace function corregir_producto_terminado_auditoria(
  p_usuario text,
  p_turno_linea_id uuid,
  p_paletas integer,
  p_cajas_sueltas integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_usuario_id uuid;
  v_turno_id uuid;
  v_turno_area_codigo text;
  v_linea_codigo text;
  v_sabor_id uuid;
  v_volumen_ml integer;
  v_producto_retenido boolean;
  v_cajas_retenidas integer;
  v_resultado jsonb;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is null or v_rol not in ('SUPERADMINISTRADOR', 'ADMINISTRADOR_AREA') then
    raise exception 'No tienes permiso para editar esto.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select pt.turno_id, l.codigo, pt.sabor_id, p.volumen_ml, pt.producto_retenido, pt.cajas_retenidas
  into v_turno_id, v_linea_codigo, v_sabor_id, v_volumen_ml, v_producto_retenido, v_cajas_retenidas
  from producto_terminado pt
  join lineas l on l.id = pt.linea_id
  join presentaciones p on p.id = pt.presentacion_id
  where pt.turno_linea_id = p_turno_linea_id;

  if v_turno_id is null then
    raise exception 'No se encontró Producto Terminado para esa corrida.';
  end if;

  select a.codigo into v_turno_area_codigo from turnos t join areas a on a.id = t.area_id where t.id = v_turno_id;
  if v_rol = 'ADMINISTRADOR_AREA' and v_turno_area_codigo is distinct from v_area then
    raise exception 'No tienes permiso para editar esto.';
  end if;

  v_resultado := registrar_producto_terminado(
    v_turno_id, p_turno_linea_id, v_linea_codigo, v_sabor_id, v_volumen_ml,
    p_paletas, p_cajas_sueltas, p_usuario, v_producto_retenido, v_cajas_retenidas
  );

  update producto_terminado
  set editado_por = v_usuario_id, editado_en = now()
  where turno_linea_id = p_turno_linea_id;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function listar_personal(text) to anon, authenticated;
grant execute on function crear_usuario(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function editar_personal(text, uuid, text, text, text, text) to anon, authenticated;
grant execute on function restablecer_password(text, uuid, text) to anon, authenticated;
grant execute on function desactivar_personal(text, uuid) to anon, authenticated;
grant execute on function reactivar_personal(text, uuid) to anon, authenticated;
grant execute on function transferir_tanque(text, uuid, smallint, smallint) to anon, authenticated;
grant execute on function corregir_producto_terminado_auditoria(text, uuid, integer, integer) to anon, authenticated;
