-- ============================================================
-- 19/10: PT y contador repetidos en el turno fantasma A20261019_T3G1
-- (22:30–22:35, Fernando). Decisión de la dueña, 2026-10-20: se borra
-- lo repetido y el turno queda (vacío).
--
-- Lo que pasó: a las 22:30 el sistema cerró el T2 (A20261019_T2G2_2) y
-- abrió el T3G1. Fernando cargó el PT del T2 en su gracia (22:30:54) y
-- después el mismo en el T3G1 (22:35:10): 14 paletas + 49 cajas
-- (14.868 L), contador 14528 / 14419. El segundo descontó del Lote 0002
-- (T3) lo que ya no tenía y lo dejó en 0. Él lo midió en 5000 L, y el
-- ajuste quedó como +5000 cuando el teórico real era 18500 − 14868 = 3632
-- (+1368).
--
-- 1. Borra el PT y el contador de la corrida 9748beb6 en el T3G1.
-- 2. Corrige ese ajuste: teórico 3632, diferencia +1368.
-- No toca el volumen del lote: ya está cerrado y lo que vale es lo medido.
--
-- Cada paso exige encontrar exactamente 1 fila; si no, no cambia nada.
-- Después: regenerar el acta del T3G1 desde Historial (tiene el PT viejo).
-- El bloque DO es una sola transacción: si un paso falla, no cambia nada.
-- ============================================================

do $$
declare
  c_turno constant uuid := '4d9015a3-4b26-4ee2-9d20-51a9c2f348c4';  -- A20261019_T3G1
  c_corrida constant uuid := '9748beb6-8751-409e-9265-4671fbb5a4b5';
  c_lote constant uuid := '897ed4a2-d10e-4e59-a144-2c203fb8eb8d';   -- Lote 0002, tanque 3
  v_n integer;
begin
  delete from producto_terminado
  where turno_id = c_turno and turno_linea_id = c_corrida
    and paletas = 14 and cajas_sueltas = 49;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'PT: se esperaba 1 fila y hay %', v_n; end if;

  delete from contadores
  where turno_id = c_turno and turno_linea_id = c_corrida
    and envases_llenadora = 14528 and envases_buenos = 14419;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Contador: se esperaba 1 fila y hay %', v_n; end if;

  update preparaciones_ajuste
  set volumen_teorico = 3632, diferencia = 1368
  where turno_id = c_turno and lote_id = c_lote
    and volumen_real = 5000 and diferencia = 5000;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Ajuste: se esperaba 1 fila y hay %', v_n; end if;

  perform registrar_auditoria(
    'agomez', 'ELIMINAR', 'producto_terminado', c_corrida::text, 'Script de arreglo',
    'PT y contador repetidos del T2 en A20261019_T3G1 (14 paletas + 49 cajas, 14528 / 14419). Ajuste del Lote 0002: +5000 → +1368.',
    jsonb_build_object('paletas', 14, 'cajas_sueltas', 49, 'litros', 14868,
                       'envases_llenadora', 14528, 'envases_buenos', 14419, 'ajuste_diferencia', 5000),
    jsonb_build_object('ajuste_diferencia', 1368)
  );
end;
$$;

-- Debe dar 0 PT y 0 contadores en el T3G1.
select
  (select count(*) from producto_terminado where turno_id = '4d9015a3-4b26-4ee2-9d20-51a9c2f348c4') as pt_t3g1,
  (select count(*) from contadores where turno_id = '4d9015a3-4b26-4ee2-9d20-51a9c2f348c4') as contadores_t3g1;
