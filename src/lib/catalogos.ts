/*
 * Catálogos fijos de Producción Aséptico (áreas, roles, turnos y
 * grupos) — casi no cambian, así que siguen hardcodeados como espejo
 * de supabase/migrations/20260819120000_core_schema.sql. Líneas,
 * presentaciones, velocidades de llenadora, familias y sabores SÍ se
 * editan seguido (ver Edición de Datos) y viven en Supabase de
 * verdad — ver src/lib/catalogosLive.tsx y src/lib/sabores.ts.
 */

/*
 * Las áreas (y sus nombres) viven en la base: se leen con
 * useCatalogosLive().areas — ver src/lib/catalogosLive.tsx y
 * src/lib/estructura.ts. Acá solo queda lo que no cambia.
 */
export type AreaCodigo = string
export type TipoArea = "PRODUCCION" | "APOYO"

/** Títulos de los dos grupos de áreas (selectores, sección del Hub). */
export const TIPOS_AREA: readonly { tipo: TipoArea; nombre: string }[] = [
  { tipo: "PRODUCCION", nombre: "Producción" },
  { tipo: "APOYO", nombre: "Servicios de apoyo" },
]

/** Área productiva que miran las áreas de apoyo (Panel, Programación, catálogos). */
export const AREA_QUE_MIRA_EL_APOYO: AreaCodigo = "ASEPTICO"

/** Tipo de cada área según la base; lo llena CatalogosProvider al cargar las áreas. */
let tiposDeArea = new Map<string, string>()

/** Guarda el tipo de cada área (vacío = todavía sin cargar: vale la lista fija de abajo). */
export function registrarTiposDeArea(areas: readonly { codigo: string; tipo: string }[]) {
  tiposDeArea = new Map(areas.map((a) => [a.codigo, a.tipo]))
}

/**
 * ¿Es un área de apoyo (Calidad, Mantenimiento, Servicios Industriales y las que se creen de tipo APOYO)?
 * Sin área (Super Administrador): no. Antes de cargar las áreas valen las cuatro de siempre.
 */
export function esAreaDeApoyo(area: string | null | undefined): boolean {
  if (!area) return false
  const tipo = tiposDeArea.get(area)
  if (tipo) return tipo === "APOYO"
  return area === "SERVICIOS_INDUSTRIALES" || area === "MANTENIMIENTO" || area === "CALIDAD" || area === "OTROS"
}

// Rework 2026-09-27: el rol es un paquete de permisos por defecto (ver
// src/lib/permisos.ts y la migración 20261078090000_roles_y_permisos.sql).
// Permisos extra por persona (ej. SubJefe = Supervisor + permisos de jefe)
// se dan desde Personal. Super Administrador (técnicos) tiene todo.
// El rol ya no se elige en la app: sale del puesto (permisos_de_puesto, «Ver como» un puesto).
export type RolCodigo =
  | "SUPERVISOR"
  | "ANALISTA"
  | "JEFE_PRODUCCION"
  | "MANTENIMIENTO"
  | "CALIDAD"
  | "SUPERVISOR_CALIDAD"
  | "SERVICIOS_INDUSTRIALES"
  | "VISTA"
  | "SUPERADMINISTRADOR"

/** Nombre de cada rol (tabla roles), para mostrar el rol equivalente de un puesto. */
export const NOMBRES_ROL: Record<RolCodigo, string> = {
  SUPERVISOR: "Supervisor",
  ANALISTA: "Analista de Producción",
  JEFE_PRODUCCION: "Jefe de Producción",
  MANTENIMIENTO: "Mantenimiento",
  CALIDAD: "Analista de Calidad",
  SUPERVISOR_CALIDAD: "Supervisor de Calidad",
  SERVICIOS_INDUSTRIALES: "Servicios Industriales",
  VISTA: "Solo Vista",
  SUPERADMINISTRADOR: "Super Administrador",
}

/** usuarios.cargo guarda un código (JEFE_PRODUCCION) o texto libre: el código se escribe legible. */
export function rotuloCargo(cargo: string): string {
  if (!/^[A-Z0-9_]+$/.test(cargo)) return cargo
  const texto = cargo.toLowerCase().replace(/_/g, " ")
  return texto.charAt(0).toUpperCase() + texto.slice(1)
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
