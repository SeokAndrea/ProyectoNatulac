/*
 * Catálogos fijos de Producción Aséptico (turnos, grupos y líneas).
 * Son un espejo, hardcodeado, de los datos que ya se sembraron en
 * supabase/migrations/20260819120000_core_schema.sql (tablas
 * turno_tipos, grupos y lineas). Se usan acá porque todavía no hay
 * conexión real a Supabase.
 *
 * Cuando se conecte la app a Supabase (ver src/lib/supabase.ts), hay
 * que reemplazar estas constantes por una consulta a esas tablas
 * (por ejemplo con un hook useCatalogos) y borrar este archivo, para
 * no tener el dato duplicado en dos lugares.
 */

/*
 * AREAS y ROLES: espejo de las tablas "areas" y "roles" sembradas en
 * supabase/migrations/20260819120000_core_schema.sql. Se usan en el
 * login simulado (src/lib/auth.tsx) y en "Añadir Personal"
 * (src/pages/apps/AnadirPersonal.tsx).
 */
export const AREAS = [
  { codigo: "ASEPTICO", nombre: "Producción Aséptico" },
  { codigo: "VACIO", nombre: "Producción Vacío" },
  { codigo: "SERVICIOS_INDUSTRIALES", nombre: "Servicios Industriales" },
  { codigo: "MANTENIMIENTO", nombre: "Mantenimiento" },
] as const

export type AreaCodigo = (typeof AREAS)[number]["codigo"]

export const ROLES = [
  { codigo: "SUPERVISOR", nombre: "Supervisor" },
  { codigo: "ADMINISTRADOR_AREA", nombre: "Administrador de Área" },
  { codigo: "SUPERADMINISTRADOR", nombre: "Super Administrador" },
] as const

export type RolCodigo = (typeof ROLES)[number]["codigo"]

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

export const LINEAS = [
  { codigo: "LINEA_1", nombre: "Línea 1" },
  { codigo: "LINEA_2", nombre: "Línea 2" },
  { codigo: "LINEA_3", nombre: "Línea 3" },
] as const

export type LineaCodigo = (typeof LINEAS)[number]["codigo"]

/*
 * PRESENTACIONES: tamaños de envase (en ml), con su empaque tabulado
 * (espejo de la tabla "presentaciones" en
 * supabase/migrations/20260820120000_sabores_presentaciones.sql).
 * La velocidad de llenadora NO está acá: depende de la combinación
 * (línea, presentación) — ver VELOCIDADES_LLENADORA más abajo.
 */
export const PRESENTACIONES: {
  codigo: string
  nombre: string
  cajasXCamada: number
  cantCamada: number
  cajasXPaleta: number
  litrosXCaja: number
  envasesXCaja: number
}[] = [
  { codigo: "1000", nombre: "1000 ml", cajasXCamada: 17, cantCamada: 5, cajasXPaleta: 85, litrosXCaja: 12, envasesXCaja: 12 },
  { codigo: "500", nombre: "500 ml", cajasXCamada: 17, cantCamada: 8, cajasXPaleta: 120, litrosXCaja: 6, envasesXCaja: 12 },
  { codigo: "330", nombre: "330 ml", cajasXCamada: 15, cantCamada: 10, cajasXPaleta: 150, litrosXCaja: 5.94, envasesXCaja: 18 },
  { codigo: "250", nombre: "250 ml", cajasXCamada: 14, cantCamada: 10, cajasXPaleta: 140, litrosXCaja: 6, envasesXCaja: 24 },
  { codigo: "200", nombre: "200 ml", cajasXCamada: 14, cantCamada: 10, cajasXPaleta: 140, litrosXCaja: 4.8, envasesXCaja: 24 },
]

export type PresentacionCodigo = string

/*
 * VELOCIDADES_LLENADORA: velocidades reales tabuladas por línea +
 * presentación (espejo de supabase/migrations/20260821090000_velocidades_llenadora.sql).
 * Cada combinación tiene una o más opciones de envases/hora para
 * elegir — por eso es una lista, no un valor único. litrosHora ya
 * viene calculado (envasesHora × volumen de la presentación).
 *
 * Se usa en Comenzar Turno: cada línea que se marca en "Líneas a
 * usar" elige su propia presentación (solo las que tengan datos acá)
 * y su propia velocidad entre las opciones disponibles. No hay dato
 * cargado todavía para la presentación de 500 ml en ninguna línea.
 */
export const VELOCIDADES_LLENADORA: {
  linea: LineaCodigo
  presentacion: PresentacionCodigo
  maquina: string
  envasesHora: number
  litrosHora: number
}[] = [
  { linea: "LINEA_1", presentacion: "1000", maquina: "A3Flex", envasesHora: 6000, litrosHora: 6000 },
  { linea: "LINEA_1", presentacion: "1000", maquina: "A3Flex", envasesHora: 7000, litrosHora: 7000 },
  { linea: "LINEA_1", presentacion: "1000", maquina: "A3Flex", envasesHora: 8000, litrosHora: 8000 },
  { linea: "LINEA_2", presentacion: "250", maquina: "A3 CompactFlex", envasesHora: 7500, litrosHora: 1875 },
  { linea: "LINEA_2", presentacion: "250", maquina: "A3 CompactFlex", envasesHora: 9000, litrosHora: 2250 },
  { linea: "LINEA_3", presentacion: "250", maquina: "A3 CompactFlex", envasesHora: 7500, litrosHora: 1875 },
  { linea: "LINEA_3", presentacion: "250", maquina: "A3 CompactFlex", envasesHora: 9000, litrosHora: 2250 },
  { linea: "LINEA_3", presentacion: "330", maquina: "A3 CompactFlex", envasesHora: 9000, litrosHora: 2970 },
  { linea: "LINEA_3", presentacion: "200", maquina: "A3 CompactFlex", envasesHora: 9000, litrosHora: 1800 },
]

export function velocidadesPara(linea: LineaCodigo, presentacion: PresentacionCodigo) {
  return VELOCIDADES_LLENADORA.filter((v) => v.linea === linea && v.presentacion === presentacion)
}

/** Presentaciones que tienen alguna velocidad tabulada para una línea dada. */
export function presentacionesPorLinea(linea: LineaCodigo): PresentacionCodigo[] {
  return [...new Set(VELOCIDADES_LLENADORA.filter((v) => v.linea === linea).map((v) => v.presentacion))]
}

export function litrosHoraDe(linea: LineaCodigo, presentacion: PresentacionCodigo, envasesHora: number): number | null {
  return (
    VELOCIDADES_LLENADORA.find(
      (v) => v.linea === linea && v.presentacion === presentacion && v.envasesHora === envasesHora,
    )?.litrosHora ?? null
  )
}

/*
 * FAMILIAS_PRODUCTO y SABORES: las "gamas" de producto (Clásicos,
 * Premium, Especiales, Selecto, Jucosa) y sus sabores. OJO: esto NO
 * es lo mismo que LINEAS de arriba — LINEAS son las líneas físicas
 * de llenado (Línea 1/2/3), esto es la familia/gama del producto. El
 * campo "volumen" de cada sabor es para las preparaciones (fórmulas
 * de mezcla) — todavía no se usa en ningún cálculo, es la base para
 * cuando se arme esa parte de la Calculadora más adelante.
 */
export const FAMILIAS_PRODUCTO = ["Clasicos", "Premium", "Especiales", "Selecto", "Jucosa"] as const

export const SABORES: { familia: (typeof FAMILIAS_PRODUCTO)[number]; nombre: string; volumen: number }[] = [
  { familia: "Clasicos", nombre: "Pera", volumen: 2710 },
  { familia: "Clasicos", nombre: "Manzana", volumen: 2810 },
  { familia: "Clasicos", nombre: "Durazno", volumen: 2979 },
  { familia: "Clasicos", nombre: "Naranja", volumen: 4500 },
  { familia: "Premium", nombre: "Manzana Clarificado", volumen: 1735 },
  { familia: "Premium", nombre: "Agua de Coco", volumen: 170 },
  { familia: "Premium", nombre: "Naranja 100%", volumen: 2870 },
  { familia: "Especiales", nombre: "Coctel", volumen: 8200 },
  { familia: "Especiales", nombre: "Mango", volumen: 2590 },
  { familia: "Especiales", nombre: "Té de Durazno", volumen: 4883 },
  { familia: "Especiales", nombre: "Té de Limón", volumen: 4883 },
  { familia: "Selecto", nombre: "Manzana", volumen: 3676 },
  { familia: "Selecto", nombre: "Pera", volumen: 3522 },
  { familia: "Selecto", nombre: "Durazno", volumen: 3750 },
  { familia: "Jucosa", nombre: "Pera", volumen: 7583 },
  { familia: "Jucosa", nombre: "Manzana", volumen: 7889 },
  { familia: "Jucosa", nombre: "Naranja", volumen: 17300 },
  { familia: "Jucosa", nombre: "Durazno", volumen: 7676 },
]

export function nombrePorCodigo<T extends { codigo: string; nombre: string }>(
  catalogo: readonly T[],
  codigo: string,
): string {
  return catalogo.find((item) => item.codigo === codigo)?.nombre ?? codigo
}
