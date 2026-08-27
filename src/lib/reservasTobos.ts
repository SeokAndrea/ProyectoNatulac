import { supabase } from "@/lib/supabase"

/**
 * Reservas de tobos: resto de un tanque envasado aparte (ver
 * envasarTanque en src/lib/turno.tsx) para usar en cualquier turno
 * futuro de la misma área — se listan por sabor al Iniciar
 * Preparación (src/components/EstadoPlantaTabs.tsx) para poder
 * sumarlas al lote nuevo.
 */
export interface ReservaTobo {
  id: string
  saborId: string
  saborNombre: string
  litros: number
  loteOrigen: string | null
  creadoEn: string
}

interface FilaReserva {
  reserva_id: string
  sabor_id: string
  sabor_nombre: string
  litros: number
  lote_origen: string | null
  creado_en: string
}

export async function listarReservasTobos(usuarioSesion: string, areaCodigo: string, saborId?: string): Promise<ReservaTobo[]> {
  const { data, error } = await supabase.rpc("listar_reservas_tobos", {
    p_usuario: usuarioSesion,
    p_area_codigo: areaCodigo,
    p_sabor_id: saborId || null,
  })
  if (error || !data) return []
  return (data as FilaReserva[]).map((f) => ({
    id: f.reserva_id,
    saborId: f.sabor_id,
    saborNombre: f.sabor_nombre,
    litros: f.litros,
    loteOrigen: f.lote_origen,
    creadoEn: f.creado_en,
  }))
}
