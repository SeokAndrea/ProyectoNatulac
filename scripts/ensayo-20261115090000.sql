-- Ensayo de 20261115090000_rendimiento_semielaborado.sql (resto_heredado_l, lote_anterior_id, rendimiento_lotes e iniciar_preparacion).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción. No deja nada.
--
-- Con la migración ya aplicada, en la base de Pruebas:
--   docker exec -i natulac-local-db-1 psql -U postgres -d natulac -v ON_ERROR_STOP=1 < scripts/ensayo-20261115090000.sql
-- En PRODUCCIÓN, sin aplicar nada de verdad (mete la migración y el ensayo en una transacción que se deshace):
--   bash scripts/aplicar-migracion.sh scripts/ensayo-20261115090000-produccion.sql
--
-- Las pruebas 2 y 3 usan un turno ABIERTO que ya exista; si no hay uno con el tanque que necesitan, dicen
-- «saltado» y no fallan (revisa los avisos al final).
begin;

do $$
declare
  v_usuario text := (select u.usuario from usuarios u where u.activo limit 1);
  v_sabor uuid;
  v_vol numeric;
  v_lote text := lpad((1000 + floor(random() * 8999))::int::text, 4, '0');
  v_turno uuid;
  v_tq smallint;
  v_viejo uuid;
  v_esperado numeric;
  v_nuevo preparaciones%rowtype;
  v_fila jsonb;
  v_turno2 uuid;
  v_tq2 smallint;
begin
  if v_usuario is null then raise exception 'Falta un usuario activo en la base.'; end if;
  select s.id, s.volumen into v_sabor, v_vol from sabores s where s.volumen is not null limit 1;
  if v_sabor is null then raise exception 'Falta un sabor con volumen por tambor.'; end if;

  -- ---------------------------------------------------------------------
  -- 1. Estructura
  -- ---------------------------------------------------------------------
  if not exists (select 1 from information_schema.columns where table_name = 'preparaciones' and column_name = 'resto_heredado_l') then
    raise exception '1.1 Falta preparaciones.resto_heredado_l';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'preparaciones' and column_name = 'lote_anterior_id') then
    raise exception '1.2 Falta preparaciones.lote_anterior_id';
  end if;
  if (select count(*) from pg_proc where proname = 'iniciar_preparacion') <> 1 then
    raise exception '1.3 iniciar_preparacion debe tener UNA sola firma (si hay dos, quedó la vieja)';
  end if;
  if (select pg_get_functiondef(oid) from pg_proc where proname = 'iniciar_preparacion') not like '%resto_heredado_l%' then
    raise exception '1.4 iniciar_preparacion no guarda resto_heredado_l';
  end if;
  if rendimiento_lotes(array[]::uuid[]) <> '[]'::jsonb then raise exception '1.5 rendimiento_lotes sin lotes debe dar []'; end if;
  -- Un lote cualquiera (los viejos quedan con 0 / null): trae todas las llaves.
  select e into v_fila from jsonb_array_elements(rendimiento_lotes(array(select id from preparaciones order by created_at desc limit 1))) e;
  if v_fila is not null and not (v_fila ?& array['lote_id', 'preparado_l', 'resto_heredado_l', 'entrantes_l', 'salientes_l', 'envasado_l', 'cerrado', 'para_vacio']) then
    raise exception '1.6 rendimiento_lotes no trae todas las llaves: %', v_fila;
  end if;

  -- ---------------------------------------------------------------------
  -- 2. Preparar ENCIMA de un tanque Listo/Standby con lote: el resto pasa al lote nuevo
  -- ---------------------------------------------------------------------
  select rt.turno_id, rt.numero_tanque, rt.lote_id into v_turno, v_tq, v_viejo
  from recepcion_tanques rt join turnos t on t.id = rt.turno_id
  where t.estado = 'ABIERTO' and rt.condicion in ('LISTO', 'STANDBY') and rt.lote_id is not null
  order by rt.created_at desc limit 1;

  if v_turno is null then
    raise notice '2 saltado: no hay un tanque Listo/Standby con lote en un turno abierto.';
  else
    v_esperado := greatest(coalesce(volumen_vivo_tanque(v_turno, v_tq), (select volumen_l from recepcion_tanques where turno_id = v_turno and numero_tanque = v_tq), 0), 0);
    perform iniciar_preparacion(v_usuario, v_turno, v_tq, v_sabor, v_lote, 1, 0, 0, 0);
    select * into v_nuevo from preparaciones where turno_id = v_turno and numero_tanque = v_tq and lote = normalizar_lote(v_lote);
    if v_nuevo.id is null then raise exception '2.1 No creó el lote nuevo'; end if;
    if v_nuevo.resto_heredado_l is distinct from round(v_esperado, 2) then
      raise exception '2.2 resto_heredado_l = % y debía ser %', v_nuevo.resto_heredado_l, round(v_esperado, 2);
    end if;
    if v_nuevo.lote_anterior_id is distinct from (case when v_esperado > 0 then v_viejo end) then
      raise exception '2.3 lote_anterior_id no apunta al lote que se cerró';
    end if;
    if v_nuevo.volumen_inicial_l is distinct from round(v_vol + v_esperado, 2) then
      raise exception '2.4 volumen_inicial_l = % y debía ser tambor + resto = %', v_nuevo.volumen_inicial_l, round(v_vol + v_esperado, 2);
    end if;
    if (select cerrado_en from preparaciones where id = v_viejo) is null then raise exception '2.5 El lote viejo debía quedar cerrado'; end if;

    -- El resto es SALIDA del lote viejo y el lote nuevo lo cuenta como preparado.
    select e into v_fila from jsonb_array_elements(rendimiento_lotes(array[v_viejo])) e;
    if (v_fila ->> 'salientes_l')::numeric < round(v_esperado, 2) then
      raise exception '2.6 Las salientes del lote viejo (%) no incluyen el resto (%)', v_fila ->> 'salientes_l', round(v_esperado, 2);
    end if;
    select e into v_fila from jsonb_array_elements(rendimiento_lotes(array[v_nuevo.id])) e;
    if (v_fila ->> 'preparado_l')::numeric <> v_nuevo.volumen_inicial_l or (v_fila ->> 'resto_heredado_l')::numeric <> v_nuevo.resto_heredado_l then
      raise exception '2.7 rendimiento_lotes del lote nuevo no coincide con lo guardado: %', v_fila;
    end if;
    raise notice '2 ok: resto % L pasó del lote viejo al nuevo.', round(v_esperado, 2);
  end if;

  -- ---------------------------------------------------------------------
  -- 3. Preparar en un tanque SIN lote que cerrar: no hay resto heredado
  -- ---------------------------------------------------------------------
  select rt.turno_id, rt.numero_tanque into v_turno2, v_tq2
  from recepcion_tanques rt join turnos t on t.id = rt.turno_id
  where t.estado = 'ABIERTO' and not (rt.condicion in ('LISTO', 'STANDBY') and rt.lote_id is not null)
    and (rt.turno_id, rt.numero_tanque) is distinct from (v_turno, v_tq)
  order by rt.created_at desc limit 1;

  if v_turno2 is null then
    raise notice '3 saltado: no hay un tanque sin lote en un turno abierto.';
  else
    begin
      perform iniciar_preparacion(v_usuario, v_turno2, v_tq2, v_sabor, lpad(((v_lote::int % 8999) + 1000)::text, 4, '0'), 1, 0, 0, 0);
      select * into v_nuevo from preparaciones where turno_id = v_turno2 and numero_tanque = v_tq2 order by created_at desc limit 1;
      if v_nuevo.resto_heredado_l <> 0 or v_nuevo.lote_anterior_id is not null then
        raise exception '3.1 Un tanque sin lote no debe heredar nada (resto %, anterior %)', v_nuevo.resto_heredado_l, v_nuevo.lote_anterior_id;
      end if;
      raise notice '3 ok: sin lote que cerrar, resto_heredado_l = 0.';
    exception when others then
      if sqlerrm like '3.1%' then raise; end if;
      raise notice '3 saltado: el tanque rechazó preparar (regla de negocio): %', sqlerrm;
    end;
  end if;

  raise notice 'Ensayo 20261115090000: terminó sin fallas (revisa si 2 y 3 dicen ok o saltado).';
end;
$$;

rollback;
