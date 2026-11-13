# Trazabilidad de paletizado del Robot Tavil (hoja 1-PR-F-040 Rev.01)

Estado: **aprobado e implementado** (2026-11-12) en la rama `robot-tavilesco`: migración
`20261115290000_trazabilidad_paletizado.sql` (ensayo en `scripts/ensayo-trazabilidad-paletizado.sql`,
todavía sin correr en una base), pantalla del operador, tarjeta «Trazabilidad del paletizado» y PDF. Parte de lo ya
implementado en `20261114690000_robot_tavil_precarga.sql` (ver
`2026-11-04-operador-robot-tavil-design.md`) y de la hoja original guardada en
`docs/robot-tavil-trazabilidad/`.

## Para qué

Hoy el operador del Robot Tavil llena a mano la hoja «Trazabilidad de paletizado». Se quiere llevarla
a la app, con un esquema muy parecido, y **exportarla a PDF con el formato de la hoja**. La precarga
del Producto Terminado (el «+» y el «−») no cambia.

## Reglas confirmadas (Alexander, 2026-11-11)

1. **Una hoja por día y por línea.** El día lo abre el Turno 1 y lo cierra el Turno 3. La columna
   «Turno» de cada fila dice a qué turno pertenece la paleta.
2. **Nº de paleta = id de la paleta**, no el consecutivo del lote. Va ligado al sabor y a la
   presentación que se produce en la línea. Cuando la línea pasa a un sabor, una presentación o ambos
   que **todavía no habían salido ese día**, el número arranca en 1.
3. Si durante el día la línea **regresa a un sabor y presentación que ya produjo**, el número
   **continúa desde el último que se había sacado** de esa combinación (no vuelve a 1). Un lote
   nuevo con el mismo sabor y presentación tampoco reinicia. (Aclarado por Alexander, 2026-11-11.)
4. Cada día el Turno 1 arranca en 1.
5. **Nº de ticket**: hoy es el código del papel que se pega a la paleta física para diferenciarla; el
   operador lo anota. **A futuro el sistema lo generará e imprimirá** para pegarlo a la paleta
   (ver «Ticket»).

## Modelo de datos

Columnas nuevas en `robot_tavil_paletas` (solo aditivo):

| Columna | Qué guarda |
|---|---|
| `fecha_produccion date` | Día de la hoja: la fecha del turno que calcula el servidor, no la hora de creación. Así el Turno 3, que pasa la medianoche, cae en el día del Turno 1. |
| `turno_tipo text` | Turno de la paleta (`TURNO_1`, `TURNO_2`, `TURNO_3`), copiado al tocar «+». Ver «Turno de cada paleta». |
| `sabor_id`, `presentacion_id` | Copia de lo que se produce al tocar «+», tomada de la corrida que sigue el operador. Se copia porque la paleta puede quedar sin corrida (línea entregada) y la corrida se le pega después. |
| `numero int` | El Nº de paleta de la hoja. |
| `tipo_paletizado` | `AUTOMATICO` (por defecto) o `MANUAL`. |
| `cajas int` | Nº de cajas de la paleta; se llena con las cajas completas por paleta del catálogo y se puede editar. |
| `ticket text null` | Código del papel pegado a la paleta. Hoy lo anota el operador; es una columna propia, aparte de `numero`. |
| `conforme boolean default true` | C (true) o NC (false). |
| `observacion_codigos int[]`, `observacion_otros text` | Solo si es NC: códigos 1 al 7 de la hoja; el 7 pide especificar. |
| `accion_correccion text` | Texto libre, solo si es NC. |

Lote, sabor (nombre y código) y turno **no se guardan aparte**: salen de la corrida y del catálogo.

### Códigos de sabor

Los códigos de la hoja (MZ, PR, DZ, MG, CT, NJ, CC, CL, GY y las variantes con «%») **no existen en el
sistema**. Son los mismos que usa la línea durante las corridas (confirmado por Alexander,
2026-11-11). Se crean así:

- Columna nueva `sabores.codigo text null` (sin restricción de único: varias familias pueden compartir
  el mismo código si la hoja los trata igual).
- La migración la llena con el mapeo que Alexander confirme; el campo se puede editar después desde
  Edición de Datos (ya existe el CRUD de sabores, `20260824090000_sabores_edicion.sql`).
- Mientras un sabor no tenga código, la hoja imprime el nombre del sabor en su lugar, para no dejar la
  celda vacía.
- **Editable en Edición de Datos → catálogo de sabores**: el formulario de sabor gana el campo
  «Código» y la función que guarda sabores lo recibe y lo audita (antes/después), como el resto de
  campos del sabor.

**Criterio de codificación (Alexander, 2026-11-11):**

- Base del sabor: MZ Manzana, PR Pera, DZ Durazno, NJ Naranja, MG Mango, CT Coctel, CC Agua de Coco,
  CL Manzana Clarificado.
- **Clásicos** y **Premium**: la base sola. Excepción: Premium «Naranja 100%» lleva **NJ%**
  (Alexander, 2026-11-11).
- **Selecto**: la base más «%». El «%» de la hoja es la línea Selecto.
- **Jucosa**: la base más «J».
- **Tés** (Especiales): la base más «T».
- **GY** (guayaba sin azúcar) se descarta: el sabor ya no está en el catálogo de producción.
- Los códigos de Tés y Jucosa son propuesta de Alexander y no aparecen en la hoja original.

**Catálogo activo de producción (Alexander, 2026-11-11) y su código:**

| Familia | Sabores y código |
|---|---|
| Clásicos | Coctel CT, Durazno DZ, Mango MG, Pera PR, Manzana MZ, Naranja NJ |
| Especiales | Té de Durazno DZT, Té de Limón LMT (confirmado por Alexander, 2026-11-11) |
| Jucosa | Durazno DZJ, Pera PRJ, Manzana MZJ, Naranja NJJ |
| Premium | Agua de Coco CC, Manzana Clarificado CL, Naranja 100% NJ% |
| Selecto | Durazno DZ%, Pera PR%, Manzana MZ%, Mango MG% |

(El seed original de `20260820120000_sabores_presentaciones.sql` tenía Coctel y Mango en Especiales y
Selecto sin Mango; desde Edición de Datos se movieron y se agregó.)

**Cómo la migración asigna el código:** la base sale del **nombre** del sabor y el sufijo de la
**familia** (Selecto «%», Jucosa «J»), no de la pareja exacta (familia, nombre). Así funciona igual en
Pruebas, donde el catálogo todavía puede tener Coctel y Mango en Especiales, y en producción. Los
Tés se reconocen por su nombre. Lo que no encaje queda en `null` y se completa desde Edición de Datos.
- `sabores` tiene una fila por (familia, nombre), así que «Manzana» de Clásicos y «Manzana» de
  Selecto son sabores distintos para el sistema. La cuenta del Nº de paleta (que usa `sabor_id`) las
  trata como combinaciones distintas, y coincide con la hoja: MZ y MZ% son códigos distintos porque el
  «%» es Selecto.

## Cómo se asigna el número

Dentro de `robot_tavil_sumar`, con la línea bloqueada (`for update`) para que dos toques seguidos no
repitan número:

1. Se busca el mayor `numero` entre las paletas **no anuladas** con la misma línea, la misma
   `fecha_produccion`, el mismo `sabor_id` y la misma `presentacion_id`.
2. `numero = ese mayor + 1`; si no hay ninguna (primera vez de esa combinación en el día) → `1`.

Es decir, cada combinación de sabor y presentación lleva **su propia cuenta dentro del día y la
línea**; no importa en qué orden o cuántas veces se alterne entre ellas.

Como garantía, un índice único parcial sobre (`linea_id`, `fecha_produccion`, `sabor_id`,
`presentacion_id`, `numero`) donde `anulada_en` es nulo impide que dos paletas vivas repitan número.

El «−» sigue anulando la última paleta de la corrida que sigue el operador, que es la de mayor número
de su combinación. Al anularla, el número queda libre y el siguiente «+» de esa combinación lo vuelve
a usar. La paleta anulada se conserva (quién y cuándo) pero **no sale en la hoja ni en el PDF**.

Casos a tener en cuenta:
- **Cambio de lote en la pantalla del operador** («Iniciar con el lote …»): no reinicia nada por sí
  mismo; lo único que cuenta es la combinación de sabor y presentación (regla 3).
- **Paletas sin corrida** (línea entregada, turno siguiente sin abrir): usan el sabor y la
  presentación de la corrida que seguía el operador.
- **Sabor A → B → A el mismo día**: A continúa donde iba (por ejemplo 1 a 5, luego B 1 a 3, luego A
  6 y 7). No hay números repetidos dentro de una combinación. La hoja ordena las filas por hora de
  salida, así que en la hoja se ve 1…5, 1…3, 6, 7.
- Paletas ya cargadas en Pruebas (el Robot Tavil solo está encendido ahí): la migración las completa
  con una instrucción de relleno.

### Presentaciones de la hoja

El catálogo de la app (`presentaciones`) identifica cada presentación **solo por el volumen en ml**
(1000, 500, 330, 250, 200); no guarda el tipo de envase. El tipo sale de la máquina de la línea
(`velocidades_llenadora.maquina`, migración `20260829090000`): la Línea 1 es **TB** (Tetra Brik) y las
Líneas 2 y 3 son **TP** (Tetra Prisma). Con eso se relacionan con los códigos formales de la hoja:

| Catálogo de la app | Línea | Código de la hoja | Cajas por paleta (catálogo) |
|---|---|---|---|
| 1000 ml | Línea 1 (TB) | **TBA-1000 cm3** | 85 |
| 500 ml | Línea 1 (TB) | **TBA-500 cm3** | 120 |
| 330 ml | Líneas 2 y 3 (TP) | **TPA-330 cm3** | 120 |
| 250 ml | Líneas 2 y 3 (TP) | **TPA-250 cm3** | 140 |
| 200 ml | Líneas 2 y 3 (TP) | **TPA-200 cm3** | 140 |

La hoja original rotulaba la primera como «TBA-1L»; en la app y en el PDF se usa **TBA-1000 cm3**
(Alexander, 2026-11-11).

Las otras casillas de la hoja (Al-340 cm3, V-1000 cm3, V-250 cm3, C-113 g, C-186 g) corresponden a
envases que esta planta no llena en estas líneas y **no existen en el catálogo**. **Se dejan impresas
en el PDF, pero el sistema nunca las marca** (Alexander, 2026-11-11).

**Implementación (decidido):** columna `presentaciones.codigos_presentacion text null`, igual que
`sabores.codigo`. La migración la llena con la tabla de arriba y se edita desde Edición de Datos (el
formulario de presentación gana el campo y la función que lo guarda lo audita con antes/después). Si
una presentación no tiene código, la hoja imprime «N ml».

## Pantalla del operador

**El «+» pide el ticket y la conformidad** (Alexander, 2026-11-11): al tocarlo se abre un cuadro con:

- **Nº de ticket**: el operador lo **teclea** (no se escanea). Obligatorio.
- **No conforme**: un interruptor, apagado por defecto (= C, conforme). Al encenderlo (NC) aparece la
  **observación / desviación** con el formato de la hoja: uno o más códigos de 1 a 7 (1 solapas
  despegadas, 2 faltante de cajas en la paleta, 3 faltante de unidades en las cajas, 4 defectos en la
  paleta de madera, 5 poliestrech rasgado, 6 defectos en el apilamiento, 7 otros) y, si marca el 7, un
  texto para especificar. La observación es **obligatoria** cuando es NC. También hay un campo
  opcional de **acción de corrección** (texto libre).

La paleta se crea al confirmar. Esto **cambia la interfaz actual** del operador (hoy el «+» es un solo
toque y crea la paleta enseguida): hay que ajustar `src/pages/apps/RobotTavil.tsx` y
`src/components/robot-tavil/TarjetaLineaRobot.tsx`, y la función `robot_tavil_sumar` recibe el ticket y
el tipo. **Anotado para hacerlo después de aprobar este spec; no está hecho.**

**Interruptor «Paleta manual» en la tarjeta de la línea** (Alexander, 2026-11-12). Ya no va dentro del
cuadro del «+»: vive en la tarjeta de cada línea, como una **franja delgada pegada al borde superior,
sobre el nombre de la línea** (etiqueta «Paleta manual» e interruptor pequeño a la derecha; encendido
se tiñe de ámbar y agrega «las nuevas se guardan como Manual»), apagado por defecto (= Automático).
Diseño aprobado por Alexander el 2026-11-12 en la maqueta
(https://claude.ai/artifact/6Awkd1y1hya9gcuZjw5rXw). Mientras esté
**encendido, toda paleta que se cree con el «+» se guarda como `MANUAL`** (`tipo_paletizado`); apagado,
como `AUTOMATICO`. Cambiarlo **no modifica las paletas ya creadas**. Se usa en los casos muy
particulares en que las paletas se arman a mano; lo maneja el mismo operador del Robot Tavil. El valor
va a la hoja en el punto **1.2 «Tipo de paletizado»** (ver «PDF»). El cambio del interruptor es una
acción brusca: pide confirmación y queda en Auditoría.

Una paleta manual cuenta igual que las demás: suma a la precarga del Producto Terminado y comparte la
numeración de su combinación de sabor y presentación (la hoja es una sola tabla).

**Ticket repetido: se bloquea** (Alexander, 2026-11-11). Al confirmar, el sistema busca ese ticket
(sin espacios al inicio y al final, sin distinguir mayúsculas) en las paletas **no anuladas** de
cualquier línea y día. Si ya existe, **no crea la paleta** y avisa dónde está (línea, día y Nº de
paleta). Lo garantiza el servidor con un índice único parcial sobre el ticket normalizado donde
`anulada_en` es nulo y el ticket no es nulo, así que dos toques seguidos o dos operadores no pueden
repetirlo. La paleta anulada con el «−» conserva su ticket pero **sale del índice**, así que ese
ticket **se puede reutilizar**. Vale también al corregir el ticket desde la lista de paletas.

Los demás campos se crean por defecto (cajas del catálogo; el tipo sale del interruptor de la tarjeta).

**Lista de paletas del día** (Alexander, 2026-11-12). Va en la tarjeta de cada línea, **debajo de los
controles de entrada** (el «+», el «−» y el interruptor de paleta manual), y es un **desplegable**:

- **Contraído (por defecto)**: muestra solo **la última paleta registrada** (la más reciente de esa
  línea y día), con su Nº, sabor/presentación, ticket y conformidad, y un indicador para extender.
- **Extendido**: muestra la lista completa del día, como el diseño anterior.
- Tocar una fila (en cualquiera de los dos estados) permite al operador corregir ticket, tipo, cajas,
  conformidad, observación y acción de corrección. La confirmación doble del «−» no cambia. Toda
  edición queda en Auditoría con antes/después (regla de auditoría universal).
- Al crear una paleta nueva, la lista se queda como estaba (contraída o extendida) y la fila visible
  pasa a ser la nueva.

Cuando el ticket pase a generarlo el sistema (ver «Ticket»), ese campo del «+» desaparece; el
interruptor de paleta manual se queda.

### Turno de cada paleta

Decisión de diseño (Alexander dejó la elección): el turno se guarda **al tocar «+»** en `turno_tipo`, y
`fecha_produccion` junto con él:

- **Con corrida**: el turno y la fecha de la corrida (`turnos.fecha`), que es el que el supervisor y el
  resto de la app ya usan para esa producción.
- **Sin corrida** (línea entregada y turno siguiente sin abrir): el turno que corresponde a la **hora de
  planta** del toque, con `turno_de_hora()` del servidor (T1 7:00 a 15:00, T2 15:00 a 22:30, T3 22:30
  a 7:00; la madrugada es del Turno 3 de la fecha anterior), mismo criterio que
  `src/lib/tiempoPlanta.ts`.

Es la hora a la que de verdad salió la paleta, y no el turno que entregó la línea. La paleta que se
pega después a la corrida del turno siguiente **conserva** el turno y la fecha con que se guardó.

## Tarjeta «Trazabilidad del paletizado» y permisos

Tarjeta nueva en el Hub, con su pantalla, que lista y exporta las hojas (día, línea, presentación).

**Filtros** (Alexander, 2026-11-12): el usuario elige
- el **día**;
- el **turno**: por defecto se ven **los 3 turnos** del día; se puede especificar uno solo (o varios);
- las **líneas** (Línea 1, 2 y 3): funciona **igual que el filtro de turno** (Alexander, 2026-11-12);
  por defecto se ven **las 3 líneas**, se puede dejar una sola o varias, y siempre queda al menos una
  marcada.

El filtro de turno usa el `turno_tipo` de cada paleta (ver «Turno de cada paleta»), no la hora de
creación.
Siguiendo el patrón de `src/lib/permisos.ts` y `src/lib/apps.tsx` (por ejemplo `CATALOGO_PARADAS_VER`
y `CATALOGO_PARADAS`), con un permiso para ver y otro para editar:

| Permiso | Qué permite |
|---|---|
| `TRAZABILIDAD_VER` («Ver y exportar la Trazabilidad del paletizado») | Abrir la tarjeta, ver las hojas y **exportar el PDF**. |
| `TRAZABILIDAD_EDITAR` («Corregir la Trazabilidad del paletizado») | Corregir la **conformidad** (C/NC) de una paleta y **poner o cambiar su observación / desviación** (códigos 1 a 7 y «otros») y la acción de corrección. Aquí la observación es **opcional**. Incluye ver la tarjeta. |

- Ninguno se da a un puesto por defecto: se asignan desde Áreas y puestos o como permiso extra, como
  `ROBOT_TAVIL_CARGAR`. El Super Administrador los tiene siempre.
- Se insertan en la tabla `permisos` en la migración y se agregan al espejo `PERMISOS`.
- El servidor valida con `tiene_permiso()`; cada corrección queda en Auditoría con antes/después.
- **Quién marca qué** (Alexander, 2026-11-11): el **operador del Robot Tavil marca C/NC** en su
  tarjeta, con la observación obligatoria si es NC (ver «Pantalla del operador»). Después, quien tenga
  `TRAZABILIDAD_EDITAR` lo corrige desde la tarjeta nueva y puede agregar una observación opcional.
- La hoja y el PDF muestran lo que quedó al final; el antes y el después de cada cambio están en
  Auditoría.

## PDF

- **Idéntico al formato normalizado** (Alexander, 2026-11-13). El Excel, su PDF y el encabezado están
  en `docs/formatos/1-PR-F-040/`. `src/lib/trazabilidadPaletizadoPdf.ts` (jsPDF) copia las medidas
  del PDF que exporta ese Excel: hoja **carta** vertical, mismas columnas, filas (28 en la página
  llena), grosores de línea y posición de cada texto. Encabezado: la ola con el logo Natulac y el
  sello «Envasado Aséptico» (sacados del Excel, en `src/assets/trazabilidad/`), el título, el código
  «1-PR-F-040 Rev.01» y **«Pág. x/y»**. Fuente **Carlito** (libre, OFL, mismas medidas que Calibri,
  en `src/assets/fuentes/`). Sin firmas.
- **Un documento por línea, día y tipo de paletizado** (el 1.2 es uno por hoja). Cada presentación
  es un bloque 1.3 (presentación, cabecera y filas), como la página 2 del Excel: dos presentaciones
  del mismo documento van en la misma página si caben. Si no caben, siguen en otra página con el
  mismo encabezado y leyenda; «Pág. x/y» cuenta las páginas de ese documento. Las filas que sobran
  quedan vacías, como en el formato.
- **Leyenda (pie) con la información de hoy:** los sabores activos con código del catálogo
  (`trazabilidad_paletizado_listar` → `sabores`, migración `20261115490000`), las observaciones
  1 a 7 de la app y los términos C/NC. Si la leyenda crece, la tabla tiene menos filas.
- El formato no tiene casilla de Línea: la línea se escribe junto a la fecha en el 1.1.
- Encabezado 1.1 Fecha, 1.2 Tipo de paletizado, 1.3 Presentación; filas 1.3.1 a 1.3.9 como en la
  hoja; sin paletas anuladas.
- **1.2 Tipo de paletizado** sale del `tipo_paletizado` de las paletas (Automático o Manual, según el
  interruptor de la tarjeta del operador). Como el interruptor puede cambiarse a mitad del día, si en
  una hoja hay paletas de los dos tipos se agrega una página por tipo, igual que con la presentación.
- Se exporta lo que muestran los filtros (día, turnos y líneas elegidos).

## Ticket (pendiente a futuro)

Hoy es un texto que teclea el operador al tocar «+». Más adelante el sistema lo generará y lo imprimirá
automáticamente para pegarlo a la paleta. Por eso `ticket` es una columna propia y no se mezcla con
`numero`. Lo que habrá que decidir cuando llegue ese momento: formato del código, impresora/etiqueta,
y si se genera al tocar «+» o en un paso aparte.

## Preguntas abiertas

1. ~~Códigos de sabor de la hoja~~: **resuelto** (`sabores.codigo`, editable, catálogo activo y
   criterio arriba; LMT confirmado).
2. ~~Presentaciones de la hoja contra el catálogo~~: **resuelto** (tabla de arriba, columna
   `codigos_presentacion`, TBA-1000 cm3; las demás casillas se imprimen y nunca se marcan).
3. ~~Turno de una paleta sin corrida~~: **resuelto** (hora de planta con `turno_de_hora()`; ver
   «Turno de cada paleta»).
4. ~~Permisos~~: **resuelto** (tarjeta nueva, `TRAZABILIDAD_VER` y `TRAZABILIDAD_EDITAR`).
5. ~~Paletas «Manual»~~: **resuelto**, las carga el operador con un interruptor **en la tarjeta de la
   línea** (movido el 2026-11-12; ya no está en el cuadro del «+»): encendido, todas las paletas nuevas
   se guardan como manuales.
6. ~~Ticket al tocar «+»~~: **resuelto** (se teclea, obligatorio, aviso si ya existe, reutilizable
   tras anular).

### Confirmado por Alexander (2026-11-11)

- Ticket repetido: **se bloquea**.
- C/NC lo marca el operador del Robot Tavil (con observación si es NC); después lo corrige quien tenga
  `TRAZABILIDAD_EDITAR` y puede agregar una observación opcional.
- Una paleta manual comparte la numeración con las automáticas de la misma combinación de sabor y
  presentación.
- La tarjeta nueva va en la sección **Producción** del Hub, como la de Robot Tavil.

No quedan preguntas abiertas. **Siguiente paso: visto bueno del spec y plan de implementación.**
