-- ============================================================
-- HARDCLEAN: borrar todos los turnos del área de PRUEBAS
-- ============================================================
-- El área 'PRUEBAS' ya está aislada del resto del sistema desde
-- 20260922090000_aislar_area_pruebas.sql (estado_planta_actual,
-- turno_de_fecha_tipo y estadisticas_produccion la excluyen salvo que
-- se pida a propósito) — se usa como sandbox para probar cosas sin
-- afectar datos reales. Con el tiempo acumula turnos/lotes/corridas de
-- prueba que ya no sirven de nada.
--
-- A diferencia de eliminar_turno() (que solo deja borrar turnos
-- CERRADOS, protección pensada para áreas reales), acá se borra TODO
-- lo de PRUEBAS sin esa restricción — incluido cualquier turno que
-- haya quedado ABIERTO — porque es sandbox y el objetivo es dejarlo
-- en cero. turnos tiene "on delete cascade" hacia turno_lineas,
-- recepcion_tanques, contadores, producto_terminado y preparaciones,
-- así que un solo DELETE alcanza.
-- ============================================================

delete from turnos
where area_id = (select id from areas where codigo = 'PRUEBAS');
