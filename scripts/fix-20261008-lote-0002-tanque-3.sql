-- ============================================================
-- 08/10/2026 · T2 (Fernando, A20261008_T2G1): el Lote 0002 de Pera Jucosa
-- quedó duplicado.
-- ============================================================
-- El T1 dejó el lote 0002 (cd0ef72f) en el Tanque 1 con la Línea 2
-- corriéndolo. En la revisión de inicio Fernando marcó el Tanque 1 SUCIO
-- (eso cerró el lote) y preparó un lote 0002 NUEVO en el Tanque 3
-- (5d4f0e21, 2.000 L). La Línea 2 quedó atada al lote original, cerrado y
-- sin tanque, y no deja arrancar el nuevo ("ya corrió el Lote 0002").
--
-- La Pera Jucosa está físicamente en el Tanque 3 (confirmado por la
-- dueña). Este script:
--   1. Pone el lote ORIGINAL en el Tanque 3 (2.000 L) y lo reabre.
--   2. Borra el lote duplicado (sin corridas, PT ni ajustes).
--   3. Corrige el volumen de inicio del turno.
-- Después: Fernando toca Líneas → Línea 2 → «Continuar el Lote 0002».
--
-- Todo o nada: si algo no está como se espera, se cancela sin cambiar nada.
-- Correr en Supabase → SQL Editor.
-- ============================================================

do $$
declare
  v_turno uuid := '1667ffd4-f600-4e65-a16f-ba5071a656f2';      -- A20261008_T2G1
  v_original uuid := 'cd0ef72f-d3cd-4f1f-aebc-f991ce972dcd';   -- Lote 0002 de la Línea 2
  v_duplicado uuid := '5d4f0e21-b0f4-4c08-9f79-0c2fceeb2842';  -- Lote 0002 nuevo del Tanque 3
  v_filas integer;
begin
  -- Chequeos: que todo siga como lo dejó Fernando.
  if not exists (select 1 from turnos where id = v_turno and estado = 'ABIERTO') then
    raise exception 'El turno A20261008_T2G1 ya no está abierto. No se cambió nada.';
  end if;
  if not exists (select 1 from recepcion_tanques where turno_id = v_turno and numero_tanque = 3 and lote_id = v_duplicado and condicion = 'LISTO') then
    raise exception 'El Tanque 3 ya no tiene el lote duplicado. No se cambió nada.';
  end if;
  if exists (select 1 from turno_lineas where lote_id = v_duplicado)
     or exists (select 1 from producto_terminado pt join turno_lineas tl on tl.id = pt.turno_linea_id where tl.lote_id = v_duplicado)
     or exists (select 1 from preparaciones_ajuste where lote_id = v_duplicado)
     or exists (select 1 from preparaciones_ajuste_volumen where lote_id = v_duplicado)
     or exists (select 1 from transferencias where lote_id_origen = v_duplicado or lote_id_destino = v_duplicado) then
    raise exception 'El lote duplicado ya se usó (corridas, PT, ajustes o transferencias). No se cambió nada: avisar.';
  end if;
  if exists (select 1 from recepcion_tanques where lote_id = v_original and turno_id = v_turno) then
    raise exception 'El lote original ya está en un tanque de este turno. No se cambió nada.';
  end if;

  -- 1. El Tanque 3 pasa a tener el lote ORIGINAL.
  update recepcion_tanques
  set lote_id = v_original, lote = '0002'
  where turno_id = v_turno and numero_tanque = 3 and lote_id = v_duplicado;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then raise exception 'No se pudo cambiar el Tanque 3.'; end if;

  -- El lote original: en el Tanque 3, 2.000 L y abierto otra vez.
  update preparaciones
  set numero_tanque = 3, volumen_l = 2000, cerrado_en = null
  where id = v_original;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then raise exception 'No se encontró el lote original.'; end if;

  -- 2. El duplicado se borra.
  delete from preparaciones where id = v_duplicado;

  -- 3. Volumen de inicio del turno: el del lote original (2.000 L), sin el duplicado.
  update turnos
  set volumenes_lote_inicio = (coalesce(volumenes_lote_inicio, '{}'::jsonb) - v_duplicado::text) || jsonb_build_object(v_original::text, 2000)
  where id = v_turno;

  raise notice 'Listo: el Lote 0002 original está en el Tanque 3 con 2.000 L. Fernando puede tocar «Continuar el Lote 0002» en la Línea 2.';
end;
$$;

-- Para mirar cómo quedó:
select numero_tanque, condicion, lote, lote_id, volumen_l
from recepcion_tanques
where turno_id = '1667ffd4-f600-4e65-a16f-ba5071a656f2'
order by numero_tanque;
