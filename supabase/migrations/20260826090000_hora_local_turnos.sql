-- ============================================================
-- FECHA/HORA LOCAL en turnos (no la del servidor)
-- ============================================================
-- iniciar_turno() y finalizar_turno() dejaban que Postgres pusiera
-- fecha/hora con sus valores por defecto (current_date/current_time),
-- que corren en el reloj del SERVIDOR de Supabase (UTC) — no en la
-- hora local de la planta. Resultado: un turno iniciado a las 10:18
-- quedaba guardado como ~14:18 (el desfase de zona horaria).
--
-- Fix: el frontend ahora manda su propia fecha/hora local (calculada
-- con new Date() en el navegador) como parámetro, y estas funciones
-- la usan tal cual en vez de current_date/current_time.
-- ============================================================

drop function if exists iniciar_turno(text, text, text, text, jsonb, jsonb);
drop function if exists finalizar_turno(uuid);

create or replace function iniciar_turno(
  p_usuario text,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
  p_lineas jsonb,
  p_tanques jsonb,
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
  v_linea jsonb;
  v_tanque jsonb;
begin
  select id into v_supervisor_id from usuarios where usuario = lower(p_usuario);
  if v_supervisor_id is null then
    raise exception 'Usuario % no existe', p_usuario;
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  select id into v_turno_tipo_id from turno_tipos where codigo = p_turno_tipo_codigo;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;

  v_codigo := 'T-' || to_char(p_fecha, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  values (v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, p_fecha, p_hora_inicio)
  returning id into v_turno_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    insert into turno_lineas (turno_id, linea_id, presentacion_id, envases_hora, litros_hora)
    select v_turno_id, l.id, p.id, (v_linea ->> 'envases_hora')::integer, (v_linea ->> 'litros_hora')::numeric
    from lineas l
    left join presentaciones p on p.volumen_ml = (v_linea ->> 'presentacion_volumen_ml')::integer
    where l.codigo = v_linea ->> 'linea_codigo';
  end loop;

  for v_tanque in select * from jsonb_array_elements(p_tanques)
  loop
    insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote)
    values (
      v_turno_id,
      (v_tanque ->> 'numero_tanque')::smallint,
      nullif(v_tanque ->> 'sabor_id', '')::uuid,
      v_tanque ->> 'condicion',
      nullif(v_tanque ->> 'volumen_l', '')::numeric,
      nullif(v_tanque ->> 'lote', '')
    );
  end loop;

  return turno_activo_de(p_usuario);
end;
$$;

create or replace function finalizar_turno(p_turno_id uuid, p_fecha_fin date, p_hora_fin time)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update turnos
  set estado = 'CERRADO', fecha_fin = p_fecha_fin, hora_fin = p_hora_fin
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;

grant execute on function iniciar_turno(text, text, text, text, jsonb, jsonb, date, time) to anon, authenticated;
grant execute on function finalizar_turno(uuid, date, time) to anon, authenticated;
