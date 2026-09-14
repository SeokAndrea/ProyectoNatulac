/**
 * Realidad de Producción: qué corridas son "comparables" (contador Y
 * Producto Terminado cargados) antes de sumarlas para la merma de
 * envases. Ver plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Extraído de mermaCorrida()/mermaEnvasesDeCorridas() (antes en
 * src/lib/turno.tsx y src/lib/panelProduccion.ts), mismo comportamiento
 * exacto — leyendo de los tipos de Producción/Producto Terminado en vez
 * de un TurnoActivo combinado.
 */
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { ContadorRegistro } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { pctRendimiento } from "./teorico"

/**
 * Envases de la llenadora vs. envases de Producto Terminado, de UNA
 * corrida. null si falta el contador o el PT.
 */
export function mermaCorrida(
  corridaId: string,
  contadores: ContadorRegistro[],
  productoTerminado: ProductoTerminadoRegistro[],
  presentaciones: PresentacionLive[],
): { envasesLlenadora: number; envasesProductoTerminado: number; pct: number } | null {
  const llenadora = contadores
    .filter((c) => c.corridaId === corridaId)
    .reduce((a, c) => a + c.envasesLlenadora, 0)
  const pt = productoTerminado.find((p) => p.corridaId === corridaId)
  if (llenadora === 0 || !pt) return null

  const pres = presentaciones.find((p) => p.codigo === pt.presentacion)
  const envasesXCaja = pres?.envasesXCaja ?? 0
  const cajasXPaleta = pres?.cajasXPaleta ?? 0
  const envasesPt = (pt.paletas * cajasXPaleta + pt.cajasSueltas) * envasesXCaja

  return {
    envasesLlenadora: llenadora,
    envasesProductoTerminado: envasesPt,
    pct: pctRendimiento(llenadora, envasesPt) as number,
  }
}

/**
 * Merma de envases sumando SOLO las corridas ya comparables (contador Y
 * PT). Una corrida con contador pero sin PT todavía no cuenta como "100%
 * de merma": queda afuera hasta que se cargue el PT. Si ninguna corrida
 * es comparable → null ("—").
 */
export function mermaEnvasesDeCorridas(
  corridaIds: Iterable<string>,
  contadores: ContadorRegistro[],
  productoTerminado: ProductoTerminadoRegistro[],
  presentaciones: PresentacionLive[],
): { pct: number | null } {
  let llenadora = 0
  let reales = 0
  let algunaComparable = false

  for (const id of new Set(corridaIds)) {
    const m = mermaCorrida(id, contadores, productoTerminado, presentaciones)
    if (!m) continue
    algunaComparable = true
    llenadora += m.envasesLlenadora
    reales += m.envasesProductoTerminado
  }

  return { pct: !algunaComparable || llenadora === 0 ? null : (pctRendimiento(llenadora, reales) as number) }
}
