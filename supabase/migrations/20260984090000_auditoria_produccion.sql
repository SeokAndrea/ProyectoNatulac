-- ============================================================
-- AUDITORÍA UNIVERSAL — Producto Terminado y Contadores (FASE 3)
-- ============================================================
-- registrar_contador, registrar_producto_terminado y
-- corregir_producto_terminado_auditoria pasan a registrar en la tabla
-- común `auditoria` (con p_pagina + antes/después). El ciclo de turno
-- (comenzar / status / preparación / líneas / finalizar) queda para
-- una fase siguiente.
-- ============================================================

-- ------------------------------------------------------------
-- registrar_contador: + p_pagina + registro de auditoría.
-- ------------------------------------------------------------
drop function if exists registrar_contador(uuid, uuid, text, integer, text, text, boolean);

create function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_justificacion text,
  p_usuario text,
  p_parcial boolean default false,
  p_pagina text default null
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
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, justificacion, usuario_id, parcial)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, nullif(p_justificacion, ''), v_usuario_id, coalesce(p_parcial, false));

  if not coalesce(p_parcial, false) then
    perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  end if;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'contador', p_turno_linea_id::text, p_pagina,
    format('Contador %s: %s envases%s', p_linea_codigo, p_envases_llenadora,
           case when coalesce(p_parcial, false) then ' (parcial)' else '' end),
    null,
    jsonb_build_object('envases_llenadora', p_envases_llenadora, 'parcial', coalesce(p_parcial, false),
                       'justificacion', nullif(p_justificacion, ''))
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_contador(uuid, uuid, text, integer, text, text, boolean, text) to anon, authenticated;

-- ------------------------------------------------------------
-- registrar_producto_terminado: + p_pagina + p_auditar (para que la
-- corrección de admin no genere dos filas) + registro de auditoría.
-- ------------------------------------------------------------
drop function if exists registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, boolean, integer, boolean, boolean);

create function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text,
  p_producto_retenido boolean default false,
  p_cajas_retenidas integer default null,
  p_parcial boolean default false,
  p_forzar_total boolean default false,
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
  v_numero_tanque smallint;
  v_nuevo_volumen numeric;
  v_lote_sabor_id uuid;
  v_lote_lote text;
  v_tanque_condicion text;
  v_parcial boolean := coalesce(p_parcial, false);
  v_tiene_parciales boolean;
  v_aditivo boolean;
  v_pal_prev integer;
  v_caj_prev integer;
  v_habia_pt boolean;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select litros_producidos, tiene_parciales, paletas, cajas_sueltas
  into v_litros_previos, v_tiene_parciales, v_pal_prev, v_caj_prev
  from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_habia_pt := found;
  v_litros_previos := coalesce(v_litros_previos, 0);

  v_aditivo := v_parcial or (coalesce(v_tiene_parciales, false) and not coalesce(p_forzar_total, false));

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id,
    producto_retenido, cajas_retenidas, tiene_parciales
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id,
    p_producto_retenido, p_cajas_retenidas, v_parcial
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = case when v_aditivo then producto_terminado.paletas + excluded.paletas else excluded.paletas end,
        cajas_sueltas = case when v_aditivo then producto_terminado.cajas_sueltas + excluded.cajas_sueltas else excluded.cajas_sueltas end,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        producto_retenido = excluded.producto_retenido,
        cajas_retenidas = excluded.cajas_retenidas,
        tiene_parciales = producto_terminado.tiene_parciales or excluded.tiene_parciales,
        updated_at = now()
  returning * into v_registro;

  v_litros_delta := v_registro.litros_producidos - v_litros_previos;

  if v_parcial then
    insert into producto_terminado_parciales (
      turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
    )
    values (
      p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
    );
  end if;

  select tl.lote_id into v_lote_id from turno_lineas tl where tl.id = p_turno_linea_id;

  if v_lote_id is not null then
    if v_litros_delta <> 0 then
      update preparaciones
      set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_delta)
      where id = v_lote_id and cerrado_en is null;
    end if;

    select numero_tanque, volumen_l, sabor_id, lote into v_numero_tanque, v_nuevo_volumen, v_lote_sabor_id, v_lote_lote
    from preparaciones where id = v_lote_id;

    if v_numero_tanque is not null then
      select condicion into v_tanque_condicion
      from recepcion_tanques where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;

      if v_tanque_condicion = 'LISTO' and coalesce(v_nuevo_volumen, 0) <= 0 then
        update recepcion_tanques
        set condicion = 'SUCIO',
            sabor_id = null,
            volumen_l = null,
            lote = null,
            lote_id = null,
            activada_en = now(),
            ultimo_sabor_id = v_lote_sabor_id,
            ultimo_lote = 'Restos del lote ' || coalesce(v_lote_lote, '?')
        where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;

        update preparaciones set cerrado_en = now() where id = v_lote_id and cerrado_en is null;

        update turno_lineas
        set lote_terminado_en = now()
        where lote_id = v_lote_id and activa;
      else
        update recepcion_tanques
        set volumen_l = v_nuevo_volumen
        where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;
      end if;
    end if;
  end if;

  if not v_parcial then
    perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  end if;

  if coalesce(p_auditar, true) then
    perform registrar_auditoria(
      p_usuario,
      case when v_habia_pt then 'EDITAR' else 'CREAR' end,
      'producto_terminado', p_turno_linea_id::text, p_pagina,
      format('Producto Terminado %s: %s paletas + %s cajas%s',
             p_linea_codigo, v_registro.paletas, v_registro.cajas_sueltas,
             case when v_parcial then ' (entrega parcial)' else '' end),
      case when v_habia_pt
           then jsonb_build_object('paletas', v_pal_prev, 'cajas_sueltas', v_caj_prev, 'litros', round(v_litros_previos))
           else null end,
      jsonb_build_object('paletas', v_registro.paletas, 'cajas_sueltas', v_registro.cajas_sueltas, 'litros', round(v_registro.litros_producidos))
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, boolean, integer, boolean, boolean, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- corregir_producto_terminado_auditoria: + p_pagina. Llama a
-- registrar_producto_terminado con p_auditar => false y escribe UNA
-- fila de auditoría propia (acción EDITAR, con antes/después).
-- ------------------------------------------------------------
create or replace function corregir_producto_terminado_auditoria(
  p_usuario text,
  p_turno_linea_id uuid,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_pagina text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_usuario_id uuid;
  v_turno_id uuid;
  v_turno_area_codigo text;
  v_linea_codigo text;
  v_sabor_id uuid;
  v_volumen_ml integer;
  v_producto_retenido boolean;
  v_cajas_retenidas integer;
  v_pal_antes integer;
  v_caj_antes integer;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is null or v_rol not in ('SUPERADMINISTRADOR', 'ADMINISTRADOR_AREA') then
    raise exception 'No tienes permiso para editar esto.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select pt.turno_id, l.codigo, pt.sabor_id, p.volumen_ml, pt.producto_retenido, pt.cajas_retenidas, pt.paletas, pt.cajas_sueltas
  into v_turno_id, v_linea_codigo, v_sabor_id, v_volumen_ml, v_producto_retenido, v_cajas_retenidas, v_pal_antes, v_caj_antes
  from producto_terminado pt
  join lineas l on l.id = pt.linea_id
  join presentaciones p on p.id = pt.presentacion_id
  where pt.turno_linea_id = p_turno_linea_id;

  if v_turno_id is null then
    raise exception 'No se encontró Producto Terminado para esa corrida.';
  end if;

  select a.codigo into v_turno_area_codigo from turnos t join areas a on a.id = t.area_id where t.id = v_turno_id;
  if v_rol = 'ADMINISTRADOR_AREA' and v_turno_area_codigo is distinct from v_area then
    raise exception 'No tienes permiso para editar esto.';
  end if;

  perform registrar_producto_terminado(
    v_turno_id, p_turno_linea_id, v_linea_codigo, v_sabor_id, v_volumen_ml,
    p_paletas, p_cajas_sueltas, p_usuario, v_producto_retenido, v_cajas_retenidas, false, true, p_pagina, false
  );

  update producto_terminado
  set editado_por = v_usuario_id, editado_en = now()
  where turno_linea_id = p_turno_linea_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'producto_terminado', p_turno_linea_id::text, p_pagina,
    format('Corrigió Producto Terminado %s: %s→%s paletas, %s→%s cajas',
           v_linea_codigo, v_pal_antes, p_paletas, v_caj_antes, p_cajas_sueltas),
    jsonb_build_object('paletas', v_pal_antes, 'cajas_sueltas', v_caj_antes),
    jsonb_build_object('paletas', p_paletas, 'cajas_sueltas', p_cajas_sueltas)
  );

  return turno_json(v_turno_id);
end;
$$;

grant execute on function corregir_producto_terminado_auditoria(text, uuid, integer, integer, text) to anon, authenticated;
