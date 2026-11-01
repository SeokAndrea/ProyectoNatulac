-- Ensayo Task 5: administrar áreas, puestos y la matriz de permisos.
-- Todo dentro de una transacción con rollback.
begin;

do $$
declare
  v_n int;
  v_id uuid;
  v_id2 uuid;
  v_tec uuid; v_sup uuid; v_probador uuid; v_sa uuid;
  v_rol text;
  v_j jsonb;
begin
  insert into usuarios (usuario, password_hash, nombre, puesto_id)
  select x.u, 'x', x.u, p.id
    from (values ('t5_jm','JEFE_MANTENIMIENTO'), ('t5_tec','TECNICO_MANTENIMIENTO')) x(u, pc)
    join puestos p on p.codigo = x.pc;

  select id into v_tec from puestos where codigo = 'TECNICO_MANTENIMIENTO';
  select id into v_sup from puestos where codigo = 'SUPERVISOR';
  select id into v_probador from puestos where codigo = 'PROBADOR';
  select id into v_sa from puestos where codigo = 'SUPERADMINISTRADOR';

  -- guardar_area crea ALMACEN
  perform guardar_area('local', 'ALMACEN', 'Almacén', 'APOYO', true, 'ensayo');
  if not exists (select 1 from areas where codigo='ALMACEN' and nombre='Almacén' and tipo='APOYO' and activo) then
    raise exception 'guardar_area no creó ALMACEN';
  end if;
  if (select orden from areas where codigo='ALMACEN') <> (select max(orden) from areas where codigo<>'ALMACEN') + 1 then
    raise exception 'el orden de un área nueva debe ser max+1';
  end if;
  if not exists (select 1 from auditoria where entidad='areas' and usuario='local') then
    raise exception 'guardar_area no dejó auditoría';
  end if;
  -- editar el área: nombre, tipo, activo
  perform guardar_area('local', 'ALMACEN', 'Almacén general', 'PRODUCCION', false, 'ensayo');
  if not exists (select 1 from areas where codigo='ALMACEN' and nombre='Almacén general' and tipo='PRODUCCION' and not activo) then
    raise exception 'guardar_area no editó';
  end if;
  perform guardar_area('local', 'ALMACEN', 'Almacén', 'APOYO', true, 'ensayo');

  -- Código inválido, tipo inválido
  begin perform guardar_area('local', 'ALMA CEN', 'x', 'APOYO', true, null); raise exception 'FALLO: código con espacio';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; if sqlerrm not like '%código%' then raise exception 'mensaje inesperado: %', sqlerrm; end if; end;
  begin perform guardar_area('local', 'ÁREA', 'x', 'APOYO', true, null); raise exception 'FALLO: código con tilde';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; if sqlerrm not like '%código%' then raise exception 'mensaje inesperado: %', sqlerrm; end if; end;
  begin perform guardar_area('local', 'OTRA', 'x', 'LOQUESEA', true, null); raise exception 'FALLO: tipo inválido';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; if sqlerrm not like '%tipo%' then raise exception 'mensaje inesperado: %', sqlerrm; end if; end;

  -- guardar_puesto crea Jefe de Almacén (área sin puestos: rol VISTA)
  v_id := guardar_puesto('local', null, 'ALMACEN', 'Jefe de Almacén', 1::smallint, true, 'ensayo');
  if not exists (select 1 from puestos p join areas a on a.id=p.area_id join roles r on r.id=p.rol_equivalente_id
                  where p.id=v_id and a.codigo='ALMACEN' and p.nivel=1 and p.codigo='JEFE_DE_ALMACEN' and r.codigo='VISTA' and not p.todos_los_permisos) then
    raise exception 'guardar_puesto no creó bien el puesto';
  end if;
  -- mismo nombre: código único
  v_id2 := guardar_puesto('local', null, 'ALMACEN', 'Jefe de Almacén', 2::smallint, true, 'ensayo');
  if (select codigo from puestos where id=v_id2) = 'JEFE_DE_ALMACEN' then raise exception 'el código debe ser único'; end if;
  -- puesto nuevo en Mantenimiento: rol del más cercano (MANTENIMIENTO)
  v_id2 := guardar_puesto('local', null, 'MANTENIMIENTO', 'Ayudante Mtto', 4::smallint, true, 'ensayo');
  select r.codigo into v_rol from puestos p join roles r on r.id=p.rol_equivalente_id where p.id=v_id2;
  if v_rol <> 'MANTENIMIENTO' then raise exception 'rol equivalente esperado MANTENIMIENTO, fue %', v_rol; end if;
  -- editar nombre, nivel, activo
  perform guardar_puesto('local', v_id, 'ALMACEN', 'Jefe de Bodega', 2::smallint, false, 'ensayo');
  if not exists (select 1 from puestos where id=v_id and nombre='Jefe de Bodega' and nivel=2 and not activo and codigo='JEFE_DE_ALMACEN') then
    raise exception 'guardar_puesto no editó (el código no debe cambiar)';
  end if;

  -- Cambio de área: falla con mensaje claro
  begin perform guardar_puesto('local', v_sup, 'MANTENIMIENTO', 'Supervisor', 3::smallint, true, null); raise exception 'FALLO: cambió de área';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; if sqlerrm not like '%no cambia de área%' then raise exception 'mensaje inesperado: %', sqlerrm; end if; end;
  -- Puesto con todos los permisos: no se edita
  begin perform guardar_puesto('local', v_probador, null, 'Probador', 3::smallint, true, null); raise exception 'FALLO: editó Probador';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform guardar_puesto('local', v_sa, null, 'X', 1::smallint, true, null); raise exception 'FALLO: editó SA';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Nivel inválido y nulo
  begin perform guardar_puesto('local', null, 'ALMACEN', 'Algo', 5::smallint, true, null); raise exception 'FALLO: nivel 5';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; if sqlerrm not like '%nivel%' then raise exception 'mensaje inesperado: %', sqlerrm; end if; end;
  begin perform guardar_puesto('local', null, 'ALMACEN', 'Algo', null::smallint, true, null); raise exception 'FALLO: nivel null';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Área inexistente
  begin perform guardar_puesto('local', null, 'NOEXISTE', 'Algo', 1::smallint, true, null); raise exception 'FALLO: área inexistente';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  -- Matriz de permisos: 2 cambios, tiene_permiso refleja
  if tiene_permiso('t5_tec', 'CATALOGO_PARADAS') then raise exception 'precondición: técnico no tenía CATALOGO_PARADAS'; end if;
  if not tiene_permiso('t5_tec', 'SIF_GESTIONAR') then raise exception 'precondición: técnico tenía SIF_GESTIONAR'; end if;
  v_n := guardar_permisos_puestos('local', jsonb_build_array(
    jsonb_build_object('puesto_id', v_tec, 'permiso', 'CATALOGO_PARADAS', 'activo', true),
    jsonb_build_object('puesto_id', v_tec, 'permiso', 'SIF_GESTIONAR', 'activo', false)), 'ensayo');
  if v_n <> 2 then raise exception 'debía devolver 2 y devolvió %', v_n; end if;
  if not tiene_permiso('t5_tec', 'CATALOGO_PARADAS') or tiene_permiso('t5_tec', 'SIF_GESTIONAR') then
    raise exception 'tiene_permiso del técnico no refleja los cambios';
  end if;
  select count(*) into v_n from auditoria where entidad='puestos' and entidad_id = v_tec::text;
  if v_n <> 1 then raise exception 'debía haber 1 auditoría del puesto técnico (%)', v_n; end if;

  -- Sin cambios reales: 0
  v_n := guardar_permisos_puestos('local', jsonb_build_array(
    jsonb_build_object('puesto_id', v_tec, 'permiso', 'CATALOGO_PARADAS', 'activo', true),
    jsonb_build_object('puesto_id', v_tec, 'permiso', 'SIF_GESTIONAR', 'activo', false)), 'ensayo');
  if v_n <> 0 then raise exception 'sin cambios debía devolver 0 y devolvió %', v_n; end if;

  -- Con PROBADOR: falla y no aplica ninguno
  begin
    perform guardar_permisos_puestos('local', jsonb_build_array(
      jsonb_build_object('puesto_id', v_tec, 'permiso', 'SIF_GESTIONAR', 'activo', true),
      jsonb_build_object('puesto_id', v_probador, 'permiso', 'SIF_GESTIONAR', 'activo', false)), null);
    raise exception 'FALLO: aceptó PROBADOR';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if tiene_permiso('t5_tec', 'SIF_GESTIONAR') then raise exception 'se aplicó un cambio pese al fallo (probador)'; end if;

  -- Puesto o permiso desconocido: nada se aplica
  begin
    perform guardar_permisos_puestos('local', jsonb_build_array(
      jsonb_build_object('puesto_id', v_tec, 'permiso', 'SIF_GESTIONAR', 'activo', true),
      jsonb_build_object('puesto_id', gen_random_uuid(), 'permiso', 'SIF_GESTIONAR', 'activo', true)), null);
    raise exception 'FALLO: puesto desconocido';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform guardar_permisos_puestos('local', jsonb_build_array(
      jsonb_build_object('puesto_id', v_tec, 'permiso', 'SIF_GESTIONAR', 'activo', true),
      jsonb_build_object('puesto_id', v_tec, 'permiso', 'NO_EXISTE', 'activo', true)), null);
    raise exception 'FALLO: permiso desconocido';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if tiene_permiso('t5_tec', 'SIF_GESTIONAR') then raise exception 'se aplicó un cambio pese al fallo (desconocido)'; end if;

  -- El Jefe de Mantenimiento no administra
  begin perform guardar_area('t5_jm', 'XYZ', 'x', 'APOYO', true, null); raise exception 'FALLO: jm guardó área';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform guardar_puesto('t5_jm', null, 'MANTENIMIENTO', 'x', 3::smallint, true, null); raise exception 'FALLO: jm guardó puesto';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform guardar_permisos_puestos('t5_jm', jsonb_build_array(
      jsonb_build_object('puesto_id', v_tec, 'permiso', 'SIF_GESTIONAR', 'activo', true)), null);
    raise exception 'FALLO: jm cambió la matriz';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if tiene_permiso('t5_tec', 'SIF_GESTIONAR') then raise exception 'jm alteró la matriz'; end if;

  -- listar_estructura('t5_jm'): solo Mantenimiento
  v_j := listar_estructura('t5_jm');
  if jsonb_array_length(v_j->'areas') <> 1 or v_j->'areas'->0->>'codigo' <> 'MANTENIMIENTO' then
    raise exception 'jm debe ver solo Mantenimiento: %', v_j->'areas';
  end if;
  if exists (select 1 from jsonb_array_elements(v_j->'puestos') e where e->>'area_codigo' <> 'MANTENIMIENTO') then
    raise exception 'jm ve puestos de otra área';
  end if;
  if jsonb_array_length(v_j->'permisos') < 10 then raise exception 'jm debe recibir los permisos'; end if;
  if (v_j->'areas'->0->>'personas')::int < 2 then raise exception 'personas del área mal contadas'; end if;
  -- listar_estructura('local'): todo
  v_j := listar_estructura('local');
  if jsonb_array_length(v_j->'areas') < 6 then raise exception 'local debe ver todas las áreas'; end if;
  if not exists (select 1 from jsonb_array_elements(v_j->'puestos') e where e->>'codigo'='TECNICO_MANTENIMIENTO'
                  and (e->'permisos') @> '"CATALOGO_PARADAS"' and (e->>'personas')::int >= 1 and e->>'nivel' = '3') then
    raise exception 'puesto técnico mal listado';
  end if;
  -- Sin permisos
  begin perform listar_estructura('t5_tec'); raise exception 'FALLO: técnico listó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; if sqlerrm <> 'No tienes permiso para ver esto.' then raise exception 'mensaje inesperado: %', sqlerrm; end if; end;

  -- Desactivar un puesto con gente lo saca de puestos_asignables, las personas siguen
  if not exists (select 1 from puestos_asignables('local') where puesto_id = v_tec) then raise exception 'precondición asignable'; end if;
  perform guardar_puesto('local', v_tec, 'MANTENIMIENTO', 'Técnico de Mantenimiento', 3::smallint, false, null);
  if exists (select 1 from puestos_asignables('local') where puesto_id = v_tec) then
    raise exception 'un puesto inactivo no debe ofrecerse';
  end if;
  if not exists (select 1 from usuarios where usuario='t5_tec' and puesto_id = v_tec) then raise exception 'la persona perdió su puesto'; end if;
end $$;

rollback;
