import { errorSufijo, sugerirSufijo } from "@/lib/catalogoFallas/codigo"

/** Valor del select cuando se elige «+ Nuevo…». */
export const NUEVO = "__nuevo"

export interface NivelNuevo {
  nombre: string
  /** Lo que escribió; vacío = se usa la sugerencia. */
  sufijo: string
}

export const SIN_NUEVO: NivelNuevo = { nombre: "", sufijo: "" }

/** El sufijo que se va a guardar: lo escrito o, si no escribió, el sugerido por el nombre. */
export const sufijoFinal = (n: NivelNuevo, ocupados: string[]) => n.sufijo || sugerirSufijo(n.nombre, ocupados)

/** Qué falta para crear el nivel nuevo, o null si está listo. */
export function faltaNivel(n: NivelNuevo, ocupados: string[], que: string): string | null {
  if (!n.nombre.trim()) return `Escribe el nombre del ${que} nuevo.`
  return errorSufijo(sufijoFinal(n, ocupados), ocupados)
}
