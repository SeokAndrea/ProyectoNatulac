-- ============================================================
-- MERMA DE SEMIELABORADO — FASE D: la transferencia no duplica litros
-- ============================================================
-- Diagnóstico (plan-debug-merma-semielaborado.md §6, §31, §37 #4):
--
--   transferir_tanque() suma v_origen.volumen_l al volumen_inicial_l
--   del lote DESTINO (rama "sumar") o crea el lote destino con
--   volumen_inicial_l = v_origen.volumen_l (rama LIMPIO) — y en las dos
--   ramas cierra el lote ORIGEN SIN descontarle nada.
--
--   Resultado: los litros transferidos quedan contados dos veces en el
--   total de la planta:
--     - una vez en el volumen_inicial_l del origen (que queda cerrado
--       con esos litros adentro → se leen como pérdida del origen),
--     - otra vez en el volumen_inicial_l del destino.
--   La merma del turno se infla (§6A: 37 % cuando lo real es 2,7 %).
--
-- ARREGLO:
--   Al transferir, se RESTA v_origen.volumen_l del volumen_inicial_l
--   del lote origen antes de cerrarlo. Así el litro se cuenta una sola
--   vez en toda la planta: sale del denominador del origen y entra al
--   del destino. Conservación: inicial_origen + inicial_destino
--   (después) == inicial_origen + inicial_destino (antes).
--
-- Ejemplo §6A: origen L-301 6000 L al 100 %, destino L-302 (inicial
--   5000, ya produjo 1000). Antes: origen cierra con inicial 6000 y
--   PT 0 → merma 100 %; destino inicial 11000. Ahora: origen inicial
--   6000 - 6000 = 0 → no aporta; destino inicial 11000. Merma del
--   turno pasa de 37 % a 2,7 % (lo real).
--
-- Reversible: re-aplicar 20260971090000 restaura el comportamiento
-- anterior.
-- ============================================================

create or replace function transferir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_numero_tanque_destino smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_origen recepcion_tanques%rowtype;
  v_destino recepcion_tanques%rowtype;
  v_origen_prep preparaciones%rowtype;
  v_nuevo_lote_id uuid;
begin
  if p_numero_tanque_origen = p_numero_tanque_destino then
    raise exception 'Elige dos tanques distintos.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_origen from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;
  select * into v_destino from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

  if v_origen.condicion not in ('LISTO', 'STANDBY') or v_origen.lote_id is null then
    raise exception 'El tanque origen no tiene un lote activo para transferir.';
  end if;
  if v_destino.condicion not in ('LISTO', 'STANDBY', 'LIMPIO') then
    raise exception 'El tanque destino debe estar Limpio, o tener el mismo sabor ya cargado (Listo o Standby).';
  end if;
  if v_destino.condicion in ('LISTO', 'STANDBY') and v_origen.sabor_id is distinct from v_destino.sabor_id then
    raise exception 'Los dos tanques deben tener el mismo sabor.';
  end if;

  if v_destino.condicion = 'LIMPIO' then
    -- Mover el lote entero: el destino no tenía nada, se crea su lote
    -- con el mismo sabor/lote/volumen que traía el origen — es el
    -- mismo lote, solo que ahora vive en otro tanque físico.
    select * into v_origen_prep from preparaciones where id = v_origen.lote_id;

    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en)
    values (p_turno_id, p_numero_tanque_destino, v_origen_prep.sabor_id, v_origen_prep.lote, v_origen.volumen_l, v_origen.volumen_l, 0, v_usuario_id, now())
    returning id into v_nuevo_lote_id;

    update recepcion_tanques
    set condicion = 'LISTO',
        sabor_id = v_origen.sabor_id,
        volumen_l = v_origen.volumen_l,
        lote = v_origen.lote,
        lote_id = v_nuevo_lote_id,
        activada_en = now(),
        actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_nuevo_lote_id
    where lote_id = v_origen.lote_id and activa;
  else
    -- Sumar: el destino ya tenía el mismo sabor cargado. Los litros
    -- entran al destino y se descuentan del origen (ver cabecera) —
    -- NO es líquido nuevo para la planta, ya se contó al preparar el
    -- lote origen.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + coalesce(v_origen.volumen_l, 0),
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + coalesce(v_origen.volumen_l, 0)
    where id = v_destino.lote_id;

    update recepcion_tanques
    set volumen_l = (select volumen_l from preparaciones where id = v_destino.lote_id)
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_destino.lote_id, lote = v_destino.lote, sabor_id = v_destino.sabor_id
    where lote_id = v_origen.lote_id and activa;
  end if;

  -- El lote origen entrega v_origen.volumen_l al destino: esos litros
  -- salen de su punto de partida (ya están contados en el destino).
  -- Sin esto quedarían contados dos veces en el total de la planta y
  -- se leerían como pérdida del origen (§6, §31).
  update preparaciones
  set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_origen.volumen_l, 0), 0)
  where id = v_origen.lote_id;

  update preparaciones set cerrado_en = now() where id = v_origen.lote_id and cerrado_en is null;

  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_origen.sabor_id,
      ultimo_lote = 'Transferido al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, ''),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function transferir_tanque(text, uuid, smallint, smallint) to anon, authenticated;
