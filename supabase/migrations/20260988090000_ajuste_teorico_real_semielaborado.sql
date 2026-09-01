-- ============================================================
-- SEMIELABORADO: registrar la diferencia TEÓRICO vs. REAL
-- ============================================================
-- Cuando se corrige a mano el volumen de un lote (Corregir, mismo
-- sabor+lote), el sistema mueve volumen_inicial_l y volumen_l por el
-- mismo delta (ver 20260956) — esa es la relectura física del tanque:
-- "el sistema decía 7.380 L, pero de verdad quedan 4.300". Ese delta
-- (litros que quedaron "en el aire") se perdía dentro de
-- volumen_inicial_l y no quedaba registrado en ningún lado.
--
-- Ahora cada corrección de ese tipo deja una fila en
-- preparaciones_ajuste con el volumen teórico, el real y la diferencia.
-- ============================================================

create table preparaciones_ajuste (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references preparaciones (id) on delete cascade,
  turno_id uuid references turnos (id),
  volumen_teorico numeric,   -- lo que el sistema tenía antes de corregir
  volumen_real numeric,      -- lo que se tipeó al corregir
  diferencia numeric,        -- real − teórico (negativo = faltante, litros "al aire")
  usuario_id uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now()
);

alter table preparaciones_ajuste enable row level security;
create index preparaciones_ajuste_lote_idx on preparaciones_ajuste (lote_id);

-- Trigger: se dispara SOLO cuando una corrección movió a la vez
-- volumen_inicial_l y volumen_l (el caso "Corregir mismo lote").
-- registrar_producto_terminado sólo toca volumen_l → no dispara.
create or replace function registrar_ajuste_preparacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.volumen_inicial_l is distinct from old.volumen_inicial_l
     and new.volumen_l is distinct from old.volumen_l then
    insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
    values (
      new.id,
      new.turno_id,
      old.volumen_l,
      new.volumen_l,
      coalesce(new.volumen_l, 0) - coalesce(old.volumen_l, 0),
      new.usuario_id
    );
  end if;
  return null;
end;
$$;

create trigger registrar_ajuste_preparacion_trg
after update on preparaciones
for each row execute function registrar_ajuste_preparacion();

-- Lectura: los ajustes de los lotes que tocó alguna corrida del turno
-- (mismo criterio que mermaSemielaboradoTurno en el frontend).
create or replace function ajustes_semielaborado_turno(p_turno_id uuid)
returns table (
  lote text,
  sabor text,
  volumen_teorico numeric,
  volumen_real numeric,
  diferencia numeric,
  usuario_nombre text,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    p.lote,
    coalesce(sabor_display(s.nombre, f.nombre), '—'),
    a.volumen_teorico,
    a.volumen_real,
    a.diferencia,
    u.nombre,
    a.creado_en
  from preparaciones_ajuste a
  join preparaciones p on p.id = a.lote_id
  left join sabores s on s.id = p.sabor_id
  left join familias_producto f on f.id = s.familia_id
  left join usuarios u on u.id = a.usuario_id
  where a.lote_id in (
    select distinct tl.lote_id
    from turno_lineas tl
    where tl.turno_id = p_turno_id and tl.lote_id is not null
  )
  order by a.creado_en;
end;
$$;

grant execute on function ajustes_semielaborado_turno(uuid) to anon, authenticated;
