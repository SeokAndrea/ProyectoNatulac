import { supabase } from "@/lib/supabase"

/*
 * A quién le llegan los avisos de Solicitudes de Inspección / Intervención
 * (configuracion_app 'correo_mantenimiento_para', migración 20261112490000).
 * Lo lee el servicio "correo" (correo/servidor.mjs) en cada vuelta. Solo el dueño.
 */

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }

export interface EstadoCorreos {
  /** Sin mandar todavía (se reintentan). */
  esperando: number
  /** Ya no se reintentan (5 intentos). */
  fallidos: number
  /** Más de 24 h sin salir: ya no se mandan. */
  vencidos: number
  ultimoEnviadoEn: string | null
  ultimoError: string | null
}

export async function obtenerCorreosMantenimiento(): Promise<string> {
  const { data } = await supabase.rpc("obtener_configuracion", { p_clave: "correo_mantenimiento_para" })
  return typeof data === "string" ? data : ""
}

export async function guardarCorreosMantenimiento(usuario: string, correos: string): Promise<Resultado<null>> {
  const { error } = await supabase.rpc("guardar_configuracion", {
    p_usuario: usuario,
    p_clave: "correo_mantenimiento_para",
    p_valor: correos.trim(),
    p_pagina: "Edición de Datos",
  })
  return error ? { ok: false, error: error.message || "No se pudieron guardar los correos." } : { ok: true, datos: null }
}

export async function obtenerEstadoCorreos(usuario: string): Promise<EstadoCorreos | null> {
  const { data, error } = await supabase.rpc("estado_correos", { p_usuario: usuario })
  if (error || !data) return null
  const d = data as { esperando: number; fallidos: number; vencidos: number; ultimo_enviado_en: string | null; ultimo_error: string | null }
  return {
    esperando: Number(d.esperando),
    fallidos: Number(d.fallidos),
    vencidos: Number(d.vencidos ?? 0),
    ultimoEnviadoEn: d.ultimo_enviado_en,
    ultimoError: d.ultimo_error,
  }
}
