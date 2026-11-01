import { duracionMin, type GrupoTipo, type Parada } from "@/lib/paradas"
import { opcionDeFalla, type FallasDeParada, type OpcionFalla } from "./paradas"
import type { CatalogoFallas } from "./tipos"

/*
 * Cuentas del Panel de Paradas con el catálogo modular (Equipo › Sistema ›
 * Subsistema › Falla). Cuenta la falla de Mantenimiento si la hay; si no, la
 * de Producción. Las paradas sin falla del catálogo nuevo (las de antes del
 * switch y las que no son de equipo) no entran en los Top por nivel. Puras.
 */

export interface ParadaConFalla {
  parada: Parada
  produccion: OpcionFalla | null
  final: OpcionFalla | null
  /** La que cuenta: la de Mantenimiento, o la de Producción mientras no hay. */
  cuenta: OpcionFalla
}

/** Las paradas que tienen falla del catálogo nuevo, con sus fallas resueltas. */
export function conFallas(paradas: Parada[], fallas: Map<string, FallasDeParada>, c: CatalogoFallas): ParadaConFalla[] {
  const lista: ParadaConFalla[] = []
  for (const parada of paradas) {
    const f = fallas.get(parada.id)
    if (!f) continue
    const produccion = opcionDeFalla(c, f.fallaProduccionId)
    const final = opcionDeFalla(c, f.fallaFinalId)
    const cuenta = final ?? produccion
    if (cuenta) lista.push({ parada, produccion, final, cuenta })
  }
  return lista
}

export type NivelTop = "EQUIPO" | "SISTEMA" | "SUBSISTEMA" | "FALLA"

const clave: Record<NivelTop, (o: OpcionFalla) => string> = {
  EQUIPO: (o) => o.equipo.id,
  SISTEMA: (o) => o.sistema.id,
  SUBSISTEMA: (o) => o.subsistema.id,
  FALLA: (o) => o.falla.id,
}
const nombre: Record<NivelTop, (o: OpcionFalla) => string> = {
  EQUIPO: (o) => o.equipo.nombre,
  SISTEMA: (o) => `${o.sistema.nombre} · ${o.equipo.nombre}`,
  SUBSISTEMA: (o) => `${o.subsistema.nombre} · ${o.equipo.nombre}`,
  FALLA: (o) => `${o.falla.nombre} · ${o.subsistema.nombre}`,
}

const grupo = (codigo: string, nombre: string, clase: Parada["clase"]): GrupoTipo => ({ codigo, nombre, clase, veces: 0, minutos: 0, guiaMin: 0, desvioMin: null })
const porTiempo = (a: GrupoTipo, b: GrupoTipo) => b.minutos - a.minutos || b.veces - a.veces

/** Equipos, sistemas, subsistemas o fallas que más tiempo quitaron (con sus veces), del más al menos. */
export function topPorNivel(items: ParadaConFalla[], nivel: NivelTop, ahora: Date): GrupoTipo[] {
  const m = new Map<string, GrupoTipo>()
  for (const x of items) {
    const k = clave[nivel](x.cuenta)
    const g = m.get(k) ?? grupo(k, nombre[nivel](x.cuenta), x.parada.clase)
    g.veces += 1
    g.minutos += duracionMin(x.parada, ahora)
    m.set(k, g)
  }
  return [...m.values()].sort(porTiempo)
}

/**
 * Subsistemas con el catálogo nuevo si la parada tiene falla («Cámara aséptica ·
 * A3 Compact Flex»), mezclados con los del catálogo viejo (`viejos`, de
 * porSubsistema sobre las paradas sin falla nueva).
 */
export function subsistemasMezclados(items: ParadaConFalla[], viejos: GrupoTipo[], ahora: Date): GrupoTipo[] {
  return [...topPorNivel(items, "SUBSISTEMA", ahora).map((g) => ({ ...g, codigo: `nuevo:${g.codigo}` })), ...viejos].sort(porTiempo)
}

export interface Reparto {
  veces: number
  minutos: number
}

/** Paradas y minutos de cada responsable: Producción (Operacional) y Mantenimiento. */
export function porResponsable(paradas: Parada[], ahora: Date): { produccion: Reparto; mantenimiento: Reparto } {
  const r = { produccion: { veces: 0, minutos: 0 }, mantenimiento: { veces: 0, minutos: 0 } }
  for (const p of paradas) {
    const lado = p.responsable === "MANTENIMIENTO" ? r.mantenimiento : r.produccion
    lado.veces += 1
    lado.minutos += duracionMin(p, ahora)
  }
  return r
}

/** Por línea: cuántas paradas no programadas y cuántos minutos, en el orden de `lineas`. */
export function noProgramadasPorLinea(paradas: Parada[], lineas: string[], ahora: Date): { linea: string; veces: number; minutos: number }[] {
  return lineas.map((linea) => {
    const propias = paradas.filter((p) => p.lineaCodigo === linea && p.clase === "NO_PROGRAMADA")
    return { linea, veces: propias.length, minutos: propias.reduce((t, p) => t + duracionMin(p, ahora), 0) }
  })
}
