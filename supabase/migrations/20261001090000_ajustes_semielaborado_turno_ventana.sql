-- ============================================================
-- ajustes_semielaborado_turno(): solo las correcciones hechas EN el turno
-- ============================================================
-- Listaba TODAS las correcciones de volumen (preparaciones_ajuste) de
-- cualquier lote que el turno tocó, sin importar en qué turno se
-- hicieron. Con lotes que cruzan de turno (heredados), aparecía en el
-- desglose de un supervisor una corrección que hizo OTRO supervisor en
-- SU turno — confuso ("¿por qué veo a Javier en el turno de Danny?").
--
-- La corrección de un turno anterior ya está reflejada en el volumen
-- de arranque de este turno (volumen_l_inicio congelado), así que no
-- corresponde volver a mostrarla acá.
--
-- No se puede filtrar por preparaciones_ajuste.turno_id: ese campo
-- guarda el turno donde NACIÓ el lote (viene de preparaciones.turno_id
-- en el trigger), no el turno donde se hizo la corrección. Se filtra
-- por la VENTANA de tiempo del turno: [inicio, fin] para un turno
-- CERRADO, [inicio, now()] para uno ABIERTO. Un T3 que cruza medianoche
-- queda cubierto porque fecha_fin puede ser el día siguiente.
-- ============================================================

create or replace function ajustes_semielaborado_turno(p_turno_id uuid)
returns table (
  lote text,
  sabor text,
  volumen_teorico numeric,
  volumen_real numeric,
  diferencia numeric,
  usuario_nombre text,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde timestamptz;
  v_hasta timestamptz;
begin
  select
    t.fecha + t.hora_inicio,
    case
      when t.estado = 'CERRADO' and t.fecha_fin is not null
        then t.fecha_fin + coalesce(t.hora_fin, time '23:59:59')
      else now()
    end
  into v_desde, v_hasta
  from turnos t
  where t.id = p_turno_id;

  return query
  select
    p.lote,
    coalesce(sabor_display(s.nombre, f.nombre), '—'),
    a.volumen_teorico,
    a.volumen_real,
    a.diferencia,
    u.nombre,
    a.creado_en
  from preparaciones_ajuste a
  join preparaciones p on p.id = a.lote_id
  left join sabores s on s.id = p.sabor_id
  left join familias_producto f on f.id = s.familia_id
  left join usuarios u on u.id = a.usuario_id
  where a.lote_id in (
    select distinct tl.lote_id
    from turno_lineas tl
    where tl.turno_id = p_turno_id and tl.lote_id is not null
  )
  and a.creado_en >= v_desde
  and a.creado_en <= v_hasta
  order by a.creado_en;
end;
$$;

grant execute on function ajustes_semielaborado_turno(uuid) to anon, authenticated;
