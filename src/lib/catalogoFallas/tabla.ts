import { tienePalabras } from "@/lib/texto"
import type { CatalogoFallas, EquipoCatalogo, FallaCatalogo, NivelCatalogo, SistemaCatalogo, SubsistemaCatalogo } from "./tipos"

/*
 * El catálogo como tabla: una franja por subsistema (Equipo › Sistema ›
 * Subsistema) con sus fallas debajo, ordenado como los códigos. Funciones puras.
 */

export interface GrupoTabla {
  equipo: EquipoCatalogo
  sistema: SistemaCatalogo
  subsistema: SubsistemaCatalogo
  /** Las que se ven (con la búsqueda aplicada). */
  fallas: FallaCatalogo[]
  /** Todas las del subsistema que se pueden ver, coincidan o no. */
  total: number
}

const porSufijo = <T extends { sufijo: string }>(a: T, b: T) => a.sufijo.localeCompare(b.sufijo)

/**
 * Grupos que coinciden con los filtros. La búsqueda mira el nombre y el código
 * de la falla y los nombres (y el código del Sheet) de sus niveles: si coincide
 * un nivel, van todas sus fallas. Sin búsqueda también van los subsistemas que
 * todavía no tienen fallas, para poder agregarles.
 */
export function armarGrupos(c: CatalogoFallas, filtros: { busqueda: string; equipoId: string; verInactivos: boolean }): GrupoTabla[] {
  const visible = (x: { activo: boolean }) => filtros.verInactivos || x.activo
  const hayBusqueda = filtros.busqueda.trim() !== ""
  const grupos: GrupoTabla[] = []

  for (const equipo of c.equipos.filter((e) => visible(e) && (!filtros.equipoId || e.id === filtros.equipoId)).sort(porSufijo)) {
    for (const sistema of c.sistemas.filter((s) => s.equipoId === equipo.id && visible(s)).sort(porSufijo)) {
      for (const subsistema of c.subsistemas.filter((u) => u.sistemaId === sistema.id && visible(u)).sort(porSufijo)) {
        const todas = c.fallas.filter((f) => f.subsistemaId === subsistema.id && visible(f)).sort((a, b) => a.numero - b.numero)
        const niveles = `${equipo.nombre} ${sistema.nombre} ${subsistema.nombre} ${subsistema.codigoSheet ?? ""}`
        const fallas =
          !hayBusqueda || tienePalabras(niveles, filtros.busqueda)
            ? todas
            : todas.filter((f) => tienePalabras(`${f.nombre} ${f.codigo} ${niveles}`, filtros.busqueda))
        if (hayBusqueda && fallas.length === 0) continue
        grupos.push({ equipo, sistema, subsistema, fallas, total: todas.length })
      }
    }
  }
  return grupos
}

/** Equipos con sistemas pero sin ningún subsistema (no salen en la tabla: se avisan aparte). */
export const equiposSinSubsistemas = (c: CatalogoFallas) =>
  c.equipos.filter((e) => e.activo && !c.subsistemas.some((u) => u.activo && c.sistemas.some((s) => s.id === u.sistemaId && s.equipoId === e.id)))

/** Fallas que cuelgan de un nivel (para el aviso de cuántos códigos cambian). */
export function fallasDeNivel(c: CatalogoFallas, nivel: NivelCatalogo, id: string): number {
  const subsistemas =
    nivel === "SUBSISTEMA"
      ? [id]
      : c.subsistemas
          .filter((u) => (nivel === "SISTEMA" ? u.sistemaId === id : c.sistemas.some((s) => s.id === u.sistemaId && s.equipoId === id)))
          .map((u) => u.id)
  return c.fallas.filter((f) => subsistemas.includes(f.subsistemaId)).length
}
