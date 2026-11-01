-- Ensayo Task 2: paso de las personas a puestos y sincronía con usuario_roles.
-- Todo dentro de una transacción con rollback.
begin;

create temp table _snap on commit drop as
  select u.usuario, r.codigo as rol, a.codigo as area
    from usuarios u
    join usuario_roles ur on ur.usuario_id = u.id
    join roles r on r.id = ur.rol_id
    left join areas a on a.id = ur.area_id;

do $$
declare
  v_n int;
  v_pc text;
  v_t text;
  v_msg text;
  v_u uuid;
  r record;
begin
  -- puesto_para: un caso por cada renglón de la tabla de la sección 5, más Pruebas
  for r in select * from (values
    ('JEFE_PRODUCCION', 'ASEPTICO', null, null, 'JEFE_PRODUCCION', null),
    ('ANALISTA', 'ASEPTICO', 'ANALISTA_PRODUCCION', null, 'COORDINADOR_PRODUCCION', 'Analista de Producción'),
    ('ANALISTA', 'ASEPTICO', null, null, 'COORDINADOR_PRODUCCION', 'Analista de Producción'),
    ('SUPERVISOR', 'ASEPTICO', 'SUBJEFE', null, 'COORDINADOR_PRODUCCION', 'Subjefe'),
    ('ANALISTA', 'ASEPTICO', 'SUBJEFE', null, 'COORDINADOR_PRODUCCION', 'Subjefe'),
    ('SUPERVISOR', 'ASEPTICO', null, null, 'SUPERVISOR', null),
    ('SUPERVISOR', null, null, null, 'SUPERVISOR', null),
    ('SUPERVISOR', 'ASEPTICO', 'PASANTE', null, 'PASANTE', null),
    ('MANTENIMIENTO', 'MANTENIMIENTO', 'JEFE_MANTENIMIENTO', null, 'JEFE_MANTENIMIENTO', null),
    ('MANTENIMIENTO', 'MANTENIMIENTO', 'SUPERVISOR_MANTENIMIENTO', null, 'SUPERVISOR_MANTENIMIENTO', null),
    ('MANTENIMIENTO', 'MANTENIMIENTO', 'TECNICO_MANTENIMIENTO', null, 'TECNICO_MANTENIMIENTO', null),
    ('MANTENIMIENTO', 'MANTENIMIENTO', null, null, 'TECNICO_MANTENIMIENTO', null),
    ('SERVICIOS_INDUSTRIALES', 'SERVICIOS_INDUSTRIALES', null, null, 'SERVICIOS_INDUSTRIALES', null),
    ('VISTA', 'OTROS', null, 'Presidencia', 'SOLO_VISTA', 'Presidencia'),
    ('VISTA', 'OTROS', null, null, 'SOLO_VISTA', null),
    ('VISTA', null, null, null, 'SOLO_VISTA', null),
    ('CALIDAD', 'CALIDAD', null, null, 'ANALISTA_CALIDAD', null),
    ('SUPERVISOR_CALIDAD', 'CALIDAD', null, null, 'SUPERVISOR_CALIDAD', null),
    ('SUPERVISOR', 'PRUEBAS', null, null, 'PROBADOR', null),
    ('CALIDAD', 'PRUEBAS', null, null, 'PROBADOR', null),
    ('SUPERADMINISTRADOR', null, null, null, 'SUPERADMINISTRADOR', null)
  ) as t(rol, area, cargo, origen, puesto, titulo) loop
    select pp.puesto_codigo, pp.titulo into v_pc, v_t from puesto_para(r.rol, r.area, r.cargo, r.origen) pp;
    if v_pc is distinct from r.puesto or v_t is distinct from r.titulo then
      raise exception 'puesto_para(%,%,%,%) dio (%,%) y se esperaba (%,%)', r.rol, r.area, r.cargo, r.origen, v_pc, v_t, r.puesto, r.titulo;
    end if;
  end loop;

  -- combinaciones desconocidas: sin puesto
  for r in select * from (values
    ('VISTA', 'MANTENIMIENTO', null, null),
    ('VISTA', 'SERVICIOS_INDUSTRIALES', null, null),
    ('CALIDAD', 'ASEPTICO', null, null),
    ('SUPERVISOR_CALIDAD', 'ASEPTICO', null, null),
    ('SUPERVISOR', 'MANTENIMIENTO', null, null),
    ('MANTENIMIENTO', 'ASEPTICO', null, null),
    ('ANALISTA', 'MANTENIMIENTO', null, null)
  ) as t(rol, area, cargo, origen) loop
    select count(*) into v_n from puesto_para(r.rol, r.area, r.cargo, r.origen) pp where pp.puesto_codigo is not null;
    if v_n <> 0 then raise exception 'puesto_para(%,%) debía ser desconocida', r.rol, r.area; end if;
  end loop;

  -- toda persona de la base (menos sistema) tiene puesto
  select count(*) into v_n from usuarios where puesto_id is null and usuario <> 'sistema';
  if v_n <> 0 then raise exception '% usuarios sin puesto', v_n; end if;

  -- el puesto y el título de cada persona son los que da puesto_para con su rol/área/cargo
  for r in
    select u.usuario, p.codigo as puesto, u.titulo, pp.puesto_codigo, pp.titulo as t_esp
      from usuarios u
      join puestos p on p.id = u.puesto_id
      join _snap s on s.usuario = u.usuario
      left join areas ao on ao.id = u.area_origen_id
      left join lateral puesto_para(s.rol, s.area, u.cargo, ao.nombre) pp on true
  loop
    if r.puesto is distinct from r.puesto_codigo or r.titulo is distinct from r.t_esp then
      raise exception 'Usuario %: puesto % / título % no coincide con puesto_para (% / %)', r.usuario, r.puesto, r.titulo, r.puesto_codigo, r.t_esp;
    end if;
  end loop;

  -- volver a sincronizar a todos no cambia usuario_roles
  update usuarios set puesto_id = puesto_id where puesto_id is not null;
  select count(*) into v_n from usuarios u
    join usuario_roles ur on ur.usuario_id = u.id
    join roles ro on ro.id = ur.rol_id
    left join areas a on a.id = ur.area_id
   where not exists (select 1 from _snap s where s.usuario = u.usuario and s.rol = ro.codigo and s.area is not distinct from a.codigo);
  if v_n <> 0 then raise exception 'La sincronía cambió usuario_roles de % usuarios', v_n; end if;
  select count(*) into v_n from usuario_roles ur join usuarios u on u.id = ur.usuario_id where u.puesto_id is not null;
  if v_n <> (select count(*) from usuarios where puesto_id is not null) then
    raise exception 'Cada persona debe tener exactamente una fila en usuario_roles (hay % para %)', v_n, (select count(*) from usuarios where puesto_id is not null);
  end if;

  -- persona nueva con puesto Técnico de Mantenimiento
  insert into usuarios (usuario, password_hash, nombre, puesto_id)
    select 'zz_ensayo', 'x', 'Ensayo', id from puestos where codigo = 'TECNICO_MANTENIMIENTO' returning id into v_u;
  select count(*) into v_n from usuario_roles ur join roles ro on ro.id = ur.rol_id join areas a on a.id = ur.area_id
   where ur.usuario_id = v_u and ro.codigo = 'MANTENIMIENTO' and a.codigo = 'MANTENIMIENTO';
  if v_n <> 1 then raise exception 'Insertar con puesto Técnico no dejó MANTENIMIENTO / MANTENIMIENTO'; end if;

  -- cambiar a Jefe de Producción y volver a Técnico: siempre una sola fila que sigue al puesto
  update usuarios set puesto_id = (select id from puestos where codigo = 'JEFE_PRODUCCION') where id = v_u;
  select count(*) into v_n from usuario_roles ur join roles ro on ro.id = ur.rol_id join areas a on a.id = ur.area_id
   where ur.usuario_id = v_u and ro.codigo = 'JEFE_PRODUCCION' and a.codigo = 'ASEPTICO';
  if v_n <> 1 or (select count(*) from usuario_roles where usuario_id = v_u) <> 1 then
    raise exception 'Cambiar a Jefe de Producción no dejó una sola fila JEFE_PRODUCCION / ASEPTICO';
  end if;
  update usuarios set puesto_id = (select id from puestos where codigo = 'TECNICO_MANTENIMIENTO') where id = v_u;
  select count(*) into v_n from usuario_roles ur join roles ro on ro.id = ur.rol_id join areas a on a.id = ur.area_id
   where ur.usuario_id = v_u and ro.codigo = 'MANTENIMIENTO' and a.codigo = 'MANTENIMIENTO';
  if v_n <> 1 or (select count(*) from usuario_roles where usuario_id = v_u) <> 1 then
    raise exception 'Cambiar a Técnico de Mantenimiento no dejó una sola fila MANTENIMIENTO / MANTENIMIENTO';
  end if;

  -- Super Administrador: sin área
  update usuarios set puesto_id = (select id from puestos where codigo = 'SUPERADMINISTRADOR') where id = v_u;
  select count(*) into v_n from usuario_roles ur join roles ro on ro.id = ur.rol_id
   where ur.usuario_id = v_u and ro.codigo = 'SUPERADMINISTRADOR' and ur.area_id is null;
  if v_n <> 1 or (select count(*) from usuario_roles where usuario_id = v_u) <> 1 then
    raise exception 'Super Administrador debe quedar con una fila y área null';
  end if;

  -- Probador: rol SUPERVISOR en Pruebas
  update usuarios set puesto_id = (select id from puestos where codigo = 'PROBADOR') where id = v_u;
  select count(*) into v_n from usuario_roles ur join roles ro on ro.id = ur.rol_id join areas a on a.id = ur.area_id
   where ur.usuario_id = v_u and ro.codigo = 'SUPERVISOR' and a.codigo = 'PRUEBAS';
  if v_n <> 1 then raise exception 'Probador debe quedar SUPERVISOR / PRUEBAS'; end if;

  -- sin puesto solo se permite a sistema
  begin
    insert into usuarios (usuario, password_hash, nombre) values ('zz_sin_puesto', 'x', 'Sin puesto');
    raise exception 'FALLO: se pudo crear una persona sin puesto';
  exception when check_violation then null;
  end;

  -- la verificación de la migración frena con la lista: VISTA en Mantenimiento
  update usuarios set puesto_id = (select id from puestos where codigo = 'SOLO_VISTA') where id = v_u;
  update usuario_roles set area_id = (select id from areas where codigo = 'MANTENIMIENTO') where usuario_id = v_u;
  begin
    perform personal_exigir_puestos();
    raise exception 'FALLO: personal_exigir_puestos no frenó';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'FALLO%' or v_msg not like '%zz_ensayo%VISTA%MANTENIMIENTO%' then
      raise exception 'El mensaje no trae usuario · rol · área: %', v_msg;
    end if;
  end;
end $$;

rollback;
