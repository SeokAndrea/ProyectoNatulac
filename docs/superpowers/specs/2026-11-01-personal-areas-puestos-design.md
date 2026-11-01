# Rework de Personal: áreas, puestos, niveles y permisos

**Fecha:** 2026-11-01 · **Estado:** diseño aprobado por la dueña, falta revisión del spec escrito.
**Une** dos reworks pendientes: «Gestión de Usuarios» y «Roles». El primer caso concreto que tiene que resolver es el **Jefe de Mantenimiento**.

## 1. Por qué

Hoy cada persona tiene tres datos que se pisan:

| Dato | Qué hace hoy | Problema |
|---|---|---|
| Rol (`roles`, `usuario_roles.rol_id`) | Da los permisos (`rol_permisos`) | Roles genéricos; no existe «Jefe de Mantenimiento» |
| Área (`usuario_roles.area_id`) | Decide de qué planta ves los datos **y además** da permisos (18 funciones preguntan «¿es del área MANTENIMIENTO?») | Un área nueva obliga a tocar código |
| Cargo (`usuarios.cargo`) | Nada (solo se muestra) | Confunde: «Jefe de Mantenimiento» es un cargo sin poderes |

Además, `PERSONAL_GESTIONAR` muestra y deja editar **a todas las personas de todas las áreas** (`listar_personal` no filtra), no hay niveles, y las áreas y cargos están copiados a mano en `src/lib/catalogos.ts`.

**Objetivo:** conceptos claros (área + puesto), jerarquía (quién gestiona a quién y qué ve cada uno), una pantalla de Personal con organigrama al estilo de Edición de Datos, y un modelo que crezca: agregar un área no debe requerir programar.

## 2. El modelo

### Persona
- **Puesto** (uno, obligatorio). El puesto trae el **área** y el **nivel**: el área no se elige aparte.
- **Título visible** (opcional, texto libre): solo de nombre, no da permisos. Ej. «Analista de Producción», «Subjefe», «Electricista». Reemplaza al cargo.
- **Permisos extra** (opcional): excepciones por persona (tabla `usuario_permisos`, ya existe).
- Se mantiene: usuario, nombre, cédula, activo, `ve_errores` (dueña), `debe_completar_perfil`, `tarjetas_ocultas`.
- Se va: `cargo` (pasa a título) y `area_origen_id` (pasa a título).

### Área
Nombre, código, tipo (Producción / Apoyo), **activa**, orden. Vive solo en la base (tabla `areas`, ya existe; se le agregan columnas). Calidad queda **inactiva**.

### Puesto
Nombre, código, área, **nivel**, lista de **permisos**, activo.

| Nivel | Nombre | Ejemplos |
|---|---|---|
| 1 | Jefatura | Jefe de Producción, Jefe de Mantenimiento |
| 2 | Coordinación | Coordinador de Producción, Supervisor de Mantenimiento |
| 3 | Operación | Supervisor, Técnico de Mantenimiento, Servicios Industriales |
| 4 | Apoyo | Pasante, Solo Vista |

Los niveles son fijos e iguales para todas las áreas. Son **niveles en la app**, no la estructura de la empresa (en la planta el Supervisor está por encima de la Analista; en la app, por debajo).

### Fuera de las áreas
- **Super Administrador:** puesto especial sin área ni nivel, con todos los permisos y el permiso nuevo **«Administrar áreas y puestos»**. Cuando exista Informática, se le da ese permiso a su puesto y no hay que programar nada.
- **La dueña** (`ve_errores`) sigue por encima de todo e intocable.

### Área de Pruebas
Un solo puesto, **Probador**, con todos los permisos sobre los datos de Pruebas (igual que hoy).

## 3. Reglas

1. **Lo que alguien puede hacer lo deciden solo los permisos** (los del puesto más los extra). El área se sigue usando para **de qué planta ves los datos** (Mantenimiento mira Aséptico; Pruebas mira Pruebas), nunca para dar permisos.
2. **Gestionar personal** (`PERSONAL_GESTIONAR`): ve y edita **solo su área**, solo personas cuyo puesto es de **nivel mayor** que el suyo (o sea, de rango menor), solo les asigna puestos de su área y de nivel mayor que el suyo, y solo da permisos extra que **él mismo tiene**. Puede: crear, editar (nombre, cédula, puesto, título), restablecer contraseña, desactivar/reactivar y dar o quitar permisos extra.
3. **Administrar áreas y puestos** (`ESTRUCTURA_GESTIONAR`, nuevo): ve y gestiona a todas las personas de todas las áreas; crea y edita áreas, puestos y sus permisos; es el único que **elimina** personas.
4. **Nadie se edita a sí mismo** el puesto ni los permisos.
5. **Áreas y puestos viven en la base**, editables desde la app. Se borran de `catalogos.ts` las copias (`AREAS`, `CARGOS`, `ROLES`); la app los lee de la base como ya hace con Líneas y Sabores.
6. Las reglas 2 a 4 las aplica **la base** (funciones SQL), no la pantalla.

## 4. Puestos iniciales y sus permisos

| Área | Puesto | Nivel | Permisos |
|---|---|---|---|
| Producción Aséptico | Jefe de Producción | 1 | Los de hoy de `JEFE_PRODUCCION` + `VALIDAR` + `REPORTES_PARADAS_VER` |
| Producción Aséptico | Coordinador de Producción | 2 | Igual que el Jefe (hoy la Analista ya tiene todo eso) |
| Producción Aséptico | Supervisor | 3 | Los de hoy de `SUPERVISOR` |
| Producción Aséptico | Pasante | 4 | Ninguno; se le dan los que haga falta |
| Mantenimiento | Jefe de Mantenimiento | 1 | `PARADAS_MANTENIMIENTO`, `SIF_GESTIONAR`, `CODIGOS_MTTO_EDITAR`, `REPORTES_PARADAS_VER`, `CATALOGO_PARADAS_VER`, **`CATALOGO_PARADAS`**, **`PERSONAL_GESTIONAR`** |
| Mantenimiento | Supervisor de Mantenimiento | 2 | Los del Técnico |
| Mantenimiento | Técnico de Mantenimiento | 3 | `PARADAS_MANTENIMIENTO`, `SIF_GESTIONAR`, `CODIGOS_MTTO_EDITAR`, `REPORTES_PARADAS_VER`, `CATALOGO_PARADAS_VER` |
| Servicios Industriales | Servicios Industriales | 3 | `LECTURAS_SI`, `CATALOGO_PARADAS_VER` |
| Otros | Solo Vista | 4 | `CATALOGO_PARADAS_VER` (los paneles los ve todo el mundo) |
| Calidad (inactiva) | Jefe, Supervisor y Analista de Calidad (inactivos) | 1, 2, 3 | Los de hoy de Calidad; solo para no perder a quien los tenga |
| Pruebas | Probador | — | Todos |
| — | Super Administrador | — | Todos + `ESTRUCTURA_GESTIONAR` |

**Permisos nuevos** (lo que hoy se decide por rol o área): `ESTRUCTURA_GESTIONAR` (administrar áreas y puestos), `LECTURAS_SI` (cargar lecturas de Servicios Industriales y ver sus registros), `CODIGOS_MTTO_EDITAR` (editar Códigos de Mantenimiento; hoy `exigir_editor_mtto` pregunta por el área) y `REPORTES_PARADAS_VER` (hoy la tarjeta va por lista de roles).

Cada permiso pertenece a un **tema** para agruparlo en pantalla: Turnos y producción, Paradas, Mantenimiento, Datos y reportes, Personas, Administración.

## 5. Paso de la gente de hoy al modelo nuevo

Automático, por rol + cargo + área actuales:

| Hoy | Puesto nuevo | Título visible |
|---|---|---|
| `JEFE_PRODUCCION` | Jefe de Producción | — |
| `ANALISTA` | Coordinador de Producción | «Analista de Producción» |
| cualquier rol con cargo `SUBJEFE` en Aséptico | Coordinador de Producción | «Subjefe» |
| `SUPERVISOR` en Aséptico (o sin área) | Supervisor | — |
| cargo `PASANTE` | Pasante | — |
| `MANTENIMIENTO` con cargo `JEFE_MANTENIMIENTO` | Jefe de Mantenimiento | — |
| `MANTENIMIENTO` con cargo `SUPERVISOR_MANTENIMIENTO` | Supervisor de Mantenimiento | — |
| `MANTENIMIENTO` (otro cargo o ninguno) | Técnico de Mantenimiento | — |
| `SERVICIOS_INDUSTRIALES` | Servicios Industriales | — |
| `VISTA` | Solo Vista | el área de origen, si tenía (ej. «Presidencia») |
| `CALIDAD` / `SUPERVISOR_CALIDAD` fuera de Pruebas | Analista / Supervisor de Calidad (inactivos) | — |
| cualquiera con área Pruebas | Probador | — |
| `SUPERADMINISTRADOR` | Super Administrador | — |

- Los **permisos extra** de cada persona se conservan.
- Cualquier combinación que no esté en la tabla **frena la migración** con la lista de casos, en vez de adivinar.
- **Antes de aplicar en planta:** ensayo en una base local desechable que genera la lista «persona → puesto nuevo» para que la dueña la revise.

## 6. Pantallas

### Personal (organigrama al centro, maqueta B)
Esqueleto de Edición de Datos:
- **Izquierda:** las áreas, con cuántas personas tiene cada una. Las inactivas, en gris. Abajo, «Administración › Áreas y puestos». **Solo lo ve quien administra.** Un jefe no tiene menú: entra directo a su área.
- **Centro:** el organigrama del área, con una franja por nivel (Jefatura, Coordinación, Operación, Apoyo) y una tarjeta por persona (nombre, puesto, título). Las inactivas, atenuadas. Arriba: buscador (resalta la tarjeta), botón «Tabla» (la misma gente en tabla agrupada por nivel, para buscar en áreas grandes) y «+ Persona».
- **Derecha:** el panel de la persona elegida: puesto (solo los que el usuario puede dar), título visible, nombre, cédula, usuario (solo al crear), contraseña inicial (solo al crear), permisos del puesto (solo lectura), permisos extra (casillas, solo los que el usuario tiene), «Guardar», «Restablecer contraseña», «Desactivar»/«Reactivar» y, solo para quien administra, «Eliminar» con confirmación.
- **Teléfono:** el menú pasa a una fila deslizable arriba, las franjas se apilan y el panel se abre a pantalla completa.

### Áreas y puestos (matriz, maqueta B)
Solo para `ESTRUCTURA_GESTIONAR`.
- **Izquierda:** las áreas y «+ Área».
- **Centro:** encabezado del área (nombre, tipo, activa) con «Editar área» y «+ Puesto» (nombre y nivel). Debajo, la **matriz**: puestos en columnas (con su nivel), permisos en filas agrupados por tema, casillas para marcar. «Guardar cambios» guarda todo junto y dice cuántos cambios hay.
- El Super Administrador y el Probador no aparecen en la matriz: tienen todos los permisos y no se editan.
- Un puesto **con gente no se puede borrar**: solo desactivar. Desactivado, no se ofrece para gente nueva.

### Inicio y resto de la app
- Las tarjetas se muestran **solo por permisos**. Desaparecen `rolesPermitidos` y `rolesExcluidos` de `src/lib/apps.tsx` y de `src/App.tsx`.
- «Ver como» (dueña) pasa a ser «Ver como un puesto».
- La sesión (`perfil_sesion`) trae puesto, nivel, área, título y permisos efectivos.

## 7. Seguridad y auditoría
- Todas las reglas de la sección 3 se aplican en funciones SQL `security definer`, como hoy (`crear_usuario`, `editar_personal`, `puede_gestionar_personal`, etc.).
- `tiene_permiso()` pasa a leer **puesto + extras**. Quitarle un permiso a un puesto vale en el momento para todos.
- Cada cambio de persona, puesto, permisos de puesto o área queda en Auditoría con antes y después (`registrar_auditoria`).

## 8. Casos borde
- **Quedarse sin quien gestione un área:** al desactivar o cambiar de puesto a la última persona con `PERSONAL_GESTIONAR` de un área, la app avisa (no bloquea: quien administra puede gestionarla igual).
- **Bajar de nivel un puesto con gente:** se permite; la regla de gestión se recalcula sola.
- **Mover un puesto de área:** no se permite. Se crea uno nuevo y se reasigna la gente.
- **Un jefe intenta darse más permisos o subir de nivel:** la base lo rechaza (regla 4).
- **Persona con puesto inactivo:** sigue entrando con sus permisos; no se ofrece ese puesto para nadie más.
- **La dueña** no aparece como editable para nadie más.

## 9. Fases

### Fase 1: modelo, Personal y organigrama
1. Migración: columnas nuevas en `areas`, tablas `puestos` y `puesto_permisos`, `usuarios.puesto_id` y `usuarios.titulo`, permisos nuevos y sus temas, puestos iniciales y paso de la gente (sección 5).
2. **Compatibilidad:** cada puesto guarda un **rol equivalente**. Un trigger mantiene `usuario_roles` (rol y área) sincronizado con el puesto, así las 62 funciones SQL y los 29 archivos que todavía preguntan por rol o área siguen andando sin cambios.
3. `tiene_permiso()` y `permisos_de()` pasan a puesto + extras.
4. Funciones de personal con las reglas nuevas: listar, crear, editar, contraseña, desactivar, permisos extra y eliminar.
5. Funciones de estructura: áreas, puestos y permisos de puesto.
6. Los cuatro permisos nuevos reemplazan sus chequeos por rol o área (`exigir_editor_mtto`, lecturas de SI, tarjeta de Reportes de paradas).
7. Pantallas: Personal (organigrama + tabla + panel) y Áreas y puestos (matriz).
8. Tarjetas del inicio y rutas por permisos; «Ver como un puesto».
9. Se borran las copias de `AREAS`, `CARGOS` y `ROLES` en `catalogos.ts`.

**Al terminar la Fase 1, el Jefe de Mantenimiento funciona:** edita el Catálogo de Paradas y gestiona solo a su gente.

### Fase 2: todo por permisos
Las 62 funciones SQL y los 29 archivos que preguntan por código de rol o por área para decidir **qué se puede hacer** pasan a preguntar por permisos. Las que usan el área para decidir **qué datos se ven** se quedan. Al terminar se quitan el rol equivalente, `roles`, `rol_permisos` y `usuarios.cargo`. Tiene su propio plan.

## 10. Pruebas
- **Base (SQL), una prueba por regla:** el jefe no ve otra área; no crea ni edita un nivel igual o mayor al suyo; no da un permiso que no tiene; no se edita a sí mismo; solo quien administra elimina; un puesto con gente no se borra; quitar un permiso a un puesto se nota en `tiene_permiso` al momento.
- **Migración:** el ensayo en base local desechable con la lista persona → puesto; una combinación desconocida frena con su lista.
- **Compatibilidad:** después de migrar, `usuario_roles` de cada persona coincide con el de antes.
- **Pantallas:** tests de Personal (jefe sin menú y con solo su área, opciones de puesto limitadas, permisos extra limitados) y de la matriz (guardar varios cambios juntos).
- **Revisión final** del código por grupos, como en el rework de Paradas.

## 11. Fuera de alcance
- Frecuencia de las SIF configurable por día, turno o semana (trabajo aparte; usará el puesto Jefe de Mantenimiento).
- Resumen de Reportes de paradas estilo SIF.
- «Anotar parada pasada» (ya aprobado aparte).
- Puestos de Producción Vacío.
- Organigrama de la empresa (reporta a): el organigrama es el de la app.
