-- ============================================================
-- AJUSTAR PREPARACIÓN: sumar jugo/agua al volumen antes de liberar
-- ============================================================
-- Antes de liberar un lote, a veces se le agrega jugo o agua para
-- llegar al volumen real del tanque. Hoy eso se anota en
-- preparaciones.agua pero NO entra al volumen: volumen_l /
-- volumen_inicial_l quedan en tambores × volumen_por_tambor, cortos.
-- Eso infla la merma de semielaborado y hace que el chequeo
-- "Σ PT del lote ≤ volumen preparado" dé falsos positivos
-- (ver plan-rework-auditoria.md §7).
--
-- Regla (decisión del usuario): el ajuste es litros que suman al
-- volumen, 1:1. Mientras el lote NO está liberado, cada ajuste sube
-- volumen_l y volumen_inicial_l por el mismo monto (todavía no se
-- consumió nada). Al liberar, VI queda congelado y no se ajusta más.
--
-- Cada ajuste deja una fila en preparaciones_ajuste_volumen (para el
-- acta, la auditoría y "de qué está hecho el lote").
--
-- Pendiente aparte (no acá): que iniciar_preparacion sume el p_agua
-- inicial al volumen. Depende de si sabores.volumen ya incluye la
-- dilución estándar — sin confirmar.
-- ============================================================

create table preparaciones_ajuste_volumen (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references preparaciones (id) on delete cascade,
  turno_id uuid references turnos (id) on delete set null,
  litros numeric not null,
  detalle text,
  usuario_id uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now()
);

alter table preparaciones_ajuste_volumen enable row level security;
create index preparaciones_ajuste_volumen_lote_idx on preparaciones_ajuste_volumen (lote_id);

-- ------------------------------------------------------------
-- ajustar_preparacion(): suma litros al lote SI todavía no se liberó.
-- ------------------------------------------------------------
create or replace function ajustar_preparacion(
  p_usuario text,
  p_lote_id uuid,
  p_litros numeric,
  p_detalle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
begin
  if p_litros is null or p_litros <= 0 then
    raise exception 'El ajuste tiene que ser un número de litros mayor a 0.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_lote from preparaciones where id = p_lote_id;

  if v_lote.id is null then
    raise exception 'Esa preparación no existe.';
  end if;
  if v_lote.liberado_en is not null then
    raise exception 'El lote ya está liberado — no se le pueden sumar ajustes.';
  end if;
  if v_lote.cerrado_en is not null then
    raise exception 'El lote ya está cerrado.';
  end if;

  update preparaciones
  set volumen_l = coalesce(volumen_l, 0) + p_litros,
      volumen_inicial_l = coalesce(volumen_inicial_l, 0) + p_litros
  where id = p_lote_id;

  insert into preparaciones_ajuste_volumen (lote_id, turno_id, litros, detalle, usuario_id)
  values (p_lote_id, v_lote.turno_id, p_litros, nullif(trim(coalesce(p_detalle, '')), ''), v_usuario_id);

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'preparaciones', p_lote_id::text, 'Preparación',
    format('Ajuste de volumen · Tanque %s%s · +%s L%s',
           v_lote.numero_tanque,
           coalesce(' · Lote ' || v_lote.lote, ''),
           p_litros,
           coalesce(' (' || nullif(trim(coalesce(p_detalle, '')), '') || ')', '')),
    jsonb_build_object('volumen_l', v_lote.volumen_l, 'volumen_inicial_l', v_lote.volumen_inicial_l),
    jsonb_build_object('volumen_l', coalesce(v_lote.volumen_l, 0) + p_litros, 'volumen_inicial_l', coalesce(v_lote.volumen_inicial_l, 0) + p_litros)
  );

  return turno_json(v_lote.turno_id);
end;
$$;

grant execute on function ajustar_preparacion(text, uuid, numeric, text) to anon, authenticated;
