-- Arreglo de 20261114890000: "record new has no field sistema_id" al crear una falla.
-- Una sola función servía a dos tablas y plpgsql evaluaba new.sistema_id también
-- sobre catalogo_fallas. Ahora cada tabla tiene su propia función.

create or replace function catalogo_fallas_sin_hijos_en_reservada()
returns trigger
language plpgsql
as $$
begin
  if not new.reservada
     and exists (select 1 from catalogo_subsistemas u where u.id = new.subsistema_id and u.reservada) then
    raise exception 'El subsistema «Sin clasificar» es reservado: ahí solo vive la «Falla nueva».';
  end if;
  return new;
end;
$$;

create or replace function catalogo_subsistemas_sin_hijos_en_reservada()
returns trigger
language plpgsql
as $$
begin
  if not new.reservada
     and exists (select 1 from catalogo_sistemas s where s.id = new.sistema_id and s.reservada) then
    raise exception 'El sistema «General» es reservado: no se le agregan subsistemas.';
  end if;
  return new;
end;
$$;

drop trigger if exists catalogo_fallas_sin_hijos on catalogo_fallas;
create trigger catalogo_fallas_sin_hijos before insert on catalogo_fallas
  for each row execute function catalogo_fallas_sin_hijos_en_reservada();

drop trigger if exists catalogo_subsistemas_sin_hijos on catalogo_subsistemas;
create trigger catalogo_subsistemas_sin_hijos before insert on catalogo_subsistemas
  for each row execute function catalogo_subsistemas_sin_hijos_en_reservada();

drop function if exists catalogo_sin_hijos_en_reservada();
