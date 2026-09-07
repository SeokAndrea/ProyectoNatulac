/**
 * Núcleo de Preparación: el ciclo idealizado de un lote — iniciar → liberar.
 * Nada más. Cualquier función que exista para manejar algo que salió
 * distinto de lo planeado (un ajuste, una transferencia, guardar en pipa)
 * va en ajustes.ts, no acá — ver plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Extraídas de src/lib/turno.tsx (TurnoProvider) como funciones sueltas:
 * ya no dependen de un Context de React ni de su estado — reciben
 * `usuario`/`turnoId` como parámetro y devuelven el turno_json crudo para
 * que quien las llama decida cómo actualizar su estado. Mismo comportamiento
 * que hoy, ninguna RPC nueva.
 */
import { supabase } from "@/lib/supabase"
import type { DatosIniciarPreparacion, Resultado } from "./tipos"

export async function iniciarPreparacion(
  usuario: string,
  turnoId: string,
  datos: DatosIniciarPreparacion,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("iniciar_preparacion", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque: datos.numeroTanque,
    p_sabor_id: datos.saborId,
    p_lote: datos.lote,
    p_tambores: datos.tambores,
    p_agua: datos.agua,
    p_azucar: datos.azucar,
    p_acido_citrico: datos.acidoCitrico,
    p_reserva_id: datos.reservaId,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo iniciar la preparación. Intenta de nuevo." }
  }

  return { ok: true, data }
}

export async function liberarLote(usuario: string, turnoId: string, loteId: string): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("liberar_lote", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_lote_id: loteId,
  })

  if (error || !data) {
    return { ok: false, error: "No se pudo liberar el lote. Intenta de nuevo." }
  }

  return { ok: true, data }
}
