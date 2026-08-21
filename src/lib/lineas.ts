import { supabase } from "@/lib/supabase"

export async function editarLinea(id: string, nombre: string): Promise<boolean> {
  const { error } = await supabase.rpc("editar_linea", { p_linea_id: id, p_nombre: nombre })
  return !error
}

export async function desactivarLinea(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("desactivar_linea", { p_linea_id: id })
  return !error
}

export async function reactivarLinea(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("reactivar_linea", { p_linea_id: id })
  return !error
}
