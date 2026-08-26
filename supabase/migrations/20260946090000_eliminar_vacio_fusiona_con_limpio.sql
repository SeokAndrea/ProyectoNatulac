-- ============================================================
-- ELIMINAR "VACÍO" — SE FUSIONA CON "LIMPIO"
-- ============================================================
-- El usuario señaló que, en la práctica, Vacío y Limpio son el mismo
-- estado real de un tanque (nada adentro, disponible para preparar) —
-- tener las dos condiciones por separado no aporta nada y confunde.
-- Se fusiona todo en LIMPIO:
--   - Los tanques que ya estaban VACIO pasan a LIMPIO (dato existente).
--   - El constraint de condicion ya no acepta 'VACIO'.
--   - iniciar_turno() arranca los 3 tanques de un área nueva en LIMPIO
--     en vez de VACIO.
-- El caso "se vació solo" (un lote llega a 0 L) sigue yendo a SUCIO (o
-- STANDBY si queda un resto) — eso no cambia, nunca fue a VACIO.
-- ============================================================

update recepcion_tanques set condicion = 'LIMPIO' where condicion = 'VACIO';

alter table recepcion_tanques drop constraint recepcion_tanques_condicion_check;
alter table recepcion_tanques add constraint recepcion_tanques_condicion_check
  check (condicion in ('LISTO', 'SUCIO', 'EN_PREPARACION', 'STANDBY', 'CIP', 'LIMPIO'));

create or replace function iniciar_turno(
  p_usuario text,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
  p_fecha date,
  p_hora_inicio time
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
  v_area_id uuid;
  v_turno_tipo_id uuid;
  v_grupo_id uuid;
  v_turno_id uuid;
  v_codigo text;
  v_turno_anterior_id uuid;
  v_i integer;
begin
  select id into v_supervisor_id from usuarios where usuario = lower(p_usuario);
  if v_supervisor_id is null then
    raise exception 'Usuario % no existe', p_usuario;
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  select id into v_turno_tipo_id from turno_tipos where codigo = p_turno_tipo_codigo;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;

  v_codigo := left(p_area_codigo, 1) || to_char(p_fecha, 'YYYYMMDD') || '_T' || replace(p_turno_tipo_codigo, 'TURNO_', '') || 'G' || replace(p_grupo_codigo, 'GRUPO_', '');

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  values (v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, p_fecha, p_hora_inicio)
  returning id into v_turno_id;

  select t2.id into v_turno_anterior_id
  from turnos t2
  where t2.area_id = v_area_id and t2.id <> v_turno_id
  order by t2.fecha desc, t2.hora_inicio desc, t2.created_at desc
  limit 1;

  if v_turno_anterior_id is not null then
    insert into turno_lineas (
      turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por,
      pausada_en, lote_terminado_en
    )
    select v_turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, true, activada_en, activada_por,
      pausada_en, lote_terminado_en
    from turno_lineas
    where turno_id = v_turno_anterior_id and activa;

    insert into recepcion_tanques (
      turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por,
      cip_iniciado_en, cip_finalizado_en
    )
    select v_turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por,
      cip_iniciado_en, cip_finalizado_en
    from recepcion_tanques
    where turno_id = v_turno_anterior_id;

    insert into lineas_estado (turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, actualizada_por)
    select v_turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, actualizada_por
    from lineas_estado
    where turno_id = v_turno_anterior_id;
  else
    for v_i in 1..3 loop
      insert into recepcion_tanques (turno_id, numero_tanque, condicion)
      values (v_turno_id, v_i, 'LIMPIO');
    end loop;

    insert into lineas_estado (turno_id, linea_id)
    select v_turno_id, id from lineas where area_id = v_area_id and activo;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function iniciar_turno(text, text, text, text, date, time) to anon, authenticated;
