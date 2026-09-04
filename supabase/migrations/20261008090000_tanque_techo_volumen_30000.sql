-- ============================================================
-- TANQUES: SUBIR EL TECHO DE volumen_l DE 20.000 A 30.000 L
-- ============================================================
-- El CHECK `volumen_l <= 20000` (capacidad NOMINAL del tanque) vive en
-- dos tablas: `preparaciones` (20260910090000) y `recepcion_tanques`
-- (20260825090000). transferir_tanque() suma origen + destino en un
-- solo tanque (los tres modos: LIMPIO/LIQUIDO/LOTE), sobre las dos
-- tablas, así que cuando el total pasaba de 20.000 la transferencia
-- fallaba por violación de CHECK. El workaround era cerrar la corrida
-- con una ENTREGA PARCIAL de PT y arrancar otra sobre el tanque
-- rellenado — partiendo el consumo del lote en dos tramos.
--
-- Con margen hasta 30.000 el operador rellena el tanque y sigue la
-- MISMA corrida: un lote, un tramo de consumo, sin entrega parcial.
--
-- 30.000 y no "sin tope": la capacidad física real sigue siendo 20.000;
-- 30.000 es un colchón para el relleno puntual (ej. +2.000 L sobre un
-- tanque a 15.000) sin dejar pasar un error de tipeo tipo 200000.
--
-- ALCANCE: sólo Transferir aprovecha el margen. Las validaciones del
-- front en Iniciar Preparación (TANK_CAPACITY, EstadoPlantaTabs.tsx) y
-- en editar tanque a mano (TanqueEditForm.tsx) SIGUEN topeadas en
-- 20.000 — no se tocan. En el Panel, el número de litros muestra el
-- valor real (puede decir "más de 20.000 L") y el dibujo del líquido ya
-- venía clampeado a 100% (TanqueVisual: Math.min(100, ...)), así que
-- nunca desborda el tanque.
--
-- Nota: una transferencia que sume más de 30.000 sigue bloqueada; el
-- front la frena antes con un mensaje claro (TANK_MAX_VOLUMEN). Si
-- aparece ese caso de forma habitual, subir el techo acá y allá.
--
-- Se usa un bloque DO que borra CUALQUIER CHECK sobre la columna
-- volumen_l (no sólo el del nombre por defecto) antes de recrear el
-- nuestro — si el drop fallara en silencio, el CHECK viejo (<= 20000)
-- seguiría ganando y la transferencia seguiría bloqueada sin motivo
-- aparente.
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname in ('preparaciones', 'recepcion_tanques')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%volumen_l%'
  loop
    execute format('alter table %I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;

alter table preparaciones add constraint preparaciones_volumen_l_check
  check (volumen_l is null or (volumen_l >= 0 and volumen_l <= 30000));

alter table recepcion_tanques add constraint recepcion_tanques_volumen_l_check
  check (volumen_l is null or (volumen_l >= 0 and volumen_l <= 30000));
