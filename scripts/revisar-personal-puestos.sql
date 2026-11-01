-- Lista «persona -> puesto nuevo» para que la dueña la revise ANTES de aplicar en planta.
-- Solo lee: calcula el paso con puesto_para (20261114090000) sobre el rol, área y cargo de hoy.
-- Funciona aunque las personas aún no se hayan pasado (lee usuario_roles, no puesto_id).
-- cambia_acceso = «sí» si el puesto daría un rol o área distintos a los de hoy.
select u.usuario,
       trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) as nombre,
       r.codigo as rol_antes,
       a.codigo as area_antes,
       u.cargo as cargo_antes,
       coalesce(p.nombre, 'SIN PUESTO') as puesto,
       pp.titulo,
       case when p.id is null then null
            when p.rol_equivalente_id = r.id and p.area_id is not distinct from a.id then 'no'
            else 'sí' end as cambia_acceso
  from usuarios u
  left join usuario_roles ur on ur.usuario_id = u.id
  left join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  left join areas ao on ao.id = u.area_origen_id
  left join lateral puesto_para(r.codigo, a.codigo, u.cargo, ao.nombre) pp on true
  left join puestos p on p.codigo = pp.puesto_codigo
 where u.usuario <> 'sistema'
 order by (p.id is null) desc, p.nivel nulls last, p.nombre, u.usuario;
