import type { ConteoInventario, ItemInventario, Momento } from "@/lib/inventario"
import { diaMesPlanta, horaCortaPlanta } from "@/lib/tiempoPlanta"

/*
 * Cuentas del Inventario diario — funciones puras. El servidor vuelve a
 * calcular lo que esperaba el sistema al guardar; estas son para
 * mostrarlo mientras se escribe.
 */

export const NOMBRE_MOMENTO: Record<Momento, string> = { MANANA: "mañana", TARDE: "tarde" }

/** Pulpa y kits de un sabor, juntos. */
export interface SaborInventario {
  saborId: string
  nombre: string
  pulpa: ItemInventario
  kits: ItemInventario
}

export function saboresDe(items: ItemInventario[]): SaborInventario[] {
  const porSabor = new Map<string, Partial<SaborInventario>>()
  for (const it of items) {
    if (it.seccion !== "MATERIA_PRIMA" || !it.saborId) continue
    const s = porSabor.get(it.saborId) ?? { saborId: it.saborId, nombre: it.nombre }
    if (it.tipo === "PULPA") s.pulpa = it
    if (it.tipo === "KITS") s.kits = it
    porSabor.set(it.saborId, s)
  }
  return [...porSabor.values()].filter((s): s is SaborInventario => !!s.pulpa && !!s.kits)
}

export const empaqueDe = (items: ItemInventario[]) => items.filter((it) => it.seccion === "EMPAQUE")

// ------------------------------------------------------------ borrador del formulario

/** Fila de Materia prima: el sabor elegido de la lista, pulpa y kits contados (texto de los inputs). */
export interface FilaMateriaPrima {
  clave: number
  saborId: string
  pulpa: string
  kits: string
}

/** Fila de Material de empaque: el item elegido de la lista y lo contado. */
export interface FilaEmpaque {
  clave: number
  codigo: string
  cantidad: string
}

const entero = (v: string): number | null => {
  if (v.trim() === "") return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : NaN
}
const mal = (v: string) => Number.isNaN(entero(v))

export function errorFilaMateriaPrima(f: FilaMateriaPrima): string | null {
  if (mal(f.pulpa) || mal(f.kits)) return "Usa números enteros, sin negativos."
  const hayNumeros = entero(f.pulpa) !== null || entero(f.kits) !== null
  if (!f.saborId && hayNumeros) return "Elige el sabor."
  if (f.saborId && !hayNumeros) return "Escribe la pulpa o los kits."
  return null
}

export function errorFilaEmpaque(f: FilaEmpaque): string | null {
  if (mal(f.cantidad)) return "Usa números enteros, sin negativos."
  if (!f.codigo && entero(f.cantidad) !== null) return "Elige el material."
  if (f.codigo && entero(f.cantidad) === null) return "Escribe la cantidad."
  return null
}

/** Lo que se manda al guardar: las filas completas y sin errores. */
export function conteosDelBorrador(materiaPrima: FilaMateriaPrima[], empaque: FilaEmpaque[]): ConteoInventario[] {
  const conteos: ConteoInventario[] = []
  for (const f of materiaPrima) {
    if (!f.saborId || errorFilaMateriaPrima(f) !== null) continue
    const pulpa = entero(f.pulpa)
    const kits = entero(f.kits)
    if (pulpa !== null) conteos.push({ tipo: "PULPA", saborId: f.saborId, empaqueCodigo: null, contado: pulpa })
    if (kits !== null) conteos.push({ tipo: "KITS", saborId: f.saborId, empaqueCodigo: null, contado: kits })
  }
  for (const f of empaque) {
    if (!f.codigo || errorFilaEmpaque(f) !== null) continue
    conteos.push({ tipo: "EMPAQUE", saborId: null, empaqueCodigo: f.codigo, contado: entero(f.cantidad)! })
  }
  return conteos
}

/** Pulpa: lo contado − lo que espera el sistema. null si no se escribió o es el primer conteo. */
export function diferenciaPulpa(pulpa: ItemInventario, texto: string): number | null {
  const contado = entero(texto)
  if (contado === null || Number.isNaN(contado) || pulpa.saldo === null) return null
  return contado - pulpa.saldo
}

// ------------------------------------------------------------ textos

const SINGULAR: Record<string, string> = { tambores: "tambor", kits: "kit", cajas: "caja", unidades: "unidad", rollos: "rollo" }

/** "2 tambores" / "1 kit". */
export function cantidadConUnidad(n: number, unidad: string): string {
  return `${n.toLocaleString("es-CO")} ${Math.abs(n) === 1 ? (SINGULAR[unidad] ?? unidad) : unidad}`
}

/** "Faltan 2 tambores" / "Sobra 1 tambor" / "Cuadra". */
export function textoDiferencia(diferencia: number, unidad: string): string {
  if (diferencia === 0) return "Cuadra"
  const n = Math.abs(diferencia)
  const verbo = diferencia < 0 ? (n === 1 ? "Falta" : "Faltan") : n === 1 ? "Sobra" : "Sobran"
  return `${verbo} ${cantidadConUnidad(n, unidad)}`
}

/** "05/10 07:12" en hora de planta. */
export const fechaHoraCorta = (iso: string) => `${diaMesPlanta(new Date(iso))} ${horaCortaPlanta(iso, iso)}`
