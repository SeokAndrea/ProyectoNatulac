-- Fix puntual: lote 0004 (Pera, Tanque 2, turno A20260910_T1G3 de Deivis).
-- El `volumen_inicial_l` quedó inflado (18772) por resto fantasma del
-- espejo congelado + un Medir tanque mal usado. Ninguna corrida tomó de
-- este lote todavía, así que es seguro mover el punto de partida.
-- Se deja el "100% del lote" en 17600 (medición de Deivis).
--
-- Solo lectura salvo el UPDATE. Correr una vez.

begin;

do $$
declare
  v_lote   preparaciones%rowtype;
  v_uid    uuid;
  v_real   numeric := 17600;
begin
  select * into v_lote from preparaciones where lote = '0004' and cerrado_en is null
    and numero_tanque = 2 order by created_at desc limit 1;

  if v_lote.id is null then
    raise notice 'SKIP: no se encontró el lote 0004 abierto en el Tanque 2';
    return;
  end if;
  if exists (select 1 from turno_lineas where lote_id = v_lote.id) then
    raise exception 'ABORT: el lote 0004 ya tuvo una corrida — no mover volumen_inicial_l a mano';
  end if;

  select id into v_uid from usuarios where usuario = 'deivis';  -- ajustar si el usuario es otro

  raise notice 'Antes: volumen_inicial_l=% volumen_l=%', v_lote.volumen_inicial_l, v_lote.volumen_l;

  update preparaciones
  set volumen_inicial_l = v_real,
      volumen_l = v_real
  where id = v_lote.id;

  insert into preparaciones_ajuste_volumen (lote_id, turno_id, litros, detalle, usuario_id)
  values (v_lote.id, v_lote.turno_id, v_real - coalesce(v_lote.volumen_inicial_l, 0),
          'Corrección: 100% del lote fijado en 17600 (medición Deivis; resto fantasma del espejo congelado)', v_uid);

  raise notice 'Después: volumen_inicial_l=17600 volumen_l=17600';
end $$;

-- Revisar y, si está bien:  commit;   si no:  rollback;
rollback;
