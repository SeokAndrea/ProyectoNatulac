-- ============================================================
-- PARADAS: catálogo de EQUIPOS (fallas mecánicas), por línea
-- ============================================================
-- Las paradas mecánicas son fallas de un equipo (y, opcional, de uno de sus
-- subsistemas). Cada equipo se asigna a las líneas donde existe — por área:
-- la "Línea 1" de Aséptico y la de Vacío tienen equipos distintos. El seed sale
-- del Sheet de Mantenimiento (CONFIG_EQUIPOS: equipo → subsistemas; REPORTE
-- LINEAS: en qué área y línea se reportó cada equipo). Solo SUPERADMINISTRADOR
-- edita; un equipo no se borra, se desactiva. Auditoría explícita.
--
-- registrar_parada() se re-emite con dos parámetros nuevos (equipo y
-- subsistema): el supervisor solo ve los equipos de la línea en que registra.
-- ============================================================

create table paradas_equipos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text unique not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table paradas_subsistemas (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references paradas_equipos (id) on delete cascade,
  codigo text not null,
  nombre text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  unique (equipo_id, codigo)
);

create table paradas_equipos_lineas (
  equipo_id uuid not null references paradas_equipos (id) on delete cascade,
  linea_id uuid not null references lineas (id) on delete cascade,
  primary key (equipo_id, linea_id)
);

alter table paradas_equipos enable row level security;
alter table paradas_subsistemas enable row level security;
alter table paradas_equipos_lineas enable row level security;

alter table paradas add column equipo_id uuid references paradas_equipos (id);
alter table paradas add column subsistema_id uuid references paradas_subsistemas (id);

insert into paradas_equipos (codigo, nombre, orden) values
  ('ALMIX', 'ALMIX', 1),
  ('DRINK', 'DRINK', 2),
  ('FLEX', 'FLEX', 3),
  ('A3FLEX', 'A3FLEX', 4),
  ('FW32', 'FW32', 5),
  ('HELIX', 'HELIX', 6),
  ('CAP', 'CAP', 7),
  ('CBP32', 'CBP32', 8),
  ('TAVIL', 'TAVIL', 9),
  ('DOMINO', 'DOMINO', 10),
  ('A3CFLEX', 'A3CFLEX', 11),
  ('SA', 'SA', 12),
  ('PASTEURIZADOR', 'PASTEURIZADOR', 13),
  ('BOMBA_DE_DIAFRAGMA', 'BOMBA DE DIAFRAGMA', 14),
  ('BOMBA_DE_DIAFRAGMA_NECTAR', 'BOMBA DE DIAFRAGMA NECTAR', 15),
  ('DESPALETIZADOR_ALUMINIO', 'DESPALETIZADOR ALUMINIO', 16),
  ('DESPALETIZADOR_COLADOS', 'DESPALETIZADOR COLADOS', 17),
  ('GUAYA_TRANSPORTE', 'GUAYA TRANSPORTE', 18),
  ('LLENADORA_ELMAR', 'LLENADORA ELMAR', 19),
  ('SELLADORA_ANGELUS', 'SELLADORA ANGELUS', 20),
  ('VA_Y_VEN', 'VA Y VEN', 21),
  ('TUNEL', 'TUNEL', 22),
  ('EMBALADORA_GAMMA', 'EMBALADORA GAMMA', 23),
  ('HORNO', 'HORNO', 24),
  ('TRANSPORTADORES', 'TRANSPORTADORES', 25),
  ('TANQUE_COCCION', 'TANQUE COCCION', 26),
  ('TANQUE_6000', 'TANQUE 6000', 27),
  ('PICKHEATER', 'PICKHEATER', 28),
  ('DESAIREADOR', 'DESAIREADOR', 29),
  ('BOMBA_VACIO', 'BOMBA VACÍO', 30),
  ('RINSER', 'RINSER', 31),
  ('TAPADORA_WHITECAP', 'TAPADORA WHITECAP', 32),
  ('SOPLADOR', 'SOPLADOR', 33),
  ('DETECTOR_DE_VACIO', 'DETECTOR DE VACÍO', 34),
  ('ETIQUETADORA', 'ETIQUETADORA', 35),
  ('TECMI', 'TECMI', 36),
  ('ROBOT_MOTOMAN', 'ROBOT MOTOMAN', 37),
  ('EMBALADORA_TECMI', 'EMBALADORA TECMI', 38),
  ('ROBOT_TAVIL', 'ROBOT TAVIL', 39),
  ('ALCIP', 'ALCIP', 40),
  ('DESPALETIZADOR', 'DESPALETIZADOR', 41),
  ('SAP', 'SAP', 42);

insert into paradas_subsistemas (equipo_id, codigo, nombre, orden)
select e.id, v.codigo, v.nombre, v.orden
from (values
  ('ALMIX', 'ALM-ROD-01', 'RODAMIENTO', 1),
  ('ALMIX', 'ALM-COR-02', 'CORREA', 2),
  ('ALMIX', 'ALM-EJ-03', 'EJE', 3),
  ('ALMIX', 'ALM-MOT-04', 'MOTOR', 4),
  ('ALMIX', 'ALM-BOM-05', 'BOMBA', 5),
  ('ALMIX', 'ALM-POL-06', 'POLEA', 6),
  ('ALMIX', 'ALM-SEL-07', 'SELLO', 7),
  ('ALMIX', 'ALM-PAN-08', 'PANEL DE CONTROL', 8),
  ('ALMIX', 'ALM-DIA-09', 'BOMBA DE DIAFRAGMA', 9),
  ('ALMIX', 'ALM-ELE-10', 'SUMINISTRO ELÉCTRICO', 10),
  ('ALMIX', 'ALM-AIR-11', 'AIRE COMPRIMIDO', 11),
  ('ALMIX', 'ALM-GEN-12', 'CAMBIO DE GENERADOR', 12),
  ('DRINK', 'DRI-BTD-01', 'BTD', 13),
  ('DRINK', 'DRI-BOM-02', 'BOMBA M2', 14),
  ('DRINK', 'DRI-BOM-03', 'BOMB M9', 15),
  ('DRINK', 'DRI-CAU-04', 'CAUDALIMETRO', 16),
  ('DRINK', 'DRI-PLA-05', 'PLACAS', 17),
  ('DRINK', 'DRI-BOM-06', 'BOMBA MULTIETAPA', 18),
  ('DRINK', 'DRI-VAP-07', 'SISTEMA DE VAPOR', 19),
  ('DRINK', 'DRI-VAL-08', 'VÁLVULAS', 20),
  ('DRINK', 'DRI-PAN-09', 'PANEL DE CONTROL', 21),
  ('DRINK', 'DRI-ELE-10', 'SUMINISTRO ELÉCTRICO', 22),
  ('DRINK', 'DRI-AIR-11', 'AIRE COMPRIMIDO', 23),
  ('FLEX', 'FLEX-TPO-01', 'TPOP DISPLAY', 24),
  ('FLEX', 'FLEX-TER-02', 'TERMOCUPLAS', 25),
  ('FLEX', 'FLEX-VAL-03', 'VALVULA DE VAPOR', 26),
  ('FLEX', 'FLEX-BTD-04', 'BTD', 27),
  ('FLEX', 'FLEX-BOM-05', 'BOMBAS', 28),
  ('FLEX', 'FLEX-SELL-06', 'SELLOS', 29),
  ('FLEX', 'FLEX-VAL-07', 'VALVULAS DE DIAFRAGMA', 30),
  ('FLEX', 'FLEX-VAR-08', 'VARIADORES', 31),
  ('FLEX', 'FLEX-PLC-09', 'PLC', 32),
  ('FLEX', 'FLEX-TUB-10', 'INTERCAMBIADOR TUBULAR', 33),
  ('FLEX', 'FLEX-PAN-11', 'PANEL DE CONTROL', 34),
  ('FLEX', 'FLEX-ELE-12', 'SUMINISTRO ELÉCTRICO', 35),
  ('FLEX', 'FLEX-AIR-13', 'AIRE COMPRIMIDO', 36),
  ('FLEX', 'FLEX-GEN-14', 'CAMBIO GENERADOR', 37),
  ('A3FLEX', 'A3F-TPO-01', 'TPOP DISPLAY', 38),
  ('A3FLEX', 'A3F-ASE-01', 'CAMARA ASEPTICA', 39),
  ('A3FLEX', 'A3F-CAM-02', 'CAMARA DE SECADO', 40),
  ('A3FLEX', 'A3F-SELL-03', 'SELLADO LONGITUDINAL', 41),
  ('A3FLEX', 'A3F-SELL-24', 'SELLADO TRANSVERSAL', 42),
  ('A3FLEX', 'A3F-ELM-04', 'ELEMENTO PARADA CORTA', 43),
  ('A3FLEX', 'A3F-AIR-05', 'SISTEMA AIRE ESTERIL', 44),
  ('A3FLEX', 'A3F-LLE-06', 'SISTEMA DE LLENADO', 45),
  ('A3FLEX', 'A3F-PER-07', 'SITEMA PEROXIDO', 46),
  ('A3FLEX', 'A3F-SEG-08', 'SISTEMA DE SEGURIDAD', 47),
  ('A3FLEX', 'A3F-PAN-09', 'PANEL DE CONTROL', 48),
  ('A3FLEX', 'A3F-TRA-10', 'TRANSPORTADORES', 49),
  ('A3FLEX', 'A3F-SEG-11', 'SISTEMA SEGURIDAD', 50),
  ('A3FLEX', 'A3F-HID-12', 'SISTEMA HIDRAULICO', 51),
  ('A3FLEX', 'A3F-TRA-13', 'SISTEMA TRACCION', 52),
  ('A3FLEX', 'A3F-MOR-14', 'MORDAZAS', 53),
  ('A3FLEX', 'A3F-CORT-15', 'BRAZO DE CORTE', 54),
  ('A3FLEX', 'A3F-PRE-16', 'BRAZO DE PRESION', 55),
  ('A3FLEX', 'A3F-COR-17', 'CORREA ALIM PLEGADORA', 56),
  ('A3FLEX', 'A3F-PULL-18', 'PULL DOWN PLEGADORA', 57),
  ('A3FLEX', 'A3F-PRE-19', 'DISPOSITIVO PRENSOR', 58),
  ('A3FLEX', 'A3F-REF-20', 'SISTEMA REFRIGERACION', 59),
  ('A3FLEX', 'A3F-MES-21', 'MESA DE EMPALME', 60),
  ('A3FLEX', 'A3F-APL-22 APLICADOR DE TIRA', 'A3F-APL-22 APLICADOR DE TIRA', 61),
  ('A3FLEX', 'A3F-AIR-23', 'AIRE COMPRIMIDO', 62),
  ('A3FLEX', 'A3F-GEN-24', 'CAMBIO GENERADOR', 63),
  ('A3FLEX', 'A3F-ELE-25 SUMINISTRO ELÉCTRICO', 'A3F-ELE-25 SUMINISTRO ELÉCTRICO', 64),
  ('FW32', 'FW-TPO-01', 'TPOP DISPLAY', 65),
  ('FW32', 'FW-FRE-02', 'UNIDAD FRENO DE ENTRADA', 66),
  ('FW32', 'FW-AGR-03', 'UNIDAD AGRUPADORA', 67),
  ('FW32', 'FW-MAG-04', 'MAGAZING DE BOBINAS', 68),
  ('FW32', 'FW-SELL-05', 'UNIDAD DE SELLADO', 69),
  ('FW32', 'FW-TRA-06', 'UNIDAD TRANSF TREEPACK', 70),
  ('FW32', 'FW-TRAN-08', 'TRANSPORTADORES', 71),
  ('FW32', 'FW-PAN-09', 'PANEL DE CONTROL', 72),
  ('FW32', 'FW-AIR-10', 'AIRE COMPRIMIDO', 73),
  ('FW32', 'FW-ELE-11', 'SUMINISTRO ELÉCTRICO', 74),
  ('FW32', 'FW-GEN-12', 'CAMBIO GENERADOR', 75),
  ('HELIX', 'HEL-TPO-01', 'TPOP DISPLAY', 76),
  ('HELIX', 'HEL-CAD-02', 'CADENA ESLABONES', 77),
  ('HELIX', 'HEL-MOT-03', 'MOTOREDUCTOR', 78),
  ('HELIX', 'HEL-ARA-04', 'ARAÑA', 79),
  ('HELIX', 'HEL-DIS-10', 'DISPLAY', 80),
  ('HELIX', 'HEL-PAN-09', 'PANEL DE CONTROL', 81),
  ('HELIX', 'HEL-TRA-10', 'TRANSPORTADOES', 82),
  ('HELIX', 'HEL-ELE-12', 'SUMINISTRO ELÉCTRICO', 83),
  ('HELIX', 'HEL-AIR-13', 'AIRE COMPRIMIDO', 84),
  ('HELIX', 'HEL-GEN-14', 'CAMBIO GENERADOR', 85),
  ('HELIX', 'HEL-COM-15', 'COMPRESOR DE AIRE', 86),
  ('CAP', 'CAP-TPO-01', 'TPOPDISPLAY', 87),
  ('CAP', 'CAP-FRE-02', 'UNIDAD DE FRENO DE ENTRADA', 88),
  ('CAP', 'CAP-APL-03', 'APLICADOR DE TAPAS', 89),
  ('CAP', 'CAP-NOR-04', 'UNIDAD NORDSON', 90),
  ('CAP', 'CAP-RUE-05', 'UNIDAD APLICADORA TAPAS', 91),
  ('CAP', 'CAP-TRA-06', 'TRANSPORTADOR DE TAPAS', 92),
  ('CAP', 'CAP-INY-07', 'UNIDAD INYECCIO PEGA', 93),
  ('CAP', 'CAP-CORR-08', 'CORREA LINEA EMPAQUES', 94),
  ('CAP', 'CAP-PAN-09', 'PANEL DE CONTROL', 95),
  ('CAP', 'TRANSPORTADORES', 'TRANSPORTADORES', 96),
  ('CAP', 'CAP-ELE-11', 'SUMINISTRO ELÉCTRICO', 97),
  ('CAP', 'CAP-AIR-12', 'AIRE COMPRIMIDO', 98),
  ('CBP32', 'CBP-FRE-01', 'UNIDAD FRENO DE ENTRADA', 99),
  ('CBP32', 'CBP-FOR-02', 'FORMACION DE PATRON', 100),
  ('CBP32', 'CBP-AGR-03', 'AGRUPADOR', 101),
  ('CBP32', 'CBP-PLA-04', 'PLACA DE TRANSFERENCIA', 102),
  ('CBP32', 'CBP-EMP-05', 'EMPUJADOR', 103),
  ('CBP32', 'CBP-SEN-06', 'SENSOR ULTRASONIDO', 104),
  ('CBP32', 'CBP-CAD-07', 'CADENA ARRASTRADORA', 105),
  ('CBP32', 'CBP-TPO-08', 'TPOP', 106),
  ('CBP32', 'CBP-PAN-09', 'PANEL DE CONTROL', 107),
  ('CBP32', 'CBP-TRA-10', 'TRANSPORTADORES', 108),
  ('CBP32', 'CBP-NOR-11', 'UNIDAD NORDSON', 109),
  ('CBP32', 'CBP-AIR-12', 'AIRE COMPRIMIDO', 110),
  ('CBP32', 'CBP-MAG-13', 'MAGAZINE DE CARTONES', 111),
  ('CBP32', 'CBP-VEN-14', 'VENTOSAS', 112),
  ('CBP32', 'CBP-GRA-15', 'UNIDAD WRAP', 113),
  ('CBP32', 'CBP-SEN-16', 'SENSOR BANDEJA', 114),
  ('TAVIL', 'TAV-SEG-01', 'BARRERAS DE SEGURIDAD', 115),
  ('TAVIL', 'TAV-VAC-02', 'PALET VACÍO', 116),
  ('TAVIL', 'TAV-LLE-03', 'PALET LLENO', 117),
  ('TAVIL', 'TAV-FLE-04', 'FLEJADOR DE PALETAS', 118),
  ('TAVIL', 'TAV-MOT-05', 'MOTOREDUCTORES', 119),
  ('TAVIL', 'TAV-GAR-06', 'GUIAS/RODAMIENTOS GARRA', 120),
  ('TAVIL', 'TAV-TRA-07', 'TRANSPORTADOR BATERIA/LINEA', 121),
  ('TAVIL', 'TAV-DIS-08', 'DISPLAY', 122),
  ('TAVIL', 'TAV-CON-09', 'PANEL DE CONTROL', 123),
  ('TAVIL', 'TAV-PAL-10', 'TRANSPORTADOR DE PALETAS', 124),
  ('TAVIL', 'TAV-ELE-11', 'SUMINISTRO ELÉCTRICO', 125),
  ('TAVIL', 'TAV-AIR-12', 'AIRE COMPRIMIDO', 126),
  ('TAVIL', 'TAV-COM-13', 'PERDIDA DE COMUNICACION', 127),
  ('TAVIL', 'TAV-MOS-14', 'AJUSTE COORDENADAS', 128),
  ('TAVIL', 'TAV-GAR-15', 'CORREA SERVO GARRA', 129),
  ('DOMINO', 'DOM-ITM-01', 'ITM', 130),
  ('DOMINO', 'DOM-BOM-02', 'BOMBA', 131),
  ('DOMINO', 'DOM-BOQ-03', 'BOQUILA', 132),
  ('DOMINO', 'DOM-SEN-04', 'SENSOR', 133),
  ('DOMINO', 'DOM-CAB-05', 'CABEZAL', 134),
  ('DOMINO', 'DOM-PAN-06', 'PANEL DE CONTROL', 135),
  ('DOMINO', 'DOM-DIS-07', 'DISPLAY', 136),
  ('DOMINO', 'DOM-UPS-08', 'UPS', 137),
  ('DOMINO', 'DOM-CAB-09', 'CABEZAL', 138),
  ('DOMINO', 'DOM-ELE-10', 'SUMINISTRO ELÉCTRICO', 139),
  ('DOMINO', 'DOM-AIR-11', 'AIRE COMPRIMIDO', 140),
  ('A3CFLEX', 'A3CF-TPO-01', 'TPOP DISPLAY', 141),
  ('A3CFLEX', 'A3CF-ASE-01', 'CAMARA ASEPTICA', 142),
  ('A3CFLEX', 'A3CF-CAM-02', 'CAMARA DE SECADO', 143),
  ('A3CFLEX', 'A3CF-SELL-03', 'SELLADO LONGITUDINAL', 144),
  ('A3CFLEX', 'A3CF-SELL-24', 'SELLADO TRANSVERSAL', 145),
  ('A3CFLEX', 'A3CF-ELM-04', 'ELEMENT PARADA CORTA', 146),
  ('A3CFLEX', 'A3CF-AIR-05', 'SISTEMA AIRE ESTERIL', 147),
  ('A3CFLEX', 'A3CF-LLE-06', 'SISTEMA DE LLENADO', 148),
  ('A3CFLEX', 'A3CF-PER-07', 'SITEMA PEROXIDO', 149),
  ('A3CFLEX', 'A3CF-SEG-08', 'SISTEMA DE SEGURIDAD', 150),
  ('A3CFLEX', 'A3CF-PAN-09', 'PANEL DE CONTROL', 151),
  ('A3CFLEX', 'A3CF-TRA-10', 'TRANSPORTADORES', 152),
  ('A3CFLEX', 'A3CF-SEG-11', 'SISTEMA SEGURIDAD', 153),
  ('A3CFLEX', 'A3CF-HID-12', 'SISTEMA HIDRAULICO', 154),
  ('A3CFLEX', 'A3CF-TRA-13', 'SISTEMA TRACCION', 155),
  ('A3CFLEX', 'A3CF-MOR-14', 'MORDAZAS', 156),
  ('A3CFLEX', 'A3CF-CORT-15', 'BRAZO DE CORTE', 157),
  ('A3CFLEX', 'A3CF-PRE-16', 'BRAZO DE PRESION', 158),
  ('A3CFLEX', 'A3CF-COR-17', 'CORREA ALIM PLEGADORA', 159),
  ('A3CFLEX', 'A3CF-PULL-18', 'PULL DOWN PLEGADORA', 160),
  ('A3CFLEX', 'A3CF-PRE-19', 'DISPOSITIVO PRENSOR', 161),
  ('A3CFLEX', 'A3CF-REF-20', 'SISTEMA REFRIGERACION', 162),
  ('A3CFLEX', 'A3CF-MES-21', 'MESA DE EMPALME', 163),
  ('A3CFLEX', 'A3CF-APL-22 APLICADOR DE TIRA', 'A3CF-APL-22 APLICADOR DE TIRA', 164),
  ('A3CFLEX', 'A3CF-CON-23', 'PANEL DE CONTROL', 165),
  ('A3CFLEX', 'A3CF-TRA-24', 'TRANSPORTADORES', 166),
  ('A3CFLEX', 'A3CF-ELE-25', 'SUMINISTRO ELÉCTRICO', 167),
  ('A3CFLEX', 'A3CF-AIR-26', 'AIRE COMPRIMIDO', 168),
  ('A3CFLEX', 'A3CF-HI-27', 'BAJO FLUJO HI', 169),
  ('A3CFLEX', 'A3CF-HI-28', 'BAJA TEMPERATURA HI', 170),
  ('SA', 'SA-TPO-01', 'TPOP DISPLAY', 171),
  ('SA', 'SA-FRE-02', 'UNIDAD FRENO ENTRADA', 172),
  ('SA', 'SA-COR-03', 'CORREA CARGA VERTICAL', 173),
  ('SA', 'SA-NOR-04', 'UNIDAD NORDSON', 174),
  ('SA', 'SA-APL-05', 'UNIDAD APLICADORA', 175),
  ('SA', 'SA-PAN-06', 'PANEL DE CONTROL', 176),
  ('SA', 'SA-AIR-12', 'AIRE COMPRIMIDO', 177),
  ('SA', 'SA-TRANS-13', 'TRANSPORTADOR ENTRADA', 178),
  ('SA', 'SA-SER-14', 'SERVOMOTOR', 179),
  ('SA', 'SA-SEN-15', 'SENSOR', 180),
  ('PASTEURIZADOR', 'PAS-CON-01', 'CONTROLADOR PIROMETRO', 181),
  ('PASTEURIZADOR', 'PAS-BOM-02', 'BOMBA AGUA CALIENTE', 182),
  ('PASTEURIZADOR', 'PAS-PRO-03', 'BOMBA DE PRODUCTO', 183),
  ('PASTEURIZADOR', 'PAS-MAN-04', 'MANIFOL VALVULAS', 184),
  ('PASTEURIZADOR', 'PAS-REG-05', 'VALVULA REGULADORA', 185),
  ('PASTEURIZADOR', 'PAS-TAN-06', 'TANQUE BALANZA', 186),
  ('PASTEURIZADOR', 'PAS-PLA-07', 'PLACAS INTERCAMBIADOR', 187),
  ('PASTEURIZADOR', 'PAS-DIV-08', 'VALVULA DIVERSORA', 188),
  ('PASTEURIZADOR', 'PAS-VAL-09', 'VALVULA DE VAPOR', 189),
  ('PASTEURIZADOR', 'PAS-PAN-10', 'PANEL DE CONTROL', 190),
  ('PASTEURIZADOR', 'PAS-ELE-11', 'SUMINISTRO ELÉCTRICO', 191),
  ('PASTEURIZADOR', 'PAS-AIR-12', 'AIRE COMPRIMIDO', 192),
  ('PASTEURIZADOR', 'PAS-FLU-13', 'CONTADOR DE AGUA', 193),
  ('BOMBA DE DIAFRAGMA', 'BOM-MEN-01', 'DISCOS MEMBRANAS', 194),
  ('BOMBA DE DIAFRAGMA', 'BOM-SELLO-02', 'SELLOS VASTAGO', 195),
  ('BOMBA DE DIAFRAGMA', 'BOM-BLO-03', 'BLOQUE NEUMATICO', 196),
  ('BOMBA DE DIAFRAGMA', 'BOM-ESF-04', 'ESFERAS CHECK', 197),
  ('BOMBA DE DIAFRAGMA', 'BOMB-AIR-05', 'AIRE COMPRIMIDO', 198),
  ('BOMBA DE DIAFRAGMA', 'BOM-GUI-06', 'GUIA DE VASTAGO', 199),
  ('BOMBA DE DIAFRAGMA NECTAR', 'BOM-MEN-01', 'DISCOS MEMBRANAS', 200),
  ('BOMBA DE DIAFRAGMA NECTAR', 'BOM-SELLO-02', 'SELLOS VASTAGO', 201),
  ('BOMBA DE DIAFRAGMA NECTAR', 'BOM-BLO-03', 'BLOQUE NEUMATICO', 202),
  ('BOMBA DE DIAFRAGMA NECTAR', 'BOM-ESF-04', 'ESFERAS CHECK', 203),
  ('BOMBA DE DIAFRAGMA NECTAR', 'BOMB-AIR-05', 'AIRE COMPRIMIDO', 204),
  ('BOMBA DE DIAFRAGMA NECTAR', 'BOM-GUI-06', 'GUIA DE VASTAGO', 205),
  ('DESPALETIZADOR ALUMINIO', 'DES-BOM-01', 'BOMBA HIDRÁULICA', 206),
  ('DESPALETIZADOR ALUMINIO', 'DES-BOM-02', 'CILINDRO HIDRÁULICO', 207),
  ('DESPALETIZADOR ALUMINIO', 'DES-CAD-03', 'CADENA ENTRADA DE PALETA', 208),
  ('DESPALETIZADOR ALUMINIO', 'DES-MES-04', 'MESA DE ELEVACION', 209),
  ('DESPALETIZADOR ALUMINIO', 'DES-MAL-05', 'MALLA MODULAR DE LATAS', 210),
  ('DESPALETIZADOR ALUMINIO', 'DES-PAN-06', 'PANEL DE CONTROL', 211),
  ('DESPALETIZADOR ALUMINIO', 'DES-ELE-07', 'SUMINISTRO ELÉCTRICO', 212),
  ('DESPALETIZADOR ALUMINIO', 'DES-AIR-08', 'AIRE COMPRIMIDO', 213),
  ('DESPALETIZADOR COLADOS', 'DES-MES-01', 'MESA ENTRADA DE PALETAS', 214),
  ('DESPALETIZADOR COLADOS', 'DES-MES-02', 'MESA SALIDA DE PALETAS', 215),
  ('DESPALETIZADOR COLADOS', 'DES-ACU-03', 'ACUMULADOR DE PALETAS', 216),
  ('DESPALETIZADOR COLADOS', 'DES-PAL-04', 'PALPADOR DE CAMADA', 217),
  ('DESPALETIZADOR COLADOS', 'DES-MES-05', 'CARRO BARREDOR DE CAMADA', 218),
  ('DESPALETIZADOR COLADOS', 'DES-PIN-06', 'PINZA SUJETADORA', 219),
  ('DESPALETIZADOR COLADOS', 'DESP-ELE-07', 'CARRO DE ELEVACION', 220),
  ('DESPALETIZADOR COLADOS', 'DESP-PAN-08', 'PANEL DE CONTROL', 221),
  ('DESPALETIZADOR COLADOS', 'DESP-DIS-09', 'DISPLAY', 222),
  ('DESPALETIZADOR COLADOS', 'DES-AIR-10', 'AIRE COMPRIMIDO', 223),
  ('DESPALETIZADOR COLADOS', 'DES-ELE-11', 'SUMINISTRO ELÉCTRICO', 224),
  ('GUAYA TRANSPORTE', 'GUA-RED-01', 'MOTOREDUCTOR', 225),
  ('GUAYA TRANSPORTE', 'GUA-POL-02', 'POLEAS', 226),
  ('GUAYA TRANSPORTE', 'GUA-TRA-03', 'TRANSPORTADOR GUAYA', 227),
  ('GUAYA TRANSPORTE', 'GUA-BAR-04', 'BARANDAS', 228),
  ('GUAYA TRANSPORTE', 'GUA-PAN-05', 'PANEL DE CONTROL', 229),
  ('GUAYA TRANSPORTE', 'GUA-VOL-06', 'BAJANTE-VOLTEADOR', 230),
  ('LLENADORA ELMAR', 'LLE-DIS-01', 'DISPLAY', 231),
  ('LLENADORA ELMAR', 'LLE-MOT-02', 'MOTOREDUCTOR TRASPORTADOR', 232),
  ('LLENADORA ELMAR', 'LLE-SIN-03', 'TORNILLO SINFIN', 233),
  ('LLENADORA ELMAR', 'LLE-EST-04', 'ESTRELLA ENTRADA', 234),
  ('LLENADORA ELMAR', 'LLE-VAL-05', 'VALVULAS DE LLENADO', 235),
  ('LLENADORA ELMAR', 'LLE-PRO-06', 'VALVULA DE PRODUCTO', 236),
  ('LLENADORA ELMAR', 'LLE-PIS-07', 'PISTONES', 237),
  ('LLENADORA ELMAR', 'LLE-LEV-08', 'LEVA DE APERTURA VALVULA', 238),
  ('LLENADORA ELMAR', 'LLE-VOL-09', 'SISTEMA AJUSTE VOLUMEN', 239),
  ('LLENADORA ELMAR', 'LLE-TRA-010', 'TRANSP ENTRADA-SALIDA', 240),
  ('LLENADORA ELMAR', 'LLE-PAN-011', 'PANEL DE CONTROL', 241),
  ('LLENADORA ELMAR', 'LLE-ELE-12', 'SUMINISTRO ELECTRICO', 242),
  ('LLENADORA ELMAR', 'LLE-AIR-13', 'AIRE COMPRIMIDO', 243),
  ('SELLADORA ANGELUS', 'SELL-CAD-01', 'CADENA AGRUPADORA', 244),
  ('SELLADORA ANGELUS', 'SELL-BAJ-02', 'BAJANTA DE TAPAS', 245),
  ('SELLADORA ANGELUS', 'SELL-DOS-03', 'DOSIFICADOR DE NITROGENO', 246),
  ('SELLADORA ANGELUS', 'SELL-PLA-04', 'PLATOS', 247),
  ('SELLADORA ANGELUS', 'SELL-OPE-05', 'OPERACIONES DE SELLADO', 248),
  ('SELLADORA ANGELUS', 'SELL-DOS-06', 'DOSIFICADOR DE TAPAS', 249),
  ('SELLADORA ANGELUS', 'SELL-PAN-07', 'PANEL DE CONTROL', 250),
  ('SELLADORA ANGELUS', 'SELL-AIR-08', 'AIRE COMPRIMIDO', 251),
  ('SELLADORA ANGELUS', 'SELL-ELE-09', 'SUMINISTRO ELECTRICO', 252),
  ('SELLADORA ANGELUS', 'SELL-PIÑ-10', 'PIÑON TRASMISION CADENA', 253),
  ('VA Y VEN', 'VAY-MOT-01', 'MOTOREDUCTOR', 254),
  ('VA Y VEN', 'VAY-CAD-02', 'CADENA TRANSPORTADOR', 255),
  ('VA Y VEN', 'VAY-PIÑ-03', 'PIÑON MOTRIZ', 256),
  ('VA Y VEN', 'VAY-CON-04', 'PIÑON CONDUCIDO', 257),
  ('VA Y VEN', 'VAY-PAN-05', 'PANEL DE CONTROL', 258),
  ('VA Y VEN', 'VAY-ELE-06', 'SUMINSTRO ELECTRICO', 259),
  ('TUNEL', 'TUN-MOT-01', 'MOTOREDUCTOR', 260),
  ('TUNEL', 'TUN-MALL-02', 'MALLA TUNEL', 261),
  ('TUNEL', 'TUN-TRAS-03', 'TRASNPORTADOR ENTRADA-SALIDA', 262),
  ('TUNEL', 'TUN-BOM-04', 'BOMBA ROCIADORES', 263),
  ('TUNEL', 'TUN-BOM-05', 'BOMBA RECIRCULACION', 264),
  ('TUNEL', 'TUN-PAN-06', 'PANEL DE CONTROL', 265),
  ('TUNEL', 'TUN-DIS-07', 'DISPLAY', 266),
  ('TUNEL', 'TUN-ELE-08', 'SUMINISTRO ELECTRICO', 267),
  ('EMBALADORA GAMMA', 'EMB-DIS-01', 'DISPLAY', 268),
  ('EMBALADORA GAMMA', 'EMB-PAN-02', 'PANEL DE CONTROL', 269),
  ('EMBALADORA GAMMA', 'EMB-PRE-03', 'ZONA PREFORMADO', 270),
  ('EMBALADORA GAMMA', 'EMB-BAR-04', 'BARRAS EMPUJADORAS', 271),
  ('EMBALADORA GAMMA', 'EMB-SOL-05', 'SOLDADOR', 272),
  ('EMBALADORA GAMMA', 'EMB-MAG-06', 'MAGAZING DE CARTONES', 273),
  ('EMBALADORA GAMMA', 'EMB-CAD-07', 'CADENA DE CARTONES', 274),
  ('EMBALADORA GAMMA', 'EMB-VEN-08', 'VENTOSAS DE VACIO', 275),
  ('EMBALADORA GAMMA', 'EMB-DES-09', 'SISTEMA DESBOBINADO', 276),
  ('EMBALADORA GAMMA', 'EMB-PIR-10', 'PIROMETRO', 277),
  ('EMBALADORA GAMMA', 'EMB-AIR-11', 'AIRE COMPRIMIDO', 278),
  ('EMBALADORA GAMMA', 'EMB-ELE-12', 'SUMINISTRO ELECTRICO', 279),
  ('HORNO', 'HOR-RES-01', 'RESISTENCIAS', 280),
  ('HORNO', 'HOR-TUR-02', 'TURBINA', 281),
  ('HORNO', 'HOR-MOT-03', 'MOTOREDUCTOR', 282),
  ('HORNO', 'HOR-PIR-04', 'PIROMETRO', 283),
  ('HORNO', 'HOR-PAN-05', 'PANEL DE CONTROL', 284),
  ('HORNO', 'HOR-CAD-06', 'CADENA HORNO', 285),
  ('HORNO', 'HOR-VAR-07', 'VARIADOR DE FRECUENCIA', 286),
  ('TRANSPORTADORES', 'TRAN-EJE-01', 'EJE MOTRIZ-CONDUCIDO', 287),
  ('TRANSPORTADORES', 'TRAN-PIÑ-02', 'PIÑON MOTRIZ-CONDUCIDO', 288),
  ('TRANSPORTADORES', 'TRAN-CAD-03', 'CADENA TABLETOP', 289),
  ('TRANSPORTADORES', 'TRAN-CHU-04', 'CHUMACERA', 290),
  ('TRANSPORTADORES', 'TRAN-MOT-05', 'MOTOREDUCTOR', 291),
  ('TRANSPORTADORES', 'TRAN-VAR-06', 'VARIADOR DE FRECUENCIA', 292),
  ('TRANSPORTADORES', 'TRAN-PAN-07', 'PANEL DE CONTROL', 293),
  ('TRANSPORTADORES', 'TRAN-GUI-08', 'GUIAS', 294),
  ('TANQUE COCCION', 'TAN-MUL-01', 'CONTROLADOR MULTICON', 295),
  ('TANQUE COCCION', 'TAN-BOM-02', 'BOMBA POSITIVA', 296),
  ('TANQUE COCCION', 'TAN-VAL-03', 'VALVULA DE VAPOR', 297),
  ('TANQUE COCCION', 'TAN-INY-04', 'INYECTORES DE VAPOR', 298),
  ('TANQUE COCCION', 'TAN-MOT-05', 'MOTOREDUCTOR-AGITADOR', 299),
  ('TANQUE COCCION', 'TAN-TER-06', 'TERMOCUPLA', 300),
  ('TANQUE COCCION', 'TAN-VAL-07', 'VALVULAS NEUMATICAS', 301),
  ('TANQUE 6000', 'TAN-BOM-01', 'BOMBA CENTRIFUGA', 302),
  ('TANQUE 6000', 'TAN-POS-02', 'BOMBA POSITIVA', 303),
  ('TANQUE 6000', 'TAN-VAL-03', 'VALVULAS CIERRE RAPIDO', 304),
  ('PICKHEATER', 'PICK-MUL-01', 'CONTROLADOR MULTICOM', 305),
  ('PICKHEATER', 'PICK-VAL-02', 'VALVULA MODULADORA  DE VAPOR', 306),
  ('PICKHEATER', 'PICK-TER-03', 'TERMOCUPLA', 307),
  ('PICKHEATER', 'PICK-AIR-04', 'AIRE COMPRIMIDO', 308),
  ('PICKHEATER', 'PICK-VAL-05', 'VALVULA DE COMPUERTA VAPOR', 309),
  ('PICKHEATER', 'PICK-CON-06', 'CONTROLADOR HONEYWELL', 310),
  ('PICKHEATER', 'PICK-PAN-07', 'PANEL DE CONTROL', 311),
  ('PICKHEATER', 'PICK-PRE-08', 'VALVULA REGULADORA DE PRESION', 312),
  ('PICKHEATER', 'PICK-DIV-09', 'VALVULA DIVERSORA', 313),
  ('DESAIREADOR', 'DESA-CON-01', 'CONTROLADOR DE VACIO', 314),
  ('DESAIREADOR', 'DESA-POS-02', 'BOMBA POSITIVA', 315),
  ('DESAIREADOR', 'DESA-RED-03', 'MOTOREDUCTOR', 316),
  ('DESAIREADOR', 'DESA-PAN-07', 'PANEL DE CONTROL', 317),
  ('DESAIREADOR', 'DESA-VAL-08', 'VALVULAS', 318),
  ('DESAIREADOR', 'DESA-BOM-09', 'BOMBA DE VACIO', 319),
  ('BOMBA VACÍO', 'BOM-ROD-01', 'RODAMIENTOS', 320),
  ('BOMBA VACÍO', 'BOM-EJE-02', 'EJE', 321),
  ('BOMBA VACÍO', 'BOM-ACP-03', 'ACOPLE', 322),
  ('BOMBA VACÍO', 'BOM-MOT-04', 'MOTOR', 323),
  ('BOMBA VACÍO', 'BOM-SEL-05', 'VALVULA SELENOIDE', 324),
  ('BOMBA VACÍO', 'BOM-PAN-06', 'PANEL DE CONTROL', 325),
  ('RINSER', 'RIN-PAN-01', 'PANEL DE CONTROL', 326),
  ('RINSER', 'RIN-CAD-02', 'CADENA DE CANGILONES', 327),
  ('RINSER', 'RIN-MOT-03', 'MOTOREDUCTOR', 328),
  ('RINSER', 'RIN-SOP-04', 'SOPLADOR', 329),
  ('RINSER', 'RIN-VAC-05', 'SITEMA DE VACIO', 330),
  ('RINSER', 'RIN-TRAS-06', 'TRANSPORTADORES', 331),
  ('RINSER', 'RIN-CHU-07', 'CHUMACERAS', 332),
  ('RINSER', 'RIN-CLIP-08', 'CLIPPER', 333),
  ('RINSER', 'RIN-SEN-09', 'SENSOR', 334),
  ('TAPADORA WHITECAP', 'TAP-CORR-01', 'CORREA DE CARGA VERTICAL', 335),
  ('TAPADORA WHITECAP', 'TAP-CORR-02', 'CORREAS LATERALES', 336),
  ('TAPADORA WHITECAP', 'TAP-MOT-03', 'MOTOREDUCTOR', 337),
  ('TAPADORA WHITECAP', 'TAP-BAJ-04', 'BAJANTE DE TAPAS', 338),
  ('TAPADORA WHITECAP', 'TAP-VAL-05', 'VALVULA REGULADORA DE VAPOR', 339),
  ('TAPADORA WHITECAP', 'TAP-ROD-06', 'RODILLOS DE GRAFITO', 340),
  ('TAPADORA WHITECAP', 'TAP-TEN-07', 'TENSORES DE RODILLOS', 341),
  ('TAPADORA WHITECAP', 'TAP-PAN-08', 'PANEL DE CONTROL', 342),
  ('TAPADORA WHITECAP', 'TAP-VAR-09', 'VARIADOR DE FRECUENCIA', 343),
  ('TAPADORA WHITECAP', 'TAP-COM-10', 'COMPRESOR DE AIRE', 344),
  ('SOPLADOR', 'SOPL-TUR-01', 'TURBINA', 345),
  ('SOPLADOR', 'SOPL-MAN-02', 'MANGUERAS', 346),
  ('SOPLADOR', 'SOPL-MOT-03', 'MOTOR', 347),
  ('SOPLADOR', 'SOPL-CAB-04', 'CABEZALES DE SOPLADO', 348),
  ('DETECTOR DE VACÍO', 'DET-DIS-01', 'DIPLAY CONTROL', 349),
  ('DETECTOR DE VACÍO', 'DET-SEN-02', 'SENSOR', 350),
  ('DETECTOR DE VACÍO', 'DET-DES-03', 'DESCARTADOR DE ENVASES', 351),
  ('DETECTOR DE VACÍO', 'DET-ELE-04', 'ELECTROVALVULA', 352),
  ('ETIQUETADORA', 'ETIQ-TOR-01', 'TORNILLO SIN FIN', 353),
  ('ETIQUETADORA', 'ETIQ-EST-02', 'ESTRELLAS ENTRDA-SALIDA', 354),
  ('ETIQUETADORA', 'ETIQ-TUL-03', 'TULIPAS', 355),
  ('ETIQUETADORA', 'ETIQ-PLA-04', 'PLATOS', 356),
  ('ETIQUETADORA', 'ETIQ-NOR-05', 'UNIDAD NORDSON', 357),
  ('ETIQUETADORA', 'ETIQ-PIS-06', 'PISTOLAS DE PEGA', 358),
  ('ETIQUETADORA', 'ETIQ-MAG-07', 'MAGAZIN DE ETIQUETAS', 359),
  ('ETIQUETADORA', 'ETIQ-AIR-08', 'AIRE COMPRIMIDO', 360),
  ('ETIQUETADORA', 'ETIQ-PAN-09', 'PANEL DE CONTROL', 361),
  ('ETIQUETADORA', 'ETIQ-TRAS-10', 'TRANSPORTADORES', 362),
  ('ETIQUETADORA', 'ETIQ-MOT-11', 'MOTOREDUCTOR', 363),
  ('ETIQUETADORA', 'ETIQ-COM-12', 'COMPRESOR DE AIRE', 364),
  ('TECMI', 'TEC-MAG-01', 'MAGAZIN DE CARTON', 365),
  ('TECMI', 'TEC-SOL-13', 'SOLDADOR', 366),
  ('TECMI', 'TEC-VEN-02', 'VENTOSAS DE VACIO', 367),
  ('TECMI', 'TEC-CAD-03', 'CADENA DE CARTON', 368),
  ('TECMI', 'TEC-COM-04', 'SISTEMA DE COMPUERTAS', 369),
  ('TECMI', 'TEC-BAR-05', 'BARANDAS PRE FORMADO', 370),
  ('TECMI', 'TEC-MES-06', 'MESAS DE LONAS', 371),
  ('TECMI', 'TEC-RAM-07', 'RAMPA POLIETILENO', 372),
  ('TECMI', 'TEC-ROD-08', 'RODILLO DESBOBINADOR', 373),
  ('TECMI', 'TEC-TRAS-09', 'SISTEMA DE TRANSMISION', 374),
  ('TECMI', 'TEC-DIS-10', 'DIAPLAY', 375),
  ('TECMI', 'TEC-PAN-11', 'PANEL DE CONTROL', 376),
  ('TECMI', 'TEC-AIR-12', 'AIRE COMPRIMIDO', 377),
  ('ROBOT MOTOMAN', 'ROB-TECH-01', 'TEACH PENDANT', 378),
  ('ROBOT MOTOMAN', 'ROB-TRAS-02', 'TRANSPORTADOR', 379),
  ('ROBOT MOTOMAN', 'ROB-GAR-03', 'GARRA', 380),
  ('ROBOT MOTOMAN', 'ROB-SEN-04', 'SENSORES', 381),
  ('ROBOT MOTOMAN', 'ROB-PAN-05', 'PANEL DE CONTROL', 382),
  ('ROBOT MOTOMAN', 'ROB-CAD-06', 'TRANSPORTES DE PALETAS', 383),
  ('ROBOT MOTOMAN', 'ROB-AIR-07', 'AIRE COMPRIMIDO', 384),
  ('ROBOT MOTOMAN', 'ROB-ELE-08', 'ELECTROVALVULAS', 385),
  ('ROBOT MOTOMAN', 'ROB-POL-09', 'TOPE POLICIA', 386),
  ('ROBOT MOTOMAN', 'ROB-SUM-10', 'SUMINISTRO ELECTRICO', 387),
  ('ROBOT MOTOMAN', 'ROB-COM-11', 'COMPRESOR DE AIRE', 388),
  ('EMBALADORA TECMI', 'TEC-MAG-01', 'MAGAZIN DE CARTON', 389),
  ('EMBALADORA TECMI', 'TEC-SOL-13', 'SOLDADOR', 390),
  ('EMBALADORA TECMI', 'TEC-VEN-02', 'VENTOSAS DE VACIO', 391),
  ('EMBALADORA TECMI', 'TEC-CAD-03', 'CADENA DE CARTON', 392),
  ('EMBALADORA TECMI', 'TEC-COM-04', 'SISTEMA DE COMPUERTAS', 393),
  ('EMBALADORA TECMI', 'TEC-BAR-05', 'BARANDAS PRE FORMADO', 394),
  ('EMBALADORA TECMI', 'TEC-MES-06', 'MESAS DE LONAS', 395),
  ('EMBALADORA TECMI', 'TEC-RAM-07', 'RAMPA POLIETILENO', 396),
  ('EMBALADORA TECMI', 'TEC-ROD-08', 'RODILLO DESBOBINADOR', 397),
  ('EMBALADORA TECMI', 'TEC-TRAS-09', 'SISTEMA DE TRANSMISION', 398),
  ('EMBALADORA TECMI', 'TEC-DIS-10', 'DIAPLAY', 399),
  ('EMBALADORA TECMI', 'TEC-PAN-11', 'PANEL DE CONTROL', 400),
  ('EMBALADORA TECMI', 'TEC-AIR-12', 'AIRE COMPRIMIDO', 401),
  ('EMBALADORA TECMI', 'TEC-COM-13', 'COMPRESOR DE AIRE', 402),
  ('ROBOT TAVIL', 'TAV-SEG-01', 'BARRERAS DE SEGURIDAD', 403),
  ('ROBOT TAVIL', 'TAV-VAC-02', 'PALET VACÍO', 404),
  ('ROBOT TAVIL', 'TAV-LLE-03', 'PALET LLENO', 405),
  ('ROBOT TAVIL', 'TAV-FLE-04', 'FLEJADOR DE PALETAS', 406),
  ('ROBOT TAVIL', 'TAV-MOT-05', 'MOTOREDUCTORES', 407),
  ('ROBOT TAVIL', 'TAV-GAR-06', 'GUIAS/RODAMIENTOS GARRA', 408),
  ('ROBOT TAVIL', 'TAV-TRA-07', 'TRANSPORTADOR BATERIA/LINEA', 409),
  ('ROBOT TAVIL', 'TAV-DIS-08', 'DISPLAY', 410),
  ('ROBOT TAVIL', 'TAV-CON-09', 'PANEL DE CONTROL', 411),
  ('ROBOT TAVIL', 'TAV-PAL-10', 'TRANSPORTADOR DE PALETAS', 412),
  ('ROBOT TAVIL', 'TAV-ELE-11', 'SUMINISTRO ELÉCTRICO', 413),
  ('ROBOT TAVIL', 'TAV-AIR-12', 'AIRE COMPRIMIDO', 414),
  ('ROBOT TAVIL', 'TAV-COM-13', 'PERDIDA DE COMUNICACION', 415),
  ('ROBOT TAVIL', 'TAV-MOS-14', 'AJUSTE COORDENADAS', 416),
  ('ROBOT TAVIL', 'TAV-TRA-14', 'TRNASPORTADORES DE CAJAS', 417),
  ('ROBOT TAVIL', 'TAV-TOP-15', 'POLICIA TOPE DE PALETAS', 418),
  ('ROBOT TAVIL', 'TAV-GAR-15', 'CORREA SERVO GARRA', 419),
  ('ALCIP', 'ALC-TPO-01', 'TPOP DISPLAY', 420),
  ('ALCIP', 'ALC-PLC-02', 'PLC', 421),
  ('ALCIP', 'ALC-VAL-03', 'VÁLVULAS', 422),
  ('ALCIP', 'ALC-PAN-04', 'PANEL DE CONTROL', 423),
  ('ALCIP', 'ALC-TAN-05', 'TANQUES', 424),
  ('ALCIP', 'ALC-BOM-06', 'BOMBAS', 425)
) as v(equipo, codigo, nombre, orden)
join paradas_equipos e on e.nombre = v.equipo;

insert into paradas_equipos_lineas (equipo_id, linea_id)
select e.id, l.id
from (values
  ('ASEPTICO', 'LINEA_1', 'A3FLEX'),
  ('ASEPTICO', 'LINEA_1', 'ALMIX'),
  ('ASEPTICO', 'LINEA_1', 'CAP'),
  ('ASEPTICO', 'LINEA_1', 'CBP32'),
  ('ASEPTICO', 'LINEA_1', 'DOMINO'),
  ('ASEPTICO', 'LINEA_1', 'DRINK'),
  ('ASEPTICO', 'LINEA_1', 'FLEX'),
  ('ASEPTICO', 'LINEA_1', 'HELIX'),
  ('ASEPTICO', 'LINEA_1', 'TAVIL'),
  ('ASEPTICO', 'LINEA_2', 'A3CFLEX'),
  ('ASEPTICO', 'LINEA_2', 'ALCIP'),
  ('ASEPTICO', 'LINEA_2', 'ALMIX'),
  ('ASEPTICO', 'LINEA_2', 'CBP32'),
  ('ASEPTICO', 'LINEA_2', 'DOMINO'),
  ('ASEPTICO', 'LINEA_2', 'FW32'),
  ('ASEPTICO', 'LINEA_2', 'HELIX'),
  ('ASEPTICO', 'LINEA_2', 'SA'),
  ('ASEPTICO', 'LINEA_2', 'SAP'),
  ('ASEPTICO', 'LINEA_2', 'TAVIL'),
  ('ASEPTICO', 'LINEA_3', 'A3CFLEX'),
  ('ASEPTICO', 'LINEA_3', 'CAP'),
  ('ASEPTICO', 'LINEA_3', 'CBP32'),
  ('ASEPTICO', 'LINEA_3', 'DOMINO'),
  ('ASEPTICO', 'LINEA_3', 'DRINK'),
  ('ASEPTICO', 'LINEA_3', 'FW32'),
  ('ASEPTICO', 'LINEA_3', 'HELIX'),
  ('ASEPTICO', 'LINEA_3', 'SA'),
  ('ASEPTICO', 'LINEA_3', 'SAP'),
  ('ASEPTICO', 'LINEA_3', 'TAVIL'),
  ('VACIO', 'LINEA_1', 'DESPALETIZADOR ALUMINIO'),
  ('VACIO', 'LINEA_1', 'DOMINO'),
  ('VACIO', 'LINEA_1', 'EMBALADORA GAMMA'),
  ('VACIO', 'LINEA_1', 'GUAYA TRANSPORTE'),
  ('VACIO', 'LINEA_1', 'HORNO'),
  ('VACIO', 'LINEA_1', 'LLENADORA ELMAR'),
  ('VACIO', 'LINEA_1', 'PASTEURIZADOR'),
  ('VACIO', 'LINEA_1', 'ROBOT TAVIL'),
  ('VACIO', 'LINEA_1', 'SELLADORA ANGELUS'),
  ('VACIO', 'LINEA_1', 'TRANSPORTADORES'),
  ('VACIO', 'LINEA_1', 'TUNEL'),
  ('VACIO', 'LINEA_1', 'VA Y VEN'),
  ('VACIO', 'LINEA_2', 'EMBALADORA TECMI'),
  ('VACIO', 'LINEA_3', 'DESAIREADOR'),
  ('VACIO', 'LINEA_3', 'DESPALETIZADOR'),
  ('VACIO', 'LINEA_3', 'DESPALETIZADOR COLADOS'),
  ('VACIO', 'LINEA_3', 'DOMINO'),
  ('VACIO', 'LINEA_3', 'ETIQUETADORA'),
  ('VACIO', 'LINEA_3', 'LLENADORA ELMAR'),
  ('VACIO', 'LINEA_3', 'PICKHEATER'),
  ('VACIO', 'LINEA_3', 'RINSER'),
  ('VACIO', 'LINEA_3', 'ROBOT MOTOMAN'),
  ('VACIO', 'LINEA_3', 'TANQUE 6000'),
  ('VACIO', 'LINEA_3', 'TANQUE COCCION'),
  ('VACIO', 'LINEA_3', 'TAPADORA WHITECAP'),
  ('VACIO', 'LINEA_3', 'TECMI'),
  ('VACIO', 'LINEA_3', 'TRANSPORTADORES'),
  ('VACIO', 'LINEA_3', 'TUNEL')
) as v(area, linea, equipo)
join paradas_equipos e on e.nombre = v.equipo
join areas a on a.codigo = v.area
join lineas l on l.area_id = a.id and l.codigo = v.linea;

-- ------------------------------------------------------------
-- listar_paradas_equipos(): equipos con sus subsistemas y líneas.
-- Cada línea se identifica por área + código (LINEA_1/2/3).
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
    'subsistemas', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', s.codigo, 'nombre', s.nombre, 'activo', s.activo) order by s.orden, s.codigo)
      from paradas_subsistemas s where s.equipo_id = e.id
    ), '[]'::jsonb),
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

-- ------------------------------------------------------------
-- guardar_parada_equipo(): crea (p_codigo_original null) o edita un equipo,
-- sus subsistemas y las líneas donde existe. Solo SUPERADMINISTRADOR.
--   p_subsistemas: [{"codigo": "...", "nombre": "...", "activo": true}]
--   p_lineas:      [{"area": "ASEPTICO", "linea": "LINEA_1"}]
-- Un subsistema que ya no viene en la lista se desactiva (no se borra).
-- ------------------------------------------------------------
create or replace function guardar_parada_equipo(
  p_usuario text,
  p_codigo_original text,
  p_codigo text,
  p_nombre text,
  p_subsistemas jsonb,
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
  v_despues jsonb;
  v_n integer := 0;
  s jsonb;
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
    select jsonb_build_object(
      'nombre', e.nombre,
      'subsistemas', (select count(*) from paradas_subsistemas x where x.equipo_id = e.id and x.activo),
      'lineas', (select count(*) from paradas_equipos_lineas x where x.equipo_id = e.id))
    into v_antes from paradas_equipos e where e.id = v_id;
    update paradas_equipos set nombre = v_nombre, updated_at = now() where id = v_id;
  end if;

  -- Subsistemas: alta/edición de los que vienen; desactiva los que ya no.
  update paradas_subsistemas set activo = false where equipo_id = v_id;
  for s in select * from jsonb_array_elements(coalesce(p_subsistemas, '[]'::jsonb)) loop
    v_n := v_n + 1;
    if coalesce(trim(s ->> 'codigo'), '') = '' or coalesce(trim(s ->> 'nombre'), '') = '' then
      raise exception 'Cada subsistema necesita código y nombre.';
    end if;
    insert into paradas_subsistemas (equipo_id, codigo, nombre, orden, activo)
    values (v_id, trim(s ->> 'codigo'), trim(s ->> 'nombre'), v_n, coalesce((s ->> 'activo')::boolean, true))
    on conflict (equipo_id, codigo) do update
      set nombre = excluded.nombre, orden = excluded.orden, activo = excluded.activo;
  end loop;

  -- Líneas donde existe el equipo.
  delete from paradas_equipos_lineas where equipo_id = v_id;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    insert into paradas_equipos_lineas (equipo_id, linea_id)
    select v_id, ln.id
    from lineas ln join areas a on a.id = ln.area_id
    where a.codigo = l ->> 'area' and ln.codigo = l ->> 'linea'
    on conflict do nothing;
  end loop;

  select jsonb_build_object(
    'nombre', e.nombre,
    'subsistemas', (select count(*) from paradas_subsistemas x where x.equipo_id = e.id and x.activo),
    'lineas', (select count(*) from paradas_equipos_lineas x where x.equipo_id = e.id))
  into v_despues from paradas_equipos e where e.id = v_id;

  perform registrar_auditoria(
    p_usuario,
    case when p_codigo_original is null then 'CREAR' else 'EDITAR' end,
    'paradas_equipos', v_id::text, p_pagina,
    format('%s el equipo «%s» (%s subsistemas, %s líneas)',
           case when p_codigo_original is null then 'Creó' else 'Editó' end, v_nombre,
           v_despues ->> 'subsistemas', v_despues ->> 'lineas'),
    v_antes, v_despues
  );
end;
$$;

grant execute on function guardar_parada_equipo(text, text, text, text, jsonb, jsonb, text) to anon, authenticated;

create or replace function cambiar_activo_parada_equipo(
  p_usuario text,
  p_codigo text,
  p_activo boolean,
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
  v_equipo paradas_equipos;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;

  select * into v_equipo from paradas_equipos where codigo = p_codigo;
  if not found then
    raise exception 'No se encontró el equipo.';
  end if;
  if v_equipo.activo = p_activo then
    return;
  end if;

  update paradas_equipos set activo = p_activo, updated_at = now() where id = v_equipo.id;

  perform registrar_auditoria(
    p_usuario, case when p_activo then 'ACTIVAR' else 'DESACTIVAR' end, 'paradas_equipos', v_equipo.id::text, p_pagina,
    format('%s el equipo «%s»', case when p_activo then 'Activó' else 'Desactivó' end, v_equipo.nombre),
    jsonb_build_object('activo', v_equipo.activo),
    jsonb_build_object('activo', p_activo)
  );
end;
$$;

grant execute on function cambiar_activo_parada_equipo(text, text, boolean, text) to anon, authenticated;

-- ------------------------------------------------------------
-- registrar_parada(): igual que en 20261061 + parada MECÁNICA.
-- Con p_equipo_codigo la parada es NO_PROGRAMADA de ese equipo (y
-- subsistema, opcional); el equipo tiene que existir en la línea del turno
-- (el Área de Pruebas puede usar cualquiera). Sin equipo ni tipo = Ocioso libre.
-- ------------------------------------------------------------
drop function if exists registrar_parada(text, uuid, text, text, integer, text, text, numeric, text);

create function registrar_parada(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_minutos integer,
  p_nota text default null,
  p_justificacion_desvio text default null,
  p_tiempo_guia_min numeric default null,
  p_pagina text default 'Registrar Paradas',
  p_equipo_codigo text default null,
  p_subsistema_codigo text default null
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
  v_sub paradas_subsistemas;
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

  if p_equipo_codigo is not null then
    -- Mecánica: falla de un equipo (y subsistema) de esta línea.
    select * into v_equipo from paradas_equipos where codigo = p_equipo_codigo;
    if not found or not v_equipo.activo then
      raise exception 'El equipo no existe o está desactivado.';
    end if;
    if v_area is distinct from 'PRUEBAS'
       and not exists (select 1 from paradas_equipos_lineas where equipo_id = v_equipo.id and linea_id = v_linea_id) then
      raise exception 'Ese equipo no está asignado a esta línea.';
    end if;
    if p_subsistema_codigo is not null then
      select * into v_sub from paradas_subsistemas
      where equipo_id = v_equipo.id and codigo = p_subsistema_codigo and activo;
      if not found then
        raise exception 'El subsistema no existe para ese equipo.';
      end if;
    end if;
    v_clase := 'NO_PROGRAMADA';
    v_nombre := 'Mecánica · ' || v_equipo.nombre || coalesce(' · ' || v_sub.nombre, '');
    v_guia := null;
  elsif p_tipo_codigo is null then
    if coalesce(trim(p_nota), '') = '' then
      raise exception 'Escribe el motivo del tiempo ocioso.';
    end if;
    v_clase := 'OCIOSO';
    v_nombre := 'Tiempo ocioso';
    v_guia := p_tiempo_guia_min;
  else
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if not found or not v_tipo.activo then
      raise exception 'El tipo de parada no existe o está desactivado.';
    end if;
    v_clase := v_tipo.clase;
    v_nombre := v_tipo.nombre;
    v_guia := v_tipo.tiempo_guia_min;
    -- Solo Programada exige justificar cuando se pasa del tiempo guía.
    if v_clase = 'PROGRAMADA' and v_guia is not null and p_minutos > v_guia
       and coalesce(trim(p_justificacion_desvio), '') = '' then
      raise exception 'Justifica por qué se pasó del tiempo guía.';
    end if;
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, equipo_id, subsistema_id, clase, origen, tipo_nombre, tiempo_guia_min,
                       nota, justificacion_desvio, inicio, fin, creado_por)
  values (p_turno_id, v_linea_id, v_tipo.id, v_equipo.id, v_sub.id, v_clase, 'MANUAL', v_nombre, v_guia,
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
                       'justificacion_desvio', p_justificacion_desvio,
                       'equipo', v_equipo.nombre, 'subsistema', v_sub.nombre)
  );

  return v_id;
end;
$$;

grant execute on function registrar_parada(text, uuid, text, text, integer, text, text, numeric, text, text, text) to anon, authenticated;
