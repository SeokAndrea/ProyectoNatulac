-- ============================================================
-- SERVICIOS INDUSTRIALES: historial de lecturas ("Registros del Área")
-- ============================================================
-- servicios_industriales_lecturas ya es un log append-only (una fila
-- por carga, ver 20261012090000/20261045090000) — solo faltaba una
-- función para listarlo; lectura_servicios_industriales_actual() solo
-- trae la más reciente. Mismas columnas de esa función (mapeo directo
-- en el frontend, ver src/lib/panelProduccion.ts).
-- ============================================================

create or replace function listar_lecturas_servicios_industriales(p_limite integer default 100)
returns table (
  temperatura_quantum numeric,
  agua_osmotizada numeric,
  gasoil numeric,
  actualizado_en timestamptz,
  actualizado_por_nombre text
)
language sql
security definer
set search_path = public
stable
as $$
  select l.temperatura_quantum, l.agua_osmotizada, l.gasoil, l.creado_en, u.nombre
  from servicios_industriales_lecturas l
  left join usuarios u on u.id = l.usuario_id
  order by l.creado_en desc
  limit p_limite;
$$;

grant execute on function listar_lecturas_servicios_industriales(integer) to anon, authenticated;
