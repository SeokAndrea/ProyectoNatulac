# Plan — Sheet de Mantenimiento, tanques de Vacío y pantalla única de Producción

Creado 2026-10-08 (dueño). Tres frentes, en este orden de trabajo: 3 → 2 → 1 (el 1 espera el link del Sheet).

## 1. Paradas de Mantenimiento desde su Google Sheet

- Mantenimiento vuelve a subir sus paradas en su Sheet («REPORTE LINEAS»), con sus códigos.
- Botón **«Actualizar»** como antes (migraciones 20261065/66, retiradas en 20261070): el navegador baja el Sheet
  como CSV y el servidor guarda cada reporte por su id (no se repite).
- De cada reporte se toma **línea, inicio, fin y código** (equipo + subsistema). Solo área Aséptico.
- **Códigos:** el catálogo de equipos de la app (`paradas_equipos` / `paradas_subsistemas`, 20261063) salió del
  mismo Sheet, con los mismos códigos: el cruce es directo. Código que no exista en la app → «por clasificar».
- Estatus PENDIENTE = parada en curso. Los minutos se reparten por turno según las horas (como hoy).
- **Sin duplicados:** el supervisor no reporta cosas de Mantenimiento. Al principio una falla la asume el
  supervisor; si por frecuencia pasa a ser de la máquina, desde ahí la reporta Mantenimiento. No se reclasifica
  nada en la app. Red de seguridad: dos paradas que se pisan en la misma línea cuentan una vez.
- Mantenimiento deja de registrar en Registrar Paradas (`/paradas`); sigue viendo los paneles.

**Falta:** link del Sheet (publicado como CSV o «cualquiera con el enlace»), pestaña de reportes.

## 2. Tanques de Aséptico que usa Vacío

Vacío no usa la app: todo lo registra el supervisor de Aséptico. Lo que es de Vacío **no cuenta** en la merma ni
en el rendimiento de Aséptico.

- **Interruptor por tanque: Aséptico / Vacío.**
  - Se prepara en un tanque de Aséptico para Vacío → se marca Vacío. El lote no cuenta.
  - Vacío prepara y el néctar llega por tubería a un tanque de Aséptico → el tanque está en Vacío.
  - Aséptico termina usando lo de Vacío → se cambia a Aséptico. El volumen de partida del lote es el del tanque
    en ese momento (medido).
- **Vacío se lleva una parte de un lote de Aséptico** → «Salida a Vacío: X L», como un desvase: no es merma.
- Un tanque en Vacío no alimenta líneas de Aséptico. Se ve en la tarjeta, en el acta y en Auditoría.

**Por confirmar:** que la salida parcial (último punto) haga falta, o si también se resuelve con el interruptor.

## 3. Finalizar Turno, Mis Actas y Resumen Diario

Hoy está repartido (Resumen del Día, Mis Actas, Auditoría), es confuso, y los supervisores no logran imprimir el
acta (se descarga sola al teléfono y hay que buscarla).

- **El acta no cambia:** es la misma vigente (`src/lib/actaPdf.ts`).
- **Finalizar Turno:** lista «Antes de cerrar» (líneas, paradas, tanques, mermas) que lleva a cada sección; las
  líneas se entregan o terminan y la parada pendiente se completa ahí mismo; barra fija abajo con el botón y lo que
  falta. Al cerrar: el acta en pantalla con **Imprimir**, **Descargar PDF** y **Ver en grande**.
- **Mis Actas:** cada acta se abre en el mismo visor, con Imprimir.
- **Resumen Diario (jefe), solo esto:** botones Ver acta T1 · T2 · T3; cajas por sabor y presentación (por turno y
  del día); por línea; paradas que más tiempo quitaron; novedades del día. **El jefe no valida nada.**
- Boceto: https://claude.ai/code/artifact/c0598d8f-1b99-488d-9ad8-c7078265b401

**Por decidir:** qué pasa con la validación de cajas del Resumen del Día actual (¿la hace otra persona o se quita?).
