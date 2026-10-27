# Pendiente de paradas — 2026-10-27 (rama `paradas-final`)

Traspaso para la próxima sesión. Todo lo de abajo está **sin commit** y la
migración **no está aplicada en ninguna base** (ni Pruebas ni producción).

## 1. Hecho en esta sesión (sin commit)

### Parada abierta en una línea sin corrida
Motivo: la Línea 3 estaba programada pero no podía arrancar (casi una
semana) y Parar exigía una corrida en marcha. La dueña aclaró que **cuenta
desde hoy**: no hace falta cargar días atrás.

- Migración `supabase/migrations/20261112890000_parada_en_linea_libre.sql`:
  - `paradas.sin_corrida` (boolean).
  - `abrir_parada_mantenimiento()` gana `p_responsable` (por defecto
    MANTENIMIENTO, como antes). El supervisor la abre como OPERACIONAL.
    Tope: no puede empezar hace más de 30 días. Sin corrida, rechaza si ya
    hay otra parada de la línea en ese horario (evita contar dos veces,
    p. ej. con una LNPE «Sin programación»).
  - Trigger `cerrar_paradas_sin_corrida_al_arrancar` (after insert en
    `turno_lineas`): al arrancar la línea cierra sola la parada OPERACIONAL
    abierta sin corrida, con fin = hora de arranque. La de Mantenimiento no
    (la termina Mantenimiento). Solo las que empezaron antes del arranque,
    para no tocar nada con las corridas heredadas de `abrir_turno`.
  - `anotar_parada()` (copia de 20261112150000): el chequeo de solapes
    también cuenta la parada abierta sin corrida («Sin programación» y
    «Turno completo» ya no se le montan encima).
- Front:
  - `ModoParadas.tsx`: el supervisor tiene **Parar** con la línea sin
    corrida (usa `abrirParadaMantenimiento` con responsable). «Terminar
    parada» sale para las de Mantenimiento y para cualquier abierta que no
    detiene una corrida (línea sin corrida, o abierta antes del arranque).
    Muestra el comienzo verdadero (`inicioReal`) con día si no es de hoy.
  - `FormParadaLinea.tsx`: prop `sinCorrida` (solo cambia el texto). Empieza
    ahora; «Empezó antes» sigue disponible.
  - `LineaCard.tsx`: en Status / Líneas, una línea libre muestra **Parar**,
    que lleva al Modo Paradas.
  - `paradas.ts`: `abrirParadaMantenimiento` manda `p_responsable` solo si
    viene (sigue sirviendo contra una base sin la migración, salvo para el
    supervisor).
  - `paradasEnVivo.ts` y `validarJornada.ts`: buscan abiertas 30 días atrás
    (antes 7), igual que el tope.

### «Anotar» ya no choca con una parada anterior
Síntoma (dueña): el supervisor pone los minutos, Guardar, y no lo deja si ya
había una antes. Causa: Anotar guardaba la parada «terminó ahora» y
`anotar_parada` rechaza solapes («Ya hay una parada con horas en esa línea
en ese horario»). Una de Mantenimiento abierta también bloqueaba todo.
Arreglo: en el Modo Paradas, Anotar ubica los minutos en tramos libres del
turno (como Cubrir): prop `ubicar` en `PanelParadasLinea.tsx`.

### Pruebas
`npx tsc --noEmit` limpio; `vitest` completo pasó (641) antes de los últimos
cambios; después, `src/components/lineas` (85) y `src/components` (222).
Tests nuevos en `ModoParadas.test.tsx` (abrir sin corrida, terminar la
Operacional, Anotar sin chocar).

## 2. Falta antes de unir a main
- **Probar la migración en Pruebas (Supabase)**, no en este laptop: aquí
  `.env.local` apunta a **producción** (192.168.10.143, db_control_nectares).
  En la PC de casa o de trabajo: `npx supabase db push` + `npm run dev`.
  Revisar: abrir parada en línea libre, que se cierre sola al arrancar,
  Terminar parada, Anotar con otra parada ya cargada, «Sin programación»
  rechazado con una abierta.
- La dueña quiere **ver cómo lo ve Mantenimiento**: hace falta una cuenta de
  Mantenimiento en Pruebas.
- Commit solo de estos archivos: hay otros cambios sin commit en la rama
  que no son de esta sesión.

## 3. No resuelto (se avisó a la dueña)
- El panel «Paradas» de la tarjeta de Líneas (fuera del Modo Paradas) sigue
  con «terminó ahora»: no tiene la ventana del turno.
- `completar_parada` no revisa solapes (de antes). Los totales de Finalizar
  Turno / acta suman cada parada aparte.
- Validar jornada guarda una validación por parada con un solo valor de
  minutos: no se verificó con una parada de varios días.

## 4. Pedidos nuevos, esperando decisiones de la dueña

### Tiempo de reparación (distinto del tiempo de parada)
Acordado: **opcional**, en minutos, en Terminar parada, solo lo ve
Mantenimiento. Mostrar en Reportes de paradas y en la vista de Mantenimiento.
La dueña preguntó si sería «como un acta para Mantenimiento»: no lo sabe;
queda como idea aparte. No hay ningún campo de reparación hoy (solo el SIF
guarda `inicio_reparacion` y `cierre`).

### Frecuencia de las Solicitudes de Inspección / Intervención
Cómo funciona hoy (`fn_paradas_sif`, 20261111690000; `tipo_cuenta_para_sif`,
20261109390000): trigger en `paradas` (insert / cambio de tipo, línea o
inicio). Cuenta fallas **No Programadas** de la misma línea y el mismo
**código de Producción** (`tipo_id`) en la jornada 7:00→7:00. 3.ª → Inspección
(correo), 4.ª → la misma sube a Intervención. Volvió tras revisarla →
Intervención. Volvió el día que se cerró una Intervención → otra directa.
**3, 4 y la jornada están fijos en el código.**

La dueña quiere que la frecuencia se pueda modificar y que entren los
**códigos de subsistema** de Mantenimiento. Propuesta (sin confirmar):
mantener el conteo por código de Producción (atrapa todo) y **sumar** un
conteo por subsistema para las que Mantenimiento clasificó, con frecuencia
configurable por subsistema en el editor de Códigos de Mantenimiento.
Las «Sin subsistema» no cuentan por subsistema.

Ojo: el subsistema se pone al **terminar** la parada (después del insert),
así que el trigger tendría que correr también al cambiar `subsistema_codigo`.
«Sin subsistema» casi siempre = no lo hizo Mantenimiento, pero Mantenimiento
también puede elegirlo a propósito.

Preguntas abiertas:
1. ¿Se edita solo la cantidad (3 / 4) o también la ventana (día / semana)?
2. ¿Un solo ajuste para la planta o uno por código de subsistema?
3. ¿Por subsistema en lugar del código de Producción, o además?
4. ¿Quién lo edita: solo la dueña o también el jefe de Mantenimiento?
