import { supabase } from "@/lib/supabase"
import type { AreaCodigo, GrupoCodigo, TurnoTipoCodigo } from "@/lib/catalogos"
import { mapearTurno, type FilaTurno, type TurnoActivo } from "@/lib/turno"

/*
 * Auditoría (solo SUPERADMINISTRADOR): buscar cualquier turno —
 * abierto o cerrado, de cualquier supervisor/área — por supervisor
 * y/o rango de fechas, y ver su detalle completo. Reutiliza el mismo
 * "turno_json" que arma turno_activo_de() (ver
 * supabase/migrations/20260901090000_historial_auditoria.sql), así
 * que el detalle se puede mostrar con el mismo <ActaTurno />.
 */
export interface TurnoResumen {
  id: string
  codigo: string
  fecha: string
  horaInicio: string
  estado: "ABIERTO" | "CERRADO"
  supervisorUsuario: string
  supervisorNombre: string
  area: AreaCodigo
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
}

interface FilaResumen {
  turno_id: string
  codigo: string
  fecha: string
  hora_inicio: string
  estado: "ABIERTO" | "CERRADO"
  supervisor_usuario: string
  supervisor_nombre: string
  area_codigo: string
  turno_tipo_codigo: string
  grupo_codigo: string
}

export async function listarTurnosHistorial(
  usuarioSesion: string,
  filtros: { supervisorUsuario?: string; fechaDesde?: string; fechaHasta?: string },
): Promise<TurnoResumen[]> {
  const { data, error } = await supabase.rpc("listar_turnos_historial", {
    p_usuario: usuarioSesion,
    p_supervisor_usuario: filtros.supervisorUsuario || null,
    p_fecha_desde: filtros.fechaDesde || null,
    p_fecha_hasta: filtros.fechaHasta || null,
  })
  if (error || !data) return []
  return (data as FilaResumen[]).map((f) => ({
    id: f.turno_id,
    codigo: f.codigo,
    fecha: f.fecha,
    horaInicio: f.hora_inicio,
    estado: f.estado,
    supervisorUsuario: f.supervisor_usuario,
    supervisorNombre: f.supervisor_nombre,
    area: f.area_codigo as AreaCodigo,
    turnoTipo: f.turno_tipo_codigo as TurnoTipoCodigo,
    grupo: f.grupo_codigo as GrupoCodigo,
  }))
}

export async function obtenerTurnoDetalle(usuarioSesion: string, turnoId: string): Promise<TurnoActivo | null> {
  const { data, error } = await supabase.rpc("turno_detalle", { p_usuario: usuarioSesion, p_turno_id: turnoId })
  if (error || !data) return null
  return mapearTurno(data as FilaTurno)
}

/** Borrado real: solo permite turnos CERRADOS (Postgres lo rechaza si no). */
export async function eliminarTurno(
  usuarioSesion: string,
  turnoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("eliminar_turno", { p_usuario: usuarioSesion, p_turno_id: turnoId })
  if (error) {
    return { ok: false, error: error.message || "No se pudo eliminar el turno. Intenta de nuevo." }
  }
  return { ok: true }
}
