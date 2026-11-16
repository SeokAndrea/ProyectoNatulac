# Preparación con datos del PLC: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la tarjeta de Preparación tome del PLC los kits y los ajustes de agua que el operador ya cargó en la HMI, muestre el proceso en vivo y deje al supervisor solo sabor y lote; todo detrás de un interruptor por área.

**Architecture:** El bridge lee los tags nuevos del DB5, los reenvía por WebSocket (en vivo) y manda cada lectura que cambia a `registrar_carga_plc` con un usuario de servicio, por una cola en disco. La base guarda la carga (kits y ajustes) y la une al lote cuando el supervisor la registra con `confirmar_carga_plc`, que reusa `iniciar_preparacion` y `liberar_lote`. La app junta las dos fuentes: lo en vivo del bridge (no se guarda) y lo guardado (`estado_preparacion_plc`).

**Tech Stack:** PostgreSQL (plpgsql, PostgREST), Node 20 (bridge: `nodes7`, `ws`, `node:test`), React 19 + TypeScript + Vitest + Testing Library. Pruebas SQL locales con PGlite (Postgres en WASM).

**Spec:** `docs/superpowers/specs/2026-11-06-preparacion-plc-design.md` (leer también «Interruptor por área» y «Decisiones de implementación»).

## Global Constraints

- Rama `rework/preparacion-PLC`. Commits chicos, uno por tarea, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Migración nueva: `supabase/migrations/20261115990000_preparacion_plc.sql` (el plan de nitrógeno reservó de 20261115290000 a 20261115490000; 20261115890000 es del Robot Tavil). Ensayo: `scripts/ensayo-20261115990000.sql`, `begin; … rollback;`.
- Base local: se arma **hasta** la anterior (`node construir.mjs ../../supabase/migrations 20261115890000_robot_tavil_anterior_abierta.sql`), y la migración nueva siempre se aplica fresca con `node correr.mjs --migracion ../../supabase/migrations/20261115990000_preparacion_plc.sql ../ensayo-20261115990000.sql` (desde `scripts/base-local`).
- Toda función nueva: `language plpgsql` o `sql`, `security definer`, `set search_path = public`; las públicas con `grant execute … to anon, authenticated`; las internas con `revoke execute … from public, anon, authenticated`. La migración termina con `select * from asegurar_control_usuario();`.
- Textos en español neutro con «tú» (nunca voseo). Números con `toLocaleString("es-CO")`. Horas con `horaCortaPlanta` / `horaPlanta` de `src/lib/tiempoPlanta`.
- El bridge no calcula litros ni caudal: pasa los valores del PLC tal cual. Consola del bridge sin tildes; textos que van a la app, con tildes.
- Sin dependencias nuevas en la app ni en el bridge (los tests del bridge usan `node:test`). La única dependencia nueva vive en `scripts/base-local/` (PGlite 0.5.10).
- Con el interruptor apagado, la tarjeta se ve y funciona exactamente como hoy (los tests existentes de `TanqueCard.test.tsx` no cambian).
- Tags del DB5 (spec): `Estatus_Preparacion` `DB5,X24.0`, `Fase_1` `DB5,X24.1`, `Fase_2` `DB5,X24.2`, `Fase_3` `DB5,X24.3`, `PLC_Ajuste_Agua` Int `DB5,INT18`, `PLC_Nro_Kits` Real `DB5,REAL20`.
- Tope de 20.000 L por tanque (`TANK_CAPACITY`); la base acepta hasta 30.000 L. Con carga del PLC se **avisa sin bloquear**.

## Review Focus

1. **El bridge se reinicia o la base no responde a mitad de una preparación**: no se pierde ni se duplica un kit o un ajuste. Test en Task 6 (`la cola sobrevive a un reinicio y se manda en orden`) y en Task 3 (`reinicio: una lectura con PREPARACION en falso cierra el ajuste abierto`).
2. **Kits del PLC fuera de medio en medio (2,3)**: la tarjeta pide corregirlos antes de mandar, en vez de un error crudo de la base. Test en Task 12 (`kits del PLC que no van de medio en medio obligan a corregir`).
3. **Dos supervisores registran la misma carga**: el segundo recibe «Esa carga del PLC ya se registró o se descartó.». Test en Task 4 (ensayo 3.11).
4. **Un ajuste que termina con el lote ya liberado**: no se suma y la tarjeta lo muestra. Tests en Task 4 (ensayo 3.9) y Task 11 (`ajuste del PLC después de liberar: se ve y no suma`).
5. **Un bridge de prueba en simulación contra la base de planta**: nunca escribe en Aséptico salvo que se configure a propósito. Test en Task 6 (`en simulación el área por defecto es PRUEBAS`).

---

### Task 1: Base local de pruebas con PGlite

Esta PC no tiene Docker ni Postgres. La base local se arma aplicando todas las migraciones en PGlite. Ya está probado: aplica las 298 en unos 4 s.

**Files:**
- Create: `scripts/base-local/package.json`, `scripts/base-local/construir.mjs`, `scripts/base-local/correr.mjs`
- Modify: `.gitignore` (agregar `scripts/base-local/node_modules/` y `scripts/base-local/base.tar.gz`)

**Interfaces:**
- Produces: `node construir.mjs <carpeta migraciones> [hasta.sql]` crea `base.tar.gz`. `node correr.mjs [--migracion m.sql]... ensayo.sql...` carga la base, aplica las migraciones dadas y corre los ensayos; sale con código 1 si alguno falla.

- [ ] **Step 1:** Copiar `construir.mjs` y `correr.mjs` desde la carpeta temporal de la sesión (ya probados). `package.json`: `{"name":"base-local","private":true,"type":"module","dependencies":{"@electric-sql/pglite":"0.5.10"}}`. Encabezado en `construir.mjs` explicando:
  - los stubs de Supabase (roles, `extensions`, `auth`, `cron`, `storage`);
  - `check_function_bodies = off`: `20261104090000` usa `producto_terminado.cajas_retenidas`, que `20261037090000` borró, así que desde cero esa función SQL no se podría crear.
- [ ] **Step 2:** Correr `cd scripts/base-local && npm install && node construir.mjs ../../supabase/migrations`. Esperado: `Aplicadas 298 migraciones.` y `Base guardada en base.tar.gz`.
- [ ] **Step 3:** Commit `Base local de pruebas (PGlite) para correr los ensayos SQL sin Docker`.

### Task 2: Interruptor, permiso, usuario del bridge y tablas

**Files:**
- Create: `supabase/migrations/20261115990000_preparacion_plc.sql` (sección 1), `scripts/ensayo-20261115990000.sql` (sección 1)

**Interfaces:**
- Produces:
  - `areas.preparacion_plc boolean not null default false` y `areas.preparacion_plc_desde timestamptz`. Pruebas nace encendido.
  - `preparacion_plc_area_activo(p_area_codigo text) returns boolean`. Sin área, usa `ASEPTICO`.
  - `guardar_preparacion_plc(p_usuario text, p_area_codigo text, p_activo boolean) returns void`. Solo la dueña (`es_dueno`). Mensaje: «Solo el dueño puede cambiar este ajuste.». Audita con `registrar_auditoria(p_usuario, 'EDITAR', 'preparacion_plc', area_id, 'Edición de Datos', 'Prendió/Apagó la preparación con PLC en <AREA>', antes, después)`. Al apagar pone `estado = 'DESCARTADA'`, `descartada_en = now()`, `descartada_por` (el usuario) y `motivo_descarte = 'Se apagó la preparación con PLC.'` en las cargas `EN_CURSO`/`PENDIENTE` del área.
  - Permiso `PLC_CARGAR` («Registrar las cargas del PLC de Preparación (usuario del bridge)», tema `ADMINISTRACION`).
  - Puesto `INTEGRACION_PLC` («Integración PLC», área `ASEPTICO`, nivel 4, rol equivalente `VISTA`) con solo `PLC_CARGAR`.
  - Usuario `plc-bridge` («Bridge del PLC», `activo`, `debe_completar_perfil = false`). Clave al azar (`extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf'))`); la real la pone Sistemas.
  - `plc_cargas_tanque`: `id`, `area_id` (→ areas, not null), `numero_tanque` (smallint 1-3), `estado` (`EN_CURSO`|`PENDIENTE`|`CONFIRMADA`|`DESCARTADA`, default `EN_CURSO`), `agua_formula_l` numeric, `kits` numeric (≥ 0), `kits_listos_en`, `fase_2_vista` (boolean default false), `iniciada_en` not null, `terminada_en`, `ultima_lectura_en` not null, `preparacion_id` (→ preparaciones on delete set null), `kits_usados` numeric, `confirmada_en`, `confirmada_por`, `descartada_en`, `descartada_por` (→ usuarios), `motivo_descarte`, `creada_en` default now(). Índices:
    - único `(area_id) where terminada_en is null` (el PLC prepara de a un tanque, aunque la carga esté descartada);
    - `(area_id, numero_tanque, iniciada_en) where estado in ('EN_CURSO','PENDIENTE')`;
    - `(preparacion_id)`.
  - `plc_cargas_ajustes`: `id`, `carga_id` (→ cargas, on delete cascade), `litros` numeric > 0, `iniciado_en` not null, `hecho_en` (null = en curso), `ajuste_volumen_id` (→ preparaciones_ajuste_volumen on delete set null), `no_sumado_motivo`. Índice único `(carga_id) where hecho_en is null`.
  - `preparaciones_ajuste_volumen.origen text not null default 'MANUAL' check (origen in ('MANUAL','PLC'))`.
  - RLS activado en las dos tablas nuevas, sin políticas. Un `comment on` por tabla y columna nueva.

- [ ] **Step 1: Ensayo, sección 1.** Mismo armado que `scripts/ensayo-robot-tavil.sql` (`pg_temp.falla`). Crea una dueña de prueba (`ve_errores = true`, puesto `SUPERADMINISTRADOR`), un supervisor (`SUPERVISOR`) y un probador (`PROBADOR`). Comprueba:
  - `preparacion_plc_area_activo('PRUEBAS')` es true; `('ASEPTICO')` y `(null)` son false.
  - `guardar_preparacion_plc` del supervisor falla con «Solo el dueño».
  - `PLC_CARGAR` tiene tema `ADMINISTRACION`. `tiene_permiso('plc-bridge','PLC_CARGAR')` es true; el probador y el supervisor no lo tienen.
  - `plc-bridge` tiene `usuario_roles` con rol `VISTA` en `ASEPTICO`. Después de `update usuarios set password_hash = extensions.crypt('clave-ensayo', extensions.gen_salt('bf')) where usuario = 'plc-bridge'`, `verificar_login('plc-bridge','clave-ensayo')` devuelve una fila con `token` no nulo.
  - Con dos cargas insertadas a mano en Pruebas (una `EN_CURSO`, otra `PENDIENTE` con `terminada_en`), `guardar_preparacion_plc(dueña,'PRUEBAS',false)` las deja `DESCARTADA` con ese motivo. `preparacion_plc_desde` no cambia al apagar; al volver a encender se pone `now()`.
- [ ] **Step 2:** Desde `scripts/base-local`, con la base armada hasta 20261115890000: `node correr.mjs ../ensayo-20261115990000.sql`. Esperado: FALLA (la función no existe).
- [ ] **Step 3:** Escribir la sección 1 de la migración (encabezado con el contexto y el link al spec).
- [ ] **Step 4:** Correr el comando de la base local de Global Constraints. Esperado: `OK`.
- [ ] **Step 5:** Commit `Preparación con PLC: interruptor por área, usuario del bridge y tablas de cargas`.

### Task 3: `registrar_carga_plc`: lo que reporta el bridge

**Files:**
- Modify: `supabase/migrations/20261115990000_preparacion_plc.sql` (sección 2), `scripts/ensayo-20261115990000.sql` (sección 2)

**Interfaces:**
- Consumes: tablas de Task 2.
- Produces:
  - `registrar_carga_plc(p_usuario text, p_area_codigo text, p_lectura jsonb) returns jsonb`. Devuelve `{"habilitado": bool, "carga_id": uuid|null, "estado": text|null}`.
    - `p_lectura`: `{momento, tanque, preparacion, fase_1, fase_2, fase_3, kits, ajuste_l, setpoint_l}`.
    - Mensajes: «No tienes permiso para registrar cargas del PLC.», «Esa área no existe.», «La lectura del PLC no trae PREPARACION.».
  - Internas:
    - `plc_terminar_carga(p_carga_id uuid, p_momento timestamptz)`: cierra el ajuste abierto, pone `terminada_en`, pasa `EN_CURSO` a `PENDIENTE` y fija `kits_listos_en` si había kits.
    - `plc_aplicar_ajuste(p_ajuste_id uuid, p_turno_id uuid, p_al_confirmar boolean)`: lo usa Task 4. Se escribe acá porque cerrar un ajuste de una carga ya confirmada lo llama.
    - `plc_usuario_bridge_id() returns uuid`: id de `plc-bridge`.

- [ ] **Step 1: Ensayo, sección 2.** En Pruebas, con el helper `pg_temp.lec(tanque int, prep bool, f1 bool, f2 bool, f3 bool, kits numeric, ajuste numeric, setpoint numeric, momento timestamptz) returns jsonb`. Fuera de PostgREST, `exigir_usuario` no frena: se prueba el permiso. Comprueba:
  - 2.1 Con el interruptor apagado devuelve `habilitado = false` y no guarda nada.
  - 2.2 El supervisor recibe «No tienes permiso para registrar cargas del PLC.».
  - 2.3 `prep=true`, tanque 2, setpoint 4800 → una carga `EN_CURSO`, tanque 2, `agua_formula_l = 4800`, `iniciada_en =` momento. Repetir la misma lectura deja una sola carga.
  - 2.4 Fase 2 con kits 2 → `kits = 2` y `kits_listos_en` nulo. Kits 2,5 → 2,5. Fase 2 en falso → `kits_listos_en` = ese momento. Kits 3 después de listos → siguen en 2,5. Kits 0 nunca pisa un valor.
  - 2.5 Ajuste 100 → un ajuste abierto con 100 L. Ajuste 120 → el mismo, con 120 L. Ajuste 0 → `hecho_en` = momento y sin `ajuste_volumen_id` (no hay lote todavía). Otro ajuste de 50 que vuelve a 0 → 2 ajustes cerrados. `ajuste_l` nulo no cierra nada.
  - 2.6 `prep=false` → `PENDIENTE` y `terminada_en` = momento.
  - 2.7 Cambio de tanque sin que baje PREPARACION: carga abierta del tanque 1 y lectura `prep=true` del tanque 3 → la del 1 queda `PENDIENTE` y nace otra `EN_CURSO` en el 3.
  - 2.8 Reinicio: una carga abierta con un ajuste abierto y una lectura `prep=false` → el ajuste se cierra con el momento de esa lectura y la carga queda `PENDIENTE`.
  - 2.9 Un momento en el futuro se guarda como `now()` o antes.
  - 2.10 Kits listos sin haber visto la fase 2: lectura con kits 2 y fase 3 → `kits_listos_en` no nulo.
  - 2.11 Una carga `DESCARTADA` que sigue abierta en el PLC (`terminada_en` nulo): otra lectura `prep=true` del mismo tanque no crea una carga nueva.
- [ ] **Step 2:** Correr el ensayo. Esperado: FALLA en 2.1.
- [ ] **Step 3: Implementar `registrar_carga_plc`.**
  1. Al entrar: `exigir_usuario`, permiso y área.
  2. Si el interruptor está apagado, devuelve `habilitado = false`.
  3. `pg_advisory_xact_lock(hashtextextended('plc_cargas|' || area_id, 0))`.
  4. Leer la lectura:
     - `momento = least(coalesce(momento, now()), now())`;
     - un tanque fuera de 1-3 es null;
     - `kits = nullif(kits, 0)`;
     - `ajuste_l` null es «sin dato» y 0 es «sin ajuste».
  5. Buscar la carga abierta en el PLC (`terminada_en is null`) del área, `for update`.
  6. Si `preparacion` y hay tanque:
     - si la abierta es de otro tanque, `plc_terminar_carga` y se trata como si no hubiera;
     - si no hay abierta, insertarla;
     - completar `agua_formula_l` si estaba nulo y el setpoint es mayor que 0;
     - kits: si no están listos y vienen, actualizarlos;
     - si llega la fase 2, marcar `fase_2_vista`;
     - si hay kits, no están listos y la fase 2 está en falso con (`fase_2_vista` o fase 3), fijar `kits_listos_en`;
     - ajuste: si es mayor que 0, crear el abierto o actualizar sus litros; si es 0 y hay uno abierto, cerrarlo con `hecho_en` y llamar a `plc_aplicar_ajuste(id, turno abierto del área, false)`, solo si la carga tiene `preparacion_id`;
     - `ultima_lectura_en = greatest(…)`.
  7. Si `not preparacion` y hay abierta: `plc_terminar_carga`.
  8. `plc_aplicar_ajuste`:
     - Si el lote es null, o el ajuste ya está sumado o anotado, no hace nada.
     - Si el lote está liberado o cerrado y no es `p_al_confirmar`, anota `no_sumado_motivo = 'El lote ya estaba liberado cuando terminó el ajuste.'`.
     - Si no, suma: `volumen_l` y `volumen_inicial_l` += litros, e inserta en `preparaciones_ajuste_volumen` con `lote_id`, `turno_id` (el dado; si es null, el turno abierto del área; si no hay, el del lote), `litros`, `detalle = 'Ajuste de agua del PLC'`, `usuario_id = plc_usuario_bridge_id()`, `creado_en = hecho_en` y `origen = 'PLC'`.
     - Liga `ajuste_volumen_id` y audita con `registrar_auditoria('plc-bridge', 'EDITAR', 'preparaciones', lote, 'Preparación (PLC)', format('Ajuste de agua del PLC · Tanque %s · Lote %s · +%s L', …), antes, después)`.
- [ ] **Step 4:** Correr el ensayo. Esperado: `OK`.
- [ ] **Step 5:** Commit `Preparación con PLC: la base registra cargas, kits y ajustes que reporta el bridge`.

### Task 4: Estado, registrar y descartar desde la tarjeta

**Files:**
- Modify: `supabase/migrations/20261115990000_preparacion_plc.sql` (sección 3), `scripts/ensayo-20261115990000.sql` (sección 3), `supabase/ESQUEMA.md` (sección nueva «Preparación con PLC (20261115990000)»), `scripts/revisar-migraciones-pendientes.sql` (fila `20261115990000`: existe `confirmar_carga_plc`)

**Interfaces:**
- Consumes: Task 2 y Task 3; `iniciar_preparacion` (20261115090000), `liberar_lote` (20261086090000), `calidad_libera_en_turno`, `exigir_turno_escribible`, `turno_json`.
- Produces:
  - `estado_preparacion_plc(p_usuario text, p_turno_id uuid) returns jsonb`. Sin permiso propio (como `turno_json`).

    ```json
    {"habilitado": true,
     "tanques": [{"numero_tanque": 1,
                  "cola": [Carga, …],
                  "carga_del_lote": Carga|null,
                  "desglose": Desglose|null}]}
    ```

    - `cola`: cargas `EN_CURSO`/`PENDIENTE` del tanque en el área del turno, de la más antigua a la más nueva.
    - `carga_del_lote`: la `CONFIRMADA` cuyo `preparacion_id` es el `lote_id` del tanque en ese turno.
    - `desglose`: solo con el tanque `EN_PREPARACION`.
    - Carga = `{id, numero_tanque, estado, agua_formula_l, kits, kits_listos (bool), kits_usados, iniciada_en, terminada_en, preparacion_id, ajustes: [{id, litros, iniciado_en, hecho_en, sumado (bool), no_sumado_motivo}]}`.
    - Desglose = `{lote_id, lote, unidades (tambores), litros_por_unidad (sabores.volumen), resto_l (resto_heredado_l), desvase_l (Σ desvases.usado_en_lote_id), total_l (volumen_inicial_l), ajustes: [{origen, litros, creado_en, detalle}] (todos los preparaciones_ajuste_volumen del lote, por hora)}`.
    - Apagado: `{"habilitado": false, "tanques": []}`.
  - `confirmar_carga_plc(p_usuario text, p_turno_id uuid, p_carga_id uuid, p_sabor_id uuid, p_lote text, p_kits numeric, p_desvase_id uuid, p_para_vacio boolean, p_liberar boolean) returns jsonb` (devuelve `turno_json`). `p_kits` null usa los del PLC.
  - `descartar_carga_plc(p_usuario text, p_turno_id uuid, p_carga_id uuid) returns jsonb` (devuelve `estado_preparacion_plc`).

- [ ] **Step 1: Ensayo, sección 3.** Arma un turno abierto en Pruebas con `recepcion_tanques` 1-3 en `LIMPIO`, `calidad_libera = false` en Pruebas (salvo 3.7) y un sabor con `volumen` conocido. Comprueba:
  - 3.1 `estado_preparacion_plc`: dos cargas pendientes del tanque 1 salen en orden en la `cola` del tanque 1. Registrar la más nueva falla con «Primero registra la carga más antigua del Tanque 1.».
  - 3.2 `EN_CURSO` sin kits listos → «El PLC todavía está cargando los kits.». Sin kits del PLC ni `p_kits` → «Faltan los kits: el PLC no los registró.».
  - 3.3 Registrar una carga con kits 2 y un ajuste de 100 cerrado sobre el tanque Limpio:
    - nace el lote `EN_PREPARACION`;
    - `tambores = 2` y `volumen_inicial_l = 2 × volumen + 100`;
    - hay una fila `origen = 'PLC'` de 100 L a nombre de `plc-bridge`;
    - la carga queda `CONFIRMADA` con `preparacion_id`;
    - `kits_usados = 2`.
  - 3.4 `p_kits = 3` con el PLC en 2,5 → `tambores = 3`, la carga sigue con `kits = 2,5` y `kits_usados = 3`.
  - 3.5 Tanque `EN_PREPARACION` → «Libera primero el lote <lote> del Tanque <n>.». Tanque con lote de Vacío (`para_vacio`, `LISTO`) → «El Tanque <n> tiene un lote de Vacío: entrégalo o pásalo a Aséptico primero.». Lote con una corrida `activa = false`, sin `finalizada_en` ni `entregada_en` → «La línea que tomó del Tanque <n> está parada sin Producto Terminado. Cárgalo primero.».
  - 3.6 Tanque en `CIP` → registra y queda `cip_finalizado_en` no nulo.
  - 3.7 `p_liberar` con `calidad_libera` encendido → «En esta área libera Calidad: registra sin liberar.». Con la carga `EN_CURSO` → «El PLC sigue con esta preparación: registra sin liberar.».
  - 3.8 `p_liberar` sobre una `PENDIENTE` con un ajuste de 80 → el lote queda liberado, el tanque `LISTO` y `volumen_inicial_l` incluye los 80.
  - 3.9 Registrada con la carga `EN_CURSO`:
    - un ajuste nuevo de 60 que vuelve a 0 → el lote sube 60 enseguida;
    - después de `liberar_lote`, otro de 40 → no se suma y queda con `no_sumado_motivo`.
  - 3.10 `p_para_vacio` → el lote es `para_vacio`, el tanque `LISTO` y los ajustes ya hechos están sumados.
  - 3.11 Registrar dos veces la misma carga → la segunda falla con «Esa carga del PLC ya se registró o se descartó.». Igual para descartar dos veces.
  - 3.12 Descartar una pendiente → `DESCARTADA` con `descartada_por`.
  - 3.13 Usuario sin `TURNO_CARGAR` → «No tienes permiso para cargar Preparación.». Interruptor apagado → «La preparación con PLC no está habilitada en esta área.».
  - 3.14 Desglose del lote de 3.3: `unidades = 2`, `litros_por_unidad` = volumen del sabor, un ajuste `PLC` de 100 y `total_l` = `volumen_inicial_l`. Con resto heredado (preparar encima de un `LISTO` de 1200 L) → `resto_l = 1200`.
- [ ] **Step 2:** Correr el ensayo. Esperado: FALLA en 3.1.
- [ ] **Step 3: Implementar.** `confirmar_carga_plc`, en este orden:
  1. `exigir_turno_escribible(p_usuario, p_turno_id, false)`, `TURNO_CARGAR` e interruptor del área del turno.
  2. Mismo candado que Task 3.
  3. Carga `for update` en `EN_CURSO`/`PENDIENTE` y del área del turno.
  4. La más antigua primero.
  5. Kits listos o carga `PENDIENTE` (si no, el mensaje de 3.2).
  6. `v_kits = coalesce(p_kits, carga.kits)`, que tiene que ser mayor que 0.
  7. Bloqueos de 3.5.
  8. `CIP` → `condicion = 'LIMPIO'`, `cip_finalizado_en = now()`.
  9. `perform iniciar_preparacion(p_usuario, p_turno_id, tanque, p_sabor_id, p_lote, v_kits, null, null, null, p_desvase_id, coalesce(p_para_vacio,false))`. El lote nuevo es el `lote_id` del tanque.
  10. Carga `CONFIRMADA` (`preparacion_id`, `kits_usados`, `confirmada_en`, `confirmada_por`).
  11. `plc_aplicar_ajuste(id, p_turno_id, true)` por cada ajuste cerrado sin sumar.
  12. Si `p_liberar`, las reglas de 3.7 y después `liberar_lote`.
  13. Auditoría: «Registró la carga del PLC del Tanque N: K kits», más « (el PLC marcó X)» si difieren.
  14. `return turno_json(p_turno_id)`.
- [ ] **Step 4:** Correr el ensayo. Esperado: `OK`.
- [ ] **Step 5:** `ESQUEMA.md`, con la misma forma que la sección del Robot Tavil:
  - interruptor;
  - tablas;
  - funciones;
  - usuario `plc-bridge`, con el SQL para ponerle la clave: `update usuarios set password_hash = extensions.crypt('<clave>', extensions.gen_salt('bf')) where usuario = 'plc-bridge';`;
  - el ensayo.

  Y la fila en `revisar-migraciones-pendientes.sql`.
- [ ] **Step 6:** Commit `Preparación con PLC: estado, registrar y descartar cargas desde Preparación`.

### Task 5: Bridge: tags de la preparación y simulación del ciclo

**Files:**
- Create: `plc-bridge/src/fuentes/ciclo.js`, `plc-bridge/test/ciclo.test.js`, `plc-bridge/test/s7.test.js`
- Modify: `plc-bridge/src/fuentes/s7.js`, `plc-bridge/src/fuentes/simulacion.js`, `plc-bridge/bridge.conf` (sección 4: los seis tags nuevos con su nombre de TIA), `plc-bridge/package.json` (`"test": "node --test"`), `plc-bridge/plc-bridge.bat` (arreglar `node src\index.js` y `node src\prueba-escritura.js`: hoy dicen `srcindex.js`)

**Interfaces:**
- Produces:
  - Mensaje del bridge con `preparacion: {activa, fase_1, fase_2, fase_3, kits, ajuste_l} | null`. Es null si el PLC no entrega `Estatus_Preparacion`, o sin conexión.
  - `armarPreparacion(valores) → objeto | null`, exportada de `s7.js`.
  - `crearCicloPreparacion({ aleatorio = Math.random, velocidad = 1 }) → { avanzar(ms): Paso }`, en `ciclo.js`. `Paso = { tanque, setpoint_l, litros_actuales, litros_tanque, caudal_l_min, valvula_abierta, preparacion }`. `velocidad` multiplica el tiempo simulado. `simulacion.js` la lee de `PLC_SIM_VELOCIDAD` (por defecto 1), para probar rápido.
  - Claves en `bridge.conf`: `PLC_TAG_PREPARACION=DB5,X24.0`, `PLC_TAG_FASE_1=DB5,X24.1`, `PLC_TAG_FASE_2=DB5,X24.2`, `PLC_TAG_FASE_3=DB5,X24.3`, `PLC_TAG_AJUSTE_AGUA=DB5,INT18`, `PLC_TAG_KITS=DB5,REAL20`.

- [ ] **Step 1: Tests.**
  - `s7.test.js`:
    - `armarPreparacion` con `preparacion: true, fase_2: true, kits: 2.5, ajuste_agua: 0` → `{activa: true, fase_1: false, fase_2: true, fase_3: false, kits: 2.5, ajuste_l: 0}`;
    - con `preparacion: null` → `null`;
    - con kits `2.299999952316284` → `2.3`.
  - `ciclo.test.js` (aleatorio fijo `() => 0.5`, avanzando de a 200 ms):
    - las fases aparecen en orden 1 → 2 → 3 y `activa` cae al final;
    - en la fase 1 la válvula cierra con `litros_tanque` en el 80 % (±1 %) del setpoint;
    - `kits > 0` solo desde la fase 2 y hasta que baja `activa`, y después vuelve a 0;
    - cada ajuste vuelve a 0 al terminar;
    - el siguiente ciclo usa otro tanque.
- [ ] **Step 2:** `cd plc-bridge && npm test`. Esperado: FALLA (no existen).
- [ ] **Step 3: Implementar.**
  - `TAGS_BASE` suma los seis tags.
  - `leerCiclo` y `emitirSinDatos` agregan `preparacion`.
  - `ciclo.js` es una máquina de estados sobre tiempo simulado:
    1. espera de 5 s;
    2. fase 1 a 1.200 L/min hasta el 80 % de un setpoint de 1.500 a 3.000 L;
    3. fase 2: kits de 1 a 3 en medios, a los 3 s, más el 20 % restante;
    4. 20 s «Calidad»;
    5. de 0 a 2 ajustes de 50 a 200 L, con 10 s de «Calidad» después de cada uno;
    6. fin: `activa` en falso y kits en 0;
    7. siguiente tanque.
  - `simulacion.js` usa el ciclo para `tanque_activo`, válvulas, litros y `preparacion`. Conserva la auxiliar (se abre 45 s en el tanque que terminó su preparación) y los extras.
- [ ] **Step 4:** `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit `plc-bridge: tags de la preparación (fases, kits y ajuste) y simulación del ciclo; arregla las rutas del .bat`.

### Task 6: Bridge: cargas de la preparación hacia la base

**Files:**
- Create: `plc-bridge/src/cargas.js`, `plc-bridge/test/cargas.test.js`
- Modify:
  - `plc-bridge/src/index.js`;
  - `plc-bridge/src/registro.js` (exportar `carpetaDatos()` y `sufijoModo(modo)`, que hoy calcula adentro);
  - `plc-bridge/bridge.conf` (sección 7: `PLC_AREA=` y `PLC_BRIDGE_USUARIO=plc-bridge`, y un comentario: la clave va en la variable de entorno `PLC_BRIDGE_CLAVE`, nunca en este archivo);
  - `docker-compose.yml` (`- PLC_BRIDGE_CLAVE=${PLC_BRIDGE_CLAVE:-}`);
  - `.env.example` (`PLC_BRIDGE_CLAVE=` con su comentario).

**Interfaces:**
- Consumes: `registrar_carga_plc` y `verificar_login` por PostgREST (`PLC_API_URL`, header `x-sesion`).
- Produces:
  - `lecturaDeCarga(estado)`: devuelve `{momento, tanque, preparacion, fase_1, fase_2, fase_3, kits, ajuste_l, setpoint_l}`, o null si `conectado === false` o `preparacion == null`.
  - `cambioRelevante(a, b): boolean`: compara tanque, preparación, fases, kits y ajuste.
  - `crearReportador({ apiUrl, usuario, clave, area, archivoCola, fetch, ahora = Date.now, latidoMs = 60000 })` devuelve `{ habilitado, motivoApagado, procesar(estado), enviarPendientes(): Promise<void>, resumen(), detener() }`.
    - `resumen()` = `{habilitado, area, motivo_apagado, pendientes, ultimo_envio, error}`.
  - El mensaje del WebSocket suma `area` (`PLC_AREA`) y `cargas: resumen()`.
  - Área por defecto: `ASEPTICO` en modo real y `PRUEBAS` en simulación.
  - Archivo de la cola: `<carpeta datos>/cargas-pendientes<sufijo>.json`.

- [ ] **Step 1: Tests** (`fetch` falso que guarda las llamadas):
  - `sin clave, el reportador queda apagado con su motivo`;
  - `entra con verificar_login y manda x-sesion`;
  - `solo encola cuando cambia algo o pasó el latido`;
  - `si la base falla, reintenta y manda en orden`;
  - `la cola sobrevive a un reinicio y se manda en orden`;
  - `una respuesta 403 o código 28000 hace volver a entrar`;
  - `con la clave equivocada espera 5 minutos antes de reintentar`;
  - `en simulación el área por defecto es PRUEBAS` (helper exportado `areaPorDefecto(modo)`);
  - `con habilitado:false de la base no reintenta y lo informa` (el resumen dice «La preparación con PLC está apagada en <AREA>.»).
- [ ] **Step 2:** `npm test`. Esperado: FALLA.
- [ ] **Step 3: Implementar.**
  - La cola es un arreglo, el más viejo primero, guardado como `registro.js` (archivo `.tmp` y renombrar), con un máximo de 5.000.
  - `enviarPendientes` corre de a una.
  - Reintentos: espera de 5 s que se duplica hasta 60 s. Con la clave mala, 5 minutos.
  - La clave sale solo de `process.env.PLC_BRIDGE_CLAVE` (no de `leer`).
  - En la consola, un aviso por cambio de estado, no por lectura.
  - `index.js` llama `reportador.procesar(lectura)` en `difundir` y agrega `area` y `cargas` al estado.
- [ ] **Step 4:** `npm test`. Esperado: PASS. Y `node src/index.js` con `PLC_MODO=simulacion` arranca y muestra `cargas de preparacion APAGADAS (falta PLC_BRIDGE_CLAVE)`.
- [ ] **Step 5:** Commit `plc-bridge: manda las cargas de la preparación a la base (usuario plc-bridge, cola en disco)`.

### Task 7: Bridge: página de prueba y manual

**Files:**
- Modify: `plc-bridge/prueba-visual.html`, `plc-bridge/Manual-plc-bridge.docx`, `plc-bridge/Manual-plc-bridge.pdf`

**Interfaces:**
- Consumes: el mensaje de Task 5 y Task 6.

- [ ] **Step 1:** `prueba-visual.html`: una línea «Preparación» por tanque activo (en curso, fase interna, kits, ajuste) y una línea «Cargas a la base» (área, pendientes, último envío, error).
- [ ] **Step 2: Manual (skill `anthropic-skills:docx`).** Versión 1.3 con fecha de hoy.
  - Corregir el número de migración del control de válvulas: dice `20261113490000`; el archivo es `20261114690000_valvula_aux_remota.sql`.
  - §1: el bridge ahora también manda las cargas de la preparación a la base.
  - §2 y §3: claves nuevas en la tabla, sección 7 y `PLC_BRIDGE_CLAVE`.
  - §5: tarea nueva «5.9 Poner o cambiar la clave del usuario plc-bridge» (SQL de Task 4 + `.env.local` + reiniciar).
  - §6 y §7: cómo probar con `PLC_AREA=PRUEBAS` y la clave en una variable de entorno, y `docker compose … up -d plc-bridge` al cambiar la clave.
  - §8: campos `preparacion`, `area` y `cargas`, más la tabla «Qué manda a la base».
  - §9: filas nuevas: clave incorrecta, «cargas de preparacion APAGADAS», «La preparación con PLC está apagada en…», «sin conexión con la base: N pendientes» y tags 24.x.
  - §10: «Enviar los datos a otro destino» ya no es «solo programación» para las cargas: pasa a describir `cargas.js`.
- [ ] **Step 3:** Exportar el PDF desde Word (COM `Word.Application`, `SaveAs2` con formato 17) y revisar las páginas nuevas.
- [ ] **Step 4:** Commit `plc-bridge: página de prueba y manual 1.3 con la preparación y las cargas`.

### Task 8: App: hook compartido del bridge

**Files:**
- Create: `src/lib/plc/bridge.ts`, `src/lib/plc/bridge.test.ts`
- Modify: `src/pages/apps/PreparacionPLC.tsx` (importa del hook; muestra una línea con `cargas` si hay error o pendientes)

**Interfaces:**
- Produces:
  - `URL_PLC_BRIDGE`.
  - Tipos `EstadoBridge` (el `EstadoLlenado` de hoy, más `preparacion?`, `area?` y `cargas?`), `PreparacionBridge`, `ResumenCargas`, `Llenado`, `AperturaAux`, `Persona` y `ResultadoOrden`.
  - `usePlcBridge(url: string, habilitado = true): { estado: EstadoBridge | null; conectado: boolean; enviar(orden: Record<string, unknown>): Promise<ResultadoOrden> }`.
    - Reintento con espera creciente de 2 s a 30 s.
    - Con `habilitado = false` no abre conexión.

- [ ] **Step 1: Tests** (WebSocket falso global, `vi.useFakeTimers()`):
  - `no se conecta si no está habilitado`;
  - `guarda el último estado y marca conectado`;
  - `reintenta con espera creciente`;
  - `enviar resuelve con la respuesta del bridge`;
  - `enviar sin conexión devuelve «Sin conexión al bridge.»`.
- [ ] **Step 2:** `npx vitest run src/lib/plc/bridge.test.ts`. Esperado: FALLA.
- [ ] **Step 3:** Mover `usePlcLlenado` y sus tipos a `bridge.ts` sin cambiar el comportamiento, salvo la espera creciente. `PreparacionPLC.tsx` lo importa.
- [ ] **Step 4:** Correr `npx vitest run src/lib/plc` y `npm run build`. Esperado: PASS.
- [ ] **Step 5:** Commit `App: la conexión al bridge pasa a un hook compartido`.

### Task 9: App: datos del PLC y el interruptor

**Files:**
- Create: `src/lib/preparacion/plc.ts`, `src/lib/preparacion/plc.test.ts`, `src/components/edicion-datos/AjustesDuena.test.tsx`
- Modify: `src/components/edicion-datos/AjustesDuena.tsx` (`InterruptorPreparacionPlc`)

**Interfaces:**
- Consumes: JSON de Task 4 y `EstadoBridge` de Task 8.
- Produces (en `plc.ts`):
  - Tipos:
    - `EstadoCargaPlc = "EN_CURSO" | "PENDIENTE" | "CONFIRMADA" | "DESCARTADA"`;
    - `AjustePlc {id, litros, iniciadoEn, hechoEn: string|null, sumado: boolean, noSumadoMotivo: string|null}`;
    - `CargaPlc {id, numeroTanque: 1|2|3, estado, aguaFormulaL: number|null, kits: number|null, kitsListos: boolean, kitsUsados: number|null, iniciadaEn, terminadaEn: string|null, ajustes: AjustePlc[]}`;
    - `ParteAjuste {origen: "PLC"|"MANUAL", litros, creadoEn, detalle: string|null}`;
    - `DesgloseLote {loteId, lote: string|null, unidades, litrosPorUnidad: number|null, restoL, desvaseL, totalL: number|null, ajustes: ParteAjuste[]}`;
    - `PlcTanqueGuardado {numeroTanque, cola: CargaPlc[], cargaDelLote: CargaPlc|null, desglose: DesgloseLote|null}`;
    - `EstadoPreparacionPlc {habilitado: boolean, tanques: PlcTanqueGuardado[]}`;
    - `DatosConfirmarCarga {cargaId, saborId, lote, kits: number|null, desvaseId: string|null, paraVacio: boolean, liberar: boolean}`;
    - `VistaVivaTanque {fase: 1|2|3|null, llenando: boolean, aguaFormulaL: number|null, litrosAgua: number|null, caudalLMin: number|null, kits: number|null, ajusteL: number|null, litrosAjuste: number|null}`;
    - `PlcDelTanque {vivo: VistaVivaTanque|null, cola: CargaPlc[], cargaDelLote: CargaPlc|null, desglose: DesgloseLote|null}`.
  - Funciones:
    - `mapearEstadoPlc(data: unknown): EstadoPreparacionPlc`;
    - `leerEstadoPlc(usuario, turnoId): Promise<Lectura<EstadoPreparacionPlc>>`;
    - `confirmarCargaPlc(usuario, turnoId, datos): Promise<Resultado & { data?: unknown }>`;
    - `descartarCargaPlc(usuario, turnoId, cargaId): Promise<Lectura<EstadoPreparacionPlc>>`;
    - `usePreparacionPlcActivo(area: string | null): boolean | null`;
    - `guardarPreparacionPlc(usuario, area, activo)`;
    - `vistaVivaTanque(estado: EstadoBridge | null, numero: 1|2|3, area: string | null): VistaVivaTanque | null`;
    - `kitsDeMedioEnMedio(kits: number): boolean`.

- [ ] **Step 1: Tests** (`plc.test.ts`):
  - `mapearEstadoPlc pasa números que llegan como texto y nulls`;
  - `sin respuesta, deshabilitado y sin tanques`;
  - `vistaVivaTanque: null sin conexión, sin preparación, con otro tanque o con el bridge de otra área`;
  - `sin campo area, solo vale para ASEPTICO`;
  - `fase por los booleanos (3 gana a 2 gana a 1)`;
  - `litrosAgua usa litros_tanque y si falta litros_actuales`;
  - `con ajuste_l > 0, litrosAjuste = litros_actuales`;
  - `kitsDeMedioEnMedio: 2 y 2,5 sí; 2,3 no`.

  Y en `AjustesDuena.test.tsx` (con `@/lib/supabase` simulado): `el interruptor de la preparación con PLC pide confirmar y guarda`, que llama `guardar_preparacion_plc` con `ASEPTICO` y `true`.
- [ ] **Step 2:** Correr los dos. Esperado: FALLA.
- [ ] **Step 3: Implementar.** `InterruptorPreparacionPlc` lleva:
  - título «Preparación con PLC (Aséptico)»;
  - encendido: «Encendido · los kits y ajustes llegan del PLC»;
  - apagado: «Apagado · el supervisor escribe los kits»;
  - confirmar encender: «Desde ahora Preparación toma del PLC los kits y los ajustes de agua; el supervisor solo elige sabor y lote. Hazlo con el bridge funcionando y el usuario plc-bridge con su clave. ¿Encender?»;
  - confirmar apagar: «Preparación vuelve al formulario manual y las cargas del PLC que no se registraron se descartan. ¿Apagar?».
- [ ] **Step 4:** Correr los tests. Esperado: PASS.
- [ ] **Step 5:** Commit `App: datos del PLC para Preparación e interruptor en Ajustes de planta`.

### Task 10: App: hook de la preparación con PLC y cableado

**Files:**
- Create: `src/lib/preparacion/usePreparacionPlc.ts`, `src/lib/preparacion/usePreparacionPlc.test.tsx`
- Modify:
  - `src/lib/preparacion/usePreparacion.ts` (`confirmarCargaPlc(datos)` con `tomarDatos`, como las otras acciones);
  - `src/components/tanques/tipos.ts` (`AccionesTanque` suma `confirmarCargaPlc: (datos: DatosConfirmarCarga) => Promise<Resultado>` y `descartarCargaPlc: (cargaId: string) => Promise<Resultado>`);
  - `src/components/EstadoPlantaTabs.tsx` (prop `conPlc?: boolean`, por defecto false, y prop `plc` a `TanqueCard`);
  - `src/pages/apps/Preparacion.tsx` (`conPlc={!enModoCorreccion}`);
  - `src/components/tanques/TanqueCard.test.tsx` (los dos mocks nuevos en `crearAcciones`; nada más cambia).

**Interfaces:**
- Consumes: Task 8 y Task 9.
- Produces: `usePreparacionPlc({ turnoId, usuario, area, habilitado }: { turnoId: string | null; usuario: string; area: string | null; habilitado: boolean }): { activo: boolean | null; delTanque(n: 1|2|3): PlcDelTanque; recargar(): Promise<void>; descartar(cargaId: string): Promise<Resultado> }`.
  - Relee cada 10 s mientras está encendido.
  - Relee a los 2 s de cada transición del bridge: cambia `preparacion.activa`, baja `fase_2` o `ajuste_l` pasa de mayor que 0 a 0.

- [ ] **Step 1: Tests** (`supabase` y `usePlcBridge` simulados, `vi.useFakeTimers()`):
  - `apagado no lee ni se conecta`;
  - `encendido lee el estado y lo reparte por tanque`;
  - `relee a los 2 s cuando baja PREPARACION en el bridge`;
  - `descartar devuelve el estado nuevo`.
- [ ] **Step 2:** Correr. Esperado: FALLA.
- [ ] **Step 3:** Implementar y cablear. En `EstadoPlantaTabs`, `confirmarCargaPlc` = `preparacion.confirmarCargaPlc` seguido de `plc.recargar()`.
- [ ] **Step 4:** `npm test` (todo) y `npm run build`. Esperado: PASS, con `TanqueCard.test.tsx` intacto.
- [ ] **Step 5:** Commit `App: Preparación lee las cargas del PLC (con el interruptor encendido)`.

### Task 11: Tarjeta: en vivo, desglose y ajustes

**Files:**
- Create: `src/components/tanques/PlcEnVivo.tsx`, `src/components/tanques/DesgloseLote.tsx`, `src/components/tanques/TanqueCard.plc.test.tsx`
- Modify: `src/components/tanques/TanqueCard.tsx` (prop `plc?: PlcDelTanque | null`)

**Interfaces:**
- Consumes: `PlcDelTanque` (Task 9).
- Produces: `PlcEnVivo({ vivo })` y `DesgloseLote({ desglose, cargaDelLote, ajusteEnCurso })`.

- [ ] **Step 1: Tests** (`TanqueCard.plc.test.tsx`, mismos armadores que `TanqueCard.test.tsx`, con `plc`):
  - `en vivo, agua entrando`:
    - el badge dice «Preparación en curso · PLC»;
    - se ven «Agua de la fórmula: 4.800 L», «Entraron 3.120 L · 95 L/min» y una barra con la marca «80 %»;
    - no se nombran fases;
    - el dibujo muestra «+3.120 / 4.800 L».
  - `en vivo, con kits`: «Kits: 2».
  - `en vivo, ajuste en curso`: «Ajuste de agua en curso: +100 L (entraron 40 L)».
  - `desglose del lote En Preparación`, con líneas y montos:
    - «2 kits × 3.000 L» 6.000 L;
    - «Resto del lote anterior» 1.200 L;
    - «Ajuste 1 · PLC · <hora>» +100 L;
    - «Ajuste 2 · a mano · <hora>» +50 L;
    - «Total» 7.350 L.
  - `kits corregidos dicen lo que marcó el PLC`: «El PLC marcó 2 kits.».
  - `ajuste del PLC después de liberar: se ve y no suma`: «Ajuste del PLC después de liberar, no se sumó: +40 L · <hora>».
  - `sin plc la tarjeta queda igual`: con `plc` null o sin pasar, ningún texto nuevo.
- [ ] **Step 2:** `npx vitest run src/components/tanques/TanqueCard.plc.test.tsx`. Esperado: FALLA.
- [ ] **Step 3: Implementar.**
  - **Badge:** «Preparación en curso · PLC» (variante `info`) si hay `vivo` o `cola[0]` en `EN_CURSO`.
  - **`TanqueVisual`:**
    - `llenado` = `{litros: litrosAjuste, setpointL: ajusteL, caudalLMin}` con ajuste, si no `{litros: litrosAgua, setpointL: aguaFormulaL, caudalLMin}`, solo si `vivo.llenando`;
    - con `vivo` y el tanque sin líquido, se dibuja como `EN_PREPARACION` (la mezcla, sin color de sabor).
  - **`PlcEnVivo`**, debajo del dibujo. Barra de avance: litros sobre el agua de la fórmula, con una marca en el 80 %.
  - **`DesgloseLote`** si el tanque está `EN_PREPARACION` y hay `desglose`. Las líneas de ajustes no sumados salen también con el tanque `LISTO`.
- [ ] **Step 4:** Correr. Esperado: PASS, y `TanqueCard.test.tsx` igual.
- [ ] **Step 5:** Commit `Tarjeta de Preparación: el PLC en vivo y el desglose del lote con los ajustes`.

### Task 12: Tarjeta: registrar o descartar la carga del PLC

**Files:**
- Create: `src/components/tanques/PanelCargaPlc.tsx`, `src/components/tanques/FormConfirmarCargaPlc.tsx`
- Modify:
  - `src/components/tanques/TanqueCard.tsx` (muestra `PanelCargaPlc` con `cola.length > 0`, también en `CIP` y `EN_PREPARACION`);
  - `src/components/tanques/PanelAccionesTanque.tsx` y `src/components/tanques/PanelVacioTanque.tsx` (prop `ocultarPreparar`: con carga pendiente no se ofrece «Iniciar Preparación» ni «Preparar para Vacío»);
  - `src/components/tanques/TanqueCard.plc.test.tsx`.

**Interfaces:**
- Consumes: `AccionesTanque.confirmarCargaPlc` / `descartarCargaPlc` (Task 10) y `CargaPlc` (Task 9).
- Produces: `PanelCargaPlc({ tanque, carga, enCola, loteAbierto, loteActivo, corridasSinPt, sabores, areaCodigo, usuarioSesion, calidadLibera, modoVacio, acciones })`.

- [ ] **Step 1: Tests:**
  - `cargando kits: aviso y sin formulario`: «El PLC está cargando esta preparación. Cuando termine la pulpa, aquí eliges sabor y lote.».
  - `carga lista`:
    - el título «Falta sabor y lote»;
    - «Cargado en el PLC: 4.800 L de agua · 2 kits»;
    - sin campo de kits, con «Kits: 2 (del PLC)» y botón «Corregir»;
    - «Registrar» llama `confirmarCargaPlc({cargaId, saborId, lote, kits: null, desvaseId: null, paraVacio: false, liberar: false})`.
  - `corregir kits avisa que difiere del PLC`: con 2,5, «Difiere del PLC (2).» y manda `kits: 2.5`.
  - `kits del PLC que no van de medio en medio obligan a corregir`: con 2,3, «El PLC marcó 2,3 kits y van de medio en medio: corrígelos.»; «Registrar» deshabilitado hasta corregir.
  - `sin kits del PLC hay que escribirlos`: «El PLC no registró los kits: escríbelos.».
  - `terminada en el PLC: Registrar y liberar`: muestra «El operador terminó en el PLC a las <hora>.» y la lista de ajustes; manda `liberar: true`.
  - `con Calidad libera solo Registrar`: no hay «Registrar y liberar».
  - `Modo Vacío: Registrar para Vacío` (`paraVacio: true`, `liberar: false`).
  - `resto en el tanque`:
    - «En el tanque había 1.200 L de Fresa (lote 0001).» con «Se sumaron a esta preparación» elegido;
    - con «Se sacaron antes», «Registrar» se deshabilita y aparece «Haz primero la transferencia o el desvase (botones de abajo) y después registra la carga.».
  - `resto de otro sabor pide confirmar la mezcla`: «¿Seguro? Sí, mezclar y registrar».
  - `más de 20.000 L avisa sin bloquear`: «Pasa de 20.000 L: revísalo. El líquido ya está en el tanque, así que se puede registrar igual.», con «Registrar» habilitado.
  - `Libera primero`: tanque `EN_PREPARACION` → «Libera primero el lote 0002: el PLC ya terminó esa preparación. Si esta carga es la misma que registraste a mano, descártala.», sin formulario.
  - `lote de Vacío y línea parada sin PT bloquean`:
    - «El tanque tiene un lote de Vacío: entrégalo o pásalo a Aséptico primero (en MODO VACÍO).»;
    - con PT pendiente, el botón «Cargar PT».
  - `cola de dos: avisa y registra la más antigua`: «Hay 2 cargas del PLC para este tanque: registra primero esta (la más antigua).».
  - `descartar pide confirmar`: «Descartar carga» → «¿Descartar esta carga del PLC? No se va a usar para ningún lote.» → «Sí, descartar» llama `descartarCargaPlc(cargaId)`.
  - `con carga pendiente no se ofrece la preparación manual`: no hay «Iniciar Preparación»; sí «Transferir» y «Desvase».
  - `encendido y sin cargas, el formulario manual sigue`: con `cola` vacía está «Iniciar Preparación», como hoy.
  - `desvase guardado se elige y se manda`: con un desvase del sabor elegido, se manda su `desvaseId` y el estimado lo suma.
  - `en CIP se puede registrar la carga`.
  - `error de la base se muestra`: un `ok: false` sale con `MensajeError`.
- [ ] **Step 2:** Correr. Esperado: FALLA.
- [ ] **Step 3: Implementar.**
  - `FormConfirmarCargaPlc` reusa de `FormIniciarPreparacion`:
    - la lista de sabores;
    - los desvases (`listarDesvases`);
    - la confirmación de mezcla;
    - el cálculo de litros estimados: kits × volumen del sabor + resto + desvase + ajustes del PLC ya cerrados.
  - Lo que cambia frente a ese formulario:
    - los kits vienen del PLC;
    - el tope avisa y no bloquea;
    - los botones dependen de `carga.estado`, `calidadLibera` y `modoVacio`.
  - `PanelCargaPlc` decide entre aviso, bloqueo y formulario, y siempre ofrece «Descartar carga».
- [ ] **Step 4:** `npm test` y `npm run build`. Esperado: PASS.
- [ ] **Step 5:** Commit `Tarjeta de Preparación: registrar o descartar la carga del PLC`.

### Task 13: Documentación, verificación completa y revisión

**Files:**
- Modify: `MAPA.md` (fila «Preparación con datos del PLC»: spec, migración, `src/lib/preparacion/plc.ts`, `usePreparacionPlc.ts`, `src/lib/plc/bridge.ts`, `src/components/tanques/PanelCargaPlc.tsx`, `FormConfirmarCargaPlc.tsx`, `PlcEnVivo.tsx`, `DesgloseLote.tsx`, `plc-bridge/src/cargas.js`, `ciclo.js`)

- [ ] **Step 1:** `MAPA.md`.
- [ ] **Step 2: Verificación completa.** Esperado: todo PASS. Se anota en el reporte la falla de `ModoParadas.test.tsx`, que ya existía.
  - `npm test`;
  - `npm run build`;
  - `npm run lint`;
  - `cd plc-bridge && npm test`;
  - `cd scripts/base-local && node construir.mjs ../../supabase/migrations && node correr.mjs ../ensayo-20261115990000.sql`.
- [ ] **Step 3: Prueba de punta a punta del bridge contra la base local.**
  1. Crear `scripts/base-local/postgrest-falso.mjs`. Carga la base con la migración nueva y le pone a `plc-bridge` la clave dada. Atiende `POST /rpc/<funcion>` como PostgREST:
     - `set_config('request.path', '/rpc/<funcion>')` y `set_config('request.headers', '{"x-sesion": …}')`;
     - `select revisar_peticion()` con `seguridad_config.modo = 'EXIGIR'`;
     - la función con argumentos por nombre;
     - una función de tabla responde un arreglo y una escalar responde el valor;
     - un error responde 400 `{code, message}`, y 403 si el código es 28000.

     Cada 5 s imprime las cargas y sus ajustes.
  2. Correr el bridge con `PLC_MODO=simulacion`, `PLC_SIM_VELOCIDAD=10` (factor de tiempo del ciclo, en `ciclo.js`; por defecto 1), `PLC_API_URL=http://localhost:4999`, `PLC_AREA=PRUEBAS` y `PLC_BRIDGE_CLAVE`.
  3. Esperado, en menos de 2 minutos: una carga que pasa de `EN_CURSO` a `PENDIENTE`, con kits en medios y sus ajustes cerrados, sin duplicados. Matar y volver a arrancar el bridge a mitad de un ciclo: la cola se vacía y no se duplica nada.
- [ ] **Step 4:** Commit `Preparación con PLC: mapa del proyecto`.
- [ ] **Step 5:** Revisión completa de la rama (skill de revisión de código) y corrección de lo que encuentre.
