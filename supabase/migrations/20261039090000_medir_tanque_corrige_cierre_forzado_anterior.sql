-- ============================================================
-- MEDIR TANQUE: corrige el cierre forzado anterior (relevo sin finalizar)
-- ============================================================
-- Caso real (Auditoría, 2026-09-15, ASEPTICO, tanque 3 / lote 0002):
-- Deivis arrancó su turno (T3) a las 22:30:12 — hora local. Como Javier
-- (T2) no había hecho Finalizar Turno, iniciar_turno() lo cerró forzado
-- en ese mismo instante ("relevo sin finalizar", 20261035), lo que
-- disparó el trigger que congela turnos.volumenes_lote_cierre con el
-- volumen_l que tuviera el lote EN ESE INSTANTE: 2.960 L. 98 segundos
-- después (22:31:50), Deivis midió el mismo tanque y lo corrigió a
-- 2.000 L — el valor real — pero esa corrección ya no podía tocar el
-- turno de Javier, que había quedado inmutable por diseño (20260968,
-- a propósito, para que el % de un turno cerrado no "baile"). El % de
-- merma de semielaborado de Javier salió 96.53% (real: ~5.9%), y de
-- paso Deivis quedó "heredando" 960 L de consumo fantasma que nunca
-- produjo.
--
-- Regla nueva: una medición real de un tanque que llega DESPUÉS de que
-- el turno que lo tenía se cerró FORZADO (cierre_automatico), pero
-- ANTES de que el turno nuevo haya registrado cualquier Producto
-- Terminado contra ese mismo lote, corrige retroactivamente el cierre
-- del turno anterior — no el arranque del turno nuevo. Nadie todavía
-- produjo nada con ese lote en el turno nuevo, así que la medición
-- solo puede referirse al final del tramo que se estaba cerrando.
-- volumen_l_inicio del turno nuevo se lee en vivo de este mismo campo
-- (turno_json), así que se autocorrige solo, sin tocar nada más.
--
-- No cubre el caso en que nadie vuelve a medir el tanque antes de que
-- el turno nuevo empiece a producir directamente: ahí el valor
-- congelado original (potencialmente impreciso) queda como hoy — no
-- es peor que el comportamiento actual, solo no lo mejora.
--
-- `create or replace`, misma firma. Cuerpo idéntico a medir_tanque de
-- 20261038 salvo el bloque nuevo (antes del UPDATE a preparaciones).
-- ============================================================

alter table turnos add column actualizada_por uuid references usuarios (id);

create or replace function medir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_volumen_real numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_volumen_viejo numeric;
  v_turno_previo_id uuid;
  v_ya_produjo boolean;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Solo se puede medir un tanque Liberado con un lote activo (Listo o Con Restos).';
  end if;
  if p_volumen_real is null or p_volumen_real < 0 then
    raise exception 'El volumen medido no es válido.';
  end if;

  select volumen_l into v_volumen_viejo
  from preparaciones where id = v_tanque.lote_id and cerrado_en is null;

  -- Relevo sin finalizar: ¿el lote de este tanque quedó congelado por
  -- un cierre FORZADO de un turno anterior (no el actual)? Si todavía
  -- no se produjo nada con él en ESTE turno, la medición de ahora es
  -- el cierre real de ese turno anterior, no el punto de partida de
  -- este — se corrige ahí en vez de dejarla como "inicio" de acá.
  select t.id into v_turno_previo_id
  from turnos t
  where t.estado = 'CERRADO'
    and t.cierre_automatico
    and t.id <> p_turno_id
    and jsonb_exists(t.volumenes_lote_cierre, v_tanque.lote_id::text)
  order by t.fecha desc, t.hora_fin desc nulls last, t.created_at desc
  limit 1;

  if v_turno_previo_id is not null then
    select exists(
      select 1
      from producto_terminado pt
      join turno_lineas tl on tl.id = pt.turno_linea_id
      where pt.turno_id = p_turno_id and tl.lote_id = v_tanque.lote_id
    ) into v_ya_produjo;

    if not v_ya_produjo then
      update turnos
      set volumenes_lote_cierre = jsonb_set(volumenes_lote_cierre, array[v_tanque.lote_id::text], to_jsonb(p_volumen_real)),
          actualizada_por = v_usuario_id
      where id = v_turno_previo_id;
    end if;
  end if;

  -- Relectura física: solo `volumen_l`. NO se toca `volumen_inicial_l`.
  update preparaciones set volumen_l = p_volumen_real, actualizada_por = v_usuario_id
  where id = v_tanque.lote_id and cerrado_en is null;

  update recepcion_tanques
  set volumen_l = p_volumen_real, activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_volumen_viejo is not null and p_volumen_real is distinct from v_volumen_viejo then
    insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
    values (
      v_tanque.lote_id,
      p_turno_id,
      v_volumen_viejo,
      p_volumen_real,
      coalesce(p_volumen_real, 0) - coalesce(v_volumen_viejo, 0),
      v_usuario_id
    );
  end if;

  -- Si lo medido dejó el lote en ~0 y ninguna corrida activa lo usa,
  -- se cierra el lote y el tanque pasa a SUCIO (mismo cierre que usa
  -- Producción). Idempotente y con guardas propias.
  perform revisar_cierre_de_lote(v_tanque.lote_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function medir_tanque(text, uuid, smallint, numeric) to anon, authenticated;
