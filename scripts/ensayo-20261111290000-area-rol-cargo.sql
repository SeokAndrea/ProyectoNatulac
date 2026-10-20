-- ============================================================
-- Ensayo de 20261111290000_limpiar_area_rol_cargo.sql
-- Correr ANTES de aplicar la migración. Solo lee: no cambia nada.
-- ============================================================

-- 1. A quién mueve la migración y a qué rol.
--    Revisar que estén el Jefe y la Analista (no la dueña) y la gente de
--    Servicios Industriales. Gestión pasa a Solo Vista.
select u.usuario, u.nombre, u.cargo,
       r.codigo as rol_hoy, a.codigo as area_hoy,
       case
         when r.codigo = 'SUPERADMINISTRADOR' and u.cargo = 'JEFE_PRODUCCION' then 'JEFE_PRODUCCION'
         when r.codigo = 'SUPERADMINISTRADOR' and u.cargo = 'ANALISTA_PRODUCCION' then 'ANALISTA'
         when r.codigo = 'GESTION' then 'VISTA'
         else 'SERVICIOS_INDUSTRIALES'
       end as rol_nuevo,
       case when r.codigo = 'SUPERADMINISTRADOR' then 'ASEPTICO' else a.codigo end as area_nueva
from usuarios u
join usuario_roles ur on ur.usuario_id = u.id
join roles r on r.id = ur.rol_id
left join areas a on a.id = ur.area_id
where u.usuario <> 'sistema'
  and (
    (r.codigo = 'SUPERADMINISTRADOR' and not coalesce(u.ve_errores, false)
       and u.cargo in ('JEFE_PRODUCCION', 'ANALISTA_PRODUCCION'))
    or r.codigo = 'GESTION'
    or (a.codigo = 'SERVICIOS_INDUSTRIALES' and r.codigo not in ('SUPERADMINISTRADOR', 'SERVICIOS_INDUSTRIALES'))
  )
order by rol_nuevo, u.nombre;

-- 2. Quiénes siguen siendo Super Administrador después (deberían ser
--    solo técnicos y la dueña).
select u.usuario, u.nombre, u.cargo, a.codigo as area, u.ve_errores as es_duena
from usuarios u
join usuario_roles ur on ur.usuario_id = u.id
join roles r on r.id = ur.rol_id
left join areas a on a.id = ur.area_id
where r.codigo = 'SUPERADMINISTRADOR'
  and not (not coalesce(u.ve_errores, false) and u.cargo in ('JEFE_PRODUCCION', 'ANALISTA_PRODUCCION'))
order by u.nombre;

-- 3. Quién tiene "Gestionar personal" como permiso EXTRA: desde ahora ve
--    y gestiona el personal de TODAS las áreas.
select u.usuario, u.nombre, r.codigo as rol, a.codigo as area
from usuario_permisos up
join usuarios u on u.id = up.usuario_id
join usuario_roles ur on ur.usuario_id = u.id
join roles r on r.id = ur.rol_id
left join areas a on a.id = ur.area_id
where up.permiso_codigo = 'PERSONAL_GESTIONAR';

-- 4. Quedarían fuera de la regla nueva rol ↔ área (la migración NO los
--    toca; solo fallaría al editarlos en Personal). Debería salir vacío.
--    Si aparece alguien de Gestión en Calidad, la migración se detiene:
--    avisar antes de aplicar.
select u.usuario, u.nombre, r.codigo as rol, a.codigo as area
from usuarios u
join usuario_roles ur on ur.usuario_id = u.id
join roles r on r.id = ur.rol_id
left join areas a on a.id = ur.area_id
where u.usuario <> 'sistema'
  and (
    (a.codigo = 'OTROS' and r.codigo not in ('VISTA', 'GESTION'))
    or (a.codigo = 'CALIDAD' and r.codigo not in ('CALIDAD', 'SUPERVISOR_CALIDAD'))
    or (a.codigo = 'SERVICIOS_INDUSTRIALES' and r.codigo = 'SUPERADMINISTRADOR')
  );
