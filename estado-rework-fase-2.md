# Estado de ejecución — Fase 2 (base de datos)

Compañero de `plan-rework-3-modulos-y-merma.md`. Qué se hizo, qué falta,
cómo subirlo. Última actualización: **2026-09-08**. Rama:
`rework/preparacion-modulo`.

---

## Agenda

### 2026-09-09

1. **Servicios Industriales a LIVE** *(primero del día)*. El módulo ya
   está hecho (commit `443a870`): migración
   `20261012090000_lecturas_servicios_industriales.sql` + página
   `src/pages/apps/ServiciosIndustriales.tsx` (ruta `/servicios-industriales`,
   en `apps.tsx` y `App.tsx`) + su bloque en el Panel de Producción.
   Falta **subirlo a producción** (WinSCP del frontend +
   `npx supabase db push` — la migración `20261012` crea la tabla).
   - La tabla `servicios_industriales_lecturas` es **append-only**: una
     fila por actualización (`temperatura_quantum`, `agua_osmotizada`,
     `usuario_id`, `creado_en`). Para tendencias ya guarda todo el
     histórico — el requisito de "ver tendencias después" queda cubierto
     con solo deployar; falta después una **vista de tendencia** (hoy el
     Panel solo lee la última lectura vía
     `lectura_servicios_industriales_actual()`).
2. Push del batch `20261022`–`20261030` (ver "Cómo subir").

---

## Resumen

**9 migraciones** (`20261013`–`20261021`) + su frontend — **ya subidas** el
2026-09-08 como un solo batch (desde `4d8f75b`).

**Seguimiento (push propio, todavía sin subir):** `20261022`
(`seguir_mismo_lote`) + `20261023` (`continuar_siguiente_lote` con tanque
manual) + `20261024` (resto en el origen post-transferencia) + `20261025`
(repone la guarda antiduplicados de corrida que `20261018` dejó caer —
regresión del Turno 3 de Javier, Lote 0009 corrido 7×) + `20261026`
(`medir_tanque` revisa el cierre del lote) + `20261027`
(`cambiar_condicion_linea` bloquea si hay corrida ESPERANDO_PT) +
`20261028` (Case 6: `finalizar_turno` bloquea si hay una corrida activa
sin entregar) + `20261029` (`turno_json`: la tarjeta del tanque muestra
el volumen VIVO del lote abierto, no el congelado de `recepcion_tanques`
— resuelve el `OJO -- PROBAR EN PLANTA` de `20261018`) + `20261030` (el
cron `cerrar_turnos_vencidos` sella las corridas sin resolver del turno
abandonado + VALIDAR las muestra con `sin_pt` para que el analista cargue
el número real) + su frontend (Producto Terminado pide medir el tanque al
cerrar una corrida; Status/Líneas muestra la corrida que espera su PT;
Finalizar bloquea duro con una línea activa; VALIDAR marca "Sin Producto
Terminado — el turno cerró solo") — van juntos, ver más abajo.

`npm run build` + `npm test` (58) en verde en cada commit.

La Fase 1 (arquitectura de 3 módulos) ya estaba cerrada antes de empezar
esto.

---

## Hecho — migraciones + frontend

### `20261013` — Retira `reabrir_turno` + `corregir_producto_terminado_auditoria` (§2.1)
Vías ad hoc de "editar un turno ya cerrado". `reabrir_turno` no se usa en
la operación (VALIDAR lo cubre mejor); el wrapper de corrección de PT es
código muerto. Se dropean las 2 firmas de `corregir_producto_terminado_auditoria`.
Frontend: se quita el botón "Reabrir Turno" de Auditoría + los wrappers muertos.
→ `4d8f75b`

### `20261014` — `transferir_tanque` cierra el lote correcto en los 3 modos (§2.1)
Bug: el cierre del lote origen era incondicional hasta `20260990`; al
agregar el modo LOTE (`20260995`) quedó guardado con `if <> 'LIMPIO'` y se
rompió en dos ramas — LIMPIO no cerraba el origen (quedaba abierto para
siempre), LOTE cerraba el lote que *sobrevive*. Ahora cada rama cierra
explícitamente el que corresponde. Solo servidor.
`scripts/test-transferir-cierre-lote.sql` → `8c78a5c`

### `20261015` — Renombre `envasar`/`tobos`/`reserva` → `desvase` (§2.4, nota de vocabulario revertida)
"Envasar" en la planta es Producto Terminado; sacar el resto de un tanque a
una pipa es **desvasar**. Los identificadores se renombran para que digan
lo que hacen (decisión del dueño, revierte la nota original de 2.4):
`reservas_tobos`→`desvases`, `envasar_tanque`→`desvasar_tanque`,
`listar_reservas_tobos`→`listar_desvases`, `iniciar_preparacion.p_reserva_id`
→`p_desvase_id`, trigger `auditar_reservas_tobos`→`auditar_desvases`,
etiqueta de `auditar_cambio`. Frontend: `reservasTobos.ts`→`desvases.ts` +
todos los usos. `turno.tsx` (código muerto) queda con los nombres viejos a
propósito — se borra entero en Fase 4.
`scripts/test-renombrar-desvase.sql` → `c5a2e60`

### `20261016` — Tabla `transferencias` + `motivo` (§2.4)
Tabla append-only `transferencias(turno_id, tanque_origen, tanque_destino,
litros, modo, motivo, usuario_id, creado_en)`. `motivo` enum
`motivo_transferencia`: **`CONSOLIDAR_RESTOS | ENRUTAR_MANIFOLD`**.
`transferir_tanque` gana `p_motivo` y escribe una fila por transferencia.
Frontend: selector de 2 opciones en el diálogo de Transferir ("Consolidar
restos" / "No parar la línea").
Decisión: la tabla registra **solo** transferencias tanque→tanque — el
desvase ya queda en su propia tabla `desvases`, no se duplica; por eso el
enum no lleva `DESVASE_PIPA`. `LIBERAR_LOTE` descartado (era manejo de
desastre, no una categoría real).
`scripts/test-transferencias-log.sql` → `d391102`

### `20261017` — `turno_lineas.pausa_motivo` + `pausar_linea` gana `p_motivo` (§2.2)
Pieza chica y aditiva de costura 2. `pausar_linea` sella el motivo de la
parada; `continuar_linea` lo limpia al reanudar. `p_motivo` con default
`null` para no romper el frontend actual — la obligatoriedad la impone la
UI nueva de "Parada Operacional". Frontend: `pausarLinea()` acepta un
motivo opcional. → `03a3ecb`

### `20261018` — Costura 2: la corrida se cierra en dos pasos (§2.2 / Fase 1 costura 2) — LA GRANDE
El cierre de tanque/lote vivía en 3 lugares parchados (~32 migraciones
sobre `cerrar_corrida_si_esperando`). Se consolida:

- **`revisar_cierre_de_lote(lote_id)` NUEVA** (de Preparación): único lugar
  que cierra lote + tanque, y solo si `volumen_l ≈ 0` y ninguna corrida
  activa lo usa. Si el lote quedó con resto → tanque se deja **como estaba**
  (típicamente LISTO), ya no pasa a STANDBY. (`OJO -- PROBAR EN PLANTA` en
  la migración.)
- **`cerrar_corrida_si_esperando`**: solo setea `finalizada_en`, después
  llama a `revisar_cierre_de_lote`. Sin código de tanque, sin
  `mantiene_tanque`.
- **`registrar_producto_terminado`**: se le saca el bloque de tanque
  duplicado; baja `volumen_l` y llama a `revisar_cierre_de_lote` de forma
  incondicional (por si el contador cerró la corrida antes).
- **`terminar_linea` / `terminar_sabor_linea` / `detener_linea_por_falla`**:
  dejan la corrida en **`ESPERANDO_PT`** (`activa=false, finalizada_en NULL`).
  Ya NO llaman a `cerrar_corrida_si_esperando`: el PT la cierra.
- **`finalizar_turno`**: rechaza si hay una corrida en `ESPERANDO_PT`. (El
  cierre automático por cron es otra función, `cerrar_turnos_vencidos`, no
  afectada — no hay deadlock.)
- **`activar_linea`**: desde Líneas (`p_confirmar_inicio=false`) rechaza si
  la línea ya tiene corrida; desde Recepción (`true`) reemplaza la heredada
  sin confirmar. Guarda antiduplicados vieja retirada — repetir línea+lote
  con PT es legítimo, los repetidos reales los marca VALIDAR.
- **`continuar_siguiente_lote`**: la corrida vieja pasa a `ESPERANDO_PT`, no
  se auto-finaliza sin PT.

**Frontend:**
- `LineasEstadoPlanta.tsx`: se quita **"Editar"** (de corrida y de estado) y
  el `Select` de condición. La tarjeta queda con: **Activar Corrida** (con
  confirmación mostrando tanque/sabor/lote/presentación/velocidad),
  **Parada Operacional** (+motivo obligatorio) → **Continuar** | **Detener
  línea** (2ª confirmación), **Sin programación**, **Cambio de Presentación**,
  **CIP**. `modo=status` (Recepción) mantiene Confirmar/Corregir.
- `ProductoTerminado.tsx`: se quita el botón flotante **"Cerrar Lote"**
  (`BotonCerrarLote`, ya no-op). Relabel: "Terminar Lote"→**"Terminar"**,
  "Continúa siguiente turno"→**"Entregar línea"**. Se reordena `guardar()`
  para que "Terminar" ponga la corrida en `ESPERANDO_PT` **antes** de
  registrar contador/PT — si no, quedaba atascada.
- `FinalizarTurno.tsx` + `sesionTurno.tsx`: respetan el rechazo de
  `finalizar_turno` (antes lo ignoraban: generaban el acta con el turno
  todavía abierto).

`scripts/test-costura2-cierre-corrida.sql`
→ `fc29b1f` (base) · `6256380` (frontend Líneas) · `25d33e6` (fix cierre PT) · `0a22290` (fix Finalizar)

### `20261021` — `medir_tanque` angosta + retira `reactivar_lote` / `descartar_resto_tanque` (§2.1)
Enfoque "lo más seguro y reversible" (dueño): aditivo + drop-only.
- **`medir_tanque(usuario, turno_id, numero_tanque, volumen_real)` NUEVA** — la "relectura
  física" que vivía escondida en `cambiar_condicion_tanque`: corrige `volumen_l` a lo medido,
  deja el delta (teórico vs real) en `preparaciones_ajuste`, NO toca `volumen_inicial_l`.
  Herramienta de excepción (Recepción / "algo se ve raro").
- **`reactivar_lote` / `descartar_resto_tanque` dropeadas** — sus reemplazos (Transferir /
  Desvasar / 2º confirm de Detener línea) ya existen.
- **`cambiar_condicion_tanque` + `TanqueEditForm` se quedan** — todavía hacen el toggle de CIP
  y el confirmar INICIO/FIN. Narrowear eso es un paso posterior.
- Frontend `EstadoPlantaTabs.tsx`: "Reactivar Lote" y "Descartar" (+ su panel) retirados;
  "Medir tanque" ahora llama `medir_tanque`.
- CIP en tanques: sin guard duro. Nota del dueño: "a veces echan encima de un tanque sucio, no
  siempre del mismo sabor" — forzar CIP rompería el flujo real.
`scripts/test-medir-tanque.sql` → este commit

### `20261020` — Advisory lock en `iniciar_preparacion` + retira `finalizar_lote` (§2.3)
La guarda de "nº de lote repetido para el mismo sabor en otro tanque de la
misma área" era check-then-act: dos preparaciones concurrentes del mismo
lote podían pasar las dos y duplicar. Ahora un
`pg_advisory_xact_lock(hashtextextended(area|sabor|nº lote))` antes del
`exists` las serializa. `finalizar_lote` (huérfana — solo la llamaba
`turno.tsx` muerto) se dropea en la misma migración.
`scripts/test-iniciar-preparacion-advisory-lock.sql` → este commit

### `20261019` — Turno nocturno: la fecha es la del día operativo (§2.10)
Bug real (Javier, noche 2026-09-07→08): activó el Turno 3 pasada la
medianoche y quedó como Turno 3 del día siguiente. Ahora `iniciar_turno`,
si el `turno_tipo` cruza medianoche (`hora_fin < hora_inicio`, T3 =
22:30→07:00) y se activa antes de `hora_fin` nominal (la cola de la
madrugada), usa `p_fecha - 1` para `fecha` y `codigo`. Data-driven, sin
umbral fijo — si cambian el horario de T3 la regla lo sigue. Sin cambio de
frontend. `scripts/test-turno-nocturno-fecha.sql`.
La corrección puntual de la fila ya mal está en
`scripts/fix-turno-fecha-anterior.sql` (plano para el SQL editor de
Supabase). → `d2d5684` (plan+script) · migración: este commit

### `20261022` — `seguir_mismo_lote`: deshace un "terminó el lote" prematuro (costura 2)
Caso real (turno de Dany, 2026-09-08): una corrida quedó con
`lote_terminado_en` puesto pero el lote **todavía tiene producto** y el
tanque sigue LISTO — la marca la dejó el viejo
`registrar_producto_terminado`/`registrar_contador` (pre-costura 2) al ver
el volumen en ~0, o un `iniciar_preparacion` sobre el tanque. Con esa
marca la tarjeta de Líneas solo ofrecía "Continuar al siguiente lote"
(falla si no hay tanque Listo con el lote+1) y "Detener línea" (pide
motivo, marca la línea Detenida por falla — no aplica).
- **`seguir_mismo_lote(usuario, turno_id, turno_linea_id)` NUEVA** — hace
  UNA cosa: `turno_lineas.lote_terminado_en = null` en esa corrida. NO
  toca el tanque, NI `volumen_l`, NI `volumen_inicial_l`, NI
  `preparaciones`. Rechaza si la corrida no está activa, si el lote ya está
  cerrado, o si el lote no tiene volumen. No-op silencioso si ya está
  corriendo sin marca. Auditoría por el trigger `auditar_turno_lineas`.
- Frontend `LineasEstadoPlanta.tsx`: botón **"Seguir con el mismo lote"**
  en la tarjeta de "terminó el lote", junto a "Continuar al siguiente
  lote" / "Detener línea", con la nota "solo deshace el aviso — no toca el
  tanque ni los litros".
- Revisado de paso: **`entregar_corrida`** ("Entregar línea / sigue el
  próximo turno") — limpia, solo sella `entregada_en`; no toca `activa`,
  ni el tanque, ni `volumen_l`. Sin cambios.
`scripts/test-seguir-mismo-lote.sql` → este commit

### `20261023` — `continuar_siguiente_lote` con tanque manual (costura 2)
Bug de costura 2: cuando el auto-detect del lote+1 falla (lote todavía
sin liberar, con otro número, en tanque no-LISTO, o hay varios),
`continuar_siguiente_lote` cortaba con "Activa la línea manualmente" —
pero `20261018` cerró esa puerta (`activar_linea` desde Líneas rechaza
"ya tiene una corrida en curso"). Deadlock.
- **`p_numero_tanque smallint default null`** — si viene, se salta el
  auto-detect y usa ESE tanque (exige LISTO + lote asignado + que no lo
  tome ya otra corrida activa, y que ese lote no tenga una detenida sin
  PT). Sin él, comportamiento idéntico al de antes. Cambia la firma →
  drop + create.
- Misma transición de dos pasos: corrida vieja → ESPERANDO_PT (sigue
  debiendo su PT), corrida nueva con la config de línea heredada. NO
  toca `activar_linea` ni su guarda, ni el tanque, ni volúmenes.
- Frontend `LineasEstadoPlanta.tsx`: si "Continuar al siguiente lote"
  falla el auto-detect, aparece un selector con los tanques LISTO y se
  reintenta con el elegido.
`scripts/test-continuar-siguiente-lote-manual.sql` → este commit
Destrabe puntual del turno de Dany:
`scripts/fix-turno-dany-continuar-lote.sql` (plano, SQL editor de
Supabase — hace la transición a mano; sirve incluso antes de subir la
migración).

### `20261024` — Resto en el tanque origen después de transferir (§2.4 / §2.5)
`transferir_tanque` asume que TODO el volumen del origen se movió y deja
el tanque en SUCIO. En la práctica quedan litros pegados al fondo: ese
semielaborado desaparece (el tanque marca vacío pero tiene líquido, y el
lote destino quedó acreditado de más en `volumen_inicial_l`).
- **Frontend, paso 1 obligatorio**: antes de transferir, "Medí el Tanque
  {origen}" — se confirma/corrige el volumen real (por `medir_tanque`) y
  la transferencia mueve ESE número. Nunca sobre un valor sin medir.
- **`capturar_resto_origen_transferencia(usuario, turno_id, tanque_origen,
  litros_resto)` NUEVA** — después de transferir (+ medir destino), el
  cierre pregunta "¿el Tanque {origen} quedó vacío?". Si no: reabre el
  lote origen con el resto (tanque → Con Restos), le devuelve el crédito
  (`volumen_inicial_l += resto`), y le baja al lote destino `volumen_l` y
  `volumen_inicial_l` en el mismo resto — todo con constancia en
  `preparaciones_ajuste`. Solo LÍQUIDO / destino Limpio (no modo LOTE).
  Idempotente. NO toca `transferir_tanque` ni ninguna tabla.
- Regla que cierra: medir cada tanque mientras tiene su identidad;
  editar después de transferir = corregir el lote equivocado.
`scripts/test-resto-origen-transferencia.sql` → este commit

---

## Hecho — solo plan / scripts (sin migración)

### Plan reescrito — costura 2 / §2.2
Modelo de dos estados documentado, tabla de 7 casos línea→tanque→PT,
§2.1-bis pasa a ser la regla general "confirmar dos veces las acciones
bruscas". → `bc051c1` · `10079e7` · `b5e8e16`

---

## Falta — dentro de costura 2 (gaps del análisis del 2026-09-08)

1. **Case 6 — PT por tramo de turno, *forzado*. HECHO (2026-09-09, `20261028`).**
   `finalizar_turno` ahora rechaza también si hay una corrida **`activa` y
   `entregada_en` NULL** (nombra la(s) línea(s)); `FinalizarTurno.tsx` hace
   bloqueo DURO (sin "Finalizar de todos modos") con link a Producto
   Terminado. Para destrabar: por cada línea activa, cargar el PT del tramo
   (0/0 si no produjo — raro, pero se registra el 0 explícito) y elegir
   Terminar o Entregar línea. `scripts/test-finalizar-turno-corrida-activa.sql`.
   *No* se hizo el renombre `entregar_corrida → entregar_linea` (cosmético,
   queda para Fase 4).
2. **STANDBY** — decidido dejarlo (tanque con resto → LISTO en vez de
   STANDBY). El `OJO -- PROBAR EN PLANTA` de `20261018` se confirmó: el
   Turno 3 de Javier mostró que un tanque LISTO con el volumen **congelado**
   confunde al supervisor (re-corre la línea). Mitigado por `20261029` (la
   tarjeta muestra el volumen vivo, baja con cada PT) + la guarda antidup
   (`20261025`) + el prompt de medición (`20261026`). Falta todavía:
   confirmar que ninguna vista del dashboard filtra por STANDBY.
3. **Parciales en `ProductoTerminado.tsx`** — el mecanismo "Sumar paletas y
   continuar lote" / `modoIncremental` sigue ahí. Se retira con §2.9.

---

## Falta — resto de Fase 2

| Sección | Qué |
| --- | --- |
| **§2.1 (tanque)** | *Hecho:* `medir_tanque` extraída, `reactivar_lote` y `descartar_resto_tanque` dropeadas (`20261021`). *Falta:* narrowear el CIP + confirmar INICIO/FIN para poder dropear `cambiar_condicion_tanque` + `TanqueEditForm`. |
| **§2.3** | *Hecho:* advisory lock en `iniciar_preparacion`, `finalizar_lote` dropeada (`20261020`). *Falta:* ampliar `posibleDuplicado` en VALIDAR; decisión del dueño sobre reutilización de nº de lote tras cerrar. |
| **§2.5** | **DESCARTADO (2026-09-09).** No se captura la estimación del residuo de línea: el dato no se conoce, ahora los supervisores paran la línea a contar, y medir tanque tras PT ya deja el delta en `preparaciones_ajuste`. Se retoma solo si aparece un hueco real. |
| **§2.6** | **Hecho (2026-09-11).** Contador 2 (envases buenos) obligatorio en el form de PT, no puede superar la llenadora (`aa8a9ea`... `8fdcf42`); guard equivalente del lado servidor en `registrar_contador` (`20261036`); `Δenvases = \|buenos − PT_envases\|` visible en la tarjeta de la corrida cerrada (`ProductoTerminado.tsx`). |
| **§2.9** | **Hecho (2026-09-13).** Frontend sin entregas parciales (`ced6b2e`) + teardown de base en `20261037090000_dropear_parciales_y_producto_retenido.sql`: dropeadas `producto_terminado_parciales`, `producto_terminado.{tiene_parciales, producto_retenido, cajas_retenidas, editado_por, editado_en}`, `contadores.parcial`, y `corregir_producto_terminado_auditoria` (código muerto). Reescritas 5 funciones (no 6 — `historial_dia_area` ya no existía, se había dropeado en `20261032`). Sin Docker local (riesgo consciente, decisión del dueño: la base se reinicia el 01/10). *Falta: push a producción.* |

---

## Cómo subir

- Las **9 migraciones** (`20261013`–`20261021`) + su frontend **ya se
  subieron** (2026-09-08).
- **`20261022`–`20261030`** son un push propio y van juntos:
  - `20261022` `seguir_mismo_lote` (aditiva).
  - `20261023` `continuar_siguiente_lote` con tanque manual (drop+create,
    misma firma + 1 param opcional).
  - `20261024` `capturar_resto_origen_transferencia` (aditiva).
  - `20261025` repone la guarda antiduplicados en `activar_linea` +
    `continuar_siguiente_lote` (`create or replace`, sin cambio de firma;
    va DESPUÉS de `20261023`). `scripts/test-reponer-antiduplicados-corrida.sql`.
  - `20261026` `medir_tanque` llama a `revisar_cierre_de_lote` al final
    (`create or replace`, sin cambio de firma). Frontend:
    `ProductoTerminado.tsx` pide "Medir Tanque N" después de cerrar una
    corrida (Terminar / Entregar) — así el tanque deja de verse lleno y no
    se re-corre; si mide 0, el lote se cierra.
    `scripts/test-medir-tanque-cierre.sql`.
  - `20261027` `cambiar_condicion_linea` rechaza si la línea tiene una
    corrida detenida sin PT (ESPERANDO_PT) — misma guarda que ya tiene
    `activar_linea` (`create or replace`, sin cambio de firma).
    `scripts/test-cambiar-condicion-linea-esperando-pt.sql`. Frontend:
    `LineasEstadoPlanta.tsx` — con una corrida ESPERANDO_PT (Status y
    Líneas) se muestra el aviso "carga su Producto Terminado" + badge
    "Esperando PT", y **NO** los 3 botones de condición (Sin programación /
    Cambio de Presentación / CIP) — coherente con la guarda del servidor.
    Los 3 botones siguen apareciendo para una línea sin corrida.
  - `20261028` Case 6: `finalizar_turno` rechaza si hay una corrida
    `activa` sin entregar (`create or replace`, sin cambio de firma).
    `scripts/test-finalizar-turno-corrida-activa.sql`. Frontend:
    `FinalizarTurno.tsx` bloqueo duro + link a Producto Terminado.
  - `20261029` `turno_json`: bloque `tanques[]`, `volumen_l` lee el
    volumen VIVO del lote (`prep_t.volumen_l`) cuando el tanque está
    LISTO/STANDBY con lote abierto; si no, `rt.volumen_l` como antes.
    `create or replace`, cuerpo idéntico a `20261011` salvo ese `case`
    (verificado con `git diff` de los cuerpos). Frontend: **ninguno**
    (todos los consumidores leen `volumen_l`). Verificación (sin Docker):
    `scripts/verificar-tanque-volumen-vivo.sql` — plano, solo `SELECT`,
    contra el proyecto de pruebas.
  - `20261030` `cerrar_turnos_vencidos` sella corridas sin resolver
    (activa sin entregar / ESPERANDO_PT) del turno abandonado por el cron
    + `revisar_cierre_de_lote`; `listar_validacion_produccion` suma el
    filtro `cierre_automatico` y el flag `sin_pt`. Las dos `create or
    replace`, sin cambio de firma. `scripts/test-cron-sella-corridas.sql`.
    Frontend: `validacion.ts` + `ValidarLista.tsx` (badge "Sin Producto
    Terminado — el turno cerró solo").
  - Frontend: `produccion/{ajustes,useProduccion}.ts`,
    `LineasEstadoPlanta.tsx`, `preparacion/{ajustes,usePreparacion}.ts`,
    `EstadoPlantaTabs.tsx`, `ProductoTerminado.tsx`, `FinalizarTurno.tsx`,
    `validacion.ts`, `ValidarLista.tsx`.
  - WinSCP + `npx supabase db push` + `docker compose --profile preview
    up -d --build`.
- El turno de Dany se puede destrabar YA, sin esperar el deploy, con
  `scripts/fix-turno-dany-continuar-lote.sql`.
- El Turno 3 de Javier (`A20260908_T3G1`, Lote 0009 corrido 7×) se
  limpia con `scripts/fix-turno-javier-t3-lotes-duplicados.sql` — correr
  DESPUÉS de subir `20261025` (si no, se vuelve a ensuciar). Necesita el
  conteo real de paletas de Javier.
- Batch original — para referencia: iba **JUNTO** (un WinSCP + un
  `db push` + un rebuild). Cada migración cambiaba nombres de RPC /
  comportamiento y su frontend iba con ella. (`20261019` no tiene frontend.)
- Antes del push, si hay Docker: correr los `scripts/test-*.sql` sobre
  `supabase db reset` local (hoy no hay Docker en la laptop → los scripts
  quedan escritos para cuando lo haya).
- **Riesgo consciente:**
  - SQL de `20261018` sin probar local (no hay Docker). Los `test-*.sql`
    cubren los caminos principales.
  - Case 6 forzado (20261028) — Finalizar bloquea con corrida activa.
  - Retraining de supervisores: se fue "Editar" de una corrida en curso y
    "Cerrar Lote"; el flujo nuevo es Detener línea → cargar PT. `activar_linea`
    desde Líneas rechaza si ya hay corrida en vez de reemplazarla en silencio.

---

## Checklist de cierre de Fase 2 (del plan, pendiente)

- [x] `grep` de voseo sobre todo texto nuevo (vos, tenés, sabés, podés,
      confirmá, mirá, fijate…) — 2026-09-11, un solo caso real
      (`FinalizarTurno.tsx`), corregido.
- [x] Confirmar que los avisos largos nuevos quedaron como **modal**, no
      párrafo inline — 2026-09-11: la confirmación de Transferir pasó a
      `<Dialog>` (`src/components/ui/dialog.tsx`, nuevo).
- [x] `npm test` + `npm run build` — verde en cada commit.
- [~] Actualizar `supabase/ESQUEMA.md` / `MAPA.md` — primer incremento
      hecho 2026-09-11 (arquitectura de 3 módulos + `recepcion_tanques`
      corregido); la tabla de migraciones de `ESQUEMA.md` sigue sin
      completar desde `20260910`, se sigue de a poco.
