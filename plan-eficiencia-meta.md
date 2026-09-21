# Plan — Eficiencia y Meta de línea con paradas

Creado 2026-09-21, actualizado el mismo día con las respuestas del dueño. Objetivo: que la **meta**, la
**disponibilidad**, el **rendimiento** y la **eficiencia** de cada línea salgan de las paradas registradas
(Programada / No programada / Ocioso) y den lo mismo en Panel, Validar, Acta y KPIs.

Estado: **solo planificación**. No hay código todavía. Los puntos con `[ ]` son decisiones abiertas.

**EN PAUSA (dueño, 2026-09-21): paradas «en curso» y el enlace con «Detener línea».** No se implementa hasta
nueva orden. Sigue vigente todo lo demás del plan (fórmulas, base por turno, ritmo).

---

## 1. Idea (explicada por el dueño)

Un día tiene 24 h. Las **programadas** (dormir, bañarse, comer) y el **ocioso** (no hay luz, no hay
internet) reducen el tiempo en que se podía producir. Una **no programada** (una invitación a cenar
que quita 4 h) es lo que de verdad hace perder eficiencia.

En planta: turno en lugar del día; cajas en lugar de líneas de código.

| Analogía | Planta | Cálculo |
|---|---|---|
| 24 h | Tiempo del turno | Duración fija del turno |
| Dormir, comer | Programadas | Se restan del turno |
| Sin luz | Tiempo ocioso | Se resta del turno |
| 16 h | **Tiempo disponible** | Turno − Programadas − Ocioso |
| La cena (4 h) | No programadas | Solo esta pierde |
| 12 h | **Tiempo operativo** | Disponible − No programadas |
| Líneas de código | Cajas / envases | Contador de la llenadora |

## 1.1 Base del tiempo

La base es **siempre la duración completa del turno**, no las horas transcurridas:
**T1 = 8 h, T2 = 7,5 h, T3 = 8,5 h**. La meta nace completa y, a medida que se registran paradas, se va
restando y se recalculan la meta y la eficiencia. **El turno 12x12 queda fuera por ahora**: hay que hacerle un
rework (trabajan como los 3 turnos, mitad y mitad) y no se calcula ahí hasta entonces.

## 2. Fórmulas (por línea, en un turno, «de forma general»)

No se calcula por corrida ni por tramos: las paradas no tienen hora real, así que no se puede saber cuánto
tiempo estuvo activa cada corrida. Se calcula **por línea y turno**.

```
Tiempo disponible = Turno − Programadas − Ocioso
Tiempo operativo  = Disponible − No programadas

Velocidad         = velocidad elegida de la línea (envases/h). Normalmente no cambia entre lote y lote.
Meta (envases)    = Velocidad × Tiempo disponible          (en cajas: ÷ envases por caja)
Real (envases)    = contador de la línea en el turno       (en cajas: ÷ envases por caja)

Eficiencia        = Real ÷ Meta
Disponibilidad    = Operativo ÷ Disponible                 (lo que costaron las No programadas)
Rendimiento       = Real ÷ (Velocidad × Operativo)
Eficiencia        = Disponibilidad × Rendimiento
```

**Ritmo en vivo (decidido):** durante el turno, la eficiencia se mide como ritmo, no como avance:

```
Disponible hasta ahora = tiempo transcurrido del turno − Programadas y Ocioso ya ocurridos
Eficiencia en vivo     = Real hasta ahora ÷ (Velocidad × Disponible hasta ahora)
```

Al cierre del turno el tiempo transcurrido es el turno completo y da lo mismo que Real ÷ Meta. Además se muestra
la **Meta del turno** (completa, ajustada por las paradas) y el **Avance** (Real ÷ Meta del turno). Esto necesita
las **horas reales** de cada parada (sección 6, punto 5). Una parada todavía en curso, sin registrar, hace bajar
el ritmo hasta que se registre; si es Programada u Ocioso, el ritmo se recupera al registrarla.

- Solo cuentan las líneas con **al menos una corrida en el turno**. Sin programación no cuenta nada.
- Se recalcula **cada vez que se registra una parada o se carga el contador**, siempre con la base del turno
  completo.
- El tiempo antes de que arranque la línea **cuenta como pérdida**: debe haber una parada que lo explique (por
  ejemplo, Arranque de Producción, 180 min).
- Cuando una línea termina su producción antes del cierre, **debe registrar «Final de Producción»**
  (Programada) para que baje la meta.

Ejemplo: línea 2, 250 ml, 24 envases/caja, 9.000 envases/h, turno de 8 h; programadas 1,5 h, ocioso 0,5 h,
no programadas 1 h. Disponible 6 h, operativo 5 h. Meta 9.000 × 6 = 54.000 envases (2.250 cajas). Real
43.200 envases (1.800 cajas). Eficiencia 80 %, disponibilidad 83 %, rendimiento 96 %.

## 3. Qué hay hoy en el código (verificado)

- `calcularMeta` (`src/lib/reportes/index.ts`): cajas esperadas = velocidad ÷ envases/caja × **horas
  transcurridas del turno** desde su inicio, por corrida activa. No descuenta paradas.
- `eficienciaOEE` (`src/lib/paradas.ts`): disponibilidad = (tiempo transcurrido − minutos de **todas** las
  paradas) ÷ tiempo transcurrido. Castiga también Programadas y Ocioso.
- Manual 10.5: eficiencia = velocidad elegida ÷ velocidad máxima. Es otra cosa: mide cómo se programó la línea.
- `Corrida` guarda `activadaEn`, `pausadaEn` (una sola marca, **sin historial**), `finalizadaEn`, `entregadaEn`.
- `envases_hora` se fija al **activar** la corrida (catálogo de Velocidades). No hay forma de cambiarla con la
  corrida activa. Programación no trae velocidad.
- El contador es un **log que se acumula** (varias cargas por corrida, con marca `parcial`).
- Las paradas se guardan por **turno + línea** con la duración; no tienen hora real ni corrida.
- Turnos: T1 7:00–15:00 (8 h), T2 15:00–22:30 (7,5 h), T3 22:30–7:00 (8,5 h), y 12x12 (sin horario).

## 4. Riesgos y cómo se evitan

| Riesgo | Prevención |
|---|---|
| Paradas que suman más que el turno | El servidor rechaza al registrar si la suma de esa línea supera la duración del turno. Si igual ocurre, aviso y no un porcentaje absurdo. |
| Línea con paradas pero sin corrida | No se cuenta (sin programación no cuenta nada) y el servidor no deja registrar. |
| Varias corridas con velocidades distintas | Decisión abierta 1. |
| Real en vivo bajo al principio del turno | Es esperado con la base del turno completo. Mostrar «avance» y decisión abierta 3. |
| Doble conteo con «Detener línea» | Decisión abierta 2. Mientras tanto no se suma `pausada_en`. |
| Línea que termina y no registra Final de Producción | Aviso en Finalizar Turno; el tiempo cuenta como pérdida hasta que se registre. |
| Cifras distintas entre pantallas | Un solo cálculo en el servidor que usan Panel, Validar, Acta y KPIs. |
| Divisiones por cero | Valores nulos y pruebas. |
| Turno 12x12 | Fuera de alcance hasta su rework: se muestra «—». |

## 5. Fases

- [ ] **F0. Decisiones abiertas** (sección 6).
- [ ] **F1a. Paradas en curso, inicio y fin, y enlace con Líneas.** `abrir_parada` / `cerrar_parada` y registro
      posterior con hora de inicio y fin, con las validaciones de la decisión 5. «Detener línea» y «Agregar parada»
      comparten el diálogo; «Continuar línea» cierra la parada. Va primero: el ritmo depende de estas horas.
- [ ] **F1. Cálculo en el servidor.** Función SQL `eficiencia_meta_linea_turno(turno_id)` con tiempos y
      porcentajes por línea. Pruebas con el ejemplo, medianoche (T3), turno sin paradas y paradas mayores al
      tiempo.
- [ ] **F2. Validación al registrar.** `registrar_parada` rechaza si la suma supera el turno o si la línea no
      tiene corrida en el turno.
- [ ] **F3. Modo sombra.** Correr las fórmulas nuevas sobre 30 días de turnos cerrados, compararlas con las
      actuales y revisar las diferencias grandes antes de cambiar nada visible.
- [ ] **F4. Panel de Producción.** Meta, disponibilidad, rendimiento y eficiencia por línea con el cálculo nuevo
      y actualización con cada parada o contador.
- [ ] **F5. Validar, Acta y Finalizar Turno.** Mismos números; aviso de línea sin «Final de Producción».
- [ ] **F6. Manual.** Actualizar 10.4, 10.5 y 10.7 del manual de usuario.

## 6. Decisiones

6. [x] **Parada que dura más de un turno o de un día.** Aclarado por el supervisor (2026-09-21): esas son las que
   sube **Mantenimiento** (con inicio y fin), no las del supervisor. El supervisor sube sus paradas **al
   terminar**; las «en curso» son las de Mantenimiento. Por eso lo de «en curso» del supervisor queda descartado
   y el problema pasa a la sección 7. Con horas reales de inicio y fin, los minutos de cada turno salen solos
   por solapamiento con su ventana, sin partir la parada a mano.

**Resueltas (dueño, 2026-09-21)**
- Base = duración fija del turno (8 / 7,5 / 8,5 h). Se resta y se recalcula al subir paradas.
- Velocidad de referencia = la elegida; normalmente no cambia entre lotes.
- El tiempo previo al arranque cuenta como pérdida; debe haber una parada que lo explique.
- No se calcula por corrida sino en general (por línea y turno).
- Debe registrarse «Final de Producción» al terminar.
- La eficiencia se actualiza con cada carga, con la base del turno.
- Líneas sin programación no cuentan.
- 12x12 fuera de alcance hasta su rework.

**Abiertas**
1. [x] **Velocidad con varias corridas en la misma línea y turno.** Resuelto (dueño: «hazlo así»): promedio de las
   velocidades ponderado por los envases contados de cada corrida (o la de la corrida activa si aún no hay
   contador). Casi nunca aplica porque la velocidad no cambia entre lotes.
2. [x] **«Detener línea» y las paradas.** Resuelto (dueño, 2026-09-21): van **enlazadas en los dos sentidos**.
   Si se agrega una parada a una línea que está corriendo, sale el mismo «Detener línea»; y al usar «Detener
   línea» sale el registro de la parada. Es un mismo diálogo (con la doble confirmación de las acciones
   bruscas), no dos pasos separados. Al «Continuar línea» se cierra la parada en curso.
5. [x] **Inicio y fin reales y paradas EN CURSO** (dueño, 2026-09-21). Los supervisores suben las paradas cuando
   ocurren, no al terminar: la parada se abre con inicio = ahora y sin fin, y se cierra con «Terminar parada»
   (o «Continuar línea»). Así el sistema la conoce desde el principio y el ritmo no baja de más. Una línea tiene
   como máximo una parada abierta a la vez. Sigue existiendo el registro posterior, con hora de inicio y fin,
   para lo que se cargó tarde. Abierta la decisión 6.

5b. [x] (detalle de la anterior) **Inicio y fin reales en cada parada** (necesario para el ritmo). Hoy el supervisor pone solo los
   minutos y el fin se toma como «ahora». Con hora de inicio y de fin se puede: evitar solapes (doble
   conteo), garantizar que la suma no pase del turno, detectar el tiempo sin explicar antes del arranque y
   asignar cada parada a su corrida. Propuesta: el formulario propone fin = ahora e inicio = fin − minutos,
   ambos editables, con validación en el servidor (dentro del turno, no en el futuro, sin solaparse con otra
   parada de la misma línea). La tabla `paradas` ya guarda `inicio` y `fin`; solo cambia el registro.
3. [x] **Velocidad máxima.** Resuelto (dueño): **no entra** en la eficiencia ni en la meta; «no tiene sentido si
   no es la que está». El indicador del manual 10.5 (velocidad elegida ÷ máxima) se retira de la eficiencia.
   Pendiente: confirmar si se deja de mostrar del todo (Panel y Acta 2.1).
4. [x] **Eficiencia en vivo.** Resuelto (dueño): por **ritmo** (fórmula en la sección 2). También se muestra la meta
   del turno y el avance.

## 7. Paradas de Mantenimiento (Google Sheet)

**Qué es (dueño, 2026-09-21):** Mantenimiento tiene su propio Google Sheet («REPORTE LINEAS») con su propio catálogo
y códigos (equipo + subsistema). Los «supervisores» de ese Excel son de **Mantenimiento**, no de Aséptico. Ahí
entran otros tipos de paradas, con **inicio y fin**, que pueden quedar en curso y durar más de un turno.

**Decisiones del dueño:**
- **No se lleva su sistema a la app** (es complejo y tiene cosas que Aséptico no usa). Solo interesan las paradas
  de **Aséptico**.
- Lo único que importa de cada reporte es la **línea** (y sus horas). Su catálogo no se traduce: no hay tabla de
  equivalencias de equipos.
- El **tiempo de procura no se necesita**: la parada es de inicio a fin.
- La sincronización puede ser un botón «Sincronizar» o automática; el dueño no sabe qué tan complejo es.

**Datos del Excel (analizado 2026-09-21, 1.163 reportes):**
- Columnas: id de reporte, área, turno, línea, equipo, código de subsistema, supervisor, estatus, quién reporta,
  tipo de falla (texto libre), fecha y hora de inicio y de cierre, tiempo de procura y downtime.
- 852 son de Aséptico y 311 de Vacío. Estatus: 1.161 finalizados y 2 pendientes (en curso).
- Solo 137 cierran otro día, casi todos por el turno 3 que cruza medianoche.
- El downtime coincide con cierre − inicio (ejemplo: 22:30:21 → 01:11:27 = 2:41:06).

**Diseño propuesto**
- Cada reporte de Aséptico entra como una parada **No programada**, tipo genérico «Mantenimiento», con
  `origen = SHEET`, la línea, inicio y fin, el id del reporte (clave contra duplicados) y el equipo, el código
  de subsistema y el tipo de falla guardados **solo como referencia** en la nota.
- Estatus PENDIENTE = parada **en curso**: cuenta desde su inicio hasta «ahora». Al cerrarse en el Sheet se fija
  el fin en la próxima sincronización.
- Se filtra por área Aséptico y por línea. El turno **no se toma de la columna**: se calcula por las horas.
- `paradas.turno_id` pasa a ser opcional para estas filas. Los minutos de cada turno salen del **solapamiento**
  de la parada con la ventana del turno, así una parada que cruza turnos o medianoche se reparte sola.
- El cálculo de eficiencia usa la **unión de intervalos** por línea: dos paradas solapadas en la misma línea
  cuentan una vez (red de seguridad contra el doble conteo).

**Cómo sincronizar (de menos a más complejo)**
1. **Botón «Sincronizar» en la app** (recomendado para empezar). El navegador baja el Sheet publicado como CSV,
   lo lee y se lo pasa a una función del servidor que filtra Aséptico y guarda o actualiza por id de reporte.
   Necesita que el Sheet se publique como CSV (o compartirlo). No requiere infraestructura nueva.
2. **Automático cada cierto tiempo.** Requiere una tarea programada en el servidor que descargue el Sheet (Edge
   Function o extensión de red) y acceso seguro a Google (cuenta de servicio). El proyecto hoy no tiene Edge
   Functions; sí tiene `pg_cron`. Es bastante más trabajo. La función del punto 1 se reutiliza.

**Decisiones de esta sección**
7a. [x] **Doble conteo:** el dueño indica que las fallas de máquina (Helix, etc.) no suelen subirse en los dos
    lados; por ahora se asume que no ocurre. Se deja la unión de intervalos solo como red de seguridad.
7b. [x] **Cómo sincronizar:** con un **botón «Sincronizar»** (dueño, 2026-09-21).
7c. [x] **Quién puede pulsarlo:** supervisores, superadministradores y la gente de Mantenimiento (validado también
    en el servidor).
7d. [ ] **Enlace del Sheet.** Hace falta el link del Google Sheet publicado como CSV (o compartido «cualquiera con
    el enlace»), de la pestaña de reportes. Se guardará como un ajuste que el superadmin puede cambiar en la app.
7e. [ ] **Usuarios de Mantenimiento en la app:** qué rol y área tienen (existe el área MANTENIMIENTO).
7f. [ ] **Dónde vive el botón:** propuesta, en el Panel de Paradas y en Registrar Paradas, con la fecha y hora de
    la última sincronización.

**Riesgo técnico a probar primero:** el navegador puede bloquear la descarga del Sheet desde otro dominio (CORS).
Si pasa, el plan B es que el servidor de la app lo descargue: la app se sirve con `vite preview` en Docker, que
permite un `proxy` en `vite.config.ts`, o subir el archivo a mano.

**Implementado (2026-09-21, sin desplegar):** botón «Sincronizar» y refresco automático cada 5 min mientras el Panel
de Producción, el Panel de Paradas o Registrar Paradas están abiertos. Migraciones `20261065` (ajustes) y
`20261066` (paradas de Mantenimiento: `turno_id` opcional, reparto por turno según horas reales,
`sincronizar_paradas_mantenimiento`). Falta: enlace real del Sheet de Aséptico, prueba de punta a punta y el cálculo
de eficiencia y meta (fases F1 en adelante).

**Implementado (2026-09-21, sin desplegar): cálculo de meta y eficiencia.** `src/lib/eficiencia.ts` (con pruebas, incluido el
ejemplo del plan) es el único lugar donde se calcula. Conectado al **Panel de Producción** (anillo «Meta del turno»,
columna Eficiencia = ritmo, sección «Meta por línea») y a la **sección 2.1 del Acta** (meta, real, eficiencia y merma).
Ya no usa la velocidad máxima ni resta las Programadas y el Ocioso de la eficiencia. Turno 12x12: sin cálculo.
Pendiente: F1a (hora de inicio y fin editables en el registro), F2 (validaciones al registrar), Validar, resumen de
Finalizar Turno, manual (10.4, 10.5, 10.7) y las paradas de Mantenimiento con datos reales.

## 7 (decisión final, 2026-09-21). Mantenimiento registra EN LA APP

**Sustituye todo lo anterior de esta sección (sincronización con el Sheet).** El dueño decidió que Mantenimiento se adapta
a nosotros: hace el mismo proceso que los supervisores, con el mismo catálogo y códigos, pero por su cuenta y con
hora real de inicio y fin. No se lleva su sistema a la app y el Excel de Mantenimiento deja de intervenir.

- Pantalla «Paradas de Mantenimiento» (`/paradas-mantenimiento`, área MANTENIMIENTO): línea de Aséptico, tipo del
  catálogo (filtrado por línea y por la presentación que corre), inicio, fin (vacío = en curso) y detalle.
  Se pueden terminar las que están en curso y eliminar las cargadas por error (queda en Auditoría).
- No pertenecen a un turno (`turno_id` null, origen `MANTENIMIENTO`): a cada turno le tocan los minutos que se solapan
  con su horario, así una parada que cruza turnos o medianoche se reparte sola. Migración `20261070`.
- Se retiran el botón «Sincronizar», la página de prueba de Sheet y la función del servidor que insertaba filas.

**Pendiente:** si supervisor y Mantenimiento registran la misma falla, el tiempo se cuenta dos veces. Falta contar por
unión de intervalos por línea en `src/lib/eficiencia.ts`.
