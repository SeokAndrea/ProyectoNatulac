-- ============================================================
-- CALCULADORA DE BOBINA: el redondeo hacia arriba NO es igual para
-- todos los tipos en el Excel de origen
-- ============================================================
-- Revisando el Excel real ("Control de Existencias", hoja "Cálculos"):
-- de los 5 bloques "CALCULO DE ENVASES ...", solo los 3 de tipo TP
-- (250cc/200cc/330cc) envuelven la fórmula en ROUNDUP. Los 2 de tipo
-- TB (1000cc/500cc) NO tienen ROUNDUP — es la división cruda, y la
-- celda se ve como entero solo porque su formato numérico ("0")
-- redondea al más cercano para MOSTRARLA, no porque la fórmula suba
-- siempre. Con TB 500cc + B=38.5 eso importa: la cruda da 6926.4977
-- (Excel muestra 6926, redondeo normal) pero nuestra calculadora,
-- redondeando siempre hacia arriba, daba 6927 — un envase de más que
-- lo que Daniela ve en el Excel.
--
-- Se agrega la bandera por tipo en vez de asumir un solo criterio
-- global.
-- ============================================================

alter table tipos_bobina add column redondear_hacia_arriba boolean not null default true;

update tipos_bobina set redondear_hacia_arriba = false where nombre in ('TB 1000cc', 'TB 500cc');

drop function if exists listar_tipos_bobina();

create function listar_tipos_bobina()
returns table (
  tipo_id uuid,
  nombre text,
  diametro_core_cm numeric,
  espesor_cm numeric,
  largo_envase_cm numeric,
  redondear_hacia_arriba boolean,
  activo boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select t.id, t.nombre, t.diametro_core_cm, t.espesor_cm, t.largo_envase_cm, t.redondear_hacia_arriba, t.activo
  from tipos_bobina t
  order by t.nombre;
end;
$$;

grant execute on function listar_tipos_bobina() to anon, authenticated;
