-- ============================================================
-- AUDITORÍA UNIVERSAL — resto del esquema por TRIGGERS (FASE 4)
-- ============================================================
-- El ciclo de turno (comenzar, status, preparación, líneas, liberar,
-- transferir, finalizar, reabrir...) toca ~25 RPC distintas, muchas de
-- 100+ líneas. En vez de re-emitir cada una, se audita a nivel TABLA
-- con un trigger genérico: cada INSERT/UPDATE/DELETE de las tablas del
-- ciclo de turno y de los catálogos deja una fila en `auditoria` con
-- quién (la columna de autor de la fila), qué acción y los valores
-- antes/después.
--
-- Las tablas ya cubiertas por registro EXPLÍCITO en sus RPC (usuarios,
-- programacion_dia, producto_terminado, contadores) NO llevan trigger,
-- para no duplicar.
--
-- `pagina` queda null acá (el trigger no sabe desde qué pantalla se
-- hizo); si algún RPC llama a set_config('app.audit_pagina', ...) el
-- trigger la toma.
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
  -- UPDATE que no cambió nada de verdad → no se audita.
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  -- Quién: la primera columna "de autor" que tenga la fila.
  v_usuario_id := coalesce(
    v_row->>'actualizada_por',
    v_row->>'usuario_id',
    v_row->>'activada_por',
    v_row->>'supervisor_id',
    v_row->>'editado_por',
    v_row->>'confirmado_inicio_por',
    v_row->>'confirmado_fin_por'
  )::uuid;
  select usuario into v_usuario from usuarios where id = v_usuario_id;

  -- antes/después: en UPDATE solo las claves que cambiaron; en
  -- INSERT/DELETE la fila entera (sin claves de ruido).
  if tg_op = 'UPDATE' then
    for v_k in select jsonb_object_keys(v_new) loop
      if v_k not in ('updated_at', 'created_at') and (v_new->v_k is distinct from v_old->v_k) then
        v_antes := v_antes || jsonb_build_object(v_k, v_old->v_k);
        v_despues := v_despues || jsonb_build_object(v_k, v_new->v_k);
      end if;
    end loop;
  else
    v_antes := coalesce(v_old, '{}'::jsonb) - 'id' - 'created_at' - 'updated_at';
    v_despues := coalesce(v_new, '{}'::jsonb) - 'id' - 'created_at' - 'updated_at';
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
-- Triggers: ciclo de turno + catálogos. (NO: usuarios, programacion_dia,
-- producto_terminado, contadores, producto_terminado_parciales — ya
-- tienen registro explícito; ni auditoria, obviamente.)
-- ------------------------------------------------------------
create trigger auditar_turnos            after insert or update or delete on turnos            for each row execute function auditar_cambio();
create trigger auditar_turno_lineas      after insert or update or delete on turno_lineas      for each row execute function auditar_cambio();
create trigger auditar_recepcion_tanques after insert or update or delete on recepcion_tanques for each row execute function auditar_cambio();
create trigger auditar_preparaciones     after insert or update or delete on preparaciones     for each row execute function auditar_cambio();
create trigger auditar_reservas_tobos    after insert or update or delete on reservas_tobos    for each row execute function auditar_cambio();
create trigger auditar_velocidades       after insert or update or delete on velocidades_llenadora for each row execute function auditar_cambio();
create trigger auditar_sabores           after insert or update or delete on sabores           for each row execute function auditar_cambio();
create trigger auditar_presentaciones    after insert or update or delete on presentaciones    for each row execute function auditar_cambio();
create trigger auditar_lineas            after insert or update or delete on lineas            for each row execute function auditar_cambio();
create trigger auditar_familias_producto after insert or update or delete on familias_producto for each row execute function auditar_cambio();
