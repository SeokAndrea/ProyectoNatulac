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
export const AREAS = [
  { codigo: "ASEPTICO", nombre: "Producción Aséptico" },
  { codigo: "VACIO", nombre: "Producción Vacío" },
  { codigo: "SERVICIOS_INDUSTRIALES", nombre: "Servicios Industriales" },
  { codigo: "MANTENIMIENTO", nombre: "Mantenimiento" },
  { codigo: "PRUEBAS", nombre: "Área de Pruebas" },
] as const

export type AreaCodigo = (typeof AREAS)[number]["codigo"]

export const ROLES = [
  { codigo: "SUPERVISOR", nombre: "Supervisor" },
  { codigo: "ADMINISTRADOR_AREA", nombre: "Administrador de Área" },
  { codigo: "SUPERADMINISTRADOR", nombre: "Super Administrador" },
] as const

export type RolCodigo = (typeof ROLES)[number]["codigo"]

/*
 * CARGOS: título del puesto, SOLO visual. No tiene efecto en permisos
 * (eso lo decide el rol de arriba). El mismo cargo puede ir sobre
 * roles distintos — ej. "Analista de Producción" siendo SUPERADMINISTRADOR
 * en Aséptico o SUPERVISOR en Vacío. Espejo de usuarios.cargo (texto),
 * ver supabase/migrations/20260982090000_cargo_personal.sql. Para
 * sumar un cargo nuevo, agregar acá una línea.
 */
export const CARGOS = [
  { codigo: "JEFE_PRODUCCION", nombre: "Jefe de Producción" },
  { codigo: "SUBJEFE", nombre: "Subjefe" },
  { codigo: "ANALISTA_PRODUCCION", nombre: "Analista de Producción" },
  { codigo: "SUPERVISOR", nombre: "Supervisor" },
] as const

export type CargoCodigo = (typeof CARGOS)[number]["codigo"]

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
