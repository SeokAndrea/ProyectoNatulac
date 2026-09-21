-- ============================================================
-- PARADAS: catálogo vigente del dueño (Línea 1 «ahora 500» y Línea 2) y
-- tipos POR LÍNEA
-- ============================================================
-- Las listas nuevas reemplazan a las anteriores (fallas de equipo de
-- 20261064). Cambios de fondo:
--   * La Línea 2 no numera igual que la 1 (Operacional: tiene «Falta de
--     Paletas Vacías» y no «Falta de operador»; Robot Tavil termina en «Falla
--     enfardadora»). Por eso un tipo puede existir solo en algunas líneas y con
--     su propia secuencia por línea: paradas_tipos_lineas.
--       - Un tipo SIN filas en un área existe en todas las líneas de esa área
--         con su secuencia normal (así Vacío no se ve afectado).
--       - Un tipo CON filas en un área existe solo en esas líneas, y la
--         secuencia de la fila (si trae) manda sobre la normal.
--   * Aséptico: A3 Flex (Línea 1) con 57 fallas, A3 Compact Flex (Líneas 2 y 3)
--     con 41, Cardboard Packer 19, Helix 9, Cap 17, Film Wrapper 15, Straw 11.
--   * Fuente: el libro «Paradas por Codigo» (pestaña «Nueva Configuración»), que trae un catálogo
--     por LÍNEA y PRESENTACIÓN. Se usan los bloques vigentes: Línea 1 «500cc», Línea 2 «200cc» y
--     «250cc», Línea 3 «330cc», «200cc» y «250cc». La Línea 3 numera Operacional como la 1 (no como la 2).
--   * Por ahora la disponibilidad se define por LÍNEA (unión de sus presentaciones). Falta filtrar por
--     la presentación que corre (Cap solo con 330 en la Línea 3; Film Wrapper y Straw con 200 y 250).
-- Lo que ya tenga paradas registradas no se borra: queda desactivado y con
-- «(anterior)» en el nombre.
-- ============================================================

create table paradas_tipos_lineas (
  tipo_id uuid not null references paradas_tipos (id) on delete cascade,
  linea_id uuid not null references lineas (id) on delete cascade,
  secuencia integer,
  primary key (tipo_id, linea_id)
);

alter table paradas_tipos_lineas enable row level security;

-- 1. Fallas de equipo anteriores: se borran las que nadie usó; las usadas quedan como historia.
delete from paradas_tipos
where familia = 'EQUIPO'
  and id not in (select tipo_id from paradas where tipo_id is not null);

update paradas_tipos
set codigo = codigo || '_V1', nombre = nombre || ' (anterior)', activo = false
where familia = 'EQUIPO';

-- 2. Nombres según la planilla vigente.
update paradas_tipos set nombre = 'Falta de operador' where codigo = 'FALTA_OPERADOR';
update paradas_tipos set nombre = 'Insumos (Prueba Industrial)' where codigo = 'INSUMOS_NO_CONFORME';

-- 3. Tipos Operacionales que solo existen en una línea: Falta de Paletas Vacías (OPL2-2, solo Línea 2) y
--    Falta de operador de montacargas (OPL3-8, solo Línea 3). «Falta de operador» (OPL1-8) queda solo en la Línea 1.
insert into paradas_tipos (codigo, nombre, clase, familia, tiempo_guia_min, prefijo_planilla, secuencia_planilla, orden) values
  ('FALTA_PALETAS_VACIAS', 'Falta de Paletas Vacías', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 2,
   (select coalesce(max(orden), 0) + 1 from paradas_tipos)),
  ('FALTA_OPERADOR_MONTACARGAS', 'Falta de operador de montacargas', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 8,
   (select coalesce(max(orden), 0) + 2 from paradas_tipos));

-- 4. Fallas de equipo nuevas y sus filas por línea.
insert into paradas_tipos (equipo_id, codigo, nombre, clase, familia, tiempo_guia_min, prefijo_planilla, codigo_con_linea, secuencia_planilla, orden)
select e.id, v.codigo, v.nombre, 'NO_PROGRAMADA', 'EQUIPO', null, v.prefijo, v.con_linea, v.secuencia,
       (select coalesce(max(orden), 0) from paradas_tipos) + v.n
from (values
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_1', 'Transportador de Entrada', 'CP', true, 1, 1),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_2', 'Unidad de Freno', 'CP', true, 2, 2),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_3', 'Formación de Patron', 'CP', true, 3, 3),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_4', 'Transportador de Entrada', 'CP', true, 4, 4),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_5', 'Agrupador', 'CP', true, 5, 5),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_6', 'Placa de Transferencia', 'CP', true, 6, 6),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_7', 'Empujador', 'CP', true, 7, 7),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_8', 'Sensor de Ultrasonido', 'CP', true, 8, 8),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_9', 'Unidad de Tracción', 'CP', true, 9, 9),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_10', 'Cadena Arrastradora', 'CP', true, 10, 10),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_11', 'Unidad Nordson', 'CP', true, 11, 11),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_12', 'Magazine', 'CP', true, 12, 12),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_13', 'Ventosas', 'CP', true, 13, 13),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_14', 'Unidad Envolvente (Wrap) - Prensa', 'CP', true, 14, 14),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_15', 'Sistema Electrico', 'CP', true, 15, 15),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_16', 'PLC', 'CP', true, 16, 16),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_17', 'Sensor de Posición de Bandeja', 'CP', true, 17, 17),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_18', 'Caida de Envases', 'CP', true, 18, 18),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_19', 'Solapas Despegadas', 'CP', true, 19, 19),
  ('HELIX', 'HELIX_1', 'Desprendimiento de los Eslabones', 'AH', true, 1, 20),
  ('HELIX', 'HELIX_2', 'Atasco de Envases en la Araña', 'AH', true, 2, 21),
  ('HELIX', 'HELIX_3', 'Atasco de la Cadena', 'AH', true, 3, 22),
  ('HELIX', 'HELIX_4', 'Caída de Envases', 'AH', true, 4, 23),
  ('HELIX', 'HELIX_5', 'Salida de Posición de la Araña', 'AH', true, 5, 24),
  ('HELIX', 'HELIX_6', 'Transportador de Entrada', 'AH', true, 6, 25),
  ('HELIX', 'HELIX_7', 'Transportador de Salida', 'AH', true, 7, 26),
  ('HELIX', 'HELIX_8', 'Falla TPOP', 'AH', true, 8, 27),
  ('HELIX', 'HELIX_9', 'Falla Electrica', 'AH', true, 9, 28),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_1', 'Atasco de Paletas / Paleta Dañada', 'R', true, 1, 29),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_2', 'Colisión de Garra', 'R', true, 2, 30),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_3', 'Desenfoque de Sensores y Reflectores', 'R', true, 3, 31),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_4', 'Falla de Sistema Electrico', 'R', true, 4, 32),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_5', 'Falla Motor Transportadores', 'R', true, 5, 33),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_6', 'Perdida de Referencia', 'R', true, 6, 34),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_7', 'Falla en el carro Transportadores de Paletas (vacias/llenas)', 'R', true, 7, 35),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_8', 'Ruptura de Correa de Rodillos Transportadores de Cajas', 'R', true, 8, 36),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_9', 'Perdida de Comunicación', 'R', true, 9, 37),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_10', 'Baja Capacidad', 'R', true, 10, 38),
  ('A3_FLEX', 'A3_FLEX_1', 'Camara Aseptica - Superestructura', 'A3F', false, 1, 39),
  ('A3_FLEX', 'A3_FLEX_2', 'Baja Presion de la Camara Aseptica', 'A3F', false, 2, 40),
  ('A3_FLEX', 'A3_FLEX_3', 'Camara de Secado - Superestructura', 'A3F', false, 3, 41),
  ('A3_FLEX', 'A3_FLEX_4', 'Elemento Sellado Longitudinal / Parada Corta - Superestructura', 'A3F', false, 4, 42),
  ('A3_FLEX', 'A3_FLEX_5', 'Falla en la Supervisión de la Soldadura Longitudinal', 'A3F', false, 5, 43),
  ('A3_FLEX', 'A3_FLEX_6', 'Maltrato o sellado debil en el Sellado Longitudinal', 'A3F', false, 6, 44),
  ('A3_FLEX', 'A3_FLEX_7', 'Falla en la Parada Corta', 'A3F', false, 7, 45),
  ('A3_FLEX', 'A3_FLEX_8', 'Sistema de Aire Esteril', 'A3F', false, 8, 46),
  ('A3_FLEX', 'A3_FLEX_9', 'Cuchilla de Aire Fuera de Posición', 'A3F', false, 9, 47),
  ('A3_FLEX', 'A3_FLEX_10', 'Sistema de Llenado', 'A3F', false, 10, 48),
  ('A3_FLEX', 'A3_FLEX_11', 'Sistema de Peroxido', 'A3F', false, 11, 49),
  ('A3_FLEX', 'A3_FLEX_12', 'Atasco del Material en la Bañera de Peróxido', 'A3F', false, 12, 50),
  ('A3_FLEX', 'A3_FLEX_13', 'Concentración de Peróxido Fuera de Rango', 'A3F', false, 13, 51),
  ('A3_FLEX', 'A3_FLEX_14', 'Temperatura de Peróxido Fuera de Rango', 'A3F', false, 14, 52),
  ('A3_FLEX', 'A3_FLEX_15', 'Falla en el Sistema de Peróxido', 'A3F', false, 15, 53),
  ('A3_FLEX', 'A3_FLEX_16', 'Falla en la bomba de Peroxido', 'A3F', false, 16, 54),
  ('A3_FLEX', 'A3_FLEX_17', 'Sistema Neumatico', 'A3F', false, 17, 55),
  ('A3_FLEX', 'A3_FLEX_18', 'Sistema de Limpieza', 'A3F', false, 18, 56),
  ('A3_FLEX', 'A3_FLEX_19', 'Retraso en la Limpieza', 'A3F', false, 19, 57),
  ('A3_FLEX', 'A3_FLEX_20', 'Sistema Electrico', 'A3F', false, 20, 58),
  ('A3_FLEX', 'A3_FLEX_21', 'Sistema de Comunicación', 'A3F', false, 21, 59),
  ('A3_FLEX', 'A3_FLEX_22', 'Sistema de Seguridad', 'A3F', false, 22, 60),
  ('A3_FLEX', 'A3_FLEX_23', 'Sistema Hidraulico', 'A3F', false, 23, 61),
  ('A3_FLEX', 'A3_FLEX_24', 'Nivel Bajo de Aceite Hidráulico', 'A3F', false, 24, 62),
  ('A3_FLEX', 'A3_FLEX_25', 'Temperatura Alta del Aceite Hidráulico', 'A3F', false, 25, 63),
  ('A3_FLEX', 'A3_FLEX_26', 'Falla del Sistema Hidraulico', 'A3F', false, 26, 64),
  ('A3_FLEX', 'A3_FLEX_27', 'TPOP Falla', 'A3F', false, 27, 65),
  ('A3_FLEX', 'A3_FLEX_28', 'Sistema de Traccion', 'A3F', false, 28, 66),
  ('A3_FLEX', 'A3_FLEX_29', 'Mordazas', 'A3F', false, 29, 67),
  ('A3_FLEX', 'A3_FLEX_30', 'Brazo de Corte', 'A3F', false, 30, 68),
  ('A3_FLEX', 'A3_FLEX_31', 'Brazo de Presión', 'A3F', false, 31, 69),
  ('A3_FLEX', 'A3_FLEX_32', 'Falla en el Sellado Transversal', 'A3F', false, 32, 70),
  ('A3_FLEX', 'A3_FLEX_33', 'Sistema de Lubricación central', 'A3F', false, 33, 71),
  ('A3_FLEX', 'A3_FLEX_34', 'Corrección de diseño', 'A3F', false, 34, 72),
  ('A3_FLEX', 'A3_FLEX_35', 'Ajuste de Volumen', 'A3F', false, 35, 73),
  ('A3_FLEX', 'A3_FLEX_36', 'Correa de Alimentación', 'A3F', false, 36, 74),
  ('A3_FLEX', 'A3_FLEX_37', 'PULL-DOWN', 'A3F', false, 37, 75),
  ('A3_FLEX', 'A3_FLEX_38', 'Calentadores de Pliegues', 'A3F', false, 38, 76),
  ('A3_FLEX', 'A3_FLEX_39', 'Dispositivo Prensor', 'A3F', false, 39, 77),
  ('A3_FLEX', 'A3_FLEX_40', 'Empujador Plegadora', 'A3F', false, 40, 78),
  ('A3_FLEX', 'A3_FLEX_41', 'Desincronización Plegadora', 'A3F', false, 41, 79),
  ('A3_FLEX', 'A3_FLEX_42', 'Referencia', 'A3F', false, 42, 80),
  ('A3_FLEX', 'A3_FLEX_43', 'Aire Comprimido', 'A3F', false, 43, 81),
  ('A3_FLEX', 'A3_FLEX_44', 'Agua Presión', 'A3F', false, 44, 82),
  ('A3_FLEX', 'A3_FLEX_45', 'Sistema de Refrigeración', 'A3F', false, 45, 83),
  ('A3_FLEX', 'A3_FLEX_46', 'Mesa de Empalme', 'A3F', false, 46, 84),
  ('A3_FLEX', 'A3_FLEX_47', 'Mala Alineación del Empalme', 'A3F', false, 47, 85),
  ('A3_FLEX', 'A3_FLEX_48', 'No Realiza Empalme de Material Envase', 'A3F', false, 48, 86),
  ('A3_FLEX', 'A3_FLEX_49', 'Ruptura del Empalme', 'A3F', false, 49, 87),
  ('A3_FLEX', 'A3_FLEX_50', 'Aplicador de Tira', 'A3F', false, 50, 88),
  ('A3_FLEX', 'A3_FLEX_51', 'Línea de Signado Fuera de Posición (Ajustes)', 'A3F', false, 51, 89),
  ('A3_FLEX', 'A3_FLEX_52', 'Transportador de Desechos', 'A3F', false, 52, 90),
  ('A3_FLEX', 'A3_FLEX_53', 'Transportador de Salida', 'A3F', false, 53, 91),
  ('A3_FLEX', 'A3_FLEX_54', 'Mala Formación del Envase', 'A3F', false, 54, 92),
  ('A3_FLEX', 'A3_FLEX_55', 'Rebose de Producto en la Cámara Aséptica', 'A3F', false, 55, 93),
  ('A3_FLEX', 'A3_FLEX_56', 'Retraso en el Levantamiento de Programa', 'A3F', false, 56, 94),
  ('A3_FLEX', 'A3_FLEX_57', 'Sistema HI', 'A3F', false, 57, 95),
  ('HELIX', 'HELIX_GENERAL', 'Falla en Hélix', 'AH', true, null, 96),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_GENERAL', 'Falla en Tapdadora', 'CAP', true, null, 97),
  ('CARDBOARD_PACKER', 'CARDBOARD_PACKER_GENERAL', 'Falla en Cardboard Packer', 'CP', true, null, 98),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_GENERAL', 'Falla en Robot Tavil', 'RT', true, null, 99),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_2', 'Linea de Empaques', 'CAP', false, 1, 100),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_3', 'Tapa Despegada', 'CAP', false, 2, 101),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_4', 'Tapa Mal Posicionada', 'CAP', false, 3, 102),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_5', 'Aplicador de Tapas', 'CAP', false, 4, 103),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_6', 'Clasificador de Tapas', 'CAP', false, 5, 104),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_7', 'Unidad Nordson', 'CAP', false, 6, 105),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_8', 'Panel Neumatico', 'CAP', false, 7, 106),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_9', 'Panel Electrico', 'CAP', false, 8, 107),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_10', 'Unidad de Lubricacion', 'CAP', false, 9, 108),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_11', 'Unidad Aplicadora (Rueda)', 'CAP', false, 10, 109),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_12', 'Secuenciador de Tapas', 'CAP', false, 11, 110),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_13', 'Transportador de Tapas', 'CAP', false, 12, 111),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_14', 'Maltrato de Envase', 'CAP', false, 13, 112),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_15', 'Transportador de Entrada', 'CAP', false, 14, 113),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_16', 'Transportador de Salida', 'CAP', false, 15, 114),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_17', 'Envase Atascados', 'CAP', false, 16, 115),
  ('CAP_APPLICATOR', 'CAP_APPLICATOR_18', 'Envases Caidos', 'CAP', false, 17, 116),
  ('ROBOT_TAVIL', 'ROBOT_TAVIL_12', 'Falla enfardadora', 'R', true, 10, 117),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_1', 'Camara Aseptica - Superestructura', 'A3CF', false, 1, 118),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_2', 'Camara de Secado - Superestructura', 'A3CF', false, 2, 119),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_3', 'Elemento Sellado Longitudinal - Superestructura', 'A3CF', false, 3, 120),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_4', 'Elemento de Parada Corta - Superestructura', 'A3CF', false, 4, 121),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_5', 'Sistema de Aire Esteril - Superestructura', 'A3CF', false, 5, 122),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_6', 'Sistema de Llenado - Superestructura', 'A3CF', false, 6, 123),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_7', 'Sistema de Peroxido - Superestructura', 'A3CF', false, 7, 124),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_8', 'Sistema Neumatico - Superestructura', 'A3CF', false, 8, 125),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_9', 'Sistema de Limpieza - Superestructura', 'A3CF', false, 9, 126),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_10', 'Sistema Electrico - Superestructura', 'A3CF', false, 10, 127),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_11', 'Sistema de Comunicación - Superestructura', 'A3CF', false, 11, 128),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_12', 'Sistema de Seguridad - Superestructura', 'A3CF', false, 12, 129),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_13', 'Sistema Hidraulico - Cuerpo de Maquina', 'A3CF', false, 13, 130),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_14', 'TPOP Falla - Cuerpo de Maquina', 'A3CF', false, 14, 131),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_15', 'Sistema de Traccion - Traccion', 'A3CF', false, 15, 132),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_16', 'Mordazas - Traccion', 'A3CF', false, 16, 133),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_17', 'Brazo de Corte - Traccion', 'A3CF', false, 17, 134),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_18', 'Brazo de Presión - Traccion', 'A3CF', false, 18, 135),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_19', 'Falla en el Sellado Transversal - Traccion', 'A3CF', false, 19, 136),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_20', 'Sistema de Lubricación central - Traccion', 'A3CF', false, 20, 137),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_21', 'Corrección de diseño - Traccion', 'A3CF', false, 21, 138),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_22', 'Ajuste de Volumen - Traccion', 'A3CF', false, 22, 139),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_23', 'Correa de Alimentación - Plegador Final', 'A3CF', false, 23, 140),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_24', 'PULL-DOWN - Plegador Final', 'A3CF', false, 24, 141),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_25', 'Calentadores de Pliegues - Plegador Final', 'A3CF', false, 25, 142),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_26', 'Dispositivo Prensor - Plegador Final', 'A3CF', false, 26, 143),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_27', 'Empujador Plegadora - Plegador Final', 'A3CF', false, 27, 144),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_28', 'Desincronización Plegadora - Plegador Final', 'A3CF', false, 28, 145),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_29', 'Referencia - Plegador Final', 'A3CF', false, 29, 146),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_30', 'Aire Comprimido - Unidad de Servicio', 'A3CF', false, 30, 147),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_31', 'Agua Presión - Unidad de Servicio', 'A3CF', false, 31, 148),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_32', 'Sistema de Refrigeración - Unidad de Servicio', 'A3CF', false, 32, 149),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_33', 'Mesa de Empalme - ASU', 'A3CF', false, 33, 150),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_34', 'Aplicador de Tira - ASU', 'A3CF', false, 34, 151),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_35', 'Línea de Signado Fuera de Posición', 'A3CF', false, 35, 152),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_36', 'Transportador de Desechos', 'A3CF', false, 36, 153),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_37', 'Transportador de Salida', 'A3CF', false, 37, 154),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_38', 'Mala Formación del Envase', 'A3CF', false, 38, 155),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_39', 'Rebose de Producto en la Cámara Aséptica', 'A3CF', false, 39, 156),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_40', 'Retraso en el Levantamiento de Programa', 'A3CF', false, 40, 157),
  ('A3_COMPACT_FLEX', 'A3_COMPACT_FLEX_41', 'Sistema HI', 'A3CF', false, 41, 158),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_GENERAL', 'Falla en Straw Aplicator', 'SA', false, null, 159),
  ('FILM_WRAPPER', 'FILM_WRAPPER_GENERAL', 'Falla en Film Wrapper', 'FW', false, null, 160),
  ('FILM_WRAPPER', 'FILM_WRAPPER_2', 'Sección de Entrada', 'FW', false, 1, 161),
  ('FILM_WRAPPER', 'FILM_WRAPPER_3', 'Unidad Agrupación', 'FW', false, 2, 162),
  ('FILM_WRAPPER', 'FILM_WRAPPER_4', 'Magazine de Bobina Superior', 'FW', false, 3, 163),
  ('FILM_WRAPPER', 'FILM_WRAPPER_5', 'Magazine de Bobina Inferior', 'FW', false, 4, 164),
  ('FILM_WRAPPER', 'FILM_WRAPPER_6', 'Unidad de Sellado', 'FW', false, 5, 165),
  ('FILM_WRAPPER', 'FILM_WRAPPER_7', 'Unidad de Salida del Treepack', 'FW', false, 6, 166),
  ('FILM_WRAPPER', 'FILM_WRAPPER_8', 'Sistema Electrico', 'FW', false, 7, 167),
  ('FILM_WRAPPER', 'FILM_WRAPPER_9', 'TPOP', 'FW', false, 8, 168),
  ('FILM_WRAPPER', 'FILM_WRAPPER_10', 'PLC', 'FW', false, 9, 169),
  ('FILM_WRAPPER', 'FILM_WRAPPER_11', 'Caida de envases', 'FW', false, 10, 170),
  ('FILM_WRAPPER', 'FILM_WRAPPER_12', 'Caida de Treepack', 'FW', false, 11, 171),
  ('FILM_WRAPPER', 'FILM_WRAPPER_13', 'Cambio de Bobina de Polietileno', 'FW', false, 12, 172),
  ('FILM_WRAPPER', 'FILM_WRAPPER_14', 'Descarte de Envases', 'FW', false, 13, 173),
  ('FILM_WRAPPER', 'FILM_WRAPPER_15', 'Envases Atascados', 'FW', false, 14, 174),
  ('FILM_WRAPPER', 'FILM_WRAPPER_16', 'Ruptura de Sellado de Polietileno', 'FW', false, 15, 175),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_2', 'Sección Transportadora de Empaque', 'SA', false, 1, 176),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_3', 'Unidad Aplicadora', 'SA', false, 2, 177),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_4', 'Unidad Nordson', 'SA', false, 3, 178),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_5', 'Unidad Neumatica', 'SA', false, 4, 179),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_6', 'Falla TPOP', 'SA', false, 5, 180),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_7', 'Falla PLC', 'SA', false, 6, 181),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_8', 'Falla Electrica', 'SA', false, 7, 182),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_9', 'Caída de Envases', 'SA', false, 8, 183),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_10', 'Transportador de Entrada', 'SA', false, 9, 184),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_11', 'Transportador de Salida', 'SA', false, 10, 185),
  ('STRAW_APPLICATOR', 'STRAW_APPLICATOR_12', 'Pitillos Despegados', 'SA', false, 11, 186)
) as v(equipo, codigo, nombre, prefijo, con_linea, secuencia, n)
join paradas_equipos e on e.codigo = v.equipo;

insert into paradas_tipos_lineas (tipo_id, linea_id, secuencia)
select t.id, l.id, v.secuencia
from (values
  ('INSUMOS_NO_CONFORME', 'LINEA_1', 2),
  ('INSUMOS_NO_CONFORME', 'LINEA_2', 3),
  ('INSUMOS_NO_CONFORME', 'LINEA_3', 2),
  ('LOGISTICA_LINEA', 'LINEA_1', 3),
  ('LOGISTICA_LINEA', 'LINEA_2', 4),
  ('LOGISTICA_LINEA', 'LINEA_3', 3),
  ('PARADAS_NO_DOCUMENTADAS', 'LINEA_1', 4),
  ('PARADAS_NO_DOCUMENTADAS', 'LINEA_2', 5),
  ('PARADAS_NO_DOCUMENTADAS', 'LINEA_3', 4),
  ('FALTA_DISPONIBILIDAD_INSUMO', 'LINEA_1', 5),
  ('FALTA_DISPONIBILIDAD_INSUMO', 'LINEA_2', 6),
  ('FALTA_DISPONIBILIDAD_INSUMO', 'LINEA_3', 5),
  ('FALLA_FALTA_MONTACARGAS', 'LINEA_1', 6),
  ('FALLA_FALTA_MONTACARGAS', 'LINEA_2', 7),
  ('FALLA_FALTA_MONTACARGAS', 'LINEA_3', 6),
  ('FALLA_OPERACIONAL', 'LINEA_1', 7),
  ('FALLA_OPERACIONAL', 'LINEA_2', 8),
  ('FALLA_OPERACIONAL', 'LINEA_3', 7),
  ('FALTA_OPERADOR', 'LINEA_1', 8),
  ('FALTA_PALETAS_VACIAS', 'LINEA_2', 2),
  ('ROBOT_TAVIL_12', 'LINEA_2', 10),
  ('FALTA_OPERADOR_MONTACARGAS', 'LINEA_3', 8)
) as v(tipo, linea, secuencia)
join paradas_tipos t on t.codigo = v.tipo
join areas a on a.codigo = 'ASEPTICO'
join lineas l on l.area_id = a.id and l.codigo = v.linea;

-- ------------------------------------------------------------
-- listar_paradas_tipos(): + líneas del tipo ([{area, linea, secuencia}]).
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
  activo boolean,
  lineas jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select t.codigo, t.nombre, t.clase, t.familia, e.codigo, t.tiempo_guia_min, t.prefijo_planilla,
         t.secuencia_planilla, t.codigo_con_linea, t.activo,
         coalesce((
           select jsonb_agg(jsonb_build_object('area', a.codigo, 'linea', l.codigo, 'secuencia', tl.secuencia)
                            order by a.codigo, l.codigo)
           from paradas_tipos_lineas tl
           join lineas l on l.id = tl.linea_id
           join areas a on a.id = l.area_id
           where tl.tipo_id = t.id
         ), '[]'::jsonb)
  from paradas_tipos t
  left join paradas_equipos e on e.id = t.equipo_id
  order by t.orden, t.nombre;
$$;

grant execute on function listar_paradas_tipos() to anon, authenticated;

-- ------------------------------------------------------------
-- guardar_parada_tipo(): + p_lineas ([{area, linea, secuencia}]). Vacío = todas las líneas.
-- ------------------------------------------------------------
drop function if exists guardar_parada_tipo(text, text, text, text, text, text, numeric, text, integer, boolean, text);

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
  v_clase text;
  v_familia text;
  v_equipo_id uuid;
  v_guia numeric;
  v_antes paradas_tipos;
  v_id uuid;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_n integer;
  l jsonb;
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
  else
    select * into v_antes from paradas_tipos where codigo = p_codigo_original;
    if not found then
      raise exception 'No se encontró el tipo de parada.';
    end if;
    v_id := v_antes.id;

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
    where id = v_id;
  end if;

  -- Líneas donde existe el tipo (vacío = todas).
  delete from paradas_tipos_lineas where tipo_id = v_id;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    insert into paradas_tipos_lineas (tipo_id, linea_id, secuencia)
    select v_id, ln.id, nullif(l ->> 'secuencia', '')::integer
    from lineas ln join areas a on a.id = ln.area_id
    where a.codigo = l ->> 'area' and ln.codigo = l ->> 'linea'
    on conflict do nothing;
  end loop;
  select count(*) into v_n from paradas_tipos_lineas where tipo_id = v_id;

  perform registrar_auditoria(
    p_usuario,
    case when p_codigo_original is null then 'CREAR' else 'EDITAR' end,
    'paradas_tipos', v_id::text, p_pagina,
    format('%s el tipo de parada «%s» (%s)', case when p_codigo_original is null then 'Creó' else 'Editó' end,
           trim(p_nombre), v_clase),
    case when v_antes.id is null then null else
      jsonb_build_object('nombre', v_antes.nombre, 'clase', v_antes.clase, 'familia', v_antes.familia,
                         'tiempo_guia_min', v_antes.tiempo_guia_min, 'prefijo_planilla', v_antes.prefijo_planilla,
                         'secuencia_planilla', v_antes.secuencia_planilla, 'codigo_con_linea', v_antes.codigo_con_linea)
    end,
    jsonb_build_object('nombre', trim(p_nombre), 'clase', v_clase, 'familia', v_familia, 'equipo', p_equipo_codigo,
                       'tiempo_guia_min', v_guia, 'prefijo_planilla', upper(trim(coalesce(p_prefijo_planilla, ''))),
                       'secuencia_planilla', p_secuencia_planilla, 'codigo_con_linea', coalesce(p_codigo_con_linea, true),
                       'lineas', v_n)
  );
end;
$$;

grant execute on function guardar_parada_tipo(text, text, text, text, text, text, numeric, text, integer, boolean, jsonb, text) to anon, authenticated;

-- ------------------------------------------------------------
-- registrar_parada(): igual que en 20261064 + el tipo debe existir en la línea.
-- ------------------------------------------------------------
create or replace function registrar_parada(
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

    -- El tipo puede existir solo en algunas líneas de esta área (paradas_tipos_lineas).
    if v_area is distinct from 'PRUEBAS'
       and exists (
         select 1 from paradas_tipos_lineas tl join lineas l2 on l2.id = tl.linea_id
         where tl.tipo_id = v_tipo.id and l2.area_id = v_turno.area_id
       )
       and not exists (select 1 from paradas_tipos_lineas where tipo_id = v_tipo.id and linea_id = v_linea_id) then
      raise exception 'Esa parada no aplica a esta línea.';
    end if;

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
