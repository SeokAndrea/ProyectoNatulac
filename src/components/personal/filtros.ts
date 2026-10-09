import type { AreaCodigo, CargoCodigo, RolCodigo } from "@/lib/catalogos"

export interface Filtros {
  busqueda: string
  area: AreaCodigo | "TODAS"
  rol: RolCodigo | "TODOS"
  cargo: CargoCodigo | "TODOS" | "SIN_CARGO"
  estado: "TODOS" | "ACTIVOS" | "INACTIVOS"
}

// Por defecto Aséptico y solo activos: el resto queda a un clic.
export const FILTROS_INICIALES: Filtros = { busqueda: "", area: "ASEPTICO", rol: "TODOS", cargo: "TODOS", estado: "ACTIVOS" }

export function hayFiltrosActivos(f: Filtros): boolean {
  return (
    f.busqueda.trim() !== "" ||
    f.area !== FILTROS_INICIALES.area ||
    f.rol !== FILTROS_INICIALES.rol ||
    f.cargo !== FILTROS_INICIALES.cargo ||
    f.estado !== FILTROS_INICIALES.estado
  )
}
