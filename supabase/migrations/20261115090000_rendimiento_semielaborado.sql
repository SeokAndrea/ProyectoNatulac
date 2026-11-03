-- ============================================================
-- Rendimiento de semielaborado = Total envasado / Total preparado × 100
-- (decisión de la dueña, 2026-11-03).
--
-- Ya no se compara contra el volumen vivo del tanque (inicio − fin): ese
-- volumen es un libro (preparado − PT) y sin "Medir tanque" el rendimiento
-- salía siempre 100 %. Ahora el denominador es lo PREPARADO del lote y el
-- numerador lo ENVASADO (PT) de ese lote, en todos los turnos.
--
-- 1. preparaciones.resto_heredado_l + lote_anterior_id: al preparar encima
--    de un tanque con resto, iniciar_preparacion suma ese resto al lote
--    nuevo (volumen_inicial_l). Para el rendimiento, ese resto es una
--    SALIDA del lote anterior (como una transferencia): no se perdió, pasó
--    al lote nuevo, que lo cuenta como parte de su preparado. Así no se
--    cuenta dos veces y el lote anterior no carga como merma lo que solo
--    se mudó. Los lotes viejos quedan sin el dato (0 / null).
--
-- 2. rendimiento_lotes(p_lote_ids): por lote, en todos los turnos
--      preparado_l = volumen_inicial_l (incluye ajustes, desvase y resto heredado)
--      entrantes_l = transferencias recibidas por el lote YA existente
--      salientes_l = transferido + desvasado + entregado a Vacío
--                    + resto que pasó al lote siguiente
--      envasado_l  = Σ PT de las corridas del lote
--    Disponible = preparado + entrantes − salientes. El cliente reparte el
--    disponible entre turnos en proporción al envasado de cada turno.
-- ============================================================

alter table preparaciones add column if not exists resto_heredado_l numeric(12, 2) not null default 0;
alter table preparaciones add column if not exists lote_anterior_id uuid references preparaciones (id) on delete set null;

comment on column preparaciones.resto_heredado_l is
  'Litros que el lote recibió del lote anterior del mismo tanque al prepararse encima (ya están en volumen_inicial_l). Cuentan como salida del lote anterior para el rendimiento (20261115090000).';
comment on column preparaciones.lote_anterior_id is
  'Lote del que vino resto_heredado_l (20261115090000).';

-- ------------------------------------------------------------
-- 1. iniciar_preparacion() guarda el resto heredado
-- ------------------------------------------------------------
-- Última versión: 20261109490000_lotes_para_vacio.sql (mismo cuerpo, solo
-- se agregan resto_heredado_l y lote_anterior_id al insert).
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
  p_desvase_id uuid default null,
  p_para_vacio boolean default false
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
  v_resto numeric := 0;
  v_para_vacio boolean := coalesce(p_para_vacio, false);
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

  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(v_area_id::text, '') || '|' || coalesce(p_sabor_id::text, '') || '|' || v_lote_norm, 0)
  );

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
    v_resto := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque), v_tanque_actual.volumen_l, 0);
    v_volumen_l := v_volumen_l + v_resto;

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

  -- VACÍO (20261109490000): el lote de Vacío no se libera — nace Listo.
  -- RENDIMIENTO (20261115090000): resto_heredado_l / lote_anterior_id guardan lo que vino del lote anterior.
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, resto_heredado_l, lote_anterior_id,
    tambores, agua, azucar, acido_citrico, usuario_id, actualizada_por, para_vacio, liberado_en)
  values (p_turno_id, p_numero_tanque, p_sabor_id, v_lote_norm, v_volumen_l, v_volumen_l, greatest(coalesce(v_resto, 0), 0),
    case when coalesce(v_resto, 0) > 0 then v_tanque_actual.lote_id end,
    p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id, v_usuario_id, v_para_vacio, case when v_para_vacio then now() end)
  returning id into v_nuevo_lote_id;

  if p_desvase_id is not null then
    update desvases
    set consumido_en = now(), turno_id_consumo = p_turno_id, usado_en_lote_id = v_nuevo_lote_id
    where id = p_desvase_id;
  end if;

  if v_para_vacio then
    update recepcion_tanques set condicion = 'LISTO', sabor_id = p_sabor_id, volumen_l = v_volumen_l,
      lote = v_lote_norm, lote_id = v_nuevo_lote_id,
      activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  else
    update recepcion_tanques set condicion = 'EN_PREPARACION', sabor_id = null, volumen_l = null,
      lote = v_lote_norm, lote_id = v_nuevo_lote_id,
      activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, numeric, numeric, numeric, numeric, uuid, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. rendimiento_lotes(): totales de cada lote en TODOS los turnos
-- ------------------------------------------------------------
create or replace function rendimiento_lotes(p_lote_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'lote_id', p.id,
    'preparado_l', coalesce(p.volumen_inicial_l, 0),
    'resto_heredado_l', coalesce(p.resto_heredado_l, 0),
    'entrantes_l', coalesce((
      -- Solo lo que absorbió un lote YA existente: el que nace de la misma
      -- transferencia ya lo trae en volumen_inicial_l.
      select sum(tr.litros) from transferencias tr
      where tr.lote_id_destino = p.id and tr.creado_en > p.created_at
    ), 0),
    'salientes_l',
      coalesce((select sum(tr.litros) from transferencias tr where tr.lote_id_origen = p.id), 0)
      + coalesce((select sum(d.litros) from desvases d where d.lote_id_origen = p.id), 0)
      + coalesce((select sum(sv.litros) from salidas_vacio sv where sv.lote_id = p.id and not sv.de_lote_vacio), 0)
      -- Resto que pasó al lote preparado encima: no se perdió, se mudó.
      + coalesce((select sum(sig.resto_heredado_l) from preparaciones sig where sig.lote_anterior_id = p.id), 0),
    'envasado_l', coalesce((
      select sum(pt.litros_producidos)
      from producto_terminado pt
      join turno_lineas tl on tl.id = pt.turno_linea_id
      where tl.lote_id = p.id
    ), 0),
    'cerrado', p.cerrado_en is not null,
    'para_vacio', coalesce(p.para_vacio, false)
  )), '[]'::jsonb)
  from preparaciones p
  where p.id = any(p_lote_ids);
$$;

grant execute on function rendimiento_lotes(uuid[]) to anon, authenticated;
