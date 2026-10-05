import { Apple, Cherry, Citrus, Droplets, Leaf } from "lucide-react"
import type { PresentacionLive } from "@/lib/catalogosLive"
import { equivalenciaEnvases, textoEquivalencia } from "@/lib/equivalenciaEnvases"
import { nivelMerma, type NivelMerma } from "@/lib/estadisticas"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { LIMITE_MERMA } from "@/lib/turno"

export const LIMITE_MERMA_PCT = LIMITE_MERMA * 100

/** Ícono + color por sabor (por nombre de fruta) — mismo criterio de color que el Panel de Producción, con un ícono cuando hay uno razonable. */
const FRUTA_INFO: Array<{ prueba: RegExp; Icono: typeof Apple; color: string }> = [
  { prueba: /manzana/i, Icono: Apple, color: "var(--flavor-red)" },
  { prueba: /durazno/i, Icono: Cherry, color: "var(--flavor-yellow)" },
  { prueba: /naranja/i, Icono: Citrus, color: "var(--flavor-orange)" },
  { prueba: /mango/i, Icono: Citrus, color: "var(--flavor-amber)" },
  { prueba: /pera/i, Icono: Leaf, color: "var(--flavor-green)" },
]
const COLORES_SABOR_FALLBACK = ["var(--flavor-orange)", "var(--flavor-green)", "var(--flavor-red)", "var(--flavor-yellow)"]

export function infoSabor(nombre: string | null): { color: string; Icono: typeof Apple } {
  if (!nombre) return { color: "var(--muted-foreground)", Icono: Droplets }
  const encontrada = FRUTA_INFO.find((f) => f.prueba.test(nombre))
  if (encontrada) return encontrada
  let hash = 0
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) % 997
  return { color: COLORES_SABOR_FALLBACK[hash % COLORES_SABOR_FALLBACK.length], Icono: Droplets }
}

/** Misma normalización que normalizar_lote() en la base: sirve para casar una corrida con su tanque por número de lote. */
export function normalizarLote(lote: string | null): string | null {
  if (lote === null) return null
  const t = lote.trim()
  if (t === "") return null
  if (!/^[0-9]+$/.test(t)) return t
  return (t.replace(/^0+/, "") || "0").padStart(4, "0")
}

/** El tanque Liberado (o Con Restos) que alimenta una corrida, por sabor + número de lote. null si ya se cerró / vació. */
export function tanqueDeCorrida(tanques: TanqueRecepcion[], saborId: string | null, lote: string | null): TanqueRecepcion | null {
  return (
    tanques.find(
      (t) => (t.condicion === "LISTO" || t.condicion === "STANDBY") && t.saborId === saborId && normalizarLote(t.lote) === normalizarLote(lote),
    ) ?? null
  )
}

/**
 * Δ envases = |Contador 2 (buenos) − envases confirmados por PT|. Ambos
 * números los tipea el mismo supervisor (no es evidencia independiente
 * real, eso llega recién con el robot — Fase 3) pero corrobora que uno
 * no se olvidó de actualizar cuando el otro cambió. null si falta
 * cualquiera de los dos (§2.6).
 */
export function deltaEnvases(
  registro: ProductoTerminadoRegistro | null,
  presentacion: PresentacionLive | undefined,
  contadorBuenosActual: number,
): number | null {
  if (!registro || contadorBuenosActual <= 0) return null
  const envasesPt = (registro.paletas * (presentacion?.cajasXPaleta ?? 0) + registro.cajasSueltas) * (presentacion?.envasesXCaja ?? 0)
  return Math.abs(contadorBuenosActual - envasesPt)
}

export interface VistaPreviaCarga {
  /** Cajas del total que se está escribiendo (paletas × cajas por paleta + sueltas). */
  cajas: number
  litros: number
  /** Texto "Equivale a N paletas y M cajas" de los envases buenos (lo cargado + lo que se escribe). */
  textoBuenos: string | null
  mermaPct: number | null
  nivel: NivelMerma | null
  /** Todavía no hay contador definitivo (solo lecturas de referencia): la merma que se ve es provisional. */
  mermaProvisional: boolean
}

/**
 * Lo que el formulario muestra mientras se escribe: totales de PT,
 * equivalencia de los envases buenos y la merma estimada contra el
 * contador (lo ya cargado + lo nuevo). Paletas/Cajas son el TOTAL de la
 * corrida (se editan, no se suman).
 */
export function vistaPreviaCarga(d: {
  presentacion: PresentacionLive | undefined
  paletas: string
  cajasSueltas: string
  contadorActual: number
  contadorBuenosActual: number
  /** Lo que se está sumando al contador de la llenadora ("" = nada). */
  envasesLlenadora: string
  /** Lo que se está sumando al Contador 2 ("" = nada). */
  envasesBuenos: string
}): VistaPreviaCarga {
  const { presentacion } = d
  const cajasXPaleta = presentacion?.cajasXPaleta ?? 0
  const cajas = (Number(d.paletas) || 0) * cajasXPaleta + (Number(d.cajasSueltas) || 0)
  const envasesPt = presentacion ? cajas * presentacion.envasesXCaja : 0
  const litros = presentacion ? (cajas * presentacion.envasesXCaja * presentacion.volumenMl) / 1000 : 0

  const contadorTotal = d.contadorActual + (d.envasesLlenadora === "" ? 0 : Number(d.envasesLlenadora))
  const nuevoBuenos = d.envasesBuenos === "" ? null : Number(d.envasesBuenos)
  const buenosTotal = d.contadorBuenosActual + (nuevoBuenos !== null && nuevoBuenos > 0 ? nuevoBuenos : 0)
  const equivalencia =
    presentacion && buenosTotal > 0 ? equivalenciaEnvases(buenosTotal, presentacion.envasesXCaja, presentacion.cajasXPaleta) : null
  const textoBuenos = equivalencia
    ? d.contadorBuenosActual > 0
      ? `Con lo ya cargado, ${buenosTotal.toLocaleString("es-CO")} envases buenos: equivale a ${textoEquivalencia(equivalencia)}.`
      : `Equivale a ${textoEquivalencia(equivalencia)}.`
    : null

  const mermaPct =
    contadorTotal > 0 && (d.paletas !== "" || d.cajasSueltas !== "") ? Math.round((1 - envasesPt / contadorTotal) * 10000) / 100 : null
  return {
    cajas,
    litros,
    textoBuenos,
    mermaPct,
    nivel: mermaPct === null ? null : nivelMerma(mermaPct, LIMITE_MERMA_PCT),
    mermaProvisional: mermaPct !== null && d.contadorActual === 0,
  }
}
