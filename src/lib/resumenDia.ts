import { supabase } from "@/lib/supabase"

/*
 * Resumen del Día (Super Administrador): cajas producidas en la jornada,
 * por sabor + presentación, total por línea y el mensaje para copiar y
 * pegar (futuro bot de Telegram). Datos: resumen_produccion_dia(),
 * migraciones 20261098 (solo el nombre del sabor, sin familia: 20261098190000).
 */

export interface FilaResumenDia {
  saborNombre: string
  volumenMl: number
  lineaCodigo: string
  lineaNombre: string
  cajas: number
}

export async function cargarResumenDia(usuario: string, area: string, fecha: string): Promise<FilaResumenDia[] | { error: string }> {
  const { data, error } = await supabase.rpc("resumen_produccion_dia", { p_usuario: usuario, p_area_codigo: area, p_fecha: fecha })
  if (error) return { error: error.message || "No se pudo cargar el resumen del día." }
  return (
    (data ?? []) as { sabor_nombre: string | null; presentacion_volumen_ml: number; linea_codigo: string; linea_nombre: string; cajas: number }[]
  ).map((f) => ({
    saborNombre: f.sabor_nombre ?? "Sin sabor",
    volumenMl: f.presentacion_volumen_ml,
    lineaCodigo: f.linea_codigo,
    lineaNombre: f.linea_nombre,
    cajas: Number(f.cajas),
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
