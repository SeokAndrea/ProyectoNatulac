# Plan — Módulo Paradas (downtime de las líneas)

Documento vivo. FASE A se armó el 2026-09-09 (commit `9525516`). El 2026-09-10 el
dueño redefinió el rumbo: **rehacer la UI**, con dos páginas propias (un **Panel
de Paradas** tipo dashboard + una de **Registro**) y el eje
**Programada / No Programada / Ocioso**. Reparto de la captura:

- **Programada** y **Tiempo Ocioso** → carga **manual** del supervisor en la app.
- **No Programada** → **solo lectura** en la app; idealmente se **sube desde el
  Sheet de Mantenimiento** (sync, FASE C′).

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
| **Registro de Paradas** | Captura del supervisor: **Programada** y **Tiempo Ocioso** (manual). La pestaña **No Programada** es **solo lectura** (se llenará con el sync del Sheet, §3 FASE C′). Requiere turno abierto, atado al turno del supervisor. | `/paradas` (reemplaza la actual) | Supervisor (+ admins) |
| Panel de Producción | Mantiene un **reflejo** resumido de las paradas del turno (el bloque `TopFallasPanel` actual, re-encuadrado al modelo nuevo). | `/panel-produccion` | igual que hoy |

### 1.2 Flujo de Registro de Paradas

1. El supervisor ve **sus 3 líneas** del turno y **elige en cuál** es la parada.
2. Pestaña **PARADA PROGRAMADA** (captura manual): se elige un tipo del
   **catálogo** (lista o checks), cada tipo trae su **tiempo guía**, se pone
   **hora de inicio** y se guarda.
   - Se puede **guardar con solo la hora de inicio**; el supervisor vuelve a
     entrar más tarde y le pone **hora de fin** (cierra la parada).
3. Sección **Tiempo Ocioso** (captura manual): mismo mecanismo — se agregan
   entradas de texto libre (`nota`), cada una con hora de inicio y su tiempo guía
   opcional, y se cierran después con hora de fin. Separa el tiempo no-productivo
   que no cae en un tipo con nombre y que también entra en el cálculo de
   eficiencia (misma forma que Programada para que las cuentas sean uniformes).
4. Pestaña **NO PROGRAMADA**: **solo lectura**. Muestra las paradas no programadas
   del turno / esas líneas — que **idealmente se suben desde el Sheet de
   Mantenimiento** (sync, §3 FASE C′). Sin carga manual del supervisor. Cómo se
   *gestionan* más allá de eso queda fuera de alcance por ahora.
5. **Guardar** deja todo persistido; se puede reabrir la página para completar
   horas de fin.
6. Si el turno se va a **finalizar** con una parada todavía **abierta**, aparece
   en el **resumen** (Finalizar Turno + Acta) con la marca **"— Continúa"**, y la
   parada sigue abierta para el turno siguiente.

### 1.3 Catálogo de tipos de parada (editable, como sabores / presentaciones)

Vive en **Edición de Datos** ([src/pages/apps/EdicionDatos.tsx](src/pages/apps/EdicionDatos.tsx)),
con el mismo patrón que sabores / presentaciones / líneas (tabla en Supabase,
alta/edición/baja). Campos: `nombre`, `clase` (PROGRAMADA / NO_PROGRAMADA),
`tiempo_guia_min` (puede ser null), `codigo`, `activo`. El catálogo lo usa la
captura manual de **Programada**; las **No Programada** que lleguen del Sheet
mapean su tipo del Sheet a una fila `clase = NO_PROGRAMADA` (o quedan con tipo
libre — a definir en FASE C′). **Tiempo Ocioso** no usa catálogo (texto libre).

**Seed PROGRAMADA** (de la lista del dueño — los códigos se guardan tal cual):

| Tipo | Tiempo guía | Código |
| --- | --- | --- |
| Arranque de Producción | 180 min | PPL1 |
| Cambio de Lote | 10 min | PPL1 |
| Cambio de Sabor | 25 min | PPL1 |
| Descanso Legal | 30 min | PPL1 |
| Final de Producción | — | PPL1 |
| Limpieza Intermedia Programada | 180 min | PPL1 |
| Orden y Limpieza del Área — Final de Turno | 15 min | PPL1 |
| Mantenimiento Programado / Cambio de Presentación | 180 min | PPL1 |
| Desarrollo de Producto / Insumo | — | PPL1 |
| Liberación de Vapor | — | PPL1 |
| Transferencia de Energía Eléctrica / Preventivo | — | PPEL1 |

**Seed NO PROGRAMADA:** lo definirá FASE C′ a partir de las columnas del Sheet.

### 1.4 Datos por parada

- `turno_id`, `linea_id` (la elige el supervisor)
- `tipo_id` → FK al catálogo (hereda nombre, clase, tiempo guía, código) —
  null para Tiempo Ocioso
- `clase`: `PROGRAMADA` · `NO_PROGRAMADA` · `OCIOSO`
- `origen`: `MANUAL` (Programada / Ocioso) · `SHEET` (No Programada sincronizada)
- `inicio` (hora), `fin` (hora · null = abierta / "Continúa")
- **Duración real** = `fin − inicio` (cruza medianoche; se conserva `duracionMin`
  de FASE A). **Desvío** = real − tiempo guía.
- `nota` (texto libre — obligatoria en Ocioso), `creado_por`, auditoría universal.
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

### FASE A′ — UI contra fixture (rehacer)

- [ ] Modelo TS nuevo: `TipoParada` (nombre, clase, tiempoGuiaMin, codigo) +
  `Parada` (turno, linea, tipo, clase, origen, inicio, fin, nota). Fixture chico.
- [ ] Página **Registro de Paradas** ([src/pages/apps/Paradas.tsx](src/pages/apps/Paradas.tsx)):
  - selector de línea (las 3 del turno);
  - pestaña **Programada** — checklist del catálogo con hora de inicio, guardar
    parcial (solo inicio) y cerrar (fin), confirmación doble al cerrar (ver
    memoria de acciones bruscas);
  - sección **Tiempo Ocioso** — entradas de texto libre + inicio + tiempo guía
    opcional, cerrar con fin;
  - pestaña **No Programada** — **solo lectura**, lee del fixture como si viniera
    del Sheet.
- [ ] Página **Panel de Paradas** ([src/pages/apps/PanelParadas.tsx](src/pages/apps/PanelParadas.tsx)),
  estilo Panel de Producción: tiempo perdido / ocioso / disponibilidad por
  línea, reparto por clase, desvío real vs. tiempo guía por tipo, tendencia por
  día, lista con filtros.
- [ ] `TopFallasPanel` del Panel de Producción → modelo nuevo (reflejo resumido
  del turno: minutos por clase + top tipos por línea).
- [ ] Resumen **"— Continúa"** en Finalizar Turno / Acta (mock con el fixture).
- [ ] Rutas + tiles nuevos en [src/App.tsx](src/App.tsx) / [src/lib/apps.tsx](src/lib/apps.tsx)
  (Panel de Paradas a todos; Registro gated a PRUEBAS hasta FASE B′).

### FASE B′ — base + persistencia (Programada + Ocioso)

- [ ] Migración: `paradas_tipos` (catálogo editable: nombre, clase,
  tiempo_guia_min, codigo, activo) + seed PROGRAMADA de §1.3.
- [ ] Migración: `paradas` (turno_id, linea_id, tipo_id, clase, origen, inicio,
  fin, nota, ref_sheet, creado_por, timestamps).
- [ ] RPCs: `registrar_parada`, `cerrar_parada`, `listar_paradas(desde,hasta,…)`,
  `paradas_de_turno(turno_id)`, `paradas_abiertas_de_turno(turno_id)`.
- [ ] Auditoría universal sobre `paradas` y `paradas_tipos`.
- [ ] Catálogo de tipos dentro de **Edición de Datos** (patrón sabores /
  presentaciones).
- [ ] `finalizar_turno`: lista las paradas abiertas + marca "Continúa";
  `iniciar_turno`: las hereda (siguen abiertas para el turno nuevo).
- [ ] Apuntar `listarParadas()` y `ParadasDelTurno` a Supabase (la forma de
  `Parada` no cambia respecto de FASE A′).
- [ ] Un-gate `/paradas` (§2) + definir el 4º rol (§4).

### FASE C′ — sync del Sheet → No Programada

- [ ] Definir el mecanismo (Edge Function con `cron`, o carga asistida).
- [ ] Mapa de columnas del Sheet → `paradas` (`origen = SHEET`,
  `clase = NO_PROGRAMADA`). Idempotencia por `ref_sheet` (id del reporte).
- [ ] Piso de 180 min por corte de luz + detección de "parada de luz" en el sync.
- [ ] Catálogo/mapeo de equipo + subsistema del Sheet (viene de FASE A).
- [ ] La pestaña No Programada del Registro y el Panel de Paradas pasan a leer lo
  sincronizado (sin tocar la UI — misma forma de `Parada`).

---

## 4. Preguntas abiertas (no bloquean FASE A′)

- **`PPL1` / `PPEL1`:** significado exacto. Por ahora se guardan tal cual en
  `codigo`; si agrupan reportes, se define después.
- **Rol `MANTENIMIENTO`:** ¿solo consulta el Panel de Paradas, o también es quien
  mantiene el Sheet que alimenta las No Programada?
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
