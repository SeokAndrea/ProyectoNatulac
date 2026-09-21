-- ============================================================
-- "MIS ACTAS": un supervisor puede ver/descargar las actas de SUS
-- propios turnos, sin pasar por Auditoría (esa pestaña sigue siendo
-- solo SUPERADMINISTRADOR / ADMINISTRADOR_AREA — ver listar_actas()).
-- ============================================================
-- Hoy el único momento en que un supervisor ve el link de su acta es
-- justo al finalizar el turno (FinalizarTurno.tsx) — si navega a otro
-- lado, lo pierde. mis_actas() no exige rol: cualquier usuario logueado
-- puede pedir SUS PROPIAS actas (filtra por supervisor_id = su propio
-- usuario, no hay parámetro para pedir las de otro). Solo la versión
-- VIGENTE de cada turno — el historial de versiones anuladas es cosa
-- de Auditoría, no de esta vista.
-- ============================================================

create function mis_actas(p_usuario text, p_limite integer default 100)
returns table (
  acta_id uuid,
  turno_id uuid,
  codigo text,
  storage_path text,
  generado_en timestamptz,
  turno_codigo text,
  fecha date,
  turno_tipo_codigo text,
  grupo_codigo text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select ac.id, ac.turno_id, ac.codigo, ac.storage_path, ac.generado_en,
         t.codigo, t.fecha, tt.codigo, g.codigo
  from actas ac
  join turnos t on t.id = ac.turno_id
  join usuarios u on u.id = t.supervisor_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  where u.usuario = lower(p_usuario)
    and ac.estado = 'VIGENTE'
  order by ac.generado_en desc
  limit p_limite;
end;
$$;

grant execute on function mis_actas(text, integer) to anon, authenticated;
