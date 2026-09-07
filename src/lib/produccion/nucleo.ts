/**
 * Núcleo de Producción: el ciclo idealizado de una corrida — activar →
 * pausar/continuar → terminar. Más confirmar (Recepción) y registrar
 * contador (paso normal de toda corrida). Cualquier función para cuando
 * algo salió distinto de lo planeado (falla, continuar al siguiente lote,
 * entregar al turno que sigue, corregir una justificación) va en
 * ajustes.ts — ver plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Extraídas de src/lib/turno.tsx, mismo comportamiento, ninguna RPC nueva.
 *
 * Costura 1 (Producción lee Preparación al activar) y costura 2 (cerrar
 * una corrida no debería poder cerrar el tanque) siguen resueltas hoy
 * DENTRO de las funciones de Postgres — angostarlas de verdad es trabajo
 * de la Fase 2 (base de datos), no de este paso.
 */
import { supabase } from "@/lib/supabase"
import { litrosHoraDeLive, type VelocidadLive } from "@/lib/catalogosLive"
import type { DatosActivarLinea, DatosCambiarLinea, DatosNuevoContador, Resultado } from "./tipos"

export async function activarLinea(
  usuario: string,
  turnoId: string,
  datos: DatosActivarLinea,
  velocidades: VelocidadLive[],
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("activar_linea", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_linea_codigo: datos.linea,
    p_presentacion_volumen_ml: Number(datos.presentacion),
    p_envases_hora: datos.envasesHora,
    p_litros_hora: litrosHoraDeLive(velocidades, datos.linea, datos.presentacion, datos.envasesHora),
    p_numero_tanque: datos.numeroTanque,
    p_confirmar_inicio: datos.confirmarInicio ?? false,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo activar la línea. Intenta de nuevo." }
  }
  return { ok: true, data }
}

export async function pausarLinea(usuario: string, turnoId: string, corridaId: string): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("pausar_linea", { p_usuario: usuario, p_turno_id: turnoId, p_turno_linea_id: corridaId })
  if (error || !data) return { ok: false, error: "No se pudo pausar la línea. Intenta de nuevo." }
  return { ok: true, data }
}

export async function continuarLinea(usuario: string, turnoId: string, corridaId: string): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("continuar_linea", { p_usuario: usuario, p_turno_id: turnoId, p_turno_linea_id: corridaId })
  if (error || !data) return { ok: false, error: "No se pudo continuar la línea. Intenta de nuevo." }
  return { ok: true, data }
}

/** "Terminó Lote": cierra la corrida Y el tanque que la alimentaba (Fase 2: acá es donde va a exigir el PT total del tramo). */
export async function terminarSaborLinea(usuario: string, turnoId: string, corridaId: string): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("terminar_sabor_linea", { p_usuario: usuario, p_turno_id: turnoId, p_turno_linea_id: corridaId })
  if (error || !data) return { ok: false, error: "No se pudo terminar el sabor. Intenta de nuevo." }
  return { ok: true, data }
}

/** "Terminó Línea": para la corrida SIN cerrar el tanque — a diferencia de terminarSaborLinea, que sí lo cierra. */
export async function terminarLinea(usuario: string, turnoId: string, corridaId: string): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("terminar_linea", { p_usuario: usuario, p_turno_id: turnoId, p_turno_linea_id: corridaId })
  if (error || !data) return { ok: false, error: "No se pudo terminar la línea. Intenta de nuevo." }
  return { ok: true, data }
}

export async function cambiarCondicionLinea(usuario: string, turnoId: string, datos: DatosCambiarLinea): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("cambiar_condicion_linea", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_linea_codigo: datos.linea,
    p_condicion: datos.condicion,
    p_observacion: datos.condicion === "DETENIDA" ? (datos.observacion?.trim() || null) : null,
  })
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo cambiar el estado de la línea. Intenta de nuevo." }
  return { ok: true, data }
}

/** El paso de revisión de Recepción para una corrida heredada activa: "así quedó, confirmo que está bien". */
export async function confirmarEstadoLinea(usuario: string, turnoId: string, corridaId: string): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("confirmar_estado_linea", { p_usuario: usuario, p_turno_id: turnoId, p_turno_linea_id: corridaId })
  if (error || !data) return { ok: false, error: "No se pudo confirmar el estado de la línea. Intenta de nuevo." }
  return { ok: true, data }
}

export async function registrarContador(usuario: string, turnoId: string, datos: DatosNuevoContador): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("registrar_contador", {
    p_turno_id: turnoId,
    p_turno_linea_id: datos.corridaId,
    p_linea_codigo: datos.linea,
    p_envases_llenadora: datos.envasesLlenadora,
    p_justificacion: datos.justificacion,
    p_usuario: usuario,
    p_parcial: datos.parcial ?? false,
    p_pagina: "Producto Terminado y Contador",
    p_envases_buenos: datos.envasesBuenos ?? null,
  })
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo registrar el contador. Intenta de nuevo." }
  return { ok: true, data }
}
