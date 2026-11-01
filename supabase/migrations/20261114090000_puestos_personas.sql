-- Personal por Áreas y Puestos, paso 2: cada persona pasa a su puesto y
-- usuario_roles se sincroniza solo desde el puesto.
-- Orden: frena si hay personas con más de una fila en usuario_roles o con una
-- combinación que la regla no cubre; asigna el puesto con la regla de abajo;
-- instala el trigger; y al final deja usuario_roles igual al rol equivalente y al
-- área del puesto de cada persona (auditado como «sistema»), así la sesión
-- (perfil_sesion lee el puesto) y las funciones que miran usuario_roles coinciden.

alter table usuarios add column if not exists puesto_id uuid references puestos (id);
alter table usuarios add column if not exists titulo text;
comment on column usuarios.puesto_id is 'Puesto de la persona. De él salen el rol y el área de usuario_roles (20261114090000).';
comment on column usuarios.titulo is 'Título visible opcional (ej. Analista de Producción, Subjefe, Presidencia).';

-- La regla de paso: rol + área + cargo + área de origen -> puesto y título.
-- Devuelve cero filas si la combinación no está en la tabla: no se adivina.
-- p_area_origen es el NOMBRE del área de origen (para el título de Solo Vista).
create or replace function puesto_para(p_rol text, p_area text, p_cargo text, p_area_origen text)
returns table (puesto_codigo text, titulo text)
language plpgsql
stable
as $$
declare
  v_aseptico boolean := p_area is not distinct from 'ASEPTICO';
  v_aseptico_o_sin boolean := p_area is null or p_area = 'ASEPTICO';
begin
  -- Super Administrador sigue siendo Super Administrador aunque su área sea Pruebas
  if p_rol = 'SUPERADMINISTRADOR' then
    return query select 'SUPERADMINISTRADOR'::text, null::text; return;
  end if;
  -- Área de Pruebas: siempre Probador
  if p_area = 'PRUEBAS' then
    return query select 'PROBADOR'::text, null::text; return;
  end if;
  -- Cargo SUBJEFE en Aséptico (cualquier rol)
  if p_cargo = 'SUBJEFE' and v_aseptico then
    return query select 'COORDINADOR_PRODUCCION'::text, 'Subjefe'::text; return;
  end if;
  if p_cargo = 'PASANTE' and v_aseptico_o_sin then
    return query select 'PASANTE'::text, null::text; return;
  end if;
  if p_rol = 'JEFE_PRODUCCION' and v_aseptico_o_sin then
    return query select 'JEFE_PRODUCCION'::text, null::text; return;
  end if;
  if p_rol = 'ANALISTA' and v_aseptico_o_sin then
    return query select 'COORDINADOR_PRODUCCION'::text, 'Analista de Producción'::text; return;
  end if;
  if p_rol = 'SUPERVISOR' and v_aseptico_o_sin then
    return query select 'SUPERVISOR'::text, null::text; return;
  end if;
  if p_rol = 'MANTENIMIENTO' and (p_area is null or p_area = 'MANTENIMIENTO') then
    return query select (case p_cargo
        when 'JEFE_MANTENIMIENTO' then 'JEFE_MANTENIMIENTO'
        when 'SUPERVISOR_MANTENIMIENTO' then 'SUPERVISOR_MANTENIMIENTO'
        else 'TECNICO_MANTENIMIENTO' end)::text, null::text;
    return;
  end if;
  if p_rol = 'SERVICIOS_INDUSTRIALES' and (p_area is null or p_area = 'SERVICIOS_INDUSTRIALES') then
    return query select 'SERVICIOS_INDUSTRIALES'::text, null::text; return;
  end if;
  if p_rol = 'VISTA' and (p_area is null or p_area in ('OTROS', 'ASEPTICO')) then
    return query select 'SOLO_VISTA'::text, nullif(btrim(p_area_origen), '')::text; return;
  end if;
  if p_rol = 'CALIDAD' and (p_area is null or p_area = 'CALIDAD') then
    return query select 'ANALISTA_CALIDAD'::text, null::text; return;
  end if;
  if p_rol = 'SUPERVISOR_CALIDAD' and (p_area is null or p_area = 'CALIDAD') then
    return query select 'SUPERVISOR_CALIDAD'::text, null::text; return;
  end if;
  -- Cualquier otra combinación: sin puesto
end;
$$;

-- Frena si alguien (menos «sistema») tiene más de una fila en usuario_roles (el paso
-- no sabría cuál tomar) o una combinación que la regla no cubre.
-- Mira usuario_roles, no puesto_id; los mensajes listan a cada persona.
create or replace function personal_exigir_puestos()
returns void
language plpgsql
stable
as $$
declare
  v_lista text;
begin
  select string_agg(format('%s · %s', x.usuario, x.filas), E'\n' order by x.usuario)
    into v_lista
    from (
      select u.usuario,
             string_agg(format('%s / %s', r.codigo, coalesce(a.codigo, 'sin área')), ', '
                        order by r.codigo, a.codigo) as filas
        from usuarios u
        join usuario_roles ur on ur.usuario_id = u.id
        join roles r on r.id = ur.rol_id
        left join areas a on a.id = ur.area_id
       where u.usuario <> 'sistema'
       group by u.usuario
      having count(*) > 1
    ) x;
  if v_lista is not null then
    raise exception E'Personas con más de un rol (deja una sola fila en usuario_roles y vuelve a aplicar):\n%', v_lista;
  end if;

  select string_agg(format('%s · %s · %s · %s', x.usuario, coalesce(x.rol, 'sin rol'),
                           coalesce(x.area, 'sin área'), coalesce(x.cargo, 'sin cargo')),
                    E'\n' order by x.usuario)
    into v_lista
    from (
      select u.usuario, r.codigo as rol, a.codigo as area, u.cargo, ao.nombre as origen
        from usuarios u
        left join usuario_roles ur on ur.usuario_id = u.id
        left join roles r on r.id = ur.rol_id
        left join areas a on a.id = ur.area_id
        left join areas ao on ao.id = u.area_origen_id
       where u.usuario <> 'sistema'
    ) x
   where not exists (select 1 from puesto_para(x.rol, x.area, x.cargo, x.origen) pp where pp.puesto_codigo is not null);
  if v_lista is not null then
    raise exception E'Personas sin puesto (usuario · rol · área · cargo):\n%', v_lista;
  end if;
end;
$$;

-- Asigna puesto y título a cada persona que todavía no tiene (menos «sistema»).
create or replace function personal_asignar_puestos()
returns void
language sql
as $$
  update usuarios u
     set puesto_id = p.id,
         titulo = pp.titulo
    from (
      select u2.id as uid, r.codigo as rol, a.codigo as area, u2.cargo, ao.nombre as origen
        from usuarios u2
        left join usuario_roles ur on ur.usuario_id = u2.id
        left join roles r on r.id = ur.rol_id
        left join areas a on a.id = ur.area_id
        left join areas ao on ao.id = u2.area_origen_id
       where u2.usuario <> 'sistema'
    ) x
    cross join lateral puesto_para(x.rol, x.area, x.cargo, x.origen) pp
    join puestos p on p.codigo = pp.puesto_codigo
   where u.id = x.uid and u.puesto_id is null;
$$;

-- Deja usuario_roles igual al rol equivalente y al área del puesto de cada persona.
-- Una fila de Auditoría (como «sistema») por persona que cambia. Devuelve cuántas cambiaron.
create or replace function personal_sincronizar_roles()
returns integer
language plpgsql
as $$
declare
  c record;
  v_n integer := 0;
begin
  for c in
    select u.id, u.nombre, r.codigo as rol_antes, a.codigo as area_antes,
           rp.codigo as rol_despues, ap.codigo as area_despues,
           r.nombre as rol_antes_nombre, a.nombre as area_antes_nombre,
           rp.nombre as rol_despues_nombre, ap.nombre as area_despues_nombre,
           p.rol_equivalente_id, p.area_id
      from usuarios u
      join puestos p on p.id = u.puesto_id
      join roles rp on rp.id = p.rol_equivalente_id
      left join areas ap on ap.id = p.area_id
      left join usuario_roles ur on ur.usuario_id = u.id
      left join roles r on r.id = ur.rol_id
      left join areas a on a.id = ur.area_id
     where u.usuario <> 'sistema'
       and (ur.usuario_id is null
            or ur.rol_id is distinct from p.rol_equivalente_id
            or ur.area_id is distinct from p.area_id)
     order by u.usuario
  loop
    delete from usuario_roles where usuario_id = c.id;
    insert into usuario_roles (usuario_id, rol_id, area_id) values (c.id, c.rol_equivalente_id, c.area_id);
    perform registrar_auditoria(
      'sistema', 'EDITAR', 'personal', c.id::text, 'Paso a puestos (20261114090000)',
      format('Rol y área de %s según su puesto: %s · %s → %s · %s', c.nombre,
             coalesce(c.rol_antes_nombre, 'sin rol'), coalesce(c.area_antes_nombre, 'sin área'),
             c.rol_despues_nombre, coalesce(c.area_despues_nombre, 'sin área')),
      jsonb_build_object('rol', c.rol_antes, 'area', c.area_antes),
      jsonb_build_object('rol', c.rol_despues, 'area', c.area_despues)
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Funciones de la migración y del script de revisión: la app no las llama.
revoke execute on function puesto_para(text, text, text, text) from public;
revoke execute on function personal_exigir_puestos() from public;
revoke execute on function personal_asignar_puestos() from public;
revoke execute on function personal_sincronizar_roles() from public;

-- 1) Frena con la lista si hay personas con más de un rol o combinaciones raras
select personal_exigir_puestos();

-- 2) Asigna puesto y título a cada persona (menos «sistema»)
select personal_asignar_puestos();

-- 3) Todas las personas (menos «sistema») deben tener puesto
do $$
declare
  v_n int;
begin
  select count(*) into v_n from usuarios where puesto_id is null and usuario <> 'sistema';
  if v_n > 0 then raise exception '% personas quedaron sin puesto', v_n; end if;
end $$;

-- «sistema» es la única cuenta sin puesto (la usa la base, no entra nadie con ella)
do $$ begin
  alter table usuarios add constraint usuarios_puesto_obligatorio
    check (puesto_id is not null or usuario = 'sistema');
exception when duplicate_object then null; end $$;

-- 4) usuario_roles se sincroniza solo desde el puesto, y solo cuando el puesto
--    cambia de verdad (editar solo el nombre o la cédula no reescribe el rol)
create or replace function usuarios_sincroniza_rol()
returns trigger
language plpgsql
as $$
declare
  v_rol uuid;
  v_area uuid;
begin
  if new.puesto_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.puesto_id is not distinct from new.puesto_id then
    return new;
  end if;
  select rol_equivalente_id, area_id into v_rol, v_area from puestos where id = new.puesto_id;

  delete from usuario_roles
   where usuario_id = new.id
     and not (rol_id = v_rol and area_id is not distinct from v_area);

  insert into usuario_roles (usuario_id, rol_id, area_id)
  select new.id, v_rol, v_area
   where not exists (
     select 1 from usuario_roles
      where usuario_id = new.id and rol_id = v_rol and area_id is not distinct from v_area);
  return new;
end;
$$;

drop trigger if exists usuarios_sincroniza_rol on usuarios;
create trigger usuarios_sincroniza_rol
  after insert or update of puesto_id on usuarios
  for each row execute function usuarios_sincroniza_rol();

-- 5) Desde hoy el rol y el área de la sesión salen del puesto: usuario_roles queda
--    igual para todos (una fila de Auditoría por persona que cambia). Quién cambia
--    lo lista antes scripts/revisar-personal-puestos.sql (columna cambia_acceso).
select personal_sincronizar_roles();
