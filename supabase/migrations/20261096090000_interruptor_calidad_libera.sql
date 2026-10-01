-- ============================================================
-- INTERRUPTOR "CALIDAD LIBERA LOS LOTES" DESDE LA APP
-- ============================================================
-- areas.calidad_libera (20261086) solo se podía cambiar con SQL. Ahora el
-- dueño lo prende y apaga desde Edición de Datos, igual que el respaldo
-- automático de turnos (guardar_turnos_automaticos, 20261080). Queda en
-- Auditoría quién lo cambió y cuándo.
-- ============================================================

create or replace function guardar_calidad_libera(p_usuario text, p_area_codigo text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_antes boolean;
begin
  if not es_dueno(p_usuario) then
    raise exception 'Solo el dueño puede cambiar este ajuste.';
  end if;
  select id, calidad_libera into v_area_id, v_antes from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Área % no existe', p_area_codigo;
  end if;
  update areas set calidad_libera = p_activo where id = v_area_id;
  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'calidad_libera', v_area_id::text, 'Edición de Datos',
    case when p_activo then 'Prendió' else 'Apagó' end || ' "Calidad libera los lotes" en ' || p_area_codigo,
    jsonb_build_object('calidad_libera', v_antes), jsonb_build_object('calidad_libera', p_activo)
  );
end;
$$;
grant execute on function guardar_calidad_libera(text, text, boolean) to anon, authenticated;
