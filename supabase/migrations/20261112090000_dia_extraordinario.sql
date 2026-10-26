-- ============================================================
-- Día extraordinario: se trabaja un día que no es laborable
-- ============================================================
-- Dueña, 2026-10-26: el viernes pasado hubo Turno 3 (el calendario de
-- franja_laborable() dice que el T3 del viernes, el sábado y el domingo no
-- se trabajan) y el sistema se comportó como si no existiera: el respaldo
-- no abre ni continúa nada en una franja no laborable. Pasa muy rara vez,
-- pero pasa (también un sábado). Se resuelve con un interruptor por área,
-- como el 12x12: "Día extraordinario" marca la jornada de hoy como
-- laborable para quien YA está trabajando: la continuidad 12x12 (T1 → T2,
-- T2 de la noche → T3) y el relevo temprano siguen como un día normal.
-- Lo que NO hace es abrir turnos "sin responsable": no se sabe qué franjas
-- de un día extraordinario se trabajan (un sábado puede ser solo el T1), y
-- abrirlas todas dejaría turnos fantasma. Cada turno que no viene de una
-- continuidad se inicia a mano; el que queda abierto sin seguir se cierra
-- 30 min después del cambio de franja, como siempre.
--
-- Casos:
--   * 12x12, viernes con el interruptor: a las 22:30 el T2 de la noche pasa
--     solo al T3 con el mismo supervisor; el sábado a las 7:30 ese T3 se
--     cierra (el sábado no es laborable) y su acta queda pendiente.
--   * 12x12, sábado/domingo con el interruptor: T1 → T2 a las 15:00 solo;
--     el T2 de la noche se comienza a mano a las 19:00; a las 22:30 pasa
--     solo al T3.
--   * 3x8 con el interruptor: cada turno se inicia a mano (como siempre en
--     3x8); el interruptor sirve para el relevo temprano y para que la
--     producción cuente en la Programación.
--   * Sin el interruptor (viernes T3, sábado, domingo): se puede iniciar
--     cualquier turno a mano, pero no hay continuidad: a las 22:30 el T2 no
--     pasa al T3, y el turno abierto se cierra 30 min después del cambio.
--     Lo producido un sábado o domingo no entra en la Programación.
--
-- Los interruptores 12x12 y Día extraordinario pasan a verlos también los
-- supervisores (permiso ESQUEMA_TURNOS al rol SUPERVISOR).
--
--   * dias_extraordinarios: (área, fecha operativa). La fecha operativa es
--     la de turno_de_hora(): la madrugada pertenece a la jornada anterior,
--     así que marcar el viernes cubre también el T3 hasta el sábado 7:00.
--   * franja_laborable(fecha, tipo, area_id): el calendario de siempre, más
--     los días extraordinarios del área. La de 2 argumentos queda igual.
--   * ajustes_turnos() gana dia_extraordinario (de la jornada actual).
--   * guardar_dia_extraordinario(): lo prende/apaga quien tiene el permiso
--     ESQUEMA_TURNOS, con auditoría.
--   * relevo_de_respaldo_en(): en una franja que solo es laborable por el
--     día extraordinario, solo continúa; nunca abre sin responsable.
-- ============================================================

create table if not exists dias_extraordinarios (
  area_id uuid not null references areas (id),
  fecha date not null,
  activado_por uuid references usuarios (id),
  activado_en timestamptz not null default now(),
  primary key (area_id, fecha)
);

alter table dias_extraordinarios enable row level security;

-- ------------------------------------------------------------
-- 1. Calendario con días extraordinarios.
-- ------------------------------------------------------------
create or replace function franja_laborable(p_fecha date, p_turno_tipo_codigo text, p_area_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select franja_laborable(p_fecha, p_turno_tipo_codigo)
    or exists (select 1 from dias_extraordinarios d where d.area_id = p_area_id and d.fecha = p_fecha);
$$;

-- ------------------------------------------------------------
-- 2. Ajustes: se agrega el día extraordinario de la jornada actual.
-- ------------------------------------------------------------
-- Última versión: 20261080090000_turnos_responsable_y_respaldo.sql
create or replace function ajustes_turnos(p_area_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'esquema', a.esquema_turnos,
    'turnos_automaticos', a.turnos_automaticos,
    'dia_extraordinario', exists (
      select 1 from dias_extraordinarios d
      where d.area_id = a.id and d.fecha = (select fecha from turno_de_hora(now() at time zone 'America/Caracas'))
    ),
    'dia_extraordinario_fecha', (select fecha from turno_de_hora(now() at time zone 'America/Caracas'))
  )
  from areas a where a.codigo = p_area_codigo;
$$;

grant execute on function ajustes_turnos(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Prender / apagar el día extraordinario de la jornada actual.
-- ------------------------------------------------------------
create or replace function guardar_dia_extraordinario(p_usuario text, p_area_codigo text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_fecha date;
  v_usuario_id uuid;
begin
  if not tiene_permiso(p_usuario, 'ESQUEMA_TURNOS') then
    raise exception 'No tienes permiso para cambiar los días extraordinarios.';
  end if;
  select id into v_area_id from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Área % no existe', p_area_codigo;
  end if;
  select fecha into v_fecha from turno_de_hora(now() at time zone 'America/Caracas');
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  if p_activo then
    insert into dias_extraordinarios (area_id, fecha, activado_por) values (v_area_id, v_fecha, v_usuario_id)
    on conflict (area_id, fecha) do nothing;
    if not found then
      return;
    end if;
  else
    delete from dias_extraordinarios where area_id = v_area_id and fecha = v_fecha;
    if not found then
      return;
    end if;
  end if;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'dia_extraordinario', v_area_id::text, 'Comenzar Turno',
    case when p_activo then 'Marcó la jornada del ' || v_fecha || ' como día extraordinario en ' || p_area_codigo
         else 'Quitó el día extraordinario del ' || v_fecha || ' en ' || p_area_codigo end,
    jsonb_build_object('dia_extraordinario', not p_activo), jsonb_build_object('dia_extraordinario', p_activo)
  );
end;
$$;

grant execute on function guardar_dia_extraordinario(text, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Respaldo: el calendario cuenta los días extraordinarios.
-- ------------------------------------------------------------
-- Última versión: 20261108090000_relevo_temprano_pasa_al_turno_siguiente.sql
-- Cambios: el día extraordinario entra solo a la continuidad (ver v_extra).
create or replace function relevo_de_respaldo_en(p_ahora timestamp, p_area_codigo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamp := p_ahora;
  v_franja record;
  v_previa record;
  v_vencio boolean;
  v_area record;
  v_abierto turnos;
  v_tipo_abierto text;
  v_grupo text;
  v_continua boolean;
  v_extra boolean;
  v_nuevo uuid;
begin
  select * into v_franja from turno_de_hora(v_ahora);
  select * into v_previa from turno_de_hora(v_franja.inicio - interval '1 minute');
  v_vencio := v_ahora >= v_franja.inicio + interval '30 minutes';

  for v_area in
    select id, codigo, esquema_turnos from areas
    where (p_area_codigo is null and turnos_automaticos and codigo <> 'PRUEBAS') or codigo = p_area_codigo
  loop
    v_abierto := null;
    v_tipo_abierto := null;
    select t.* into v_abierto from turnos t
    where t.area_id = v_area.id and t.estado = 'ABIERTO'
    order by t.created_at desc limit 1;
    if v_abierto.id is not null then
      select codigo into v_tipo_abierto from turno_tipos where id = v_abierto.turno_tipo_id;
    end if;

    -- 12x12 (20261106): desde las 19:30, si no hay un T2 de la noche (abierto
    -- desde las 17:00), se abre sin responsable. abrir_turno cierra el T2 del
    -- día si sigue abierto, entregando las corridas; su acta queda pendiente.
    -- Calendario normal: en un día extraordinario no se abre sin responsable.
    if v_area.esquema_turnos = '12x12'
       and v_franja.tipo_codigo = 'TURNO_2'
       and v_ahora::time >= time '19:30'
       and franja_laborable(v_franja.fecha, 'TURNO_2')
       and not exists (
         select 1 from turnos t join turno_tipos tt on tt.id = t.turno_tipo_id
         where t.area_id = v_area.id and t.fecha = v_franja.fecha and tt.codigo = 'TURNO_2'
           and t.hora_inicio >= time '17:00'
       )
    then
      v_grupo := grupo_de_rotacion(v_area.codigo, v_franja.fecha, 'TURNO_2');
      if v_grupo is null then
        select g.codigo into v_grupo from turnos t join grupos g on g.id = t.grupo_id
        where t.area_id = v_area.id order by t.created_at desc limit 1;
        perform abrir_turno(usuario_sistema_id(), v_area.codigo, 'TURNO_2', coalesce(v_grupo, 'GRUPO_1'), true);
      else
        v_nuevo := abrir_turno(usuario_sistema_id(), v_area.codigo, 'TURNO_2', v_grupo, true);
        perform fijar_grupo_turno(v_nuevo, v_grupo);
      end if;
      continue;
    end if;

    -- Ya hay un turno abierto de esta franja: nada que hacer.
    if v_abierto.id is not null and v_abierto.fecha = v_franja.fecha and v_tipo_abierto = v_franja.tipo_codigo then
      continue;
    end if;

    -- Abierto por alguien en la hora previa al cambio de franja: es el de esta franja.
    if v_abierto.id is not null and v_abierto.supervisor_id is distinct from usuario_sistema_id()
       and v_abierto.created_at >= (v_franja.inicio - interval '60 minutes') at time zone 'America/Caracas' then
      continue;
    end if;

    -- Franja que no se trabaja (viernes T3, sábado, domingo) ni es día
    -- extraordinario: no se abre nada; el turno que quedó abierto se cierra
    -- 30 min después de su fin.
    if not franja_laborable(v_franja.fecha, v_franja.tipo_codigo, v_area.id) then
      if v_abierto.id is not null and v_vencio then
        perform cerrar_turno_forzado(v_abierto.id, v_ahora);
      end if;
      continue;
    end if;

    -- 12x12: el T1 pasa al T2 (15:00) y el T2 al T3 (22:30) con el mismo
    -- supervisor. No hace falta esperar a que alguien lo inicie.
    v_continua := v_abierto.id is not null
      and v_abierto.esquema = '12x12'
      and v_abierto.supervisor_id is distinct from usuario_sistema_id()
      and v_abierto.fecha = v_franja.fecha
      and (
        (v_tipo_abierto = 'TURNO_1' and v_franja.tipo_codigo = 'TURNO_2')
        or (v_tipo_abierto = 'TURNO_2' and v_franja.tipo_codigo = 'TURNO_3')
      );

    -- Relevo temprano (20261108): quien tomó el turno de la franja anterior
    -- por relevo o asumiéndolo en las 4 h previas al cambio llegó antes para
    -- el turno siguiente; sigue a su nombre.
    v_continua := v_continua or (
      v_abierto.id is not null
      and v_abierto.supervisor_id is distinct from usuario_sistema_id()
      and v_abierto.fecha = v_previa.fecha
      and v_tipo_abierto = v_previa.tipo_codigo
      and exists (
        select 1 from turno_responsables r
        where r.turno_id = v_abierto.id
          and r.usuario_id = v_abierto.supervisor_id
          and r.hasta is null
          and r.motivo in ('RELEVO', 'ASUMIR')
          and r.desde >= (v_franja.inicio - interval '4 hours') at time zone 'America/Caracas'
      )
    );

    -- Día extraordinario (20261112): la franja solo se trabaja por el
    -- interruptor. Sigue quien ya está (continuidad); si no, como en una
    -- franja no laborable: nada de abrir sin responsable.
    v_extra := not franja_laborable(v_franja.fecha, v_franja.tipo_codigo);
    if v_extra and not v_continua then
      if v_abierto.id is not null and v_vencio then
        perform cerrar_turno_forzado(v_abierto.id, v_ahora);
      end if;
      continue;
    end if;

    if not v_continua and not v_vencio then
      continue;
    end if;

    -- Un turno de esta franja ya se abrió y se finalizó: no se reabre.
    if v_abierto.id is null and exists (
      select 1 from turnos t join turno_tipos tt on tt.id = t.turno_tipo_id
      where t.area_id = v_area.id and t.fecha = v_franja.fecha and tt.codigo = v_franja.tipo_codigo
    ) then
      continue;
    end if;

    v_grupo := grupo_de_rotacion(v_area.codigo, v_franja.fecha, v_franja.tipo_codigo);

    if v_continua then
      v_nuevo := abrir_turno(v_abierto.supervisor_id, v_area.codigo, v_franja.tipo_codigo, coalesce(v_grupo, 'GRUPO_1'), true);
      -- Mismo supervisor, mismos tanques y líneas: no repite la revisión de inicio.
      update recepcion_tanques
      set confirmado_inicio_en = now(), confirmado_inicio_por = v_abierto.supervisor_id
      where turno_id = v_nuevo and confirmado_inicio_en is null;
      update turno_lineas
      set confirmado_inicio_en = now(), confirmado_inicio_por = v_abierto.supervisor_id
      where turno_id = v_nuevo and activa and confirmado_inicio_en is null;
    else
      -- Sin rotación: grupo provisorio (el del último turno), pendiente hasta que lo asuman.
      if v_grupo is null then
        select g.codigo into v_grupo from turnos t join grupos g on g.id = t.grupo_id
        where t.area_id = v_area.id order by t.created_at desc limit 1;
        perform abrir_turno(usuario_sistema_id(), v_area.codigo, v_franja.tipo_codigo, coalesce(v_grupo, 'GRUPO_1'), true);
        continue;
      end if;
      v_nuevo := abrir_turno(usuario_sistema_id(), v_area.codigo, v_franja.tipo_codigo, v_grupo, true);
    end if;

    if v_grupo is not null then
      perform fijar_grupo_turno(v_nuevo, v_grupo);
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 5. Programación semanal: lo producido en un día extraordinario.
-- ------------------------------------------------------------
-- Última versión: 20261110790000_programacion_semanal.sql. La semana sigue
-- siendo de lunes a viernes; lo producido un sábado o domingo marcado como
-- día extraordinario se devuelve también (la pantalla lo muestra aparte).
create or replace function programacion_semanal_de(p_area_codigo text, p_desde date, p_hasta date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with area as (
    select id from areas where codigo = p_area_codigo
  ),
  rango as (
    select date_trunc('week', p_desde)::date as desde, (date_trunc('week', p_hasta)::date + 4) as hasta
  ),
  items as (
    select ps.*
    from programacion_semana ps, area, rango
    where ps.area_id = area.id and ps.semana between rango.desde and rango.hasta
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'semana', i.semana,
        'sabor_id', i.sabor_id,
        'sabor_nombre', sabor_display(s.nombre, f.nombre),
        'presentacion_id', i.presentacion_id,
        'presentacion_ml', p.volumen_ml,
        'cajas_plan', i.cajas_plan
      ) order by i.semana, i.creado_en)
      from items i
      join sabores s on s.id = i.sabor_id
      left join familias_producto f on f.id = s.familia_id
      join presentaciones p on p.id = i.presentacion_id
    ), '[]'::jsonb),
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', d.item_id,
        'fecha', d.fecha,
        'estado', d.estado,
        'linea_codigo', l.codigo
      ) order by d.fecha)
      from programacion_semana_dia d
      join items i on i.id = d.item_id
      left join lineas l on l.id = d.linea_id
    ), '[]'::jsonb),
    'producido', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha', x.fecha,
        'sabor_id', x.sabor_id,
        'presentacion_id', x.presentacion_id,
        'cajas', x.cajas
      ))
      from (
        select t.fecha, pt.sabor_id, pt.presentacion_id,
               sum(pt.paletas * pt.cajas_x_paleta + pt.cajas_sueltas)::bigint as cajas
        from producto_terminado pt
        join turnos t on t.id = pt.turno_id, area, rango
        where t.area_id = area.id
          and t.fecha between rango.desde and rango.hasta + 2
          and (extract(isodow from t.fecha) between 1 and 5 or exists (select 1 from dias_extraordinarios de where de.area_id = area.id and de.fecha = t.fecha))
          and pt.sabor_id is not null
        group by t.fecha, pt.sabor_id, pt.presentacion_id
      ) x
    ), '[]'::jsonb),
    'diario_viejo', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha', pd.fecha,
        'sabor_id', pd.sabor_id,
        'sabor_nombre', sabor_display(s.nombre, f.nombre),
        'presentacion_id', pd.presentacion_id,
        'presentacion_ml', p.volumen_ml,
        'cajas_plan', pd.cajas_plan
      ) order by pd.fecha)
      from programacion_dia pd
      join sabores s on s.id = pd.sabor_id
      left join familias_producto f on f.id = s.familia_id
      join presentaciones p on p.id = pd.presentacion_id, area, rango
      where pd.area_id = area.id
        and pd.fecha between rango.desde and rango.hasta
        and not exists (
          select 1 from programacion_semana ps
          where ps.area_id = area.id and ps.semana = date_trunc('week', pd.fecha)::date
        )
    ), '[]'::jsonb)
  );
$$;
grant execute on function programacion_semanal_de(text, date, date) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. Los supervisores también manejan 12x12 y Día extraordinario.
-- ------------------------------------------------------------
-- Los permisos se releen al abrir la app (perfil_sesion): no hace falta
-- volver a entrar, solo recargar.
insert into rol_permisos (rol_id, permiso_codigo)
select r.id, 'ESQUEMA_TURNOS' from roles r where r.codigo = 'SUPERVISOR'
on conflict do nothing;

update permisos set nombre = 'Cambiar esquema de turnos (3x8 / 12x12) y día extraordinario'
where codigo = 'ESQUEMA_TURNOS';
