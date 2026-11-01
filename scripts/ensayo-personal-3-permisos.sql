-- Ensayo Task 3: permisos por puesto, sesión y los cuatro permisos nuevos.
-- Todo dentro de una transacción con rollback.
begin;

do $$
declare
  v_msg text;
  v_j jsonb;
  v_arr text[];
  v_pid uuid;
begin
  -- usuarios de prueba (el trigger de la Task 2 llena usuario_roles)
  insert into usuarios (usuario, password_hash, nombre, puesto_id, activo, ve_errores)
  select x.u, 'x', x.u, p.id, x.act, x.dueno
    from (values
      ('t3_tecnico','TECNICO_MANTENIMIENTO',true,false),
      ('t3_jefemtto','JEFE_MANTENIMIENTO',true,false),
      ('t3_vista_mtto','SOLO_VISTA',true,false),
      ('t3_vista_otra','SOLO_VISTA',true,false),
      ('t3_super','SUPERADMINISTRADOR',true,false),
      ('t3_probador','PROBADOR',true,false),
      ('t3_inactivo','JEFE_MANTENIMIENTO',false,false),
      ('t3_si','SERVICIOS_INDUSTRIALES',true,false),
      ('t3_dueno','SUPERADMINISTRADOR',true,true)
    ) x(u, pc, act, dueno)
    join puestos p on p.codigo = x.pc;
  -- Solo Vista del área Mantenimiento (puesto del área OTROS, pero su usuario_roles apunta a Mantenimiento)
  update usuario_roles set area_id = (select id from areas where codigo='MANTENIMIENTO')
   where usuario_id = (select id from usuarios where usuario='t3_vista_mtto');

  -- tiene_permiso desde el puesto
  if not tiene_permiso('t3_tecnico','SIF_GESTIONAR') then raise exception 'Técnico debe tener SIF_GESTIONAR'; end if;
  if tiene_permiso('t3_tecnico','CATALOGO_PARADAS') then raise exception 'Técnico no debe tener CATALOGO_PARADAS'; end if;
  if not tiene_permiso('t3_jefemtto','CATALOGO_PARADAS') then raise exception 'Jefe Mtto debe tener CATALOGO_PARADAS'; end if;

  -- quitar el permiso del puesto cambia el resultado en la misma transacción
  delete from puesto_permisos
   where puesto_id = (select id from puestos where codigo='TECNICO_MANTENIMIENTO') and permiso_codigo='SIF_GESTIONAR';
  if tiene_permiso('t3_tecnico','SIF_GESTIONAR') then raise exception 'Quitar el permiso al puesto debe notarse'; end if;

  -- permiso extra por persona
  insert into usuario_permisos (usuario_id, permiso_codigo)
  select id, 'CATALOGO_PARADAS' from usuarios where usuario='t3_tecnico';
  if not tiene_permiso('t3_tecnico','CATALOGO_PARADAS') then raise exception 'El extra debe dar true'; end if;

  -- Super Admin y Probador: todo, incluido un permiso creado ahora
  insert into permisos (codigo, nombre, tema) values ('PRUEBA_X', 'Prueba X', 'DATOS');
  if not tiene_permiso('t3_super','PRUEBA_X') then raise exception 'Super Admin debe tener PRUEBA_X'; end if;
  if not tiene_permiso('t3_probador','PRUEBA_X') then raise exception 'Probador debe tener PRUEBA_X'; end if;
  if tiene_permiso('t3_vista_otra','PRUEBA_X') then raise exception 'Solo Vista no debe tener PRUEBA_X'; end if;

  -- inactivo
  if tiene_permiso('t3_inactivo','CATALOGO_PARADAS') then raise exception 'Inactivo debe dar false'; end if;

  -- perfil_sesion
  v_j := perfil_sesion('t3_jefemtto');
  if (v_j->>'nivel')::int is distinct from 1 then raise exception 'nivel: %', v_j; end if;
  if v_j->>'area' is distinct from 'MANTENIMIENTO' then raise exception 'area: %', v_j; end if;
  if v_j->>'rol' is distinct from 'MANTENIMIENTO' then raise exception 'rol: %', v_j; end if;
  if v_j->>'puesto' is null or v_j->>'puesto_id' is null then raise exception 'puesto: %', v_j; end if;
  if v_j ? 'cargo' then raise exception 'cargo no debe estar: %', v_j; end if;
  if not (v_j->'permisos') ? 'CATALOGO_PARADAS' then raise exception 'permisos: %', v_j; end if;
  if (perfil_sesion('t3_super')->'nivel') is distinct from 'null'::jsonb then raise exception 'nivel del Super Admin debe ser null'; end if;

  -- exigir_editor_mtto
  begin
    perform exigir_editor_mtto('t3_vista_mtto');
    raise exception 'Solo Vista de Mantenimiento no debe editar';
  exception when others then
    if sqlerrm not like '%Solo Mantenimiento puede editar los códigos.%' then raise; end if;
  end;
  insert into usuario_permisos (usuario_id, permiso_codigo)
  select id, 'CODIGOS_MTTO_EDITAR' from usuarios where usuario='t3_vista_otra';
  perform exigir_editor_mtto('t3_vista_otra');
  perform exigir_editor_mtto('t3_dueno');

  -- registrar_lectura_servicios_industriales
  begin
    perform registrar_lectura_servicios_industriales('t3_vista_otra', 1, null, null);
    raise exception 'Solo Vista no debe cargar lecturas';
  exception when others then
    if sqlerrm not like '%Solo Servicios Industriales carga estas lecturas.%' then raise; end if;
  end;
  perform registrar_lectura_servicios_industriales('t3_si', 1, null, null);
  perform registrar_lectura_servicios_industriales('t3_probador', 1, null, null);
  perform registrar_lectura_servicios_industriales('t3_super', 1, null, null);

  -- I1: Solo Vista lo decide el puesto SOLO_VISTA, no el rol VISTA. Un puesto nuevo con
  -- rol equivalente VISTA y LECTURAS_SI en la matriz: la sesión no dice SOLO_VISTA y la
  -- persona carga lecturas.
  insert into puestos (codigo, nombre, area_id, nivel, rol_equivalente_id, activo)
  select 'ZZ_AUX_ENSAYO', 'Zz Auxiliar', (select id from areas where codigo='OTROS'), 3,
         (select id from roles where codigo='VISTA'), true
  returning id into v_pid;
  insert into puesto_permisos (puesto_id, permiso_codigo) values (v_pid, 'LECTURAS_SI');
  insert into usuarios (usuario, password_hash, nombre, puesto_id) values ('t3_aux_vista', 'x', 't3_aux_vista', v_pid);
  v_j := perfil_sesion('t3_aux_vista');
  if v_j->>'rol' is distinct from 'VISTA' or v_j->>'puesto_codigo' is distinct from 'ZZ_AUX_ENSAYO'
     or not (v_j->'permisos') ? 'LECTURAS_SI' then
    raise exception 'I1: perfil_sesion del puesto con rol VISTA: %', v_j;
  end if;
  perform registrar_lectura_servicios_industriales('t3_aux_vista', 1, null, null);
  if perfil_sesion('t3_vista_otra')->>'puesto_codigo' is distinct from 'SOLO_VISTA' then
    raise exception 'I1: Solo Vista debe llegar con puesto_codigo SOLO_VISTA';
  end if;

  -- permisos_de_puesto: solo la dueña
  select id into v_pid from puestos where codigo='JEFE_MANTENIMIENTO';
  v_arr := permisos_de_puesto('t3_dueno', v_pid);
  if not ('CATALOGO_PARADAS' = any(v_arr)) then raise exception 'permisos_de_puesto: %', v_arr; end if;
  begin
    perform permisos_de_puesto('t3_jefemtto', v_pid);
    raise exception 'Solo la dueña puede usar Ver como';
  exception when others then
    if sqlerrm not like '%Solo el dueño puede usar «Ver como».%' then raise; end if;
  end;
  perform permisos_de_rol('t3_dueno', 'MANTENIMIENTO'); -- sigue existiendo hasta la Fase 2

  -- puesto_para: Super Admin en Pruebas sigue siendo Super Admin
  if (select puesto_codigo from puesto_para('SUPERADMINISTRADOR','PRUEBAS',null,null)) is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'SUPERADMINISTRADOR en PRUEBAS debe seguir siendo SUPERADMINISTRADOR';
  end if;
  if (select puesto_codigo from puesto_para('VISTA','PRUEBAS',null,null)) is distinct from 'PROBADOR' then
    raise exception 'Área Pruebas sigue dando PROBADOR';
  end if;
end $$;

rollback;
