-- ============================================================
-- PARADAS: borra una "Presentación No Planificada" mal registrada
-- ============================================================
-- Javier registró en la Línea 1 una "Presentación No Planificada" por el
-- cambio a TB 1000, pero la Línea 1 seguía corriendo TB 500 — la parada no
-- correspondía. Además quedó con ~8 horas de duración (23:54 del día
-- anterior a 07:54 de hoy), casi todo el turno A20260922_T1G1 recién
-- abierto, distorsionando su eficiencia.
-- ============================================================

delete from paradas
where id = '09be3392-d63a-4424-b353-5c89fffe3465'
  and tipo_id = (select id from paradas_tipos where codigo = 'PRESENTACION_NO_PLANIFICADA')
  and turno_id = (select id from turnos where codigo = 'A20260922_T1G1');
