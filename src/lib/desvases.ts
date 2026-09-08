import { supabase } from "@/lib/supabase"

/**
 * Desvases: el resto de jugo semielaborado de un tanque, guardado en
 * una pipa (ver desvasarTanque en src/lib/preparacion/ajustes.ts) para
 * usar en cualquier turno futuro de la misma área — se listan por sabor
 * al Iniciar Preparación (src/components/EstadoPlantaTabs.tsx) para
 * poder sumarlos al lote nuevo.
 */
export interface Desvase {
  id: string
  saborId: string
  saborNombre: string
  litros: number
  loteOrigen: string | null
  creadoEn: string
}

interface FilaDesvase {
  desvase_id: string
  sabor_id: string
  sabor_nombre: string
  litros: number
  lote_origen: string | null
  creado_en: string
}

export async function listarDesvases(usuarioSesion: string, areaCodigo: string, saborId?: string): Promise<Desvase[]> {
  const { data, error } = await supabase.rpc("listar_desvases", {
    p_usuario: usuarioSesion,
    p_area_codigo: areaCodigo,
    p_sabor_id: saborId || null,
  })
  if (error || !data) return []
  return (data as FilaDesvase[]).map((f) => ({
    id: f.desvase_id,
    saborId: f.sabor_id,
    saborNombre: f.sabor_nombre,
    litros: f.litros,
    loteOrigen: f.lote_origen,
    creadoEn: f.creado_en,
  }))
}
