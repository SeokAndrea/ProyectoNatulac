-- ============================================================
-- ENSAYO de 20261112590000 (Responsable y Terminar parada)
-- ============================================================
-- Solo en una base de ensayo armada desde cero (nunca en planta ni en la
-- base personal con datos). Se corre DOS veces:
--   1. Con la cadena hasta 20261112490000: siembra paradas viejas (sin
--      Responsable) para probar la conversión. No prueba nada más.
--   2. Después de aplicar 20261112590000: corre los casos.
-- Cada caso se deshace al terminar (no ensucia al siguiente) y avisa
-- «OK  nombre» o «FAIL nombre: motivo». Al final, si alguno falló, error.
-- Sin comandos de psql: también corre en PGlite.
-- ============================================================

set client_min_messages = notice;

-- ------------------------------------------------------------
-- Ayudantes (solo de esta sesión)
-- ------------------------------------------------------------
select set_config('ensayo.fallas', '0', false);

create or replace function pg_temp.fallo(p_caso text, p_motivo text)
returns void language plpgsql as $$
begin
  perform set_config('ensayo.fallas', (current_setting('ensayo.fallas')::int + 1)::text, false);
  raise notice 'FAIL %: %', p_caso, p_motivo;
end;
$$;

-- Corre p_sql y exige que falle con un mensaje que contenga p_patron.
create or replace function pg_temp.espera_error(p_sql text, p_patron text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_patron || '%' then
      return;
    end if;
    raise exception 'esperaba «%», salió «%» (en: %)', p_patron, sqlerrm, left(p_sql, 120);
  end;
  raise exception 'esperaba el error «%» y no falló (en: %)', p_patron, left(p_sql, 120);
end;
$$;

-- Hora de planta como la manda la app.
create or replace function pg_temp.hp(p_t timestamptz)
returns text language sql as $$
  select to_char(p_t at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS');
$$;

-- ------------------------------------------------------------
-- Datos (se puede correr de nuevo)
-- ------------------------------------------------------------
do $$
declare
  v_asep uuid := (select id from areas where codigo = 'ASEPTICO');
  v_sup uuid;
  v_mtto uuid;
  v_turno uuid;
  v_ini timestamp := (now() - interval '2 hours') at time zone 'America/Caracas';
  v_sabor uuid := (select id from sabores order by nombre limit 1);
begin
  insert into usuarios (usuario, nombre, apellido, password_hash, debe_completar_perfil)
  values ('ens_sup', 'Sonia', 'Ensayo', 'x', false), ('ens_mtto', 'Mario', 'Ensayo', 'x', false)
  on conflict (usuario) do nothing;
  insert into usuarios (usuario, nombre, apellido, password_hash, debe_completar_perfil, ve_errores)
  values ('ens_duena', 'Dora', 'Ensayo', 'x', false, true)
  on conflict (usuario) do nothing;
  select id into v_sup from usuarios where usuario = 'ens_sup';
  select id into v_mtto from usuarios where usuario = 'ens_mtto';
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select v_sup, (select id from roles where codigo = 'SUPERVISOR'), v_asep
  where not exists (select 1 from usuario_roles where usuario_id = v_sup);
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select (select id from usuarios where usuario = 'ens_duena'), (select id from roles where codigo = 'SUPERVISOR'), v_asep
  where not exists (select 1 from usuario_roles where usuario_id = (select id from usuarios where usuario = 'ens_duena'));
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select v_mtto, (select id from roles where codigo = 'MANTENIMIENTO'), (select id from areas where codigo = 'MANTENIMIENTO')
  where not exists (select 1 from usuario_roles where usuario_id = v_mtto);

  -- Turno abierto de Aséptico desde hace 2 h: L1 y L2 corriendo, L3 libre.
  if not exists (select 1 from turnos where codigo = 'A_ENSAYO_590') then
    insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, created_at)
    values ('A_ENSAYO_590', v_asep, v_sup, (select id from turno_tipos where codigo = 'TURNO_1'),
            (select id from grupos where codigo = 'GRUPO_1'), v_ini::date, v_ini::time, now() - interval '2 hours')
    returning id into v_turno;
    insert into turno_lineas (turno_id, linea_id, sabor_id, lote, activa, activada_en, activada_por)
    select v_turno, l.id, v_sabor, 'L-ENS-' || l.codigo, true, now() - interval '2 hours', v_sup
    from lineas l where l.area_id = v_asep and l.codigo in ('LINEA_1', 'LINEA_2');
    insert into lineas_estado (turno_id, linea_id)
    select v_turno, id from lineas where area_id = v_asep;
  end if;

  -- Fase 1 (antes de la migración): paradas viejas para la conversión.
  if not exists (select 1 from information_schema.columns where table_name = 'paradas' and column_name = 'responsable')
     and not exists (select 1 from paradas where nota like 'ENS-VIEJA-%') then
    insert into paradas (turno_id, linea_id, clase, origen, tipo_nombre, nota, inicio, fin, creado_por)
    select null, (select id from lineas where codigo = 'LINEA_3'), 'NO_PROGRAMADA', o.origen, 'Vieja', o.nota,
           now() - interval '3 days', now() - interval '3 days' + interval '20 minutes', o.creador
    from (values
      ('MANUAL',        'ENS-VIEJA-OPERACIONAL-SUP',  v_sup),
      ('SHEET',         'ENS-VIEJA-MANTENIMIENTO-SHEET', null::uuid),
      ('MANTENIMIENTO', 'ENS-VIEJA-OPERACIONAL-MARCA-MALA', v_sup),   -- lo que corrige 20261112150000
      ('MANTENIMIENTO', 'ENS-VIEJA-MANTENIMIENTO-MTTO', v_mtto),
      ('MANUAL',        'ENS-VIEJA-MANTENIMIENTO-MTTO-MANUAL', v_mtto)
    ) as o(origen, nota, creador);
    raise notice 'SEMILLA: 5 paradas viejas (fase 1, antes de 20261112590000)';
  end if;
end;
$$;

-- Contexto de los casos.
drop table if exists pg_temp.ctx;
create temp table ctx as
select (select id from areas where codigo = 'ASEPTICO') as asep,
       (select id from turnos where codigo = 'A_ENSAYO_590') as turno,
       (select id from lineas where codigo = 'LINEA_1') as l1,
       (select id from lineas where codigo = 'LINEA_3') as l3,
       (select tl.id from turno_lineas tl join lineas l on l.id = tl.linea_id
         where tl.turno_id = (select id from turnos where codigo = 'A_ENSAYO_590') and l.codigo = 'LINEA_1' and tl.activa) as c1,
       (select nombre from sabores order by nombre limit 1) as sabor,
       null::text as tipo;

-- Un tipo de falla de equipo que valga para L1 y L3 de Aséptico.
do $$
declare
  r paradas_tipos;
  c ctx;
begin
  select * into c from ctx;
  for r in select * from paradas_tipos
           where activo and equipo_id is not null and clase = 'NO_PROGRAMADA'
             and codigo not in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR')
           order by codigo
  loop
    begin
      perform nombre_tipo_en_linea(r, c.l1, c.asep);
      perform nombre_tipo_en_linea(r, c.l3, c.asep);
      update ctx set tipo = r.codigo;
      exit;
    exception when others then
      null;
    end;
  end loop;
  if (select tipo from ctx) is null then
    raise exception 'No hay un tipo de falla que valga para L1 y L3.';
  end if;
end;
$$;

-- Fase 1: hasta aquí (sin la migración no hay casos que correr).
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'paradas' and column_name = 'responsable') then
    raise notice 'FASE 1: sin la columna Responsable todavía; los casos se corren después de la migración.';
  end if;
end;
$$;

-- ============================================================
-- CASOS
-- ============================================================

-- 1. Conversión de las paradas viejas con la regla de hoy.
do $caso$
declare
  n text := '01 paradas viejas: Responsable con la regla de quién la registró';
  r record;
  v_n integer := 0;
begin
  begin
    for r in select nota, responsable from paradas where nota like 'ENS-VIEJA-%' loop
      v_n := v_n + 1;
      if r.responsable is distinct from (case when r.nota like 'ENS-VIEJA-MANTENIMIENTO%' then 'MANTENIMIENTO' else 'OPERACIONAL' end) then
        raise exception '% quedó con responsable %', r.nota, coalesce(r.responsable, 'null');
      end if;
    end loop;
    if v_n <> 5 then
      raise exception 'hay % paradas de la semilla (5 esperadas): corre la fase 1 antes de la migración', v_n;
    end if;
    if exists (select 1 from paradas where responsable is null) then
      raise exception 'quedaron paradas sin responsable';
    end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 2. Parar (pausar_linea): guarda Responsable, lote y sabor; Equipo y Falla obligatorios.
do $caso$
declare
  n text := '02 pausar_linea: responsable, lote, sabor y rechaza falla sin especificar';
  c ctx;
  p paradas;
begin
  begin
    select * into c from ctx;
    perform pg_temp.espera_error(format($q$select pausar_linea('ens_sup', %L, %L, 'Se trabó', 'FALLA_SIN_ESPECIFICAR', 'OPERACIONAL')$q$, c.turno, c.c1), 'catálogo');
    perform pg_temp.espera_error(format($q$select pausar_linea('ens_sup', %L, %L, 'Se trabó', 'POR_CLASIFICAR', 'OPERACIONAL')$q$, c.turno, c.c1), 'catálogo');
    perform pg_temp.espera_error(format($q$select pausar_linea('ens_sup', %L, %L, 'Se trabó', %L, null)$q$, c.turno, c.c1, c.tipo), 'Operacional o de Mantenimiento');
    perform pg_temp.espera_error(format($q$select pausar_linea('ens_sup', %L, %L, 'Se trabó', %L, 'OTRO')$q$, c.turno, c.c1, c.tipo), 'Operacional o de Mantenimiento');

    perform pausar_linea('ens_sup', c.turno, c.c1, 'Se trabó', c.tipo, 'OPERACIONAL', pg_temp.hp(now() - interval '10 minutes'));
    select * into p from paradas where linea_id = c.l1 and fin is null and nota = 'Se trabó';
    if p.id is null then raise exception 'no se creó la parada'; end if;
    if p.responsable is distinct from 'OPERACIONAL' then raise exception 'responsable %', p.responsable; end if;
    if p.lote is distinct from 'L-ENS-LINEA_1' then raise exception 'lote %', p.lote; end if;
    if p.sabor is distinct from c.sabor then raise exception 'sabor %', p.sabor; end if;
    if (select pausada_en from turno_lineas where id = c.c1) is distinct from p.inicio then raise exception 'la corrida no quedó en pausa'; end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 3. El supervisor termina una Operacional: código, qué se hizo, quién; la línea sigue sola.
do $caso$
declare
  n text := '03 terminar_parada: el supervisor termina una Operacional';
  c ctx;
  p paradas;
begin
  begin
    select * into c from ctx;
    update areas set mantenimiento_finaliza = true where id = c.asep;  -- no importa para las Operacionales
    perform pausar_linea('ens_sup', c.turno, c.c1, 'Se trabó', c.tipo, 'OPERACIONAL', pg_temp.hp(now() - interval '30 minutes'));
    select * into p from paradas where linea_id = c.l1 and fin is null and nota = 'Se trabó';

    perform pg_temp.espera_error(format($q$select terminar_parada('ens_sup', %L, %L, 'SUB-01', '  ')$q$, p.id, c.tipo), 'qué se hizo');
    perform pg_temp.espera_error(format($q$select terminar_parada('ens_sup', %L, 'FALLA_SIN_ESPECIFICAR', 'SUB-01', 'Se ajustó')$q$, p.id), 'catálogo');
    perform pg_temp.espera_error(format($q$select terminar_parada('ens_sup', %L, %L, '', 'Se ajustó')$q$, p.id, c.tipo), 'subsistema');

    perform terminar_parada('ens_sup', p.id, c.tipo, 'SUB-01', 'Se ajustó la guía', pg_temp.hp(now() - interval '5 minutes'));
    select * into p from paradas where id = p.id;
    if p.fin is null then raise exception 'no quedó terminada'; end if;
    if p.subsistema_codigo is distinct from 'SUB-01' or p.solucion is distinct from 'Se ajustó la guía' then
      raise exception 'código o solución: % / %', p.subsistema_codigo, p.solucion;
    end if;
    if p.terminada_por is distinct from (select id from usuarios where usuario = 'ens_sup') or p.terminada_en is null then
      raise exception 'no guardó quién la terminó';
    end if;
    if (select pausada_en from turno_lineas where id = c.c1) is not null then raise exception 'la corrida sigue en pausa'; end if;
    if (select parada_id from lineas_estado where turno_id = c.turno and linea_id = c.l1) is not null then
      raise exception 'la línea sigue ligada a la parada';
    end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 4. Interruptor encendido: el supervisor no termina ni le da Continuar a una de
--    Mantenimiento; Mantenimiento la termina con un fin válido y la línea sigue.
do $caso$
declare
  n text := '04 interruptor encendido: solo Mantenimiento termina las de Mantenimiento';
  c ctx;
  p paradas;
  v_ini timestamptz := date_trunc('minute', now() - interval '40 minutes');
  v_fin timestamptz := date_trunc('minute', now() - interval '3 minutes');
begin
  begin
    select * into c from ctx;
    update areas set mantenimiento_finaliza = true where id = c.asep;
    perform pausar_linea('ens_sup', c.turno, c.c1, 'Ruido en la mordaza', c.tipo, 'MANTENIMIENTO', pg_temp.hp(now() - interval '30 minutes'));
    select * into p from paradas where linea_id = c.l1 and fin is null and nota = 'Ruido en la mordaza';
    if p.responsable is distinct from 'MANTENIMIENTO' then raise exception 'responsable %', p.responsable; end if;
    if not la_termina_mantenimiento(p.id) then raise exception 'la_termina_mantenimiento dio falso'; end if;

    perform pg_temp.espera_error(format($q$select terminar_parada('ens_sup', %L, %L, 'SUB-02', 'Se cambió')$q$, p.id, c.tipo), 'la termina Mantenimiento');
    perform pg_temp.espera_error(format($q$select continuar_linea('ens_sup', %L, %L)$q$, c.turno, c.c1), 'la termina Mantenimiento');

    perform terminar_parada('ens_mtto', p.id, c.tipo, 'SUB-02', 'Se cambió el resorte', pg_temp.hp(v_fin), pg_temp.hp(v_ini));
    select * into p from paradas where id = p.id;
    if p.fin is distinct from v_fin or p.inicio is distinct from v_ini then
      raise exception 'tiempos % - % (esperaba % - %)', p.inicio, p.fin, v_ini, v_fin;
    end if;
    if p.terminada_por is distinct from (select id from usuarios where usuario = 'ens_mtto') then raise exception 'terminada_por'; end if;
    if (select pausada_en from turno_lineas where id = c.c1) is not null then raise exception 'la línea no siguió sola'; end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 5. Interruptor apagado: el supervisor puede terminar una de Mantenimiento.
do $caso$
declare
  n text := '05 interruptor apagado: el supervisor termina una de Mantenimiento';
  c ctx;
  p paradas;
begin
  begin
    select * into c from ctx;
    update areas set mantenimiento_finaliza = false where id = c.asep;
    perform pausar_linea('ens_sup', c.turno, c.c1, 'Ruido en la mordaza', c.tipo, 'MANTENIMIENTO');
    select * into p from paradas where linea_id = c.l1 and fin is null and nota = 'Ruido en la mordaza';
    if la_termina_mantenimiento(p.id) then raise exception 'la_termina_mantenimiento dio verdadero con el interruptor apagado'; end if;
    perform terminar_parada('ens_sup', p.id, c.tipo, 'SUB-02', 'Se ajustó');
    if (select fin from paradas where id = p.id) is null then raise exception 'no quedó terminada'; end if;
    if (select pausada_en from turno_lineas where id = c.c1) is not null then raise exception 'la línea no siguió sola'; end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 6. Fin antes del inicio, en el futuro, y terminar dos veces: fallan.
do $caso$
declare
  n text := '06 terminar_parada: fin antes del inicio, fin en el futuro y dos veces';
  c ctx;
  p paradas;
begin
  begin
    select * into c from ctx;
    perform pausar_linea('ens_sup', c.turno, c.c1, 'Se trabó', c.tipo, 'OPERACIONAL', pg_temp.hp(now() - interval '20 minutes'));
    select * into p from paradas where linea_id = c.l1 and fin is null and nota = 'Se trabó';
    perform pg_temp.espera_error(format($q$select terminar_parada('ens_sup', %L, %L, 'SUB-01', 'Se ajustó', %L)$q$,
      p.id, c.tipo, pg_temp.hp(now() - interval '40 minutes')), 'anterior al inicio');
    perform pg_temp.espera_error(format($q$select terminar_parada('ens_sup', %L, %L, 'SUB-01', 'Se ajustó', %L)$q$,
      p.id, c.tipo, pg_temp.hp(now() + interval '1 hour')), 'futuro');
    perform terminar_parada('ens_sup', p.id, c.tipo, 'SUB-01', 'Se ajustó');
    perform pg_temp.espera_error(format($q$select terminar_parada('ens_sup', %L, %L, 'SUB-01', 'Otra vez')$q$, p.id, c.tipo), 'ya terminó');
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 7. Parada que cruzó un turno cerrado: pide la hora de fin, ignora el comienzo
--    y el tramo del turno cerrado queda igual.
do $caso$
declare
  n text := '07 cruzó un turno cerrado: exige fin, ignora inicio, el tramo cerrado no cambia';
  c ctx;
  v_cerrado uuid;
  v_cierre timestamp := (now() - interval '2 hours') at time zone 'America/Caracas';
  v_par uuid;
  v_ini timestamptz := date_trunc('minute', now() - interval '3 hours');
  a1 timestamptz; b1 timestamptz;
  a2 timestamptz; b2 timestamptz;
begin
  begin
    select * into c from ctx;
    -- El turno anterior: de hace 10 h hasta hace 2 h, ya cerrado.
    insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, estado, fecha_fin, hora_fin, created_at)
    values ('A_ENSAYO_590_CERRADO', c.asep, (select id from usuarios where usuario = 'ens_sup'),
            (select id from turno_tipos where codigo = 'TURNO_3'), (select id from grupos where codigo = 'GRUPO_2'),
            ((now() - interval '10 hours') at time zone 'America/Caracas')::date,
            ((now() - interval '10 hours') at time zone 'America/Caracas')::time,
            'CERRADO', v_cierre::date, v_cierre::time, now() - interval '10 hours')
    returning id into v_cerrado;
    -- Abierta en L3 (libre) desde hace 3 h, de Mantenimiento.
    insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, nota, inicio, responsable, creado_por)
    values (null, c.l3, (select id from paradas_tipos where codigo = c.tipo), 'NO_PROGRAMADA', 'MANTENIMIENTO', 'Falla', 'Cruza turnos',
            v_ini, 'MANTENIMIENTO', (select id from usuarios where usuario = 'ens_mtto'))
    returning id into v_par;

    select e.inicio, e.fin into a1, b1 from paradas_efectivas_turno(v_cerrado) e where e.id = v_par;
    if a1 is distinct from v_ini or b1 is null then raise exception 'tramo del turno cerrado antes: % - %', a1, b1; end if;

    perform pg_temp.espera_error(format($q$select terminar_parada('ens_mtto', %L, %L, 'SUB-03', 'Se cambió')$q$, v_par, c.tipo), 'hora de fin');
    -- Un fin dentro del turno cerrado le cambiaría su tramo.
    perform pg_temp.espera_error(format($q$select terminar_parada('ens_mtto', %L, %L, 'SUB-03', 'Se cambió', %L)$q$,
      v_par, c.tipo, pg_temp.hp(now() - interval '150 minutes')), 'turno ya cerrado');

    perform terminar_parada('ens_mtto', v_par, c.tipo, 'SUB-03', 'Se cambió el sello',
      pg_temp.hp(now() - interval '30 minutes'), pg_temp.hp(now() - interval '5 hours'));
    if (select inicio from paradas where id = v_par) is distinct from v_ini then raise exception 'cambió el inicio'; end if;
    if (select fin from paradas where id = v_par) is null then raise exception 'no quedó terminada'; end if;

    select e.inicio, e.fin into a2, b2 from paradas_efectivas_turno(v_cerrado) e where e.id = v_par;
    if a2 is distinct from a1 or b2 is distinct from b1 then
      raise exception 'el tramo del turno cerrado cambió: % - % → % - %', a1, b1, a2, b2;
    end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 8. Sin cruzar: el comienzo no se puede llevar a un turno ya cerrado.
do $caso$
declare
  n text := '08 no cruzó: el comienzo no puede caer en un turno cerrado';
  c ctx;
  v_cierre timestamp := (now() - interval '2 hours') at time zone 'America/Caracas';
  v_par uuid;
begin
  begin
    select * into c from ctx;
    insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, estado, fecha_fin, hora_fin, created_at)
    values ('A_ENSAYO_590_CERRADO', c.asep, (select id from usuarios where usuario = 'ens_sup'),
            (select id from turno_tipos where codigo = 'TURNO_3'), (select id from grupos where codigo = 'GRUPO_2'),
            ((now() - interval '10 hours') at time zone 'America/Caracas')::date,
            ((now() - interval '10 hours') at time zone 'America/Caracas')::time,
            'CERRADO', v_cierre::date, v_cierre::time, now() - interval '10 hours');
    perform pausar_linea('ens_sup', c.turno, c.c1, 'Se trabó', c.tipo, 'OPERACIONAL', pg_temp.hp(now() - interval '20 minutes'));
    select id into v_par from paradas where linea_id = c.l1 and fin is null and nota = 'Se trabó';
    perform pg_temp.espera_error(format($q$select terminar_parada('ens_sup', %L, %L, 'SUB-01', 'Se ajustó', null, %L)$q$,
      v_par, c.tipo, pg_temp.hp(now() - interval '3 hours')), 'turno ya cerrado');
    perform terminar_parada('ens_sup', v_par, c.tipo, 'SUB-01', 'Se ajustó', null, pg_temp.hp(now() - interval '25 minutes'));
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 9. Mantenimiento abre su parada: con la línea libre solo la anota; con la
--    línea corriendo, pausa la corrida.
do $caso$
declare
  n text := '09 abrir_parada_mantenimiento: libre solo anota, corriendo pausa';
  c ctx;
  v_libre uuid;
  v_corre uuid;
  p paradas;
begin
  begin
    select * into c from ctx;
    perform pg_temp.espera_error(format($q$select abrir_parada_mantenimiento('ens_mtto', 'LINEA_3', %L, '  ')$q$, c.tipo), 'Escribe');
    perform pg_temp.espera_error($q$select abrir_parada_mantenimiento('ens_mtto', 'LINEA_3', 'FALLA_SIN_ESPECIFICAR', 'Revisión')$q$, 'catálogo');

    v_libre := abrir_parada_mantenimiento('ens_mtto', 'LINEA_3', c.tipo, 'Cambio de rodamiento');
    select * into p from paradas where id = v_libre;
    if p.responsable is distinct from 'MANTENIMIENTO' or p.fin is not null then raise exception 'la de L3: % / %', p.responsable, p.fin; end if;
    if (select parada_id from lineas_estado where turno_id = c.turno and linea_id = c.l3) is not null then
      raise exception 'la línea libre quedó ligada a la parada';
    end if;
    if exists (select 1 from turno_lineas where linea_id = c.l3 and pausada_en is not null) then raise exception 'pausó algo en L3'; end if;

    v_corre := abrir_parada_mantenimiento('ens_mtto', 'LINEA_1', c.tipo, 'Fuga en la válvula', pg_temp.hp(now() - interval '2 minutes'));
    select * into p from paradas where id = v_corre;
    if p.responsable is distinct from 'MANTENIMIENTO' then raise exception 'responsable %', p.responsable; end if;
    if p.lote is distinct from 'L-ENS-LINEA_1' or p.sabor is distinct from c.sabor then raise exception 'lote/sabor % / %', p.lote, p.sabor; end if;
    if (select pausada_en from turno_lineas where id = c.c1) is distinct from p.inicio then raise exception 'no pausó la corrida de L1'; end if;
    if (select parada_id from lineas_estado where turno_id = c.turno and linea_id = c.l1) is distinct from v_corre then
      raise exception 'L1 no quedó ligada a la parada';
    end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 10. listar_paradas y paradas_que_detienen_lineas traen los campos nuevos.
do $caso$
declare
  n text := '10 listar_paradas: responsable, subsistema, lote, sabor, terminada_por_nombre';
  c ctx;
  v_par uuid;
  r record;
  v_hoy date := (now() at time zone 'America/Caracas')::date;
begin
  begin
    select * into c from ctx;
    perform pausar_linea('ens_sup', c.turno, c.c1, 'Se trabó', c.tipo, 'MANTENIMIENTO', pg_temp.hp(now() - interval '20 minutes'));
    select id into v_par from paradas where linea_id = c.l1 and fin is null and nota = 'Se trabó';

    select * into r from paradas_que_detienen_lineas(c.turno) d where d.parada_id = v_par;
    if r.responsable is distinct from 'MANTENIMIENTO' or not r.de_mantenimiento then
      raise exception 'paradas_que_detienen_lineas: % / %', r.responsable, r.de_mantenimiento;
    end if;

    perform terminar_parada('ens_mtto', v_par, c.tipo, 'SUB-09', 'Se cambió');

    select * into r from listar_paradas(v_hoy - 1, v_hoy + 1, null, null, null, 'ASEPTICO') l where l.id = v_par;
    if r.id is null then raise exception 'no sale en el listado por fechas'; end if;
    if r.responsable is distinct from 'MANTENIMIENTO' or r.subsistema_codigo is distinct from 'SUB-09'
       or r.lote is distinct from 'L-ENS-LINEA_1' or r.sabor is distinct from c.sabor
       or r.terminada_por_nombre is distinct from 'Mario' then
      raise exception 'por fechas: % / % / % / % / %', r.responsable, r.subsistema_codigo, r.lote, r.sabor, r.terminada_por_nombre;
    end if;

    select * into r from listar_paradas(null, null, null, null, c.turno) l where l.id = v_par;
    if r.id is null then raise exception 'no sale en el listado del turno'; end if;
    if r.responsable is distinct from 'MANTENIMIENTO' or r.subsistema_codigo is distinct from 'SUB-09'
       or r.lote is distinct from 'L-ENS-LINEA_1' or r.sabor is distinct from c.sabor
       or r.terminada_por_nombre is distinct from 'Mario' then
      raise exception 'del turno: % / % / % / % / %', r.responsable, r.subsistema_codigo, r.lote, r.sabor, r.terminada_por_nombre;
    end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 11. Lo que se quita: Sheet, clasificar y finalizar; y el Responsable por defecto.
do $caso$
declare
  n text := '11 sin Sheet ni finalizar/clasificar; Responsable por defecto al insertar';
  c ctx;
  v_a uuid;
  v_b uuid;
begin
  begin
    select * into c from ctx;
    if to_regprocedure('finalizar_falla(text, uuid, text, text, text)') is not null then raise exception 'sigue finalizar_falla'; end if;
    if to_regprocedure('clasificar_falla(text, uuid, text, text, text)') is not null then raise exception 'sigue clasificar_falla'; end if;
    if to_regprocedure('sincronizar_paradas_mantenimiento(text, jsonb)') is not null then raise exception 'sigue sincronizar_paradas_mantenimiento'; end if;
    if to_regprocedure('paradas_puente_sheet()') is not null then raise exception 'sigue paradas_puente_sheet'; end if;
    if exists (select 1 from pg_trigger where tgname = 'paradas_puente_sheet') then raise exception 'sigue el trigger del Sheet'; end if;
    if to_regprocedure('pausar_linea(text, uuid, uuid, text, text, text)') is not null then raise exception 'sigue el pausar_linea viejo'; end if;

    -- Otras entradas (Registrar Paradas, Mantenimiento por su página) no pasan Responsable.
    insert into paradas (linea_id, clase, origen, tipo_nombre, inicio, fin, creado_por)
    values (c.l3, 'NO_PROGRAMADA', 'MANTENIMIENTO', 'X', now() - interval '1 hour', now() - interval '50 minutes',
            (select id from usuarios where usuario = 'ens_sup'))
    returning id into v_a;
    insert into paradas (linea_id, clase, origen, tipo_nombre, inicio, fin, creado_por)
    values (c.l3, 'NO_PROGRAMADA', 'MANUAL', 'X', now() - interval '1 hour', now() - interval '50 minutes',
            (select id from usuarios where usuario = 'ens_mtto'))
    returning id into v_b;
    if (select responsable from paradas where id = v_a) is distinct from 'OPERACIONAL' then raise exception 'la del supervisor no es Operacional'; end if;
    if (select responsable from paradas where id = v_b) is distinct from 'MANTENIMIENTO' then raise exception 'la de Mantenimiento no es de Mantenimiento'; end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 12. Interruptor encendido: la dueña (no es de Mantenimiento) sí termina una de
--     Mantenimiento; ella prueba en Pruebas, donde está encendido.
do $caso$
declare
  n text := '12 interruptor encendido: la dueña termina una de Mantenimiento';
  c ctx;
  p paradas;
begin
  begin
    select * into c from ctx;
    update areas set mantenimiento_finaliza = true where id = c.asep;
    if es_de_mantenimiento('ens_duena') then raise exception 'la dueña del ensayo no debería ser de Mantenimiento'; end if;
    perform pausar_linea('ens_sup', c.turno, c.c1, 'Ruido en la mordaza', c.tipo, 'MANTENIMIENTO', pg_temp.hp(now() - interval '30 minutes'));
    select * into p from paradas where linea_id = c.l1 and fin is null and nota = 'Ruido en la mordaza';
    perform pg_temp.espera_error(format($q$select terminar_parada('ens_sup', %L, %L, 'SUB-02', 'Se cambió')$q$, p.id, c.tipo), 'la termina Mantenimiento');
    perform terminar_parada('ens_duena', p.id, c.tipo, 'SUB-02', 'Se cambió el resorte');
    select * into p from paradas where id = p.id;
    if p.fin is null then raise exception 'no quedó terminada'; end if;
    if p.terminada_por is distinct from (select id from usuarios where usuario = 'ens_duena') then raise exception 'terminada_por'; end if;
    if (select pausada_en from turno_lineas where id = c.c1) is not null then raise exception 'la línea no siguió sola'; end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 13. Continuar cierra la parada y deja terminada_por / terminada_en (reporte congelado).
do $caso$
declare
  n text := '13 Continuar: la parada cerrada guarda terminada_por y terminada_en';
  c ctx;
  p paradas;
begin
  begin
    select * into c from ctx;
    update areas set mantenimiento_finaliza = false where id = c.asep;
    perform pausar_linea('ens_sup', c.turno, c.c1, 'Se trabó', c.tipo, 'OPERACIONAL', pg_temp.hp(now() - interval '15 minutes'));
    select * into p from paradas where linea_id = c.l1 and fin is null and nota = 'Se trabó';
    perform continuar_linea('ens_sup', c.turno, c.c1);
    select * into p from paradas where id = p.id;
    if p.fin is null then raise exception 'Continuar no la cerró'; end if;
    if p.terminada_por is distinct from (select id from usuarios where usuario = 'ens_sup') then
      raise exception 'terminada_por vacío o distinto: %', coalesce(p.terminada_por::text, 'null');
    end if;
    if p.terminada_en is null then raise exception 'terminada_en vacío'; end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 14. Las otras salidas que cierran una parada también dejan quién y cuándo:
--     cerrar_parada_mantenimiento y completar_parada.
do $caso$
declare
  n text := '14 cerrar_parada_mantenimiento y completar_parada guardan terminada_por';
  c ctx;
  p paradas;
  v_id uuid;
  v_sup uuid := (select id from usuarios where usuario = 'ens_sup');
begin
  begin
    select * into c from ctx;
    update areas set mantenimiento_finaliza = false where id = c.asep;
    perform pausar_linea('ens_sup', c.turno, c.c1, 'Se trabó', c.tipo, 'MANTENIMIENTO', pg_temp.hp(now() - interval '15 minutes'));
    select * into p from paradas where linea_id = c.l1 and fin is null and nota = 'Se trabó';
    perform cerrar_parada_mantenimiento('ens_sup', p.id);
    select * into p from paradas where id = p.id;
    if p.fin is null then raise exception 'cerrar_parada_mantenimiento no la cerró'; end if;
    if p.terminada_por is distinct from v_sup or p.terminada_en is null then raise exception 'cerrar_parada_mantenimiento sin terminada_por/en'; end if;

    insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, nota, inicio, fin, pendiente, creado_por)
    values (null, c.l3, (select id from paradas_tipos where codigo = 'POR_CLASIFICAR'), 'NO_PROGRAMADA', 'MANUAL',
            'Parada por clasificar', 'pendiente de prueba', now() - interval '30 minutes', now() - interval '30 minutes', true, v_sup)
    returning id into v_id;
    perform completar_parada('ens_sup', v_id, 5, null, null, c.tipo);
    select * into p from paradas where id = v_id;
    if p.pendiente then raise exception 'sigue pendiente'; end if;
    if p.terminada_por is distinct from v_sup or p.terminada_en is null then raise exception 'completar_parada sin terminada_por/en'; end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- 15. terminar_parada sobre una pendiente la deja de mostrar como pendiente.
do $caso$
declare
  n text := '15 terminar_parada sobre una pendiente: pendiente = false';
  c ctx;
  p paradas;
  v_id uuid;
begin
  begin
    select * into c from ctx;
    update areas set mantenimiento_finaliza = false where id = c.asep;
    insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, nota, inicio, fin, pendiente, creado_por)
    values (null, c.l3, (select id from paradas_tipos where codigo = 'POR_CLASIFICAR'), 'NO_PROGRAMADA', 'MANUAL',
            'Parada por clasificar', 'pendiente de prueba', now() - interval '30 minutes', now() - interval '30 minutes', true,
            (select id from usuarios where usuario = 'ens_sup'))
    returning id into v_id;
    perform terminar_parada('ens_sup', v_id, c.tipo, 'SUB-01', 'Se ajustó');
    select * into p from paradas where id = v_id;
    if p.pendiente then raise exception 'sigue pendiente'; end if;
    if p.fin is null or p.fin <= p.inicio then raise exception 'fin % / inicio %', p.fin, p.inicio; end if;
    if p.solucion is distinct from 'Se ajustó' then raise exception 'solución %', p.solucion; end if;
    raise exception 'ENSAYO_OK';
  exception when others then
    if sqlerrm = 'ENSAYO_OK' then raise notice 'OK   %', n; else perform pg_temp.fallo(n, sqlerrm); end if;
  end;
end $caso$;

-- ------------------------------------------------------------
-- Resultado
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'paradas' and column_name = 'responsable')
     and current_setting('ensayo.fallas')::int > 0 then
    raise notice 'FASE 1 terminada (los FAIL de arriba son esperados sin la migración).';
    return;
  end if;
  if current_setting('ensayo.fallas')::int > 0 then
    raise exception 'Ensayo 20261112590000: % caso(s) fallaron.', current_setting('ensayo.fallas');
  end if;
  raise notice 'Ensayo 20261112590000: todos los casos OK.';
end;
$$;
