-- ============================================================
-- Tambores: se puede preparar medio tambor (0,5)
-- ============================================================
-- Dueña, 2026-10-08: al preparar no se podía poner 0,5 tambores.
-- preparaciones.tambores era entero y iniciar_preparacion() /
-- cambiar_condicion_tanque() recibían p_tambores integer.
--
--   * preparaciones.tambores pasa a numeric, de medio en medio
--     (0,5 · 1 · 1,5 …). Lo que ya está guardado no cambia.
--   * Las dos funciones se recrean con p_tambores numeric (Postgres no
--     deja cambiar el tipo de un parámetro). Cuerpos idénticos a su
--     última versión, más la validación de medio en medio.
-- ============================================================

alter table preparaciones alter column tambores type numeric(7, 1) using tambores::numeric;
alter table preparaciones add constraint preparaciones_tambores_medios_check
  check (tambores * 2 = trunc(tambores * 2));

drop function if exists iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric, uuid);
drop function if exists cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text, integer);

-- ------------------------------------------------------------
-- 1. iniciar_preparacion()
-- ------------------------------------------------------------
-- Última versión: 20261082090000_turno_cerrado_gracia_y_correccion.sql
create or replace function iniciar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_tambores numeric,
  p_agua numeric,
  p_azucar numeric,
  p_acido_citrico numeric,
  p_desvase_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_volumen_l numeric;
  v_tanque_actual recepcion_tanques%rowtype;
  v_desvase desvases%rowtype;
  v_nuevo_lote_id uuid;
  v_area_id uuid;
  v_lote_norm text;
  v_resto numeric;
begin
  -- Tambores de medio en medio (20261108190000).
  if p_tambores is not null and (p_tambores < 0 or p_tambores * 2 <> trunc(p_tambores * 2)) then
    raise exception 'Los tambores van de medio en medio (0,5 · 1 · 1,5 …).';
  end if;
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  v_volumen_l := coalesce(v_volumen_l, 0) + coalesce(p_agua, 0);

  select * into v_tanque_actual from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_lote_norm := normalizar_lote(p_lote);

  -- Serializa por (área, sabor, nº de lote): dos preparaciones
  -- concurrentes del mismo lote esperan una a la otra y la segunda ve la
  -- fila de la primera en el `exists` de abajo. El lock se libera solo al
  -- terminar la transacción.
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(v_area_id::text, '') || '|' || coalesce(p_sabor_id::text, '') || '|' || v_lote_norm, 0)
  );

  -- Guarda: número de lote repetido para el mismo sabor, abierto en
  -- otro tanque de la misma área.
  if exists (
    select 1
    from preparaciones prep
    join turnos t on t.id = prep.turno_id
    where prep.cerrado_en is null
      and prep.id is distinct from v_tanque_actual.lote_id
      and prep.sabor_id = p_sabor_id
      and normalizar_lote(prep.lote) = v_lote_norm
      and t.area_id = v_area_id
  ) then
    raise exception 'Ya hay un lote % de ese sabor abierto en otro tanque. Ciérralo primero o usa otro número.', v_lote_norm;
  end if;

  if v_tanque_actual.condicion in ('LISTO', 'STANDBY') and v_tanque_actual.lote_id is not null then
    -- Resto que ya había en el tanque = volumen VIVO del lote (no el
    -- congelado de recepcion_tanques).
    v_resto := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque), v_tanque_actual.volumen_l, 0);
    v_volumen_l := v_volumen_l + v_resto;

    -- El lote anterior se cierra. Su volumen_inicial_l NO se toca: el
    -- resto se MUDA al lote nuevo (no es merma), y volumen_l — que ya
    -- vale v_resto — es el "fin" correcto de su tramo de consumo.
    update preparaciones
    set cerrado_en = now(),
        actualizada_por = v_usuario_id
    where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now(),
        actualizada_por = v_usuario_id
    where lote_id = v_tanque_actual.lote_id and activa;
  end if;

  if p_desvase_id is not null then
    select * into v_desvase from desvases where id = p_desvase_id and consumido_en is null;
    if v_desvase.id is null then
      raise exception 'Eso guardado ya no está disponible.';
    end if;
    if v_desvase.sabor_id is distinct from p_sabor_id then
      raise exception 'Lo guardado es de otro sabor.';
    end if;
    v_volumen_l := v_volumen_l + v_desvase.litros;
  end if;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, agua, azucar, acido_citrico, usuario_id, actualizada_por)
  values (p_turno_id, p_numero_tanque, p_sabor_id, v_lote_norm, v_volumen_l, v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id, v_usuario_id)
  returning id into v_nuevo_lote_id;

  if p_desvase_id is not null then
    update desvases
    set consumido_en = now(), turno_id_consumo = p_turno_id, usado_en_lote_id = v_nuevo_lote_id
    where id = p_desvase_id;
  end if;

  update recepcion_tanques set condicion = 'EN_PREPARACION', sabor_id = null, volumen_l = null,
    lote = v_lote_norm, lote_id = v_nuevo_lote_id,
    activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, numeric, numeric, numeric, numeric, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. cambiar_condicion_tanque()
-- ------------------------------------------------------------
-- Última versión: 20261095090000_calidad_bloquea_editar_tanque_listo.sql
create or replace function cambiar_condicion_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_condicion text,
  p_sabor_id uuid,
  p_volumen_l numeric,
  p_lote text,
  p_momento text default null,
  p_tambores numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_actual recepcion_tanques%rowtype;
  v_ultimo_sabor_id uuid;
  v_ultimo_lote text;
  v_lote_id uuid;
  v_mismo_lote boolean;
  v_cip_iniciado_en timestamptz;
  v_cip_finalizado_en timestamptz;
  v_area_id uuid;
  v_prep_con_datos boolean;
  v_volumen_prep numeric;
  v_volumen_l_viejo numeric;
begin
  -- Tambores de medio en medio (20261108190000).
  if p_tambores is not null and (p_tambores < 0 or p_tambores * 2 <> trunc(p_tambores * 2)) then
    raise exception 'Los tambores van de medio en medio (0,5 · 1 · 1,5 …).';
  end if;
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  if p_momento is not null and p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;

  select * into v_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_ultimo_sabor_id := v_actual.ultimo_sabor_id;
  v_ultimo_lote := v_actual.ultimo_lote;

  if p_condicion in ('SUCIO', 'CIP', 'LIMPIO') and v_actual.condicion in ('LISTO', 'STANDBY') and v_actual.sabor_id is not null then
    v_ultimo_sabor_id := v_actual.sabor_id;
    v_ultimo_lote := v_actual.lote;
  end if;

  v_cip_iniciado_en := v_actual.cip_iniciado_en;
  v_cip_finalizado_en := v_actual.cip_finalizado_en;
  if p_condicion = 'CIP' then
    v_cip_iniciado_en := now();
    v_cip_finalizado_en := null;
  elsif p_condicion = 'LIMPIO' and v_actual.condicion = 'CIP' then
    v_cip_finalizado_en := now();
  end if;

  v_prep_con_datos := p_condicion = 'EN_PREPARACION'
    and p_sabor_id is not null
    and coalesce(trim(p_lote), '') <> '';

  v_mismo_lote :=
    v_actual.condicion in ('LISTO', 'STANDBY')
    and p_condicion in ('LISTO', 'STANDBY')
    and v_actual.sabor_id is not distinct from p_sabor_id
    and coalesce(v_actual.lote, '') = coalesce(normalizar_lote(p_lote), '');

  -- CALIDAD: con Calidad encendida, un lote nuevo no se libera desde acá.
  if p_condicion in ('LISTO', 'STANDBY') and not v_mismo_lote and calidad_libera_en_turno(p_turno_id) then
    raise exception 'Con Calidad, un lote solo queda Listo cuando Calidad lo libera. Deja el tanque En Preparación para que lo analicen.';
  end if;

  if v_mismo_lote then
    v_lote_id := v_actual.lote_id;

  elsif p_condicion in ('LISTO', 'STANDBY') then
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, actualizada_por, liberado_en)
    values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), p_volumen_l, p_volumen_l, 0, v_usuario_id, v_usuario_id, now())
    returning id into v_lote_id;

  elsif v_prep_con_datos then
    -- Cierra cualquier preparación abierta de este tanque en el área
    -- (incluye lotes "colgados" arrastrados de turnos viejos).
    update preparaciones pr
    set cerrado_en = now(), actualizada_por = v_usuario_id
    where pr.cerrado_en is null
      and pr.numero_tanque = p_numero_tanque
      and pr.turno_id in (select id from turnos where area_id = v_area_id);

    select coalesce(p_tambores, 0) * volumen into v_volumen_prep from sabores where id = p_sabor_id;

    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, actualizada_por)
    values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), v_volumen_prep, v_volumen_prep, coalesce(p_tambores, 0), v_usuario_id, v_usuario_id)
    returning id into v_lote_id;

  else
    -- EN_PREPARACION sin datos, o SUCIO/CIP/LIMPIO: cierra los lotes
    -- abiertos de este tanque que vienen de OTROS turnos.
    update preparaciones pr
    set cerrado_en = now(), actualizada_por = v_usuario_id
    where pr.cerrado_en is null
      and pr.numero_tanque = p_numero_tanque
      and pr.turno_id <> p_turno_id
      and pr.turno_id in (select id from turnos where area_id = v_area_id);
    v_lote_id := null;
  end if;

  update recepcion_tanques
  set condicion = p_condicion,
      sabor_id = case when p_condicion in ('LISTO', 'STANDBY') then p_sabor_id else null end,
      volumen_l = case when p_condicion in ('LISTO', 'STANDBY') then p_volumen_l else null end,
      lote = case
               when p_condicion in ('LISTO', 'STANDBY') then normalizar_lote(p_lote)
               when v_prep_con_datos then normalizar_lote(p_lote)
               else null
             end,
      lote_id = v_lote_id,
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote,
      cip_iniciado_en = v_cip_iniciado_en,
      cip_finalizado_en = v_cip_finalizado_en,
      confirmado_inicio_en = case when p_momento = 'INICIO' then now() else confirmado_inicio_en end,
      confirmado_inicio_por = case when p_momento = 'INICIO' then v_usuario_id else confirmado_inicio_por end,
      confirmado_fin_en = case when p_momento = 'FIN' then now() else confirmado_fin_en end,
      confirmado_fin_por = case when p_momento = 'FIN' then v_usuario_id else confirmado_fin_por end
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  -- Fuente real del inicio/fin de este turno para ese lote (ver
  -- confirmar_estado_tanque más arriba, mismo criterio). Acá el valor
  -- ya es p_volumen_l — lo que el supervisor acaba de declarar.
  if p_momento is not null and p_condicion in ('LISTO', 'STANDBY') and v_lote_id is not null then
    if p_momento = 'INICIO' then
      update turnos
      set volumenes_lote_inicio = jsonb_set(coalesce(volumenes_lote_inicio, '{}'::jsonb), array[v_lote_id::text], to_jsonb(p_volumen_l))
      where id = p_turno_id;
    else
      update turnos
      set volumenes_lote_cierre = jsonb_set(coalesce(volumenes_lote_cierre, '{}'::jsonb), array[v_lote_id::text], to_jsonb(p_volumen_l))
      where id = p_turno_id;
    end if;
  end if;

  if v_mismo_lote and v_lote_id is not null then
    -- RELECTURA FÍSICA DEL TANQUE — NO mueve volumen_inicial_l.
    select volumen_l into v_volumen_l_viejo
    from preparaciones where id = v_lote_id and cerrado_en is null;

    update preparaciones
    set volumen_l = p_volumen_l, actualizada_por = v_usuario_id
    where id = v_lote_id and cerrado_en is null;

    if v_volumen_l_viejo is not null and p_volumen_l is distinct from v_volumen_l_viejo then
      insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
      values (
        v_lote_id,
        p_turno_id,
        v_volumen_l_viejo,
        p_volumen_l,
        coalesce(p_volumen_l, 0) - coalesce(v_volumen_l_viejo, 0),
        v_usuario_id
      );
    end if;

  elsif v_actual.lote_id is not null then
    update turno_lineas
    set lote_terminado_en = now(), actualizada_por = v_usuario_id
    where lote_id = v_actual.lote_id and activa;

    update preparaciones
    set cerrado_en = now(), actualizada_por = v_usuario_id
    where id = v_actual.lote_id and cerrado_en is null;
  end if;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text, numeric) to anon, authenticated;
