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
