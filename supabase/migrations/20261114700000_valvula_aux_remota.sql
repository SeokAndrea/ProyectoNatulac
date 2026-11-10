-- ============================================================
-- CONTADOR DE AGUA: abrir y cerrar las válvulas auxiliares desde la app
-- ============================================================
-- Alexander, 2026-10-30. Automatización creó DB_COMANDOS (DB9) con
-- Valv_Aux_Tank1..3 (X0.0-X0.2); la HMI escribe el mismo bit, así app y
-- tablero quedan sincronizados. La app no escribe al PLC: le manda la orden
-- al plc-bridge, y el bridge, antes de escribir, llama a
-- autorizar_valvula_aux() con la credencial de la sesión (header x-sesion).
--
--   * Permiso VALVULA_AUX: lo trae el puesto Supervisor; a otra persona se le
--     da como permiso extra desde Personal.
--   * Cada orden queda en la auditoría (quién, qué tanque, abrir/cerrar).
--     Si la válvula de verdad cambió lo dice el registro del bridge.
-- ============================================================

insert into permisos (codigo, nombre, tema) values ('VALVULA_AUX', 'Abrir y cerrar las válvulas auxiliares (Contador de Agua)', 'DATOS')
on conflict (codigo) do nothing;

-- Desde los puestos (20261113990000) el permiso sale del puesto, no del rol.
insert into puesto_permisos (puesto_id, permiso_codigo)
select p.id, 'VALVULA_AUX' from puestos p
where p.codigo = 'SUPERVISOR'
on conflict do nothing;

create or replace function autorizar_valvula_aux(
  p_usuario text,
  p_tanque integer,
  p_abrir boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if not tiene_permiso(p_usuario, 'VALVULA_AUX') then
    raise exception 'No tienes permiso para accionar las válvulas auxiliares.';
  end if;
  if p_tanque is null or p_tanque not between 1 and 3 or p_abrir is null then
    raise exception 'Orden de válvula no válida.';
  end if;
  select nombre into v_nombre from usuarios where usuario = lower(p_usuario) and activo;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'valvula_aux', 'tanque-' || p_tanque, 'Contador de Agua',
    format('Ordenó %s la válvula auxiliar del Tanque %s', case when p_abrir then 'abrir' else 'cerrar' end, p_tanque),
    jsonb_build_object('abierta', not p_abrir),
    jsonb_build_object('abierta', p_abrir)
  );

  return jsonb_build_object('usuario', lower(p_usuario), 'nombre', coalesce(v_nombre, lower(p_usuario)));
end;
$$;

grant execute on function autorizar_valvula_aux(text, integer, boolean) to anon, authenticated;

select * from asegurar_control_usuario();
