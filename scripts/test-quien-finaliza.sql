-- Prueba manual de quién finaliza el turno (migración 20261083) — correr con psql.
-- Todo dentro de begin/rollback: no deja nada. Usa un turno inventado en Aséptico
-- (insert directo, sin abrir_turno: no toca el turno real abierto).
--
--   psql "$DATABASE_URL" -f scripts/test-quien-finaliza.sql
--
-- Verifica:
--   1. El responsable puede.
--   2. Otro supervisor no.
--   3. Un jefe (TURNO_CORREGIR) sí.
--   4. Un turno sin responsable hay que asumirlo antes.
--   5. La versión vieja sin usuario ya no existe y cerrar_turno_forzado no es público.

begin;

do $$
declare
  v_resp uuid;
  v_turno uuid;
begin
  insert into usuarios (usuario, password_hash, nombre) values ('f_resp', 'x', 'Responsable'), ('f_otro', 'x', 'Otro'), ('f_jefe', 'x', 'Jefe');
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, r.id, (select id from areas where codigo = 'ASEPTICO')
  from usuarios u join roles r on r.codigo = case when u.usuario = 'f_jefe' then 'JEFE_PRODUCCION' else 'SUPERVISOR' end
  where u.usuario in ('f_resp', 'f_otro', 'f_jefe');
  select id into v_resp from usuarios where usuario = 'f_resp';

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id)
  values ('A_TEST_FINALIZA', (select id from areas where codigo = 'ASEPTICO'), v_resp,
          (select id from turno_tipos where codigo = 'TURNO_1'), (select id from grupos where codigo = 'GRUPO_1'))
  returning id into v_turno;

  -- 1
  perform exigir_puede_finalizar('f_resp', v_turno);
  -- 2
  begin
    perform exigir_puede_finalizar('f_otro', v_turno);
    raise exception 'FALLA 2: otro supervisor pudo finalizar';
  exception when others then
    assert sqlerrm like 'Solo Responsable (responsable del turno)%', '2 mensaje: ' || sqlerrm;
  end;
  -- 3
  perform exigir_puede_finalizar('f_jefe', v_turno);
  -- 4
  update turnos set supervisor_id = usuario_sistema_id() where id = v_turno;
  begin
    perform exigir_puede_finalizar('f_jefe', v_turno);
    raise exception 'FALLA 4: se finalizó un turno sin responsable';
  exception when others then
    assert sqlerrm like 'Este turno no tiene responsable%', '4 mensaje: ' || sqlerrm;
  end;
  -- 5
  assert not exists (select 1 from pg_proc where proname = 'finalizar_turno' and pronargs = 1), '5a versión vieja borrada';
  assert not has_function_privilege('anon', 'cerrar_turno_forzado(uuid, timestamp)', 'execute'), '5b cerrar_turno_forzado no es público';

  raise notice 'OK: quién finaliza el turno';
end;
$$;

rollback;
