import type { ClaseParada } from "@/lib/paradas"

/*
 * Catálogo de fallas mecánicas: Equipo › Sistema › Subsistema › Falla
 * (migración 20261113490000). Cada nivel tiene un id fijo y un sufijo
 * editable; el código de la falla se arma con los cuatro (CF-SUP-CAM-01).
 */

export type NivelCatalogo = "EQUIPO" | "SISTEMA" | "SUBSISTEMA"

/** LINEA: está en ciertas líneas. SERVICIOS: generadores, calderas… aparecen en todas. */
export type TipoEquipo = "LINEA" | "SERVICIOS"

export interface EquipoCatalogo {
  id: string
  sufijo: string
  nombre: string
  tipo: TipoEquipo
  activo: boolean
  /** ids de las líneas donde está (vacío en los de servicios). */
  lineas: string[]
  /** Cuándo se creó (ISO); sirve para ordenar por creación. Sin él (servidor sin 20261114790000), por sufijo. */
  creadoEn?: string
  /** «Equipo no listado»: lo crea el sistema y no se cambia (20261114890000). */
  reservada?: boolean
}

export interface SistemaCatalogo {
  id: string
  equipoId: string
  sufijo: string
  nombre: string
  activo: boolean
  creadoEn?: string
  /** «General»: contiene la «Falla nueva» del equipo. */
  reservada?: boolean
}

export interface SubsistemaCatalogo {
  id: string
  sistemaId: string
  sufijo: string
  nombre: string
  /** Código viejo del Sheet de Mantenimiento (ej. A3CF-AIR-05). */
  codigoSheet: string | null
  activo: boolean
  creadoEn?: string
  /** «Sin clasificar». */
  reservada?: boolean
}

export interface FallaCatalogo {
  id: string
  subsistemaId: string
  numero: number
  nombre: string
  clase: ClaseParada
  activo: boolean
  /** Armado por el servidor con los sufijos de hoy. */
  codigo: string
  /** «Falla nueva»: una por equipo, para cuando la falla no está en el catálogo. */
  reservada?: boolean
}

export interface CatalogoFallas {
  equipos: EquipoCatalogo[]
  sistemas: SistemaCatalogo[]
  subsistemas: SubsistemaCatalogo[]
  fallas: FallaCatalogo[]
}

export const CATALOGO_VACIO: CatalogoFallas = { equipos: [], sistemas: [], subsistemas: [], fallas: [] }

export type Resultado<T = void> = { ok: true; valor: T } | { ok: false; error: string }
