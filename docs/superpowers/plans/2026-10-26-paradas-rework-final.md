# Paradas: rework final — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada parada lleva un Responsable explícito (Operacional o Mantenimiento); Mantenimiento las termina en la app con código, qué se hizo y tiempo final; Líneas, Panel y acta usan el mismo vocabulario.

**Architecture:** Un campo `responsable` en `paradas` reemplaza la regla `origen !== "MANUAL"`. El servidor ya parte las paradas abiertas por turno (`paradas_efectivas_turno`) y congela los turnos cerrados; el front suma un helper puro para tramos y para el reporte. Las pantallas se ajustan sobre lo que ya existe en `paradas-modo-unico` (`ModoParadas`, `FormParadaLinea`, `Mantenimiento`, `finalizar_falla`).

**Tech Stack:** React + TypeScript + Vite, Vitest (`npm test`), Supabase/Postgres (RPC con `security definer`), Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-26-paradas-rework-final-design.md`

## Global Constraints

- Textos de la app: sin argentinismos ni voseo, descripciones cortas, máximo una línea por aviso (`SiempreLeer.md`).
- Vocabulario: **Parar / Continuar / Parada** solo para pausas; **Entregar PT** reemplaza «Detener línea»; el estado `DETENIDA` se muestra **Esperando PT**.
- Responsable: `'OPERACIONAL' | 'MANTENIMIENTO'`, obligatorio al parar, sin valor por defecto.
- Equipo y Falla obligatorios siempre.
- Interruptor `areas.mantenimiento_finaliza`: Aséptico apagado, Pruebas encendido.
- Margen en vivo: `MARGEN_PARADA_MIN = 15` para Operacional; la de Mantenimiento con la línea corriendo no espera.
- Cada pantalla de un turno muestra el **tramo del turno**; el total solo en el reporte y al pasar el cursor.
- Un turno cerrado no se recalcula; el comienzo de una parada que cruzó un turno cerrado queda bloqueado.
- La migración se edita en `supabase/migrations/20261112590000_falla_por_clasificar.sql` (no está aplicada en ningún lado). No se crea otra.
- Rama: `paradas-rework-final` (carpeta `D:\GitHub\ProyectoNatulac-paradas`, `node_modules` enlazado al árbol principal).

## Review Focus

- Parada que cruza la medianoche (T3 de madrugada → T1): cada turno recibe solo su tramo.
- Turno 12x12 y turnos de 7,5/8,5 h: los límites salen del turno real, no de 8 h fijas.
- Parada abierta que nadie termina durante tres turnos: cada turno cuenta su tramo y Validar jornada la marca abierta.
- Mantenimiento termina con hora de fin anterior al inicio, en el futuro, o dos veces seguidas (doble clic): error claro, nada se guarda.
- Interruptor apagado: el supervisor termina una parada de Mantenimiento; encendido: no puede.
- Paradas viejas (sin `responsable`) quedan clasificadas con la regla de hoy y no cambian de turno ni de minutos.

---

### Task 1: Tramos por turno (lógica pura)

**Files:**
- Create: `src/lib/paradasTramo.ts`
- Test: `src/lib/paradasTramo.test.ts`

**Interfaces:**
- Produces:
  - `export interface VentanaTurno { id: string; etiqueta: string; desde: string; hasta: string }` (ISO local `YYYY-MM-DDTHH:MM:SS`, hora de planta).
  - `export function tramoEnTurno(p: Pick<Parada, "inicio" | "fin">, v: Pick<VentanaTurno, "desde" | "hasta">, ahora: Date): number` — minutos de la parada dentro de la ventana; parada abierta cuenta hasta `min(ahora, hasta)`.
  - `export function desgloseEnTurnos(p: Pick<Parada, "inicio" | "fin">, ventanas: VentanaTurno[], ahora: Date): { total: number; tramos: { etiqueta: string; min: number }[] }` — solo ventanas con minutos > 0.
  - `export function cruzaTurnoCerrado(p: Pick<Parada, "inicio">, ventanas: (VentanaTurno & { cerrado: boolean })[]): boolean` — true si el inicio cae en una ventana cerrada y la parada sigue abierta después de su `hasta`.

- [ ] **Step 1: Escribir las pruebas que fallan** en `paradasTramo.test.ts` (fechas del 2026-10-26, hora de planta). Casos con sus aserciones:
  - `empieza 13:00, T1 cierra 14:00, termina 16:30` → `tramoEnTurno` en T1 = 60 y en T2 = 150; `desgloseEnTurnos` = `{ total: 210, tramos: [{T1,60},{T2,150}] }`.
  - cruce de medianoche: parada `23:30 → 00:45` con T3 (`22:00→06:00`) y T1 del día siguiente (`06:00→14:00`) → 75 min en T3 y 0 en T1; parada `05:30 → 06:20` → 30 en T3 y 20 en T1.
  - 12x12: ventanas de 12 h; parada de 3 turnos (`10:00 → 10:00 del día siguiente +…`) suma el total sin perder minutos (`suma de tramos === total`).
  - parada abierta con `ahora` dentro de la ventana → cuenta hasta `ahora`; con `ahora` fuera → hasta `hasta`.
  - parada fuera de la ventana → 0.
  - `cruzaTurnoCerrado`: true si empezó en un turno cerrado y sigue abierta; false si empezó en el turno abierto.
- [ ] **Step 2: Correr y ver que fallan.** `npx vitest run src/lib/paradasTramo.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar** las tres funciones con milisegundos de `new Date(iso)` (como `duracionMin` en `src/lib/paradas.ts:331`), redondeando el tramo con `Math.round(ms / 60000)` y garantizando que los tramos suman el total (el último absorbe el redondeo).
- [ ] **Step 4: Correr y ver que pasan.** Mismo comando → PASS.
- [ ] **Step 5: Commit** `git add src/lib/paradasTramo.ts src/lib/paradasTramo.test.ts && git commit -m "Paradas: tramos por turno (helper puro con pruebas)"`.

### Task 2: Campo Responsable y Terminar parada en el servidor

**Files:**
- Modify: `supabase/migrations/20261112590000_falla_por_clasificar.sql`
- Create: `scripts/ensayo-20261112590000.sql`

**Interfaces:**
- Produces (SQL):
  - Columnas en `paradas`: `responsable text check (responsable in ('OPERACIONAL','MANTENIMIENTO'))`, `subsistema_codigo text`, `lote text`, `sabor text`, `terminada_por uuid references usuarios(id)`, `terminada_en timestamptz`. `creado_por` ya guarda quién la abrió.
  - `pausar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid, p_motivo text, p_tipo_codigo text, p_responsable text, p_inicio text default null)`: guarda `responsable`, y copia `lote` y `sabor` de la corrida. Rechaza `FALLA_SIN_ESPECIFICAR` (Equipo y Falla son obligatorios).
  - `terminar_parada(p_usuario text, p_parada_id uuid, p_tipo_codigo text, p_subsistema_codigo text, p_solucion text, p_fin text default null, p_inicio text default null, p_pagina text default 'Reportes de paradas')` reemplaza a `finalizar_falla`: exige solución y código; `p_fin` obligatorio si la parada cruzó un turno cerrado; ignora `p_inicio` en ese caso; rechaza fin antes del inicio, en el futuro o parada ya terminada; deja la línea corriendo sola (como `finalizar_falla`).
  - `abrir_parada_mantenimiento(p_usuario text, p_linea_codigo text, p_tipo_codigo text, p_nota text, p_inicio text default null)`: responsable MANTENIMIENTO; pausa la corrida solo si la línea está corriendo, si no solo anota.
  - `la_termina_mantenimiento(p_parada_id uuid)` lee `responsable = 'MANTENIMIENTO'` y el interruptor del área.
  - `listar_paradas(...)` suma `responsable`, `subsistema_codigo`, `lote`, `sabor`, `terminada_por_nombre`.

- [ ] **Step 1: Escribir el ensayo** `scripts/ensayo-20261112590000.sql` contra la base local de Docker (ver nota `base-personal-local`): cada caso termina en `raise exception` si no se cumple. Casos: parada Operacional la termina el supervisor; con interruptor encendido no puede terminar una de Mantenimiento; Mantenimiento la termina con fin válido; fin anterior al inicio falla; terminar dos veces falla; parada que cruzó turno cerrado sin `p_fin` falla y con `p_fin` deja el tramo del turno cerrado igual; `abrir_parada_mantenimiento` con línea libre no pausa nada y con línea corriendo pausa la corrida.
- [ ] **Step 2: Correr el ensayo y ver que falla.** `psql -f scripts/ensayo-20261112590000.sql` → error (funciones nuevas no existen).
- [ ] **Step 3: Editar la migración:** agregar columnas; convertir las paradas viejas con la misma regla de hoy (`parada_de_mantenimiento` actual: `origen = 'SHEET'` o creada por usuario del área MANTENIMIENTO → `'MANTENIMIENTO'`, el resto → `'OPERACIONAL'`); reemplazar `finalizar_falla` por `terminar_parada`; quitar `clasificar_falla` y el puente con el Sheet (`paradas_puente_sheet`, `sincronizar_paradas_mantenimiento`) porque el Sheet queda apagado; ajustar `pausar_linea`, `continuar_linea` (no deja continuar si `la_termina_mantenimiento`), `paradas_que_detienen_lineas` y `listar_paradas`.
- [ ] **Step 4: Correr el ensayo completo** (cadena de migraciones + `scripts/ensayo-20261112590000.sql`) → sin errores.
- [ ] **Step 5: Commit** `git add supabase scripts && git commit -m "Paradas: Responsable, Terminar parada y reporte congelado (migración 20261112590000)"`.

### Task 3: Tipos y acceso a datos del front

**Files:**
- Modify: `src/lib/paradas.ts`, `src/lib/paradasEnVivo.ts:74`, `src/lib/validarJornada.ts:375-382`, `src/lib/produccion/` (acción `pausar`)
- Test: `src/lib/paradas.test.ts`, `src/lib/paradasEnVivo.test.ts`, `src/lib/validarJornada.test.ts`

**Interfaces:**
- Consumes: columnas y funciones de la Task 2.
- Produces:
  - `export type ResponsableParada = "OPERACIONAL" | "MANTENIMIENTO"`; `Parada` suma `responsable`, `subsistemaCodigo: string | null`, `lote: string | null`, `sabor: string | null`, `terminadaPor: string | null`; `FilaParada` y `mapearFilaParada` igual.
  - `export const esDeMantenimiento = (p: Pick<Parada, "responsable">) => p.responsable === "MANTENIMIENTO"`.
  - `export async function terminarParada(usuario: string, paradaId: string, datos: { tipoCodigo: string; subsistemaCodigo: string; solucion: string; fin: string | null; inicio: string | null }, pagina: string): Promise<Resultado>` (reemplaza `finalizarFalla` y `clasificarFalla`).
  - `export async function abrirParadaMantenimiento(usuario: string, datos: { lineaCodigo: string; tipoCodigo: string; nota: string; inicio: string | null }, pagina: string): Promise<Resultado>`.
  - La acción `pausar` recibe `responsable: ResponsableParada` en sus datos.

- [ ] **Step 1: Pruebas que fallan:** `mapearFilaParada` devuelve `responsable`, `esDeMantenimiento` lee el campo (una parada `origen: "MANUAL"` con `responsable: "MANTENIMIENTO"` es de Mantenimiento y al revés); `paradaEnVivo` marca `deMantenimiento` por `responsable`; `validarJornada` marca la columna por `responsable`.
- [ ] **Step 2: Correr** `npx vitest run src/lib/paradas.test.ts src/lib/paradasEnVivo.test.ts src/lib/validarJornada.test.ts` → FAIL.
- [ ] **Step 3: Implementar** los tipos, el mapeo, `esDeMantenimiento` y las dos funciones RPC; cambiar `p.origen !== "MANUAL"` por `esDeMantenimiento(p)` en `paradasEnVivo.ts` y `validarJornada.ts`; borrar `finalizarFalla`, `clasificarFalla` y las partes del Sheet que ya no se usan (`sheetMantenimiento.ts` queda con `SHEET_MANTENIMIENTO_ACTIVO = false`; sin botón «Actualizar»).
- [ ] **Step 4: Correr** las mismas pruebas más `npx tsc -b` → PASS y sin errores de tipos.
- [ ] **Step 5: Commit** `git commit -am "Paradas: el Responsable reemplaza la regla del origen"`.

### Task 4: Vocabulario y estados (Entregar PT, Esperando PT)

**Files:**
- Modify: `src/components/lineas/estadoLinea.ts:6`, `src/components/panel/SeccionLineas.tsx:18`, `src/components/CintaLinea.tsx:32`, `src/components/lineas/PanelLoteTerminado.tsx:50`, `src/components/lineas/PanelPausada.tsx:115`, `src/components/lineas/FormDetenerLinea.tsx`, `src/components/lineas/PanelEsperandoPt.tsx:22`, `src/components/lineas/ModoParadas.tsx` (comentario y textos)
- Test: `src/components/lineas/LineaCard.test.tsx` y las pruebas de snapshot que fallen

**Interfaces:**
- Produces: las etiquetas visibles `Esperando PT` (estado `DETENIDA`/`detenida`) y `Entregar PT` (botón y confirmación «Sí, entregar PT»). Los códigos internos (`DETENIDA`, `detener`) no cambian.

- [ ] **Step 1: Pruebas que fallan:** `LineaCard.test.tsx` busca el botón `Entregar PT` (no `Detener línea`) y el estado `Esperando PT`; una línea `DETENIDA` ya no muestra la palabra «Parada».
- [ ] **Step 2: Correr** `npx vitest run src/components/lineas` → FAIL.
- [ ] **Step 3: Cambiar los textos** en los archivos listados; el texto de confirmación de `FormDetenerLinea` queda en una línea («Entrega la corrida: queda esperando su Producto Terminado. No se deshace.»).
- [ ] **Step 4: Correr** `npx vitest run src/components` y actualizar snapshots que solo cambien por estas palabras (`-u` revisando el diff) → PASS.
- [ ] **Step 5: Commit** `git commit -am "Líneas: Entregar PT y Esperando PT en vez de Detener línea y Detenida"`.

### Task 5: Formulario Parar con Operacional | Mantenimiento

**Files:**
- Modify: `src/components/lineas/FormParadaLinea.tsx`, `src/components/lineas/ConfirmarInicioLinea.tsx` (Status)
- Test: `src/components/lineas/FormParadaLinea.test.tsx` (crear)

**Interfaces:**
- Consumes: acción `pausar` con `responsable` (Task 3).
- Produces: `FormParadaLinea` sin el interruptor «Sé la causa / No sé»; botones `Operacional` y `Mantenimiento` (`role="radio"`), obligatorios; Equipo y Falla obligatorios; Comentario obligatorio.

- [ ] **Step 1: Pruebas que fallan:** «Confirmar parada» está deshabilitado sin responsable, sin tipo o sin comentario; con los tres llama a `pausar` con `{ responsable: "MANTENIMIENTO", tipoCodigo, motivo }`; no existe el botón «No sé / es una falla»; «Empezó antes» abre la hora de inicio.
- [ ] **Step 2: Correr** `npx vitest run src/components/lineas/FormParadaLinea.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** quitando `noSe` y `TIPO_FALLA_SIN_ESPECIFICAR` del formulario; el texto de ayuda de arriba se reduce a una línea; `ConfirmarInicioLinea` (Status) abre este mismo formulario con `desdeAntes`.
- [ ] **Step 4: Correr** `npx vitest run src/components/lineas` → PASS.
- [ ] **Step 5: Commit** `git commit -am "Parar: Operacional o Mantenimiento, Equipo y Falla obligatorios"`.

### Task 6: Mantenimiento en Líneas (Terminar parada y abrir las suyas)

**Files:**
- Create: `src/components/lineas/FormTerminarParada.tsx`
- Modify: `src/components/lineas/ModoParadas.tsx`, `src/components/lineas/PanelPausada.tsx:48-65`, `src/pages/apps/Lineas.tsx`, `src/App.tsx:169-175`, `src/lib/apps.tsx:229`, `src/pages/apps/Mantenimiento.tsx` (se elimina; su contenido útil pasa a Líneas)
- Test: `src/components/lineas/FormTerminarParada.test.tsx` (crear), `src/pages/apps/Mantenimiento.test.tsx` (se reemplaza por una prueba de la redirección)

**Interfaces:**
- Consumes: `terminarParada`, `abrirParadaMantenimiento` (Task 3); `desgloseEnTurnos`, `cruzaTurnoCerrado` (Task 1).
- Produces: `export function FormTerminarParada(props: { parada: Parada; ventanas: (VentanaTurno & { cerrado: boolean })[]; usuario: string; onTerminada: () => void }): JSX.Element` con campos Código (equipo + subsistema, buscador por código), «¿Qué se realizó?» y Tiempo final: minutos o hora de comienzo y fin; si `cruzaTurnoCerrado`, solo «Terminó a las» y el comienzo se muestra bloqueado.

- [ ] **Step 1: Pruebas que fallan:** el formulario exige código y qué se realizó; en una parada de un solo turno acepta minutos (fin = inicio + minutos) y hora de comienzo/fin; en una que cruzó un turno cerrado no ofrece minutos ni comienzo editable; muestra el aviso corto «Empezó 13:00 (turno 1 cerrado)»; un usuario de Mantenimiento que abre `/lineas` ve el Modo Paradas sin botones de manejar la línea; con el interruptor apagado el supervisor también ve «Terminar parada».
- [ ] **Step 2: Correr** `npx vitest run src/components/lineas/FormTerminarParada.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** el formulario y conectarlo en `ModoParadas` y `PanelPausada` (cada parada abierta de Mantenimiento muestra «Mantenimiento · tiempo» y el botón **Terminar parada**; el supervisor no tiene Continuar si `laTerminaMantenimiento`); la ruta de Mantenimiento entra a `/lineas` en Modo Paradas; el botón «Parada» de la tarjeta, usado por Mantenimiento, abre `FormParadaLinea` sin elegir responsable (usa `abrirParadaMantenimiento`).
- [ ] **Step 4: Correr** `npx vitest run src/components/lineas src/pages/apps` → PASS.
- [ ] **Step 5: Commit** `git commit -am "Mantenimiento: entra a Líneas, termina y abre paradas con código y qué se realizó"`.

### Task 7: Reportes de paradas

**Files:**
- Modify: `src/pages/apps/RegistrarParadas.tsx` (renombrar a `ReportesParadas.tsx`), `src/App.tsx:23,149`, `src/lib/apps.tsx:216`, `src/lib/navegacion.ts`
- Create: `src/components/paradas/ReporteParada.tsx`
- Test: `src/components/paradas/ReporteParada.test.tsx` (crear), `src/lib/navegacion.test.ts`

**Interfaces:**
- Consumes: `Parada` con campos del reporte (Task 3), `desgloseEnTurnos` (Task 1).
- Produces: `export function ReporteParada(props: { parada: Parada; ventanas: VentanaTurno[]; ahora: Date }): JSX.Element` con línea, lote, sabor, equipo, falla, subsistema y código, comentario, qué se realizó, quién la abrió y la terminó, total y desglose «T1 60 + T2 150»; botón Imprimir. La pantalla `ReportesParadas` lista por fecha, línea, responsable y estado, y abre el reporte; solo la ven Jefe de Producción, Analista, Mantenimiento y dueña.

- [ ] **Step 1: Pruebas que fallan:** el reporte muestra sabor, código y «210 min · T1 60 + T2 150»; la navegación oculta «Reportes de paradas» al supervisor y la muestra a los cuatro roles.
- [ ] **Step 2: Correr** `npx vitest run src/components/paradas src/lib/navegacion.test.ts` → FAIL.
- [ ] **Step 3: Implementar** renombrando la pantalla (quitando de ella parar/anotar/cubrir, que viven en Modo Paradas) y los permisos en `apps.tsx`.
- [ ] **Step 4: Correr** las mismas pruebas más `npx tsc -b` → PASS.
- [ ] **Step 5: Commit** `git commit -am "Reportes de paradas: lista y reporte congelado de cada parada"`.

### Task 8: Panel, acta y Validar jornada con el tramo del turno

**Files:**
- Modify: `src/components/panel/SeccionLineas.tsx:49,122`, `src/components/panel/ParadaMasLarga.tsx`, `src/components/TopFallasPanel.tsx`, `src/lib/actaPdf.ts`, `src/components/validar-jornada/TablasJornada.tsx:211`, `src/components/validar-jornada/SinReportarJornada.tsx`
- Test: `src/lib/actaPdf.test.ts`, `src/lib/validarJornada.test.ts`

**Interfaces:**
- Consumes: `tramoEnTurno`, `desgloseEnTurnos` (Task 1), `esDeMantenimiento` (Task 3).
- Produces: la columna «Tiempo de parada» muestra el tramo del turno y, al pasar el cursor, `title` con «Total 210 min»; el acta lista todas las paradas con columna Responsable; una parada abierta aparece «en curso» y cuenta hasta el fin del turno; Validar jornada marca «abierta» la que sigue sin terminar.

- [ ] **Step 1: Pruebas que fallan:** el acta incluye una parada de Mantenimiento con «Mantenimiento» en Responsable y el tramo del turno (150, no 210); una parada abierta sale «en curso»; Validar jornada marca la abierta.
- [ ] **Step 2: Correr** `npx vitest run src/lib/actaPdf.test.ts src/lib/validarJornada.test.ts` → FAIL.
- [ ] **Step 3: Implementar** los cambios; la fila de la parada en vivo en el Panel cuenta desde el inicio del turno en curso; la parada de Mantenimiento con la línea corriendo no espera los 15 min (`paradasEnVivo.ts`).
- [ ] **Step 4: Correr** `npx vitest run` completo y `npx tsc -b` → PASS.
- [ ] **Step 5: Commit** `git commit -am "Panel, acta y Validar jornada: tramo del turno y Responsable"`.

### Task 9: Textos cortos y revisión visual

**Files:**
- Modify: textos de `FormParadaLinea.tsx`, `FormDetenerLinea.tsx`, `ModoParadas.tsx`, `ConfirmarInicioLinea.tsx`, `FormTerminarParada.tsx`

- [ ] **Step 1:** Recorrer con la skill `probar-app` Líneas (supervisor y Mantenimiento), Status, Panel de Producción y Reportes de paradas, en PC y teléfono; sacar fotos y revisar que las animaciones (corriendo, parada, CIP, Esperando PT) sigan bien.
- [ ] **Step 2:** Reducir cada aviso a una línea y revisar que no haya voseo ni argentinismos.
- [ ] **Step 3: Correr** `npm test`, `npm run lint` y `npm run build` → todo en verde.
- [ ] **Step 4: Commit** `git commit -am "Paradas: textos cortos y revisión visual"`.
