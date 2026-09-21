-- ============================================================
-- PARADAS: catálogo ordenado por EQUIPO (reestructura)
-- ============================================================
-- Reglas del dueño (2026-09-21):
--   * Solo las paradas PROGRAMADAS tienen tiempo guía.
--   * Las NO PROGRAMADAS y el TIEMPO OCIOSO los carga el supervisor.
--   * Cada falla No programada pertenece a un EQUIPO y lleva su código:
--     prefijo + L# + secuencia (AHL1-1 de Helix). A3 Flex, A3 Compact Flex,
--     Cap, Film Wrapper y Straw llevan el código SIN número de línea (A3F-1).
--   * Los equipos existen en algunas líneas (A3 Flex solo en la 1; A3 Compact
--     Flex en la 2 y 3; Cap en la 1 y 3; Film Wrapper y Straw en la 2 y 3); el
--     resto está en las tres. El supervisor solo ve las fallas de su línea.
--
-- Reemplaza el modelo equipo → subsistema del Sheet (20261063): se borran esos
-- equipos y subsistemas y se cargan los del dueño. La falla de un equipo es un
-- tipo de parada (paradas_tipos.equipo_id), ya no una parada "mecánica" aparte.
-- ============================================================

-- 1. Lo de 20261063 que sale
alter table paradas drop column if exists subsistema_id;
alter table paradas drop column if exists equipo_id;
drop table if exists paradas_subsistemas;
delete from paradas_equipos; -- arrastra paradas_equipos_lineas

-- 2. Tipos: equipo, "código con línea" y tiempo guía solo en Programada
alter table paradas_tipos add column equipo_id uuid references paradas_equipos (id);
alter table paradas_tipos add column codigo_con_linea boolean not null default true;

alter table paradas_tipos drop constraint if exists paradas_tipos_familia_check;
alter table paradas_tipos add constraint paradas_tipos_familia_check check (familia in (
  'PROGRAMADA', 'EXTERNA', 'OPERACIONAL', 'SUMINISTRO_VAPOR', 'SUMINISTRO',
  'ESTERILIZACION', 'PREPARACION', 'CODIFICACION', 'OCIOSO', 'EQUIPO', 'EQUIPO_PROCESO'
));

-- Familias como las nombra el dueño: S = Suministro (incluye la caldera) y
-- EP = Equipo de Proceso (esterilización + preparación). Domino sigue aparte.
update paradas_tipos set familia = 'SUMINISTRO' where familia = 'SUMINISTRO_VAPOR';
update paradas_tipos set familia = 'EQUIPO_PROCESO' where familia in ('ESTERILIZACION', 'PREPARACION');

update paradas_tipos set tiempo_guia_min = null where clase <> 'PROGRAMADA';
alter table paradas_tipos add constraint paradas_tipos_guia_solo_programada
  check (clase = 'PROGRAMADA' or tiempo_guia_min is null);

-- Nombre según la planilla del dueño (OPL1-8).
update paradas_tipos set nombre = 'Falta de Operador de Montacargas' where codigo = 'FALTA_OPERADOR';

-- 3. Equipos, sus líneas (Aséptico), asociación de tipos existentes y fallas nuevas
insert into paradas_equipos (codigo, nombre, orden) values
  ('FLEX_DRINK', 'Flex/Drink', 1),
  ('PROCESOS', 'Procesos', 2),
  ('DOMINO', 'Domino', 3),
  ('CALDERA', 'Caldera', 4),
  ('HIDRO', 'Hidro', 5),
  ('SPCP', 'SPCP', 6),
  ('SPCS', 'SPCS', 7),
  ('COMPRESOR', 'Compresor', 8),
  ('GENERADOR', 'Generador', 9),
  ('GENERADOR_440V', 'Generador 440V', 10),
  ('QUANTUM', 'Quantum', 11),
  ('HELIX', 'Helix', 12),
  ('CARDBOARD_PACKER', 'Cardboard Packer', 13),
  ('ROBOT_TAVIL', 'Robot Tavil', 14),
  ('A3_FLEX', 'A3 Flex', 15),
  ('A3_COMPACT_FLEX', 'A3 Compact Flex', 16),
  ('CAP_APPLICATOR', 'Cap Applicator', 17),
  ('FILM_WRAPPER', 'Film Wrapper', 18),
  ('STRAW_APPLICATOR', 'Straw Applicator', 19);

insert into paradas_equipos_lineas (equipo_id, linea_id)
select e.id, l.id
from (values
  ('FLEX_DRINK', 'LINEA_1'),
  ('FLEX_DRINK', 'LINEA_2'),
  ('FLEX_DRINK', 'LINEA_3'),
  ('PROCESOS', 'LINEA_1'),
  ('PROCESOS', 'LINEA_2'),
  ('PROCESOS', 'LINEA_3'),
  ('DOMINO', 'LINEA_1'),
  ('DOMINO', 'LINEA_2'),
  ('DOMINO', 'LINEA_3'),
  ('CALDERA', 'LINEA_1'),
  ('CALDERA', 'LINEA_2'),
  ('CALDERA', 'LINEA_3'),
  ('HIDRO', 'LINEA_1'),
  ('HIDRO', 'LINEA_2'),
  ('HIDRO', 'LINEA_3'),
  ('SPCP', 'LINEA_1'),
  ('SPCP', 'LINEA_2'),
  ('SPCP', 'LINEA_3'),
  ('SPCS', 'LINEA_1'),
  ('SPCS', 'LINEA_2'),
  ('SPCS', 'LINEA_3'),
  ('COMPRESOR', 'LINEA_1'),
  ('COMPRESOR', 'LINEA_2'),
  ('COMPRESOR', 'LINEA_3'),
  ('GENERADOR', 'LINEA_1'),
  ('GENERADOR', 'LINEA_2'),
  ('GENERADOR', 'LINEA_3'),
  ('GENERADOR_440V', 'LINEA_1'),
  ('GENERADOR_440V', 'LINEA_2'),
  ('GENERADOR_440V', 'LINEA_3'),
  ('QUANTUM', 'LINEA_1'),
  ('QUANTUM', 'LINEA_2'),
  ('QUANTUM', 'LINEA_3'),
  ('HELIX', 'LINEA_1'),
  ('HELIX', 'LINEA_2'),
  ('HELIX', 'LINEA_3'),
  ('CARDBOARD_PACKER', 'LINEA_1'),
  ('CARDBOARD_PACKER', 'LINEA_2'),
  ('CARDBOARD_PACKER', 'LINEA_3'),
  ('ROBOT_TAVIL', 'LINEA_1'),
  ('ROBOT_TAVIL', 'LINEA_2'),
  ('ROBOT_TAVIL', 'LINEA_3'),
  ('A3_FLEX', 'LINEA_1'),
  ('A3_COMPACT_FLEX', 'LINEA_2'),
  ('A3_COMPACT_FLEX', 'LINEA_3'),
  ('CAP_APPLICATOR', 'LINEA_1'),
  ('CAP_APPLICATOR', 'LINEA_3'),
  ('FILM_WRAPPER', 'LINEA_2'),
  ('FILM_WRAPPER', 'LINEA_3'),
  ('STRAW_APPLICATOR', 'LINEA_2'),
  ('STRAW_APPLICATOR', 'LINEA_3')
) as v(equipo, linea)
join paradas_equipos e on e.codigo = v.equipo
join areas a on a.codigo = 'ASEPTICO'
join lineas l on l.area_id = a.id and l.codigo = v.linea;

update paradas_tipos t
set equipo_id = e.id
from (values
  ('FALLA_NIVEL_BTD', 'FLEX_DRINK'),
  ('FALLA_SISTEMA_AGUA_CALIENTE', 'FLEX_DRINK'),
  ('PERDIDA_ESTERILIDAD', 'FLEX_DRINK'),
  ('RETRASO_ARRANQUE', 'FLEX_DRINK'),
  ('RETRASO_ESTERILIZACION', 'FLEX_DRINK'),
  ('RETRASO_LIMPIEZA', 'FLEX_DRINK'),
  ('DESPLACE_INCORRECTO', 'FLEX_DRINK'),
  ('EMPACADURAS_DETERIORADAS', 'FLEX_DRINK'),
  ('LOGISTICA_CONDICIONADA', 'PROCESOS'),
  ('COLEO_PREPARACION', 'PROCESOS'),
  ('FALLA_CODIFICACION', 'DOMINO'),
  ('FALTA_VAPOR', 'CALDERA'),
  ('BAJA_PRESION_AGUA_DURA', 'HIDRO'),
  ('BAJA_PRESION_AGUA_OSMOTIZADA_PRINCIPAL', 'SPCP'),
  ('BAJA_PRESION_AGUA_OSMOTIZADA_SECUNDARIO', 'SPCS'),
  ('BAJA_PRESION_AIRE_COMPRIMIDO', 'COMPRESOR'),
  ('FALLA_GENERADOR_440V', 'GENERADOR'),
  ('FALLA_GENERADOR_480V', 'GENERADOR'),
  ('ALARMA_440V', 'GENERADOR_440V'),
  ('FALLA_SUMINISTRO_AGUA_HELADA', 'QUANTUM')
) as v(tipo, equipo)
join paradas_equipos e on e.codigo = v.equipo
where t.codigo = v.tipo;

insert into paradas_tipos (equipo_id, codigo, nombre, clase, familia, tiempo_guia_min, prefijo_planilla, codigo_con_linea, secuencia_planilla, orden)
select e.id, v.codigo, v.nombre, 'NO_PROGRAMADA', 'EQUIPO', null, v.prefijo, v.con_linea, v.secuencia,
       (select coalesce(max(orden), 0) from paradas_tipos) + v.n
from (values
  ('HELIX', 'HELIX_GENERAL', 'Falla en Hélix', 'AH', true, null, 1),
  ('HELIX', 'HELIX_1', 'Desprendimiento de los Eslabones', 'AH', true, 1, 2),
  ('HELIX', 'HELIX_2', 'Atasco de Envases en la Araña', 'AH', true, 2, 3),
  ('HELIX', 'HELIX_3', 'Atasco de la Cadena', 'AH', true, 3, 4),
  ('HELIX', 'HELIX_4', 'Caída de Envases', 'AH', true, 4, 5),
  ('HELIX', 'HELIX_5', 'Salida de Posición de la Araña', 'AH', true, 5, 6),
  ('HELIX', 'HELIX_6', 'Transportador de Entrada', 'AH', true, 6, 7),
  ('HELIX', 'HELIX_7', 'Transportador de Salida', 'AH', true, 7, 8),
  ('HELIX', 'HELIX_8', 'Falla TPOP', 'AH', true, 8, 9),
  ('HELIX', 'HELIX_9', 'Protección Contra Sobrecarga', 'AH', true, 9, 10),
  ('HELIX', 'HELIX_10', 'Falla Transportador de Entrada', 'AH', true, 10, 11),
  ('HELIX', 'HELIX_11', 'Falla Transportador de Salida', 'AH', true, 11, 12),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_GENERAL', 'Falla en Cardboard Packer', 'CP', true, null, 13),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_1', 'Sincronizacón de la Cadena Arrastradora', 'CP', true, 1, 14),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_2', 'Caída de Envases', 'CP', true, 2, 15),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_3', 'Caja Atascada a la Salida', 'CP', true, 3, 16),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_4', 'Envases Atascados', 'CP', true, 4, 17),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_5', 'Falla en la Temperatura de Manguera de Pega', 'CP', true, 5, 18),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_6', 'Fuga de Pega', 'CP', true, 6, 19),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_7', 'Ruptura de la Cadena Arrastradora', 'CP', true, 7, 20),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_8', 'Se Rompe Correa de Tracción', 'CP', true, 8, 21),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_9', 'Solapas Despegadas', 'CP', true, 9, 22),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_10', 'Falla TPOP', 'CP', true, 10, 23),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_11', 'Protección Contra Sobrecarga', 'CP', true, 11, 24),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_12', 'Falla Transportador de Entrada', 'CP', true, 12, 25),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_13', 'Falla Transportador de Salida', 'CP', true, 13, 26),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_14', 'No sube a paso de Producción', 'CP', true, 14, 27),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_15', 'Envases Dañados', 'CP', true, 15, 28),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_16', 'Falla en el Empujador', 'CP', true, 16, 29),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_17', 'Falla de Temperatura en la Unidad Nordson', 'CP', true, 17, 30),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_18', 'Falla Sensor Ultrasonido', 'CP', true, 18, 31),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_19', 'Falla del Freno', 'CP', true, 19, 32),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_20', 'Falla de Comunicación', 'CP', true, 20, 33),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_21', 'Falla Sensor de Posición de Carton', 'CP', true, 21, 34),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_22', 'Falla en Placa de Transferencia', 'CP', true, 22, 35),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_23', 'Ventosas', 'CP', true, 23, 36),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_24', 'Falla en Barrera Lominosa/Sensor de Salida', 'CP', true, 24, 37),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_GENERAL', 'Falla en Robot Tavil', 'RT', true, null, 38),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_1', 'Atasco de Paletas / Paleta Dañada', 'R', true, 1, 39),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_2', 'Colisión de Garra', 'R', true, 2, 40),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_3', 'Desenfoque de Sensores y Reflectores', 'R', true, 3, 41),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_4', 'Falla de Sistema Electrico', 'R', true, 4, 42),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_5', 'Falla Motor Transportadores', 'R', true, 5, 43),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_6', 'Perdida de Referencia', 'R', true, 6, 44),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_7', 'Falla en el carro Transportadores de Paletas (vacias/llenas)', 'R', true, 7, 45),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_8', 'Ruptura de Correa de Rodillos Transportadores de Cajas', 'R', true, 8, 46),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_9', 'Perdida de Comunicación', 'R', true, 9, 47),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_10', 'Baja Capacidad', 'R', true, 10, 48),
  ('A3_FLEX', 'A3_FLEX_1', 'Ajuste de Volumen', 'A3F', false, 1, 49),
  ('A3_FLEX', 'A3_FLEX_2', 'Alta Temperatura del Agua de Enfriamiento', 'A3F', false, 2, 50),
  ('A3_FLEX', 'A3_FLEX_3', 'Atasco de Envases en el Transportador de Salida', 'A3F', false, 3, 51),
  ('A3_FLEX', 'A3_FLEX_4', 'Atasco del Material en la Bañera de Peróxido', 'A3F', false, 4, 52),
  ('A3_FLEX', 'A3_FLEX_5', 'Baja Presión de Agua de Enfriamiento', 'A3F', false, 5, 53),
  ('A3_FLEX', 'A3_FLEX_6', 'Bajo Flujo de Nitrógeno', 'A3F', false, 6, 54),
  ('A3_FLEX', 'A3_FLEX_7', 'Baja Presión de la Camara Aseptica', 'A3F', false, 7, 55),
  ('A3_FLEX', 'A3_FLEX_8', 'Caja de Corrección con Fuga de Aceite', 'A3F', false, 8, 56),
  ('A3_FLEX', 'A3_FLEX_9', 'Choque de Mordazas', 'A3F', false, 9, 57),
  ('A3_FLEX', 'A3_FLEX_10', 'Concentración de Peróxido Fuera de Rango', 'A3F', false, 10, 58),
  ('A3_FLEX', 'A3_FLEX_11', 'Corrección de Diseño Fuera de Rango', 'A3F', false, 11, 59),
  ('A3_FLEX', 'A3_FLEX_12', 'Cuchilla de Aire Fuera de Posición', 'A3F', false, 12, 60),
  ('A3_FLEX', 'A3_FLEX_13', 'Desincronización de la Correa de Alimentación', 'A3F', false, 13, 61),
  ('A3_FLEX', 'A3_FLEX_14', 'Desincronización de la Plegadora', 'A3F', false, 14, 62),
  ('A3_FLEX', 'A3_FLEX_15', 'Desincronización del Empujador', 'A3F', false, 15, 63),
  ('A3_FLEX', 'A3_FLEX_16', 'Falla en el PLC', 'A3F', false, 16, 64),
  ('A3_FLEX', 'A3_FLEX_17', 'Falla en el Sistema de Aire Estéril', 'A3F', false, 17, 65),
  ('A3_FLEX', 'A3_FLEX_18', 'Falla en el sistema de llenado', 'A3F', false, 18, 66),
  ('A3_FLEX', 'A3_FLEX_19', 'Falla en la Parada Corta', 'A3F', false, 19, 67),
  ('A3_FLEX', 'A3_FLEX_20', 'Falla en la Supervisión de la Soldadura Longitudinal', 'A3F', false, 20, 68),
  ('A3_FLEX', 'A3_FLEX_21', 'Falla TPOP', 'A3F', false, 21, 69),
  ('A3_FLEX', 'A3_FLEX_22', 'Falla Transportador de Desechos', 'A3F', false, 22, 70),
  ('A3_FLEX', 'A3_FLEX_23', 'Falta de Patetas Vacías', 'A3F', false, 23, 71),
  ('A3_FLEX', 'A3_FLEX_24', 'Fuga en el Sistema de Enfriamiento de Mordazas', 'A3F', false, 24, 72),
  ('A3_FLEX', 'A3_FLEX_25', 'Línea de Signado Fuera de Posición (Ajustes)', 'A3F', false, 25, 73),
  ('A3_FLEX', 'A3_FLEX_26', 'Mala Alineación del Empalme', 'A3F', false, 26, 74),
  ('A3_FLEX', 'A3_FLEX_27', 'Mala Formación del Envase', 'A3F', false, 27, 75),
  ('A3_FLEX', 'A3_FLEX_28', 'Maltrato en el Envase', 'A3F', false, 28, 76),
  ('A3_FLEX', 'A3_FLEX_29', 'Falla en el Sellado Transversal', 'A3F', false, 29, 77),
  ('A3_FLEX', 'A3_FLEX_30', 'Maltrato en el Sellado Longitudinal', 'A3F', false, 30, 78),
  ('A3_FLEX', 'A3_FLEX_31', 'Nivel Bajo de Aceite de Lubricación', 'A3F', false, 31, 79),
  ('A3_FLEX', 'A3_FLEX_32', 'Nivel Bajo de Aceite Hidráulico', 'A3F', false, 32, 80),
  ('A3_FLEX', 'A3_FLEX_33', 'No Realiza Empalme Automático de la Cinta', 'A3F', false, 33, 81),
  ('A3_FLEX', 'A3_FLEX_34', 'No Realiza Empalme de Material Envase', 'A3F', false, 34, 82),
  ('A3_FLEX', 'A3_FLEX_35', 'No sube a paso de Producción', 'A3F', false, 35, 83),
  ('A3_FLEX', 'A3_FLEX_36', 'Picos Inferiores Despegados', 'A3F', false, 36, 84),
  ('A3_FLEX', 'A3_FLEX_37', 'Protección Contra Sobrecarga', 'A3F', false, 37, 85),
  ('A3_FLEX', 'A3_FLEX_38', 'Rebose de Producto en la Cámara Aséptica', 'A3F', false, 38, 86),
  ('A3_FLEX', 'A3_FLEX_39', 'Retraso en el Arranque', 'A3F', false, 39, 87),
  ('A3_FLEX', 'A3_FLEX_40', 'Retraso en el Levantamiento de Programa', 'A3F', false, 40, 88),
  ('A3_FLEX', 'A3_FLEX_41', 'Retraso en la Limpieza', 'A3F', false, 41, 89),
  ('A3_FLEX', 'A3_FLEX_42', 'Ruptura del Empalme', 'A3F', false, 42, 90),
  ('A3_FLEX', 'A3_FLEX_43', 'Sellado Longitudinal Débil', 'A3F', false, 43, 91),
  ('A3_FLEX', 'A3_FLEX_44', 'Falla en elemento de sellado Transversal', 'A3F', false, 44, 92),
  ('A3_FLEX', 'A3_FLEX_45', 'Recarga del Sistema de Peróxido Vacio', 'A3F', false, 45, 93),
  ('A3_FLEX', 'A3_FLEX_46', 'Temperatura Alta del Aceite Hidráulico', 'A3F', false, 46, 94),
  ('A3_FLEX', 'A3_FLEX_47', 'Temperatura Alta del Armario Eléctrico', 'A3F', false, 47, 95),
  ('A3_FLEX', 'A3_FLEX_48', 'Temperatura de Peróxido Fuera de Rango', 'A3F', false, 48, 96),
  ('A3_FLEX', 'A3_FLEX_49', 'Transportador de Desechos', 'A3F', false, 49, 97),
  ('A3_FLEX', 'A3_FLEX_50', 'Transportador de Salida Partido', 'A3F', false, 50, 98),
  ('A3_FLEX', 'A3_FLEX_51', 'Falla en el aplicador de tira', 'A3F', false, 51, 99),
  ('A3_FLEX', 'A3_FLEX_52', 'Falla del Sistema Hidraulico', 'A3F', false, 52, 100),
  ('A3_FLEX', 'A3_FLEX_53', 'Falla en el Sistema de Peróxido', 'A3F', false, 53, 101),
  ('A3_FLEX', 'A3_FLEX_54', 'Falla en el Sistema de Seguridad', 'A3F', false, 54, 102),
  ('A3_FLEX', 'A3_FLEX_55', 'Perdida de Referencia del Sistema de Mordazas', 'A3F', false, 55, 103),
  ('A3_FLEX', 'A3_FLEX_56', 'TPIH', 'A3F', false, 56, 104),
  ('A3_FLEX', 'A3_FLEX_57', 'Atasco de Envases en la Plegadora', 'A3F', false, 57, 105),
  ('A3_FLEX', 'A3_FLEX_58', 'Falla en el Corte', 'A3F', false, 58, 106),
  ('A3_FLEX', 'A3_FLEX_59', 'Falla en la bomba de Peroxido', 'A3F', false, 59, 107),
  ('A3_FLEX', 'A3_FLEX_60', 'Bajo/Alto Flujo en el Agua de Enfriamiento', 'A3F', false, 60, 108),
  ('A3_FLEX', 'A3_FLEX_61', 'Temperatura de Armario Electrico', 'A3F', false, 61, 109),
  ('A3_FLEX', 'A3_FLEX_62', 'Falla de Temperatura de la Mesa de Empalme', 'A3F', false, 62, 110),
  ('A3_FLEX', 'A3_FLEX_63', 'Posición o Baja Temperatura de la Barrera de Vapor', 'A3F', false, 63, 111),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_1', 'Ajuste de Volumen', 'A3CF', false, 1, 112),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_2', 'Alta Temperatura del Agua de Enfriamiento', 'A3CF', false, 2, 113),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_3', 'Atasco de Envases en el Transportador de Salida', 'A3CF', false, 3, 114),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_4', 'Atasco del Material en la Bañera de Peróxido', 'A3CF', false, 4, 115),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_5', 'Baja Presión de Agua de Enfriamiento', 'A3CF', false, 5, 116),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_6', 'Bajo Flujo de Nitrógeno', 'A3CF', false, 6, 117),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_7', 'Baja Presión de la Camara Aseptica', 'A3CF', false, 7, 118),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_8', 'Caja de Corrección con Fuga de Aceite', 'A3CF', false, 8, 119),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_9', 'Choque de Mordazas', 'A3CF', false, 9, 120),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_10', 'Concentración de Peróxido Fuera de Rango', 'A3CF', false, 10, 121),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_11', 'Corrección de Diseño Fuera de Rango', 'A3CF', false, 11, 122),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_12', 'Cuchilla de Aire Fuera de Posición', 'A3CF', false, 12, 123),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_13', 'Desincronización de la Correa de Alimentación', 'A3CF', false, 13, 124),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_14', 'Desincronización de la Plegadora', 'A3CF', false, 14, 125),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_15', 'Desincronización del Empujador', 'A3CF', false, 15, 126),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_16', 'Falla en el PLC', 'A3CF', false, 16, 127),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_17', 'Falla en el Sistema de Aire Estéril', 'A3CF', false, 17, 128),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_18', 'Falla en el sistema de llenado', 'A3CF', false, 18, 129),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_19', 'Falla en la Parada Corta', 'A3CF', false, 19, 130),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_20', 'Falla en la Supervisión de la Soldadura Longitudinal', 'A3CF', false, 20, 131),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_21', 'Falla TPOP', 'A3CF', false, 21, 132),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_22', 'Falla Transportador de Desechos', 'A3CF', false, 22, 133),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_23', 'Falta de Patetas Vacías', 'A3CF', false, 23, 134),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_24', 'Fuga en el Sistema de Enfriamiento de Mordazas', 'A3CF', false, 24, 135),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_25', 'Línea de Signado Fuera de Posición (Ajustes)', 'A3CF', false, 25, 136),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_26', 'Mala Alineación del Empalme', 'A3CF', false, 26, 137),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_27', 'Mala Formación del Envase', 'A3CF', false, 27, 138),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_28', 'Maltrato en el Envase', 'A3CF', false, 28, 139),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_29', 'Falla en el Sellado Transversal', 'A3CF', false, 29, 140),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_30', 'Maltrato en el Sellado Longitudinal', 'A3CF', false, 30, 141),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_31', 'Nivel Bajo de Aceite de Lubricación', 'A3CF', false, 31, 142),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_32', 'Nivel Bajo de Aceite Hidráulico', 'A3CF', false, 32, 143),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_33', 'No Realiza Empalme Automático de la Cinta', 'A3CF', false, 33, 144),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_34', 'No Realiza Empalme de Material Envase', 'A3CF', false, 34, 145),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_35', 'No sube a paso de Producción', 'A3CF', false, 35, 146),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_36', 'Picos Inferiores Despegados', 'A3CF', false, 36, 147),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_37', 'Protección Contra Sobrecarga', 'A3CF', false, 37, 148),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_38', 'Rebose de Producto en la Cámara Aséptica', 'A3CF', false, 38, 149),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_39', 'Retraso en el Arranque', 'A3CF', false, 39, 150),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_40', 'Retraso en el Levantamiento de Programa', 'A3CF', false, 40, 151),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_41', 'Retraso en la Limpieza', 'A3CF', false, 41, 152),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_42', 'Ruptura del Empalme', 'A3CF', false, 42, 153),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_43', 'Sellado Longitudinal Débil', 'A3CF', false, 43, 154),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_44', 'Falla en elemento de sellado Transversal', 'A3CF', false, 44, 155),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_45', 'Recarga del Sistema de Peróxido Vacio', 'A3CF', false, 45, 156),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_46', 'Temperatura Alta del Aceite Hidráulico', 'A3CF', false, 46, 157),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_47', 'Temperatura Alta del Armario Eléctrico', 'A3CF', false, 47, 158),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_48', 'Temperatura de Peróxido Fuera de Rango', 'A3CF', false, 48, 159),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_49', 'Transportador de Desechos', 'A3CF', false, 49, 160),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_50', 'Transportador de Salida Partido', 'A3CF', false, 50, 161),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_51', 'Falla en el aplicador de tira', 'A3CF', false, 51, 162),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_52', 'Falla del Sistema Hidraulico', 'A3CF', false, 52, 163),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_53', 'Falla en el Sistema de Peróxido', 'A3CF', false, 53, 164),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_54', 'Falla en el Sistema de Seguridad', 'A3CF', false, 54, 165),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_55', 'Perdida de Referencia del Sistema de Mordazas', 'A3CF', false, 55, 166),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_56', 'TPIH', 'A3CF', false, 56, 167),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_57', 'Atasco de Envases en la Plegadora', 'A3CF', false, 57, 168),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_58', 'Falla en el Corte', 'A3CF', false, 58, 169),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_59', 'Falla en la bomba de Peroxido', 'A3CF', false, 59, 170),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_60', 'Bajo/Alto Flujo en el Agua de Enfriamiento', 'A3CF', false, 60, 171),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_61', 'Temperatura de Armario Electrico', 'A3CF', false, 61, 172),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_62', 'Falla de Temperatura de la Mesa de Empalme', 'A3CF', false, 62, 173),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_63', 'Posición o Baja Temperatura de la Barrera de Vapor', 'A3CF', false, 63, 174),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_GENERAL', 'Falla en Tapadora', 'CAP', true, null, 175),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_1', 'Caída de Envases', 'CAP', false, 1, 176),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_2', 'Correa de Transporte de Tapas Rota', 'CAP', false, 2, 177),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_3', 'Envases Atascados', 'CAP', false, 3, 178),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_4', 'Falla en la Temperatura de Manguera de Pega', 'CAP', false, 4, 179),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_5', 'Falla TPOP', 'CAP', false, 5, 180),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_6', 'Falla Transportador de Entrada', 'CAP', false, 6, 181),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_7', 'Falla Transportador de Salida', 'CAP', false, 7, 182),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_8', 'Fuga de Pega', 'CAP', false, 8, 183),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_9', 'Giro del Envase', 'CAP', false, 9, 184),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_10', 'Maltrato de Envases', 'CAP', false, 10, 185),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_11', 'Falla en la Camara', 'CAP', false, 11, 186),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_12', 'Se Rompe Correa de Tracción', 'CAP', false, 12, 187),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_13', 'Tapa Despegada', 'CAP', false, 13, 188),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_14', 'Tapa Mal Posicionada', 'CAP', false, 14, 189),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_15', 'Tapas Atascadas en el Riel', 'CAP', false, 15, 190),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_16', 'Falla en el sistema de freno', 'CAP', false, 16, 191),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_17', 'Falla de Temperatura en la Unidad Nordson', 'CAP', false, 17, 192),
  ('FILM_WRAPPER', 'FILM_WRAPPER_1', 'Brazo del Empujador Partido (FW)', 'FW', false, 1, 193),
  ('FILM_WRAPPER', 'FILM_WRAPPER_2', 'Caída de Envases', 'FW', false, 2, 194),
  ('FILM_WRAPPER', 'FILM_WRAPPER_3', 'Caída del Treepack', 'FW', false, 3, 195),
  ('FILM_WRAPPER', 'FILM_WRAPPER_4', 'Cambio de Bobina de Polietileno', 'FW', false, 4, 196),
  ('FILM_WRAPPER', 'FILM_WRAPPER_5', 'Descarte de Envases', 'FW', false, 5, 197),
  ('FILM_WRAPPER', 'FILM_WRAPPER_6', 'Envases Atascados', 'FW', false, 6, 198),
  ('FILM_WRAPPER', 'FILM_WRAPPER_7', 'Envases Reventados', 'FW', false, 7, 199),
  ('FILM_WRAPPER', 'FILM_WRAPPER_8', 'Falla TPOP', 'FW', false, 8, 200),
  ('FILM_WRAPPER', 'FILM_WRAPPER_9', 'Falla Transportador de Entrada/Salida', 'FW', false, 9, 201),
  ('FILM_WRAPPER', 'FILM_WRAPPER_10', 'Falla Electrica', 'FW', false, 10, 202),
  ('FILM_WRAPPER', 'FILM_WRAPPER_11', 'Malformación del Treepack', 'FW', false, 11, 203),
  ('FILM_WRAPPER', 'FILM_WRAPPER_12', 'Protección Contra Sobrecarga', 'FW', false, 12, 204),
  ('FILM_WRAPPER', 'FILM_WRAPPER_13', 'Ruptura del Sellado del Polietileno', 'FW', false, 13, 205),
  ('FILM_WRAPPER', 'FILM_WRAPPER_14', 'Se Rompe Correa de Tracción', 'FW', false, 14, 206),
  ('FILM_WRAPPER', 'FILM_WRAPPER_15', 'Sellado del Polietileno Débil', 'FW', false, 15, 207),
  ('FILM_WRAPPER', 'FILM_WRAPPER_16', 'Falla de Unidad de Mantenimiento', 'FW', false, 16, 208),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_1', 'Caída de Envases', 'SA', false, 1, 209),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_2', 'Atasco Envases', 'SA', false, 2, 210),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_3', 'Falla en la Temperatura de Manguera de Pega', 'SA', false, 3, 211),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_4', 'Fuga de Pega', 'SA', false, 4, 212),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_5', 'Se Rompe Correa de Tiempo', 'SA', false, 5, 213),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_6', 'Falla TPOP', 'SA', false, 6, 214),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_7', 'Protección Contra Sobrecarga', 'SA', false, 7, 215),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_8', 'Falla Transportador de Entrada', 'SA', false, 8, 216),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_9', 'Falla Transportador de Salida', 'SA', false, 9, 217),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_10', 'Maquina no Responde', 'SA', false, 10, 218),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_11', 'Pitillos Despegados', 'SA', false, 11, 219),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_12', 'Falla de Temperatura en la Unidad Nordson', 'SA', false, 12, 220),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_13', 'Perdida de Sincronización', 'SA', false, 13, 221),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_14', 'Atasco de Pitillos en el Mandirl', 'SA', false, 14, 222)
) as v(equipo, codigo, nombre, prefijo, con_linea, secuencia, n)
join paradas_equipos e on e.codigo = v.equipo;

-- ------------------------------------------------------------
-- listar_paradas_tipos(): + equipo y "código con línea".
-- ------------------------------------------------------------
drop function if exists listar_paradas_tipos();

create function listar_paradas_tipos()
returns table (
  codigo text,
  nombre text,
  clase text,
  familia text,
  equipo_codigo text,
  tiempo_guia_min numeric,
  prefijo_planilla text,
  secuencia_planilla integer,
  codigo_con_linea boolean,
  activo boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select t.codigo, t.nombre, t.clase, t.familia, e.codigo, t.tiempo_guia_min, t.prefijo_planilla,
         t.secuencia_planilla, t.codigo_con_linea, t.activo
  from paradas_tipos t
  left join paradas_equipos e on e.id = t.equipo_id
  order by t.orden, t.nombre;
$$;

grant execute on function listar_paradas_tipos() to anon, authenticated;

-- ------------------------------------------------------------
-- guardar_parada_tipo(): crea (p_codigo_original null) o edita un tipo.
-- La familia es libre (con equipo, por defecto EQUIPO). El tiempo guía solo aplica a PROGRAMADA.
-- ------------------------------------------------------------
drop function if exists guardar_parada_tipo(text, text, text, text, text, numeric, text, integer, text);

create function guardar_parada_tipo(
  p_usuario text,
  p_codigo_original text,
  p_codigo text,
  p_nombre text,
  p_familia text,
  p_equipo_codigo text,
  p_tiempo_guia_min numeric,
  p_prefijo_planilla text,
  p_secuencia_planilla integer,
  p_codigo_con_linea boolean,
  p_pagina text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_clase text;
  v_familia text;
  v_equipo_id uuid;
  v_guia numeric;
  v_antes paradas_tipos;
  v_id uuid;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio.';
  end if;

  if p_equipo_codigo is not null then
    select id into v_equipo_id from paradas_equipos where codigo = p_equipo_codigo;
    if v_equipo_id is null then
      raise exception 'No se encontró el equipo.';
    end if;
  end if;
  -- La familia agrupa (Suministro, Equipo de Proceso, ...); una falla de equipo sin familia propia es 'EQUIPO'.
  v_familia := coalesce(p_familia, case when p_equipo_codigo is not null then 'EQUIPO' end);
  if v_familia is null then
    raise exception 'Elige la familia del tipo.';
  end if;

  v_clase := case v_familia when 'PROGRAMADA' then 'PROGRAMADA' when 'OCIOSO' then 'OCIOSO' else 'NO_PROGRAMADA' end;

  -- Solo la Programada tiene tiempo guía.
  v_guia := case when v_clase = 'PROGRAMADA' then p_tiempo_guia_min else null end;
  if v_guia is not null and v_guia <= 0 then
    raise exception 'El tiempo guía debe ser mayor que 0.';
  end if;

  if v_clase <> 'OCIOSO' and coalesce(trim(p_prefijo_planilla), '') = '' then
    raise exception 'El prefijo de planilla es obligatorio.';
  end if;

  if p_codigo_original is null then
    if v_codigo = '' then
      raise exception 'El código interno es obligatorio.';
    end if;
    if exists (select 1 from paradas_tipos where codigo = v_codigo) then
      raise exception 'Ya existe un tipo con ese código interno.';
    end if;
    insert into paradas_tipos (codigo, nombre, clase, familia, equipo_id, tiempo_guia_min, prefijo_planilla,
                               secuencia_planilla, codigo_con_linea, orden)
    values (v_codigo, trim(p_nombre), v_clase, v_familia, v_equipo_id, v_guia,
            upper(trim(coalesce(p_prefijo_planilla, ''))), p_secuencia_planilla, coalesce(p_codigo_con_linea, true),
            (select coalesce(max(orden), 0) + 1 from paradas_tipos))
    returning id into v_id;

    perform registrar_auditoria(
      p_usuario, 'CREAR', 'paradas_tipos', v_id::text, p_pagina,
      format('Creó el tipo de parada «%s» (%s)', trim(p_nombre), v_clase),
      null,
      jsonb_build_object('codigo', v_codigo, 'nombre', trim(p_nombre), 'clase', v_clase, 'familia', v_familia,
                         'equipo', p_equipo_codigo, 'tiempo_guia_min', v_guia, 'prefijo_planilla', p_prefijo_planilla,
                         'secuencia_planilla', p_secuencia_planilla, 'codigo_con_linea', coalesce(p_codigo_con_linea, true))
    );
  else
    select * into v_antes from paradas_tipos where codigo = p_codigo_original;
    if not found then
      raise exception 'No se encontró el tipo de parada.';
    end if;

    update paradas_tipos
    set nombre = trim(p_nombre),
        clase = v_clase,
        familia = v_familia,
        equipo_id = v_equipo_id,
        tiempo_guia_min = v_guia,
        prefijo_planilla = upper(trim(coalesce(p_prefijo_planilla, ''))),
        secuencia_planilla = p_secuencia_planilla,
        codigo_con_linea = coalesce(p_codigo_con_linea, true),
        updated_at = now()
    where id = v_antes.id;

    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'paradas_tipos', v_antes.id::text, p_pagina,
      format('Editó el tipo de parada «%s»', trim(p_nombre)),
      jsonb_build_object('nombre', v_antes.nombre, 'clase', v_antes.clase, 'familia', v_antes.familia,
                         'tiempo_guia_min', v_antes.tiempo_guia_min, 'prefijo_planilla', v_antes.prefijo_planilla,
                         'secuencia_planilla', v_antes.secuencia_planilla, 'codigo_con_linea', v_antes.codigo_con_linea),
      jsonb_build_object('nombre', trim(p_nombre), 'clase', v_clase, 'familia', v_familia, 'equipo', p_equipo_codigo,
                         'tiempo_guia_min', v_guia, 'prefijo_planilla', upper(trim(coalesce(p_prefijo_planilla, ''))),
                         'secuencia_planilla', p_secuencia_planilla, 'codigo_con_linea', coalesce(p_codigo_con_linea, true))
    );
  end if;
end;
$$;

grant execute on function guardar_parada_tipo(text, text, text, text, text, text, numeric, text, integer, boolean, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Equipos: listar (con sus líneas) y guardar (sin subsistemas).
-- ------------------------------------------------------------
create or replace function listar_paradas_equipos()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'codigo', e.codigo,
    'nombre', e.nombre,
    'activo', e.activo,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object('area', a.codigo, 'linea', l.codigo) order by a.codigo, l.codigo)
      from paradas_equipos_lineas el
      join lineas l on l.id = el.linea_id
      join areas a on a.id = l.area_id
      where el.equipo_id = e.id
    ), '[]'::jsonb)
  ) order by e.orden, e.nombre), '[]'::jsonb)
  from paradas_equipos e;
$$;

grant execute on function listar_paradas_equipos() to anon, authenticated;

drop function if exists guardar_parada_equipo(text, text, text, text, jsonb, jsonb, text);

create function guardar_parada_equipo(
  p_usuario text,
  p_codigo_original text,
  p_codigo text,
  p_nombre text,
  p_lineas jsonb,
  p_pagina text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_id uuid;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_antes jsonb;
  v_n integer;
  l jsonb;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;
  if v_nombre = '' then
    raise exception 'El nombre del equipo es obligatorio.';
  end if;

  if p_codigo_original is null then
    if v_codigo = '' then
      raise exception 'El código interno es obligatorio.';
    end if;
    if exists (select 1 from paradas_equipos where codigo = v_codigo or nombre = v_nombre) then
      raise exception 'Ya existe un equipo con ese nombre o código.';
    end if;
    insert into paradas_equipos (codigo, nombre, orden)
    values (v_codigo, v_nombre, (select coalesce(max(orden), 0) + 1 from paradas_equipos))
    returning id into v_id;
  else
    select id into v_id from paradas_equipos where codigo = p_codigo_original;
    if v_id is null then
      raise exception 'No se encontró el equipo.';
    end if;
    if exists (select 1 from paradas_equipos where nombre = v_nombre and id <> v_id) then
      raise exception 'Ya existe un equipo con ese nombre.';
    end if;
    select jsonb_build_object('nombre', e.nombre,
             'lineas', (select count(*) from paradas_equipos_lineas x where x.equipo_id = e.id))
    into v_antes from paradas_equipos e where e.id = v_id;
    update paradas_equipos set nombre = v_nombre, updated_at = now() where id = v_id;
  end if;

  delete from paradas_equipos_lineas where equipo_id = v_id;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    insert into paradas_equipos_lineas (equipo_id, linea_id)
    select v_id, ln.id
    from lineas ln join areas a on a.id = ln.area_id
    where a.codigo = l ->> 'area' and ln.codigo = l ->> 'linea'
    on conflict do nothing;
  end loop;

  select count(*) into v_n from paradas_equipos_lineas where equipo_id = v_id;

  perform registrar_auditoria(
    p_usuario,
    case when p_codigo_original is null then 'CREAR' else 'EDITAR' end,
    'paradas_equipos', v_id::text, p_pagina,
    format('%s el equipo «%s» (%s líneas)', case when p_codigo_original is null then 'Creó' else 'Editó' end, v_nombre, v_n),
    v_antes,
    jsonb_build_object('nombre', v_nombre, 'lineas', v_n)
  );
end;
$$;

grant execute on function guardar_parada_equipo(text, text, text, text, jsonb, text) to anon, authenticated;

-- ------------------------------------------------------------
-- registrar_parada(): la falla de un equipo es un tipo más. Solo se acepta si
-- el equipo existe en la línea (el Área de Pruebas puede usar cualquiera). El
-- Ocioso no tiene tiempo guía. El nombre guardado incluye el equipo.
-- ------------------------------------------------------------
drop function if exists registrar_parada(text, uuid, text, text, integer, text, text, numeric, text, text, text);

create function registrar_parada(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_minutos integer,
  p_nota text default null,
  p_justificacion_desvio text default null,
  p_pagina text default 'Registrar Paradas'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_usuario_id uuid;
  v_turno turnos;
  v_linea_id uuid;
  v_tipo paradas_tipos;
  v_equipo paradas_equipos;
  v_clase text;
  v_nombre text;
  v_guia numeric;
  v_fin timestamptz := now();
  v_id uuid;
  v_numero text := regexp_replace(upper(p_linea_codigo), '^LINEA_T?', '');
begin
  if p_minutos is null or p_minutos <= 0 then
    raise exception 'La duración debe ser mayor que 0 minutos.';
  end if;
  if p_minutos > 1440 then
    raise exception 'La duración no puede superar 24 horas.';
  end if;

  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- Solo los supervisores registran paradas (el Área de Pruebas también, para probar).
  if v_rol is distinct from 'SUPERVISOR' and v_area is distinct from 'PRUEBAS' then
    raise exception 'Solo los supervisores pueden registrar paradas.';
  end if;

  select * into v_turno from turnos where id = p_turno_id;
  if not found then
    raise exception 'No se encontró el turno.';
  end if;
  if v_turno.estado <> 'ABIERTO' then
    raise exception 'El turno ya está cerrado.';
  end if;
  if v_turno.supervisor_id is distinct from v_usuario_id then
    raise exception 'Solo puedes registrar paradas en tu propio turno.';
  end if;

  select l.id into v_linea_id
  from lineas l
  where l.area_id = v_turno.area_id
    and regexp_replace(upper(l.codigo), '^LINEA_T?', '') = v_numero
  limit 1;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;

  if p_tipo_codigo is null then
    -- Ocioso de texto libre: sin tiempo guía.
    if coalesce(trim(p_nota), '') = '' then
      raise exception 'Escribe el motivo del tiempo ocioso.';
    end if;
    v_clase := 'OCIOSO';
    v_nombre := 'Tiempo ocioso';
    v_guia := null;
  else
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if not found or not v_tipo.activo then
      raise exception 'El tipo de parada no existe o está desactivado.';
    end if;
    v_clase := v_tipo.clase;
    v_nombre := v_tipo.nombre;
    v_guia := case when v_clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

    if v_tipo.equipo_id is not null then
      select * into v_equipo from paradas_equipos where id = v_tipo.equipo_id;
      if not v_equipo.activo then
        raise exception 'Ese equipo está desactivado.';
      end if;
      if v_area is distinct from 'PRUEBAS'
         and not exists (select 1 from paradas_equipos_lineas where equipo_id = v_equipo.id and linea_id = v_linea_id) then
        raise exception 'Esa falla no aplica a esta línea.';
      end if;
      v_nombre := v_equipo.nombre || ' · ' || v_tipo.nombre;
    end if;

    -- Solo Programada exige justificar cuando se pasa del tiempo guía.
    if v_clase = 'PROGRAMADA' and v_guia is not null and p_minutos > v_guia
       and coalesce(trim(p_justificacion_desvio), '') = '' then
      raise exception 'Justifica por qué se pasó del tiempo guía.';
    end if;
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min,
                       nota, justificacion_desvio, inicio, fin, creado_por)
  values (p_turno_id, v_linea_id, v_tipo.id, v_clase, 'MANUAL', v_nombre, v_guia,
          nullif(trim(coalesce(p_nota, '')), ''),
          case when v_clase = 'PROGRAMADA' then nullif(trim(coalesce(p_justificacion_desvio, '')), '') else null end,
          v_fin - make_interval(mins => p_minutos), v_fin, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, p_pagina,
    format('Registró parada «%s» de %s min en %s (turno %s)', v_nombre, p_minutos,
           (select nombre from lineas where id = v_linea_id), v_turno.codigo),
    null,
    jsonb_build_object('turno_id', p_turno_id, 'linea_id', v_linea_id, 'clase', v_clase, 'tipo', v_nombre,
                       'minutos', p_minutos, 'tiempo_guia_min', v_guia, 'nota', p_nota,
                       'justificacion_desvio', p_justificacion_desvio)
  );

  return v_id;
end;
$$;

grant execute on function registrar_parada(text, uuid, text, text, integer, text, text, text) to anon, authenticated;
