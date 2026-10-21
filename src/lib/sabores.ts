import { supabase } from "@/lib/supabase"

export interface Familia {
  id: string
  nombre: string
}

export interface Sabor {
  id: string
  nombre: string
  volumen: number | null
  activo: boolean
  familiaId: string
  familiaNombre: string
}

/**
 * Nombre de sabor para mostrar (mismo criterio que sabor_display() en
 * las migraciones 20260969 / 20261002 y saborSinFamiliaOculta() en
 * turno.ts):
 *  - Clásicos / Especiales: sin sufijo — "Manzana".
 *  - Selecto: "Manzana 35%" (la familia ES el 35%; más corto que
 *    "(Selecto)" y desambigua igual). Si el nombre ya trae "35%", se deja.
 *  - El resto (Jucosa, Premium): "Manzana (Jucosa)".
 */
const FAMILIAS_SUFIJO_OCULTO = ["Clasicos", "Clásicos", "Especiales"]
export function nombreSaborConFamilia(nombre: string, familiaNombre: string): string {
  if (familiaNombre === "Selecto") return /35\s*%/.test(nombre) ? nombre : `${nombre} 35%`
  return FAMILIAS_SUFIJO_OCULTO.includes(familiaNombre) ? nombre : `${nombre} (${familiaNombre})`
}

/*
 * Selecto, Mango y "35%" se preparan por KITS (1 kit = 2 tambores); el
 * resto, por tambores. sabores.volumen ya viene por unidad de
 * preparación (por kit para estos, por tambor para el resto), así que
 * el cálculo cantidad × volumen NO cambia — solo el rótulo del campo.
 */
const PREPARACION_POR_KIT = /selecto|mango|35\s?%/i

/** "kits" o "tambores" según el sabor. Recibe el nombre del sabor (con o sin familia). */
export function unidadPreparacion(saborNombreOFamilia: string | null | undefined): "kits" | "tambores" {
  return saborNombreOFamilia && PREPARACION_POR_KIT.test(saborNombreOFamilia) ? "kits" : "tambores"
}

/*
 * Sabores agrupados por familia. Viven en las tablas "sabores" y
 * "familias_producto" (RLS sin políticas: todo por RPC). Se editan desde
 * Edición de Datos con guardar_catalogo (src/lib/edicionDatos.ts).
 */
interface FilaFamilia {
  familia_id: string
  nombre: string
}

interface FilaSabor {
  sabor_id: string
  nombre: string
  volumen: number | null
  activo: boolean
  familia_id: string
  familia_nombre: string
}

export async function listarFamilias(): Promise<Familia[]> {
  const { data, error } = await supabase.rpc("listar_familias")
  if (error || !data) return []
  return (data as FilaFamilia[]).map((f) => ({ id: f.familia_id, nombre: f.nombre }))
}

export async function listarSabores(): Promise<Sabor[]> {
  const { data, error } = await supabase.rpc("listar_sabores")
  if (error || !data) return []
  return (data as FilaSabor[]).map((s) => ({
    id: s.sabor_id,
    nombre: s.nombre,
    volumen: s.volumen,
    activo: s.activo,
    familiaId: s.familia_id,
    familiaNombre: s.familia_nombre,
  }))
}

