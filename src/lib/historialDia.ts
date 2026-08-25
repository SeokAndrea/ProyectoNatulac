import { supabase } from "@/lib/supabase"

export interface AccionDia {
  supervisorUsuario: string
  supervisorNombre: string
  hora: string
  seccion: string
  detalle: string
}

interface FilaAccionDia {
  supervisor_usuario: string
  supervisor_nombre: string
  hora: string
  seccion: string
  detalle: string
}

/*
 * Qué hizo cada supervisor en el día (agrupado por supervisor en el
 * frontend, ver HistorialDiaSupervisor.tsx) — arma la lista juntando
 * lo que ya queda timestampeado en las tablas existentes (turnos,
 * preparaciones, recepcion_tanques, turno_lineas, contadores), sin
 * tabla de auditoría nueva. Ver historial_dia_area() en
 * supabase/migrations/20260916090000_historial_dia_supervisor.sql.
 */
export async function obtenerHistorialDia(areaCodigo: string, fecha: string): Promise<AccionDia[]> {
  const { data, error } = await supabase.rpc("historial_dia_area", { p_area_codigo: areaCodigo, p_fecha: fecha })
  if (error || !data) return []
  return (data as FilaAccionDia[]).map((f) => ({
    supervisorUsuario: f.supervisor_usuario,
    supervisorNombre: f.supervisor_nombre,
    hora: f.hora,
    seccion: f.seccion,
    detalle: f.detalle,
  }))
}
