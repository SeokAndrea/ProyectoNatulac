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
| Textos de "Añadir Personal" | `src/pages/apps/AnadirPersonal.tsx` |

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
| Presentaciones (tamaño de envase y empaque) | `src/lib/catalogos.ts` → `PRESENTACIONES` |
| Familias de producto (Clásicos, Premium, etc.) y sabores | `src/lib/catalogos.ts` → `FAMILIAS_PRODUCTO` / `SABORES` |
| Velocidades de llenadora por línea + presentación | `src/lib/catalogos.ts` → `VELOCIDADES_LLENADORA` (falta la de 500 ml en todas las líneas) |
| Áreas | `src/lib/catalogos.ts` → `AREAS` |
| Roles (Supervisor, Administrador de Área, Super Administrador) | `src/lib/catalogos.ts` → `ROLES` |

Estos catálogos son una copia local mientras no hay conexión a la base
de datos real. Cuando se conecte Supabase, tienen que reemplazarse por
consultas a las tablas del mismo nombre en `supabase/migrations/`.

## Rutas y navegación

| Qué querés cambiar | Archivo |
|---|---|
| Qué tarjetas aparecen en el hub, en qué orden, si requieren turno iniciado, y a qué roles se les muestra | `src/lib/apps.tsx` |
| A qué URL corresponde cada página, y a qué roles (`rolesPermitidos` tiene que coincidir con el de `apps.tsx`) | `src/App.tsx` |

## Comportamiento / lógica

| Qué querés cambiar | Archivo |
|---|---|
| Cómo funciona el login (contra la tabla "usuarios" de Supabase) | `src/lib/auth.tsx` |
| El turno activo, líneas, presentación, y los contadores registrados | `src/lib/turno.tsx` |
| Alta y listado de personal (usuario, contraseña, área, rol) | `src/lib/personal.ts` |
| Fórmulas de la calculadora (cuando se agreguen) | `src/pages/apps/Calculadora.tsx` (ver el comentario ahí con los pasos) |

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
