-- ============================================================
-- ÁREA DE PRUEBAS: aislada del resto (misma mecánica de área que ya
-- separa ASEPTICO/VACIO/SERVICIOS_INDUSTRIALES/MANTENIMIENTO), con
-- sus propias 3 líneas y un usuario SUPERVISOR fijo.
-- ============================================================
-- lineas.codigo es único a nivel GLOBAL (constraint
-- lineas_codigo_unique, ver 20260825090000_conectar_turnos.sql), no
-- por área — así que las líneas de pruebas no pueden reusar los
-- códigos LINEA_1/2/3, necesitan códigos propios (LINEA_T1/T2/T3).
-- Se les clonan las velocidades de LINEA_1/2/3 (mismos
-- envases_hora/litros_hora por presentación) para que "Activar
-- línea" tenga opciones de velocidad desde el primer uso.
-- ============================================================

insert into areas (codigo, nombre)
values ('PRUEBAS', 'Área de Pruebas');

insert into lineas (area_id, nombre, codigo)
select a.id, v.nombre, v.codigo
from areas a, (values
  ('LINEA_T1', 'Línea T1 (prueba)'),
  ('LINEA_T2', 'Línea T2 (prueba)'),
  ('LINEA_T3', 'Línea T3 (prueba)')
) as v(codigo, nombre)
where a.codigo = 'PRUEBAS';

insert into velocidades_llenadora (linea_id, presentacion_id, maquina, envases_hora, litros_hora, activo)
select lt.id, v.presentacion_id, v.maquina, v.envases_hora, v.litros_hora, v.activo
from velocidades_llenadora v
join lineas lo on lo.id = v.linea_id
join lineas lt on lt.codigo = replace(lo.codigo, 'LINEA_', 'LINEA_T')
where lo.codigo in ('LINEA_1', 'LINEA_2', 'LINEA_3');

-- Usuario SUPERVISOR fijo del área de pruebas — usuario "pruebas",
-- contraseña "Pruebas2026!" (cambiarla después desde Personal si se
-- quiere algo distinto). Inserción directa (mismo hash que
-- crear_usuario) en vez de llamar a la función, porque crear_usuario
-- exige un p_creador_usuario ya existente con permiso, y esto se
-- corre como script de una sola vez, no como acción de un usuario.
insert into usuarios (usuario, password_hash, nombre)
values ('pruebas', extensions.crypt('Pruebas2026!', extensions.gen_salt('bf')), 'Supervisor de Pruebas');

insert into usuario_roles (usuario_id, rol_id, area_id)
select u.id, r.id, a.id
from usuarios u, roles r, areas a
where u.usuario = 'pruebas' and r.codigo = 'SUPERVISOR' and a.codigo = 'PRUEBAS';
