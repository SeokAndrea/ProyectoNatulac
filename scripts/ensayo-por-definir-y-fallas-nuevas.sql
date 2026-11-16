-- Ensayo de 20261115590000 (parada por definir), 20261115690000 (observaciones en la SIF)
-- y 20261115790000 (identificar «Falla nueva»).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   docker exec -i natulac-local-db-1 psql -U postgres -d natulac -v ON_ERROR_STOP=1 < scripts/ensayo-por-definir-y-fallas-nuevas.sql
-- Corre con las tres migraciones ya aplicadas. No deja nada.
begin;

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
  -- Un supervisor de Aséptico (registra paradas, no es de Mantenimiento ni edita el catálogo).
  v_sup text := (select u.usuario from usuarios u
                 where u.activo and tiene_permiso(u.usuario, 'PARADAS_REGISTRAR') and not es_de_mantenimiento(u.usuario)
                   and not tiene_permiso(u.usuario, 'CATALOGO_PARADAS') and not coalesce(es_dueno(u.usuario), false) limit 1);
  -- Quien edita el catálogo.
  v_jefe text := (select u.usuario from usuarios u where u.activo and tiene_permiso(u.usuario, 'CATALOGO_PARADAS') limit 1);
  v_mtto text := 'zz_ensayo_mtto';
  v_l1 uuid := (select id from lineas where codigo = 'LINEA_1');
  v_l2 uuid := (select id from lineas where codigo = 'LINEA_2');
  v_tipo_equipo uuid := (select id from paradas_tipos where codigo = 'FALLA_EQUIPO');
  v_uid uuid;
  v_id uuid;
  v_msg text;
  v_eq uuid; v_sis uuid; v_sub uuid; v_f uuid; v_f2 uuid; v_nueva uuid;
  v_p uuid[] := '{}';
  v_q uuid[] := '{}';
  v_r uuid[] := '{}';
  v_base timestamptz;
  v_sif uuid; v_sif2 uuid; v_t uuid;
  v_json jsonb;
  v_n integer;
  i integer;
begin
  if v_sup is null or v_jefe is null or v_l1 is null or v_l2 is null then
    raise exception 'Faltan datos: supervisor %, jefe de catálogo %, líneas % %', v_sup, v_jefe, v_l1, v_l2;
  end if;

  -- Un usuario de Mantenimiento de ensayo.
  -- El rol sale del puesto (20261114090000).
  insert into usuarios (usuario, password_hash, puesto_id)
  values (v_mtto, 'x', (select id from puestos where nombre = 'Técnico de Mantenimiento' and activo limit 1))
  returning id into v_uid;
  if not es_de_mantenimiento(v_mtto) then raise exception '0.1 El usuario de ensayo debe ser de Mantenimiento'; end if;

  -- =====================================================================
  -- A. Parada por definir
  -- =====================================================================
  v_id := abrir_parada_mantenimiento(v_sup, 'LINEA_1', 'FALLA_EQUIPO', 'Se botó el nivel', null, 'POR_DEFINIR');
  if (select responsable from paradas where id = v_id) <> 'POR_DEFINIR' then raise exception 'A.1 Debe quedar por definir'; end if;

  v_msg := pg_temp.error_de(format('select terminar_parada(%L, %L, null, null, %L)', v_sup, v_id, 'se arregló'));
  if coalesce(v_msg, '') not like '%Operacional antes de terminarla%' then raise exception 'A.2 El supervisor no la termina por definir: %', v_msg; end if;

  v_msg := pg_temp.error_de(format('select definir_responsable_parada(%L, %L, ''MANTENIMIENTO'')', v_sup, v_id));
  if coalesce(v_msg, '') not like '%Solo Mantenimiento%' then raise exception 'A.3 El supervisor no la marca de Mantenimiento: %', v_msg; end if;

  perform definir_responsable_parada(v_mtto, v_id, 'MANTENIMIENTO');
  if (select responsable from paradas where id = v_id) <> 'MANTENIMIENTO' then raise exception 'A.4 Mantenimiento la toma'; end if;

  v_msg := pg_temp.error_de(format('select definir_responsable_parada(%L, %L, ''OPERACIONAL'')', v_sup, v_id));
  if coalesce(v_msg, '') not like '%ya la tomó Mantenimiento%' then raise exception 'A.5 Tomada por Mantenimiento, el supervisor no la cambia: %', v_msg; end if;

  -- Tomada por Mantenimiento, el supervisor no la termina aunque el interruptor del área esté apagado.
  update areas set mantenimiento_finaliza = false where id = (select area_id from lineas where id = v_l1);
  v_msg := pg_temp.error_de(format('select terminar_parada(%L, %L, null, null, %L)', v_sup, v_id, 'se arregló'));
  if coalesce(v_msg, '') not like '%la termina Mantenimiento%' then raise exception 'A.5b Sin interruptor, igual la termina Mantenimiento: %', v_msg; end if;

  -- Otra: el supervisor la marca Operacional y la termina él.
  update paradas set fin = now(), solucion = 'cerrada para seguir' where id = v_id;
  v_id := abrir_parada_mantenimiento(v_sup, 'LINEA_1', 'FALLA_EQUIPO', 'Se trancó la tapadora', null, 'POR_DEFINIR');
  perform definir_responsable_parada(v_sup, v_id, 'OPERACIONAL');
  perform terminar_parada(v_sup, v_id, null, null, 'Se destrancó');
  if (select responsable || '/' || (fin is not null)::text from paradas where id = v_id) <> 'OPERACIONAL/true' then
    raise exception 'A.6 Operacional y terminada por el supervisor';
  end if;
  if not exists (select 1 from auditoria where entidad = 'paradas' and entidad_id = v_id::text and resumen like 'Marcó la parada%Operacional') then
    raise exception 'A.7 Falta la auditoría de la clasificación';
  end if;

  -- El check acepta POR_DEFINIR y nada más raro.
  if pg_temp.error_de(format('update paradas set responsable = ''OTRO'' where id = %L', v_id)) is null then raise exception 'A.8 responsable fuera de la lista'; end if;

  -- =====================================================================
  -- B. Identificar «Falla nueva»
  -- =====================================================================
  -- La regla de siempre en el área de la Línea 1 (por jornada, 3.ª Inspección, 4.ª Intervención); las
  -- paradas van desde el inicio de la jornada de hoy, para no cruzar las 7:00.
  insert into sif_config (area_id, ventana, inspeccion_en, intervencion_en)
  values ((select area_id from lineas where id = v_l1), 'DIA', 3, 4)
  on conflict (area_id) do update set ventana = 'DIA', inspeccion_en = 3, intervencion_en = 4;
  v_base := inicio_jornada_planta(now());
  insert into catalogo_equipos (sufijo, nombre, tipo) values ('ZZENS', 'Equipo de ensayo', 'SERVICIOS') returning id into v_eq;
  select f.id into v_nueva from catalogo_fallas f join catalogo_subsistemas u on u.id = f.subsistema_id join catalogo_sistemas s on s.id = u.sistema_id
  where s.equipo_id = v_eq and f.reservada;
  insert into catalogo_sistemas (equipo_id, sufijo, nombre) values (v_eq, 'ZZS', 'Sistema de ensayo') returning id into v_sis;
  insert into catalogo_subsistemas (sistema_id, sufijo, nombre) values (v_sis, 'ZZU', 'Sensores') returning id into v_sub;
  insert into catalogo_fallas (subsistema_id, numero, nombre) values (v_sub, 1, 'Sensor de nivel') returning id into v_f;
  insert into catalogo_fallas (subsistema_id, numero, nombre) values (v_sub, 2, 'Válvula') returning id into v_f2;

  -- Tres «Falla nueva» en la Línea 1 (con observación): con la regla de siempre nace la Inspección.
  for i in 1..3 loop
    insert into paradas (linea_id, tipo_id, clase, tipo_nombre, inicio, fin, responsable, nota, solucion, falla_produccion_id)
    values (v_l1, v_tipo_equipo, 'NO_PROGRAMADA', 'Falla nueva · Sin clasificar', v_base + make_interval(mins => 10 * i), v_base + make_interval(mins => 10 * i + 5),
            'OPERACIONAL', 'nivel bajo ' || i, 'se limpió el sensor ' || i, v_nueva)
    returning id into v_id;
    v_p := v_p || v_id;
  end loop;
  select sif_id into v_sif from paradas where id = v_p[3];
  if v_sif is null or (select falla_id from solicitudes_intervencion where id = v_sif) <> v_nueva then
    raise exception 'B.1 Debía nacer la SIF de la «Falla nueva»';
  end if;

  -- La cola trae la falla y la SIF.
  select count(*) into v_n from listar_fallas_nuevas(v_jefe) c where c.parada_id = any (v_p) and c.falla_id = v_nueva and c.sif_paradas = 3;
  if v_n <> 3 then raise exception 'B.2 listar_fallas_nuevas debe traer falla_id y la SIF (vino %)', v_n; end if;

  -- La SIF muestra las observaciones (20261115690000).
  select count(*) into v_n from listar_paradas_sif(v_jefe, v_sif) x where x.nota like 'nivel bajo%' and x.solucion like 'se limpió%';
  if v_n <> 3 then raise exception 'B.3 listar_paradas_sif debe traer nota y solución (vino %)', v_n; end if;

  -- Sin permiso de catálogo, no; con la reservada, no.
  if coalesce(pg_temp.error_de(format('select identificar_falla_nueva(%L, %L, %L)', v_sup, v_p[1], v_f)), '') not like '%permiso%' then
    raise exception 'B.4 Solo quien edita el catálogo identifica';
  end if;
  if coalesce(pg_temp.error_de(format('select identificar_falla_nueva(%L, %L, %L)', v_jefe, v_p[1], v_nueva)), '') not like '%falla real%' then
    raise exception 'B.5 No se identifica con la «Falla nueva»';
  end if;

  -- Identificar una: van las tres de su SIF, y la SIF toma el nombre.
  v_json := identificar_falla_nueva(v_jefe, v_p[1], v_f);
  if (v_json ->> 'paradas')::int <> 3 or (v_json ->> 'unida')::boolean then raise exception 'B.6 Debía identificar las 3 sin unir: %', v_json; end if;
  if (select falla_id from solicitudes_intervencion where id = v_sif) <> v_f then raise exception 'B.7 La SIF debe tomar la falla real'; end if;
  if exists (select 1 from paradas where id = any (v_p) and (falla_produccion_id <> v_f or revisada_en is null or sif_id <> v_sif or tipo_nombre <> 'Sensor de nivel · Sensores')) then
    raise exception 'B.8 Las paradas quedan con la falla real, revisadas y en la misma SIF';
  end if;
  if exists (select 1 from listar_fallas_nuevas(v_jefe) c where c.parada_id = any (v_p)) then raise exception 'B.9 Salen de la cola'; end if;
  if coalesce(pg_temp.error_de(format('select identificar_falla_nueva(%L, %L, %L)', v_jefe, v_p[1], v_f)), '') not like '%ya no tiene%' then
    raise exception 'B.10 Dos veces no';
  end if;

  -- Unir: 3 «Válvula» (su SIF T) y 3 «Falla nueva» más (SIF nueva); identificar estas como «Válvula» las une en T.
  for i in 1..3 loop
    insert into paradas (linea_id, tipo_id, clase, tipo_nombre, inicio, fin, responsable, falla_produccion_id)
    values (v_l1, v_tipo_equipo, 'NO_PROGRAMADA', 'Válvula · Sensores', v_base + make_interval(mins => 100 + 10 * i), v_base + make_interval(mins => 105 + 10 * i), 'OPERACIONAL', v_f2)
    returning id into v_id;
    v_q := v_q || v_id;
  end loop;
  select sif_id into v_t from paradas where id = v_q[3];
  for i in 1..3 loop
    insert into paradas (linea_id, tipo_id, clase, tipo_nombre, inicio, fin, responsable, falla_produccion_id)
    values (v_l1, v_tipo_equipo, 'NO_PROGRAMADA', 'Falla nueva · Sin clasificar', v_base + make_interval(mins => 200 + 10 * i), v_base + make_interval(mins => 205 + 10 * i), 'OPERACIONAL', v_nueva)
    returning id into v_id;
    v_r := v_r || v_id;
  end loop;
  select sif_id into v_sif2 from paradas where id = v_r[3];
  if v_t is null or v_sif2 is null or v_t = v_sif2 then raise exception 'B.11 Debían nacer dos SIF distintas'; end if;

  v_json := identificar_falla_nueva(v_jefe, v_r[2], v_f2);
  if not (v_json ->> 'unida')::boolean then raise exception 'B.12 Debían unirse: %', v_json; end if;
  if exists (select 1 from solicitudes_intervencion where id = v_sif2) then raise exception 'B.13 La SIF más nueva se borra al unirse'; end if;
  if (select count(*) from paradas where sif_id = v_t) <> 6 then raise exception 'B.14 La que queda tiene las 6'; end if;
  -- Con 6 (la regla pide 4) la Inspección subió.
  if (select estado from solicitudes_intervencion where id = v_t) = 'INSPECCION' then raise exception 'B.15 Con 6 la inspección sube a intervención'; end if;
  if not exists (select 1 from auditoria where entidad = 'solicitudes_intervencion' and entidad_id = v_sif2::text and accion = 'ELIMINAR') then
    raise exception 'B.16 Falta la auditoría de la unión';
  end if;

  -- Una sola, sin SIF (Línea 2): solo ella.
  insert into paradas (linea_id, tipo_id, clase, tipo_nombre, inicio, fin, responsable, falla_produccion_id)
  values (v_l2, v_tipo_equipo, 'NO_PROGRAMADA', 'Falla nueva · Sin clasificar', v_base + interval '5 minutes', v_base + interval '10 minutes', 'OPERACIONAL', v_nueva)
  returning id into v_id;
  v_json := identificar_falla_nueva(v_jefe, v_id, v_f);
  if (v_json ->> 'paradas')::int <> 1 or v_json ->> 'sif' is not null then raise exception 'B.17 Sin SIF: solo ella y sin SIF: %', v_json; end if;

  raise notice 'Ensayo OK: por definir (A.1–A.8, A.5b) e identificar falla nueva (B.1–B.17).';
end;
$$;

rollback;
