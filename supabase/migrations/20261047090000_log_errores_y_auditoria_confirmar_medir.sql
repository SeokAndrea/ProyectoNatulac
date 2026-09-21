-- ============================================================
-- LOG DE ERRORES DEL CLIENTE (solo para quien tenga ve_errores)
-- ============================================================
-- Hasta hoy, un error de la app (de red, de permisos, de un RPC que no
-- existe en el caché de PostgREST, etc.) se veía en la pantalla del
-- supervisor y se perdía ahí — nadie más se enteraba salvo que alguien
-- mandara una captura de pantalla. Esta tabla guarda cada error que
-- devuelve cualquier RPC (ver el wrapper de supabase.rpc() en
-- src/lib/supabase.ts, que llama a registrar_error_cliente() por su
-- cuenta) y listar_errores_cliente() la expone SOLO a los usuarios con
-- usuarios.ve_errores = true — no es parte del rol (SUPERVISOR /
-- ADMINISTRADOR_AREA / SUPERADMINISTRADOR / MANTENIMIENTO), es un flag
-- aparte para no mezclar "qué puede hacer en planta" con "quién ve el
-- log de errores".
-- ============================================================

alter table usuarios add column ve_errores boolean not null default false;
update usuarios set ve_errores = true where usuario = 'agomez';

create table errores_cliente (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios (id) on delete set null,
  -- Texto crudo del usuario que llamó al RPC, por si no se pudo resolver
  -- el usuario_id (ej. p_usuario mal tipeado, o el RPC no llevaba p_usuario).
  usuario_texto text,
  funcion text not null,
  mensaje text not null,
  contexto jsonb,
  creado_en timestamptz not null default now()
);

alter table errores_cliente enable row level security;
create index errores_cliente_creado_en_idx on errores_cliente (creado_en desc);

-- ------------------------------------------------------------
-- registrar_error_cliente(): nunca debe poder romper la app — si algo
-- sale mal guardando el log, se traga el error y sigue.
-- ------------------------------------------------------------
create function registrar_error_cliente(
  p_usuario text,
  p_funcion text,
  p_mensaje text,
  p_contexto jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(coalesce(p_usuario, ''));

  insert into errores_cliente (usuario_id, usuario_texto, funcion, mensaje, contexto)
  values (v_usuario_id, p_usuario, p_funcion, p_mensaje, p_contexto);
exception when others then
  null;
end;
$$;

grant execute on function registrar_error_cliente(text, text, text, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- listar_errores_cliente(): exige usuarios.ve_errores = true.
-- ------------------------------------------------------------
create function listar_errores_cliente(p_usuario text, p_limite integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_puede boolean;
  v_result jsonb;
begin
  select ve_errores into v_puede from usuarios where usuario = lower(p_usuario);
  if not coalesce(v_puede, false) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  select jsonb_agg(x.obj order by x.creado_en desc) into v_result
  from (
    select
      e.creado_en,
      jsonb_build_object(
        'id', e.id,
        'usuarioNombre', coalesce(u.nombre, e.usuario_texto),
        'funcion', e.funcion,
        'mensaje', e.mensaje,
        'contexto', e.contexto,
        'creadoEn', e.creado_en
      ) as obj
    from errores_cliente e
    left join usuarios u on u.id = e.usuario_id
    order by e.creado_en desc
    limit p_limite
  ) x;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

grant execute on function listar_errores_cliente(text, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- verificar_login: suma ve_errores al retorno, para mostrar/ocultar la
-- pestaña "Errores" (src/pages/apps/ErroresCliente.tsx) sin una
-- consulta aparte al loguearse. "create or replace" no puede cambiar
-- el tipo de retorno — se borra la versión vieja primero (mismo patrón
-- que 20260978090000).
-- ------------------------------------------------------------
drop function if exists verificar_login(text, text);

create function verificar_login(p_usuario text, p_password text)
returns table (
  usuario_id uuid,
  usuario text,
  nombre text,
  cedula text,
  rol_codigo text,
  area_codigo text,
  debe_completar_perfil boolean,
  ve_errores boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, u.debe_completar_perfil, u.ve_errores
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  where u.usuario = lower(p_usuario)
    and u.password_hash = extensions.crypt(p_password, u.password_hash)
    and u.activo = true
  limit 1;
end;
$$;

grant execute on function verificar_login(text, text) to anon, authenticated;

-- ============================================================
-- AUDITORÍA: Confirmar (Status) y Medir Tanque no quedaban registrados
-- ============================================================
-- Se les había quedado afuera de registrar_auditoria() cuando se
-- escribieron — toda otra mutación real (Activar, Detener línea,
-- Transferir, Desvasar, Cargar PT, etc.) sí queda. Mismo cuerpo de
-- 20261040090000 (confirmar_estado_tanque/confirmar_estado_linea) y
-- 20261039090000 (medir_tanque), solo con el registrar_auditoria().
-- ============================================================

create or replace function confirmar_estado_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_momento text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_volumen numeric;
begin
  if p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if p_momento = 'INICIO' then
    update recepcion_tanques
    set confirmado_inicio_en = now(),
        confirmado_inicio_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  else
    update recepcion_tanques
    set confirmado_fin_en = now(),
        confirmado_fin_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  end if;

  -- Fuente real del inicio/fin de este turno para ese lote — ya no
  -- una foto automática ni lo que congeló otro turno.
  if v_tanque.condicion in ('LISTO', 'STANDBY') and v_tanque.lote_id is not null then
    v_volumen := volumen_vivo_tanque(p_turno_id, p_numero_tanque);
    if v_volumen is not null then
      if p_momento = 'INICIO' then
        update turnos
        set volumenes_lote_inicio = jsonb_set(coalesce(volumenes_lote_inicio, '{}'::jsonb), array[v_tanque.lote_id::text], to_jsonb(v_volumen))
        where id = p_turno_id;
      else
        update turnos
        set volumenes_lote_cierre = jsonb_set(coalesce(volumenes_lote_cierre, '{}'::jsonb), array[v_tanque.lote_id::text], to_jsonb(v_volumen))
        where id = p_turno_id;
      end if;
    end if;
  end if;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'recepcion_tanques', p_turno_id::text || '-' || p_numero_tanque::text, 'Status',
    format('Confirmar %s · Tanque %s', case when p_momento = 'INICIO' then 'inicio' else 'fin' end, p_numero_tanque),
    null,
    jsonb_build_object('momento', p_momento, 'numero_tanque', p_numero_tanque)
  );

  return turno_json(p_turno_id);
end;
$$;

create or replace function confirmar_estado_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_momento text default 'INICIO'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_codigo text;
begin
  if p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select l.codigo into v_linea_codigo from turno_lineas tl join lineas l on l.id = tl.linea_id where tl.id = p_turno_linea_id;

  if p_momento = 'INICIO' then
    update turno_lineas
    set confirmado_inicio_en = now(),
        confirmado_inicio_por = v_usuario_id
    where id = p_turno_linea_id and turno_id = p_turno_id and activa;
  else
    update turno_lineas
    set confirmado_fin_en = now(),
        confirmado_fin_por = v_usuario_id
    where id = p_turno_linea_id and turno_id = p_turno_id;
  end if;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'turno_lineas', p_turno_linea_id::text, 'Status',
    format('Confirmar %s · %s', case when p_momento = 'INICIO' then 'inicio' else 'fin' end, coalesce(v_linea_codigo, p_turno_linea_id::text)),
    null,
    jsonb_build_object('momento', p_momento)
  );

  return turno_json(p_turno_id);
end;
$$;

create or replace function medir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_volumen_real numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_volumen_viejo numeric;
  v_turno_previo_id uuid;
  v_ya_produjo boolean;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Solo se puede medir un tanque Liberado con un lote activo (Listo o Con Restos).';
  end if;
  if p_volumen_real is null or p_volumen_real < 0 then
    raise exception 'El volumen medido no es válido.';
  end if;

  select volumen_l into v_volumen_viejo
  from preparaciones where id = v_tanque.lote_id and cerrado_en is null;

  -- Relevo sin finalizar: ¿el lote de este tanque quedó congelado por
  -- un cierre FORZADO de un turno anterior (no el actual)? Si todavía
  -- no se produjo nada con él en ESTE turno, la medición de ahora es
  -- el cierre real de ese turno anterior, no el punto de partida de
  -- este — se corrige ahí en vez de dejarla como "inicio" de acá.
  select t.id into v_turno_previo_id
  from turnos t
  where t.estado = 'CERRADO'
    and t.cierre_automatico
    and t.id <> p_turno_id
    and jsonb_exists(t.volumenes_lote_cierre, v_tanque.lote_id::text)
  order by t.fecha desc, t.hora_fin desc nulls last, t.created_at desc
  limit 1;

  if v_turno_previo_id is not null then
    select exists(
      select 1
      from producto_terminado pt
      join turno_lineas tl on tl.id = pt.turno_linea_id
      where pt.turno_id = p_turno_id and tl.lote_id = v_tanque.lote_id
    ) into v_ya_produjo;

    if not v_ya_produjo then
      update turnos
      set volumenes_lote_cierre = jsonb_set(volumenes_lote_cierre, array[v_tanque.lote_id::text], to_jsonb(p_volumen_real)),
          actualizada_por = v_usuario_id
      where id = v_turno_previo_id;
    end if;
  end if;

  -- Relectura física: solo `volumen_l`. NO se toca `volumen_inicial_l`.
  update preparaciones set volumen_l = p_volumen_real, actualizada_por = v_usuario_id
  where id = v_tanque.lote_id and cerrado_en is null;

  update recepcion_tanques
  set volumen_l = p_volumen_real, activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_volumen_viejo is not null and p_volumen_real is distinct from v_volumen_viejo then
    insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
    values (
      v_tanque.lote_id,
      p_turno_id,
      v_volumen_viejo,
      p_volumen_real,
      coalesce(p_volumen_real, 0) - coalesce(v_volumen_viejo, 0),
      v_usuario_id
    );
  end if;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'recepcion_tanques', p_turno_id::text || '-' || p_numero_tanque::text, 'Preparación',
    format('Medir Tanque %s · %s L%s', p_numero_tanque, p_volumen_real,
           case when v_volumen_viejo is not null then format(' (antes %s L)', v_volumen_viejo) else '' end),
    case when v_volumen_viejo is not null then jsonb_build_object('volumen_l', v_volumen_viejo) else null end,
    jsonb_build_object('volumen_l', p_volumen_real)
  );

  -- Si lo medido dejó el lote en ~0 y ninguna corrida activa lo usa,
  -- se cierra el lote y el tanque pasa a SUCIO (mismo cierre que usa
  -- Producción). Idempotente y con guardas propias.
  perform revisar_cierre_de_lote(v_tanque.lote_id);

  return turno_json(p_turno_id);
end;
$$;
