import type { ConteoInventario, FilaInventario } from "@/lib/inventario"
import { diaMesPlanta, horaCortaPlanta } from "@/lib/tiempoPlanta"

/*
 * Cuentas del Inventario diario — funciones puras. El servidor vuelve a
 * calcular "lo que esperaba el sistema" al guardar (por si cambió algo
 * entre que se abrió la pantalla y se guardó); estas son para mostrarlo
 * mientras se escribe.
 */

/** Lo que una fila del Inventario diario tiene escrito (texto de los inputs). */
export interface BorradorFila {
  llego: string
  contado: string
}

export const BORRADOR_VACIO: BorradorFila = { llego: "", contado: "" }

const entero = (v: string): number | null => {
  if (v.trim() === "") return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : NaN
}

/** Lo que debería haber al contar: saldo del sistema + lo que llegó. null si nunca se contó (primer conteo). */
export function esperado(fila: FilaInventario, borrador: BorradorFila): number | null {
  if (fila.saldo === null) return null
  const llego = entero(borrador.llego)
  return fila.saldo + (llego !== null && !Number.isNaN(llego) ? llego : 0)
}

/** contado − esperado: negativo = faltante, positivo = sobrante. null si no se escribió el conteo o es el primero. */
export function diferenciaDe(fila: FilaInventario, borrador: BorradorFila): number | null {
  const contado = entero(borrador.contado)
  const esp = esperado(fila, borrador)
  if (contado === null || Number.isNaN(contado) || esp === null) return null
  return contado - esp
}

/** Problema con lo escrito en la fila, o null si está bien (o vacía). */
export function errorDeFila(borrador: BorradorFila): string | null {
  const llego = entero(borrador.llego)
  const contado = entero(borrador.contado)
  if (Number.isNaN(llego) || Number.isNaN(contado)) return "Usa números enteros, sin negativos."
  if (llego !== null && contado === null) return "Falta lo contado."
  return null
}

/** Las filas con conteo escrito y sin errores, listas para guardar. */
export function conteosParaGuardar(filas: FilaInventario[], borradores: Record<string, BorradorFila>): ConteoInventario[] {
  return filas.flatMap((f) => {
    const b = borradores[f.saborId]
    if (!b || errorDeFila(b) !== null) return []
    const contado = entero(b.contado)
    if (contado === null || Number.isNaN(contado)) return []
    const llego = entero(b.llego)
    return [{ saborId: f.saborId, contado, llego: llego ?? 0 }]
  })
}

const SINGULAR: Record<FilaInventario["unidad"], string> = { tambores: "tambor", kits: "kit" }

/** "2 tambores" / "1 kit". */
export function cantidadConUnidad(n: number, unidad: FilaInventario["unidad"]): string {
  return `${n.toLocaleString("es-CO")} ${Math.abs(n) === 1 ? SINGULAR[unidad] : unidad}`
}

/** "Faltan 2 tambores" / "Sobra 1 kit" / "Cuadra". */
export function textoDiferencia(diferencia: number, unidad: FilaInventario["unidad"]): string {
  if (diferencia === 0) return "Cuadra"
  const n = Math.abs(diferencia)
  const verbo = diferencia < 0 ? (n === 1 ? "Falta" : "Faltan") : n === 1 ? "Sobra" : "Sobran"
  return `${verbo} ${cantidadConUnidad(n, unidad)}`
}

/** "05/10 07:12" en hora de planta. */
export const fechaHoraCorta = (iso: string) => `${diaMesPlanta(new Date(iso))} ${horaCortaPlanta(iso, iso)}`
