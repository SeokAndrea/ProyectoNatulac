-- ============================================================
-- CORRECCIÓN PUNTUAL: destrabar "Continuar al siguiente lote"
-- ============================================================
-- Caso: turno de Dany, 2026-09-08. La corrida quedó con "terminó el
-- lote" puesto y "Continuar al siguiente lote" corta porque el
-- auto-detect no encuentra el tanque del lote+1, y activar_linea desde
-- Líneas (costura 2) rechaza "ya tiene una corrida en curso".
--
-- Esto hace A MANO la misma transición que hará
-- continuar_siguiente_lote(p_numero_tanque) cuando suba 20261023:
--   * la corrida vieja pasa a ESPERANDO_PT (activa=false,
--     finalizada_en queda NULL) — SIGUE debiendo su Producto Terminado.
--   * nace la corrida del lote siguiente en el tanque que elijas, con
--     la misma config de línea.
-- NO toca ningún tanque, ni volumen_l, ni volumen_inicial_l.
--
-- Plano, sin comandos de psql: pegar en el SQL editor de Supabase.
-- Correr bloque por bloque.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Las corridas activas del turno de Dany. Identificá la que quedó
--    trabada y copiá su turno_linea_id (columna "corrida_id").
--    Ajustá el LIKE del código si hace falta.
-- ------------------------------------------------------------
select tl.id as corrida_id,
       l.codigo as linea,
       tl.lote,
       tl.activa,
       tl.lote_terminado_en,
       tl.finalizada_en,
       tl.activada_en
from turno_lineas tl
join turnos t on t.id = tl.turno_id
join lineas l on l.id = tl.linea_id
where t.codigo like 'A20260908_%'          -- inicial de área + fecha + (opcional) _T?G?
  and tl.activa
order by tl.activada_en desc;


-- ------------------------------------------------------------
-- 2. Tanques del mismo turno que están LISTO y tienen un lote asignado
--    — candidatos para el lote siguiente. Copiá el numero_tanque.
--    (Reemplazá 'PEGAR-CORRIDA-ID' por el corrida_id del paso 1.)
-- ------------------------------------------------------------
select rt.numero_tanque,
       s.nombre as sabor,
       rt.lote,
       rt.condicion,
       rt.volumen_l
from recepcion_tanques rt
left join sabores s on s.id = rt.sabor_id
where rt.turno_id = (select turno_id from turno_lineas where id = 'PEGAR-CORRIDA-ID')
  and rt.condicion = 'LISTO'
  and rt.lote_id is not null
order by rt.numero_tanque;


-- ------------------------------------------------------------
-- 3. Chequeo de seguridad: el tanque elegido NO puede tener ya otra
--    corrida activa ni una detenida sin su PT. Tiene que dar CERO filas.
--    (Reemplazá 'PEGAR-CORRIDA-ID' y 99 = numero_tanque del paso 2.)
-- ------------------------------------------------------------
select tl.id, l.codigo as linea, tl.lote, tl.activa, tl.finalizada_en
from turno_lineas tl
join lineas l on l.id = tl.linea_id
where tl.turno_id = (select turno_id from turno_lineas where id = 'PEGAR-CORRIDA-ID')
  and tl.lote_id = (
    select lote_id from recepcion_tanques
    where turno_id = (select turno_id from turno_lineas where id = 'PEGAR-CORRIDA-ID')
      and numero_tanque = 99
  )
  and tl.id <> 'PEGAR-CORRIDA-ID'
  and (tl.activa or tl.finalizada_en is null);


-- ------------------------------------------------------------
-- 4. Aplicar. Corre dentro de una transacción y termina en ROLLBACK:
--    muestra el ANTES/DESPUÉS sin tocar nada. Si el DESPUÉS es
--    correcto, cambiá `rollback;` por `commit;` y volvé a correr.
--    (Reemplazá 'PEGAR-CORRIDA-ID' — 4 veces — y 99 = numero_tanque.)
-- ------------------------------------------------------------
begin;

-- 4a. La corrida vieja pasa a ESPERANDO_PT.
update turno_lineas
set activa = false
where id = 'PEGAR-CORRIDA-ID' and activa;

-- 4b. Nace la corrida del lote siguiente en el tanque elegido.
insert into turno_lineas (
  turno_id, linea_id, presentacion_id, envases_hora, litros_hora,
  sabor_id, lote, lote_id, activa, activada_en, activada_por
)
select v.turno_id, v.linea_id, v.presentacion_id, v.envases_hora, v.litros_hora,
       rt.sabor_id, rt.lote, rt.lote_id, true, now(), v.activada_por
from turno_lineas v
join recepcion_tanques rt
  on rt.turno_id = v.turno_id and rt.numero_tanque = 99
where v.id = 'PEGAR-CORRIDA-ID';

-- 4c. Antes/después: las corridas de esa línea en el turno.
select tl.id as corrida_id, l.codigo as linea, tl.lote, tl.activa,
       tl.lote_terminado_en, tl.finalizada_en, tl.activada_en
from turno_lineas tl
join lineas l on l.id = tl.linea_id
where tl.linea_id = (select linea_id from turno_lineas where id = 'PEGAR-CORRIDA-ID')
  and tl.turno_id = (select turno_id from turno_lineas where id = 'PEGAR-CORRIDA-ID')
order by tl.activada_en;

rollback;
