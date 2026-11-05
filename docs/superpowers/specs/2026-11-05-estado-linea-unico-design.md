# Estado de línea único: igual en Líneas, Modo Paradas y los dos paneles

Estado: decidido por Andrea el 2026-11-05. Fase 1 en `main` (solo pantallas). Fase 2 en la rama
`fix/estado-lineas-base` (migración `20261114790000_estado_lineas.sql`). Fase 3 pendiente.

## Para qué

Una misma línea se veía distinta según la pantalla: la tarjeta de Líneas la mostraba libre y el
Panel de Paradas «detenida» (con la etiqueta «Esperando PT»). No era un error suelto: el estado se
calculaba en cuatro lugares, cada uno con su tabla de etiquetas, y cada arreglo dejaba distintas a
las otras. La migración `20261111590000` ya lo decía: «los paneles mostraban la línea parada y
Líneas, corriendo».

## Decisiones

1. **Un solo cálculo.** `estadoDeLineas` + `aplicarParadasEnVivo`
   (`src/components/panel/calculosPanel.ts`). La tarjeta y el Modo Paradas usan
   `estadoDeUnaLinea`, que llama a las mismas dos funciones.
2. **Una sola tabla de aspecto** (etiqueta, color, dibujo y escena del Panel de Paradas):
   `ASPECTO_LINEA` en `src/components/lineas/estadoLinea.ts`. Ninguna pantalla tiene etiquetas propias.
3. **Parar se ve al instante en todas.** Con corrida manda la base: Parar pausa la corrida en el
   momento y `aplicar_paradas_a_lineas` la pausa a los 15 min de una parada abierta. Las pantallas
   no recalculan el margen; una parada abierta en una línea que sigue corriendo (Mantenimiento la
   dejó seguir) solo se muestra como aviso.
4. **Sin corrida, una parada abierta = «Detenida por parada»** (rojo, con el técnico). Si es una
   Línea No Programada (LNPE), «Sin programación».
5. **«Esperando PT» deja de ser un estado.** Sin corrida en marcha la línea está **Libre**; el PT
   pendiente sigue como tarea en la tarjeta («Terminó: cargar su PT») y en Producto Terminado.
   Con CIP, sigue «En CIP».
6. **«Libre» en gris.** El verde queda solo para «Corriendo».
7. **Paneles sin turno abierto.** `estado_planta_actual` devuelve el último turno cerrado entre un
   turno y otro. Los paneles ya no pintan sus líneas como si fueran en vivo: quedan Libres, salvo una
   parada abierta.

| Estado | Etiqueta | Color |
|---|---|---|
| activa | Corriendo | verde |
| activa con el lote terminado | Terminó el Lote | amarillo |
| parada | Parada | amarillo |
| detenida_por_parada | Detenida por parada | rojo |
| cip | En CIP | amarillo |
| cambio_presentacion | Cambio de Presentación | amarillo |
| sin_programacion | Sin programación | azul |
| libre | Libre | gris |

## Para que no vuelva

- `src/components/lineas/estadoLinea.test.tsx`: cada estado tiene su escena y el Panel de Paradas
  dice lo mismo que la tarjeta.
- `calculosPanel.test.ts`: `estadoDeUnaLinea` (tarjeta, Modo Paradas) da lo mismo que los paneles
  en cada caso.
- Un estado nuevo se agrega una vez, en `ASPECTO_LINEA` (el tipo obliga a completarlo).

## Fase 2: la base decide y todas se actualizan solas

Antes, aunque calcularan igual, cada pantalla se refrescaba a su ritmo: el Panel de Paradas cada
20 s, el Panel de Producción cada **15 min** y Líneas solo al tocar algo. Ahora:

- **`estado_lineas(área)`** (migración `20261114790000`) devuelve el estado ya decidido de cada
  línea del área y su parada en curso, con la misma regla de arriba. Sin área: la producción con
  turno abierto, nunca Pruebas. Es también la entrada para el PLC.
- **Las cuatro pantallas la piden cada 15 s** (`useEstadoLineas`, `src/lib/estadoLineas.ts`) y
  muestran lo que dice. Si cambió algo (otro turno, una corrida, una pausa, una parada),
  **recargan sus datos solas** (`useRecargarAlCambiar`); el Panel de Producción ya no espera sus
  15 min.
- Líneas usa la respuesta solo si es el turno en curso de la planta; en corrección o en un turno
  cerrado, la tarjeta usa su cálculo.
- **Respaldo:** si la base no responde (sin red, o la migración todavía no se aplicó), cada
  pantalla usa el cálculo en TypeScript, con la misma regla. Por eso se puede publicar la app antes
  de aplicar la migración. **Si se cambia la regla, se cambia en los dos lados** (SQL y
  `calculosPanel.ts`) y en sus pruebas.
- **Un solo turno ABIERTO por área**: candado en la tabla `turnos` (`turnos_un_abierto_por_area`,
  se revisa al confirmar). `abrir_turno` inserta el nuevo y cierra el anterior en la misma
  transacción, así que el relevo normal pasa; dos aperturas en el mismo instante (el botón y el
  respaldo de las 7:30) ya no pueden dejar dos abiertos: la segunda falla. Si al migrar ya hay dos
  abiertos en un área, no se pone y la migración avisa cuáles.

Pruebas: `scripts/ensayo-estado-lineas.sql` (en la base local, todo en Pruebas y con rollback) y
`src/lib/estadoLineas.test.ts`.

## Pendiente

- **Fase 3:** código de envío en `registrar_contador` y `robot_tavil_sumar`, para que un
  reintento tras un corte de señal responda «ya estaba guardado» en vez de «duplicado».
- Si se quiere que cambie **al instante** (sin esperar los 15 s): Supabase Realtime sobre
  `turno_lineas`, `lineas_estado` y `paradas`, avisando a `useEstadoLineas`.
