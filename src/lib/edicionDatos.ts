import { supabase } from "@/lib/supabase"

/*
 * Catálogos de Edición de Datos (migración 20261111490000): una sola
 * puerta con permiso EDICION_DATOS para listar, guardar y activar.
 * Cada fila trae quién y cuándo la cambió por última vez (editado_por /
 * editado_en); el detalle de cada cambio queda en Auditoría.
 */

export type CatalogoId = "sabores" | "presentaciones" | "velocidades" | "lineas" | "bobinas" | "conteo"

/** Fila tal cual la devuelve la base (columnas de la tabla + editado_por_nombre). */
export type FilaCatalogo = Record<string, unknown> & {
  id: string
  activo: boolean
  editado_en: string | null
  editado_por_nombre: string | null
}

type Resultado<T = void> = { ok: true; valor: T } | { ok: false; error: string }

function mensaje(error: { code?: string; message?: string } | null, porDefecto: string): string {
  if (!error) return porDefecto
  if (error.code === "23505") return "Ya existe uno igual. Revisa el nombre o los datos."
  return error.message || porDefecto
}

export async function listarCatalogo(usuario: string, catalogo: CatalogoId): Promise<Resultado<FilaCatalogo[]>> {
  const { data, error } = await supabase.rpc("listar_catalogo_edicion", { p_usuario: usuario, p_catalogo: catalogo })
  if (error) return { ok: false, error: mensaje(error, "No se pudo cargar. Recarga la página.") }
  return { ok: true, valor: (data ?? []) as FilaCatalogo[] }
}

export async function guardarCatalogo(
  usuario: string,
  catalogo: CatalogoId,
  id: string | null,
  valores: Record<string, string | number | boolean | null>,
): Promise<Resultado<string>> {
  const { data, error } = await supabase.rpc("guardar_catalogo", {
    p_usuario: usuario,
    p_catalogo: catalogo,
    p_id: id,
    p_valores: valores,
    p_pagina: "Edición de Datos",
  })
  if (error) return { ok: false, error: mensaje(error, "No se guardó. Intenta de nuevo.") }
  return { ok: true, valor: data as string }
}

export async function cambiarActivoCatalogo(usuario: string, catalogo: CatalogoId, id: string, activo: boolean): Promise<Resultado> {
  const { error } = await supabase.rpc("cambiar_activo_catalogo", {
    p_usuario: usuario,
    p_catalogo: catalogo,
    p_id: id,
    p_activo: activo,
    p_pagina: "Edición de Datos",
  })
  if (error) return { ok: false, error: mensaje(error, activo ? "No se pudo reactivar." : "No se pudo desactivar.") }
  return { ok: true, valor: undefined }
}
