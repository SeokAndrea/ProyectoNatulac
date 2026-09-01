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

/*
 * Los cambios de la programación diaria se auditan en la tabla común
 * `auditoria` (entidad "programacion_dia") desde guardar_programacion_dia —
 * ver la migración 20260981. Se leen con listarAuditoria() en
 * src/lib/auditoria.ts, no hay un RPC propio.
 */
export async function guardarProgramacionDia(
  usuario: string,
  areaCodigo: string,
  fecha: string,
  items: { saborId: string; presentacionId: string; cajasPlan: number }[],
  pagina: string,
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
    p_pagina: pagina,
  })
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo guardar la programación." }
  return { ok: true, items: mapear(data as FilaProgramacion[]) }
}
