# Trazabilidad de paletizado en el Robot Tavil (borrador de conversación)

Estado: **conversación a medias, sin diseño aprobado y sin código**. Esta rama (`robot-tavilesco`)
solo guarda el formato original y lo hablado hasta el 11 de noviembre de 2026, para retomarlo
desde otra PC. Cuando se cierre el diseño se escribe el spec en `docs/superpowers/specs/`.

## Qué se quiere

Hoy el operador del Robot Tavil llena a mano la hoja **1-PR-F-040 Rev.01 «Trazabilidad de
paletizado»**. Se quiere llevarla a la app con un esquema muy parecido y poder **exportarla a PDF**
con el formato de la hoja.

Archivos en esta carpeta:

- `1-PR-F-040 TRAZABILIDAD DE PALETIZADO REV 01.xlsx`: la hoja original.
- `1-PR-F-040 TRAZABILIDAD DE PALETIZADO REV 01.pdf`: la misma hoja, vacía.

## La hoja

Encabezado: **1.1 Fecha**, **1.2 Tipo de paletizado** (Automático / Manual) y **1.3 Presentación**
(una sola marcada por hoja: TBA-1L, TBA-500 cm3, TPA-330/250/200 cm3, Al-340 cm3, V-1000/250 cm3,
C-113 g, C-186 g).

Una fila por paleta:

| Col. | Campo | Notas de la hoja |
|---|---|---|
| 1.3.1 | Nº de paleta | |
| 1.3.2 | Sabor | Con códigos: MZ, PR, DZ, MG, CT, NJ, CC, CL, MZ%, PR%, DZ%, MG%, GY, NJ% |
| 1.3.3 | Lote | |
| 1.3.4 | Nº ticket de paleta | |
| 1.3.5 | Nº cajas | |
| 1.3.6 | Turno | |
| 1.3.7 | Conformidad | C (conforme) o NC (no conforme) |
| 1.3.8 | Observación / desviación | Solo si es NC: 1 solapas despegadas, 2 faltante de cajas en la paleta, 3 faltante de unidades en las cajas, 4 defectos en la paleta de madera, 5 poliestrech rasgado, 6 defectos en el apilamiento, 7 otros (especificar) |
| 1.3.9 | Acción de corrección | Texto libre |

## Lo que ya se habló

- **Nº de paleta**: es el consecutivo **dentro del lote que está corriendo**. La primera que sale es
  la 1, luego la 2, y así hasta que termina el lote. Confirmado por Andrea.
- Propuesta mía, **sin confirmar**: la app asigna el número sola (el operador no lo escribe); la
  cuenta es por lote y no por corrida (si la línea se entrega y el mismo lote sigue, continúa la
  numeración); el «−» libera el número de la paleta anulada, que queda guardada pero no sale en la
  hoja ni en el PDF.
- Propuesta mía, **sin confirmar**: fecha, presentación, sabor (con su código), lote y turno salen
  de la corrida, sin que el operador escriba nada. Tipo de paletizado «Automático» por defecto.
  Nº de cajas lleno con las cajas completas por paleta (catálogo) y editable. Conformidad «C» por
  defecto; solo si marca «NC» se piden la observación (1 a 7) y la acción de corrección. El «+» sigue
  siendo un toque.

## Preguntas abiertas

1. **Nº ticket de paleta (1.3.4)**: ¿qué es y quién lo genera? ¿Lo imprime el robot o una
   etiquetadora y el operador lo teclea o lo escanea? ¿O se anota a mano? Sin responder todavía.
2. ¿Una hoja (y un PDF) por día, por línea y por presentación? La hoja marca una sola presentación.
3. ¿Quién revisa o usa la hoja después (calidad, despacho, un cliente)? ¿El supervisor debe poder
   corregir conformidad y observaciones, o solo el operador?
4. ¿Las paletas «Manual» también las carga el operador del Robot Tavil, o las carga otra persona?

## Lo que ya existe en el código (para retomar)

- Spec del operador: `docs/superpowers/specs/2026-11-04-operador-robot-tavil-design.md`.
  Cada «+» crea una fila en `robot_tavil_paletas` con hora del servidor, corrida (de la que hereda
  línea, lote, sabor y presentación) y quién la registró. El «−» **anula** la última paleta de la
  corrida (queda quién y cuándo). El Resto va en `robot_tavil_resto`.
- Migración: `supabase/migrations/20261114690000_robot_tavil_precarga.sql`.
- Pantalla: `src/pages/apps/RobotTavil.tsx`, `src/components/robot-tavil/TarjetaLineaRobot.tsx` y
  `src/lib/robotTavil.ts`.
- Hoy la cuenta se reinicia con cada corrida; el consecutivo por lote cambiaría eso.
- PDF: el proyecto ya usa `jspdf` y `jspdf-autotable` (por ejemplo `src/lib/actaPdf.ts`,
  `src/lib/sifPdf.ts` y `src/lib/indicadores/exportarPdf.ts`). Lo natural es seguir ese patrón.
- La precarga alimenta el Producto Terminado del supervisor; la trazabilidad no debe cambiar ese flujo.

## Siguiente paso

Responder la pregunta del ticket. Después: plantear dos o tres formas de construirlo (dato extra en
cada paleta, pantalla aparte para completar la hoja, o ambas), elegir una, escribir el spec y
pasar al plan.
