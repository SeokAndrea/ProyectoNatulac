-- ============================================================
-- RETIRA "CREAR TURNO" (carga manual de turnos viejos)
-- ============================================================
-- Se saca la app "Crear Turno" del sistema (ruta, tarjeta del hub y
-- página). Con ella se van sus RPC — ya no hay forma de llamarlas
-- desde la interfaz y son `security definer` abiertas a anon/authenticated,
-- así que se dropean.
--
-- No toca los turnos que YA se cargaron a mano (siguen en `turnos` con
-- sus filas marcadas `lote = 'ACTA'`); solo se quita la capacidad de
-- crear nuevos. El manejo de 'ACTA' en el resto del código queda para
-- esos datos históricos.
-- ============================================================

drop function if exists crear_turno_manual(text, text, text, date, text, text, time, time, jsonb);
drop function if exists crear_turno_manual(text, text, date, text, text, time, time);
drop function if exists agregar_fila_turno_manual(text, uuid, text, uuid, integer, integer, integer, integer, numeric);
drop function if exists editar_fila_turno_manual(text, uuid, integer, integer, integer, numeric);
