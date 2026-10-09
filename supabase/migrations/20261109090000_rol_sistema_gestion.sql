-- ============================================================
-- ROL «SISTEMA DE GESTIÓN»: ve todas las pantallas, no cambia nada
-- ============================================================
-- Dueño, 2026-10-09. Entra a todas las apps (menos Personal y Errores)
-- de solo lectura. La app le bloquea cualquier RPC que no sea de lectura
-- (src/lib/soloLectura.ts). Acá solo lleva los dos permisos de VER que
-- piden las lecturas del servidor: AUDITORIA_VER (listar_auditoria,
-- listar_actas, turno_detalle, listar_turnos_historial…) y RESUMEN_VER
-- (puede_ver_resumen_dia). Ninguno de los dos habilita una escritura.
-- ============================================================

insert into roles (codigo, nombre) values ('GESTION', 'Sistema de Gestión')
on conflict (codigo) do nothing;

insert into rol_permisos (rol_id, permiso_codigo)
select r.id, v.permiso
from roles r
join (values
  ('GESTION', 'AUDITORIA_VER'),
  ('GESTION', 'RESUMEN_VER')
) as v(rol, permiso) on v.rol = r.codigo
on conflict do nothing;
