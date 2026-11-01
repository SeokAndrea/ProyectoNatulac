-- Personal por Áreas y Puestos, paso 2: cada persona pasa a su puesto y
-- usuario_roles se sincroniza solo desde el puesto.
-- El rol y el área de cada persona NO cambian al pasar: la migración asigna el
-- puesto con la regla de abajo y recién después instala el trigger.

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
  -- Área de Pruebas: siempre Probador
  if p_area = 'PRUEBAS' then
    return query select 'PROBADOR'::text, null::text; return;
  end if;
  if p_rol = 'SUPERADMINISTRADOR' then
    return query select 'SUPERADMINISTRADOR'::text, null::text; return;
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

-- Frena si alguien (menos «sistema») tiene una combinación que la regla no cubre.
-- Mira usuario_roles, no puesto_id; el mensaje lista usuario · rol · área · cargo.
create or replace function personal_exigir_puestos()
returns void
language plpgsql
stable
as $$
declare
  v_lista text;
begin
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

-- 1) Frena con la lista si hay combinaciones raras
select personal_exigir_puestos();

-- 2) Asigna puesto y título a cada persona (menos «sistema»)
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

-- 4) usuario_roles se sincroniza solo desde el puesto (se instala DESPUÉS del paso,
--    así el paso inicial no toca usuario_roles)
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
