-- ============================================================
-- Correo de Mantenimiento en Ajustes de planta
-- ============================================================
-- Dueña, 2026-10-26: a quién le llegan los avisos de Solicitudes de
-- Inspección / Intervención (correos_pendientes, 20261111690000) se cambia
-- desde la app (Edición de Datos → Ajustes de planta), no en .env.local.
--
--   * configuracion_app 'correo_mantenimiento_para': correos separados por
--     coma. El servicio "correo" lo lee en cada vuelta; si está vacío usa
--     CORREO_PARA de .env.local (como antes).
--   * La cuenta que manda (SMTP_* y su clave) sigue en .env.local: una clave
--     no se guarda en la base ni se muestra en una pantalla.
--   * estado_correos(): cuántos avisos esperan y el último error, para ver
--     desde Ajustes si los correos salen.
--   * Un aviso con más de 24 h sin salir ya no se manda (MAX_HORAS en
--     correo/servidor.mjs): al encender el correo no llega todo lo acumulado.
-- ============================================================

-- Última versión: 20261108890000 (+ correo_mantenimiento_para).
create or replace function obtener_configuracion(p_clave text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_clave not in ('sheet_mantenimiento_url', 'sheet_mantenimiento_ultima_sync', 'sheet_mantenimiento_desde',
                     'correo_mantenimiento_para') then
    raise exception 'Ajuste desconocido.';
  end if;
  return (select valor from configuracion_app where clave = p_clave);
end;
$$;
grant execute on function obtener_configuracion(text) to anon, authenticated;

-- Última versión: 20261079090000 (+ correo_mantenimiento_para).
create or replace function guardar_configuracion(
  p_usuario text,
  p_clave text,
  p_valor text,
  p_pagina text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_usuario_id uuid;
  v_antes text;
  v_valor text := nullif(trim(coalesce(p_valor, '')), '');
  v_correo text;
  v_correos text[] := '{}';
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not es_dueno(p_usuario) then
    raise exception 'No tienes permiso para cambiar los ajustes.';
  end if;
  if p_clave not in ('sheet_mantenimiento_url', 'correo_mantenimiento_para') then
    raise exception 'Ajuste desconocido.';
  end if;
  if p_clave = 'sheet_mantenimiento_url' and v_valor is not null
     and v_valor !~ '^https://docs\.google\.com/spreadsheets/' then
    raise exception 'El enlace tiene que ser de un Google Sheet (https://docs.google.com/spreadsheets/…).';
  end if;
  -- Correos: separados por coma, punto y coma o espacio; quedan en minúscula y sin repetir.
  if p_clave = 'correo_mantenimiento_para' and v_valor is not null then
    foreach v_correo in array regexp_split_to_array(lower(v_valor), '[\s,;]+') loop
      continue when v_correo = '';
      if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception '«%» no parece un correo.', v_correo;
      end if;
      if not v_correo = any (v_correos) then
        v_correos := v_correos || v_correo;
      end if;
    end loop;
    v_valor := nullif(array_to_string(v_correos, ', '), '');
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select valor into v_antes from configuracion_app where clave = p_clave;

  insert into configuracion_app (clave, valor, updated_at, updated_by)
  values (p_clave, v_valor, now(), v_usuario_id)
  on conflict (clave) do update
    set valor = excluded.valor, updated_at = now(), updated_by = v_usuario_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'configuracion_app', p_clave, p_pagina,
    format('Cambió el ajuste «%s»', p_clave),
    jsonb_build_object('valor', v_antes),
    jsonb_build_object('valor', v_valor)
  );
end;
$$;

-- Cómo va la cola de correos (solo el dueño).
create or replace function estado_correos(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not es_dueno(p_usuario) then
    raise exception 'No tienes permiso para ver los ajustes.';
  end if;
  -- 24 h: lo mismo que MAX_HORAS del servicio; lo más viejo ya no sale.
  return jsonb_build_object(
    'esperando', (select count(*) from correos_pendientes
                  where enviado_en is null and intentos < 5 and creado_en > now() - interval '24 hours'),
    'fallidos', (select count(*) from correos_pendientes
                 where enviado_en is null and intentos >= 5 and creado_en > now() - interval '24 hours'),
    'vencidos', (select count(*) from correos_pendientes
                 where enviado_en is null and creado_en <= now() - interval '24 hours'),
    'ultimo_enviado_en', (select max(enviado_en) from correos_pendientes),
    'ultimo_error', (select ultimo_error from correos_pendientes
                     where enviado_en is null and ultimo_error is not null and creado_en > now() - interval '24 hours'
                     order by creado_en desc limit 1)
  );
end;
$$;
grant execute on function estado_correos(text) to anon, authenticated;

-- Regla de seguridad (20261109690000): toda función nueva con p_usuario queda controlada.
select * from asegurar_control_usuario();
