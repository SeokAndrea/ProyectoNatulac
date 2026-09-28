-- Prueba manual del interruptor 12x12 (migración 20261085) — correr con psql.
-- Todo dentro de begin/rollback: no deja nada. Usa el Área de Pruebas.
--
--   psql "$DATABASE_URL" -f scripts/test-esquema.sql
--
-- Verifica:
--   1. Encender el 12x12 se aplica al turno abierto (no solo al próximo).
--   2. Apagarlo también.
--   3. Los turnos cerrados no cambian.

begin;

do $$
declare
  v_sup uuid;
  v_cerrado uuid;
  v_abierto uuid;
begin
  update turnos set estado = 'CERRADO', fecha = fecha - 30 where area_id = (select id from areas where codigo = 'PRUEBAS');

  insert into usuarios (usuario, password_hash, nombre) values ('e_sup', 'x', 'Sup E'), ('e_jefe', 'x', 'Jefe E');
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, r.id, (select id from areas where codigo = 'PRUEBAS')
  from usuarios u join roles r on r.codigo = case when u.usuario = 'e_sup' then 'SUPERVISOR' else 'JEFE_PRODUCCION' end
  where u.usuario in ('e_sup', 'e_jefe');
  select id into v_sup from usuarios where usuario = 'e_sup';

  -- Punto de partida conocido: 3x8, un turno cerrado y uno abierto.
  perform guardar_esquema_turnos('e_jefe', 'PRUEBAS', '3x8');
  v_cerrado := abrir_turno(v_sup, 'PRUEBAS', 'TURNO_1', 'GRUPO_1', false);
  v_abierto := abrir_turno(v_sup, 'PRUEBAS', 'TURNO_2', 'GRUPO_1', false);
  assert (select estado from turnos where id = v_cerrado) = 'CERRADO', '0 el primero quedó cerrado';

  -- 1
  perform guardar_esquema_turnos('e_jefe', 'PRUEBAS', '12x12');
  assert (select esquema from turnos where id = v_abierto) = '12x12', '1 se aplica al turno abierto';
  -- 3
  assert (select esquema from turnos where id = v_cerrado) = '3x8', '3 el cerrado no cambia';
  -- 2
  perform guardar_esquema_turnos('e_jefe', 'PRUEBAS', '3x8');
  assert (select esquema from turnos where id = v_abierto) = '3x8', '2 apagarlo también se aplica';

  raise notice 'OK: interruptor 12x12';
end;
$$;

rollback;
