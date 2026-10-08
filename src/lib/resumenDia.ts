import { supabase } from "@/lib/supabase"

/*
 * Resumen del Día + Validar (permiso VALIDAR, Super Administrador o dueño):
 * cajas producidas en la jornada (7:00 a 7:00), por sabor + presentación,
 * total por línea y el mensaje para copiar y pegar (futuro bot de
 * Telegram). Se valida el número del DÍA: cada sabor + presentación se
 * confirma (vale lo del supervisor) o se corrige su total de cajas. El
 * mensaje y el total usan el número oficial; el total por línea, lo del
 * supervisor. Datos: resumen_produccion_dia(), validacion_dia_de() y
 * validar_dia() (migración 20261099190000).
 */

type Resultado = { ok: true } | { ok: false; error: string }
export type EstadoValidacion = "PENDIENTE" | "CONFIRMADO" | "EDITADO"

/** Lo que cargaron los supervisores: sabor, presentación, línea y cajas. */
export interface FilaResumenDia {
  saborNombre: string
  volumenMl: number
  lineaCodigo: string
  lineaNombre: string
  cajas: number
}

/** La validación guardada de un sabor + presentación del día. */
export interface ValidacionDia {
  saborNombre: string
  volumenMl: number
  estado: "CONFIRMADO" | "EDITADO"
  /** Total corregido (solo si estado === "EDITADO"). */
  cajas: number | null
  nota: string | null
  validadoPorNombre: string | null
}

export async function cargarResumenDia(
  usuario: string,
  area: string,
  fecha: string,
): Promise<{ filas: FilaResumenDia[]; validaciones: ValidacionDia[] } | { error: string }> {
  const args = { p_usuario: usuario, p_area_codigo: area, p_fecha: fecha }
  const [resumen, validacion] = await Promise.all([
    supabase.rpc("resumen_produccion_dia", args),
    supabase.rpc("validacion_dia_de", args),
  ])
  const error = resumen.error ?? validacion.error
  if (error) return { error: error.message || "No se pudo cargar el resumen del día." }
  const filas = (
    (resumen.data ?? []) as { sabor_nombre: string | null; presentacion_volumen_ml: number; linea_codigo: string; linea_nombre: string; cajas: number }[]
  ).map((f) => ({
    saborNombre: f.sabor_nombre ?? "Sin sabor",
    volumenMl: f.presentacion_volumen_ml,
    lineaCodigo: f.linea_codigo,
    lineaNombre: f.linea_nombre,
    cajas: Number(f.cajas),
  }))
  const validaciones = (
    (validacion.data ?? []) as {
      sabor_nombre: string
      presentacion_volumen_ml: number
      estado: "CONFIRMADO" | "EDITADO"
      cajas: number | null
      nota: string | null
      validado_por_nombre: string | null
    }[]
  ).map((v) => ({
    saborNombre: v.sabor_nombre,
    volumenMl: v.presentacion_volumen_ml,
    estado: v.estado,
    cajas: v.cajas,
    nota: v.nota,
    validadoPorNombre: v.validado_por_nombre,
  }))
  return { filas, validaciones }
}

/** Confirma (cajas null: vale lo del supervisor) o corrige el total de cajas de un sabor + presentación del día. */
export async function validarDia(
  usuario: string,
  area: string,
  fecha: string,
  saborNombre: string,
  volumenMl: number,
  cajas: number | null,
  nota: string,
): Promise<Resultado> {
  const { error } = await supabase.rpc("validar_dia", {
    p_usuario: usuario,
    p_area_codigo: area,
    p_fecha: fecha,
    p_sabor_nombre: saborNombre,
    p_volumen_ml: volumenMl,
    p_cajas: cajas,
    p_nota: nota.trim() || null,
  })
  return error ? { ok: false, error: error.message || "No se pudo guardar." } : { ok: true }
}

/** "TPA-250 cm³" — 1000 y 500 ml son Tetra Brik (TBA); 330, 250 y 200 ml, Tetra Prisma (TPA), como en el acta. */
export function nombrePresentacion(volumenMl: number): string {
  return `${volumenMl >= 500 ? "TBA" : "TPA"}-${volumenMl} cm³`
}

/** Una fila del día: sabor + presentación, lo del supervisor, su validación y el número oficial. */
export interface ItemDia {
  saborNombre: string
  volumenMl: number
  /** Suma de lo que cargaron los supervisores (todas las líneas). */
  cajasSupervisor: number
  estado: EstadoValidacion
  /** El que cuenta: la corrección si hay; si no, lo del supervisor. */
  cajasOficiales: number
  nota: string | null
  validadoPorNombre: string | null
}

/**
 * Una fila por sabor + presentación, de más a menos cajas oficiales. Suma
 * las líneas y le pega su validación; una validación sin producción (ej.
 * se corrigió un PT después) igual aparece, con 0 del supervisor.
 */
export function itemsDelDia(filas: FilaResumenDia[], validaciones: ValidacionDia[] = []): ItemDia[] {
  const m = new Map<string, ItemDia>()
  const clave = (sabor: string, volumen: number) => `${sabor}|${volumen}`
  for (const f of filas) {
    const k = clave(f.saborNombre, f.volumenMl)
    const actual = m.get(k) ?? {
      saborNombre: f.saborNombre,
      volumenMl: f.volumenMl,
      cajasSupervisor: 0,
      estado: "PENDIENTE" as EstadoValidacion,
      cajasOficiales: 0,
      nota: null,
      validadoPorNombre: null,
    }
    actual.cajasSupervisor += f.cajas
    m.set(k, actual)
  }
  for (const v of validaciones) {
    const k = clave(v.saborNombre, v.volumenMl)
    const actual = m.get(k) ?? {
      saborNombre: v.saborNombre,
      volumenMl: v.volumenMl,
      cajasSupervisor: 0,
      estado: "PENDIENTE" as EstadoValidacion,
      cajasOficiales: 0,
      nota: null,
      validadoPorNombre: null,
    }
    m.set(k, { ...actual, estado: v.estado, nota: v.nota, validadoPorNombre: v.validadoPorNombre })
  }
  return [...m.values()]
    .map((i) => {
      const v = validaciones.find((x) => x.saborNombre === i.saborNombre && x.volumenMl === i.volumenMl)
      return { ...i, cajasOficiales: v?.estado === "EDITADO" && v.cajas !== null ? v.cajas : i.cajasSupervisor }
    })
    // Por sabor (alfabético) y, dentro de cada sabor, de la presentación más grande a la más chica: 1000, 500, 330, 200.
    .sort((a, b) => a.saborNombre.localeCompare(b.saborNombre, "es") || b.volumenMl - a.volumenMl)
}

/** Cajas por línea (lo del supervisor), en el orden de `lineas` (las que no produjeron, en 0). */
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
 * El mensaje para copiar y pegar, con los números oficiales:
 *   Buenos días, producción del día 01/10/2026
 *
 *   TPA-250 cm³ Pera: 2.401 cajas
 *   ...
 *
 *   Total: 7.204 cajas
 */
/**
 * Nombre del sabor en el mensaje de WhatsApp (dueña, 2026-10-08): los
 * néctares clásicos y los Selecto 35% de esos sabores llevan "Néctar de"
 * ("Néctar de Pera", "Néctar de Pera 35%") y la Naranja se llama Naranjada.
 * Los demás (Coctel, Jucosa, Premium, Té…) van con su nombre tal cual.
 */
const NECTARES = new Set(["pera", "manzana", "durazno", "mango"])
export function saborEnMensaje(saborNombre: string): string {
  const nombre = saborNombre.trim()
  const clave = nombre.toLowerCase()
  if (clave === "naranja") return "Naranjada"
  const base = clave.replace(/\s*35\s*%$/, "")
  return NECTARES.has(base) ? `Néctar de ${nombre}` : saborNombre
}

export function mensajeResumenDia(fecha: string, items: ItemDia[]): string {
  const conCajas = items.filter((i) => i.cajasOficiales > 0)
  if (conCajas.length === 0) return `Buenos días, producción del día ${fechaCorta(fecha)}\n\nSin producción registrada.`
  const total = conCajas.reduce((a, i) => a + i.cajasOficiales, 0)
  return [
    `Buenos días, producción del día ${fechaCorta(fecha)}`,
    "",
    ...conCajas.map((i) => `${nombrePresentacion(i.volumenMl)} ${saborEnMensaje(i.saborNombre)}: ${miles(i.cajasOficiales)} cajas`),
    "",
    `Total: ${miles(total)} cajas`,
  ].join("\n")
}

/**
 * Pasar las cajas de una fila a otra presentación (ej. se cargó como 250 y
 * era 200): la fila de origen queda en 0 y el destino suma esas cajas a lo
 * que ya tenía. Solo el número oficial del día; los datos del turno no se
 * tocan. Devuelve las dos validaciones a guardar, en orden.
 */
export function pasosCambioPresentacion(
  items: ItemDia[],
  item: ItemDia,
  volumenDestino: number,
  cajas: number,
  nota: string,
): { volumenMl: number; cajas: number; nota: string }[] {
  const destino = items.find((i) => i.saborNombre === item.saborNombre && i.volumenMl === volumenDestino)
  const extra = nota.trim() ? ` ${nota.trim()}` : ""
  return [
    { volumenMl: item.volumenMl, cajas: 0, nota: `Pasó a ${volumenDestino} ml.${extra}` },
    { volumenMl: volumenDestino, cajas: (destino?.cajasOficiales ?? 0) + cajas, nota: `Incluye ${cajas} cajas de ${item.volumenMl} ml.${extra}` },
  ]
}
