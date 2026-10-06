import type { Session } from "@/lib/auth"
import type { LineaLive, PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import { generarActaPdf } from "@/lib/actaPdf"
import { miTurnoDetalle, subirYRegistrarActa } from "@/lib/historialTurnos"
import { listarLecturasServiciosIndustrialesDeTurno } from "@/lib/panelProduccion"
import { cargarParadasDelTurno } from "@/lib/paradasCatalogo"

/**
 * Arma el acta de un turno propio ya cerrado con los datos de ahora y la
 * guarda como versión nueva (la anterior queda anulada; ver registrar_acta).
 * La usan las actas pendientes del cierre automático y la carga tarde de
 * contador/PT (migración 20261107). Solo el responsable del turno puede
 * leer su detalle (mi_turno_detalle).
 */
export async function regenerarActaDeMiTurno(
  session: Session,
  turnoId: string,
  catalogos: { lineas: LineaLive[]; presentaciones: PresentacionLive[]; velocidades: VelocidadLive[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const turno = await miTurnoDetalle(session.username, turnoId)
  if (!turno) return { ok: false, error: "No se pudo leer el turno para armar el acta." }
  try {
    const [serviciosIndustriales, paradas] = await Promise.all([
      listarLecturasServiciosIndustrialesDeTurno(turnoId),
      cargarParadasDelTurno(turnoId),
    ])
    const blob = await generarActaPdf({
      codigo: turno.codigo,
      fecha: turno.fecha,
      turnoTipo: turno.turnoTipo,
      grupo: turno.grupo,
      tanquesEncontrados: turno.tanquesEncontrados,
      tanques: turno.tanques,
      preparaciones: turno.preparaciones,
      corridas: turno.corridas,
      contadores: turno.contadores,
      productoTerminado: turno.productoTerminado,
      novedades: turno.novedades,
      ajustesVolumen: turno.ajustesVolumen,
      paradas,
      serviciosIndustriales,
      responsables: turno.responsables,
      esquema: turno.esquema,
      horaInicio: turno.horaInicio,
      correcciones: turno.correcciones,
      supervisorNombre: turno.supervisorNombre || session.nombre || session.username,
      area: session.area,
      ...catalogos,
    })
    const r = await subirYRegistrarActa(session.username, turnoId, session.area ?? "SIN_AREA", turno.codigo, blob)
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  } catch {
    return { ok: false, error: "No se pudo generar el PDF del acta." }
  }
}
