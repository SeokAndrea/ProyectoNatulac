-- ============================================================
-- ACTA DEL TURNO QUE SE CERRÓ SOLO (cron cerrar_turnos_vencidos)
-- ============================================================
-- El PDF del acta se genera con jsPDF — corre en el navegador, nunca
-- en Postgres. Cuando el supervisor cierra su turno a mano (Finalizar
-- Turno) está ahí para generarlo y subirlo. Pero cuando el turno se
-- cierra SOLO (abandonado, lo sella el cron cada 5 min — ver
-- 20261030090000), no hay nadie con el navegador abierto en ese
-- instante: ese turno queda cerrado y sin acta, punto.
--
-- No hay forma de generar el PDF exactamente "en ese momento" sin un
-- render de PDF corriendo en el servidor (Edge Function) — no existe
-- hoy en este proyecto (no hay supabase/functions/). Lo que SÍ se
-- puede hacer sin esa infraestructura nueva: generarlo la PRÓXIMA vez
-- que ese mismo supervisor abra la app (Hub, ver
-- src/lib/actasPendientes.ts) — mismo jsPDF de siempre, con los datos
-- ya congelados del turno cerrado. No es "en el instante", pero
-- tampoco depende de que alguien se acuerde de ir a buscarlo.
--
-- Dos funciones nuevas, acotadas al PROPIO turno del supervisor (no
-- exigen ADMINISTRADOR_AREA/SUPERADMINISTRADOR como turno_detalle()):
--   - mis_turnos_sin_acta(): sus turnos CERRADOS por cierre_automatico
--     que todavía no tienen un acta VIGENTE.
--   - mi_turno_detalle(): el mismo turno_json() de siempre, pero
--     valida "es tu turno" en vez de un rol de auditoría.
-- ============================================================

create or replace function mis_turnos_sin_acta(p_usuario text)
returns table (turno_id uuid, turno_codigo text)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.codigo
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  where u.usuario = lower(p_usuario)
    and t.estado = 'CERRADO'
    and t.cierre_automatico
    and not exists (select 1 from actas a where a.turno_id = t.id and a.estado = 'VIGENTE')
  order by t.fecha desc, t.hora_inicio desc;
$$;

grant execute on function mis_turnos_sin_acta(text) to anon, authenticated;

create or replace function mi_turno_detalle(p_usuario text, p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  if not exists (select 1 from turnos where id = p_turno_id and supervisor_id = v_usuario_id) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function mi_turno_detalle(text, uuid) to anon, authenticated;
