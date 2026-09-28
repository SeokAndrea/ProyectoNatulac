-- ============================================================
-- QUIÉN FINALIZA EL TURNO
-- ============================================================
-- Rework 2026-09-27. finalizar_turno() no sabía quién lo pedía: cualquiera
-- con la app abierta cerraba el turno de otro (ej. un analista cerrándole el
-- turno al supervisor). Ahora recibe p_usuario y solo finaliza:
--   * el responsable actual del turno,
--   * quien tenga TURNO_CORREGIR (Jefe, SubJefe con el extra) o el dueño,
--   * cualquiera en el Área de Pruebas.
-- Un turno "Sin responsable" hay que asumirlo antes de finalizarlo (así el
-- acta queda a nombre de alguien).
--
-- También: cerrar_turno_forzado() estaba abierto al público (grant a anon) y
-- cierra cualquier turno sin validar nada. Solo lo usan el cron y abrir_turno.
-- ============================================================

create or replace function exigir_puede_finalizar(p_usuario text, p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno turnos;
  v_area text;
  v_responsable text;
begin
  select * into v_turno from turnos where id = p_turno_id;
  if not found then
    raise exception 'No se encontró el turno.';
  end if;
  select codigo into v_area from areas where id = v_turno.area_id;
  if v_area = 'PRUEBAS' then
    return;
  end if;

  if v_turno.supervisor_id = usuario_sistema_id() then
    raise exception 'Este turno no tiene responsable. Asúmelo desde Comenzar Turno antes de finalizarlo.';
  end if;

  if exists (select 1 from usuarios where id = v_turno.supervisor_id and usuario = lower(p_usuario))
     or tiene_permiso(p_usuario, 'TURNO_CORREGIR')
     or es_dueno(p_usuario) then
    return;
  end if;

  select nombre into v_responsable from usuarios where id = v_turno.supervisor_id;
  raise exception 'Solo % (responsable del turno) o un jefe pueden finalizarlo. Si vas a quedar a cargo, toma el relevo desde Comenzar Turno.', v_responsable;
end;
$$;

revoke execute on function exigir_puede_finalizar(text, uuid) from public, anon, authenticated;

-- finalizar_turno(): mismo cuerpo que 20261081090000_fix_voseo_mensajes_vigentes.sql, con el chequeo al inicio.
create or replace function finalizar_turno(p_usuario text, p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas_activas text;
  v_es_pruebas boolean;
begin
  perform exigir_puede_finalizar(p_usuario, p_turno_id);
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

grant execute on function finalizar_turno(text, uuid) to anon, authenticated;

-- La versión vieja, sin usuario, se borra: si quedara, seguiría cerrando turnos sin validar.
drop function if exists finalizar_turno(uuid);

revoke execute on function cerrar_turno_forzado(uuid, timestamp) from public, anon, authenticated;
