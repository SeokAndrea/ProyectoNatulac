# Plan de rework — Estados de tanque, Líneas y Recepción

Documento vivo, arrancado el 2026-09-02. Continúa el trabajo de
[plan-debug-merma-semielaborado.md](plan-debug-merma-semielaborado.md) (ese quedó cerrado y en
producción); acá vive todo lo que sigue: el rework del ciclo de vida del tanque, las líneas, y el
rediseño de "Status" → "Recepción".

---

## 0. El principio que atraviesa todo

**Todo se conecta por `lote`.** Tanques, Líneas, Producto Terminado, y las dos mermas (semielaborado
y envases) terminan resolviéndose contra un `lote_id`. Cualquier debugging o rediseño de acá en
adelante empieza preguntando: *¿qué lote(s) toca esto, y la cadena de `lote_id` se sostiene de
punta a punta?* La mayoría de los bugs reales encontrados (transferencia deshecha de Danny/Deivis,
las filas duplicadas "0001" del tanque 3, el resto descartado al preparar encima) solo se vieron
claros al rastrear el `lote_id`.

## 1. El mapa general (roadmap)

```
TANQUES ──alimentan──▶ LÍNEAS (corridas) ──cuentan con──▶ CONTADORES
   │                         │
   │                         └──producen──▶ PRODUCTO TERMINADO
   │                                              │
   └── Merma de SEMIELABORADO ◀── litros ─────────┤
                                                   │
       Merma de ENVASES ◀── envases ───────────────┘
```

Producto Terminado es la bisagra: alimenta las dos mermas a la vez. Un error de tipeo ahí (ver
caso Danny, punto 6) puede reventar las dos mermas aunque las fórmulas estén bien.

**Estado de cada subsistema:**

| Subsistema | Estado |
| --- | --- |
| Merma de semielaborado | ✅ Cerrado — 4 migraciones en producción, modelo por turno funcionando |
| Rework de estados de tanque | 🔶 En curso — este documento |
| Recepción (reemplaza Status) | 🔶 En curso — este documento |
| Líneas (como tema propio) | ⬜ Sin arrancar |
| Producto Terminado (flujo completo) | ⬜ Sin arrancar — un hallazgo suelto (punto 6) |
| Merma de envases | ⬜ Solo un caso encontrado, falta el barrido completo |

---

## 2. Los 6 estados de tanque HOY (`recepcion_tanques.condicion`)

| Estado en pantalla | Código | Qué significa |
| --- | --- | --- |
| Sucio | `SUCIO` | Usado, sin lavar. Sin sabor/lote/volumen. |
| En CIP | `CIP` | Lavándose. |
| Limpio | `LIMPIO` | Lavado, disponible para preparar. |
| En Preparación | `EN_PREPARACION` | Armando el sabor. Tiene lote, `liberado_en` en null. |
| Listo | `LISTO` | Sabor armado y **liberado** — una línea lo puede usar. |
| Con restos | `STANDBY` | Quedó producto real, guardado a propósito para la próxima preparación. |

Transiciones normales:

```
Sucio → CIP → Limpio → (Iniciar Preparación) → En Preparación (no liberado)
  → (Liberar Lote) → Listo → se drena → Sucio
                            → queda producto → Con Restos, o Transferir, o preparar encima
```

"Corregir" (`cambiar_condicion_tanque`) puede saltar directo a cualquier estado sin pasar por el
camino normal — ahí viven la mayoría de los bugs, porque salta las validaciones.

## 3. Hallazgos reales (barrido de 25 días, `scripts/debug-todos-los-asuntos.mjs`)

| Asunto | Firma | Casos encontrados |
| --- | --- | --- |
| **#1 — Preparar sobre un tanque con producto** | Una prep se cierra a los <5 min de que nazca la siguiente en el mismo tanque, con `volumen_l > 0` | 12 en 25 días — **2 el mismo día 2026-09-02**, tanque 3, 24.630 L entre los dos |
| **#2 — Lote cerrado con residuo** | `cerrado_en is not null and volumen_l > 0` | 34 en 25 días (muchos chicos/normales, algunos grandes de verdad) |
| **#3 — Transferencia deshecha por corrección** | `volumen_inicial_l` y `volumen_l` se mueven juntos, y después se revierten juntos | 1 confirmado (Danny→Deivis, lote 0002, 2026-09-01) |

## 4. Caso vivo — merma de envases negativa (2026-09-02)

Turno `A20260901_T1G1`→ hoy `A20260902_T1G1`, LÍNEA_1, lote 0001: contador 13.974 envases,
Producto Terminado 14 paletas + 0 cajas = 14.280 envases → **merma −2,19 %**.

Los dos datos se cargaron en el mismo segundo (15:16:01) — no es un problema de timing/contador
desactualizado, es un **error de tipeo entre las dos cifras** (contador vs. paletas). No es un bug
de fórmula: `1 − PT/contador` está funcionando bien, está avisando justo lo que tiene que avisar.

**Guardrail propuesto:** avisar EN EL MOMENTO de guardar si el cálculo daría negativo, antes de
que el formulario se mande — con los mismos datos que ya se están tipeando, sin fórmula nueva.

---

## 5. Rework — Fase 0 (acordar antes de tocar código)

### Pregunta 1 — ¿son 3 caminos, o hay un cuarto?

Caminos con rastro hoy: **sigue en el tanque** (Con Restos), **se transfiere**, **se envasa aparte**
(ver punto 7, "Desvase"). Preguntar al equipo: ¿hay un cuarto camino invisible para el sistema
(reproceso, derrame anotado aparte, otra área)? El caso del tanque 3 de hoy (8.340 L + 8.130 L) es
la oportunidad perfecta para confirmarlo con un caso fresco.

### Pregunta 2 — ¿avisar y dejar seguir, o bloquear hasta resolver?

Trade-off real: avisar es más rápido pero un supervisor apurado puede clickear sin pensar; bloquear
es más lento pero hace prácticamente imposible repetir el asunto #1. Preguntar: ¿el problema es que
no se enteran, o que aunque se enteren lo hacen igual por apuro?

### Pregunta 3 — el texto exacto

Ejemplos ya circulados para elegir/ajustar (ver conversación original) — no repetidos acá para no
duplicar, referencia: modales del punto 6.

---

## 6. Guardrail #1 — Preparar sobre un tanque con producto

**Rediseñado tras feedback real: "trabajar encima" es la operación normal que quieren, no un error.**
El default tiene que ser lo que ya hacen siempre, no una pregunta rara.

**Primer nivel:**
> "El tanque N tiene 2.500 L de [sabor] sin usar. Se van a sumar al lote nuevo."
> `[ Sí ]` `[ No ]`

**Si "No":**
> `[ Transferir a otro tanque ]` `[ Descartar — necesita motivo ]` `[ Desvase ]`

**"Desvase"** = el nombre real en planta de lo que la base llama `reservas_tobos` (envasar el resto
aparte para una preparación futura). Ya existe en el código (`EstadoPlantaTabs.tsx`, botón
"Desvase", RPC `envasar_tanque`) pero está **apagado**: `DESVASE_HABILITADO = false`. Estaba pausado
porque no se le veía un uso claro — ahora sí lo tiene (es la opción del medio entre "seguir
encima" y "descartar"). **Pendiente para cuando se implemente: prender el flag junto con el modal.**

## 7. Guardrail #2 — absorbido en Recepción (ver punto 8)

Originalmente se pensó como un modal aparte al marcar Sucio/CIP/Limpio con residuo. Se descartó esa
forma — agregar un cuarto estado tipo "pendiente" sumaba complejidad en vez de resolver el
problema. **La decisión real (Recepción) resuelve esto de raíz**, en el punto siguiente.

---

## 8. Recepción — reemplaza "Status" por completo

**Por qué:** "Status" hoy se usa para editar mezclado con confirmar, y no está claro para el
supervisor cuándo está una cosa u otra. Recepción separa las dos cosas y la hace obligatoria.

**Reglas:**
- Aparece **inmediatamente después de Comenzar Turno**. No se puede ver por otro lado.
- **Bloquea** el resto de la app — si no se confirma, la app siempre redirige de vuelta acá.
- Su trabajo es **mostrar lo heredado y hacer que el supervisor lo confirme contra la realidad
  física** — reduce la carga manual, obliga a chequear lo que de verdad hay.

**Por cada TANQUE:** se muestra lo heredado (condición, sabor, lote, volumen). Botones:
- **Confirmar** → sigue igual.
- **Editar** → no coincide → si el tanque tiene residuo, ACÁ es donde se pregunta qué pasó con esos
  litros (mismo menú del guardrail #1: Con Restos / Transferir / Desvase / Descartar con motivo) —
  como parte del flujo de edición, no como un modal aparte.

**Por cada LÍNEA:** se muestra su estado heredado (corriendo / parada / terminada, presentación,
tanque del que depende). Botones:
- **Confirmar** → sigue igual.
- **Editar** → cambia su estado real.

**Regla clave de diseño — el lote de una línea NUNCA se edita directo:** al editar una línea, se
elige **con qué TANQUE está corriendo** — el `lote_id` se hereda automático de ese tanque. Esto
elimina de raíz la clase de bug del tanque 3 (una línea con un lote_id desincronizado del tanque
real), porque una línea no tiene de dónde sacar un lote que no sea el que el tanque dice tener en
ese momento.

**Pendiente, tema propio (no resuelto en este documento todavía):** la vista combinada
tanque+línea — si editar un tanque (ej. "este lote ya terminó") debería resolver automáticamente
las líneas atadas a él, o si son ediciones independientes. El dueño lo señaló como más complejo de
lo que parece y prefiere darle su propia sesión de diseño en vez de resolverlo de pasada.

## 9. Estados de tanque — CERRADO (2026-09-02)

Nuevo modelo, reemplaza los 6 nombres de hoy:

| Nombre nuevo | Reemplaza | ¿Automático o manual? |
| --- | --- | --- |
| **Liberado** | "En Preparación Liberado" / `LISTO` | Manual (Liberar Lote) |
| **En Preparación No Liberado** | `EN_PREPARACION` | Manual (Iniciar Preparación) |
| **Limpio** | `LIMPIO` (y "Vacío" desaparece como palabra, un solo nombre) | Manual (termina CIP) |
| **CIP** | `CIP` | Manual |
| **Con Restos 0 L** | `SUCIO`, cuando el tanque se drena solo | **Ya automático hoy** — ver abajo, es solo un cambio de nombre |
| **Con Restos X litros** | `STANDBY` | Manual (Corregir) |

**"Sucio" desaparece como palabra propia.** Conceptualmente es lo mismo que "Con Restos" (¿qué
quedó en el tanque?), la única diferencia es la cantidad — 0 L o más.

**El auto-drenado YA es automático hoy, no hay que construirlo.** `registrar_producto_terminado()`
(20260975) ya hace esto: si el tanque estaba Listo y el volumen llega a 0 con ese Producto
Terminado, automático marca el tanque `SUCIO`, cierra el lote y termina las líneas que dependían de
él (`lote_terminado_en`). Y ya guarda internamente `ultimo_lote = "Restos del lote X"` — el propio
código ya piensa en términos de "restos", solo la pantalla dice "Sucio". Este punto es **solo un
rename**, cero lógica nueva.

**Por qué separar "Con Restos 0 L" de "Con Restos X litros":** el estado mismo, con solo mirarlo,
le dice al supervisor si hay o no una decisión pendiente sobre residuo — "0 L" no dispara ningún
guardrail (no hay nada que resolver, se puede preparar encima sin preguntar nada), "X litros" sí
dispara el guardrail #1 / la edición en Recepción.

## 10. Prioridad — por dónde limpiar primero (2026-09-02)

Ordenado por severidad × frecuencia real, no por orden en que se encontraron:

| # | Riesgo | Frecuencia real | Severidad | ¿Ya tiene diseño? |
| --- | --- | --- | --- | --- |
| **1** | Preparar sobre tanque con producto (Asunto #1) | 12/25 días, 2 el mismo 2026-09-02 | Alta — único generador de merma negativa, y se ve "verde" en el panel | ✅ Guardrail #1 |
| **2** | Residuo sin rastro al cerrar (Asunto #2) | 34/25 días | Media — mismo mecanismo que el #1, vía Recepción | ✅ Dentro de Recepción |
| **3** | Transferencia deshecha por corrección (Asunto #3) | 1 caso en 25 días | Baja — parece aislado; la duplicación en sí ya está arreglada (Fase D) | ⬜ Falta la acción de "deshacer" |
| **4** | Doble conteo de Con Restos (§12 del plan original) | Depende de cuánto se use Con Restos, no medido | Baja/media | ⬜ Sin diseñar |
| **5** | Lotes que nacen sin pasar por "Iniciar Preparación" real (`tambores=0`) | Muy frecuente, casi la norma hoy | Alta a largo plazo, pero es cambio de hábito, no un guardrail puntual | ⬜ Necesita su propia sesión |

**Los #1 y #2 son el mismo arreglo** (Recepción + el menú de residuo) — de ahí sale más limpieza de una sola vez. **Se arranca por ahí.**

**Bajado de prioridad a propósito — Merma de envases:** el caso encontrado (Danny, −2,19 %) es un
síntoma de cómo se carga el dato en Producto Terminado, no una falla de diseño como las de tanques.
Queda colgado del futuro debugging de **Producto Terminado** (punto 11) en vez de ser su propio
tema urgente.

## 11. Pendientes generales (para retomar)

- Diseñar la vista combinada tanque↔línea (punto 8, tema propio).
- Arrancar el debugging de **Producto Terminado** como flujo completo — incluye cuantificar la
  merma de envases (bajada de prioridad, ver punto 10).
- Reporte de la Fase C histórica (`scripts/reporte-fase-c-candidatos.sql`) — turnos viejos, decidido
  dejarlos como están, sigue documentado por si cambia la decisión.
- Construir la línea única "Detener por falla" (punto 12) — diseño cerrado, falta implementar.
- Construir el prellenado de velocidad/presentación por línea (punto 12) — diseño cerrado, falta
  implementar.
- Catálogo de paradas (razones estandarizadas para "Detenida") — todavía no existe, es su propio
  tema futuro (ver punto 12).

## 12. Líneas — hallazgos y decisiones (2026-09-02)

**Dónde vive todo esto: PREPARACIÓN, no Recepción.** Recepción (punto 8) es el candado de una sola
vez al arrancar el turno — ahí solo hace falta el Confirmar/Editar por línea que ya estaba en el
diseño original. Todo lo de abajo (estados, falla, continuar siguiente lote, prellenado) es
operación de todo el turno, y vive en `EstadoPlantaTabs.tsx` (la pantalla de Preparación).

### Los estados reales (confirmados contra el código, `lineas_estado`)

| Lo que ve el dueño en planta | Código (`lineas_estado.condicion`) |
| --- | --- |
| Funcionamiento | — (no es un valor de esta tabla, es la corrida activa en `turno_lineas`, ver abajo) |
| Falla | `DETENIDA` (con nota libre, hasta 140 caracteres) |
| Limpieza | `CIP` |
| Sin programación | `SIN_PROGRAMACION` |
| Cambio de presentación | `CAMBIO_PRESENTACION` |
| *(no lo usa nunca)* | `LISTA` — candidato a sacar, igual que "Sucio" en tanques |

**Hay DOS capas separadas, y ninguna pantalla las muestra juntas:** `lineas_estado` (arriba, cuando
NO hay corrida activa) y `turno_lineas` (Corriendo / Parada / Terminó el Lote / Esperando Cierre,
solo mientras SÍ hay corrida activa). El sistema hoy **impide técnicamente** tener las dos a la vez
(`cambiar_condicion_linea` rechaza el cambio si hay una corrida activa: *"detén o termina el sabor
antes de cambiar su estado"*) — pero nada en la UI explica esto, así que se vive como "no aparece
nada".

### Falla temporal vs. falla que corta la corrida — confirmado con el dueño

| | Pausa temporal | Falla que corta la corrida |
| --- | --- | --- |
| ¿Sigue activa la corrida? | Sí (`pausar_linea`, `activa` se mantiene) | No (`terminar_linea`, `activa=false`, pero `mantiene_tanque=true` — el tanque/lote se conserva) |
| ¿Pide motivo? | No | Sí — texto libre por ahora (no existe catálogo de paradas todavía) |
| ¿Cómo se retoma? | "Continuar" — un click, misma corrida | Se arranca una corrida nueva sobre el mismo tanque |
| ¿Existe hoy? | Sí, completo (`pausar_linea`/`continuar_linea`) | Existe pero **partido en 2 pasos manuales** — `terminar_linea` y DESPUÉS `cambiar_condicion_linea('DETENIDA', motivo)`. Si el supervisor solo hace el primero, el motivo de la falla se pierde. |

**Arreglo propuesto (diseño cerrado, sin implementar):** un solo botón "Detener por falla" que hace
las dos cosas en un solo paso — termina la corrida conservando el tanque, y pide el motivo en el
mismo momento.

### `continuar_siguiente_lote` — el problema real (confirmado)

Función real: toma el lote actual (ej. "0003"), calcula el siguiente (+1), busca un tanque **Listo**
(liberado) con ese lote exacto, y si lo encuentra, migra velocidad/presentación de la corrida vieja
a una nueva. Si no lo encuentra, tira error y no hace nada más.

De 3 candidatos a "bug", el dueño confirmó:
- ❌ Números de lote no consecutivos — descartado, siempre son consecutivos en la práctica.
- ❌ No valida que el sabor coincida — posible bug silencioso, pero no es la molestia real.
- ✅ **El problema real:** exige que el tanque siguiente ya esté Listo/liberado EN ESE MOMENTO. Si
  el timing no coincide (lo normal), el supervisor arranca una corrida nueva de cero y pierde la
  velocidad/presentación ya cargada — tiene que retipearla.

**Por qué no se puede aflojar el candado:** confirmado con el dueño — un tanque no liberado
literalmente no se usa, es una regla física real (`activar_linea` exige lo mismo). No es un
capricho, no se toca.

**Arreglo propuesto (diseño cerrado, sin implementar):** en vez de aflojar el candado, **recordar
la última velocidad/presentación usada por esa línea** y prellenar el formulario de "Activar Línea"
con eso — funciona tanto en "Continuar Siguiente Lote" como en una corrida arrancada de cero,
independiente del timing. Resuelve el fastidio real sin tocar la regla de seguridad.

### Confirmado: esto no afecta cuándo aparece la opción de Producto Terminado

`ProductoTerminado.tsx` lista como "pendiente" cualquier corrida con `activa = true` (o
`esperandoCierre`) — automático, en el instante en que `activar_linea` (o `continuar_siguiente_lote`)
crea la fila. El prellenado de velocidad solo cambia qué trae el formulario ANTES de activar; no
toca en absoluto el paso de DESPUÉS (que la corrida aparezca lista para cargar PT). Sin riesgo de
cruce entre los dos temas.
