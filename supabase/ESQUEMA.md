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
`src/lib/sabores.ts` y `src/lib/turno.tsx` (turnos, líneas del turno,
recepción de tanques y contadores). Todavía como copia local
(hardcodeada) mientras se conecta: `src/lib/catalogos.ts` para
presentaciones/velocidades/familias/sabores en los formularios que
no sean Edición de Datos — ver los comentarios en esos archivos y en
[MAPA.md](../MAPA.md).

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
| 330 | 15 | 10 | 150 | 5.94 | 18 |
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

---

## Funciones (Postgres, `security definer`)

Estas son las únicas puertas de entrada a la tabla `usuarios` (que
tiene RLS activado y sin políticas — bloqueada para acceso directo).

| Función | Qué hace |
|---|---|
| `crear_usuario(creador_usuario, usuario, password, rol_codigo, area_codigo?, nombre?, cedula?)` | Da de alta un usuario; hashea la contraseña adentro; devuelve el `uuid` del nuevo usuario |
| `verificar_login(usuario, password)` | Valida usuario+contraseña; devuelve el perfil (usuario, nombre, rol, área) o vacío. Nunca devuelve el hash |
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
`condicion = 'VOLUMEN'` (sucio/vacío/en preparación no los tienen).

| Columna | Notas |
|---|---|
| turno_id, numero_tanque | únicos juntos (1 fila por tanque por turno, tanques 1-3) |
| sabor_id | FK a `sabores`, obligatorio solo si `condicion = 'VOLUMEN'` |
| condicion | `VOLUMEN` \| `SUCIO` \| `VACIO` \| `EN_PREPARACION` |
| volumen_l | 0 a 20.000 |
| lote | texto libre, cargado a mano |
| activada_en | cuándo se puso en la condición actual (no se resetea al heredarse a un turno nuevo) |
| ultimo_sabor_id, ultimo_lote | copiados automáticamente al pasar de `VOLUMEN` a `SUCIO` — para mostrar "último sabor · lote" sin volver a escribirlo |

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
| `cambiar_condicion_tanque(usuario, turno_id, numero_tanque, condicion, sabor_id, volumen_l, lote)` | Cambia la condición de un tanque en cualquier momento; si pasa de VOLUMEN a SUCIO copia el sabor/lote a `ultimo_sabor_id`/`ultimo_lote` |
| `finalizar_turno(turno_id)` | Cierra el turno (`estado = 'CERRADO'`) |
| `registrar_contador(turno_id, linea_codigo, envases_llenadora, envases_buenos, envases_desechados, justificacion, usuario)` | Inserta un contador y lo devuelve |

## Row Level Security (RLS)

Todas las tablas tienen RLS **activado** pero, salvo `usuarios` (que
se protege con las 3 funciones de arriba), **todavía sin políticas
definidas**. Eso significa que hoy están bloqueadas por defecto para
`anon`/`authenticated` hasta que se escriban las políticas de "quién
puede leer/escribir qué según su rol y área" — pendiente, según los
comentarios de la primera migración, de terminar de definir los roles.

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
| `20260904090000_estadisticas_produccion.sql` | `estadisticas_produccion()`: una fila por (turno, línea) — incluye turnos ABIERTOS, con contadores sumados + producto terminado, para el Dashboard de Planta / Mis Estadísticas (se actualiza en vivo mientras el supervisor carga datos) — sin políticas de rol, filtros abiertos a propósito (ver `resumen-diseno-dashboard-natulac.md`) |
| `20260905090000_preparaciones.sql` | Tabla `preparaciones` (varias por tanque por turno, carga manual sin fórmula); 4ª condición de tanque `EN_PREPARACION`; `turno_lineas.sabor_id` para líneas que continúan del turno anterior |
| `20260906090000_panel_produccion.sql` | `turno_abierto_ahora()` y `turno_de_fecha_tipo()` — encontrar el turno en vivo o uno histórico por fecha/tipo, sin restricción de rol, para el Panel de Producción |
| `20260907090000_preparacion_continua.sql` | Líneas y tanques pasan a ser estado CONTINUO: `activar_linea`/`detener_linea`/`cambiar_condicion_tanque` (se llaman en cualquier momento desde Preparación), `iniciar_turno()` pierde los parámetros de líneas/tanques y hereda el último estado de la misma área, "último sabor/lote" automático al marcar un tanque SUCIO |
| `20260908090000_estado_planta_sin_turno_abierto.sql` | `estado_planta_actual()` reemplaza a `turno_abierto_ahora()` como fuente de la vista "en vivo" del Panel de Producción: busca el turno más reciente en general (abierto o cerrado), no solo uno con `estado = 'ABIERTO'` — antes, el panel se veía "vacío" en el hueco entre que un supervisor finalizaba su turno y el siguiente empezaba el suyo |
| `20260909090000_lotes_y_corridas.sql` | Cada preparación pasa a ser un LOTE independiente (no se suman); `turno_lineas` deja de ser una fila fija por línea — ahora una fila por CORRIDA (con `lote_id`, `activa`, `finalizada_en`), `detener_linea` se renombra a `finalizar_linea` y ARCHIVA en vez de borrar; nuevo `finalizar_lote()`; `contadores` pierde `envases_buenos`/`envases_desechados` (un solo valor, `envases_llenadora`, ligado a `turno_linea_id`) y ya no calcula merma como columna generada; `producto_terminado` se re-referencia a `turno_linea_id` (upsert por corrida, no por línea); `estadisticas_produccion()` pasa de "una fila por (turno, línea)" a "una fila por corrida" |
| `20260910090000_recepcion_y_liberacion.sql` | Condición de tanque `VOLUMEN` se renombra a `LISTO` (dato + constraint). `preparaciones` gana `volumen_l` y `liberado_en`. Nuevo `iniciar_preparacion()`: crea el lote completo (sabor/lote/volumen/tambores/ajustes) de una sola vez y pone el tanque en `EN_PREPARACION` — reemplaza al viejo combo `cambiar_condicion_tanque` + `registrar_preparacion` (que se borra). Nuevo `liberar_lote()`: marca el lote liberado y pasa el tanque a `LISTO`, copiando sabor/lote/volumen. `activar_linea()` cambia de firma: ahora pide `p_numero_tanque` (debe estar `LISTO`) en vez de `p_lote_id` suelto — el lote/sabor se resuelven solos |
