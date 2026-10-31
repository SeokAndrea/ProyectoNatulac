-- ============================================================
-- Catálogo de Paradas: VER para todos, EDITAR con permiso
-- ============================================================
-- Dueña, 2026-10-31: todos pueden consultar los códigos (fallas de equipos y
-- otras paradas); agregar y cambiar sigue siendo CATALOGO_PARADAS (Jefe de
-- Producción, y por persona el jefe de Mantenimiento). VER va por defecto a
-- todos los roles; desde Personal se le puede quitar o dar a quien sea.
-- La lectura (listar_catalogo_fallas, listar_paradas_tipos) ya era abierta:
-- esto solo decide quién ve la tarjeta.
-- ============================================================

insert into permisos (codigo, nombre) values ('CATALOGO_PARADAS_VER', 'Ver Catálogo de Paradas')
on conflict (codigo) do nothing;

insert into rol_permisos (rol_id, permiso_codigo)
select r.id, 'CATALOGO_PARADAS_VER' from roles r
on conflict do nothing;
