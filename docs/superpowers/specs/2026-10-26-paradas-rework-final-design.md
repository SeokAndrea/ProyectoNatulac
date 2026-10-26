# Paradas: rework final — diseño

Fecha: 2026-10-26. Acordado en conversación con la dueña. Parte de `origin/paradas-modo-unico`
(rama nueva a crear: `paradas-rework-final`). Mañana 27/10 sale a Producción
`paradas-lectura-clara` tal cual; este rework va después, aparte.

## Objetivo

Lo más simple posible para el supervisor. Mantenimiento cierra sus propias fallas en la app, con los
códigos de su Sheet, y deja de usar el Sheet. Producción inicia; Mantenimiento finaliza las suyas.

## Criterios (los siete de la dueña)

1. El acta muestra todas las paradas (Operacionales y de Mantenimiento), cada una con su responsable.
2. Eficiencia y metas: la fórmula no cambia; el tiempo final de Mantenimiento reemplaza al medido.
3. Panel: las animaciones se respetan (ver «Panel»).
4. Status y Líneas usan el mismo vocabulario.
5. Sin comentarios duplicados; flujo fácil; no confundir «parada» con «detenida».
6. Interruptor por área para decidir quién finaliza (como «Calidad libera»).
7. Mensajes cortos: máximo una línea por aviso.

## 1. Modelo

Una parada = tiempo perdido de una línea, con:

- **Equipo** y **Falla** (obligatorios siempre; la Falla alimenta el Panel).
- **Comentario** del supervisor (uno solo; lo ven Mantenimiento, el Panel y el acta).
- **Responsable**: `OPERACIONAL` o `MANTENIMIENTO`. Campo explícito que elige quien abre la parada.
  Reemplaza la regla `origen !== "MANUAL"` (usada en acta, Validar jornada y Panel en vivo), que fue
  la causa del error de paradas de Producción que salían «de Mantenimiento».

Operacional: la abre y la termina el supervisor (minutos u hora de inicio y fin, como hoy).
Mantenimiento: la abre el supervisor (o Mantenimiento) y la termina Mantenimiento.

### Interruptor «Mantenimiento termina las fallas» (por área, ya existe: `areas.mantenimiento_finaliza`)

- Apagado: el supervisor puede terminar cualquier parada, también las de Mantenimiento, con los mismos datos.
- Encendido: solo Mantenimiento termina las de Mantenimiento; el supervisor no tiene Continuar en ellas.
  Al terminarla, la línea sigue sola.
- Aséptico: apagado. Pruebas: encendido (como está acordado).

## 2. Vocabulario y estados

- **Parar** / **Continuar** / **Parada**: solo para pausas (tiempo perdido que se retoma).
- «Detener línea» pasa a **Entregar PT**: cierra la corrida, que queda esperando su Producto Terminado.
  Va separado de Parar y con confirmación (no se deshace).
- El estado `DETENIDA`, que hoy se muestra como «Parada», pasa a **Esperando PT** (el código ya usa ese
  nombre en `PanelEsperandoPt`). Cambia en tarjetas, cinta y Panel (`estadoLinea.ts`, `SeccionLineas.tsx`,
  `CintaLinea.tsx`). `LIBRE` queda como está.

## 3. Pantalla del supervisor (Líneas → Modo Paradas)

- Línea corriendo: botones **Parar** y **Entregar PT**, separados.
- Parar abre un formulario corto: **Operacional | Mantenimiento** (obligatorio, sin valor por defecto),
  **Equipo y Falla** (buscador de hoy), **Comentario**. Se elimina el interruptor «Sé la causa / No sé».
- «Empezó antes» (hora de inicio) y la pregunta de cuánto duró al Continuar se mantienen en Operacional.
- Una parada de Mantenimiento abierta se ve en la tarjeta («Mantenimiento · 0:42») sobre la animación.

## 4. Pantalla de Mantenimiento

- Mantenimiento entra directo a **Líneas en Modo Paradas**, sin los botones de manejar la línea. Desaparece
  la página `/mantenimiento` separada.
- Ve las paradas abiertas con equipo, falla y comentario ya escritos. **Terminar parada** pide:
  - **Código del Sheet** (equipo y subsistema; puede corregir el equipo).
  - **¿Qué se realizó?**
  - **Tiempo final**: minutos (solo si la parada ocurrió dentro de un único turno) o hora de comienzo y fin.
    Si la parada ya cruzó un turno cerrado, el comienzo queda bloqueado y se pide solo la **hora de fin**.
- Mantenimiento también **abre sus propias paradas** desde la tarjeta de la línea (la línea ya está elegida):
  Equipo, Falla y Comentario; el responsable es Mantenimiento. Producción las ve, con la etiqueta.
  Si la línea está corriendo, la parada pausa la corrida; si no (libre, CIP, esperando PT), solo queda anotada.
- Sheet de Mantenimiento: apagado. Mantenimiento no lo usa; sus códigos se importan al catálogo
  (`paradas_equipos` / `paradas_subsistemas`), que la dueña extrae del Sheet.

## 5. Paradas que cruzan turnos (la parte más delicada)

- El tiempo se parte **por las horas reales de cada turno** (3x8, 12x12, 7,5/8,5 h, T3 de madrugada, cambio
  de día). Cada turno cuenta solo su tramo, nunca el total.
- Lo cerrado queda fijo: cuando un turno cierra, su tramo se congela (acta, eficiencia y meta no cambian).
  La parada sigue abierta en el turno siguiente.
- Mantenimiento solo mueve el final. El comienzo se bloquea si la parada ya empezó en un turno cerrado.
- Una parada = un registro. Los tramos se calculan, no se guardan como paradas duplicadas.
- «Sin reportar» (`minutosSinReportar.ts`) ya recorta las paradas de Mantenimiento a la ventana del turno;
  hay que verificar con una prueba que lo mismo vale para **todas** las paradas.
- Tope de la parada abierta (propuesto, por confirmar): cuenta hasta el fin del turno en curso y sigue
  contando en cada turno nuevo mientras siga abierta; Validar jornada la marca como «abierta».

Ejemplo: empieza 13:00 (T1), T1 cierra 14:00, Mantenimiento termina 16:30 → T1 = 60 min (fijo),
T2 = 150 min. Total 210 min solo en el reporte.

## 6. Dónde se ve cada número

- Cualquier pantalla de un turno (Panel, Líneas, acta, eficiencia, «Tiempo de parada», «Parada con mayor
  duración», Top Fallas): el **tramo del turno** (150). La cinta en vivo también cuenta desde el inicio del turno.
- El **total (210)** se ve al pasar el cursor o tocar la fila, y en el reporte con el desglose «T1 60 + T2 150».
- Sin etiquetas largas. A lo más, un marcador chico «continúa» en una parada que viene del turno anterior.

## 7. Panel y animaciones

- Margen de 15 min (`MARGEN_PARADA_MIN`): se mantiene para paradas Operacionales (la cinta sigue corriendo
  con un aviso chico antes de los 15 min).
- La parada de Mantenimiento abierta con la línea corriendo no espera los 15 min (es deliberada).
- «Mantenimiento manda»: si hay una abierta de Mantenimiento en la línea, esa se muestra (ahora por el campo
  Responsable, no por el Sheet).
- La animación de parada sale solo para pausas reales; Esperando PT tiene la suya (cinta detenida sin envases).
- Fuera de este diseño, pendiente aparte: limpiar casi todo lo que está debajo en el Panel de Producción
  (se decide con fotos de la app) y mejorar un poco el Panel de Paradas.

## 8. Reportes de paradas

- **Registrar Paradas** se renombra **Reportes de paradas** y queda solo para revisar (parar, anotar y cubrir
  viven en el Modo Paradas). No se muestra en el Panel de Paradas.
- Lista por fecha, línea, responsable y estado. Cada fila se abre como reporte congelado al terminar:
  línea, turno, lote, **sabor**, presentación, equipo, falla, subsistema y **código**, comentario,
  «¿Qué se realizó?», quién la abrió y quién la terminó, tiempos (total y desglose por turno).
  Se puede imprimir.
- Quién lo ve (propuesto, por confirmar): Jefe de Producción, la Analista, Mantenimiento y la dueña.
  El supervisor ve en Líneas solo las paradas de su turno.

## 9. Acta, eficiencia, Status

- Acta y Validar jornada leen el campo **Responsable** (columna Operacional / Mantenimiento). El acta ya
  impreso o validado **no se reescribe**; si una parada sigue abierta al imprimir, aparece «en curso» y cuenta
  hasta el fin del turno. La merma por línea sigue con `mermaLineaTurno`.
- Eficiencia y meta: fórmula sin cambios (Meta = velocidad elegida × Disponible).
- Status de inicio de turno: mismas palabras (Parar, Continuar, Entregar PT). Si la línea ya estaba parada,
  abre el mismo formulario de Parar, con Operacional | Mantenimiento.

## 10. Textos

Máximo una línea por aviso. Se quitan párrafos explicativos de formularios (p. ej. «Parada: la línea se para
ya y el tiempo empieza a contar…»).

## 11. Migración

Se edita la `20261112590000` de `paradas-modo-unico` (no está aplicada en ningún lado):

- `responsable` en cada parada; las ya guardadas se convierten con la regla de hoy
  (manual → Operacional, el resto → Mantenimiento), respetando lo que corrige `20261112150000`.
- Campos del reporte congelado (lote, sabor, subsistema, código, qué se realizó, abierta por, terminada por).
- Funciones: abrir parada con responsable (Mantenimiento: pausa solo si la línea corre), terminar parada
  (código, qué se hizo, hora de fin; comienzo bloqueado si cruzó un turno cerrado) y tramo por turno.
- Ensayo en PGlite con toda la cadena (el arnés se perdió; ver `docs/pendiente-paradas-2026-10-26.md`).

## 12. Orden de trabajo (pruebas primero)

1. Tramos por turno y tope de la parada abierta (lógica pura): cruce de medianoche, turno de 12 h, T3 de
   madrugada, parada de tres turnos, cierre con la parada abierta.
2. Migración y su ensayo.
3. Formulario Parar, Entregar PT y estados (Esperando PT).
4. Mantenimiento: entra a Líneas en Modo Paradas; Terminar parada; abrir las suyas.
5. Reportes de paradas (en el lugar de Registrar Paradas) y permisos.
6. Acta, Validar jornada, Panel y Status leyendo el Responsable.
7. Textos cortos y revisión con fotos de la app y las animaciones.

## Por confirmar

- Confirmados por la dueña el 2026-10-26: tope de la parada abierta (sección 5) y quién ve Reportes de paradas (sección 8).
- Los códigos del Sheet: la dueña los extrae; importarlos al catálogo.
- Qué se conserva del Panel de Producción (aparte, con fotos).
