begin;

do $$
declare
  v_super uuid := (select id from puestos where codigo = 'SUPERADMINISTRADOR');
  v_supervisor uuid := (select id from puestos where codigo = 'SUPERVISOR');
  v_admin uuid;
  v_objetivo uuid;
begin
  insert into usuarios (usuario, password_hash, nombre, puesto_id)
    values ('ensayo_admin', 'x', 'Admin', v_super) returning id into v_admin;
  insert into usuarios (usuario, password_hash, nombre, puesto_id, ve_errores)
    values ('ensayo_propietaria', 'x', 'Propietaria', v_supervisor, true) returning id into v_objetivo;
  insert into usuario_permisos (usuario_id, permiso_codigo)
    values (v_objetivo, 'ESTRUCTURA_GESTIONAR');

  if es_dueno('ensayo_propietaria') or not es_dueno('ensayo_admin') then
    raise exception 'La capacidad debe depender del puesto.';
  end if;
  if exists (select 1 from puestos_asignables('ensayo_propietaria') where puesto_id = v_super) then
    raise exception 'Administrar estructura no permite conceder Super Administrador.';
  end if;
  perform listar_errores_cliente('ensayo_admin');
  begin
    perform listar_errores_cliente('ensayo_propietaria');
    raise exception 'La marca honorífica aún permite leer errores.';
  exception when raise_exception then
    if sqlerrm <> 'No tienes permiso para ver esto.' then raise; end if;
  end;
  perform permisos_de_puesto('ensayo_admin', v_supervisor);
  perform estado_correos('ensayo_admin');
  perform editar_personal('ensayo_admin', v_objetivo, 'Propietaria', null, v_super, null);
  if not es_dueno('ensayo_propietaria') or not puede_gestionar_personal('ensayo_admin', v_objetivo) then
    raise exception 'La promoción debe habilitar el puesto y permitir gestionar a otro administrador.';
  end if;
  if puede_gestionar_personal('ensayo_admin', v_admin) then
    raise exception 'Un administrador no puede gestionarse a sí mismo.';
  end if;
  perform editar_personal('ensayo_admin', v_objetivo, 'Propietaria', null, v_supervisor, null);
  if es_dueno('ensayo_propietaria')
     or (perfil_sesion('ensayo_propietaria')->>'es_propietaria') is distinct from 'true' then
    raise exception 'La degradación debe retirar privilegios y conservar la marca.';
  end if;
  update usuarios set activo = false where id = v_admin;
  if es_dueno('ensayo_admin') then
    raise exception 'Una cuenta inactiva no conserva la capacidad.';
  end if;
end;
$$;

rollback;
