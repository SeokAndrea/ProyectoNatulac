# Esquema de base de datos (Supabase) — referencia rápida

Este documento es **solo de consulta**, no se ejecuta ni lo lee la app.
Resume en un solo lugar lo que ya está definido en
`supabase/migrations/*.sql`, para no tener que abrir los 5 archivos
cada vez que hace falta recordar una tabla o un dato. La fuente de
verdad sigue siendo esa carpeta: si algo cambia, se edita ahí (con una
migración nueva) y después se actualiza este resumen.

Estado actual: el esquema y los datos semilla YA están escritos y el
proyecto YA está vinculado a Supabase (`supabase/.temp/`). Conectados
de verdad al frontend: `src/lib/personal.ts`, `src/lib/auth.tsx`,
`src/lib/sabores.ts`, y los 3 módulos de dominio
(`src/lib/preparacion/`, `src/lib/produccion/`,
`src/lib/productoTerminado.ts` — ver [MAPA.md](../MAPA.md), sección
"Arquitectura actual"; `src/lib/turno.tsx` es el módulo viejo, se está
vaciando de a poco). Todavía como copia local (hardcodeada) mientras
se conecta: `src/lib/catalogos.ts` para áreas/roles/turnos/grupos.

**Brecha conocida de este documento (2026-09-11):** la sección
"Tablas"/"Funciones" de abajo describe el esquema de las primeras
~15 migraciones (hasta `20260910`); hoy hay más de 125. Cosas que
YA cambiaron y este resumen todavía no refleja bien:
- `recepcion_tanques.condicion` ya NO es `VOLUMEN | SUCIO | VACIO |
  EN_PREPARACION` — ver la tabla corregida más abajo.
- `turno_lineas` pasó de "una fila fija por línea" a "una fila por
  CORRIDA" (`20260909`), y de ahí a un modelo de dos estados donde
  `ESPERANDO_PT` separa "la línea se detuvo" de "se cerró de verdad"
  (`20261018`, ver `docs/plan-rework-3-modulos-y-merma.md` Fase 1 costura 2).
- Tablas nuevas que no están documentadas acá todavía: `preparaciones_ajuste`,
  `desvases`, `transferencias`, `turnos_historial`, `contadores_historial`,
  auditoría universal (`registrar_auditoria`), VALIDAR.
- La tabla "Migraciones, en orden" de más abajo se corta en `20260910`
  a propósito — completarla de una sola vez es un trabajo grande; se
  va llenando de a poco. Para lo más reciente, `docs/estado-rework-fase-2.md`
  y `docs/plan-rework-3-modulos-y-merma.md` tienen el detalle migración por
  migración de `20261013` en adelante.

---

## Tablas

### `areas`
Producción Aséptico, Producción Vacío, Servicios Industriales,
Mantenimiento.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| codigo | text unique | `ASEPTICO`, `VACIO`, `SERVICIOS_INDUSTRIALES`, `MANTENIMIENTO` |
| nombre | text | |
| activo | boolean | default true |

### `roles`
Catálogo fijo de roles.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| codigo | text unique | `SUPERVISOR`, `ADMINISTRADOR_AREA`, `SUPERADMINISTRADOR` |
| nombre | text | |

### `usuarios`
Personal registrado. **No usa Supabase Auth** (decisión explícita, ver
`20260822090000_usuarios_tabla_propia.sql`): usuario y contraseña
viven acá mismo, con la contraseña hasheada (bcrypt vía `pgcrypto`).
Nunca se expone `password_hash` al frontend; todo el acceso pasa por
las tres funciones de más abajo.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| usuario | text unique | login, se guarda en minúsculas |
| password_hash | text | bcrypt, nunca se lee desde el frontend |
| nombre | text | nullable |
| apellido | text | nullable |
| cedula | text | nullable — para el acta de fin de turno (todavía no existe esa función) |
| activo | boolean | default true |
| created_at | timestamptz | |

### `usuario_roles`
Un usuario puede tener más de un rol/área.

| Columna | Notas |
|---|---|
| usuario_id, rol_id, area_id | `area_id` nulo = todas las áreas (caso SuperAdmin) |
| unique (usuario_id, rol_id, area_id) | |

### `lineas`
Líneas físicas de llenado, por área (3 en Aséptico: Línea 1/2/3).

### `turno_tipos`
| codigo | nombre | hora_inicio | hora_fin |
|---|---|---|---|
| TURNO_1 | Turno 1 | 07:00 | 15:00 |
| TURNO_2 | Turno 2 | 15:00 | 22:30 |
| TURNO_3 | Turno 3 | 22:30 | 07:00 (cruza medianoche) |
| 12X12 | 12x12 | — | — |

### `grupos`
GRUPO_1, GRUPO_2, GRUPO_3 — rota independiente del `turno_tipo`.

### `turnos`
Uno por cada "Empezar Turno" → "Finalizar Turno". Todo lo demás del
turno se asocia acá vía `turno_id`.

| Columna | Notas |
|---|---|
| codigo | único, formato `T-YYYYMMDD-XXXX` |
| area_id, supervisor_id, turno_tipo_id, grupo_id | FKs |
| velocidad_llenadora | copiada al crear el turno (valor histórico fijo) |
| estado | `ABIERTO` \| `CERRADO` |
| fecha_fin, hora_fin | nullables |

Auditado: cada `UPDATE` dispara `fn_turnos_auditar()`, que guarda el
estado anterior y nuevo (JSON completo) en `turnos_historial`.

### `turno_lineas`
Qué líneas se usaron en el turno (0 a 3 filas; 0 = "Ninguna").

### `contadores`
"Producto Terminado" por línea dentro de un turno.

| Columna | Notas |
|---|---|
| envases_llenadora, envases_buenos, envases_desechados | integer, no negativos |
| merma_pct | **columna generada**: `desechados / llenadora * 100`, redondeada a 2 decimales |
| requiere_justificacion | **columna generada**: `true` si merma > 3% |
| justificacion | texto, obligatorio en la práctica si `requiere_justificacion` |

> La validación rígida `buenos + desechados = llenadora` **se sacó**
> en `20260823100000_cedula_y_ajuste_contadores.sql` porque en la
> práctica no siempre cierra exacto (ejemplo real: llenadora 7061,
> buenos 6874, desechados 162 → suman 7036). Solo quedan los checks de
> "no negativo".

Auditado igual que `turnos` (`contadores_historial` +
`fn_contadores_auditar()`).

### `presentaciones`
Tamaño de envase (ml) y su empaque.

| volumen_ml | cajas_x_camada | cant_camada | cajas_x_paleta | litros_x_caja | envases_x_caja |
|---|---|---|---|---|---|
| 1000 | 17 | 5 | 85 | 12 | 12 |
| 500 | 17 | 8 | 120 | 6 | 12 |
| 330 | 15 | 8 | 120 | 5.94 | 18 |
| 250 | 14 | 10 | 140 | 6 | 24 |
| 200 | 14 | 10 | 140 | 4.8 | 24 |

`velocidad_llenadora` en esta tabla queda `NULL` a propósito: la
velocidad real depende de (línea, presentación), no solo de la
presentación — está en `velocidades_llenadora`.

### `familias_producto`
Clasicos, Premium, Especiales, Selecto, Jucosa. (Gama comercial —
**no** confundir con `lineas`, que son las líneas físicas de llenado.)

### `sabores`
Clave `(familia_id, nombre)` porque un mismo nombre (ej. "Pera") se
repite en varias familias con volumen propio.

| Familia | Sabor | Volumen |
|---|---|---|
| Clasicos | Pera | 2710 |
| Clasicos | Manzana | 2810 |
| Clasicos | Durazno | 2979 |
| Clasicos | Naranja | 4500 |
| Premium | Manzana Clarificado | 1735 |
| Premium | Agua de Coco | 170 |
| Premium | Naranja 100% | 2870 |
| Especiales | Coctel | 8200 |
| Especiales | Mango | 2590 |
| Especiales | Té de Durazno | 4883 |
| Especiales | Te de Limón | 4883 |
| Selecto | Manzana | 3676 |
| Selecto | Pera | 3522 |
| Selecto | Durazno | 3750 |
| Jucosa | Pera | 7583 |
| Jucosa | Manzana | 7889 |
| Jucosa | Naranja | 17300 |
| Jucosa | Durazno | 7676 |

`volumen` es para las preparaciones (fórmulas de mezcla) — confirmado,
es para más adelante, todavía no se usa en ningún cálculo.

### `velocidades_llenadora`
Velocidad real por combinación (línea, presentación). Cada combinación
puede tener **varias** opciones de envases/hora para elegir.

Actualizado por completo en `20260829090000_velocidades_actualizadas.sql`
(reemplaza los datos originales de más abajo — esas filas viejas
quedaron desactivadas, no borradas). Línea 1 = máquina **TB** (Tetra
Brik); Línea 2 y Línea 3 = máquina **TP** (Tetra Prisma), mismos
números para ambas.

| Línea | Presentación | Máquina | Envases/hora | Litros/hora |
|---|---|---|---|---|
| Línea 1 | 1000 ml | TB | 6000 | 6000 |
| Línea 1 | 1000 ml | TB | 7000 | 7000 |
| Línea 1 | 1000 ml | TB | 8000 | 8000 |
| Línea 1 | 500 ml | TB | 3000 | 3000 |
| Línea 1 | 500 ml | TB | 3500 | 3500 |
| Línea 1 | 500 ml | TB | 4000 | 4000 |
| Línea 2 / 3 | 250 ml | TP | 7500 | 1875 |
| Línea 2 / 3 | 250 ml | TP | 9000 | 2970 |
| Línea 2 / 3 | 200 ml | TP | 7500 | 1500 |
| Línea 2 / 3 | 200 ml | TP | 9000 | 1800 |
| Línea 2 / 3 | 330 ml | TP | 7500 | 2250 |
| Línea 2 / 3 | 330 ml | TP | 9000 | 2970 |

La Línea 3 llena **330, 250 y 200 ml**. `20261109790000_linea3_tres_presentaciones.sql` reactiva las que estén apagadas.
La Línea 2 llena **250 y 200 ml**: `20261109890000_linea2_sin_330.sql` desactiva sus velocidades de 330 ml (también en LINEA_T2).

---

## Funciones (Postgres, `security definer`)

Estas son las únicas puertas de entrada a la tabla `usuarios` (que
tiene RLS activado y sin políticas — bloqueada para acceso directo).

| Función | Qué hace |
|---|---|
| `crear_usuario(creador_usuario, usuario, password, rol_codigo, area_codigo?, nombre?, cedula?)` | Da de alta un usuario; hashea la contraseña adentro; devuelve el `uuid` del nuevo usuario |
| `verificar_login(usuario, password)` | Valida usuario+contraseña; devuelve el perfil (usuario, nombre, rol, área) y la credencial de la sesión (`token`), o vacío. Nunca devuelve el hash. 5 claves malas en 15 min bloquean ese usuario 15 min (20261109690000) |
| `listar_personal(usuario)` | Lista el personal visible para ese usuario (todas las áreas si es SUPERADMINISTRADOR, solo la propia si es ADMINISTRADOR_AREA), sin exponer `password_hash` |
| `editar_personal(creador_usuario, usuario_id, nombre, cedula, area_codigo, rol_codigo)` | Edita a alguien ya registrado |
| `restablecer_password(creador_usuario, usuario_id, password)` | Le pone una contraseña nueva a alguien (no se puede "ver" la vieja — está hasheada) |
| `desactivar_personal` / `reactivar_personal(creador_usuario, usuario_id)` | Baja/alta lógica (`activo`) |

**Todas** reciben `creador_usuario` (quién hace el pedido) y la
autorización se valida DENTRO de Postgres, no confiando en que la
interfaz oculte botones: un ADMINISTRADOR_AREA solo puede tocar
personal de su propia área y nunca puede asignar el rol
SUPERADMINISTRADOR — si lo intenta (por la interfaz o llamando la
función directo), la función tira una excepción. Ver
`supabase/migrations/20260828090000_personal_por_area.sql`.

Todas tienen `grant execute ... to anon, authenticated` — se pueden
llamar desde el frontend con la clave pública.

---

## Datos ya sembrados (además de los catálogos de arriba)

- **Super Administrador inicial**: usuario `jguerrero` ("Jorge
  Guerrero"), rol `SUPERADMINISTRADOR`, sin área asignada (ve todas).
  Contraseña sembrada en la migración — cambiarla en cuanto haya
  acceso real al proyecto de Supabase.

---

### `recepcion_tanques`
Estado de los 3 tanques de materia prima — **estado CONTINUO desde
`20260907090000_preparacion_continua.sql`**: ya no se completa una
sola vez al iniciar el turno, se activa/cambia en cualquier momento
desde Preparación (`src/pages/apps/Preparacion.tsx`) y `iniciar_turno()`
copia la fila más reciente de la misma área al turno nuevo en vez de
pedirla de nuevo. Sabor y volumen solo tienen sentido cuando
`condicion` es `LISTO` o `STANDBY` (sucio/limpio/en preparación no
los tienen).

**Condición actualizada (2026-09-11, reemplaza la tabla vieja de esta
sección):** `VOLUMEN`→`LISTO` (`20260910`), se agregaron `STANDBY`
(lote con resto — candidato a fusionarse con `SUCIO`, ver
`docs/plan-rework-3-modulos-y-merma.md` §"Estados de tanque y línea") y
`CIP`; `VACIO` se fusionó en `LIMPIO`
(`20260946090000_eliminar_vacio_fusiona_con_limpio.sql`).

| Columna | Notas |
|---|---|
| turno_id, numero_tanque | únicos juntos (1 fila por tanque por turno, tanques 1-3) |
| sabor_id | FK a `sabores`, obligatorio solo si `condicion` es `LISTO`/`STANDBY` |
| condicion | `LISTO` \| `SUCIO` \| `EN_PREPARACION` \| `STANDBY` \| `CIP` \| `LIMPIO` |
| volumen_l | **derivado en vivo** desde `20261031` (`volumen_vivo_tanque()`, fuente única) — antes era una columna que se "congelaba" |
| lote | texto libre, cargado a mano |
| activada_en | cuándo se puso en la condición actual (no se resetea al heredarse a un turno nuevo) |
| cip_iniciado_en, cip_finalizado_en | ciclo de CIP (`20260942090000_cip_limpio_tanques.sql`) |
| confirmado_inicio_en/por, confirmado_fin_en/por | confirmar un tanque heredado sin editarlo (`confirmar_estado_tanque`, `20260924`) |
| ultimo_sabor_id, ultimo_lote | copiados automáticamente al pasar de `LISTO`/`STANDBY` a `SUCIO`/`CIP`/`LIMPIO` — para mostrar "último sabor · lote" sin volver a escribirlo |

Función principal que la toca: `cambiar_condicion_tanque(...)` — hoy
mezcla varias responsabilidades (toggle de CIP, confirmar INICIO/FIN,
alta de preparación con datos) que el plan de Fase 2 (§2.1) quiere
angostar; ya se le extrajeron `medir_tanque` (`20261021`) y
`fijar_volumen_lote` (`20261033`, corrige el 100% del lote antes de
que corra la primera línea).

Un tanque `EN_PREPARACION` se resuelve más tarde en la tabla
`preparaciones` (puede tener varias filas, una por cada vez que se
preparó ese tanque en el turno).

### `preparaciones`
Mezcla de un tanque (tambores de concentrado + ajustes de calidad).
Varias filas por tanque por turno — se acumulan, no se pisan. Carga
100% manual: el cálculo cajas→litros→tambores lo hace el analista de
producción fuera de la app; los ajustes son solo para
calidad/inventario, sin ningún efecto calculado en el resto del
sistema.

| Columna | Notas |
|---|---|
| turno_id, numero_tanque | qué tanque de ese turno |
| sabor_id | FK a `sabores` |
| lote | texto libre |
| tambores | entero, obligatorio |
| agua, azucar, acido_citrico | L / kg / kg. **`agua` suma al volumen** del lote 1:1 (migración 20260999 en `iniciar_preparacion`, 20260997 en `ajustar_preparacion`). Azúcar y ácido no (son kg) |
| volumen_l, volumen_inicial_l, volumen_l_inicio | litros del lote (actual / preparado / al inicio del turno) — modelo de merma de semielaborado |

Dos tablas de ajuste de un lote, distintas:

| Tabla | Cuándo | Qué guarda |
|---|---|---|
| `preparaciones_ajuste_volumen` (20260997) | **antes de liberar**, con el botón "Ajustar" | litros de jugo/agua que se suman al volumen — `ajustar_preparacion(lote_id, litros, detalle)` hace `volumen_l += litros` y `volumen_inicial_l += litros`. Rechaza si el lote ya está liberado o cerrado |
| `preparaciones_ajuste` (20260988) | **después**, al "Corregir (mismo lote)" en Recepción | la relectura física del tanque: volumen teórico vs. real y la diferencia (litros "al aire"). Lo dispara un trigger cuando una corrección mueve a la vez `volumen_inicial_l` y `volumen_l` |

**Antiduplicados** (migraciones 20261003 + 20261006):
- `iniciar_preparacion()` rechaza un número de lote ya abierto para ese sabor en otro tanque de
  la misma área (re-preparar el mismo tanque con el mismo número sigue bien).
- `activar_linea()` rechaza volver a activar una línea sobre un lote que esa línea ya **produjo**
  este turno — se compara por `normalizar_lote(lote) + sabor_id` (no por `lote_id`, que se pierde
  al corregir el tanque desde Status) y dispara si esa corrida tiene Producto Terminado,
  `lote_terminado_en` o `entregada_en`. Una corrida stub (nunca produjo) no bloquea. Distintas
  líneas del mismo lote siguen OK.
- `continuar_siguiente_lote()` lleva la misma guarda antes de insertar la corrida nueva.

**Lotes para Vacío** (20261109490000): `preparaciones.para_vacio` marca un lote de Producción Vacío
guardado en un tanque de Aséptico. No cuenta en la merma de Aséptico y el trigger
`turno_lineas_sin_lote_vacio` impide que una corrida lo tome. `turno_json` lo trae en `tanques[]` y
`preparaciones[]`.

| Función | Qué hace |
|---|---|
| `iniciar_preparacion(…, p_para_vacio)` | Preparar para Vacío: con tambores; el lote nace liberado y el tanque `LISTO` |
| `recibir_de_vacio(turno, tanque, sabor, lote, litros)` | El néctar de Vacío llega por tubería a un tanque Limpio o Con Restos 0 L |
| `entregar_a_vacio(turno, tanque, litros)` | Vacío se lleva litros (por partes; `null` = todo). Sirve también para una parte de un lote de Aséptico. Si se lleva todo, el tanque queda `SUCIO` |
| `pasar_lote_a_aseptico(turno, tanque, volumen_real)` | Cierra el lote de Vacío y crea uno de Aséptico con lo medido (su 100% para la merma) |

`salidas_vacio` guarda cada salida (`litros`, `lote_id`, `de_lote_vacio`); en la merma se restan como
un desvase. `transferir_tanque` no mezcla un lote de Vacío con uno de Aséptico; a un tanque Limpio, el
lote nuevo hereda la marca.

### `analisis_calidad` (20261086)
Cada análisis de Calidad de un lote: `preparacion_id`, `turno_id` (turno del análisis), `brix`,
`acidez`, `conforme`, `observacion`, `usuario_id` (analista). Se guardan todos.
`registrar_analisis_calidad()` lo inserta y, si es conforme, libera el lote. Con
`areas.calidad_libera` encendido, `liberar_lote()` exige permiso `LOTE_LIBERAR` y análisis conforme;
apagado, libera el supervisor como antes. Nace encendido solo en Pruebas (ver `docs/plan-calidad.md`).

### `turno_lineas` (ampliada)
Además de la relación turno↔línea original, ahora guarda la
presentación y velocidad elegidas **por línea** (dos líneas pueden
llenar presentaciones distintas al mismo tiempo): `presentacion_id`,
`envases_hora`, `litros_hora`, `sabor_id`, `lote` y `tanque_numero`
(qué tanque está usando). La columna `turnos.velocidad_llenadora` de
la primera migración quedó sin usar por este motivo (no se borró para
no romper nada).

**Estado CONTINUO desde `20260907090000_preparacion_continua.sql`**:
una línea activada sigue activa turno tras turno (0 filas = esa línea
no está en uso) hasta que un supervisor la detenga — se administra
siempre desde Preparación, nunca desde Comenzar Turno. `activada_en`/
`activada_por` registran cuándo y quién la activó/cambió por última
vez; `iniciar_turno()` copia estas filas del turno más reciente de la
misma área en vez de pedirlas de nuevo.

### `lineas` (ampliada)
Se le agregó `codigo` (`LINEA_1`, `LINEA_2`, `LINEA_3`) para que
coincida con los códigos que ya usaba el frontend — antes solo tenía
`nombre` ("Línea 1", etc.).

## Funciones de Turnos (además de las de Personal/Sabores)

| Función | Qué hace |
|---|---|
| `turno_activo_de(usuario)` | Devuelve el turno ABIERTO de ese supervisor como un solo JSON (turno + líneas + tanques + contadores), o null si no tiene ninguno |
| `iniciar_turno(usuario, area_codigo, turno_tipo_codigo, grupo_codigo, fecha, hora_inicio)` | Crea el turno; ya NO recibe líneas/tanques — los hereda del turno más reciente de la misma área (o arranca con los 3 tanques VACÍO y ninguna línea si es la primera vez) |
| `activar_linea(usuario, turno_id, linea_codigo, presentacion_volumen_ml, envases_hora, litros_hora, sabor_id, lote, tanque_numero)` | Activa o actualiza una línea en cualquier momento del turno (upsert por `turno_id, linea_id`) |
| `detener_linea(usuario, turno_id, linea_codigo)` | Borra la fila de esa línea en `turno_lineas` — deja de estar en uso |
| `cambiar_condicion_tanque(usuario, turno_id, numero_tanque, condicion, sabor_id, volumen_l, lote, momento?, tambores?)` | **Firma vieja de referencia — ya cambió mucho, ver la nota en la sección `recepcion_tanques` de arriba.** Hoy también maneja CIP y confirmar INICIO/FIN; `medir_tanque` y `fijar_volumen_lote` se le extrajeron aparte |
| `finalizar_turno(turno_id)` | Cierra el turno; desde `20261018`/`20261028` (costura 2, Fase 1) rechaza si queda una corrida sin resolver (`ESPERANDO_PT`, o activa sin PT del tramo) — ya NO recibe `p_fecha_fin`/`p_hora_fin`, los calcula el servidor en hora de planta (`20261032`) |
| `registrar_contador(turno_id, turno_linea_id, linea_codigo, envases_llenadora, justificacion, usuario, parcial?, pagina?, envases_buenos)` | Inserta un contador. **Ya no tiene `envases_desechados`** (se calcula, columna generada). `envases_buenos` (Contador 2) es obligatorio desde el servidor y no puede superar `envases_llenadora` (`20261036`, 2026-09-11) |

## Row Level Security (RLS)

Todas las tablas tienen RLS **activado** pero, salvo `usuarios` (que
se protege con las 3 funciones de arriba), **todavía sin políticas
definidas**. Eso significa que hoy están bloqueadas por defecto para
`anon`/`authenticated` hasta que se escriban las políticas de "quién
puede leer/escribir qué según su rol y área" — pendiente, según los
comentarios de la primera migración, de terminar de definir los roles.

## Personal: áreas y puestos (20261113990000 a 20261114490000)

Los permisos ya no salen del rol sino del **puesto**. El rol de `usuarios` se sincroniza solo desde el puesto (trigger) y queda como compatibilidad.

**Tablas y columnas nuevas**

| Qué | Notas |
|---|---|
| `areas.tipo` | `PRODUCCION` o `APOYO`. La migración deja como `APOYO` a Mantenimiento, Servicios Industriales, Calidad y Otros, y como `PRODUCCION` al resto (Aséptico, Pruebas, Vacío) |
| `areas.orden` | Orden de aparición en el organigrama |
| `puestos` | `id`, `codigo` (único, sale del nombre), `nombre`, `area_id`, `nivel` (1 Jefatura, 2 Coordinación, 3 Operación, 4 Apoyo; `null` para Super Administrador y Probador), `rol_equivalente_id` (rol equivalente), `todos_los_permisos`, `activo`. Un puesto no cambia de área ni se borra si tiene gente (solo `activo = false`) |
| `puesto_permisos` | La matriz: `puesto_id` + `permiso_codigo` |
| `usuarios.puesto_id` | Obligatorio salvo para `sistema` (check `usuarios_puesto_obligatorio`). El trigger `usuarios_sincroniza_rol` deja `usuario_roles` igual al rol equivalente y al área del puesto, solo cuando el puesto cambia de verdad (o al crear la persona); editar el nombre no lo toca |
| `usuarios.titulo` | Texto libre que se muestra junto al puesto (ej. «Supervisor de Llenado») |
| `permisos.tema` | `TURNOS`, `PARADAS`, `MANTENIMIENTO`, `DATOS`, `PERSONAS` o `ADMINISTRACION`; agrupa la matriz |

Permisos nuevos: `ESTRUCTURA_GESTIONAR`, `LECTURAS_SI`, `CODIGOS_MTTO_EDITAR`, `REPORTES_PARADAS_VER`.

**Funciones nuevas o reescritas** (todas con `grant execute` a `anon, authenticated`, salvo las internas de la migración `puesto_para`, `personal_exigir_puestos`, `personal_asignar_puestos` y `personal_sincronizar_roles`, que no tienen `execute` para `public`; las que cambian datos llaman a `registrar_auditoria`)

| Función | Qué hace |
|---|---|
| `puesto_para(rol, area, cargo, area_origen)` | Interna: decide el puesto de una persona (Super Administrador va antes que el área Pruebas). La usan la migración y `scripts/revisar-personal-puestos.sql` |
| `personal_exigir_puestos()` | Interna: frena con la lista si alguien tiene más de una fila en `usuario_roles` o una combinación sin puesto |
| `personal_asignar_puestos()` / `personal_sincronizar_roles()` | Internas de la migración: asignan el puesto y después dejan `usuario_roles` igual al puesto, con una fila de Auditoría (usuario `sistema`, página «Paso a puestos (20261114090000)») por persona que cambia |
| `permisos_de_puesto(usuario, puesto_id)` | «Ver como»: permisos de un puesto (matriz, o todos si `todos_los_permisos`). Solo la dueña |
| `tiene_permiso(usuario, permiso)` | Reescrita: sale del puesto (matriz) más los permisos extra de la persona. `todos_los_permisos` no incluye los temas `PERSONAS` ni `ADMINISTRACION` salvo en el puesto `SUPERADMINISTRADOR` |
| `perfil_sesion(usuario)` | Reescrita: devuelve `activo`, `rol`, `area` (los dos del puesto), `es_dueno`, `puesto_id`, `puesto_codigo`, `puesto`, `nivel`, `titulo` y `permisos`; ya no lleva `cargo`. Solo Vista lo decide `puesto_codigo = 'SOLO_VISTA'`, no el rol `VISTA` |
| `puede_gestionar_personal(creador, usuario_id)` | Regla de gestión: nadie se gestiona a sí mismo y la dueña solo la gestiona ella; con `ESTRUCTURA_GESTIONAR` se puede gestionar a cualquiera salvo el puesto Super Administrador (solo la dueña); con `PERSONAL_GESTIONAR`, solo misma área y nivel destino mayor que el propio |
| `puestos_asignables(usuario)` | Puestos que esa persona puede asignar (misma área, nivel mayor al suyo) |
| `listar_personal(usuario)` | Personal que ese usuario puede ver, con puesto, área, nivel y título |
| `crear_usuario(creador, usuario, password, p_puesto_id, ...)` | Alta con puesto; valida la regla de gestión |
| `editar_personal(creador, usuario_id, ...)` | Edita nombre, cédula, puesto y título; valida la regla |
| `guardar_permisos_extra(usuario, usuario_id, permisos[], ...)` | Permisos extra de una persona, solo si están dentro de los propios |
| `eliminar_personal(creador, usuario_id, forzar)` | Borrado real; solo con `ESTRUCTURA_GESTIONAR` |
| `listar_permisos_extra(usuario)` | Permisos extra de las personas visibles |
| `listar_estructura(usuario)` | JSON con áreas, puestos y matriz (incluye `rol_equivalente`) para las pantallas |
| `guardar_area(usuario, codigo, nombre, tipo, activo, ...)` | Crea o edita un área; al crear exige `tipo` (`PRODUCCION` o `APOYO`), si no, «Elige el tipo del área.» |
| `guardar_puesto(usuario, id, area_codigo, nombre, nivel, activo, ...)` | Crea o edita un puesto (el código se genera y es único). Un puesto nuevo toma como rol equivalente el más débil (menos `rol_permisos`) entre los puestos activos de su área, sin contar Probador ni Super Administrador; `VISTA` si no hay ninguno |
| `guardar_permisos_puestos(usuario, cambios jsonb, pagina)` | Guarda la matriz de permisos por puesto en un solo paso |
| `listar_areas()` | Áreas con `tipo`, `activo` y `orden`, sin credencial; las lee la app antes de entrar |

**Aplicar en planta** (las 6 migraciones `20261113990000`, `20261114090000`, `20261114190000`, `20261114290000`, `20261114390000`, `20261114490000`):

1. **Revisar sobre una copia de la base de planta.** Copiarla (`createdb natulac_copia` + `pg_dump -Fc natulac | pg_restore -d natulac_copia`) y, sobre la copia, sacar la lista persona → puesto y probar el freno de la migración 2 (todo en una transacción que se deshace):

   ```bash
   M=supabase/migrations
   { echo 'begin;'; cat $M/20261113990000_puestos_estructura.sql
     sed '/^-- Funciones de la migración y del script de revisión/,$d' $M/20261114090000_puestos_personas.sql
     cat scripts/revisar-personal-puestos.sql
     echo 'select personal_exigir_puestos();'; echo 'rollback;'
   } | psql -X -v ON_ERROR_STOP=1 -d natulac_copia
   ```

   La dueña revisa la lista, sobre todo las filas con `cambia_acceso = sí`: a esas personas la migración les cambia el rol o el área de `usuario_roles` para que coincidan con el puesto (queda en Auditoría como `sistema`). Si `personal_exigir_puestos()` frena, el mensaje lista a quién arreglar: personas con más de una fila en `usuario_roles`, o con una combinación sin puesto (ej. `VISTA` en Mantenimiento, `JEFE_PRODUCCION` o `ANALISTA` en Mantenimiento, cualquiera salvo Super Administrador en Vacío). Se arregla en planta y se vuelve a revisar.
2. **Aplicar las 6 en UNA sola transacción y en ese orden** (si una falla, no queda ninguna a medias):

   ```bash
   M=supabase/migrations
   cat $M/20261113990000_puestos_estructura.sql $M/20261114090000_puestos_personas.sql        $M/20261114190000_puestos_permisos_y_sesion.sql $M/20261114290000_personal_reglas.sql        $M/20261114390000_estructura_gestion.sql $M/20261114490000_listar_areas.sql      | psql -X -v ON_ERROR_STOP=1 --single-transaction -d natulac
   psql -d natulac -c "notify pgrst, 'reload schema'"
   ```

   No usar un `db push` que las aplique una por una: si se corta en la 2, la app nueva llama funciones que no existen todavía.
3. **Subir el front recién después** de que las 6 entraron bien.
4. **Comprobar la cuenta de la dueña:** `select u.usuario, p.codigo from usuarios u join puestos p on p.id = u.puesto_id where u.ve_errores;` tiene que dar `SUPERADMINISTRADOR`. Si no, Personal, Áreas y puestos y «Ver como» no le cargan.

Ensayadas de punta a punta sobre una base armada con las migraciones de main más personas «de planta» sintéticas: ver `.superpowers/sdd/2026-11-01-personal-areas-puestos-fase1/final-fix-report.md`.

## SIF: frecuencia configurable (20261114590000)

Antes la SIF era fija: la misma falla en la misma línea, 3 veces en la jornada = Inspección y 4 = Intervención. Ahora cada área de producción lo configura. Sin fila para un área = DIA, 3 y 4 (como antes). Aplica desde que se guarda; no recalcula las solicitudes que ya existen.

### `sif_config`
Una fila por área (`area_id` es la llave). Sin políticas: solo se toca por las funciones.

| Columna | Tipo | Notas |
|---|---|---|
| `area_id` | `uuid` PK | → `areas` |
| `ventana` | `text` | `TURNO`, `DIA` (por defecto) o `SEMANA` |
| `inspeccion_en` | `integer` | 2 a 10 (por defecto 3) |
| `intervencion_en` | `integer` | 3 a 15 (por defecto 4); siempre mayor que `inspeccion_en` |
| `actualizado_en`, `actualizado_por` | | quién y cuándo |

### Funciones
| Función | Qué hace |
|---|---|
| `leer_config_sif(p_usuario, p_area)` | Ventana y umbrales del área (los de por defecto si no hay fila). Cualquier usuario activo |
| `guardar_config_sif(p_usuario, p_area, p_ventana, p_inspeccion_en, p_intervencion_en, p_pagina)` | Exige el permiso `SIF_CONFIGURAR` (tema MANTENIMIENTO; el Jefe de Mantenimiento y Super Admin). Valida las reglas con mensajes en español y audita con antes/después |
| `ventana_sif(p_area_id, p_instante)` | Interna. `DIA`: la jornada (7:00 a 7:00). `SEMANA`: del lunes 7:00 al lunes 7:00 de la jornada del instante. `TURNO`: el turno real del área que lo contiene (misma ventana que `ventana_paradas_turno`; abierto = hasta su hora oficial de fin), y si no hay, el turno teórico del esquema (3x8: 7-15, 15-22:30, 22:30-7; 12x12: 7-19 y 19-7) |
| `config_sif_area(p_area_id)`, `texto_ventana_sif(p_ventana)` | Internas |
| `fn_paradas_sif()` | El trigger de `paradas`: los umbrales y la ventana del área reemplazan al 3, al 4 y a la jornada; los correos dicen el número y la ventana reales |

Ensayo: `scripts/ensayo-sif-frecuencia.sql` (begin ... rollback).

## Sesiones con credencial (20261109690000)

La base ya no le cree al `p_usuario` que manda la app:

- `verificar_login` entrega un `token`. En `sesiones` queda solo su huella (sha256). La app lo manda en el header `x-sesion` (`src/lib/sesionToken.ts`).
- `revisar_peticion()` corre antes de **cada** petición (`pgrst.db_pre_request`). Sin credencial válida solo pasan `verificar_login` y `registrar_error_cliente`.
- `exigir_usuario(funcion, usuario)` va al comienzo de cada función con `p_usuario` (o `p_creador_usuario`, que manda cuando existe). El nombre tiene que ser el de la credencial. Solo revisa la función que pidió la app, no las que esta llama por dentro.
- `seguridad_config.modo`: `AVISO` solo anota en `accesos_rechazados`; `EXIGIR` rechaza (código 28000, la app vuelve a la pantalla de entrada). El cambio se hace desde el SQL Editor.
- Cambiar la clave o desactivar a alguien cierra sus otras sesiones (trigger en `usuarios`).

**Regla para migraciones nuevas:** si crean o reemplazan una función con `p_usuario`, terminan con `select * from asegurar_control_usuario();`. Esa llamada le agrega `exigir_usuario` a las que no lo tengan.

---

## Cómo aplicar esto a un proyecto real de Supabase

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

(Ya está vinculado en este proyecto — ver `supabase/.temp/project-ref`.)

## Migraciones, en orden

| Archivo | Contenido |
|---|---|
| `20260819120000_core_schema.sql` | Esquema central: áreas, roles, usuarios, líneas, turnos (+ auditoría), contadores (+ auditoría) |
| `20260820120000_sabores_presentaciones.sql` | Presentaciones, familias de producto, sabores |
| `20260821090000_velocidades_llenadora.sql` | Velocidades reales por línea + presentación |
| `20260822090000_usuarios_tabla_propia.sql` | Usuarios sin Supabase Auth (tabla propia + funciones) |
| `20260823100000_cedula_y_ajuste_contadores.sql` | Cédula en usuarios + se saca el check rígido de contadores |
| `20260824090000_sabores_edicion.sql` | CRUD de sabores/familias desde Edición de Datos |
| `20260825090000_conectar_turnos.sql` | Conecta Comenzar/Finalizar Turno y Contadores a Supabase; agrega Recepción de tanques; agrega `codigo` a líneas y presentación/velocidad por línea |
| `20260826090000_hora_local_turnos.sql` | Fecha/hora de inicio y fin de turno pasan a mandarse desde el navegador (antes usaban el reloj del servidor, en UTC, y quedaban desfasadas) |
| `20260827090000_edicion_personal.sql` | Edición, reseteo de contraseña y baja lógica de Personal desde Edición de Datos |
| `20260828090000_personal_por_area.sql` | Personal filtrado por área EN LA BASE (no solo en la interfaz): ADMINISTRADOR_AREA solo ve/edita su área y no puede asignar SUPERADMINISTRADOR; SUPERADMINISTRADOR ve todas |
| `20260829090000_velocidades_actualizadas.sql` | Actualización completa de velocidades (datos correctos confirmados por el usuario, incluida la de 500 ml que faltaba) |
| `20260830090000_edicion_presentaciones_velocidades_lineas.sql` | CRUD de presentaciones, velocidades y líneas (edición/activo) desde Edición de Datos |
| `20260831090000_producto_terminado.sql` | Tabla `producto_terminado` (paletas + cajas sueltas por línea, un registro por línea, upsert) y su inclusión en `turno_activo_de()`, con hora de registro para el Historial |
| `20260901090000_historial_auditoria.sql` | Extrae `turno_json()` (reutilizable) y agrega `listar_turnos_historial` / `turno_detalle`, para que Super Administrador busque cualquier turno pasado por supervisor/fecha (pantalla Auditoría) |
| `20260902090000_eliminar_acta_y_usuario.sql` | Borrado real: `eliminar_turno` (solo turnos CERRADOS) y `eliminar_personal` (Postgres lo rechaza solo si la persona tiene turnos/contadores — protección automática por llave foránea, sin código extra) |
| `20260903090000_forzar_eliminar_personal.sql` | `eliminar_personal` gana un parámetro `p_forzar`: si es true, borra primero los turnos de esa persona (arrastra en cascada todo lo asociado) y recién ahí la persona — pensado para limpiar usuarios de prueba |
| `20260904090000_estadisticas_produccion.sql` | `estadisticas_produccion()`: una fila por (turno, línea) — incluye turnos ABIERTOS, con contadores sumados + producto terminado, para el Dashboard de Planta / Mis Estadísticas (se actualiza en vivo mientras el supervisor carga datos) — sin políticas de rol, filtros abiertos a propósito (ver `docs/resumen-diseno-dashboard-natulac.md`) |
| `20260905090000_preparaciones.sql` | Tabla `preparaciones` (varias por tanque por turno, carga manual sin fórmula); 4ª condición de tanque `EN_PREPARACION`; `turno_lineas.sabor_id` para líneas que continúan del turno anterior |
| `20260906090000_panel_produccion.sql` | `turno_abierto_ahora()` y `turno_de_fecha_tipo()` — encontrar el turno en vivo o uno histórico por fecha/tipo, sin restricción de rol, para el Panel de Producción |
| `20260907090000_preparacion_continua.sql` | Líneas y tanques pasan a ser estado CONTINUO: `activar_linea`/`detener_linea`/`cambiar_condicion_tanque` (se llaman en cualquier momento desde Preparación), `iniciar_turno()` pierde los parámetros de líneas/tanques y hereda el último estado de la misma área, "último sabor/lote" automático al marcar un tanque SUCIO |
| `20260908090000_estado_planta_sin_turno_abierto.sql` | `estado_planta_actual()` reemplaza a `turno_abierto_ahora()` como fuente de la vista "en vivo" del Panel de Producción: busca el turno más reciente en general (abierto o cerrado), no solo uno con `estado = 'ABIERTO'` — antes, el panel se veía "vacío" en el hueco entre que un supervisor finalizaba su turno y el siguiente empezaba el suyo |
| `20260909090000_lotes_y_corridas.sql` | Cada preparación pasa a ser un LOTE independiente (no se suman); `turno_lineas` deja de ser una fila fija por línea — ahora una fila por CORRIDA (con `lote_id`, `activa`, `finalizada_en`), `detener_linea` se renombra a `finalizar_linea` y ARCHIVA en vez de borrar; nuevo `finalizar_lote()`; `contadores` pierde `envases_buenos`/`envases_desechados` (un solo valor, `envases_llenadora`, ligado a `turno_linea_id`) y ya no calcula merma como columna generada; `producto_terminado` se re-referencia a `turno_linea_id` (upsert por corrida, no por línea); `estadisticas_produccion()` pasa de "una fila por (turno, línea)" a "una fila por corrida" |
| `20260910090000_recepcion_y_liberacion.sql` | Condición de tanque `VOLUMEN` se renombra a `LISTO` (dato + constraint). `preparaciones` gana `volumen_l` y `liberado_en`. Nuevo `iniciar_preparacion()`: crea el lote completo (sabor/lote/volumen/tambores/ajustes) de una sola vez y pone el tanque en `EN_PREPARACION` — reemplaza al viejo combo `cambiar_condicion_tanque` + `registrar_preparacion` (que se borra). Nuevo `liberar_lote()`: marca el lote liberado y pasa el tanque a `LISTO`, copiando sabor/lote/volumen. `activar_linea()` cambia de firma: ahora pide `p_numero_tanque` (debe estar `LISTO`) en vez de `p_lote_id` suelto — el lote/sabor se resuelven solos |

**(tabla incompleta a propósito, ver la nota de "brecha conocida" al
principio del documento — hay más de 125 migraciones después de esta;
`20260911` en adelante todavía no tiene su fila acá. Se completa de a
poco, no de una sola vez.)**
