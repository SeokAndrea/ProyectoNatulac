# Estado de línea único: igual en Líneas, Modo Paradas y los dos paneles

Estado: decidido por Andrea el 2026-11-05. Fase 1 implementada en la rama `fix/estado-linea-unico`
(solo pantallas, sin migración). Fases 2 y 3 pendientes.

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

## Pendiente

- **Fase 2 (base):** mover el cálculo a una función SQL `estado_lineas(área)` para que la base sea
  la única fuente (y la señal del PLC entre por ahí). Candado en `abrir_turno` (bloqueo por área +
  un solo turno ABIERTO por área) después de confirmar que hoy no hay dos abiertos.
- **Fase 3:** código de envío en `registrar_contador` y `robot_tavil_sumar`, para que un
  reintento tras un corte de señal responda «ya estaba guardado» en vez de «duplicado».
