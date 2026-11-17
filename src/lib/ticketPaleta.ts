import { fechaHoja, numeroTurno, type Paleta } from "@/lib/trazabilidadPaletizado"

/*
 * Ticket de paleta impreso por el sistema (migración 20261116590000). El
 * diseño lo aprobó Alexander el 2026-11-17 en el editor en línea: ver
 * docs/ticket-paletas/plan-tickets-paletas.md, sección 2.
 */

/** Nº de paleta con 4 dígitos (0012), sin el código del sabor. */
export function numeroPaleta4(numero: number | null): string {
  if (numero === null || !Number.isFinite(numero)) return "----"
  return String(Math.max(0, Math.min(9999, Math.trunc(numero)))).padStart(4, "0")
}

/** «Línea 1» → «1»; otro nombre se deja igual. */
export function numeroLinea(nombre: string): string {
  return nombre.replace(/^l[ií]nea\s*/i, "").trim() || nombre
}

/** Línea del sabor: «MZ · Manzana» (código de paletizado + nombre del sabor, sin la familia). */
export function lineaSabor(p: Pick<Paleta, "saborCodigo" | "saborNombre" | "saborNombreBase">): string {
  const nombre = p.saborNombreBase || p.saborNombre || "Sin sabor"
  return p.saborCodigo ? `${p.saborCodigo} · ${nombre}` : nombre
}

/** «TBA-1000 cm3 · Automático» (sin los ml). */
export function lineaPresentacion(p: Pick<Paleta, "presentacionCodigo" | "presentacionMl" | "tipoPaletizado">): string {
  const pres = p.presentacionCodigo || (p.presentacionMl !== null ? `${p.presentacionMl} ml` : "Sin presentación")
  return `${pres} · ${p.tipoPaletizado === "MANUAL" ? "Manual" : "Automático"}`
}

/** Vencimiento para la etiqueta: «14/08/2027», o «—» si el sabor no tenía vida útil. */
export const textoVence = (vence: string | null) => (vence ? fechaHoja(vence) : "—")

/**
 * Texto del QR (versión 1). La app busca por T=; los demás campos se leen con
 * cualquier lector sin la app. Los «;» y «=» de los valores se cambian para no
 * romper el formato.
 */
export function textoQR(p: Paleta): string {
  const limpio = (v: string | number | null | undefined) => String(v ?? "").replace(/[;=]/g, " ").trim()
  const campos: [string, string | number | null][] = [
    ["T", p.ticket],
    ["L", numeroLinea(p.lineaNombre)],
    ["F", p.fechaProduccion],
    ["V", p.vence],
    ["S", p.saborCodigo],
    ["P", p.presentacionMl],
    ["N", numeroPaleta4(p.numero)],
    ["CJ", p.cajas],
    ["LT", p.lote],
    ["TU", numeroTurno(p.turnoTipo)],
    ["C", p.conforme ? "C" : "NC"],
  ]
  return ["NTLPT1", ...campos.map(([k, v]) => `${k}=${limpio(v)}`)].join(";")
}

/**
 * Lo que se pega en el buscador de Trazabilidad → el código del ticket.
 * Acepta el texto completo del QR («NTLPT1;T=P-000124;…»), solo el código
 * («p-000124») o un ticket escrito a mano. Vacío → null.
 */
export function extraerTicket(texto: string): string | null {
  const t = texto.trim()
  if (!t) return null
  const m = /(?:^|;)\s*T\s*=\s*([^;]+)/i.exec(t)
  if (/^NTLPT\d*;/i.test(t) && m) return m[1].trim().toUpperCase() || null
  return t.toUpperCase()
}
