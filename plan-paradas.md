# Plan — Módulo Paradas (downtime de las líneas)

Documento vivo. FASE A se armó el 2026-09-09 (commit `9525516`). El 2026-09-10 el
dueño redefinió el rumbo: **rehacer la UI**, con dos páginas propias (un **Panel
de Paradas** tipo dashboard + una de **Registro**) y el eje
**Programada / No Programada / Ocioso**. Reparto de la captura (actualizado
2026-09-15, ver §1.3):

- **Programada** y **Tiempo Ocioso** → carga **manual** del supervisor en la app.
- **No Programada** → **mayormente manual también**: el súper elige el tipo
  de un catálogo grande (Externa/Operacional/Suministro (vapor/servicios)/Esterilización/
  Preparación/Codificación, 35 tipos). Solo la familia **Mecánica** (falla de
  equipo/subsistema) sigue de **solo lectura**, sincronizada del **Sheet de
  Mantenimiento** (FASE C′).

**Actualizado 2026-09-15 (2ª vuelta) — dos formas de trabajar distintas, dueño:**
Mantenimiento (Mecánicas) y el supervisor (todo lo manual) no capturan igual:

- **Mecánicas** (Mantenimiento, `origen: "SHEET"`): sí quedan **abiertas** hasta
  que Mantenimiento las marca finalizada **en el Sheet**; el sync (FASE C′) trae
  el `fin`. La app es **estrictamente solo lectura** acá — nunca tiene un botón
  para cerrarlas, eso vive del lado del Sheet.
- **Todo lo manual** (Programada, No Programada manual, Ocioso): el supervisor
  intenta resolver la parada **de inmediato**, así que no anota hora de inicio
  ni de fin — carga **duración en minutos** directamente y la parada queda
  **cerrada desde que se guarda** (nunca "en curso"). `inicio`/`fin` se calculan
  solos, anclados al momento de guardar.
- **Tiempo guía:** se mantiene (ver §1.3/§1.4), pero **solo para PROGRAMADA**
  (los únicos tipos del catálogo que traen `tiempo_guia_min` fijo — ningún tipo
  No Programada lo trae). Si la duración real de una PROGRAMADA supera su
  tiempo guía, es **obligatorio** explicar por qué — campo nuevo y separado
  `justificacion_desvio`, distinto de la nota/observación general (que sigue
  siendo **siempre opcional**, en cualquier tipo de parada). No aplica a Ocioso
  (aunque cargue un guía opcional) ni a Mecánicas.

Este archivo refleja ese rumbo nuevo; lo de FASE A queda como base reutilizable,
no como destino.

Diseño conceptual de fondo: [resumen-diseno-dashboard-natulac.md](resumen-diseno-dashboard-natulac.md)
(secciones 4, 6 y 8).

El objetivo del módulo: responder rápido **"¿cuánto tiempo perdieron las líneas,
por qué (programado o no) y cuánto estuvieron ociosas"** — y alimentar el cálculo
de disponibilidad / eficiencia del Panel de Producción, igual que se hace con
velocidad real vs. ideal.

---

## 1. Rumbo nuevo (2026-09-10)

### 1.1 Dos páginas + reflejo en el Panel de Producción

| Página | Qué es | Ruta (propuesta) | Acceso |
| --- | --- | --- | --- |
| **Panel de Paradas** | Dashboard **solo lectura**, mismo estilo que el Panel de Producción. Hace explícitos **todos** los datos de paradas: tiempo perdido, tiempo ocioso, disponibilidad, por línea, por tipo, real vs. tiempo guía, tendencia, lista. | `/panel-paradas` | Todos los roles (como Panel de Producción) |
| **Registro de Paradas** | Captura del supervisor: **Programada**, **No Programada** (Externa/Operacional/Suministro (vapor/servicios)/Esterilización/Preparación/Codificación — catálogo, manual) y **Tiempo Ocioso** (texto libre, manual). Solo la sección **Mecánicas** es **solo lectura** (se llena con el sync del Sheet, §3 FASE C′). Requiere turno abierto, atado al turno del supervisor. | `/paradas` (reemplaza la actual) | Supervisor (+ admins) |
| Panel de Producción | Mantiene un **reflejo** resumido de las paradas del turno (el bloque `TopFallasPanel` actual, re-encuadrado al modelo nuevo). | `/panel-produccion` | igual que hoy |

### 1.2 Flujo de Registro de Paradas

**Actualizado 2026-09-15 (2ª vuelta):** el supervisor no anota hora de inicio
ni de fin — resuelve la parada de inmediato y carga **cuánto duró**. Por eso
nada de lo manual queda "en curso" en esta página; eso solo pasa con Mecánicas
(Mantenimiento, vía Sheet — ver punto 4).

1. El supervisor ve **sus 3 líneas** del turno y **elige en cuál** es la parada.
2. **Agregar parada** (captura manual, Programada + No Programada del catálogo):
   se elige un tipo con autocompletado contra el **catálogo completo**
   (agrupado por familia — Programada, Externa, Operacional, Suministro de
   vapor, Suministro, Esterilización, Preparación, Codificación), la clase
   (PROGRAMADA/NO_PROGRAMADA) la trae el tipo elegido, se carga la
   **duración en minutos** y se guarda — `inicio`/`fin` se calculan solos,
   anclados al momento de guardar (la parada queda cerrada de una vez).
   - **Solo PROGRAMADA:** si la duración real supera el tiempo guía del tipo,
     es **obligatorio** explicar por qué (`justificacion_desvio`, campo aparte
     de la nota — ver §1.3/§1.4). Ningún tipo No Programada trae tiempo guía,
     así que esa obligación no les aplica.
3. Sección **Tiempo Ocioso** (captura manual): mismo mecanismo — se agregan
   entradas de texto libre (`nota`, obligatoria) con **duración en minutos** y
   su tiempo guía opcional (solo como referencia para el desvío mostrado; no
   exige justificación aunque se pase — esa obligación es solo de Programada).
   Separa el tiempo no-productivo que no cae en un tipo con nombre y que
   también entra en el cálculo de eficiencia.
4. Sección **Mecánicas** (equipo/subsistema): **solo lectura**, y es la única
   que sí queda **abierta**. Mantenimiento las carga y las cierra **en el
   Sheet** (marca "finalizada" allá, no acá); el sync (§3 FASE C′) trae el
   `fin` cuando corresponde. La app nunca tiene un botón para cerrarlas.
5. **Guardar** deja todo persistido de una vez para lo manual (no hay
   "volver a completar horas de fin" — eso ya no existe para Programada /
   No Programada manual / Ocioso).
6. Si el turno se va a **finalizar** con una **Mecánica** todavía abierta,
   aparece en el **resumen** (Finalizar Turno + Acta) con la marca
   **"— Continúa"**. Ya no aplica a paradas manuales (siempre llegan cerradas).

### 1.3 Catálogo de tipos de parada (editable, como sabores / presentaciones)

**Actualizado 2026-09-15** — el dueño pasó el catálogo real (planilla de
Excel) y aclaró el rumbo: es mucho más grande que los 11 tipos originales, y
la mayor parte de **No Programada también se carga a mano** (no solo viene
del Sheet). Ya implementado en FASE A′ contra el fixture — ver
[src/lib/paradas.ts](src/lib/paradas.ts) (`CATALOGO_TIPOS`, `FamiliaParada`,
`codigoPlanilla()`) y [src/components/RegistroParadas.tsx](src/components/RegistroParadas.tsx)
(autocompletado agrupado por familia). En FASE B′ vive en **Edición de
Datos** ([src/pages/apps/EdicionDatos.tsx](src/pages/apps/EdicionDatos.tsx)),
mismo patrón que sabores / presentaciones / líneas (tabla en Supabase,
alta/edición/baja).

**El código cambia solo por línea, no el tipo:** mismo nombre, misma clase y
mismo tiempo guía en las 3 líneas — el código de planilla lleva el número de
línea adentro (`prefijoPlanilla + "L" + número + "-secuencia"`, ej.
`TRANSFERENCIA_ENERGIA` en Línea 2 → `PPEL2`; `FALTA_VAPOR` en Línea 3 →
`SCL3-1`). Por eso el catálogo se guarda **una sola vez** (línea-agnóstico:
`prefijo_planilla` + `secuencia_planilla`) y el código real se arma al vuelo
por línea — no se duplica una fila por línea. Campos por tipo: `nombre`,
`clase` (PROGRAMADA / NO_PROGRAMADA), `familia` (ver tabla abajo),
`tiempo_guia_min` (puede ser null), `prefijo_planilla`, `secuencia_planilla`
(null si la familia no la usa), `codigo` (slug interno), `activo`.

**Quién carga qué, por familia** (dueño, 2026-09-15):

| Familia | Prefijo | Clase | Quién la carga |
| --- | --- | --- | --- |
| Programada | `PP` / `PPE` | PROGRAMADA | Supervisor, a mano (como siempre) |
| Línea no programada / externa | `LNPE` | NO_PROGRAMADA | **Supervisor, a mano** |
| Operacional | `OP` | NO_PROGRAMADA | **Supervisor, a mano** |
| Codificación | `ID` | NO_PROGRAMADA | **Supervisor, a mano** |
| Suministro de vapor | `SC` | NO_PROGRAMADA | **Supervisor, a mano** |
| Suministro | `S` | NO_PROGRAMADA | **Supervisor, a mano** |
| Esterilización / proceso térmico | `EPT` | NO_PROGRAMADA | **Supervisor, a mano** |
| Preparación | `P` | NO_PROGRAMADA | **Supervisor, a mano** |
| Mecánica (equipo/subsistema) | *(código de equipo, ver [CONFIG_EQUIPOS.csv](../Info%20que%20no%20va%20en%20el%20pryecto/REPORTE%20LINEAS%20-%20CONFIG_EQUIPOS.csv)) | NO_PROGRAMADA | **Sigue viniendo del Sheet de Mantenimiento — solo lectura** (FASE C′) |

Es decir: dentro de `NO_PROGRAMADA` hay dos orígenes reales — todo lo del
catálogo de arriba (`origen = MANUAL`, el súper elige tipo + hora igual que
Programada, mismo formulario "Agregar parada operacional" en Registro) y las
fallas de equipo/subsistema (`origen = SHEET`, siguen de solo lectura,
sección aparte "Mecánicas" en Registro). **Tiempo Ocioso** sigue sin
catálogo (texto libre), y ya no distinto de las familias de arriba.

**Seed completo** (46 tipos — 11 Programada + 35 No Programada manual; la
lista completa con los códigos de Línea 1 tal cual los pasó el dueño está en
`CATALOGO_TIPOS` de [src/lib/paradas.ts](src/lib/paradas.ts)):

| Familia | Tipos (Línea 1) |
| --- | --- |
| Programada (`PPL1`/`PPEL1`) | Arranque de Producción (180 min) · Cambio de Lote (10) · Cambio de Sabor (25) · Descanso Legal (30) · Final de Producción · Limpieza Intermedia Programada (180) · Orden y Limpieza del Área — Final de Turno (15) · Mantenimiento Programado / Cambio de Presentación (180) · Desarrollo de Producto / Insumo · Liberación de Vapor · Transferencia de Energía Eléctrica / Preventivo (`PPEL1`) |
| Externa (`LNPEL1-1..6`) | Disponibilidad de Ventas · Falta de Insumos/Paletas · Falla en Suministro Eléctrico · Falta de Espacio de Almacenamiento · Feriado · Presentación No Planificada |
| Operacional (`OPL1-1..9`) | Desvase de Producto · Insumos No Conforme (Prueba Industrial) · Logística de Línea · Paradas No Documentadas · Falta de Disponibilidad de Insumo · Falla/Falta de Montacargas · Falla Operacional (Operación) · Falta de Operador · Logística Condicionada por Distribución |
| Codificación (`IDL1-1`) | Falla en la Codificación |
| Suministro de vapor (`SCL1-1`) | Falta de Vapor |
| Suministro (`SL1-1..8`) | Baja Presión Agua Dura · Baja Presión Agua Osmotizada Principal · Baja Presión Agua Osmotizada Secundario · Baja Presión Aire Comprimido · Falla Generador 440V · Falla Generador 480V · Falla Suministro Agua Helada · Alarma 440V |
| Esterilización (`EPTL1-1..9`) | Falla Nivel BTD · Falla Sistema Agua Caliente · Pérdida de Esterilidad · Retraso Arranque · Retraso Esterilización · Retraso Limpieza · Desplace Incorrecto · Empacaduras Deterioradas · Logística Condicionada |
| Preparación (`PL1-1`) | Coleo de Preparación |

Ninguno de los tipos No Programada trae tiempo guía (el dueño lo confirmó:
"correcto, sin tiempo guía" — se mide solo la duración real, igual que
"Final de Producción" en Programada).

### 1.4 Datos por parada

- `turno_id`, `linea_id` (la elige el supervisor)
- `tipo_id` → FK al catálogo (hereda nombre, clase, familia, tiempo guía) —
  null para Tiempo Ocioso; el código de planilla se arma al vuelo con
  `linea_id` (§1.3), no se guarda por parada.
- `clase`: `PROGRAMADA` · `NO_PROGRAMADA` · `OCIOSO`
- `origen`: `MANUAL` (Programada · Ocioso · No Programada del catálogo) ·
  `SHEET` (No Programada Mecánica, sincronizada — FASE C′)
- `inicio` (hora), `fin` (hora). **`fin` null = abierta — SOLO ocurre en
  `origen = SHEET`** (Mecánicas, hasta que el sync trae la finalización desde
  el Sheet). Para `origen = MANUAL` el supervisor no anota inicio/fin: carga
  **duración en minutos** y el form calcula `inicio`/`fin` solo, anclados al
  momento de guardar — siempre llega cerrada, `fin` nunca es null.
- **Duración real** = `fin − inicio` (cruza medianoche; se conserva `duracionMin`
  de FASE A). **Desvío** = real − tiempo guía.
- `nota` (texto libre, opcional siempre — obligatoria solo en Ocioso), `creado_por`,
  auditoría universal.
- `justificacion_desvio` (texto libre) — **obligatoria únicamente cuando
  `clase = PROGRAMADA` y la duración real superó el `tiempo_guia_min` del
  tipo**; campo aparte de `nota` a propósito. null en cualquier otro caso
  (No Programada no tiene guía; Ocioso y Mecánicas no tienen esta obligación
  aunque carguen/traigan un guía).
- `ref_sheet` (id del reporte del Sheet, para idempotencia del sync) — solo
  `origen = SHEET`.

### 1.5 Cálculo (alimenta el Panel)

```
Tiempo del turno
  − tiempo corriendo
  − Σ paradas PROGRAMADAS
  − Σ paradas NO PROGRAMADAS
  − Σ tiempo OCIOSO
  → disponibilidad / eficiencia por línea
Desvío por tipo = duración real − tiempo guía  (se muestra en el Panel de Paradas)
```

---

## 2. Estado actual — FASE A (base reutilizable)

Sin base ni login. Todo contra
[src/lib/paradasDemoFixture.ts](src/lib/paradasDemoFixture.ts) (export real del
Sheet de Mantenimiento).

| Pieza | Qué se hace con ella en el rumbo nuevo |
| --- | --- |
| [src/lib/paradas.ts](src/lib/paradas.ts) — `duracionMin`, agregaciones | **Se conserva** `duracionMin` (fin − inicio, cruza medianoche). Las agregaciones (por día / equipo / línea) se re-encuadran a **tipo / clase**. El piso de 180 min de corte de luz y `esParadaDeLuz` → se mueven a la lógica del sync del Sheet (FASE C′), no al núcleo. |
| [src/lib/paradas.test.ts](src/lib/paradas.test.ts) | Se recorta a lo que sobreviva + tests del modelo nuevo. |
| [src/components/ParadasLista.tsx](src/components/ParadasLista.tsx) — vista solo-lectura con filtros | **Se reemplaza** por el **Panel de Paradas** (estilo Panel de Producción). Sirve de referencia de filtros/tendencia. |
| [src/components/TopFallasPanel.tsx](src/components/TopFallasPanel.tsx) — bloque del Panel de Producción | **Se re-encuadra** al modelo Programada / No Programada / Ocioso. |
| [src/pages/apps/Paradas.tsx](src/pages/apps/Paradas.tsx) | **Se rehace** como página de Registro. |
| [src/pages/apps/ParadasDemo.tsx](src/pages/apps/ParadasDemo.tsx) — `/paradas-demo` | Se mantiene como preview sin login del nuevo diseño; fixture chico. |
| [src/lib/paradasDemoFixture.ts](src/lib/paradasDemoFixture.ts) — export del Sheet, catálogo de equipos/subsistemas | Se **reduce** a un fixture chico del modelo nuevo (Programada + Ocioso manual + unas No Programada "como si vinieran del Sheet"). El catálogo equipo+subsistema se guarda para FASE C′ (mapeo del Sheet). |
| Panel de Producción — `ParadasDelTurno` en [src/pages/apps/PanelProduccion.tsx](src/pages/apps/PanelProduccion.tsx) | Sigue, apuntando al modelo nuevo. |

**Cambia respecto del diseño de FASE A:**

- Las 3 categorías `OPERACIONAL` / `EXTERNA` / `MECANICA` → el eje pasa a
  **Programada / No Programada / Ocioso**. El "tipo" de una Programada viene de un
  **catálogo editable** (no de equipo + subsistema).
- El **sync del Google Sheet de Mantenimiento** → **no se descarta**: pasa a ser
  la fuente de las **No Programada** (FASE C′). Programada y Ocioso son manuales.
- El piso de 180 min por corte de luz + `esParadaDeLuz` → parte de la lógica del
  sync del Sheet, no del núcleo.
- El rol `MANTENIMIENTO` solo-lectura → sigue teniendo sentido (consulta el Panel
  de Paradas / carga el Sheet). Confirmar alcance (§4).

**Gating temporal (se mantiene hasta terminar el rumbo nuevo):** la ruta
`/paradas` y el tile están limitados a `areasPermitidas: ["PRUEBAS"]`. Puntos a
revertir (comentario `TEMPORAL` en cada uno):
[src/App.tsx:115](src/App.tsx#L115) · [src/lib/apps.tsx:144](src/lib/apps.tsx#L144).
Restaurar a `rolesPermitidos: ["SUPERADMINISTRADOR", "ADMINISTRADOR_AREA", "SUPERVISOR"]`
(el 4º rol se decide en §4).

---

## 3. Fases del rumbo nuevo

### FASE A′ — UI contra fixture (rehacer) — **HECHA (2026-09-13)**

- [x] Modelo TS nuevo: `TipoParada` (nombre, clase, tiempoGuiaMin, codigo) +
  `Parada` (turno, linea, tipo, clase, origen, inicio, fin, nota). Fixture chico
  ([src/lib/paradas.ts](src/lib/paradas.ts), [src/lib/paradasDemoFixture.ts](src/lib/paradasDemoFixture.ts)).
- [x] Página **Registro de Paradas** ([src/pages/apps/Paradas.tsx](src/pages/apps/Paradas.tsx) +
  [src/components/RegistroParadas.tsx](src/components/RegistroParadas.tsx)).
- [x] Página **Panel de Paradas** ([src/pages/apps/PanelParadas.tsx](src/pages/apps/PanelParadas.tsx) +
  [src/components/PanelParadasVista.tsx](src/components/PanelParadasVista.tsx)).
- [x] `TopFallasPanel` del Panel de Producción → modelo nuevo.
- [x] **Hecho (2026-09-13)** — Resumen **"— Continúa"** en Finalizar Turno / Acta:
  `paradasAbiertasDeLineas()` en `paradas.ts` filtra las paradas abiertas del
  fixture para las líneas activas del turno; se muestra en una sección
  "Paradas" de [FinalizarTurno.tsx](src/pages/apps/FinalizarTurno.tsx) (rotulada
  "vista previa", ver nota abajo) y en una tabla nueva del Acta PDF
  ([actaPdf.ts](src/lib/actaPdf.ts)). Sigue siendo mock: el fixture no está
  atado al `turno_id` real (recién en FASE B′), así que lo que se ve es
  "¿hay alguna parada del fixture abierta ahora mismo en una línea activa de
  este turno?", no datos reales de esa corrida.
- [x] Rutas + tiles nuevos en [src/App.tsx](src/App.tsx) / [src/lib/apps.tsx](src/lib/apps.tsx)
  (gateados a `PRUEBAS` hasta FASE B′, como corresponde a esta fase).
- [x] **Rehecho (2026-09-15)** — captura por **duración en minutos** en vez de
  hora inicio/fin para todo lo manual (Programada / No Programada manual /
  Ocioso); se quita el bloque "en curso" del Registro (ya no aplica a lo
  manual, ver §1.2). Nuevo campo `justificacionDesvio`, obligatorio en el
  form solo para Programada cuando la duración supera el tiempo guía
  ([src/components/RegistroParadas.tsx](src/components/RegistroParadas.tsx),
  [src/lib/paradas.ts](src/lib/paradas.ts), fixture actualizado).

### FASE B′ — base + persistencia (Programada + No Programada manual + Ocioso)

- [ ] Migración: `paradas_tipos` (catálogo editable: nombre, clase, familia,
  tiempo_guia_min, prefijo_planilla, secuencia_planilla, codigo, activo) +
  seed completo de §1.3 (46 tipos — línea-agnóstico, el código de planilla
  se arma por línea en la app/RPC, no se guarda por fila).
- [ ] Migración: `paradas` (turno_id, linea_id, tipo_id, clase, origen, inicio,
  fin, nota, justificacion_desvio, ref_sheet, creado_por, timestamps).
- [ ] RPCs: `registrar_parada` (Programada/No Programada manual/Ocioso —
  recibe línea + tipo (o texto libre) + **duración en minutos** + nota +
  justificación si aplica; calcula `inicio`/`fin` en el servidor, en hora de
  planta, y guarda ya cerrada — sin paso de cierre separado),
  `listar_paradas(desde,hasta,…)`, `paradas_de_turno(turno_id)`.
  **`cerrar_parada` / `paradas_abiertas_de_turno` ya NO aplican a lo
  manual** (siempre llega cerrado) — si se necesitan, son para Mecánicas
  (`origen = SHEET`) y viven del lado del sync de FASE C′, no como acción
  del supervisor en Registro.
- [ ] Auditoría universal sobre `paradas` y `paradas_tipos`.
- [ ] Catálogo de tipos dentro de **Edición de Datos** (patrón sabores /
  presentaciones).
- [ ] `finalizar_turno`: lista las paradas abiertas + marca "Continúa" —
  **ahora solo puede haber abiertas entre las Mecánicas** (`origen = SHEET`);
  `iniciar_turno`: las hereda (siguen abiertas para el turno nuevo).
- [ ] Apuntar `listarParadas()` y `ParadasDelTurno` a Supabase (la forma de
  `Parada` no cambia respecto de FASE A′, salvo el nuevo `justificacionDesvio`).
- [ ] Un-gate `/paradas` (§2) + definir el 4º rol (§4).

### FASE C′ — sync del Sheet → No Programada Mecánica

- [ ] **Alcance reducido (2026-09-15):** solo la familia Mecánica (falla de
  equipo/subsistema, códigos de [CONFIG_EQUIPOS.csv](../Info%20que%20no%20va%20en%20el%20pryecto/REPORTE%20LINEAS%20-%20CONFIG_EQUIPOS.csv))
  sigue viniendo del Sheet — el resto de No Programada ya es manual (FASE B′).
- [ ] Definir el mecanismo (Edge Function con `cron`, o carga asistida).
- [ ] Mapa de columnas del Sheet → `paradas` (`origen = SHEET`,
  `clase = NO_PROGRAMADA`, sin `tipo_id` — equipo/subsistema como texto,
  igual que hoy en el fixture). Idempotencia por `ref_sheet` (id del reporte).
- [ ] Piso de 180 min por corte de luz + detección de "parada de luz" en el sync.
- [ ] Catálogo/mapeo de equipo + subsistema del Sheet (viene de FASE A;
  fuente real en [CONFIG_EQUIPOS.csv](../Info%20que%20no%20va%20en%20el%20pryecto/REPORTE%20LINEAS%20-%20CONFIG_EQUIPOS.csv)).
- [ ] La sección "Mecánicas" del Registro y el Panel de Paradas pasan a leer lo
  sincronizado (sin tocar la UI — misma forma de `Parada`).

---

## 4. Preguntas abiertas (no bloquean FASE A′)

- **Prefijos de familia (`PP`/`LNPE`/`OP`/`SC`/`S`/`EPT`/`P`/`ID`):**
  significado exacto de cada letra. Por ahora se guardan tal cual en
  `prefijo_planilla`; si agrupan reportes de otra forma, se define después.
- **Rol `MANTENIMIENTO`:** ¿solo consulta el Panel de Paradas, o también es quien
  mantiene el Sheet que alimenta las Mecánicas?
- **Arranque tardío:** ¿es el tipo "Arranque de Producción" del catálogo, o un
  dato de hora real aparte? Afecta "tiempo del turno" en el cálculo de §1.5.
- **Tiempo Ocioso:** se asume texto libre + inicio + fin, tiempo guía opcional.
  Confirmar si necesita un catálogo propio en vez de texto libre.
- **`edicion-datos` catálogo:** ¿lo edita cualquier admin de área o solo
  SUPERADMINISTRADOR? (seguir lo que ya hace sabores).

---

## 5. Archivos del módulo (mapa rápido)

```
src/lib/paradas.ts                 núcleo: duracionMin (se conserva) + agregaciones por tipo/clase
src/lib/paradas.test.ts            tests del núcleo + modelo nuevo
src/lib/paradasDemoFixture.ts      fixture — se reduce al modelo nuevo (Programada + Ocioso + No Prog. "del Sheet")
src/pages/apps/PanelParadas.tsx    NUEVO — dashboard estilo Panel de Producción
src/pages/apps/Paradas.tsx         se rehace — Registro: selector de línea + Programada + Ocioso + No Prog. (RO)
src/pages/apps/ParadasDemo.tsx     preview /paradas-demo del diseño nuevo
src/components/TopFallasPanel.tsx  reflejo resumido en el Panel de Producción — modelo nuevo
src/pages/apps/EdicionDatos.tsx    + catálogo de tipos de parada (tiempo guía) — FASE B′
src/pages/apps/PanelProduccion.tsx → ParadasDelTurno apunta al modelo nuevo
```
