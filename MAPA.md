# Mapa del proyecto

Guía rápida: "quiero cambiar X → andá al archivo Y". Todas las rutas son
relativas a la raíz del proyecto.

**Actualizado por última vez el 2026-09-11** — de acá para abajo refleja
el estado real del código. Si algo no coincide con lo que ves en el
repo, seguí el código, no este documento, y si tenés un momento
actualizá la fila.

## Arquitectura actual (rework de 3 módulos, ver `plan-rework-3-modulos-y-merma.md`)

El turno ya NO vive en un solo `TurnoProvider`/`turno.tsx` (ese archivo
sigue existiendo pero cada vez con menos código propio — se vacía de a
poco, ver Fase 4 del plan). Hoy son 3 módulos de dominio + una capa de
Reportes, cada uno dueño de sus tablas:

| Módulo | Dueño de | Carpeta |
|---|---|---|
| **Preparación** | tanques, lotes | `src/lib/preparacion/` (`tipos.ts`, `nucleo.ts`, `ajustes.ts`, `mapear.ts`, `usePreparacion.ts`) |
| **Producción** | líneas, corridas, contadores | `src/lib/produccion/` (mismo patrón) |
| **Producto Terminado** | registros de PT | `src/lib/productoTerminado.ts` (todavía archivo único) |
| **Reportes** | nada propio — compone los 3 para calcular merma/meta | `src/lib/reportes/` (`teorico.ts`, `realidadPreparacion.ts`, `realidadProduccion.ts`, `index.ts`) |

`src/lib/sesionTurno.tsx` (`SesionTurnoProvider`, montado en `main.tsx`)
da la identidad del turno (quién, cuál turno, área) a los 3 módulos —
es lo que reemplazó al viejo `TurnoProvider` como fuente de "qué turno
está activo". `src/lib/tiempoPlanta.ts` centraliza fecha/hora de planta
(America/Caracas) — evitar `new Date()` suelto en código nuevo.

El módulo **Paradas** (downtime de líneas) es una iniciativa aparte,
todavía en FASE A′ (UI contra fixture, gated a Área de Pruebas) — ver
`plan-paradas.md`.

## Marca / branding

| Qué querés cambiar | Archivo |
|---|---|
| Ícono de la app y de la pestaña del navegador | `public/IconoNatulac.png` (reemplazá el archivo, mismo nombre — no hay que tocar código) |
| Nombre "Natulac" en el header | `src/components/Logo.tsx` |
| Título de la pestaña del navegador | `index.html` (etiqueta `<title>`) |

## Textos / contenido

| Qué querés cambiar | Archivo |
|---|---|
| Textos del login | `src/pages/Login.tsx` |
| Textos del hub (saludo, descripciones de las tarjetas) | `src/pages/Hub.tsx` y `src/lib/apps.tsx` |
| Textos de "Comenzar Turno" | `src/pages/apps/ComenzarTurno.tsx` |
| Textos de "Status" (Recepción: confirmar/corregir lo heredado del turno anterior) | `src/pages/apps/Status.tsx`, `src/components/EstadoPlantaTabs.tsx` (`modo="status"`) |
| Textos de "Preparación" (iniciar/liberar/ajustar/transferir/desvasar un lote) | `src/pages/apps/Preparacion.tsx`, `src/components/EstadoPlantaTabs.tsx` (`modo="preparacion"`) |
| Textos de "Líneas" (activar/pausar/detener una corrida) | `src/pages/apps/Lineas.tsx`, `src/components/LineasEstadoPlanta.tsx` |
| Textos de "Producto Terminado" | `src/pages/apps/ProductoTerminado.tsx` |
| Textos de "Finalizar Turno" | `src/pages/apps/FinalizarTurno.tsx` |
| Textos del Panel de Producción (tanques en vivo, líneas, merma, Resumen de Planta) | `src/pages/apps/PanelProduccion.tsx` |
| Textos de "Registrar Paradas" / "Panel de Paradas" (FASE A′, ver `plan-paradas.md`) | `src/pages/apps/Paradas.tsx`, `src/components/RegistroParadas.tsx`, `src/pages/apps/PanelParadas.tsx`, `src/components/PanelParadasVista.tsx` |
| Textos de "Programación" | `src/pages/apps/Programacion.tsx` |
| Textos de "Servicios Industriales" | `src/pages/apps/ServiciosIndustriales.tsx` |
| Textos de "Validar" (revisión post-turno, VALIDAR) | `src/pages/apps/Validar.tsx`, `src/components/ValidarLista.tsx` |
| Textos de "Edición de Datos" | `src/pages/apps/EdicionDatos.tsx` |
| Textos de "Personal" (administradores de área) | `src/pages/apps/Personal.tsx`, `src/components/PersonalPanel.tsx` |
| Textos de "Auditoría" (buscar turnos pasados, Super Administrador) | `src/pages/apps/Historial.tsx`, `src/components/AuditoriaTurnos.tsx` |

## Estilo / apariencia

| Qué querés cambiar | Archivo |
|---|---|
| Colores (primario, fondo, estados success/warning/danger, colores de sabor) | `src/index.css` (bloques `:root` y `.dark`) — paleta adoptada de github.com/SeokAndrea/brew-flow-monitor (dashboard de referencia hecho en Lovable), reemplaza la marca azul anterior de Natulac |
| Tamaño de esquinas redondeadas | `src/index.css` → variable `--radius` |
| Tipografía | `src/index.css` → `--font-sans` (IBM Plex Sans) / `--font-mono` (JetBrains Mono, para números tabulares — clase utilitaria `num`) |
| Apariencia de un componente puntual (botón, tarjeta, input...) | `src/components/ui/` (uno por componente, son de shadcn/ui) |
| Panel de Producción en vivo (tanques con nivel animado, Meta calculada, merma, por línea — con selector de fecha/turno para ver turnos viejos; abajo, Resumen de Planta con rango de fechas, Por Grupo y Por Supervisor) | `src/pages/apps/PanelProduccion.tsx`, `src/lib/panelProduccion.ts`, `src/lib/estadisticas.ts` |

## Catálogos (listas de opciones)

| Qué querés cambiar | Archivo |
|---|---|
| Tipos de turno (Turno 1/2/3, 12x12) y sus horarios | `src/lib/catalogos.ts` → `TURNO_TIPOS` |
| Grupos | `src/lib/catalogos.ts` → `GRUPOS` |
| Presentaciones (tamaño de envase y empaque) | Edición de Datos → pestaña Presentaciones (Supabase real, `src/lib/catalogosLive.tsx` + `src/lib/presentaciones.ts`) |
| Familias de producto y sabores | Edición de Datos → pestaña Sabores (Supabase real, `src/lib/sabores.ts`) |
| Velocidades de llenadora por línea + presentación | Edición de Datos → pestaña Velocidades (Supabase real, `src/lib/catalogosLive.tsx` + `src/lib/velocidades.ts`; Línea 1 = TB, Línea 2/3 = TP) |
| Líneas (nombre, activa/inactiva — el código no se puede cambiar) | Edición de Datos → pestaña Líneas (Supabase real, `src/lib/lineas.ts`) |
| Áreas | `src/lib/catalogos.ts` → `AREAS` |
| Roles (Supervisor, Administrador de Área, Super Administrador) | `src/lib/catalogos.ts` → `ROLES` |

Áreas, Roles, Tipos de turno y Grupos siguen como copia local
(cambian poquísimo). Líneas, Presentaciones, Velocidades y Sabores YA
están conectados a Supabase de verdad: se cargan una vez en
`CatalogosProvider` (`src/lib/catalogosLive.tsx`, montado en
`main.tsx`) y todo el resto de la app (Comenzar Turno, el banner de
estado, el acta de Finalizar Turno) los lee de ahí — al editar algo en
Edición de Datos, se refleja en el resto de la app sin recargar la
página (cada pestaña llama a `recargar()` del contexto).

## Rutas y navegación

| Qué querés cambiar | Archivo |
|---|---|
| Qué tarjetas aparecen en el hub, en qué orden, si requieren turno iniciado, y a qué roles se les muestra | `src/lib/apps.tsx` |
| A qué URL corresponde cada página, y a qué roles (`rolesPermitidos` tiene que coincidir con el de `apps.tsx`) | `src/App.tsx` |

## Comportamiento / lógica

| Qué querés cambiar | Archivo |
|---|---|
| Cómo funciona el login (contra la tabla "usuarios" de Supabase) | `src/lib/auth.tsx` |
| Identidad del turno activo (quién, cuál turno, área) — la usan los 3 módulos | `src/lib/sesionTurno.tsx` (`SesionTurnoProvider`/`useSesionTurno`) |
| Fecha/hora de planta (America/Caracas) — usar esto en vez de `new Date()` suelto | `src/lib/tiempoPlanta.ts` |
| Tanques y lotes: iniciar preparación, liberar, ajustar, transferir, desvasar, medir tanque, fijar volumen real | `src/lib/preparacion/` (`nucleo.ts` = ciclo normal, `ajustes.ts` = correcciones/excepciones), `src/lib/preparacion/usePreparacion.ts` |
| Líneas, corridas y contadores: activar/pausar/continuar/terminar una corrida, registrar contador | `src/lib/produccion/` (mismo patrón núcleo/ajustes), `src/lib/produccion/useProduccion.ts` |
| Producto Terminado: registrar paletas/cajas al cerrar una corrida (un total por corrida, sin entregas parciales) | `src/lib/productoTerminado.ts` |
| Merma / meta / eficiencia (compone los 3 módulos, no calcula nada por sí mismo) | `src/lib/reportes/` (`teorico.ts` = fórmulas puras, `realidadPreparacion.ts` / `realidadProduccion.ts` = qué entra al cálculo, `index.ts` = compone) |
| Alta, edición, reseteo de contraseña y baja de personal — filtrado por área en Postgres (no solo en la interfaz): ADMINISTRADOR_AREA solo ve/edita la suya, SUPERADMINISTRADOR ve todas | `src/lib/personal.ts`, `src/components/PersonalPanel.tsx` (usado por `Personal.tsx` y por la pestaña Personal de `EdicionDatos.tsx`) |
| Edición de catálogos generales — sabores, personal, presentaciones, velocidades, líneas (solo SUPERADMINISTRADOR) | `src/pages/apps/EdicionDatos.tsx`, `src/lib/catalogosLive.tsx` |
| Historial del turno en curso (Hora - Sección - Qué, dentro de Finalizar Turno; NO va en el PDF) | `src/lib/historial.ts` → `construirHistorial` |
| Checklist antes de finalizar turno (qué falta cargar) | `src/pages/apps/FinalizarTurno.tsx` → `itemsChecklist` |
| Acta de turno en PDF (resumen estilizado; usa la impresión del navegador, no una librería) | `src/lib/actaPdf.ts`, botón "Generar Acta" en Finalizar Turno y en Auditoría |
| Auditoría: buscar cualquier turno pasado por supervisor/fecha (solo Super Administrador/Administrador de Área) | `src/pages/apps/Historial.tsx`, `src/components/AuditoriaTurnos.tsx`, `src/lib/historialTurnos.ts`, `src/lib/auditoriaVista.ts` |
| VALIDAR: revisión post-turno, marca posibles duplicados/turnos sin PT | `src/pages/apps/Validar.tsx`, `src/components/ValidarLista.tsx`, `src/lib/validacion.ts` |
| Eliminar personal (borrado real, no solo desactivar; con "forzar" para limpiar usuarios de prueba con turnos) | `src/components/PersonalPanel.tsx`, `src/lib/personal.ts` → `eliminarPersonal` |
| Resumen de Planta / Por Grupo / Por Supervisor (merma, horas, litros) — dentro de Panel de Producción; ver `resumen-diseno-dashboard-natulac.md` para el diseño completo pendiente | `src/pages/apps/PanelProduccion.tsx`, `src/lib/estadisticas.ts` |
| Status y Preparación (misma UI compartida — Status es Recepción: confirmar/corregir lo heredado del turno anterior; Preparación está disponible todo el turno). Condición de tanque real: `LISTO` \| `SUCIO` \| `EN_PREPARACION` \| `STANDBY` \| `CIP` \| `LIMPIO` (candidato a fusionar SUCIO+STANDBY, ver plan Fase 1) | `src/components/EstadoPlantaTabs.tsx` (`modo="status"` / `modo="preparacion"`), `src/pages/apps/Status.tsx`, `src/pages/apps/Preparacion.tsx` |
| Líneas: activar corrida, Parada Operacional (+motivo), Detener línea (dos pasos: detener deja `ESPERANDO_PT`, cargar el PT es lo único que cierra) | `src/pages/apps/Lineas.tsx`, `src/components/LineasEstadoPlanta.tsx` |
| Comenzar Turno (solo Turno tipo + Grupo — al confirmar manda derecho a Status) | `src/pages/apps/ComenzarTurno.tsx`, `src/components/TanqueEditForm.tsx` |
| Paradas (downtime de líneas) — iniciativa aparte, FASE A′ contra fixture, ver `plan-paradas.md` | `src/lib/paradas.ts`, `src/pages/apps/Paradas.tsx`, `src/components/RegistroParadas.tsx`, `src/pages/apps/PanelParadas.tsx`, `src/components/PanelParadasVista.tsx` |

## Piezas compartidas entre páginas

| Componente | Dónde se usa |
|---|---|
| `src/components/AppHeader.tsx` | Header superior + banner de Área/Rol/Turno, usado por Hub y AppShell |
| `src/components/EstadoBanner.tsx` | La franja de Área/Rol/Turno en sí |
| `src/components/AppShell.tsx` | El layout de cada página interna (todas menos Hub y Login) |
| `src/components/ResumenTurno.tsx` | La grilla con los datos del turno (usada en Finalizar Turno) |
| `src/components/ListaContadores.tsx` | La lista de contadores por línea (Producto Terminado y Finalizar Turno) |
| `src/components/EstadoPlantaTabs.tsx` | Tarjetas de tanque, compartidas entre Status (`modo="status"`) y Preparación (`modo="preparacion"`) |
| `src/components/TanqueEditForm.tsx` | Formulario de confirmar/editar un tanque heredado (Status, Comenzar Turno) |
| `src/components/MedirTanqueInline.tsx` | "Medir tanque" / "Fijar volumen real" — relectura física del volumen de un lote |
| `src/components/ConfirmarEstadoTanque.tsx` | Confirmar sin editar un tanque heredado tal cual está |
| `src/components/LineasEstadoPlanta.tsx` | Tarjetas de línea/corrida, usadas por la página Líneas |

## Base de datos

| Qué | Dónde |
|---|---|
| Esquema SQL (tablas, auditoría, reglas de merma) | `supabase/migrations/` |
| Resumen legible de tablas, funciones y datos sembrados (para consulta rápida, no se ejecuta) | `supabase/ESQUEMA.md` |
| Usuarios y contraseñas (tabla propia, NO Supabase Auth — contraseñas hasheadas con pgcrypto) | `supabase/migrations/20260822090000_usuarios_tabla_propia.sql` |
| Cliente de Supabase para el frontend | `src/lib/supabase.ts` |
| Credenciales (no se suben a git) | `.env.local` (copiar desde `.env.example`) |

Login, alta y listado de personal NO tocan la tabla "usuarios" directo
(tiene Row Level Security sin políticas, así que está bloqueada para
cualquiera): pasan por tres funciones de Postgres —
`verificar_login`, `crear_usuario`, `listar_personal` — que son las
únicas con permiso para leer/escribir ahí y las únicas que tocan
`password_hash`. El frontend nunca ve una contraseña ni un hash.

## Regla general

Si el cambio es de **contenido** (qué dice, qué opciones hay) casi
siempre está en `src/lib/` o directamente en la página dentro de
`src/pages/`. Si es de **estilo** (colores, tamaños, espaciados) casi
siempre está en `src/index.css` o en las clases de Tailwind dentro del
componente. Si es de **comportamiento** (qué pasa al hacer clic, qué
se guarda) está en `src/lib/auth.tsx` o en el módulo de dominio que
corresponda (`src/lib/preparacion/`, `src/lib/produccion/`,
`src/lib/productoTerminado.ts` — ver "Arquitectura actual" arriba).
`src/lib/turno.tsx` todavía existe pero se está vaciando de a poco
(Fase 4 del rework) — si buscás algo ahí y ya no está, es porque se
mudó a uno de los 3 módulos.
