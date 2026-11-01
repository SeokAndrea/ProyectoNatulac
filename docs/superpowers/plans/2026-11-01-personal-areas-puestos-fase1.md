# Personal: áreas, puestos y permisos — Fase 1 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada persona tiene un Puesto (área + nivel + permisos); los jefes gestionan solo a su área y a niveles menores; Personal se ve como organigrama y quien administra edita áreas y puestos en una matriz. Al terminar, el Jefe de Mantenimiento edita el Catálogo de Paradas y gestiona solo a su gente.

**Architecture:** Tablas nuevas `puestos` y `puesto_permisos`, columnas nuevas en `areas`, `permisos` y `usuarios`. `tiene_permiso()` pasa a leer puesto + extras. Cada puesto guarda un `rol_equivalente_id` y un trigger mantiene `usuario_roles` (rol y área) en sincronía, así las 62 funciones SQL y los archivos que todavía preguntan por rol o área siguen andando (eso se cambia en la Fase 2). Todas las reglas de gestión viven en funciones SQL `security definer`; el front solo muestra y llama.

**Tech Stack:** React + TypeScript + Vite, Vitest (`npm test`), PostgreSQL 17 + PostgREST (RPC), Tailwind, base local en Docker (`local/`).

**Spec:** `docs/superpowers/specs/2026-11-01-personal-areas-puestos-design.md`

## Global Constraints

- Rama `personal-areas-puestos`. No mezclar los cambios sin subir del árbol (Modo TV, Panel de Paradas): agregar al commit solo los archivos de cada tarea.
- Migraciones nuevas, en orden: `20261113990000_puestos_estructura.sql`, `20261114090000_puestos_personas.sql`, `20261114190000_puestos_permisos_y_sesion.sql`, `20261114290000_personal_reglas.sql`, `20261114390000_estructura_gestion.sql`. Se prueban con `bash local/aplicar-migraciones.sh` sobre la base local.
- Niveles fijos: `1 Jefatura`, `2 Coordinación`, `3 Operación`, `4 Apoyo`. Super Administrador y Probador: `nivel null` y `todos_los_permisos = true`.
- Permisos nuevos: `ESTRUCTURA_GESTIONAR`, `LECTURAS_SI`, `CODIGOS_MTTO_EDITAR`, `REPORTES_PARADAS_VER`. Temas: `TURNOS`, `PARADAS`, `MANTENIMIENTO`, `DATOS`, `PERSONAS`, `ADMINISTRACION`.
- Gestión de personal (regla 2 del spec): misma área **y** `nivel` del puesto destino `>` nivel propio; permisos extra ⊆ permisos efectivos propios; nadie se edita a sí mismo puesto ni permisos; eliminar solo con `ESTRUCTURA_GESTIONAR`; la dueña (`ve_errores`) no la edita nadie más.
- Un puesto no cambia de área; un puesto con gente no se borra (solo `activo = false`).
- Textos en español sin voseo ni argentinismos, cortos (`SiempreLeer.md`, `PRODUCT.md`). Todo funciona a 400 px de ancho.
- Toda mutación llama `registrar_auditoria(...)` con antes y después.
- Las pruebas SQL son scripts de ensayo `scripts/ensayo-personal-*.sql` que terminan en `raise exception` si un caso falla; se corren con `docker compose -f local/docker-compose.yml exec -T db psql -U postgres -d natulac -v ON_ERROR_STOP=1 -f - < scripts/<archivo>` **dentro de una transacción con `rollback` al final** (no ensucian la base).

## Review Focus

- **Personas con combinaciones raras** (rol `VISTA` en área Mantenimiento, `SUPERVISOR` sin área, `CALIDAD` en Aséptico): la migración no adivina; frena con la lista. → Task 2 lo prueba.
- **Un jefe que manipula la llamada** (manda `p_puesto_id` de otra área o de su mismo nivel, o se manda a sí mismo): la base rechaza con mensaje claro. → Task 4 lo prueba.
- **Quitar un permiso de un puesto con gente conectada**: `tiene_permiso` cambia en el momento y `perfil_sesion` lo refleja al refrescar. → Task 3 y Task 5 lo prueban.
- **Probador y Super Administrador** siguen pudiendo todo (incluidos los permisos que se creen después) sin estar en la matriz. → Task 3 lo prueba.
- **Usuarios del Área de Pruebas** siguen viendo todas las tarjetas y sus datos de Pruebas (no los de Aséptico). → Task 2 (área sincronizada) y Task 9 (`puedeVerApp`) lo prueban.

---

### Task 1: Estructura en la base (áreas, permisos con tema, puestos)

**Files:**
- Create: `supabase/migrations/20261113990000_puestos_estructura.sql`
- Create: `scripts/ensayo-personal-1-estructura.sql`

**Interfaces:**
- Produces (SQL):
  - `areas`: `+ tipo text not null default 'APOYO' check (tipo in ('PRODUCCION','APOYO'))`, `+ orden int not null default 0`. (`activo` ya existe.) Valores: ASEPTICO y PRUEBAS = PRODUCCION; resto APOYO; CALIDAD `activo = false`. Orden: Aséptico 1, Mantenimiento 2, Servicios Industriales 3, Otros 4, Pruebas 5, Calidad 6, Vacío 7.
  - `permisos`: `+ tema text not null default 'DATOS'`, con el tema de cada permiso existente y los 4 nuevos (ver Global Constraints).
  - `puestos (id uuid pk, codigo text unique not null, nombre text not null, area_id uuid references areas, nivel smallint check (nivel between 1 and 4), todos_los_permisos boolean not null default false, rol_equivalente_id uuid not null references roles, activo boolean not null default true, created_at timestamptz default now())`, con `check ((area_id is null) = (nivel is null) or todos_los_permisos)`.
  - `puesto_permisos (puesto_id uuid references puestos on delete cascade, permiso_codigo text references permisos, primary key (puesto_id, permiso_codigo))`.
  - Trigger `puestos_no_borrar` (como `catalogo_no_borrar`) y trigger `puestos_area_fija` que rechaza cambiar `area_id` en un update.
  - Semilla de los puestos de la sección 4 del spec (códigos: `JEFE_PRODUCCION`, `COORDINADOR_PRODUCCION`, `SUPERVISOR`, `PASANTE`, `JEFE_MANTENIMIENTO`, `SUPERVISOR_MANTENIMIENTO`, `TECNICO_MANTENIMIENTO`, `SERVICIOS_INDUSTRIALES`, `SOLO_VISTA`, `JEFE_CALIDAD`, `SUPERVISOR_CALIDAD`, `ANALISTA_CALIDAD` (estos tres `activo = false`), `PROBADOR`, `SUPERADMINISTRADOR`) con su `rol_equivalente_id`: Jefe → `JEFE_PRODUCCION`, Coordinador → `ANALISTA`, Supervisor y Pasante → `SUPERVISOR`, los tres de Mantenimiento → `MANTENIMIENTO`, SI → `SERVICIOS_INDUSTRIALES`, Solo Vista → `VISTA`, Calidad → `CALIDAD`/`SUPERVISOR_CALIDAD`/`CALIDAD`, Probador → `SUPERVISOR`, Super Admin → `SUPERADMINISTRADOR`.
  - `puesto_permisos` según la tabla de la sección 4 del spec (Jefe y Coordinador de Producción: los de `rol_permisos` de `ANALISTA` ∪ `JEFE_PRODUCCION` ∪ `REPORTES_PARADAS_VER`).

- [ ] **Step 0: Copia de la base antes de empezar** (para el ensayo desde cero de la Task 10): `docker compose -f local/docker-compose.yml exec -T db psql -U postgres -c "create database natulac_antes_personal template natulac"` → `CREATE DATABASE`.
- [ ] **Step 1: Escribir el ensayo** `scripts/ensayo-personal-1-estructura.sql` (`begin; … rollback;`). Casos, cada uno con `raise exception` si falla:
  - existen 14 puestos; 3 inactivos (los de Calidad).
  - `JEFE_MANTENIMIENTO` tiene `CATALOGO_PARADAS` y `PERSONAL_GESTIONAR`; `SUPERVISOR_MANTENIMIENTO` y `TECNICO_MANTENIMIENTO` no tienen ninguno de los dos.
  - `PASANTE` no tiene ningún permiso.
  - `COORDINADOR_PRODUCCION` y `JEFE_PRODUCCION` tienen el mismo conjunto, que incluye `VALIDAR`.
  - `update puestos set area_id = <otra> where codigo='SUPERVISOR'` falla; `delete from puestos where codigo='PASANTE'` falla.
  - todos los permisos tienen un tema de la lista.
- [ ] **Step 2: Correrlo y ver que falla** (las tablas no existen).
- [ ] **Step 3: Escribir la migración** `20261113990000_puestos_estructura.sql`.
- [ ] **Step 4: Aplicar y correr el ensayo.** `bash local/aplicar-migraciones.sh` → «Listo: 1 migraciones nuevas.»; ensayo → sin errores.
- [ ] **Step 5: Commit** `git add supabase/migrations/20261113990000_puestos_estructura.sql scripts/ensayo-personal-1-estructura.sql && git commit -m "Personal: tablas de puestos, temas de permisos y áreas en la base"`.

### Task 2: Paso de las personas y sincronía con usuario_roles

**Files:**
- Create: `supabase/migrations/20261114090000_puestos_personas.sql`
- Create: `scripts/ensayo-personal-2-personas.sql`
- Create: `scripts/revisar-personal-puestos.sql` (la lista para la dueña)

**Interfaces:**
- Consumes: tablas y semillas de la Task 1.
- Produces (SQL):
  - `usuarios`: `+ puesto_id uuid references puestos`, `+ titulo text`. Después del paso, `puesto_id not null` para todo usuario menos `sistema`.
  - Paso según la tabla de la sección 5 del spec. El título se llena con: «Analista de Producción» (desde `ANALISTA`), «Subjefe» (cargo `SUBJEFE`), y para `VISTA` el nombre del área de origen si tenía. **Si queda algún usuario (menos `sistema`) sin puesto, la migración hace `raise exception` con la lista `usuario · rol · área · cargo`.**
  - Trigger `usuarios_sincroniza_rol` (after insert or update of `puesto_id` on `usuarios`): escribe en `usuario_roles` el `rol_equivalente_id` y el `area_id` del puesto (Super Admin: `area_id null`).
  - `scripts/revisar-personal-puestos.sql`: `select usuario, nombre, rol_antes, area_antes, cargo_antes, puesto, titulo` para correr **antes** de aplicar en planta (calcula el paso sin escribir).

- [ ] **Step 1: Escribir el ensayo** `scripts/ensayo-personal-2-personas.sql` (`begin; … rollback;`). Antes de aplicar la migración, guarda en una tabla temporal `(usuario, rol, area)` de `usuario_roles`; crea usuarios de prueba con cada fila de la tabla de la sección 5 (incluido uno de Pruebas con rol `SUPERVISOR` y uno `MANTENIMIENTO` con cargo `JEFE_MANTENIMIENTO`); aplica el cuerpo de la migración; verifica:
  - cada usuario de prueba tiene el puesto y el título esperados (el analista → `COORDINADOR_PRODUCCION` con título «Analista de Producción»; el de Pruebas → `PROBADOR`).
  - `usuario_roles` de cada usuario que ya existía **no cambió** (mismo rol y área que antes).
  - cambiar `puesto_id` de un usuario a `TECNICO_MANTENIMIENTO` deja su `usuario_roles` en `MANTENIMIENTO` / área Mantenimiento.
  - un usuario con rol `VISTA` en área `MANTENIMIENTO` hace fallar la migración con un mensaje que contiene su usuario.
- [ ] **Step 2: Correrlo y ver que falla** (la columna `puesto_id` no existe).
- [ ] **Step 3: Escribir la migración y `scripts/revisar-personal-puestos.sql`.**
- [ ] **Step 4: Aplicar y correr el ensayo** → sin errores; correr `scripts/revisar-personal-puestos.sql` contra la base local y revisar que no haya filas sin puesto.
- [ ] **Step 5: Commit** los tres archivos: `"Personal: cada persona pasa a su puesto; usuario_roles se sincroniza solo"`.

### Task 3: Permisos por puesto, sesión y los cuatro permisos nuevos

**Files:**
- Create: `supabase/migrations/20261114190000_puestos_permisos_y_sesion.sql`
- Create: `scripts/ensayo-personal-3-permisos.sql`

**Interfaces:**
- Consumes: Task 1 y 2.
- Produces (SQL):
  - `tiene_permiso(p_usuario text, p_permiso text) returns boolean`: usuario activo y (`puesto.todos_los_permisos` o existe en `puesto_permisos` de su puesto o en `usuario_permisos`). Ya no lee `rol_permisos` ni el código `SUPERADMINISTRADOR`.
  - `perfil_sesion(p_usuario text) returns jsonb`: suma `puesto_id`, `puesto` (nombre), `nivel`, `titulo`; mantiene `rol` (el equivalente), `area` (la del puesto), `es_dueno`, `permisos`; quita `cargo`.
  - `permisos_de_puesto(p_usuario text, p_puesto_id uuid) returns text[]` (solo la dueña, para «Ver como»); reemplaza a `permisos_de_rol`.
  - `exigir_editor_mtto(p_usuario text)`: pide `CODIGOS_MTTO_EDITAR` (o dueña) en vez del área.
  - `registrar_lectura_servicios_industriales(...)`: pide `LECTURAS_SI` en lugar del chequeo de rol (misma firma).

- [ ] **Step 1: Escribir el ensayo** (`begin; … rollback;`): con usuarios de prueba,
  - Técnico de Mantenimiento: `tiene_permiso(.., 'SIF_GESTIONAR')` true, `'CATALOGO_PARADAS'` false; Jefe de Mantenimiento: `'CATALOGO_PARADAS'` true.
  - `delete from puesto_permisos where puesto=TECNICO and permiso='SIF_GESTIONAR'` → `tiene_permiso` del técnico pasa a false en la misma transacción.
  - un permiso extra en `usuario_permisos` da true aunque el puesto no lo tenga.
  - Super Admin y Probador: true para un permiso creado dentro del ensayo (`insert into permisos ('PRUEBA_X', ..)`).
  - usuario inactivo: false.
  - `perfil_sesion` del Jefe de Mantenimiento trae `nivel = 1`, `area = 'MANTENIMIENTO'`, `rol = 'MANTENIMIENTO'`.
  - `exigir_editor_mtto` falla para un Solo Vista del área Mantenimiento y pasa para un usuario de otra área con el extra `CODIGOS_MTTO_EDITAR`.
- [ ] **Step 2: Correrlo y ver que falla.**
- [ ] **Step 3: Escribir la migración.**
- [ ] **Step 4: Aplicar y correr el ensayo** → sin errores; correr también `scripts/ensayo-personal-1-estructura.sql` y `-2-personas.sql` (siguen pasando).
- [ ] **Step 5: Commit** `"Personal: los permisos salen del puesto; sesión con puesto y nivel"`.

### Task 4: Reglas de gestión de personal en la base

**Files:**
- Create: `supabase/migrations/20261114290000_personal_reglas.sql`
- Create: `scripts/ensayo-personal-4-reglas.sql`

**Interfaces:**
- Consumes: Task 3.
- Produces (SQL; las firmas viejas de `crear_usuario`, `editar_personal` y `listar_personal` se borran con `drop function`):
  - `puede_gestionar_personal(p_creador_usuario text, p_usuario_id uuid) returns boolean` (misma firma): false si es él mismo o la dueña (salvo que el creador sea la dueña); true con `ESTRUCTURA_GESTIONAR`; con `PERSONAL_GESTIONAR`: misma área del puesto y `nivel destino > nivel propio`. `restablecer_password`, `desactivar_personal` y `reactivar_personal` ya la usan y no cambian.
  - `puestos_asignables(p_usuario text) returns table (puesto_id uuid, codigo text, nombre text, area_codigo text, nivel smallint)`: activos; con `ESTRUCTURA_GESTIONAR` todos; con `PERSONAL_GESTIONAR` los de su área con nivel mayor al suyo.
  - `listar_personal(p_usuario text) returns table (usuario_id uuid, usuario text, nombre text, cedula text, puesto_id uuid, puesto text, area_codigo text, nivel smallint, titulo text, activo boolean, gestionable boolean, created_at timestamptz)`: con `ESTRUCTURA_GESTIONAR` todos; con `PERSONAL_GESTIONAR` solo su área (incluye a sus pares y jefes con `gestionable = false`); sin permiso, error.
  - `crear_usuario(p_creador_usuario text, p_usuario text, p_password text, p_puesto_id uuid, p_nombre text, p_cedula text default null, p_titulo text default null, p_pagina text default null) returns uuid`: el puesto debe estar en `puestos_asignables(p_creador_usuario)`.
  - `editar_personal(p_creador_usuario text, p_usuario_id uuid, p_nombre text, p_cedula text, p_puesto_id uuid, p_titulo text, p_pagina text default null) returns void`: `puede_gestionar_personal` y el puesto nuevo en `puestos_asignables`.
  - `guardar_permisos_extra(p_usuario text, p_usuario_id uuid, p_permisos text[], p_pagina text)` (misma firma): `puede_gestionar_personal` y cada permiso **agregado** debe cumplir `tiene_permiso(p_usuario, permiso)`; los que ya tenía la persona y el creador no tiene se conservan.
  - `eliminar_personal(...)` (misma firma): exige `ESTRUCTURA_GESTIONAR` o dueña.
  - Todas registran auditoría con antes y después.

- [ ] **Step 1: Escribir el ensayo** (`begin; … rollback;`) con un Jefe de Mantenimiento `jm`, un Técnico `tm`, un Supervisor de Mantenimiento `sm`, un Supervisor de Aséptico `sa` y el Super Admin `local`:
  - `listar_personal('jm')` trae `tm` y `sm` (gestionables) y no trae a `sa`.
  - `puestos_asignables('jm')` = `{SUPERVISOR_MANTENIMIENTO, TECNICO_MANTENIMIENTO}`.
  - `crear_usuario('jm', …, puesto=JEFE_MANTENIMIENTO)` falla; con `TECNICO_MANTENIMIENTO` funciona y la persona queda con `usuario_roles` = `MANTENIMIENTO`.
  - `editar_personal('jm', id de sa, …)` falla; `editar_personal('jm', id de jm, …)` falla (él mismo).
  - `guardar_permisos_extra('jm', tm, {CATALOGO_PARADAS})` funciona; con `{VALIDAR}` falla (jm no lo tiene).
  - `eliminar_personal('jm', tm, …)` falla; `eliminar_personal('local', tm, …)` funciona.
  - Un Supervisor de Mantenimiento (`sm`, sin `PERSONAL_GESTIONAR`): `listar_personal('sm')` falla.
- [ ] **Step 2: Correrlo y ver que falla.**
- [ ] **Step 3: Escribir la migración.**
- [ ] **Step 4: Aplicar y correr los ensayos 1 a 4** → sin errores.
- [ ] **Step 5: Commit** `"Personal: cada jefe gestiona su área y niveles menores (reglas en la base)"`.

### Task 5: Funciones para administrar áreas y puestos

**Files:**
- Create: `supabase/migrations/20261114390000_estructura_gestion.sql`
- Create: `scripts/ensayo-personal-5-estructura.sql`

**Interfaces:**
- Consumes: Task 1 y 3.
- Produces (SQL, todas exigen `ESTRUCTURA_GESTIONAR` salvo `listar_estructura`, que exige `ESTRUCTURA_GESTIONAR` o `PERSONAL_GESTIONAR`):
  - `listar_estructura(p_usuario text) returns jsonb`: `{ areas: [{codigo, nombre, tipo, activo, orden, personas}], puestos: [{id, codigo, nombre, area_codigo, nivel, activo, todos_los_permisos, personas, permisos: text[]}], permisos: [{codigo, nombre, tema}] }`. Con solo `PERSONAL_GESTIONAR` trae únicamente su área y sus puestos.
  - `guardar_area(p_usuario text, p_codigo text, p_nombre text, p_tipo text, p_activo boolean, p_pagina text) returns void`: crea si el código no existe (código en mayúsculas, sin espacios).
  - `guardar_puesto(p_usuario text, p_id uuid, p_area_codigo text, p_nombre text, p_nivel smallint, p_activo boolean, p_pagina text) returns uuid`: `p_id null` crea (código derivado del nombre, único); con `p_id` no acepta otra área; rol equivalente de un puesto nuevo = el del puesto activo de la misma área y nivel más cercano (si el área no tiene puestos: `VISTA`).
  - `guardar_permisos_puestos(p_usuario text, p_cambios jsonb, p_pagina text) returns int`: `p_cambios` = `[{puesto_id, permiso, activo: bool}]`; aplica todo en una transacción, rechaza puestos con `todos_los_permisos`, devuelve cuántos cambios aplicó; auditoría con un registro por puesto tocado.

- [ ] **Step 1: Escribir el ensayo** (`begin; … rollback;`):
  - `guardar_area('local','ALMACEN','Almacén','APOYO',true,…)` crea el área; `guardar_puesto('local', null, 'ALMACEN', 'Jefe de Almacén', 1, true, …)` crea el puesto.
  - `guardar_puesto('local', <id SUPERVISOR>, 'MANTENIMIENTO', …)` falla (cambio de área).
  - `guardar_permisos_puestos('local', '[{"puesto_id":<TECNICO>,"permiso":"CATALOGO_PARADAS","activo":true}, {…"SIF_GESTIONAR","activo":false}]')` devuelve 2 y `tiene_permiso` del técnico refleja los dos cambios.
  - con `<PROBADOR>` en los cambios: falla y no aplica ninguno.
  - `guardar_area` llamado por el Jefe de Mantenimiento falla; `listar_estructura('jm')` trae solo Mantenimiento.
- [ ] **Step 2: Correrlo y ver que falla.**
- [ ] **Step 3: Escribir la migración.**
- [ ] **Step 4: Aplicar y correr los ensayos 1 a 5** → sin errores.
- [ ] **Step 5: Commit** `"Personal: administrar áreas, puestos y la matriz de permisos"`.

### Task 6: Capa de datos del front y fuera las copias de catálogos

**Files:**
- Create: `src/lib/estructura.ts`, `src/lib/estructura.test.ts`
- Modify: `src/lib/personal.ts`, `src/lib/auth.tsx`, `src/lib/permisos.ts`, `src/lib/catalogos.ts`, `src/lib/catalogosLive.tsx`, y los que usan `AREAS`/`CARGOS`/`ROLES` para mostrar nombres: `src/components/EstadoBanner.tsx`, `src/components/AuditoriaTurnos.tsx`, `src/components/panel/BannerSuperior.tsx`, `src/components/panel/FiltrosPanel.tsx`, `src/components/RegistroCambios.tsx`, `src/lib/actaPdf.ts`, `src/lib/auditoria.ts`, `src/pages/apps/Historial.tsx`, `src/pages/apps/Programacion.tsx`, `src/pages/apps/Personal.tsx`, `src/pages/apps/EdicionDatos.tsx`
- Delete: `src/components/personal/PersonalPanel.tsx`, `FilaPersonal.tsx`, `FilaEdicionPersonal.tsx`, `FiltrosPersonal.tsx`, `FormularioNuevoPersonal.tsx`, `SelectoresPuesto.tsx`, `filtros.ts` (y sus tests si existen)

**Interfaces:**
- Consumes: RPC de las Tasks 3–5.
- Produces (TS):
  - `src/lib/estructura.ts`:
    - `export type Nivel = 1 | 2 | 3 | 4`; `export const NIVELES: { nivel: Nivel; nombre: string }[]` = Jefatura, Coordinación, Operación, Apoyo.
    - `export interface AreaEstructura { codigo: string; nombre: string; tipo: "PRODUCCION" | "APOYO"; activo: boolean; orden: number; personas: number }`
    - `export interface PuestoEstructura { id: string; codigo: string; nombre: string; areaCodigo: string | null; nivel: Nivel | null; activo: boolean; todosLosPermisos: boolean; personas: number; permisos: Permiso[] }`
    - `export interface PermisoEstructura { codigo: Permiso; nombre: string; tema: TemaPermiso }`, `export type TemaPermiso = "TURNOS" | "PARADAS" | "MANTENIMIENTO" | "DATOS" | "PERSONAS" | "ADMINISTRACION"`
    - `listarEstructura(usuario) : Promise<{ areas; puestos; permisos } | null>`, `guardarArea(...)`, `guardarPuesto(...)`, `guardarPermisosPuestos(usuario, cambios: CambioMatriz[], pagina): Promise<{ ok: true; aplicados: number } | { ok: false; error: string }>`
    - Puras: `export interface CambioMatriz { puestoId: string; permiso: Permiso; activo: boolean }`; `export function diferenciasMatriz(original: PuestoEstructura[], editada: Map<string, Set<Permiso>>): CambioMatriz[]`; `export function agruparPorNivel<T extends { nivel: Nivel | null }>(items: T[]): { nivel: Nivel; nombre: string; items: T[] }[]` (omite niveles vacíos; `null` va en un grupo aparte al final si existe).
  - `src/lib/personal.ts`: `PersonalRegistrado` pasa a `{ id, usuario, nombre, cedula, puestoId, puesto, areaCodigo, nivel, titulo, activo, gestionable }`; `agregarPersonal(usuarioSesion, datos: { usuario; password; puestoId; nombre; cedula?; titulo? }, pagina)`; `editarPersonal(usuarioSesion, id, datos: { nombre; cedula; puestoId; titulo }, pagina)`; `export interface PuestoAsignable { puestoId: string; codigo: string; nombre: string; areaCodigo: string; nivel: Nivel }`; `listarPuestosAsignables(usuarioSesion): Promise<PuestoAsignable[]>`. Se borran `permisosPorRol` y lo de cargo / área de origen.
  - Los componentes viejos de `src/components/personal/` (todos menos `EditorPermisosExtra.tsx`) se **borran en esta tarea**, y `src/pages/apps/Personal.tsx` muestra un `EmptyState` «Personal se está rehaciendo» hasta la Task 7. La pestaña Personal de `EdicionDatos.tsx` se quita.
  - `Session` (auth.tsx): `+ puestoId: string | null`, `+ puesto: string | null`, `+ nivel: Nivel | null`, `+ titulo: string | null`; `- cargo`.
  - `catalogos.ts`: se borran `AREAS`, `CARGOS`, `cargosDeArea`, `ROLES`, `CargoCodigo`; `AreaCodigo` pasa a `string`; `RolCodigo` se queda (Fase 2). `catalogosLive` agrega `areas: AreaEstructura[]` leídas de la base, y los archivos de la lista usan `areas` de `useCatalogosLive()` para los nombres.
  - `permisos.ts`: suma los 4 permisos nuevos a la lista.

- [ ] **Step 1: Escribir las pruebas que fallan** en `estructura.test.ts`:
  - `diferenciasMatriz`: marcar `CATALOGO_PARADAS` y desmarcar `SIF_GESTIONAR` en el técnico → exactamente esos 2 cambios; sin tocar nada → `[]`; marcar y volver a desmarcar → `[]`.
  - `agruparPorNivel`: personas de niveles 3, 1, 3 → grupos `[Jefatura (1), Operación (2)]` en ese orden, sin Coordinación ni Apoyo.
- [ ] **Step 2: Correr y ver que fallan.** `npx vitest run src/lib/estructura.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `estructura.ts`, los cambios de `personal.ts`, `auth.tsx` (lee los campos nuevos de `perfil_sesion`), `permisos.ts`, `catalogos.ts`, `catalogosLive.tsx` y los archivos que mostraban nombres desde `AREAS`.
- [ ] **Step 4: Verificar.** `npx vitest run src/lib/estructura.test.ts` → PASS; `npx tsc -b` → sin errores; `npm test` → todo verde.
- [ ] **Step 5: Commit** `"Personal: capa de datos de estructura; áreas desde la base, sin copias en catalogos.ts"`.

### Task 7: Pantalla Personal con organigrama

**Files:**
- Create: `src/components/personal/OrganigramaArea.tsx`, `src/components/personal/TablaPersonal.tsx`, `src/components/personal/PanelPersona.tsx`, `src/components/personal/MenuAreas.tsx`, `src/components/personal/PersonalPantalla.tsx`, `src/components/personal/PersonalPantalla.test.tsx`
- Modify: `src/components/personal/EditorPermisosExtra.tsx` (se reutiliza dentro de `PanelPersona`, recibe la lista de permisos ofrecibles), `src/pages/apps/Personal.tsx` (reemplaza el `EmptyState` de la Task 6 por `PersonalPantalla`, `fullWidth`)

**Interfaces:**
- Consumes: `listarPersonal`, `listarPuestosAsignables`, `agregarPersonal`, `editarPersonal`, `restablecerPassword`, `desactivarPersonal`, `reactivarPersonal`, `eliminarPersonal`, `guardarPermisosExtra` (Task 6); `listarEstructura`, `agruparPorNivel`, `NIVELES` (Task 6); `puede(session, "ESTRUCTURA_GESTIONAR")`.
- Produces: `export function PersonalPantalla({ pagina }: { pagina: string })`.

Comportamiento (maqueta B del brainstorming):
- `MenuAreas` (izquierda, filas deslizables en teléfono) solo con `ESTRUCTURA_GESTIONAR`: áreas con su número de personas, inactivas en gris, y abajo «Administración › Áreas y puestos» (enlace a `/areas-puestos`). Sin ese permiso no hay menú: se muestra el área de la sesión.
- `OrganigramaArea` (centro): una franja por nivel con `agruparPorNivel`; tarjeta por persona (nombre, puesto, título); inactivas al 45 % de opacidad; la elegida con borde primario. Arriba: buscador (nombre, usuario o cédula; resalta y desplaza a la tarjeta), botón «Tabla» (cambia a `TablaPersonal`, la misma gente agrupada por nivel) y «+ Persona» (solo si `puestos_asignables` no está vacío).
- `PanelPersona` (derecha; a pantalla completa en teléfono): Puesto (select con `puestos_asignables`), Título visible, Nombre, Cédula, Usuario y Contraseña inicial (solo al crear), «Permisos del puesto» (solo lectura), Permisos extra (casillas, solo los de la sesión), «Guardar», «Restablecer contraseña», «Desactivar»/«Reactivar», «Eliminar» (solo `ESTRUCTURA_GESTIONAR`, con confirmación «¿Seguro? Sí, eliminar»). Si `gestionable` es false, el panel es de solo lectura sin botones.

- [ ] **Step 1: Escribir las pruebas que fallan** en `PersonalPantalla.test.tsx` (mock de `@/lib/personal` y `@/lib/estructura`, como en `src/components/lineas/LineaCard.test.tsx`):
  - sesión de Jefe de Mantenimiento: no aparece «Áreas y puestos» ni el menú de áreas; aparecen las franjas «Jefatura» y «Operación» con sus personas.
  - el select de Puesto del panel ofrece solo «Supervisor de Mantenimiento» y «Técnico de Mantenimiento».
  - las casillas de permisos extra son solo los permisos de la sesión.
  - una persona con `gestionable: false` abre el panel sin el botón «Guardar».
  - sesión con `ESTRUCTURA_GESTIONAR`: aparece el menú con «Mantenimiento 3» y el botón «Eliminar».
  - escribir «tor» en el buscador marca la tarjeta de «Ana Torres».
- [ ] **Step 2: Correr y ver que fallan.** `npx vitest run src/components/personal/PersonalPantalla.test.tsx`.
- [ ] **Step 3: Implementar** los componentes y borrar los viejos.
- [ ] **Step 4: Verificar.** El test → PASS; `npx tsc -b` → sin errores; `npm test` → verde; abrir la app local (`local/dev.ps1`) como `local` y como un Jefe de Mantenimiento creado en el ensayo, en PC y a 400 px (skill `probar-app`), y sacar foto de las dos.
- [ ] **Step 5: Commit** `"Personal: organigrama por nivel, panel de persona y cada jefe solo su área"`.

### Task 8: Pantalla Áreas y puestos (matriz)

**Files:**
- Create: `src/pages/apps/AreasPuestos.tsx`, `src/components/personal/MatrizPermisos.tsx`, `src/components/personal/FormArea.tsx`, `src/components/personal/FormPuesto.tsx`, `src/components/personal/MatrizPermisos.test.tsx`
- Modify: `src/App.tsx` (ruta `/areas-puestos` con `<ProtectedRoute app="areas-puestos">`), `src/lib/apps.tsx` (app `areas-puestos`, `permiso: "ESTRUCTURA_GESTIONAR"`, `seccion: "base-datos"`)

**Interfaces:**
- Consumes: `listarEstructura`, `guardarArea`, `guardarPuesto`, `guardarPermisosPuestos`, `diferenciasMatriz`, `CambioMatriz` (Task 6); `MenuAreas` (Task 7).
- Produces: `export function MatrizPermisos({ puestos, permisos, onGuardar }: { puestos: PuestoEstructura[]; permisos: PermisoEstructura[]; onGuardar: (cambios: CambioMatriz[]) => Promise<{ ok: boolean; error?: string }> })`.

Comportamiento (maqueta B): izquierda `MenuAreas` con «+ Área»; centro el encabezado del área (nombre · tipo · activa, «Editar área», «+ Puesto») y la matriz: columnas = puestos del área sin `todos_los_permisos`, ordenados por nivel (nombre y «nivel N»; inactivos en gris); filas = permisos agrupados por tema; casillas que se marcan tocando; botón «Guardar cambios (N)» activo solo con N > 0; al guardar, mensaje «N cambios guardados». `FormArea` (nombre, tipo, activa) y `FormPuesto` (nombre, nivel, activo; el área no se cambia) en el panel derecho. En teléfono, la matriz se desliza en horizontal con la primera columna fija.

- [ ] **Step 1: Escribir las pruebas que fallan** en `MatrizPermisos.test.tsx`:
  - con Jefe/Supervisor/Técnico de Mantenimiento, la casilla «Editar Catálogo de Paradas × Jefe» está marcada y la del Técnico no.
  - marcar dos casillas habilita «Guardar cambios (2)»; al pulsarlo, `onGuardar` recibe exactamente esos 2 cambios.
  - marcar y desmarcar la misma casilla deja el botón deshabilitado.
  - un puesto con `todosLosPermisos` no aparece como columna.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Verificar.** Test → PASS; `npx tsc -b`; `npm test`; probar en la app local: crear el área «Almacén» con un puesto, marcar permisos y ver que la persona con ese puesto ve la tarjeta correspondiente al refrescar.
- [ ] **Step 5: Commit** `"Personal: pantalla Áreas y puestos con matriz de permisos"`.

### Task 9: Tarjetas y rutas por permisos, «Ver como un puesto»

**Files:**
- Modify: `src/lib/apps.tsx`, `src/components/VerComo.tsx`, `src/lib/auth.tsx`, `src/lib/rolVista.ts` (si usa `ROLES`), `src/App.test.tsx` o `src/lib/navegacion.test.ts` (donde se pruebe `puedeVerApp`)
- Test: `src/lib/apps.test.ts` (crear si no existe)

**Interfaces:**
- Consumes: `Session` con `puestoId`/`nivel` (Task 6); RPC `permisos_de_puesto` (Task 3); `listarEstructura` (Task 6).
- Produces: `AppDef` sin `rolesPermitidos` ni `rolesExcluidos`; `verComo(puestoId: string | null)` en `useAuth()`; `vistaComo: { puestoId: string; rol: RolCodigo; area: string | null; permisos: Permiso[] } | null`.

Cambios de tarjetas: Calidad → `enPrueba: true`; Reportes de paradas → `permiso: "REPORTES_PARADAS_VER"`; Códigos de Mantenimiento → `permiso: "CODIGOS_MTTO_EDITAR"`; Servicios Industriales y Registros del Área → `permiso: "LECTURAS_SI"`; Manual → sin exclusión; Personal → `permiso: ["PERSONAL_GESTIONAR", "ESTRUCTURA_GESTIONAR"]`. «Ver como» lista los puestos activos (de `listarEstructura`) agrupados por área.

- [ ] **Step 1: Escribir las pruebas que fallan** en `apps.test.ts` con sesiones armadas a mano:
  - Técnico de Mantenimiento (permisos del puesto): ve «Reportes de paradas» y «Códigos de Mantenimiento», no ve «Personal».
  - Jefe de Mantenimiento: ve «Personal» y «Catálogo de Paradas».
  - Servicios Industriales: ve sus dos tarjetas.
  - Jefe de Producción: no ve «Calidad».
  - sesión de Pruebas: ve «Calidad» y todas las demás.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Verificar.** Tests → PASS; `npx tsc -b`; `npm test` → verde; en la app local, como la dueña, «Ver como» → «Jefe de Mantenimiento» muestra sus tarjetas.
- [ ] **Step 5: Commit** `"Personal: tarjetas por permisos y «Ver como» por puesto"`.

### Task 10: Ensayo completo y lista para la dueña

**Files:**
- Modify: `supabase/ESQUEMA.md` (tablas y funciones nuevas), `MAPA.md` (filas de Personal, Áreas y puestos, permisos)

- [ ] **Step 1: Las 5 migraciones seguidas sobre la copia de antes:** para cada archivo `supabase/migrations/2026111{3990000,4090000,4190000,4290000,4390000}_*.sql`, en orden, `docker compose -f local/docker-compose.yml exec -T db psql -U postgres -d natulac_antes_personal -v ON_ERROR_STOP=1 --single-transaction -f - < <archivo>`; después correr los ensayos 1 a 5 con `-d natulac_antes_personal` → sin errores. Al final, `drop database natulac_antes_personal`.
- [ ] **Step 2: Lista persona → puesto:** correr `scripts/revisar-personal-puestos.sql` sobre una copia de la base de planta (si la dueña la trae) o sobre la local, y guardar la salida en `docs/superpowers/plans/2026-11-01-personal-lista-puestos.txt` para que la revise.
- [ ] **Step 3: Actualizar `ESQUEMA.md` y `MAPA.md`.**
- [ ] **Step 4: Verificación final.** `npm test` → verde; `npx tsc -b` → sin errores; `npm run build` → sin errores.
- [ ] **Step 5: Commit** `"Personal: documentación y lista de paso de personas"`, y pedir la revisión final de la rama (skill `superpowers:requesting-code-review`).
