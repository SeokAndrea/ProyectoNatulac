-- Ensayo de 20261116590000_tickets_paletas.sql (ticket de paleta por sistema, vida útil y búsqueda).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   cd scripts/base-local && node correr.mjs --migracion ../../supabase/migrations/20261116590000_tickets_paletas.sql ../ensayo-tickets-paletas.sql
begin;

create function pg_temp.linea(p_pantalla jsonb, p_codigo text) returns jsonb
language sql as $$
  select e from jsonb_array_elements(p_pantalla -> 'lineas') e where e ->> 'linea_codigo' = p_codigo;
$$;
create function pg_temp.falla(p_sql text, p_texto text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  if position(p_texto in sqlerrm) = 0 then raise exception 'Mensaje inesperado: %', sqlerrm; end if;
  return true;
end;
$$;

do $$
declare
  v_area uuid := (select id from areas where codigo = 'PRUEBAS');
  v_linea uuid;
  v_cod text;
  v_mz uuid;
  v_pres uuid;
  v_tt1 uuid := (select id from turno_tipos where codigo = 'TURNO_1');
  v_grupo uuid := (select id from grupos order by codigo limit 1);
  v_sis uuid := usuario_sistema_id();
  v_t uuid;
  v_r jsonb;
  v_p jsonb;
  v_p2 jsonb;
  v_id uuid;
  v_n1 integer;
  v_vacios integer;
begin
  select id, codigo into v_linea, v_cod from lineas where area_id = v_area and activo order by codigo limit 1;
  select s.id into v_mz from sabores s join familias_producto f on f.id = s.familia_id where s.nombre ilike 'manzana' and es_familia_clasica(f.nombre) limit 1;
  select id into v_pres from presentaciones where volumen_ml = 1000;
  if v_linea is null or v_mz is null or v_pres is null then raise exception 'Faltan la línea de Pruebas, Manzana Clásico o la presentación de 1000 ml.'; end if;

  -- ---------------------------------------------------------------------
  -- 0. Vida útil cargada de la tabla y el permiso nuevo
  -- ---------------------------------------------------------------------
  if (select vida_util_meses from sabores where id = v_mz) is distinct from 12 then raise exception '0: Manzana Clásico = 12 meses'; end if;
  if exists (select 1 from sabores s join familias_producto f on f.id = s.familia_id
              where f.nombre = 'Jucosa' and s.nombre ilike 'naranja' and s.vida_util_meses is distinct from 7) then raise exception '0: Naranja Jucosa = 7 meses'; end if;
  select count(*) into v_vacios from sabores where vida_util_meses is null;
  raise notice 'Sabores sin vida útil en la base local (se completan en Edición de Datos): % — %', v_vacios,
    (select string_agg(coalesce(f.nombre, '?') || '/' || s.nombre, ', ' order by f.nombre, s.nombre)
       from sabores s left join familias_producto f on f.id = s.familia_id where s.vida_util_meses is null);
  if not exists (select 1 from permisos where codigo = 'ROBOT_TAVIL_TICKETS') then raise exception '0: falta el permiso'; end if;
  if exists (select 1 from puesto_permisos where permiso_codigo = 'ROBOT_TAVIL_TICKETS') then raise exception '0: no nace en ningún puesto'; end if;
  if robot_tavil_vence(date '2026-11-17', v_mz) <> date '2027-11-17' then raise exception '0: 17/11/2026 + 12 meses'; end if;
  if robot_tavil_vence(date '2026-01-31', v_mz) <> date '2027-01-31' then raise exception '0: fin de mes'; end if;

  -- Escenario: operador (Probador) y supervisor de Pruebas, una corrida de Manzana 1000 ml.
  update turnos set estado = 'CERRADO' where area_id = v_area and estado = 'ABIERTO';
  delete from robot_tavil_seguimiento where linea_id in (select id from lineas where area_id = v_area);
  insert into usuarios (usuario, password_hash, nombre, puesto_id, activo)
  select x.u, 'x', x.n, p.id, true
    from (values ('tk_op', 'Operador Ticket', 'PROBADOR'), ('tk_sup', 'Supervisor Ticket', 'SUPERVISOR')) x(u, n, pc)
    join puestos p on p.codigo = x.pc;
  delete from usuario_roles where usuario_id = (select id from usuarios where usuario = 'tk_sup');
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, r.id, v_area from usuarios u, roles r where u.usuario = 'tk_sup' and r.codigo = 'SUPERVISOR';
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, created_at)
  values ('TK-A', v_area, v_sis, v_tt1, v_grupo, current_date, time '07:00', now() - interval '3 hours')
  returning id into v_t;
  insert into turno_lineas (turno_id, linea_id, sabor_id, presentacion_id, lote, activa, activada_en)
  values (v_t, v_linea, v_mz, v_pres, 'TK-1', true, now() - interval '3 hours');

  -- ---------------------------------------------------------------------
  -- 1. Interruptor: apagado por defecto, solo con el permiso, queda en Auditoría
  -- ---------------------------------------------------------------------
  v_r := robot_tavil_estado('tk_op');
  if (v_r -> 'tickets' ->> 'activo')::boolean or (v_r -> 'tickets' ->> 'copias')::int <> 1 then raise exception '1: apagado y 1 copia por defecto: %', v_r -> 'tickets'; end if;
  if not pg_temp.falla($q$ select robot_tavil_configurar_tickets('tk_sup', true, 1) $q$, 'No tienes permiso') then raise exception '1: sin permiso no cambia'; end if;
  if not pg_temp.falla($q$ select robot_tavil_configurar_tickets('tk_op', true, 5) $q$, 'de 1 a 4') then raise exception '1: copias 1 a 4'; end if;
  v_r := robot_tavil_configurar_tickets('tk_op', true, 2);
  if not (v_r ->> 'activo')::boolean or (v_r ->> 'copias')::int <> 2 or v_r ->> 'cambiado_por' is null then raise exception '1: encendido con 2 copias: %', v_r; end if;
  if not exists (select 1 from auditoria where entidad = 'robot_tavil_config' and resumen like 'Encendió los tickets por sistema (2 copias%') then raise exception '1: Auditoría'; end if;
  -- Guardar lo mismo no repite la auditoría.
  perform robot_tavil_configurar_tickets('tk_op', true, 2);
  if (select count(*) from auditoria where entidad = 'robot_tavil_config') <> 1 then raise exception '1: sin cambios no audita'; end if;

  -- ---------------------------------------------------------------------
  -- 2. «+» con el interruptor encendido: ticket P-000000 del sistema y vencimiento
  -- ---------------------------------------------------------------------
  v_r := robot_tavil_sumar('tk_op', v_cod, null);
  v_p := v_r -> 'creada';
  if v_p ->> 'ticket' !~ '^P-[0-9]{6}$' or not (v_p ->> 'ticket_sistema')::boolean then raise exception '2: ticket del sistema: %', v_p; end if;
  if (v_p ->> 'vence')::date <> (current_date + interval '12 months')::date then raise exception '2: vence = producción + 12 meses: %', v_p ->> 'vence'; end if;
  if (v_p ->> 'impresiones')::int <> 0 or v_p ->> 'sabor_nombre_base' <> 'Manzana' or v_p ->> 'creada_por' <> 'Operador Ticket' then raise exception '2: datos: %', v_p; end if;
  if not (v_r -> 'tickets' ->> 'activo')::boolean then raise exception '2: la pantalla trae el interruptor'; end if;
  v_n1 := substr(v_p ->> 'ticket', 3)::int;
  -- Aunque manden un ticket escrito, con el interruptor encendido manda el sistema.
  v_p2 := robot_tavil_sumar('tk_op', v_cod, 'ESCRITO-A-MANO') -> 'creada';
  if substr(v_p2 ->> 'ticket', 3)::int <> v_n1 + 1 then raise exception '2: el siguiente código: %', v_p2 ->> 'ticket'; end if;
  update robot_tavil_paletas set creada_en = clock_timestamp() where id = (v_p2 ->> 'id')::uuid;
  v_id := (v_p ->> 'id')::uuid;

  -- ---------------------------------------------------------------------
  -- 3. Impresiones: la primera no se audita; la reimpresión sí
  -- ---------------------------------------------------------------------
  v_p := robot_tavil_registrar_impresion('tk_op', v_id, 2);
  if (v_p ->> 'impresiones')::int <> 1 or v_p ->> 'impresa_en' is null then raise exception '3: primera impresión: %', v_p; end if;
  if exists (select 1 from auditoria where entidad = 'robot_tavil_paletas' and entidad_id = v_id::text and resumen like 'Reimprimió%') then raise exception '3: la primera no se audita'; end if;
  v_p := robot_tavil_registrar_impresion('tk_op', v_id, 1, 'Trazabilidad del paletizado');
  if (v_p ->> 'impresiones')::int <> 2 then raise exception '3: segunda impresión'; end if;
  if not exists (select 1 from auditoria where entidad = 'robot_tavil_paletas' and entidad_id = v_id::text
                  and resumen like 'Reimprimió el ticket P-% (1 copia)' and pagina = 'Trazabilidad del paletizado') then
    raise exception '3: la reimpresión queda en Auditoría';
  end if;
  if not pg_temp.falla(format($q$ select robot_tavil_registrar_impresion('tk_sup', %L) $q$, v_id), 'No tienes permiso') then raise exception '3: sin permiso no imprime'; end if;

  -- ---------------------------------------------------------------------
  -- 4. Corregir: el ticket del sistema no cambia; devuelve la paleta corregida
  -- ---------------------------------------------------------------------
  v_r := robot_tavil_editar_paleta('tk_op', v_id, 'OTRO', 'AUTOMATICO', 100, false, array[2], null, 'Se completó');
  if v_r -> 'editada' ->> 'ticket' <> v_p ->> 'ticket' then raise exception '4: el ticket del sistema no se cambia: %', v_r -> 'editada' ->> 'ticket'; end if;
  if (v_r -> 'editada' ->> 'conforme')::boolean or (v_r -> 'editada' ->> 'cajas')::int <> 100 then raise exception '4: sí cambia lo demás'; end if;

  -- ---------------------------------------------------------------------
  -- 5. Buscar por ticket (Trazabilidad), sin importar mayúsculas ni espacios
  -- ---------------------------------------------------------------------
  update usuarios set puesto_id = (select id from puestos where codigo = 'PROBADOR') where usuario = 'tk_sup' and false; -- (tk_sup sigue sin permisos de Trazabilidad)
  if not pg_temp.falla(format($q$ select trazabilidad_paletizado_buscar('tk_sup', %L) $q$, v_p ->> 'ticket'), 'No tienes permiso') then raise exception '5: sin permiso no busca'; end if;
  if not pg_temp.falla($q$ select trazabilidad_paletizado_buscar('tk_op', '   ') $q$, 'Escribe o pega') then raise exception '5: vacío'; end if;
  v_r := trazabilidad_paletizado_buscar('tk_op', '  ' || lower(v_p ->> 'ticket') || ' ');
  if jsonb_array_length(v_r) <> 1 or (v_r -> 0 ->> 'id')::uuid <> v_id then raise exception '5: encuentra la paleta: %', v_r; end if;
  if jsonb_array_length(trazabilidad_paletizado_buscar('tk_op', 'P-999999')) <> 0 then raise exception '5: uno que no existe'; end if;

  -- ---------------------------------------------------------------------
  -- 6. «−» devuelve la anulada; su ticket ya no se imprime pero se encuentra
  -- ---------------------------------------------------------------------
  v_r := robot_tavil_restar('tk_op', v_cod);
  if v_r -> 'anulada' ->> 'ticket' <> v_p2 ->> 'ticket' or v_r -> 'anulada' ->> 'anulada_en' is null then raise exception '6: anula la última: %', v_r -> 'anulada'; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_registrar_impresion('tk_op', %L) $q$, v_p2 ->> 'id'), 'fue anulada') then raise exception '6: anulada no se imprime'; end if;
  v_r := trazabilidad_paletizado_buscar('tk_op', v_p2 ->> 'ticket');
  if jsonb_array_length(v_r) <> 1 or v_r -> 0 ->> 'anulada_en' is null then raise exception '6: se encuentra marcada como anulada'; end if;

  -- ---------------------------------------------------------------------
  -- 7. Apagado: vuelve el ticket a mano; ese no se imprime desde el sistema
  -- ---------------------------------------------------------------------
  perform robot_tavil_configurar_tickets('tk_op', false, 2);
  if not exists (select 1 from auditoria where entidad = 'robot_tavil_config' and resumen like 'Apagó los tickets por sistema%') then raise exception '7: Auditoría al apagar'; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_sumar('tk_op', %L, '  ') $q$, v_cod), 'Escribe el número de ticket') then raise exception '7: pide el ticket'; end if;
  v_p := robot_tavil_sumar('tk_op', v_cod, 'TK-MANO') -> 'creada';
  if (v_p ->> 'ticket_sistema')::boolean or v_p ->> 'ticket' <> 'TK-MANO' then raise exception '7: ticket a mano: %', v_p; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_registrar_impresion('tk_op', %L) $q$, v_p ->> 'id'), 'escrito a mano') then raise exception '7: el de mano no se imprime'; end if;

  -- ---------------------------------------------------------------------
  -- 8. Sabor sin vida útil: la paleta queda sin vencimiento
  -- ---------------------------------------------------------------------
  update sabores set vida_util_meses = null where id = v_mz;
  v_p := robot_tavil_sumar('tk_op', v_cod, 'TK-SIN-VIDA') -> 'creada';
  if v_p ->> 'vence' is not null then raise exception '8: sin vida útil, sin vencimiento'; end if;

  -- ---------------------------------------------------------------------
  -- 9. Edición de Datos: la vida útil del sabor
  -- ---------------------------------------------------------------------
  if not pg_temp.falla(format($q$ select guardar_catalogo('tk_op', 'sabores', %L, jsonb_build_object('nombre', 'Manzana', 'familia_id', %L, 'vida_util_meses', '0')) $q$,
                              v_mz, (select familia_id from sabores where id = v_mz)), 'de 1 a 120') then raise exception '9: 0 no vale'; end if;
  if not pg_temp.falla(format($q$ select guardar_catalogo('tk_op', 'sabores', %L, jsonb_build_object('nombre', 'Manzana', 'familia_id', %L, 'vida_util_meses', '1.5')) $q$,
                              v_mz, (select familia_id from sabores where id = v_mz)), 'meses enteros') then raise exception '9: decimales no'; end if;
  perform guardar_catalogo('tk_op', 'sabores', v_mz, jsonb_build_object('nombre', 'Manzana', 'familia_id', (select familia_id from sabores where id = v_mz), 'vida_util_meses', 18));
  if (select vida_util_meses from sabores where id = v_mz) <> 18 then raise exception '9: guarda 18'; end if;
  -- Sin la clave, no se toca.
  perform guardar_catalogo('tk_op', 'sabores', v_mz, jsonb_build_object('nombre', 'Manzana', 'familia_id', (select familia_id from sabores where id = v_mz)));
  if (select vida_util_meses from sabores where id = v_mz) <> 18 then raise exception '9: sin la clave queda igual'; end if;
  perform guardar_catalogo('tk_op', 'sabores', v_mz, jsonb_build_object('nombre', 'Manzana', 'familia_id', (select familia_id from sabores where id = v_mz), 'vida_util_meses', ''));
  if (select vida_util_meses from sabores where id = v_mz) is not null then raise exception '9: vacío la borra'; end if;

  raise notice 'tickets_paletas: todo bien';
end
$$;

rollback;
