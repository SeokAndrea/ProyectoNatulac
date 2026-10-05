-- ENSAYO (se puede borrar): aplica la migración 20261102 (auditoría de líneas, transferencias, ajustes, actas, responsables y primer ingreso) + chequeos y DESHACE todo.
-- Pegar entero en Supabase → SQL Editor → Run. SIEMPRE termina en error (a propósito, para deshacer todo):
--   'ENSAYO OK: ...'  => funciona, ya se puede hacer db push.
--   cualquier otro error => algo falla; no quedó nada aplicado.
-- Usa el último turno, una línea y una preparación que ya existan; crea un usuario de prueba dentro de la transacción.

begin;

-- ===================== MIGRACIÓN 20261102090000_auditoria_lineas_transferencias_actas.sql =====================
-- ============================================================
-- AUDITORÍA — huecos que quedaban sin registro
-- ============================================================
-- Revisión 2026-10-05: estas acciones cambiaban datos sin dejar nada
-- (o solo una parte) en `auditoria`:
--
--   lineas_estado        cambiar_condicion_linea, detener_linea_por_falla
--                        (el motivo), continuar_linea, terminar_cip,
--                        iniciar_turno
--   transferencias       transferir_tanque (origen, destino, litros, motivo)
--   preparaciones_ajuste cambiar_condicion_tanque, capturar_resto_origen_
--                        transferencia (volumen teórico / real / diferencia)
--   actas                registrar_acta (versión, código)
--   turno_responsables   iniciar_turno y relevos (quién quedó a cargo)
--   usuarios             completar_primer_ingreso (la persona activa su cuenta)
--
-- Las cinco tablas pasan a tener el trigger genérico auditar_cambio(),
-- igual que el resto del ciclo de turno. Se re-emite auditar_cambio()
-- (última versión: 20261051) para sumar `generado_por` como autor
-- (actas) y un resumen legible de cada tabla nueva. usuarios NO lleva
-- trigger (ya tiene registro explícito en sus RPC): completar_primer_
-- ingreso pasa a llamar a registrar_auditoria().
-- ============================================================

create or replace function auditar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_usuario_id uuid;
  v_usuario text;
  v_accion text := case tg_op when 'INSERT' then 'CREAR' when 'UPDATE' then 'EDITAR' else 'ELIMINAR' end;
  v_resumen text;
  v_antes jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
  v_k text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  v_usuario_id := coalesce(
    v_row->>'actualizada_por',
    v_row->>'usuario_id',
    v_row->>'activada_por',
    v_row->>'supervisor_id',
    v_row->>'editado_por',
    v_row->>'confirmado_inicio_por',
    v_row->>'confirmado_fin_por',
    v_row->>'generado_por'
  )::uuid;
  select usuario into v_usuario from usuarios where id = v_usuario_id;

  -- Sólo columnas legibles: se descartan ids (*_id), autores (*_por),
  -- timestamps de estado (*_en) y blobs internos.
  for v_k in select jsonb_object_keys(v_row) loop
    if v_k in ('id', 'created_at', 'updated_at', 'volumenes_lote_cierre', 'tanques_encontrados')
       or v_k ~ '_(id|por|en)$' then
      continue;
    end if;

    if tg_op = 'UPDATE' then
      if v_new->v_k is distinct from v_old->v_k then
        v_antes := v_antes || jsonb_build_object(v_k, v_old->v_k);
        v_despues := v_despues || jsonb_build_object(v_k, v_new->v_k);
      end if;
    elsif tg_op = 'INSERT' then
      v_despues := v_despues || jsonb_build_object(v_k, v_new->v_k);
    else
      v_antes := v_antes || jsonb_build_object(v_k, v_old->v_k);
    end if;
  end loop;

  -- UPDATE que sólo tocó columnas de ruido → no se audita.
  if tg_op = 'UPDATE' and v_despues = '{}'::jsonb then
    return null;
  end if;

  v_resumen := case tg_table_name
    when 'turnos' then 'Turno ' || coalesce(v_row->>'codigo', '')
    when 'turno_lineas' then 'Corrida de línea'
    when 'recepcion_tanques' then 'Tanque ' || coalesce(v_row->>'numero_tanque', '?')
      || ' → ' || coalesce(v_row->>'condicion', '?')
    when 'preparaciones' then 'Preparación · tanque ' || coalesce(v_row->>'numero_tanque', '?')
      || coalesce(' · lote ' || (v_row->>'lote'), '')
    when 'reservas_tobos' then 'Desvase / reserva'
    when 'velocidades_llenadora' then 'Catálogo · velocidad de llenadora'
    when 'sabores' then 'Catálogo · sabor ' || coalesce(v_row->>'nombre', '')
    when 'presentaciones' then 'Catálogo · presentación ' || coalesce(v_row->>'volumen_ml', '') || ' ml'
    when 'lineas' then 'Catálogo · línea ' || coalesce(v_row->>'codigo', '')
    when 'familias_producto' then 'Catálogo · familia ' || coalesce(v_row->>'nombre', '')
    when 'tipos_bobina' then 'Catálogo · tipo de bobina ' || coalesce(v_row->>'nombre', '')
    when 'formula_variantes' then 'Catálogo · fórmula ' || coalesce(v_row->>'nombre', '')
    when 'formula_insumos' then 'Catálogo · insumo de fórmula ' || coalesce(v_row->>'insumo', '')
    when 'tipos_conteo_peso' then 'Catálogo · tipo de conteo por peso ' || coalesce(v_row->>'nombre', '')
    when 'lineas_estado' then 'Condición de '
      || coalesce((select nombre from lineas where id = (v_row->>'linea_id')::uuid), 'línea')
      || ' → ' || coalesce(v_row->>'condicion', '?')
    when 'transferencias' then 'Transferencia · tanque ' || coalesce(v_row->>'tanque_origen', '?')
      || ' → ' || coalesce(v_row->>'tanque_destino', '?')
      || ' · ' || coalesce(v_row->>'litros', '?') || ' L'
    when 'preparaciones_ajuste' then 'Ajuste de volumen'
      || coalesce(' · tanque ' || (select numero_tanque::text from preparaciones where id = (v_row->>'lote_id')::uuid), '')
      || coalesce(' · lote ' || (select lote from preparaciones where id = (v_row->>'lote_id')::uuid), '')
      || coalesce(' · diferencia ' || (v_row->>'diferencia') || ' L', '')
    when 'actas' then 'Acta ' || coalesce(v_row->>'codigo', '') || ' v' || coalesce(v_row->>'version', '?')
      || ' · ' || coalesce(v_row->>'estado', '')
    when 'turno_responsables' then 'Responsable del turno · '
      || coalesce((select nombre from usuarios where id = (v_row->>'usuario_id')::uuid), '?')
      || ' (' || coalesce(v_row->>'motivo', '?') || ')'
    else tg_table_name
  end;

  insert into auditoria (usuario_id, usuario, accion, entidad, entidad_id, pagina, resumen, antes, despues)
  values (
    v_usuario_id,
    v_usuario,
    v_accion,
    tg_table_name,
    v_row->>'id',
    nullif(current_setting('app.audit_pagina', true), ''),
    v_resumen,
    case when v_antes = '{}'::jsonb then null else v_antes end,
    case when v_despues = '{}'::jsonb then null else v_despues end
  );

  return null;
end;
$$;

-- ------------------------------------------------------------
-- Triggers en las tablas que faltaban.
-- ------------------------------------------------------------
drop trigger if exists auditar_lineas_estado on lineas_estado;
create trigger auditar_lineas_estado after insert or update or delete on lineas_estado
  for each row execute function auditar_cambio();

drop trigger if exists auditar_transferencias on transferencias;
create trigger auditar_transferencias after insert or update or delete on transferencias
  for each row execute function auditar_cambio();

drop trigger if exists auditar_preparaciones_ajuste on preparaciones_ajuste;
create trigger auditar_preparaciones_ajuste after insert or update or delete on preparaciones_ajuste
  for each row execute function auditar_cambio();

drop trigger if exists auditar_actas on actas;
create trigger auditar_actas after insert or update or delete on actas
  for each row execute function auditar_cambio();

drop trigger if exists auditar_turno_responsables on turno_responsables;
create trigger auditar_turno_responsables after insert or update or delete on turno_responsables
  for each row execute function auditar_cambio();

-- ------------------------------------------------------------
-- completar_primer_ingreso: igual que 20260978 + registro en auditoría
-- (sin la clave, obviamente).
-- ------------------------------------------------------------
create or replace function completar_primer_ingreso(
  p_usuario text,
  p_password_actual text,
  p_password_nueva text,
  p_nombre text,
  p_cedula text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre_antes text;
  v_cedula_antes text;
begin
  select id, nombre, cedula into v_id, v_nombre_antes, v_cedula_antes
  from usuarios
  where usuario = lower(p_usuario)
    and password_hash = extensions.crypt(p_password_actual, password_hash)
    and activo = true;

  if v_id is null then
    raise exception 'La contraseña actual no es correcta.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre y apellido.';
  end if;

  if p_cedula !~ '^\d{1,2}\.\d{3}\.\d{3}$' then
    raise exception 'La cédula debe tener el formato XX.XXX.XXX o X.XXX.XXX.';
  end if;

  if p_password_nueva !~ '^\d{4}$' then
    raise exception 'La contraseña nueva debe ser de 4 dígitos.';
  end if;

  if p_password_nueva = '1234' then
    raise exception 'La contraseña nueva no puede ser 1234.';
  end if;

  update usuarios
  set nombre = trim(p_nombre),
      cedula = p_cedula,
      password_hash = extensions.crypt(p_password_nueva, extensions.gen_salt('bf')),
      debe_completar_perfil = false
  where id = v_id;

  perform registrar_auditoria(
    p_usuario, 'PRIMER_INGRESO', 'personal', v_id::text, 'Primer ingreso',
    format('%s completó su primer ingreso (datos y clave nueva)', trim(p_nombre)),
    jsonb_build_object('nombre', v_nombre_antes, 'cedula', v_cedula_antes),
    jsonb_build_object('nombre', trim(p_nombre), 'cedula', p_cedula)
  );
end;
$$;

grant execute on function completar_primer_ingreso(text, text, text, text, text) to anon, authenticated;

-- ===================== CHEQUEOS =====================
do $$
declare
  v_n int := 0;
  v_u uuid;
  v_t uuid;
  v_linea uuid;
  v_prep uuid;
  v_id uuid;
  v_antes int;
  v_resumen text;
  v_usuario text;
  v_tabla text;
begin
  -- 1. Los cinco triggers existen.
  foreach v_tabla in array array['lineas_estado', 'transferencias', 'preparaciones_ajuste', 'actas', 'turno_responsables'] loop
    if not exists (
      select 1 from pg_trigger
      where tgrelid = v_tabla::regclass and tgname = 'auditar_' || v_tabla and not tgisinternal
    ) then
      raise exception 'ENSAYO FALLÓ (1): falta el trigger auditar_% .', v_tabla;
    end if;
  end loop;
  v_n := v_n + 1;

  -- Datos de prueba: un usuario nuevo + un turno, una línea y una preparación cualquiera ya existentes.
  insert into usuarios (usuario, password_hash, nombre, debe_completar_perfil)
  values ('ens_aud', extensions.crypt('1234', extensions.gen_salt('bf')), 'Ensayo Auditoría', true)
  returning id into v_u;
  select id into v_t from turnos order by fecha desc limit 1;
  select id into v_linea from lineas limit 1;
  select id into v_prep from preparaciones limit 1;
  if v_t is null or v_linea is null or v_prep is null then
    raise exception 'ENSAYO FALLÓ (0): no hay turno, línea o preparación para probar.';
  end if;

  -- 2. lineas_estado: cambio de condición queda con resumen y autor.
  select count(*) into v_antes from auditoria where entidad = 'lineas_estado';
  insert into lineas_estado (turno_id, linea_id, condicion, actualizada_por, observacion)
  values (v_t, v_linea, 'CIP', v_u, 'ensayo')
  on conflict (turno_id, linea_id) do update set condicion = 'CIP', actualizada_por = v_u, observacion = 'ensayo';
  select resumen, usuario into v_resumen, v_usuario from auditoria
  where entidad = 'lineas_estado' order by ocurrido_en desc, id desc limit 1;
  if (select count(*) from auditoria where entidad = 'lineas_estado') <> v_antes + 1
     or v_resumen not like 'Condición de % → CIP' or v_usuario is distinct from 'ens_aud' then
    raise exception 'ENSAYO FALLÓ (2): lineas_estado no quedó bien auditada (resumen=%, usuario=%).', v_resumen, v_usuario;
  end if;
  v_n := v_n + 1;

  -- 3. transferencias
  insert into transferencias (turno_id, tanque_origen, tanque_destino, litros, motivo, usuario_id)
  values (v_t, 1, 2, 150, 'CONSOLIDAR_RESTOS', v_u) returning id into v_id;
  select resumen into v_resumen from auditoria where entidad = 'transferencias' and entidad_id = v_id::text;
  if v_resumen is distinct from 'Transferencia · tanque 1 → 2 · 150.00 L' then
    raise exception 'ENSAYO FALLÓ (3): transferencia sin auditar o resumen raro (%).', v_resumen;
  end if;
  v_n := v_n + 1;

  -- 4. preparaciones_ajuste
  insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
  values (v_prep, v_t, 1000, 980, -20, v_u) returning id into v_id;
  select resumen into v_resumen from auditoria where entidad = 'preparaciones_ajuste' and entidad_id = v_id::text;
  if v_resumen is null or v_resumen not like 'Ajuste de volumen%diferencia -20 L' then
    raise exception 'ENSAYO FALLÓ (4): ajuste de volumen sin auditar o resumen raro (%).', v_resumen;
  end if;
  v_n := v_n + 1;

  -- 5. actas: el autor sale de generado_por.
  insert into actas (turno_id, version, codigo, storage_path, generado_por)
  values (v_t, 9999, 'ENS-ACTA', 'ensayo/x.pdf', v_u) returning id into v_id;
  select resumen, usuario into v_resumen, v_usuario from auditoria where entidad = 'actas' and entidad_id = v_id::text;
  if v_resumen is distinct from 'Acta ENS-ACTA v9999 · VIGENTE' or v_usuario is distinct from 'ens_aud' then
    raise exception 'ENSAYO FALLÓ (5): acta sin auditar o sin autor (resumen=%, usuario=%).', v_resumen, v_usuario;
  end if;
  v_n := v_n + 1;

  -- 6. turno_responsables
  insert into turno_responsables (turno_id, usuario_id, motivo) values (v_t, v_u, 'RELEVO') returning id into v_id;
  select resumen into v_resumen from auditoria where entidad = 'turno_responsables' and entidad_id = v_id::text;
  if v_resumen is distinct from 'Responsable del turno · Ensayo Auditoría (RELEVO)' then
    raise exception 'ENSAYO FALLÓ (6): responsable sin auditar o resumen raro (%).', v_resumen;
  end if;
  v_n := v_n + 1;

  -- 7. completar_primer_ingreso deja registro, sin la clave.
  perform completar_primer_ingreso('ens_aud', '1234', '5678', 'Ensayo Auditoría Listo', '12.345.678');
  if not exists (
    select 1 from auditoria
    where entidad = 'personal' and accion = 'PRIMER_INGRESO' and entidad_id = v_u::text
      and despues->>'cedula' = '12.345.678' and not (despues ? 'password_hash')
  ) then
    raise exception 'ENSAYO FALLÓ (7): el primer ingreso no quedó en auditoría.';
  end if;
  if (select debe_completar_perfil from usuarios where id = v_u) then
    raise exception 'ENSAYO FALLÓ (7b): completar_primer_ingreso ya no apaga el flag.';
  end if;
  v_n := v_n + 1;

  -- 8. Las tablas de antes siguen auditándose (no se rompió auditar_cambio).
  select count(*) into v_antes from auditoria where entidad = 'turnos';
  update turnos set velocidad_llenadora = coalesce(velocidad_llenadora, 0) + 1 where id = v_t;
  if (select count(*) from auditoria where entidad = 'turnos') <> v_antes + 1 then
    raise exception 'ENSAYO FALLÓ (8): turnos dejó de auditarse.';
  end if;
  v_n := v_n + 1;

  raise exception 'ENSAYO OK: la migración 20261102 funciona (% chequeos). No quedó nada aplicado.', v_n;
end;
$$;

rollback;
