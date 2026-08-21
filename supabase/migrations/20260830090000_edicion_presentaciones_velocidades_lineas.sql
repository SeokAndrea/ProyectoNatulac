-- ============================================================
-- EDICIÓN DE PRESENTACIONES, VELOCIDADES Y LÍNEAS
-- ============================================================
-- Completa "Edición de Datos": mismo patrón que sabores/personal
-- (security definer, porque estas tablas tienen RLS sin políticas).
--
-- "Líneas" es un caso especial: LineaCodigo es un tipo CERRADO en el
-- frontend (LINEA_1 | LINEA_2 | LINEA_3 — ver src/lib/catalogos.ts),
-- usado para type-safety en todo Comenzar Turno / Contadores /
-- Finalizar Turno. Por eso acá solo se puede EDITAR el nombre y
-- activar/desactivar una línea existente — no crear una con un
-- código nuevo, porque el frontend no sabría qué hacer con un código
-- que no sea uno de esos tres sin un cambio de código aparte.
--
-- En "Presentaciones", volumen_ml tampoco se edita una vez creada
-- (es su identidad — el frontend la usa como "código" en todos
-- lados); si hay que cambiarlo, se desactiva y se crea una nueva. En
-- "Velocidades", pasa lo mismo con envases_hora (por el unique
-- (linea_id, presentacion_id, envases_hora)).
-- ============================================================

-- ------------------------------------------------------------
-- PRESENTACIONES
-- ------------------------------------------------------------
create or replace function listar_presentaciones()
returns table (
  presentacion_id uuid,
  volumen_ml integer,
  cajas_x_camada integer,
  cant_camada integer,
  cajas_x_paleta integer,
  litros_x_caja numeric,
  envases_x_caja integer,
  activo boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select p.id, p.volumen_ml, p.cajas_x_camada, p.cant_camada, p.cajas_x_paleta, p.litros_x_caja, p.envases_x_caja, p.activo
  from presentaciones p
  order by p.volumen_ml desc;
end;
$$;

create or replace function crear_presentacion(
  p_volumen_ml integer,
  p_cajas_x_camada integer,
  p_cant_camada integer,
  p_cajas_x_paleta integer,
  p_litros_x_caja numeric,
  p_envases_x_caja integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into presentaciones (volumen_ml, cajas_x_camada, cant_camada, cajas_x_paleta, litros_x_caja, envases_x_caja)
  values (p_volumen_ml, p_cajas_x_camada, p_cant_camada, p_cajas_x_paleta, p_litros_x_caja, p_envases_x_caja)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function editar_presentacion(
  p_presentacion_id uuid,
  p_cajas_x_camada integer,
  p_cant_camada integer,
  p_cajas_x_paleta integer,
  p_litros_x_caja numeric,
  p_envases_x_caja integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update presentaciones
  set cajas_x_camada = p_cajas_x_camada,
      cant_camada = p_cant_camada,
      cajas_x_paleta = p_cajas_x_paleta,
      litros_x_caja = p_litros_x_caja,
      envases_x_caja = p_envases_x_caja
  where id = p_presentacion_id;
end;
$$;

create or replace function desactivar_presentacion(p_presentacion_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update presentaciones set activo = false where id = p_presentacion_id;
end;
$$;

create or replace function reactivar_presentacion(p_presentacion_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update presentaciones set activo = true where id = p_presentacion_id;
end;
$$;

-- ------------------------------------------------------------
-- VELOCIDADES DE LLENADORA
-- ------------------------------------------------------------
create or replace function listar_velocidades()
returns table (
  velocidad_id uuid,
  linea_codigo text,
  presentacion_volumen_ml integer,
  maquina text,
  envases_hora integer,
  litros_hora numeric,
  activo boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select v.id, l.codigo, p.volumen_ml, v.maquina, v.envases_hora, v.litros_hora, v.activo
  from velocidades_llenadora v
  join lineas l on l.id = v.linea_id
  join presentaciones p on p.id = v.presentacion_id
  order by l.codigo, p.volumen_ml desc, v.envases_hora;
end;
$$;

create or replace function crear_velocidad(
  p_linea_codigo text,
  p_volumen_ml integer,
  p_maquina text,
  p_envases_hora integer,
  p_litros_hora numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_presentacion_id uuid;
  v_id uuid;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  if v_linea_id is null then
    raise exception 'Línea % no existe', p_linea_codigo;
  end if;

  select id into v_presentacion_id from presentaciones where volumen_ml = p_volumen_ml;
  if v_presentacion_id is null then
    raise exception 'Presentación % no existe', p_volumen_ml;
  end if;

  insert into velocidades_llenadora (linea_id, presentacion_id, maquina, envases_hora, litros_hora)
  values (v_linea_id, v_presentacion_id, p_maquina, p_envases_hora, p_litros_hora)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function editar_velocidad(p_velocidad_id uuid, p_maquina text, p_litros_hora numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update velocidades_llenadora set maquina = p_maquina, litros_hora = p_litros_hora where id = p_velocidad_id;
end;
$$;

create or replace function desactivar_velocidad(p_velocidad_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update velocidades_llenadora set activo = false where id = p_velocidad_id;
end;
$$;

create or replace function reactivar_velocidad(p_velocidad_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update velocidades_llenadora set activo = true where id = p_velocidad_id;
end;
$$;

-- ------------------------------------------------------------
-- LÍNEAS (solo editar nombre y activo — ver nota arriba)
-- ------------------------------------------------------------
create or replace function listar_lineas()
returns table (linea_id uuid, codigo text, nombre text, area_codigo text, activo boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select l.id, l.codigo, l.nombre, a.codigo, l.activo
  from lineas l
  join areas a on a.id = l.area_id
  order by l.codigo;
end;
$$;

create or replace function editar_linea(p_linea_id uuid, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update lineas set nombre = p_nombre where id = p_linea_id;
end;
$$;

create or replace function desactivar_linea(p_linea_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update lineas set activo = false where id = p_linea_id;
end;
$$;

create or replace function reactivar_linea(p_linea_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update lineas set activo = true where id = p_linea_id;
end;
$$;

grant execute on function listar_presentaciones() to anon, authenticated;
grant execute on function crear_presentacion(integer, integer, integer, integer, numeric, integer) to anon, authenticated;
grant execute on function editar_presentacion(uuid, integer, integer, integer, numeric, integer) to anon, authenticated;
grant execute on function desactivar_presentacion(uuid) to anon, authenticated;
grant execute on function reactivar_presentacion(uuid) to anon, authenticated;

grant execute on function listar_velocidades() to anon, authenticated;
grant execute on function crear_velocidad(text, integer, text, integer, numeric) to anon, authenticated;
grant execute on function editar_velocidad(uuid, text, numeric) to anon, authenticated;
grant execute on function desactivar_velocidad(uuid) to anon, authenticated;
grant execute on function reactivar_velocidad(uuid) to anon, authenticated;

grant execute on function listar_lineas() to anon, authenticated;
grant execute on function editar_linea(uuid, text) to anon, authenticated;
grant execute on function desactivar_linea(uuid) to anon, authenticated;
grant execute on function reactivar_linea(uuid) to anon, authenticated;
