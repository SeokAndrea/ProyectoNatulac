/*
 * Catálogos fijos de Producción Aséptico (áreas, roles, turnos y
 * grupos) — casi no cambian, así que siguen hardcodeados como espejo
 * de supabase/migrations/20260819120000_core_schema.sql. Líneas,
 * presentaciones, velocidades de llenadora, familias y sabores SÍ se
 * editan seguido (ver Edición de Datos) y viven en Supabase de
 * verdad — ver src/lib/catalogosLive.tsx y src/lib/sabores.ts.
 */

/*
 * AREAS y ROLES: espejo de las tablas "areas" y "roles" sembradas en
 * supabase/migrations/20260819120000_core_schema.sql. Se usan en el
 * login (src/lib/auth.tsx) y en la gestión de personal
 * (src/components/PersonalPanel.tsx).
 */
// Vacío se sacó de la app el 2026-09-25: nunca se usó y no se va a usar.
// El área VACIO sigue en la base (sin migración que la borre).
// tipo: PRODUCCION abre turnos y tiene líneas; APOYO no produce y mira la producción de Aséptico.
export const AREAS = [
  { codigo: "ASEPTICO", nombre: "Producción Aséptico", tipo: "PRODUCCION" },
  { codigo: "SERVICIOS_INDUSTRIALES", nombre: "Servicios Industriales", tipo: "APOYO" },
  { codigo: "MANTENIMIENTO", nombre: "Mantenimiento", tipo: "APOYO" },
  { codigo: "CALIDAD", nombre: "Calidad", tipo: "APOYO" },
  // Quien no es de ningún área (Presidencia, gerencias): casi siempre con Solo Vista. Migración 20261109190000.
  { codigo: "OTROS", nombre: "Otros", tipo: "APOYO" },
  { codigo: "PRUEBAS", nombre: "Área de Pruebas", tipo: "PRODUCCION" },
] as const

export type AreaCodigo = (typeof AREAS)[number]["codigo"]
export type TipoArea = (typeof AREAS)[number]["tipo"]

/** Títulos de los dos grupos de áreas (selectores de Personal, sección del Hub). */
export const TIPOS_AREA: readonly { tipo: TipoArea; nombre: string }[] = [
  { tipo: "PRODUCCION", nombre: "Producción" },
  { tipo: "APOYO", nombre: "Servicios de apoyo" },
]

/** Área productiva que miran las áreas de apoyo (Panel, Programación, catálogos). */
export const AREA_QUE_MIRA_EL_APOYO: AreaCodigo = "ASEPTICO"

/** ¿Es un área de apoyo (Calidad, Mantenimiento, Servicios Industriales)? Sin área (Super Administrador): no. */
export function esAreaDeApoyo(area: string | null | undefined): boolean {
  return AREAS.some((a) => a.codigo === area && a.tipo === "APOYO")
}

/** Roles de Calidad: solo van en el área Calidad (o en Pruebas, para probar). Migración 20261089. */
const ROLES_CALIDAD: readonly string[] = ["CALIDAD", "SUPERVISOR_CALIDAD"]

/** ¿Este rol se puede dar en esta área? Mismo criterio que el trigger trg_rol_area_calidad del servidor. */
export function rolPermitidoEnArea(rol: string, area: string | null | undefined): boolean {
  if (!area || area === "PRUEBAS") return true
  if (area === "CALIDAD") return ROLES_CALIDAD.includes(rol)
  return !ROLES_CALIDAD.includes(rol)
}

// Rework 2026-09-27: el rol es un paquete de permisos por defecto (ver
// src/lib/permisos.ts y la migración 20261078090000_roles_y_permisos.sql).
// Permisos extra por persona (ej. SubJefe = Supervisor + permisos de jefe)
// se dan desde Personal. Super Administrador (técnicos) tiene todo.
export const ROLES = [
  { codigo: "SUPERVISOR", nombre: "Supervisor" },
  { codigo: "ANALISTA", nombre: "Analista de Producción" },
  { codigo: "JEFE_PRODUCCION", nombre: "Jefe de Producción" },
  { codigo: "MANTENIMIENTO", nombre: "Mantenimiento" },
  { codigo: "CALIDAD", nombre: "Analista de Calidad" },
  { codigo: "SUPERVISOR_CALIDAD", nombre: "Supervisor de Calidad" },
  // Solo mira el Panel de Producción y el de Paradas (src/lib/rolVista.ts).
  { codigo: "VISTA", nombre: "Solo Vista" },
  // Ve todas las pantallas (menos Personal), sin poder guardar nada (src/lib/rolVista.ts).
  { codigo: "GESTION", nombre: "Sistema de Gestión" },
  { codigo: "SUPERADMINISTRADOR", nombre: "Super Administrador" },
] as const

export type RolCodigo = (typeof ROLES)[number]["codigo"]

/*
 * CARGOS: título del puesto, SOLO visual. No tiene efecto en permisos
 * (eso lo decide el rol de arriba). El mismo cargo puede ir sobre
 * roles distintos — ej. "Analista de Producción" siendo SUPERADMINISTRADOR
 * en Aséptico o SUPERVISOR en Vacío. Espejo de usuarios.cargo (texto),
 * ver supabase/migrations/20260982090000_cargo_personal.sql (texto
 * libre: sumar un cargo no lleva migración). Para sumar un cargo nuevo,
 * agregar acá una línea con las áreas donde se ofrece.
 */
const AREAS_CARGO_PRODUCCION = ["ASEPTICO", "PRUEBAS"] as const
const AREAS_CARGO_CALIDAD = ["CALIDAD", "PRUEBAS"] as const

export const CARGOS = [
  { codigo: "JEFE_PRODUCCION", nombre: "Jefe de Producción", areas: AREAS_CARGO_PRODUCCION },
  { codigo: "SUBJEFE", nombre: "Subjefe", areas: AREAS_CARGO_PRODUCCION },
  { codigo: "ANALISTA_PRODUCCION", nombre: "Analista de Producción", areas: AREAS_CARGO_PRODUCCION },
  { codigo: "SUPERVISOR", nombre: "Supervisor", areas: AREAS_CARGO_PRODUCCION },
  { codigo: "PASANTE", nombre: "Pasante / Aprendiz", areas: AREAS_CARGO_PRODUCCION },
  { codigo: "JEFE_CALIDAD", nombre: "Jefe de Calidad", areas: AREAS_CARGO_CALIDAD },
  { codigo: "SUPERVISOR_CALIDAD", nombre: "Supervisor de Calidad", areas: AREAS_CARGO_CALIDAD },
  { codigo: "ANALISTA_CALIDAD", nombre: "Analista de Calidad", areas: AREAS_CARGO_CALIDAD },
] as const

export type CargoCodigo = (typeof CARGOS)[number]["codigo"]

/** Cargos que se ofrecen en un área. Sin área elegida: todos. Mantenimiento y Servicios Industriales todavía no tienen cargos propios. */
export function cargosDeArea(area: string | null | undefined): readonly (typeof CARGOS)[number][] {
  if (!area) return CARGOS
  return CARGOS.filter((c) => (c.areas as readonly string[]).includes(area))
}

/** ¿El cargo se ofrece en esa área? Al cambiar de área, un cargo que no va ahí se limpia. */
export function cargoValeEnArea(cargo: string, area: string | null | undefined): boolean {
  return cargo === "" || cargosDeArea(area).some((c) => c.codigo === cargo)
}

export const TURNO_TIPOS = [
  { codigo: "TURNO_1", nombre: "Turno 1", horario: "7:00 a 15:00" },
  { codigo: "TURNO_2", nombre: "Turno 2", horario: "15:00 a 22:30" },
  { codigo: "TURNO_3", nombre: "Turno 3", horario: "22:30 a 7:00" },
  { codigo: "12X12", nombre: "12x12", horario: null },
] as const

export type TurnoTipoCodigo = (typeof TURNO_TIPOS)[number]["codigo"]

export const GRUPOS = [
  { codigo: "GRUPO_1", nombre: "Grupo 1" },
  { codigo: "GRUPO_2", nombre: "Grupo 2" },
  { codigo: "GRUPO_3", nombre: "Grupo 3" },
] as const

export type GrupoCodigo = (typeof GRUPOS)[number]["codigo"]

/**
 * Grupo de un turno que abrió el respaldo automático y nadie asumió: el
 * servidor devuelve este código en vez del grupo provisorio (ver
 * supabase/migrations/20261084090000_turnos_sin_grupo.sql).
 */
export const SIN_GRUPO = "SIN_GRUPO"

/** Nombre para mostrar de un grupo, incluido "Sin grupo". */
export function nombreGrupo(codigo: string | null | undefined): string {
  if (!codigo) return "—"
  if (codigo === SIN_GRUPO) return "Sin grupo"
  return GRUPOS.find((g) => g.codigo === codigo)?.nombre ?? codigo
}

/*
 * LineaCodigo es un tipo CERRADO a propósito (las líneas físicas de
 * la planta) — ver la nota en
 * supabase/migrations/20260830090000_edicion_presentaciones_velocidades_lineas.sql
 * sobre por qué "Líneas" en Edición de Datos no permite crear líneas
 * nuevas con códigos distintos a estos. LINEA_T1/T2/T3 son la
 * excepción deliberada: las 3 líneas del área PRUEBAS (ver
 * supabase/migrations/20260912090000_area_pruebas.sql) — necesitan
 * código propio porque lineas.codigo es único a nivel global, no por
 * área.
 */
export type LineaCodigo = "LINEA_1" | "LINEA_2" | "LINEA_3" | "LINEA_T1" | "LINEA_T2" | "LINEA_T3"

/** El volumen en ml, como string (ej. "1000") — ver src/lib/catalogosLive.tsx. */
export type PresentacionCodigo = string

export function nombrePorCodigo<T extends { codigo: string; nombre: string }>(
  catalogo: readonly T[],
  codigo: string,
): string {
  return catalogo.find((item) => item.codigo === codigo)?.nombre ?? codigo
}
