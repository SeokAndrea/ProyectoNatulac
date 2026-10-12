/**
 * Vacío en tanques de Aséptico (migración 20261109490000). Vacío no usa la
 * app: el supervisor de Aséptico registra lo que Vacío guarda o se lleva.
 * Nada de esto cuenta en la merma de Aséptico. Preparar para Vacío es
 * iniciarPreparacion con `paraVacio` (nucleo.ts); acá van los otros tres:
 *
 *   recibirDeVacio      el néctar de Vacío llega por tubería
 *   entregarAVacio      Vacío se lleva litros (por partes; null = todo)
 *   pasarLoteAAseptico  Aséptico usa lo de Vacío desde el volumen medido
 */
import { supabase } from "@/lib/supabase"
import type { DatosRecibirDeVacio, Resultado } from "./tipos"

export async function recibirDeVacio(
  usuario: string,
  turnoId: string,
  datos: DatosRecibirDeVacio,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("recibir_de_vacio", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque: datos.numeroTanque,
    p_sabor_id: datos.saborId,
    p_lote: datos.lote,
    p_litros: datos.litros,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo registrar lo que llegó de Vacío. Intenta de nuevo." }
  }

  return { ok: true, data }
}

export async function entregarAVacio(
  usuario: string,
  turnoId: string,
  numeroTanque: 1 | 2 | 3,
  litros: number | null,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("entregar_a_vacio", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque: numeroTanque,
    p_litros: litros,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo registrar la entrega a Vacío. Intenta de nuevo." }
  }

  return { ok: true, data }
}

export async function pasarLoteAAseptico(
  usuario: string,
  turnoId: string,
  numeroTanque: 1 | 2 | 3,
  volumenReal: number,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("pasar_lote_a_aseptico", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque: numeroTanque,
    p_volumen_real: volumenReal,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo pasar el lote a Aséptico. Intenta de nuevo." }
  }

  return { ok: true, data }
}
