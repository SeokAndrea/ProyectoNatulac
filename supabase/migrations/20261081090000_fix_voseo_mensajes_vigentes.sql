-- ============================================================
-- Voseo en mensajes que siguen vigentes en la base
-- ============================================================
-- Se corrigieron en archivos de migraciones ya aplicadas, y eso nunca llega
-- a Supabase. Se redefinen las dos funciones cambiando solo el texto.
-- ============================================================

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function fijar_volumen_lote(
  p_usuario text,
  p_lote_id uuid,
  p_volumen_real numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
  v_inicial_viejo numeric;
begin
  if p_volumen_real is null or p_volumen_real < 0 then
    raise exception 'El volumen tiene que ser un número mayor o igual a 0.';
  end if;
  if p_volumen_real > 30000 then
    raise exception 'El volumen no puede pasar de 30.000 L (capacidad del tanque).';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_lote from preparaciones where id = p_lote_id;

  if v_lote.id is null then
    raise exception 'Esa preparación no existe.';
  end if;
  if v_lote.cerrado_en is not null then
    raise exception 'El lote ya está cerrado.';
  end if;
  if exists (select 1 from turno_lineas where lote_id = p_lote_id) then
    raise exception 'Este lote ya tuvo una corrida — el 100%% no se puede fijar a mano. Usa "Medir tanque" para la relectura física.';
  end if;

  v_inicial_viejo := coalesce(v_lote.volumen_inicial_l, 0);

  update preparaciones
  set volumen_l = p_volumen_real,
      volumen_inicial_l = p_volumen_real,
      actualizada_por = v_usuario_id
  where id = p_lote_id;

  -- Espejo del tanque, si está Liberado con este lote.
  update recepcion_tanques
  set volumen_l = p_volumen_real, actualizada_por = v_usuario_id
  where turno_id = v_lote.turno_id and lote_id = p_lote_id and condicion in ('LISTO', 'STANDBY');

  insert into preparaciones_ajuste_volumen (lote_id, turno_id, litros, detalle, usuario_id)
  values (p_lote_id, v_lote.turno_id, p_volumen_real - v_inicial_viejo,
          'Fijar volumen real del lote (100%)', v_usuario_id);

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'preparaciones', p_lote_id::text, 'Preparación',
    format('Fijar volumen del lote · Tanque %s%s · %s L (era %s L)',
           v_lote.numero_tanque, coalesce(' · Lote ' || v_lote.lote, ''),
           p_volumen_real, round(v_inicial_viejo)),
    jsonb_build_object('volumen_l', v_lote.volumen_l, 'volumen_inicial_l', v_lote.volumen_inicial_l),
    jsonb_build_object('volumen_l', p_volumen_real, 'volumen_inicial_l', p_volumen_real)
  );

  return turno_json(v_lote.turno_id);
end;
$$;

-- Última versión: 20261055090000_pruebas_comenzar_finalizar_sin_ceremonia.sql
create or replace function finalizar_turno(p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas_activas text;
  v_es_pruebas boolean;
begin
  select (a.codigo = 'PRUEBAS') into v_es_pruebas
  from turnos t
  join areas a on a.id = t.area_id
  where t.id = p_turno_id;

  if not coalesce(v_es_pruebas, false) then
    -- Corrida detenida sin su Producto Terminado (ESPERANDO_PT).
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and activa = false and finalizada_en is null
    ) then
      raise exception 'Hay una corrida detenida sin su Producto Terminado. Cárgalo antes de finalizar el turno.';
    end if;

    -- Case 6: corrida todavía activa y sin entregar. Hay que cargar el PT
    -- del tramo de este turno y elegir Terminar o Entregar línea.
    select string_agg(l.nombre, ', ' order by l.codigo)
    into v_lineas_activas
    from turno_lineas tl
    join lineas l on l.id = tl.linea_id
    where tl.turno_id = p_turno_id and tl.activa and tl.entregada_en is null;

    if v_lineas_activas is not null then
      raise exception 'Estas líneas siguen activas: %. Carga su Producto Terminado de este turno y elige Terminar o Entregar línea antes de finalizar.',
        v_lineas_activas;
    end if;

    -- Tanque con producción de este turno sin confirmar su estado
    -- final: sin esto, el cierre queda a merced de la foto automática
    -- (el bug de hoy).
    if exists (
      select 1
      from recepcion_tanques rt
      where rt.turno_id = p_turno_id
        and rt.confirmado_fin_en is null
        and rt.lote_id is not null
        and exists (select 1 from turno_lineas tl where tl.turno_id = p_turno_id and tl.lote_id = rt.lote_id)
    ) then
      raise exception 'Hay tanques con producción de este turno sin confirmar su estado final. Confírmalos desde Preparación antes de finalizar.';
    end if;

    -- Línea que se ENTREGA activa al turno siguiente sin confirmar su
    -- fin: es el único caso de línea con riesgo real de arrastre (mismo
    -- criterio que tanques) — una corrida que ya terminó (finalizada_en,
    -- por PT o por reemplazo) no hereda nada, no lo necesita. Red de
    -- seguridad: en el flujo normal ya queda confirmada sola al Entregar
    -- línea (ver entregar_corrida más arriba).
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id
        and activa and entregada_en is not null
        and confirmado_fin_en is null
    ) then
      raise exception 'Hay líneas entregadas de este turno sin confirmar su estado final.';
    end if;
  end if;

  update turnos
  set estado = 'CERRADO',
      fecha_fin = (now() at time zone 'America/Caracas')::date,
      hora_fin = (now() at time zone 'America/Caracas')::time
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;
