-- ============================================================
-- Corridas entregadas congeladas y continuidad de las 22:30
-- (dueña, 2026-10-20, revisión del T2 y T3 de Fernando del 19/10).
--
-- 1. Trigger congelar_corrida_entregada: una corrida ENTREGADA al turno
--    siguiente conserva su lote (lote_id, lote, sabor_id y
--    lote_terminado_en). Queda con activa = true para siempre, y las
--    funciones que tocan corridas "por lote y activa" (transferir_tanque,
--    terminar, desvasar o descartar el lote...) la arrastraban: desde el
--    01/09, 19 corridas de turnos cerrados quedaron apuntando a un lote
--    preparado después del cierre, y la merma de semielaborado de esos
--    turnos salía con el lote equivocado. El trigger cubre todas esas
--    funciones (y las que vengan) sin reescribirlas. Para corregir una a
--    mano: set_config('natulac.corregir_corrida_entregada', 'on', true).
-- 2. revisar_cierre_de_lote y continuar_siguiente_lote: "¿alguna corrida
--    usa este lote?" ya no cuenta las entregadas. La del turno cerrado no
--    lo usa; lo usa su continuación del turno siguiente.
-- 3. registrar_contador: rechaza un contador (llenadora y buenos) igual al
--    de OTRA corrida de la misma línea en las últimas 12 h. El 19/10 se
--    cargó en el T3 el mismo contador del T2 (14528 / 14419).
-- 4. registrar_producto_terminado: rechaza un PT (paletas y cajas) igual
--    al de otro turno en la misma línea, cargado hace menos de 1 h. El
--    19/10 quedó 14 paletas + 49 cajas (14.868 L) dos veces.
-- 5. finalizar_turno: el supervisor no puede finalizar, en sus primeras
--    2 h, el turno que el sistema le abrió como continuación del suyo
--    (12x12 a las 22:30, relevo temprano). Pasó el 06/10 y el 07/10
--    (Gabriel) y el 19/10 (Fernando): creían seguir en el T2, lo
--    finalizaban y abrían otro. Para finalizar, la app les pedía el PT
--    de la línea y cargaban otra vez el del T2.
-- ============================================================


-- ---------- 1. Corrida entregada: su lote no se mueve ----------
create or replace function congelar_corrida_entregada()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('natulac.corregir_corrida_entregada', true), '') = 'on' then
    return new;
  end if;
  new.lote_id := old.lote_id;
  new.lote := old.lote;
  new.sabor_id := old.sabor_id;
  new.lote_terminado_en := old.lote_terminado_en;
  return new;
end;
$$;

drop trigger if exists congelar_corrida_entregada on turno_lineas;
create trigger congelar_corrida_entregada
  before update of lote_id, lote, sabor_id, lote_terminado_en on turno_lineas
  for each row
  when (old.entregada_en is not null)
  execute function congelar_corrida_entregada();

-- ---------- 2a. revisar_cierre_de_lote: las entregadas no cuentan ----------
-- Última versión: 20261059090000_cierre_de_lote_limpia_tanque_del_turno_abierto.sql
create or replace function revisar_cierre_de_lote(p_lote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
  v_numero_tanque smallint;
  v_volumen numeric;
  v_cerrado_en timestamptz;
  v_sabor_id uuid;
  v_lote_texto text;
begin
  if p_lote_id is null then
    return;
  end if;

  select turno_id, numero_tanque, volumen_l, cerrado_en, sabor_id, lote
  into v_turno_id, v_numero_tanque, v_volumen, v_cerrado_en, v_sabor_id, v_lote_texto
  from preparaciones where id = p_lote_id;

  if v_cerrado_en is not null then
    return;                                  -- ya cerrado
  end if;

  -- La entregada sigue activa en el turno cerrado, pero quien usa el lote
  -- es su continuación del turno siguiente.
  if exists (select 1 from turno_lineas where lote_id = p_lote_id and activa and entregada_en is null) then
    return;                                  -- todavia hay una corrida usandolo
  end if;

  if coalesce(v_volumen, 0) > 0 then
    -- La linea paro antes de vaciar el lote (falla / fin de turno / cambio
    -- de linea). El lote NO se cierra, queda abierto. El tanque se deja
    -- COMO ESTABA (tipicamente LISTO) para que otra linea lo tome o
    -- Preparacion lo transfiera/desvase/reuse.
    return;
  end if;

  -- Lote agotado y sin corrida activa: se cierra.
  update preparaciones set cerrado_en = now() where id = p_lote_id and cerrado_en is null;

  if v_numero_tanque is not null then
    -- El turno que creó el lote (como antes) Y todo turno abierto que
    -- todavía apunte a él: cada turno tiene su propia copia de la fila
    -- del tanque. Los turnos cerrados quedan como estaban (historia).
    update recepcion_tanques rt
    set condicion = 'SUCIO',
        sabor_id = null,
        volumen_l = null,
        lote = null,
        lote_id = null,
        activada_en = now(),
        ultimo_sabor_id = v_sabor_id,
        ultimo_lote = 'Restos del lote ' || coalesce(v_lote_texto, '?')
    where rt.lote_id = p_lote_id
      and (
        rt.turno_id = v_turno_id
        or rt.turno_id in (select t.id from turnos t where t.estado = 'ABIERTO')
      );
  end if;

  -- Otras corridas que apuntaban a este lote: marcarlo terminado.
  update turno_lineas set lote_terminado_en = now()
  where lote_id = p_lote_id and lote_terminado_en is null;
end;
$$;


-- ---------- 2b. continuar_siguiente_lote: las entregadas no cuentan ----------
-- Última versión: 20261104090000_corrida_pt_en_cero_no_bloquea_lote.sql
create or replace function continuar_siguiente_lote(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_numero_tanque smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_actual turno_lineas%rowtype;
  v_ancho integer;
  v_lote_siguiente text;
  v_tanque recepcion_tanques%rowtype;
  v_candidatos integer;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_actual.id is null then
    raise exception 'Esa corrida no está activa.';
  end if;

  if p_numero_tanque is not null then
    -- ---- Camino manual: el supervisor eligió el tanque ----
    select * into v_tanque
    from recepcion_tanques
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

    if v_tanque.numero_tanque is null then
      raise exception 'No existe el tanque % en este turno.', p_numero_tanque;
    end if;
    if v_tanque.condicion is distinct from 'LISTO' then
      raise exception 'El tanque % no está Listo (liberado) — no se puede tomar todavía.', p_numero_tanque;
    end if;
    if v_tanque.lote_id is null then
      raise exception 'El tanque % no tiene un lote asignado.', p_numero_tanque;
    end if;

    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and lote_id = v_tanque.lote_id
        and activa and id <> v_actual.id
    ) then
      raise exception 'El Lote % del tanque % ya lo está tomando otra corrida.', v_tanque.lote, p_numero_tanque;
    end if;
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and lote_id = v_tanque.lote_id
        and activa = false and finalizada_en is null
    ) then
      raise exception 'Hay una corrida detenida sobre el Lote % sin su Producto Terminado. Cárgalo antes de continuar.', v_tanque.lote;
    end if;
  else
    -- ---- Camino automático: lote consecutivo, mismo sabor, un solo tanque ----
    if v_actual.lote is null or v_actual.lote !~ '^[0-9]+$' then
      raise exception 'El lote actual (%) no tiene formato numérico — no se puede calcular el siguiente. Elige el tanque manualmente.', v_actual.lote;
    end if;

    v_ancho := length(v_actual.lote);
    v_lote_siguiente := lpad((v_actual.lote::bigint + 1)::text, greatest(v_ancho, 4), '0');

    select count(*) into v_candidatos
    from recepcion_tanques
    where turno_id = p_turno_id
      and condicion = 'LISTO'
      and lote = v_lote_siguiente
      and sabor_id is not distinct from v_actual.sabor_id;

    if v_candidatos = 0 then
      raise exception 'No hay ningún tanque Listo con el Lote % del mismo sabor. Elige el tanque manualmente.', v_lote_siguiente;
    end if;
    if v_candidatos > 1 then
      raise exception 'Hay más de un tanque Listo con el Lote % de ese sabor — elige el tanque manualmente.', v_lote_siguiente;
    end if;

    select * into v_tanque
    from recepcion_tanques
    where turno_id = p_turno_id
      and condicion = 'LISTO'
      and lote = v_lote_siguiente
      and sabor_id is not distinct from v_actual.sabor_id
    limit 1;
  end if;

  -- Guarda antiduplicados: esta linea ya tiene OTRA corrida de este
  -- lote + sabor este turno que YA produjo (PT en 0 no cuenta).
  if exists (
    select 1
    from turno_lineas tl2
    where tl2.turno_id = p_turno_id
      and tl2.linea_id = v_actual.linea_id
      and tl2.id <> v_actual.id
      and normalizar_lote(tl2.lote) = normalizar_lote(v_tanque.lote)
      and tl2.sabor_id is not distinct from v_tanque.sabor_id
      and corrida_produjo(tl2.id)
  ) then
    raise exception 'Esta línea ya corrió el Lote % este turno. Corrige el Producto Terminado de esa corrida en lugar de volver a activarla.', v_tanque.lote;
  end if;

  if v_tanque.lote_id is not distinct from v_actual.lote_id then
    raise exception 'El tanque % es el mismo Lote % que ya corre la línea. Elige el tanque del lote siguiente.', v_tanque.numero_tanque, v_tanque.lote;
  end if;

  -- La corrida actual pasa a ESPERANDO_PT (no se finaliza sin su PT).
  update turno_lineas
  set activa = false, actualizada_por = v_usuario_id
  where id = v_actual.id;

  -- El tanque del lote viejo, si ninguna otra corrida sigue con él, pasa
  -- de Listo a Con Restos con el lote abierto: ninguna línea lo toma y
  -- Preparación decide qué hacer con el resto (ver encabezado). Las
  -- filas de turnos abiertos, igual que revisar_cierre_de_lote.
  if v_actual.lote_id is not null
     and not exists (select 1 from turno_lineas where lote_id = v_actual.lote_id and activa and entregada_en is null)
     and exists (select 1 from preparaciones where id = v_actual.lote_id and cerrado_en is null) then
    update recepcion_tanques rt
    set condicion = 'STANDBY',
        activada_en = now(),
        actualizada_por = v_usuario_id
    where rt.lote_id = v_actual.lote_id
      and rt.condicion = 'LISTO'
      and rt.turno_id in (select t.id from turnos t where t.estado = 'ABIERTO');
  end if;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, actualizada_por,
    confirmado_inicio_en, confirmado_inicio_por
  )
  values (
    p_turno_id, v_actual.linea_id, v_actual.presentacion_id, v_actual.envases_hora, v_actual.litros_hora,
    v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id, v_usuario_id,
    now(), v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;


-- ---------- 3. registrar_contador: el mismo contador en otra corrida de la línea ----------
-- Última versión: 20261111090000_arreglos_revision_bloqueos.sql
create or replace function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_justificacion text,
  p_usuario text,
  p_pagina text default null,
  p_envases_buenos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_usuario_id uuid;
  v_turno_dup text;
  v_hora_dup text;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, true);
  if p_envases_buenos is null then
    raise exception 'El Contador 2 (envases buenos) es obligatorio.';
  end if;
  if p_envases_buenos < 0 or p_envases_buenos > p_envases_llenadora then
    raise exception 'El Contador 2 (envases buenos = %) no puede ser negativo ni superar el contador de la llenadora (%).',
      p_envases_buenos, p_envases_llenadora;
  end if;

  -- Cada carga se suma: el mismo contador otra vez enseguida es un duplicado.
  if exists (
    select 1 from contadores
    where turno_linea_id = p_turno_linea_id
      and envases_llenadora = p_envases_llenadora
      and envases_buenos is not distinct from p_envases_buenos
      and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'Ese contador (% envases, % buenos) ya se cargó en esta corrida hace menos de 30 minutos. No se volvió a sumar.',
      p_envases_llenadora, p_envases_buenos;
  end if;

  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- El mismo contador en OTRA corrida de la línea: es el del turno
  -- anterior cargado otra vez en la continuación (o al revés).
  select t.codigo, to_char(c.created_at at time zone 'America/Caracas', 'HH24:MI')
  into v_turno_dup, v_hora_dup
  from contadores c
  join turnos t on t.id = c.turno_id
  where c.linea_id = v_linea_id
    and t.area_id = (select area_id from turnos where id = p_turno_id)
    and c.turno_linea_id <> p_turno_linea_id
    and c.envases_llenadora = p_envases_llenadora
    and c.envases_buenos = p_envases_buenos
    and c.created_at > now() - interval '12 hours'
  order by c.created_at desc
  limit 1;
  if v_turno_dup is not null then
    raise exception 'Ese contador (% envases, % buenos) ya se cargó en el turno % a las %. No se volvió a sumar.',
      p_envases_llenadora, p_envases_buenos, v_turno_dup, v_hora_dup;
  end if;

  -- Cargar el contador es en sí mismo confirmar la línea, si todavía no lo estaba.
  update turno_lineas
  set confirmado_inicio_en = now(), confirmado_inicio_por = v_usuario_id
  where id = p_turno_linea_id and confirmado_inicio_en is null;

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, envases_buenos, justificacion, usuario_id)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, p_envases_buenos, nullif(p_justificacion, ''), v_usuario_id);

  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'contador', p_turno_linea_id::text, p_pagina,
    format('Contador %s: %s envases%s', p_linea_codigo, p_envases_llenadora,
           case when p_envases_buenos is not null then format(' (%s buenos)', p_envases_buenos) else '' end),
    null,
    jsonb_build_object('envases_llenadora', p_envases_llenadora, 'envases_buenos', p_envases_buenos,
                       'justificacion', nullif(p_justificacion, ''))
  );

  return turno_json(p_turno_id);
end;
$$;


-- ---------- 4. registrar_producto_terminado: el mismo PT en otro turno ----------
-- Última versión: 20261082090000_turno_cerrado_gracia_y_correccion.sql
create or replace function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text,
  p_pagina text default null,
  p_auditar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_presentacion_id uuid;
  v_cajas_x_paleta integer;
  v_litros_x_caja numeric;
  v_usuario_id uuid;
  v_registro producto_terminado%rowtype;
  v_litros_previos numeric;
  v_litros_delta numeric;
  v_lote_id uuid;
  v_pal_prev integer;
  v_caj_prev integer;
  v_habia_pt boolean;
  v_pt_creado timestamptz;
  v_turno_dup text;
  v_hora_dup text;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, true);
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- Cargar PT es en sí mismo confirmar la línea, si todavía no lo estaba.
  update turno_lineas
  set confirmado_inicio_en = now(), confirmado_inicio_por = v_usuario_id
  where id = p_turno_linea_id and confirmado_inicio_en is null;

  select litros_producidos, paletas, cajas_sueltas, created_at
  into v_litros_previos, v_pal_prev, v_caj_prev, v_pt_creado
  from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_habia_pt := found;
  v_litros_previos := coalesce(v_litros_previos, 0);

  -- CANDADO: edición del supervisor pasada 1 h desde que se cargó.
  if coalesce(p_auditar, true) and v_habia_pt
     and v_pt_creado is not null and now() - v_pt_creado > interval '1 hour' then
    raise exception 'Ya no se puede cambiar este Producto Terminado (pasó más de 1 hora desde que se cargó). Se corrige desde el módulo Validar cuando cierre el turno.';
  end if;

  -- El mismo PT en otro turno de la línea, cargado hace menos de 1 h: es
  -- el del turno anterior cargado otra vez en la continuación (o al revés).
  if coalesce(p_auditar, true) and coalesce(p_paletas, 0) + coalesce(p_cajas_sueltas, 0) > 0 then
    select t.codigo, to_char(coalesce(pt.updated_at, pt.created_at) at time zone 'America/Caracas', 'HH24:MI')
    into v_turno_dup, v_hora_dup
    from producto_terminado pt
    join turnos t on t.id = pt.turno_id
    where pt.linea_id = v_linea_id
      and t.area_id = (select area_id from turnos where id = p_turno_id)
      and pt.turno_id <> p_turno_id
      and pt.paletas = p_paletas
      and pt.cajas_sueltas = p_cajas_sueltas
      and coalesce(pt.updated_at, pt.created_at) > now() - interval '1 hour'
    order by coalesce(pt.updated_at, pt.created_at) desc
    limit 1;
    if v_turno_dup is not null then
      raise exception 'Ese Producto Terminado (% paletas + % cajas) ya está cargado en el turno % a las %. Si es del turno anterior, ya quedó guardado: no lo cargues aquí.',
        p_paletas, p_cajas_sueltas, v_turno_dup, v_hora_dup;
    end if;
  end if;

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        updated_at = now()
  returning * into v_registro;

  v_litros_delta := v_registro.litros_producidos - v_litros_previos;

  -- Solo baja el volumen del lote. El cierre del lote/tanque lo hace
  -- revisar_cierre_de_lote. Producción no escribe en recepcion_tanques.
  select tl.lote_id into v_lote_id from turno_lineas tl where tl.id = p_turno_linea_id;

  if v_lote_id is not null and v_litros_delta <> 0 then
    update preparaciones
    set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_delta),
        actualizada_por = v_usuario_id
    where id = v_lote_id and cerrado_en is null;
  end if;

  -- Cierra la corrida si quedó en ESPERANDO_PT.
  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  -- Y aunque la corrida ya se hubiera cerrado antes (p. ej. el contador la
  -- cerró en la misma pantalla), revisar acá si ESTE PT dejó el lote en
  -- ~0 — cerrar_corrida_si_esperando ya no correría revisar_cierre_de_lote.
  if v_lote_id is not null then
    perform revisar_cierre_de_lote(v_lote_id);
  end if;

  if coalesce(p_auditar, true) then
    perform registrar_auditoria(
      p_usuario,
      case when v_habia_pt then 'EDITAR' else 'CREAR' end,
      'producto_terminado', p_turno_linea_id::text, p_pagina,
      format('Producto Terminado %s: %s paletas + %s cajas',
             p_linea_codigo, v_registro.paletas, v_registro.cajas_sueltas),
      case when v_habia_pt
           then jsonb_build_object('paletas', v_pal_prev, 'cajas_sueltas', v_caj_prev, 'litros', round(v_litros_previos))
           else null end,
      jsonb_build_object('paletas', v_registro.paletas, 'cajas_sueltas', v_registro.cajas_sueltas, 'litros', round(v_registro.litros_producidos))
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;


-- ---------- 5. finalizar_turno: no finalizar la continuación recién abierta ----------
-- Última versión: 20261090090000_paradas_pantalla_unica.sql
create or replace function finalizar_turno(p_usuario text, p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas_activas text;
  v_es_pruebas boolean;
  v_pendientes integer;
  v_codigo text;
  v_inicio timestamp;
begin
  perform exigir_puede_finalizar(p_usuario, p_turno_id);

  -- El turno que el sistema le abrió al mismo supervisor como continuación
  -- del suyo (12x12 a las 22:30, relevo temprano) no se finaliza en sus
  -- primeras 2 h: el anterior ya quedó cerrado y su PT va en la gracia.
  select t.codigo, t.fecha + t.hora_inicio
  into v_codigo, v_inicio
  from turnos t
  where t.id = p_turno_id
    and t.apertura_automatica
    and t.supervisor_id = (select id from usuarios where usuario = lower(p_usuario))
    and exists (
      select 1 from turnos p
      where p.area_id = t.area_id and p.id <> t.id and p.estado = 'CERRADO'
        and p.supervisor_id = t.supervisor_id
        and p.fecha_fin + p.hora_fin between t.fecha + t.hora_inicio - interval '2 minutes'
                                         and t.fecha + t.hora_inicio + interval '2 minutes'
    );
  if v_codigo is not null and (now() at time zone 'America/Caracas') < v_inicio + interval '2 hours' then
    raise exception 'El turno % lo abrió el sistema a las % como continuación del tuyo: el turno anterior ya quedó cerrado. No lo finalices, sigues a cargo hasta el cambio de turno. Si falta PT del turno anterior, cárgalo en Producto Terminado con «Cargar en el turno anterior».',
      v_codigo, to_char(v_inicio, 'HH24:MI');
  end if;
  select (a.codigo = 'PRUEBAS') into v_es_pruebas
  from turnos t
  join areas a on a.id = t.area_id
  where t.id = p_turno_id;

  select count(*) into v_pendientes from paradas where turno_id = p_turno_id and pendiente;
  if v_pendientes > 0 then
    raise exception 'Hay % parada(s) sin completar (tipo o minutos). Complétalas en Registrar Paradas antes de finalizar el turno.',
      v_pendientes;
  end if;

  if not coalesce(v_es_pruebas, false) then
    -- Corrida detenida sin su Producto Terminado (ESPERANDO_PT).
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and activa = false and finalizada_en is null
    ) then
      raise exception 'Hay una corrida detenida sin su Producto Terminado. Cárgalo antes de finalizar el turno.';
    end if;

    -- Case 6: corrida todavía activa y sin entregar. Hay que cargar el PT
    -- del tramo de este turno y elegir Terminar o Entregar línea.
    select string_agg(l.nombre, ', ' order by l.codigo)
    into v_lineas_activas
    from turno_lineas tl
    join lineas l on l.id = tl.linea_id
    where tl.turno_id = p_turno_id and tl.activa and tl.entregada_en is null;

    if v_lineas_activas is not null then
      raise exception 'Estas líneas siguen activas: %. Carga su Producto Terminado de este turno y elige Terminar o Entregar línea antes de finalizar.',
        v_lineas_activas;
    end if;

    -- Tanque con producción de este turno sin confirmar su estado
    -- final: sin esto, el cierre queda a merced de la foto automática
    -- (el bug de hoy).
    if exists (
      select 1
      from recepcion_tanques rt
      where rt.turno_id = p_turno_id
        and rt.confirmado_fin_en is null
        and rt.lote_id is not null
        and exists (select 1 from turno_lineas tl where tl.turno_id = p_turno_id and tl.lote_id = rt.lote_id)
    ) then
      raise exception 'Hay tanques con producción de este turno sin confirmar su estado final. Confírmalos desde Preparación antes de finalizar.';
    end if;

    -- Línea que se ENTREGA activa al turno siguiente sin confirmar su
    -- fin: es el único caso de línea con riesgo real de arrastre (mismo
    -- criterio que tanques) — una corrida que ya terminó (finalizada_en,
    -- por PT o por reemplazo) no hereda nada, no lo necesita. Red de
    -- seguridad: en el flujo normal ya queda confirmada sola al Entregar
    -- línea (ver entregar_corrida más arriba).
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id
        and activa and entregada_en is not null
        and confirmado_fin_en is null
    ) then
      raise exception 'Hay líneas entregadas de este turno sin confirmar su estado final.';
    end if;
  end if;

  update turnos
  set estado = 'CERRADO',
      fecha_fin = (now() at time zone 'America/Caracas')::date,
      hora_fin = (now() at time zone 'America/Caracas')::time
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;


select * from asegurar_control_usuario();
