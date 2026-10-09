-- ============================================================
-- ROL «SOLO VISTA»: mira los paneles, no hace nada
-- ============================================================
-- Dueño, 2026-10-09: un rol para quien solo tiene que mirar. Entra directo
-- al Panel de Producción y con una flecha pasa al Panel de Paradas; no ve
-- ninguna otra pantalla. No lleva permisos (rol_permisos vacío): cualquier
-- función que pida tiene_permiso() lo rechaza. Lo que ve y lo que no lo
-- decide la app (src/lib/rolVista.ts).
-- ============================================================

insert into roles (codigo, nombre) values ('VISTA', 'Solo Vista')
on conflict (codigo) do nothing;
