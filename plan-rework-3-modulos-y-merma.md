# Rework completo: 3 módulos de dominio + base de datos + eliminar edición libre

## Primer paso, antes que nada

**Guardar este documento en el repo** (`plan-rework-3-modulos-y-merma.md` o similar, junto a los
otros `plan-*.md`) y comitearlo. Es la lección de esta sesión: van tres planes reales que se
perdieron por no hacer esto primero (el de hoy, el del viernes 4, y el del sábado que no se pudo
recuperar). Ningún paso de código o de base arranca antes de que este documento exista como
archivo versionado, no solo como chat.

Después de eso, el primer paso de ejecución real es **Fase 1, paso 1: Preparación** — tipos +
`usePreparacion()` + RPCs angostadas (`src/lib/preparacion/`), en una rama nueva. Es el módulo
elegido para probar el patrón primero porque es el que más lógica de "realidad" tiene (8
mutaciones, la fusión de estados de tanque, CIP obligatorio) — si el corte núcleo/ajustes
funciona bien ahí, se repite en Producción y Producto Terminado con confianza.

## Contexto

Este documento consolida tres sesiones de planificación que se habían perdido sin llegar al
repo: la de hoy, la del viernes 4 (recuperada de `rustling-gathering-hopcroft.md`, nunca
guardada como `.md` del proyecto) y los ajustes de una tercera sesión (sábado) de la que no
quedó ningún archivo — se reconstruye acá a partir de lo que el dueño explicó de nuevo.

El proyecto lleva 138 migraciones incrementales y una historia larga de bugs de merma de
semielaborado, diagnosticados en cuatro documentos vivos del repo —
[plan-debug-merma-semielaborado.md](plan-debug-merma-semielaborado.md) (causa raíz + Fases
A–D, en producción desde 2026-09-02), [plan-rework-tanques-lineas-recepcion.md](plan-rework-tanques-lineas-recepcion.md),
[plan-rework-auditoria.md](plan-rework-auditoria.md) (guardrails 7.1–7.6) y
[plan-validar-produccion.md](plan-validar-produccion.md) — más un rework real del 2026-09-04
(commit `fe83b75`, "base de seguridad": Contador 2 de envases buenos, techo de 30.000 L en
transferencias) sin su `.md` correspondiente.

El diagnóstico de fondo, confirmado por el dueño en varias vueltas: los bugs de merma no son
solo bugs de fórmula — son la fórmula chocando contra física que nunca se modeló (el
pasteurizador, el residuo de línea) y contra un sistema que dejaba editar cualquier cosa de
cualquier forma. La corrección no es solo arreglar números — es **cerrar la mayoría de las
formas de editar que hoy existen** y reemplazarlas por checkpoints de confirmar/reportar.

### El proceso físico real

```
Analista → Programación diaria (qué línea, qué sabor)
    │
    ▼
Supervisor elige TANQUE (de 3) → Preparación (tambores/kits + agua ajustable, PRE-liberación)
    │
    ▼
Tanque ── MANIFOLD (el centro que conecta tanques ↔ líneas ↔ pasteurizadores) ──► LÍNEAS (de 3)
    │
    ▼
Pasteurizador Flex y/o Drink — retienen ~1.500 L de jugo entre los dos: se "pierden" en el
primer lote que pasa (queda retenido, no sale como PT todavía) y se recuperan de golpe en el
último lote de la cadena. No siempre se usan los dos a la vez.
    │
    ▼
Llenadora (4 contadores: total salido, BUENOS, desechados = total−buenos, "cardboard" sin uso)
    │
    ▼
Robot paletizador → Producto Terminado (un total por lote, al final — nunca incremental)
```

**Tres mecánicas físicas que hoy no se modelan bien:**

1. **Pasteurizador (~1.500 L):** buffer compartido entre lotes consecutivos del mismo
   tanque/manifold — el dueño ya resolvió (`plan-debug-merma-semielaborado.md` §43 punto 3)
   que se autocompensa en la cadena y no hace falta modelarlo aparte. Se documenta el
   mecanismo para que un lote suelto con merma rara en el primer/último tramo del día no se
   lea como un bug.
2. **Transferencias de "enrutamiento":** para que la línea no se detenga, a veces mueven
   líquido de un tanque a otro que **sí** está conectado físicamente al Flex/Drink en ese
   momento, en vez de parar la línea y recablear el manifold — de ahí sale gran parte de los
   "mover el lote de un tanque a otro" que hoy el sistema trata igual que cualquier otra
   transferencia.
3. **Residuo de línea al cortar lote (~5%/500 L):** vive en la tubería/llenadora, no en el
   tanque — no siempre se para la línea para contar, así que ese volumen se pierde de vista
   salvo por el Contador 2 (envases buenos) y la marca del ~5% típico.

### El principio que gobierna todo el rework

> **Casi todas las formas de editar de los supervisores se eliminan. La única edición libre
> que sobrevive es en Recepción** (confirmar/corregir lo heredado del turno anterior, una
> sola vez al empezar). En cualquier otro punto del sistema, la interacción deja de ser
> "editar un valor" y pasa a ser **reportar/confirmar un hecho que cierra un tramo** — con
> una segunda oportunidad si algo sale mal (repetir la acción, no corregir el dato a mano).
> Los errores se castigan, no se acomodan: el sistema deja de intentar reflejar cada variante
> de cómo trabaja cada supervisor y en cambio estandariza un solo camino correcto.

**Consecuencia directa — Producto Terminado sin parciales *a mitad de turno*:** el PT de un
tramo se carga **una sola vez, cuando ese tramo se cierra** (Detener línea, o el borde de
turno), nunca de a poco y a discreción durante el turno. Se elimina el mecanismo de "entregas
parciales" (`tiene_parciales`, la tabla `producto_terminado_parciales`, el modo incremental de
la UI). Esto resuelve la ambigüedad que motivó "Medir tanque": no hay forma de que una
medición y su PT se desincronicen.

**La excepción — un PT por turno que la corrida cruza:** si una corrida sigue viva al Finalizar
el turno, ese turno carga el PT de SU tramo antes de cerrar, y la corrida sigue en el turno
siguiente con un tramo nuevo (ver Fase 1 costura 2). No es una "entrega parcial" discrecional:
es un checkpoint obligatorio en un límite duro, uno por turno, que es lo que la merma por turno
necesita. El cierre final de la corrida = el PT del último tramo.

**Con esto, "Medir tanque" deja de ser una acción rutinaria de mitad de turno** y pasa a ser
una herramienta de excepción (reconciliar cuando la realidad física no coincide con lo
derivado) — se usa en Recepción (chequeo heredado) y cuando algo se ve raro, no como parte de
cada cierre de corrida. El cierre normal de una corrida lo dispara el PT total: registrar el
PT ya descuenta `volumen_l` del lote automáticamente (mecanismo que ya existe en
`registrar_producto_terminado`).

**Regla del dueño sobre cómo se ve en pantalla (sin cambios):** el número principal siempre
tiene que ser un número real — nunca un "—"/"sin dato". Cualquier duda sobre si algo es
confirmado o todavía puede moverse es información de segundo nivel (detalle/color/tooltip),
nunca reemplaza el número principal.

**Redacción de todo texto nuevo — dos reglas fijas, no solo una preferencia de estilo:**

1. **Español neutro, sin voseo** (mismo criterio que
   `20260971090000_neutralizar_mensajes_voseo.sql`). **Se revisa como parte del cierre de
   CADA fase** (Fase 1, Fase 2, Fase 3) — un `grep` contra las formas de voseo (vos, tenés,
   sabés, podés, confirmá, mirá, fijate...) sobre los textos nuevos de esa fase, no algo que
   se da por sentado. Ver la lista de verificación de cada fase, abajo.
2. **Si el texto es más que una frase corta** — explica una consecuencia, ofrece más de una
   alternativa, o pide confirmar algo que no se puede deshacer — **va en un popup/modal
   siempre que sea posible**, nunca como párrafo suelto dentro de una tarjeta o formulario.
   Aplica en concreto a la confirmación de "Terminó Lote" (2.1-bis), la confirmación antes de
   Transferir (2.4-bis), y cualquier aviso nuevo de las fases 2 y 3.

Orden de trabajo: **primero el código** (arquitectura de 3 módulos, abajo), **después la base
de datos**. Rama nueva. Entorno con Docker + Supabase CLI: toda migración se prueba con
`supabase start` + `db reset` local antes de `db push`. El rol robot paletizador (Fase 3) SÍ
entra en este plan — es la razón por la que se prioriza resolver el modelo de PT primero (ver
Fase 3); lo que queda afuera es la integración física con el hardware del robot en sí.

### Riesgo de seguridad encontrado y aceptado conscientemente (fuera de alcance de este rework)

Auditadas las ~90 funciones expuestas a `anon`/`authenticated`: **ninguna verifica sesión
real** — cada una recibe `p_usuario text` y confía en ese string (vía `rol_y_area_de(p_usuario)`)
sin ningún token/JWT que lo ate a un login real. Con la clave `anon` (pública, embebida en el
frontend) cualquiera que abra las devtools del navegador puede llamar a cualquier función
pasando el usuario que quiera — ejemplo real: `crear_usuario('jguerrero', 'x', 'y',
'SUPERADMINISTRADOR')` crea un Super Administrador nuevo sin haber iniciado sesión como nadie,
porque `jguerrero` es el usuario semilla documentado en `ESQUEMA.md`. `verificar_login` además
no tiene límite de intentos.

**Decisión del dueño:** la base pasa a una red interna real (VPN/firewall, no solo URL sin
publicar) — descarta el ataque externo. Queda el riesgo de alguien ya adentro de la empresa
(el mismo grupo que el resto de este plan ya trata como no confiable — "castigar los errores"),
pero es una decisión consciente de prioridad, no un olvido.

**Mitigación liviana, para cuando se retome (no en el alcance de este rework):** token de
sesión generado por `verificar_login`, guardado en una tabla `sesiones` con expiración; el
resto de las funciones lo piden y lo verifican en vez de confiar en `p_usuario` solo. Aditivo,
no requiere migrar a Supabase Auth.

---

## Fase 1 — Arquitectura: 3 módulos de dominio + Reportes

Hoy todo el turno vive en un solo `TurnoProvider` (~1331 líneas, `src/lib/turno.tsx`) y una
sola `mapearTurno()`/RPC `turno_json` que junta tanques, lotes, líneas, contadores y PT en un
blob. Las fórmulas de merma viven todas juntas en `panelProduccion.ts`, mezclando dominios.

**Las tablas de Supabase ya están separadas por FK — no hay que migrar datos.** El trabajo es
partir el código para que refleje esa separación real.

| Módulo | Dueño de | Tablas | Hook nuevo |
| --- | --- | --- | --- |
| **Preparación** | tanques, lotes | `recepcion_tanques`, `preparaciones`, `preparaciones_ajuste*` | `usePreparacion()` |
| **Producción** | líneas, corridas, contadores | `turno_lineas`, `lineas_estado`, `contadores` | `useProduccion()` |
| **Producto Terminado** | registros de PT | `producto_terminado` (sin parciales, ver Contexto) | `useProductoTerminado()` |
| **Reportes** (capa fina, no un 4º módulo de datos) | nada propio — compone los 3 | — | — |

**Páginas** (agregado de esta sesión: Líneas deja de ser una pestaña compartida, pasa a ser su
propia página):
- **Recepción** — Preparación: confirmar/editar tanques heredados. Única pantalla con edición
  libre de verdad.
- **Preparación** — Preparación: iniciar/liberar/ajustar/transferir/guardar en pipa un lote
  (nunca "descartar" — ver 2.1/2.4, esa salida no existe en la operación real).
- **Líneas** (nueva, propia) — Producción: activar/pausar/continuar/terminar una corrida;
  compone `useProduccion()` + lee `usePreparacion()` de solo lectura (costura #1, abajo).
- **Producto Terminado** — compone `useProduccion()` + `useProductoTerminado()`.
- **Panel de Producción** — lee `reportes.ts` (RPC del servidor, no el contexto en vivo).

### Las 3 costuras entre módulos (no se puede separar al 100%, y no hace falta fingir que sí)

1. **Producción lee Preparación al activar una corrida.** Hoy `activar_linea` hace su propio
   `select` contra `recepcion_tanques`. Se reemplaza por una función de solo lectura que
   expone Preparación — `loteDisponibleEnTanque(numeroTanque)` — en vez de un join directo a
   la tabla ajena.
2. **Cerrar una corrida puede vaciar un lote — la causa real de "a veces un tanque se cierra
   solo cuando no debería".** Investigado a fondo: `cerrar_corrida_si_esperando()` (dispara
   desde `registrar_producto_terminado`/varios "terminar") depende de que la función que
   finalizó la corrida haya seteado antes `turno_lineas.mantiene_tanque` correctamente — un
   booleano que **cada** función nueva capaz de terminar una corrida tiene que acordarse de
   propagar bien. **32 migraciones tocan esta lógica — es el punto más parchado de todo el
   sistema**, más todavía que `cambiar_condicion_tanque` (15 migraciones, ver Fase 2).

   **Rediseño (modelo de dos estados, definido con el dueño el 2026-09-08):** Producción nunca
   cierra el lote ni el tanque, ni directo ni vía flag. La corrida se cierra en **dos pasos
   explícitos**, no en una sola llamada:

   - **Detener línea** deja la corrida en estado **`ESPERANDO_PT`** — no la cierra. No toca el
     tanque. La línea queda libre (se puede reprogramar, poner en CIP, etc.).
   - **Cargar el PT del tramo** (paletas/cajas de esa corrida) es lo ÚNICO que cierra la
     corrida. Registrar el PT baja `volumen_l` del lote solo (mecanismo que ya existe en
     `registrar_producto_terminado`). El PT nunca es opcional: activada por error y sin
     producir nada → PT `0/0`, igual obligatorio. Esto cierra de raíz el hallazgo de "corridas
     que cierran con 0 paletas": no hay forma de cerrar una corrida sin pasar por el PT.

   Preparación decide sola si su lote quedó agotado, con `revisarCierreDeLote(loteId)` —
   chequea `volumen_l` (que ya bajó por el PT) y que ninguna corrida activa le apunte — y lo
   cierra si corresponde (tanque → Con Restos o Limpio). Si el lote todavía tiene litros
   (la línea se detuvo antes de vaciarlo), queda abierto y Preparación lo maneja: otra línea
   lo toma, transferir, o desvasar. Ninguna función de Producción puede dejar un tanque en
   estado raro: nunca tuvo el poder de tocarlo.

   **Guard de cierre de turno — Finalizar obliga a dejar cada línea "clean" (agregado
   2026-09-08):** no se puede Finalizar el turno mientras haya una corrida sin resolver. Por
   cada línea con corrida:
   - en `ESPERANDO_PT` (se apretó Detener línea, falta el PT) → hay que cargar el PT.
   - **activa o en Parada Operacional** → Finalizar **obliga** a: cargar el PT del tramo
     producido en ESE turno **y** decidir el próximo estado de la salida de la línea:
     **Terminar** (la corrida se cierra) o **Entregar línea** (sigue en el turno siguiente
     con un tramo nuevo). Hoy nada obliga a nada: la línea se hereda en silencio y la
     producción del turno saliente para esa línea queda sin registrar. Esa decisión es un
     paso obligatorio del cierre de turno, igual que el guard de `ESPERANDO_PT`.
   - Renombre: `entregar_corrida` → **`entregar_linea`** (identificador y texto). El supervisor
     "entrega la línea" al siguiente turno, no "la corrida".

   **Guard antiduplicados (reemplaza el de `activar_linea` de `20261003`):** el bloqueo pasa a
   ser "no se puede activar una línea si hay una corrida sobre ese lote todavía en
   `ESPERANDO_PT`" — hay que cerrar el ciclo primero. Volver a correr la misma línea sobre el
   mismo lote una vez cerrado el PT es legítimo (una línea que paró y otra —o la misma— sigue
   con el resto: cada corrida tiene su propio PT, no hay duplicado posible). Los repetidos
   reales (misma línea+lote+presentación, las dos con paletas > 0) se **marcan en VALIDAR**
   (`posibleDuplicado`, §2.3), no se bloquean a mano.

   **PT por tramo de turno (no contradice "PT sin parciales" del Contexto):** lo que el
   Contexto elimina son las entregas parciales *a mitad de turno* (cargar 200 paletas ahora,
   300 después, mismo turno — la ambigüedad que motivó "Medir tanque"). Un PT en el **borde
   entre dos turnos** es otra cosa: uno por turno, obligatorio, en un límite duro, atado a
   "qué produjo este supervisor en su turno" — es justo lo que la merma por turno necesita
   para una corrida que cruza turnos. `iniciar_turno` ya crea una fila de corrida nueva para
   el turno entrante, así que la plomería está. El cierre final de la corrida = el PT del
   último tramo.

   **Todas las acciones bruscas de la corrida confirman dos veces** antes de ejecutarse
   (Activar, Detener línea, Cargar PT) — ver la regla de redacción 2 del Contexto y §2.1-bis.
3. **Merma = comparación entre módulos.** Vive enteramente en Reportes. Los módulos de
   dominio no calculan ningún % — solo exponen números crudos (litros consumidos, envases
   contados, litros de PT) y Reportes hace la resta/división.

### Núcleo vs. ajustes — validado en Preparación, ya replicado en Producción

```
src/lib/preparacion/
  nucleo.ts     -- ciclo idealizado: iniciar → liberar → cerrar. Nada más.
  ajustes.ts    -- ajustarPreparacion, transferirTanque, envasarTanque (a pipa)
                   (reactivarLote y descartarRestoTanque SE RETIRAN, ver Fase 2 — no entran acá)

src/lib/produccion/
  nucleo.ts     -- activarLinea, pausarLinea, continuarLinea, terminarSaborLinea,
                   terminarLinea, cambiarCondicionLinea, confirmarEstadoLinea, registrarContador
  ajustes.ts    -- detenerLineaPorFalla, continuarSiguienteLote, entregarCorrida,
                   actualizarJustificacionContador

src/lib/productoTerminado.ts -- un solo archivo por ahora (pendiente, paso 3)
```

Regla: si la operación existe para manejar algo que salió distinto de lo planeado (una falla,
un resto, una corrección), va en `ajustes.ts` con un comentario de qué problema real resuelve.
Si es un paso normal (empezar, activar, terminar), va en `nucleo.ts`. `ajustes.ts` nunca
reimplementa lo que hace `nucleo.ts` — lo llama.

**Actualización de esta sesión:** el patrón se dio por validado con Preparación (ayudó a
encontrar el hueco de `confirmarEstadoTanque` fácil) y se aplicó directo a Producción, en vez
de esperar más rondas — Producción tenía más funciones (12) y se beneficiaba más de estar
separado. Producto Terminado (paso 3) todavía queda como archivo único hasta que le toque su
turno.

### Reportes: lo teórico separado de la realidad

```
src/lib/reportes/
  teorico.ts               -- fórmulas puras (pctRendimiento(esperado, real) = 1 − real/esperado),
                               no sabe qué es un lote ni un tanque
  realidadPreparacion.ts   -- qué lotes/tramos entran al cálculo de merma semielaborado (hoy
                               vive mezclado adentro de mermaSemielaboradoTurno)
  realidadProduccion.ts    -- qué corridas son comparables para merma de envases
  index.ts                 -- compone: lee los 3 módulos → realidad*.ts filtra → teorico.ts calcula
```

Con esto, "¿por qué da este % de merma?" tiene dos preguntas separadas en dos archivos
distintos: "¿la fórmula está mal?" (`teorico.ts`, debería ser obvio a simple vista) vs.
"¿se está descartando mal un lote?" (`realidadPreparacion.ts`). Hoy viven mezcladas en un
bloque de 70 líneas.

### Simplificaciones ya decididas (no se tocan)

- **Relleno de tanque a mitad de corrida (30.000 L) + corroboración por envases buenos → SE
  MANTIENE.** Sin el relleno, un tanque que necesita más volumen obliga a partir el consumo
  en dos tramos con una entrega parcial — y las entregas parciales se están eliminando (ver
  Contexto). La corroboración es un guardrail chico y opcional.
- **CIP vs. Limpio → se mantienen separadas, y CIP pasa a ser OBLIGATORIO** (ver "Estados de
  tanque y línea" abajo — decisión tomada en esta sesión, reemplaza la observación pendiente
  del viernes).
- **Un solo modo de transferencia (candidato, no confirmado):** `transferirTanque` tiene dos
  modos (LIQUIDO/LOTE) que solo difieren en qué identidad de lote sobrevive. Candidato a
  dejar en un único modo y sacar la pregunta de la UI — bajo impacto, revisar después de la
  Fase 2.

### Estados de tanque y línea — reducir lo que no se usa, forzar lo que sí pasa de verdad

Auditados los 6 valores de `CondicionTanque` y los 5 de `CondicionLinea` contra el uso real en
planta:

**Tanques (`recepcion_tanques.condicion`, hoy 6 valores: `LISTO`, `SUCIO`, `EN_PREPARACION`,
`STANDBY`, `CIP`, `LIMPIO`):**
- **Fusionar `SUCIO` + `STANDBY` en un solo valor.** Es el mismo concepto (quedó un resto),
  difieren solo en si `volumen_l` es 0 o mayor a 0 — no hace falta que sean dos valores de
  enum distintos. Mismo patrón que ya funcionó al fusionar `VACIO` → `LIMPIO`
  (`20260946090000_eliminar_vacio_fusiona_con_limpio.sql`) — hay precedente real de que esto
  no rompe nada. Baja de 6 a 5 valores: `LISTO`, `EN_PREPARACION`, `LIMPIO`, `CON_RESTOS`
  (0 o más litros), `CIP`.

**Líneas (`lineas_estado.condicion`, hoy 5 valores: `DETENIDA`, `LISTA`, `CIP`,
`CAMBIO_PRESENTACION`, `SIN_PROGRAMACION`):**
- **Eliminar `LISTA` por completo.** Confirmado en `plan-rework-tanques-lineas-recepcion.md`
  §12: nadie la elige nunca, existe solo como destino interno de "Terminó CIP". Sin ningún
  caso de uso real, a diferencia de CIP (ver abajo). "Terminó CIP" pasa a limpiar la fila de
  `lineas_estado` (línea vuelve a estar disponible sin condición especial) en vez de dejarla
  en un estado intermedio que nadie mira.

**`CIP` (tanques y líneas) — no se elimina, se vuelve OBLIGATORIO, pero condicional, no
siempre.** Confirmado con el dueño: sí se hace la limpieza CIP de verdad en planta — lo que
falta es que el software la exija. Hoy el botón "Iniciar CIP"/"Terminó CIP" existe pero se
puede saltear yendo directo a Limpio (o a disponible, en líneas) sin pasar por ahí.

**En líneas, CIP no es por cada uso — es por ciclo de 36 horas, o después de una falla larga**
(confirmado con el dueño). El guard no puede ser "toda transición a disponible viene de CIP" —
sería más rígido de lo que la planta realmente necesita. En cambio: la línea guarda cuándo fue
su último CIP (`cip_finalizado_en`, ya existe en `lineas_estado`); si pasaron 36 h desde
entonces, o si viene de una `DETENIDA` cuya duración superó un umbral a definir (falla larga),
la línea **no puede volver a activarse sin pasar por CIP primero** — el guard se calcula, no es
un chequeo fijo de "vino de CIP sí o no".

**En tanques, falta confirmar si aplica la misma lógica de ciclo/condición o si ahí sí es por
cada uso** — no asumido, pendiente de confirmar con el dueño antes de escribir el guard.

Con esto el software pasa a reflejar el paso de limpieza que ya ocurre físicamente, en vez de
tener un hueco de cumplimiento — pero solo cuando corresponde, no como fricción constante.

### Revisión de nombres (se corrige al escribir los tipos nuevos, no aparte)

1. `rendimientoTurnoPct` guarda una MERMA, no un rendimiento → `mermaSemielaboradoTurnoPct`.
2. Un mismo número con 3 nombres (`consumo`, `litrosConsumidos`, `volumenInicial`) → se
   colapsa a `consumoLitros`.
3. `volumenL`/`volumenInicialL`/`volumenLInicio` (`PreparacionRegistro`) → renombrar por lo
   que significan: `volumenActualL`, `volumenPreparadoL`, `volumenAlIniciarTurnoL`.
4. `LineaEnTurno`/`turnoLineaId` nombran una corrida, no una línea fija (el propio comentario
   del código ya lo dice) → `Corrida`/`corridaId` en el módulo Producción nuevo. Es la
   renombrada de mayor impacto (toca Producción, Producto Terminado y Reportes) — confirmarla
   antes de escribir el módulo Producción, no a mitad de camino.

### Variables asociadas entre los 3 módulos (mapa de referencia)

| Asociación | Qué conecta |
| --- | --- |
| `numeroTanque` | Preparación ↔ lo que Producción lee para activar una corrida (costura 1) |
| `loteId` (Producción) → `id` (Preparación) | El vínculo real por UUID entre una corrida y su lote |
| `id` (Producción) → `turnoLineaId`/`corridaId` (Contador, PT) | El vínculo entre Producción y Producto Terminado (costura 2) |
| `lote` (texto) | Copiado en 3 tablas sin un solo dueño — raíz de por qué las guardas antiduplicados comparan por texto normalizado, no solo por id |
| `saborId`/`saborNombre` | Copiado en las 4 tablas |
| `volumenActualL`/`volumenPreparadoL`/`volumenAlIniciarTurnoL` (Preparación) + `litrosProducidos` (PT) | Alimentan merma de semielaborado (costura 3, en Reportes) |
| `envasesLlenadora`/`envasesBuenos` (Producción) + `paletas`/`cajasSueltas` (PT) | Alimentan merma de envases y la corroboración de PT-excede-volumen |
| `activa` (Producción) | El campo más peligroso — 7 puertas distintas lo tocaban antes del fix de la Fase 2 |

### Orden de ejecución

1. **Preparación** — tipos + `usePreparacion()` + RPCs angostadas. No se mide contra el Panel
   todavía (eso es Reportes, paso 4) — se verifica el flujo manual (iniciar → liberar →
   ajustar/transferir/guardar en pipa → cerrar) y que `EstadoPlantaTabs`/Recepción sigan andando.
2. **Producción** — tipos + `useProduccion()`; acá se conectan las costuras 1 y 2 contra
   Preparación ya migrada. Incluye partir Líneas en su propia página.
3. **Producto Terminado** — el más chico, sin dependencias de Preparación. Sin parciales
   (ver Contexto) — se simplifica bastante respecto al diseño de hoy.
4. **Reportes** — mover `panelProduccion.ts`/`calculosPruebas.ts` a `reportes/`. Acá sí corre
   `calculosPruebas.test.ts` contra el CSV para confirmar que las fórmulas movidas dan los
   mismos números (salvo lo que cambie por las simplificaciones aprobadas).
5. Migrar páginas una por una, partiendo `EstadoPlantaTabs.tsx` (1682 líneas) y
   `PanelProduccion.tsx` (1918 líneas) en componentes chicos en el mismo paso — no hay que
   volver a tocarlos después. Borrar `turno.tsx`/`TurnoProvider` recién cuando nada lo importe.
6. Después: Historial/Auditoría a leer de los 3 módulos nuevos en vez de su propia lectura
   cruzada; `estadisticas.ts`/`agruparProduccion.ts` a su propia carpeta (histórico/agregado,
   distinto del turno en vivo); `ActaTurno.tsx` a los mapeos nuevos por módulo.

**Verificación por paso, no todo junto:** pasos 1-3 verifican el flujo de esa página nada más
(no los % del Panel). Paso 4 es el único donde importan los valores del Panel —
`calculosPruebas.test.ts` contra el CSV. Paso 5: turno completo de punta a punta (Comenzar →
Recepción → Preparación → Activar corrida → Producto Terminado → Finalizar) para confirmar que
las 3 costuras siguen funcionando. **Al cerrar la Fase 1 completa: `grep` de voseo sobre todo
texto nuevo (Contexto, regla 1) + confirmar que los avisos largos nuevos (confirmación de
"Terminó Lote", de Transferir) quedaron como modal, no inline (Contexto, regla 2).**

---

## Fase 2 — Base de datos: cerrar caminos ad hoc

Migraciones nuevas y aditivas únicamente. Cada una se prueba con `supabase start` + `db reset`
local antes de `db push`.

### 2.1 — Auditoría de toda vía "Editar/Corregir/Ajustar/Reactivar"

| Pieza | Veredicto | Por qué |
| --- | --- | --- |
| `cambiar_condicion_tanque` + `TanqueEditForm` | **Eliminar — parcial hecho** | 5 responsabilidades mezcladas. **Ya extraída:** "Medir tanque" (relectura física) → RPC angosta `medir_tanque(numero_tanque, volumen_real)` en `20261021090000` — corrige `volumen_l`, deja el delta en `preparaciones_ajuste`, NO toca `volumen_inicial_l`. **Queda en `cambiar_condicion_tanque`:** el toggle de CIP (Iniciar/Terminó CIP) y el confirmar INICIO/FIN de un tanque heredado — narrowear eso (CIP angosto + `confirmar_estado_tanque`) es un paso posterior. Enfoque "lo más seguro y reversible" (dueño 2026-09-08): aditivo, sin tocar la función vieja todavía. |
| `reactivar_lote` | **Eliminada** (`20261021090000`) | En el modelo de dos estados de costura 2 no hay "deshacer" un cierre — se previene con el 2º confirm de Detener línea. Sin llamadores SQL; el único frontend era `turno.tsx` muerto. Botón "Reactivar Lote" retirado de `EstadoPlantaTabs`. |
| `reabrir_turno` | **Eliminar** | Confirmado: ya no se usa en la operación. Su propósito (cargar algo olvidado y regenerar el acta) lo cubre mejor VALIDAR sin reabrir el turno original |
| `corregir_producto_terminado_auditoria` | **Eliminar** | Código muerto — el wrapper existe pero ningún botón lo llama |
| `crear_turno_manual`/`editar_fila_turno_manual` | (ya resuelto) | Retiradas en `20261000`, mismo patrón que las de arriba |
| `descartar_resto_tanque` | **Eliminada** (`20261021090000`) | En la operación real nunca se descarta nada — todo resto se transfiere o se guarda en pipa (Desvasar). Botón "Descartar" + su panel retirados de `EstadoPlantaTabs`. |
| `envasar_tanque` (a pipas — ver nota de vocabulario) | Mantener, una corrección | Puede dejar una corrida activa huérfana — se suma a la consolidación de cierre de la Fase 1 costura 2 |
| `transferir_tanque` | Mantener, con un bug corregido | Modo LIMPIO deja la fila del origen abierta para siempre (`cerrado_en` nunca se setea) — se corrige parejo en las 3 ramas |
| `confirmar_estado_tanque`, `cambiar_condicion_linea`, `ajustar_preparacion`, `editar_produccion_validada` | Mantener | Ya son acciones angostas con su propia guarda; revisadas a fondo sin hallazgos nuevos |
| `confirmar_produccion` | Mantener, aclarar intención | Si Daniela edita y después confirma la misma fila, hoy borra sus overrides en silencio — confirmar si es lo querido |
| Catálogos (`editar_sabor`, `editar_personal`, etc.) | Mantener, fuera de foco | No tocan turnos en curso |

**CIP en tanques — sin guard duro (dueño, 2026-09-08).** A diferencia de líneas (ciclo de
36 h), en tanques el CIP es *por uso*, PERO no se puede forzar en `iniciar_preparacion`: en la
operación real a veces preparan encima de un tanque sucio, no siempre del mismo sabor. Un
guard "solo se prepara sobre LIMPIO" rompería ese flujo. Los botones Iniciar/Terminó CIP
quedan como están; el enforcement es una decisión futura que necesita más validación en planta.

**`continuar_siguiente_lote` — se mantiene, pero se endurece ("4x4"):** comparte el mismo bug
de fondo que `activar_linea` (desactiva la corrida vieja a mano, sin pasar por el chequeo de
cierre) — se corrige con la misma costura 2 de la Fase 1 (Producción exige el PT total del
tramo que cierra). Además tiene un problema de timing ya documentado (exige que el tanque
siguiente esté Listo en el instante exacto, si no el supervisor pierde lo tipeado y arranca de
cero) — se resuelve recordando la última velocidad/presentación usada por esa línea y
prellenando el formulario, sin aflojar el candado de seguridad real.

### 2.1-bis — Prevenir en vez de deshacer: confirmar dos veces las acciones bruscas

Regla general (dueño, 2026-09-08): **toda acción que hace un cambio brusco o que no se puede
deshacer se confirma dos veces** antes de ejecutarse — un paso inline "¿Seguro? Sí, X" para un
sí/no simple, o un **modal** cuando el texto explica una consecuencia u ofrece alternativas
(regla de redacción 2 del Contexto). Es la única segunda oportunidad de frenar antes de que el
error entre al sistema, porque después no hay "editar", solo repetir la acción.

Aplica en concreto a:
- **Activar Corrida** — mostrar tanque / sabor / lote / presentación / velocidad y pedir
  confirmar (es donde entra el error "activé el tanque equivocado").
- **Detener línea** (→ `ESPERANDO_PT`) y **Cargar PT** (cierra la corrida, no se deshace).
- **Transferir** y **Desvasar** (ya tienen el paso "¿Seguro?" hoy — se revisan).
- **Finalizar turno** cuando hay corridas abiertas.
- El viejo reemplazo de `reactivar_lote`: ya no hace falta un "Terminó Lote" con aviso —
  ese botón desaparece (§2.2). El lote lo cierra Preparación cuando el PT lo vacía; si
  Preparación cierra un lote con restos a mano, ahí va el modal "queda {volumen} L en el
  Tanque {N}, no se puede deshacer".

Cambio de frontend, salvo la columna `pausa_motivo` de §2.2.

### 2.2 — Modelo de dos estados de la corrida + página de Líneas

El detalle completo está en la **costura 2 de la Fase 1** (arriba, reescrita el 2026-09-08).
Resumen de lo que toca la base y el frontend acá:

**Base (migraciones):**
- Estado `ESPERANDO_PT` en la corrida: `Detener línea` lo pone, registrar el PT lo saca
  cerrando la corrida. Ninguna función de Producción escribe en `recepcion_tanques` /
  `preparaciones`.
- `revisarCierreDeLote(loteId)` del lado de Preparación (cierra el lote/tanque solo cuando
  `volumen_l ≈ 0` y ninguna corrida activa le apunta). Si el lote quedó con resto → tanque se
  deja **COMO ESTABA** (típicamente LISTO), ya no pasa a STANDBY como antes. Decidido así
  (fusión SUCIO+STANDBY de §2.1 viene igual). **Marcado para probar en planta**: que un tanque
  LISTO con resto no confunda ni rompa vistas del dashboard que filtren por STANDBY — hay un
  comentario `OJO -- PROBAR EN PLANTA` en la migración `20261018090000`.
- `finalizar_turno` gana el guard: rechaza si hay una corrida en `ESPERANDO_PT`. El flujo de
  Finalizar además **obliga**, por cada línea con corrida activa/en Parada: cargar el PT del
  tramo de ESE turno + elegir **Terminar** o **Entregar línea** (renombre de
  `entregar_corrida`). Nada se hereda en silencio.
- Guard de `activar_linea` reescrito: bloquea solo mientras haya una corrida sobre ese lote en
  `ESPERANDO_PT` (no "cualquier corrida cerrada este turno" como en `20261003`).
- `pausar_linea` gana `p_motivo` + columna `turno_lineas.pausa_motivo` — "Parada Operacional"
  siempre pide el motivo. (Migración chica, aditiva; se puede adelantar sola.)
- `continuar_siguiente_lote` y `terminar_sabor_linea` / `terminar_linea`: se consolidan en el
  modelo de dos estados. `terminar_sabor_linea` (cerraba el tanque) deja de existir como
  acción de línea — cerrar el tanque es de Preparación.

**Frontend — página de Líneas (`LineasEstadoPlanta.tsx`), se quita "Editar":**
la tarjeta de línea queda con estos botones y nada más:
- **Activar Corrida** (confirma dos veces, mostrando tanque/sabor/lote/presentación/velocidad).
- **Parada Operacional** (+ motivo obligatorio) → mientras está parada: **Continuar** o
  **Detener línea**.
- **Detener línea** → la corrida pasa a `ESPERANDO_PT`; luego se carga el PT desde Producto
  Terminado (o el borrador del robot, Fase 3).
- **Sin programación** / **Cambio de Presentación** (condición de línea; solo sin corrida
  activa).
- Se retiran: todos los "Editar" (de corrida y de estado), el `Select` de condición, el
  submenú viejo de Detener (Parada momentánea / Terminó sabor / Falla / Terminar línea).
- El botón de **CIP** (`Iniciar CIP` / `Terminó CIP`) se mantiene por ahora — su paso a
  "obligatorio por ciclo de 36 h / falla larga, guard calculado" queda para el trabajo de
  Estados de línea, no para este paso.

**Frontend — página de Producto Terminado (`ProductoTerminado.tsx`):**
- Se quita el botón **"Cerrar Lote"** (`BotonCerrarLote` → `terminar_sabor_linea`): en el
  modelo nuevo las corridas que aparecen ahí ya están en `ESPERANDO_PT` (por eso se listan),
  y ese botón queda en no-op. Cargar el PT ES lo que cierra la corrida.
- Para una corrida **ya detenida** (`ESPERANDO_PT`): cargar paletas/cajas → **Enviar** →
  se cierra. Sin elección de próximo estado (Detener línea ya la decidió).
- Para una corrida **todavía activa** (típico al cerrar turno): cargar paletas/cajas del
  tramo → elegir **Terminar** (se cierra) o **Entregar línea** (sigue el próximo turno). Es
  el `puedeElegirProximoEstado` que ya existe, sin el botón "Cerrar Lote" redundante.

**Casos de referencia (línea → tanque → PT), acordados el 2026-09-08:**

| Caso | Línea | Tanque / Lote | PT |
| --- | --- | --- | --- |
| Corre y el lote se vacía | activa → ESPERANDO_PT → cerrada al cargar PT | el PT baja `volumen_l` → ~0 → Preparación cierra el lote, tanque → Limpio/Con Restos | 1 registro ≈ litros del lote |
| Parada Operacional → Continuar | sigue activa (con motivo) → vuelve a correr | intacto | nada; solo la parada registrada (motivo+duración) |
| Parada Operacional → Detener línea | ESPERANDO_PT → cerrada | lote NO se cierra (le quedan litros) → Preparación: otra línea / transferir / desvasar | 1 registro parcial respecto al lote, completo respecto a la corrida |
| Lote no vacío, otra línea lo sigue | Corrida 1 cerrada, Corrida 2 se activa sobre el mismo lote | lote abierto entre las dos corridas; se cierra cuando la 2 lo vacía | 2 registros (uno por corrida) |
| Activada por error | Detener enseguida → ESPERANDO_PT → PT 0/0 → cerrada. NO bloquea re-activar (el bloqueo solo aplica en ESPERANDO_PT) | intacto, lote abierto | 0/0 obligatorio |
| Turno termina con corrida corriendo/pausada | Finalizar OBLIGA: PT del tramo + elegir Terminar o Entregar línea. Si Entrega → sigue fresca en el turno nuevo | se hereda; Recepción confirma | 1 PT por turno que cruza; final = último tramo |
| Sin programación / Cambio de Presentación | solo sin corrida activa (si hay → Detener línea + PT primero) | no toca nada | no toca nada |

### 2.3 — Guardrails abiertos de `plan-rework-auditoria.md` §7.5/§7.6

- **HECHO** — TOCTOU en el candado de número de lote (`iniciar_preparacion`):
  `pg_advisory_xact_lock(hashtextextended(area|sabor|nº lote))` antes del `exists`, en
  `20261020090000_iniciar_preparacion_advisory_lock.sql`. Dos preparaciones concurrentes del
  mismo lote se serializan; la 2a ve la fila de la 1a y corta.
- **HECHO** — `finalizar_lote` huérfano: confirmado que solo lo llama `src/lib/turno.tsx`
  (TurnoProvider muerto, se borra en Fase 4) y ninguna función SQL. Dropeada en la misma
  migración.
- **Hecho (2026-09-11)** — Duplicados más allá de "totales idénticos": `posibleDuplicado` en
  VALIDAR (`src/lib/validacion.ts`, `marcarPosiblesDuplicados`) — agrupa por línea+lote+
  presentación, marca las filas de un grupo con 2+ corridas con PT propio (cajas > 0), sin
  importar si los totales coinciden. Badge en `ValidarLista.tsx`. Cliente (no RPC): se calcula
  sobre lo que `listar_validacion_produccion` ya devuelve, sin migración nueva. Es la red de
  seguridad que reemplaza el bloqueo duro de `activar_linea` de `20261003` (ver Fase 1 costura
  2): repetir línea+lote se permite, pero queda marcado para revisión.
- **Pendiente** — Reutilización de número de lote tras cerrar: sigue pendiente de decisión del
  dueño entre las 3 opciones ya escritas en el documento original.

### 2.4 — Transferencias: motivo como enum

Tabla nueva `transferencias` (`turno_id, tanque_origen, tanque_destino, litros, modo, motivo,
usuario_id, creado_en`) con `motivo` enum `motivo_transferencia`: `CONSOLIDAR_RESTOS |
ENRUTAR_MANIFOLD` — el enrutamiento por manifold (mover el lote para no parar la línea,
confirmado en el Contexto) es uno de los dos motivos reales, no un caso aparte. Hecho en
`20261016090000_transferencias_log.sql` (`transferir_tanque` gana `p_motivo` y escribe una
fila; la UI de Transferir gana un selector de 2 opciones — "Consolidar restos" / "No parar la
línea").

**Solo transferencias tanque→tanque** (decisión 2026-09-08). El desvase a pipa ya queda
registrado en su propia tabla `desvases` (área, sabor, litros, lote_origen) — no se duplica en
`transferencias`, y por eso el enum no lleva `DESVASE_PIPA`. `LIBERAR_LOTE` también se
descartó: existió porque a veces "reemplazaban todo" — manejo de desastre, no una categoría
real. Todo resto de semielaborado va a otro tanque (`CONSOLIDAR_RESTOS` / `ENRUTAR_MANIFOLD`)
o a una pipa (Desvasar); descartarlo no existe en la operación.

**Hecho (2026-09-11):** la confirmación de Transferir pasó de panel inline a modal
(`src/components/ui/dialog.tsx`, nuevo — el proyecto ya traía el paquete unificado `radix-ui`
con `Dialog` incluido, no hizo falta instalar nada). Mismo contenido y misma lógica de los dos
pasos (medir origen → elegir destino/motivo/modo), ahora en `<Dialog>` en vez de expandir la
tarjeta del tanque.

**Nota de vocabulario — `envasar` ≠ `desvasar`:** "Envasar" en la planta es poner el jugo en
su empaque final (Producto Terminado). Lo que la función `envasar_tanque()` hacía es lo
contrario: sacar el resto de semielaborado de un tanque a una **pipa** para otro turno — eso es
**desvasar**. Decisión del dueño (revierte lo que decía antes esta nota): los identificadores
se renombran para que digan lo que hacen — `reservas_tobos` → `desvases`, `envasar_tanque` →
`desvasar_tanque`, `listar_reservas_tobos` → `listar_desvases`, `iniciar_preparacion.p_reserva_id`
→ `p_desvase_id` (migración `20261015090000_renombrar_desvase.sql` + su frontend). El texto de
cara al supervisor dice "Desvasar"/"Desvase"; "pipa" se mantiene como el nombre del contenedor.

**`descartar_resto_tanque` se elimina (ver 2.1) — no se le agrega enum de motivo, no hace
falta.** El guardrail #1 (`plan-rework-tanques-lineas-recepcion.md` §6) queda con dos opciones
reales cuando el supervisor no quiere trabajar encima de un resto: **Transferir** a otro tanque
o **guardar en pipa** (Desvase) — nunca "descartar", porque en la operación real no existe esa
salida.

### 2.5 — Línea: capturar el residuo no contado al cortar un lote

**Decisión 2026-09-09 — NO se implementa.** El dueño lo descartó por ahora:
- El número (cajas retenidas en el bowl/tuberías) todavía no se conoce, y pedir una estimación
  a ciegas mete ruido en vez de sacarlo.
- A partir de ahora los supervisores **van a parar la línea a contar** de verdad, así que el
  hueco entre `volumen_l` medido y el PT se va a achicar solo.
- La medición de tanque tras el PT (`20261026` + `ProductoTerminado.tsx`) ya deja el residuo
  visible como delta teórico↔real en `preparaciones_ajuste`; los guardrails de vista
  (`plan-rework-auditoria.md` §7.1–7.4) ya impiden mostrar un número imposible.
- Se retoma solo si, viendo el comportamiento real de los supervisores, aparece un hueco
  concreto. La "regla del residuo descartado" (§2.7) sigue esperando a planta.

~~Al terminar una corrida, preguntar explícitamente si se paró la línea a contar. Si no,
capturar una estimación (o la marca "sin contar, ~5% típico") en vez de que ese volumen
desaparezca sin rastro.~~

### 2.6 — Envases buenos como validación estándar de toda corrida

**Parcial hecho (2026-09-08):** el Contador 2 (envases buenos) **dejó de ser opcional** en el
formulario de Producto Terminado — es obligatorio junto con el contador de la llenadora, y no
puede superarlo (`ProductoTerminado.tsx`, validación de frontend). Con esto la corroboración
de "PT que excede el volumen preparado" (`realidadPreparacion.ts`) siempre tiene el dato.

**Hecho (2026-09-11):** guard equivalente del lado servidor en `registrar_contador` — antes solo
lo forzaba el frontend (migración `20261036090000_guard_envases_buenos_registrar_contador.sql`):
Contador 2 obligatorio, no negativo, no puede superar la llenadora. `Δenvases = |buenos −
PT_envases|` visible en la tarjeta de la corrida cerrada de `ProductoTerminado.tsx`. Salvedad de
siempre: ambos números los tipea el mismo supervisor — evidencia independiente real recién
cuando lo cargue el robot (Fase 3).

### 2.7 — Checkpoint pendiente, no se implementa todavía

La "regla del residuo descartado" (§43 del plan de merma original) sigue sin aprobar por el
equipo de planta — queda señalada, no se codifica hasta esa conversación.

### 2.8 — Candado de 1 hora: se mantiene sin cambios

Decisión explícita: no se agrega una vía alternativa para carga tardía de Producto Terminado.
Documentado para que ninguna sesión futura lo "arregle" interpretándolo como un bug.

### 2.9 — Producto Terminado: qué más se puede sacar (auditado a fondo)

**Estado (2026-09-08):**
- **HECHO — frontend sin entregas parciales.** `ProductoTerminado.tsx` ya no puede crear
  entregas parciales: se retiró el botón "Sumar paletas y continuar lote" + `entregarParcial()`
  + `contadorParcialRef`. Una corrida se carga con su total y listo. Las corridas que YA tenían
  parciales antes del deploy siguen renderizando en modo incremental para poder cerrarlas.
  Reversible, sin migración.
- **PENDIENTE — teardown de base (migración destructiva, su propio push, necesita `db reset`
  local).** Dropear la tabla `producto_terminado_parciales` y las columnas
  `producto_terminado.{tiene_parciales, producto_retenido, cajas_retenidas, editado_por,
  editado_en}` + `contadores.parcial`. Requiere **reescribir 6 funciones** que las referencian:
  `registrar_producto_terminado`, `registrar_contador`, `turno_json`,
  `listar_validacion_produccion`, `estadisticas_produccion`, `historial_dia_area` — varias de
  200+ líneas. No se hace a ciegas: va cuando haya Docker para probar la cadena.

Con "sin parciales" ya decidido (Contexto — el cambio más grande de los tres), quedan tres
hallazgos más, verificados contra el código real:

- **`productoRetenido`/`cajasRetenidas` — ya están muertos, formalizar la eliminación.**
  Confirmado en `plan-validar-produccion.md` §2: se ocultaron de la UI porque no afectan
  litros/merma/acta. Verificado hoy en `ProductoTerminado.tsx:546-589`: el frontend los manda
  siempre `false`/`null`, cableados. Las columnas de base siguen existiendo sin que nada las
  lea. Se sacan las columnas — no solo se ocultan, se eliminan del todo.
- **`editadoPorNombre`/`editadoEn` van a quedar muertos apenas se retire
  `corregir_producto_terminado_auditoria` (2.1).** Verificado por `grep`: las 4 versiones
  históricas de esa única función son las ÚNICAS que alguna vez escribieron `editado_por`/
  `editado_en` en `producto_terminado`. Al retirar esa función (ya decidido, es código muerto
  hoy) esos dos campos quedan permanentemente en `null` — se sacan junto con ella.
- **El mensaje del candado de 1 hora promete algo que hoy no existe.** Dice "Un administrador
  puede corregirlo, o se valida desde el módulo Validar" — pero la vía de administrador
  (`corregir_producto_terminado_auditoria`) es código muerto: ningún botón la llama, así que
  esa mitad de la frase ya es falsa hoy. Con "solo Recepción edita" (Contexto) esto deja de ser
  un hueco a tapar y pasa a ser el diseño correcto: **no hay corrección de PT a mitad de turno,
  ni de supervisor ni de administrador — se espera a que el turno cierre y se corrige desde
  VALIDAR.** Se corrige el texto del mensaje para que diga eso, sin ofrecer un camino de admin
  que no debería existir.

### 2.10 — Turno 3 después de medianoche: la fecha queda del día equivocado

Bug real (Javier, noche del 2026-09-07→08): activó el Turno 3 pasada la medianoche y el
sistema lo registró como Turno 3 del **día siguiente**. `iniciar_turno` recibe `p_fecha` del
frontend como `fechaLocal(new Date())` — la fecha de calendario de ese instante, sin selector
y sin ninguna lógica de turno nocturno (`src/lib/sesionTurno.tsx`). El `codigo`
(`A20260908_T3G…`) se deriva de esa misma fecha, así que también sale mal. Todo lo demás
(`preparaciones`, `turno_lineas`, `producto_terminado`, `auditoria`) cuelga de `turno_id`, así
que solo `turnos.fecha` y `turnos.codigo` quedan mal — pero el Panel y las estadísticas
filtran por `turnos.fecha`, así que el turno "desaparece" del día correcto.

**Arreglo — HECHO en `20261019090000_turno_nocturno_fecha_operativa.sql`** (regla en el
servidor, sin cambio de UI). Data-driven, sin umbral fijo: usa las horas nominales del propio
`turno_tipo` (`turno_tipos` ya tiene `hora_inicio` / `hora_fin` — T3 = 22:30 → 07:00). Si el
turno_tipo **cruza medianoche** (`hora_fin < hora_inicio`) y se activa **antes de `hora_fin`**
nominal (la cola de la madrugada), la fecha operativa y el `codigo` usan `p_fecha - 1`.
`hora_inicio` se guarda tal cual (el reloj real). Si cambian el horario de T3, la regla lo
sigue. T1/T2 no cruzan medianoche → nunca se ajusta.
`scripts/test-turno-nocturno-fecha.sql`.

**Corrección puntual del turno de Javier** (una vez, aparte de la migración):
`scripts/fix-turno-fecha-anterior.sql` — `update turnos set fecha = fecha - 1, codigo = …`
por `id`. No hay colisión de `unique` (la restricción de `codigo` se quitó en `20260932`); el
trigger `fn_turnos_auditar` deja rastro en `turnos_historial`. Antes de correrlo, confirmar
que no exista ya un Turno 3 real de la fecha correcta para ese grupo/área.

**Verificación de la Fase 2:** cada migración en cadena sobre `supabase db reset` local; un
script `test-*.sql` por guardrail nuevo; `npm test` + `npm run build` en el frontend. **Al
cerrar: mismo chequeo de voseo + modal-para-texto-largo que la Fase 1** (Contexto) sobre los
mensajes nuevos de 2.1-bis, 2.3-bis, 2.5 y 2.9.

---

## Fase 3 — Rol Robot [FASE EN CONSIDERACIÓN — NO ejecutar]

> **Estado (2026-09-09):** el dueño la puso EN CONSIDERACIÓN. No se toca
> nada de esta fase — ni migraciones, ni rol `ROBOT_PALETIZADOR`, ni
> tabla de borrador, ni `reportar_conteo_robot`, ni el prellenado del
> cierre — hasta que el dueño diga explícitamente de retomarla. El texto
> de abajo queda como diseño de referencia, no como trabajo pendiente.

El motivo real de todo este orden: una vez que PT es "un solo total al cierre, confirmar en
vez de editar" (Contexto), el robot paletizador deja de necesitar ningún permiso de edición —
encaja directo en el mismo patrón que ya usamos para todo lo demás, no hace falta inventar uno
nuevo.

**Modelo:**
- El robot **no escribe el PT final.** Escribe un conteo en vivo (`paletas`, `cajas_sueltas`)
  a una tabla/columna de **borrador** — separada de `producto_terminado`, ligada a la corrida
  (`turno_linea_id`) — cada vez que paletiza algo nuevo. Puede escribir tantas veces como
  quiera; no es "editar", es reportar un dato que se sigue actualizando solo, y nunca lo lee
  como fuente de verdad nadie más que el checkpoint de cierre.
- En el checkpoint que YA cierra el tramo (Fase 1, costura 2 — el mismo que ahora exige el PT
  total obligatorio), el supervisor ve el número que dejó el robot **prellenado** y lo
  **confirma** — mismo patrón "confirmar, no editar" del resto del plan, no una excepción. Si
  el número está mal, lo corrige ahí mismo, en el único paso donde de verdad se compromete el
  PT — nunca antes.

**Lo que hace falta, acotado:**
- Rol nuevo en el catálogo de roles (junto a `SUPERVISOR`/`ADMINISTRADOR_AREA`/
  `SUPERADMINISTRADOR`) — p. ej. `ROBOT_PALETIZADOR`. `crear_usuario` ya acepta cualquier
  `rol_codigo` existente, no necesita cambios.
- Una función angosta nueva, `reportar_conteo_robot(usuario, turno_linea_id, paletas,
  cajas_sueltas)` — solo puede escribir el borrador de una corrida activa, nada más. No puede
  cerrar nada, no puede tocar tanques, líneas, ni el PT final. El área/línea a la que el robot
  tiene acceso se resuelve igual que cualquier otro rol (`rol_y_area_de`).
- El formulario de cierre (Producto Terminado / la costura 2 de Fase 1) lee el borrador del
  robot como valor inicial en vez de arrancar vacío — hoy el supervisor tipea de cero, con esto
  solo confirma.

No hace falta nada del rediseño de sesión/token (riesgo de seguridad de arriba) para esto en
particular — el robot es un rol más, con el mismo nivel de confianza que cualquier otro usuario
del sistema hoy; el hueco de fondo es el mismo para todos y queda igual de aceptado que antes.

**Verificación de la Fase 3:** crear un usuario de prueba con rol `ROBOT_PALETIZADOR` y
confirmar que `reportar_conteo_robot` funciona sobre una corrida activa pero rechaza tocar
cualquier otra tabla/acción; confirmar que el checkpoint de cierre (Fase 1, costura 2)
prellena el valor del robot en vez de arrancar vacío. Mismo chequeo de voseo + modal-para-
texto-largo que las fases anteriores sobre cualquier mensaje nuevo de esta fase.

---

## Fase 4 — Agrupar el resto del código por asociación (auditoría, catálogos, historial)

Mismo criterio que las Fases 1-3, aplicado al resto de `src/lib/`/`src/components/`/
`src/pages/apps/` que no es ninguno de los 3 módulos de dominio ni Reportes. Hoy son ~35
archivos sueltos en `src/lib/` sin ninguna carpeta — se agrupan por tema, no por tipo de
archivo. Inventario real (no una lista aspiracional — grounded en lo que hay hoy):

| Carpeta nueva | Qué se mueve adentro | Nota |
| --- | --- | --- |
| `src/lib/auditoria/` | `auditoria.ts`, `auditoriaVista.ts` (+`.test.ts`), `auditoriaDemoFixture.ts`, `historial.ts`, `historialDia.ts`, `historialTurnos.ts` + `AuditoriaTurnos.tsx` (+`.test.tsx`), `RegistroCambios.tsx`, `HistorialDiaSupervisor.tsx` (componentes) | Ya venía marcado como "paso 6" en la Fase 1 — acá se hace completo, no solo "leer de los 3 módulos nuevos" |
| `src/lib/validar/` | `validacion.ts`, `validacionDemoFixture.ts` + `ValidarLista.tsx` | Módulo VALIDAR completo |
| `src/lib/catalogos/` | `sabores.ts`, `coloresSabor.ts` (+`.test.ts`), `presentaciones.ts`, `velocidades.ts`, `lineas.ts`, `catalogos.ts`, `catalogosLive.tsx` | ⚠️ **Colisión de nombre a resolver**: `lineas.ts` acá es el catálogo de líneas físicas (nombre, activa/inactiva) — completamente distinto de `produccion/` que ya usa "línea" para la corrida. Renombrar `lineas.ts` → `catalogoLineas.ts` (o similar) al mover, para que dejen de sonar a lo mismo |
| `src/lib/personal/` | `personal.ts` + `PersonalPanel.tsx` | |
| `src/lib/programacion/` | `programacion.ts` | Chico hoy, crece si se conecta más con Producción a futuro |
| `src/lib/reportes/` | (ya definido en Fase 1) suma `estadisticas.ts`, `agruparProduccion.ts` — histórico/agregado, carpeta separada de `reportes/` (turno en vivo) según ya dice la Fase 1 | |
| `src/lib/turnoCiclo/` (o el nombre que se prefiera) | `turno.tsx` (lo que quede tras vaciarse en las Fases 1-3), `actaPdf.ts` | El acta de cierre no es de ningún módulo de dominio — es del turno como unidad completa |

**Se quedan donde están, sin mover** (ya son transversales/infraestructura, no un "tema" propio):
`auth.tsx`, `credenciales.ts`, `supabase.ts`, `utils.ts`, `apps.tsx`, `dataset.ts`,
`ProtectedRoute.tsx`, y los componentes de UI genérica (`AppShell`, `AppHeader`, `EmptyState`,
`Logo`, etc.).

**Nota de vocabulario:** el renombre `desvase` ya se hizo en la Fase 2
(`20261015090000_renombrar_desvase.sql`): `reservasTobos.ts` → `desvases.ts`, base incluida
(`reservas_tobos` → `desvases`, `envasar_tanque` → `desvasar_tanque`). Ver la nota de la
sección 2.4. `turno.tsx` quedó con los nombres viejos a propósito — se borra entero en esta
fase, no vale la pena tocarlo antes.

Esta fase se hace **después** de que las Fases 1-3 vacíen `turno.tsx` — mover Auditoría/Historial
antes tendría que seguir leyendo del `TurnoProvider` viejo en vez de los 3 módulos nuevos, doble
trabajo.

---

## Archivos críticos

- `src/lib/turno.tsx` (1331) → se reparte entre los 3 módulos nuevos (Fase 1), desaparece al final
- `src/components/EstadoPlantaTabs.tsx` (1682) → se parte al migrar a `usePreparacion()`/`useProduccion()`; Líneas sale como página propia
- `src/pages/apps/PanelProduccion.tsx` (1918) → pasa a leer `reportes.ts`, se parte en componentes chicos
- `src/lib/panelProduccion.ts`, `src/lib/calculosPruebas.ts` → se mueven a `src/lib/reportes/`
- `supabase/ESQUEMA.md`, `MAPA.md` → actualizar al cierre de cada fase
