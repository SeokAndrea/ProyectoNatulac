-- ============================================================
-- ¿POR QUÉ UNA PARADA QUEDÓ SIN LOTE NI SABOR? (solo lectura)
-- ============================================================
-- En el servidor, desde la carpeta del proyecto:
--   bash scripts/aplicar-migracion.sh scripts/revisar-lote-sabor-paradas.sql
--
-- 1. Si el trigger de 20261113090000 está instalado (sin él, solo Parar
--    guardaba lote y sabor).
-- 2. Las paradas de los últimos 3 días sin lote ni sabor, con la corrida que
--    había en la línea al empezar la parada y la siguiente: así se ve si no
--    había nada corriendo (la parada empezó antes de arrancar la línea) o si
--    la corrida estaba y no se tomó.
-- ============================================================

select 'Trigger lote/sabor (20261113090000) instalado' as revision,
       case when exists (select 1 from pg_trigger where tgname = 'paradas_lote_sabor') then 'SÍ' else 'NO' end as resultado;

select l.nombre as linea,
       to_char(p.inicio at time zone 'America/Caracas', 'DD/MM HH24:MI') as inicio,
       left(p.tipo_nombre, 30) as parada,
       p.origen,
       p.pendiente,
       (select to_char(tl.activada_en at time zone 'America/Caracas', 'DD/MM HH24:MI')
               || ' a ' || coalesce(to_char(coalesce(tl.finalizada_en, tl.entregada_en) at time zone 'America/Caracas', 'DD/MM HH24:MI'),
                                    case when tl.activa then 'sigue' else 'sin fin' end)
               || ' · lote ' || coalesce(nullif(btrim(tl.lote), ''), (select pr.lote from preparaciones pr where pr.id = tl.lote_id), '?')
        from turno_lineas tl
        where tl.linea_id = p.linea_id and tl.activada_en <= p.inicio
        order by tl.activada_en desc
        limit 1) as corrida_al_empezar,
       (select to_char(tl.activada_en at time zone 'America/Caracas', 'DD/MM HH24:MI')
               || ' · lote ' || coalesce(nullif(btrim(tl.lote), ''), (select pr.lote from preparaciones pr where pr.id = tl.lote_id), '?')
        from turno_lineas tl
        where tl.linea_id = p.linea_id and tl.activada_en > p.inicio
        order by tl.activada_en
        limit 1) as corrida_siguiente
from paradas p
join lineas l on l.id = p.linea_id
join areas a on a.id = l.area_id and a.codigo <> 'PRUEBAS'
where p.lote is null and p.sabor is null
  and p.inicio > now() - interval '3 days'
order by p.inicio desc
limit 40;
