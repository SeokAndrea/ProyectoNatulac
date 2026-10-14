import { supabase } from "@/lib/supabase"
import type { DatosMes, ModoMes, RegistroMes } from "@/lib/indicadores/tipos"

/*
 * Lo guardado de Indicadores (migración 20261109990000, tabla
 * indicadores_mes): el modo de cada mes, lo cargado a mano y las
 * observaciones. Lo automático no se guarda: se calcula al abrir
 * (src/lib/indicadores/automatico.ts).
 */

type Resultado = { ok: true } | { ok: false; error: string }

const resultado = (error: { message?: string } | null, porDefecto: string): Resultado =>
  error ? { ok: false, error: error.message || porDefecto } : { ok: true }

export async function cargarRegistros(usuario: string, area: string, desde: string, hasta: string): Promise<RegistroMes[] | { error: string }> {
  const { data, error } = await supabase.rpc("indicadores_meses", { p_usuario: usuario, p_area_codigo: area, p_desde: desde, p_hasta: hasta })
  if (error) return { error: error.message || "No se pudieron leer los indicadores." }
  return ((data ?? []) as { mes: string; modo: ModoMes; datos: DatosMes | null; observaciones: Record<string, string> | null }[]).map((f) => ({
    mes: f.mes,
    modo: f.modo,
    datos: f.datos,
    observaciones: f.observaciones ?? {},
  }))
}

/** Cambia el modo del mes; con `datos`, guarda también lo cargado a mano. */
export async function guardarMes(usuario: string, area: string, mes: string, modo: ModoMes, datos: DatosMes | null = null): Promise<Resultado> {
  const { error } = await supabase.rpc("guardar_indicadores_mes", { p_usuario: usuario, p_area_codigo: area, p_mes: mes, p_modo: modo, p_datos: datos })
  return resultado(error, "No se pudo guardar el mes.")
}

/** Texto vacío = se borra. */
export async function guardarObservacion(usuario: string, area: string, mes: string, clave: string, texto: string): Promise<Resultado> {
  const { error } = await supabase.rpc("guardar_observacion_indicador", { p_usuario: usuario, p_area_codigo: area, p_mes: mes, p_clave: clave, p_texto: texto })
  return resultado(error, "No se pudo guardar la observación.")
}
