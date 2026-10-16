-- ============================================================
-- Corrección puntual: la parada actual de la Línea 3 dice
-- «Eje de corrección de diseño» y empezó a las 7:00 de hoy (hora de planta).
--
-- Toca la parada en curso de la Línea 3 (+1 pendiente o sin fin) y, si la
-- línea está pausada desde Líneas, también su pausa (hora y motivo), para que
-- el Panel de Paradas muestre «Parada desde las 7:00» con esa descripción.
-- Si no hay ninguna parada en curso en la Línea 3, no cambia nada.
-- ============================================================
do $$
declare
  v_inicio timestamptz :=
    ((now() at time zone 'America/Caracas')::date + time '07:00') at time zone 'America/Caracas';
  v_nota constant text := 'Eje de corrección de diseño';
  v_parada_id uuid;
  v_n integer;
begin
  select p.id into v_parada_id
  from paradas p
  join lineas l on l.id = p.linea_id
  where regexp_replace(upper(l.codigo), '^LINEA_T?', '') = '3'
    and (p.pendiente or p.fin is null)
  order by p.inicio desc
  limit 1;

  if v_parada_id is null then
    raise notice 'No hay parada en curso en la Línea 3: no se cambió nada.';
    return;
  end if;

  -- Una pendiente se guarda con inicio = fin (hora del +1); una abierta sigue sin fin.
  update paradas
  set nota = v_nota,
      inicio = v_inicio,
      fin = case when pendiente then v_inicio else fin end
  where id = v_parada_id;

  -- Pausa de Líneas de esa corrida (si la hay): misma hora y motivo.
  update turno_lineas tl
  set pausada_en = v_inicio,
      pausa_motivo = v_nota
  from lineas l
  where l.id = tl.linea_id
    and regexp_replace(upper(l.codigo), '^LINEA_T?', '') = '3'
    and tl.activa
    and tl.pausada_en is not null;
  get diagnostics v_n = row_count;

  raise notice 'Parada % actualizada (desde %); pausas de Líneas ajustadas: %', v_parada_id, v_inicio, v_n;
end;
$$;
