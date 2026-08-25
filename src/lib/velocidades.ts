import { supabase } from "@/lib/supabase"
import type { LineaCodigo, PresentacionCodigo } from "@/lib/catalogos"

export async function crearVelocidad(datos: {
  linea: LineaCodigo
  presentacion: PresentacionCodigo
  maquina: string
  envasesHora: number
  litrosHora: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("crear_velocidad", {
    p_linea_codigo: datos.linea,
    p_volumen_ml: Number(datos.presentacion),
    p_maquina: datos.maquina,
    p_envases_hora: datos.envasesHora,
    p_litros_hora: datos.litrosHora,
  })
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe esa velocidad para esa línea y presentación." }
    return { ok: false, error: "No se pudo agregar la velocidad. Intenta de nuevo." }
  }
  return { ok: true }
}

export async function editarVelocidad(id: string, maquina: string, envasesHora: number, litrosHora: number): Promise<boolean> {
  const { error } = await supabase.rpc("editar_velocidad", {
    p_velocidad_id: id,
    p_maquina: maquina,
    p_envases_hora: envasesHora,
    p_litros_hora: litrosHora,
  })
  return !error
}

export async function desactivarVelocidad(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("desactivar_velocidad", { p_velocidad_id: id })
  return !error
}

export async function reactivarVelocidad(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("reactivar_velocidad", { p_velocidad_id: id })
  return !error
}
