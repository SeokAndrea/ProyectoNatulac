-- ============================================================
-- SIF: la observación de cada parada del historial (dueña, 2026-11-13)
-- ============================================================
-- Para escribir una solicitud sensata hay que leer qué pasó cada vez que se
-- repitió la falla: listar_paradas_sif() devuelve también lo que escribió
-- Producción («Qué pasó», paradas.nota) y lo que hizo Mantenimiento
-- («¿Qué se realizó?», paradas.solucion). Se ven en el Historial de fallas y
-- en el acta PDF. Solo lectura: no cambia nada guardado.
--
-- Copia de 20261113890000 + nota y solucion (cambia lo que devuelve: se
-- borra y se vuelve a crear).
-- ============================================================

drop function if exists listar_paradas_sif(text, uuid);

create function listar_paradas_sif(p_usuario text, p_sif_id uuid)
returns table (parada_id uuid, inicio timestamptz, fin timestamptz, origen text, equipo text, subsistema text, registro text, responsable text,
               nota text, solucion text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_usuario('listar_paradas_sif', p_usuario);
  if not usuario_activo_sif(p_usuario) then
    raise exception 'Usuario no válido.';
  end if;

  return query
  select p.id, p.inicio, p.fin, p.origen,
         -- Del Sheet: lo que escribió Mantenimiento. Con falla del catálogo modular: su equipo y
         -- «falla · subsistema». Si no, el equipo del tipo y el tipo mismo.
         case when p.origen = 'SHEET' then nullif(p.mtto_equipo, '') else coalesce(ce.nombre, te.nombre) end,
         case when p.origen = 'SHEET' then nullif(p.mtto_subsistema, '') else coalesce(f.nombre || ' · ' || cu.nombre, t.nombre) end,
         case when p.origen = 'SHEET' then 'Sheet de Mantenimiento' else coalesce(u.nombre, u.usuario) end,
         p.responsable,
         nullif(btrim(p.nota), ''),
         nullif(btrim(p.solucion), '')
  from paradas p
  left join paradas_tipos t on t.id = p.tipo_id
  left join paradas_equipos te on te.id = t.equipo_id
  left join catalogo_fallas f on f.id = coalesce(p.falla_final_id, p.falla_produccion_id)
  left join catalogo_subsistemas cu on cu.id = f.subsistema_id
  left join catalogo_sistemas cs on cs.id = cu.sistema_id
  left join catalogo_equipos ce on ce.id = cs.equipo_id
  left join usuarios u on u.id = p.creado_por
  where p.sif_id = p_sif_id
  order by p.inicio;
end;
$$;
grant execute on function listar_paradas_sif(text, uuid) to anon, authenticated;
