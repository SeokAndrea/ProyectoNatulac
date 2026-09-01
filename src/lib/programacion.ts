import { supabase } from "@/lib/supabase"

/*
 * Programación diaria (versión mínima): qué se planificó producir en la
 * jornada, por sabor + presentación y en cajas. La edita solo el
 * SUPERADMINISTRADOR (ver Programacion.tsx); el resto la ve de solo
 * lectura. El Panel de Producción la usa para el carrusel "Programación
 * diaria". Backend: supabase/migrations/20260970..20260973.
 */
export interface ProgramacionItem {
  saborId: string
  /** Ya viene con el criterio de sabor_display() (sin "(Clásicos)"/"(Especiales)"). */
  saborNombre: string
  presentacionId: string
  presentacionMl: number
  cajasPlan: number
}

/**
 * Fecha de la jornada de planta: el día de la empresa corre de 7am a
 * 7am, así que antes de las 7 la jornada sigue siendo la de "ayer".
 * Devuelve "YYYY-MM-DD" en hora local.
 */
export function fechaJornada(ahora: Date = new Date()): string {
  const d = new Date(ahora)
  if (d.getHours() < 7) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

interface FilaProgramacion {
  sabor_id: string
  sabor_nombre: string
  presentacion_id: string
  presentacion_volumen_ml: number
  cajas_plan: number
}

function mapear(filas: FilaProgramacion[]): ProgramacionItem[] {
  return filas.map((r) => ({
    saborId: r.sabor_id,
    saborNombre: r.sabor_nombre,
    presentacionId: r.presentacion_id,
    presentacionMl: r.presentacion_volumen_ml,
    cajasPlan: r.cajas_plan,
  }))
}

export async function obtenerProgramacionDia(areaCodigo: string, fecha: string): Promise<ProgramacionItem[]> {
  const { data, error } = await supabase.rpc("programacion_dia_de", { p_area_codigo: areaCodigo, p_fecha: fecha })
  if (error || !data) return []
  return mapear(data as FilaProgramacion[])
}

export type AccionProgramacion = "ALTA" | "CAMBIO" | "BAJA"

/** Un cambio en la programación diaria (para Auditoría). Append-only: ver la migración 20260977. */
export interface CambioProgramacion {
  /** Cuándo se hizo la edición (timestamptz ISO). */
  creadoEn: string
  usuarioNombre: string | null
  usuarioUsuario: string | null
  areaCodigo: string
  /** Jornada que se estaba planificando. */
  fechaJornada: string
  saborNombre: string
  presentacionMl: number | null
  accion: AccionProgramacion
  /** null en ALTA. */
  cajasAntes: number | null
  /** null en BAJA. */
  cajasDespues: number | null
}

interface FilaCambioProgramacion {
  creado_en: string
  usuario_nombre: string | null
  usuario_usuario: string | null
  area_codigo: string
  fecha_jornada: string
  sabor_nombre: string
  presentacion_volumen_ml: number | null
  accion: string
  cajas_antes: number | null
  cajas_despues: number | null
}

/**
 * Historial de cambios de la programación diaria, por fecha de EDICIÓN
 * (no de jornada), más nuevo primero. Solo SUPERADMINISTRADOR (el RPC
 * lo valida). Si la migración 20260977 todavía no está aplicada, el
 * RPC no existe y esto devuelve [].
 */
export async function listarProgramacionHistorial(
  usuario: string,
  filtros: { fechaDesde?: string; fechaHasta?: string },
): Promise<CambioProgramacion[]> {
  const { data, error } = await supabase.rpc("listar_programacion_historial", {
    p_usuario: usuario,
    p_fecha_desde: filtros.fechaDesde || null,
    p_fecha_hasta: filtros.fechaHasta || null,
  })
  if (error || !data) return []
  return (data as FilaCambioProgramacion[]).map((r) => ({
    creadoEn: r.creado_en,
    usuarioNombre: r.usuario_nombre,
    usuarioUsuario: r.usuario_usuario,
    areaCodigo: r.area_codigo,
    fechaJornada: r.fecha_jornada,
    saborNombre: r.sabor_nombre,
    presentacionMl: r.presentacion_volumen_ml,
    accion: (["ALTA", "CAMBIO", "BAJA"] as const).includes(r.accion as AccionProgramacion)
      ? (r.accion as AccionProgramacion)
      : "CAMBIO",
    cajasAntes: r.cajas_antes,
    cajasDespues: r.cajas_despues,
  }))
}

export async function guardarProgramacionDia(
  usuario: string,
  areaCodigo: string,
  fecha: string,
  items: { saborId: string; presentacionId: string; cajasPlan: number }[],
): Promise<{ ok: true; items: ProgramacionItem[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("guardar_programacion_dia", {
    p_usuario: usuario,
    p_area_codigo: areaCodigo,
    p_fecha: fecha,
    p_items: items.map((i) => ({
      sabor_id: i.saborId,
      presentacion_id: i.presentacionId,
      cajas_plan: Math.max(0, Math.round(i.cajasPlan)),
    })),
  })
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo guardar la programación." }
  return { ok: true, items: mapear(data as FilaProgramacion[]) }
}
