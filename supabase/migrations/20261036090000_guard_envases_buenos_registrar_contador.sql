-- ============================================================
-- registrar_contador: guard de servidor para el Contador 2 (envases buenos)
-- ============================================================
-- Fase 2, §2.6 (pendiente). El Contador 2 ya es obligatorio y no puede
-- superar la llenadora en el frontend (ProductoTerminado.tsx, desde
-- `aa8a9ea`/`8fdcf42`) pero la RPC lo dejaba pasar igual: cualquier otro
-- llamador (script, otra pantalla futura) podía escribir un contador sin
-- Contador 2, o con Contador 2 > llenadora, y la corroboración de
-- "PT que excede el volumen preparado" (realidadPreparacion.ts) quedaba
-- sin el dato o con un dato imposible.
--
-- `create or replace` — misma firma, sin cambio de llamadores.
-- No hace falta re-otorgar el GRANT: Postgres lo conserva al reemplazar
-- una función con la misma firma.
-- ============================================================

create or replace function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_justificacion text,
  p_usuario text,
  p_parcial boolean default false,
  p_pagina text default null,
  p_envases_buenos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_usuario_id uuid;
begin
  if p_envases_buenos is null then
    raise exception 'El Contador 2 (envases buenos) es obligatorio.';
  end if;
  if p_envases_buenos < 0 or p_envases_buenos > p_envases_llenadora then
    raise exception 'El Contador 2 (envases buenos = %) no puede ser negativo ni superar el contador de la llenadora (%).',
      p_envases_buenos, p_envases_llenadora;
  end if;

  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, envases_buenos, justificacion, usuario_id, parcial)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, p_envases_buenos, nullif(p_justificacion, ''), v_usuario_id, coalesce(p_parcial, false));

  if not coalesce(p_parcial, false) then
    perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  end if;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'contador', p_turno_linea_id::text, p_pagina,
    format('Contador %s: %s envases%s%s', p_linea_codigo, p_envases_llenadora,
           case when p_envases_buenos is not null then format(' (%s buenos)', p_envases_buenos) else '' end,
           case when coalesce(p_parcial, false) then ' (parcial)' else '' end),
    null,
    jsonb_build_object('envases_llenadora', p_envases_llenadora, 'envases_buenos', p_envases_buenos, 'parcial', coalesce(p_parcial, false),
                       'justificacion', nullif(p_justificacion, ''))
  );

  return turno_json(p_turno_id);
end;
$$;
