-- ============================================================
-- Corregir el contador de una corrida cerrada: REEMPLAZA, no suma
-- ============================================================
-- Dueña, 2026-10-15: en Producto Terminado → corridas cerradas → "Editar
-- un error", el contador se cargaba con registrar_contador(), que SUMA una
-- lectura nueva. Corregir un contador mal cargado lo hacía crecer (15 mil
-- pasó a 33 mil). Ahora la corrección manda el TOTAL de la corrida: se
-- borran sus cargas y queda una sola con ese total.
--
-- Mismas reglas que registrar_contador(): turno abierto, gracia, el
-- responsable hasta 24 h después del cierre, o modo corrección
-- (exigir_turno_escribible con p_solo_datos = true). Contador 2
-- obligatorio y no mayor que la llenadora. Total 0 = la corrida queda sin
-- contador.
-- ============================================================

create or replace function corregir_contador_corrida(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_envases_buenos integer,
  p_justificacion text,
  p_usuario text,
  p_pagina text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_usuario_id uuid;
  v_llenadora_prev integer;
  v_buenos_prev integer;
  v_filas_prev integer;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, true);
  if p_envases_llenadora is null or p_envases_llenadora < 0 then
    raise exception 'El contador de la llenadora no puede ser negativo.';
  end if;
  if p_envases_buenos is null then
    raise exception 'El Contador 2 (envases buenos) es obligatorio.';
  end if;
  if p_envases_buenos < 0 or p_envases_buenos > p_envases_llenadora then
    raise exception 'El Contador 2 (envases buenos = %) no puede ser negativo ni superar el contador de la llenadora (%).',
      p_envases_buenos, p_envases_llenadora;
  end if;
  if not exists (select 1 from turno_lineas where id = p_turno_linea_id and turno_id = p_turno_id) then
    raise exception 'No se encontró la corrida en este turno.';
  end if;

  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select coalesce(sum(envases_llenadora), 0), coalesce(sum(envases_buenos), 0), count(*)
  into v_llenadora_prev, v_buenos_prev, v_filas_prev
  from contadores
  where turno_id = p_turno_id and turno_linea_id = p_turno_linea_id;

  delete from contadores where turno_id = p_turno_id and turno_linea_id = p_turno_linea_id;

  if p_envases_llenadora > 0 then
    insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, envases_buenos, justificacion, usuario_id)
    values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, p_envases_buenos, nullif(trim(coalesce(p_justificacion, '')), ''), v_usuario_id);
  end if;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'contador', p_turno_linea_id::text, p_pagina,
    format('Corrigió el contador %s: %s → %s envases (%s buenos)', p_linea_codigo, v_llenadora_prev, p_envases_llenadora, p_envases_buenos),
    jsonb_build_object('envases_llenadora', v_llenadora_prev, 'envases_buenos', v_buenos_prev, 'cargas', v_filas_prev),
    jsonb_build_object('envases_llenadora', p_envases_llenadora, 'envases_buenos', p_envases_buenos,
                       'justificacion', nullif(trim(coalesce(p_justificacion, '')), ''))
  );

  return turno_json(p_turno_id);
end;
$$;
grant execute on function corregir_contador_corrida(uuid, uuid, text, integer, integer, text, text, text) to anon, authenticated;

select * from asegurar_control_usuario();
