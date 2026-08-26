-- ============================================================
-- CÓDIGO DE TURNO LEGIBLE: {A}AAAAMMDD_T{turno}G{grupo}
-- ============================================================
-- El código venía como "T-YYYYMMDD-XXXX" con un sufijo aleatorio (solo
-- para garantizar unicidad) — no decía nada de qué turno/grupo era.
-- Pasa a ser "A20260825_T3G2": inicial del área + fecha + turno +
-- grupo, todo legible de un vistazo (Aséptico, turno 3, grupo 2, del
-- 25 de agosto de 2026). Las iniciales de las 5 áreas de hoy
-- (Aseptico/Vacio/Servicios_Industriales/Mantenimiento/Pruebas) no se
-- pisan entre sí (A/V/S/M/P).
--
-- Aun así, "codigo" deja la restricción unique: dos turnos del MISMO
-- área/fecha/turno/grupo (ej. se cierra uno por error y se abre otro
-- igual el mismo día) seguirían compartiendo código, y eso es un caso
-- real, no un capricho. No es un problema: en todo el proyecto se
-- opera siempre por turnos.id (uuid) — codigo es solo para mostrar.
-- ============================================================

alter table turnos drop constraint turnos_codigo_key;

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
      turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por
    )
    select v_turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por
    from recepcion_tanques
    where turno_id = v_turno_anterior_id;
  else
    for v_i in 1..3 loop
      insert into recepcion_tanques (turno_id, numero_tanque, condicion)
      values (v_turno_id, v_i, 'VACIO');
    end loop;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function iniciar_turno(text, text, text, text, date, time) to anon, authenticated;
