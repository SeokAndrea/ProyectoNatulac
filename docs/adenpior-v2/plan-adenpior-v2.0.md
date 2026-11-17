# Plan Adenpior_V2.0 (2026-11-17)

Rama `Adenpior_V2.0`, salida de `main` (88c159d). Orden de trabajo: 1 → 2 → 3 → 4 → 5, un commit por punto.

## Estado: HECHO (2026-11-17), en la rama, sin unir a main ni subir

Decisiones de Alexander:
1. **Calidad:** la tarjeta la ve quien tenga `LOTE_LIBERAR`; queda en producción y el interruptor «Calidad libera los lotes» se mantiene para poder apagarlo.
2. **Nitrógeno:** se agregó «Llegaron en el turno». Caso recibe 3 y entrega 5: no se guarda hasta anotar al menos 2 que llegaron (o corregir los conteos). El consumo es recibidas + llegaron − entregadas, así que nunca da negativo.
3. **Semana:** de lunes a domingo.
4. **Familia «Clásicos» → «Clásico»** (pedido aparte, 2026-11-17): migración `20261116390000_familia_clasico.sql`. `es_familia_clasica()` acepta las cuatro formas en `sabor_display()` y `nombre_sabor_resumen()`; los meses de Indicadores pasan la clave del semielaborado y su observación a «Clásico». En la app: sabores.ts, turno.ts, colores.ts, VistaSemielaborado y los rótulos de Fórmulas. Ensayo: `scripts/ensayo-familia-clasico.sql` (también aplicada dos veces seguidas).

Verificado:
- `tsc -p tsconfig.app.json` y las 995 pruebas en verde.
- Ensayos SQL en la base local PGlite: `scripts/ensayo-trazabilidad-paletizado.sql` y `scripts/ensayo-nitrogeno.sql` pasan. Los demás ensayos dan lo mismo antes y después de las migraciones nuevas.
- Pantallas revisadas en el navegador con la API simulada (sin tocar la base): Hub de Calidad, buscador, Comenzar/Finalizar Turno con nitrógeno y Resumen semanal.

Migraciones nuevas (después de la última, 20261116090000, que sigue sin commit y **no** entra en esta rama salvo que Alexander lo pida):

| Punto | Migración |
|---|---|
| 1. Calidad | ninguna |
| 2. Ticket repetido | `20261116190000_robot_tavil_ticket_repetido.sql` |
| 3. Buscador | ninguna |
| 4. Nitrógeno | `20261116290000_nitrogeno_turno.sql` |
| 5. Resumen semanal | ninguna (opción A) |
| Familia Clásico | `20261116390000_familia_clasico.sql` |

---

## 1. Calidad no ve tarjetas y no llega a liberar (URGENTE)

**Causa (verificada en el código):** la tarjeta Calidad en [src/lib/apps.tsx](../../src/lib/apps.tsx) tiene `enPrueba: true`. `puedeVerApp()` devuelve `false` para todo el que no sea del Área de Pruebas, aunque tenga `LOTE_LIBERAR`. La ruta `/calidad` usa el mismo criterio ([ProtectedRoute](../../src/components/ProtectedRoute.tsx)), así que:

- un usuario del área Calidad solo ve los atajos (paneles y Manual): la grilla queda vacía;
- con el interruptor «Calidad libera los lotes» encendido, el enlace «Ir a Calidad» de Preparación ([EstadoCalidadLote](../../src/components/tanques/EstadoCalidadLote.tsx)) lo devuelve al inicio.

El servidor está bien: `turno_activo_de()` le da al área Calidad el turno de Aséptico y `registrar_analisis_calidad()` pide `LOTE_LIBERAR`.

**Cambio:**
- `apps.tsx`: quitar `enPrueba` de Calidad. Queda `permiso: "LOTE_LIBERAR"` (lo decide el permiso del puesto, como las demás tarjetas).
- `src/lib/areasApoyo.test.ts`: cambiar la prueba «la tarjeta de Calidad está en prueba» por «la ve quien tiene LOTE_LIBERAR».
- Revisar en la base que los puestos de Calidad tengan `LOTE_LIBERAR` (consulta en Áreas y puestos).

**Decisión:** ¿la tarjeta también la ve un Jefe de Aséptico que tenga `LOTE_LIBERAR`? Recomendado: sí, lo decide el permiso. Si no, se agrega `areasPermitidas: ["CALIDAD"]`.

**Conflictos:** ninguno en la base. Solo cambia quién ve la tarjeta.

---

## 2. Robot Tavil: ticket repetido permitido con doble confirmación

**Hoy:** índice único `robot_tavil_paletas_ticket_unico` + `robot_tavil_aviso_ticket()` que bloquea en `robot_tavil_sumar` y `robot_tavil_editar_paleta` (migración 20261115290000).

**Migración `20261116190000`:**
- `drop index robot_tavil_paletas_ticket_unico`.
- `robot_tavil_sumar` y `robot_tavil_editar_paleta`: parámetro nuevo `p_confirmar_repetido boolean default false`. Se borra primero la firma vieja (si no, quedan dos funciones con el mismo nombre).
  - Ticket repetido y sin confirmar → error que empieza con `TICKET_REPETIDO|` + «Ese ticket ya está en la paleta Nº 12 de la Línea 1».
  - Confirmado → guarda y la auditoría dice «con ticket repetido».
- Se quitan los bloques `exception when unique_violation` (ya no aplican).
- `robot_tavil_aviso_ticket()`: si el ticket está en varias paletas, las nombra todas.

**Frontend:**
- `src/lib/robotTavil.ts`: `sumarPaleta` / `editarPaleta` mandan `p_confirmar_repetido`; se reconoce el prefijo `TICKET_REPETIDO|`.
- `DialogoPaleta.tsx`: primer «Crear paleta» → aviso en amarillo «Este ticket ya está registrado en la paleta Nº 12 de la Línea 1» y el botón cambia a «Sí, guardar con el ticket repetido». Si cambian el ticket, se vuelve a pedir la confirmación.
- Pruebas: `robotTavil.test.ts` y `RobotTavil.test.tsx`.

**Conflictos:** el frontend viejo sigue funcionando con la base nueva (el parámetro tiene valor por defecto). Trazabilidad y su PDF muestran el ticket tal cual. Opcional: marcar los repetidos en la tabla de Trazabilidad.

---

## 3. Buscador de tarjetas en el inicio

**Dónde:** [src/pages/Hub.tsx](../../src/pages/Hub.tsx), columna izquierda, debajo del saludo y del texto «Elige una aplicación…». Campo chico (ancho máximo ~18 rem, alto 36 px), con lupa y el texto «Buscar tarjeta…».

**Cómo filtra:**
- Por título y descripción, sin importar mayúsculas ni tildes («produccion» encuentra «Producción»).
- Filtra la grilla, los atajos, el flujo del supervisor en el teléfono y la sección «Más». Las secciones que quedan vacías se esconden.
- Sin resultados: «No hay tarjetas con “…”».
- Enter abre la primera tarjeta habilitada; Esc borra.
- Solo busca entre las tarjetas que esa persona ya puede ver (respeta permisos, «Solo paradas» y tarjetas ocultas).
- La función de filtro va en `src/lib/navegacion.ts`, con su prueba.

**Conflictos:** ninguno.

---

## 4. Consumo de bombonas de nitrógeno (obligatorio)

**Decisión (antes de programar):** qué se cuenta. Propuesta:
- **Al comenzar:** bombonas **llenas** que hay al recibir el turno.
- **Al finalizar:** bombonas llenas que quedan al entregarlo.
- **Consumo del turno** = recibidas − entregadas.
- Si llegan bombonas durante el turno, se agrega «Bombonas que llegaron en el turno» al finalizar y el consumo pasa a ser: recibidas + llegaron − entregadas.

**Migración `20261116290000`:**
- `turnos`: `nitrogeno_inicio int`, `nitrogeno_fin int` (≥ 0), con quién y cuándo los cargó.
- `guardar_nitrogeno_turno(p_usuario, p_turno_id, p_momento 'INICIO'|'FIN', p_bombonas)`: pide `TURNO_CARGAR`; se puede corregir mientras el turno está abierto; queda en Auditoría con el antes y el después.
- `turno_json()`: devuelve `nitrogeno_inicio`, `nitrogeno_fin` y lo que entregó el turno anterior del área (para comparar).
- `finalizar_turno()`: no cierra sin `nitrogeno_fin` (ni sin `nitrogeno_inicio`), salvo en Pruebas.
- ⚠️ `turno_json` y `finalizar_turno` se redefinieron muchas veces. Hay que partir **de su última versión** (20261109490000 y 20261111190000). Así se coló el error que corrige 20261116090000.
- Los cierres automáticos (respaldo, «Comenzar el de ahora», 12x12 de noche) **no** se bloquean: el acta dice «Sin registrar».

**Comenzar Turno:**
- En la revisión de inicio ([RevisionInicioTurno](../../src/components/RevisionInicioTurno.tsx)) va una tarjeta «Nitrógeno al recibir (bombonas llenas)» arriba de tanques y líneas, con la referencia «El turno anterior entregó 6».
- `revisionCompleta` (ComenzarTurno.tsx) también exige el nitrógeno: sin eso no termina la revisión.
- Esto cubre el turno nuevo y el turno asumido sin responsable. En un relevo no se pide de nuevo (es el mismo turno).

**Finalizar Turno:**
- Sección «Nitrógeno al entregar» y un punto en «Antes de cerrar» que queda en rojo («falta») hasta cargarlo.
- Si el turno no tiene la lectura de inicio (lo abrió el sistema), ahí mismo se pide también.

**Acta** ([src/lib/actaPdf.ts](../../src/lib/actaPdf.ts)): se respeta el formato. Va una fila debajo de 1.6 y otra debajo de 1.8, con las mismas celdas celestes. Ver [acta-nitrogeno-muestra.png](acta-nitrogeno-muestra.png), generada con el código real del acta:
- 1.6: «Nitrógeno al recibir (bombonas llenas) · 6 bombonas · Entregó el turno anterior · 6 bombonas».
- 1.8: «Nitrógeno al entregar (bombonas llenas) · 4 bombonas · Consumo del turno · 2 bombonas».
- La hoja 1 sigue entrando en una página.
- Los turnos de antes del cambio (sin datos) salen sin estas filas, igual que hoy.
- Se pasa el dato en los tres lugares que arman el acta: `FinalizarTurno.tsx`, `regenerarActa.ts` e `Historial.tsx`.

**Conflictos:** es el único punto que toca funciones grandes del turno. Probar en Pruebas: iniciar, asumir, relevo, cierre automático y regenerar un acta vieja.

---

## 5. Resumen Diario: vista de la semana (sin actas)

**Propuesta:** junto a la fecha, un selector **Día | Semana**. En Semana: flechas ‹ › y los botones «Esta semana» y «Semana pasada». La semana va de lunes a domingo, por jornada (7:00 a 7:00, `turnos.fecha`).

**Qué se ve en Semana:**
- Cajas por sabor y presentación: una columna por día (Lun…Dom) y el total de la semana, con las correcciones de la analista. Se reusa `CajasPorSabor` con los días como columnas.
- Por línea: cajas, merma y minutos de paradas de la semana.
- Las paradas que más tiempo quitaron en la semana.
- Cajas por grupo (solo la analista).
- Días sin validar, marcados.
- Bombonas de nitrógeno consumidas por día (si se hace el punto 4).

**Qué no sale en Semana:** actas, novedades, contadores por turno ni el mensaje de WhatsApp (validar sigue siendo por día).

**Cómo (opción A, recomendada):** sin migración. Se piden los 7 días con las mismas funciones del día y se suman en una función nueva, `src/lib/resumenSemana.ts`, con sus pruebas. Así la semana da los mismos números que los días. Si se pone lenta, más adelante se hace una consulta por rango en el servidor (opción B).

**Conflictos:** ninguno en la base. Son unas 7 veces las consultas de un día.

---

## Verificación al programar
- `npx tsc --noEmit -p tsconfig.app.json` (en la raíz no revisa nada).
- `npx vitest run`.
- Fotos con la skill probar-app: hub de un usuario de Calidad, el «+» del Robot con ticket repetido, el buscador en PC y teléfono, Comenzar y Finalizar Turno, y el Resumen semanal.
- Subida: dos migraciones (puntos 2 y 4) + frontend. Los pasos se dan al terminar.
