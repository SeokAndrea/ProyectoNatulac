# Plan de rework — Auditoría

Documento vivo, arrancado el 2026-09-03. La página de Auditoría hoy es
[src/pages/apps/Historial.tsx](src/pages/apps/Historial.tsx). El objetivo del rework: que un
auditor ISO 9001 o el jefe de producción pueda ver, rápido y sin fricción, **qué hizo cada
supervisor, en orden cronológico, turno por turno** — y verificar de un vistazo que el sistema y
la gente están operando bien.

---

## 0. Diagnóstico — qué molesta hoy

| Problema | Detalle |
| --- | --- |
| Flujo de 3 pasos | Buscar → lista de turnos → clic en uno → recién ahí se ve la línea de tiempo. No hay panorama. |
| El "Registro de actividad" (`listar_auditoria`) domina la pantalla | Feed de diffs `antes → después` campo por campo. Útil para forense puntual, ruidoso como vista principal. |
| No se agrupa por turno ni por supervisor | Los turnos salen en una lista plana ordenada por fecha; hay que abrir uno por uno. |
| Producto Terminado sin lote | En la línea de tiempo (`construirHistorial`) las filas de PT muestran sabor pero **no** el número de lote. No se puede rastrear ni buscar por lote. |
| No se puede buscar por lote / sabor | El buscador filtra solo por persona (nombre o usuario). |

Lo que **sí** está bien y se conserva:

- El motor `construirHistorial()` ([src/lib/historial.ts](src/lib/historial.ts)) — arma la línea de
  tiempo `Hora · Sección · Detalle` ya ordenada ascendente, con Comenzar Turno, Tanques,
  Preparaciones, Líneas, Contadores/Merma y Producto Terminado. Los valores "están casi bien".
- El vistazo de turnos activos por área arriba de todo.
- Reabrir / Eliminar turno y Generar Acta faltante (quedan donde están, en el detalle del turno).

---

## 1. La vista objetivo

```
Auditoría
├─ [Turnos activos ahora]  (se queda igual)
│
├─ Filtro de fecha:  [ Turnos de hoy ] [ Ayer ] [ Últimos 7 días ] [ Fecha exacta ]
│      (en "Fecha exacta": selector de día + selector de turno / Todos los turnos)
├─ Buscar (texto libre: supervisor · sabor · lote · cualquier texto)
│
├─ Solapas:   [ Turno 1 · 2 ]  [ Turno 2 · 2 ]  [ Turno 3 · 3 ]      ← TURNO_TIPOS + conteo
│
│   Turno 3  (solapa activa)
│   ├─ MIÉRCOLES, 02 DE SEPTIEMBRE · 2 supervisores
│   │   ├─ ▸ Deivis Rojas · Producción Aséptico · Cód. 0902-A-3      [Cerrado]
│   │   │      Sabores: Fresa (lote 0902-A1), Mango (lote 0902-A2)
│   │   │      Línea 1: 350 ml · Fresa · Lote 0902-A1 · 1.600 cajas · merma envases **4 %**
│   │   │      Línea 3: 350 ml · Mango · Lote 0902-A2 · 972 cajas · merma envases **—**
│   │   │      Cajas: 2.572 · Litros: 22.742 consumidos → 21.605 producidos · merma semielaborado **5 %**
│   │   │      (al abrir) línea de tiempo por hora:
│   │   │        22:30  Comenzar Turno     Turno 3 · Grupo 2         ← "lo primero"
│   │   │        22:41  Tanques            Tanque 1: Fresa · 8000 L · Lote 0902-A1
│   │   │        23:05  Líneas en uso      Línea 1: 350 ml · 9000 env/h · Fresa · Lote 0902-A1
│   │   │        3/9 02:35  Producto Terminado  Línea 1: 13 paletas + 40 cajas = 1.600 cajas · Fresa · Lote 0902-A1
│   │   │        …
│   │   └─ ▸ Otro supervisor de Turno 3 ese día …
│
├─ (colapsado, al final) «Registro de cambios (auditoría)»  ← listar_auditoria, formato resumen
```

Reglas de la vista:

1. **Filtro de fecha** con presets. "Día de producción" = `turno.fecha` — los tres turnos de una
   jornada (T1 7:00, T2 15:00, T3 22:30) comparten esa fecha y un T3 que cruza medianoche la
   conserva, así el corte de las 7:00 ya está hecho sin mirar la hora. `Turnos de hoy` = `fecha`
   de hoy; `Ayer` = la de ayer; `Últimos 7 días` = hoy y los 6 anteriores; `Fecha exacta` = un día
   elegido + opcionalmente un tipo de turno. Preset por defecto: `Turnos de hoy`.
2. **Solapas por tipo de turno** (`TURNO_TIPOS`) con el conteo de turnos visibles en el rótulo.
   Solo se muestran las solapas que tienen al menos un turno.
3. Dentro de cada solapa, **primero un separador por fecha**; bajo cada fecha, **una fila
   colapsable por supervisor**. Encabezado: supervisor · área · código de turno · estado (el área
   va siempre visible porque el Super Administrador ve todas).
4. Debajo del encabezado, **el resumen** (lo que el auditor / jefe de producción mira primero):
   - `Sabores:` cada sabor con sus lotes — `Fresa (lotes 0902-A1, 0902-A2), Durazno (lote 0902-A6)`.
   - **Una fila por corrida**: `Línea · presentación · sabor · Lote · N cajas · merma envases **X %**`.
     Una misma línea con dos sabores (poco común, pero pasa) sale como dos filas.
   - `Cajas:` total del turno.
   - `Litros:` `consumidos → producidos · merma semielaborado **X %**` (modelo repartido por turno,
     `mermaSemielaboradoTurno()` de [src/lib/panelProduccion.ts](src/lib/panelProduccion.ts)).
   - Los dos `%` de merma van **en negrita**; `—` cuando falta un dato para calcularla.
5. Al abrir la fila, la **línea de tiempo por hora, de lo primero a lo último** — salida de
   `construirHistorial()` sin reordenar. La primera fila es Comenzar Turno con su hora real. Con el
   buscador con texto, la lista se filtra pero **las filas quedan contraídas** (no se auto-abren).
6. **«Registro de cambios (auditoría)»** — sección colapsada al final. Es `listar_auditoria`
   presentado como resumen auditable: **una línea por cambio, con fecha y hora primero** ("para ver
   cuándo"), acción, qué se tocó, quién y en qué página; el antes/después detrás de «ver valores».
   No se borra — la auditoría universal exige que toda mutación quede rastreable
   ([memoria: auditoria_universal]) — pero deja de tapar la vista principal.
   Componente: [src/components/RegistroCambios.tsx](src/components/RegistroCambios.tsx).

---

## 2. El único hueco de datos: lote en Producto Terminado

`ProductoTerminadoRegistro` ([src/lib/turno.tsx](src/lib/turno.tsx)) **no tiene** campo `lote`. El
lote de una corrida vive en `LineaEnTurno.lote`, y la fila de PT apunta a la corrida por
`turnoLineaId`. Dos formas de cerrar el hueco:

- **A (solo frontend, rápido):** en `construirHistorial()`, para cada fila de PT resolver
  `turno.lineas.find(l => l.id === p.turnoLineaId)?.lote` y sumarlo al detalle.
  Riesgo: si la corrida nació en un turno anterior y no viene en `turno.lineas` de este turno, el
  lote sale vacío.
- **B (robusto, toca SQL):** agregar `lote` a cada elemento de `producto_terminado` en el JSON del
  turno (`_turno_json` / la función que arma `turno_detalle`), con
  `left join turno_lineas tl on tl.id = pt.turno_linea_id`. Es el mismo join que ya hace
  `historial_dia_area()` en
  [20260976090000_lote_en_tanque_y_historial_completo.sql](supabase/migrations/20260976090000_lote_en_tanque_y_historial_completo.sql:189).

**Recomendación:** hacer **B** (una migración chica, patrón ya probado) y consumirlo en
`construirHistorial()`; dejar **A** como fallback si `lote` viene null. Añadir `lote: string | null`
a `ProductoTerminadoRegistro` y a `FilaProductoTerminado`.

Con el lote en el detalle de la fila de PT, además de mostrarlo se vuelve **buscable** (el buscador
matchea contra el texto del evento — ver §4).

---

## 3. De dónde sale cada cosa (sin RPC nuevos para la estructura)

- Lista de turnos del rango, con tipo de turno y supervisor: `listar_turnos_historial()` ya
  devuelve `turno_tipo_codigo` → alcanza para armar las solapas y agrupar por supervisor.
- Línea de tiempo de cada turno: `turno_detalle()` → `construirHistorial()`. Es una llamada por
  turno. El rango típico (un día) tiene pocos turnos (≈ 3 áreas × 3 turnos). Estrategia:
  - Carga **perezosa** al abrir cada fila (igual que hoy en `verDetalle`).
  - Cuando el buscador tiene texto, cargar **todos** los detalles del rango en paralelo para poder
    filtrar dentro de las líneas de tiempo aún no abiertas.
  - Si en la práctica el rango se agranda y se siente lento → recién ahí, un RPC batch
    `auditoria_historial(rango)` que devuelva el array de JSONs de turno reusando `_turno_json`.

---

## 4. Comportamiento del buscador

Un solo campo de texto libre, **debajo** del filtro de fecha (filtra dentro del rango ya elegido).
Un turno coincide si el texto aparece en: supervisor (nombre o usuario), área, código de turno,
cualquier sabor, cualquier lote (incluido el que solo vive en Producto Terminado, vía
`turnoLineaId`), o el texto de cualquier evento de su línea de tiempo. Sin texto → todos los
turnos del rango. Con texto → la lista se filtra, la cuenta va en el rótulo de cada solapa
(`Turno 3 · 2`), y **las filas siguen contraídas**.

---

## 5. Estado — 2026-09-03

**Integrado en la página real** [src/pages/apps/Historial.tsx](src/pages/apps/Historial.tsx)
(ruta `/auditoria`). `tsc` + 42 tests + lint en verde.

| Archivo | Qué es |
| --- | --- |
| [src/components/AuditoriaTurnos.tsx](src/components/AuditoriaTurnos.tsx) | La grilla: filtro de fecha + buscador + solapas por turno + separador por fecha + fila colapsable por supervisor + resumen (sabores-con-lotes, por-línea con cajas y **merma de envases** en negrita, cajas totales, litros consumidos→producidos con **merma de semielaborado** en negrita) + línea de tiempo inline. Props: `onRangoChange` (el padre re-consulta), `accionesTurno` (slot por fila). |
| [src/pages/apps/Historial.tsx](src/pages/apps/Historial.tsx) | Trae los turnos del rango (`listarTurnosHistorial` → `obtenerTurnoDetalle` en paralelo) + las actas del rango. Debajo, colapsados: **Registro de cambios** (`listarAuditoria` → `RegistroCambios`), **Actas del rango** (todas las versiones), y el export del dataset. Cada fila tiene link al acta vigente y botón **Abrir** → la vista de detalle con Reabrir / Eliminar / Generar Acta (se conservó tal cual). |
| [src/lib/auditoriaVista.ts](src/lib/auditoriaVista.ts) | Helpers puros: `resumenTurno` (usa `mermaCorrida` y `mermaSemielaboradoTurno` ya existentes), `loteDeProductoTerminado`, `coincideBusqueda`, `rangoDePreset` / `turnoEnFiltro`. |
| [src/lib/historial.ts](src/lib/historial.ts) | Fila de PT en la línea de tiempo: ahora termina en `· {sabor} · Lote {lote}` (lote resuelto por `turnoLineaId → lineas`). |
| [src/components/RegistroCambios.tsx](src/components/RegistroCambios.tsx) | El `listar_auditoria` como resumen: una línea por cambio, **hora primero**, «ver valores» para el antes/después. |
| [src/lib/auditoriaVista.test.ts](src/lib/auditoriaVista.test.ts) | 20 tests: chips, merma, lote de PT, buscador, presets de fecha. |
| `auditoriaDemoFixture.ts` + `AuditoriaDemo.tsx` + ruta `/auditoria-demo` | Datos de prueba (tests) + preview de diseño sin login/DB. Borrable. |

### Falta para cerrar

- [ ] **Migración** (opción B): `lote` en cada elemento `producto_terminado` del JSON de turno,
  `left join turno_lineas tl on tl.id = pt.turno_linea_id` — mismo patrón que
  [20260976090000](supabase/migrations/20260976090000_lote_en_tanque_y_historial_completo.sql:189).
  El fallback por `turnoLineaId` en el frontend ya cubre el caso común (corrida del mismo turno).
- [ ] Tipos: `lote: string | null` en `ProductoTerminadoRegistro` / `FilaProductoTerminado` /
  `mapearTurno` (para consumir la migración; opcional mientras el fallback alcance).
- [x] **Actas standalone (`/actas`):** retirada — la app, la ruta y la tarjeta del hub. La vista de
  actas del rango vive dentro de Auditoría. Si hace falta "todas las actas" se agranda el rango o
  se suma un toggle más adelante.
- [ ] `deploy_servidor_pruebas` y probar en `:4035` con un día real de 3 turnos (incluye las
  migraciones nuevas 20260997 y 20260998).
- [ ] Cuando esté validado: borrar `AuditoriaDemo.tsx` + ruta demo (el fixture se queda, lo usan los tests).

---

## 6. Decisiones (todas resueltas 2026-09-03)

- **Filtro de fecha:** presets `Turnos de hoy` / `Ayer` / `Últimos 7 días` / `Fecha exacta`
  (+ selector de turno). Día de producción = `turno.fecha` (el corte de las 7:00 ya está ahí).
- **Agrupación:** solapa por turno → separador por fecha → fila por supervisor.
- **Resumen:** sabores con sus lotes; una fila por corrida con presentación / cajas / merma de
  envases; cajas totales; litros consumidos → producidos + merma de semielaborado. Los `%` de
  merma en negrita.
- **Buscador:** filtra la lista, no auto-expande las filas.
- **`listar_auditoria`:** colapsado al final, como resumen auditable con la hora primero
  (`RegistroCambios`).
- **"10:30 PM aprox":** la primera fila de la línea de tiempo es Comenzar Turno con su hora exacta.
- **Idioma:** español neutro, sin voseo ([memoria: espanol_neutral_no_voseo]).

---

## 7. Guardrails de la merma (7.1–7.4 ✅ hechos 2026-09-03 · surgió del turno de Javier `A20260902_T3G2`)

**Estado:** 7.1–7.4 implementados y con tests (47 en verde). 7.5 (data — `continuar_siguiente_lote`,
botón "Ajustar", script) sigue pendiente, en `plan-debug-merma-semielaborado`.

El rework de la vista está cerrado. Esto es un agregado: el turno de Javier mostró
`merma de semielaborado −71,5%` y una corrida duplicada, y esas cifras salen de funciones que ya
existían (`mermaSemielaboradoTurno`, `mermaCorrida`) — el rework solo las puso a la vista. Los
guardrails evitan que un número imposible se muestre como si fuera real.

### 7.1 `mermaSemielaboradoTurno` — numerador y denominador sobre los mismos lotes (opción 1)

Hoy: `merma % = 1 − (Σ TODO el PT) / (Σ_lotes max(inicio − fin, 0))`. Asimétrico → si un lote
produjo mucho pero su tramo de consumo no se puede medir (`inicio` null, o `fin ≥ inicio` por
transferencia / re-medición al alza / lote heredado sin congelar), sus litros cuentan en el
numerador pero no en el denominador → merma negativa imposible.

Cambio: recorrer lote por lote. Un lote es **medible** si `inicio != null` y `inicio − fin > 0`.
- medible → suma `inicio − fin` a `consumo` **y** su PT (litros atribuidos vía `turnoLineaId → lote_id`) a `producido`.
- no medible → no suma a ninguno; acumula `litrosSinContraste` y marca `hayLoteSinContraste`.
- `pct = consumo ≤ 0 ? null : 1 − producido / consumo` — ya no puede dar negativo por la asimetría.
- devuelve además `{ litrosSinContraste, hayLoteSinContraste }`.

Es función **compartida** con Panel de Producción (`CrearTurno.tsx`, `PanelProduccion.tsx`,
`calculosPruebas.ts`) — el cambio los arregla a todos; revisar que los ~4 llamados compilen.

### 7.2 Chequeo físico `Σ PT del lote ≤ VI` — detecta la corrida duplicada

`Σ litros de PT de un lote > volumen preparado del lote (VI)` es físicamente imposible (Lote 0004:
prep ~10.000 L, PT 810 + 810 cajas × 12 = 19.440 L). Un lote que lo viola → **no medible** (7.1) y
se muestra con flag `PT excede el volumen del lote (posible duplicado)`.

**El efecto de los ajustes (recordatorio):** el jugo/agua que se agrega antes de liberar SÍ entra
al `VI` cuando se registra con el botón **"Ajustar"** (`ajustar_preparacion` → `volumen_l` y
`volumen_inicial_l += litros`, migración 20260997). Por eso el chequeo usa solo `VI × 1,05` —
`MARGEN_REDONDEO`, para el ruido de `litros_x_caja` y paletas parciales. Si el PT supera eso: o es
un duplicado, o se agregó jugo sin usar "Ajustar" (feedback accionable, no un fudge para tapar).

### 7.3 Vista — no mostrar un número imposible

En `AuditoriaTurnos` (la fila del supervisor):
- `pct === null` → `merma de semielaborado: sin dato`.
- `hayLoteSinContraste` → `merma de semielaborado 4,2% · parcial (12.400 L sin contrastar)`.
- red de seguridad: si aún así `pct < 0` → `merma de semielaborado: revisar (producido > consumido)`.

### 7.4 Corridas duplicadas / stub en `porLinea`

- Agrupar `porLinea` por **línea + lote**; sumar cajas.
- Dos corridas de misma **línea + lote + presentación** con `paletas` y `cajas_sueltas` idénticas
  → mostrarlas juntas con `⚠ 2 registros idénticos — revisar` en vez de doble-contar en silencio.
- Corridas stub (0 cajas + `merma —`) con una hermana productiva del mismo lote → no mostrarlas
  como fila (o listarlas aparte como "corridas sin producción").

### 7.5 Data

- ✅ **`continuar_siguiente_lote`** (migración 20260998): matchea el lote siguiente por `sabor_id`
  además del string. 0 candidatos → mensaje claro sin forzar; >1 → se niega y pide activar la
  línea a mano eligiendo el tanque.
- ✅ **Botón "Ajustar"** bajo "Liberar" en la tarjeta de tanque `EN_PREPARACION` (migración 20260997):
  `ajustar_preparacion(lote_id, litros, detalle)` — rechaza si `liberado_en` / `cerrado_en`, hace
  `volumen_l += litros` y `volumen_inicial_l += litros`, guarda la fila del ajuste + auditoría.
- ✅ **`iniciar_preparacion`** (migración 20260999): el `p_agua` inicial suma al volumen 1:1, igual
  que "Ajustar". Azúcar/ácido no (son kg).
- ⬜ Guard en `registrar_producto_terminado` / UI contra una 2ª corrida productiva sobre la misma
  línea+lote+presentación con totales idénticos.
- ⬜ "Medir tanque" — acción de primera clase para el volumen real del tanque.
- ⬜ Script puntual: lotes con `Σ PT litros > volumen_inicial_l` para revisión de la jefa.
- Script puntual: lotes con `Σ PT litros > volumen_inicial_l` para revisión de la jefa.
