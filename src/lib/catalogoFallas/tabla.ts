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

/**
 * Orden de creación; lo creado en el mismo instante (o sin fecha) queda por
 * sufijo. Lo reservado («General › Sin clasificar › Falla nueva») va siempre
 * al final de su nivel, aunque el sistema lo haya creado antes que lo del usuario.
 */
const porCreacion = <T extends { sufijo: string; creadoEn?: string; reservada?: boolean }>(a: T, b: T) =>
  Number(!!a.reservada) - Number(!!b.reservada) ||
  (a.creadoEn && b.creadoEn && a.creadoEn !== b.creadoEn ? a.creadoEn.localeCompare(b.creadoEn) : 0) ||
  a.sufijo.localeCompare(b.sufijo)

/**
 * Grupos que coinciden con los filtros. La búsqueda mira el nombre y el código
 * de la falla y los nombres (y el código del Sheet) de sus niveles: si coincide
 * un nivel, van todas sus fallas. Sin búsqueda también van los subsistemas que
 * todavía no tienen fallas, para poder agregarles.
 */
export function armarGrupos(c: CatalogoFallas, filtros: { busqueda: string; equipoId: string; sistemaId?: string; subsistemaId?: string; verInactivos: boolean }): GrupoTabla[] {
  const visible = (x: { activo: boolean }) => filtros.verInactivos || x.activo
  const hayBusqueda = filtros.busqueda.trim() !== ""
  const grupos: GrupoTabla[] = []

  for (const equipo of c.equipos.filter((e) => visible(e) && (!filtros.equipoId || e.id === filtros.equipoId)).sort(porCreacion)) {
    for (const sistema of c.sistemas.filter((s) => s.equipoId === equipo.id && visible(s) && (!filtros.sistemaId || s.id === filtros.sistemaId)).sort(porCreacion)) {
      for (const subsistema of c.subsistemas.filter((u) => u.sistemaId === sistema.id && visible(u) && (!filtros.subsistemaId || u.id === filtros.subsistemaId)).sort(porCreacion)) {
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
