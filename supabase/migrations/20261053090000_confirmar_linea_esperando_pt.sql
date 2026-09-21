-- ============================================================
-- FIX: "Confirma el estado de esta línea antes de cargar el Producto
-- Terminado / el contador" bloqueaba sin salida a una corrida heredada
-- que nadie confirmó a tiempo.
-- ============================================================
-- Caso real (Javier Bello, 2026-09-17, turno A20260917_T2G1): al
-- arrancar su turno heredó dos corridas activas de Danny (LINEA_1 y
-- LINEA_3, Lote 0007) — iniciar_turno() las copia con
-- confirmado_inicio_en NULL a propósito (20260933: "copiar la
-- confirmación del turno anterior no vale para este"). Javier confirmó
-- los 3 tanques pero no esas 2 líneas. Con LINEA_1 ya detenida
-- (activa=false, finalizada_en NULL — ESPERANDO_PT), el botón
-- "Confirmar" de la revisión de inicio de turno solo aparece para
-- corridas ahí mismo — si el supervisor sigue de largo sin usarlo,
-- no hay ningún otro lugar en la app para volver a confirmarla, y
-- registrar_producto_terminado()/registrar_contador() la rechazaban
-- para siempre con "Confirma el estado de esta línea...". Punto
-- muerto: la línea corrió de verdad, pero no había forma de cargar su
-- PT ni su contador.
--
-- ARREGLO DE FONDO (pedido explícito: que a Deivis, o a cualquier
-- supervisor que "se salga de ahí" sin tocar el botón, nunca le pase
-- esto). En vez de EXIGIR la confirmación antes de cargar PT/Contador,
-- cargar PT o Contador CONFIRMA la línea en el acto si todavía no lo
-- estaba — la propia carga de datos reales es la confirmación. El
-- botón "Confirmar" de la revisión de inicio de turno sigue existiendo
-- (deja la línea confirmada sin esperar a que produzca), pero ya no es
-- la única puerta.
-- ============================================================

-- ------------------------------------------------------------
-- 1. registrar_producto_terminado(): idéntica a 20261042, salvo que el
--    guard que rechazaba (`raise exception`) ahora confirma inline.
-- ------------------------------------------------------------
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
begin
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

grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. registrar_contador(): idéntica a 20261042, mismo cambio.
-- ------------------------------------------------------------
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
begin
  if p_envases_buenos is null then
    raise exception 'El Contador 2 (envases buenos) es obligatorio.';
  end if;
  if p_envases_buenos < 0 or p_envases_buenos > p_envases_llenadora then
    raise exception 'El Contador 2 (envases buenos = %) no puede ser negativo ni superar el contador de la llenadora (%).',
      p_envases_buenos, p_envases_llenadora;
  end if;

  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

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

grant execute on function registrar_contador(uuid, uuid, text, integer, text, text, text, integer) to anon, authenticated;
