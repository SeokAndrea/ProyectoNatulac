# SDD ledger — plan: docs/superpowers/plans/2026-10-26-paradas-rework-final.md

Spec: docs/superpowers/specs/2026-10-26-paradas-rework-final-design.md (autoridad). Base de la rama: 632df0f (paradas-modo-unico); docs en 79605de.

## Preflight (cruces entre tareas)
| Cruce | Hallazgo |
|---|---|
| T1 -> T6/T7/T8 (paradasTramo) | Firmas consistentes: tramoEnTurno, desgloseEnTurnos, cruzaTurnoCerrado, VentanaTurno. OK |
| T2 -> T3/T5/T6 (RPC) | pausar_linea gana p_responsable ANTES de p_inicio; terminar_parada y abrir_parada_mantenimiento con las firmas del plan. T3 debe pasar los mismos nombres de parametro. OK |
| T3 borra finalizarFalla/clasificarFalla; T6 borra Mantenimiento.tsx | Entre T3 y T6 el front no compilaria. Ruling abajo |
| T2 quita sincronizar_paradas_mantenimiento y puente del Sheet; T3 deja sheetMantenimiento | paradasEnVivo.ts llama actualizarDesdeSheet. Ruling abajo |
| T2 ensayo con Docker/psql | Docker no corre y no hay psql en esta PC. Ruling abajo |
| T4 -> T6 (PanelPausada.tsx) | Ambas lo tocan: T4 solo textos, T6 la logica. Orden T4 antes que T6. OK |
| T5 -> T6 (FormParadaLinea) | T5 cambia el formulario; T6 lo reutiliza para Mantenimiento sin elegir responsable. T5 debe exponer prop opcional `responsableFijo?: ResponsableParada`. Ruling abajo |
| Autoconsistencia T1..T9 | Cada tarea: pruebas y archivos coinciden con lo que luego se toca. T8 depende de T1+T3. OK |

## Rulings
Ruling: T3 NO borra finalizarFalla ni clasificarFalla (se borran en T6 junto con Mantenimiento.tsx) — mantiene tsc en verde entre tareas — costo si falla: codigo muerto unas tareas.
Ruling: T3 deja de llamar a actualizarDesdeSheet cuando SHEET_MANTENIMIENTO_ACTIVO es false (guard en paradasEnVivo.ts); no borra sheetMantenimiento.ts — el Sheet queda apagado como manda el spec — costo: archivos del Sheet siguen en el repo.
Ruling: el ensayo de T2 corre con PGlite (@electric-sql/pglite@0.3.7 instalado en el scratchpad, NO en el repo) siguiendo docs/pendiente-paradas-2026-10-26.md; scripts/ensayo-20261112590000.sql queda en el repo y el runner JS en el scratchpad — Docker no corre ni hay psql — costo: si PGlite difiere de Postgres real, hay que reprobar en la base local antes de aplicar en planta.
Ruling: T5 agrega prop opcional responsableFijo a FormParadaLinea (T6 la usa para Mantenimiento) — evita duplicar el formulario — costo: minimo.

## Progress
Task 1: dispatched (BASE 79605de, agent a84e86b1642c3e124, sonnet)
Task 1: minor (deferred): cruzaTurnoCerrado `fin` opcional sin prueba propia; default silencioso true si se olvida fin
Task 1: minor (deferred): prueba de redondeo débil (solo suma); la absorción puede dejar un tramo <= 0 con fragmentos de segundos
Task 1: minor (deferred): `ahora` recorta también paradas cerradas con fin futuro (desfase de reloj)
Task 1: complete (commits 79605de..1a37f93, review clean; 3 minors diferidos; firma cruzaTurnoCerrado(p: {inicio, fin?}, ventanas) — fin opcional)
Task 2: implemented (commit fe0ff7e). 11/11 ensayo en Postgres 17 real (natulac_ensayo, borrada) y PGlite; RED 11/11 con la migración original. natulac no se tocó.
Ruling: con el interruptor APAGADO, Continuar deja abierta una parada de Mantenimiento (herencia del diseño anterior); el supervisor la cierra con terminar_parada. En T6 el botón de una parada MANTENIMIENTO es siempre «Terminar parada», nunca Continuar — cumple el spec (sección 1: «el supervisor termina todas con los mismos datos») — costo si falla: una parada de Mantenimiento queda contando tiempo.
Task 2: minor (deferred): con el interruptor encendido solo usuarios de Mantenimiento terminan (la dueña no, salvo es_dueno); subsistema_codigo es texto libre sin catálogo; helper nuevo parada_cierre_turno_cerrado(uuid) para bloquear el comienzo en el front.
Ruling: modelos baratos desde T3 (sonnet) y revisión por grupos (T3+T4, T5+T6, T7+T8+T9) + final — pedido de la dueña de gastar menos tokens — costo: un error de T3 puede verse recién en la revisión del grupo.
Task 2: review -> spec OK, calidad aprobada con 2 Important (fix round 1 pendiente, esperar a que T3 termine para no chocar commits):
  I1: con el interruptor encendido es_de_mantenimiento bloquea a la dueña (demo en Pruebas) -> permitir es_dueno
  I2: terminada_por/terminada_en solo los pone terminar_parada; Continuar (soltar_parada_de_linea) los deja NULL -> el reporte congelado sale sin «terminada por»
  + grep de llamadores viejos de pausar_linea (6 args) y de clasificada_en/clasificada_por en supabase/migrations
  + minor a incluir: terminar_parada sobre una `pendiente` debe poner pendiente=false
Task 2: minor (deferred): terminar_parada no compara el área de la parada con la del usuario; pausada_en no se actualiza si se edita p_inicio; es_de_mantenimiento usa rol O área
Ruling: terminar_parada exige subsistema_codigo para toda parada que termine; la UI solo la usa para paradas MANTENIMIENTO (Operacional termina con Continuar). Equipo obligatorio se exige en el formulario (front), no en SQL — costo: un cliente que llame la RPC directo puede omitir equipo.
Task 3: implemented (1d12d9b), tests 570 ok, tsc limpio; revisión junto con T4. FormParadaLinea pasa responsable OPERACIONAL fijo hasta T5; ActualizarDesdeSheet.tsx manual sin tocar (se quita en T6).
Task 4: implemented (eff27ef) 570 tests ok; revisión junto con T3.
Task 3+4: review -> spec OK, calidad aprobada. Pendientes asignados:
  Important (-> T8 + SQL): src/lib/sif.ts:180 etiqueta SIF «Mantenimiento/Producción» por origen === "SHEET"; con el Sheet apagado todo sale «Producción». Hay que leer `responsable` en listar_paradas_sif (SQL) y en sif.ts/sifPdf.ts/DetalleSif.tsx.
  Important (-> T5, en curso): FormParadaLinea fijo OPERACIONAL.
  Important (-> T6): quitar ActualizarDesdeSheet (botón manual) y sus usos.
  Minor (deferred): sin pruebas de los wrappers terminarParada/abrirParadaMantenimiento; DetalleParadas.tsx muestra badge ORIGEN junto a la columna Responsable; comentario torpe en ConfirmarInicioLinea.tsx.
Task 3: complete (commits 1a37f93..1d12d9b); Task 4: complete (..eff27ef) — con los Important de arriba asignados a T5/T6/T8.
Task 5: implemented (0f25a77) 578 tests ok. Pendiente asignado a T6: el botón de la tarjeta dice «Parada» y debe decir «Parar» (spec sección 2/3); revisión junto con T6.
Task 2: fix round 1/5 aplicado (commit 4a45ab9): dueña termina, terminada_por/en en todo cierre, pendientes terminables; 15/15 en PG real; sin llamadores vivos viejos. Falta re-review.
Task 2: re-review -> los 4 hallazgos ADDRESSED, sin nuevo daño. Minors diferidos: el ensayo 13 solo prueba Continuar (no Detener/CIP); el trigger de insert sin aserción directa; el ensayo 15 no prueba terminar dos veces una pendiente; pendiente terminada deja el vínculo lineas_estado.parada_id hasta Continuar (revisar a mano).
Task 2: complete (commits 1a37f93..fe0ff7e + fix 4a45ab9, re-review clean)
Task 5+6: review -> T5 aprobado; T6 spec ❌ solo por el riesgo 6 (parada abierta de un turno anterior no visible).
Ruling: riesgo 6 es falso positivo — pausar_linea inserta con turno_id NULL (migración línea 307), así que paradas_efectivas_turno la incluye en cualquier turno cuya ventana se solape; no hay fix — costo si me equivoco: una parada abierta de Mantenimiento no se vería en el turno nuevo (se comprobará en la prueba visual con probar-app).
Task 6: minor (deferred): si `abierta` es null con la línea pausada (paradasDetienen vacío) PanelPausada muestra Continuar; minutos calculados pueden quedar en el futuro (lo rechaza el servidor); Mantenimiento solo ve el turno de ASEPTICO (Pruebas no contemplado); ModoParadas.tsx >450 líneas con ramas por rol repetidas.
Task 5: complete (0f25a77, review clean). Task 6: complete (180877e, 1 ruling, minors diferidos).
Nota: 2 .snap modificados en el árbol (PanelProduccion, ProductoTerminado) existían antes; no se incluyen en commits; revisar al final.
Task 7: implemented (18f0a95) 598 tests ok. Desvío: agregó migración nueva 20261112690000 (RPC ventanas_turnos_paradas) y src/lib/ventanasParadas.ts porque no había helper de ventanas reales — necesita db push.
Ruling: se acepta la migración 20261112690000 (el plan decía editar 590000, pero la RPC es nueva e independiente) — costo: dos migraciones por aplicar en planta (590000 y 690000).
Pendiente -> T8: EstadoCipLinea enlaza «Completar parada» a /paradas?parada=<id> (ahora pantalla de revisión sin formulario) -> debe ir al Modo Paradas de Líneas; ajustar LineaCard.test.
Task 8: implemented (627a2e3..50a6d8d, 5 commits) 616 tests ok, ensayo 16/16 PG real. Concerns: Responsable en el acta va dentro de cada viñeta (no es columna); parada que cruza 2 turnos de la misma jornada sale una vez por turno en Validar jornada con el mismo id (validación por id) -> revisar en la revisión final; FinalizarTurno no pasa finTurno (parada abierta cuenta hasta ahora).
Task 7+8: review -> Critical: usePanelTurno.ts:213 regex sin barras (tooltip total nunca sale); Important: acta «en curso» por fin===null (en turno cerrado el tramo trae fin); Minor: etiquetas 12x12 repetidas. Fix round 1 despachado (agente adca6d4fdac6c172c).
Ruling: Validar jornada con paradas que cruzan 2 turnos (mismo id en dos filas, validación por parada_id; y una T3 que sigue en D+1 no recibe validación) — comportamiento heredado de paradas_efectivas_turno/Sheet, Validar jornada solo está programado en Pruebas; NO se corrige en este rework, se informa a la dueña — costo si me equivoco: validaciones cruzadas entre turnos en Pruebas.
Task 7+8: minors diferidos: lookback de 1 día en ventanas_turnos_paradas (paradas de 2+ días); ?parada=<id> fuera de 30 días no abre nada; fecha_fin null con hora_fin pondría ventana 9999 (no verificado); totalesParadaPorLinea usa `ahora` en turnos históricos; edición in-place de 20261112590000 vale solo si no se aplicó en planta.
Task 9: textos cortos (0a1cf9b) 616 tests ok. La revisión visual (probar-app) queda para la dueña / pendiente de decidir la base local.
Task 7+8: fix round 1 (5680784, b75f156, 8545990) 620 tests ok, ensayo 17/17 PG real. Pendiente: revisión final de rama.
FINAL REVIEW (opus): veredicto «corregir primero».
  Critical C1: continuar_linea duplicada (590000 vs 20261112160000 de lectura-clara) => PGRST203, todo Continuar falla en planta. -> Task 10 (merge + reconciliar) despachado (agente a1537779599e04fdf, opus).
  Important I2: Continuar pregunta cuánto duró solo existe en lectura-clara -> Task 10.
  Important I3: Mantenimiento no funciona en Pruebas (Lineas.tsx:31, ModoParadas.tsx:98, area_de_paradas_mantenimiento devuelven ASEPTICO; Pruebas tiene interruptor ON y solo la dueña termina) -> Task 11.
  Important I4: abrir_parada_mantenimiento con la línea ya pausada por una Operacional no la enlaza; Continuar del supervisor la marca «línea continuó» -> Task 11.
  Important I5: textos «Registrar Paradas» (590000:606, EquivalenciasMantenimiento.tsx:98) -> Task 11.
  Important I6: FormTerminarParada: parada.inicio recortado al turno; minutos medidos desde el inicio recortado (raro) -> Task 11.
  Triage: PanelPausada Continuar con abierta null: puede esperar; Validar jornada cruces: informar; FinalizarTurno sin finTurno: esperar; lookback 1 día/?parada >30 días/fecha_fin null: esperar; 590000 solo editable mientras no se aplique en ninguna parte (debe seguir cierto hasta aplicar en planta).
PETICIONES DE LA DUEÑA (2026-10-26, tarde):
  - Rama final se llama `paradas-final` (git no admite espacios): renombrar al terminar Task 10, antes de subir.
  - Subir a GitHub al final y decir si todo el .sql está listo para `db push` con el .env local. Escribir un .md de traspaso para el Claude de mañana (pc del trabajo) en docs/, incluyendo: estado, migraciones por aplicar en orden, rulings, pendientes, lista de próximos reworks (Auditoría, Usuarios, Base de datos, Inventario mal hecho, Roles), nota de que el inventario viaja pegado a paradas-modo-unico, plan de limpieza de ramas (6 ya en main se pueden borrar; dudosas: inventario-materia-prima, paradas-en-vivo, modo-pruebas-supabase).
  - El .md debe decir que LO PRIMERO que el Claude de mañana le diga a la dueña es lo del Sheet de Mantenimiento: pedirle el export (equipo, código de subsistema, nombre) para sacar los códigos.
  - Task 11 añade: «Terminar parada» elige el subsistema de la lista del catálogo (paradas_subsistemas, por equipo) en vez de texto libre; Mantenimiento (rol/área MANTENIMIENTO) puede agregar/editar/desactivar subsistemas y códigos (CatalogoEquipos.tsx hoy: ver permisos); Producción NO edita ese catálogo y sigue usando Equipo + Falla (tipos). Son dos vocabularios distintos: Producción = Equipo+Falla (Panel); Mantenimiento = Equipo+subsistema/código.
  - Probar en la base `natulac` (la dueña confirmó «prueba en la base»), aplicando las migraciones nuevas una sola vez al final.
CORRECCIÓN: paradas_subsistemas YA NO EXISTE (la borró 20261064090000; las fallas pasaron a tipos por equipo). Hay que CREAR un catálogo nuevo de subsistemas por equipo (editable por Mantenimiento). Hay 39 filas en paradas_mtto_equivalencias (0 confirmadas) en la base local: mapeo equipo+subsistema del Sheet -> tipo.
CÓDIGOS EXTRAÍDOS (2026-10-26): /c/Users/andre/AppData/Local/Temp/claude/d--GitHub-ProyectoNatulac/82c7ac53-40d8-4ef0-b9d6-01a51c80fa5f/scratchpad/sheet-datos/codigos-aseptico.csv — 128 códigos limpios, 14 equipos de Aséptico (columnas equipo_sheet, codigo, nombre, usos, otros_nombres); 143 reportes del Sheet sin código; 2 ilegibles (CAP, «TRANSPORTADORES»); Vacío (396 reportes) fuera. El enlace del Sheet está en configuracion_app.sheet_mantenimiento_url (público, solo se leyó la pestaña ÁREAS). Scripts: /c/Users/andre/AppData/Local/Temp/claude/d--GitHub-ProyectoNatulac/82c7ac53-40d8-4ef0-b9d6-01a51c80fa5f/scratchpad/sheet-scripts/. Task 11: copiar el CSV a docs/codigos-mantenimiento-aseptico.csv en la rama y sembrarlo en el catálogo nuevo (equipo_sheet -> equipo del catálogo con el mapa EQUIPOS de src/lib/sheetMantenimiento.ts: A3CFLEX->A3_COMPACT_FLEX, A3FLEX->A3_FLEX, TAVIL/ROBOT TAVIL->ROBOT_TAVIL, CBP32->CARDBOARD_PACKER, FW32->FILM_WRAPPER, HELIX, DOMINO, CAP->CAP_APPLICATOR, SA->STRAW_APPLICATOR, FLEX/DRINK->FLEX_DRINK; ALCIP, ALMIX y otros sin mapa: decidir o crear equipo).
Task 10: complete (174e0b4 merge de lectura-clara + c941730), ensayo 20/20 PG real con cadena completa (150000/160000 incluidas), vitest 624. Una sola continuar_linea (5 args + guardia Mantenimiento).
DECISIÓN DE LA DUEÑA (2026-10-26): catálogo de Mantenimiento TOTALMENTE separado del de Producción (Mantenimiento es desconfiado con Producción, no quiere que le toquen su info). Cada área agrega sus códigos; trazabilidad: nunca borrar (solo desactivar), created/updated_by, auditoría, snapshot congelado en la parada. Solo Mantenimiento y la dueña editan el catálogo de Mtto; ningún rol de Producción. Producción puede VER el código en el reporte. Mensaje enviado al agente de Task 11 (aa1acf396bf2bc357).
Para la sesión de Gestión de Usuarios: Mantenimiento no confía en Producción -> separar quién ve y quién edita datos de cada área.
