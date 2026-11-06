# Plan — Indicadores de Vacío (para rehacerlos en código)

Creado 2026-11-06. **Borrador para completar:** aquí está lo que ya existe en la app y las preguntas que faltan
responder antes de programar. Lo que dice qué indicadores son y de dónde salen lo aporta la dueña; no está en el código.

## 1. Qué hay hoy (para no empezar de cero)

- **Indicadores es solo de Aséptico.** `src/pages/apps/Indicadores.tsx` fija el área en `ASEPTICO` (o `PRUEBAS` si la
  sesión es de Pruebas). No hay vista para Vacío.
- **Mes por línea y presentación**, AUTOMÁTICO (lo calcula la app, `src/lib/indicadores/automatico.ts`) o MANUAL (lo carga
  la analista, editor en `src/components/indicadores/editor/`). Las dos formas producen un `DatosMes`
  (`src/lib/indicadores/tipos.ts`), así la pantalla no distingue de dónde vino.
- **Datos en la base:** tabla `indicadores_mes` (por `area_id` y `mes`; `modo`, `datos` jsonb, `observaciones`), con
  `indicadores_meses`, `indicadores_turnos`, `guardar_indicadores_mes`, `guardar_observacion_indicador`
  (migración 20261109990000 y siguientes). Las funciones reciben el código de área, así que la base ya admite otra área.
- **Permisos:** ver = `INDICADORES_VER` (o `VALIDAR`); cargar datos del mes = solo la Analista y la dueña
  (migración 20261115190000).
- **Vacío en la app hoy:** Vacío no usa la app; lo registra el supervisor de Aséptico (ver `docs/plan-sheet-vacio-produccion.md`).
  Lo que es de Vacío no cuenta en la merma ni en el rendimiento de Aséptico. Existe «Salida a Vacío» (como un desvase) y
  el interruptor Aséptico / Vacío por tanque.
- **Calidad** tiene un plan aparte con «Vacío-contenedor» (en pausa): `docs/plan-calidad.md`.

## 2. Preguntas por responder (completar este finde antes de programar)

1. ¿Qué indicadores de Vacío son? (lista, con nombre y fórmula de cada uno.)
2. ¿De dónde sale cada dato? ¿De la app (lotes, salidas a Vacío, tanques en Vacío), de un Excel/Sheet, o a mano?
3. ¿Mensual por línea y presentación, como Aséptico, o con otra forma (por lote, por semana, por tanque)?
4. ¿Quién los ve y quién los carga? ¿Hace falta un permiso propio o sirve `INDICADORES_VER`?
5. ¿Se compara contra una meta (como eficiencia en Aséptico)? ¿Cuál y dónde se configura?
6. ¿Hay un informe o Excel actual que sirva de modelo (como pasó con el de Aséptico, migración 20261110390000)?

## 3. Cómo encajaría (a confirmar con las respuestas de arriba)

- Un área `VACIO` en `indicadores_mes` y un selector de área en la pantalla (hoy está fijo).
- Un `DatosMes` propio o una variante en `tipos.ts`, y su propio `automatico.ts` si hay datos que la app ya tiene.
- Pantalla: reutilizar `src/components/indicadores/` (Kpi, gráficos, observaciones) en lugar de duplicar.
- Migración con la tabla/funciones nuevas, ensayo en Pruebas antes de producción.

## 4. Para el fin de semana

- [ ] Responder la sección 2.
- [ ] Decidir la forma (sección 3).
- [ ] Rama de código aparte desde `main`, sin mezclar con otros cambios.
