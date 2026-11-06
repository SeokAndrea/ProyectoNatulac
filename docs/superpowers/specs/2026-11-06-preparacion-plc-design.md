# Preparación con datos del PLC: kits y ajustes de agua

Estado: borrador del 2026-11-06, pendiente de aprobación de Alexander y Andrea.
Rama: `rework/preparacion-PLC`.
Bocetos: lienzo «Preparación con PLC» (https://claude.ai/artifact/MUkJnuaY1TGsuZhowFzZFj).

## Para qué

Hoy el operador escribe en la HMI del PLC el agua y los kits de cada preparación, y el supervisor
vuelve a escribir los kits en la app. Se quiere que **lo que el operador ya cargó en el PLC no se
escriba de nuevo**, y que la tarjeta de Preparación muestre en vivo el proceso.

## Cómo trabaja el PLC

1. El operador **elige el tanque, pone los litros de agua de la fórmula y da Iniciar**. El PLC
   pone `PREPARACION = verdadero`.
2. **Fase 1 · Dosificar agua.** Entra agua al tanque seleccionado. Al llegar al **80 %** de los
   litros que puso el operador, la válvula cierra.
3. **Fase 2 · Pasar pulpa.** Se pasa la pulpa de los tambores con el **20 %** de agua que faltaba.
   El operador pone **cuántos kits** usó (se aceptan medios kits).
4. Con el 100 % del agua adentro, se espera a **Calidad**. Si todo está bien, se finaliza la
   preparación y el tanque se libera. Si no, se pasa a la fase 3.
5. **Fase 3 · Ajuste de agua.** El operador pone los litros que indica Calidad. **Puede haber
   varios ajustes**, porque Calidad va analizando después de cada uno.

## Qué carga cada quien

| Dato | Quién | Dónde | ¿Lo lee la app? |
|---|---|---|---|
| Litros de agua de la fórmula | Operador, al iniciar | HMI | Solo para mostrar el llenado; no entra al volumen (ya va dentro de `sabores.volumen`) |
| Kits | Operador, en la fase 2 | HMI | Sí, se guardan |
| Ajustes de agua | Operador, en la fase 3 | HMI, tag aparte | Sí, se guardan y se suman |
| Sabor y lote | Supervisor, al terminar la fase 2 | App | — |
| Resto del tanque y desvase | Supervisor | App (como hoy) | — |

## Cálculo del volumen del lote

```
volumen del lote = kits × sabores.volumen  +  resto del tanque  +  desvase  +  suma de los ajustes de agua
```

- **Kits** del PLC se guardan directo en `preparaciones.tambores`. Esa columna ya guarda la unidad
  de preparación de cada sabor (kit en Selecto, Mango y 35 %; tambor en el resto, donde 1 kit =
  1 tambor), y `sabores.volumen` ya está en litros por esa unidad. No hay conversión ni columna
  nueva, y el historial, el panel, Finalizar Turno y Validar jornada no cambian.
- **Agua de la fórmula** (fases 1 y 2) no se suma: ya está incluida en `sabores.volumen`.
- **Ajustes de agua** (fase 3) sí se suman, 1:1 en litros, cada uno por separado. Es lo único
  que se agrega al cálculo actual.
- El tope de 20.000 L por tanque se mantiene.

## Flujo en la app

1. **Iniciar en la HMI** → la app abre la carga del tanque. La tarjeta pasa a «Preparación en
   curso · PLC» y muestra los litros de agua de la fórmula.
2. **Fase 1** → la tarjeta muestra el agua entrando en vivo, con la marca del 80 %.
3. **Fase 2** → la tarjeta muestra la mezcla (sin color de sabor todavía) y, cuando el operador
   los pone, los kits.
4. **Al terminar la fase 2** → «Falta sabor y lote». El supervisor elige sabor y lote; el agua y
   los kits ya vienen. El volumen se calcula solo. El lote queda En Preparación.
5. **Calidad analiza** sobre ese lote, como hoy.
6. **Fase 3** → cada ajuste de agua entra en vivo y se suma al lote como una línea propia, con
   hora y origen PLC.
7. **Liberar** funciona como hoy (Calidad o supervisor, según el área). Desde ahí el PLC ya no
   suma agua al lote.

## Qué muestra la tarjeta

- **No muestra las fases del PLC.** El operador las ve en la HMI; la tarjeta muestra lo que pasa
  en el tanque (agua entrando, kits, ajustes), sin nombrarlas.
- **El llenado en vivo**: `TanqueVisual` ya tiene la animación (parámetro `llenado`: litros,
  setpoint y caudal). Se le pasa desde `TanqueCard` cuando el PLC reporta que **ese** tanque es el
  seleccionado y está llenando. Al lado: litros, setpoint, caudal y barra de avance con la marca
  del 80 %.
- **Los ajustes**: cada uno es una línea del desglose del volumen («Ajuste 1 · PLC · 14:41 ·
  +100 L»), y el ajuste en curso se ve entrando encima del líquido del sabor.
- **Carga lista sin lote**: aviso «Cargado en el PLC: 4.800 L de agua · 2 kits», con sabor y lote
  por elegir. El formulario no pide kits.
- **Corregir kits**: el supervisor puede cambiarlos; queda anotado que difieren del PLC.
- **Sin PLC**: si no hay datos del PLC, sale el formulario manual con kits, sabor y lote, para no
  frenar la planta.
- Lo en vivo (litros, caudal, fase) sale del bridge por WebSocket y **no se guarda**. Si el bridge
  no responde, la tarjeta se ve como hoy. Solo en el área Aséptico, que es la que tiene PLC.
- La conexión al bridge que hoy vive dentro de `PreparacionPLC.tsx` se mueve a un hook
  compartido, para que la use también la tarjeta.

## Lo que no cambia

El ciclo de estados del tanque, Liberar, Medir, Transferir, Desvase, Modo Vacío, las corridas y
el Producto Terminado.

## Carga del PLC en la base

Se guarda solo lo que queda precargado: kits y ajustes.

Tabla `plc_cargas_tanque`, una fila por preparación hecha en la HMI:

| Columna | Qué guarda |
|---|---|
| `numero_tanque` | 1, 2 o 3 |
| `kits` | admite medios kits; vacío hasta la fase 2 |
| `iniciada_en`, `terminada_en` | cuándo `PREPARACION` subió y bajó |
| `estado` | EN_CURSO → PENDIENTE → CONFIRMADA (o DESCARTADA) |
| `preparacion_id` | el lote al que se unió; vacío mientras espera |

Tabla `plc_cargas_ajustes`, una fila por ajuste de la fase 3: `carga_id`, `litros`, `hecho_en`.
Al unirse la carga a un lote sin liberar, cada ajuste se suma al volumen del lote (como el botón
Ajustar de hoy, con origen PLC). Si un ajuste llega antes de que exista el lote, espera en la carga
y se suma al confirmarla.

- El bridge escribe llamando a una función de la base (`registrar_carga_plc`); las tablas no
  tienen acceso directo, como en el resto del proyecto. El bridge solo reporta lo que ve y la
  función decide.
- **Autenticación:** un usuario de servicio dedicado (`plc-bridge`) con un solo permiso nuevo
  (`PLC_CARGAR`). El bridge inicia sesión con él y manda la credencial en cada llamada, por el
  mismo camino que la app. Reutiliza el portero de peticiones (`revisar_peticion`) y deja la
  auditoría con un nombre propio. La clave va por variable de entorno, no en `bridge.conf`.
- DESCARTADA existe para una carga mal hecha o de prueba, que si no bloquearía la cola.

## Decisiones tomadas

- **La carga del PLC se guarda en la base.** El supervisor va después del operador y el PLC puede
  borrar los datos antes de que confirme.
- **Hay cola por tanque.** Si el supervisor olvida hacer el CIP, el tanque conserva su resto y el
  operador puede preparar encima; quedan varias cargas esperando. Se confirman de la más antigua a
  la más nueva. El resto del tanque se suma al lote nuevo como hoy.
- **Varios ajustes por lote**, cada uno guardado aparte con su hora.
- **Dos preparaciones seguidas del mismo sabor** sin consumo entre ellas: nunca ha pasado, se deja
  como hoy (la segunda suma el resto de la primera). No hay «Juntar en un solo lote».
- **Tanque en CIP** al confirmar una carga: el CIP se da por terminado.
- **«Libera primero»** y **aviso de capacidad sin bloqueo**: aprobados (ver «Resto del tanque,
  desvase y cola»).

## Lo que ya se sabe del PLC

DB5 `DB_MONITOREO` (CPU 1212C), versión que pasó Automatización:

| Tag | Tipo y dirección | Uso |
|---|---|---|
| `PLC_SetPoint_Litros` | DInt `DB5,DINT0` | **Total de agua** que escribe el operador (no el 80 %) |
| `PLC_Actuales_Litros`, `PLC_Totales_Litros`, `PLC_ID_Tanque`, válvulas, auxiliares, `PLC_Caudal_LPM` | ya en `bridge.conf` | Llenado en vivo (sin cambios) |
| `PLC_Ajuste_Agua` | Int `DB5,INT18` | Ajuste de Calidad. **Vuelve a cero** al terminar cada ajuste |
| `PLc_Nro_Kits` | Real `DB5,REAL20` | Kits (admite medios). **Vuelve a cero al terminar la preparación** |

- `PLC_ID_Tanque`: 0 = ninguno, 1, 2 o 3. Los tags de kits y ajuste son **del tanque
  seleccionado**, no uno por tanque.
- **`PREPARACION`** (booleano): sube al empezar la preparación y baja al terminar.
- **Un booleano por fase** (1, 2 y 3): sube al **comenzar** la fase y baja al **completarla**.
  La app los usa por dentro, no los muestra.
- Direcciones de los booleanos (ya agregados al DB5): `Estatus_Preparacion` `DB5,X24.0`,
  `Fase_1` `DB5,X24.1`, `Fase_2` `DB5,X24.2`, `Fase_3` `DB5,X24.3`. Los kits se llaman
  `PLC_Nro_Kits` (`DB5,REAL20`).

### Cómo los usa el bridge

- Como kits y ajuste **vuelven a cero**, el bridge no espera al final: anota el valor **mientras
  aparece** y lo guarda en la base apenas es distinto de cero.
- **Kits:** se anotan durante la fase 2; son definitivos cuando baja el booleano de la fase 2.
- **Ajuste:** se anota al subir de cero, se actualiza mientras cambia, y se cierra con su hora
  cuando vuelve a cero. Cada cierre es un ajuste.
- **`PREPARACION`** delimita la carga: al subir se abre y al bajar pasa a PENDIENTE. Sin ella no
  se pueden separar dos preparaciones seguidas, porque kits y ajuste son un solo valor.
- Riesgo asumido: si el bridge está apagado justo en el momento en que un valor vuelve a cero,
  ese dato se pierde.

## Resto del tanque, desvase y cola

El PLC sabe lo que **entró** (agua, kits, ajustes), no lo que **ya había** en el tanque. Y si el
supervisor confirma tarde, el estado del tanque en la app puede estar atrasado. Por eso, al
confirmar una carga sobre un tanque que la app ve con resto, la tarjeta pregunta:

> En el tanque había **1.200 L de Pera** (lote 0448).
> **[Se sumaron a esta preparación]** (por defecto) · Se sacaron antes: **[Transferir]** **[Desvase]**

Si se sacaron antes, el supervisor hace la transferencia o el desvase primero (las acciones de
hoy) y después confirma la carga. No hay «Descartar»: se retiró porque en planta todo resto se
transfiere o se desvasa.

| Lo que la app ve en el tanque | Al confirmar la carga |
|---|---|
| Limpio / Con Restos 0 L | Nada que preguntar |
| Con restos, mismo sabor | Se suman por defecto (caso normal: no se hizo CIP a propósito) |
| Con restos, otro sabor | Se suman, pero pide confirmar la mezcla (como hoy) |
| Con restos que se sacaron antes | Transferir o Desvase primero; después confirmar |
| + Desvase guardado del mismo sabor | Se elige en el formulario y sus litros se suman (como hoy); combina con cualquier fila |
| Liberado con una línea corriendo | Se suma lo que queda; la línea continúa con el lote nuevo al liberarlo (como hoy) |
| Liberado con una línea parada sin PT | **Bloquea** hasta cargar el PT (como hoy) |
| En Preparación sin liberar (lote anterior de la cola) | **Bloquea: «Libera primero el lote …»** (nuevo) |
| Figura en CIP (se olvidó «Terminó CIP») | Confirmar la carga **da el CIP por terminado** |
| Tanque de Vacío | Bloquea: entregar o pasar a Aséptico primero (como hoy) |
| Modo Vacío encendido | La carga se confirma como «Preparar para Vacío» (nace lista, fuera de la merma) |
| Resto + kits + desvase pasan de 20.000 L | **Avisa sin bloquear** (el líquido ya está en el tanque; la base acepta hasta 30.000 L) |

**Cola:** las cargas se confirman de la más antigua a la más nueva, y cada una ve como resto lo que
dejó la anterior. El bloqueo «Libera primero» arregla un hueco de la base de hoy:
`iniciar_preparacion` no cierra un lote En Preparación, así que confirmar encima lo dejaría
abierto y huérfano. Como el PLC ya finalizó esa carga, en planta el lote ya está liberado.

## Cuando el supervisor entra después

Hoy el toggle de Calidad está **apagado**: Calidad le avisa en persona al supervisor y él libera
en la app. Que el operador **finalice** en el PLC equivale a que el tanque ya fue liberado. A veces
el supervisor entra a la app cuando todo terminó, con o sin ajustes. Propuesta:

- **`PREPARACION` verdadero** (sigue en curso): igual que el flujo normal. Elige sabor y lote, el
  lote queda En Preparación, los ajustes se suman en vivo y él libera cuando Calidad le avisa.
- **`PREPARACION` falso** (ya finalizó): la tarjeta muestra todo cerrado: kits, la lista de
  ajustes con hora y la hora en que terminó el operador. El supervisor elige sabor y lote y toca
  **«Registrar y liberar»**: el lote nace con todos los ajustes ya sumados y liberado. Con o sin
  ajustes es el mismo botón.
- La liberación sigue siendo del supervisor y queda a su nombre; no se libera sola.
- La hora en que terminó el operador se guarda como dato de referencia.

## Preguntas abiertas

1. (Resuelta: Automatización ya agregó `Estatus_Preparacion` y las tres fases al DB5.)
2. (Resuelta: si el supervisor registra el lote en un turno posterior, el lote cae en **su**
   turno y queda liberado a la hora en que registra, como funciona hoy. La hora real en que
   terminó el operador en el PLC se guarda solo como referencia.)
3. (Resuelta: la liberación queda **manual**, a nombre del supervisor.)
4. **Caducidad de la sesión** del usuario de servicio, para definir cómo reintenta el bridge
   (lo verifico yo al implementar).
