# Mapa del proyecto

Guía rápida: "quiero cambiar X → andá al archivo Y". Todas las rutas son
relativas a la raíz del proyecto.

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
| Textos de "Producto Terminado" | `src/pages/apps/ProductoTerminado.tsx` |
| Textos de "Contadores y Merma" | `src/pages/apps/ContadoresMerma.tsx` |
| Textos de "Finalizar Turno" | `src/pages/apps/FinalizarTurno.tsx` |
| Textos de "Mis Estadísticas" / "Dashboard de Planta" | `src/pages/apps/MisEstadisticas.tsx` |
| Textos de "Calculadora" | `src/pages/apps/Calculadora.tsx` |
| Textos de "Edición de Datos" | `src/pages/apps/EdicionDatos.tsx` |
| Textos de "Personal" (administradores de área) | `src/pages/apps/Personal.tsx`, `src/components/PersonalPanel.tsx` |

## Estilo / apariencia

| Qué querés cambiar | Archivo |
|---|---|
| Colores (primario, fondo, etc.) | `src/index.css` (bloques `:root` y `.dark`, con comentario explicando cada valor) |
| Tamaño de esquinas redondeadas | `src/index.css` → variable `--radius` |
| Tipografía | `src/index.css` → `--font-sans` |
| Apariencia de un componente puntual (botón, tarjeta, input...) | `src/components/ui/` (uno por componente, son de shadcn/ui) |

## Catálogos (listas de opciones)

| Qué querés cambiar | Archivo |
|---|---|
| Tipos de turno (Turno 1/2/3, 12x12) y sus horarios | `src/lib/catalogos.ts` → `TURNO_TIPOS` |
| Grupos | `src/lib/catalogos.ts` → `GRUPOS` |
| Líneas de producción | `src/lib/catalogos.ts` → `LINEAS` |
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
| El turno activo, líneas, presentación, Recepción de tanques, y los contadores registrados (conectado a Supabase) | `src/lib/turno.tsx` |
| Alta, edición, reseteo de contraseña y baja de personal — filtrado por área en Postgres (no solo en la interfaz): ADMINISTRADOR_AREA solo ve/edita la suya, SUPERADMINISTRADOR ve todas | `src/lib/personal.ts`, `src/components/PersonalPanel.tsx` (usado por `Personal.tsx` y por la pestaña Personal de `EdicionDatos.tsx`) |
| Edición de catálogos generales — sabores, personal, presentaciones, velocidades, líneas (solo SUPERADMINISTRADOR) | `src/pages/apps/EdicionDatos.tsx`, `src/lib/catalogosLive.tsx` |
| Fórmulas de la calculadora (cuando se agreguen) | `src/pages/apps/Calculadora.tsx` (ver el comentario ahí con los pasos) |
| Producto Terminado (paletas + cajas sueltas por línea, una vez al finalizar turno) | `src/pages/apps/ProductoTerminado.tsx`, `src/lib/turno.tsx` → `registrarProductoTerminado` |
| Historial del turno en curso (Hora - Sección - Qué, dentro de Finalizar Turno; NO va en el PDF) | `src/lib/historial.ts` → `construirHistorial` |
| Checklist antes de finalizar turno (qué falta cargar) | `src/pages/apps/FinalizarTurno.tsx` → `itemsChecklist` |
| Acta de turno en PDF (resumen estilizado; usa la impresión del navegador, no una librería) | `src/components/ActaTurno.tsx`, botón "Generar Acta" en Finalizar Turno y en Auditoría |
| Auditoría: buscar/eliminar cualquier turno pasado por supervisor/fecha (solo Super Administrador) | `src/pages/apps/Historial.tsx`, `src/lib/historialTurnos.ts` |
| Eliminar personal (borrado real, no solo desactivar; con "forzar" para limpiar usuarios de prueba con turnos) | `src/components/PersonalPanel.tsx`, `src/lib/personal.ts` → `eliminarPersonal` |
| Dashboard de Planta / Mis Estadísticas (merma teórica vs real, horas de producción) — primera versión, ver `resumen-diseno-dashboard-natulac.md` para el diseño completo pendiente | `src/pages/apps/MisEstadisticas.tsx`, `src/lib/estadisticas.ts` |
| Generador de datos de prueba (turnos completos para 3 supervisores ficticios, botón en Mis Estadísticas, solo Super Administrador) | `src/lib/datosPrueba.ts` |

## Piezas compartidas entre páginas

| Componente | Dónde se usa |
|---|---|
| `src/components/AppHeader.tsx` | Header superior + banner de Área/Rol/Turno, usado por Hub y AppShell |
| `src/components/EstadoBanner.tsx` | La franja de Área/Rol/Turno en sí |
| `src/components/AppShell.tsx` | El layout de cada página interna (todas menos Hub y Login) |
| `src/components/ResumenTurno.tsx` | La grilla con los datos del turno (usada en Finalizar Turno) |
| `src/components/ListaContadores.tsx` | La lista de contadores por línea (Producto Terminado y Finalizar Turno) |

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
se guarda) está en `src/lib/auth.tsx` o `src/lib/turno.tsx`.
