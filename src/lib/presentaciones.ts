import { supabase } from "@/lib/supabase"

export async function crearPresentacion(datos: {
  volumenMl: number
  cajasXCamada: number
  cantCamada: number
  cajasXPaleta: number
  litrosXCaja: number
  envasesXCaja: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("crear_presentacion", {
    p_volumen_ml: datos.volumenMl,
    p_cajas_x_camada: datos.cajasXCamada,
    p_cant_camada: datos.cantCamada,
    p_cajas_x_paleta: datos.cajasXPaleta,
    p_litros_x_caja: datos.litrosXCaja,
    p_envases_x_caja: datos.envasesXCaja,
  })
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe una presentación con ese volumen." }
    return { ok: false, error: "No se pudo agregar la presentación. Intenta de nuevo." }
  }
  return { ok: true }
}

export async function editarPresentacion(datos: {
  id: string
  cajasXCamada: number
  cantCamada: number
  cajasXPaleta: number
  litrosXCaja: number
  envasesXCaja: number
}): Promise<boolean> {
  const { error } = await supabase.rpc("editar_presentacion", {
    p_presentacion_id: datos.id,
    p_cajas_x_camada: datos.cajasXCamada,
    p_cant_camada: datos.cantCamada,
    p_cajas_x_paleta: datos.cajasXPaleta,
    p_litros_x_caja: datos.litrosXCaja,
    p_envases_x_caja: datos.envasesXCaja,
  })
  return !error
}

export async function desactivarPresentacion(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("desactivar_presentacion", { p_presentacion_id: id })
  return !error
}

export async function reactivarPresentacion(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("reactivar_presentacion", { p_presentacion_id: id })
  return !error
}
