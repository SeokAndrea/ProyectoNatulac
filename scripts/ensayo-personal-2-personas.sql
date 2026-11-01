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
    ('SUPERADMINISTRADOR', null, null, null, 'SUPERADMINISTRADOR', null),
    ('SUPERADMINISTRADOR', 'PRUEBAS', null, null, 'SUPERADMINISTRADOR', null)
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
     -- solo quienes pasó la migración: a los creados o editados después desde Personal
     -- (base local) el puesto se lo eligió una persona, no la regla
     where not exists (select 1 from auditoria au
                        where au.entidad = 'personal' and au.entidad_id = u.id::text
                          and au.usuario <> 'sistema' and au.despues ? 'puesto')
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

-- Los pasos de datos de la migración (I2, I3, I5) sobre personas sintéticas «de antes»:
-- sin puesto y con su usuario_roles viejo. Se quita el check de puesto obligatorio dentro
-- de esta transacción (vuelve con el rollback).
do $$
declare
  v_n int;
  v_msg text;
  v_aud int;
  r record;
begin
  -- zz_ensayo (bloque de arriba) quedó con usuario_roles movido a mano: se vuelve al de su puesto
  update usuario_roles set area_id = (select id from areas where codigo = 'OTROS')
   where usuario_id = (select id from usuarios where usuario = 'zz_ensayo');

  -- I3: justo después de la migración, usuario_roles de cada persona = rol y área de su puesto
  select count(*) into v_n
    from usuarios u join puestos p on p.id = u.puesto_id
   where u.usuario <> 'sistema'
     and ((select count(*) from usuario_roles ur where ur.usuario_id = u.id) <> 1
          or not exists (select 1 from usuario_roles ur where ur.usuario_id = u.id
                            and ur.rol_id = p.rol_equivalente_id and ur.area_id is not distinct from p.area_id));
  if v_n <> 0 then raise exception 'I3: % personas con usuario_roles distinto del de su puesto', v_n; end if;

  alter table usuarios drop constraint usuarios_puesto_obligatorio;
  insert into usuarios (usuario, password_hash, nombre, cargo)
  values ('zz_sa_pruebas', 'x', 'Zz SA Pruebas', null),
         ('zz_subjefe', 'x', 'Zz Subjefe', 'SUBJEFE'),
         ('zz_vista_asep', 'x', 'Zz Vista Aséptico', null),
         ('zz_super', 'x', 'Zz Supervisor', null),
         ('zz_doble', 'x', 'Zz Doble', null);
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, (select id from roles where codigo = x.rol), (select id from areas where codigo = x.area)
    from (values ('zz_sa_pruebas', 'SUPERADMINISTRADOR', 'PRUEBAS'),
                 ('zz_subjefe', 'SUPERVISOR', 'ASEPTICO'),
                 ('zz_vista_asep', 'VISTA', 'ASEPTICO'),
                 ('zz_super', 'SUPERVISOR', 'ASEPTICO'),
                 ('zz_doble', 'SUPERVISOR', 'ASEPTICO'),
                 ('zz_doble', 'SUPERVISOR', 'PRUEBAS')) x(usuario, rol, area)
    join usuarios u on u.usuario = x.usuario;

  -- I5: dos filas en usuario_roles → la migración frena con la lista
  begin
    perform personal_exigir_puestos();
    raise exception 'FALLO: personal_exigir_puestos no frenó con dos filas';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'FALLO%' or v_msg not like 'Personas con más de un rol%'
       or v_msg not like '%zz_doble · SUPERVISOR / ASEPTICO, SUPERVISOR / PRUEBAS%'
       or v_msg like '%zz_super%' then
      raise exception 'I5: mensaje inesperado: %', v_msg;
    end if;
  end;
  delete from usuario_roles
   where usuario_id = (select id from usuarios where usuario = 'zz_doble')
     and area_id = (select id from areas where codigo = 'PRUEBAS');

  -- el paso, en el orden de la migración: asignar (sin el trigger, que la migración instala
  -- después) y sincronizar
  alter table usuarios disable trigger usuarios_sincroniza_rol;
  perform personal_asignar_puestos();
  alter table usuarios enable trigger usuarios_sincroniza_rol;
  select count(*) into v_aud from auditoria where pagina = 'Paso a puestos (20261114090000)';
  v_n := personal_sincronizar_roles();
  if v_n <> 3 then raise exception 'I3: debían cambiar 3 personas (SA Pruebas, Subjefe, Vista Aséptico) y cambiaron %', v_n; end if;

  for r in select * from (values
      ('zz_sa_pruebas', 'SUPERADMINISTRADOR', null, 'SUPERADMINISTRADOR', null, true),
      ('zz_subjefe', 'COORDINADOR_PRODUCCION', 'Subjefe', 'ANALISTA', 'ASEPTICO', true),
      ('zz_vista_asep', 'SOLO_VISTA', null, 'VISTA', 'OTROS', true),
      ('zz_super', 'SUPERVISOR', null, 'SUPERVISOR', 'ASEPTICO', false),
      ('zz_doble', 'SUPERVISOR', null, 'SUPERVISOR', 'ASEPTICO', false)
    ) x(usuario, puesto, titulo, rol, area, auditada) loop
    -- I2: el Super Admin con área Pruebas queda en el puesto SUPERADMINISTRADOR
    if not exists (select 1 from usuarios u join puestos p on p.id = u.puesto_id
                    where u.usuario = r.usuario and p.codigo = r.puesto and u.titulo is not distinct from r.titulo) then
      raise exception 'I2/paso: % no quedó en el puesto % / %', r.usuario, r.puesto, r.titulo;
    end if;
    if (select count(*) from usuario_roles ur join usuarios u on u.id = ur.usuario_id
                       join roles ro on ro.id = ur.rol_id left join areas a on a.id = ur.area_id
         where u.usuario = r.usuario and ro.codigo = r.rol and a.codigo is not distinct from r.area) <> 1
       or (select count(*) from usuario_roles ur join usuarios u on u.id = ur.usuario_id where u.usuario = r.usuario) <> 1 then
      raise exception 'I3: usuario_roles de % debía ser una fila % / %', r.usuario, r.rol, r.area;
    end if;
    select count(*) into v_n from auditoria a join usuarios u on u.id::text = a.entidad_id
     where u.usuario = r.usuario and a.usuario = 'sistema' and a.entidad = 'personal'
       and a.pagina = 'Paso a puestos (20261114090000)';
    if v_n <> (case when r.auditada then 1 else 0 end) then
      raise exception 'I3: % filas de auditoría para % (se esperaba %)', v_n, r.usuario, r.auditada;
    end if;
  end loop;
  if not exists (select 1 from auditoria a join usuarios u on u.id::text = a.entidad_id
                  where u.usuario = 'zz_subjefe' and a.antes = '{"rol":"SUPERVISOR","area":"ASEPTICO"}'::jsonb
                    and a.despues = '{"rol":"ANALISTA","area":"ASEPTICO"}'::jsonb) then
    raise exception 'I3: la auditoría del Subjefe no trae antes/después';
  end if;

  -- correrla de nuevo no cambia a nadie
  if personal_sincronizar_roles() <> 0 then raise exception 'I3: la segunda sincronía cambió a alguien'; end if;

  -- I3: el trigger solo actúa si el puesto cambia de verdad. Editar el nombre (editar_personal
  -- hace set puesto_id = el mismo) no reescribe usuario_roles.
  update usuario_roles set area_id = (select id from areas where codigo = 'PRUEBAS')
   where usuario_id = (select id from usuarios where usuario = 'zz_super');
  update usuarios set nombre = 'Zz Supervisor Editado', puesto_id = puesto_id where usuario = 'zz_super';
  if not exists (select 1 from usuario_roles ur join usuarios u on u.id = ur.usuario_id join areas a on a.id = ur.area_id
                  where u.usuario = 'zz_super' and a.codigo = 'PRUEBAS') then
    raise exception 'I3: editar solo el nombre reescribió usuario_roles';
  end if;
  -- cambiar el puesto sí sincroniza
  update usuarios set puesto_id = (select id from puestos where codigo = 'PASANTE') where usuario = 'zz_super';
  if not exists (select 1 from usuario_roles ur join usuarios u on u.id = ur.usuario_id join areas a on a.id = ur.area_id
                  where u.usuario = 'zz_super' and a.codigo = 'ASEPTICO') then
    raise exception 'I3: cambiar el puesto no sincronizó usuario_roles';
  end if;
end $$;

rollback;
