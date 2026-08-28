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
 * Nombre de sabor para mostrar: agrega " (Familia)" solo cuando esa
 * familia lo necesita para desambiguar (el mismo nombre existe en
 * varias). Para Clásicos y Especiales no se agrega — mismo criterio
 * que saborSinFamiliaOculta() en turno.tsx y sabor_display() en la
 * migración 20260969.
 */
const FAMILIAS_SUFIJO_OCULTO = ["Clasicos", "Clásicos", "Especiales"]
export function nombreSaborConFamilia(nombre: string, familiaNombre: string): string {
  return FAMILIAS_SUFIJO_OCULTO.includes(familiaNombre) ? nombre : `${nombre} (${familiaNombre})`
}

/*
 * Sabores agrupados por familia, editables desde "Edición de Datos"
 * (SUPERADMINISTRADOR). Vive en las tablas "sabores" y
 * "familias_producto" de Supabase — ver
 * supabase/migrations/20260824090000_sabores_edicion.sql. Igual que
 * "personal", todo pasa por funciones RPC porque esas tablas tienen
 * RLS activado sin políticas.
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

export async function crearSabor(datos: {
  familiaId: string
  nombre: string
  volumen: number | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("crear_sabor", {
    p_familia_id: datos.familiaId,
    p_nombre: datos.nombre,
    p_volumen: datos.volumen,
  })

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ese sabor ya existe en esta familia." }
    }
    return { ok: false, error: "No se pudo agregar el sabor. Intenta de nuevo." }
  }

  return { ok: true, id: data as string }
}

export async function editarSabor(datos: {
  id: string
  nombre: string
  volumen: number | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("editar_sabor", {
    p_sabor_id: datos.id,
    p_nombre: datos.nombre,
    p_volumen: datos.volumen,
  })

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ese sabor ya existe en esta familia." }
    }
    return { ok: false, error: "No se pudo editar el sabor. Intenta de nuevo." }
  }

  return { ok: true }
}

export async function desactivarSabor(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("desactivar_sabor", { p_sabor_id: id })
  return !error
}

export async function reactivarSabor(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("reactivar_sabor", { p_sabor_id: id })
  return !error
}
