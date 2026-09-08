# Estado de ejecución — Fase 2 (base de datos)

Compañero de `plan-rework-3-modulos-y-merma.md`. Qué se hizo, qué falta,
cómo subirlo. Última actualización: **2026-09-08**. Rama:
`rework/preparacion-modulo`.

---

## Resumen

**6 migraciones nuevas** (`20261013`–`20261018`) + su frontend, listas para
subir **como un solo batch**. 13 commits, desde `4d8f75b` hasta `0a22290`.
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
  línea** (2ª confirmación), **Sin programación**, **En cambio de Operación**,
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

---

## Hecho — solo plan / scripts (sin migración todavía)

### §2.10 — Turno 3 después de medianoche
Bug real (Javier, noche 2026-09-07→08): activó el Turno 3 pasada la
medianoche y quedó como Turno 3 del día siguiente. `iniciar_turno` toma
`p_fecha` del frontend como `fechaLocal(now())`, sin lógica de turno
nocturno. Plan §2.10: regla en `iniciar_turno` (si `TURNO_3` y
`hora_inicio < 06:00` → `p_fecha - 1`, umbral a confirmar).
`scripts/fix-turno-fecha-anterior.sql` — corrección puntual de la fila ya
mal, plano para el SQL editor de Supabase. **Migración pendiente.** → `d2d5684`

### Plan reescrito — costura 2 / §2.2
Modelo de dos estados documentado, tabla de 7 casos línea→tanque→PT,
§2.1-bis pasa a ser la regla general "confirmar dos veces las acciones
bruscas". → `bc051c1` · `10079e7` · `b5e8e16`

---

## Falta — dentro de costura 2 (gaps del análisis del 2026-09-08)

1. **Case 6 — PT por tramo de turno, *forzado*.** Hoy la página PT obliga
   a elegir "Terminar / Entregar línea" por corrida activa, y Finalizar
   avisa — pero se puede "Finalizar de todos modos" con una corrida activa
   (solo `ESPERANDO_PT` bloquea duro). Si una corrida cruza el borde de
   turno sin su PT del tramo → la producción de ese turno para esa línea no
   se registra. Falta: hard-enforce en Finalizar + renombre
   **`entregar_corrida` → `entregar_linea`** (identificador + texto).
2. **STANDBY** — decidido dejarlo (tanque con resto → LISTO en vez de
   STANDBY). Marcado `PROBAR EN PLANTA` en la migración — confirmar que no
   confunde ni rompe vistas del dashboard que filtren por STANDBY.
3. **Parciales en `ProductoTerminado.tsx`** — el mecanismo "Sumar paletas y
   continuar lote" / `modoIncremental` sigue ahí. Se retira con §2.9.

---

## Falta — resto de Fase 2

| Sección | Qué |
| --- | --- |
| **§2.1 (tanque)** | Retirar `reactivar_lote`, `descartar_resto_tanque`, `cambiar_condicion_tanque` + `TanqueEditForm` + confirmaciones §2.1-bis. Es el espejo, del lado tanque, de lo que se hizo en líneas con costura 2. |
| **§2.3** | `pg_advisory_xact_lock` en `iniciar_preparacion` (TOCTOU nº de lote); ampliar `posibleDuplicado` en VALIDAR; confirmar que nadie llama `finalizar_lote` antes de limpiarlo; decisión pendiente del dueño sobre reutilización de nº de lote tras cerrar. |
| **§2.5** | Capturar el residuo de línea (~5% / 500 L) al cortar un lote — hoy ese volumen desaparece sin rastro. |
| **§2.6** | Envases buenos (Contador 2) como comparación visible de toda corrida (`Δenvases = |buenos − PT|`). |
| **§2.9** | Dropear columnas muertas de `producto_terminado` (`producto_retenido`, `cajas_retenidas`, `editado_por`, `editado_en`); retirar el mecanismo de entregas parciales. **Destructivo → push propio.** |
| **§2.10** | La migración de `iniciar_turno` (hoy solo existe el plan + el hotfix script). |

---

## Cómo subir

- Las **6 migraciones** (`20261013`–`20261018`) + **todo el frontend** van
  **JUNTAS**: un WinSCP + un `npx supabase db push` + un
  `docker compose --profile preview up -d --build`. **No** partir el batch —
  cada migración cambia nombres de RPC / comportamiento y su frontend va con
  ella.
- Antes del push, si hay Docker: correr los `scripts/test-*.sql` sobre
  `supabase db reset` local (hoy no hay Docker en la laptop → los scripts
  quedan escritos para cuando lo haya).
- **Riesgo consciente:**
  - SQL de `20261018` sin probar local (no hay Docker). Los `test-*.sql`
    cubren los caminos principales.
  - Case 6 avisado, no forzado (ver gap 1).
  - Retraining de supervisores: se fue "Editar" de una corrida en curso y
    "Cerrar Lote"; el flujo nuevo es Detener línea → cargar PT. `activar_linea`
    desde Líneas rechaza si ya hay corrida en vez de reemplazarla en silencio.

---

## Checklist de cierre de Fase 2 (del plan, pendiente)

- [ ] `grep` de voseo sobre todo texto nuevo (vos, tenés, sabés, podés,
      confirmá, mirá, fijate…).
- [ ] Confirmar que los avisos largos nuevos quedaron como **modal**, no
      párrafo inline — la confirmación de Transferir sigue inline, es
      trabajo de §2.1-bis.
- [x] `npm test` + `npm run build` — verde en cada commit.
- [ ] Actualizar `supabase/ESQUEMA.md` / `MAPA.md`.
