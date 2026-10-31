-- ============================================================
-- SWITCH del catálogo modular, por área
-- ============================================================
-- Spec: docs/superpowers/specs/2026-10-31-catalogo-fallas-modular-design.md
-- Como «Calidad libera» y «Mantenimiento termina las fallas»: un interruptor
-- por área que solo la dueña cambia (Edición de Datos → Ajustes de planta).
-- Encendido: las fallas de equipo se registran con el catálogo Equipo ›
-- Sistema › Subsistema › Falla; apagado, con el anterior.
--
-- Decisiones (dueña, 2026-10-31):
--   * La SIF EMPIEZA DE CERO el día del switch, contando por falla nueva. Sin
--     tabla de equivalencias viejo → nuevo: lo anterior queda como está,
--     marcado «catálogo anterior» en los reportes.
--   * Todas las líneas del área a la vez.
-- catalogo_modular_desde guarda cuándo se prendió (la primera vez de cada
-- encendido): desde ahí cuentan la SIF y los reportes del catálogo nuevo.
-- Pruebas arranca encendido para ensayar.
-- ============================================================

alter table areas add column if not exists catalogo_modular boolean not null default false;
alter table areas add column if not exists catalogo_modular_desde timestamptz;
update areas set catalogo_modular = true, catalogo_modular_desde = now() where codigo = 'PRUEBAS' and not catalogo_modular;
comment on column areas.catalogo_modular is 'Encendido: las fallas de equipo usan el catálogo modular (20261113790000).';
comment on column areas.catalogo_modular_desde is 'Desde cuándo está encendido el catálogo modular; la SIF y los reportes nuevos cuentan desde acá.';

-- Sin área (dueña / Super Admin): Aséptico, como mantenimiento_finaliza_area().
create or replace function catalogo_modular_area(p_area_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select catalogo_modular from areas where codigo = coalesce(p_area_codigo, 'ASEPTICO')), false);
$$;
grant execute on function catalogo_modular_area(text) to anon, authenticated;

create or replace function guardar_catalogo_modular(p_usuario text, p_area_codigo text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area areas;
begin
  if not es_dueno(p_usuario) then
    raise exception 'Solo el dueño puede cambiar este ajuste.';
  end if;
  select * into v_area from areas where codigo = p_area_codigo for update;
  if not found then
    raise exception 'Esa área no existe.';
  end if;
  update areas
  set catalogo_modular = p_activo,
      catalogo_modular_desde = case when p_activo and not v_area.catalogo_modular then now() else catalogo_modular_desde end
  where id = v_area.id;
  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'catalogo_modular', v_area.id::text, 'Edición de Datos',
    case when p_activo then 'Prendió' else 'Apagó' end || ' el catálogo de paradas nuevo en ' || p_area_codigo,
    jsonb_build_object('catalogo_modular', v_area.catalogo_modular, 'desde', v_area.catalogo_modular_desde),
    jsonb_build_object('catalogo_modular', p_activo)
  );
end;
$$;
grant execute on function guardar_catalogo_modular(text, text, boolean) to anon, authenticated;

-- Regla de 20261109690000: cada función nueva con p_usuario revisa que sea el de la credencial.
select * from asegurar_control_usuario();
