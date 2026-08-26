-- ============================================================
-- "CORREGIR" UN TANQUE YA NO DESCONECTA EL DESCUENTO DE LITROS
-- ============================================================
-- cambiar_condicion_tanque() (última versión en
-- 20260927090000_volumen_por_producto_terminado.sql) siempre ponía
-- lote_id = null al guardar, sin importar si el tanque seguía
-- LISTO/STANDBY con el mismo sabor y el mismo lote de antes. "Corregir"
-- (o "Editar" en el paso de Confirmar/Corregir al abrir turno, ver
-- EstadoPlantaTabs.tsx) se usa normalmente solo para ajustar un número
-- (ej. el volumen real medido en el tanque), no para reasignar el
-- tanque a otro lote — pero al poner lote_id en null igual, desconectaba
-- silenciosamente ese tanque del lote (preparaciones) que lo alimenta.
--
-- Consecuencia real: registrar_producto_terminado() resta el delta de
-- litros correctamente del lote (preparaciones.volumen_l), pero el
-- UPDATE que refleja ese nuevo volumen en el tanque visible
-- (recepcion_tanques.volumen_l) filtra por "lote_id = v_lote_id" — con
-- lote_id en null esa fila nunca calza, así que el UPDATE no toca nada
-- y el tanque se queda congelado mostrando el número de antes de
-- Corregir, aunque el descuento sí ocurrió puertas adentro.
--
-- Fix: si antes y después de guardar el tanque sigue LISTO/STANDBY con
-- el MISMO sabor y el MISMO texto de lote, se preserva su lote_id en
-- vez de resetearlo. Si el sabor o el lote cambian (reasignación real
-- a otro lote), lote_id vuelve a null como antes — ahí sí no hay forma
-- de saber a qué preparación corresponde el texto tipeado a mano.
--
-- Además, cuando se preserva el lote_id, el volumen corregido a mano
-- también se escribe en preparaciones.volumen_l — si no, el próximo
-- Producto Terminado volvía a pisar el número recién corregido con el
-- valor viejo que tenía el lote internamente.
-- ============================================================

create or replace function cambiar_condicion_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_condicion text,
  p_sabor_id uuid,
  p_volumen_l numeric,
  p_lote text,
  p_momento text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_actual recepcion_tanques%rowtype;
  v_ultimo_sabor_id uuid;
  v_ultimo_lote text;
  v_lote_id uuid;
  v_mismo_lote boolean;
begin
  if p_momento is not null and p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_ultimo_sabor_id := v_actual.ultimo_sabor_id;
  v_ultimo_lote := v_actual.ultimo_lote;

  if p_condicion = 'SUCIO' and v_actual.condicion in ('LISTO', 'STANDBY') and v_actual.sabor_id is not null then
    v_ultimo_sabor_id := v_actual.sabor_id;
    v_ultimo_lote := v_actual.lote;
  end if;

  v_mismo_lote :=
    v_actual.condicion in ('LISTO', 'STANDBY')
    and p_condicion in ('LISTO', 'STANDBY')
    and v_actual.sabor_id is not distinct from p_sabor_id
    and coalesce(v_actual.lote, '') = coalesce(normalizar_lote(p_lote), '');

  v_lote_id := case when v_mismo_lote then v_actual.lote_id else null end;

  update recepcion_tanques
  set condicion = p_condicion,
      sabor_id = case when p_condicion in ('LISTO', 'STANDBY') then p_sabor_id else null end,
      volumen_l = case when p_condicion in ('LISTO', 'STANDBY') then p_volumen_l else null end,
      lote = case when p_condicion in ('LISTO', 'STANDBY') then normalizar_lote(p_lote) else null end,
      lote_id = v_lote_id,
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote,
      confirmado_inicio_en = case when p_momento = 'INICIO' then now() else confirmado_inicio_en end,
      confirmado_inicio_por = case when p_momento = 'INICIO' then v_usuario_id else confirmado_inicio_por end,
      confirmado_fin_en = case when p_momento = 'FIN' then now() else confirmado_fin_en end,
      confirmado_fin_por = case when p_momento = 'FIN' then v_usuario_id else confirmado_fin_por end
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_lote_id is not null then
    update preparaciones
    set volumen_l = p_volumen_l
    where id = v_lote_id and cerrado_en is null;
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Parche de datos: reconectar tanques que ya quedaron con lote_id en
-- null por este bug, en turnos todavía ABIERTOS — si el tanque sigue
-- LISTO/STANDBY y hay una única preparación abierta (cerrado_en is
-- null) sobre ese mismo número de tanque, es ese lote el que lo estaba
-- alimentando. Se sincroniza también volumen_l contra el de
-- preparaciones de una sola vez acá — si no, el tanque se queda
-- mostrando el número viejo (ej. los 6500 L de manzana) hasta la
-- próxima carga de Producto Terminado sobre esa corrida, que es la
-- única otra que vuelve a escribir recepcion_tanques.volumen_l.
-- ------------------------------------------------------------
update recepcion_tanques rt
set lote_id = prep.id,
    volumen_l = prep.volumen_l
from preparaciones prep
where rt.lote_id is null
  and rt.condicion in ('LISTO', 'STANDBY')
  and rt.turno_id in (select id from turnos where estado = 'ABIERTO')
  and prep.numero_tanque = rt.numero_tanque
  and prep.cerrado_en is null
  and (select count(*) from preparaciones p2 where p2.numero_tanque = rt.numero_tanque and p2.cerrado_en is null) = 1;
