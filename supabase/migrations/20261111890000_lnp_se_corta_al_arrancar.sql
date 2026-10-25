-- ============================================================
-- LNP AUTOMÁTICO: la LNP de una línea sin programar se corta al arrancar
-- ============================================================
-- Dueña, 2026-10-25. Al marcar «Sin programación» en Líneas, la app anota
-- una LNPE (Línea No Programada / Externa) desde ese momento hasta el fin del
-- turno, con el fin a futuro (como el turno completo, 20261110590000). Así el
-- tiempo de una línea que no se programó queda cubierto solo.
--
-- Si la línea arranca (una corrida activa nueva) o deja de estar «Sin
-- programación», la LNPE que seguía adelante se corta en ese momento: no se
-- cuenta como parado un tiempo que la línea sí trabajó.
-- ============================================================

create or replace function cortar_lnpe_en_curso(p_linea_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update paradas p
  set fin = now()
  from paradas_tipos t
  where t.id = p.tipo_id
    and t.prefijo_planilla = 'LNPE'
    and p.linea_id = p_linea_id
    and p.inicio <= now()
    and p.fin > now();
$$;

create or replace function fn_cortar_lnpe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'turno_lineas' then
    if new.activa then
      perform cortar_lnpe_en_curso(new.linea_id);
    end if;
  elsif old.condicion = 'SIN_PROGRAMACION' and new.condicion is distinct from old.condicion then
    perform cortar_lnpe_en_curso(new.linea_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_turno_lineas_corta_lnpe on turno_lineas;
create trigger trg_turno_lineas_corta_lnpe
after insert on turno_lineas
for each row execute function fn_cortar_lnpe();

drop trigger if exists trg_lineas_estado_corta_lnpe on lineas_estado;
create trigger trg_lineas_estado_corta_lnpe
after update of condicion on lineas_estado
for each row execute function fn_cortar_lnpe();
