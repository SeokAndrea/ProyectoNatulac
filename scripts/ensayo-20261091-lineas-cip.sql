-- ENSAYO (se puede borrar): aplica la migración 20261091 (Líneas: CIP con motivo y el lote que sigue, continuar un lote detenido) + chequeos y DESHACE todo.
-- REQUIERE la migración 20261090 (Paradas) ya aplicada con db push: usa anotar_parada y completar_parada.
-- Pegar entero en Supabase → SQL Editor → Run. SIEMPRE termina en error (a propósito, para deshacer todo):
--   'ENSAYO OK: ...'  => funciona, ya se puede hacer db push.
--   cualquier otro error => algo falla; no quedó nada aplicado.
-- Crea datos de prueba en el Área de Pruebas (usuario, turno, tanque, corrida) dentro de la transacción.

begin;

-- ===================== MIGRACIÓN 20261091090000_lineas_cip_y_continuar_lote.sql =====================
-- ============================================================
-- LÍNEAS: CIP con motivo (y el lote puede seguir) + continuar un lote detenido
-- ============================================================
-- plan-lineas-pt-paradas.md, paso 3, parte 1 (dueño, 2026-09-30).
--
-- Caso real: una línea detenida con "Detener línea" queda Esperando PT y
-- no hay forma de seguir con el MISMO lote (cargar el PT la cierra, y
-- activar_linea rechaza repetir línea + lote en el mismo turno). Si se fue
-- la luz, el lote tiene que poder continuar.
--
--   * continuar_corrida_detenida(): vuelve a poner en marcha la MISMA
--     corrida Esperando PT, sin cargar PT a mitad del lote. Solo si no
--     tiene Contador ni PT, el tanque de su lote sigue Listo y la línea no
--     corre otra cosa.
--   * poner_linea_en_cip(): CIP con motivo (Falla en Suministro Eléctrico,
--     36 h de trabajo, Falla mecánica prolongada) y descripción opcional.
--     Con una corrida corriendo pregunta si el lote sigue: si sigue, la
--     corrida queda en PAUSA (activa, sin PT); si no, queda Esperando PT.
--     En la misma transacción suma el +1 en Paradas (anotar_parada,
--     20261090) y deja la parada ligada a la línea.
--   * terminar_cip(): no deja terminar el CIP mientras su parada esté sin
--     completar. Si el lote seguía, la corrida en pausa continúa.
--   * paradas_que_detienen_lineas(): para que Líneas sepa qué parada falta
--     completar y lleve a ella.
-- ============================================================

-- La parada (+1) que tiene detenida a la línea: hasta completarla no se termina el CIP.
alter table lineas_estado add column parada_id uuid references paradas (id) on delete set null;

-- ------------------------------------------------------------
-- 1. Continuar un lote detenido
-- ------------------------------------------------------------
create or replace function continuar_corrida_detenida(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_c turno_lineas;
  v_linea_nombre text;
  v_condicion text;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_c from turno_lineas where id = p_turno_linea_id and turno_id = p_turno_id for update;
  if not found or v_c.activa or v_c.finalizada_en is not null then
    raise exception 'Esa corrida no está detenida esperando su Producto Terminado.';
  end if;
  select nombre into v_linea_nombre from lineas where id = v_c.linea_id;

  if exists (select 1 from contadores where turno_linea_id = v_c.id)
     or exists (select 1 from producto_terminado where turno_linea_id = v_c.id) then
    raise exception 'Esta corrida ya tiene Contador o Producto Terminado cargado, así que no se puede continuar. Carga lo que falta para cerrarla.';
  end if;

  if exists (select 1 from turno_lineas where turno_id = p_turno_id and linea_id = v_c.linea_id and activa) then
    raise exception '% ya tiene otra corrida en marcha.', coalesce(v_linea_nombre, 'La línea');
  end if;

  select condicion into v_condicion from lineas_estado where turno_id = p_turno_id and linea_id = v_c.linea_id;
  if v_condicion = 'CIP' then
    raise exception '% está en CIP: termina el CIP antes de continuar el lote.', coalesce(v_linea_nombre, 'La línea');
  end if;

  if v_c.lote_id is not null and not exists (
    select 1
    from recepcion_tanques rt
    join preparaciones p on p.id = rt.lote_id
    where rt.turno_id = p_turno_id and rt.lote_id = v_c.lote_id and rt.condicion = 'LISTO' and p.cerrado_en is null
  ) then
    raise exception 'El tanque del Lote % ya no está Listo, así que el lote no puede continuar.', coalesce(v_c.lote, '?');
  end if;

  update turno_lineas
  set activa = true, pausada_en = null, pausa_motivo = null, actualizada_por = v_usuario_id
  where id = v_c.id;

  -- Detener línea la dejó "Parada" con su motivo: vuelve a estar corriendo.
  update lineas_estado
  set condicion = 'LISTA', activada_en = now(), observacion = null, parada_id = null, actualizada_por = v_usuario_id
  where turno_id = p_turno_id and linea_id = v_c.linea_id and condicion = 'DETENIDA';

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'turno_lineas', v_c.id::text, 'Líneas',
    format('Continuó el Lote %s en %s (sin cargar Producto Terminado)', coalesce(v_c.lote, '?'), coalesce(v_linea_nombre, '?')),
    jsonb_build_object('activa', false),
    jsonb_build_object('activa', true)
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function continuar_corrida_detenida(text, uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Poner la línea en CIP, con motivo
-- ------------------------------------------------------------
create or replace function poner_linea_en_cip(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_motivo text,
  p_descripcion text default null,
  p_turno_linea_id uuid default null,
  p_lote_sigue boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_linea_nombre text;
  v_tipo text;
  v_etiqueta text;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_c turno_lineas;
  v_parada_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id, nombre into v_linea_id, v_linea_nombre from lineas where codigo = p_linea_codigo;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;

  v_tipo := case p_motivo
    when 'SUMINISTRO_ELECTRICO' then 'FALLA_SUMINISTRO_ELECTRICO'
    when 'HORAS_36' then 'LIMPIEZA_INTERMEDIA'
    when 'FALLA_MECANICA' then 'FALLA_SIN_ESPECIFICAR'
  end;
  v_etiqueta := case p_motivo
    when 'SUMINISTRO_ELECTRICO' then 'Falla en Suministro Eléctrico'
    when 'HORAS_36' then '36 h de trabajo'
    when 'FALLA_MECANICA' then 'Falla mecánica prolongada'
  end;
  if v_tipo is null then
    raise exception 'Elige el motivo del CIP.';
  end if;

  if p_turno_linea_id is not null then
    select * into v_c from turno_lineas
    where id = p_turno_linea_id and turno_id = p_turno_id and linea_id = v_linea_id and activa
    for update;
    if not found then
      raise exception 'Esa corrida no está activa.';
    end if;
    if p_lote_sigue is null then
      raise exception 'Indica si el lote sigue después del CIP.';
    end if;
  else
    if exists (select 1 from turno_lineas where turno_id = p_turno_id and linea_id = v_linea_id and activa) then
      raise exception '% tiene una corrida activa: ponla en CIP desde esa corrida.', coalesce(v_linea_nombre, 'La línea');
    end if;
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and linea_id = v_linea_id and activa = false and finalizada_en is null
    ) then
      raise exception 'Hay una corrida detenida en % sin su Producto Terminado. Continúa el lote o carga su PT antes de ponerla en CIP.',
        coalesce(v_linea_nombre, 'la línea');
    end if;
  end if;

  -- El +1 primero: si ya hay uno igual sin completar en la línea, no se cambia nada.
  v_parada_id := anotar_parada(p_usuario, p_linea_codigo, v_tipo, null, null, v_desc, 'Líneas (CIP)');

  if p_turno_linea_id is not null then
    if p_lote_sigue then
      -- El lote sigue: la corrida queda en pausa (sigue activa, sin PT).
      update turno_lineas
      set pausada_en = coalesce(pausada_en, now()), pausa_motivo = 'CIP', actualizada_por = v_usuario_id
      where id = v_c.id;
    else
      -- El lote termina aquí: Esperando PT, como con Detener línea.
      update turno_lineas
      set activa = false, pausada_en = null, actualizada_por = v_usuario_id
      where id = v_c.id;
    end if;
  end if;

  insert into lineas_estado (turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, observacion, parada_id, actualizada_por)
  values (p_turno_id, v_linea_id, 'CIP', now(), now(), null, left(v_etiqueta || coalesce(' · ' || v_desc, ''), 140), v_parada_id, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = 'CIP',
        activada_en = excluded.activada_en,
        cip_iniciado_en = excluded.cip_iniciado_en,
        cip_finalizado_en = null,
        observacion = excluded.observacion,
        parada_id = excluded.parada_id,
        actualizada_por = excluded.actualizada_por;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function poner_linea_en_cip(text, uuid, text, text, text, uuid, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Terminar el CIP
-- ------------------------------------------------------------
create or replace function terminar_cip(p_usuario text, p_turno_id uuid, p_linea_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_le lineas_estado;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id into v_linea_id from lineas where codigo = p_linea_codigo;

  select * into v_le from lineas_estado where turno_id = p_turno_id and linea_id = v_linea_id for update;
  if not found or v_le.condicion <> 'CIP' then
    raise exception 'La línea no está en CIP.';
  end if;

  if v_le.parada_id is not null and exists (select 1 from paradas where id = v_le.parada_id and pendiente) then
    raise exception 'Completa la parada del CIP (tipo y minutos) en Registrar Paradas antes de terminarlo.';
  end if;

  update lineas_estado
  set condicion = 'LISTA', activada_en = now(), cip_finalizado_en = now(), observacion = null, parada_id = null,
      actualizada_por = v_usuario_id
  where id = v_le.id;

  -- Si el lote seguía después del CIP, la corrida en pausa continúa.
  update turno_lineas
  set pausada_en = null, pausa_motivo = null, actualizada_por = v_usuario_id
  where turno_id = p_turno_id and linea_id = v_linea_id and activa and pausada_en is not null;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function terminar_cip(text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Qué parada tiene detenida a cada línea (para ir a completarla)
-- ------------------------------------------------------------
create or replace function paradas_que_detienen_lineas(p_turno_id uuid)
returns table (linea_codigo text, parada_id uuid, pendiente boolean, tipo_nombre text)
language sql
security definer
set search_path = public
stable
as $$
  select l.codigo, p.id, p.pendiente, p.tipo_nombre
  from lineas_estado le
  join lineas l on l.id = le.linea_id
  join paradas p on p.id = le.parada_id
  where le.turno_id = p_turno_id;
$$;

grant execute on function paradas_que_detienen_lineas(uuid) to anon, authenticated;

-- ===================== CHEQUEOS (con datos de prueba en el Área de Pruebas; todo se deshace) =====================
do $$
declare
  v_pr uuid := (select id from areas where codigo = 'PRUEBAS');
  v_u uuid;
  v_t uuid;
  v_tipo text;
  v_linea uuid;
  v_linea_codigo text;
  v_sabor uuid := (select id from sabores limit 1);
  v_pres uuid := (select id from presentaciones limit 1);
  v_prep uuid;
  v_c uuid;
  v_le lineas_estado;
  v_tl turno_lineas;
  v_parada uuid;
  v_ok boolean;
  v_n integer := 0;
begin
  -- Preparación: un supervisor de Pruebas, su turno, un tanque Listo con su lote y una corrida.
  update turnos set estado = 'CERRADO' where area_id = v_pr and estado = 'ABIERTO';
  insert into usuarios (usuario, password_hash, nombre) values ('ens_cip', 'x', 'Supervisor Ensayo CIP');
  select id into v_u from usuarios where usuario = 'ens_cip';
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select v_u, r.id, v_pr from roles r where r.codigo = 'SUPERVISOR';

  v_tipo := (select tipo_codigo from turno_de_hora(now() at time zone 'America/Caracas'));
  v_t := abrir_turno(v_u, 'PRUEBAS', v_tipo, 'GRUPO_1', false);
  delete from turno_lineas where turno_id = v_t;

  select id, codigo into v_linea, v_linea_codigo from lineas where area_id = v_pr order by codigo limit 1;
  insert into lineas_estado (turno_id, linea_id, condicion) values (v_t, v_linea, 'LISTA')
  on conflict (turno_id, linea_id) do update set condicion = 'LISTA', observacion = null, parada_id = null;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l)
  values (v_t, 1, v_sabor, '9999', 0, v_u, 5000)
  returning id into v_prep;
  update recepcion_tanques
  set condicion = 'LISTO', sabor_id = v_sabor, lote = '9999', lote_id = v_prep, volumen_l = 5000
  where turno_id = v_t and numero_tanque = 1;
  if not found then
    insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id)
    values (v_t, 1, v_sabor, 'LISTO', 5000, '9999', v_prep);
  end if;

  insert into turno_lineas (turno_id, linea_id, presentacion_id, envases_hora, sabor_id, lote, lote_id, activa, activada_en,
                            confirmado_inicio_en)
  values (v_t, v_linea, v_pres, 9000, v_sabor, '9999', v_prep, true, now(), now())
  returning id into v_c;

  -- 1. Sin motivo no se pone en CIP.
  v_ok := false;
  begin
    perform poner_linea_en_cip('ens_cip', v_t, v_linea_codigo, null, null, v_c, true);
  exception when others then
    v_ok := sqlerrm like 'Elige el motivo del CIP%';
  end;
  if not v_ok then raise exception 'ENSAYO FALLÓ (1): puso en CIP sin motivo.'; end if;
  v_n := v_n + 1;

  -- 2. Con corrida hay que decir si el lote sigue.
  v_ok := false;
  begin
    perform poner_linea_en_cip('ens_cip', v_t, v_linea_codigo, 'SUMINISTRO_ELECTRICO', null, v_c, null);
  exception when others then
    v_ok := sqlerrm like '%lote sigue%';
  end;
  if not v_ok then raise exception 'ENSAYO FALLÓ (2): puso en CIP sin decir si el lote sigue.'; end if;
  v_n := v_n + 1;

  -- 3. CIP por falla eléctrica, el lote sigue: corrida en pausa (activa), línea en CIP y +1 pendiente ligado.
  perform poner_linea_en_cip('ens_cip', v_t, v_linea_codigo, 'SUMINISTRO_ELECTRICO', 'se fue la luz', v_c, true);
  select * into v_tl from turno_lineas where id = v_c;
  select * into v_le from lineas_estado where turno_id = v_t and linea_id = v_linea;
  if not v_tl.activa or v_tl.pausada_en is null or v_le.condicion <> 'CIP' or v_le.parada_id is null
     or not exists (select 1 from paradas p join paradas_tipos t on t.id = p.tipo_id
                    where p.id = v_le.parada_id and p.pendiente and t.codigo = 'FALLA_SUMINISTRO_ELECTRICO') then
    raise exception 'ENSAYO FALLÓ (3): el CIP con el lote que sigue no quedó bien (pausa, CIP y +1).';
  end if;
  if v_le.observacion not like 'Falla en Suministro Eléctrico%se fue la luz' then
    raise exception 'ENSAYO FALLÓ (3): el motivo y la descripción no quedaron en la línea.';
  end if;
  v_parada := v_le.parada_id;
  v_n := v_n + 1;

  -- 4. paradas_que_detienen_lineas la muestra pendiente.
  if not exists (select 1 from paradas_que_detienen_lineas(v_t) where parada_id = v_parada and pendiente) then
    raise exception 'ENSAYO FALLÓ (4): paradas_que_detienen_lineas no devuelve la parada del CIP.';
  end if;
  v_n := v_n + 1;

  -- 5. No se termina el CIP con su parada sin completar.
  v_ok := false;
  begin
    perform terminar_cip('ens_cip', v_t, v_linea_codigo);
  exception when others then
    v_ok := sqlerrm like 'Completa la parada del CIP%';
  end;
  if not v_ok then raise exception 'ENSAYO FALLÓ (5): terminó el CIP con la parada sin completar.'; end if;
  v_n := v_n + 1;

  -- 6. Completada la parada, terminar el CIP deja la línea Lista y la corrida vuelve a correr (mismo lote).
  perform completar_parada('ens_cip', v_parada, 30, null, null, null, null, 'Ensayo');
  perform terminar_cip('ens_cip', v_t, v_linea_codigo);
  select * into v_tl from turno_lineas where id = v_c;
  select * into v_le from lineas_estado where turno_id = v_t and linea_id = v_linea;
  if v_le.condicion <> 'LISTA' or v_le.parada_id is not null or not v_tl.activa or v_tl.pausada_en is not null then
    raise exception 'ENSAYO FALLÓ (6): terminar el CIP no continuó el lote.';
  end if;
  v_n := v_n + 1;

  -- 7. Detener línea → Esperando PT → continuar el lote: la misma corrida vuelve a correr.
  perform detener_linea_por_falla('ens_cip', v_t, v_c, 'ensayo');
  perform continuar_corrida_detenida('ens_cip', v_t, v_c);
  select * into v_tl from turno_lineas where id = v_c;
  select * into v_le from lineas_estado where turno_id = v_t and linea_id = v_linea;
  if not v_tl.activa or v_tl.finalizada_en is not null or v_le.condicion <> 'LISTA' then
    raise exception 'ENSAYO FALLÓ (7): continuar el lote no volvió a poner en marcha la corrida.';
  end if;
  v_n := v_n + 1;

  -- 8. Con Contador cargado ya no se puede continuar.
  perform detener_linea_por_falla('ens_cip', v_t, v_c, 'ensayo');
  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, envases_buenos, usuario_id)
  values (v_t, v_c, v_linea, 100, 100, v_u);
  v_ok := false;
  begin
    perform continuar_corrida_detenida('ens_cip', v_t, v_c);
  exception when others then
    v_ok := sqlerrm like '%ya tiene Contador o Producto Terminado%';
  end;
  if not v_ok then raise exception 'ENSAYO FALLÓ (8): continuó una corrida con Contador cargado.'; end if;
  delete from contadores where turno_linea_id = v_c;
  v_n := v_n + 1;

  -- 9. Si el tanque del lote ya no está Listo, no se continúa.
  update recepcion_tanques set condicion = 'SUCIO' where turno_id = v_t and numero_tanque = 1;
  v_ok := false;
  begin
    perform continuar_corrida_detenida('ens_cip', v_t, v_c);
  exception when others then
    v_ok := sqlerrm like '%ya no está Listo%';
  end;
  if not v_ok then raise exception 'ENSAYO FALLÓ (9): continuó el lote con el tanque que ya no está Listo.'; end if;
  update recepcion_tanques set condicion = 'LISTO' where turno_id = v_t and numero_tanque = 1;
  v_n := v_n + 1;

  -- 10. CIP por 36 h con el lote que NO sigue: la corrida queda Esperando PT y hay +1 de Limpieza Intermedia.
  perform continuar_corrida_detenida('ens_cip', v_t, v_c);
  perform poner_linea_en_cip('ens_cip', v_t, v_linea_codigo, 'HORAS_36', null, v_c, false);
  select * into v_tl from turno_lineas where id = v_c;
  select * into v_le from lineas_estado where turno_id = v_t and linea_id = v_linea;
  if v_tl.activa or v_tl.finalizada_en is not null or v_le.condicion <> 'CIP'
     or not exists (select 1 from paradas p join paradas_tipos t on t.id = p.tipo_id
                    where p.id = v_le.parada_id and p.pendiente and t.codigo = 'LIMPIEZA_INTERMEDIA') then
    raise exception 'ENSAYO FALLÓ (10): el CIP con el lote que termina no quedó bien.';
  end if;
  v_n := v_n + 1;

  -- 11. Con la línea en CIP no se continúa el lote (primero se termina el CIP).
  v_ok := false;
  begin
    perform continuar_corrida_detenida('ens_cip', v_t, v_c);
  exception when others then
    v_ok := sqlerrm like '%está en CIP%';
  end;
  if not v_ok then raise exception 'ENSAYO FALLÓ (11): continuó el lote con la línea en CIP.'; end if;
  v_n := v_n + 1;

  -- 12. Sin corrida, no se pone en CIP una línea que tiene una corrida detenida sin PT.
  update lineas_estado set condicion = 'LISTA' where turno_id = v_t and linea_id = v_linea;
  v_ok := false;
  begin
    perform poner_linea_en_cip('ens_cip', v_t, v_linea_codigo, 'FALLA_MECANICA', null, null, null);
  exception when others then
    v_ok := sqlerrm like 'Hay una corrida detenida%';
  end;
  if not v_ok then raise exception 'ENSAYO FALLÓ (12): puso en CIP con una corrida detenida sin PT.'; end if;
  v_n := v_n + 1;

  raise exception 'ENSAYO OK: la migración 20261091 funciona (% chequeos). No quedó nada aplicado.', v_n;
end;
$$;

rollback;
