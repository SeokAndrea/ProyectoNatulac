-- ENSAYO (se puede borrar): aplica la migración 20261089 (área Calidad) + chequeos y DESHACE todo.
-- Pegar entero en Supabase → SQL Editor → Run. SIEMPRE termina en error (a propósito, para deshacer todo):
--   'ENSAYO OK: ...'  => funciona, ya se puede hacer db push.
--   cualquier otro error => algo falla; no quedó nada aplicado.
-- Requiere la 20261088 ya aplicada (usa el rol Supervisor de Calidad).

begin;

-- ===================== MIGRACIÓN 20261089090000_area_calidad.sql =====================
-- (pegar abajo el contenido de supabase/migrations/20261089090000_area_calidad.sql si cambia)

insert into areas (codigo, nombre) values ('CALIDAD', 'Calidad')
on conflict (codigo) do nothing;

create or replace function fn_rol_area_calidad()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
begin
  select codigo into v_rol from roles where id = new.rol_id;
  select codigo into v_area from areas where id = new.area_id;

  if v_area = 'CALIDAD' and v_rol not in ('CALIDAD', 'SUPERVISOR_CALIDAD') then
    raise exception 'En el área Calidad solo puede haber Analista de Calidad o Supervisor de Calidad.';
  end if;
  if v_rol in ('CALIDAD', 'SUPERVISOR_CALIDAD') and coalesce(v_area, '') not in ('CALIDAD', 'PRUEBAS') then
    raise exception 'El Analista y el Supervisor de Calidad van en el área Calidad (o en Pruebas para probar).';
  end if;
  return new;
end;
$$;

-- Si la migración ya está aplicada, se vuelve a crear igual (el ensayo sirve para revisar lo que ya está en el servidor).
drop trigger if exists trg_rol_area_calidad on usuario_roles;
create trigger trg_rol_area_calidad
before insert or update of rol_id, area_id on usuario_roles
for each row execute function fn_rol_area_calidad();

create or replace function turno_activo_de(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_area_id uuid;
  v_turno_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  if v_usuario_id is null then
    return null;
  end if;

  select ur.area_id into v_area_id
  from usuario_roles ur
  where ur.usuario_id = v_usuario_id
  limit 1;

  -- Sin área (Super Admin) o área Calidad (apoyo): el turno de Aséptico.
  if v_area_id is null or v_area_id = (select id from areas where codigo = 'CALIDAD') then
    select id into v_area_id from areas where codigo = 'ASEPTICO';
  end if;

  select t.id into v_turno_id
  from turnos t
  where t.area_id = v_area_id and t.estado = 'ABIERTO'
  order by t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

-- ===================== CHEQUEOS =====================
do $$
declare
  v_cal uuid := (select id from areas where codigo = 'CALIDAD');
  v_asep uuid := (select id from areas where codigo = 'ASEPTICO');
  v_pr uuid := (select id from areas where codigo = 'PRUEBAS');
  v_u uuid;
  v_turno_asep uuid;
  v_j jsonb;
begin
  if v_cal is null then
    raise exception 'FALLA 1: no se creó el área Calidad';
  end if;

  insert into usuarios (usuario, password_hash, nombre) values
    ('ens_c1', 'x', 'Analista'), ('ens_c2', 'x', 'Sup Calidad'), ('ens_c3', 'x', 'Supervisor'), ('ens_c4', 'x', 'Analista Asep');

  -- 2. Válidos: Analista en Calidad, Supervisor de Calidad en Pruebas
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select (select id from usuarios where usuario = 'ens_c1'), (select id from roles where codigo = 'CALIDAD'), v_cal;
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select (select id from usuarios where usuario = 'ens_c2'), (select id from roles where codigo = 'SUPERVISOR_CALIDAD'), v_pr;

  -- 3. Supervisor de producción en el área Calidad: no
  begin
    insert into usuario_roles (usuario_id, rol_id, area_id)
    select (select id from usuarios where usuario = 'ens_c3'), (select id from roles where codigo = 'SUPERVISOR'), v_cal;
    raise exception 'FALLA 3: dejó un Supervisor en el área Calidad';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;

  -- 4. Analista de Calidad en Aséptico: no
  begin
    insert into usuario_roles (usuario_id, rol_id, area_id)
    select (select id from usuarios where usuario = 'ens_c4'), (select id from roles where codigo = 'CALIDAD'), v_asep;
    raise exception 'FALLA 4: dejó un Analista de Calidad en Aséptico';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;

  -- 5. Editar: pasar al analista del área Calidad a rol Supervisor: no
  select id into v_u from usuarios where usuario = 'ens_c1';
  begin
    update usuario_roles set rol_id = (select id from roles where codigo = 'SUPERVISOR') where usuario_id = v_u;
    raise exception 'FALLA 5: cambió a Supervisor dentro del área Calidad';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;

  -- 6. El área Calidad ve el turno abierto de Aséptico
  select id into v_turno_asep from turnos where area_id = v_asep and estado = 'ABIERTO' order by created_at desc limit 1;
  v_j := turno_activo_de('ens_c1');
  if (v_j ->> 'id')::uuid is distinct from v_turno_asep then
    raise exception 'FALLA 6: el área Calidad debería ver el turno abierto de Aséptico';
  end if;
end;
$$;

do $$
begin
  raise exception 'ENSAYO OK: la migración 20261089 funciona (6 chequeos). No quedó nada aplicado.';
end;
$$;

rollback;
