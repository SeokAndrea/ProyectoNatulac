-- ============================================================
-- CANDADO: el supervisor no edita Producto Terminado después de 1 h
-- ============================================================
-- Pasada 1 h desde que se cargó un Producto Terminado, el supervisor
-- ya no puede cambiarlo desde la página de Producto Terminado. El
-- ADMINISTRADOR_AREA sí puede corregir (usa corregir_producto_terminado_
-- auditoria, que llama a esta función con p_auditar => false), y para
-- lo demás está el módulo Validar (tabla aparte, no toca esta fila).
--
-- Discriminador: p_auditar. El camino directo del supervisor pasa
-- true (default); la corrección de admin pasa false.
-- Exento: la primera carga (INSERT, sin on conflict) y las entregas
-- parciales (v_aditivo).
--
-- Idéntica a 20260984 salvo el bloque marcado "-- CANDADO".
-- ============================================================

drop function if exists registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, boolean, integer, boolean, boolean, text, boolean);

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
  v_pt_creado timestamptz;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select litros_producidos, tiene_parciales, paletas, cajas_sueltas, created_at
  into v_litros_previos, v_tiene_parciales, v_pal_prev, v_caj_prev, v_pt_creado
  from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_habia_pt := found;
  v_litros_previos := coalesce(v_litros_previos, 0);

  v_aditivo := v_parcial or (coalesce(v_tiene_parciales, false) and not coalesce(p_forzar_total, false));

  -- CANDADO: edición del supervisor pasada 1 h desde que se cargó.
  if coalesce(p_auditar, true) and v_habia_pt and not v_aditivo
     and v_pt_creado is not null and now() - v_pt_creado > interval '1 hour' then
    raise exception 'Ya no se puede cambiar este Producto Terminado (pasó más de 1 hora desde que se cargó). Un administrador puede corregirlo, o se valida desde el módulo Validar.';
  end if;

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
