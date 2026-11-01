-- Ensayo Task 4: reglas de gestión de personal en la base.
-- Todo dentro de una transacción con rollback.
begin;

do $$
declare
  v_n int;
  v_arr text[];
  v_id uuid;
  v_tm uuid; v_sm uuid; v_sa uuid; v_jm uuid; v_jp uuid; v_cp uuid; v_sp uuid; v_dueno uuid;
  v_p_jefe uuid; v_p_tec uuid; v_p_sup uuid; v_p_super uuid;
begin
  insert into usuarios (usuario, password_hash, nombre, puesto_id)
  select x.u, 'x', x.u, p.id
    from (values
      ('t4_jm','JEFE_MANTENIMIENTO'),
      ('t4_tm','TECNICO_MANTENIMIENTO'),
      ('t4_sm','SUPERVISOR_MANTENIMIENTO'),
      ('t4_sa','SUPERVISOR'),
      ('t4_jp','JEFE_PRODUCCION'),
      ('t4_cp','COORDINADOR_PRODUCCION'),
      ('t4_sp','SUPERVISOR')
    ) x(u, pc)
    join puestos p on p.codigo = x.pc;
  select id into v_jm from usuarios where usuario='t4_jm';
  select id into v_tm from usuarios where usuario='t4_tm';
  select id into v_sm from usuarios where usuario='t4_sm';
  select id into v_sa from usuarios where usuario='t4_sa';
  select id into v_jp from usuarios where usuario='t4_jp';
  select id into v_cp from usuarios where usuario='t4_cp';
  select id into v_sp from usuarios where usuario='t4_sp';
  select id into v_dueno from usuarios where usuario='local';
  select id into v_p_jefe from puestos where codigo='JEFE_MANTENIMIENTO';
  select id into v_p_tec from puestos where codigo='TECNICO_MANTENIMIENTO';
  select id into v_p_sup from puestos where codigo='SUPERVISOR_MANTENIMIENTO';
  select id into v_p_super from puestos where codigo='SUPERVISOR';

  -- El coordinador de producción gestiona personal por un permiso extra
  insert into usuario_permisos (usuario_id, permiso_codigo) values (v_cp, 'PERSONAL_GESTIONAR');

  -- listar_personal('t4_jm'): tm y sm gestionables, sa no aparece, la dueña tampoco
  select count(*) into v_n from listar_personal('t4_jm') where usuario in ('t4_tm','t4_sm') and gestionable;
  if v_n <> 2 then raise exception 'listar_personal(jm) debe traer a tm y sm gestionables (%)', v_n; end if;
  if exists (select 1 from listar_personal('t4_jm') where usuario in ('t4_sa','local')) then
    raise exception 'listar_personal(jm) no debe traer a otras áreas';
  end if;
  if not exists (select 1 from listar_personal('t4_jm') where usuario='t4_jm' and not gestionable) then
    raise exception 'jm debe verse a sí mismo como no gestionable';
  end if;
  if not exists (select 1 from listar_personal('local') where usuario='t4_sa' and gestionable) then
    raise exception 'local debe ver y gestionar a sa';
  end if;
  if exists (select 1 from listar_personal('jguerrero') where usuario='local' and gestionable) then
    raise exception 'la dueña no es gestionable por otro Super Admin';
  end if;
  begin
    perform * from listar_personal('t4_sm');
    raise exception 'FALLO: sm listó';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- puestos_asignables
  select array_agg(codigo order by codigo) into v_arr from puestos_asignables('t4_jm');
  if v_arr is distinct from array['SUPERVISOR_MANTENIMIENTO','TECNICO_MANTENIMIENTO'] then
    raise exception 'puestos_asignables(jm) = %', v_arr;
  end if;
  select count(*) into v_n from puestos_asignables('local');
  if v_n < 10 then raise exception 'local debe tener todos los puestos asignables (%)', v_n; end if;
  if exists (select 1 from puestos_asignables('jguerrero') where codigo='SUPERADMINISTRADOR') then
    raise exception 'solo la dueña asigna Super Administrador';
  end if;
  update puestos set activo=false where codigo='TECNICO_MANTENIMIENTO';
  if exists (select 1 from puestos_asignables('t4_jm') where codigo='TECNICO_MANTENIMIENTO') then
    raise exception 'puesto inactivo no debe ofrecerse';
  end if;
  update puestos set activo=true where codigo='TECNICO_MANTENIMIENTO';

  -- puede_gestionar_personal
  if puede_gestionar_personal('t4_jm', v_jm) then raise exception 'nadie se gestiona a sí mismo'; end if;
  if puede_gestionar_personal('t4_jm', v_dueno) then raise exception 'jm no gestiona a la dueña'; end if;
  if puede_gestionar_personal('t4_jm', v_sa) then raise exception 'jm no gestiona otra área'; end if;
  if not puede_gestionar_personal('t4_jm', v_tm) then raise exception 'jm gestiona a tm'; end if;
  if puede_gestionar_personal('t4_sm', v_tm) then raise exception 'sm sin permiso no gestiona'; end if;
  if puede_gestionar_personal('local', v_dueno) is not true then raise exception 'la dueña se gestiona (nombre, cédula)'; end if;
  if puede_gestionar_personal('jguerrero', v_dueno) then raise exception 'otro Super Admin no gestiona a la dueña'; end if;
  if puede_gestionar_personal('t4_cp', v_jp) then raise exception 'coordinador no gestiona a jefe'; end if;
  if not puede_gestionar_personal('t4_cp', v_sp) then raise exception 'coordinador gestiona a supervisor de su área'; end if;
  if puede_gestionar_personal('t4_cp', v_tm) then raise exception 'coordinador no gestiona otra área'; end if;

  -- crear_usuario
  begin
    perform crear_usuario('t4_jm','t4_nuevo1','clave123',v_p_jefe,'Nuevo Jefe');
    raise exception 'FALLO: jm creó un jefe';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'Ese puesto no lo puedes asignar.%' then raise exception 'mensaje inesperado: %', sqlerrm; end if;
  end;
  begin
    perform crear_usuario('t4_jm','t4_nuevo1','clave123',v_p_super,'Otra área');
    raise exception 'FALLO: jm creó en otra área';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'Ese puesto no lo puedes asignar.%' then raise exception 'mensaje inesperado: %', sqlerrm; end if;
  end;
  v_id := crear_usuario('t4_jm','t4_nuevo2','clave123',v_p_tec,'Nuevo Técnico','123',null,null);
  select array_agg(r.codigo) into v_arr from usuario_roles ur join roles r on r.id=ur.rol_id where ur.usuario_id=v_id;
  if v_arr is distinct from array['MANTENIMIENTO'] then raise exception 'usuario_roles del nuevo = %', v_arr; end if;
  if not exists (select 1 from auditoria a where a.entidad_id = v_id::text and a.accion='CREAR') then
    raise exception 'crear_usuario debe auditar';
  end if;
  begin
    perform crear_usuario('t4_sm','t4_nuevo3','clave123',v_p_tec,'Sin permiso');
    raise exception 'FALLO: sm creó';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- editar_personal
  begin
    perform editar_personal('t4_jm', v_sa, 'X', null, v_p_tec, null);
    raise exception 'FALLO: jm editó a sa';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'No puedes gestionar a esta persona.%' then raise exception 'mensaje inesperado: %', sqlerrm; end if;
  end;
  begin
    perform editar_personal('t4_jm', v_jm, 'X', null, v_p_jefe, null);
    raise exception 'FALLO: jm se editó';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'No puedes gestionar a esta persona.%' then raise exception 'mensaje inesperado: %', sqlerrm; end if;
  end;
  begin
    perform editar_personal('t4_jm', v_dueno, 'X', null, v_p_tec, null);
    raise exception 'FALLO: jm editó a la dueña';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'No puedes gestionar a esta persona.%' then raise exception 'mensaje inesperado: %', sqlerrm; end if;
  end;
  begin
    perform editar_personal('t4_jm', v_tm, 'X', null, v_p_jefe, null);
    raise exception 'FALLO: jm subió a tm a jefe';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'Ese puesto no lo puedes asignar.%' then raise exception 'mensaje inesperado: %', sqlerrm; end if;
  end;
  perform editar_personal('t4_jm', v_tm, 'Técnico Uno', '999', v_p_sup, 'Líder');
  if not exists (select 1 from usuarios where id=v_tm and nombre='Técnico Uno' and cedula='999' and titulo='Líder' and puesto_id=v_p_sup) then
    raise exception 'editar_personal no guardó';
  end if;
  perform editar_personal('t4_jm', v_tm, 'Técnico Uno', '999', v_p_tec, 'Líder');
  -- coordinador: no edita jefe, sí supervisor
  begin
    perform editar_personal('t4_cp', v_jp, 'X', null, v_p_super, null);
    raise exception 'FALLO: coordinador editó a jefe';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform editar_personal('t4_cp', v_sp, 'Sup P', null, v_p_super, null);
  -- la dueña puede editarse (nombre) pero no cambiar su puesto
  perform editar_personal('local', v_dueno, 'Dueña', null, (select id from puestos where codigo='SUPERADMINISTRADOR'), null);
  begin
    perform editar_personal('local', v_dueno, 'Dueña', null, v_p_tec, null);
    raise exception 'FALLO: la dueña se cambió el puesto';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- guardar_permisos_extra
  perform guardar_permisos_extra('t4_jm', v_tm, array['CATALOGO_PARADAS'], null);
  if not tiene_permiso('t4_tm','CATALOGO_PARADAS') then raise exception 'tm debe tener el extra'; end if;
  begin
    perform guardar_permisos_extra('t4_jm', v_tm, array['CATALOGO_PARADAS','VALIDAR'], null);
    raise exception 'FALLO: jm dio VALIDAR';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'No puedes dar un permiso que no tienes.%' then raise exception 'mensaje inesperado: %', sqlerrm; end if;
  end;
  begin
    perform guardar_permisos_extra('t4_jm', v_jm, array['CATALOGO_PARADAS'], null);
    raise exception 'FALLO: jm se dio permisos';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform guardar_permisos_extra('t4_jm', v_sa, array['CATALOGO_PARADAS'], null);
    raise exception 'FALLO: jm dio permisos a otra área';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- un extra que jm no tiene, ya dado por la dueña, se conserva cuando jm guarda
  insert into usuario_permisos (usuario_id, permiso_codigo) values (v_tm, 'VALIDAR');
  perform guardar_permisos_extra('t4_jm', v_tm, array[]::text[], null);
  if not exists (select 1 from usuario_permisos where usuario_id=v_tm and permiso_codigo='VALIDAR') then
    raise exception 'VALIDAR (que jm no tiene) debe conservarse';
  end if;
  if exists (select 1 from usuario_permisos where usuario_id=v_tm and permiso_codigo='CATALOGO_PARADAS') then
    raise exception 'CATALOGO_PARADAS debía quitarse';
  end if;

  -- restablecer_password y desactivar_personal usan puede_gestionar_personal
  begin
    perform restablecer_password('t4_jm', v_sa, 'nueva123', null);
    raise exception 'FALLO: jm restableció a sa';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform desactivar_personal('t4_jm', v_sa, null);
    raise exception 'FALLO: jm desactivó a sa';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform desactivar_personal('t4_jm', v_tm, null);
  perform reactivar_personal('t4_jm', v_tm, null);

  -- eliminar_personal
  begin
    perform eliminar_personal('t4_jm', v_tm, false, null);
    raise exception 'FALLO: jm eliminó';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'Solo quien administra áreas y puestos puede eliminar personas.%' then raise exception 'mensaje inesperado: %', sqlerrm; end if;
  end;
  perform eliminar_personal('local', v_tm, false, null);
  if exists (select 1 from usuarios where id=v_tm) then raise exception 'tm debía borrarse'; end if;
  begin
    perform eliminar_personal('local', v_dueno, false, null);
    raise exception 'FALLO: la dueña se eliminó';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- Probador: no administra personas; sí tiene los demás permisos
  insert into usuarios (usuario, password_hash, nombre, puesto_id)
  select 't4_pr', 'x', 't4_pr', id from puestos where codigo='PROBADOR';
  if tiene_permiso('t4_pr','ESTRUCTURA_GESTIONAR') then raise exception 'Probador no debe tener ESTRUCTURA_GESTIONAR'; end if;
  if tiene_permiso('t4_pr','PERSONAL_GESTIONAR') then raise exception 'Probador no debe tener PERSONAL_GESTIONAR'; end if;
  if not tiene_permiso('t4_pr','VALIDAR') then raise exception 'Probador debe seguir con VALIDAR'; end if;
  if not tiene_permiso('local','ESTRUCTURA_GESTIONAR') then raise exception 'Super Admin debe tener ESTRUCTURA_GESTIONAR'; end if;
  begin
    perform * from listar_personal('t4_pr');
    raise exception 'FALLO: Probador listó';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like 'No tienes permiso para ver esto.%' then raise exception 'mensaje inesperado: %', sqlerrm; end if;
  end;
  if exists (select 1 from puestos_asignables('t4_pr')) then raise exception 'Probador no asigna puestos'; end if;

  -- listar_permisos_extra: jm no ve los extras de otra área
  insert into usuario_permisos (usuario_id, permiso_codigo) values (v_sa, 'CATALOGO_PARADAS');
  if exists (select 1 from listar_permisos_extra('t4_jm') where usuario_id = v_sa) then
    raise exception 'jm no debe ver los extras de sa';
  end if;
  if not exists (select 1 from listar_permisos_extra('local') where usuario_id = v_sa) then
    raise exception 'local debe ver los extras de sa';
  end if;

  raise notice 'Ensayo 4 OK';
end $$;

rollback;
