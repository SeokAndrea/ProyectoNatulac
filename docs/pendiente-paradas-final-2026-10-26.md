# Paradas Final: traspaso para la próxima sesión (2026-10-26 → 27)

Rama: `paradas-final` (sale de `paradas-modo-unico`, con `paradas-lectura-clara` ya mezclada).
Diseño: `docs/superpowers/specs/2026-10-26-paradas-rework-final-design.md`.
Plan: `docs/superpowers/plans/2026-10-26-paradas-rework-final.md`.
Registro de decisiones y pendientes menores: `docs/superpowers/plans/2026-10-26-paradas-final-ledger.md`.

## 0. LO PRIMERO que debe decirle Claude a la dueña

**Lo del Sheet de Mantenimiento y sus códigos.** Mantenimiento tiene su propio catálogo, separado del de
Producción (Mantenimiento no quiere que Producción toque su información). Hoy:

- Se bajó la pestaña ÁREAS del Sheet (está compartido «cualquiera con el enlace») y se sacaron **128 códigos de
  subsistema en 14 equipos de Aséptico** (`docs/codigos-mantenimiento-aseptico.csv`), ya cargados en las tablas
  `mtto_equipos` y `mtto_subsistemas`. Hay una pantalla `/codigos-mantenimiento` para que Mantenimiento (y la dueña)
  agregue, cambie o desactive códigos. Ningún rol de Producción puede escribir ahí.
- **Falta revisar con Mantenimiento** que la lista esté completa y bien escrita: el Sheet tenía errores de tipeo y
  143 reportes de Aséptico sin código (para esos existe la opción «Sin subsistema»); 2 códigos del equipo CAP
  («TRANSPORTADORES») no se pudieron leer; los 396 reportes de **Vacío** quedaron fuera.
- La dueña debe decidir si quiere también los códigos de Vacío.

## 1. Qué trae la rama

- Cada parada tiene **Responsable** explícito: Operacional o Mantenimiento (reemplaza la regla del `origen`).
- Supervisor: Líneas → Modo Paradas → **Parar** (Operacional | Mantenimiento, Equipo y Falla, Comentario).
  **Entregar PT** reemplaza «Detener línea»; el estado «Detenida» se ve **Esperando PT**.
- Mantenimiento entra directo a Líneas en Modo Paradas, ve las paradas abiertas, abre las suyas y usa
  **Terminar parada** (equipo y subsistema de **su** catálogo, ¿qué se realizó?, tiempo en minutos u hora de
  comienzo y fin). Interruptor por área «Mantenimiento termina las fallas» (Aséptico apagado, Pruebas encendido).
- Cada turno cuenta solo su tramo de una parada que cruza turnos; el total y el desglose están en el reporte.
- **Reportes de paradas** (antes Registrar Paradas): solo Jefe de Producción, Analista, Mantenimiento y dueña.
- Panel, acta y Validar jornada leen el Responsable; el acta lista todas las paradas y marca «en curso».
- Continuar pregunta cuánto duró (viene de `paradas-lectura-clara`); el Sheet queda apagado.

## 2. Migraciones por aplicar en planta (en este orden)

Las de `main` ya deberían estar. Faltan estas 8 (verificar con `scripts/revisar-migraciones-pendientes.sql`):

1. `20261112150000_origen_paradas_por_quien_registra.sql` (lectura-clara)
2. `20261112160000_continuar_con_minutos.sql` (lectura-clara)
3. `20261112190000_indicadores_dias_confirmados.sql` (inventario)
4. `20261112290000_inventario_diario.sql` (inventario)
5. `20261112390000_edicion_formulas_empaque.sql` (inventario)
6. `20261112490000_correo_en_ajustes.sql` (inventario)
7. `20261112590000_falla_por_clasificar.sql` (rework; se **editó en sitio**)
8. `20261112690000_ventanas_turnos_paradas.sql` (rework)

Cómo: en el servidor, `bash scripts/aplicar-migracion.sh <archivo> [otro ...]` (lee `.env.local`; cada archivo en una
transacción; recarga PostgREST). Después `docker compose restart api` si hace falta.

**Reglas que no se pueden romper:**
- `20261112590000` y `20261112690000` **no se deben haber aplicado nunca** en planta antes (se editaron en sitio).
- **Hay que aplicar la 2 antes de la 7**: la 7 reconstruye `continuar_linea` de 5 argumentos. Sin la 2 hay dos versiones y todo Continuar falla.
- Las migraciones 3 a 6 son del **inventario** y viajan pegadas a esta rama (viene de `inventario-integrado`).
  Si se quiere separar, hay que hacerlo antes de unir a `main`.

## 3. Estado de las pruebas

- Ensayo SQL en Postgres 17 real (cadena completa, base desechable): **26/26** (`scripts/ensayo-20261112590000.sql`).
- `npx tsc -b` limpio; `npx vitest run`: 635 pruebas verdes.
- Aplicadas las 10 migraciones nuevas a la base local `natulac` sin errores (copia de seguridad previa hecha) y
  revisada la app con fotos: Líneas (Mantenimiento y supervisor), Terminar parada, Códigos de Mantenimiento.
- **No probado:** el flujo con una línea corriendo en vivo, el Panel de Producción en teléfono con paradas reales,
  Mantenimiento en el área Pruebas, y la aplicación en planta.

## 4. Pendientes conocidos (por prioridad)

1. «Terminar parada» pide siempre el equipo y subsistema de Mantenimiento, **incluso cuando la termina el supervisor**
   con el interruptor apagado (Aséptico hoy). Debe ser opcional («Sin subsistema») si no lo termina Mantenimiento.
2. En el formulario de Parar de Mantenimiento dice «el tiempo cuenta hasta Continuar»; debe decir «hasta Terminar parada».
3. Aviso de consola «dos elementos con la misma clave» en Finalizar Turno (no atribuido al rework).
4. Validar jornada: una parada que cruza dos turnos de la misma jornada sale dos veces con el mismo id y la
   validación va por id. Solo está programado en Pruebas; informar a la dueña.
5. Menores: ventanas con búsqueda de 1 día atrás; `?parada=` fuera de 30 días no abre nada; `FinalizarTurno` no pasa
   el fin del turno; `PanelPausada` muestra Continuar si no encuentra la parada abierta; archivos grandes
   (`ModoParadas.tsx`). Detalle en el registro.

## 5. Decisiones tomadas por la dueña y por Claude

- Dueña: vocabulario A (Parar/Continuar solo para pausas; Entregar PT; Esperando PT); Responsable explícito; tiempo de
  Mantenimiento reemplaza al medido pero **un turno cerrado nunca se recalcula**; catálogo de Mantenimiento totalmente
  separado, con trazabilidad (nada se borra, auditoría, copia congelada en la parada); el tiempo de turno se ve como
  tramo y el total al pasar el cursor.
- Claude (con su costo si falla): se aceptó la migración nueva 690000 (ventanas); la parada de Mantenimiento con la
  línea ya pausada por una Operacional bloquea el Continuar del supervisor con el interruptor encendido; Validar
  jornada con cruces de turno no se tocó. Ver el registro para la lista completa.

## 6. Ramas en GitHub

- Ya dentro de `main` (se pueden borrar): `fix/paradas-linea-unificada`, `indicadores`, `lineas-cip-paradas`,
  `programacion-semanal`, `rework-edicion-datos`, `sif-inspeccion`.
- Esta rama (`paradas-final`) contiene `paradas-lectura-clara` y `paradas-modo-unico`: cuando se una, esas dos sobran.
- A decidir con la dueña: `inventario-materia-prima`, `paradas-en-vivo`, `modo-pruebas-supabase`.
- No unir nada a `main` ni borrar ramas sin permiso de la dueña.

## 7. Próximas sesiones (mismo método: brainstorming → spec → plan → subagentes)

Auditoría (cómo se muestran los datos), Gestión de Usuarios, Base de datos, **Inventario (está muy mal hecho)**, Roles.
En Gestión de Usuarios y Roles: Mantenimiento no confía en Producción; separar quién ve y quién edita los datos de cada área.

## 8. Cómo trabajar

Leer `SiempreLeer.md` (sin argentinismos ni voseo, descripciones cortas). La dueña no lee código: revisión final
importante; gastar pocos tokens (agentes de nivel medio, revisión por grupos). Probar migraciones en Postgres real con
Docker (`local/`, base desechable; nunca en `natulac` sin copia de seguridad).
