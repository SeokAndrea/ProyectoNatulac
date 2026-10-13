-- ENSAYO (se puede borrar): aplica la migración 20261109690000 (sesiones con credencial) + chequeos y DESHACE todo.
-- Pegar entero en Supabase → SQL Editor → Run. SIEMPRE termina en error (a propósito, para deshacer todo):
--   'ENSAYO OK: ...'  => funciona, ya se puede aplicar la migración.
--   cualquier otro error => algo falla; no quedó nada aplicado.
-- Crea dos usuarios de prueba (ensayo_sesion_a / _b) que también se deshacen.

begin;

-- ===================== MIGRACIÓN 20261109690000_sesiones_con_credencial.sql =====================
-- ============================================================
-- SESIONES CON CREDENCIAL: la base deja de creerle al nombre que manda la app
-- ============================================================
-- Dueña, 2026-10-13. Hasta acá la clave se revisaba una sola vez
-- (verificar_login) y después cada función le creía a p_usuario: con la
-- URL y la clave anon (públicas: van en la app) cualquiera podía llamar a
-- la base diciendo "soy agomez", sin clave. Ahora:
--
--   * verificar_login entrega una credencial (token al azar). En la base
--     queda solo su huella (sha256), nunca el token.
--   * La app la manda en cada petición (header x-sesion, ver
--     src/lib/sesionToken.ts).
--   * revisar_peticion() es el portero: PostgREST la corre antes de CADA
--     petición (pgrst.db_pre_request). Sin credencial válida solo se puede
--     entrar (verificar_login) y anotar errores (registrar_error_cliente).
--   * exigir_usuario() va al comienzo de cada función con p_usuario (o
--     p_creador_usuario, que es quien actúa cuando existe): el nombre tiene
--     que ser el de la credencial. asegurar_control_usuario() lo agrega
--     solo a las que no lo tienen.
--   * 5 claves malas seguidas en 15 minutos bloquean ese usuario 15 minutos.
--   * Cambiar la clave o desactivar a alguien cierra sus otras sesiones.
--
-- Arranca en modo AVISO: nada se rechaza, solo se anota en
-- accesos_rechazados lo que se habría rechazado. Cuando esa tabla muestre
-- solo cosas esperadas:
--   update seguridad_config set modo = 'EXIGIR';
-- Para volver atrás al instante (desde el SQL Editor, que no pasa por el
-- portero):
--   update seguridad_config set modo = 'AVISO';
--
-- REGLA para migraciones nuevas: si crean o reemplazan una función con
-- p_usuario, terminan con  select * from asegurar_control_usuario();
-- ============================================================

-- ---------- Tablas ----------

create table if not exists seguridad_config (
  id boolean primary key default true check (id),
  modo text not null default 'AVISO' check (modo in ('AVISO', 'EXIGIR'))
);
insert into seguridad_config (id, modo) values (true, 'AVISO') on conflict (id) do nothing;

create table if not exists sesiones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  token_hash text not null unique,
  creada_en timestamptz not null default now(),
  ultimo_uso timestamptz not null default now()
);
create index if not exists sesiones_usuario_idx on sesiones (usuario_id);

create table if not exists intentos_login (
  usuario text not null,
  en timestamptz not null default now()
);
create index if not exists intentos_login_usuario_en_idx on intentos_login (usuario, en);

-- Una fila por hora, ruta y motivo (con contador), para no llenarse.
create table if not exists accesos_rechazados (
  hora timestamptz not null,
  ruta text not null,
  motivo text not null,
  usuario_declarado text not null default '',
  usuario_sesion text not null default '',
  veces integer not null default 1,
  primary key (hora, ruta, motivo, usuario_declarado, usuario_sesion)
);

-- Solo las funciones de abajo las tocan.
alter table seguridad_config enable row level security;
alter table sesiones enable row level security;
alter table intentos_login enable row level security;
alter table accesos_rechazados enable row level security;
revoke all on table seguridad_config, sesiones, intentos_login, accesos_rechazados from anon, authenticated;

-- ---------- Ayudantes ----------

create or replace function hash_token(p_token text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

/* El token que vino en el header x-sesion de esta petición (null fuera de PostgREST). */
create or replace function token_de_peticion()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-sesion', '')
$$;

create or replace function anotar_acceso_rechazado(
  p_ruta text,
  p_motivo text,
  p_declarado text default null,
  p_sesion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- PostgREST abre las lecturas en solo lectura: ahí no se puede anotar.
  if current_setting('transaction_read_only') = 'on' then
    return;
  end if;
  insert into accesos_rechazados (hora, ruta, motivo, usuario_declarado, usuario_sesion)
  values (date_trunc('hour', now()), left(coalesce(p_ruta, ''), 200), left(p_motivo, 200),
          coalesce(lower(p_declarado), ''), coalesce(p_sesion, ''))
  on conflict (hora, ruta, motivo, usuario_declarado, usuario_sesion)
  do update set veces = accesos_rechazados.veces + 1;
exception when others then
  return; -- anotar nunca rompe la petición
end;
$$;

-- ---------- El portero ----------

create or replace function revisar_peticion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ruta text := coalesce(current_setting('request.path', true), '');
  v_token text;
  v_hash text;
  v_usuario text;
begin
  -- Llaves de servidor (scripts con service_role): no pasan por acá.
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role' then
    return;
  end if;

  v_token := token_de_peticion();
  if v_token is not null then
    v_hash := hash_token(v_token);
    select u.usuario into v_usuario
    from sesiones s
    join usuarios u on u.id = s.usuario_id
    where s.token_hash = v_hash
      and u.activo
      and s.ultimo_uso > now() - interval '30 days';

    if v_usuario is not null then
      perform set_config('app.usuario_sesion', v_usuario, true);
      if current_setting('transaction_read_only') = 'off' then
        update sesiones set ultimo_uso = now()
        where token_hash = v_hash and ultimo_uso < now() - interval '1 hour';
      end if;
      return;
    end if;
  end if;

  -- Sin credencial válida: solo entrar y anotar errores de la pantalla.
  if split_part(v_ruta, '/rpc/', 2) in ('verificar_login', 'registrar_error_cliente') then
    return;
  end if;

  if (select modo from seguridad_config) = 'EXIGIR' then
    raise exception 'Tu sesión no es válida o venció. Vuelve a iniciar sesión.'
      using errcode = 'invalid_authorization_specification';
  end if;
  perform anotar_acceso_rechazado(v_ruta, case when v_token is null then 'SIN_SESION' else 'SESION_INVALIDA' end);
exception
  when invalid_authorization_specification then
    raise;
  when others then
    -- Un error propio del portero: en AVISO nunca frena; en EXIGIR, sí.
    if coalesce((select modo from seguridad_config), 'AVISO') = 'EXIGIR' then
      raise;
    end if;
    perform anotar_acceso_rechazado(v_ruta, 'ERROR: ' || sqlerrm);
end;
$$;

/*
 * Al comienzo de cada función con usuario (lo agrega asegurar_control_usuario).
 * Solo revisa la función que pidió la app: no las que esta llama por dentro
 * (ej. es_dueno(p_creador_usuario)), ni el SQL Editor, ni el cron.
 */
create or replace function exigir_usuario(p_funcion text, p_usuario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ruta text := coalesce(current_setting('request.path', true), '');
  v_sesion text := nullif(current_setting('app.usuario_sesion', true), '');
begin
  if split_part(v_ruta, '/rpc/', 2) is distinct from p_funcion then
    return;
  end if;
  if p_usuario is null or lower(p_usuario) = v_sesion then
    return;
  end if;
  if (select modo from seguridad_config) = 'EXIGIR' then
    raise exception 'Tu sesión no corresponde al usuario %. Vuelve a iniciar sesión.', p_usuario
      using errcode = 'invalid_authorization_specification';
  end if;
  -- SIN_SESION con nombre: dice quién sigue con la app vieja o sin volver a entrar.
  perform anotar_acceso_rechazado(v_ruta, case when v_sesion is null then 'SIN_SESION' else 'USUARIO_DISTINTO' end,
                                  p_usuario, v_sesion);
end;
$$;

/*
 * Agrega exigir_usuario() al comienzo de cada función con p_usuario /
 * p_creador_usuario que no lo tenga. Se puede correr las veces que haga
 * falta: devuelve lo que agregó y lo que no pudo (para revisar a mano).
 */
create or replace function asegurar_control_usuario()
returns table (funcion text, resultado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_param text;
  v_antes text;
  v_cuerpo text;
  v_llamada text;
begin
  for r in
    select p.oid, p.proname::text as nombre, p.prosrc, l.lanname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_function_identity_arguments(p.oid) ~ '\m(p_usuario|p_creador_usuario) text\M'
      and p.proname not in ('verificar_login', 'registrar_error_cliente', 'exigir_usuario')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname
  loop
    if r.prosrc ~ 'exigir_usuario\(' then
      continue;
    end if;
    v_param := case when r.args ~ '\mp_creador_usuario text\M' then 'p_creador_usuario' else 'p_usuario' end;
    v_llamada := 'public.exigir_usuario(' || quote_literal(r.nombre) || ', ' || v_param || ')';

    if r.lanname = 'plpgsql' then
      -- Justo después del primer begin (el del bloque principal), si no está en un comentario.
      v_antes := (regexp_match(r.prosrc, '^(.*?)\mbegin\M', 'i'))[1];
      if v_antes is null
         or v_antes ~ '--[^\n]*$'
         or (length(v_antes) - length(replace(v_antes, '/*', ''))) <> (length(v_antes) - length(replace(v_antes, '*/', ''))) then
        funcion := r.nombre;
        resultado := 'REVISAR A MANO (no se encontró el begin)';
        return next;
        continue;
      end if;
      v_cuerpo := regexp_replace(r.prosrc, '\mbegin\M', E'begin\n  perform ' || v_llamada || ';', 'i');
    elsif r.lanname = 'sql' and coalesce(r.prosrc, '') <> '' then
      -- Una sentencia más antes: una función SQL devuelve lo de la última.
      v_cuerpo := E'\n  select ' || v_llamada || ';' || r.prosrc;
    else
      funcion := r.nombre;
      resultado := 'REVISAR A MANO (lenguaje ' || r.lanname || ')';
      return next;
      continue;
    end if;

    execute replace(pg_get_functiondef(r.oid), r.prosrc, v_cuerpo);
    funcion := r.nombre;
    resultado := 'CONTROL AGREGADO';
    return next;
  end loop;
end;
$$;

-- ---------- Entrar y salir ----------

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
  ve_errores boolean,
  token text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_usuario text := lower(trim(p_usuario));
  v_fila record;
  v_token text;
begin
  delete from intentos_login where en < now() - interval '1 day';
  delete from sesiones where ultimo_uso < now() - interval '30 days';

  if (select count(*) from intentos_login i
      where i.usuario = v_usuario and i.en > now() - interval '15 minutes') >= 5 then
    raise exception 'Demasiados intentos fallidos con este usuario. Espera 15 minutos y vuelve a intentar.';
  end if;

  select u.id, u.usuario, u.nombre, u.cedula, r.codigo as rol_codigo, a.codigo as area_codigo,
         u.debe_completar_perfil, u.ve_errores
  into v_fila
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  where u.usuario = v_usuario
    and u.password_hash = extensions.crypt(p_password, u.password_hash)
    and u.activo = true
  limit 1;

  if not found then
    insert into intentos_login (usuario) values (v_usuario);
    return;
  end if;

  delete from intentos_login i where i.usuario = v_usuario;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into sesiones (usuario_id, token_hash) values (v_fila.id, hash_token(v_token));

  return query select v_fila.id, v_fila.usuario, v_fila.nombre, v_fila.cedula, v_fila.rol_codigo,
                      v_fila.area_codigo, v_fila.debe_completar_perfil, v_fila.ve_errores, v_token;
end;
$$;

create or replace function cerrar_sesion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := token_de_peticion();
begin
  if v_token is not null then
    delete from sesiones where token_hash = hash_token(v_token);
  end if;
end;
$$;

-- Cambiar la clave (o desactivar) cierra las otras sesiones de esa persona;
-- la de quien hace el cambio (ej. su primer ingreso) sigue abierta.
create or replace function cerrar_sesiones_al_cambiar_clave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.password_hash is distinct from old.password_hash or (old.activo and not new.activo) then
    delete from sesiones
    where usuario_id = new.id
      and token_hash is distinct from hash_token(token_de_peticion());
  end if;
  return new;
end;
$$;

drop trigger if exists usuarios_cierra_sesiones on usuarios;
create trigger usuarios_cierra_sesiones
after update of password_hash, activo on usuarios
for each row execute function cerrar_sesiones_al_cambiar_clave();

-- ---------- Permisos ----------

revoke execute on function hash_token(text), token_de_peticion(), anotar_acceso_rechazado(text, text, text, text),
  asegurar_control_usuario(), cerrar_sesiones_al_cambiar_clave()
  from public, anon, authenticated;
grant execute on function verificar_login(text, text), cerrar_sesion(), revisar_peticion(), exigir_usuario(text, text)
  to anon, authenticated;

-- ---------- Encender ----------

select * from asegurar_control_usuario();

alter role authenticator set pgrst.db_pre_request = 'public.revisar_peticion';
notify pgrst, 'reload config';

-- ===================== CHEQUEOS =====================
do $$
declare
  v_rol uuid;
  v_a uuid;
  v_b uuid;
  v_tok text;
  v_tok2 text;
  v_n integer := 0;
  v_filas integer;
  v_con_control integer;
  v_revisar text;
begin
  select id into v_rol from roles where codigo = 'SUPERVISOR';
  if v_rol is null then
    raise exception 'ENSAYO FALLÓ (0): no existe el rol SUPERVISOR.';
  end if;
  insert into usuarios (usuario, password_hash, nombre, debe_completar_perfil)
  values ('ensayo_sesion_a', extensions.crypt('4321', extensions.gen_salt('bf')), 'Ensayo A', false)
  returning id into v_a;
  insert into usuarios (usuario, password_hash, nombre, debe_completar_perfil)
  values ('ensayo_sesion_b', extensions.crypt('4321', extensions.gen_salt('bf')), 'Ensayo B', false)
  returning id into v_b;
  insert into usuario_roles (usuario_id, rol_id) values (v_a, v_rol), (v_b, v_rol);

  -- 1. Clave mala: no entra; a los 5 intentos queda bloqueado (aunque después ponga la buena).
  for i in 1..5 loop
    select count(*) into v_filas from verificar_login('ensayo_sesion_a', '0000');
    if v_filas <> 0 then
      raise exception 'ENSAYO FALLÓ (1): entró con clave mala.';
    end if;
  end loop;
  begin
    perform * from verificar_login('ensayo_sesion_a', '4321');
    raise exception 'ENSAYO FALLÓ (1): no bloqueó después de 5 claves malas.';
  exception when others then
    if sqlerrm not like 'Demasiados intentos%' then
      raise;
    end if;
  end;
  delete from intentos_login where usuario = 'ensayo_sesion_a';
  v_n := v_n + 1;

  -- 2. Clave buena: entrega credencial y en la base queda solo la huella.
  select l.token into v_tok from verificar_login('ENSAYO_SESION_A', '4321') l;
  if v_tok is null or length(v_tok) <> 64 then
    raise exception 'ENSAYO FALLÓ (2): no entregó credencial.';
  end if;
  if not exists (select 1 from sesiones where usuario_id = v_a and token_hash = hash_token(v_tok)) then
    raise exception 'ENSAYO FALLÓ (2): no guardó la sesión.';
  end if;
  if exists (select 1 from sesiones where token_hash = v_tok) then
    raise exception 'ENSAYO FALLÓ (2): guardó la credencial sin cifrar.';
  end if;
  v_n := v_n + 1;

  -- 3. Portero con credencial: reconoce a la persona.
  perform set_config('request.path', '/rpc/listar_lineas', true);
  perform set_config('request.headers', json_build_object('x-sesion', v_tok)::text, true);
  perform revisar_peticion();
  if current_setting('app.usuario_sesion', true) is distinct from 'ensayo_sesion_a' then
    raise exception 'ENSAYO FALLÓ (3): el portero no reconoció la credencial.';
  end if;
  v_n := v_n + 1;

  -- 4. Modo AVISO: sin credencial no frena (solo anota).
  perform set_config('app.usuario_sesion', '', true);
  perform set_config('request.headers', '{}', true);
  perform revisar_peticion();
  v_n := v_n + 1;

  -- 5. Modo EXIGIR: sin credencial, o con una inventada, se rechaza; entrar sigue abierto.
  update seguridad_config set modo = 'EXIGIR';
  begin
    perform revisar_peticion();
    raise exception 'ENSAYO FALLÓ (5): dejó pasar sin credencial.';
  exception when invalid_authorization_specification then
    null;
  end;
  perform set_config('request.headers', json_build_object('x-sesion', repeat('0', 64))::text, true);
  begin
    perform revisar_peticion();
    raise exception 'ENSAYO FALLÓ (5): dejó pasar con una credencial inventada.';
  exception when invalid_authorization_specification then
    null;
  end;
  perform set_config('request.path', '/rpc/verificar_login', true);
  perform revisar_peticion();
  v_n := v_n + 1;

  -- 6. Hacerse pasar por otro: con la credencial de A, pidiendo como B.
  perform set_config('request.headers', json_build_object('x-sesion', v_tok)::text, true);
  perform set_config('request.path', '/rpc/turno_activo_de', true);
  perform revisar_peticion();
  begin
    perform turno_activo_de('ensayo_sesion_b');
    raise exception 'ENSAYO FALLÓ (6): turno_activo_de aceptó a otro usuario.';
  exception when invalid_authorization_specification then
    null;
  end;
  begin
    perform turno_activo_de('ENSAYO_SESION_A'); -- la propia sí
  exception
    when invalid_authorization_specification then
      raise exception 'ENSAYO FALLÓ (6): turno_activo_de rechazó a la persona de la credencial.';
    when others then
      null; -- otro error de la función (ej. sin área) no es del control
  end;
  perform set_config('request.path', '/rpc/permisos_de', true);
  begin
    perform permisos_de('ensayo_sesion_b');
    raise exception 'ENSAYO FALLÓ (6): permisos_de (función SQL) aceptó a otro usuario.';
  exception when invalid_authorization_specification then
    null;
  end;
  -- Llamada por dentro de otra función: no se revisa.
  perform set_config('request.path', '/rpc/crear_usuario', true);
  perform exigir_usuario('es_dueno', 'ensayo_sesion_b');
  v_n := v_n + 1;

  -- 7. Cambio de clave: cierra la otra sesión (otro PC), no la propia.
  select l.token into v_tok2 from verificar_login('ensayo_sesion_a', '4321') l;
  update usuarios set password_hash = extensions.crypt('5678', extensions.gen_salt('bf')) where id = v_a;
  if not exists (select 1 from sesiones where token_hash = hash_token(v_tok)) then
    raise exception 'ENSAYO FALLÓ (7): cambiar la clave cerró la sesión propia.';
  end if;
  if exists (select 1 from sesiones where token_hash = hash_token(v_tok2)) then
    raise exception 'ENSAYO FALLÓ (7): cambiar la clave no cerró la otra sesión.';
  end if;
  v_n := v_n + 1;

  -- 8. Desactivar: la credencial deja de servir.
  update usuarios set activo = false where id = v_a;
  perform set_config('request.path', '/rpc/listar_lineas', true);
  begin
    perform revisar_peticion();
    raise exception 'ENSAYO FALLÓ (8): una persona desactivada siguió entrando.';
  exception when invalid_authorization_specification then
    null;
  end;
  v_n := v_n + 1;

  -- 9. Salir borra la sesión.
  select l.token into v_tok2 from verificar_login('ensayo_sesion_b', '4321') l;
  perform set_config('request.headers', json_build_object('x-sesion', v_tok2)::text, true);
  perform cerrar_sesion();
  if exists (select 1 from sesiones where token_hash = hash_token(v_tok2)) then
    raise exception 'ENSAYO FALLÓ (9): cerrar_sesion no borró la sesión.';
  end if;
  v_n := v_n + 1;

  -- 10. Todas las funciones con usuario quedaron con el control.
  select string_agg(c.funcion || ' (' || c.resultado || ')', ', ') into v_revisar
  from asegurar_control_usuario() c;
  select count(*) into v_con_control
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc like '%exigir_usuario(%' and p.proname <> 'exigir_usuario';
  if v_con_control < 50 then
    raise exception 'ENSAYO FALLÓ (10): solo % funciones quedaron con el control.', v_con_control;
  end if;
  v_n := v_n + 1;

  raise exception 'ENSAYO OK: la migración 20261109690000 funciona (% chequeos, % funciones con control). Para revisar a mano: %. No quedó nada aplicado.',
    v_n, v_con_control, coalesce(v_revisar, 'ninguna');
end;
$$;

rollback;
