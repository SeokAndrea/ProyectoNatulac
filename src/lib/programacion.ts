import { supabase } from "@/lib/supabase"
import { lunesDe, pendienteAl, planDelDia, type Semana } from "@/lib/programacionSemanal"
import { fechaJornadaPlanta, restarDias } from "@/lib/tiempoPlanta"

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
 * 7am (hora de planta, America/Caracas), así que antes de las 7 la
 * jornada sigue siendo la de "ayer". Devuelve "YYYY-MM-DD".
 */
export function fechaJornada(ahora: Date = new Date()): string {
  return fechaJornadaPlanta(ahora)
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

// ------------------------------------------------------------
// Programación SEMANAL + DIARIA (dueña, 2026-10-14). Cuentas en
// src/lib/programacionSemanal.ts; base en la migración 20261110790000.
// ------------------------------------------------------------

type Resultado = { ok: true } | { ok: false; error: string }

interface RespuestaSemanas {
  items: { id: string; semana: string; sabor_id: string; sabor_nombre: string; presentacion_id: string; presentacion_ml: number; cajas_plan: number }[]
  dias: { item_id: string; fecha: string; estado: "ELEGIDO" | "QUITADO"; linea_codigo: string | null }[]
  producido: { fecha: string; sabor_id: string; presentacion_id: string; cajas: number }[]
  diario_viejo: { fecha: string; sabor_id: string; sabor_nombre: string; presentacion_id: string; presentacion_ml: number; cajas_plan: number }[]
}

/** Programación diaria de antes (semanas sin plan semanal). */
export interface PlanViejo extends ProgramacionItem {
  fecha: string
}

/**
 * Las semanas cuyo lunes cae entre `desde` y `hasta` (desde se lleva a su
 * lunes): el plan, lo decidido cada día y lo producido. También la
 * programación diaria vieja de las semanas que no tienen plan semanal.
 */
export async function leerSemanas(area: string, desde: string, hasta: string): Promise<{ semanas: Semana[]; viejo: PlanViejo[] } | { error: string }> {
  const { data, error } = await supabase.rpc("programacion_semanal_de", { p_area_codigo: area, p_desde: desde, p_hasta: hasta })
  if (error || !data) return { error: error?.message || "No se pudo leer la programación." }
  const r = data as RespuestaSemanas
  const lunes = [...new Set(r.items.map((i) => i.semana))]
  const semanas = lunes.map((l): Semana => {
    const items = r.items.filter((i) => i.semana === l)
    const ids = new Set(items.map((i) => i.id))
    // Hasta el domingo: sábado y domingo solo traen producción si fueron día extraordinario.
    const domingo = restarDias(l, -6)
    return {
      lunes: l,
      items: items.map((i) => ({
        id: i.id,
        semana: i.semana,
        saborId: i.sabor_id,
        saborNombre: i.sabor_nombre,
        presentacionId: i.presentacion_id,
        presentacionMl: i.presentacion_ml,
        cajasPlan: i.cajas_plan,
      })),
      decisiones: r.dias.filter((d) => ids.has(d.item_id)).map((d) => ({ itemId: d.item_id, fecha: d.fecha, estado: d.estado, lineaCodigo: d.linea_codigo })),
      producido: r.producido
        .filter((p) => p.fecha >= l && p.fecha <= domingo)
        .map((p) => ({ fecha: p.fecha, saborId: p.sabor_id, presentacionId: p.presentacion_id, cajas: Number(p.cajas) })),
    }
  })
  const viejo = r.diario_viejo.map((v) => ({
    fecha: v.fecha,
    saborId: v.sabor_id,
    saborNombre: v.sabor_nombre,
    presentacionId: v.presentacion_id,
    presentacionMl: v.presentacion_ml,
    cajasPlan: v.cajas_plan,
  }))
  return { semanas, viejo }
}

/** Una semana (aunque esté vacía), con lo producido. */
export async function leerSemana(area: string, lunes: string): Promise<Semana | { error: string }> {
  const r = await leerSemanas(area, lunes, lunes)
  if ("error" in r) return r
  return r.semanas.find((s) => s.lunes === lunes) ?? { lunes, items: [], decisiones: [], producido: [] }
}

const resultado = (error: { message?: string } | null, porDefecto: string): Resultado =>
  error ? { ok: false, error: error.message || porDefecto } : { ok: true }

export async function guardarItemSemana(usuario: string, area: string, lunes: string, saborId: string, presentacionId: string, cajas: number): Promise<Resultado> {
  const { error } = await supabase.rpc("guardar_item_semana", {
    p_usuario: usuario,
    p_area_codigo: area,
    p_semana: lunes,
    p_sabor_id: saborId,
    p_presentacion_id: presentacionId,
    p_cajas: Math.round(cajas),
    p_pagina: "Programación",
  })
  return resultado(error, "No se pudo guardar el producto en la semana.")
}

export async function eliminarItemSemana(usuario: string, itemId: string): Promise<Resultado> {
  const { error } = await supabase.rpc("eliminar_item_semana", { p_usuario: usuario, p_item_id: itemId, p_pagina: "Programación" })
  return resultado(error, "No se pudo quitar el producto de la semana.")
}

/** Pasa un producto a un día con su línea; con `lineaCodigo` null, lo saca de ese día. */
export async function programarItemDia(usuario: string, itemId: string, fecha: string, lineaCodigo: string | null): Promise<Resultado> {
  const { error } = await supabase.rpc("programar_item_dia", { p_usuario: usuario, p_item_id: itemId, p_fecha: fecha, p_linea_codigo: lineaCodigo, p_pagina: "Programación" })
  return resultado(error, "No se pudo cambiar el plan del día.")
}

/**
 * El plan de un día para el Panel: si la semana tiene plan semanal, lo que
 * entra ese día con lo pendiente al empezar; si no (o si la base todavía no
 * tiene la programación semanal), la programación diaria de antes.
 */
export async function obtenerPlanDelDia(areaCodigo: string, fecha: string): Promise<ProgramacionItem[]> {
  const sem = await leerSemana(areaCodigo, lunesDe(fecha))
  if ("error" in sem || sem.items.length === 0) return obtenerProgramacionDia(areaCodigo, fecha)
  return planDelDia(sem, fecha).map((x) => ({
    saborId: x.item.saborId,
    saborNombre: x.item.saborNombre,
    presentacionId: x.item.presentacionId,
    presentacionMl: x.item.presentacionMl,
    cajasPlan: pendienteAl(sem, x.item, fecha),
  }))
}
