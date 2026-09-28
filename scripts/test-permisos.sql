-- Prueba manual de roles y permisos (migración 20261078090000) — correr con psql.
-- Todo dentro de begin/rollback: no deja nada.
--
--   psql "$DATABASE_URL" -f scripts/test-permisos.sql
--
-- Verifica:
--   1. Supervisor: carga turno y registra paradas; no ve Auditoría ni corrige.
--   2. Analista: ve Auditoría y valida; no corrige.
--   3. SubJefe (Supervisor + extras): con TURNO_CORREGIR extra, corrige.
--   4. Mantenimiento: solo paradas de Mantenimiento.
--   5. Super Administrador: todo.
--   6. Jefe no puede dar el rol Super Administrador ni tocar a un Super Administrador.
--   7. Jefe no puede dar permisos extra (solo Super Administrador).
--   8. Usuario inactivo: sin permisos.
--   9. Dueño: nadie más lo toca; solo él gestiona Super Admins y da ese rol.

begin;

do $$
declare
  v_sup uuid;
  v_jefe uuid;
  v_sa uuid;
  v_error text;
begin
  insert into usuarios (usuario, password_hash, nombre) values
    ('p_sup', 'x', 'Sup Prueba'), ('p_ana', 'x', 'Ana Prueba'), ('p_sub', 'x', 'Sub Prueba'),
    ('p_man', 'x', 'Man Prueba'), ('p_jefe', 'x', 'Jefe Prueba'), ('p_sa', 'x', 'SA Prueba');

  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, r.id, (select id from areas where codigo = 'ASEPTICO')
  from usuarios u
  join roles r on r.codigo = case u.usuario
    when 'p_sup' then 'SUPERVISOR' when 'p_ana' then 'ANALISTA' when 'p_sub' then 'SUPERVISOR'
    when 'p_man' then 'MANTENIMIENTO' when 'p_jefe' then 'JEFE_PRODUCCION' when 'p_sa' then 'SUPERADMINISTRADOR' end
  where u.usuario in ('p_sup', 'p_ana', 'p_sub', 'p_man', 'p_jefe', 'p_sa');

  select id into v_sup from usuarios where usuario = 'p_sup';
  select id into v_jefe from usuarios where usuario = 'p_jefe';
  select id into v_sa from usuarios where usuario = 'p_sa';

  -- 1
  assert tiene_permiso('p_sup', 'TURNO_CARGAR'), '1a supervisor carga';
  assert tiene_permiso('p_sup', 'PARADAS_REGISTRAR'), '1b supervisor paradas';
  assert not tiene_permiso('p_sup', 'AUDITORIA_VER'), '1c supervisor sin auditoría';
  assert not tiene_permiso('p_sup', 'TURNO_CORREGIR'), '1d supervisor no corrige';
  -- 2
  assert tiene_permiso('p_ana', 'AUDITORIA_VER') and tiene_permiso('p_ana', 'VALIDAR'), '2a analista audita y valida';
  assert tiene_permiso('p_ana', 'TURNO_CARGAR'), '2b analista carga';
  assert not tiene_permiso('p_ana', 'TURNO_CORREGIR'), '2c analista no corrige';
  -- 3
  perform guardar_permisos_extra('p_sa', (select id from usuarios where usuario = 'p_sub'), array['TURNO_CORREGIR', 'NO_EXISTE'], 'test');
  assert tiene_permiso('p_sub', 'TURNO_CORREGIR'), '3a subjefe corrige';
  assert not tiene_permiso('p_sup', 'TURNO_CORREGIR'), '3b el extra es solo suyo';
  assert (select count(*) from usuario_permisos where usuario_id = (select id from usuarios where usuario = 'p_sub')) = 1, '3c ignora permisos inexistentes';
  -- 4
  assert tiene_permiso('p_man', 'PARADAS_MANTENIMIENTO'), '4a mantenimiento';
  assert not tiene_permiso('p_man', 'TURNO_CARGAR') and not tiene_permiso('p_man', 'PARADAS_REGISTRAR'), '4b mantenimiento no carga';
  -- 5
  assert tiene_permiso('p_sa', 'EDICION_DATOS') and tiene_permiso('p_sa', 'ESQUEMA_TURNOS'), '5a superadmin todo';
  assert array_length(permisos_de('p_sa'), 1) = (select count(*) from permisos), '5b permisos_de superadmin';
  -- 6
  assert puede_gestionar_personal('p_jefe', v_sup), '6a jefe gestiona supervisor';
  assert not puede_gestionar_personal('p_jefe', v_sa), '6b jefe no toca superadmin';
  begin
    perform editar_personal('p_jefe', v_sup, 'Sup Prueba', null, 'ASEPTICO', 'SUPERADMINISTRADOR');
    raise exception 'FALLA 6c: jefe dio rol superadmin';
  exception when others then
    v_error := sqlerrm;
    assert v_error like 'Solo el dueño%', '6c mensaje: ' || v_error;
  end;
  -- 7
  begin
    perform guardar_permisos_extra('p_jefe', v_sup, array['VALIDAR'], 'test');
    raise exception 'FALLA 7: jefe dio permisos extra';
  exception when others then
    assert sqlerrm like 'Solo un Super Administrador%', '7 mensaje: ' || sqlerrm;
  end;
  -- 8
  update usuarios set activo = false where id = v_jefe;
  assert not tiene_permiso('p_jefe', 'TURNO_CARGAR'), '8 inactivo sin permisos';

  -- 9
  insert into usuarios (usuario, password_hash, nombre, ve_errores) values ('p_duen', 'x', 'Dueño Prueba', true);
  insert into usuario_roles (usuario_id, rol_id)
  select u.id, r.id from usuarios u, roles r where u.usuario = 'p_duen' and r.codigo = 'SUPERADMINISTRADOR';
  assert es_dueno('p_duen') and not es_dueno('p_sa'), '9a es_dueno';
  assert not puede_gestionar_personal('p_sa', (select id from usuarios where usuario = 'p_duen')), '9b superadmin no toca al dueño';
  assert puede_gestionar_personal('p_duen', (select id from usuarios where usuario = 'p_duen')), '9c el dueño se edita a sí mismo';
  assert not puede_gestionar_personal('p_sa', v_sa), '9d superadmin no toca a otro superadmin';
  assert puede_gestionar_personal('p_duen', v_sa), '9e el dueño gestiona superadmins';
  begin
    perform editar_personal('p_sa', v_sup, 'Sup Prueba', null, 'ASEPTICO', 'SUPERADMINISTRADOR');
    raise exception 'FALLA 9f: superadmin dio rol superadmin';
  exception when others then
    assert sqlerrm like 'Solo el dueño%', '9f mensaje: ' || sqlerrm;
  end;

  raise notice 'OK: roles, permisos y dueño';
end;
$$;

rollback;
