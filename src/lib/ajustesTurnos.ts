import type { AreaCodigo, GrupoCodigo, TurnoTipoCodigo } from "@/lib/catalogos"
import type { EsquemaTurnos } from "@/lib/sesionTurno"
import { supabase } from "@/lib/supabase"

/*
 * Ajustes de turnos por área (migración 20261080090000):
 *   - esquema 3x8 / 12x12 (permiso ESQUEMA_TURNOS). En 12x12 el turno 2
 *     lleva relevo de responsable a las 19:00. Se aplica al turno abierto y a
 *     los siguientes (migración 20261085).
 *   - respaldo automático (solo el dueño): si nadie hace el relevo, el cron
 *     abre el turno nuevo sin responsable 30 min después de su inicio.
 */
export interface AjustesTurnos {
  esquema: EsquemaTurnos
  turnosAutomaticos: boolean
}

export async function obtenerAjustesTurnos(area: AreaCodigo): Promise<AjustesTurnos | null> {
  const { data, error } = await supabase.rpc("ajustes_turnos", { p_area_codigo: area })
  if (error || !data) return null
  const fila = data as { esquema: EsquemaTurnos; turnos_automaticos: boolean }
  return { esquema: fila.esquema, turnosAutomaticos: fila.turnos_automaticos }
}

export async function guardarEsquemaTurnos(
  usuario: string,
  area: AreaCodigo,
  esquema: EsquemaTurnos,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("guardar_esquema_turnos", {
    p_usuario: usuario,
    p_area_codigo: area,
    p_esquema: esquema,
  })
  if (error) return { ok: false, error: error.message || "No se pudo cambiar el esquema." }
  return { ok: true }
}

/**
 * Grupo que le toca a un turno por la rotación semanal (migración 20261087:
 * el de T1 pasa a T3, el de T3 a T2 y el de T2 a T1). null = el área no
 * tiene rotación cargada, o no se pudo consultar.
 */
export async function grupoDeRotacion(area: AreaCodigo, fecha: string, turnoTipo: TurnoTipoCodigo): Promise<GrupoCodigo | null> {
  const { data, error } = await supabase.rpc("grupo_de_rotacion", {
    p_area_codigo: area,
    p_fecha: fecha,
    p_turno_tipo_codigo: turnoTipo,
  })
  if (error || !data) return null
  return data as GrupoCodigo
}

export async function guardarTurnosAutomaticos(
  usuario: string,
  area: AreaCodigo,
  activo: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("guardar_turnos_automaticos", {
    p_usuario: usuario,
    p_area_codigo: area,
    p_activo: activo,
  })
  if (error) return { ok: false, error: error.message || "No se pudo cambiar el ajuste." }
  return { ok: true }
}
