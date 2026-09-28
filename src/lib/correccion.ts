import type { LineaCodigo, PresentacionCodigo } from "@/lib/catalogos"
import { litrosHoraDeLive, type VelocidadLive } from "@/lib/catalogosLive"
import { supabase } from "@/lib/supabase"
import { instantePlanta } from "@/lib/tiempoPlanta"

/*
 * Corrida olvidada (migración 20261082: agregar_corrida_retroactiva): en una
 * corrección abierta se agrega una corrida YA TERMINADA dentro del horario
 * del turno cerrado, con su sabor y presentación, para poder cargarle el PT.
 * No toca el estado heredado.
 */
export interface DatosCorridaOlvidada {
  linea: LineaCodigo
  saborId: string
  presentacion: PresentacionCodigo
  envasesHora: number
  lote: string
  /** "HH:MM" en hora de planta. */
  desde: string
  hasta: string
}

/** "HH:MM" del turno → instante real. Una hora menor que el inicio del turno es del día siguiente (turno 3). */
function instanteDelTurno(hora: string, fechaTurno: string, horaInicioTurno: string): string {
  const d = instantePlanta(hora, fechaTurno)
  if (hora < horaInicioTurno.slice(0, 5)) d.setDate(d.getDate() + 1)
  return d.toISOString()
}

export async function agregarCorridaOlvidada(
  usuario: string,
  turno: { id: string; fecha: string; horaInicio: string },
  datos: DatosCorridaOlvidada,
  velocidades: VelocidadLive[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("agregar_corrida_retroactiva", {
    p_usuario: usuario,
    p_turno_id: turno.id,
    p_linea_codigo: datos.linea,
    p_sabor_id: datos.saborId,
    p_presentacion_volumen_ml: Number(datos.presentacion),
    p_envases_hora: datos.envasesHora,
    p_litros_hora: litrosHoraDeLive(velocidades, datos.linea, datos.presentacion, datos.envasesHora),
    p_lote: datos.lote.trim() || null,
    p_desde: instanteDelTurno(datos.desde, turno.fecha, turno.horaInicio),
    p_hasta: instanteDelTurno(datos.hasta, turno.fecha, turno.horaInicio),
  })
  if (error) return { ok: false, error: error.message || "No se pudo agregar la corrida." }
  return { ok: true }
}
