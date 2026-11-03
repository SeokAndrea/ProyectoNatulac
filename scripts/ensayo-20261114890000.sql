-- Ensayo de 20261114890000_fallas_nuevas.sql (Falla nueva, Parada nueva, cola, Quitar, Eliminar parada, 1000 caracteres).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   docker exec -i natulac-local-db-1 psql -U postgres -d natulac -v ON_ERROR_STOP=1 < scripts/ensayo-20261114890000.sql
-- Corre en la base de Pruebas con la migración ya aplicada. No deja nada.
begin;

-- Corre un SQL y devuelve el mensaje del error, o null si salió bien.
create function pg_temp.error_de(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

do $$
declare
  v_duena text := (select u.usuario from usuarios u where u.activo and es_dueno(u.usuario) limit 1);
  -- Alguien sin permiso de catálogo ni de eliminar paradas.
  v_otro text := (select u.usuario from usuarios u
                  where u.activo and not coalesce(es_dueno(u.usuario), false)
                    and not tiene_permiso(u.usuario, 'PARADAS_ELIMINAR') and not tiene_permiso(u.usuario, 'CATALOGO_PARADAS') limit 1);
  v_linea uuid := (select id from lineas order by codigo limit 1);
  v_tipo_equipo uuid := (select id from paradas_tipos where codigo = 'FALLA_EQUIPO');
  v_eq uuid; v_sis uuid; v_sub uuid; v_f1 uuid; v_f2 uuid; v_nueva uuid; v_nueva_sub uuid; v_nueva_sis uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_msg text;
  v_n integer;
  v_json jsonb;
begin
  if v_duena is null then raise exception 'Falta la dueña (es_dueno) en la base de Pruebas.'; end if;
  if v_otro is null then raise exception 'Falta un usuario sin permisos de catálogo ni de eliminar paradas.'; end if;
  if v_linea is null or v_tipo_equipo is null then raise exception 'Faltan una línea o el tipo FALLA_EQUIPO.'; end if;

  -- ---------------------------------------------------------------------
  -- 0. El permiso
  -- ---------------------------------------------------------------------
  if not exists (select 1 from permisos where codigo = 'PARADAS_ELIMINAR' and tema = 'PARADAS') then raise exception '0.1 Falta el permiso PARADAS_ELIMINAR'; end if;
  if tiene_permiso(v_otro, 'PARADAS_ELIMINAR') then raise exception '0.2 Nadie más debe traer PARADAS_ELIMINAR'; end if;

  -- ---------------------------------------------------------------------
  -- 1. Cada equipo tiene su «Falla nueva» y existe «Equipo no listado»
  -- ---------------------------------------------------------------------
  if exists (
    select 1 from catalogo_equipos e
    where not exists (
      select 1 from catalogo_fallas f
      join catalogo_subsistemas u on u.id = f.subsistema_id and u.reservada and u.nombre = 'Sin clasificar'
      join catalogo_sistemas s on s.id = u.sistema_id and s.reservada and s.nombre = 'General'
      where s.equipo_id = e.id and f.reservada and f.nombre = 'Falla nueva' and f.numero = 1 and f.clase = 'NO_PROGRAMADA' and f.activo)
  ) then raise exception '1.1 Hay un equipo sin su Falla nueva'; end if;
  if (select count(*) from catalogo_equipos where reservada) <> 1 then raise exception '1.2 Debe haber un solo Equipo no listado'; end if;
  if (select tipo from catalogo_equipos where reservada) <> 'SERVICIOS' then raise exception '1.3 El Equipo no listado debe ser de servicios (todas las líneas)'; end if;

  -- Un equipo nuevo recibe la suya solo.
  insert into catalogo_equipos (sufijo, nombre, tipo) values ('ZZENS', 'Equipo de ensayo', 'SERVICIOS') returning id into v_eq;
  select f.id, u.id, s.id into v_nueva, v_nueva_sub, v_nueva_sis
  from catalogo_fallas f join catalogo_subsistemas u on u.id = f.subsistema_id join catalogo_sistemas s on s.id = u.sistema_id
  where s.equipo_id = v_eq and f.reservada;
  if v_nueva is null then raise exception '1.4 El equipo nuevo debe traer su Falla nueva'; end if;

  -- La lectura del catálogo trae la marca.
  v_json := listar_catalogo_fallas();
  if not exists (select 1 from jsonb_array_elements(v_json -> 'fallas') f where f ->> 'id' = v_nueva::text and (f ->> 'reservada')::boolean) then
    raise exception '1.5 listar_catalogo_fallas debe marcar la reservada';
  end if;
  if not (v_json -> 'equipos' -> 0 ? 'creado_en') then raise exception '1.6 listar_catalogo_fallas debe seguir trayendo creado_en (20261114790000)'; end if;

  -- ---------------------------------------------------------------------
  -- 2. Lo reservado no se toca ni se llena
  -- ---------------------------------------------------------------------
  foreach v_msg in array array[
    format('update catalogo_fallas set nombre = ''x'' where id = %L', v_nueva),
    format('update catalogo_fallas set activo = false where id = %L', v_nueva),
    format('update catalogo_subsistemas set nombre = ''x'' where id = %L', v_nueva_sub),
    format('update catalogo_sistemas set activo = false where id = %L', v_nueva_sis),
    format('update catalogo_equipos set nombre = ''x'' where reservada'),
    format('insert into catalogo_fallas (subsistema_id, numero, nombre) values (%L, 2, ''otra'')', v_nueva_sub),
    format('insert into catalogo_subsistemas (sistema_id, sufijo, nombre) values (%L, ''OTR'', ''Otro'')', v_nueva_sis)
  ] loop
    if pg_temp.error_de(v_msg) is null then raise exception '2.1 Debía fallar: %', v_msg; end if;
  end loop;
  if coalesce(pg_temp.error_de(format('delete from catalogo_fallas where id = %L', v_nueva)), '') not like '%no se borra%' then
    raise exception '2.2 Sin quitar_catalogo() el catálogo no se borra';
  end if;
  if coalesce(pg_temp.error_de(format('select quitar_catalogo(%L, ''FALLA'', %L)', v_duena, v_nueva)), '') not like '%reservada%' then
    raise exception '2.3 La Falla nueva no se puede quitar';
  end if;

  -- ---------------------------------------------------------------------
  -- 3. Lo que sí es del usuario: un sistema, un subsistema y dos fallas de ensayo
  -- ---------------------------------------------------------------------
  insert into catalogo_sistemas (equipo_id, sufijo, nombre) values (v_eq, 'ZZS', 'Sistema de ensayo') returning id into v_sis;
  insert into catalogo_subsistemas (sistema_id, sufijo, nombre) values (v_sis, 'ZZU', 'Subsistema mal escrito') returning id into v_sub;
  insert into catalogo_fallas (subsistema_id, numero, nombre) values (v_sub, 1, 'Falla A') returning id into v_f1;
  insert into catalogo_fallas (subsistema_id, numero, nombre) values (v_sub, 2, 'Falla B') returning id into v_f2;

  v_json := uso_catalogo('SUBSISTEMA', v_sub);
  if (v_json ->> 'fallas')::int <> 2 or (v_json ->> 'paradas')::int <> 0 or (v_json ->> 'sif')::int <> 0 or (v_json ->> 'reservada')::boolean then
    raise exception '3.1 uso_catalogo de un subsistema sin uso: %', v_json;
  end if;
  if (uso_catalogo('EQUIPO', v_eq) ->> 'fallas')::int <> 3 then raise exception '3.2 El equipo cuenta 2 fallas + la Falla nueva'; end if;

  -- ---------------------------------------------------------------------
  -- 4. Paradas: la cola «Fallas nuevas»
  -- ---------------------------------------------------------------------
  insert into paradas (linea_id, tipo_id, clase, tipo_nombre, inicio, fin, responsable, nota, falla_produccion_id)
  values (v_linea, v_tipo_equipo, 'NO_PROGRAMADA', 'Falla nueva · Sin clasificar', now() - interval '2 hours', now() - interval '1 hour', 'OPERACIONAL', 'se soltó un rodillo', v_nueva)
  returning id into v_p1;
  -- Producción dijo «Falla nueva» pero Mantenimiento puso la falla real: no va a la cola.
  insert into paradas (linea_id, tipo_id, clase, tipo_nombre, inicio, fin, responsable, falla_produccion_id, falla_final_id)
  values (v_linea, v_tipo_equipo, 'NO_PROGRAMADA', 'Falla A · Subsistema mal escrito', now() - interval '4 hours', now() - interval '3 hours', 'MANTENIMIENTO', v_nueva, v_f1)
  returning id into v_p2;
  -- Una falla normal tampoco.
  insert into paradas (linea_id, tipo_id, clase, tipo_nombre, inicio, fin, responsable, falla_produccion_id)
  values (v_linea, v_tipo_equipo, 'NO_PROGRAMADA', 'Falla B · Subsistema mal escrito', now() - interval '6 hours', now() - interval '5 hours', 'OPERACIONAL', v_f2)
  returning id into v_p3;

  select count(*) into v_n from listar_fallas_nuevas(v_duena) where parada_id = v_p1;
  if v_n <> 1 then raise exception '4.1 La parada con Falla nueva debe estar en la cola'; end if;
  select count(*) into v_n from listar_fallas_nuevas(v_duena) where parada_id in (v_p2, v_p3);
  if v_n <> 0 then raise exception '4.2 Con la falla real puesta, o con una falla normal, no va a la cola'; end if;
  if (select origen from listar_fallas_nuevas(v_duena) where parada_id = v_p1) <> 'Equipo de ensayo' then raise exception '4.3 El origen debe ser el equipo'; end if;
  if (select nota from listar_fallas_nuevas(v_duena) where parada_id = v_p1) <> 'se soltó un rodillo' then raise exception '4.4 Debe traer la observación de Producción'; end if;

  if coalesce(pg_temp.error_de(format('select * from listar_fallas_nuevas(%L)', v_otro)), '') not like '%No tienes permiso%' then
    raise exception '4.5 Quien no ve el catálogo no ve la cola';
  end if;
  if coalesce(pg_temp.error_de(format('select descartar_fallas_nuevas(%L, array[%L]::uuid[])', v_otro, v_p1)), '') not like '%No tienes permiso%' then
    raise exception '4.6 Quien no edita el catálogo no descarta';
  end if;

  -- Descartar solo marca revisada: la parada se queda.
  if descartar_fallas_nuevas(v_duena, array[v_p1, v_p2, v_p3]) <> 1 then raise exception '4.7 Solo la de Falla nueva se descarta'; end if;
  if not exists (select 1 from paradas where id = v_p1 and revisada_en is not null and revisada_por is not null) then raise exception '4.8 Debe quedar revisada'; end if;
  select count(*) into v_n from listar_fallas_nuevas(v_duena) where parada_id = v_p1;
  if v_n <> 0 then raise exception '4.9 Descartada, ya no sale en la cola'; end if;
  if descartar_fallas_nuevas(v_duena, array[v_p1]) <> 0 then raise exception '4.10 Descartar dos veces no cuenta'; end if;

  -- ---------------------------------------------------------------------
  -- 5. Quitar solo lo que nunca se usó
  -- ---------------------------------------------------------------------
  if (uso_catalogo('SUBSISTEMA', v_sub) ->> 'paradas')::int <> 2 then raise exception '5.1 Las fallas A y B tienen 1 parada cada una'; end if;
  if coalesce(pg_temp.error_de(format('select quitar_catalogo(%L, ''SUBSISTEMA'', %L)', v_duena, v_sub)), '') not like '%No se puede quitar%' then
    raise exception '5.2 Un subsistema con paradas no se quita';
  end if;
  if coalesce(pg_temp.error_de(format('select quitar_catalogo(%L, ''FALLA'', %L)', v_otro, v_f1)), '') not like '%No tienes permiso%' then
    raise exception '5.3 Quien no edita el catálogo no quita';
  end if;
  -- Se eliminan las paradas de ensayo y entonces sí se puede quitar.
  delete from paradas where id in (v_p2, v_p3);
  perform quitar_catalogo(v_duena, 'FALLA', v_f1);
  if exists (select 1 from catalogo_fallas where id = v_f1) then raise exception '5.4 La falla debió quitarse'; end if;
  if not exists (select 1 from catalogo_fallas where id = v_f2) then raise exception '5.5 Quitar una falla no toca a las demás'; end if;
  perform quitar_catalogo(v_duena, 'SUBSISTEMA', v_sub);
  if exists (select 1 from catalogo_subsistemas where id = v_sub) or exists (select 1 from catalogo_fallas where id = v_f2) then
    raise exception '5.6 El subsistema se quita con sus fallas';
  end if;
  if not exists (select 1 from auditoria where entidad = 'catalogo_subsistema' and accion = 'ELIMINAR' and entidad_id = v_sub::text) then
    raise exception '5.7 Quitar deja la foto en la auditoría';
  end if;
  -- La señal de «quitar» no queda encendida: borrar a mano sigue bloqueado.
  insert into catalogo_subsistemas (sistema_id, sufijo, nombre) values (v_sis, 'ZZV', 'Otro') returning id into v_sub;
  if coalesce(pg_temp.error_de(format('delete from catalogo_subsistemas where id = %L', v_sub)), '') not like '%no se borra%' then
    raise exception '5.8 Fuera de quitar_catalogo() no se borra';
  end if;

  -- Un equipo sin uso se va con todo lo suyo, también con lo reservado. (Antes, la parada de la cola que usó su Falla nueva ya no cuenta: se elimina.)
  if coalesce(pg_temp.error_de(format('select quitar_catalogo(%L, ''EQUIPO'', %L)', v_duena, v_eq)), '') not like '%No se puede quitar%' then
    raise exception '5.9 Un equipo cuya Falla nueva ya se usó no se quita';
  end if;
  delete from paradas where falla_produccion_id = v_nueva or falla_final_id = v_nueva;
  perform quitar_catalogo(v_duena, 'EQUIPO', v_eq);
  if exists (select 1 from catalogo_equipos where id = v_eq) or exists (select 1 from catalogo_sistemas where equipo_id = v_eq) then
    raise exception '5.10 El equipo se quita con sus sistemas (también el reservado)';
  end if;

  -- ---------------------------------------------------------------------
  -- 6. «Parada nueva» por cada grupo de «Otras paradas»
  -- ---------------------------------------------------------------------
  if exists (
    select 1 from paradas_tipos t
    where not t.reservada and t.prefijo_planilla <> '' and t.familia not in ('EQUIPO', 'EQUIPO_PROCESO', 'OCIOSO')
      and not exists (select 1 from paradas_tipos r where r.reservada and r.codigo = 'PARADA_NUEVA_' || t.prefijo_planilla)
  ) then raise exception '6.1 Hay un grupo de Otras paradas sin su Parada nueva'; end if;
  if exists (select 1 from paradas_tipos r where r.reservada and (r.tiempo_guia_min is not null or r.equipo_id is not null or not r.activo or r.nombre not like 'Parada nueva · %')) then
    raise exception '6.2 Las Parada nueva no llevan tiempo guía ni equipo, están activas y se llaman «Parada nueva · …»';
  end if;
  if exists (select 1 from paradas_tipos r where r.reservada and r.familia = 'PROGRAMADA' and r.clase <> 'PROGRAMADA')
     or exists (select 1 from paradas_tipos r where r.reservada and r.familia <> 'PROGRAMADA' and r.clase <> 'NO_PROGRAMADA') then
    raise exception '6.3 La clase sale de la familia';
  end if;
  -- Sin líneas asignadas = todas las líneas.
  if exists (select 1 from paradas_tipos_lineas tl join paradas_tipos r on r.id = tl.tipo_id where r.reservada) then raise exception '6.4 Debe salir en todas las líneas'; end if;
  insert into paradas_tipos (codigo, nombre, clase, familia, prefijo_planilla, secuencia_planilla)
  values ('ZZ_ENSAYO', 'Tipo de ensayo', 'NO_PROGRAMADA', 'OPERACIONAL', 'ZZP', 1);
  if not exists (select 1 from paradas_tipos where codigo = 'PARADA_NUEVA_ZZP' and reservada and secuencia_planilla = 99) then
    raise exception '6.5 Un grupo nuevo recibe su Parada nueva solo';
  end if;
  if pg_temp.error_de(format('update paradas_tipos set nombre = ''x'' where codigo = ''PARADA_NUEVA_ZZP''')) is null then
    raise exception '6.6 La Parada nueva no se cambia';
  end if;

  -- Una parada hecha con «Parada nueva» también va a la cola.
  insert into paradas (linea_id, tipo_id, clase, tipo_nombre, inicio, fin, responsable, nota)
  values (v_linea, (select id from paradas_tipos where codigo = 'PARADA_NUEVA_ZZP'), 'NO_PROGRAMADA', 'Parada nueva · ZZP', now() - interval '30 minutes', now() - interval '10 minutes', 'OPERACIONAL', 'falta de agua')
  returning id into v_p1;
  if (select origen from listar_fallas_nuevas(v_duena) where parada_id = v_p1) is distinct from 'Parada nueva · ZZP' then
    raise exception '6.7 La Parada nueva entra en la cola con su grupo como origen';
  end if;

  -- ---------------------------------------------------------------------
  -- 7. Eliminar paradas: permiso propio
  -- ---------------------------------------------------------------------
  if coalesce(pg_temp.error_de(format('select eliminar_parada(%L, %L)', v_otro, v_p1)), '') not like '%No tienes permiso para eliminar paradas%' then
    raise exception '7.1 Sin el permiso no se elimina';
  end if;
  if coalesce(pg_temp.error_de(format('select eliminar_parada_mantenimiento(%L, %L)', v_otro, v_p1)), '') not like '%No tienes permiso para eliminar paradas%' then
    raise exception '7.2 Tampoco por la función de Mantenimiento';
  end if;
  perform eliminar_parada(v_duena, v_p1);
  if exists (select 1 from paradas where id = v_p1) then raise exception '7.3 La dueña debe poder eliminarla'; end if;
  if not exists (select 1 from auditoria where entidad = 'paradas' and accion = 'ELIMINAR' and entidad_id = v_p1::text) then
    raise exception '7.4 Eliminar deja la auditoría';
  end if;

  -- ---------------------------------------------------------------------
  -- 8. «¿Qué se realizó?»: 1000 caracteres
  -- ---------------------------------------------------------------------
  if exists (select 1 from pg_proc where proname in ('terminar_parada', 'clasificar_falla_mantenimiento') and pg_get_functiondef(oid) like '%left(v_solucion, 300)%') then
    raise exception '8.1 Quedó una función cortando a 300';
  end if;
  if (select count(*) from pg_proc where proname in ('terminar_parada', 'clasificar_falla_mantenimiento') and pg_get_functiondef(oid) like '%left(v_solucion, 1000)%') < 2 then
    raise exception '8.2 terminar_parada y clasificar_falla_mantenimiento deben cortar a 1000';
  end if;

  raise notice 'Ensayo 20261114890000: todo bien.';
end;
$$;

rollback;
