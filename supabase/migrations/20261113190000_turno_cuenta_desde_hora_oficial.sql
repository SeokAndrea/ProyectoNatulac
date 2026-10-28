-- ============================================================
-- PARADAS: cada turno cuenta según su horario oficial (dueña, 2026-10-28)
-- ============================================================
-- El T1 del 28/10 se abrió a las 8:53 y el T3 seguía abierto: la parada de
-- las 7:00 le contaba al T1 recién desde las 8:53 (la tabla de Líneas del
-- Panel decía 5 h). La dueña: «el turno es a las 7». Desde hoy:
--
--   * Un turno empieza en su hora oficial (T1 07:00, T2 15:00, T3 22:30),
--     o antes si lo abrieron antes.
--   * Un turno cerrado termina cuando empieza el siguiente (su hora oficial),
--     aunque lo hayan cerrado más tarde: así el tramo no cuenta dos veces.
--     Si no hubo turno siguiente, termina cuando lo cerraron.
--   * El 12x12 no tiene horario oficial: sigue como antes (desde que se
--     abrió o desde que cerró el anterior).
--   * Solo turnos que empiezan (oficialmente) desde el 28/10 a las 00:00;
--     lo anterior queda como estaba, salvo el corte con el primero de la
--     regla nueva: el T3 de la noche del 27 deja de contar de 7:00 a 8:53,
--     que ahora es del T1 (si no, contaría dos veces).
--
-- ventana_paradas_turno() es la única regla; la usan paradas_efectivas_turno()
-- (minutos de cada turno: Panel, acta, eficiencia, Validar) y
-- ventanas_turnos_paradas() (el reparto «T1 60 + T2 150» del reporte).
-- ============================================================

create or replace function ventana_paradas_turno(p_turno_id uuid)
returns table (desde timestamptz, hasta timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select tu.id, tu.area_id, tu.created_at, tu.estado,
           tt.hora_inicio is not null as con_horario,
           (tu.fecha + tt.hora_inicio) at time zone 'America/Caracas' as of_ini,
           ((tu.fecha + case when tt.hora_fin <= tt.hora_inicio then 1 else 0 end) + tt.hora_fin)
             at time zone 'America/Caracas' as of_fin,
           case when tu.estado = 'CERRADO' and tu.fecha_fin is not null and tu.hora_fin is not null
                then (tu.fecha_fin + tu.hora_fin) at time zone 'America/Caracas' end as cierre
    from turnos tu
    join turno_tipos tt on tt.id = tu.turno_tipo_id
    where tu.id = p_turno_id
  ),
  r as (
    select b.*,
           b.con_horario and b.of_ini >= timestamptz '2026-10-28 00:00:00-04' as nueva_regla,
           -- El turno anterior del área: hasta cuándo contó (regla de antes).
           (select case when an.estado = 'CERRADO' and an.fecha_fin is not null and an.hora_fin is not null
                        then (an.fecha_fin + an.hora_fin) at time zone 'America/Caracas'
                        else b.created_at end
            from turnos an
            where an.area_id = b.area_id and an.created_at < b.created_at
            order by an.created_at desc
            limit 1) as cierre_anterior,
           -- El turno siguiente del área, si ya va con la regla nueva: desde cuándo cuenta (su hora
           -- oficial, o su apertura si fue antes). Con la regla de antes (o 12x12): null.
           (select case when st.hora_inicio is not null
                             and (sg.fecha + st.hora_inicio) at time zone 'America/Caracas' >= timestamptz '2026-10-28 00:00:00-04'
                        then least(sg.created_at, (sg.fecha + st.hora_inicio) at time zone 'America/Caracas') end
            from turnos sg
            join turno_tipos st on st.id = sg.turno_tipo_id
            where sg.area_id = b.area_id and sg.created_at > b.created_at
            order by sg.created_at
            limit 1) as inicio_siguiente
    from b
  )
  select
    case when r.nueva_regla then least(r.created_at, r.of_ini)
         -- Regla de 20261111590000.
         else least(r.created_at, greatest(r.of_ini, r.cierre_anterior)) end,
    case when r.cierre is null then now()
         -- Lo cerraron después de que empezó el siguiente: termina ahí (nunca antes de su propio comienzo).
         when r.inicio_siguiente is not null
           then greatest(least(r.cierre, r.inicio_siguiente),
                         case when r.nueva_regla then least(r.created_at, r.of_ini)
                              else least(r.created_at, greatest(r.of_ini, r.cierre_anterior)) end)
         else r.cierre end
  from r;
$$;
revoke execute on function ventana_paradas_turno(uuid) from public, anon, authenticated;

-- paradas_efectivas_turno(): igual que 20261111590000, con la ventana de arriba.
create or replace function paradas_efectivas_turno(p_turno_id uuid)
returns table (
  id uuid,
  linea_id uuid,
  clase text,
  origen text,
  tipo_id uuid,
  tipo_nombre text,
  tiempo_guia_min numeric,
  nota text,
  justificacion_desvio text,
  inicio timestamptz,
  fin timestamptz,
  creado_por uuid
)
language sql
security definer
set search_path = public
stable
as $$
  with t as (
    select tu.id, tu.area_id, tu.estado, v.desde, v.hasta
    from turnos tu
    cross join lateral ventana_paradas_turno(tu.id) v
    where tu.id = p_turno_id
  )
  select p.id, p.linea_id, p.clase, p.origen, p.tipo_id, p.tipo_nombre, p.tiempo_guia_min, p.nota,
         p.justificacion_desvio, p.inicio, p.fin, p.creado_por
  from paradas p
  where p.turno_id = p_turno_id
  union all
  select p.id, p.linea_id, p.clase, p.origen, p.tipo_id, p.tipo_nombre, p.tiempo_guia_min, p.nota,
         p.justificacion_desvio,
         greatest(p.inicio, t.desde),
         case
           when t.estado = 'ABIERTO' then (case when p.fin is null then null else least(p.fin, t.hasta) end)
           else least(coalesce(p.fin, t.hasta), t.hasta)
         end,
         p.creado_por
  from t
  join lineas l on l.area_id = t.area_id
  join paradas p on p.linea_id = l.id
                and p.turno_id is null
                and p.inicio < t.hasta
                and coalesce(p.fin, t.hasta) > t.desde;
$$;

-- ventanas_turnos_paradas(): igual que 20261112690000, con la misma ventana
-- (fin vacío = el turno sigue abierto).
create or replace function ventanas_turnos_paradas(p_area text, p_desde date, p_hasta date)
returns table (
  turno_id uuid,
  turno_tipo_codigo text,
  desde text,
  hasta text
)
language sql
security definer
set search_path = public
stable
as $$
  select tu.id,
         tt.codigo,
         to_char(v.desde at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
         case when tu.estado = 'CERRADO' and tu.fecha_fin is not null and tu.hora_fin is not null
              then to_char(v.hasta at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS') end
  from turnos tu
  join areas a on a.id = tu.area_id
  join turno_tipos tt on tt.id = tu.turno_tipo_id
  cross join lateral ventana_paradas_turno(tu.id) v
  where a.codigo = p_area
    and tu.fecha between p_desde - 1 and p_hasta
  order by tu.fecha, tu.hora_inicio;
$$;
grant execute on function ventanas_turnos_paradas(text, date, date) to anon, authenticated;
