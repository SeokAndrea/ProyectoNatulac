-- ============================================================
-- ÁREA OTROS (de apoyo)
-- ============================================================
-- Dueño, 2026-10-09: para quien no es de ningún área de la planta
-- (Presidencia, otras gerencias) y sobre todo quiere mirar el Panel. Se
-- usa con el rol Solo Vista o Sistema de Gestión. Es de apoyo en la app
-- (src/lib/catalogos.ts): no ve tarjetas de producción y los paneles le
-- muestran Aséptico. No lleva lógica propia en el servidor.
-- ============================================================

insert into areas (codigo, nombre) values ('OTROS', 'Otros')
on conflict (codigo) do nothing;
