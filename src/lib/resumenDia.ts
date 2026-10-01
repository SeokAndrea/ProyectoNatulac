import { supabase } from "@/lib/supabase"

/*
 * Resumen del Día + Validar (permiso VALIDAR, Super Administrador o dueño):
 * cajas producidas en la jornada (7:00 a 7:00), por sabor + presentación,
 * total por línea y el mensaje para copiar y pegar (futuro bot de
 * Telegram). Debajo, cada corrida se valida: se confirma o se corrigen sus
 * cajas (paletas + sueltas). Lo primero que se ve es lo del supervisor; una
 * corrida corregida cuenta con la corrección. Datos: resumen_produccion_dia()
 * (migración 20261099); confirmar / corregir: confirmar_produccion() y
 * editar_produccion_validada() (20261078).
 */

type Resultado = { ok: true } | { ok: false; error: string }
export type EstadoValidacion = "PENDIENTE" | "CONFIRMADO" | "EDITADO"

/** Una corrida (turno + línea) con Producto Terminado en la jornada. */
export interface CorridaResumen {
  turnoLineaId: string
  turnoCodigo: string
  turnoTipo: string
  /** Solo se valida con el turno cerrado. */
  turnoCerrado: boolean
  lineaCodigo: string
  lineaNombre: string
  saborNombre: string
  volumenMl: number
  lote: string | null
  cajasXPaleta: number
  /** Lo que cargó el supervisor. */
  paletas: number
  cajasSueltas: number
  estado: EstadoValidacion
  /** La corrección, si estado === "EDITADO". */
  paletasValidadas: number | null
  cajasSueltasValidadas: number | null
  nota: string | null
  validadoPorNombre: string | null
}

/** Cajas que cargó el supervisor. */
export function cajasSupervisor(c: CorridaResumen): number {
  return c.paletas * c.cajasXPaleta + c.cajasSueltas
}

/** Cajas que cuentan: la corrección si se editó; si no, lo del supervisor. */
export function cajasOficiales(c: CorridaResumen): number {
  if (c.estado !== "EDITADO") return cajasSupervisor(c)
  return (c.paletasValidadas ?? c.paletas) * c.cajasXPaleta + (c.cajasSueltasValidadas ?? c.cajasSueltas)
}

export async function cargarResumenDia(usuario: string, area: string, fecha: string): Promise<CorridaResumen[] | { error: string }> {
  const { data, error } = await supabase.rpc("resumen_produccion_dia", { p_usuario: usuario, p_area_codigo: area, p_fecha: fecha })
  if (error) return { error: error.message || "No se pudo cargar el resumen del día." }
  return (
    (data ?? []) as {
      turno_linea_id: string
      turno_codigo: string
      turno_tipo_codigo: string
      turno_cerrado: boolean
      linea_codigo: string
      linea_nombre: string
      sabor_nombre: string | null
      presentacion_volumen_ml: number
      lote: string | null
      cajas_x_paleta: number
      paletas: number
      cajas_sueltas: number
      estado_validacion: "CONFIRMADO" | "EDITADO" | null
      paletas_validadas: number | null
      cajas_sueltas_validadas: number | null
      nota: string | null
      validado_por_nombre: string | null
    }[]
  ).map((f) => ({
    turnoLineaId: f.turno_linea_id,
    turnoCodigo: f.turno_codigo,
    turnoTipo: f.turno_tipo_codigo,
    turnoCerrado: f.turno_cerrado,
    lineaCodigo: f.linea_codigo,
    lineaNombre: f.linea_nombre,
    saborNombre: f.sabor_nombre ?? "Sin sabor",
    volumenMl: f.presentacion_volumen_ml,
    lote: f.lote,
    cajasXPaleta: f.cajas_x_paleta,
    paletas: f.paletas,
    cajasSueltas: f.cajas_sueltas,
    estado: f.estado_validacion ?? "PENDIENTE",
    paletasValidadas: f.paletas_validadas,
    cajasSueltasValidadas: f.cajas_sueltas_validadas,
    nota: f.nota,
    validadoPorNombre: f.validado_por_nombre,
  }))
}

/** "Sí, está bien": la corrida queda validada con lo del supervisor. */
export async function confirmarCorrida(usuario: string, turnoLineaId: string): Promise<Resultado> {
  const { error } = await supabase.rpc("confirmar_produccion", { p_usuario: usuario, p_turno_linea_id: turnoLineaId })
  return error ? { ok: false, error: error.message || "No se pudo confirmar." } : { ok: true }
}

/** Corrige las cajas de la corrida (paletas + sueltas), con una nota opcional. */
export async function corregirCajasCorrida(
  usuario: string,
  turnoLineaId: string,
  paletas: number,
  cajasSueltas: number,
  nota: string,
): Promise<Resultado> {
  const { error } = await supabase.rpc("editar_produccion_validada", {
    p_usuario: usuario,
    p_turno_linea_id: turnoLineaId,
    p_paletas: paletas,
    p_cajas_sueltas: cajasSueltas,
    p_nota: nota.trim() || null,
  })
  return error ? { ok: false, error: error.message || "No se pudo guardar la corrección." } : { ok: true }
}

/** Lo que suma el resumen: sabor, presentación, línea y cajas (las oficiales). */
export interface FilaResumenDia {
  saborNombre: string
  volumenMl: number
  lineaCodigo: string
  lineaNombre: string
  cajas: number
}

export function filasOficiales(corridas: CorridaResumen[]): FilaResumenDia[] {
  return corridas.map((c) => ({
    saborNombre: c.saborNombre,
    volumenMl: c.volumenMl,
    lineaCodigo: c.lineaCodigo,
    lineaNombre: c.lineaNombre,
    cajas: cajasOficiales(c),
  }))
}

/** "TPA-250 cm³" — 1000 y 500 ml son Tetra Brik (TBA); 330, 250 y 200 ml, Tetra Prisma (TPA), como en el acta. */
export function nombrePresentacion(volumenMl: number): string {
  return `${volumenMl >= 500 ? "TBA" : "TPA"}-${volumenMl} cm³`
}

export interface SaborPresentacion {
  saborNombre: string
  volumenMl: number
  cajas: number
}

/** Suma las líneas: una fila por sabor + presentación, de más a menos cajas. */
export function porSaborYPresentacion(filas: FilaResumenDia[]): SaborPresentacion[] {
  const m = new Map<string, SaborPresentacion>()
  for (const f of filas) {
    const clave = `${f.saborNombre}|${f.volumenMl}`
    const actual = m.get(clave) ?? { saborNombre: f.saborNombre, volumenMl: f.volumenMl, cajas: 0 }
    actual.cajas += f.cajas
    m.set(clave, actual)
  }
  return [...m.values()].sort((a, b) => b.cajas - a.cajas || a.saborNombre.localeCompare(b.saborNombre) || a.volumenMl - b.volumenMl)
}

/** Cajas por línea, en el orden de `lineas` (las que no produjeron, en 0). */
export function totalPorLinea(filas: FilaResumenDia[], lineas: { codigo: string; nombre: string }[]): { codigo: string; nombre: string; cajas: number }[] {
  return lineas.map((l) => ({ ...l, cajas: filas.filter((f) => f.lineaCodigo === l.codigo).reduce((a, f) => a + f.cajas, 0) }))
}

const miles = (n: number) => n.toLocaleString("es-CO")

/** "2026-10-01" → "01/10/2026" */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split("-")
  return `${d}/${m}/${a}`
}

/**
 * El mensaje para copiar y pegar:
 *   Buenos días, producción del día 01/10/2026
 *
 *   TPA-250 cm³ Pera: 2.401 cajas
 *   ...
 *
 *   Total: 7.204 cajas
 */
export function mensajeResumenDia(fecha: string, filas: FilaResumenDia[]): string {
  const items = porSaborYPresentacion(filas)
  if (items.length === 0) return `Buenos días, producción del día ${fechaCorta(fecha)}\n\nSin producción registrada.`
  const total = items.reduce((a, i) => a + i.cajas, 0)
  return [
    `Buenos días, producción del día ${fechaCorta(fecha)}`,
    "",
    ...items.map((i) => `${nombrePresentacion(i.volumenMl)} ${i.saborNombre}: ${miles(i.cajas)} cajas`),
    "",
    `Total: ${miles(total)} cajas`,
  ].join("\n")
}
