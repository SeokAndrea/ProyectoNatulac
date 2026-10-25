-- ============================================================
-- corrida_produjo() sin producto_terminado.cajas_retenidas
-- ============================================================
-- 20261037090000 borró la columna (el producto retenido ya no se usa) y
-- 20261104090000 la volvió a leer en corrida_produjo(). Al ser una función
-- SQL, falla apenas se llama ("column pt.cajas_retenidas does not exist"):
-- activar_linea la usa en la guarda antiduplicados, así que volver a activar
-- una línea con un lote que ya corrió en el turno daba ese error en vez del
-- aviso. Misma regla de antes, sin la columna: una corrida con PT cargado
-- produjo si tiene paletas o cajas sueltas; sin PT, si ya se terminó o se
-- entregó.
-- ============================================================

create or replace function corrida_produjo(p_turno_linea_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from producto_terminado pt where pt.turno_linea_id = tl.id) then
      exists (
        select 1 from producto_terminado pt
        where pt.turno_linea_id = tl.id
          and (pt.paletas > 0 or pt.cajas_sueltas > 0)
      )
    else tl.lote_terminado_en is not null or tl.entregada_en is not null
  end
  from turno_lineas tl
  where tl.id = p_turno_linea_id;
$$;

revoke execute on function corrida_produjo(uuid) from public, anon, authenticated;
