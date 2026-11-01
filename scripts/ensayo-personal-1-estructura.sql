-- Ensayo Task 1: áreas, temas de permisos y puestos. Todo dentro de una transacción con rollback.
begin;

do $$
declare
  v_n int;
  v_otra uuid;
  v_a text;
  v_b text;
begin
  -- 14 puestos, 3 inactivos (Calidad)
  select count(*) into v_n from puestos;
  if v_n <> 14 then raise exception 'Se esperaban 14 puestos y hay %', v_n; end if;
  select count(*) into v_n from puestos where not activo;
  if v_n <> 3 then raise exception 'Se esperaban 3 puestos inactivos y hay %', v_n; end if;
  select count(*) into v_n from puestos where not activo and codigo in ('JEFE_CALIDAD','SUPERVISOR_CALIDAD','ANALISTA_CALIDAD');
  if v_n <> 3 then raise exception 'Los inactivos deben ser los tres de Calidad'; end if;

  -- Jefe de Mantenimiento tiene los dos permisos; Supervisor y Técnico no
  select count(*) into v_n from puesto_permisos pp join puestos p on p.id = pp.puesto_id
   where p.codigo = 'JEFE_MANTENIMIENTO' and pp.permiso_codigo in ('CATALOGO_PARADAS','PERSONAL_GESTIONAR');
  if v_n <> 2 then raise exception 'JEFE_MANTENIMIENTO debe tener CATALOGO_PARADAS y PERSONAL_GESTIONAR'; end if;
  select count(*) into v_n from puesto_permisos pp join puestos p on p.id = pp.puesto_id
   where p.codigo in ('SUPERVISOR_MANTENIMIENTO','TECNICO_MANTENIMIENTO') and pp.permiso_codigo in ('CATALOGO_PARADAS','PERSONAL_GESTIONAR');
  if v_n <> 0 then raise exception 'Supervisor y Técnico de Mantenimiento no deben tener CATALOGO_PARADAS ni PERSONAL_GESTIONAR'; end if;
  select string_agg(permiso_codigo, ',' order by permiso_codigo) into v_a from puesto_permisos pp join puestos p on p.id = pp.puesto_id where p.codigo = 'SUPERVISOR_MANTENIMIENTO';
  select string_agg(permiso_codigo, ',' order by permiso_codigo) into v_b from puesto_permisos pp join puestos p on p.id = pp.puesto_id where p.codigo = 'TECNICO_MANTENIMIENTO';
  if v_a is distinct from v_b then raise exception 'Supervisor de Mantenimiento debe tener los mismos permisos que el Técnico'; end if;

  -- Pasante sin permisos
  select count(*) into v_n from puesto_permisos pp join puestos p on p.id = pp.puesto_id where p.codigo = 'PASANTE';
  if v_n <> 0 then raise exception 'PASANTE no debe tener permisos y tiene %', v_n; end if;

  -- Coordinador = Jefe de Producción, con VALIDAR
  select string_agg(permiso_codigo, ',' order by permiso_codigo) into v_a from puesto_permisos pp join puestos p on p.id = pp.puesto_id where p.codigo = 'JEFE_PRODUCCION';
  select string_agg(permiso_codigo, ',' order by permiso_codigo) into v_b from puesto_permisos pp join puestos p on p.id = pp.puesto_id where p.codigo = 'COORDINADOR_PRODUCCION';
  if v_a is distinct from v_b then raise exception 'Coordinador y Jefe de Producción deben tener el mismo conjunto: % / %', v_a, v_b; end if;
  if v_a not like '%VALIDAR%' or v_a not like '%REPORTES_PARADAS_VER%' then raise exception 'El Jefe de Producción debe incluir VALIDAR y REPORTES_PARADAS_VER'; end if;

  -- El área no cambia
  select id into v_otra from areas where codigo = 'MANTENIMIENTO';
  begin
    update puestos set area_id = v_otra where codigo = 'SUPERVISOR';
    raise exception 'FALLO: se pudo cambiar el área de un puesto';
  exception when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
  end;

  -- Un puesto no se borra
  begin
    delete from puestos where codigo = 'PASANTE';
    raise exception 'FALLO: se pudo borrar un puesto';
  exception when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
  end;

  -- Todos los permisos tienen tema válido
  select count(*) into v_n from permisos
   where tema is null or tema not in ('TURNOS','PARADAS','MANTENIMIENTO','DATOS','PERSONAS','ADMINISTRACION');
  if v_n <> 0 then raise exception '% permisos sin tema válido', v_n; end if;
  select count(*) into v_n from permisos where codigo in ('ESTRUCTURA_GESTIONAR','LECTURAS_SI','CODIGOS_MTTO_EDITAR','REPORTES_PARADAS_VER');
  if v_n <> 4 then raise exception 'Faltan permisos nuevos'; end if;

  -- Áreas: tipo y orden
  select count(*) into v_n from areas where codigo in ('ASEPTICO','PRUEBAS') and tipo = 'PRODUCCION';
  if v_n <> 2 then raise exception 'Aséptico y Pruebas deben ser PRODUCCION'; end if;
  select count(*) into v_n from areas where codigo not in ('ASEPTICO','PRUEBAS') and tipo <> 'APOYO';
  if v_n <> 0 then raise exception 'Las demás áreas deben ser APOYO'; end if;
  select count(*) into v_n from areas where codigo = 'CALIDAD' and not activo;
  if v_n <> 1 then raise exception 'Calidad debe estar inactiva'; end if;
end $$;

rollback;
